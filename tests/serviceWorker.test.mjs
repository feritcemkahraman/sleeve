import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

async function navigation(fetchResult, cached = new Response("offline build")) {
  const listeners = new Map();
  let networkRequests = 0;
  let cacheReads = 0;
  runInNewContext(source, {
    self: {
      location: { origin: "https://sleeve.net" },
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
    URL,
    Response,
    caches: {
      open: async () => ({
        match: async () => {
          cacheReads++;
          return cached;
        },
      }),
    },
    fetch: async () => {
      networkRequests++;
      if (fetchResult instanceof Error) throw fetchResult;
      return fetchResult;
    },
  });
  let response;
  listeners.get("fetch")({
    request: { url: "https://sleeve.net/", method: "GET", mode: "navigate" },
    respondWith: (promise) => {
      response = promise;
    },
  });
  return { response: await response, networkRequests, cacheReads };
}

test("online navigation gets the deployed app instead of an older offline shell", async () => {
  const result = await navigation(new Response("new deployed build"));
  assert.equal(await result.response.text(), "new deployed build");
  assert.equal(result.networkRequests, 1);
  assert.equal(result.cacheReads, 0);
});

test("offline navigation and server errors fall back to the completely precached build", async () => {
  for (const failure of [
    new Error("offline"),
    new Response("unavailable", { status: 503 }),
  ]) {
    const result = await navigation(failure);
    assert.equal(await result.response.text(), "offline build");
    assert.equal(result.cacheReads, 1);
  }
  assert.equal(
    (await navigation(new Error("offline"), null)).response.type,
    "error",
  );
});
