// Meditation Studio: local server for the dashboard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import multer from 'multer';
import { PUBLIC_DIR, DATA_DIR, STORAGE_DIR, paths, ensureDirs, readEnvKeys, maskKey, saveEnvKey, JULIAN_VOICES } from './lib/config.js';
import { existsAnywhere, ensureLocal, listNames, placeholderFor } from './lib/icloud.js';
import * as store from './lib/store.js';
import { BRANDS, PILLARS, brandCheck, brandSummary } from './lib/brand.js';
import { scriptStats, pasteTest, transcript } from './lib/script-parser.js';
import { writeScript, reviseScript, trendScan, lengthTargets } from './lib/script-writer.js';
import * as eleven from './lib/elevenlabs.js';
import { renderMeditation, planFor, cacheFile, recordingFile, recordingStatus, cloneStatus, voiceParagraph } from './lib/render.js';
import { startJob, getJob, listJobs, activeJobFor } from './lib/jobs.js';
import { checkFfmpeg } from './lib/audio.js';
import { pickSnippet, makeSnippet, makeTrailer, SNIPPET_SECONDS } from './lib/trailer.js';
import { BED_PRESETS } from './lib/beds.js';
import { insightTimerDescription } from './lib/brand.js';

ensureDirs();
// A write that was running when the server stopped will never finish; put it back to where it was.
for (const m of store.listMeditations()) {
  if (m.status === 'writing') store.updateMeditation(m.id, { status: m.script ? 'draft' : 'idea' });
}
const PORT = Number(process.env.PORT) || 4100;
const app = express();

// The studio runs in the background on Julian's Macs, so other websites open in the same browser
// must not be able to reach it: only localhost names are served (stops DNS rebinding), and every
// change needs a header that a cross site form or image cannot send.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
app.use((req, res, next) => {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) return res.status(403).send('Meditation Studio only answers on localhost.');
  if (req.path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && req.get('x-studio') !== '1') {
    return res.status(403).json({ error: 'Blocked: requests must come from the studio dashboard.' });
  }
  next();
});
app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/fonts', express.static(path.join(path.dirname(DATA_DIR), 'assets', 'fonts')));

// Which Macs have the studio open. Each writes a heartbeat into the shared library folder.
function macName() {
  if (process.platform === 'darwin') {
    const r = spawnSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return os.hostname().replace(/\.local$/, '');
}
const THIS_MAC = process.env.STUDIO_MAC_NAME || macName();
const presenceDir = path.join(STORAGE_DIR, 'presence');
const presenceFile = path.join(presenceDir, `${THIS_MAC.replace(/[^A-Za-z0-9]+/g, '-')}.json`);
function heartbeat() {
  try {
    fs.mkdirSync(presenceDir, { recursive: true });
    fs.writeFileSync(presenceFile, JSON.stringify({ name: THIS_MAC, lastSeen: new Date().toISOString(), pid: process.pid }));
  } catch {
    // the shared folder may be offline for a moment
  }
}
function otherMacs() {
  const now = Date.now();
  return listNames(presenceDir)
    .map((n) => path.join(presenceDir, n))
    .filter((f) => f !== presenceFile && fs.existsSync(f))
    .map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } })
    .filter((p) => p && now - Date.parse(p.lastSeen) < 3 * 60 * 1000)
    .map((p) => p.name);
}

const catalogue = () => JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'formats.json'), 'utf8'));
const formatById = (id) => catalogue().formats.find((f) => f.id === id) || null;

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err.message || String(err) });
  }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

function safeName(name) {
  return path.basename(String(name)).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120);
}

function ensureMeditation(id) {
  const m = store.getMeditation(id);
  if (!m) throw fail(404, 'Meditation not found');
  return m;
}

// The line Insight Timer asks for when a track has music: title and artist of the bed.
function musicCreditFor(m, bedName) {
  const name = bedName ?? m.bedFile;
  if (!name) return '';
  const meta = store.getBedMeta(name);
  if (meta?.credit === '') return '';
  return meta?.credit || `Music: ${meta?.title || name.replace(/\.[a-z0-9]+$/i, '')}`;
}

function withDerived(m, { full = false } = {}) {
  const settings = store.getSettings();
  const format = formatById(m.formatId);
  const checks = brandCheck(m, format, { musicCredit: musicCreditFor(m) });
  const stats = scriptStats(m.script || '', {
    ...settings,
    voiceId: m.voiceId || settings.voiceId,
    model: m.ttsModel || settings.ttsModel,
    // Non sleep tracks also carry 2.5 s of space and a 9 s bell before the tail.
    tailSeconds: format?.ending === 'sleep' ? settings.sleepTailSeconds : settings.tailSeconds + (settings.bell ? 11.5 : 0),
  });
  const out = {
    ...m,
    formatName: format?.name || m.formatId,
    ending: format?.ending || 'bell',
    brandName: BRANDS[m.brand]?.name || 'Living Awake',
    stats,
    brand: m.brand,
    brandSummary: brandSummary(checks),
    recording: recordingStatus(m, settings),
    clone: cloneStatus(m, settings),
    job: activeJobFor(m.id),
  };
  if (full) {
    out.checks = checks;
    out.pasteIssues = pasteTest(m.script || '');
    out.targets = format ? lengthTargets(format, Number(m.minutes) || format.defaultMinutes, settings) : null;
  }
  return out;
}

// ---------- status, catalogue, settings ----------

app.get('/api/ping', (req, res) => res.json({ ok: true, mac: THIS_MAC }));

app.get('/api/status', wrap(async (req, res) => {
  const keys = readEnvKeys();
  res.json({
    claude: maskKey(keys.anthropic),
    elevenlabs: maskKey(keys.elevenlabs),
    ffmpeg: await checkFfmpeg(),
    thisMac: THIS_MAC,
    otherMacs: otherMacs(),
    library: STORAGE_DIR,
    sharedLibrary: STORAGE_DIR.includes('Mobile Documents/com~apple~CloudDocs'),
  });
}));

// Used by the Mac installer before an update, and by the Stop button in Settings.
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    try { fs.rmSync(presenceFile, { force: true }); } catch { /* ignore */ }
    process.exit(0);
  }, 200);
});

app.get('/api/formats', (req, res) => res.json(catalogue()));
app.get('/api/brands', (req, res) => res.json({ brands: BRANDS, pillars: PILLARS }));

app.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.put('/api/settings', wrap(async (req, res) => {
  const allowed = ['voiceId', 'ttsModel', 'outputFormat', 'deliveryPrefix', 'paragraphGapSeconds', 'preRollSeconds', 'tailSeconds', 'sleepTailSeconds', 'bedVolumeDb', 'loudnessTarget', 'truePeak', 'mp3Bitrate', 'bell', 'bellFile', 'wordsPerMinute', 'claudeModel', 'claudeEffort', 'useFallbacks', 'weeklyTarget', 'disclosure', 'defaultBed', 'musicModel'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  res.json(store.updateSettings(patch));
}));

app.post('/api/keys', wrap(async (req, res) => {
  const { anthropic, elevenlabs } = req.body || {};
  if (anthropic) saveEnvKey('ANTHROPIC_API_KEY', anthropic);
  if (elevenlabs) saveEnvKey('ELEVENLABS_API_KEY', elevenlabs);
  const keys = readEnvKeys();
  res.json({ claude: maskKey(keys.anthropic), elevenlabs: maskKey(keys.elevenlabs) });
}));

// ---------- ElevenLabs ----------

app.get('/api/voices', wrap(async (req, res) => {
  if (!readEnvKeys().elevenlabs) return res.json({ voices: JULIAN_VOICES, offline: true });
  const voices = await eleven.listVoices();
  const julianIds = new Set(JULIAN_VOICES.map((v) => v.voice_id));
  voices.sort((a, b) => Number(julianIds.has(b.voice_id)) - Number(julianIds.has(a.voice_id)) || a.name.localeCompare(b.name));
  res.json({ voices, offline: false });
}));

app.get('/api/subscription', wrap(async (req, res) => {
  if (!readEnvKeys().elevenlabs) return res.json(null);
  res.json(await eleven.getSubscription());
}));

// ---------- meditations ----------

app.get('/api/meditations', (req, res) => res.json(store.listMeditations().map((m) => withDerived(m))));

app.get('/api/meditations/:id', wrap(async (req, res) => res.json(withDerived(ensureMeditation(req.params.id), { full: true }))));

function startWriteJob(m, input) {
  const format = formatById(m.formatId);
  if (!format) throw fail(400, 'Unknown format');
  store.updateMeditation(m.id, { status: 'writing', writeError: null });
  return startJob('write', { meditationId: m.id }, async (update) => {
    update({ message: 'Claude is writing the script' });
    try {
      const { data, model } = input.instruction
        ? await reviseScript(store.getMeditation(m.id), input.instruction, format, store.getSettings())
        : await writeScript({ ...m, ...input }, format, store.getSettings());
      store.updateMeditation(m.id, { ...data, status: 'draft', writtenBy: model, writtenAt: new Date().toISOString() });
      return { ok: true };
    } catch (err) {
      store.updateMeditation(m.id, { status: store.getMeditation(m.id)?.script ? 'draft' : 'idea', writeError: err.message });
      throw err;
    }
  });
}

app.post('/api/meditations', wrap(async (req, res) => {
  const b = req.body || {};
  const format = formatById(b.formatId);
  if (!format) throw fail(400, 'Choose a format');
  const settings = store.getSettings();
  const m = store.createMeditation({
    formatId: format.id,
    brand: b.brand || format.brand,
    pillar: b.pillar ? Number(b.pillar) : null,
    minutes: Number(b.minutes) || format.defaultMinutes,
    theme: b.theme || '',
    audience: b.audience || '',
    notes: b.notes || '',
    demand: b.demand || '',
    day: b.day ? Number(b.day) : null,
    seriesName: b.seriesName || '',
    seriesLength: b.seriesLength ? Number(b.seriesLength) : null,
    title: b.title || '',
    script: b.script || '',
    voiceId: settings.voiceId,
    bedFile: settings.defaultBed || null,
    status: b.script ? 'draft' : 'idea',
  });
  const job = b.write ? startWriteJob(m, {}) : null;
  res.json({ meditation: withDerived(store.getMeditation(m.id)), job });
}));

app.put('/api/meditations/:id', wrap(async (req, res) => {
  ensureMeditation(req.params.id);
  const allowed = ['title', 'spotifyTitle', 'subtitle', 'insightTimerDescription', 'spotifyDescription', 'tags', 'script', 'notesForJulian', 'coverImagePrompt', 'coverAltText', 'trailerLine', 'snippetStart', 'brand', 'pillar', 'minutes', 'theme', 'audience', 'notes', 'voiceId', 'voiceName', 'ttsModel', 'deliveryPrefix', 'bedFile', 'bedVolumeDb', 'status', 'published', 'formatId'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (typeof patch.tags === 'string') patch.tags = patch.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (patch.script !== undefined && ensureMeditation(req.params.id).status === 'idea' && patch.script.trim()) patch.status = 'draft';
  res.json(withDerived(store.updateMeditation(req.params.id, patch), { full: true }));
}));

app.delete('/api/meditations/:id', wrap(async (req, res) => {
  ensureMeditation(req.params.id);
  store.deleteMeditation(req.params.id);
  fs.rmSync(path.join(paths.renders, req.params.id), { recursive: true, force: true });
  fs.rmSync(path.join(paths.recordings, req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

app.post('/api/meditations/:id/write', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  if (activeJobFor(m.id, 'write')) throw fail(409, 'Already writing');
  res.json({ job: startWriteJob(m, {}) });
}));

app.post('/api/meditations/:id/revise', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const instruction = String(req.body?.instruction || '').trim();
  if (!instruction) throw fail(400, 'Say what to change');
  if (!m.script) throw fail(400, 'There is no draft to revise yet');
  if (activeJobFor(m.id, 'write')) throw fail(409, 'Already writing');
  res.json({ job: startWriteJob(m, { instruction }) });
}));

app.post('/api/meditations/:id/render', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const source = req.body?.source === 'recorded' ? 'recorded' : 'clone';
  if (activeJobFor(m.id, 'render')) throw fail(409, 'Already rendering');
  const job = startJob('render', { meditationId: m.id, source }, async (update) => {
    const settings = store.getSettings();
    const result = await renderMeditation(store.getMeditation(m.id), settings, { source, format: formatById(m.formatId), update });
    const current = store.getMeditation(m.id);
    store.updateMeditation(m.id, {
      renders: { ...(current.renders || {}), [source]: result },
      status: current.status === 'published' ? 'published' : 'voiced',
    });
    // Learn Julian's real pace so length estimates get closer each time.
    if (result.measuredWpm && result.measuredWpm > 60 && result.measuredWpm < 200) {
      store.updateSettings({ wordsPerMinute: Math.round((settings.wordsPerMinute + result.measuredWpm) / 2) });
    }
    return result;
  });
  res.json({ job });
}));

function recordingVersionUrl(id, textKey) {
  const file = recordingFile(id, textKey);
  if (!file) return null;
  const stamp = fs.existsSync(file) ? fs.statSync(file).mtimeMs : fs.statSync(placeholderFor(file)).mtimeMs;
  return `/api/meditations/${id}/recordings/${textKey}?t=${Math.round(stamp)}`;
}

// The paragraph list for Voice Studio and Record mode.
app.get('/api/meditations/:id/plan', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const settings = store.getSettings();
  const plan = planFor(m, settings).map((p, i) => (p.type === 'speech'
    ? {
      i, type: p.type, text: p.text, spoken: p.spoken, key: p.key, take: p.take, textKey: p.textKey, chars: p.chars, line: p.line,
      cloneUrl: existsAnywhere(cacheFile(p.hash)) ? `/api/cache/${p.hash}.mp3` : null,
      recordingUrl: recordingVersionUrl(m.id, p.textKey),
    }
    : { i, type: p.type, seconds: p.seconds, explicit: p.explicit }));
  res.json({ plan });
}));

// Voice one paragraph now (preview, or a fresh take of a line Julian did not like).
app.post('/api/meditations/:id/paragraphs/:key/voice', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const settings = store.getSettings();
  const newTake = !!req.body?.newTake;
  let takes = { ...(m.takes || {}) };
  if (newTake) takes[req.params.key] = (takes[req.params.key] || 1) + 1;
  const plan = planFor({ ...m, takes }, settings);
  const item = plan.find((p) => p.type === 'speech' && p.key === req.params.key);
  if (!item) throw fail(404, 'That paragraph has changed. Reload the plan.');
  const r = await voiceParagraph({ ...item, voiceId: m.voiceId || settings.voiceId, model: m.ttsModel || settings.ttsModel, outputFormat: settings.outputFormat, voiceSettings: m.voiceSettings || null });
  if (newTake) store.updateMeditation(m.id, { takes });
  res.json({ url: `/api/cache/${item.hash}.mp3`, take: item.take, spent: r.spent });
}));

app.get('/api/cache/:file', wrap(async (req, res) => {
  const name = safeName(req.params.file);
  const file = path.join(paths.cache, name);
  if (!/^[a-f0-9]+\.mp3$/.test(name) || !(await ensureLocal(file))) throw fail(404, 'Not found');
  res.type('audio/mpeg').sendFile(file);
}));

// ---------- Record mode: Julian's own voice ----------

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };

app.post('/api/meditations/:id/recordings/:textKey', memoryUpload.single('audio'), wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  if (!/^[a-f0-9]{24}$/.test(req.params.textKey)) throw fail(400, 'Bad paragraph key');
  if (!req.file) throw fail(400, 'No audio received');
  const ext = EXT[(req.file.mimetype || '').split(';')[0]] || path.extname(req.file.originalname || '').slice(1) || 'webm';
  const dir = path.join(paths.recordings, m.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${req.params.textKey}.`) || f.startsWith(`.${req.params.textKey}.`)) fs.rmSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, `${req.params.textKey}.${ext}`), req.file.buffer);
  res.json({ ok: true, recording: recordingStatus(m, store.getSettings()) });
}));

app.get('/api/meditations/:id/recordings/:textKey', wrap(async (req, res) => {
  const file = recordingFile(ensureMeditation(req.params.id).id, safeName(req.params.textKey));
  if (!file || !(await ensureLocal(file))) throw fail(404, 'Not recorded yet');
  res.sendFile(file);
}));

app.delete('/api/meditations/:id/recordings/:textKey', wrap(async (req, res) => {
  const file = recordingFile(ensureMeditation(req.params.id).id, safeName(req.params.textKey));
  if (file) {
    fs.rmSync(file, { force: true });
    fs.rmSync(placeholderFor(file), { force: true });
  }
  res.json({ ok: true });
}));

// ---------- finished audio and publishing packs ----------

// Finished files: the full mix, the 30 second snippet and the trailer video, for each voice route.
const RENDER_FILES = {
  clone: { file: 'clone.mp3', type: 'audio/mpeg', suffix: ' (voice clone).mp3' },
  recorded: { file: 'recorded.mp3', type: 'audio/mpeg', suffix: '.mp3' },
  'snippet-clone': { file: 'snippet-clone.mp3', type: 'audio/mpeg', suffix: ' snippet (voice clone).mp3' },
  'snippet-recorded': { file: 'snippet-recorded.mp3', type: 'audio/mpeg', suffix: ' snippet.mp3' },
  'trailer-clone': { file: 'trailer-clone.mp4', type: 'video/mp4', suffix: ' trailer (voice clone).mp4' },
  'trailer-recorded': { file: 'trailer-recorded.mp4', type: 'video/mp4', suffix: ' trailer.mp4' },
};

app.get('/api/renders/:id/:source', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const kind = RENDER_FILES[req.params.source] || RENDER_FILES.clone;
  const file = path.join(paths.renders, m.id, kind.file);
  if (!(await ensureLocal(file))) throw fail(404, 'Not made yet');
  if (req.query.download) {
    const base = (m.title || 'meditation').replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, ' ') || 'meditation';
    return res.download(file, `${base}${kind.suffix}`);
  }
  res.type(kind.type).sendFile(file);
}));

const sourceOf = (v) => (v === 'recorded' ? 'recorded' : 'clone');

async function buildSnippet(m, source, textKey) {
  const render = m.renders?.[source];
  if (!render) throw fail(409, source === 'recorded' ? 'Mix your recorded version first.' : 'Voice and mix the meditation first.');
  if (!render.timeline?.length) throw fail(409, 'Mix the meditation again so the studio knows where each paragraph falls, then make the snippet.');
  const pick = pickSnippet(render, { textKey, snippetStart: m.snippetStart });
  const full = path.join(paths.renders, m.id, `${source}.mp3`);
  await ensureLocal(full);
  const out = path.join(paths.renders, m.id, `snippet-${source}.mp3`);
  await makeSnippet(full, pick.start, out);
  const snippet = { ...pick, seconds: SNIPPET_SECONDS, madeAt: new Date().toISOString() };
  const current = store.getMeditation(m.id);
  store.updateMeditation(m.id, { renders: { ...current.renders, [source]: { ...current.renders[source], snippet } } });
  return snippet;
}

app.post('/api/meditations/:id/snippet', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const snippet = await buildSnippet(m, sourceOf(req.body?.source), req.body?.textKey || null);
  res.json({ snippet, url: `/api/renders/${m.id}/snippet-${sourceOf(req.body?.source)}?v=${Date.parse(snippet.madeAt)}` });
}));

const cardUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/meditations/:id/trailer', cardUpload.single('card'), wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const source = sourceOf(req.body?.source);
  if (!req.file) throw fail(400, 'No card image received');
  if (activeJobFor(m.id, 'trailer')) throw fail(409, 'Already making the trailer');
  const workDir = path.join(paths.work, `trailer-${m.id}-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const cardFile = path.join(workDir, 'card-upload.png');
  fs.writeFileSync(cardFile, req.file.buffer);
  const job = startJob('trailer', { meditationId: m.id, source }, async (update) => {
    try {
      let snippet = store.getMeditation(m.id).renders?.[source]?.snippet;
      if (!snippet) {
        update({ message: 'Choosing the best 30 seconds' });
        snippet = await buildSnippet(store.getMeditation(m.id), source, null);
      }
      update({ message: 'Making the 30 second trailer video' });
      const out = path.join(paths.renders, m.id, `trailer-${source}.mp4`);
      const result = await makeTrailer({ cardFile, audioFile: path.join(paths.renders, m.id, `snippet-${source}.mp3`), outMp4: out, workDir });
      const current = store.getMeditation(m.id);
      const trailer = { seconds: Math.round(result.seconds), width: result.width, height: result.height, snippetStart: snippet.start, madeAt: new Date().toISOString() };
      store.updateMeditation(m.id, { renders: { ...current.renders, [source]: { ...current.renders[source], trailer } } });
      return trailer;
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
  res.json({ job });
}));

function mmss(s) {
  const t = Math.round(s || 0);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function pack(m, platform) {
  const settings = store.getSettings();
  const format = formatById(m.formatId);
  const isIT = platform === 'insight-timer';
  const render = isIT ? m.renders?.recorded : (m.renders?.recorded || m.renders?.clone);
  const credit = render?.bed ? musicCreditFor(m, render.bed) : '';
  const checks = brandCheck(m, format, { musicCredit: credit });
  // A title that promises a length should match the finished track.
  const promised = String(isIT ? m.title : m.spotifyTitle || '').match(/(\d+)\s*Minutes?\b/i);
  if (promised && render && Math.abs(Number(promised[1]) * 60 - render.seconds) > 90) {
    checks.push({ rule: 'Length in title', severity: 'flag', message: `The title says ${promised[1]} minutes but the track runs ${mmss(render.seconds)}. Change the title or the script.` });
  }
  const blocks = checks.filter((c) => c.severity === 'block');
  const flags = checks.filter((c) => c.severity === 'flag');
  if (isIT && !m.renders?.recorded) {
    throw fail(409, 'Insight Timer requires narration performed by a real human voice; voice clones and text to speech are not permitted. Record this meditation in Record mode first, then the Insight Timer pack unlocks.');
  }
  if (!render) throw fail(409, 'Render the audio first.');
  const lines = [];
  const title = isIT ? m.title : (m.spotifyTitle || m.title);
  let description = isIT ? insightTimerDescription(m, credit) : `${m.spotifyDescription || ''}${credit ? `\n\n${credit}` : ''}`;
  if (!isIT && settings.disclosure?.spotify && render.source === 'clone' && settings.disclosure.text) description = `${description}\n\n${settings.disclosure.text}`;
  lines.push(isIT ? 'INSIGHT TIMER UPLOAD PACK' : 'SPOTIFY UPLOAD PACK', '');
  lines.push(`Title: ${title || ''}`);
  if (m.subtitle) lines.push(`Subtitle: ${m.subtitle}`);
  lines.push(`Length: ${mmss(render.seconds)}`);
  lines.push(`Format: ${format?.name || m.formatId}${format?.ending === 'sleep' ? ' (sleep track, no ending bell)' : ' (ending bell included)'}`);
  lines.push(`Voice: ${render.source === 'recorded' ? "Julian's own recorded voice" : "Julian's ElevenLabs voice clone (eleven_v4)"}`);
  lines.push(`Audio: MP3, ${settings.mp3Bitrate.replace('k', ' kbps')} CBR, 44.1 kHz stereo, ${render.integratedLufs ?? settings.loudnessTarget} LUFS, true peak ${render.truePeak ?? settings.truePeak} dBTP`);
  lines.push('', `Description${isIT ? ` (${description.length} of 1000 characters)` : ''}:`, description || '', '');
  lines.push(`Tags: ${(m.tags || []).join(', ')}`, '');
  const snip = render.snippet;
  if (isIT) {
    lines.push(snip
      ? `30 second snippet: in the Teacher Dashboard choose Edit, then Pick a Snippet, and drag the slider to start at ${mmss(snip.start)} ("${snip.words}..."). Preview file: snippet MP3 in the Publish tab.`
      : '30 second snippet: make it in the Publish tab first, then set the slider to the start time it gives you.');
    if (render.trailer) lines.push(`Course trailer video: MP4, portrait 1080 x 1920, ${render.trailer.seconds} seconds (Insight Timer asks for 20 to 30, 10 to 45 allowed).`);
    lines.push('');
  }
  lines.push('Cover image description (for the image generator):', m.coverImagePrompt || '(none yet: ask Claude to revise and add one)', '');
  if (m.coverAltText) lines.push(`Cover alt text: ${m.coverAltText}`, '');
  lines.push('Before you upload:');
  if (isIT) {
    lines.push('[ ] Cover image square, at least 1600 x 1600 px, under 20 MB, made from the description above, ideally with no text on it');
    lines.push('[ ] Mark the track as a guided meditation and pick the category that matches the format');
    lines.push('[ ] Listen through once. Check the first two minutes closely (a play counts after 120 seconds)');
    lines.push('[ ] Add it to a playlist or series so listeners have somewhere to go next (helps return rate)');
  } else {
    lines.push('[ ] Choose podcast episode (Spotify for Creators) or music release (through a distributor)');
    lines.push('[ ] One long track. Never split a meditation into short tracks (Spotify treats that as spam)');
    if (render.source === 'clone') lines.push('[ ] Music release: declare the cloned voice in the distributor\'s AI credits field (DDEX AI disclosure)');
    lines.push('[ ] Cover image, square, at least 1400 x 1400 px for podcasts, 3000 x 3000 px for music');
  }
  lines.push('');
  if (blocks.length) lines.push('BRAND CHECK, MUST FIX:', ...blocks.map((c) => `  ${c.rule}: ${c.message}`), '');
  if (flags.length) lines.push('Brand check, for your eyes:', ...flags.map((c) => `  ${c.rule}: ${c.message}`), '');
  lines.push('Transcript:', '', transcript(m.script));
  return lines.join('\n');
}

app.get('/api/meditations/:id/pack/:platform', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const text = pack(m, req.params.platform === 'insight-timer' ? 'insight-timer' : 'spotify');
  if (req.query.download) res.attachment(`${(m.title || 'meditation').replace(/[^A-Za-z0-9 ]/g, '').trim()} ${req.params.platform}.txt`);
  res.type('text/plain').send(text);
}));

app.get('/api/meditations/:id/script.txt', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  res.attachment(`${(m.title || 'script').replace(/[^A-Za-z0-9 ]/g, '').trim()} script.txt`).type('text/plain').send(m.script || '');
}));

// ---------- performance ----------

app.post('/api/meditations/:id/performance', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  const b = req.body || {};
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const entry = {
    id: store.newId(),
    date: b.date || new Date().toISOString().slice(0, 10),
    platform: b.platform || 'Insight Timer',
    plays: num(b.plays),
    payablePlays: num(b.payablePlays),
    returnRate: num(b.returnRate),
    donations: num(b.donations),
    notes: b.notes || '',
  };
  res.json(withDerived(store.updateMeditation(m.id, { performance: [...(m.performance || []), entry] }), { full: true }));
}));

app.delete('/api/meditations/:id/performance/:pid', wrap(async (req, res) => {
  const m = ensureMeditation(req.params.id);
  res.json(withDerived(store.updateMeditation(m.id, { performance: (m.performance || []).filter((p) => p.id !== req.params.pid) }), { full: true }));
}));

function latestPlays(m) {
  // Plays are cumulative on both platforms, so take the latest figure per platform.
  const byPlatform = {};
  for (const p of m.performance || []) {
    if (p.plays == null) continue;
    if (!byPlatform[p.platform] || p.date >= byPlatform[p.platform].date) byPlatform[p.platform] = p;
  }
  return Object.values(byPlatform).reduce((n, p) => n + p.plays, 0);
}

function isoWeekStart(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return x.toISOString().slice(0, 10);
}

app.get('/api/overview', wrap(async (req, res) => {
  const list = store.listMeditations().map((m) => withDerived(m));
  const settings = store.getSettings();
  const counts = { idea: 0, writing: 0, draft: 0, voiced: 0, published: 0 };
  for (const m of list) counts[m.status] = (counts[m.status] || 0) + 1;
  const weekStart = isoWeekStart();
  const thisWeek = list.filter((m) => m.status !== 'idea' && (m.createdAt || '').slice(0, 10) >= weekStart).length;
  const byFormat = {};
  for (const m of list) {
    const plays = latestPlays(m);
    if (!plays) continue;
    byFormat[m.formatName] = byFormat[m.formatName] || { format: m.formatName, plays: 0, tracks: 0 };
    byFormat[m.formatName].plays += plays;
    byFormat[m.formatName].tracks += 1;
  }
  res.json({
    counts,
    ready: list.filter((m) => m.status === 'voiced' && m.brandSummary.ok).length,
    thisWeek,
    weeklyTarget: settings.weeklyTarget,
    playsLogged: list.reduce((n, m) => n + latestPlays(m), 0),
    playsByFormat: Object.values(byFormat).sort((a, b) => b.plays - a.plays),
    recent: list.slice(0, 6),
    jobs: listJobs().filter((j) => j.status === 'running'),
  });
}));

// ---------- music beds ----------

const bedUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, paths.beds),
    filename: (req, file, cb) => cb(null, safeName(file.originalname)),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
});

app.get('/api/beds', (req, res) => {
  const meta = store.allBedMeta();
  const beds = listNames(paths.beds).filter((f) => !f.endsWith('.tmp')).map((f) => {
    const real = path.join(paths.beds, f);
    const m = meta[f] || {};
    return {
      name: f,
      title: m.title || f.replace(/\.[a-z0-9]+$/i, ''),
      credit: m.credit ?? `Music: ${m.title || f.replace(/\.[a-z0-9]+$/i, '')}`,
      source: m.source || 'upload',
      prompt: m.prompt || '',
      bytes: fs.existsSync(real) ? fs.statSync(real).size : null,
      inCloud: !fs.existsSync(real),
    };
  });
  res.json({ beds, presets: BED_PRESETS });
});
app.post('/api/beds', bedUpload.single('file'), (req, res) => {
  if (req.file) store.setBedMeta(req.file.filename, { source: 'upload', addedAt: new Date().toISOString() });
  res.json({ ok: true, name: req.file?.filename });
});
app.put('/api/beds/:name', wrap(async (req, res) => {
  const name = safeName(req.params.name);
  const patch = {};
  if (typeof req.body?.title === 'string') patch.title = req.body.title.slice(0, 80);
  if (typeof req.body?.credit === 'string') patch.credit = req.body.credit.slice(0, 160);
  res.json(store.setBedMeta(name, patch));
}));

// Makes a new calm bed with ElevenLabs Music and adds it to the library.
app.post('/api/beds/generate', wrap(async (req, res) => {
  const preset = BED_PRESETS.find((p) => p.id === req.body?.preset);
  const prompt = String(req.body?.prompt || preset?.prompt || '').trim();
  if (!prompt) throw fail(400, 'Choose a bed or describe the sound');
  const title = String(req.body?.title || preset?.title || 'Meditation bed').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 60) || 'Meditation bed';
  const seconds = Math.min(300, Math.max(30, Number(req.body?.seconds) || 180));
  const job = startJob('bed', {}, async (update) => {
    update({ message: `ElevenLabs Music is composing "${title}" (${Math.round(seconds / 60)} min). This takes a minute or two.` });
    const audio = await eleven.composeMusic({ prompt, seconds, modelId: store.getSettings().musicModel || undefined });
    let name = `${title}.mp3`;
    for (let i = 2; fs.existsSync(path.join(paths.beds, name)); i += 1) name = `${title} ${i}.mp3`;
    fs.writeFileSync(path.join(paths.beds, name), audio);
    store.setBedMeta(name, { title: name.replace(/\.mp3$/, ''), credit: `Music: ${name.replace(/\.mp3$/, '')}`, source: 'elevenlabs-music', prompt, seconds, addedAt: new Date().toISOString() });
    return { name };
  });
  res.json({ job });
}));

// The Living Awake logo (Celtic cross PNG) for trailer cards.
const BRAND_DIR = path.join(STORAGE_DIR, 'brand');
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/brand/logo', logoUpload.single('logo'), wrap(async (req, res) => {
  if (!req.file || !/^image\/(png|webp)$/.test(req.file.mimetype)) throw fail(400, 'Upload a PNG (a transparent background works best)');
  fs.mkdirSync(BRAND_DIR, { recursive: true });
  fs.writeFileSync(path.join(BRAND_DIR, 'logo.png'), req.file.buffer);
  res.json({ ok: true });
}));
app.get('/api/brand/logo', wrap(async (req, res) => {
  const file = path.join(BRAND_DIR, 'logo.png');
  if (!(await ensureLocal(file))) throw fail(404, 'No logo yet');
  res.type('image/png').sendFile(file);
}));
app.delete('/api/brand/logo', wrap(async (req, res) => {
  fs.rmSync(path.join(BRAND_DIR, 'logo.png'), { force: true });
  res.json({ ok: true });
}));
app.get('/api/beds/:name', wrap(async (req, res) => {
  const file = path.join(paths.beds, safeName(req.params.name));
  if (!(await ensureLocal(file))) throw fail(404, 'Not found');
  res.sendFile(file);
}));
app.delete('/api/beds/:name', wrap(async (req, res) => {
  const file = path.join(paths.beds, safeName(req.params.name));
  fs.rmSync(file, { force: true });
  fs.rmSync(placeholderFor(file), { force: true });
  store.deleteBedMeta(safeName(req.params.name));
  res.json({ ok: true });
}));

// ---------- trend research ----------

app.get('/api/research', (req, res) => res.json(store.listResearch()));
app.post('/api/research', wrap(async (req, res) => {
  const focus = String(req.body?.focus || '').slice(0, 300);
  const job = startJob('research', {}, async (update) => {
    update({ message: 'Claude is searching Insight Timer and Spotify' });
    const result = await trendScan(catalogue().formats, store.getSettings(), focus);
    return store.addResearch({ focus, ...result });
  });
  res.json({ job });
}));

// ---------- jobs ----------

app.get('/api/jobs/:id', wrap(async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw fail(404, 'Job not found (the server may have restarted)');
  res.json(job);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const HOST = process.env.HOST || '127.0.0.1';
export function startHeartbeat() {
  heartbeat();
  setInterval(heartbeat, 60 * 1000).unref();
}
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    startHeartbeat();
    console.log(`Meditation Studio is running on ${THIS_MAC}: http://localhost:${PORT}`);
    console.log(`Library: ${STORAGE_DIR}`);
  });
}

export default app;
