// Stand-in ElevenLabs and Claude servers, so the whole studio can be tested without keys or credits.
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

export function toneMp3(seconds, freq = 220) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds.toFixed(2)}`, '-ac', '1', '-ar', '44100', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], { maxBuffer: 50e6 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}

export function toneFile(seconds, format, freq = 330) {
  if (format === 'png') {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-f', 'lavfi', '-i', 'color=c=0x14283f:s=1080x1920', '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'], { maxBuffer: 50e6 });
    if (r.status !== 0) throw new Error(r.stderr.toString());
    return r.stdout;
  }
  const args = format === 'webm' ? ['-c:a', 'libopus', '-f', 'webm'] : ['-f', 'wav'];
  const r = spawnSync(FFMPEG, ['-hide_banner', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-ac', '1', '-ar', '48000', ...args, 'pipe:1'], { maxBuffer: 50e6 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}

// A stand-in for a take made in ElevenLabs: a tone for each paragraph (2.5 words a second), 0.4 s
// between paragraphs, and 2 s of quiet for each [long pause] tag, like the real takes.
export function takeShape(text) {
  const parts = [];
  for (const block of String(text).split(/\n\n+/)) {
    const tags = (block.match(/\[long pause\]/g) || []).length;
    const words = block.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
    if (!words && tags) parts.push({ quiet: 2 * tags });
    else if (words) {
      if (parts.length && parts[parts.length - 1].tone) parts.push({ quiet: 0.4 });
      parts.push({ tone: Math.max(0.6, words / 2.5) });
    }
  }
  return parts;
}

export function takeMp3(text) {
  const parts = takeShape(text);
  const inputs = parts.flatMap((p) => (p.tone
    ? ['-f', 'lavfi', '-i', `sine=frequency=220:duration=${p.tone.toFixed(2)}`]
    : ['-f', 'lavfi', '-t', p.quiet.toFixed(2), '-i', 'anullsrc=r=44100:cl=mono']));
  const graph = `${parts.map((_, i) => `[${i}:a]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`;
  const r = spawnSync(FFMPEG, ['-hide_banner', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ac', '1', '-ar', '44100', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], { maxBuffer: 50e6 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => resolve(b));
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

export async function mockElevenLabs({ takes = {} } = {}) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.headers['xi-api-key'] !== 'test-eleven') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }));
    }
    if (req.method === 'GET' && req.url === '/v1/voices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ voices: [
        { voice_id: 'zzOther', name: 'Another Voice', category: 'premade' },
        { voice_id: '3crtmEFfp6bvumTLLI8m', name: 'Julian - Meditation Voice', category: 'cloned' },
      ] }));
    }
    if (req.method === 'GET' && req.url === '/v1/user/subscription') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tier: 'creator', character_count: 1000, character_limit: 100000, next_character_count_reset_unix: 1796000000 }));
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/music')) {
      const json = JSON.parse(body);
      calls.push({ music: true, query: req.url.split('?')[1], ...json });
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      return res.end(toneMp3(Math.min(20, json.music_length_ms / 1000), 196));
    }
    const hist = req.url.match(/^\/v1\/history\/([^/]+)\/audio$/);
    if (req.method === 'GET' && hist) {
      calls.push({ history: hist[1] });
      if (!takes[hist[1]]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ detail: { status: 'history_item_not_found', message: 'Not found' } }));
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      return res.end(takeMp3(takes[hist[1]]));
    }
    const m = req.url.match(/^\/v1\/text-to-speech\/([^?]+)\?(.*)$/);
    if (req.method === 'POST' && m) {
      const json = JSON.parse(body);
      calls.push({ voiceId: m[1], query: m[2], ...json });
      const words = json.text.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'request-id': `req_${calls.length}` });
      return res.end(toneMp3(Math.max(0.4, words / 2.0)));
    }
    res.writeHead(404);
    res.end();
  });
  const url = await listen(server);
  return { url, calls, close: () => server.close() };
}

export const SAMPLE_DRAFT = {
  title: 'Back to Solid Ground',
  spotifyTitle: 'Meditation for Anxiety: Back to Solid Ground',
  subtitle: 'Ten minutes to find your feet again',
  insightTimerDescription: 'For the moments when worry will not stop and your thoughts run ahead of you. Ten minutes to feel your feet again.\n\nUse it whenever you need it, sitting or standing, and come back to it tomorrow.\n\nTake a breath with me and then be love and give love. Have a wonderful day, one breath at a time.',
  spotifyDescription: 'Ten minutes to find your feet.\n\nTake a breath with me and then be love and give love. Have a wonderful day, one breath at a time.',
  tags: ['anxiety', 'calm'],
  script: '## Opening\n[softly] Let yourself arrive, just as you are.\n\n[[silence 5s]]\n\nNotice your feet on the floor.\n\n## Closing\nCome back to this tomorrow.\n\nTake a breath with me and then be love and give love. Have a wonderful day, one breath at a time.',
  coverImagePrompt: 'Mist over a dark Welsh hill at dusk, deep navy sky, aged gold light low on the horizon, film grain, no text.',
  coverAltText: 'A misty hill at dusk under a deep navy sky.',
  trailerLine: 'When worry will not stop, come back to solid ground.',
  snippetStart: 'Notice your feet on the floor.',
  notesForJulian: 'Check the opening by ear.',
};

export async function mockClaude({ rejectFallbacks = false } = {}) {
  const calls = [];
  const send = (res, text, stop = 'end_turn') => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < text.length; i += 200) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 200) } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 100 } });
    ev('message_stop', {});
    res.end();
  };
  const server = http.createServer(async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    calls.push({ url: req.url, headers: req.headers, body });
    if (rejectFallbacks && body.fallbacks) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: beta not enabled for this organization' } }));
    }
    if (body.tools?.some((t) => t.type?.startsWith('web_search'))) {
      return send(res, 'Here is what I found.\n```json\n{"summary":"Sleep leads.","trends":[{"topic":"Yoga nidra","platform":"Insight Timer","evidence":"Top charts","sourceUrl":"https://insighttimer.com"}],"ideas":[{"formatId":"yoga-nidra-sleep","theme":"for shift workers","pillar":3,"why":"demand"}]}\n```');
    }
    return send(res, JSON.stringify(SAMPLE_DRAFT));
  });
  const url = await listen(server);
  return { url, calls, close: () => server.close() };
}
