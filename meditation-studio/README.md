# Meditation Studio

Julian Jenkins's studio for making meditations for Insight Timer and Spotify. It shows which topics and lengths get the most listening, and Claude drafts an original script in your voice, in one of those formats, at the length that gets played. You shape the script. Then you voice it, either with your ElevenLabs clone on **eleven_v4** or by reading it yourself in Record mode. The studio mixes the finished MP3: exact silences, music bed, bell and loudness. Then you take the upload pack and log the plays to see what lands.

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

## Put it on your MacBook and iMac

Each Mac runs its own copy of the studio, and both share one library through **iCloud Drive**. So a script written on the iMac, a paragraph recorded on the MacBook, and every mix show up on both. Each Mac needs its own copy because the browser only allows microphone recording when the studio runs on that same Mac.

Do this once on each Mac. It takes about five minutes.

1. **Download the studio.** Open [the ZIP of this branch](https://github.com/Julian1973/awen-diagnostic-build/archive/refs/heads/claude/ai-meditation-elevenlab-voice-pcduop.zip) while signed in to GitHub (or on the repository page: Code, then Download ZIP). Double click the ZIP in Downloads to unzip it.
2. **Open Terminal.** Press Cmd and Space, type `Terminal`, press Return.
3. **Run the installer.** Type `bash` and a space. Open the unzipped folder, then `meditation-studio`, and drag the file **install-mac.sh** into the Terminal window. Press Return.
   - If this Mac has no Node.js, the installer downloads it from nodejs.org, checks the download, and asks for your Mac password.
   - It copies the studio into place, keeps the library in **iCloud Drive → Meditation Studio**, and makes **Meditation Studio** in your Applications folder.
4. **Meditation Studio opens in your browser.** Go to **Settings** and paste your two keys. Keys stay on each Mac, so you enter them once on the MacBook and once on the iMac.
   - **Claude API key**: from [platform.claude.com](https://platform.claude.com). It writes the scripts and runs the trend scan.
   - **ElevenLabs API key**: from [elevenlabs.io → Settings → API keys](https://elevenlabs.io/app/settings/api-keys). It needs Text to Speech, Voices (read) and User (read).
5. **Keep it handy.** Drag **Meditation Studio** from Applications to your Dock. In Finder, go to iCloud Drive, right click the **Meditation Studio** folder and choose **Keep Downloaded**, so your audio is always on both Macs.

After that, click Meditation Studio in the Dock whenever you want it. It starts in the background and opens in your browser. To stop it, use **Settings → Stop the studio on this Mac** (or just leave it running; it uses next to nothing).

**Using both Macs.** Make changes on one Mac at a time and give iCloud a moment to catch up when you switch. If the other Mac has the studio open, a notice says so on the Overview. Each change is read fresh from the shared library before it is saved, so switching Macs never throws away the other Mac's work. Audio that iCloud has offloaded is downloaded again, never voiced again, so switching Macs costs no ElevenLabs credits.

**Updating.** When there is a new version, download the new ZIP and run the same `bash install-mac.sh` step. Your library and keys are kept.

### Running it by hand (for developers)

You need [Node.js 20 or newer](https://nodejs.org). The audio engine (ffmpeg) installs with the app.

```bash
cd meditation-studio
npm install
npm run seed     # adds the six ready made meditations (see below)
npm start        # http://localhost:4100, library in meditation-studio/storage
```

Keys are saved to `.env` in the app folder. Git ignores that file, and the dashboard never shows the keys again. Set `STUDIO_STORAGE_DIR` in `.env` to keep the library somewhere else.

## How a meditation gets made

1. **Formats & trends.** There are fifteen formats built from the research. Each one shows its evidence, beats, length and title shapes. The yoga nidra for sleep format, for example, is modelled on the most played track on Insight Timer: 22 minutes and about 23.5M plays. **Run a live trend scan** to have Claude search Insight Timer, Spotify and the podcast charts now and suggest ideas inside your pillars.
2. **Create.** Pick a format, length and angle, then press **Write it with Claude**. The model is Claude Opus 5.5 with adaptive thinking at high effort, and structured output, so the title, descriptions, tags and script come back in separate fields.
3. **Script.** Edit freely; it saves as you type. The side panel shows:
   - an estimated length against the target, and how much silence falls in the first two minutes (a play counts after 120 seconds)
   - the ElevenLabs characters it will cost
   - the quality check
   - anything ElevenLabs would read aloud by mistake

   **Ask Claude to revise** with plain notes.
4. **Voice (clone).** Pick the voice and model, and a music bed if you want one. You can voice any single paragraph to hear it, and ask for a **new take** if it isn't right. When you're happy, press **Voice and mix the whole meditation**. Voiced paragraphs are cached, so changing one line only re-voices that line.
5. **Record (your voice).** Read one paragraph at a time. **R** or the space bar starts and stops recording, and it moves on to the next paragraph by itself. You never sit through a silence; the studio adds silences, gaps, bed, bell and loudness. Press **Hear pace guide** to play the clone's take of a paragraph first. Then **Mix my recorded version**.
6. **Publish.** Upload packs for Insight Timer and Spotify: title, description, tags, length, audio spec, a checklist and a transcript. Download the MP3 and save the live links.
7. **Performance.** Log the running totals from your Insight Timer teacher dashboard and Spotify for Creators: plays, payable plays, return rate and donations. The overview and Performance pages show which formats bring people in.

## What gets played on Insight Timer

The **Formats & trends** page shows the research behind every format. It was gathered on 5 Nov 2026 from 26 high-play tracks with verified play counts, 77.65M plays in total.

- **By content:** sleep has 75% of the plays. Yoga nidra for sleep alone has 43%, from three tracks by one teacher at 19:45, 22:21 and 30:16. After sleep come mornings, letting go and self love. Anxiety is searched a lot, but single anxiety tracks stay under 0.5M plays.
- **By length:**
  - **Sleep:** 20 minutes or longer, 93% of sleep plays (median about 26 minutes). A 61-minute deep sleep track has 14.9M plays.
  - **Daytime:** 10 to 15 minutes, 84% of daytime plays (median about 10 minutes). One teacher's 10-minute anxiety practice beat both their 5-minute and 20-minute versions.
- **What to make first:**
  - a 20 to 30 minute yoga nidra for sleep
  - a 45 to 60 minute sleep track with a continuous music bed
  - 10 to 12 minute daytime tracks, led by a morning practice
  - letting go, and a 5-minute kindness practice
  - one 10-minute anxiety track
- **Titles:** put the minutes and the benefit in every title, for example "Set Down What You Carry: 10 Minutes".
- **Range:** over time, cover all six bands of the app's length filter. The Performance page shows which bands you've filled.

The default lengths of the formats follow these findings. Play counts come from search-engine snapshots of Insight Timer track pages, so read them as "at least".

## Insight Timer upload: snippet, trailer, cover, tags and music

The **Publish** tab has everything the upload asks for:

- **30-second snippet.** Insight Timer plays 30 seconds of a track as its preview. You choose them in the Teacher Dashboard (Edit, then Pick a Snippet, then drag the slider). The studio picks the best 30 seconds from your recorded mix and tells you exactly where to set the slider, for example **2:00**. It also gives you the snippet MP3 to check by ear. It uses, in order of preference:
  1. a paragraph you choose
  2. the moment suggested when the script was written
  3. the 30 seconds with the most of your voice
- **Trailer video.** A 30-second portrait MP4 (1080 x 1920) of the snippet over a calm title card: a deep blue gradient, the title, the trailer line, your logo if you upload one, and your name. Insight Timer course trailers are portrait MP4s, ideally 20 to 30 seconds. The same video works for Instagram reels and YouTube Shorts. Upload the logo once in **Settings**.
- **Cover image.** Each script comes with a description for the image generator and alt text. The description asks for a calm, atmospheric scene in a muted, soothing palette, with no text. Covers need to be square, at least 1600 x 1600 px and under 20 MB.
- **Tags and description.** Claude writes 6 to 10 tags. The quality check holds the Insight Timer description to 200 to 1,000 characters (counting the music credit), with no links, website names, emails, handles or emojis, all of which Insight Timer rejects. It also flags a title whose minutes don't match the finished track.
- **Music credit.** Insight Timer asks for music to be credited in the description. Each bed has a credit line, which you can edit in Settings, and the pack adds it automatically.

## Music beds

In **Settings → Music beds**, choose **Make this bed** to have ElevenLabs Music compose a calm, instrumental bed straight into your library. It costs about 2,700 credits for 3 minutes. There are four presets, all with no drums, beat or vocals and an even, soft volume that sits under your voice:

| Bed | For |
|---|---|
| Still Water | Everyday guided meditations: warm pads, sparse felt piano |
| Harp at Dusk | Welsh ground journeys and loving kindness: a few slow harp notes over strings |
| Night Tide | Sleep and yoga nidra: deep, slow drones like a calm tide |
| Morning Light | Morning practices: warm pads, soft chimes |

Short beds loop under long tracks with 8-second crossfades, so a 3-minute bed can carry an hour-long sleep track without an audible join. Insight Timer allows AI music when it supports a human voice. It doesn't allow tracks made only of AI music.

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

## The six ready made meditations

`npm run seed` loads six finished scripts into the studio. They were written from the research on what gets played, and each comes with its titles, descriptions, tags, cover description, alt text, trailer line and snippet moment. All six pass the quality check. Voice or record them and they are ready to upload.

| Meditation | Length | Why this one |
|---|---|---|
| Yoga Nidra to Put the Day Down | 22 min | Yoga nidra for sleep is the most played format on Insight Timer |
| A Long, Slow Way Down to Sleep | 45 min | Long sleep tracks are the next biggest; the music carries the last quarter of an hour |
| Five Breaths Before the Day Begins | 8 min | Mornings are a top search, and a daily habit helps return rate |
| Set Down What You've Been Carrying | 10 min | Letting go is the strongest daytime theme after mornings |
| A Hand on Your Own Heart | 5 min | Short self compassion fills the 0 to 5 minute band |
| Back to Solid Ground | 10 min | Anxiety is heavily searched; 10 minutes beat 5 and 20 |

The lengths are estimates until you voice them. After the first render the studio learns your real pace, and the quality check flags any title whose minutes no longer match.

## The quality check

- **No dashes** anywhere: em dashes, en dashes and spaced hyphens are blocked (your house style).
- **Insight Timer descriptions**: 200 to 1,000 characters including the music credit, with no links, website names, emails, handles or emojis.
- **Insight Timer titles**: no category words (Meditation, Guided, Music) and no teacher name. Any minutes in the title must match the finished track.
- **Listener copy** doesn't mention the tools behind it (AI, ElevenLabs, Claude).
- **British spelling**, **permission language** ("you might find" rather than "you should"), no exclamation marks, and a gentle **invitation to come back tomorrow** on daytime tracks, because return rate is the biggest Insight Timer bonus.
- **The first two minutes**: the Script tab shows how much silence falls before 2:00, because a play only counts after that.

## Brand profiles (optional, off by default)

Settings → Style → Brand profiles turns on the Living Awake and The Living Connection rules from your saved skills (brand-guardian, living-awake-engine, spiritual-content). When they're on, Create offers a brand and pillar, and the check adds that brand's word list, sign-off and pillars. When they're off, meditations are published plainly as Julian Jenkins.

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
npm test        # 36 tests: parser, quality check, library, snippet and trailer, beds, two Macs, and the whole flow end to end
npm run dev     # restarts the server when files change
```

The tests run Claude and ElevenLabs against stand-in servers (`test/mocks.js`), so they need no keys and spend no credits. The library (`db.json`, the paragraph cache, recordings, beds, renders and which Macs are open) lives in `STUDIO_STORAGE_DIR`: `storage/` by default (git ignored), or iCloud Drive after the Mac installer. While the studio runs, changes to its data must carry an `X-Studio: 1` header and come from a localhost host name, so other websites cannot drive it.

| File | What it does |
|---|---|
| `server.js` | Every API route |
| `lib/script-writer.js` | Claude prompts, the script schema and the trend scan |
| `lib/script-parser.js` | Script format, the plan of takes and silences, estimates and the paste test |
| `lib/brand.js` | The quality check and the optional brand profiles |
| `scripts/library/` | The six ready made meditations and their upload details |
| `lib/elevenlabs.js` | ElevenLabs REST calls |
| `lib/render.js` | Voicing (clone or recordings) and assembly |
| `lib/audio.js` | ffmpeg: silence, bell, join, bed mix, two-pass loudness and the MP3 |
| `lib/icloud.js` | Brings back files iCloud Drive has offloaded before they are read |
| `lib/trailer.js` | Picks the 30 second snippet and makes the trailer MP4 |
| `lib/beds.js` | The calm music bed presets for ElevenLabs Music |
| `assets/fonts/` | Cormorant Garamond for the trailer card (SIL Open Font License, `OFL.txt`) |
| `install-mac.sh` | The Mac installer: Node.js, the app, the iCloud library and the Dock app |
| `data/formats.json` | The format catalogue and its sources |
| `public/` | The dashboard (plain JavaScript, no build step) |
