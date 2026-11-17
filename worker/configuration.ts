import { ImageImportError } from "./contracts.ts";
import type { WorkerEnv } from "./contracts.ts";

export function validateImageConfiguration(env: WorkerEnv): void {
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const) {
    const value = env[name];
    if (typeof value !== "string" || !value.trim())
      throw new ImageImportError(
        `Image importing requires the Worker setting ${name}. See docs/image-storage.md.`,
        503,
      );
    if (
      value !== value.trim() ||
      /[\r\n]/.test(value) ||
      /^["']|["']$/.test(value)
    )
      throw new ImageImportError(
        `The Worker setting ${name} contains quotes or whitespace. Set its value only, without quotes or a variable name.`,
        503,
      );
  }

  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw invalidSupabaseUrl();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw invalidSupabaseUrl();

  if (!env.IMAGES || !env.IMAGE_IMPORT_LIMITER)
    throw new ImageImportError(
      "Image importing requires the IMAGES and IMAGE_IMPORT_LIMITER Worker bindings. Deploy using wrangler.jsonc.",
      503,
    );
}

function invalidSupabaseUrl(): ImageImportError {
  return new ImageImportError(
    "The Worker setting SUPABASE_URL must be the project URL only, such as https://your-project.supabase.co. Do not include SUPABASE_URL= or quotes.",
    503,
  );
}
