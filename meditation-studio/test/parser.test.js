import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, parseDuration, buildPlan, pasteTest, transcript, splitLongText, scriptStats } from '../lib/script-parser.js';

const SCRIPT = `## Opening
[softly] Let yourself arrive.
Feel the chair.

[[silence 20s]]

Breathe in... and out.

[[silence 1m30s]]
## Close
[warmly] Thank you.`;

test('parses notes, paragraphs and silences in order', () => {
  const b = parseScript(SCRIPT);
  assert.deepEqual(b.map((x) => x.type), ['note', 'speech', 'silence', 'speech', 'silence', 'note', 'speech']);
  assert.equal(b[1].text, '[softly] Let yourself arrive. Feel the chair.');
  assert.equal(b[2].seconds, 20);
  assert.equal(b[4].seconds, 90);
});

test('reads silence lengths', () => {
  assert.equal(parseDuration('20s'), 20);
  assert.equal(parseDuration('2m'), 120);
  assert.equal(parseDuration('1m30s'), 90);
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration('soon'), null);
});

test('plan never sends notes or silence markers to ElevenLabs and adds the delivery prefix', () => {
  const plan = buildPlan(SCRIPT, { voiceId: 'v', model: 'eleven_v4', deliveryPrefix: '[softly]', paragraphGapSeconds: 1 });
  const speech = plan.filter((p) => p.type === 'speech');
  assert.equal(speech.length, 3);
  for (const p of speech) {
    assert.ok(!p.text.includes('##'));
    assert.ok(!p.text.includes('[['));
  }
  assert.equal(speech[1].text, '[softly] Breathe in... and out.');
  assert.equal(speech[0].text.startsWith('[softly] Let'), true, 'existing tag is not doubled');
  assert.equal(plan.filter((p) => p.type === 'silence' && !p.explicit).length, 0, 'no automatic gap next to an explicit silence');
});

test('a new take changes the hash but not the paragraph key', () => {
  const a = buildPlan('Hello there.', { voiceId: 'v', model: 'm' })[0];
  const b = buildPlan('Hello there.', { voiceId: 'v', model: 'm', takes: { [a.key]: 2 } })[0];
  assert.equal(a.key, b.key);
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.textKey, b.textKey);
});

test('recording key ignores voice and prefix', () => {
  const a = buildPlan('Hello there.', { voiceId: 'v1', model: 'eleven_v4', deliveryPrefix: '[softly]' })[0];
  const b = buildPlan('Hello there.', { voiceId: 'v2', model: 'eleven_v3', deliveryPrefix: '' })[0];
  assert.equal(a.textKey, b.textKey);
  assert.notEqual(a.hash, b.hash);
});

test('paste test catches what would be read aloud', () => {
  const issues = pasteTest('NARRATOR: hello\n(smiles) Breathe.\n*slowly* now\n[[silence forever]]\n[[pause 3]]\n- a bullet\n[softly breathe');
  const lines = issues.map((i) => i.line);
  assert.deepEqual([...new Set(lines)].sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pasteTest(SCRIPT), []);
});

test('transcript strips tags, notes and silences', () => {
  assert.equal(transcript(SCRIPT), 'Let yourself arrive. Feel the chair.\n\nBreathe in... and out.\n\nThank you.');
});

test('long paragraphs split at sentence ends under the limit', () => {
  const long = 'This is a sentence that goes on. '.repeat(200);
  const parts = splitLongText(long, 1000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 1000));
  assert.ok(parts.every((p) => p.endsWith('.')));
});

test('stats count words, characters and early silence', () => {
  const s = scriptStats(SCRIPT, { wordsPerMinute: 120, paragraphGapSeconds: 1, deliveryPrefix: '[softly]' });
  assert.equal(s.words, 12);
  assert.equal(s.requests, 3);
  assert.ok(s.earlySilenceSeconds >= 20);
});
