# Guided Character capture

Version 0.9.6 uses one total-stat inspect with maximum resources and 24 equipment
slots (two Any, no Power Source). The tier slider remains immediately editable;
individual item fractional progress is no longer imported or requested. Click
an empty slot for filtered wiki search and a tier slider, or explicitly paste an
item screenshot. Click item sockets to select known augments, including weapons
in armor. Original observed values stay intact and augment deltas apply once.
The [interactive sheet plan](CHARACTER_SHEETS_PLAN.md) records the current
cross-repository contract, checks and wiki activation boundary. Older sections
below preserve the previous walkthrough's decisions and validation history.

Character Select shows **Character (Server)** only after the validated first
walkthrough step. New character uses a separate unregistered draft; switching
preserves each character’s own inventory, equipment, baseline and walkthrough.
An active Character capture stops before switching and never restarts by
selection alone. The roster is one atomic, bounded private record; legacy
current-character mirrors remain for migration/rollback. Journal replay requires
the selected flow or an exact previously accepted observation reference, so
shared item names cannot mix characters.

The 0.9.5 inventory shortcuts include an equipped-item top-right X and
dragging equipped gear back into Inventory. Both unassign the same saved card
without deleting it, preserve explicit physical copies and keep it loose across
held rereads. Add item opens and focuses the wiki catalog query immediately;
searching does not create a blank inventory card.

## Current 0.9.5 contract

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
The 0.9.5 follow-up adds visible selected-item tier controls, cross-session
automatic-item dedupe, pass-scoped removal recovery, two universal slots and
port-independent private storage. Its current audit and coverage are in
[Character tier controls and durable inventory](CHARACTER_INVENTORY_PERSISTENCE.md).

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
including either universal Any slot or drag/drop. Standard slots require actual
compatibility; there is no incompatible-slot override. The board has 23 normal
slots plus Any 1 and Any 2, which accept known items only by manual placement.

Default Modern's local inventory XML identifies the AC row's first component as
mitigation AC, the slash component as mitigation softcap and the last component
after the divider as evasion AC. Attack has distinct offense and accuracy values.
These are separate components, not current/maximum or melee/ranged values.
The walkthrough must display meaningful labels and preserve all observed values.
Explicit item Haste and the pane's bounded written stat block must survive OCR,
review, persistence and sharing; the wiki cannot supply invented observations.

The guided flow originally shipped in 0.9.1. The 0.9.4 inventory work started
from published 0.9.3 source `6569e8890feb66acc608d12805ba94a04d0231f3`.
The current follow-up starts from published 0.9.4 source
`1596770cd5ed7cf922c57bd973ed49f4f1070d14` on
`codex/character-tier-persistence`. Keep published releases immutable.
No installed-player profile is a test fixture. No production wiki test writes,
private game captures or account data in Git. Preserve unrelated EQLWiki dirt.

## Critical context after compaction

- `app/capture-workspace.js/css`: shared contribution/capture settings, calibration,
  guided Character intake, inventory interaction, match picker and share dialog.
- `app/character-inventory-view.js`: escaped compact identity/stat markup,
  equipment rows, loose-card icons, tier labels and item details.
- `app/character-storage.js`, `desktop/character-storage.cjs`, main/preload:
  file-authoritative Character/walkthrough storage and current-origin migration.
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
unchanged. Active-walkthrough live and same-session recovered items require the
confirmed current source/generation. Completion and cancellation close those windows.
Released Slots/Review drafts can recover their latest matching Re-equip boundary
after Base acceptance, never the earlier Base interval. In 0.9.5 these admission
guards run before the model's cross-session automatic-item lookup. Eligible older
journal rereads can update one uniquely matched saved item; exact IDs remain
idempotent and deliberately removed/expired records stay blocked. Multiple
physical copies require review rather than a guessed merge or extra card.

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

Canonicalization happens before the model's automatic same-item lookup. A unique
saved identity can receive rereads across tiers and capture sessions; OCR cannot
establish that a changed tier represents another physical copy. Catalog Add and
Second copy create explicit independent IDs. If several saved copies match,
choose one; pending choices recheck current identity and capture/removal context.
Existing cards are not silently collapsed or deleted. Timestamp/sequence guards
keep older evidence from overwriting newer observations, and deliberate edits
remain protected.
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

## Tier controls, removal passes and relaunch

The selected item's tier/progress controls are outside Edit captured values.
Their immediate updates preserve the focused control and scroll position.
Choosing a different tier uses a labeled catalog-base preview with changed values
green; observed values, original tier/progress and evidence remain intact.
Use captured stats restores the observed basis. Missing or unsupported catalog
data and unknown progress remain unknown. Tier 10 uses progress zero. Saving the
advanced form does not restore a stale tier from when that form opened.

X removes the physical card and blocks held/queued rereads for that reading pass,
even if OCR changes its tier. A fresh eligible phase or source generation can
recover it. Rescan removed items starts a new eligible time boundary in Unequip,
Re-equip, Slots or Review, while older frames and pending old manual imports stay
blocked. It does not admit Base-time items, start capture or weaken source/session
ownership. Legacy ignores without timestamps recover conservatively through a
fresh pass rather than authorizing their old journal history.

Inventory and walkthrough state are loaded from the trusted main process's
private Character file before mount. Present file keys win over browser mirrors;
missing keys may migrate from the current origin. Normal relaunch and cache
upgrade retain metadata, equipment, edits and cards even if the preferred local
port is busy. Starting a new walkthrough deliberately clears layout/baseline
while retaining all inventory IDs. Corrupt files are preserved/write-blocked and
warn visibly; no old browser-origin scan or silent private-data replacement runs.

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

The 0.9.5 local source suite, zero-vulnerability dependency audit, production
catalog and both native Character/workspace gates passed. The separate
three-process main/preload storage fixture passed same-origin restart, cache
upgrade and forced-port-fallback restoration in the actual Character DOM.
Focused model/walkthrough checks cover unique cross-session rereads, manual-copy
ambiguity, protected edits, strict/Any slots, held removal and fresh Rescan.
Platform/package/public-download acceptance still belongs to the release ledger;
no installed profile or private game image is used as a fixture.

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
