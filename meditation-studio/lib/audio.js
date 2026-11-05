// ffmpeg building blocks: decode, silence, bell, join, music bed, loudness and MP3 master.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RATE = 44100;
let resolvedFfmpeg = null;

export async function ffmpegPath() {
  if (resolvedFfmpeg) return resolvedFfmpeg;
  if (process.env.FFMPEG_PATH) return (resolvedFfmpeg = process.env.FFMPEG_PATH);
  try {
    const mod = await import('ffmpeg-static');
    if (mod.default && fs.existsSync(mod.default)) return (resolvedFfmpeg = mod.default);
  } catch {
    // optional dependency not installed; fall back to ffmpeg on the PATH
  }
  return (resolvedFfmpeg = 'ffmpeg');
}

export async function run(args, { cwd } = {}) {
  const bin = await ffmpegPath();
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', '-y', ...args], { cwd });
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
    });
    p.on('error', (err) => reject(new Error(`Could not start ffmpeg (${bin}): ${err.message}. Install ffmpeg or set FFMPEG_PATH.`)));
    p.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg failed: ${stderr.split('\n').slice(-6).join(' ').trim()}`));
    });
  });
}

export async function checkFfmpeg() {
  try {
    const bin = await ffmpegPath();
    const out = await new Promise((resolve, reject) => {
      const p = spawn(bin, ['-version']);
      let s = '';
      p.stdout.on('data', (d) => (s += d));
      p.on('error', reject);
      p.on('close', () => resolve(s));
    });
    return { ok: true, version: out.split('\n')[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Seconds of a 16 bit mono 44.1 kHz WAV, read from its header.
export function wavSeconds(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(4096);
    fs.readSync(fd, head, 0, 4096, 0);
    const channels = head.readUInt16LE(22);
    const rate = head.readUInt32LE(24);
    const bits = head.readUInt16LE(34);
    let off = 12;
    while (off < head.length - 8) {
      const id = head.toString('ascii', off, off + 4);
      const size = head.readUInt32LE(off + 4);
      if (id === 'data') {
        const dataSize = Math.min(size, fs.fstatSync(fd).size - off - 8);
        return dataSize / (rate * channels * (bits / 8));
      }
      off += 8 + size;
    }
    return 0;
  } finally {
    fs.closeSync(fd);
  }
}

export async function probeSeconds(file) {
  const out = await run(['-i', file, '-f', 'null', '-']).catch((e) => e.message);
  const times = [...String(out).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!times.length) return 0;
  const [, h, m, s] = times[times.length - 1];
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

const MONO = ['-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le'];

export async function toWav(input, output, { cleanRecording = false } = {}) {
  const args = ['-i', input];
  if (cleanRecording) {
    // Julian's own reads: low rumble out, and the dead air before and after each take trimmed.
    const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15';
    args.push('-af', `highpass=f=70,${trim},areverse,${trim.replace('0.15', '0.3')},areverse`);
  }
  await run([...args, ...MONO, output]);
  return output;
}

// The quiet stretches in a WAV, as [{ start, end }] in seconds. Quiet runs split by less than
// `bridge` seconds of sound (a click, a breath) count as one.
export async function detectSilences(file, { noiseDb = -38, minSeconds = 0.5, bridge = 0.3 } = {}) {
  const stderr = await run(['-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minSeconds}`, '-f', 'null', '-']);
  const found = [];
  let start = null;
  for (const line of String(stderr).split('\n')) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start != null) {
      found.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  if (start != null) found.push({ start, end: wavSeconds(file) });
  const merged = [];
  for (const g of found) {
    const last = merged[merged.length - 1];
    if (last && g.start - last.end < bridge) last.end = g.end;
    else merged.push({ ...g });
  }
  return merged;
}

// One stretch of a WAV, from `start` to `end` seconds (end null means to the end).
export async function cutWav(input, start, end, output) {
  const range = end == null ? `start=${start.toFixed(3)}` : `start=${start.toFixed(3)}:end=${end.toFixed(3)}`;
  await run(['-i', input, '-af', `atrim=${range},asetpts=PTS-STARTPTS`, ...MONO, output]);
  return output;
}

export async function silenceWav(seconds, output) {
  await run(['-f', 'lavfi', '-i', `anullsrc=r=${RATE}:cl=mono`, '-t', String(Math.max(0.05, seconds)), ...MONO, output]);
  return output;
}

// A soft struck bell, made from a few decaying partials. Replace with Julian's own bell any time.
export async function bellWav(output) {
  const expr = [
    '0.32*sin(2*PI*392*t)*exp(-0.55*t)',
    '0.16*sin(2*PI*784.6*t)*exp(-0.9*t)',
    '0.08*sin(2*PI*1180*t)*exp(-1.6*t)',
    '0.05*sin(2*PI*1571*t)*exp(-2.4*t)',
  ].join('+');
  await run(['-f', 'lavfi', '-i', `aevalsrc=${expr}:s=${RATE}:d=9`, '-af', 'afade=t=in:d=0.01,afade=t=out:st=7.5:d=1.5', ...MONO, output]);
  return output;
}

export async function concatWavs(files, output, workDir) {
  const list = path.join(workDir, `list-${path.basename(output)}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n'));
  await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output]);
  return output;
}

function parseLoudnorm(stderr) {
  const m = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/s);
  return m ? JSON.parse(m[0]) : null;
}

// Makes a bed at least `seconds` long by joining it to itself with long, soft crossfades,
// so a three minute bed can sit under an hour of sleep track without an audible seam.
export async function loopBed(bedPath, seconds, workDir, crossfade = 8) {
  const first = path.join(workDir, 'bed-0.wav');
  await run(['-i', bedPath, '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', first]);
  let current = first;
  let length = wavSeconds(first);
  if (length < crossfade * 2 + 1) return { file: current, seconds: length, simpleLoop: true };
  for (let i = 1; length < seconds + 1 && i < 12; i += 1) {
    const next = path.join(workDir, `bed-${i}.wav`);
    await run(['-i', current, '-i', current, '-filter_complex', `acrossfade=d=${crossfade}:c1=qsin:c2=qsin`, '-c:a', 'pcm_s16le', next]);
    current = next;
    length = wavSeconds(next);
  }
  return { file: current, seconds: length, simpleLoop: length < seconds };
}

// Mixes the voice over an optional bed, normalises loudness in two passes and writes the MP3.
export async function master({ voiceWav, bedPath, bedVolumeDb = -22, loudness = -16, truePeak = -1.5, bitrate = '192k', meta = {}, outMp3, workDir }) {
  const seconds = wavSeconds(voiceWav);
  let source = voiceWav;
  if (bedPath) {
    const bed = await loopBed(bedPath, seconds, workDir);
    const mix = path.join(workDir, 'mix.wav');
    const fadeOut = Math.max(0, seconds - 12);
    const graph = [
      `[1:a]aformat=sample_rates=${RATE}:channel_layouts=stereo,volume=${bedVolumeDb}dB,afade=t=in:d=6,afade=t=out:st=${fadeOut.toFixed(2)}:d=12[bed]`,
      `[0:a]aformat=sample_rates=${RATE}:channel_layouts=stereo[voice]`,
      '[voice][bed]amix=inputs=2:duration=first:normalize=0[out]',
    ].join(';');
    const bedInput = bed.simpleLoop ? ['-stream_loop', '-1', '-i', bed.file] : ['-i', bed.file];
    await run(['-i', voiceWav, ...bedInput, '-filter_complex', graph, '-map', '[out]', '-t', seconds.toFixed(3), '-c:a', 'pcm_s16le', mix]);
    source = mix;
  }
  const target = `I=${loudness}:TP=${truePeak}:LRA=11`;
  const pass1 = parseLoudnorm(await run(['-i', source, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']));
  const measured = pass1 && Number.isFinite(Number(pass1.input_i)) && Number(pass1.input_i) > -70
    ? `:measured_I=${pass1.input_i}:measured_TP=${pass1.input_tp}:measured_LRA=${pass1.input_lra}:measured_thresh=${pass1.input_thresh}:offset=${pass1.target_offset}:linear=true`
    : '';
  const metaArgs = Object.entries(meta).filter(([, v]) => v).flatMap(([k, v]) => ['-metadata', `${k}=${String(v).slice(0, 400)}`]);
  const pass2 = parseLoudnorm(await run([
    '-i', source,
    '-af', `loudnorm=${target}${measured}:print_format=json`,
    '-ar', String(RATE), '-ac', '2',
    '-c:a', 'libmp3lame', '-b:a', bitrate,
    '-id3v2_version', '3', ...metaArgs,
    outMp3,
  ]));
  return {
    seconds,
    integratedLufs: pass2 ? Number(pass2.output_i) : null,
    truePeak: pass2 ? Number(pass2.output_tp) : null,
  };
}
