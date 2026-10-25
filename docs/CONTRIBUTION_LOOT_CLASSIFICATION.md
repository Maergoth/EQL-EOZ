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
source names. Modern exporter records use `meta.lootSourceCountsVersion: 2` and
top-level `lootSourceCounts[canonicalWikiTitle]` entries containing
`lootSourceNpcs`, `lootSourceCount`, and `lootSourceCountComplete`. This index
includes statless materials and missing item titles referenced by authored NPC
loot; it does not depend on an item having a browse/stat record. Rich item records
mirror the same three fields. Rich NPC records retain public redirect aliases.
Completeness also requires the supported complete entity catalog and consistent
counts. Version 2 names require a current public canonical NPC/Merchant card;
an arbitrary existing page ID, collection title, pet, or NPC redlink cannot
inflate the verified monster lower bound. An authored redlink remains positive
relationship evidence and makes the affected item count incomplete. Version 1
and older source rows may establish a lower bound only when actual rich NPC
records independently verify their identities; they cannot prove a complete
small count. Ambiguous identities,
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

Routine automatic source backfill skips a positively identified common material
when the native cached record already proves at least six distinct monsters and
explicitly contains only a finite weight statistic, no equipment slots, and
recognized metadata-only display lines. Weight must agree with its display line.
Missing metadata, meaningful statistics, effects, instrument properties and
unrecognized lines cannot prove this policy. The source count is evaluated before
adding the newly observed monster. No item or monster names are hardcoded.

Quiet material/basic-card decisions additionally require the producer's rich
`contributionCard: {schemaVersion: 1, complete, questContext}` proof. Completeness
means one literal public Itempage with unique static fields, known card and
acquisition fields, literal stats and every nonempty stat line present within
the sixteen-line rich export. Unknown auxiliary modifiers, dynamic/protected
stats, unknown context templates, variants and truncated lines withhold proof.
The producer compares the exact exported lines and current anonymous source;
old packs without proof remain reviewable. Standard merchant, forage, recipe
and related-quest fields are context. A quest link sets `questContext` without
declaring an important reward; binding, effects and special modifiers still
protect important items independently.

`app/automatic-source-policy.js` applies this narrow rule to automatic item,
monster and zone source-gap proposals. The native automatic publisher checks the
same policy before account or live page resolution, so an ordinary common
material drop creates neither a backfill request nor an attention notification.
Unknown item and monster discoveries, uncommon materials, gear, and explicit
manual contribution drafts remain available. This is an automatic workflow
policy; it does not assert that a generic source description identifies each
individual monster or rewrite authored wiki loot.

The normal verified gzip installer and build-time bootstrap fetch preserve the
whole pack, adding only their existing cache/build metadata. Renderer fallback
loading also retains the full index. The native catalog provider reads the raw
installed pack, falls back to the bundled pack offline, and reloads when the
installed file generation changes. `node tests/dataset-sync.mjs` checks these
paths with synthetic statless/material entries, incomplete records and aliases.

The build-time catalog relevance gate requires version 2, a nonempty bounded
global index, consistent count/name arrays and matching rich-item mirrors. It
rejects an older bootstrap without these fields; it makes no live wiki requests.

`meta.lootSetsVersion: 1` and `lootSets[setTitle] = {items, complete, source}`
document public explicit Gear Set and approved unconditional list-pool membership
in the native pack. `source` records its public page and revision. Only a
complete, bounded list of
valid canonical members can establish coverage. Similar names and prefixes do
not establish membership. `app/loot-set-coverage.js` and the contribution model
recognize a listed set in an authored monster or zone loot section, scoped to
the selected normal/raid instance. They preserve the set and its authored loot
kind instead of appending individual members. Automatic publication treats either
authored direction and complete collection membership as the same covered
relationship; it does not add a missing reciprocal Itempage mirror. Explicitly
reviewed manual source work remains available. Native preparation and saved-plan
guards reject redundant member additions in automatic plans.
This coverage check uses the trusted pack and the page source already loaded
for Preview; it does not introduce live membership/count queries.

Conditional tables and qualified group descriptions do not establish a member
cross-product. When their possible public members can be bounded, the producer
exports `possibleItems` and `possibleItemsComplete` and marks those item counts
incomplete without adding NPC edges. Unknown expansion or membership remains
incomplete. Safe positive sources remain available independently of that
uncertainty.

An undefined group whose possible members cannot be bounded leaves the global
scan incomplete. This can withhold automatic Unique classification for every
item even in a freshly rebuilt dataset. A sync cannot resolve an intentionally
broad or broken source definition. Existing exact/finite-set relationship
coverage still prevents redundant contributions, six verified monsters still
prove Common, and important unresolved work remains available for review.

`meta.wikiRelationshipCoverageVersion: 1` identifies the title-keyed
`wikiRelationshipCoverage` map, including pages omitted by rich stat filtering.
Each entry retains public page/revision provenance, its item/NPC/zone kind,
affected field and normal/raid scopes, exact positive edges, verified collection
references, and separate `state`/`complete` capability metadata. `broad`,
`unsupported`, and `variant` describe the affected authored field; incidental
description, location, merchant, or zone prose does not opt an entire page out.
Existing DynamicZoneList categories and optional pre-existing zone summary cells
are independent capabilities. A missing or unsupported summary does not veto a
new supported NPC loot fact. See [the accepted coverage plan](AUTOMATIC_CONTRIBUTION_COVERAGE.md).

`node tests/loot-classification.mjs` covers synthetic global counts, the exact
six-monster boundary, canonical duplicates, missing/incomplete data and pet
exclusion. Native planner/automatic-source fixtures separately check trusted-pack
selection and unchanged publication guards. These are isolated fixtures, not
live wiki edits or observed game drop rates.
`node tests/loot-set-coverage.mjs` additionally covers explicit membership and
aliases, authored/protected text, instance boundaries, preserved set placement,
source-only updates and native redundant-member guards.
