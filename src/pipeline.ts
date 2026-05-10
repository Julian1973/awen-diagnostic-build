import path from "node:path";
import { config } from "./config";
import { generateScript, MontyScript } from "./generator/script";
import { HeyGenClient } from "./heygen/client";
import { TikTokClient } from "./tiktok/client";
import {
  PostRow,
  getPost,
  insertDraft,
  recentScripts,
  recentThemes,
  updatePost,
} from "./storage/db";

export function buildTikTokTitle(script: MontyScript): string {
  // TikTok caption max 2200 chars; we keep it tight.
  const tags = script.hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const base = script.caption || script.hook;
  return `${base}\n\n${tags}`.trim().slice(0, 2150);
}

// Step 1: ask Claude for a fresh script and persist it as a draft.
export async function stepGenerateDraft(): Promise<PostRow> {
  const recent = recentScripts(5);
  const avoid = recentThemes(8);
  const script = await generateScript({ recentScripts: recent, avoidThemes: avoid });

  const id = insertDraft({
    title: script.title,
    hook: script.hook,
    script: script.spokenScript,
    caption: script.caption,
    hashtags: JSON.stringify(script.hashtags),
    theme: script.seed.theme,
    teacher: script.seed.teacher,
    scripture_source: script.seed.scripture.source,
    word_count: script.wordCount,
  });

  return getPost(id)!;
}

// Step 2: hand the script to HeyGen, wait for render, download the file.
export async function stepRenderVideo(postId: number): Promise<PostRow> {
  const post = getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found`);

  updatePost(postId, { status: "rendering" });
  const heygen = new HeyGenClient();
  try {
    const videoId = await heygen.generateVideo(post.script, { title: post.title });
    updatePost(postId, { heygen_video_id: videoId });
    const result = await heygen.waitForVideo(videoId);
    const filename = `monty-${postId}-${Date.now()}.mp4`;
    const localPath = await heygen.downloadVideo(result.videoUrl, config.paths.outbox, filename);

    updatePost(postId, {
      status: "rendered",
      heygen_video_url: result.videoUrl,
      local_video_path: path.resolve(localPath),
    });
    return getPost(postId)!;
  } catch (err) {
    updatePost(postId, { status: "failed", error: String(err) });
    throw err;
  }
}

// Step 3: upload to TikTok via Content Posting API.
export async function stepPostToTikTok(postId: number): Promise<PostRow> {
  const post = getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found`);
  if (!post.local_video_path) throw new Error(`Post ${postId} has no rendered video`);

  const tiktok = new TikTokClient();
  try {
    const title = buildTikTokTitle({
      title: post.title,
      hook: post.hook,
      spokenScript: post.script,
      caption: post.caption,
      hashtags: JSON.parse(post.hashtags),
      seed: {
        teacher: post.teacher as any,
        theme: post.theme,
        scripture: { source: post.scripture_source, seed: "" },
      },
      wordCount: post.word_count,
    });

    const result = await tiktok.postVideo({
      filePath: post.local_video_path,
      title,
    });

    updatePost(postId, {
      status: "posted",
      tiktok_publish_id: result.publishId,
      tiktok_share_url: result.shareUrl ?? null,
      posted_at: new Date().toISOString(),
    });
    return getPost(postId)!;
  } catch (err) {
    updatePost(postId, { status: "failed", error: String(err) });
    throw err;
  }
}

// End-to-end: generate, render, post.
export async function runOnce(opts: { skipPost?: boolean } = {}): Promise<PostRow> {
  const draft = await stepGenerateDraft();
  console.log(`[pipeline] draft #${draft.id} — ${draft.title} (${draft.word_count}w, ${draft.teacher} / ${draft.theme})`);

  const rendered = await stepRenderVideo(draft.id);
  console.log(`[pipeline] rendered #${rendered.id} -> ${rendered.local_video_path}`);

  if (opts.skipPost) return rendered;

  const posted = await stepPostToTikTok(rendered.id);
  console.log(`[pipeline] posted #${posted.id} -> ${posted.tiktok_share_url ?? "(no url returned)"}`);
  return posted;
}
