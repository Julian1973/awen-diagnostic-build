// The takes voiced in ElevenLabs must match the library scripts word for word, and the mix must find
// the script's pauses inside each take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sectionsOf, placePauses, expectedPauseTimes } from '../lib/takes.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const TAKES = JSON.parse(read('../data/elevenlabs-takes.json'));
const LIBRARY = JSON.parse(read('../scripts/library/library.json'));

test('every library meditation has two takes per section, in the Julian voice on eleven_v4', () => {
  assert.equal(TAKES.voice.voiceId, 'KYXOMmyAOr8VFco83i7K');
  assert.equal(TAKES.voice.model, 'eleven_v4');
  assert.deepEqual(Object.keys(TAKES.meditations).sort(), LIBRARY.map((m) => m.libraryId).sort());
  const ids = new Set();
  for (const [id, m] of Object.entries(TAKES.meditations)) {
    assert.match(m.flowUrl, /^https:\/\/elevenlabs\.io\/app\/flows\/[A-Za-z0-9]+$/, id);
    for (const s of m.sections) {
      assert.equal(s.takes.length, 2, `${id} / ${s.name}`);
      for (const t of s.takes) {
        assert.ok(t.historyItemId && !ids.has(t.historyItemId), `${id} / ${s.name}: unique history id`);
        ids.add(t.historyItemId);
        assert.ok(t.seconds > 3, `${id} / ${s.name}: ${t.seconds}s`);
      }
    }
  }
  assert.equal(ids.size, 76);
});

test('the takes were made from exactly what the scripts say', () => {
  for (const item of LIBRARY) {
    const sections = sectionsOf(read(`../scripts/library/${item.libraryId}.txt`));
    const made = TAKES.meditations[item.libraryId].sections;
    assert.deepEqual(sections.map((s) => s.name), made.map((s) => s.name), item.libraryId);
    sections.forEach((s, i) => assert.equal(s.text, made[i].text, `${item.libraryId} / ${s.name}`));
  }
});

test('sections keep each silence: inside the take, or after it', () => {
  const sections = sectionsOf(read('../scripts/library/letting-go.txt'));
  const held = sections.find((s) => s.name === 'Finding where it is held');
  assert.deepEqual(held.pauses, [10, 15]);
  assert.equal(held.after, 20);
  assert.equal(held.pieces.length, 3);
  assert.match(held.text, /\[long pause\]\n\nNow notice where you feel it/);
  const space = sections.find((s) => s.name === 'The space that is left');
  assert.deepEqual(space.pauses, [20, 40]);
  assert.match(space.text, /\[long pause\] \[long pause\]/);
  const sleep = sectionsOf(read('../scripts/library/long-sleep-journey.txt'));
  assert.equal(sleep[sleep.length - 1].after, 420, 'the last long silence follows the final words');
  const total = (script) => [...script.matchAll(/\[\[silence (\d+)s\]\]/g)].reduce((t, x) => t + Number(x[1]), 0);
  for (const item of LIBRARY) {
    const script = read(`../scripts/library/${item.libraryId}.txt`);
    const kept = sectionsOf(script).reduce((t, s) => t + s.before + s.after + s.pauses.reduce((a, b) => a + b, 0), 0);
    assert.equal(kept, total(script), `${item.libraryId}: no silence lost`);
  }
});

test('pauses go to the long quiet stretches near where the words put them', () => {
  const gaps = [{ start: 1, end: 1.6 }, { start: 4.5, end: 6.8 }, { start: 8, end: 8.7 }, { start: 11.2, end: 13.6 }, { start: 15, end: 15.6 }];
  assert.deepEqual(placePauses([5.5, 12.4], gaps), [1, 3]);
  // Order is kept even when the expected times are rough.
  assert.deepEqual(placePauses([3, 9], gaps), [1, 3]);
  // Fewer quiet stretches than pauses: the ones it cannot place come back as null.
  assert.deepEqual(placePauses([5, 12, 20], [{ start: 4.5, end: 6.8 }, { start: 11.2, end: 13.6 }]), [0, 1, null]);
  assert.deepEqual(placePauses([], gaps), []);
});

test('expected pause times follow the words before each pause', () => {
  const section = { pieces: ['one two three four five six', 'one two three'], pauses: [10] };
  const [t] = expectedPauseTimes(section, 20, [{ start: 9, end: 11 }]);
  assert.ok(t > 9 && t < 14, String(t));
});
