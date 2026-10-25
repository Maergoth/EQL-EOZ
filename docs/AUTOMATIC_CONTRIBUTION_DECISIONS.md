# Automatic contribution decisions

**Status: research baseline and accepted local implementation, October 25,
2026.** The findings below describe the pre-fix publisher. The team accepted
[the consolidated coverage plan](AUTOMATIC_CONTRIBUTION_COVERAGE.md); the first
implementation is local and rollout remains on hold pending dry runs, fixture
checks and review. Whole-page Various/bonus exceptions were removed from the
runtime contribution policy.

## Local implementation and validation

`app/contribution-coverage.js` now checks the authored union before planning a
source edit. A cached exact or same-NPC unscoped source returns with zero HTTP;
live either-side and complete finite-collection positives return before making
a WikiPlan. New supported relationships use one existing NPC loot field instead
of appending reciprocal Itempage DropsFrom mirrors. The destination field is
selected by the trusted global Common/Unique classification. Broad Common Loot
does not veto a supported Unique Loot destination; unrelated location,
description and zone prose do not veto source work.

Affected broad/qualified source fields cannot prove a new exact edge. Important
or incompletely described cases retain one item review task; positively routine
common materials stay quiet. Missing statistics are unknown, and WT-only bound
or lore quest objects, effects, quest-role metadata and special damage remain
reviewable. Unknown monsters retain their own discovery/Notable/spawn task;
automatic source work never authors their redlink as an item-page mirror.

An affected broad source/loot field also stays quiet for positively ordinary
basic equipment with at least six existing verified monster sources. This is
not a general common-gear skip: the whole card must contain only recognized
base AC/weapon damage, Backstab, damage bonus, delay, range, weight, size and
equipment metadata. Attunable is allowed; No Trade/No Drop/Lore, effects,
meaningful bonuses, special damage, quest-role links and unknown values
retain review. When live item source has already been fetched, its card must
still satisfy that proof; newly visible HP or an effect cannot be hidden by a
stale cached basic card. Unsupported arbitrary syntax remains reviewable rather
than being treated as a broad field.

Quiet native outcomes use a separate bounded 500-relation ledger with dataset
and public revision metadata. They clear only untouched source-only queue
projections, preserve reviewed/manual/partial/population work, and do not create
Published History entries. A 1,000-entry native decision memo caches quiet or
review/backoff outcomes for at most 60/30 seconds and invalidates with dataset
version changes; it never caches permission to write or complete page bodies.
Literal colon punctuation, such as `Staff of Elemental Mastery: Water`, is
accepted only with native mainspace namespace proof at the live target boundary.
Known wiki namespaces, protocol prefixes and namespace escapes remain rejected;
an API-reported custom namespace cannot become a contribution destination.

Formal synthetic regressions in `tests/contribution-coverage.mjs`,
`tests/automatic-loot-sources.mjs` and `tests/automatic-source-results.mjs`
exercise the actual native engine and WikiClient: cached zero-request coverage,
live either-side/set coverage, one-author writes, no false publication receipt,
stale saved-plan guards, exact uncertain-write reconciliation, legacy partial
preservation and exact-relation queue cleanup. These tests make no real wiki
writes and are not a substitute for the pending public-data dry run and native
UI validation. Independent optional zone/category publication is a separate
phase with its own eligibility proof, as described in the consolidated plan.

## Finding: a missing authored copy is not necessarily a missing fact

The exporter already merges NPC-authored loot into item `dropSources`.
`BuildEyeOfZommPack::collectNpcLootSources()` retains `lootSources` provenance
with the NPC page title, revision, field and instance section;
`enrichItemsWithNpcLootSources()` unions those sources with an item's authored
sources. The app consequently has more than a flat item-page snapshot.

The bundled dataset examined here was `wiki-20261025T060106Z`: 5,326 of its
11,351 rich items contained NPC-authored coverage, across 35,617 source rows
with NPC revision provenance. These are observations of that particular pack,
not a claim about the next rebuilt dataset. The private aggregate receipt is
`.local/coverage-union-counts.json`.

The pre-fix automatic native writer did not use that positive coverage to
decide whether work is needed. `AutomaticLootSources.process()` uses the local
catalog for classification/provisional skips, resolves the live item, monster
and zone, and then constructs a primary item `missing-source` candidate. The
planner appends reciprocal item/NPC/zone copies. A fixture using the actual
native source engine confirmed the consequence:

| Existing evidence | Native outcome before a coverage decision |
| --- | --- |
| Cached item source already includes the monster and zone, with NPC revision provenance | Still prepares an item source update |
| Live NPC already authors the item, live zone already lists it, and categories are already correct | Still writes the item `DropsFrom` mirror |
| No new item, source, population or summary fact | One wiki write and one Published receipt |

The private reproduction is `.local/coverage-native-audit.mjs`. Its fixture is
synthetic, uses the actual native planner/transport boundary with a fake wiki,
and makes no production edits. This is a demonstrated implementation bug in
the decision layer; it is not evidence that an observed game drop was false.

The wiki team's reciprocal-read audit must establish exactly which authored
edge directions and item-set forms the live renderer supports. EoZ should
consume that same effective coverage contract rather than materialize every
derived display row back into wiki source.

## What runs today

The important entry points are separate:

| Path | Evidence and authority | Current result |
| --- | --- | --- |
| Main process log reader | Bytes read from the configured log, accepted native live cursor, current source/zone/instance | May authorize automatic source publication |
| Renderer log/replay observations | Useful local evidence; cannot authorize native writes | Creates/reconciles local drafts |
| Missing item notification | Local identity first, then bounded live exact/redirect existence on a cache miss | A notification, without an automatic screenshot |
| Contribute item reader | Fresh owned OCR session/frame/source proof, native item validation, live duplicate checks | May create an eligible new item |
| Unknown monster kill | Fresh kill evidence, exact missing identity and pet exclusions | Queues a monster draft and asks about Notable; `/loc` stays a proposal |
| Manual Preview | Explicit reviewed fields, current account, live canonical pages and revisions | Produces a reviewable plan; source-only auto policy must not silently discard it |

`desktop/main.cjs` feeds only actual configured-file bytes into
`AutomaticLogReader`. `desktop/automatic-loot-sources.cjs` validates native
parser ownership, freshness, monotonic cursors and source correlation. A recent
kill inference also needs a preceding same-log, same-zone, same-instance kill.
Historical replay, arbitrary chat, renderer-created observations and a nearby
consider are not equivalent authorization.

The renderer queue aggregates the same observation into item, NPC and zone
candidates. `contributionReasons()` primarily compares the observed source
against item `dropSources`; its three candidate shapes can therefore repeat the
same apparent gap. A successful source receipt hides an otherwise untouched
source-only draft using a relation key. A native covered/no-op decision has no
equivalent route yet. The local Various prototype intentionally emits no
Published/attention notification on a skip, so a stale snapshot can leave a
pure-gap row visible until refresh. Calling that row Published would be wrong.

## Proposed unit of decision

Decide about an **observed fact**, then project any required work into the
queue. Do not use the number of item/NPC/zone candidate cards as the number of
new facts. A drop fact is the canonical tuple:

`(item, monster, zone, normal-or-raid instance)`

Keep exact canonical titles/page identities and provenance. Resolve public
redirects; preserve distinct ambiguous pages and real grammatical articles in
monster names. Never infer a particular skeleton from the phrase “various
skeletons.” Store observation evidence separately from the coverage decision
and separately from an attempted wiki edit.

Coverage can be positive without being authored on every destination:

| Coverage form | Sufficient positive evidence | What it does not establish |
| --- | --- | --- |
| Exact authored edge | The selected NPC loot scope or item source scope explicitly names the exact counterpart | A second authored mirror is needed |
| Complete authored set | A listed set plus complete, canonical producer membership includes the item in the selected scope | Similar item names establish set membership |
| Authored unscoped exact monster | The same exact monster source is intentionally listed without a zone | The app should refine it into a new zone-specific source merely because the current zone is known |
| Broad authored acquisition intent | An actual source/loot field explicitly describes a broad provider/group | The app may invent which individual providers belong to that group |
| Zone population | Current category-backed DynamicZoneList membership, or a supported explicit list, in the correct instance | Every normal monster belongs in Notable NPCs |
| Curated zone loot | An existing selected Unique Items section lists the item or a complete covering set | Every logged item belongs in a new zone summary section |

Instance boundaries remain strict. Normal coverage does not establish raid
coverage. An unscoped exact-monster source can prevent needless refinement in
the same supported instance; it must not merge separate normal/raid facts.

Broad intent is a scope-specific coverage/unsupported decision, not a blanket
assertion that all facts on that page are known. Whole-page Various and bonus
exceptions are a provisional conservative guard, not a complete ontology.
“Various” in a zone's unrelated travel prose should not automatically discard
a genuinely new important gear drop. Likewise, weapon damage, AC or an HP
bonus alone cannot prove whether a source relationship is new. Item usefulness
and source coverage are different questions.

## Proposed decision order

1. Admit the observation using the existing native freshness/source/pet/identity
   rules. Preserve the raw local observation even if no wiki work is needed.
2. Resolve exact item, NPC, zone and instance identity against the local pack.
   A positively known entity is not a new-page discovery. An incomplete catalog
   cannot prove that an entity is absent.
3. Check positive cached effective coverage: authored item edges, NPC-authored
   edges and complete covering sets, with their recorded scope/provenance.
   A positive match returns a quiet covered verdict with **zero HTTP requests**.
4. Separate new entities/population from the drop relationship. An unknown
   monster remains an actionable discovery even when its drop is an ordinary
   common material. A normal monster already in DynamicZoneList is present.
5. For a potentially useful uncovered relationship, check bounded current live
   source already needed to prepare a write. Union either-side authored edges
   and complete set coverage before constructing a plan. A newly found exact
   edge returns covered, without a plan or attention message.
6. Recognize supported broad intent in the relevant source field. Refrain from
   refining authored ambiguity automatically. If the syntax/group semantics
   cannot be verified procedurally, quietly leave the existing coverage alone;
   manual contribution remains available.
7. Only a genuinely new supported fact can enter the writer. Choose one
   canonical authored home for that edge after the renderer audit. Changes to
   distinct facts, such as a missing category or an eligible curated zone
   summary, must be separately justified rather than bundled as mirrors.

The likely canonical home for a new gear-drop edge on an existing supported
NPC is its instance-scoped Common/Unique loot field, because that is the wiki's
explicit loot classification and already feeds reciprocal item display/export.
This is a recommendation for review, not an implemented preference. An existing
item-authored edge already wins as coverage and should not be relocated.

For a missing or unsupported NPC page, automatically appending an item redlink
before the NPC is reviewed can manufacture a second authoring path. Prefer
attaching the observation to the new-monster draft and authoring its loot once
when that draft is reviewed. The team must settle supported legacy templates
and missing-page behavior before enabling this change.

## What appears to the player

| Situation | Proposed automatic result | Queue | Published History |
| --- | --- | --- | --- |
| Known source covered by either authored side or complete set | Quiet covered verdict | Remove only redundant untouched gap representations | None |
| Same exact NPC source intentionally has no zone | Covered; no zone refinement | None for this source | None |
| Known common material, no important new entity/population | Keep observation, quiet policy skip | None | None |
| Unknown NPC from a kill or explicit corpse, including a common-material drop | New-monster discovery; preserve Notable and spawn review | One actionable monster task | Only after actual publication |
| Known NPC, genuinely uncovered supported important gear edge | Narrow new authored-edge proposal, subject to native authority | Attention only if review is required | Actual changed page/revision only |
| Item missing locally but present live | Covered identity | No missing-item notice or duplicate page task | None |
| Item absent live with a useful complete native examine reading | Existing guarded new-item creation flow | Only unfinished/review work | Actual creation/upload results |
| Existing DynamicZoneList membership | Covered population | None | None |
| Verified missing category required by a normal DynamicZoneList | Separate population repair, if supported and authorized | One population task if manual review is needed | Actual category edit only |
| Zone has no pre-existing Unique Items section | Skip summary population | No invented summary task | None |
| Item/set already covers a curated zone entry | Covered summary | None | None |
| Ambiguous destination, conflicting scope or unsupported source structure | No automatic write; bounded explicit decision | Attention only when a useful concrete question can be answered | None until an edit attempt |
| Revision/account/write uncertainty after a real attempt | Stop; reconcile known writes and preserve pending work | One needs-attention task | Truthful partial/unknown outcome |

Global Common/Unique counts remain a classification contract, not a coverage
contract: six distinct monsters is Common; fewer is Unique only with complete
provenance. Count the newly proposed monster once. Do not count aliases,
instances or pages as different monsters. An incomplete small count cannot
justify a guessed Unique placement. Stat eligibility for an existing zone
Unique Items section is independently checked; it is not a reason to create a
section or to duplicate a source edge.

## Quiet decisions, write receipts and protected work

Add a bounded native decision outcome distinct from submission receipts, for
example `covered-exact`, `covered-set`, `covered-unscoped`,
`authored-broad-intent`, `routine-material`, `new-entity`, `new-edge`,
`needs-identity-review`, `unsupported-scope`, `partial-write` and
`unknown-write`. Include a canonical relation key, observation ID, dataset
version and bounded public page/revision provenance. Do not include raw logs,
OCR, screenshots, credentials or arbitrary source text in the decision packet.

Only the native worker can establish an automatic verdict. Renderer-proposed
counts, flags or edited source arrays cannot authorize it. Cached positive
coverage should invalidate on dataset/provenance changes; pending writes still
use account, exact revision/hash, freshness, normalization and create/no-create
guards. Fuzzy search must never turn a similar name into source coverage.

A covered verdict reconciles **only** untouched source-only queue facts for
that exact relation and instance. Preserve manually created/edited fields,
notes, screenshots, captured locations, other unresolved relations, saved
reviews and partial/submitted results. Do not globally mark an item Submitted
or Ignored: a later different real source or unknown monster can matter.

History records actual attempted mutations and their confirmed/partial/unknown
outcomes. Covered/no-op decisions are not Published contributions. Successful
contributions stay in History with wiki edit links; editable queue cards are
reserved for work needing attention. If a network response was lost, reconcile
the exact current reviewed text before judging remaining work under a changed
policy. A later covered/opt-out decision must not erase an earlier real edit.

## Implementation cost and acceptance gates

The smallest safe first change is native cached-positive coverage admission
plus a quiet covered IPC verdict. Most required exported evidence already
exists in `dropSources`, `lootSources`, instance provenance and complete set
metadata. Next add live either-side coverage before `preparePlan`, then replace
the mandatory primary-item/triple-mirror plan contract with a plan whose pages
correspond to genuinely new authored facts. Do not weaken the current
append-only validation while changing that contract: rewrite its expected
single-edge diff and saved-plan validation together.

Before promotion, require fixtures for both authored directions, no-op zero
HTTP/zero writes, unscoped exact monsters, aliases, complete/unknown set
membership, strict normal/raid boundaries, broad-field ambiguity, unknown NPC
plus common material, known NPC plus new gear, DynamicZoneList/category-backed
presence, curated-summary eligibility, source replay, public dataset refresh,
account changes, conflicting revisions, partial retries and protected drafts.
Keep the demonstrated existing-edge mirror-copy fixture as a regression: it
must become zero writes and zero Published receipts.

The current local Various/material guards and their tests remain provisional
until this model is reconciled with the wiki renderer/exporter audits. No new
rollout should be inferred from this document.
