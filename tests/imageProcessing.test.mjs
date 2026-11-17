import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourceUrl,
  limitedBytes,
  downloadImage,
  optimizeImage,
} from "../worker/imageProcessing.ts";
import worker from "../worker/index.ts";

function binding(
  sizes,
  info = { format: "image/jpeg", width: 1000, height: 1000 },
) {
  const transforms = [];
  let infos = 0;
  return {
    transforms,
    async info() {
      return infos++ === 0
        ? info
        : { format: "image/webp", width: 512, height: 512 };
    },
    input() {
      return {
        transform(options) {
          transforms.push(options);
          return {
            async output(options) {
              assert.deepEqual(options.format, "image/webp");
              assert.equal(options.anim, false);
              return {
                response: () =>
                  new Response(new Uint8Array(sizes.shift() ?? 110000)),
              };
            },
          };
        },
      };
    },
  };
}

test("URL validation rejects local networks, credentials, alternate IP spellings and ports", () => {
  for (const url of [
    "file:///etc/passwd",
    "https://localhost/a",
    "http://127.1/a",
    "http://0x7f000001",
    "http://[::1]/",
    "https://a.local/image",
    "https://a.internal/image",
    "https://user:pass@images.net/a",
    "https://images.net:8443/a",
  ])
    assert.throws(() => sourceUrl(url));
  assert.equal(
    sourceUrl("https://images.net/a?size=100#fragment").href,
    "https://images.net/a?size=100",
  );
});

test("streamed downloads are size limited even without content-length", async () => {
  await assert.rejects(
    limitedBytes(new Response(new Uint8Array(11)), 10),
    /size limit/,
  );
  assert.equal(
    (await limitedBytes(new Response(new Uint8Array(10)), 10)).byteLength,
    10,
  );
});

test("optimization targets 50KB, never upscales and falls back under the hard ceiling", async () => {
  const normal = binding([40000]);
  assert.equal(
    (await optimizeImage(new Uint8Array(10), normal)).bytes.byteLength,
    40000,
  );
  assert.deepEqual(normal.transforms, [
    { width: 768, height: 768, fit: "scale-down" },
  ]);
  const detailed = binding([200000, 140000, 110000, 80000, 70000]);
  assert.equal(
    (await optimizeImage(new Uint8Array(10), detailed)).bytes.byteLength,
    70000,
  );
  assert.equal(detailed.transforms.length, 5);
  await assert.rejects(
    optimizeImage(new Uint8Array(10), binding([])),
    /100 KB/,
  );
  for (const info of [
    { format: "image/svg+xml" },
    { format: "image/png", width: 10000, height: 10000 },
  ])
    await assert.rejects(
      optimizeImage(new Uint8Array(10), binding([], info)),
      /40 megapixels/,
    );
});

test("redirect destinations and DNS answers are checked before fetching source bytes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://cloudflare-dns.com"))
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "93.184.215.14" }],
      });
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/metadata" },
    });
  };
  try {
    await assert.rejects(downloadImage("https://images.net/a"), /public HTTP/);
    assert.equal(
      calls.filter((url) => !url.startsWith("https://cloudflare-dns.com"))
        .length,
      1,
    );
    globalThis.fetch = async () =>
      Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] });
    await assert.rejects(
      downloadImage("https://images.net/a"),
      /public addresses/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker preserves asset delivery and fails closed without configuration or authentication", async () => {
  let assets = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assets++;
        return new Response("shell");
      },
    },
  };
  assert.equal(
    await (await worker.fetch(new Request("https://sleeve.net/"), env)).text(),
    "shell",
  );
  const response = await worker.fetch(
    new Request("https://sleeve.net/api/images/import", { method: "POST" }),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal(assets, 1);
  Object.assign(env, {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    IMAGES: {},
  });
  const unauthorized = await worker.fetch(
    new Request("https://sleeve.net/api/images/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"url":"https://images.net/a"}',
    }),
    env,
  );
  assert.equal(unauthorized.status, 401);
});
