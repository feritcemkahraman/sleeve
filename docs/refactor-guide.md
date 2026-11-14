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
- [x] Evaluate automated enforcement of objective rules after cleanup. Enable
      TypeScript strict mode and a local `npm run typecheck` command. Keep
      architectural decisions under review; see the evaluation below.

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

### Submission and storage migration

The handwritten validators previously inventoried here now use focused Zod
schemas. See the [migration handoff](implementation/validation-migrations.md) for
completed coverage, storage compatibility limits, and current bundle measurements.

The initial regular-Zod migration increases the main JavaScript bundle from
47.42 KB to 72.37 KB gzipped (production Vite build). Measure again as schemas
expand; consider Zod Mini if bundle weight warrants it.

## Local automated evaluation

`npm run typecheck` checks the existing source with TypeScript strict mode;
`npm run build` also runs this check before bundling. `npm run format:check`
checks formatting. Keep these local for now; no CI setup is part of this project.

Strict mode enforces null handling and implicit-any rules, but cannot prove data
returned by JSON parsing matches a domain type. Schema migrations remain separate
work. Strict mode also does not enable `noUncheckedIndexedAccess` or
`exactOptionalPropertyTypes`; evaluate those separately rather than silently
expanding this batch.

Explicit exported return types and class method return types are suitable for
syntax-aware lint rules. A future local lint setup should cover exported arrow
helpers and re-exported local functions as well as declarations, allow inferred
short local callbacks, and exclude generated database types. Prefer established
TypeScript-aware lint rules over a new handwritten parser. The installed
TypeScript 7 package exposes its AST API through explicitly unstable entry points;
using that API for a custom checker would add avoidable maintenance here.

HTML annotations need syntax-aware detection of template literals and their
immediately preceding comments. Searching for `<` alone also matches non-HTML
strings and misses fragments built entirely from interpolations. Prettier formats
annotated HTML but does not enforce the annotation. Keep this under review until a
local rule can be tested against nested templates, attribute fragments, SQL select
strings, and plain text. No regex-based blocking check is introduced.

Class ownership, dependency scope, live getters, snapshot cloning, lifecycle
cancellation, and logical spacing remain review decisions backed by relevant
tests. Do not enforce blanket class conversions, function-size limits, or template
extraction counts.

## Services and views follow-up review

The earlier focused cleanup addressed selected guideline gaps, not every
readability issue in these directories. Schedule these as focused behavior-
preserving PRs; keep validation migration separate from rendering extractions.

- [x] Catalog views: `artistsView.ts` and `instrumentsView.ts` repeatedly scan albums
      and calculate statistics during filtering, comparison, and row rendering.
      Build per-render catalog results once, then use named row and empty-state
      renderers. Preserve primary-artist filtering, unused semantics, tie-breakers,
      selectors, and preview-root support. Keep genre hierarchy semantics distinct.
- [x] `genresView.ts`: separate recursive tree/leaf rendering and alphabetical result
      rendering from the page shell. Name the genre variables and precompute counts
      without changing direct-assignment versus descendant-inclusive behavior.
- [x] `albumDetailView.ts`: replace parallel provider ternary chains in `linkDetails`
      with one named provider decision; extract coherent credits/tags sections where
      nested markup obscures the page structure. Retain URL filtering and escaping.
- [x] `libraryView.ts`: rendering currently normalizes the caller's `state.genre` and
      chooses random featured content. Make those responsibilities explicit before
      attempting a pure-rendering extraction. Tighten sort/layout contracts at their
      input boundaries; preserve current defaults and route/preview parity.
- [x] `authView.ts`: moved mutable mode/busy state and submit listeners into
      `AuthView`, with explicit disposal and stale-result protection. `main.ts`
      tears down authentication before replacing it with loading/library views,
      remounting auth, or hot disposal. Browser coverage characterizes sign-in,
      sign-up confirmation, demo entry, and pending success/failure teardown.
- `services/albums.ts`: the joined-row mapper is already separate from fetching,
  but the select query uses double casts to a handwritten joined-row type. Review
  query-derived contracts and mapper tests, including absent joins and ordering,
  before removing casts. Check callers before retaining or removing CRUD exports.
- `services/wikipedia.ts`: split article resolution, Wikidata enrichment, and
  optional page suggestions into focused helpers with named response contracts.
  Preserve optional enrichment failures, language fallback, suggestion priority,
  and request order. Remove the leftover raw-response `console.log` in that PR.
- `services/appleMusic.ts`: separate store candidate extraction, embed checks,
  and cache coordination. Preserve eight-candidate limits, parallel checks,
  negative results, failed-request eviction, and existing matching behavior.
- `services/musicbrainz.ts`: review queued request ownership and tests for failed
  requests and rate spacing. The module-level queue is intentionally shared;
  do not convert it solely for stylistic consistency.
- `services/saveLibrary.ts` and `libraryDelta.ts`: tighten RPC result and table
  contracts in a focused persistence review. Preserve atomic deltas, association
  replacement, and server timestamp reconciliation. Small auth, pagination,
  Supabase, and cover-art adapters do not need extra layers.

Use existing unit and browser coverage for catalog filters, details, import review,
account persistence, authentication, and route previews; extend only the branches
needed to protect each extraction. Checked items are complete; unchecked follow-ups remain scoped for focused PRs.
