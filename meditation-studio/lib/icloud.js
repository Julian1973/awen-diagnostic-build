// iCloud Drive helpers. When the library lives in iCloud Drive, macOS can swap a file it has not
// used lately for a small ".name.icloud" placeholder. These helpers treat a placeholder as present
// and ask macOS to bring the real file back before it is read, so nothing is voiced (and paid for) twice.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export function placeholderFor(file) {
  return path.join(path.dirname(file), `.${path.basename(file)}.icloud`);
}

// True if the file is here or waiting in iCloud.
export function existsAnywhere(file) {
  return fs.existsSync(file) || fs.existsSync(placeholderFor(file));
}

function askDownload(file, sync) {
  if (process.platform !== 'darwin') return;
  try {
    if (sync) spawnSync('brctl', ['download', file], { timeout: 5000 });
    else spawn('brctl', ['download', file], { stdio: 'ignore' }).on('error', () => {});
  } catch {
    // brctl missing: macOS will still fetch the file when it is opened
  }
}

// Makes sure the real file is on disk. Returns false if it does not exist at all.
export async function ensureLocal(file, timeoutMs = 120000) {
  if (fs.existsSync(file)) return true;
  if (!fs.existsSync(placeholderFor(file))) return false;
  askDownload(file, false);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (fs.existsSync(file)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Waiting for iCloud Drive to download ${path.basename(file)}. Check the Mac is online, then try again.`);
}

export function ensureLocalSync(file, timeoutMs = 60000) {
  if (fs.existsSync(file)) return true;
  if (!fs.existsSync(placeholderFor(file))) return false;
  askDownload(file, true);
  const end = Date.now() + timeoutMs;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < end) {
    if (fs.existsSync(file)) return true;
    Atomics.wait(pause, 0, 0, 250);
  }
  throw new Error(`Waiting for iCloud Drive to download ${path.basename(file)}.`);
}

// Lists a folder the way a person sees it: placeholders shown under their real names.
export function listNames(dir) {
  if (!fs.existsSync(dir)) return [];
  const names = new Set();
  for (const n of fs.readdirSync(dir)) {
    const m = n.match(/^\.(.+)\.icloud$/);
    if (m) names.add(m[1]);
    else if (!n.startsWith('.')) names.add(n);
  }
  return [...names];
}
