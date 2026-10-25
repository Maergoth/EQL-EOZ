# Cached global loot classification

Common Loot and Unique Loot identify wiki sections. They do not measure drop
probability. EoZ determines new placement from the number of distinct canonical
monsters associated with an item across the whole cached wiki dataset, including
the new reviewed source. It does not count only the selected zone.

- Six or more distinct monsters means Common Loot. A proven lower bound of six
  is sufficient even if additional sources remain unknown.
- Fewer than six means Unique Loot only when the cached source count is complete.
- A missing or incomplete count below six blocks classification. Sync with Wiki
  for the current dataset or keep the work for review; missing data never silently
  becomes Unique Loot.

`app/loot-classification.js` resolves item/NPC identity and deduplicates canonical
source names. Modern exporter records use `meta.lootSourceCountsVersion: 1` and
top-level `lootSourceCounts[canonicalWikiTitle]` entries containing
`lootSourceNpcs`, `lootSourceCount`, and `lootSourceCountComplete`. This index
includes statless materials and missing item titles referenced by authored NPC
loot; it does not depend on an item having a browse/stat record. Rich item records
mirror the same three fields. Rich NPC records retain public redirect aliases.
Completeness also requires the supported complete entity catalog and consistent
counts. Older source rows may establish a lower bound when canonical NPC identity
is available, but cannot establish a complete small count. Ambiguous identities,
malformed records and explicit owner-labelled pets cannot establish completeness.

The renderer can show a proposal from its cached data. Publication recalculates
classification from the native-owned installed pack through the existing catalog
provider; renderer-provided proofs or counts cannot authorize placement. The
review digest binds native classification metadata to the prepared plan. Manual
and automatic source paths use the same rule while preserving existing page
content, duplicate checks, account/revision guards and partial results.

Retrying a saved plan repeats this check at the native submission boundary,
including plans prepared by older app versions without count metadata. New pet
targets/sources and stale Unique classifications require a fresh Preview. Applied
pages stay untouched; exact already-applied unknown responses are reconciled
before validating the remaining writes.

Count lookup is local. It does not poll MediaWiki, issue backlink/category count
queries, or add per-item server fan-out. Ordinary explicitly requested page
preparation/publication still uses its existing authenticated wiki operations.
The separate wiki dataset exporter supplies the count fields; publishing this
desktop app does not itself run the exporter or change wiki pages.

The normal verified gzip installer and build-time bootstrap fetch preserve the
whole pack, adding only their existing cache/build metadata. Renderer fallback
loading also retains the full index. The native catalog provider reads the raw
installed pack, falls back to the bundled pack offline, and reloads when the
installed file generation changes. `node tests/dataset-sync.mjs` checks these
paths with synthetic statless/material entries, incomplete records and aliases.

The build-time catalog relevance gate requires version 1, a nonempty bounded
global index, consistent count/name arrays and matching rich-item mirrors. It
rejects an older bootstrap without these fields; it makes no live wiki requests.

`meta.lootSetsVersion: 1` and `lootSets[setTitle] = {items, complete}` document
explicit set membership in the native pack. Only a complete, bounded list of
valid canonical members can establish coverage. Similar names and prefixes do
not establish membership. `app/loot-set-coverage.js` and the contribution model
recognize a listed set in an authored monster or zone loot section, scoped to
the selected normal/raid instance. They preserve the set and its authored loot
kind instead of appending individual members. A missing source on the member's
own item page can still be added. The same native preparation and saved-plan
guards reject redundant member additions, including manually edited wikicode.
This coverage check uses the trusted pack and the page source already loaded
for Preview; it does not introduce live membership/count queries.

`node tests/loot-classification.mjs` covers synthetic global counts, the exact
six-monster boundary, canonical duplicates, missing/incomplete data and pet
exclusion. Native planner/automatic-source fixtures separately check trusted-pack
selection and unchanged publication guards. These are isolated fixtures, not
live wiki edits or observed game drop rates.
`node tests/loot-set-coverage.mjs` additionally covers explicit membership and
aliases, authored/protected text, instance boundaries, preserved set placement,
source-only updates and native redundant-member guards.
