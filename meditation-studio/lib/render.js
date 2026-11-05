// Voices a meditation (Julian's clone on ElevenLabs, or Julian's own recordings) and builds the finished MP3.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';
import { buildPlan, pasteTest, spokenWords } from './script-parser.js';
import { textToSpeech } from './elevenlabs.js';
import * as audio from './audio.js';
import { pool } from './jobs.js';

export function planFor(m, settings) {
  return buildPlan(m.script || '', {
    voiceId: m.voiceId || settings.voiceId,
    model: m.ttsModel || settings.ttsModel,
    outputFormat: settings.outputFormat,
    deliveryPrefix: m.deliveryPrefix ?? settings.deliveryPrefix,
    paragraphGapSeconds: settings.paragraphGapSeconds,
    voiceSettings: m.voiceSettings || null,
    takes: m.takes || {},
  });
}

export const cacheFile = (hash) => path.join(paths.cache, `${hash}.mp3`);

export function recordingFile(meditationId, textKey) {
  const dir = path.join(paths.recordings, meditationId);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((n) => n.startsWith(`${textKey}.`));
  return f ? path.join(dir, f) : null;
}

export function recordingStatus(m, settings) {
  const plan = planFor(m, settings).filter((p) => p.type === 'speech');
  const recorded = plan.filter((p) => recordingFile(m.id, p.textKey)).length;
  return { recorded, total: plan.length, complete: plan.length > 0 && recorded === plan.length };
}

export function cloneStatus(m, settings) {
  const plan = planFor(m, settings).filter((p) => p.type === 'speech');
  const cached = plan.filter((p) => fs.existsSync(cacheFile(p.hash)));
  const toVoice = plan.filter((p) => !fs.existsSync(cacheFile(p.hash)));
  return {
    voiced: cached.length,
    total: plan.length,
    charsToSpend: toVoice.reduce((n, p) => n + p.chars, 0),
    requestsToMake: toVoice.length,
  };
}

// Voices one paragraph through ElevenLabs, using the cache unless `fresh` asks for it again.
export async function voiceParagraph(item, { fresh = false } = {}) {
  const file = cacheFile(item.hash);
  if (!fresh && fs.existsSync(file)) return { file, spent: 0 };
  const { audio: bytes } = await textToSpeech({
    text: item.text,
    voiceId: item.voiceId,
    model: item.model,
    outputFormat: item.outputFormat,
    voiceSettings: item.voiceSettings,
  });
  fs.writeFileSync(file, bytes);
  return { file, spent: item.chars };
}

function planWithRequestFields(m, settings) {
  const voiceId = m.voiceId || settings.voiceId;
  const model = m.ttsModel || settings.ttsModel;
  return planFor(m, settings).map((p) => (p.type === 'speech'
    ? { ...p, voiceId, model, outputFormat: settings.outputFormat, voiceSettings: m.voiceSettings || null }
    : p));
}

export async function renderMeditation(m, settings, { source = 'clone', format, update = () => {} }) {
  const blocking = pasteTest(m.script).filter((i) => i.severity === 'block');
  if (blocking.length) throw new Error(`Fix the script first. Line ${blocking[0].line}: ${blocking[0].message}`);
  const plan = planWithRequestFields(m, settings);
  const speech = plan.filter((p) => p.type === 'speech');
  if (!speech.length) throw new Error('The script has nothing to say yet.');

  const workDir = path.join(paths.work, `${m.id}-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const outDir = path.join(paths.renders, m.id);
  fs.mkdirSync(outDir, { recursive: true });
  let spent = 0;

  try {
    // 1. Get every paragraph's audio.
    const sourceFiles = new Map();
    if (source === 'recorded') {
      const missing = speech.filter((p) => !recordingFile(m.id, p.textKey));
      if (missing.length) {
        throw new Error(`Record mode needs every paragraph in your own voice. ${missing.length} of ${speech.length} still to record (first one starts "${missing[0].spoken.slice(0, 60)}").`);
      }
      speech.forEach((p) => sourceFiles.set(p.hash, recordingFile(m.id, p.textKey)));
    } else {
      let done = 0;
      update({ total: speech.length, done: 0, message: `Voicing ${speech.length} paragraphs in ${m.voiceName || 'Julian'}'s voice` });
      await pool(speech, 2, async (p) => {
        const r = await voiceParagraph(p);
        spent += r.spent;
        sourceFiles.set(p.hash, r.file);
        done += 1;
        update({ done, message: `Voiced ${done} of ${speech.length} paragraphs` });
      });
    }

    // 2. Decode everything to one sample format and lay out the timeline.
    update({ message: 'Laying out silences and paragraphs' });
    const isSleep = format?.ending === 'sleep';
    const parts = [];
    let n = 0;
    const silence = async (s) => {
      const f = path.join(workDir, `p${String(n++).padStart(4, '0')}-sil.wav`);
      parts.push(await audio.silenceWav(s, f));
    };
    await silence(settings.preRollSeconds);
    let speechSeconds = 0;
    for (const p of plan) {
      if (p.type === 'silence') {
        await silence(p.seconds);
      } else {
        const f = path.join(workDir, `p${String(n++).padStart(4, '0')}-say.wav`);
        await audio.toWav(sourceFiles.get(p.hash), f, { cleanRecording: source === 'recorded' });
        speechSeconds += audio.wavSeconds(f);
        parts.push(f);
      }
    }
    if (!isSleep && settings.bell) {
      await silence(2.5);
      const bell = path.join(workDir, `p${String(n++).padStart(4, '0')}-bell.wav`);
      const customBell = settings.bellFile && fs.existsSync(path.join(paths.beds, settings.bellFile)) ? path.join(paths.beds, settings.bellFile) : null;
      parts.push(customBell ? await audio.toWav(customBell, bell) : await audio.bellWav(bell));
    }
    await silence(isSleep ? settings.sleepTailSeconds : settings.tailSeconds);

    const voiceWav = path.join(workDir, 'voice.wav');
    await audio.concatWavs(parts, voiceWav, workDir);

    // 3. Music bed, loudness and the MP3.
    update({ message: 'Mixing the music bed and setting loudness' });
    const bedPath = m.bedFile && fs.existsSync(path.join(paths.beds, m.bedFile)) ? path.join(paths.beds, m.bedFile) : null;
    const outName = `${source}.mp3`;
    const outMp3 = path.join(outDir, outName);
    const result = await audio.master({
      voiceWav,
      bedPath,
      bedVolumeDb: m.bedVolumeDb ?? settings.bedVolumeDb,
      loudness: settings.loudnessTarget,
      truePeak: settings.truePeak,
      bitrate: settings.mp3Bitrate,
      meta: {
        title: m.title,
        artist: 'Julian Jenkins',
        album: m.brand === 'living-connection' ? 'The Living Connection' : 'Living Awake',
        genre: 'Meditation',
        date: String(new Date().getFullYear()),
      },
      outMp3,
      workDir,
    });

    const words = speech.reduce((t, p) => t + spokenWords(p.spoken).length, 0);
    const measuredWpm = speechSeconds > 0 ? Math.round(words / (speechSeconds / 60)) : null;
    return {
      source,
      file: path.relative(paths.renders, outMp3),
      seconds: Math.round(result.seconds),
      integratedLufs: result.integratedLufs,
      truePeak: result.truePeak,
      charsSpent: spent,
      paragraphs: speech.length,
      measuredWpm,
      bed: bedPath ? m.bedFile : null,
      renderedAt: new Date().toISOString(),
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
