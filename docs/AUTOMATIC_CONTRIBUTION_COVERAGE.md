# Automatic contribution coverage

Status: local implementation and source/native validation completed after the
October 25, 2026 research review. Staged promotion and the independently rebuilt
dataset remain release gates.

## Purpose

Capture useful new monsters, loot and population facts while preserving the wiki's
existing editorial choices. A difference between two raw page fields is not
necessarily missing information. An observation, an existing wiki relationship,
a proposed edit and a published contribution are four different things.

The decision order is **identity, coverage, usefulness, supported change**.
Common/Unique classification is a separate, evidence-based decision. A useful
item can be Common, and a complete count below six does not prove that a source
relationship is missing.

## Research findings

The investigation combined a bounded read of all 19,538 current public categorized
item/NPC/zone pages, a detailed 62-page item/collection sample, source-code review,
an actual native publisher reproduction, and unsaved MediaWiki parser fixtures.
No research operation saved a wiki article or published a dataset.

| Finding | Implication |
| --- | --- |
| The inspected bundled pack already joins 35,617 NPC-authored source rows across 5,326 items. | Positive coverage is available before making a live request. |
| A native fixture still wrote an item Drops From mirror when its cached and live NPC loot declaration already covered the drop. | The publisher must decide whether a fact is new before preparing a plan. |
| 640 of 682 NPC pages containing Various use it outside their zone/loot fields; 604 use it in location. | A page-wide word check would suppress unrelated useful work. |
| Various can be the display label of a link to a specific boss. | Use the link target and field structure, not the displayed word alone. |
| The selected item sample contains broad sources without Various: most-mob drops, regional armor pools, research components and uncertain family claims. | A keyword blacklist cannot describe all existing coverage. |
| 118 of 121 zone-category pages use DynamicZoneList. | Ordinary population is usually category-backed, independently of Notable summaries. |
| 22 zone-category pages lack a Unique Items row. | An absent optional summary is a layout choice; do not create it automatically. |
| Imbrued Armor is a finite Gear Set, while Classic Raid Tier Treasures is an explicit plain item pool. Other armor pages contain conditional slot/class tables. | Support verified finite collections; never turn conditional tables into a Cartesian product of drops. |
| Manastone, epic components and Handmaiden's Handwrap demonstrate effect-only, quest and special-damage importance. | Numeric bonus stats alone are not an importance model. |

The detailed research, pinned public examples and limitations are recorded in
[the application decision audit](AUTOMATIC_CONTRIBUTION_DECISIONS.md) and the
related wiki documents `AUTOMATIC_ITEM_SOURCE_RESEARCH.md` and
`AUTOMATIC_CONTRIBUTION_COVERAGE_RESEARCH.md`.

## Coverage decisions

Use the canonical item/NPC/zone/instance relationship as the unit of work. A
renderer may show that fact in several places; it should be authored once.
Existing ownership wins: do not relocate or copy a relationship merely to make
raw page text symmetrical.

| State | Required evidence | Automatic behavior |
| --- | --- | --- |
| Covered exact | A supported authored declaration on either side, or its public revision-backed exported edge | Quiet; zero requests for a positive cached match; no plan or Published receipt |
| Covered unscoped | The same exact canonical monster is authored as a source without a zone, in a compatible instance | Preserve the general statement; do not enumerate new zone refinements |
| Covered collection | A listed collection and verified complete membership cover the item in the selected NPC/instance scope | Preserve the set/pool and quantity/rarity prose; do not append members individually |
| Broad acquisition intent | The affected source field describes a family, region, shared pool or intentionally incomplete enumeration | Preserve it; do not guess individual membership or expand the list automatically |
| Unsupported or qualified scope | Variants, duplicate arguments, conditions, uncertain sources, unknown collections or unparsed relationship structure | No procedural mutation; retain evidence and surface a useful concrete review task when appropriate |
| Genuinely new supported edge | Fresh authorized source evidence, known canonical identities, no positive coverage and a supported authored destination | Append the fact once under account/revision guards |

Normal and raid coverage remain separate. An uncertain instance is not proof of
the opposite explicit instance. Public redirects can establish identity; similar
names, grammatical articles, creature families and item prefixes cannot.

Unparsed acquisition text is a reason to withhold an automatic refinement, not
evidence that the wiki has no source. Keep safe positive rows even when the rest
of a field is not understood. A source caveat must not become an unconditional
drop claim.

Evaluate the proposed destination field independently. A monster's broad Common
Loot statement does not veto a new supported Unique Loot entry. An item's broad
acquisition statement still prevents declaring a newly observed individual source
uncovered merely because that monster's raw field is empty. Keep potentially
important uncertain cases in one review task; quiet routine enumeration only
when positive metadata supports that choice.

## Usefulness and separate population work

Known routine common materials can remain quiet when the record positively
establishes their ordinary material nature and at least six existing distinct
monster sources. Missing metadata does not establish statlessness. Quest labels
alone are insufficient: ordinary silks and important epic components both use
them. Binding/lore, effects, special modifiers, explicit quest roles and other
positive signals must keep potentially important cases available for review.

AC, base weapon damage, Backstab, delay, range, weight and size alone do not
override broad coverage. Bonus stats, effects and quest significance affect
priority; they do not make an already-covered relationship new.

For an affected broad source field, fully described basic equipment can also
stay quiet when a version-2 verified lower bound already proves Common. The
plain-card check allows ordinary AC/weapon metadata and Attunable, but rejects
bonuses, effects, special damage, lore/binding, explicit quest roles and unknown
modifiers. Incidental notes do not alone establish importance. An unsupported
qualifier/template remains reviewable, and a live page already fetched must
still pass the card check. Recognized aggregate source prose includes the
observed "common drop from low-level humanoids" pattern; it never creates
individual monster identities or drop edges.

Unknown monsters remain discoveries even when they drop an ordinary material.
Ask the player whether the monster is Notable and retain its spawn review. A
template named Namedmobpage is not proof of notability. Automatically observing
loot must not fabricate a missing monster page or write a redlink source before
that monster's identity is reviewed.

Evaluate population separately from loot. Existing matching category membership
satisfies DynamicZoneList presence. Exact authored zone=Various covers the
observed zone without replacing it with a growing list. Only a supported missing
category/population fact warrants repair; normal monsters do not automatically
enter Notable NPCs.

There is no zone-wide Various blacklist. The earlier 46-page lexical result
included unrelated prose, city redirects and a cleanup project. Zone summary
eligibility instead depends on the actual destination: a pre-existing Unique
Items row in the correct instance, real item statistics, complete global Unique
classification, and no existing item or covering collection. A missing summary
does not block an independently useful source fact.

## Native publication and player-visible results

1. Preserve the native source/freshness/pet/identity admission checks.
2. Check trusted cached positive coverage before account or HTTP work.
3. For a useful possible gap, inspect the bounded current relevant sources already
   required to prepare a write. Recheck either authored side and collections.
4. Prefer one existing supported NPC loot scope when the trusted global count can
   classify the new edge. Incomplete classification or unsupported structure
   keeps a useful review task; it never guesses Unique.
5. Justify an optional category or curated zone-summary change as a distinct new
   fact. Do not require item, NPC and zone mirrors for each observation.
6. Validate the narrow expected diff, current account and exact revision again at
   the native write/retry boundary. Reconcile already-applied uncertain writes
   before evaluating unfinished work under a newer policy.

Repeated quiet/review outcomes use a bounded, expiring relation decision memo,
invalidated by a dataset change. It can avoid repeated account/page requests;
it never caches permission to publish a future edit.

Covered and positively identified routine decisions are bounded native
verdicts, not submissions. They can clear only untouched relation-specific gap
projections. Preserve manually edited fields, notes, attachments, locations,
other unresolved sources, reviewed plans and partial results.

The discovery queue contains work needing attention. Confirmed automatic changes
appear in Contribution History, with current-page edit links. Only actual write
attempts and their truthful confirmed/partial/unknown outcomes enter that history.
An unchanged or covered observation never says Contribution published.

Optional zone summary validation requires a literal item/verified finite
collection list or an empty placeholder. Unknown collection references, prose
conditions and ambiguous table structure are skipped independently. A paired
source/summary plan can retry its unfinished summary after reconciling its own
confirmed source write; it cannot claim another editor's pre-existing source
as a publication or use it to backfill old summaries. Removed live item stats
or changed global classification stop the remaining summary and retain the
truthful partial receipt.

## Rendering and count limits

The exporter and wiki renderers are read models, not new authored evidence.
Repair their namespace, alias and collection support directly instead of saving
mirror edits to compensate for a missing rendered row.

Native Common/Unique classification uses the bundled whole-wiki distinct-monster
proof: six or more is Common; below six requires complete provenance. Read-time
projection must not infer global Unique from five or fewer direct item sources.
Where no complete global proof is available, preserve authored loot and withhold
that generated classification. A bounded proven lower bound of six can establish
Common safely. No per-item whole-wiki live scan is introduced.

The public audit also found eleven NPC pages with unbounded Research-component
groups. Their Research link redirects to an unavailable catalog; neither the
wiki nor the bundled data can prove a finite membership domain. Do not assume
that equipment can never be an ingredient merely to make small counts look
complete. Such unresolved global source groups can leave every below-six count
incomplete. That deliberately withholds automatic Unique placement, including
optional zone summaries, while retaining verified Common lower bounds, positive
coverage, important review tasks and direct wiki editing. A newer snapshot alone
does not repair missing editorial information. Finite group definitions or
reviewed source data are needed to remove that uncertainty.

## Acceptance and rollout

Before promotion, run a read-only decision report and inspect important uncovered
examples plus known-covered negatives. The report counts new facts, quiet
coverage decisions and useful review tasks, not raw differing fields.

The existing-pack consumer sweep checked 43,957 source rows with known NPC
identities: 43,918 were covered, including 1,108 exact unscoped sources. The
remaining 39 retained review because of genuine canonical title collisions;
there were no unexplained misses. Native publisher regressions produce zero
requests for cached positives and zero writes or Published receipts for live
either-side/set coverage. These are read-only dataset checks and isolated
synthetic publication fixtures, not live article edits.

Required regressions include both authored directions, zero-HTTP cached positives,
stale snapshot/live positives, finite sets and pools, conditional collections,
unscoped exact monsters, aliases and real case-distinct pages, strict normal/raid
scope, broad and qualified sources, the common spider/bone/sulfur samples,
important effect/epic/special-damage items, DynamicZoneList presence, new Notable
monsters, absent optional summaries, protected drafts, partial retries and
truthful History outcomes. The reproduced covered-source mirror write must
become zero writes and zero Published receipts.

After source/native/parser checks pass, deploy the scoped wiki changes, rebuild
the dataset once, verify its immutable counts/coverage/collection provenance,
then build and verify the held desktop release for both platforms. Publication
remains held while any of these gates is unresolved.
