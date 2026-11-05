// The 30 second pieces for publishing:
//  - snippet: the 30 seconds of the finished track Insight Timer plays as its preview. Teachers pick it
//    in the Teacher Dashboard by dragging a slider, so the studio works out the best start time.
//  - trailer: a 30 second portrait MP4 (1080 x 1920) for an Insight Timer course trailer, Instagram or
//    YouTube Shorts: the snippet audio over a calm title card. Insight Timer course trailers are MP4,
//    portrait, ideally 20 to 30 seconds (10 to 45 allowed).
import fs from 'node:fs';
import path from 'node:path';
import { run, probeSeconds } from './audio.js';

export const SNIPPET_SECONDS = 30;

const norm = (s) => String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();

// How much of [start, start + 30] has someone speaking.
function speechIn(timeline, start) {
  const end = start + SNIPPET_SECONDS;
  return timeline.reduce((n, p) => n + Math.max(0, Math.min(end, p.end) - Math.max(start, p.start)), 0);
}

// Chooses where the preview starts. Order: the paragraph Julian picked, then the paragraph Claude
// suggested (snippetStart), then the 30 seconds with the most voice in them after the opening minute.
export function pickSnippet(render, { textKey, snippetStart } = {}) {
  const timeline = render?.timeline || [];
  const total = render?.seconds || 0;
  if (!timeline.length || total < SNIPPET_SECONDS) return { start: 0, textKey: timeline[0]?.textKey || null, reason: 'Track is shorter than 30 seconds' };
  const clamp = (s) => Math.max(0, Math.min(total - SNIPPET_SECONDS, s));
  const at = (p, reason) => ({ start: Number(clamp(p.start - 0.4).toFixed(1)), textKey: p.textKey, words: p.words, reason });

  if (textKey) {
    const p = timeline.find((x) => x.textKey === textKey);
    if (p) return at(p, 'The paragraph you chose');
  }
  if (snippetStart) {
    const want = norm(snippetStart).split(' ').slice(0, 6).join(' ');
    const p = want && timeline.find((x) => norm(x.words).startsWith(want));
    if (p) return at(p, 'The moment suggested when the script was written');
  }
  const minStart = total > 600 ? 60 : 0;
  let best = null;
  for (const p of timeline) {
    const s = clamp(p.start - 0.4);
    if (s < minStart && timeline.some((x) => x.start >= minStart)) continue;
    const covered = speechIn(timeline, s);
    if (!best || covered > best.covered + 0.5) best = { p, covered };
  }
  return at(best.p, `The 30 seconds with the most of your voice (${Math.round(best.covered)} s spoken)`);
}

export async function makeSnippet(srcMp3, start, outMp3) {
  await run([
    '-ss', String(start), '-t', String(SNIPPET_SECONDS), '-i', srcMp3,
    '-af', `afade=t=in:d=0.8,afade=t=out:st=${SNIPPET_SECONDS - 2.5}:d=2.5`,
    '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    outMp3,
  ]);
  return { file: outMp3, seconds: await probeSeconds(outMp3) };
}

// Turns the card image (drawn by the dashboard in the brand fonts, 1080 x 1920) and the 30 second
// snippet into the trailer MP4. ffmpeg only joins picture and sound here, so it needs no font support.
export async function makeTrailer({ cardFile, audioFile, outMp4, workDir }) {
  fs.mkdirSync(workDir, { recursive: true });
  // Plain names inside the work folder, so no path needs escaping in the filter.
  fs.copyFileSync(cardFile, path.join(workDir, 'card.png'));
  fs.copyFileSync(audioFile, path.join(workDir, 'audio.mp3'));
  await run([
    '-loop', '1', '-framerate', '25', '-i', 'card.png', '-i', 'audio.mp3',
    '-filter_complex', `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0a1525,fade=t=in:st=0:d=1.2,fade=t=out:st=${SNIPPET_SECONDS - 1.5}:d=1.5,format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a',
    '-t', String(SNIPPET_SECONDS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'stillimage', '-r', '25',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    'trailer.mp4',
  ], { cwd: workDir });
  fs.copyFileSync(path.join(workDir, 'trailer.mp4'), outMp4);
  return { file: outMp4, seconds: await probeSeconds(outMp4), width: 1080, height: 1920 };
}
