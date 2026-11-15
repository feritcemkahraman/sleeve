import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryUrl, parseLibraryUrl } from "../src/app/libraryUrl.ts";

test("library URLs round trip search and every filter type", () => {
  const state = {
    query: "Miles & Coltrane + / ?",
    filters: {
      rating: { operator: "between", min: 3.5, max: 5 },
      releaseYear: { operator: "eq", value: 1965 },
      genres: { ids: ["a&b", "jazz"] },
      artists: { ids: ["artist"] },
      instruments: { ids: ["piano", "bass"] },
      vinylStatus: ["owned", "wishlisted"],
    },
  };
  assert.deepEqual(parseLibraryUrl(libraryUrl(state)), state);
  for (const filter of [
    { operator: "unset" },
    { operator: "eq", value: 4.5 },
    { operator: "gte", value: 3 },
    { operator: "lte", value: 5 },
  ]) {
    assert.deepEqual(
      parseLibraryUrl(libraryUrl({ filters: { rating: filter } })).filters
        .rating,
      filter,
    );
  }
});

test("malformed URL values do not create invalid predicates", () => {
  assert.deepEqual(
    parseLibraryUrl(
      "#library?rating=Infinity&yearMin=1970&yearMax=1960&vinyl=no&genres=&unknown=x",
    ),
    { query: "", filters: {} },
  );
  assert.deepEqual(parseLibraryUrl("#"), { query: "", filters: {} });
  assert.deepEqual(parseLibraryUrl("#library?rating=4.1").filters, {});
});
