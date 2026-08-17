/**
 * worker.ts — the generation job lifecycle. The whole lifecycle, not a
 * button-to-API call.
 *
 *   1  API receives "Generate shot"
 *   2  loads immutable shot / bible / asset / provider snapshots
 *   3  assertClearToFire()                      ← the engine, through client.ts
 *   4  job row committed as QUEUED, with an idempotency key
 *   5  worker claims the job
 *   6  submits the provider task
 *   7  persists provider_task_id IMMEDIATELY    ← before anything else happens
 *   8  polls with exponential backoff
 *   9  copies the output into owned storage     ← provider URLs are temporary
 *  10  probes metadata, makes a proxy
 *  11  marks REVIEW_PENDING
 *  12  appends every transition to the ledger
 *
 * The interfaces at the top are the whole point: the worker is testable with a
 * fake provider and an in-memory db, and BytePlus is one adapter among several.
 * Exact payload keys come from the live account documentation at integration
 * time — never from marketing copy.
 */
import { StudioEngine, assertClearToFire, EngineError } from './client';

// ── the ports ────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued' | 'submitted' | 'provider_running'
  | 'succeeded' | 'downloaded' | 'review_pending'
  | 'failed' | 'cancelled';

export type JobRow = {
  id: string;
  shotId: string;
  promptVersionId: string;
  promptHash: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  providerTaskId?: string;
  status: JobStatus;
  attempt: number;
  requestPayload: unknown;
  /** The capability snapshot travels WITH the job, so a selected take stays
   * reconstructible after the registry moves on. */
  capabilitySnapshot: unknown;
  failureCode?: string;
  failureMessage?: string;
};

export interface JobStore {
  /** Atomically claim one queued job. Two workers must never get the same row. */
  claimNext(): Promise<JobRow | null>;
  update(id: string, patch: Partial<JobRow>): Promise<void>;
  /** Jobs that were mid-flight when a worker died. */
  findInFlight(): Promise<JobRow[]>;
  appendLedger(jobId: string, event: string, detail: unknown): Promise<void>;
}

export interface ProviderAdapter {
  readonly name: string;
  /** MUST be idempotent on the provider side, or the caller must guarantee a
   * task is submitted at most once per idempotency key. */
  createTask(req: { idempotencyKey: string; payload: unknown }): Promise<{ providerTaskId: string }>;
  getTask(providerTaskId: string): Promise<{
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    outputUrl?: string;
    failureCode?: string;
    failureMessage?: string;
  }>;
}

export interface OwnedStorage {
  /** Copy a temporary provider URL into storage WE control. Returns our path. */
  ingest(url: string, destKey: string): Promise<{ storagePath: string; checksum: string }>;
  probe(storagePath: string): Promise<{ durationSeconds: number; width: number; height: number; hasAudio: boolean }>;
  makeProxy(storagePath: string): Promise<string>;
}

// ── retry policy ─────────────────────────────────────────────────────────────
//
// Retry TRANSPORT failures (timeout, 429, 5xx) with backoff.
// NEVER auto-retry a submitted provider task unless provider-side idempotency
// is confirmed — a second submission is a second charge.
// NEVER auto-retry a semantic failure or a poor result: that is a human
// decision, and past the simplify threshold it is a re-design, not a retry.

const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000];
const POLL_MS = [5_000, 5_000, 10_000, 10_000, 20_000];
const POLL_TIMEOUT_MS = 15 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTransportRetry<T>(
  fn: () => Promise<T>,
  onRetry: (attempt: number, err: unknown) => Promise<void>,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= BACKOFF_MS.length; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      if (!isTransport(err) || i === BACKOFF_MS.length) throw err;
      await onRetry(i + 1, err);
      await sleep(BACKOFF_MS[i]);
    }
  }
  throw last;
}

const isTransport = (err: unknown): boolean => {
  const m = String((err as Error)?.message ?? err);
  return /timeout|ETIMEDOUT|ECONNRESET|429|50[234]/i.test(m);
};

// ── the worker ───────────────────────────────────────────────────────────────

export class GenerationWorker {
  constructor(
    private readonly store: JobStore,
    private readonly provider: ProviderAdapter,
    private readonly storage: OwnedStorage,
  ) {}

  /**
   * Recovery first, always. A worker restart must resume polling existing
   * provider tasks — never submit a second one. A job that died between claim
   * and submit (no providerTaskId) goes back to the queue: nothing was charged.
   */
  async recover(): Promise<void> {
    for (const job of await this.store.findInFlight()) {
      if (job.providerTaskId) {
        await this.store.appendLedger(job.id, 'recovered', { taskId: job.providerTaskId });
        await this.poll(job);
      } else {
        await this.store.update(job.id, { status: 'queued' });
        await this.store.appendLedger(job.id, 'requeued_after_crash', {});
      }
    }
  }

  async runOnce(): Promise<boolean> {
    const job = await this.store.claimNext();
    if (!job) return false;
    try {
      await this.submit(job);
      await this.poll(job);
    } catch (err) {
      await this.fail(job, err);
    }
    return true;
  }

  private async submit(job: JobRow): Promise<void> {
    const { providerTaskId } = await withTransportRetry(
      () => this.provider.createTask({
        idempotencyKey: job.idempotencyKey,
        payload: job.requestPayload,
      }),
      (attempt, err) => this.store.appendLedger(job.id, 'submit_retry',
        { attempt, error: String(err) }),
    );
    // Step 7 — persist the task id before ANYTHING else. This line is what
    // makes a crash recoverable instead of double-charged.
    await this.store.update(job.id, { providerTaskId, status: 'submitted' });
    await this.store.appendLedger(job.id, 'submitted', { providerTaskId });
    job.providerTaskId = providerTaskId;
  }

  private async poll(job: JobRow): Promise<void> {
    const started = Date.now();
    let i = 0;
    for (;;) {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        throw new Error(`poll timeout on task ${job.providerTaskId} — job left ` +
          `provider_running for reconcile, NOT resubmitted`);
      }
      const task = await withTransportRetry(
        () => this.provider.getTask(job.providerTaskId!),
        (attempt, err) => this.store.appendLedger(job.id, 'poll_retry',
          { attempt, error: String(err) }),
      );
      if (task.status === 'succeeded' && task.outputUrl) {
        await this.store.update(job.id, { status: 'succeeded' });
        await this.store.appendLedger(job.id, 'provider_succeeded', {});
        return this.ingest(job, task.outputUrl);
      }
      if (task.status === 'failed' || task.status === 'cancelled') {
        throw new EngineError('PROVIDER_' + task.status.toUpperCase(),
          task.failureMessage ?? task.status);
      }
      if (task.status === 'running') {
        await this.store.update(job.id, { status: 'provider_running' });
      }
      await sleep(POLL_MS[Math.min(i++, POLL_MS.length - 1)]);
    }
  }

  private async ingest(job: JobRow, outputUrl: string): Promise<void> {
    // Provider URLs are temporary. A take we cannot re-download is a take we
    // never owned — everything downstream points only at OUR storage.
    const dest = `shots/${job.shotId}/attempt-${job.attempt}.mp4`;
    const { storagePath, checksum } = await this.storage.ingest(outputUrl, dest);
    const meta = await this.storage.probe(storagePath);
    const proxy = await this.storage.makeProxy(storagePath);
    await this.store.update(job.id, { status: 'downloaded' });
    await this.store.appendLedger(job.id, 'ingested',
      { storagePath, checksum, proxy, ...meta });
    await this.store.update(job.id, { status: 'review_pending' });
    await this.store.appendLedger(job.id, 'review_pending', {});
    // Human review is the final acceptance gate. The worker's job ends here —
    // it never approves its own output.
  }

  private async fail(job: JobRow, err: unknown): Promise<void> {
    const code = err instanceof EngineError ? err.code : 'WORKER_ERROR';
    await this.store.update(job.id, {
      status: 'failed', failureCode: code, failureMessage: String((err as Error)?.message ?? err),
    });
    await this.store.appendLedger(job.id, 'failed', { code, error: String(err) });
  }
}

// ── the API-side enqueue, where the gates actually bite ──────────────────────

/**
 * Everything that must happen between the click and the queue. The gate check
 * runs HERE — and the worker never re-decides it, because by claim time the
 * snapshots are frozen and the job's clearance is part of its provenance.
 */
export async function enqueueGeneration(input: {
  engine: StudioEngine;
  store: JobStore;
  snapshots: {
    shot: unknown; assets: unknown[]; boards: unknown[];
    prompt: { hash: string; versionId: string; payload: unknown };
    audits: unknown[]; settings: unknown; capabilities: unknown;
  };
  shotId: string;
  attempt: number;
  provider: string;
  model: string;
  insertQueued: (row: Omit<JobRow, 'id' | 'status'>) => Promise<JobRow>;
}): Promise<JobRow> {
  const s = input.snapshots;

  // Step 3. Refusals surface as typed EngineErrors the API maps onto HTTP 409.
  await assertClearToFire(input.engine, {
    shot: s.shot, assets: s.assets, boards: s.boards,
    prompt: s.prompt, audits: s.audits, settings: s.settings,
  });

  // Step 4. The idempotency key is shot + prompt hash + attempt: a retry reuses
  // it; only a NEW attempt or a NEW prompt version mints a new one.
  const idempotencyKey = `${input.shotId}:${s.prompt.hash}:${input.attempt}`;
  const row = await input.insertQueued({
    shotId: input.shotId,
    promptVersionId: s.prompt.versionId,
    promptHash: s.prompt.hash,
    idempotencyKey,
    provider: input.provider,
    model: input.model,
    attempt: input.attempt,
    requestPayload: s.prompt.payload,
    capabilitySnapshot: s.capabilities,
  });
  await input.store.appendLedger(row.id, 'queued', { idempotencyKey });
  return row;
}
