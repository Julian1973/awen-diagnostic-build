import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandCheck, brandSummary, BRANDS } from '../lib/brand.js';

const LA = BRANDS['living-awake'];
const base = {
  brand: 'living-awake',
  pillar: 3,
  title: 'Back to Solid Ground',
  insightTimerDescription: `For a hard day, when the mind runs ahead and the body forgets the ground under it. Ten quiet minutes to come back.\n\nUse it whenever you need it, and come back tomorrow.\n\n${LA.signOff}`,
  script: `[softly] Notice your feet.\n\nCome back to this tomorrow.\n\n${LA.spokenSignOff}`,
};
const bellFormat = { ending: 'bell' };
const sleepFormat = { ending: 'sleep' };
const rule = (results, name) => results.find((r) => r.rule === name);

test('a clean Living Awake meditation passes', () => {
  const r = brandCheck(base, bellFormat);
  assert.equal(brandSummary(r).blocks, 0, JSON.stringify(r.filter((x) => x.severity !== 'pass')));
});

test('dashes are blocked', () => {
  for (const bad of ['Breathe — slowly', 'Breathe – slowly', 'Breathe - slowly']) {
    assert.equal(rule(brandCheck({ ...base, script: `${base.script}\n${bad}` }, bellFormat), 'No dashes').severity, 'block', bad);
  }
  assert.equal(rule(brandCheck({ ...base, script: `${base.script}\nself-compassion` }, bellFormat), 'No dashes').severity, 'pass');
});

test('Living Awake bans medium and chakra; The Living Connection allows them', () => {
  const s = `${base.script}\nFeel the heart chakra open, as a medium would.`;
  assert.equal(rule(brandCheck({ ...base, script: s }, bellFormat), 'Vocabulary').severity, 'block');
  const lc = { ...base, brand: 'living-connection', script: `${s}\n${BRANDS['living-connection'].spokenSignOff}`, insightTimerDescription: BRANDS['living-connection'].signOff };
  assert.equal(rule(brandCheck(lc, bellFormat), 'Vocabulary').severity, 'pass');
  assert.equal(rule(brandCheck({ ...lc, script: `${lc.script} Raise your vibration.` }, bellFormat), 'Vocabulary').severity, 'block');
});

test('the brand wall keeps AI and business words out', () => {
  assert.equal(rule(brandCheck({ ...base, spotifyDescription: 'Voiced with ElevenLabs AI' }, bellFormat), 'Brand wall').severity, 'block');
  assert.equal(rule(brandCheck({ ...base, script: `${base.script} Gain clarity like Awen Intelligence clients.` }, bellFormat), 'Brand wall').severity, 'block');
  assert.equal(rule(brandCheck({ ...base, script: `${base.script} The rain is plain.` }, bellFormat), 'Brand wall').severity, 'pass');
});

test('sleep tracks need the sign-off written, not spoken', () => {
  const sleepy = { ...base, script: '[softly] Drift now.' };
  assert.equal(rule(brandCheck(sleepy, sleepFormat), 'Sign-off').severity, 'pass');
  assert.equal(rule(brandCheck({ ...sleepy, insightTimerDescription: 'No sign-off' }, sleepFormat), 'Sign-off').severity, 'block');
  assert.equal(rule(brandCheck(sleepy, bellFormat), 'Sign-off').severity, 'block');
});

test('pillar is required for Living Awake only', () => {
  assert.equal(rule(brandCheck({ ...base, pillar: null }, bellFormat), 'Pillar').severity, 'block');
  assert.equal(rule(brandCheck({ ...base, brand: 'living-connection', pillar: null }, bellFormat), 'Pillar'), undefined);
});

test('American spellings and Insight Timer title words are flagged', () => {
  const r = brandCheck({ ...base, title: 'Morning Guided Meditation', script: `${base.script} Find your center.` }, bellFormat);
  assert.equal(rule(r, 'British English').severity, 'flag');
  assert.equal(rule(r, 'Insight Timer title').severity, 'flag');
});

test('Insight Timer descriptions: 200 to 1000 characters, no links, no emojis, music credit counted', () => {
  assert.equal(rule(brandCheck({ ...base, insightTimerDescription: `Short.\n\n${LA.signOff}` }, bellFormat), 'Insight Timer description').severity, 'block');
  assert.equal(rule(brandCheck(base, bellFormat), 'Insight Timer description').severity, 'pass');
  const long = `${'Breathe and rest. '.repeat(52)}\n\n${LA.signOff}`;
  assert.equal(rule(brandCheck({ ...base, insightTimerDescription: long }, bellFormat), 'Insight Timer description').severity, 'block');
  const nearly = `${'Breathe and rest. '.repeat(48)}${LA.signOff}`;
  assert.equal(rule(brandCheck({ ...base, insightTimerDescription: nearly }, bellFormat), 'Insight Timer description').severity, 'pass');
  assert.equal(rule(brandCheck({ ...base, insightTimerDescription: nearly }, bellFormat, { musicCredit: 'Music: Still Water, a long credit line for this bed' }), 'Insight Timer description').severity, 'block');
  assert.equal(rule(brandCheck({ ...base, insightTimerDescription: `${base.insightTimerDescription} Lesson One at julianjenkins.me` }, bellFormat), 'No links').severity, 'block');
  assert.equal(rule(brandCheck({ ...base, title: 'Back to Solid Ground 🌙' }, bellFormat), 'No emojis').severity, 'block');
});
