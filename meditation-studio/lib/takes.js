// Takes already voiced in ElevenLabs for the ready made library.
//
// Each ## section of a library script was sent to ElevenLabs as one request, in the "Julian" voice on
// eleven_v4, two takes each. data/elevenlabs-takes.json lists every take by its ElevenLabs history id.
// Inside a take, each [[silence]] of the script was spoken as a [long pause] tag (two tags for 20 s or
// more), so the mix finds those pauses in the audio and stretches each one to the script's exact length.
// Silences at the very end of a section were left out of the request and are added after the take.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, paths } from './config.js';
import { parseDuration, spokenWords } from './script-parser.js';
import { historyAudio } from './elevenlabs.js';
import { ensureLocal } from './icloud.js';
import * as audio from './audio.js';
import { makeTrack, finishTrack, firstWords } from './render.js';

const MANIFEST = path.join(DATA_DIR, 'elevenlabs-takes.json');
const SILENCE_RE = /^\[\[\s*silence\s+([0-9hms.\s]+)\]\]$/i;
const NOTE_RE = /^##\s?/;

let cached = null;
export function loadTakes() {
  try {
    const mtime = fs.statSync(MANIFEST).mtimeMs;
    if (!cached || cached.mtime !== mtime) cached = { mtime, data: JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) };
    return cached.data;
  } catch {
    return { meditations: {} };
  }
}

export function takesFor(m) {
  return (m?.libraryId && loadTakes().meditations?.[m.libraryId]) || null;
}

const spokenChars = (text) => spokenWords(text).join(' ').length;
const pauseTag = (seconds) => (seconds >= 20 ? '[long pause] [long pause]' : '[long pause]');

// Splits a script into its ## sections exactly as they were sent to ElevenLabs.
// Each section: { name, text, before, after, pieces: [text], pauses: [seconds] }
// where pieces[i] is followed by pauses[i] inside the take.
export function sectionsOf(script) {
  const raw = [];
  let cur = null;
  let buf = [];
  const flush = () => {
    if (buf.length) cur.items.push({ say: buf.join(' ') });
    buf = [];
  };
  for (const line of String(script || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim())) {
    if (NOTE_RE.test(line)) {
      if (cur) flush();
      cur = { name: line.replace(NOTE_RE, '').trim(), items: [] };
      raw.push(cur);
      continue;
    }
    if (!cur) {
      cur = { name: 'Opening', items: [] };
      raw.push(cur);
    }
    if (!line) {
      flush();
      continue;
    }
    const sil = line.match(SILENCE_RE);
    if (sil) {
      flush();
      cur.items.push({ pause: parseDuration(sil[1]) || 0 });
      continue;
    }
    buf.push(line);
  }
  if (cur) flush();

  const sections = [];
  let carry = 0; // silence from a section with nothing to say, added before the next one
  for (const s of raw) {
    const items = [...s.items];
    let before = carry;
    carry = 0;
    while (items.length && items[0].pause != null) before += items.shift().pause;
    let after = 0;
    while (items.length && items[items.length - 1].pause != null) after += items.pop().pause;
    let text = items.map((it) => (it.pause != null ? pauseTag(it.pause) : it.say)).join('\n\n').trim();
    if (!spokenWords(text).length) {
      if (sections.length) sections[sections.length - 1].after += before + after;
      else carry = before + after;
      continue;
    }
    if (!text.startsWith('[')) text = `[softly] ${text}`;
    const pieces = [];
    const pauses = [];
    let piece = [];
    for (const it of items) {
      if (it.pause == null) {
        piece.push(it.say);
      } else if (piece.length) {
        pieces.push(piece.join('\n\n'));
        pauses.push(it.pause);
        piece = [];
      } else {
        pauses[pauses.length - 1] += it.pause; // two silences in a row are one pause in the take
      }
    }
    pieces.push(piece.join('\n\n'));
    sections.push({ name: s.name, text, before, after, pieces, pauses });
  }
  if (carry && sections.length) sections[sections.length - 1].after += carry;
  return sections;
}

// Whether the takes still match the script. Editing a section after the takes were made means that
// section has to be voiced again (Voice and mix does that).
export function takesStatus(m) {
  const entry = takesFor(m);
  if (!entry) return null;
  const sections = sectionsOf(m.script);
  const changed = [];
  entry.sections.forEach((s, i) => {
    if (sections[i]?.text !== s.text) changed.push(s.name);
  });
  if (sections.length > entry.sections.length) changed.push(...sections.slice(entry.sections.length).map((s) => s.name));
  const picks = entry.sections.map((s, i) => Math.min(Number(m.takePicks?.[i]) || 0, s.takes.length - 1));
  return {
    voiceName: loadTakes().voice?.name || 'Julian',
    model: loadTakes().voice?.model || 'eleven_v4',
    madeOn: loadTakes().madeOn || null,
    flowUrl: entry.flowUrl,
    sections: entry.sections.map((s, i) => ({ name: s.name, takes: s.takes.map((t) => ({ seconds: t.seconds })), pick: picks[i] })),
    matches: changed.length === 0,
    changed,
  };
}

// Chooses which quiet stretches of a take are the script's pauses. Pause i is expected about
// expected[i] seconds in; long quiet stretches near that point win, and order is kept.
// Returns, for each pause, the index of its gap or null when no gap is left for it.
export function placePauses(expected, gaps) {
  const N = expected.length;
  const M = gaps.length;
  if (!N) return [];
  const MISS = -1e6;
  const score = (i, j) => (gaps[j].end - gaps[j].start) - 0.08 * Math.abs((gaps[j].start + gaps[j].end) / 2 - expected[i]);
  const dp = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));
  const how = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(''));
  for (let i = 1; i <= N; i += 1) {
    dp[i][0] = dp[i - 1][0] + MISS;
    how[i][0] = 'miss';
    for (let j = 1; j <= M; j += 1) {
      const skip = dp[i][j - 1];
      const use = dp[i - 1][j - 1] + score(i - 1, j - 1);
      const miss = dp[i - 1][j] + MISS;
      if (use >= skip && use >= miss) { dp[i][j] = use; how[i][j] = 'use'; } else if (skip >= miss) { dp[i][j] = skip; how[i][j] = 'skip'; } else { dp[i][j] = miss; how[i][j] = 'miss'; }
    }
  }
  const out = new Array(N).fill(null);
  let i = N;
  let j = M;
  while (i > 0) {
    if (how[i][j] === 'use') { out[i - 1] = j - 1; i -= 1; j -= 1; } else if (how[i][j] === 'skip') j -= 1; else { i -= 1; }
  }
  return out;
}

// Where each pause should fall in a take of `total` seconds: speech time shared out by the words
// before it, plus the pauses already passed.
export function expectedPauseTimes(section, total, gaps) {
  const n = section.pauses.length;
  if (!n) return [];
  const longest = [...gaps].map((g) => g.end - g.start).sort((a, b) => b - a).slice(0, n);
  const pauseLen = longest.length ? longest.reduce((a, b) => a + b, 0) / longest.length : 2;
  const speech = Math.max(1, total - pauseLen * n);
  const chars = section.pieces.map(spokenChars);
  const all = chars.reduce((a, b) => a + b, 0) || 1;
  let before = 0;
  return section.pauses.map((_, i) => {
    before += chars[i];
    return (before / all) * speech + i * pauseLen + pauseLen / 2;
  });
}

const takeFile = (historyItemId) => path.join(paths.cache, `elevenlabs-take-${historyItemId}.mp3`);

async function fetchTake(historyItemId) {
  const file = takeFile(historyItemId);
  if (await ensureLocal(file)) return file;
  fs.writeFileSync(file, await historyAudio(historyItemId));
  return file;
}

// Builds the finished clone mix from the takes, with no characters spent.
export async function renderFromTakes(m, settings, { format, update = () => {} }) {
  const entry = takesFor(m);
  if (!entry) throw new Error('This meditation has no takes made in ElevenLabs. Use Voice and mix instead.');
  const status = takesStatus(m);
  if (!status.matches) throw new Error(`The script has changed since the takes were made (${status.changed.join(', ')}). Use Voice and mix so the changed parts are voiced again.`);
  const sections = sectionsOf(m.script);

  const workDir = path.join(paths.work, `${m.id}-takes-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const outDir = path.join(paths.renders, m.id);
  fs.mkdirSync(outDir, { recursive: true });
  try {
    update({ total: sections.length, done: 0, message: `Fetching ${sections.length} takes from ElevenLabs` });
    const files = [];
    for (const [i, s] of entry.sections.entries()) {
      const take = s.takes[status.sections[i].pick];
      files.push(await fetchTake(take.historyItemId));
      update({ done: i + 1, message: `Fetched ${i + 1} of ${sections.length} takes` });
    }

    update({ message: 'Setting every silence to the length in the script' });
    const track = makeTrack(workDir);
    const timeline = [];
    const notes = [];
    await track.silence(settings.preRollSeconds);
    for (const [i, s] of sections.entries()) {
      if (s.before) await track.silence(s.before);
      const wav = path.join(workDir, `take-${i}.wav`);
      await audio.toWav(files[i], wav);
      const total = audio.wavSeconds(wav);
      // Quiet stretches inside the take, not the bits of air at either end.
      const gaps = (await audio.detectSilences(wav)).filter((g) => g.start > 0.3 && g.end < total - 0.3);
      const placed = placePauses(expectedPauseTimes(s, total, gaps), gaps);
      const missing = placed.filter((g) => g == null).length;
      if (missing) notes.push(`${s.name}: found ${s.pauses.length - missing} of ${s.pauses.length} pauses, the rest stay as voiced.`);

      // Cut the take in the middle of each pause it found and widen the pause to the script's length.
      let from = 0;
      let wordsFrom = 0;
      const cuts = placed.map((g, k) => (g == null ? null : { at: (gaps[g].start + gaps[g].end) / 2, gap: gaps[g].end - gaps[g].start, seconds: s.pauses[k], piece: k }));
      for (const cut of [...cuts.filter(Boolean), { at: null, piece: s.pieces.length - 1 }]) {
        const piece = track.name('take');
        await audio.cutWav(wav, from, cut.at, piece);
        const start = track.clock;
        const len = track.add(piece);
        // One timeline entry per paragraph, placed by its share of the words, for the 30 second snippet.
        const paras = s.pieces.slice(wordsFrom, cut.piece + 1).flatMap((p) => p.split('\n\n'));
        const weights = paras.map((p) => Math.max(1, spokenChars(p)));
        const sum = weights.reduce((a, b) => a + b, 0);
        let at = start;
        paras.forEach((p, k) => {
          const share = (weights[k] / sum) * len;
          timeline.push({ textKey: `take-${i}-${wordsFrom}-${k}`, start: Number(at.toFixed(2)), end: Number((at + share).toFixed(2)), words: firstWords(p) });
          at += share;
        });
        wordsFrom = cut.piece + 1;
        if (cut.at != null) {
          from = cut.at;
          const extra = cut.seconds - cut.gap;
          if (extra > 0.05) await track.silence(extra);
        }
      }
      await track.silence(s.after || settings.paragraphGapSeconds);
    }

    update({ message: 'Mixing the music bed and setting loudness' });
    const { result, bedPath, outMp3 } = await finishTrack(track, m, settings, { source: 'clone', isSleep: format?.ending === 'sleep', workDir, outDir });
    return {
      source: 'clone',
      fromTakes: true,
      voiceName: status.voiceName,
      takes: entry.sections.map((s, i) => s.takes[status.sections[i].pick].historyItemId),
      file: path.relative(paths.renders, outMp3),
      seconds: Math.round(result.seconds),
      integratedLufs: result.integratedLufs,
      truePeak: result.truePeak,
      charsSpent: 0,
      paragraphs: timeline.length,
      measuredWpm: null,
      bed: bedPath ? m.bedFile : null,
      timeline,
      notes,
      renderedAt: new Date().toISOString(),
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
