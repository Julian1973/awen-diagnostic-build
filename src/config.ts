import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  anthropic: {
    apiKey: () => required("ANTHROPIC_API_KEY"),
    model: optional("CLAUDE_MODEL", "claude-sonnet-4-6"),
  },
  heygen: {
    apiKey: () => required("HEYGEN_API_KEY"),
    avatarId: () => required("HEYGEN_AVATAR_ID"),
    voiceId: () => required("HEYGEN_VOICE_ID"),
    width: parseInt(optional("HEYGEN_WIDTH", "720"), 10),
    height: parseInt(optional("HEYGEN_HEIGHT", "1280"), 10),
    backgroundAssetId: optional("HEYGEN_BACKGROUND_ASSET_ID"),
  },
  tiktok: {
    clientKey: () => required("TIKTOK_CLIENT_KEY"),
    clientSecret: () => required("TIKTOK_CLIENT_SECRET"),
    redirectUri: optional("TIKTOK_REDIRECT_URI", "http://localhost:3000/oauth/tiktok/callback"),
    accessToken: () => optional("TIKTOK_ACCESS_TOKEN"),
    refreshToken: () => optional("TIKTOK_REFRESH_TOKEN"),
    openId: () => optional("TIKTOK_OPEN_ID"),
    privacyLevel: optional("TIKTOK_PRIVACY_LEVEL", "PUBLIC_TO_EVERYONE"),
  },
  scheduler: {
    morningCron: optional("POST_CRON_MORNING", "0 8 * * *"),
    eveningCron: optional("POST_CRON_EVENING", "0 19 * * *"),
    tz: optional("TZ", "America/Los_Angeles"),
  },
  dashboard: {
    port: parseInt(optional("PORT", "3000"), 10),
    token: optional("DASHBOARD_TOKEN", "changeme"),
  },
  paths: {
    db: "data/monty.db",
    outbox: "outbox",
  },
};
