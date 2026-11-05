// A small JSON file store. One file, written atomically, fine for hundreds of meditations.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { paths, DEFAULT_SETTINGS, ensureDirs } from './config.js';

const EMPTY = { meditations: [], research: [], settings: {} };
let state = null;

function load() {
  if (state) return state;
  ensureDirs();
  if (fs.existsSync(paths.db)) {
    state = { ...EMPTY, ...JSON.parse(fs.readFileSync(paths.db, 'utf8')) };
  } else {
    state = structuredClone(EMPTY);
  }
  return state;
}

function save() {
  const tmp = `${paths.db}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, paths.db);
}

export function newId() {
  return crypto.randomBytes(6).toString('hex');
}

export function getSettings() {
  const s = load().settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    disclosure: { ...DEFAULT_SETTINGS.disclosure, ...(s.disclosure || {}) },
  };
}

export function updateSettings(patch) {
  const db = load();
  const current = getSettings();
  db.settings = {
    ...current,
    ...patch,
    disclosure: { ...current.disclosure, ...(patch.disclosure || {}) },
  };
  save();
  return getSettings();
}

export function listMeditations() {
  return [...load().meditations].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getMeditation(id) {
  return load().meditations.find((m) => m.id === id) || null;
}

export function createMeditation(fields) {
  const db = load();
  const now = new Date().toISOString();
  const m = {
    id: newId(),
    status: 'idea',
    createdAt: now,
    updatedAt: now,
    takes: {},          // paragraph hash -> chosen take number
    performance: [],    // logged stats
    ...fields,
  };
  db.meditations.push(m);
  save();
  return m;
}

export function updateMeditation(id, patch) {
  const db = load();
  const i = db.meditations.findIndex((m) => m.id === id);
  if (i < 0) return null;
  db.meditations[i] = { ...db.meditations[i], ...patch, updatedAt: new Date().toISOString() };
  save();
  return db.meditations[i];
}

export function deleteMeditation(id) {
  const db = load();
  const before = db.meditations.length;
  db.meditations = db.meditations.filter((m) => m.id !== id);
  save();
  return db.meditations.length < before;
}

export function addResearch(entry) {
  const db = load();
  const r = { id: newId(), createdAt: new Date().toISOString(), ...entry };
  db.research.unshift(r);
  db.research = db.research.slice(0, 20);
  save();
  return r;
}

export function listResearch() {
  return load().research;
}

// For tests.
export function _reset() {
  state = null;
}
