import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { MONTY_CHARACTER, SCRIPTURE_CORPUS, STRUCTURE_GUIDE } from "./persona";
import { GenerationSeed, TEACHER_BLURBS, pickSeed } from "./themes";

export interface MontyScript {
  title: string;
  hook: string;
  spokenScript: string;
  caption: string;
  hashtags: string[];
  seed: GenerationSeed;
  wordCount: number;
}

const anthropic = () => new Anthropic({ apiKey: config.anthropic.apiKey() });

const SYSTEM_BLOCKS = [
  { type: "text" as const, text: MONTY_CHARACTER },
  // Scripture corpus is large and stable — cache it.
  { type: "text" as const, text: SCRIPTURE_CORPUS, cache_control: { type: "ephemeral" as const } },
  { type: "text" as const, text: STRUCTURE_GUIDE, cache_control: { type: "ephemeral" as const } },
];

const OUTPUT_INSTRUCTIONS = `
Return ONLY a single JSON object — no markdown fences, no commentary.
Schema:
{
  "title": "internal working title, <=60 chars",
  "hook": "the first spoken line, repeated for indexing",
  "spokenScript": "the full 60s script, line breaks where breath pauses sit",
  "caption": "TikTok caption, <=140 chars, no hashtags inline",
  "hashtags": ["#mindfulness","#buddhism", ...]  // 5–8 relevant hashtags, lowercase, no spaces
}
`;

export async function generateScript(opts?: {
  seed?: GenerationSeed;
  recentScripts?: string[];
  avoidThemes?: Set<string>;
}): Promise<MontyScript> {
  const seed = opts?.seed ?? pickSeed(opts?.avoidThemes);
  const recent = (opts?.recentScripts ?? []).slice(-5);

  const userPrompt = `
Write Monty's next 60-second TikTok.

TEACHER STYLE FOR THIS ONE: ${seed.teacher}
${TEACHER_BLURBS[seed.teacher]}

THEME: ${seed.theme}

SCRIPTURE ANCHOR (paraphrase faithfully, weave in naturally):
  Source: ${seed.scripture.source}
  Seed:   "${seed.scripture.seed}"

${recent.length ? `Avoid repeating openings, metaphors, or closings from these recent scripts:\n---\n${recent.join("\n---\n")}\n---\n` : ""}

${OUTPUT_INSTRUCTIONS}
`.trim();

  const client = anthropic();
  const resp = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1500,
    system: SYSTEM_BLOCKS,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = parseJsonLoose(text);
  const wordCount = countWords(parsed.spokenScript);

  return {
    title: String(parsed.title ?? "untitled"),
    hook: String(parsed.hook ?? ""),
    spokenScript: String(parsed.spokenScript ?? "").trim(),
    caption: String(parsed.caption ?? "").trim(),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: unknown) => String(h)).filter(Boolean)
      : [],
    seed,
    wordCount,
  };
}

function parseJsonLoose(text: string): any {
  const trimmed = text.trim();
  // Strip ```json fences if Claude added them despite instructions.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Last-ditch: find the first { and last }.
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    throw new Error(`Could not parse Claude response as JSON:\n${text}`);
  }
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
