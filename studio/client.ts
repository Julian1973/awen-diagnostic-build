/**
 * The TypeScript side of the service boundary.
 *
 * The Next.js API and the queue worker call the engine through this and nothing
 * else. The engine owns the production rules; this layer owns tenancy, auth,
 * persistence and queueing — and neither reaches into the other.
 *
 * Long-lived worker mode keeps one Python process per worker and speaks a line
 * of JSON each way, so a gate check costs no interpreter start-up.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export type GateCode =
  | 'BOARDS_PENDING'
  | 'LOCKED_ASSETS_REQUIRED'
  | 'AUDIT_MISSING'
  | 'AUDIT_INVALIDATED'
  | 'SPEAKER_BOX_REQUIRED'
  | 'REFERENCE_BUDGET_EXCEEDED'
  | 'DURATION_OUT_OF_RANGE'
  | 'WRAPPER_OVERLOADED'
  | 'NO_PROMPT';

export type Gate = {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  code: GateCode;
};

export type Derived = {
  /** False on any route that invents speech — the compiler then strips dialogue. */
  prompt_carries_dialogue: boolean;
  /** True on a composing route: the prompt must assert the opening composition. */
  must_assert_composition: boolean;
  /** True when no lipsync route can pick a face — a multi-face line needs a box. */
  needs_speaker_box_when_multi_face: boolean;
  refs_max: number;
  dur: [number, number];
  discard_generated_audio: boolean;
};

export type CompiledPrompt = {
  text: string;
  /** sha256. The audit is stamped against this; if it moves, the audit dies. */
  hash: string;
  manifest: Array<{
    order: number;
    role: string;
    path: string;
    controls?: string;
    must_not_touch?: string;
  }>;
  reference_count: number;
};

type Reply<T> = { ok: true; op: string; result: T } | { ok: false; error: { code: string; message: string } };

export class StudioEngine {
  private proc?: ChildProcessWithoutNullStreams;
  private queue: Array<(v: unknown) => void> = [];

  constructor(private readonly python = 'python3',
              private readonly script = 'studio/service.py') {}

  /** Start the long-lived worker. One process per queue worker is plenty. */
  start(): void {
    this.proc = spawn(this.python, [this.script, '--serve'], { stdio: 'pipe' });
    createInterface({ input: this.proc.stdout }).on('line', (line: string) => {
      const resolve = this.queue.shift();
      if (resolve) resolve(JSON.parse(line));
    });
    this.proc.stderr.on('data', (b: unknown) => console.error('[engine]', String(b)));
  }

  private call<T>(req: Record<string, unknown>): Promise<Reply<T>> {
    if (!this.proc) this.start();
    return new Promise((resolve) => {
      this.queue.push(resolve as (v: unknown) => void);
      this.proc!.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  private async unwrap<T>(req: Record<string, unknown>): Promise<T> {
    const r = await this.call<T>(req);
    if (!r.ok) throw new EngineError(r.error.code, r.error.message);
    return r.result;
  }

  /** What this stack decides before anyone configures anything. */
  capabilities(house?: Record<string, string>) {
    return this.unwrap<{ stack: unknown; derived: Derived }>({ op: 'capabilities', house });
  }

  /**
   * The full gate report. Map `blocking[0].code` straight onto the HTTP error —
   * the engine has already phrased the reason for a human.
   */
  gates(input: {
    shot: unknown; assets: unknown[]; boards: unknown[];
    prompt?: unknown; audits?: unknown[]; settings?: unknown; house?: unknown;
  }) {
    return this.unwrap<{ gates: Gate[]; blocking: Gate[]; clear: boolean }>({
      op: 'gates', ...input,
    });
  }

  compile(input: { shot: unknown; assets: unknown[]; project?: unknown; house?: unknown }) {
    return this.unwrap<CompiledPrompt>({ op: 'compile', ...input });
  }

  /** What a revision makes provisional. Nothing is deleted. */
  impact(input: {
    asset_tag: string; shots: unknown[]; prompts: unknown[];
    jobs?: unknown[]; selects?: unknown[];
  }) {
    return this.unwrap<{
      shots: string[];
      prompt_versions: Array<{ shot: string; version: number }>;
      audits_invalidated: string[];
      selects_needing_review: string[];
      rule: string;
    }>({ op: 'impact', ...input });
  }

  stressMatrix(input: { asset: unknown; co_stars?: string[]; scene_light?: string }) {
    return this.unwrap<Record<string, unknown>>({ op: 'stress_matrix', ...input });
  }

  stressVerdict(input: { runs: number; passed: number; required?: number }) {
    return this.unwrap<{ verdict: 'pass' | 'fail'; detail: string }>({
      op: 'stress_verdict', ...input,
    });
  }

  /** Past the simplify point this stops offering better words. */
  iteration(input: { round: number; score: number; settings?: unknown }) {
    return this.unwrap<{ action: 'proceed' | 'correct' | 'simplify' | 'blocked'; message: string }>({
      op: 'iteration', ...input,
    });
  }

  stop(): void { this.proc?.stdin.end(); this.proc = undefined; }
}

export class EngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

/**
 * The one call the generation endpoint must make, and must not be able to skip.
 *
 * Run it before compiling AND again immediately before submitting, because an
 * asset can be deprecated in between — that gap is exactly how an approved take
 * survived a set change once, and it was the only shot nobody rebuilt precisely
 * because it was the one everybody trusted.
 */
export async function assertClearToFire(
  engine: StudioEngine,
  input: Parameters<StudioEngine['gates']>[0],
): Promise<void> {
  const { blocking } = await engine.gates(input);
  if (blocking.length) {
    throw new EngineError(blocking[0].code,
      blocking.map((g) => `${g.name}: ${g.detail}`).join('; '));
  }
}
