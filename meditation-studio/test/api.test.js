// End to end: write with Claude, voice with ElevenLabs, record, mix, pack, log plays. All against stand-ins.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { mockElevenLabs, mockClaude, toneFile, toneMp3, takeShape } from './mocks.js';

let base, server, eleven, claude, storage;
const EXAMPLE = fs.readFileSync(new URL('../scripts/library/morning-five-breaths.txt', import.meta.url), 'utf8');
const TAKES = JSON.parse(fs.readFileSync(new URL('../data/elevenlabs-takes.json', import.meta.url), 'utf8'));
// Every take in the manifest, by history id, so the stand-in ElevenLabs can serve it.
const TAKE_TEXT = Object.fromEntries(Object.values(TAKES.meditations).flatMap((m) => m.sections.flatMap((s) => s.takes.map((t) => [t.historyItemId, s.text]))));

before(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
  eleven = await mockElevenLabs({ takes: TAKE_TEXT });
  claude = await mockClaude();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    STUDIO_STORAGE_DIR: storage,
    STUDIO_ENV_FILE: path.join(storage, '.env'),
    ELEVENLABS_BASE_URL: eleven.url,
    ELEVENLABS_API_KEY: 'test-eleven',
    ANTHROPIC_BASE_URL: claude.url,
    ANTHROPIC_API_KEY: 'test-claude',
  });
  const { default: app } = await import('../server.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  eleven?.close();
  claude?.close();
  fs.rmSync(storage, { recursive: true, force: true });
});

async function api(p, opts = {}) {
  const init = { method: opts.method || 'GET', headers: opts.bare ? {} : { 'X-Studio': '1' } };
  if (opts.form) init.body = opts.form;
  else if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const res = await fetch(base + p, init);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function waitJob(id) {
  for (let i = 0; i < 240; i += 1) {
    const { data } = await api(`/api/jobs/${id}`);
    if (data.status !== 'running') return data;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('job timed out');
}

test('status, formats and voices', async () => {
  const s = await api('/api/status');
  assert.equal(s.data.ffmpeg.ok, true);
  assert.match(s.data.elevenlabs, /ending even/);
  const f = await api('/api/formats');
  assert.equal(f.data.formats.length, 15);
  assert.ok(f.data.playData.byLength.sleep.length === 6);
  const v = await api('/api/voices');
  assert.equal(v.data.voices[0].voice_id, 'KYXOMmyAOr8VFco83i7K', 'the Julian voice first, as the default');
  assert.equal(v.data.voices[1].voice_id, '3crtmEFfp6bvumTLLI8m');
  const sub = await api('/api/subscription');
  assert.equal(sub.data.remaining, 99000);
});

test('Claude writes a script with the right request shape', async () => {
  const { data } = await api('/api/meditations', { method: 'POST', body: { formatId: 'calm-in-the-moment', pillar: 3, minutes: 10, theme: 'when worry will not stop', write: true } });
  const job = await waitJob(data.job.id);
  assert.equal(job.status, 'done', job.error);
  const m = (await api(`/api/meditations/${data.meditation.id}`)).data;
  assert.equal(m.status, 'draft');
  assert.equal(m.title, 'Back to Solid Ground');
  assert.equal(m.brandSummary.blocks, 0, JSON.stringify(m.checks.filter((c) => c.severity === 'block')));

  const call = claude.calls.at(-1);
  assert.equal(call.body.model, 'claude-opus-5-5');
  assert.equal(call.body.stream, true);
  assert.equal(call.body.thinking.type, 'adaptive');
  assert.equal(call.body.output_config.effort, 'high');
  assert.equal(call.body.output_config.format.type, 'json_schema');
  assert.equal(call.body.fallbacks, 'default');
  assert.match(call.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(call.body.temperature, undefined);
  assert.equal(call.body.cache_control.type, 'ephemeral');
  assert.match(call.body.messages[0].content, /Calm in the Moment/);
  assert.doesNotMatch(call.body.messages[0].content, /pillar/i, 'plain by default: no pillars');
  assert.doesNotMatch(call.body.system, /Living Awake/, 'plain by default: no brand in the prompt');
  assert.equal(m.brand, 'plain');
});

test('brand profiles stay off until Julian turns them on', async () => {
  const off = await api('/api/meditations', { method: 'POST', body: { formatId: 'letting-go', brand: 'living-awake', pillar: 1 } });
  assert.equal(off.data.meditation.brand, 'plain');
  await api('/api/settings', { method: 'PUT', body: { brandProfiles: true } });
  const on = await api('/api/meditations', { method: 'POST', body: { formatId: 'letting-go', brand: 'living-awake', pillar: 1, write: true } });
  assert.equal(on.data.meditation.brand, 'living-awake');
  assert.equal((await waitJob(on.data.job.id)).status, 'done');
  const call = claude.calls.at(-1);
  assert.match(call.body.system, /four pillars/);
  assert.match(call.body.messages[0].content, /Pillar: 1/);
  await api('/api/settings', { method: 'PUT', body: { brandProfiles: false } });
  await api(`/api/meditations/${off.data.meditation.id}`, { method: 'DELETE' });
  await api(`/api/meditations/${on.data.meditation.id}`, { method: 'DELETE' });
});

test('revise sends the current draft back', async () => {
  const { data: list } = await api('/api/meditations');
  const id = list[0].id;
  const { data } = await api(`/api/meditations/${id}/revise`, { method: 'POST', body: { instruction: 'shorter opening' } });
  assert.equal((await waitJob(data.job.id)).status, 'done');
  assert.match(claude.calls.at(-1).body.messages[0].content, /<current_draft>[\s\S]*shorter opening/);
});

test('voice clone render: every paragraph voiced once, nothing unspoken sent, then cached', async () => {
  const { data } = await api('/api/meditations', { method: 'POST', body: { formatId: 'morning-five-breaths', pillar: 3, minutes: 8, script: EXAMPLE } });
  const id = data.meditation.id;
  const { data: planRes } = await api(`/api/meditations/${id}/plan`);
  const speech = planRes.plan.filter((p) => p.type === 'speech');
  const before = eleven.calls.length;
  const r = await api(`/api/meditations/${id}/render`, { method: 'POST', body: { source: 'clone' } });
  const job = await waitJob(r.data.job.id);
  assert.equal(job.status, 'done', job.error);
  const sent = eleven.calls.slice(before);
  assert.equal(sent.length, speech.length);
  for (const c of sent) {
    assert.equal(c.model_id, 'eleven_v4');
    assert.equal(c.voiceId, 'KYXOMmyAOr8VFco83i7K');
    assert.ok(!/\[\[|##/.test(c.text), c.text);
    assert.ok(c.text.startsWith('['), 'each paragraph opens with a tag');
    assert.equal(c.voice_settings, undefined);
  }
  const silences = planRes.plan.filter((p) => p.type === 'silence').reduce((n, p) => n + p.seconds, 0);
  assert.ok(job.result.seconds > silences + 4 + 20 + 11, `length ${job.result.seconds}`);
  assert.ok(Math.abs(job.result.integratedLufs - -16) < 1.5, `loudness ${job.result.integratedLufs}`);
  const mp3 = await fetch(`${base}/api/renders/${id}/clone`);
  assert.equal(mp3.status, 200);
  assert.ok((await mp3.arrayBuffer()).byteLength > 100000);

  const again = await api(`/api/meditations/${id}/render`, { method: 'POST', body: { source: 'clone' } });
  assert.equal((await waitJob(again.data.job.id)).status, 'done');
  assert.equal(eleven.calls.length, before + speech.length, 'second render uses the cache');

  const take = await api(`/api/meditations/${id}/paragraphs/${speech[2].key}/voice`, { method: 'POST', body: { newTake: true } });
  assert.equal(take.data.take, 2);
  assert.equal(eleven.calls.length, before + speech.length + 1);
});

test('Insight Timer pack stays locked until Julian records every paragraph', async () => {
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  const locked = await api(`/api/meditations/${m.id}/pack/insight-timer`);
  assert.equal(locked.status, 409);
  assert.match(locked.data.error, /real human voice/);
  const spotify = await api(`/api/meditations/${m.id}/pack/spotify`);
  assert.equal(spotify.status, 200);
  assert.match(spotify.data, /SPOTIFY UPLOAD PACK/);
  assert.match(spotify.data, /AI credits/);

  const early = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'recorded' } });
  const failed = await waitJob(early.data.job.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /still to record/);

  const { data: planRes } = await api(`/api/meditations/${m.id}/plan`);
  const speech = planRes.plan.filter((p) => p.type === 'speech');
  for (const [i, p] of speech.entries()) {
    const fd = new FormData();
    const webm = i % 2 === 0;
    fd.append('audio', new Blob([toneFile(1.5, webm ? 'webm' : 'wav')], { type: webm ? 'audio/webm' : 'audio/wav' }), webm ? 'take.webm' : 'take.wav');
    const up = await api(`/api/meditations/${m.id}/recordings/${p.textKey}`, { method: 'POST', form: fd });
    assert.equal(up.status, 200, JSON.stringify(up.data));
  }
  const rec = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'recorded' } });
  const done = await waitJob(rec.data.job.id);
  assert.equal(done.status, 'done', done.error);
  const it = await api(`/api/meditations/${m.id}/pack/insight-timer`);
  assert.equal(it.status, 200);
  assert.match(it.data, /Julian's own recorded voice/);
  assert.match(it.data, /1600 x 1600/);
  assert.match(it.data, /Transcript:/);
});

test('30 second snippet and trailer video', async () => {
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  const full = (await api(`/api/meditations/${m.id}`)).data;
  const timeline = full.renders.recorded.timeline;
  assert.ok(timeline.length > 10 && timeline[0].start >= 4, 'timeline starts after the lead in');
  assert.ok(timeline.every((p, i) => i === 0 || p.start >= timeline[i - 1].end), 'paragraphs in order');

  const auto = await api(`/api/meditations/${m.id}/snippet`, { method: 'POST', body: { source: 'recorded' } });
  assert.equal(auto.status, 200, JSON.stringify(auto.data));
  assert.ok(auto.data.snippet.start >= 0);
  const chosen = await api(`/api/meditations/${m.id}/snippet`, { method: 'POST', body: { source: 'recorded', textKey: timeline[5].textKey } });
  assert.equal(chosen.data.snippet.textKey, timeline[5].textKey);
  assert.ok(Math.abs(chosen.data.snippet.start - (timeline[5].start - 0.4)) < 0.11);
  const snip = await fetch(`${base}${chosen.data.url}`);
  assert.equal(snip.status, 200);

  const card = toneFile(0, 'png');
  const fd = new FormData();
  fd.append('source', 'recorded');
  fd.append('card', new Blob([card], { type: 'image/png' }), 'card.png');
  const t = await api(`/api/meditations/${m.id}/trailer`, { method: 'POST', form: fd });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  const job = await waitJob(t.data.job.id);
  assert.equal(job.status, 'done', job.error);
  assert.equal(job.result.seconds, 30);
  assert.equal(job.result.width, 1080);
  const mp4 = await fetch(`${base}/api/renders/${m.id}/trailer-recorded`);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');

  const pack = await api(`/api/meditations/${m.id}/pack/insight-timer`);
  assert.match(pack.data, /drag the slider to start at \d+:\d\d/);
  assert.match(pack.data, /Course trailer video: MP4, portrait 1080 x 1920, 30 seconds/);
  assert.match(pack.data, /Cover image description/);
});

test('ElevenLabs Music makes a calm bed with a credit line', async () => {
  const { data: bedsRes } = await api('/api/beds');
  assert.ok(bedsRes.presets.find((p) => p.id === 'still-water'));
  const { data } = await api('/api/beds/generate', { method: 'POST', body: { preset: 'night-tide', seconds: 180 } });
  const job = await waitJob(data.job.id);
  assert.equal(job.status, 'done', job.error);
  const call = eleven.calls.filter((c) => c.music).at(-1);
  assert.equal(call.music_length_ms, 180000);
  assert.equal(call.force_instrumental, true);
  assert.match(call.prompt, /No drums/);
  const { data: after } = await api('/api/beds');
  const bed = after.beds.find((b) => b.name === 'Night Tide.mp3');
  assert.equal(bed.source, 'elevenlabs-music');
  assert.equal(bed.credit, 'Music: Night Tide');
  await api(`/api/beds/${encodeURIComponent('Night Tide.mp3')}`, { method: 'PUT', body: { credit: 'Music: Night Tide, made for Living Awake' } });
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { bedFile: 'Night Tide.mp3' } });
  const r = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'recorded' } });
  const done = await waitJob(r.data.job.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result.bed, 'Night Tide.mp3');
  const pack = await api(`/api/meditations/${m.id}/pack/insight-timer`);
  assert.match(pack.data, /Music: Night Tide, made for Living Awake/);
  assert.match(pack.data, /\(\d+ of 1000 characters\)/);
});

test('music bed upload and mix', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([toneMp3(4, 110)], { type: 'audio/mpeg' }), 'Wyth tone one.mp3');
  assert.equal((await api('/api/beds', { method: 'POST', form: fd })).status, 200);
  const { data: beds } = await api('/api/beds');
  assert.ok(beds.beds.find((b) => b.name === 'Wyth tone one.mp3'));
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { bedFile: 'Wyth tone one.mp3', bedVolumeDb: -24 } });
  const r = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'clone' } });
  const job = await waitJob(r.data.job.id);
  assert.equal(job.status, 'done', job.error);
  assert.equal(job.result.bed, 'Wyth tone one.mp3');
});

test('performance logging feeds the overview', async () => {
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  await api(`/api/meditations/${m.id}/performance`, { method: 'POST', body: { date: '2026-11-01', platform: 'Insight Timer', plays: 100 } });
  await api(`/api/meditations/${m.id}/performance`, { method: 'POST', body: { date: '2026-11-04', platform: 'Insight Timer', plays: 250, returnRate: 31 } });
  await api(`/api/meditations/${m.id}/performance`, { method: 'POST', body: { date: '2026-11-04', platform: 'Spotify', plays: 40 } });
  const { data: ov } = await api('/api/overview');
  assert.equal(ov.playsLogged, 290, 'latest per platform, not the sum of every entry');
  assert.equal(ov.playsByFormat[0].format, 'Morning Meditation');
});

test('trend scan uses web search and stores ideas', async () => {
  const { data } = await api('/api/research', { method: 'POST', body: { focus: 'sleep' } });
  const job = await waitJob(data.job.id);
  assert.equal(job.status, 'done', job.error);
  const tools = claude.calls.at(-1).body.tools;
  assert.equal(tools[0].type, 'web_search_20260209');
  const { data: research } = await api('/api/research');
  assert.equal(research[0].ideas[0].formatId, 'yoga-nidra-sleep');
});

test('an account without the fallback beta still gets its script', async () => {
  const strict = await mockClaude({ rejectFallbacks: true });
  process.env.ANTHROPIC_BASE_URL = strict.url;
  try {
    const { data } = await api('/api/meditations', { method: 'POST', body: { formatId: 'letting-go', pillar: 1, write: true } });
    const job = await waitJob(data.job.id);
    assert.equal(job.status, 'done', job.error);
    assert.equal(strict.calls.length, 2);
    assert.equal(strict.calls[0].body.fallbacks, 'default');
    assert.equal(strict.calls[1].body.fallbacks, undefined);
  } finally {
    process.env.ANTHROPIC_BASE_URL = claude.url;
    strict.close();
  }
});

test('other websites cannot drive the studio', async () => {
  const noHeader = await api('/api/research', { method: 'POST', body: { focus: 'x' }, bare: true });
  assert.equal(noHeader.status, 403);
  const status = await new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path: '/api/status', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403, 'DNS rebinding host refused');
  assert.equal((await api('/api/ping')).status, 200);
});

test('a second Mac shows up while it has the studio open', async () => {
  const dir = path.join(storage, 'presence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Julian-s-iMac.json'), JSON.stringify({ name: "Julian's iMac", lastSeen: new Date().toISOString() }));
  fs.writeFileSync(path.join(dir, 'Old-Mac.json'), JSON.stringify({ name: 'Old Mac', lastSeen: '2026-01-01T00:00:00Z' }));
  const { data } = await api('/api/status');
  assert.deepEqual(data.otherMacs, ["Julian's iMac"]);
});

test('changes made on the other Mac are picked up', async () => {
  const dbFile = path.join(storage, 'db.json');
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const target = db.meditations.find((x) => x.formatId === 'letting-go');
  target.title = 'Edited on the iMac';
  await new Promise((r) => setTimeout(r, 20));
  fs.writeFileSync(dbFile, JSON.stringify(db));
  const { data } = await api(`/api/meditations/${target.id}`);
  assert.equal(data.title, 'Edited on the iMac');
  // and a change here keeps the other Mac's edit
  await api(`/api/meditations/${target.id}`, { method: 'PUT', body: { theme: 'from the MacBook' } });
  const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8')).meditations.find((x) => x.id === target.id);
  assert.equal(saved.title, 'Edited on the iMac');
  assert.equal(saved.theme, 'from the MacBook');
});

test('audio iCloud has offloaded is fetched back, never voiced again', async () => {
  const { data: list } = await api('/api/meditations');
  const m = list.find((x) => x.formatId === 'morning-five-breaths');
  const cacheDir = path.join(storage, 'cache');
  const name = fs.readdirSync(cacheDir).find((n) => n.endsWith('.mp3'));
  const real = path.join(cacheDir, name);
  const placeholder = path.join(cacheDir, `.${name}.icloud`);
  fs.renameSync(real, placeholder);
  const { data: before } = await api(`/api/meditations/${m.id}`);
  assert.equal(before.clone.charsToSpend, 0, 'offloaded audio still counts as voiced');
  const calls = eleven.calls.length;
  const r = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'clone' } });
  setTimeout(() => fs.renameSync(placeholder, real), 800); // macOS finishing the download
  const job = await waitJob(r.data.job.id);
  assert.equal(job.status, 'done', job.error);
  assert.equal(eleven.calls.length, calls, 'no credits spent');
});

test('the ready made library loads six meditations that pass the quality check', async () => {
  const before = (await api('/api/meditations')).data.length;
  await import('../scripts/seed.js');
  const list = (await api('/api/meditations')).data;
  const lib = list.filter((m) => m.libraryId);
  assert.equal(lib.length, 6);
  assert.equal(list.length, before + 6);
  for (const m of lib) {
    const full = (await api(`/api/meditations/${m.id}`)).data;
    assert.equal(full.brandSummary.blocks, 0, `${m.title}: ${JSON.stringify(full.checks.filter((c) => c.severity !== 'pass'))}`);
    assert.equal(full.pasteIssues.length, 0, m.title);
    const target = m.minutes * 60;
    assert.ok(Math.abs(full.stats.estimatedSeconds - target) / target < 0.12, `${m.title} is ${full.stats.estimatedSeconds}s for ${target}s`);
  }
});

test('the takes made in ElevenLabs mix with exact silences and spend nothing', async () => {
  const list = (await api('/api/meditations')).data;
  const m = list.find((x) => x.libraryId === 'five-minute-kindness');
  assert.ok(m.elevenTakes, 'library meditation knows its takes');
  assert.equal(m.elevenTakes.matches, true, `changed: ${m.elevenTakes.changed}`);
  assert.equal(m.elevenTakes.sections.length, TAKES.meditations['five-minute-kindness'].sections.length);
  assert.equal(m.elevenTakes.voiceName, 'Julian');

  // Pick the second take for the first section.
  await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { takePicks: [1] } });
  const ttsBefore = eleven.calls.filter((c) => c.text).length;
  const historyBefore = eleven.calls.filter((c) => c.history).length;
  const { data } = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'clone', from: 'takes' } });
  const done = await waitJob(data.job.id);
  assert.equal(done.status, 'done', done.error);
  const r = done.result;
  assert.equal(r.fromTakes, true);
  assert.equal(r.charsSpent, 0);
  assert.deepEqual(r.notes, [], 'every pause found');
  assert.equal(eleven.calls.filter((c) => c.text).length, ttsBefore, 'nothing voiced again');
  const fetched = eleven.calls.slice(historyBefore).filter((c) => c.history).map((c) => c.history);
  const sections = TAKES.meditations['five-minute-kindness'].sections;
  assert.equal(fetched.length, sections.length);
  assert.equal(fetched[0], sections[0].takes[1].historyItemId, 'the picked take is used');
  assert.equal(fetched[1], sections[1].takes[0].historyItemId);

  // Length: the takes' speech, plus every script silence at its exact length.
  const script = (await api(`/api/meditations/${m.id}`)).data.script;
  const scriptSilence = [...script.matchAll(/\[\[silence (\d+)s\]\]/g)].reduce((t, x) => t + Number(x[1]), 0);
  const speech = sections.reduce((t, s) => t + takeShape(s.text).filter((p) => p.tone || p.quiet < 1).reduce((a, p) => a + (p.tone || p.quiet), 0), 0);
  const settings = (await api('/api/settings')).data;
  const sectionGaps = sections.length * settings.paragraphGapSeconds; // none of its sections ends on a silence
  const expected = settings.preRollSeconds + speech + scriptSilence + sectionGaps + 2.5 + 9 + settings.tailSeconds;
  assert.ok(Math.abs(r.seconds - expected) < 4, `${r.seconds}s, expected about ${Math.round(expected)}s`);
  assert.ok(r.timeline.length >= 10, 'a timeline entry for each paragraph');
  const snip = await api(`/api/meditations/${m.id}/snippet`, { method: 'POST', body: { source: 'clone' } });
  assert.equal(snip.status, 200, JSON.stringify(snip.data));

  // Once the script changes, the takes no longer fit and the studio says so.
  await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { script: script.replace('This is five minutes for you.', 'These five minutes are yours.') } });
  const changed = (await api(`/api/meditations/${m.id}`)).data.elevenTakes;
  assert.equal(changed.matches, false);
  assert.deepEqual(changed.changed, ['Arriving']);
  const refused = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'clone', from: 'takes' } });
  assert.equal(refused.status, 409);
});

test('a library made before Julian became the default voice moves to it once', async () => {
  const dbFile = path.join(storage, 'db.json');
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  assert.ok(db.migrations.includes('julian-default-voice'));
  db.migrations = db.migrations.filter((k) => k !== 'julian-default-voice');
  db.settings.voiceId = '3crtmEFfp6bvumTLLI8m';
  const [old, picked] = db.meditations;
  old.voiceId = '3crtmEFfp6bvumTLLI8m';
  picked.voiceId = 'gLJTspXK9wkK9QS9NW8H';
  fs.writeFileSync(dbFile, JSON.stringify(db));
  const later = Date.now() / 1000 + 5;
  fs.utimesSync(dbFile, later, later);
  assert.equal((await api('/api/settings')).data.voiceId, 'KYXOMmyAOr8VFco83i7K');
  assert.equal((await api(`/api/meditations/${old.id}`)).data.voiceId, 'KYXOMmyAOr8VFco83i7K');
  assert.equal((await api(`/api/meditations/${old.id}`)).data.voiceName, 'Julian');
  assert.equal((await api(`/api/meditations/${picked.id}`)).data.voiceId, 'gLJTspXK9wkK9QS9NW8H', 'a voice Julian chose is kept');
  // Choosing the old voice again afterwards sticks.
  await api('/api/settings', { method: 'PUT', body: { voiceId: '3crtmEFfp6bvumTLLI8m' } });
  assert.equal((await api('/api/settings')).data.voiceId, '3crtmEFfp6bvumTLLI8m');
  await api('/api/settings', { method: 'PUT', body: { voiceId: 'KYXOMmyAOr8VFco83i7K' } });
});

test('keys are saved but never echoed back', async () => {
  const r = await api('/api/keys', { method: 'POST', body: { elevenlabs: 'test-eleven' } });
  assert.equal(r.data.elevenlabs, 'set, ending even');
  assert.ok(!JSON.stringify(r.data).includes('test-eleven'));
});
