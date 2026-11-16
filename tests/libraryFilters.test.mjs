import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesNumeric,
  matchesCategory,
  matchesLibraryFilters,
} from "../src/app/libraryFilters.ts";

const album = {
  releaseYear: 2000,
  vinylStatus: "owned",
  genres: [{ id: "bebop" }],
  artists: [
    { id: "miles", role: "primary" },
    { id: "guest", role: "sideman" },
  ],
  instruments: [{ id: "piano" }, { id: "drums" }],
  listeningEntries: [
    { listenedAt: "2026-02-01", rating: 8 },
    { listenedAt: "2026-01-01", rating: 10 },
  ],
};
const genres = [
  { id: "jazz", parentGenreIds: [] },
  { id: "bebop", parentGenreIds: ["jazz"] },
];

test("numeric comparisons include range endpoints and exclude missing values", () => {
  for (const [operator, value, expected] of [
    ["eq", 4, true],
    ["gte", 4, true],
    ["lte", 4, true],
  ]) {
    assert.equal(matchesNumeric(4, { operator, value }), expected);
    assert.equal(matchesNumeric(null, { operator, value }), false);
  }
  assert.equal(
    matchesNumeric(2, { operator: "between", min: 2, max: 3 }),
    true,
  );
  assert.equal(
    matchesNumeric(3, { operator: "between", min: 2, max: 3 }),
    true,
  );
  assert.equal(
    matchesNumeric(4, { operator: "between", min: 2, max: 3 }),
    false,
  );
  assert.equal(matchesNumeric(null, { operator: "unset" }), true);
  assert.equal(matchesNumeric(0, { operator: "unset" }), false);
});

test("category any, all, and exact have distinct set semantics", () => {
  assert.equal(
    matchesCategory(["a", "b"], { mode: "any", ids: ["a", "c"] }),
    true,
  );
  assert.equal(
    matchesCategory(["a", "b"], { mode: "all", ids: ["a", "c"] }),
    false,
  );
  assert.equal(matchesCategory(["a", "b"], { mode: "all", ids: ["a"] }), true);
  assert.equal(
    matchesCategory(["a", "b"], { mode: "exact", ids: ["a"] }),
    false,
  );
  assert.equal(
    matchesCategory(["a", "b"], { mode: "exact", ids: ["b", "a"] }),
    true,
  );
  assert.equal(matchesCategory([], { mode: "all", ids: [] }), true);
});

test("album filters combine with AND and use latest displayed rating, primary artists, and genre ancestry", () => {
  const filters = {
    rating: { operator: "eq", value: 4 },
    releaseYear: { operator: "between", min: 1980, max: 2000 },
    genres: { ids: ["jazz", "house"] },
    artists: { ids: ["miles"] },
    instruments: { ids: ["piano", "drums"] },
    vinylStatus: ["owned"],
  };
  assert.equal(matchesLibraryFilters(album, filters, genres), true);
  assert.equal(
    matchesLibraryFilters(
      album,
      { ...filters, vinylStatus: ["wishlisted"] },
      genres,
    ),
    false,
  );
  assert.equal(
    matchesLibraryFilters(
      album,
      { rating: { operator: "eq", value: 5 } },
      genres,
    ),
    false,
  );
  assert.equal(
    matchesLibraryFilters(album, { artists: { ids: ["guest"] } }, genres),
    false,
  );
  assert.equal(
    matchesLibraryFilters(
      album,
      { genres: { ids: ["jazz", "house"] } },
      genres,
    ),
    true,
  );
  assert.equal(
    matchesLibraryFilters(album, { genres: { ids: ["bebop"] } }, genres),
    true,
  );
});

test("unset numeric filters match albums with no metadata", () => {
  const empty = {
    ...album,
    releaseYear: null,
    listeningEntries: [],
    vinylStatus: null,
  };
  assert.equal(
    matchesLibraryFilters(
      empty,
      {
        rating: { operator: "unset" },
        releaseYear: { operator: "unset" },
      },
      genres,
    ),
    true,
  );
  assert.equal(
    matchesLibraryFilters(
      empty,
      { rating: { operator: "lte", value: 5 } },
      genres,
    ),
    false,
  );
});

test("Library fixes category matching to artist/genre unions and instrument intersections", () => {
  assert.equal(
    matchesLibraryFilters(
      album,
      { artists: { ids: ["missing", "miles"] } },
      genres,
    ),
    true,
  );
  assert.equal(
    matchesLibraryFilters(
      album,
      { genres: { ids: ["missing", "bebop"] } },
      genres,
    ),
    true,
  );
  assert.equal(
    matchesLibraryFilters(
      album,
      { instruments: { ids: ["piano", "drums"] } },
      genres,
    ),
    true,
  );
  assert.equal(
    matchesLibraryFilters(
      album,
      { instruments: { ids: ["piano", "trumpet"] } },
      genres,
    ),
    false,
  );
});

test("vinyl selections form a union and empty selection includes albums without a status", () => {
  const wishlist = { ...album, vinylStatus: "wishlisted" };
  const neither = { ...album, vinylStatus: null };
  const either = { vinylStatus: ["owned", "wishlisted"] };
  assert.equal(matchesLibraryFilters(album, either, genres), true);
  assert.equal(matchesLibraryFilters(wishlist, either, genres), true);
  assert.equal(matchesLibraryFilters(neither, either, genres), false);
  assert.equal(
    matchesLibraryFilters(wishlist, { vinylStatus: ["owned"] }, genres),
    false,
  );
  assert.equal(
    matchesLibraryFilters(album, { vinylStatus: ["wishlisted"] }, genres),
    false,
  );
  assert.equal(
    matchesLibraryFilters(neither, { vinylStatus: [] }, genres),
    true,
  );
  assert.equal(matchesLibraryFilters(neither, {}, genres), true);
});
