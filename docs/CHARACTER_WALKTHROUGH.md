# Guided Character capture

## Owner request and release boundary

The owner requests a single start-to-finish Character walkthrough rather than
separate capture/editor forms: identity, source setup inside the flow, unequip
and read items, confirm no equipment and capture base stats, re-equip/read missed
items, resolve ANY slots, calculate totals, then save a snapshot. Capture should
remain owned by that walkthrough until completion or explicit cancellation.
Inventory cards need a top-right remove action. Reduce routine Character review
checkboxes; retain explicit wiki publication/upload review separately.

Default Modern's local inventory XML identifies the AC row's first component as
mitigation AC, the slash component as mitigation softcap and the last component
after the divider as evasion AC. Attack has distinct offense and accuracy values.
These are separate components, not current/maximum or melee/ranged values.
The walkthrough must display meaningful labels and preserve all observed values.
Explicit item Haste and the pane's bounded written stat block must survive OCR,
review, persistence and sharing; the wiki cannot supply invented observations.

Start from published 0.9.0 source `6a66df7ca8fb5f32990edaca0cc4065b1e74284d`
on `codex/character-capture-walkthrough`. Keep published releases immutable.
No installed-player profile is a test fixture. No production wiki test writes,
private game captures or account data in Git. Preserve unrelated EQLWiki dirt.

## Critical context after compaction

- `app/capture-workspace.js/css`: shared contribution/capture settings, calibration,
  Character intake, current independent forms and share dialog. Root owns these.
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
| root | Walkthrough state/UI integration, inventory X, simpler local review, planning, metadata and release checks |
| capture_pipeline_089 | Pane text/haste, Default Modern AC/ATK components, OCR/reader regressions |
| character_model_089 | Metadata/AAs, auto-assignment API, calculated totals and sharing, model tests |
| wiki_contribution_089 | Real resize cursor/hit areas and capture persistence/source recovery, host/native tests |

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
3. **Unequip**: ANY-slot items first. Keep each examine visible until captured.
   Read full item text, auto-place unambiguous items into the simulated equipment
   layout, retain explicit paired copies and defer ambiguous/ANY placement.
4. **No Equipment**: the player advances after removing all gear, then reviews
   one editable base-stat block. Captures before this step cannot become base
   statistics. Preserve distinct AC/ATK components. One confirm/continue action.
5. **Re-equip**: normal equipment first, ANY items last. Keep reading missed items;
   repeated evidence cannot create duplicate physical copies or displace gear.
6. **Resolve slots**: confirm ANY and ambiguous assignments in one place, with
   explicit empty choices. Ordinary compatible assignment needs no checkbox.
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

## Acceptance gates

- Unit checks for stage transitions/resume/cancel/completion, stage-scoped base
  intake, auto-slot/ANY ambiguity, repeated observations and durable inventory X.
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

## Progress

Implementation is complete for the 0.9.1 follow-up to published 0.9.0. The owner
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
