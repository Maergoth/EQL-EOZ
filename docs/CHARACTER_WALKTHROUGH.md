# Guided Character capture

## Current 0.9.4 contract

The owner requests a single start-to-finish Character walkthrough rather than
separate capture/editor forms: identity, source setup inside the flow, unequip
and read items, confirm no equipment and capture base stats, re-equip/read missed
items, resolve ANY slots, calculate totals, then save a snapshot. Capture should
remain owned by that walkthrough until completion or explicit cancellation.
Loose inventory cards have a top-right remove action. Routine Character review
uses the item details and editable values; wiki publication/upload review remains
separate. The 0.9.4 follow-up adds canonical cached-item identity, bounded OCR
name tolerance and known-only equipment placement. See
[the inventory plan](CHARACTER_INVENTORY_REVIEW.md) for its acceptance ledger.

Unequip slowly, one item at a time. Keep the complete item tooltip or examine
pane visible, including its name, metadata and footer, and wait for that item's
card before moving to the next item. Re-equip any missed items the same way.
Reading continues during Slots and Review until the walkthrough finishes or is
canceled; advancing a step does not make rapid tooltip changes reliable.

The compact equipment grid and loose inventory are views of the same physical
cards. A placed copy disappears from loose inventory and returns when unequipped
or replaced. Another identical copy remains a separate card. An unmatched read
stays loose with a red outline and yellow warning mark; select it to inspect the
original reading and choose a cached-item match. Unknown items cannot equip,
including through ANY confirmation, drag/drop or an incompatible-slot override.

Default Modern's local inventory XML identifies the AC row's first component as
mitigation AC, the slash component as mitigation softcap and the last component
after the divider as evasion AC. Attack has distinct offense and accuracy values.
These are separate components, not current/maximum or melee/ranged values.
The walkthrough must display meaningful labels and preserve all observed values.
Explicit item Haste and the pane's bounded written stat block must survive OCR,
review, persistence and sharing; the wiki cannot supply invented observations.

The guided flow originally shipped in 0.9.1. The current inventory follow-up
starts from published 0.9.3 source `6569e8890feb66acc608d12805ba94a04d0231f3`
on `codex/character-inventory-matching`. Keep published releases immutable.
No installed-player profile is a test fixture. No production wiki test writes,
private game captures or account data in Git. Preserve unrelated EQLWiki dirt.

## Critical context after compaction

- `app/capture-workspace.js/css`: shared contribution/capture settings, calibration,
  guided Character intake, inventory interaction, match picker and share dialog.
- `app/character-inventory-view.js`: escaped compact identity/stat markup,
  equipment rows, loose-card icons, tier labels and item details.
- `app/character-model.js`, `character-share.js`, `character-catalog.js`: physical
  copies, slot constraints, tiers/augments, additive statistics and snapshot PNG.
- `app/screen-read-parser.js`, `desktop/capture-reader.cjs`: bounded, pane-scoped
  OCR; source evidence and explicit numeric uncertainty. Pipeline agent owns them.
- `desktop/capture-host.cjs`, `capture-source.js`, capture source preload:
  exclusive ownership, stale-generation cancellation, source loss and lifecycle.
- `desktop/overlay-host.cjs`, `app/overlay.css/js/html`: native resize grips,
  drag-region hit testing, locked state and bounds. `desktop/overlay-docking.cjs`
  supplies pure touching geometry and guarded saved follower chains.
- `app/character-walkthrough.js`: bounded local phase/source/session progress,
  fresh-base cutoff, durable manual drafts and unique capture identity matching.
- `C:/EverQuest Legends/uifiles/default_modern/EQUI_InventoryWindow.xml`:
  actual component EqTypes/tooltips. Read-only game UI evidence, never committed.
- `docs/design/CHARACTER_CAPTURE.md`, `docs/design/CAPTURE_PIPELINE.md`:
  current contracts and prior calibration. Update the changed contracts.
- `scripts/test-capture-workspace.mjs`, `test-capture-native.mjs`,
  `test-native-overlays.mjs`: isolated actual Electron/loopback native evidence.
- `docs/RELEASE_HISTORY.md`: new versions require reviewed synthetic screenshots,
  browsable What's New and exact packaged-source/image checks.

## Ownership

| Owner | Files/work |
| --- | --- |
| root | Inventory UI/CSS and view module, matching integration, planning, metadata and release checks |
| capture_pipeline_089 | Read-only Modern layout/assets and independent contract review |
| character_model_089 | Catalog resolution, known-only placement, copy views, model/walkthrough/share logic and unit tests |
| wiki_contribution_089 | Isolated native Character/workspace fixture updates |

Agents agree component keys and API changes before touching another owner's
files. Keep UI/source state resumable and ensure old asynchronous callbacks
cannot stop or overwrite a replacement walkthrough. No periodic automatic
capture starts outside an explicit user-started walkthrough.

## Intended flow

1. **Character details**: name, server, class combination, level, AA count; retain
   optional race for calculations. One clear Start/Continue entry point.
2. **Capture source**: discover the actual game window and present its selected
   source inside the walkthrough, with manual source choice and inline optional
   calibration. Default Modern remains the calibrated skin. Start from this step,
   without sending the player to Settings.
3. **Unequip**: ANY-slot items first. Remove one item slowly, keep its complete
   tooltip visible and wait for its card. Read full item text, resolve known
   catalog identity and auto-place only unambiguous known items into the simulated
   equipment layout. Retain paired copies and defer ambiguous/ANY placement.
4. **No Equipment**: the player advances after removing all gear, then reviews
   one editable base-stat block. Captures before this step cannot become base
   statistics. Preserve distinct AC/ATK components. One confirm/continue action.
5. **Re-equip**: normal equipment first, ANY items last. Keep reading missed items;
   repeated evidence cannot create duplicate physical copies or displace gear.
6. **Resolve slots**: choose cached matches for unknown names, then confirm ANY
   and ambiguous placements, with explicit leave-in-inventory choices. Ordinary
   compatible known-item assignment needs no checkbox.
   Missing item tooltips can still be captured here without going Back.
7. **Review/save**: calculated equipped values update from reviewed base and
   assigned gear; label estimates and unresolved formula/context components
   honestly. Missing items remain readable here too; ANY placement stays manual.
   No required equipped-stat capture. Preview then copy/save snapshot;
   successful completion ends Character capture. Cancel remains available.

Temporary OCR errors, empty scenes, page navigation, calibration and resizing
must not silently complete or stop this flow. A genuinely lost capture source
must be visibly resumable; do not bypass operating-system capture permissions or
restart after explicit user cancellation. Contribution capture remains paused
while Character owns the source.

The 0.9.3 follow-up keeps new item admission active in Unequip, Re-equip, Slots
and Review. Capture-time windows exclude Base, Details and source selection;
fresh No Equipment timestamp/sequence and explicit manual-import guards are
unchanged. Live and recovered items require the active session and confirmed
current source/generation. Completion and cancellation close those windows.
Released Slots/Review drafts can recover their latest matching Re-equip boundary
after Base acceptance, never the earlier Base interval. Active same-session
journal rereads merge through the walkthrough's existing unique-copy identity
rules, retain bounded evidence and preserve manual corrections; older sessions
keep exact-observation replay behavior.

## Catalog identity and physical copies

Names display their tier once. Complete repeated trailing `+0` through `+10`
decorations are removed from the base name; the independently observed or edited
tier/progress remains separate. This cleanup never guesses a tier from text.
The original `observedName`, pane text, numeric uncertainty and journal evidence
remain local and intact. Conflicting written tier labels produce a review
warning rather than changing the stored numeric tier.

Matching uses the current local catalog, with exact full name/wiki-title matches
first. A unique full-name single insertion, deletion or substitution, or one
`rn`/`m` OCR-glyph confusion, can resolve a new read to its canonical identity.
Names shorter than six non-space characters require an exact match. Multiple
equal matches require the picker; fragments and errors beyond that bound do not
automatically choose an item. Search remains local, and a cache miss means only
that the current cache could not resolve the read.

Canonicalization happens before the walkthrough's same-copy and ambiguity
checks. It does not merge distinct saved physical cards. Tier, fractional
progress, augments, original aliases and removal guards still distinguish copies.
Catalog identity never replaces observed item stats with wiki numbers. Choosing
a match explicitly refreshes its catalog base cache; recapture and catalog
reconciliation preserve existing reviewed base values.

Old equipment without a trusted catalog identity is excluded from totals and
shown loose while the current pack is checked. An exact legacy match can recover
its prior placement without displacing another card. A fuzzy or missing legacy
match stays loose for selection, even though a new uniquely resolved capture can
establish its identity. Manually typing a wiki title or checking a match field
does not bypass this rule. These identity changes do not relax capture ownership,
phase windows or fresh No Equipment timestamp/sequence checks.

## Acceptance gates

- Unit checks for stage transitions/resume/cancel/completion, stage-scoped base
  intake, auto-slot/ANY ambiguity, repeated observations and durable inventory X.
- Exact/fuzzy/ambiguous names, canonical-before-copy matching, raw spelling/stat
  retention, known-only placement through every override, legacy recovery and
  disjoint loose/equipped physical IDs with unequip restoration.
- Distinct mitigation/evasion AC and offense/accuracy survive OCR→model→PNG;
  explicit haste and full bounded item-stat text remain available for review.
- Calculated totals change on equip/unequip/remove without a second stat capture;
  no unsupported AC/ATK/haste conversions or unknown values presented as exact.
- Native walkthrough from details through save at supported sizes/fonts; inline
  source choice, inventory removal, resume after transient read failure, and
  capture stops only on success/cancel. Synthetic/loopback fixtures only.
- Native unlocked resize grip/edge gets correct diagonal/axis cursor and genuine
  trusted resize input, with locked mode still clear and no accidental drag region.
- Any visible overlay docks to another without a gap. Above/below share width
  and x; sides share height and y. Chains follow target movement/resize, reject
  cycles/collisions/off-screen fits and detach on deliberate drag-away. Global
  Hidden suspends saved groups; individual hiding detaches affected relations.
- Global header cycle is **Unlocked → Locked → Hidden → Unlocked**, with no
  hidden propagation and restored editing input on return.
- Update guides/README/illustrated release history, full appropriate source and
  exact-head Windows/Linux/package checks before any new publication.

## Current and historical validation

The 0.9.4 catalog/model/walkthrough unit suites pass synthetic identity-resolution,
unknown-placement, copy-view and legacy-recovery regressions. This source evidence
does not establish current native layout, installed-player or release acceptance;
the release owner records those checks in the inventory plan and release ledger.

### Earlier 0.9.1 acceptance

The earlier implementation completed the 0.9.1 follow-up to published 0.9.0. The owner
explicitly authorizes publication after these fixes. Keep 0.9.0 and all older
assets immutable; one new Windows/Linux release consumes a shared fresh verified
bootstrap. Local checks precede exact-head CI and installer jobs; after merge,
verify the tag/source, all five anonymous public assets and extracted package
sources/images/OCR/bootstrap before reporting live. Record final run IDs and
checksums in the PR/private ledger, without another documentation-only main push.

The native synthetic walkthrough covers required identity/AA input, recommended
inline source selection, auto-slots/ANY, top-right X with actual pointer input,
stage/time/sequence/session-scoped base reads, durable edits, re-equip merges,
raw Haste correction, source reselection returning to the same step, lost-source
resume, canceled Save and successful Save/Copy stopping once. Layout is checked
at 1024 CSS px with 13/20px fonts. Actual Windows overlay checks exercise all
32 native edge/corner targets and client hit tests, shared dimensions, dock
chains, resize following and the corrected cycle. The existing loopback workspace
fixture still covers offline image import, catalog, augment editing, local PNG
clipboard/save and guarded wiki/base-recovery operations.

Focused OCR tests and real offline Modern pixels pass from source and assembled
runtime. A private selected Inventory-area measurement recovered all five AC/ATK
components correctly; full-frame Attack values stayed unknown when unreadable.
All three provided item panes retain separate bounded text. No private pixels
or installed profile enter fixtures or Git. Complete source tests, dependency
audit and fresh catalog checks are release gates. Native Wayland, physical game
composition, all skins and exact server-derived equipped totals remain outside
synthetic acceptance; label estimates and uncertainty in the product.

The first changed-head CI run exposed native fixture interference on compact
desktops: unrelated visible panels could become magnet targets or invalidate a
group while being staged. Edge tests now expose only their selected panel;
four-panel docking is staged separately within a compact work area and asserts
each relation before propagation. The full main-app smoke isolates its pair
subsection and also passes a 1024×700 test-only work-area contract. Native input,
touching/size/anchor/collision assertions and production guards remain intact.
Repeated native drags also wait for both viewport dimensions and settle the
previous release before resetting bounds; bounded pointer/bounds diagnostics
cover any platform mismatch. Local native acceptance includes DPR 1 with a
1024×700 work area and the default DPR 1.5. The calibration fixture uses the
current recommended-source contract and the actual guided Character start.
The real workspace fixture also holds OS source enumeration across Cancel and
requires PNG Preview/Copy to remain usable before releasing it. Discovery is a
nonblocking read with its own generation; canceled or superseded responses
cannot refill source choices. Wiki writes and explicit capture starts retain
their existing action guards.
