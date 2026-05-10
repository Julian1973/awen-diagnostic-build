import axios, { AxiosInstance } from "axios";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const HEYGEN_API = "https://api.heygen.com";

export interface HeyGenVideoResult {
  videoId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSec?: number;
}

export class HeyGenClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: HEYGEN_API,
      headers: {
        "X-Api-Key": config.heygen.apiKey(),
        "Content-Type": "application/json",
      },
      timeout: 60_000,
    });
  }

  // Kick off a video generation. Returns the video_id we'll poll on.
  async generateVideo(spokenScript: string, opts?: { title?: string }): Promise<string> {
    const body = {
      caption: false,
      title: opts?.title ?? "Monty",
      dimension: { width: config.heygen.width, height: config.heygen.height },
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: config.heygen.avatarId(),
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: spokenScript,
            voice_id: config.heygen.voiceId(),
          },
          background: config.heygen.backgroundAssetId
            ? { type: "image", image_asset_id: config.heygen.backgroundAssetId }
            : { type: "color", value: "#0E1116" },
        },
      ],
    };

    const { data } = await this.http.post("/v2/video/generate", body);
    const videoId = data?.data?.video_id;
    if (!videoId) {
      throw new Error(`HeyGen generate response missing video_id: ${JSON.stringify(data)}`);
    }
    return videoId;
  }

  // Poll until the video is rendered (or fail/timeout).
  async waitForVideo(
    videoId: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<HeyGenVideoResult> {
    const interval = opts.intervalMs ?? 10_000;
    const timeout = opts.timeoutMs ?? 15 * 60_000;
    const started = Date.now();

    while (true) {
      const { data } = await this.http.get("/v1/video_status.get", {
        params: { video_id: videoId },
      });
      const status: string = data?.data?.status;
      if (status === "completed") {
        return {
          videoId,
          videoUrl: data.data.video_url,
          thumbnailUrl: data.data.thumbnail_url,
          durationSec: data.data.duration,
        };
      }
      if (status === "failed") {
        throw new Error(`HeyGen video failed: ${JSON.stringify(data)}`);
      }
      if (Date.now() - started > timeout) {
        throw new Error(`HeyGen video timed out after ${timeout}ms (status=${status})`);
      }
      await sleep(interval);
    }
  }

  // Pull the rendered file local so we can upload to TikTok.
  async downloadVideo(videoUrl: string, destDir: string, filename: string): Promise<string> {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, filename);
    const resp = await axios.get(videoUrl, { responseType: "stream", timeout: 120_000 });
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      resp.data.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
    return dest;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
