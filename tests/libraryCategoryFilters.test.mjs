import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryChoices } from "../src/app/libraryCategoryFilters.ts";

const data = {
  genres: [
    { id: "jazz", name: "Jazz", parentGenreId: null },
    { id: "bebop", name: "Bebop", parentGenreId: "jazz" },
    { id: "house", name: "House", parentGenreId: null },
  ],
  artists: [
    { id: "primary", name: "Leader" },
    { id: "guest", name: "Guest" },
  ],
  instruments: [
    { id: "piano", name: "Piano" },
    { id: "drums", name: "Drums" },
  ],
  albums: [
    {
      genres: [{ id: "bebop" }],
      artists: [
        { id: "primary", role: "primary" },
        { id: "guest", role: "sideman" },
      ],
      instruments: [{ id: "piano" }, { id: "piano" }, { id: "drums" }],
    },
    {
      genres: [{ id: "jazz" }, { id: "bebop" }],
      artists: [{ id: "primary", role: "primary" }],
      instruments: [{ id: "piano" }],
    },
  ],
};

test("suggestions rank album counts with alphabetical ties and count each album once", () => {
  assert.deepEqual(
    categoryChoices(data, "genres", [], "").map(({ name, count }) => [
      name,
      count,
    ]),
    [
      ["Bebop", 2],
      ["Jazz", 2],
      ["House", 0],
    ],
  );
  assert.deepEqual(
    categoryChoices(data, "artists", [], "").map(({ name, count }) => [
      name,
      count,
    ]),
    [
      ["Leader", 2],
      ["Guest", 0],
    ],
  );
  assert.deepEqual(
    categoryChoices(data, "instruments", [], "").map(({ name, count }) => [
      name,
      count,
    ]),
    [
      ["Piano", 2],
      ["Drums", 1],
    ],
  );
});

test("search is case insensitive, omits selected choices, and restores removed choices if relevant", () => {
  assert.deepEqual(categoryChoices(data, "genres", ["jazz"], " JAZ "), []);
  assert.deepEqual(
    categoryChoices(data, "genres", [], " JAZ ").map((item) => item.id),
    ["jazz"],
  );
  assert.deepEqual(categoryChoices(data, "genres", [], "missing"), []);
});
