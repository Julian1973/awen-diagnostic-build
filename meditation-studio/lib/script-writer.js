// Claude writes the scripts and runs the live trend scan.
import Anthropic from '@anthropic-ai/sdk';
import { readEnvKeys } from './config.js';
import { BRANDS, PILLARS, THE_TEN } from './brand.js';

function client() {
  const apiKey = readEnvKeys().anthropic;
  if (!apiKey) throw new Error('No Claude API key yet. Add it in Settings.');
  return new Anthropic({ apiKey });
}

function friendly(err) {
  if (err instanceof Anthropic.AuthenticationError) return new Error('Claude did not accept the API key. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError) return new Error('This Claude key does not have access to that model.');
  if (err instanceof Anthropic.RateLimitError) return new Error('Claude is busy (rate limit). Try again in a minute.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach Claude. Check the internet connection.');
  if (err instanceof Anthropic.APIError) return new Error(`Claude error ${err.status}: ${err.message}`);
  return err;
}

// Stable system prompt: identical bytes every call so it is served from the prompt cache.
export const SYSTEM_PROMPT = `You write guided meditation scripts for Julian Jenkins, a Welsh spiritual teacher with more than twenty years of practice, who teaches on Insight Timer, Spotify and his own channels. The script you write is what Julian, or a clone of his own voice, will speak. Every word must sound like him.

<voice>
Warm, steady, unhurried. Plain, honest, grounded. The sacred paired with the ordinary. Welsh cadence, not Welsh vocabulary.
Present tense and permission giving: "notice what you notice", "you might find", never "you will feel" or "you should".
Honest about difficulty: "this isn't always comfortable, and that's alright".
Never performative, never manipulative, never artificially emotional. No platitudes. Real words for real experiences.
Write from authority, never about it. No credentials, no "in my years of teaching". A few steps ahead on the same path, never a guru. The listener is sovereign and the practice makes Julian unnecessary.
British English spelling and idiom.
</voice>

<house_rules>
No dashes as punctuation anywhere: no em dashes, no en dashes, no spaced hyphens. Use a full stop, a comma or an ellipsis instead. This applies to the script, titles and descriptions.
Never mention AI, technology, apps by name in the spoken script, business, consulting, football, animation or investment.
Never quote or name other teachers. Never reproduce or closely paraphrase wording from any existing meditation, track, book or teacher. Formats are shapes only; every line is original.
No exclamation marks in the spoken script.
</house_rules>

<brands>
Living Awake (Julian's spirituality brand). Promise: "Waking up, not breaking down." Trunk line: "${BRANDS['living-awake'].trunk}"
Every Living Awake piece sits inside one of the four pillars:
${PILLARS.map((p) => `${p.id}. ${p.line}`).join('\n')}
Living Awake vocabulary rules: no new age or esoteric words. Never use: ${BRANDS['living-awake'].banned.join(', ')}. Lead with the simple thing; the cosmology stays behind the door.
Living Awake sign-off, word for word, never shortened: "${BRANDS['living-awake'].signOff}"

The Living Connection (Julian's mediumship brand). Psychic and mediumship development, connection before communication, evidence with love. Here "medium", spirit and chakra language is correct. New age vocabulary is still out: ${BRANDS['living-connection'].banned.join(', ')}. Do not force it into the Living Awake pillars.
The Living Connection sign-off: spoken as "${BRANDS['living-connection'].spokenSignOff}", written as "${BRANDS['living-connection'].signOff}"
</brands>

<source_material>
The Ten, from The Living Awake Manifesto. These are Julian's own lines. Draw on their ideas, and you may echo a line where it lands naturally:
${THE_TEN.map((t, i) => `${i + 1}. ${t}`).join('\n')}
The Daily Practice: five breaths in the morning counted on the breath; through the day, breathe once before reacting, hear the trigger as the bell, notice the room, sit in the silence when undecided, come back when wandered; one quiet minute before sleep. Losing count is not failure; noticing is the return, and the return is the practice.
</source_material>

<shape>
Most meditations follow Julian's five movements, shaped by the format's beats:
1. Opening: ground the listener with simple breath or body awareness. Do not rush into content.
2. Teaching: one theme only, in clear, accessible language.
3. Practice: a guided experience that embodies the teaching. Allow silence. Do not fill every second.
4. Integration: bring it into ordinary life ("how does this show up on Monday morning?").
5. Closing: a gentle return, gratitude without gushing, and an invitation to come back tomorrow.
The first two minutes decide whether a listener stays: an Insight Timer play only counts after 2 minutes (or half the track, if that comes first). Open with presence and a reason to stay, keep early silences short, and save the long silences for later.
Return rate (listeners coming back the next day) is the biggest bonus on Insight Timer, so daytime tracks end with a warm, unforced invitation to return.
Sleep tracks are different: the voice slows and softens, paragraphs get shorter, silences get longer, and the listener is never brought back to waking. No bell, no "open your eyes", no spoken sign-off; the sign-off goes at the foot of the written description instead.
</shape>

<script_format>
The script is plain text in this exact format, because software turns it into audio:
- Lines starting with "## " are section notes for Julian (for example "## Opening"). They are never spoken.
- Spoken text is written in paragraphs separated by a blank line. Each paragraph is voiced as a separate take, with a short natural gap after it. Keep paragraphs to between one and five sentences.
- Exact silence goes on its own line as [[silence 20s]] (also [[silence 90s]], [[silence 2m]]). Use these for practice space. They are the only way to get a pause longer than a few seconds.
- Audio direction tags go in single square brackets right before the words they colour, for example [softly], [warmly], [slowly], [whispers], [exhales], [sighs], [pause], [long pause]. A tag lasts until the next tag but only inside its own paragraph, so start a paragraph with a tag when the delivery changes. Describe how a line is spoken, never what the speaker does. Plain words, no hyphens. Use tags sparingly; the voice is already soft and unhurried.
- Shape delivery with punctuation: commas and full stops for natural pauses, an ellipsis for a longer, thoughtful breath.
- Nothing else. No parentheses, asterisks, braces, angle brackets, bullet points or speaker labels; anything like that would be read aloud.
</script_format>

<metadata>
Insight Timer title: evocative and specific, naming the benefit and ending with the length in minutes after a colon, for example "Set Down What You Carry: 10 Minutes" (the top teachers on Insight Timer title their tracks this way). Use the target length given. No category words (no "Meditation", "Guided", "Music") and no teacher name. Under 60 characters.
Spotify title: lead with the format keyword a listener would search for, then the benefit, written naturally, never keyword stuffed. Under 70 characters.
Subtitle: one quiet line.
Insight Timer description: between 450 and 850 characters in total, including the sign-off (Insight Timer requires 200 to 1000, and room is left for a music credit). Three short paragraphs: what this is and who it is for; how to use it (when, where, posture, how often), which also helps listeners return; then the sign-off for the brand on its own line. No links, website names, email addresses, social handles, emojis or special symbols.
Spotify description: two short paragraphs ending with the brand's written sign-off.
Tags: 6 to 10 plain search words or phrases, lower case.
coverImagePrompt: a prompt for an image generator, for a square cover at least 1600 by 1600 pixels. Living Awake look: deep midnight navy with aged gold light, quiet and atmospheric, fine film grain, the colour coming from navy (#0a1525 to #14283f) and aged gold (#d4a574), never bright colours, purple or pink. Either an abstract atmosphere or a real kind of Welsh place (coast path at dusk, mist over a hill, still water, an old stone) that fits this meditation. No text, letters, logos, people's faces, hands or symbols of any religion. Say the composition (what sits where, with calm space in the centre) in two to four sentences.
coverAltText: one plain sentence describing the cover for someone who cannot see it.
trailerLine: one line under 70 characters that would make someone press play, in Julian's voice, for the trailer card. No dashes.
snippetStart: the first eight words, exactly as written in the script, of the paragraph where the best 30 second preview begins: a passage with real words and no long silence that shows what the meditation feels like. Never the very first paragraph unless the meditation is under ten minutes.
notesForJulian: two or three lines on choices worth his attention, such as anything to check by ear.
</metadata>`;

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'spotifyTitle', 'subtitle', 'insightTimerDescription', 'spotifyDescription', 'tags', 'script', 'coverImagePrompt', 'coverAltText', 'trailerLine', 'snippetStart', 'notesForJulian'],
  properties: {
    title: { type: 'string', description: 'Insight Timer title' },
    spotifyTitle: { type: 'string' },
    subtitle: { type: 'string' },
    insightTimerDescription: { type: 'string' },
    spotifyDescription: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    script: { type: 'string' },
    coverImagePrompt: { type: 'string' },
    coverAltText: { type: 'string' },
    trailerLine: { type: 'string' },
    snippetStart: { type: 'string' },
    notesForJulian: { type: 'string' },
  },
};

export function lengthTargets(format, minutes, settings) {
  const total = minutes * 60;
  const ratio = format.speechRatio || 0.6;
  const wpm = settings.wordsPerMinute || 115;
  const speechSeconds = total * ratio;
  const words = Math.round((speechSeconds / 60) * wpm);
  const paragraphs = Math.max(6, Math.round(words / 45));
  const automatic = settings.preRollSeconds + (format.ending === 'sleep' ? settings.sleepTailSeconds : settings.tailSeconds + 11.5) + paragraphs * settings.paragraphGapSeconds;
  const silenceBudget = Math.max(0, Math.round(total - speechSeconds - automatic));
  return { words, silenceBudget, paragraphs, wpm };
}

export function buildRequest(input, format, settings) {
  const brand = BRANDS[input.brand || format.brand] || BRANDS['living-awake'];
  const minutes = Number(input.minutes) || format.defaultMinutes;
  const t = lengthTargets(format, minutes, settings);
  const pillar = PILLARS.find((p) => p.id === Number(input.pillar));
  const lines = [
    `Write a new ${minutes} minute meditation for ${brand.name}.`,
    '',
    `<format name="${format.name}" ending="${format.ending}">`,
    `Platforms it wins on: ${format.platforms.join(', ')}.`,
    `Why this format works: ${format.evidence}`,
    'Beats, in order:',
    ...format.beats.map((b, i) => `${i + 1}. ${b}`),
    `Example Insight Timer title shapes (shapes only, write your own): ${format.titlePatterns.insightTimer.join(' | ')}`,
    `Example Spotify title shapes (shapes only, write your own): ${format.titlePatterns.spotify.join(' | ')}`,
    '</format>',
    '',
    pillar ? `Pillar: ${pillar.id}. ${pillar.line} Let this pillar run underneath the whole piece without naming it as a pillar.` : (brand.usesPillars ? 'Choose the pillar that fits best and let it run underneath the whole piece.' : ''),
    input.theme ? `Theme or angle from Julian: ${input.theme}` : 'Choose a specific, human angle within this format.',
    input.audience ? `Who it is for: ${input.audience}` : '',
    format.series ? `This is day ${input.day || 1} of a ${input.seriesLength || 7} day series called "${input.seriesName || 'Seven Days of Coming Home'}".` : '',
    input.notes ? `Julian's notes: ${input.notes}` : '',
    input.demand ? `What listeners are searching for right now (from the latest trend scan, for direction only): ${input.demand}` : '',
    '',
    '<length>',
    `Spoken words: about ${t.words} (within 10 percent). The voice runs at about ${t.wpm} words a minute.`,
    `Written silences: about ${t.silenceBudget} seconds in total across [[silence]] lines, placed where the practice needs space. Keep silences in the first two minutes to 15 seconds or less in total.`,
    `Lead-in, paragraph gaps${format.ending === 'sleep' ? ' and the long quiet tail' : ', the bell and the tail'} are added automatically. Do not write them.`,
    '</length>',
    '',
    format.ending === 'sleep'
      ? `Ending: sleep. Do not speak the sign-off. Put "${brand.signOff}" at the foot of both descriptions.`
      : `Ending: close with the spoken sign-off, word for word: "${brand.spokenSignOff}". Put "${brand.signOff}" at the foot of both descriptions.`,
  ];
  return lines.filter((l) => l !== '').join('\n').replace(/\n(<\/?\w)/g, '\n$1');
}

async function runScriptCall(messages, settings) {
  const c = client();
  const params = {
    model: settings.claudeModel || 'claude-opus-5-5',
    max_tokens: 32000,
    cache_control: { type: 'ephemeral' },
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: { effort: settings.claudeEffort || 'high', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
    messages,
  };
  const attempt = async (withFallbacks) => {
    const stream = withFallbacks
      ? c.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : c.messages.stream(params);
    return stream.finalMessage();
  };
  let message;
  try {
    message = await attempt(settings.useFallbacks !== false);
  } catch (err) {
    // An account without the fallback beta gets a 400; try once more without it.
    if (settings.useFallbacks !== false && err instanceof Anthropic.BadRequestError) {
      try {
        message = await attempt(false);
      } catch (err2) {
        throw friendly(err2);
      }
    } else {
      throw friendly(err);
    }
  }
  if (message.stop_reason === 'refusal') throw new Error('Claude declined this request. Try a different theme or wording.');
  if (message.stop_reason === 'max_tokens') throw new Error('The script ran past the length limit. Try a shorter duration.');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Claude returned something that was not a script. Please try again.');
  }
  return { data, usage: message.usage, model: message.model };
}

export async function writeScript(input, format, settings) {
  const content = buildRequest(input, format, settings);
  return runScriptCall([{ role: 'user', content }], settings);
}

export async function reviseScript(m, instruction, format, settings) {
  const draft = JSON.stringify({
    title: m.title, spotifyTitle: m.spotifyTitle, subtitle: m.subtitle,
    insightTimerDescription: m.insightTimerDescription, spotifyDescription: m.spotifyDescription,
    tags: m.tags || [], script: m.script,
    coverImagePrompt: m.coverImagePrompt || '', coverAltText: m.coverAltText || '',
    trailerLine: m.trailerLine || '', snippetStart: m.snippetStart || '',
    notesForJulian: m.notesForJulian || '',
  });
  const original = buildRequest({ ...m, minutes: m.minutes }, format, settings);
  const content = `${original}\n\n<current_draft>\n${draft}\n</current_draft>\n\nRevise the current draft. Julian asks: ${instruction}\nKeep everything he did not ask to change. Return the full revised draft.`;
  return runScriptCall([{ role: 'user', content }], settings);
}

function extractJson(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

// Live scan of what is getting listened to now, using Claude's web search.
export async function trendScan(formats, settings, focus = '') {
  const c = client();
  const ids = formats.map((f) => `${f.id} (${f.name})`).join('; ');
  const prompt = `Find what guided meditation topics and formats are getting the most listening right now on Insight Timer and Spotify, focusing on the last three to six months. ${focus ? `Focus: ${focus}.` : ''}
Look for chart positions, play counts, featured collections, new courses and search interest. Prefer primary sources (insighttimer.com, open.spotify.com, newsroom.spotify.com, podcast charts).
Then suggest five ideas for Julian Jenkins, a Welsh teacher whose Living Awake brand rests on four pillars: 1 You are not breaking down, you are grieving the version of you you outgrew. 2 The thread was never cut. 3 Control is the cage, not the cure. 4 You do not need to become anyone. Each idea must use one of these format ids: ${ids}.
Ideas are directions only. Never suggest copying anyone's title or wording. No dashes in any text you write.
Finish with one JSON object in a \`\`\`json fence with exactly this shape:
{"summary": "three sentences", "trends": [{"topic": "", "platform": "Insight Timer|Spotify|Both", "evidence": "", "sourceUrl": ""}], "ideas": [{"formatId": "", "theme": "", "pillar": 1, "why": ""}]}`;
  const messages = [{ role: 'user', content: prompt }];
  const params = {
    model: settings.claudeModel || 'claude-opus-5-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
  };
  let message;
  try {
    for (let i = 0; i < 4; i += 1) {
      message = await c.messages.stream({ ...params, messages }).finalMessage();
      if (message.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: message.content });
    }
  } catch (err) {
    throw friendly(err);
  }
  if (message.stop_reason === 'refusal') throw new Error('Claude declined the trend scan.');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return extractJson(text);
  } catch {
    return { summary: text.slice(0, 1200), trends: [], ideas: [] };
  }
}
