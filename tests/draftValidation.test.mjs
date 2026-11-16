import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSchema } from "../src/app/draftValidation.ts";
import { mockAlbums } from "../src/data/mockData.ts";

function draft(target = { kind: "album", item: {}, mode: "manual" }) {
  return {
    version: 1,
    target,
    hash: "#library",
    open: false,
    baseline: "{}",
    source: "{}",
    fields: [{ name: "title", id: "", value: "Unfinished", checked: false }],
    links: 0,
    artists: [],
    genres: [],
    instruments: [],
    artistChoices: [],
    genreChoices: [],
    instrumentChoices: [],
  };
}

test("version-one drafts retain every editor target and picker snapshot", () => {
  const album = structuredClone(mockAlbums[0]);
  const targets = [
    { kind: "album", item: {} },
    ...["manual", "edit", "review", "links"].map((mode) => ({
      kind: "album",
      item: album,
      mode,
    })),
    { kind: "artist" },
    { kind: "artist", item: album.artists[0] },
    { kind: "genre", item: album.genres[0] },
    { kind: "instrument", item: album.instruments[0] },
    { kind: "instruments", item: album },
    { kind: "listen", item: album, entry: album.listeningEntries[0] },
  ];
  for (const target of targets) {
    assert.equal(
      draftSchema.safeParse({
        ...draft(target),
        artists: album.artists,
        genres: album.genres,
        instruments: album.instruments,
        artistChoices: album.artists,
        genreChoices: album.genres,
        instrumentChoices: album.instruments,
      }).success,
      true,
      JSON.stringify(target),
    );
  }
});

test("damaged targets and nested snapshots are rejected before restoration", () => {
  const album = structuredClone(mockAlbums[0]);
  const invalid = [
    null,
    { ...draft(), target: { kind: "unknown" } },
    draft({ kind: "album", mode: "unknown" }),
    draft({ kind: "album", item: { title: 42 } }),
    draft({ kind: "album", item: { artists: [null] } }),
    draft({ kind: "listen" }),
    draft({
      kind: "listen",
      item: album,
      entry: { ...album.listeningEntries[0], rating: 11 },
    }),
    { ...draft(), artists: [{ ...album.artists[0], role: "unknown" }] },
    {
      ...draft(),
      instrumentChoices: [
        { id: "i", name: "Piano", categories: ["unknown"], notes: null },
      ],
    },
    { ...draft(), genreChoices: [null] },
    { ...draft(), fields: [{ name: "title", value: "Oops" }] },
    { ...draft(), open: "false" },
    { ...draft(), links: 1001 },
  ];
  for (const value of invalid)
    assert.equal(
      draftSchema.safeParse(value).success,
      false,
      JSON.stringify(value),
    );
});

test("parsing preserves version-one extras and clones nested picker data", () => {
  const value = draft({
    kind: "album",
    item: { title: "", futureField: "kept" },
    mode: "manual",
  });
  value.artists = structuredClone(mockAlbums[0].artists);
  value.futureField = { note: "kept" };
  const result = draftSchema.safeParse(value);
  assert.equal(result.success, true);
  assert.deepEqual(result.data, value);
  result.data.artists[0].name = "Changed parsed selection";
  assert.notEqual(result.data.artists[0].name, value.artists[0].name);
  assert.equal(draftSchema.safeParse({ ...value, links: "1" }).success, false);
});

test("legacy genre trees upgrade throughout a draft while explicit empty parents stay empty", () => {
  const genre = { id: "fusion", name: "Jazz House", parentGenreId: "jazz" };
  const value = draft({ kind: "genre", item: genre });
  value.genreChoices = [genre];
  value.genres = [{ ...genre, isPrimary: true }];
  const parsed = draftSchema.parse(value);
  for (const item of [
    parsed.target.item,
    ...parsed.genreChoices,
    ...parsed.genres,
  ]) {
    assert.deepEqual(item.parentGenreIds, ["jazz"]);
    assert.equal("parentGenreId" in item, false);
  }
  value.genreChoices[0] = { ...genre, parentGenreIds: [] };
  assert.deepEqual(draftSchema.parse(value).genreChoices[0].parentGenreIds, []);
});
