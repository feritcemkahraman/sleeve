import { ImageImportError } from "./contracts.ts";
import type { WorkerEnv } from "./contracts.ts";
import { downloadImage, optimizeImage, sourceUrl } from "./imageProcessing.ts";

const BUCKET = "library-images";
const VERSION = 1;

interface ImageAsset {
  id: string;
  public_url: string;
  storage_path: string;
}

export class ImageStorage {
  private readonly env: WorkerEnv;

  constructor(env: WorkerEnv) {
    this.env = env;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(
      `${this.env.SUPABASE_URL.replace(/\/$/, "")}${path}`,
      {
        ...init,
        headers: {
          apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImageImportError(
        "Image storage is unavailable. Check the image storage setup and retry.",
        502,
      );
    }
    return response;
  }

  private async write(path: string, init: RequestInit): Promise<void> {
    const response = await this.request(path, init);
    await response.body?.cancel();
  }

  private async reuse(
    userId: string,
    field: "source_url" | "public_url",
    url: string,
  ): Promise<ImageAsset | undefined> {
    const query = new URLSearchParams({
      user_id: `eq.${userId}`,
      [field]: `eq.${url}`,
      pipeline_version: `eq.${VERSION}`,
      deleting_at: "is.null",
      ready_at: "not.is.null",
      select: "id,public_url,storage_path",
    });
    // Touching under a row lock prevents cleanup racing an import retry.
    const response = await this.request(`/rest/v1/image_assets?${query}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    });
    return ((await response.json()) as ImageAsset[])[0];
  }

  public async import(userId: string, value: unknown): Promise<string> {
    const url = sourceUrl(value).href;
    const existing =
      (await this.reuse(userId, "public_url", url)) ??
      (await this.reuse(userId, "source_url", url));
    if (existing) return existing.public_url;

    const bytes = await downloadImage(url);
    const optimized = await optimizeImage(bytes, this.env.IMAGES);
    const id = crypto.randomUUID();
    const path = `${userId}/${id}.webp`;
    const publicUrl = `${this.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
    // Register first: every uploaded object has cleanup metadata even if a
    // response is lost. Pending assets cannot be reused or attached to a row.
    await this.write("/rest/v1/image_assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        user_id: userId,
        source_url: url,
        public_url: publicUrl,
        storage_path: path,
        byte_size: optimized.bytes.byteLength,
        width: optimized.width,
        height: optimized.height,
        pipeline_version: VERSION,
      }),
    });
    await this.write(`/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: new Blob([new Uint8Array(optimized.bytes)]),
    });
    const query = new URLSearchParams({
      id: `eq.${id}`,
      deleting_at: "is.null",
    });
    await this.write(`/rest/v1/image_assets?${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ready_at: new Date().toISOString() }),
    });
    return publicUrl;
  }

  private async removeObjects(paths: string[]): Promise<void> {
    await this.write(`/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
  }

  public async cleanup(): Promise<void> {
    const response = await this.request(
      "/rest/v1/rpc/claim_unused_image_assets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const assets = (await response.json()) as ImageAsset[];
    if (!assets.length) return;

    await this.removeObjects(assets.map((asset) => asset.storage_path));
    const query = new URLSearchParams({
      id: `in.(${assets.map((asset) => asset.id).join(",")})`,
      deleting_at: "not.is.null",
    });
    await this.write(`/rest/v1/image_assets?${query}`, { method: "DELETE" });
  }
}
