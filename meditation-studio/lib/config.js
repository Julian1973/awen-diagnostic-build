// Paths, environment and the settings Julian can change from the dashboard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const ENV_FILE = process.env.STUDIO_ENV_FILE || path.join(ROOT, '.env');

dotenv.config({ path: ENV_FILE, quiet: true });

export const STORAGE_DIR = process.env.STUDIO_STORAGE_DIR
  ? path.resolve(process.env.STUDIO_STORAGE_DIR)
  : path.join(ROOT, 'storage');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');

export const paths = {
  db: path.join(STORAGE_DIR, 'db.json'),
  cache: path.join(STORAGE_DIR, 'cache'),       // one MP3 per voiced paragraph, keyed by content hash
  renders: path.join(STORAGE_DIR, 'renders'),   // finished meditations
  beds: path.join(STORAGE_DIR, 'beds'),         // music and ambience beds Julian uploads
  work: path.join(os.tmpdir(), 'meditation-studio-work'), // ffmpeg scratch space, kept on this Mac so iCloud does not sync it
  recordings: path.join(STORAGE_DIR, 'recordings'), // Julian's own read of each paragraph (Record mode)
};

export function ensureDirs() {
  for (const dir of [STORAGE_DIR, ...Object.values(paths).filter((p) => !p.endsWith('.json'))]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Julian's voices in ElevenLabs, as found in his workspace on 5 Nov 2026.
// The dashboard also lists every voice his key can see, so these are defaults, not a limit.
export const JULIAN_VOICES = [
  {
    voice_id: '3crtmEFfp6bvumTLLI8m',
    name: 'Julian - Meditation Voice',
    note: "Julian's own clone for guided meditations. Soft, warm, unhurried Welsh delivery.",
  },
  {
    voice_id: 'gLJTspXK9wkK9QS9NW8H',
    name: 'Julian - Meditation Voice A',
    note: 'Guiding register only. Soft, melodic, unhurried.',
  },
  {
    voice_id: 'KYXOMmyAOr8VFco83i7K',
    name: 'Julian',
    note: 'Professional clone. British (Welsh accent), over 50, narration and meditation.',
  },
];

export const DEFAULT_SETTINGS = {
  voiceId: JULIAN_VOICES[0].voice_id,
  ttsModel: 'eleven_v4',
  outputFormat: 'mp3_44100_128',
  // Tags placed in front of every paragraph that does not open with its own tag,
  // because a tag only holds inside the request it was sent in.
  deliveryPrefix: '[softly]',
  paragraphGapSeconds: 1.2,
  preRollSeconds: 4,
  tailSeconds: 20,
  sleepTailSeconds: 90,
  bedVolumeDb: -22,
  loudnessTarget: -16,        // LUFS integrated. Safe for Insight Timer and Spotify (Spotify plays music at -14).
  truePeak: -1.5,             // dBTP ceiling, under Spotify's -1 dB limiter
  mp3Bitrate: '192k',         // CBR. Insight Timer premium and course audio need 192 kbps or more
  bell: true,                 // ending bell on non-sleep tracks (Insight Timer does not add one)
  wordsPerMinute: 115,        // replaced by Julian's measured pace after the first render
  claudeModel: 'claude-opus-5-5',
  claudeEffort: 'high',
  useFallbacks: true,
  weeklyTarget: 2,
  brandProfiles: false,       // Living Awake / The Living Connection rules from Julian's skills, off unless he turns them on
  cardName: 'Julian Jenkins', // the name at the foot of trailer cards
  // Off by default: a written AI line is a brand wall question for Julian to decide (see README).
  disclosure: {
    spotify: false,
    text: 'Voiced by Julian using a clone of his own voice.',
  },
};

export function readEnvKeys() {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    elevenlabs: process.env.ELEVENLABS_API_KEY || '',
  };
}

export function maskKey(key) {
  if (!key) return null;
  return `set, ending ${key.slice(-4)}`;
}

// Writes or replaces one KEY=value line in .env and updates process.env.
export function saveEnvKey(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name)) throw new Error('Bad key name');
  const clean = String(value).trim().replace(/[\r\n]/g, '');
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const line = `${name}=${clean}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
  process.env[name] = clean;
}

export const ELEVENLABS_BASE_URL = (process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '');
