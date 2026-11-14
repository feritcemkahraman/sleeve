import type { Draft, DraftTarget } from "./editorDrafts";
import { isAlbumEditorMode } from "./editorContracts.ts";
import { isInstrumentCategory } from "./instruments.ts";

// Drafts are device-local input, including nested picker snapshots and imported
// album previews. Validate them before they can reach an editor.
type Check = (value: unknown) => boolean;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const text: Check = (value) => typeof value === "string";
const nullableText: Check = (value) => value === null || text(value);
const optionalText: Check = (value) =>
  value === undefined || nullableText(value);
const number: Check = (value) =>
  typeof value === "number" && Number.isFinite(value);
const boolean: Check = (value) => typeof value === "boolean";

function array(value: unknown, check: Check): boolean {
  return Array.isArray(value) && value.every(check);
}

function shape(value: unknown, fields: Record<string, Check>): boolean {
  return (
    object(value) &&
    Object.entries(fields).every(([key, check]) => check(value[key]))
  );
}

const artistFields: Record<string, Check> = {
  id: text,
  name: text,
  sortName: nullableText,
  country: nullableText,
  musicbrainzId: nullableText,
  photoUrl: optionalText,
};
const genreFields: Record<string, Check> = {
  id: text,
  name: text,
  parentGenreId: nullableText,
};
const instrumentFields: Record<string, Check> = {
  id: text,
  name: text,
  imageUrl: optionalText,
  categories: (value) => array(value, isInstrumentCategory),
};
const creditFields: Record<string, Check> = {
  ...artistFields,
  role: (value) =>
    value === "primary" || value === "featured" || value === "other",
  position: (value) => number(value) && Number.isInteger(value),
};
const albumGenreFields: Record<string, Check> = {
  ...genreFields,
  isPrimary: boolean,
};
const albumInstrumentFields: Record<string, Check> = {
  ...instrumentFields,
  notes: nullableText,
};
const entryFields: Record<string, Check> = {
  id: text,
  rating: (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10,
  listenedAt: text,
  notes: nullableText,
  createdAt: text,
  updatedAt: text,
};
const suggestion: Check = (value) => shape(value, { id: text, name: text });
const albumFields: Record<string, Check> = {
  id: text,
  title: text,
  sortTitle: nullableText,
  releaseYear: (value) =>
    value === null || (number(value) && Number.isInteger(value)),
  artworkUrl: nullableText,
  musicbrainzReleaseGroupId: nullableText,
  createdAt: text,
  updatedAt: text,
  sourceId: optionalText,
  recordLabel: optionalText,
  genreSuggestions: (value) => value === undefined || array(value, suggestion),
  instrumentSuggestions: (value) =>
    value === undefined || array(value, suggestion),
  artists: (value) => array(value, (item) => shape(item, creditFields)),
  genres: (value) => array(value, (item) => shape(item, albumGenreFields)),
  instruments: (value) =>
    array(value, (item) => shape(item, albumInstrumentFields)),
  links: (value) =>
    array(value, (item) =>
      shape(item, { id: text, url: text, label: nullableText }),
    ),
  listeningEntries: (value) => array(value, (item) => shape(item, entryFields)),
};

function isDraftTarget(value: unknown): value is DraftTarget {
  if (!object(value)) return false;

  const item = value.item;

  switch (value.kind) {
    case "album":
      return (
        (value.mode === undefined || isAlbumEditorMode(value.mode)) &&
        (value.item === undefined ||
          (object(item) &&
            Object.entries(albumFields).every(
              ([key, check]) => !Object.hasOwn(item, key) || check(item[key]),
            )))
      );
    case "artist":
      return value.item === undefined || shape(value.item, artistFields);
    case "genre":
      return value.item === undefined || shape(value.item, genreFields);
    case "instrument":
      return value.item === undefined || shape(value.item, instrumentFields);
    case "instruments":
      return shape(value.item, albumFields);
    case "listen":
      return (
        shape(value.item, albumFields) &&
        (value.entry === undefined || shape(value.entry, entryFields))
      );
    default:
      return false;
  }
}

export function isDraft(value: unknown): value is Draft {
  return (
    object(value) &&
    value.version === 1 &&
    isDraftTarget(value.target) &&
    typeof value.hash === "string" &&
    (value.hash === "" || value.hash.startsWith("#")) &&
    text(value.baseline) &&
    text(value.source) &&
    boolean(value.open) &&
    typeof value.links === "number" &&
    Number.isInteger(value.links) &&
    value.links >= 0 &&
    value.links <= 1000 &&
    array(value.fields, (field) =>
      shape(field, { name: text, id: text, value: text, checked: boolean }),
    ) &&
    array(value.artists, (item) => shape(item, creditFields)) &&
    array(value.genres, (item) => shape(item, albumGenreFields)) &&
    array(value.instruments, (item) => shape(item, albumInstrumentFields)) &&
    array(value.artistChoices, (item) => shape(item, artistFields)) &&
    array(value.genreChoices, (item) => shape(item, genreFields)) &&
    array(value.instrumentChoices, (item) => shape(item, albumInstrumentFields))
  );
}
