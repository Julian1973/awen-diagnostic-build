import axios from "axios";
import fs from "node:fs";
import { config } from "../config";

// TikTok Content Posting API — see https://developers.tiktok.com/doc/content-posting-api-overview
const TIKTOK_API = "https://open.tiktokapis.com";

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresIn: number;
}

export interface TikTokPostResult {
  publishId: string;
  status: string;
  videoId?: string;
  shareUrl?: string;
}

// ---- OAuth ----

export function buildAuthUrl(state: string, scopes = ["user.info.basic", "video.upload", "video.publish"]): string {
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey(),
    response_type: "code",
    scope: scopes.join(","),
    redirect_uri: config.tiktok.redirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TikTokTokens> {
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey(),
    client_secret: config.tiktok.clientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: config.tiktok.redirectUri,
  });
  const { data } = await axios.post(`${TIKTOK_API}/v2/oauth/token/`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    expiresIn: data.expires_in,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey(),
    client_secret: config.tiktok.clientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const { data } = await axios.post(`${TIKTOK_API}/v2/oauth/token/`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    expiresIn: data.expires_in,
  };
}

// ---- Publishing ----

export class TikTokClient {
  private accessToken: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken ?? config.tiktok.accessToken();
    if (!this.accessToken) {
      throw new Error("No TikTok access token. Run `npm run tiktok-auth` first.");
    }
  }

  // Initialize a chunked upload for a local file.
  // Returns publish_id + upload_url to PUT bytes to.
  private async initVideoUpload(fileSize: number): Promise<{ publishId: string; uploadUrl: string; chunkSize: number; totalChunkCount: number }> {
    // Single-chunk for files <=64MB. TikTok requires chunk_size between 5MB and 64MB.
    const chunkSize = Math.min(fileSize, 64 * 1024 * 1024);
    const totalChunkCount = Math.ceil(fileSize / chunkSize);

    const body = {
      post_info: undefined, // set in publish call below for FILE_UPLOAD flow
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    };

    const { data } = await axios.post(`${TIKTOK_API}/v2/post/publish/inbox/video/init/`, body, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (data?.error?.code && data.error.code !== "ok") {
      throw new Error(`TikTok init failed: ${JSON.stringify(data.error)}`);
    }
    return {
      publishId: data.data.publish_id,
      uploadUrl: data.data.upload_url,
      chunkSize,
      totalChunkCount,
    };
  }

  // Direct-publish flow: video posts straight to user's feed.
  private async initDirectPost(opts: {
    title: string;
    fileSize: number;
    privacyLevel: string;
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
  }): Promise<{ publishId: string; uploadUrl: string; chunkSize: number; totalChunkCount: number }> {
    const chunkSize = Math.min(opts.fileSize, 64 * 1024 * 1024);
    const totalChunkCount = Math.ceil(opts.fileSize / chunkSize);

    const body = {
      post_info: {
        title: opts.title.slice(0, 2200),
        privacy_level: opts.privacyLevel,
        disable_comment: opts.disableComment ?? false,
        disable_duet: opts.disableDuet ?? false,
        disable_stitch: opts.disableStitch ?? false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: opts.fileSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    };

    const { data } = await axios.post(`${TIKTOK_API}/v2/post/publish/video/init/`, body, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (data?.error?.code && data.error.code !== "ok") {
      throw new Error(`TikTok direct-post init failed: ${JSON.stringify(data.error)}`);
    }
    return {
      publishId: data.data.publish_id,
      uploadUrl: data.data.upload_url,
      chunkSize,
      totalChunkCount,
    };
  }

  // PUT the file bytes to TikTok's pre-signed upload URL.
  private async uploadFile(uploadUrl: string, filePath: string, chunkSize: number): Promise<void> {
    const fileSize = fs.statSync(filePath).size;
    const fd = fs.openSync(filePath, "r");
    try {
      let offset = 0;
      while (offset < fileSize) {
        const end = Math.min(offset + chunkSize, fileSize) - 1;
        const len = end - offset + 1;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, offset);
        await axios.put(uploadUrl, buf, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(len),
            "Content-Range": `bytes ${offset}-${end}/${fileSize}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        offset = end + 1;
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  private async getPublishStatus(publishId: string): Promise<any> {
    const { data } = await axios.post(
      `${TIKTOK_API}/v2/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    return data;
  }

  // High-level: take a local mp4 + caption and direct-publish to TikTok.
  async postVideo(opts: {
    filePath: string;
    title: string;
    privacyLevel?: string;
  }): Promise<TikTokPostResult> {
    const fileSize = fs.statSync(opts.filePath).size;
    const { publishId, uploadUrl, chunkSize } = await this.initDirectPost({
      title: opts.title,
      fileSize,
      privacyLevel: opts.privacyLevel ?? config.tiktok.privacyLevel,
    });

    await this.uploadFile(uploadUrl, opts.filePath, chunkSize);

    // Poll publish status until terminal state.
    const started = Date.now();
    const timeout = 10 * 60_000;
    while (true) {
      const data = await this.getPublishStatus(publishId);
      const status = data?.data?.status;
      if (status === "PUBLISH_COMPLETE") {
        return {
          publishId,
          status,
          videoId: data?.data?.publicaly_available_post_id?.[0],
          shareUrl: data?.data?.share_url,
        };
      }
      if (status === "FAILED") {
        throw new Error(`TikTok publish failed: ${JSON.stringify(data)}`);
      }
      if (Date.now() - started > timeout) {
        throw new Error(`TikTok publish timeout (last status=${status})`);
      }
      await sleep(5_000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
