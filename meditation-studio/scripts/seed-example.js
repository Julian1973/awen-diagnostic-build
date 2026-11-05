// Adds one finished example script to the library so the studio has something to open.
// Run with: npm run seed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../lib/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, 'example-five-breaths.txt'), 'utf8');
const signOff = 'Take a breath with me and then be love and give love. Have a wonderful day, one breath at a time.';

if (store.listMeditations().some((m) => m.title.startsWith('Five Breaths Before the Day Begins'))) {
  console.log('The example is already in the library.');
} else {
  const m = store.createMeditation({
    formatId: 'morning-five-breaths',
    brand: 'living-awake',
    pillar: 3,
    minutes: 8,
    theme: 'for people who wake up already gripping the day',
    status: 'draft',
    voiceId: store.getSettings().voiceId,
    title: 'Five Breaths Before the Day Begins: 8 Minutes',
    spotifyTitle: 'Morning Meditation: Five Breaths to Start the Day Calm',
    subtitle: 'A short morning practice for putting the wheel down',
    insightTimerDescription: `A gentle eight minute morning practice for anyone who wakes up already gripping the day. Five conscious breaths, one ordinary thing to be glad of, and one simple practice to carry with you.\n\nUse it first thing, sitting up in bed or in a chair by the window, before you look at your phone. It works best as a daily habit, so come back to it tomorrow morning and the morning after.\n\n${signOff}`,
    spotifyDescription: `Five conscious breaths to start the day before the day starts you. A short morning practice for anyone who wakes up already gripping the wheel.\n\n${signOff}`,
    tags: ['morning', 'breathing', 'calm', 'daily practice', 'stress', 'beginners', 'five breaths', 'anxiety'],
    coverImagePrompt: 'Still water at first light on a Welsh shore, seen from low down at the edge of the water. The sky is deep midnight navy fading to a thin band of aged gold light along the horizon, with a faint mist lifting off the surface. Calm, empty space fills the upper centre of the square; the shoreline and a few dark, rounded stones sit low in the frame. Fine film grain, soft and atmospheric, colour held to navy and aged gold, no bright colours. No text, no people, no symbols.',
    coverAltText: 'Still water at first light on a Welsh shore, a thin band of gold on the horizon under a deep navy sky.',
    trailerLine: 'Before the day gets its hands on you, take five breaths.',
    snippetStart: "Let's begin. Breathe in through your nose... and",
    notesForJulian: 'Example written by hand to the Living Awake rules. Check by ear: the counted breaths in the Practice section, and whether [slowly] on breath five drags.',
    script,
  });
  console.log(`Added "${m.title}" (${m.id}).`);
}
