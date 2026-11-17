import { test } from "node:test";
import assert from "node:assert/strict";
import { ImageStorage } from "../worker/imageStorage.ts";
import worker from "../worker/index.ts";

const userId = "11111111-1111-4111-8111-111111111111";
function environment() {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-secret",
    IMAGE_IMPORT_LIMITER: { limit: async () => ({ success: true }) },
    IMAGES: {
      info: async () => ({ format: "image/webp", width: 512, height: 512 }),
      input: () => ({
        transform: () => ({
          output: async () => ({
            response: () => new Response(new Uint8Array(40000)),
          }),
        }),
      }),
    },
  };
}

test("authenticated import uploads only transformed bytes, records provenance, and reuses on retry", async () => {
  const originalFetch = globalThis.fetch;
  const env = environment();
  let asset;
  let uploads = 0;
  let downloads = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com")
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "93.184.215.14" }],
      });
    if (url.hostname === "images.net") {
      downloads++;
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers.apikey, undefined);
      return new Response(new Uint8Array(200000));
    }
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer account-token");
      assert.equal(init.headers.apikey, "public-key");
      return Response.json({ id: userId });
    }
    assert.equal(url.hostname, "project.supabase.co");
    assert.equal(init.headers.Authorization, "Bearer server-secret");
    if (url.pathname === "/rest/v1/image_assets") {
      if (init.method === "PATCH") {
        const patch = JSON.parse(init.body);
        if (patch.ready_at) {
          asset.ready_at = patch.ready_at;
          return new Response(null, { status: 204 });
        }
        assert.equal(url.searchParams.get("ready_at"), "not.is.null");
        return Response.json(asset?.ready_at ? [asset] : []);
      }
      assert.equal(init.method, "POST");
      asset = JSON.parse(init.body);
      assert.equal(asset.user_id, userId);
      assert.equal(asset.source_url, "https://images.net/source.png");
      assert.equal(asset.byte_size, 40000);
      assert.equal(asset.pipeline_version, 1);
      assert.equal(asset.width, 512);
      return new Response(null, { status: 201 });
    }
    assert.match(
      url.pathname,
      new RegExp(
        `/storage/v1/object/library-images/${userId}/[a-f0-9-]+.webp$`,
      ),
    );
    assert.equal(init.method, "POST");
    assert.equal(init.body.size, 40000);
    assert.equal(init.headers["Content-Type"], "image/webp");
    assert.equal(init.headers["x-upsert"], "false");
    uploads++;
    return Response.json({ Key: "stored" });
  };
  try {
    const request = () =>
      new Request("https://sleeve.net/api/images/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer account-token",
        },
        body: JSON.stringify({ url: "https://images.net/source.png" }),
      });
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, asset.public_url);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(
      (await (await worker.fetch(request(), env)).json()).url,
      asset.public_url,
    );
    assert.equal(uploads, 1);
    assert.equal(downloads, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration failure prevents uploading untracked objects", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, method: init.method });
    if (url.hostname === "cloudflare-dns.com")
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "93.184.215.14" }],
      });
    if (url.hostname === "images.net")
      return new Response(new Uint8Array(200000));
    if (init.method === "PATCH") return Response.json([]);
    if (url.pathname === "/rest/v1/image_assets")
      return new Response("failed", { status: 500 });
    return Response.json({});
  };
  try {
    await assert.rejects(
      new ImageStorage(environment()).import(
        userId,
        "https://images.net/source.png",
      ),
      /storage is unavailable/,
    );
    assert.equal(
      calls.some((call) => call.path.startsWith("/storage/")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled cleanup deletes Storage objects before removing registry rows; storage failure retains claims", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fail = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname.endsWith("claim_unused_image_assets"))
      return Response.json([
        {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          storage_path: "owner/image.webp",
        },
      ]);
    if (url.pathname.includes("/storage/")) {
      assert.deepEqual(JSON.parse(init.body), {
        prefixes: ["owner/image.webp"],
      });
      return new Response(null, { status: fail ? 500 : 200 });
    }
    assert.equal(init.method, "DELETE");
    assert.equal(url.searchParams.get("deleting_at"), "not.is.null");
    return new Response(null, { status: 204 });
  };
  try {
    await worker.scheduled({}, environment());
    assert.deepEqual(calls, [
      "/rest/v1/rpc/claim_unused_image_assets",
      "/storage/v1/object/library-images",
      "/rest/v1/image_assets",
    ]);
    calls.length = 0;
    fail = true;
    await assert.rejects(
      worker.scheduled({}, environment()),
      /storage is unavailable/,
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
