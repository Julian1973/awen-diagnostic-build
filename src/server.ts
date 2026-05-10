import express, { Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config";
import { listPosts, getPost } from "./storage/db";
import { runOnce, stepGenerateDraft, stepPostToTikTok, stepRenderVideo } from "./pipeline";
import { buildAuthUrl, exchangeCodeForTokens } from "./tiktok/client";

export function startServer() {
  const app = express();
  app.use(express.json());

  // Auth middleware — token via header or query so the dashboard URL can include it.
  function auth(req: Request, res: Response, next: NextFunction) {
    if (req.path.startsWith("/oauth/")) return next();
    const supplied = req.header("x-token") ?? req.query.token;
    if (supplied !== config.dashboard.token) {
      res.status(401).send("unauthorized — set ?token=… or x-token header");
      return;
    }
    next();
  }
  app.use(auth);

  app.get("/", (_req, res) => {
    const posts = listPosts(50);
    res.type("html").send(renderDashboard(posts));
  });

  app.get("/api/posts", (_req, res) => {
    res.json(listPosts(100));
  });

  app.get("/api/posts/:id", (req, res) => {
    const p = getPost(parseInt(req.params.id, 10));
    if (!p) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(p);
  });

  app.get("/video/:id", (req, res) => {
    const p = getPost(parseInt(req.params.id, 10));
    if (!p?.local_video_path || !fs.existsSync(p.local_video_path)) {
      res.status(404).send("no local video");
      return;
    }
    res.sendFile(path.resolve(p.local_video_path));
  });

  // Manual triggers — handy for QA without waiting on cron.
  app.post("/api/run-once", async (_req, res) => {
    runOnce().catch((e) => console.error("[run-once]", e));
    res.json({ ok: true, started: true });
  });
  app.post("/api/generate", async (_req, res) => {
    try {
      const post = await stepGenerateDraft();
      res.json(post);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app.post("/api/render/:id", async (req, res) => {
    try {
      const post = await stepRenderVideo(parseInt(req.params.id, 10));
      res.json(post);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app.post("/api/post/:id", async (req, res) => {
    try {
      const post = await stepPostToTikTok(parseInt(req.params.id, 10));
      res.json(post);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // TikTok OAuth — open /oauth/tiktok in the browser to (re)connect.
  app.get("/oauth/tiktok", (_req, res) => {
    const state = Math.random().toString(36).slice(2);
    res.cookie?.("tt_state", state);
    res.redirect(buildAuthUrl(state));
  });
  app.get("/oauth/tiktok/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    if (!code) {
      res.status(400).send("missing code");
      return;
    }
    try {
      const tokens = await exchangeCodeForTokens(code);
      res.type("html").send(`
        <h1>Connected.</h1>
        <p>Paste these into your <code>.env</code>:</p>
        <pre>
TIKTOK_ACCESS_TOKEN=${tokens.accessToken}
TIKTOK_REFRESH_TOKEN=${tokens.refreshToken}
TIKTOK_OPEN_ID=${tokens.openId}
        </pre>
      `);
    } catch (e) {
      res.status(500).send(`OAuth failed: ${String(e)}`);
    }
  });

  app.listen(config.dashboard.port, () => {
    console.log(`[dashboard] http://localhost:${config.dashboard.port}/?token=${config.dashboard.token}`);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDashboard(posts: ReturnType<typeof listPosts>): string {
  const rows = posts
    .map((p) => {
      const tags = (() => {
        try {
          return (JSON.parse(p.hashtags) as string[]).join(" ");
        } catch {
          return "";
        }
      })();
      const status = `<span class="s s-${p.status}">${p.status}</span>`;
      const link = p.tiktok_share_url
        ? `<a href="${p.tiktok_share_url}" target="_blank">tiktok ↗</a>`
        : p.local_video_path
          ? `<a href="/video/${p.id}?token=${encodeURIComponent(config.dashboard.token)}" target="_blank">preview ↗</a>`
          : "—";
      return `
      <tr>
        <td>#${p.id}</td>
        <td>${status}</td>
        <td><b>${escapeHtml(p.title)}</b><br><small>${escapeHtml(p.teacher)} · ${escapeHtml(p.theme)} · ${escapeHtml(p.scripture_source)} · ${p.word_count}w</small></td>
        <td><div class="hook">${escapeHtml(p.hook)}</div><div class="tags">${escapeHtml(tags)}</div></td>
        <td>${link}</td>
        <td><small>${escapeHtml(p.created_at)}</small></td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Monty Dashboard</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background:#0E1116; color:#E6E8EB; }
  header { padding: 16px 24px; border-bottom: 1px solid #232830; display:flex; align-items:center; gap:16px; }
  h1 { font-size: 18px; margin:0; }
  main { padding: 16px 24px; }
  table { width:100%; border-collapse: collapse; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #1c2128; vertical-align: top; }
  th { text-align:left; color:#8b949e; font-weight: 500; font-size: 12px; text-transform: uppercase; }
  small { color:#8b949e; }
  .hook { max-width: 480px; }
  .tags { color:#8b949e; margin-top:4px; font-size:12px; }
  .s { padding:2px 8px; border-radius: 999px; font-size:12px; }
  .s-draft { background:#374151; }
  .s-rendering { background:#1e3a5f; }
  .s-rendered { background:#1f4d3a; }
  .s-posted { background:#16a34a; color:#06120a; }
  .s-failed { background:#7f1d1d; }
  button { background:#1f6feb; color:white; border:0; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:600; }
  button:hover { background:#388bfd; }
  a { color:#79c0ff; }
</style>
</head>
<body>
<header>
  <h1>🐒 Monty the Mindfulness Monkey</h1>
  <button onclick="trigger()">▶ Run pipeline now</button>
  <span id="status" style="color:#8b949e"></span>
</header>
<main>
<table>
  <thead><tr><th>id</th><th>status</th><th>title / seed</th><th>hook</th><th>link</th><th>created</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="6"><small>No posts yet — hit "Run pipeline now" to make Monty's first video.</small></td></tr>`}</tbody>
</table>
</main>
<script>
async function trigger() {
  document.getElementById('status').textContent = 'starting…';
  const r = await fetch('/api/run-once?token=${encodeURIComponent(config.dashboard.token)}', { method:'POST' });
  const j = await r.json();
  document.getElementById('status').textContent = j.ok ? 'pipeline started — refresh in ~2 min' : JSON.stringify(j);
  setTimeout(() => location.reload(), 4000);
}
</script>
</body></html>`;
}
