// ElevenLabs REST calls: voices, quota and text to speech.
import { readEnvKeys } from './config.js';

const baseUrl = () => (process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '');

export class ElevenLabsError extends Error {
  constructor(message, status, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function key() {
  const k = readEnvKeys().elevenlabs;
  if (!k) throw new ElevenLabsError('No ElevenLabs API key yet. Add it in Settings.', 401);
  return k;
}

async function readError(res) {
  let detail = '';
  try {
    const body = await res.json();
    const d = body.detail ?? body;
    detail = typeof d === 'string' ? d : d.message || d.status || JSON.stringify(d);
  } catch {
    detail = res.statusText;
  }
  return detail;
}

async function call(path, init = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { 'xi-api-key': key(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const detail = await readError(res);
    const retryable = res.status === 429 || res.status >= 500;
    const hint = res.status === 401 ? ' Check the ElevenLabs key in Settings.' : '';
    throw new ElevenLabsError(`ElevenLabs ${res.status}: ${detail}.${hint}`, res.status, retryable);
  }
  return res;
}

export async function listVoices() {
  const res = await call('/v1/voices');
  const body = await res.json();
  return (body.voices || []).map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    description: v.description || '',
    preview_url: v.preview_url || null,
  }));
}

export async function getSubscription() {
  const res = await call('/v1/user/subscription');
  const s = await res.json();
  return {
    tier: s.tier,
    used: s.character_count,
    limit: s.character_limit,
    remaining: Math.max(0, (s.character_limit || 0) - (s.character_count || 0)),
    resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Voices one paragraph. Returns the MP3 bytes. Retries rate limits and server errors.
export async function textToSpeech({ text, voiceId, model, outputFormat, voiceSettings }) {
  const body = { text, model_id: model };
  // eleven_v4 and eleven_v3 take their tone from audio tags, so settings are only sent when Julian sets them.
  if (voiceSettings && Object.keys(voiceSettings).length) body.voice_settings = voiceSettings;
  const qs = new URLSearchParams({ output_format: outputFormat || 'mp3_44100_128' });
  let attempt = 0;
  for (;;) {
    try {
      const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new ElevenLabsError('ElevenLabs returned empty audio.', 502, true);
      return { audio: buf, requestId: res.headers.get('request-id') };
    } catch (err) {
      attempt += 1;
      // fetch raises TypeError when the network drops; that is worth another try too.
      const retryable = err instanceof ElevenLabsError ? err.retryable : err.name === 'TypeError';
      if (!retryable || attempt > 4) throw err;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

// Downloads a take already in Julian's ElevenLabs history. Costs no characters.
export async function historyAudio(historyItemId) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await call(`/v1/history/${encodeURIComponent(historyItemId)}/audio`, { headers: { Accept: 'audio/mpeg' } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new ElevenLabsError('ElevenLabs returned an empty take.', 502, true);
      return buf;
    } catch (err) {
      attempt += 1;
      const retryable = err instanceof ElevenLabsError ? err.retryable : err.name === 'TypeError';
      if (err instanceof ElevenLabsError && err.status === 404) {
        throw new ElevenLabsError(`ElevenLabs has no take ${historyItemId} in this account's history. Check the ElevenLabs key in Settings belongs to the account that made the takes.`, 404);
      }
      if (!retryable || attempt > 4) throw err;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

// Composes an instrumental music bed with ElevenLabs Music. Returns the MP3 bytes.
// modelId is optional: without it ElevenLabs uses its current default music model.
export async function composeMusic({ prompt, seconds, modelId, outputFormat = 'mp3_44100_128' }) {
  const body = {
    prompt,
    music_length_ms: Math.round(Math.min(300, Math.max(10, seconds)) * 1000),
    force_instrumental: true,
  };
  if (modelId) body.model_id = modelId;
  const qs = new URLSearchParams({ output_format: outputFormat });
  let attempt = 0;
  for (;;) {
    try {
      const res = await call(`/v1/music?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new ElevenLabsError('ElevenLabs returned no music.', 502, true);
      return buf;
    } catch (err) {
      attempt += 1;
      const retryable = err instanceof ElevenLabsError ? err.retryable : err.name === 'TypeError';
      if (!retryable || attempt > 2) throw err;
      await sleep(4000 * attempt);
    }
  }
}
