import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchReleaseGroups,
  getReleaseGroup,
  MusicBrainzApiError,
} from "../src/services/musicbrainz.ts";

test("shared request queue preserves spacing and recovers from HTTP and network failures", async () => {
  const original = globalThis.fetch;
  const starts = [];
  let releaseFirst;
  globalThis.fetch = async () => {
    starts.push(Date.now());
    if (starts.length === 1) {
      return new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    if (starts.length === 2) throw new Error("offline");
    return Response.json({ id: "last", title: "Recovered" });
  };
  try {
    const pending = Promise.allSettled([
      searchReleaseGroups("first"),
      getReleaseGroup("second"),
      getReleaseGroup("last"),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(starts.length, 1);
    releaseFirst(
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    );
    const results = await pending;
    assert.equal(results[0].status, "rejected");
    assert.ok(results[0].reason instanceof MusicBrainzApiError);
    assert.equal(results[0].reason.status, 429);
    assert.equal(results[0].reason.retryAfter, "2");
    assert.equal(results[1].status, "rejected");
    assert.match(results[1].reason.message, /Unable to reach MusicBrainz/);
    assert.equal(results[2].status, "fulfilled");
    assert.equal(results[2].value.title, "Recovered");
    for (let index = 1; index < starts.length; index++) {
      assert.ok(starts[index] - starts[index - 1] >= 1090);
    }
  } finally {
    globalThis.fetch = original;
  }
});
