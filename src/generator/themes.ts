// Theme rotation seeds. Each generation picks one teacher style + one theme +
// one scripture anchor so we don't repeat ourselves.

export const TEACHER_STYLES = [
  "jay-shetty",
  "jon-kabat-zinn",
  "alan-watts",
] as const;
export type TeacherStyle = (typeof TEACHER_STYLES)[number];

export const TEACHER_BLURBS: Record<TeacherStyle, string> = {
  "jay-shetty":
    "Lead with a relatable modern hook (a notification, a 2am scroll, a comparison spiral). Tell a tiny story. Land a clean, quotable takeaway.",
  "jon-kabat-zinn":
    "Anchor in the body and the present moment. Invite non-judgmental noticing. Use breath, sensation, the feet on the floor. Calm, clinical-warm.",
  "alan-watts":
    "Lead with playful paradox. Dissolve the sense of separate self. Use cosmic metaphor — the wave and ocean, the universe peeking through eyes. A small giggle at the absurd.",
};

export const THEMES = [
  "the trap of comparison",
  "fear of missing out",
  "the loneliness of being online",
  "burnout and the cult of productivity",
  "letting go of who you were",
  "the body as home",
  "impermanence of feelings",
  "anxiety about the future",
  "the gift of doing one thing",
  "self-compassion when you mess up",
  "grief and what stays",
  "the ego's need to be right",
  "perfectionism",
  "boredom as a doorway",
  "the difference between pleasure and joy",
  "forgiving the past self",
  "loving someone without clinging",
  "the courage to be ordinary",
  "stillness in a loud world",
  "the wisdom of doing nothing",
  "what fear is actually pointing at",
  "Sunday-night dread",
  "the practice of small kindnesses",
  "ambition vs. presence",
  "the freedom of not knowing",
  "the silence between thoughts",
  "rest as resistance",
  "envy as a teacher",
  "anger as information",
  "the breath you almost forgot to take",
];

export const SCRIPTURE_ANCHORS = [
  { source: "Dhammapada", seed: "Mind precedes all things; mind is their chief." },
  { source: "Dhammapada", seed: "Hatred does not cease by hatred; only by love." },
  { source: "Heart Sutra", seed: "Form is emptiness; emptiness is form." },
  { source: "Diamond Sutra", seed: "All conditioned things are like a dream, a bubble, a shadow." },
  { source: "Diamond Sutra", seed: "The past mind cannot be grasped; the future mind cannot be grasped." },
  { source: "Bahiya Sutta", seed: "In the seen, just the seen. In the heard, just the heard." },
  { source: "Metta Sutta", seed: "May all beings be at ease." },
  { source: "Satipatthana Sutta", seed: "Mindful of the body in the body." },
  { source: "Anapanasati Sutta", seed: "Breathing in, I know I am breathing in." },
  { source: "Lotus Sutra", seed: "The jewel was sewn into the robe all along." },
  { source: "Zen — Wu Li", seed: "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water." },
  { source: "Zen — Dogen", seed: "To study the self is to forget the self." },
  { source: "Zen koan", seed: "The finger pointing at the moon is not the moon." },
  { source: "Shantideva", seed: "If it can be solved, no need to worry. If it cannot, worrying will not help." },
  { source: "Three Marks", seed: "Anicca — everything is passing through." },
  { source: "Three Marks", seed: "Anatta — the self you defend was never solid." },
  { source: "Four Noble Truths", seed: "Clinging is the cause; letting go is the door." },
  { source: "Thich Nhat Hanh", seed: "The present moment is the only moment available to us." },
  { source: "Thich Nhat Hanh", seed: "Interbeing — the cloud is in the paper." },
];

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface GenerationSeed {
  teacher: TeacherStyle;
  theme: string;
  scripture: { source: string; seed: string };
}

export function pickSeed(avoidThemes: Set<string> = new Set()): GenerationSeed {
  const eligible = THEMES.filter((t) => !avoidThemes.has(t));
  const pool = eligible.length > 0 ? eligible : THEMES;
  return {
    teacher: pickRandom(TEACHER_STYLES),
    theme: pickRandom(pool),
    scripture: pickRandom(SCRIPTURE_ANCHORS),
  };
}
