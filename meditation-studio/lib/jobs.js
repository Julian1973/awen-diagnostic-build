// Long tasks (writing a script, voicing, mixing) run as jobs the dashboard can watch.
import { newId } from './store.js';

const jobs = new Map();

export function startJob(kind, meta, fn) {
  const job = {
    id: newId(),
    kind,
    ...meta,
    status: 'running',
    progress: { done: 0, total: 0, message: 'Starting' },
    startedAt: new Date().toISOString(),
    result: null,
    error: null,
  };
  jobs.set(job.id, job);
  const update = (p) => Object.assign(job.progress, p);
  Promise.resolve()
    .then(() => fn(update))
    .then((result) => {
      job.status = 'done';
      job.result = result ?? null;
      job.progress.message = 'Done';
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = err?.message || String(err);
      job.progress.message = 'Failed';
      console.error(`[job ${kind}]`, err);
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
    });
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function activeJobFor(meditationId, kind) {
  for (const j of jobs.values()) {
    if (j.meditationId === meditationId && j.status === 'running' && (!kind || j.kind === kind)) return j;
  }
  return null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30);
}

// Runs async tasks with at most `limit` in flight.
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
