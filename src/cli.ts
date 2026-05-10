import http from "node:http";
import crypto from "node:crypto";
import { config } from "./config";
import { runOnce, stepGenerateDraft, stepPostToTikTok, stepRenderVideo } from "./pipeline";
import { buildAuthUrl, exchangeCodeForTokens } from "./tiktok/client";

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "generate": {
      const draft = await stepGenerateDraft();
      console.log(JSON.stringify(draft, null, 2));
      break;
    }
    case "render": {
      const id = parseInt(process.argv[3], 10);
      if (!id) throw new Error("usage: render <postId>");
      const post = await stepRenderVideo(id);
      console.log(JSON.stringify(post, null, 2));
      break;
    }
    case "post": {
      const id = parseInt(process.argv[3], 10);
      if (!id) throw new Error("usage: post <postId>");
      const post = await stepPostToTikTok(id);
      console.log(JSON.stringify(post, null, 2));
      break;
    }
    case "run-once": {
      await runOnce({ skipPost: process.argv.includes("--no-post") });
      break;
    }
    case "tiktok-auth": {
      await tiktokAuthFlow();
      break;
    }
    default:
      console.log(`Commands:
  generate            - draft a new script
  render <postId>     - render via HeyGen
  post <postId>       - publish to TikTok
  run-once [--no-post]- end-to-end
  tiktok-auth         - launch OAuth flow, prints tokens to paste into .env`);
  }
}

// Spins up a one-shot HTTP server to catch the OAuth redirect.
async function tiktokAuthFlow() {
  const state = crypto.randomBytes(8).toString("hex");
  const url = buildAuthUrl(state);
  console.log(`\nOpen this URL in your browser to authorize Monty's TikTok account:\n\n${url}\n`);

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url ?? "/", `http://localhost:${config.dashboard.port}`);
        if (u.pathname !== "/oauth/tiktok/callback") {
          res.writeHead(404).end("not found");
          return;
        }
        const code = u.searchParams.get("code");
        const gotState = u.searchParams.get("state");
        if (!code || gotState !== state) {
          res.writeHead(400).end("bad state or missing code");
          reject(new Error("oauth state/code mismatch"));
          return;
        }
        const tokens = await exchangeCodeForTokens(code);
        res.writeHead(200, { "Content-Type": "text/html" }).end(
          `<h1>Monty is connected to TikTok.</h1><p>You can close this tab and check the terminal for the .env values.</p>`,
        );

        console.log(`\n--- paste into .env ---`);
        console.log(`TIKTOK_ACCESS_TOKEN=${tokens.accessToken}`);
        console.log(`TIKTOK_REFRESH_TOKEN=${tokens.refreshToken}`);
        console.log(`TIKTOK_OPEN_ID=${tokens.openId}`);
        console.log(`-----------------------\n`);
        server.close();
        resolve();
      } catch (err) {
        try {
          res.writeHead(500).end(String(err));
        } catch {}
        reject(err);
      }
    });
    server.listen(config.dashboard.port, () => {
      console.log(`Listening on http://localhost:${config.dashboard.port}/oauth/tiktok/callback for redirect…`);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
