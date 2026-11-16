import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ancestors,
  includesGenre,
  normalizeGenres,
  upgradeGenre,
} from "../src/app/genres.ts";

const catalog = () => [
  { id: "music", name: "Music", parentGenreIds: [] },
  { id: "jazz", name: "Jazz", parentGenreIds: ["music"] },
  { id: "house", name: "House", parentGenreIds: ["music"] },
  { id: "fusion", name: "Jazz House", parentGenreIds: ["jazz", "house"] },
];

test("ancestors traverse all branches and deduplicate shared ancestors", () => {
  assert.deepEqual(
    new Set(ancestors("fusion", catalog()).map((genre) => genre.id)),
    new Set(["jazz", "house", "music"]),
  );
  const album = { genres: [{ id: "fusion" }, { id: "jazz" }] };
  for (const id of ["fusion", "jazz", "house", "music"])
    assert.equal(includesGenre(album, id, catalog()), true);
  assert.equal(includesGenre(album, "other", catalog()), false);
});

test("traversal terminates on corrupt cycles and missing parents", () => {
  const genres = catalog();
  genres[0].parentGenreIds = ["fusion", "missing"];
  assert.equal(ancestors("fusion", genres).length, 3);
  assert.deepEqual(ancestors("missing", genres), []);
});

test("normalization preserves explicit parent tags, primary choice, and independent arrays", () => {
  const genres = catalog();
  const selected = [
    { ...genres[1], isPrimary: true },
    { ...genres[3], isPrimary: false },
    { ...genres[2], isPrimary: false },
  ];
  const result = normalizeGenres([...selected, selected[1]], genres);
  assert.deepEqual(
    result.map((genre) => genre.id),
    ["jazz", "fusion", "house"],
  );
  assert.deepEqual(
    result.filter((genre) => genre.isPrimary).map((genre) => genre.id),
    ["jazz"],
  );
  result[1].parentGenreIds.push("another");
  assert.deepEqual(genres[3].parentGenreIds, ["jazz", "house"]);
});

test("legacy genres upgrade without retaining the single-parent field", () => {
  assert.deepEqual(
    upgradeGenre({ id: "g", name: "G", parentGenreId: "jazz" }),
    { id: "g", name: "G", parentGenreIds: ["jazz"] },
  );
  assert.deepEqual(upgradeGenre({ id: "g", name: "G", parentGenreId: null }), {
    id: "g",
    name: "G",
    parentGenreIds: [],
  });
});

test("an explicit empty parent list takes precedence over a legacy field", () => {
  assert.deepEqual(
    upgradeGenre({
      id: "g",
      name: "G",
      parentGenreIds: [],
      parentGenreId: "jazz",
    }).parentGenreIds,
    [],
  );
});

test("depths use the shortest path from any root regardless of catalog order", async () => {
  const { genreDepths } = await import("../src/app/genres.ts");
  const genres = [
    { id: "deep", parentGenreIds: ["middle"] },
    { id: "fusion", parentGenreIds: ["deep", "other-root"] },
    { id: "middle", parentGenreIds: ["root"] },
    { id: "root", parentGenreIds: [] },
    { id: "other-root", parentGenreIds: [] },
    { id: "leaf", parentGenreIds: ["fusion", "deep"] },
    { id: "orphan", parentGenreIds: ["missing"] },
  ];
  const depths = genreDepths(genres);
  assert.equal(depths.get("root"), 0);
  assert.equal(depths.get("middle"), 1);
  assert.equal(depths.get("deep"), 2);
  assert.equal(depths.get("fusion"), 1);
  assert.equal(depths.get("leaf"), 2);
  assert.equal(depths.has("orphan"), false);
});

test("breadcrumbs preserve every route through a diamond and multiple roots", async () => {
  const { genrePaths } = await import("../src/app/genres.ts");
  const genres = catalog();
  genres.push({ id: "dance", name: "Dance", parentGenreIds: [] });
  genres[2].parentGenreIds.push("dance");
  assert.deepEqual(
    genrePaths("fusion", genres).map((path) =>
      path.map((genre) => genre.name).join(" › "),
    ),
    [
      "Dance › House › Jazz House",
      "Music › House › Jazz House",
      "Music › Jazz › Jazz House",
    ],
  );
  assert.deepEqual(
    genrePaths("music", genres).map((path) => path.map((genre) => genre.id)),
    [["music"]],
  );
  assert.deepEqual(genrePaths("missing", genres), []);
});

test("breadcrumbs skip broken and cyclic branches while keeping valid root paths", async () => {
  const { genrePaths } = await import("../src/app/genres.ts");
  const genres = catalog();
  genres[1].parentGenreIds = ["fusion", "missing"];
  assert.deepEqual(
    genrePaths("fusion", genres).map((path) => path.map((genre) => genre.id)),
    [["music", "house", "fusion"]],
  );
});
