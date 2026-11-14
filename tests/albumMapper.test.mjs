import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAlbum } from "../src/services/albumMapper.ts";

const row = () => ({
  id: "album",
  title: "Title",
  sort_title: null,
  record_label: null,
  release_year: null,
  artwork_url: null,
  musicbrainz_release_group_id: null,
  created_at: "created",
  updated_at: "updated",
  album_artists: [],
  album_genres: [],
  album_instruments: [],
  album_links: [],
  listening_entries: [],
});

test("album mapper skips absent joins and keeps nullable album metadata", () => {
  const input = row();
  input.album_artists = [{ artists: null, position: 0, role: "primary" }];
  input.album_genres = [{ genres: null, is_primary: true }];
  input.album_instruments = [{ instruments: null, notes: null }];
  const result = mapAlbum(input);
  assert.deepEqual(result.artists, []);
  assert.deepEqual(result.genres, []);
  assert.deepEqual(result.instruments, []);
  assert.equal(result.recordLabel, undefined);
  assert.equal(result.releaseYear, null);
  assert.equal(result.createdAt, "created");
  assert.equal(result.updatedAt, "updated");
});

test("album mapper preserves credit positions, primary genre ordering, instrument categories, and newest listens", () => {
  const input = row();
  input.album_artists = [2, 0, 1].map((position) => ({
    position,
    role: position === 0 ? "primary" : "featured",
    artists: {
      id: `artist${position}`,
      name: `Artist ${position}`,
      photo_url: "photo",
    },
  }));
  input.album_genres = [
    { genres: { id: "z", name: "Z", parent_genre_id: null }, is_primary: true },
    { genres: { id: "b", name: "B", parent_genre_id: "z" }, is_primary: false },
    { genres: { id: "a", name: "A", parent_genre_id: "z" }, is_primary: false },
  ];
  input.album_instruments = ["Z", "A"].map((name) => ({
    notes: `${name} notes`,
    instruments: {
      id: name,
      name,
      image_url: "image",
      instrument_categories: [{ category: "brass" }],
    },
  }));
  input.album_links = [{ id: "link", url: "https://example.com", label: null }];
  input.listening_entries = ["2026-01-01", "2026-03-01", "2026-02-01"].map(
    (date) => ({
      id: date,
      listened_at: date,
      rating: 8,
      notes: null,
      created_at: date,
      updated_at: date,
    }),
  );
  const before = structuredClone(input);
  const result = mapAlbum(input);
  assert.deepEqual(
    result.artists.map((artist) => artist.position),
    [0, 1, 2],
  );
  assert.equal(result.artists[1].role, "featured");
  assert.deepEqual(
    result.genres.map((genre) => genre.id),
    ["z", "a", "b"],
  );
  assert.equal(result.genres[1].parentGenreId, "z");
  assert.deepEqual(
    result.instruments.map((instrument) => instrument.name),
    ["A", "Z"],
  );
  assert.deepEqual(result.instruments[0].categories, ["brass"]);
  assert.equal(result.instruments[0].notes, "A notes");
  assert.deepEqual(result.links, input.album_links);
  assert.deepEqual(
    result.listeningEntries.map((entry) => entry.listenedAt),
    ["2026-03-01", "2026-02-01", "2026-01-01"],
  );
  assert.deepEqual(input, before);
});
