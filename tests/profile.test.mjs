import { test } from "node:test";
import assert from "node:assert/strict";
import { profileStatistics } from "../src/views/profileView.ts";

const album = (year, entries = []) => ({
  releaseYear: year,
  artists: [{ id: "shared" }],
  listeningEntries: entries,
});

test("profile counts each album's latest rating and preserves empty eras", () => {
  const albums = [
    album(1959, [
      { rating: 10, listenedAt: "2020-01-01" },
      { rating: 6, listenedAt: "2021-01-01" },
    ]),
    album(1971, [{ rating: 10, listenedAt: "2020-01-01" }]),
    album(null),
  ];
  const stats = profileStatistics(albums, "decade");
  assert.equal(stats.albums, 3);
  assert.equal(stats.artists, 1);
  assert.equal(stats.listens, 3);
  assert.equal(stats.average, 4);
  assert.equal(stats.unrated, 1);
  assert.equal(stats.unknownYear, 1);
  assert.equal(stats.ratings[5].count, 1);
  assert.equal(stats.ratings[9].count, 1);
  assert.deepEqual(stats.years, [
    { label: "1950s", count: 1 },
    { label: "1960s", count: 0 },
    { label: "1970s", count: 1 },
  ]);
  const yearly = profileStatistics(albums, "year");
  assert.equal(yearly.years.length, 13);
  assert.deepEqual(yearly.years[1], { label: "1960", count: 0 });
});

test("empty profile has no average or invented year bins", () => {
  const stats = profileStatistics([], "decade");
  assert.equal(stats.average, undefined);
  assert.equal(stats.unrated, 0);
  assert.deepEqual(stats.years, []);
  assert.equal(stats.ratings.length, 10);
});
