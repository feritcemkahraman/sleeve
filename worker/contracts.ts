// Narrow platform contracts keep application code independent of generated runtime types.
export interface ImageInfo {
  format: string;
  width?: number;
  height?: number;
}

export interface ImageBinding {
  info(stream: ReadableStream<Uint8Array>): Promise<ImageInfo>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; height: number; fit: "scale-down" }): {
      output(options: {
        format: "image/webp";
        quality: number;
        anim: false;
      }): Promise<{
        response(): Response;
      }>;
    };
  };
}

export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMAGES: ImageBinding;
  IMAGE_IMPORT_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export class ImageImportError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
