import { ImageImportError } from "./contracts.ts";
import type { WorkerEnv } from "./contracts.ts";
import { ImageStorage } from "./imageStorage.ts";
import { limitedBytes } from "./imageProcessing.ts";

async function authenticatedUser(
  request: Request,
  env: WorkerEnv,
): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new ImageImportError("Sign in to import images.", 401);

  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
    {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new ImageImportError("Your session expired. Sign in again.", 401);
  }
  const user = (await response.json()) as { id?: string };
  if (!user.id || !/^[a-f0-9-]{36}$/i.test(user.id))
    throw new ImageImportError("Invalid account.", 401);
  return user.id;
}

function configured(env: WorkerEnv): boolean {
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_PUBLISHABLE_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.IMAGES,
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/images/import") return env.ASSETS.fetch(request);
    if (request.method !== "POST")
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });

    try {
      if (!configured(env))
        throw new ImageImportError(
          "Image importing is not configured. See the image storage setup guide.",
          503,
        );
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new ImageImportError(
          "Cross-origin image importing is not allowed.",
          403,
        );
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new ImageImportError("Expected a JSON request.", 415);

      const userId = await authenticatedUser(request, env);
      const { success } = await env.IMAGE_IMPORT_LIMITER.limit({ key: userId });
      if (!success)
        throw new ImageImportError(
          "Too many image imports. Wait a minute and retry.",
          429,
        );
      const body = await limitedBytes(
        new Response(request.body, { headers: request.headers }),
        8192,
      );
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder().decode(body));
      } catch {
        throw new ImageImportError("Invalid image request.");
      }
      if (!input || typeof input !== "object" || !("url" in input))
        throw new ImageImportError("An image URL is required.");

      const imageUrl = await new ImageStorage(env).import(userId, input.url);
      return Response.json(
        { url: imageUrl },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const known = error instanceof ImageImportError;
      return Response.json(
        {
          error: known
            ? error.message
            : "Could not import this image. Check the URL and retry, or clear the image field to save without it.",
        },
        {
          status: known ? error.status : 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  },
  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    if (configured(env)) await new ImageStorage(env).cleanup();
  },
};
