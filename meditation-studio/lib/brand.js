// Julian's Side A brand rules, taken from his brand-guardian, living-awake-engine and
// spiritual-content skills (identity profiles transcribed from memory, 27 Sep 2026).
// Where a project file disagrees (Living Awake Master Compendium, Brand_Kit.md), the project file wins.

export const BRANDS = {
  'living-awake': {
    id: 'living-awake',
    name: 'Living Awake',
    promise: 'Waking up, not breaking down.',
    trunk: 'Living Awake is the slow return from the life you were taught to perform to the self that never left.',
    signOff: 'Take a breath with me and then be love and give love. Have a wonderful day, one breath at a time.',
    // Spoken sign-off and written sign-off are the same line for Living Awake.
    spokenSignOff: 'Take a breath with me and then be love and give love. Have a wonderful day, one breath at a time.',
    banned: [
      'medium', 'mediums', 'mediumship', 'chakra', 'chakras', 'third eye',
      'vibration', 'vibrations', 'vibrational', 'high vibe', 'high vibes', 'ascension', 'ascend',
      'manifest', 'manifesting', 'manifestation', 'abundance', 'light language', 'love and light',
    ],
    usesPillars: true,
  },
  'living-connection': {
    id: 'living-connection',
    name: 'The Living Connection',
    promise: 'Connection before communication. Evidence with love.',
    trunk: 'Psychic and mediumship development, grounded and real.',
    signOff: 'Be love. Give love. Julian x',
    spokenSignOff: 'Be love. Give love.',
    // Mediumship, spirit and chakra language is correct here. New-age vocabulary is still out.
    banned: [
      'vibration', 'vibrations', 'vibrational', 'high vibe', 'high vibes', 'ascension', 'ascend',
      'manifest', 'manifesting', 'manifestation', 'abundance', 'light language', 'love and light',
    ],
    usesPillars: false,
  },
};

export const PILLARS = [
  { id: 1, name: 'The door', line: 'You are not breaking down. You are grieving the version of you you outgrew.' },
  { id: 2, name: 'The ground', line: 'The thread was never cut. We were taught to stop feeling it.' },
  { id: 3, name: 'The walk', line: 'Control is the cage, not the cure.' },
  { id: 4, name: 'The floor', line: 'You do not need to become anyone. You already are.' },
];

// The Ten, from The Living Awake Manifesto. Source lines the scripts may draw on.
export const THE_TEN = [
  'You are not breaking. You are grieving the person you outgrew. Let the grief pass through. Do not call it damage.',
  'You were never alone. The aloneness was taught. The thread between you and everything was never cut, only buried.',
  'Control is the cage. The breath is the truce. Most of the work, every day, is putting down the wheel for one breath at a time.',
  'You do not need to become someone. The you they keep selling you the path to is already here, under the noise.',
  'The trigger is the bell, not the enemy. The thing knocking you out is the thing waking you up. Hear it. Come back.',
  'Five conscious breaths are enough. Most of the practice is noticing when to take them.',
  'Sit in the silence. What arrives there is what to trust. The thinking mind cannot find what the silence already knows.',
  'The costume is not you. The one inside it is. The thing falling apart is the version of you you built to survive, not the one you came in with.',
  'Read the energy. Choose your circle. Allow everyone to be exactly who they are, and still decide who you sit close to.',
  'Walk the next person home. The path is yours, but it is not solitary.',
];

// Side B and tooling words that must never reach a listener (brand wall, Side A never mentions AI or business).
const WALL_WORDS = [
  'artificial intelligence', 'ai-generated', 'ai generated', 'elevenlabs', 'eleven labs', 'claude', 'chatgpt',
  'awen intelligence', 'awen method', 'consulting', 'consultancy', 'roi', 'crystal bears', 'linkedin',
];

const AMERICAN = {
  color: 'colour', colors: 'colours', center: 'centre', centered: 'centred', centers: 'centres',
  favorite: 'favourite', realize: 'realise', realizes: 'realises', realized: 'realised',
  recognize: 'recognise', recognized: 'recognised', apologize: 'apologise', organize: 'organise',
  honor: 'honour', honoring: 'honouring', neighbor: 'neighbour', behavior: 'behaviour',
  gray: 'grey', mom: 'mum', fall: null, // "fall" is fine in British English; listed so it is never flagged
  practicing: 'practising', practiced: 'practised', jewelry: 'jewellery', traveling: 'travelling',
  labor: 'labour', savor: 'savour', savoring: 'savouring', fulfill: 'fulfil', toward: 'towards',
  energize: 'energise', visualize: 'visualise', visualizing: 'visualising', emphasize: 'emphasise',
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTags(text) {
  return String(text || '').replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\[[^\]]*\]/g, ' ');
}

function findWords(text, words) {
  const hits = [];
  const plain = stripTags(text).toLowerCase();
  for (const w of words) {
    const re = new RegExp(`(^|[^a-z])${escapeRe(w.toLowerCase())}([^a-z]|$)`, 'g');
    if (re.test(plain)) hits.push(w);
  }
  return hits;
}

function normaliseSpace(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns a list of { rule, severity: 'block'|'flag'|'pass', message } for one meditation.
// severity block = must fix before it goes out; flag = Julian's eyes; pass = checked and fine.
export function insightTimerDescription(m, musicCredit) {
  const base = String(m.insightTimerDescription || '').trim();
  return musicCredit ? `${base}\n\n${musicCredit}` : base;
}

export function brandCheck(m, format, { musicCredit = '' } = {}) {
  const brand = BRANDS[m.brand] || BRANDS['living-awake'];
  const results = [];
  const script = m.script || '';
  const listenerText = [m.title, m.subtitle, m.insightTimerDescription, m.spotifyTitle, m.spotifyDescription, (m.tags || []).join(' ')].join('\n');
  const everything = `${script}\n${listenerText}`;
  const add = (rule, severity, message) => results.push({ rule, severity, message });

  // House rule: no dashes as punctuation, ever.
  const dashLines = [];
  everything.split('\n').forEach((l, i) => {
    if (/[–—]|\s-\s|\s--\s|^-\s/.test(l)) dashLines.push(i + 1);
  });
  if (dashLines.length) add('No dashes', 'block', `Dashes found (${dashLines.length} line${dashLines.length > 1 ? 's' : ''}). Use a full stop, a comma or an ellipsis.`);
  else add('No dashes', 'pass', 'No em dashes, en dashes or spaced hyphens.');

  const banned = findWords(everything, brand.banned);
  if (banned.length) add('Vocabulary', 'block', `Not in ${brand.name}: ${banned.join(', ')}.`);
  else add('Vocabulary', 'pass', `No banned ${brand.name} words.`);

  const wall = findWords(listenerText + '\n' + script, WALL_WORDS).concat(/(^|[^A-Za-z])AI([^A-Za-z]|$)/.test(stripTags(everything)) ? ['AI'] : []);
  if (wall.length) add('Brand wall', 'block', `Side B or tooling words a listener would see or hear: ${[...new Set(wall)].join(', ')}.`);
  else add('Brand wall', 'pass', 'Nothing from AI, business or the other brands.');

  const us = [];
  const plain = stripTags(everything).toLowerCase();
  for (const [w, uk] of Object.entries(AMERICAN)) {
    if (uk && new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(plain)) us.push(`${w} → ${uk}`);
  }
  if (us.length) add('British English', 'flag', `American spellings: ${us.join(', ')}.`);
  else add('British English', 'pass', 'British spellings.');

  // Sign-off. Sleep tracks carry it in writing so the listener is not woken at the end.
  const isSleep = format?.ending === 'sleep';
  const spokenOk = normaliseSpace(script).includes(normaliseSpace(brand.spokenSignOff));
  const writtenOk = normaliseSpace(m.insightTimerDescription).includes(normaliseSpace(brand.signOff));
  if (isSleep) {
    if (writtenOk) add('Sign-off', 'pass', 'Sleep track: sign-off written at the foot of the description, not spoken.');
    else add('Sign-off', 'block', `Sleep track: add the sign-off to the description: "${brand.signOff}"`);
  } else if (spokenOk && writtenOk) {
    add('Sign-off', 'pass', 'Locked sign-off spoken at the close and written in the description.');
  } else {
    const missing = [!spokenOk && 'spoken at the close', !writtenOk && 'written in the description'].filter(Boolean).join(' and ');
    add('Sign-off', 'block', `Sign-off missing (${missing}): "${brand.signOff}"`);
  }

  if (brand.usesPillars) {
    if (m.pillar && PILLARS.some((p) => p.id === Number(m.pillar))) add('Pillar', 'pass', `Sits in pillar ${m.pillar}: ${PILLARS.find((p) => p.id === Number(m.pillar)).line}`);
    else add('Pillar', 'block', 'Every Living Awake piece sits inside one of the four pillars. Choose one.');
  }

  // Insight Timer: a play counts after 120 seconds, and return rate pays the most.
  if (!isSleep) {
    const closing = normaliseSpace(script.slice(-1200));
    if (/tomorrow|come back|again tomorrow|return to this|each morning|each evening|next time/.test(closing)) add('Return invitation', 'pass', 'Gentle invitation to come back is in the close.');
    else add('Return invitation', 'flag', 'No gentle invitation to return tomorrow in the close. Return rate drives Insight Timer income.');
  }

  // Insight Timer description rules: 200 to 1000 characters, no links, contact details or emojis.
  const itDesc = insightTimerDescription(m, musicCredit);
  if (m.insightTimerDescription) {
    const n = itDesc.length;
    if (n < 200) add('Insight Timer description', 'block', `${n} characters. Insight Timer needs at least 200.`);
    else if (n > 1000) add('Insight Timer description', 'block', `${n} characters${musicCredit ? ' with the music credit' : ''}. Insight Timer allows 1000 at most.`);
    else add('Insight Timer description', 'pass', `${n} characters${musicCredit ? ' with the music credit' : ''} (200 to 1000 allowed).`);
    if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.uk|uk|me|org|net|io)\b|[\w.]+@[\w.]+|(^|\s)@\w)/i.test(itDesc)) add('No links', 'block', 'Insight Timer rejects links, website names, email addresses and social handles in descriptions.');
    if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(`${m.title}\n${itDesc}`)) add('No emojis', 'block', 'Insight Timer rejects emojis and special symbols in titles and descriptions.');
  }
  if (m.script && !m.coverImagePrompt) add('Cover image', 'flag', 'No cover image description yet. Ask Claude to revise and add one.');

  // Insight Timer title guidance: no category words and no teacher name in the title.
  const itTitleWords = findWords(m.title || '', ['meditation', 'guided', 'music', 'julian', 'jenkins']);
  if (itTitleWords.length) add('Insight Timer title', 'flag', `Insight Timer asks for no category words or teacher name in titles: ${itTitleWords.join(', ')}.`);
  else if (m.title) add('Insight Timer title', 'pass', 'Title has no category words or teacher name.');

  if (/[!]/.test(stripTags(script))) add('Tone', 'flag', 'Exclamation marks in the spoken script. Warm, steady, unhurried.');
  const performative = findWords(script, ['you will feel', 'you should feel', 'you must', 'you should']);
  if (performative.length) add('Permission language', 'flag', `Directive phrasing: ${performative.join(', ')}. Try "you might find" or "notice".`);

  return results;
}

export function brandSummary(results) {
  const blocks = results.filter((r) => r.severity === 'block').length;
  const flags = results.filter((r) => r.severity === 'flag').length;
  return { blocks, flags, ok: blocks === 0 };
}
