# Meditation Studio

Julian's studio for making meditations. You pick one of the formats that win on Insight Timer and Spotify, and Claude drafts an original script in your voice and to your brand rules. You shape the script. Then you voice it, either with your ElevenLabs clone on **eleven_v4** or by reading it yourself in Record mode. The studio mixes the finished MP3: exact silences, music bed, bell and loudness. Then you take the upload pack and log the plays to see what lands.

Everything runs on your own computer. Your keys and audio never leave it, except for the calls to Claude and ElevenLabs.

## One thing to know first: Insight Timer needs your real voice

Insight Timer's teacher policy says the main voice must be a real human voice. It bans AI narration, voice cloning, text to speech and voice conversion, for both lead and supporting narration. AI help with scripts is allowed. AI music is allowed under a human voice. Every upload is reviewed, and anything that breaks the rule is rejected. ([policy](https://insight-timer.freshdesk.com/support/solutions/articles/67000723124-can-teachers-use-artificial-intelligence-ai-on-their-insight-timer-offerings-), [video guidelines](https://insight-timer.freshdesk.com/support/solutions/articles/67000750966-video-guidelines-for-teachers))

So the studio gives every meditation two routes:

| Route | Voice | Use it for |
|---|---|---|
| **Voice (clone)** | Your ElevenLabs voice on eleven_v4 | Spotify, YouTube, julianjenkins.me, and a pace guide to read along to |
| **Record (your voice)** | You, reading each paragraph into the mic in the dashboard | **Insight Timer**, and anywhere you want your live voice |

The Insight Timer upload pack stays locked until every paragraph has been recorded in your own voice.

On Spotify, the impersonation rules target the *unauthorised* use of someone else's voice. Spotify labels AI personas and asks music releases to declare AI in the credits. A clone of your own voice is self-authorised, but Spotify has no explicit rule on own-voice clones. The Spotify pack reminds you to declare the clone in the distributor's AI credits field if you release as music. Settings has an optional disclosure line for Spotify descriptions. It is off by default because the brand wall keeps AI out of Side A copy. That decision is yours.

## Start it

You need [Node.js 20 or newer](https://nodejs.org). The audio engine (ffmpeg) installs with the app.

```bash
cd meditation-studio
npm install
npm run seed     # optional: adds the example "Five Breaths Before the Day Begins"
npm start
```

Open **http://localhost:4100**. Go to **Settings** and paste your two keys:

- **Claude API key**: from [platform.claude.com](https://platform.claude.com). It writes the scripts and runs the trend scan.
- **ElevenLabs API key**: from [elevenlabs.io → Settings → API keys](https://elevenlabs.io/app/settings/api-keys). It needs Text to Speech, Voices (read) and User (read).

The keys are saved to `meditation-studio/.env`. Git ignores that file, and the dashboard never shows the keys again.

## How a meditation gets made

1. **Formats & trends.** There are fifteen formats built from the research. Each one shows its evidence, beats, length and title shapes. The yoga nidra for sleep format, for example, is modelled on the most played track on Insight Timer: 22 minutes and about 23.5M plays. **Run a live trend scan** to have Claude search Insight Timer, Spotify and the podcast charts now and suggest ideas inside your pillars.
2. **Create.** Pick a format, brand, pillar, length and angle, then press **Write it with Claude**. The model is Claude Opus 5.5 with adaptive thinking at high effort, and structured output, so the title, descriptions, tags and script come back in separate fields.
3. **Script.** Edit freely; it saves as you type. The side panel shows:
   - an estimated length against the target, and how much silence falls in the first two minutes (a play counts after 120 seconds)
   - the ElevenLabs characters it will cost
   - the brand check
   - anything ElevenLabs would read aloud by mistake

   **Ask Claude to revise** with plain notes.
4. **Voice (clone).** Pick the voice and model, and a music bed if you want one. You can voice any single paragraph to hear it, and ask for a **new take** if it isn't right. When you're happy, press **Voice and mix the whole meditation**. Voiced paragraphs are cached, so changing one line only re-voices that line.
5. **Record (your voice).** Read one paragraph at a time. **R** or the space bar starts and stops recording, and it moves on to the next paragraph by itself. You never sit through a silence; the studio adds silences, gaps, bed, bell and loudness. Press **Hear pace guide** to play the clone's take of a paragraph first. Then **Mix my recorded version**.
6. **Publish.** Upload packs for Insight Timer and Spotify: title, description, tags, length, audio spec, a checklist and a transcript. Download the MP3 and save the live links.
7. **Performance.** Log the running totals from your Insight Timer teacher dashboard and Spotify for Creators: plays, payable plays, return rate and donations. The overview and Performance pages show which formats bring people in.

## The script format

```
## Opening                      a note to you. Never spoken.
[softly] Good morning...        spoken. Square brackets are eleven_v4 audio tags.
                                a blank line starts a new paragraph (voiced as its own take, 1.2 s gap)
[[silence 20s]]                 exact silence. Also 90s, 2m, 1m30s.
```

- A tag lasts until the next tag, but only inside its own paragraph. A paragraph that doesn't open with a tag gets the **delivery tags** from the Voice tab, `[softly]` by default.
- eleven_v4 has no speed slider. The pace comes from `[slowly]`, `[pause]`, `[long pause]` and ellipses.
- No parentheses, asterisks, braces, bullets or speaker labels. The paste test blocks the render if any are found.

## Brand rules the checker enforces

These come from your brand-guardian, living-awake-engine and spiritual-content skills (identity profiles, 27 Sep 2026). If a project file disagrees, the project file wins.

- **No dashes** anywhere: em dashes, en dashes and spaced hyphens are all blocked.
- **Living Awake**: never "medium", "chakra", "third eye", vibrations, ascension, manifesting, abundance, high vibe, light language, or love and light. Every piece sits in one of the four pillars.
- **The Living Connection**: mediumship, spirit and chakra language is correct here. New age vocabulary is still out.
- **Sign-offs.**
  - Living Awake: "Take a breath with me and then be love and give love. Have a wonderful day, one breath at a time." It is spoken at the close and written in the description.
  - The Living Connection: spoken as "Be love. Give love." and written as "Be love. Give love. Julian x".
  - **Sleep tracks** carry the sign-off in the description only, so the listener isn't woken at the end.
- **Brand wall**: nothing about AI, ElevenLabs, Claude, Awen, consulting or Crystal Bears reaches a listener.
- **British spelling**, a gentle **invitation to return tomorrow** (return rate is the biggest Insight Timer bonus), and **Insight Timer titles** without category words or your name.

## Audio settings

All of these can be changed in Settings.

| | Default | Why |
|---|---|---|
| Loudness | -16 LUFS integrated, -1.5 dBTP | Spotify plays music at -14 and limits at -1. -16 suits both platforms. |
| MP3 | 192 kbps CBR, 44.1 kHz stereo | Insight Timer premium and course audio need 192 kbps or more. |
| Ending bell | On for daytime tracks, never on sleep | Insight Timer recommends a bell but doesn't add one. A soft built-in bell is provided; upload your own and choose **Use as bell**. |
| Lead in / tail | 4 s / 20 s after the bell / 90 s on sleep tracks | |
| Music bed | -22 dB under the voice, looped, faded in and out | Upload ambience or tracks from the Wyth album. |

Insight Timer covers must be at least 1600 x 1600 px. The packs remind you of this.

## Costs

- **ElevenLabs** charges by character. The Script tab shows the count before you voice anything (the example costs about 2,800). Re-mixing and re-rendering unchanged paragraphs costs nothing.
- **Claude**: one script is one Opus 5.5 request. The trend scan uses up to eight web searches.

## Your voices

These are the voices found in your ElevenLabs workspace on 5 Nov 2026. The default is **Julian - Meditation Voice**.

| Voice | ID | Note |
|---|---|---|
| Julian - Meditation Voice | `3crtmEFfp6bvumTLLI8m` | Your own clone for guided meditations |
| Julian - Meditation Voice A | `gLJTspXK9wkK9QS9NW8H` | Guiding register only |
| Julian | `KYXOMmyAOr8VFco83i7K` | Professional clone, narration and meditation |

## For developers

```bash
npm test        # 26 tests: parser, brand checker, and the whole flow end to end
npm run dev     # restarts the server when files change
```

The tests run Claude and ElevenLabs against stand-in servers (`test/mocks.js`), so they need no keys and spend no credits. Data lives in `storage/` (git ignored): `db.json`, the paragraph cache, recordings, beds and renders.

| File | What it does |
|---|---|
| `server.js` | Every API route |
| `lib/script-writer.js` | Claude prompts, the script schema and the trend scan |
| `lib/script-parser.js` | Script format, the plan of takes and silences, estimates and the paste test |
| `lib/brand.js` | Brand rules and the checker |
| `lib/elevenlabs.js` | ElevenLabs REST calls |
| `lib/render.js` | Voicing (clone or recordings) and assembly |
| `lib/audio.js` | ffmpeg: silence, bell, join, bed mix, two-pass loudness and the MP3 |
| `data/formats.json` | The format catalogue and its sources |
| `public/` | The dashboard (plain JavaScript, no build step) |
