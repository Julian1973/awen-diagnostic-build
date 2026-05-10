import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

export type PostStatus =
  | "draft"          // script written, no video yet
  | "rendering"      // submitted to HeyGen
  | "rendered"       // video file ready
  | "posted"         // published to TikTok
  | "failed";

export interface PostRow {
  id: number;
  created_at: string;
  status: PostStatus;
  title: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string;        // JSON array
  theme: string;
  teacher: string;
  scripture_source: string;
  word_count: number;
  heygen_video_id?: string | null;
  heygen_video_url?: string | null;
  local_video_path?: string | null;
  tiktok_publish_id?: string | null;
  tiktok_share_url?: string | null;
  error?: string | null;
  posted_at?: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  script TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT NOT NULL,
  theme TEXT NOT NULL,
  teacher TEXT NOT NULL,
  scripture_source TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  heygen_video_id TEXT,
  heygen_video_url TEXT,
  local_video_path TEXT,
  tiktok_publish_id TEXT,
  tiktok_share_url TEXT,
  error TEXT,
  posted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
`;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(config.paths.db), { recursive: true });
  _db = new Database(config.paths.db);
  _db.pragma("journal_mode = WAL");
  _db.exec(SCHEMA);
  return _db;
}

export function insertDraft(p: Omit<PostRow, "id" | "created_at" | "status"> & { status?: PostStatus }): number {
  const stmt = db().prepare(`
    INSERT INTO posts (status, title, hook, script, caption, hashtags, theme, teacher, scripture_source, word_count)
    VALUES (@status, @title, @hook, @script, @caption, @hashtags, @theme, @teacher, @scripture_source, @word_count)
  `);
  const info = stmt.run({
    ...p,
    status: p.status ?? "draft",
  });
  return Number(info.lastInsertRowid);
}

export function updatePost(id: number, patch: Partial<PostRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id" && k !== "created_at");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db().prepare(`UPDATE posts SET ${sets} WHERE id = @id`).run({ ...patch, id });
}

export function getPost(id: number): PostRow | undefined {
  return db().prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as PostRow | undefined;
}

export function listPosts(limit = 50): PostRow[] {
  return db()
    .prepare(`SELECT * FROM posts ORDER BY id DESC LIMIT ?`)
    .all(limit) as PostRow[];
}

export function recentScripts(limit = 5): string[] {
  const rows = db()
    .prepare(`SELECT script FROM posts ORDER BY id DESC LIMIT ?`)
    .all(limit) as { script: string }[];
  return rows.map((r) => r.script);
}

export function recentThemes(limit = 10): Set<string> {
  const rows = db()
    .prepare(`SELECT DISTINCT theme FROM posts ORDER BY id DESC LIMIT ?`)
    .all(limit) as { theme: string }[];
  return new Set(rows.map((r) => r.theme));
}
