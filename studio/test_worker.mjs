/**
 * test_worker.mjs — the job lifecycle against a fake provider and an in-memory
 * store. No network, no BytePlus, no Supabase; what is being proved is the
 * state machine: idempotency, crash recovery without resubmission, transport
 * retry, and owned-storage ingestion.
 *
 *     node studio/test_worker.mjs
 */
import { strict as assert } from 'node:assert';

// Compile worker.ts + client.ts on the fly.
import { execSync } from 'node:child_process';
execSync('tsc studio/worker.ts studio/client.ts studio/node-shim.d.ts --module nodenext --target es2022 ' +
         '--moduleResolution nodenext --outDir /tmp/studio-build --skipLibCheck', { stdio: 'inherit' });
const { GenerationWorker, enqueueGeneration } = await import('/tmp/studio-build/worker.js');
const { StudioEngine } = await import('/tmp/studio-build/client.js');

let PASS = 0, FAIL = 0;
const check = (name, cond) => {
  cond ? PASS++ : FAIL++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
};

// ── fakes ────────────────────────────────────────────────────────────────────

const makeStore = () => {
  const jobs = new Map(); const ledger = []; let seq = 0;
  return {
    jobs, ledger,
    async insertQueued(row) {
      // unique idempotency key, like the DB constraint
      for (const j of jobs.values())
        if (j.idempotencyKey === row.idempotencyKey)
          throw new Error(`UNIQUE violation: ${row.idempotencyKey}`);
      const job = { ...row, id: `job-${++seq}`, status: 'queued' };
      jobs.set(job.id, job); return job;
    },
    async claimNext() {
      for (const j of jobs.values())
        if (j.status === 'queued') { j.status = 'claimed'; return { ...j }; }
      return null;
    },
    async update(id, patch) { Object.assign(jobs.get(id), patch); },
    async findInFlight() {
      return [...jobs.values()]
        .filter((j) => ['claimed', 'submitted', 'provider_running'].includes(j.status))
        .map((j) => ({ ...j }));
    },
    async appendLedger(jobId, event, detail) { ledger.push({ jobId, event, detail }); },
  };
};

const makeProvider = (script = {}) => {
  const submitted = [];
  let polls = 0;
  return {
    name: 'fake', submitted,
    async createTask({ idempotencyKey, payload }) {
      if (script.failSubmitTimes && submitted.length < script.failSubmitTimes) {
        submitted.push('TRANSPORT-FAIL');
        throw new Error('timeout');
      }
      submitted.push(idempotencyKey);
      return { providerTaskId: `task-${submitted.length}` };
    },
    async getTask(id) {
      polls++;
      if (script.neverFinish) return { status: 'running' };
      if (script.failTask) return { status: 'failed', failureMessage: 'semantic failure' };
      return polls >= (script.pollsUntilDone ?? 2)
        ? { status: 'succeeded', outputUrl: `https://tmp.provider/${id}.mp4` }
        : { status: 'running' };
    },
  };
};

const storage = {
  ingested: [],
  async ingest(url, destKey) {
    this.ingested.push({ url, destKey });
    return { storagePath: `owned://${destKey}`, checksum: 'abc123' };
  },
  async probe() { return { durationSeconds: 9.4, width: 1344, height: 768, hasAudio: true }; },
  async makeProxy(p) { return p + '.proxy.mp4'; },
};

// engine stub: the gate answer is scripted per test
const engineWith = (blocking) => ({
  async gates() { return { gates: [], blocking, clear: blocking.length === 0 }; },
});

const SNAP = {
  shot: {}, assets: [], boards: [],
  prompt: { hash: 'HASH1', versionId: 'pv-1', payload: { p: 1 } },
  audits: [], settings: {}, capabilities: { refs_max: 8 },
};

// ── 1 · the gate refuses the enqueue itself ─────────────────────────────────
console.log('\nthe gate bites at enqueue');
{
  const store = makeStore();
  let threw = null;
  try {
    await enqueueGeneration({
      engine: engineWith([{ id: 'B', name: 'rows locked', passed: false,
        code: 'LOCKED_ASSETS_REQUIRED', detail: 'not locked: tom(draft)' }]),
      store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
      provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued,
    });
  } catch (e) { threw = e; }
  check('a draft asset stops the job before a row exists', threw?.code === 'LOCKED_ASSETS_REQUIRED');
  check('nothing was queued', store.jobs.size === 0);
}

// ── 2 · idempotency ─────────────────────────────────────────────────────────
console.log('\nidempotency');
{
  const store = makeStore();
  const args = {
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  };
  await enqueueGeneration(args);
  let dup = null;
  try { await enqueueGeneration(args); } catch (e) { dup = e; }
  check('two identical Generate clicks create ONE job', store.jobs.size === 1 && dup !== null);

  await enqueueGeneration({ ...args, attempt: 2 });
  check('a conscious new attempt mints a new key', store.jobs.size === 2);
  await enqueueGeneration({ ...args, snapshots: { ...SNAP,
    prompt: { ...SNAP.prompt, hash: 'HASH2' } } });
  check('a new prompt version mints a new key', store.jobs.size === 3);
}

// ── 3 · the happy path ──────────────────────────────────────────────────────
console.log('\nsubmit → poll → ingest → review_pending');
{
  const store = makeStore(); const provider = makeProvider();
  storage.ingested.length = 0;
  await enqueueGeneration({
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  });
  const w = new GenerationWorker(store, provider, storage);
  await w.runOnce();
  const job = [...store.jobs.values()][0];
  check('the job ends review_pending — the worker never approves its own output',
    job.status === 'review_pending');
  check('the provider task id was persisted', job.providerTaskId === 'task-1');
  check('the output was copied to owned storage',
    storage.ingested[0]?.destKey === 'shots/FR01/attempt-1.mp4');
  const events = store.ledger.map((l) => l.event);
  check('every transition is in the ledger',
    ['queued', 'submitted', 'provider_succeeded', 'ingested', 'review_pending']
      .every((e) => events.includes(e)));
}

// ── 4 · transport retry, semantic no-retry ──────────────────────────────────
console.log('\nretry policy');
{
  const store = makeStore(); const provider = makeProvider({ failSubmitTimes: 2 });
  await enqueueGeneration({
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  });
  await new GenerationWorker(store, provider, storage).runOnce();
  const job = [...store.jobs.values()][0];
  check('transport failures are retried and the job still lands',
    job.status === 'review_pending');
  check('the retries are logged',
    store.ledger.filter((l) => l.event === 'submit_retry').length === 2);
  check('exactly ONE real submission reached the provider',
    provider.submitted.filter((s) => s !== 'TRANSPORT-FAIL').length === 1);
}
{
  const store = makeStore(); const provider = makeProvider({ failTask: true });
  await enqueueGeneration({
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  });
  await new GenerationWorker(store, provider, storage).runOnce();
  const job = [...store.jobs.values()][0];
  check('a semantic provider failure is NOT retried', provider.submitted.length === 1);
  check('it fails with the provider code', job.failureCode === 'PROVIDER_FAILED');
}

// ── 5 · crash recovery ──────────────────────────────────────────────────────
console.log('\ncrash recovery: reconcile, never resubmit');
{
  const store = makeStore(); const provider = makeProvider();
  await enqueueGeneration({
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  });
  // simulate: worker died AFTER submit — the task id is on the row
  const job = [...store.jobs.values()][0];
  job.status = 'provider_running';
  job.providerTaskId = 'task-1';
  provider.submitted.push('pre-crash');   // the original submission
  await new GenerationWorker(store, provider, storage).recover();
  check('recovery resumed polling the EXISTING task',
    [...store.jobs.values()][0].status === 'review_pending');
  check('and did not submit a second one',
    provider.submitted.filter((s) => s !== 'pre-crash').length === 0);
  check('the recovery is in the ledger',
    store.ledger.some((l) => l.event === 'recovered'));
}
{
  const store = makeStore(); const provider = makeProvider();
  await enqueueGeneration({
    engine: engineWith([]), store, snapshots: SNAP, shotId: 'FR01', attempt: 1,
    provider: 'byteplus', model: 'seedance', insertQueued: store.insertQueued.bind(store),
  });
  // simulate: worker died BETWEEN claim and submit — no task id, nothing charged
  const job = [...store.jobs.values()][0];
  job.status = 'claimed';
  await new GenerationWorker(store, provider, storage).recover();
  check('a job that died before submit goes back to the queue',
    [...store.jobs.values()][0].status === 'queued');
  check('with zero provider submissions', provider.submitted.length === 0);
}

console.log(`\n  ${PASS} passed · ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
