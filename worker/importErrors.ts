import { ImageImportError } from "./contracts.ts";

export type ImageImportStage =
  | "authentication"
  | "rate-limit"
  | "asset-lookup"
  | "download"
  | "image-processing"
  | "asset-registration"
  | "upload"
  | "asset-ready";

const messages: Record<ImageImportStage, string> = {
  authentication:
    "Could not contact Supabase Auth. Check the Worker's SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY settings.",
  "rate-limit":
    "The image import rate limiter is unavailable. Check the IMAGE_IMPORT_LIMITER Worker binding.",
  "asset-lookup":
    "Could not look up stored images. Check the Worker's Supabase settings and image storage migration.",
  download: "Could not download the source image. Check its URL and retry.",
  "image-processing":
    "Cloudflare could not process this image. Check Images availability for your account and retry.",
  "asset-registration":
    "Could not register the image. Check the image storage migration and Worker Supabase credentials.",
  upload:
    "Could not upload the optimized image to Supabase Storage. Please retry.",
  "asset-ready":
    "Could not finish registering the uploaded image. Please retry.",
};

export async function imageImportStep<T>(
  stage: ImageImportStage,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ImageImportError) throw error;

    // Provider messages can contain signed source URLs or credentials. Log only
    // the stage, a constrained error class, and a numeric provider error code.
    const name =
      error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name)
        ? error.name
        : "Error";
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "number"
        ? error.code
        : undefined;
    console.error("image_import_failed", { stage, name, code });
    const suffix = code === undefined ? "" : ` (provider code ${code})`;
    throw new ImageImportError(`${messages[stage]}${suffix}`, 502);
  }
}
