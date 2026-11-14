# Submission and storage migration

The handwritten-validator inventory is now migrated:

- `formValidation.ts` owns shared nonempty-name, MusicBrainz ID, HTTP/HTTPS,
  album submission, music-link, listening submission, and import-mapping schemas.
  Album, catalog, and listening readers use `safeParse` after extraction. Live
  uniqueness, MusicBrainz identity conflicts, genre cycles, album/entry existence,
  first-error display/focus, and persistence remain in their existing features.
- Album release-year range/step feedback stays with native number constraints;
  the schema retains the existing `Number(value) || null` conversion. Native
  listening constraints remain, with date/rating/note schema checks before any
  library mutation. Blank notes remain empty strings.
- Import mappings use a record schema, retaining individually valid string values
  rather than rejecting a mapping because another value is invalid.
- `storageValidation.ts` replaces the demo, catalog, account-cache, and route-history
  checks with separate schemas for their existing formats. No persisted JSON is
  coerced. Unknown stored fields survive loading, including legacy instrumentation
  used by the demo upgrade. Account ownership and browser route-marker matching
  remain checks against live context.

The demo/cache schemas intentionally mirror their earlier minimum checks, which
are looser than the draft contract. Their compatibility guards retain the original
objects and existing domain narrowing rather than treating a partial legacy schema
as a complete `Album` or `LibraryData` schema. In particular, cache v1 still only
checks that links/listening entries are arrays. Completing those nested contracts
and normalizing older rows is separate compatibility work; this migration does
not claim to fix the earlier incomplete narrowing. Draft parsing still uses its
full typed contract, cloning, and unknown-field preservation.

Regression coverage includes malformed and legacy data, demo instrumentation
upgrades, blocked storage, account isolation, mapping filtering, URL credentials
and protocols, blank/numeric conversions, native listening limits, and browser
first-error focus with retained values through retry. Existing browser flows cover
catalog uniqueness/hierarchy, reloads, imports, navigation, and account saves.

The initial regular-Zod migration increased the main JavaScript bundle from
47.42 KB to 72.37 KB gzipped. This migration increases the current main chunk from
72.44 KB to 73.33 KB gzipped (production Vite build). Measure again as schemas
expand; consider Zod Mini if bundle weight warrants it.
