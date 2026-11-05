// Turns a meditation script into the pieces the audio pipeline needs.
//
// Script format (what Claude writes and what Julian edits):
//   ## Opening              a note for Julian. Never spoken, never sent to ElevenLabs.
//   [softly] Let the ...    spoken text. Single square brackets are eleven_v4 audio tags.
//   (blank line)            a new paragraph. Each paragraph is voiced on its own, with a short gap.
//   [[silence 20s]]         exact silence in the finished audio (also 90s, 2m, 1m30s).
import crypto from 'node:crypto';

const SILENCE_RE = /^\[\[\s*silence\s+([0-9hms.\s]+)\]\]$/i;
const NOTE_RE = /^##\s?/;
const TAG_RE = /\[([^\[\]]+)\]/g;
export const MAX_REQUEST_CHARS = 3000;

export function parseDuration(spec) {
  const s = String(spec).trim().toLowerCase().replace(/\s+/g, '');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

// Splits the script into an ordered list of blocks.
// speech: { type, text, line }   silence: { type, seconds, line }   note: { type, text, line }
export function parseScript(script) {
  const lines = String(script || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let paraLine = 0;
  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'speech', text: para.join(' ').replace(/\s+/g, ' ').trim(), line: paraLine });
      para = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const lineNo = i + 1;
    if (!line) return flush();
    if (NOTE_RE.test(line)) {
      flush();
      blocks.push({ type: 'note', text: line.replace(NOTE_RE, ''), line: lineNo });
      return;
    }
    const sil = line.match(SILENCE_RE);
    if (sil) {
      flush();
      const seconds = parseDuration(sil[1]);
      blocks.push({ type: 'silence', seconds: seconds ?? 0, line: lineNo, invalid: seconds == null });
      return;
    }
    if (!para.length) paraLine = lineNo;
    para.push(line);
  });
  flush();
  return blocks;
}

export function spokenWords(text) {
  return String(text).replace(TAG_RE, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
}

function tagPauseSeconds(text) {
  let s = 0;
  for (const [, tag] of String(text).matchAll(TAG_RE)) {
    const t = tag.toLowerCase().trim();
    if (t === 'short pause') s += 0.5;
    else if (t === 'pause') s += 1.2;
    else if (t === 'long pause') s += 2.5;
    else if (/exhales|sighs|breath/.test(t)) s += 1.5;
  }
  s += (String(text).match(/\.\.\.|…/g) || []).length * 0.5;
  return s;
}

// Breaks one long paragraph at sentence ends so each request stays under the model's limit.
export function splitLongText(text, max = MAX_REQUEST_CHARS) {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function withPrefix(text, prefix) {
  const p = String(prefix || '').trim();
  if (!p || text.trimStart().startsWith('[')) return text;
  return `${p} ${text}`;
}

export function hashRequest(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

// Builds the exact list of ElevenLabs requests and silences, in order.
// opts: { voiceId, model, outputFormat, deliveryPrefix, paragraphGapSeconds, takes }
export function buildPlan(script, opts) {
  const blocks = parseScript(script);
  const plan = [];
  let lastWasSpeech = false;
  for (const b of blocks) {
    if (b.type === 'note') continue;
    if (b.type === 'silence') {
      plan.push({ type: 'silence', seconds: b.seconds, explicit: true, line: b.line });
      lastWasSpeech = false;
      continue;
    }
    for (const chunk of splitLongText(b.text)) {
      if (lastWasSpeech) plan.push({ type: 'silence', seconds: opts.paragraphGapSeconds ?? 1.2, explicit: false });
      const text = withPrefix(chunk, opts.deliveryPrefix);
      const base = {
        text,
        voiceId: opts.voiceId,
        model: opts.model,
        outputFormat: opts.outputFormat,
        voiceSettings: opts.voiceSettings || null,
      };
      const baseHash = hashRequest(base);
      const take = (opts.takes && opts.takes[baseHash]) || 1;
      plan.push({
        type: 'speech',
        text,
        spoken: chunk,
        // Recordings are keyed by the words alone, so changing voice or settings keeps Julian's own reads.
        textKey: hashRequest({ words: chunk.replace(/\s+/g, ' ').trim() }),
        line: b.line,
        key: baseHash,
        take,
        hash: take === 1 ? baseHash : hashRequest({ ...base, take }),
        chars: text.length,
      });
      lastWasSpeech = true;
    }
  }
  return plan;
}

// Estimated running time in seconds, before any audio exists.
export function estimateSeconds(script, opts = {}) {
  const wpm = opts.wordsPerMinute || 115;
  const blocks = parseScript(script);
  let speech = 0;
  let silence = 0;
  let paragraphs = 0;
  for (const b of blocks) {
    if (b.type === 'speech') {
      paragraphs += 1;
      speech += (spokenWords(b.text).length / wpm) * 60 + tagPauseSeconds(b.text);
    } else if (b.type === 'silence') {
      silence += b.seconds;
    }
  }
  const gaps = Math.max(0, paragraphs - 1) * (opts.paragraphGapSeconds ?? 1.2);
  const total = speech + silence + gaps + (opts.preRollSeconds ?? 0) + (opts.tailSeconds ?? 0);
  return { total, speech, silence: silence + gaps, paragraphs };
}

export function scriptStats(script, opts = {}) {
  const blocks = parseScript(script);
  const speech = blocks.filter((b) => b.type === 'speech');
  const words = speech.reduce((n, b) => n + spokenWords(b.text).length, 0);
  const plan = buildPlan(script, { ...opts, voiceId: opts.voiceId || 'x', model: opts.model || 'x' });
  const chars = plan.filter((p) => p.type === 'speech').reduce((n, p) => n + p.chars, 0);
  const requests = plan.filter((p) => p.type === 'speech').length;
  const est = estimateSeconds(script, opts);
  // Silence in the first two minutes matters: an Insight Timer play only counts after 120 seconds.
  let t = opts.preRollSeconds ?? 0;
  let earlySilence = 0;
  for (const b of blocks) {
    if (t >= 120) break;
    if (b.type === 'speech') t += (spokenWords(b.text).length / (opts.wordsPerMinute || 115)) * 60;
    if (b.type === 'silence') {
      earlySilence += Math.min(b.seconds, Math.max(0, 120 - t));
      t += b.seconds;
    }
  }
  return { words, chars, requests, estimatedSeconds: Math.round(est.total), speechSeconds: Math.round(est.speech), silenceSeconds: Math.round(est.silence), earlySilenceSeconds: Math.round(earlySilence) };
}

// The script as a listener would read it: no tags, no notes, no silence markers.
export function transcript(script) {
  return parseScript(script)
    .filter((b) => b.type === 'speech')
    .map((b) => b.text.replace(TAG_RE, '').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

// What ElevenLabs would read aloud by mistake. Run before every render.
export function pasteTest(script) {
  const issues = [];
  const lines = String(script || '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const at = i + 1;
    if (!line || NOTE_RE.test(line)) return;
    if (/^\[\[/.test(line) && !SILENCE_RE.test(line)) {
      issues.push({ line: at, severity: 'block', message: 'Silence marker not understood. Use [[silence 20s]] on its own line.' });
      return;
    }
    if (SILENCE_RE.test(line)) {
      const m = line.match(SILENCE_RE);
      if (parseDuration(m[1]) == null) issues.push({ line: at, severity: 'block', message: 'Silence length not understood. Try 20s, 90s, 2m or 1m30s.' });
      return;
    }
    if (/[(){}<>*_#]/.test(line)) issues.push({ line: at, severity: 'block', message: 'Brackets, braces, asterisks or symbols would be read aloud. Directions go in [square brackets] only.' });
    if (/^[A-Z][A-Z ]{2,}:/.test(line)) issues.push({ line: at, severity: 'block', message: 'Speaker label (like NARRATOR:) would be read aloud.' });
    if (/^\s*[-•]\s/.test(raw)) issues.push({ line: at, severity: 'block', message: 'List bullet would be read aloud.' });
    if (/\[\s*\]/.test(line)) issues.push({ line: at, severity: 'warn', message: 'Empty audio tag.' });
    if (/\[[^\]]*$/.test(line)) issues.push({ line: at, severity: 'block', message: 'An audio tag is not closed with ].' });
  });
  return issues;
}
