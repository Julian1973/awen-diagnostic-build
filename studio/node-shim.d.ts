/** Minimal Node typings so the studio compiles without @types/node installed.
 *  The real SaaS repo will have @types/node; this shim keeps the engine
 *  self-contained for standalone checks. */
declare module 'node:child_process' {
  export function spawn(cmd: string, args: string[], opts?: unknown): ChildProcessWithoutNullStreams;
  export function execSync(cmd: string, opts?: unknown): unknown;
  export type ChildProcessWithoutNullStreams = {
    stdin: { write(s: string): void; end(): void };
    stdout: unknown;
    stderr: { on(ev: string, fn: (b: unknown) => void): void };
  };
}
declare module 'node:readline' {
  export function createInterface(opts: { input: unknown }): {
    on(ev: 'line', fn: (line: string) => void): void;
  };
}
declare const console: { error(...a: unknown[]): void; log(...a: unknown[]): void };
declare function setTimeout(fn: () => void, ms: number): unknown;
