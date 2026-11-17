import { test } from "node:test";
import assert from "node:assert/strict";
import { importLibraryImages } from "../src/services/imageImports.ts";

const empty = () => ({ albums: [], artists: [], instruments: [], genres: [] });

test("changed images import once, unchanged legacy URLs remain, embedded catalogs reconcile", async () => {
  const before = empty();
  before.albums = [
    {
      id: "old",
      artworkUrl: "https://legacy.net/a.jpg",
      artists: [],
      instruments: [],
    },
  ];
  const next = structuredClone(before);
  next.artists = [{ id: "artist", photoUrl: "https://source.net/new.png" }];
  next.instruments = [
    { id: "instrument", imageUrl: "https://source.net/new.png" },
  ];
  next.albums.push({
    id: "new",
    artworkUrl: "https://source.net/new.png",
    artists: [{ id: "artist" }],
    instruments: [{ id: "instrument" }],
  });
  const calls = [];
  const saved = await importLibraryImages(before, next, async (url) => {
    calls.push(url);
    return "https://owned.net/image.webp";
  });
  assert.deepEqual(calls, ["https://source.net/new.png"]);
  assert.equal(saved.albums[0].artworkUrl, before.albums[0].artworkUrl);
  assert.equal(saved.albums[1].artworkUrl, "https://owned.net/image.webp");
  assert.equal(
    saved.albums[1].artists[0].photoUrl,
    "https://owned.net/image.webp",
  );
  assert.equal(
    saved.albums[1].instruments[0].imageUrl,
    "https://owned.net/image.webp",
  );
  assert.equal(next.artists[0].photoUrl, "https://source.net/new.png");
});

test("failed import never mutates either candidate or committed library; clear requires no import", async () => {
  const before = empty();
  before.artists = [{ id: "artist", photoUrl: "https://old.net/a.jpg" }];
  const next = structuredClone(before);
  next.artists[0].photoUrl = "https://new.net/a.jpg";
  const original = structuredClone(next);
  await assert.rejects(
    importLibraryImages(before, next, async () => {
      throw new Error("Unavailable");
    }),
    /Unavailable/,
  );
  assert.deepEqual(next, original);
  next.artists[0].photoUrl = null;
  const result = await importLibraryImages(before, next, async () => {
    assert.fail("Must not import empty selections");
  });
  assert.equal(result.artists[0].photoUrl, null);
  assert.equal(before.artists[0].photoUrl, "https://old.net/a.jpg");
});
