# Codebase guideline refactor

Apply AGENTS.md across handwritten source in small, reviewable PRs. Inspect every
module; change it only when a guideline improves its contracts or ownership.
Leave generated files alone. Preserve behavior, storage formats, selectors, live
state getters, draft cloning, and asynchronous lifecycle guards.

## Batches

- [x] Explicit boundaries: annotate exported functions (including arrow helpers),
      name dependency objects, and define named result contracts for larger shapes.
      Keep existing dependency access and runtime behavior intact.
- [x] Stateful ownership: review metadata search, dialog, and editor drafts for
      class conversion. Metadata search, dialog, and editor drafts are complete.
      Keep small factories as functions; group each remaining batch in one PR.
- [x] Domain contracts: tighten draft modes/actions and validate persisted/DOM
      strings. Reduce casts through shared contracts. Draft targets now form a
      discriminated union with validated nested snapshots; album modes are shared
      across editors and metadata search. DOM auth modes, import suggestion kinds,
      and image-preview instrument categories are checked before use. Existing
      action switches already narrow recognized actions and ignore unknown values.
- [x] Focused cleanup: reviewed rendering, fallback chains, dependency scope,
      HTML annotations, and logical spacing. Shared catalog form footers and
      metadata library matching; named album and genre choice fallbacks. Converted
      remaining HTML fragments in views/controllers to annotated templates and
      named field options. Existing feature dependencies retain their focused
      capabilities and live getters; small helpers and generated files stay intact.
- [ ] Evaluate automated enforcement of objective rules after cleanup; keep
      architectural decisions under review rather than imposing blanket rewrites.

## Workflow

Inventory gaps with syntax-aware tooling and targeted searches. Separate
mechanical changes from structural work. Review inferred types before annotating;
include null/undefined where runtime values can be absent. Do not add layers or
convert functions solely for consistency.

For each batch, run the production TypeScript build, existing unit tests,
formatting checks for changed files, and `git diff --check`. Run relevant browser
coverage for affected flows; use the full browser suite for broad source changes.
Record validation and remaining limits in the PR. Publish each completed batch
using the repository's publish-pr skill. The earlier structural refactor history
is in [implementation/refactor-plan.md](implementation/refactor-plan.md).

## Validation going forward

Use Zod for new or substantially modified form-value validation and persisted-data
validation. Extract values from `FormData`, then use a focused schema and
`safeParse`; avoid building new handwritten schema/check frameworks. Infer types
from schemas when the schema owns the contract. For existing shared domain types,
check schema compatibility with `satisfies z.ZodType<Contract>` rather than casting
the parsed result. Keep generated database types unchanged.

Keep draft schemas separate from submission schemas: unfinished edits may contain
blank required fields. Retain native HTML constraints for immediate feedback;
keep error display/focus, asynchronous work, and library-dependent rules (such as
uniqueness and genre cycles) in their existing focused responsibilities. Reuse
field schemas where their semantics match, without forcing draft, form, and
storage formats into one schema.

Preserve existing trimming, empty-string/null handling, numeric conversion, error
messages, validation order, and storage compatibility when migrating. Do not
coerce persisted JSON or strip unknown stored fields unintentionally. Draft
loading now uses Zod with explicit unknown-field preservation and no coercion;
regression coverage checks malformed snapshots and parsed-data isolation.

### Follow-up inventory

Earlier refactors improved ownership and contracts but left these handwritten
validators in place. Migrate them incrementally with their relevant browser
coverage; they are follow-up work, not completed by the draft migration:

- `albumEditor.ts`: `saveAlbumForm` and `readMusicLinks` repeat title, year,
  artwork, and music-link validation. Introduce submission schemas while
  preserving HTTP/HTTPS URL rules and the editor's first-error focus behavior.
- `artistFeature.ts`, `genreFeature.ts`, and `instrumentFeature.ts`:
  `readArtistForm`, `readGenreForm`, and `readInstrumentForm` already separate
  extraction/validation from orchestration. Replace their scalar checks with
  schemas; retain catalog uniqueness, MusicBrainz identity conflicts, and genre
  hierarchy checks against live library state.
- `listening.ts`: `saveListenForm` can share explicit rating/date/note submission
  rules while keeping album/entry existence checks and persistence separate.
- `storage.ts`, `libraryCache.ts`, and `routeHistory.ts`: replace handwritten
  persisted-snapshot checks with schemas appropriate to each version. Preserve
  legacy demo upgrades, account isolation, storage-failure fallback behavior,
  and route-marker checks. Do not assume the draft album schema accepts every
  older demo/cache format.
- `albumEditor.ts`: `readMappings` can use a record schema while retaining its
  current behavior of filtering invalid entries rather than rejecting the whole
  mapping. Simple DOM enum guards and action switches need no blanket rewrite.

The initial regular-Zod migration increases the main JavaScript bundle from
47.42 KB to 72.37 KB gzipped (production Vite build). Measure again as schemas
expand; consider Zod Mini if bundle weight warrants it.
