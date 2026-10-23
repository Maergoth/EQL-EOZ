# Character catalog search and reviewed base-stat recovery

## Scope and release boundary

The owner requested Character item search with an item-level slider, and a way
to work backwards from a newly observed tiered drop to wiki base values. The
owner explicitly requires these additions in 0.9.0. This work starts from merged source `21903b48d3bd9abf8edd00a1affe60af1d5793ca`
on `codex/character-catalog-base-recovery`. The first 0.9.0 publication is withdrawn to draft. Public download verification
found missing packaged OCR dependencies as well. Reissue 0.9.0 only after the
feature additions and physical dependency checks pass; preserve the withdrawn
source/assets/metadata privately before replacing that draft/tag. No private game
pixels/player values are fixtures. Keep Default Modern (`default_modern`) as the
current OCR support scope.

Critical context (read these after compaction):

- `app/item-scaling.js` and `tests/wiki-item-scaling.mjs`: exact forward rules,
  rounding, negative/clamped values, non-scaling fields and wiki parity.
- `D:/EQLWiki/docs/EQL_COMPONENTS.md` item slider/hover contract and active
  `extensions/ItemLevelSlider/itemlevelslider.js`: forward math, including
  context-dependent eligible SV Void. Common.js contains other database behavior;
  do not confuse its partial tracked snippets with the registered slider module.
- `app/character-model.js`, `character-share.js`, `capture-workspace.js/css`:
  nullable tier/progress, observed/base stats separation, physical cards and PNG.
- `app/contribution-model.js`, `contribution-queue.js`, `desktop/wiki-client.cjs`:
  base-item/augment blockers, saved review fields, complete page review/guarded
  writes; every published field remains a human-verified proposal.
- `docs/RELEASE_090.md` plus component design guides: calibrated OCR, journal and
  ownership, existing native checks, private evidence paths and platform limits.

## Ownership and integration order

| Work | Owner | Contract |
| --- | --- | --- |
| Pure inverse math and tests | capture_pipeline_089 | New item-base-recovery module only; agree API before UI integration |
| Character search/tier preview/add flow | character_model_089 | New catalog module and Character-only shared workspace lines/styles; model changes coordinated |
| Contribution recovery review, metadata, native checks and PR | root | Contribution-only shared workspace lines; preserve observed evidence and current publish guards |
| OCR physical packaging fix and isolation checks | wiki_contribution_089 | Package files/resources only; preserve old public evidence; no installer execution |

1. Confirm current forward math against the primary wiki source; retain provenance.
2. Build independent catalog search/tier preview and mathematically bounded inverse.
3. Show observed tier/progress/augment context, possible base values and explicit
   review. Never replace observed stats, guess a missing digit, or choose an
   ambiguous base silently. Unknown progress remains unknown.
4. Exercise search/add/duplicate/persistence and tier4 recovery/ambiguity/unknowns
   with synthetic unit and actual desktop fixtures. Keep full wiki plan review.
5. Expand the withdrawn 0.9.0 illustrated What's New/README, open a scoped PR
   and record actual checks and limits. Withdrawn release metadata and source
   evidence stay private; reissue this same version from the exact passing source.

## Integrated acceptance and publication

Root integrated the Character catalog, reviewed inverse flow, overlay layout,
Map player state and Intel stability changes on this branch. The actual native
workspace checks pass keyboard search, green tier previews, distinct item copies,
slot persistence, tier-10 progress and a tier-4 review: observed HP42 has base30,
ambiguous AC remains blank until selected, and unsupported Weight/Damage Bonus
are omitted. Original observations and prose survive. Generated stat text starts
unverified, the wiki preview labels inference, and edits invalidate stale review.
All write operations in these fixtures target a disposable loopback wiki.

The native Intel fixture preserves its visible row and expanded/collapsed state
through twelve reordered distance snapshots. It restores keyboard focus only
when the panel owns it; new consider/kill focus remains intentional and occurs
once. Independent source review found no further Intel or source-guard blockers.
Parse/Triggers and Map native checks are described in their sections below.
Manual main-viewer Z inspection must retain the full-zone slider range after
Auto Z is disabled; its regression covers a floor outside the automatic slice.

What's New now keeps 29 versions and 33 reviewed PNGs. Four new synthetic native
captures cover catalog search, base recovery, overlay layout and Map Auto Z;
all earlier captures remain byte-identical. README and changelog describe the
final behavior. Fresh catalog acceptance uses generation
`20261023T002545Z-3f720f2f99ef`: 124 zones, 8681 NPCs, 11285 items,
44633 drop sources, including 11 Vicar items and 5 Lord of Loathing items.

The integrated full source suite and catalog checks pass; dependency audit has
zero findings. Changed-head Windows/Linux CI and installer/package acceptance
must pass before the owner
merges. The release must fetch one verified bootstrap for both platforms. After
publication, anonymous download/extraction must compare exact source, historical
media, physical OCR resources and bootstrap bytes from all three archives. The
release owner records exact PR/head/run/source and public asset evidence in the
PR and private `eoz-090-release-progress.json` ledger; earlier passing heads do
not satisfy these gates. No installed user profile or production wiki writes
are part of acceptance. Default Modern is the current calibrated skin;
native Wayland and foreground-game composition remain manual limits.

## Character catalog search

`app/character-catalog.js` searches the current local item pack by name and exact
wiki title, ignoring case, accents and punctuation. Every query token must match;
tokens can appear in a different order. Rendering is bounded to 24 results by
default (60 maximum), with a total count and a prompt to refine large searches.
An empty, sample or incomplete cache shows its limits; a missing result never
proves that a wiki item does not exist. Catalog read failures leave manual card
entry available. No search request goes to the wiki or another service.

Character has an independent **Item Level Slider** for tiers 0–10 and an explicit
integer fractional-progress field. Tier 10 is capped at the wiki maximum and
accepts progress zero only; lower tiers accept 0 through 2^tier − 1. These controls do not change the main Items,
Zone & loot or map sliders. Hover, keyboard-focus or select a result to see its
cached icon, canonical title, compatible slots and stat preview. Arrow keys move
between results; normal Tab/Enter controls remain available. Adjusted values use
the existing `scaleItemStat` helper and green modified-stat presentation, with
muted base comparisons. Current font/theme settings apply to the component.

**Add to inventory** selects the exact cached wiki identity and creates a new
physical Character card each time, including identical copies. Its values remain
`baseStats`; selected tier and progress are explicit, with zero as the initial
progress. No examine stats, capture evidence or equipped-total values are
fabricated. Augment state remains unknown unless the catalog explicitly says
`augmentStatus:'none'`; review the card before using complete gear sums. The
ordinary editor, assignment warnings, inventory bounds and persistence apply.

Conditional SV Void scaling is not inferred without its required item context.
Cards retain the exact `SV_CORRUPTION` base value and bounded
`unscaledStatKeys:['SV_CORRUPTION']` metadata. At tier zero the known base is
usable. At a higher tier its adjusted value stays null in preview, derived sums
and sharing, with a warning; actual observed examine values still take precedence
unchanged. Other supported stats continue to use existing forward rules.

The component exports `searchCharacterCatalog(pack,query,{limit?})`,
`characterCatalogCard(item,{tier?,fraction?,icon?})` and
`characterCatalogPreview(item,options)` as pure helpers.
`mountCharacterCatalog({host,getPack,onAdd})` owns only its local DOM/listeners;
`onAdd({item:card})` uses normal Character intake. `refresh()` observes pack
replacement and `dispose()` releases listeners. Workspace integration selects
the new card, refreshes gear/editor output and invalidates the prior share image.

`node tests/character-catalog.mjs` passed synthetic search, bounded/incomplete
catalog states, independent fractional scaling, changed/unchanged values,
distinct physical copies, base/observed separation and unsupported Void values
through persistence, sums and share JSON. Existing model and workspace source
tests also passed. These are synthetic source checks; native UI integration and
same-version 0.9.0 package checks remain recorded by the release owner below.

## Base recovery engine

Owner: capture_pipeline_089. Implemented independently in
`app/item-base-recovery.js`; it imports the unchanged `scaleItemStat` helper.

- `recoverItemBaseStat(key,observed,{tier,fraction,augmentStatus,bounds?})` returns
  `status: exact | range | unknown | unsupported`, nullable `value`, inclusive
  `ranges`, a sample of at most 16 `candidates`, `candidateCount`, a machine-readable
  `reason`, explicit `provenance` and `autoPublish:false`.
- `recoverItemBaseStats(stats,options)` returns
  `{fields:{CANONICAL_KEY:result},sourceKeys,warnings,provenance,autoPublish:false}`.
  It accepts at most 64 numeric fields. Parser camel-case names and existing
  Character canonical keys normalize to the same keys; conflicting aliases stay
  unknown rather than accepting whichever value arrived last. Inputs are not
  mutated and original observations remain separate.
- `isItemBaseCandidate(key,base,observed,options)` validates a human choice against
  an `exact`/`range` result, its numeric grid, bounds and the forward roundtrip.
  It rejects unknown/unsupported results, including elevated-weight diagnostics.
  A valid choice does not confirm or publish a field.

The declared search domain is signed 32-bit integer base values. Weight uses
nonnegative tenths with the same bounded integer-unit range. Optional
`bounds:{min,max}` can narrow review ranges; the engine searches all mathematical
branches first so hidden/disjoint candidates cannot create false uniqueness.
Clipped ranges are labeled and never become `exact`. Samples and range counts
do not enumerate billions of clamped candidates.

Every candidate interval is found by binary searches over the actual forward
function, then checked by forward roundtrip. Primary stats are split at the
negative/small/zero/positive branches because the -11/-10 boundary is not globally
monotone near the tier cap. This preserves separate valid penalty ranges and
zero clamps instead of filling gaps or dividing a displayed value by a presumed
multiplier. Synthetic examples: tier4/fraction0 HP42 recovers base30, STR9
recovers base5, while a zeroed penalty has several possible bases. Integer
stats off their observed unit grid remain unknown.

Tier and fraction must both be explicit, valid integers. An unreadable fraction
never becomes zero; tier10 rejects nonzero progress, matching the wiki cap.
Recovery requires `augmentStatus:'none'` or `'excluded'` under an explicit review
that the observed values exclude augments and other modifiers. `'included'` and
`'unknown'` are blocked; the engine never subtracts guessed or catalog augment
values. Unknown item identity, OCR accuracy and other modifiers remain review
limits even when the inverse is mathematically unique.

The current [primary ItemLevelSlider source](https://eqlwiki.com/extensions/ItemLevelSlider/itemlevelslider.js)
was fetched read-only on 2026-10-22: 23,525 bytes, SHA256
`0011db5f4b6e3ec2fa723a39f7dd697c3862ac718d83783669246f625fee8f23`.
Its primary-stat, standalone damage, range, flat regen/haste and explicit static
delay/elemental/bane/backstab families informed the inverse. Existing EoZ forward
behavior is preserved. Unsupported keys do not silently use the forward helper's
identity fallback. Conditional/generated SV Void, damage bonus, Attack Speed,
Attack and character resource totals require other context and remain unsupported.

Two pre-existing parity boundaries are explicit. The app permits progress at
tier10, while the wiki lists only tier10/fraction0; inverse input rejects the
extra states. The app subtracts `1e-9` before weight's ceiling, while the live wiki
uses direct ceiling. A synthetic base-weight1/tier10 boundary produces app0.1
versus wiki0.2. Consequently positive-tier weight ranges are **app-only diagnostic
candidates with `status:'unknown'`**, never certified exact bases or accepted
human choices. Tier0 weight can be exact on the tenth grid. Resolving this
forward parity behavior is outside this engine and must not silently change the
shared slider in this feature.

`node tests/item-base-recovery.mjs` passes all declared families, positive/negative
and clamp cases, fractional near-cap disjoint ranges, clipped custom bounds,
unknown progress/augment context, unit grids, weight parity, alias conflicts and
bounded samples. An independent brute enumeration compares the complete
forward-equivalent base set over -120..160 across representative families,
tiers and fractions. These synthetic checks establish the engine contract,
not real-item accuracy or automatically verified wiki truth.

## Contribution review integration

Owner: root. Preserve original tiered evidence and require separate confirmation
of unmodified/augment-free values and any inferred base field before generating
wikicode. Rounding may produce several bases; show the choices/ranges rather than
claim a unique result. Unsupported effects, damage bonuses, derived character
stats and unknown input never become silently inferred canonical base values.

## Validation and PR ledger

Pending source/native checks, current follow-up PR and same-version reissue.
The existing 0.9.0 release evidence remains in PR11/PR12 and private
`D:/EQLWiki/.local/validation/eoz-0.9.0-release-verified.json` after verification.

## Additional owner requirements for the same 0.9.0 release

- Global header Overlays button cycles Locked / Unlocked / Hidden for all panels.
- Parse has a clear unlocked drag grip and resize affordance; locked state disables
  drag/resize, retains interaction, and preserves saved positions/bounds.
- Triggers snaps to the current resized Parse bounds; resize edge cursors must
  reflect actual unlocked capabilities, without a misleading cancel cursor.
- Both 3D Top and First-person views show a marker at the logged player position.
  Auto Z follows the latest known player elevation; manual Z overrides it and an
  unknown elevation is never invented as zero. Camera-only NPC preview remains
  separate from the player's logged position.

Overlay cycle/Parse/snap owner: character_model_089. Map owner:
capture_pipeline_089. The root owns integration, new 0.9.0 illustrated history,
scoped PR, exact-head checks and same-version reissue. Production wiki writes
and execution of installed player profiles/installers are excluded from tests.

## Global overlay cycle and layout editing

The header button shows **Overlays: Locked**, **Unlocked** or **Hidden** and
cycles **Locked → Unlocked → Hidden → Locked** for Parse, Map, Zone & loot and
Triggers together. `OverlayHost.control('cycle-all')` calculates the transition
once from current owner preferences, then applies/saves all four panels. No
visible panels resolve to Hidden; otherwise any known unlocked panel resolves
to Unlocked, including a hidden unlocked panel. A partially visible all-locked
set resolves to Locked. The button's accessible name and tooltip describe its
current mode and next action; a pending action disables repeat submission.

Entering Unlocked shows every panel, unlocks each layout and restores mouse
input so editing works immediately. Hidden hides every panel; the next click
shows and locks them all. Per-panel Settings controls, panel menus, tray and
Ctrl+Shift+O recovery remain available. Individual bounds, opacity and font size
survive a cycle. These actions use nonactivating show and never start capture,
reset the shared parse or send game input.

Parse and Triggers show a dedicated grip and a visible corner resize button
while unlocked. Their other controls remain outside native drag regions. The
corner uses the standard diagonal resize cursor and supports pointer dragging
or arrow keys (5 logical pixels, Shift for 20). The exact overlay frame sends
only bounded own-panel resize requests; the host rechecks visible/unlocked state
and mouse input, clamps dimensions and keeps bounds on an available work area.
Keyboard deltas apply to current native bounds, avoiding a stale Chromium
viewport immediately after another resize. Lock hides these handles and disables
native move/resize capability while leaving menus/tabs interactive.

Triggers magnetically aligns within 12 logical pixels of Parse's current native
rectangle, using a 6-pixel gap above/below it. Moving aligns left/right edges;
resizing near the same right edge can match its width. Targets come from
`Parse.getBounds()` at the event, so a resized Parse is used immediately. Snapping
requires the same monitor work area and never clamps a snap across its boundary.
There is no hidden persistent docking relation or automatic following. Explicit
Triggers height changes are saved as manual height; normal content snapshots
cannot undo them. **Reset positions** restores automatic compact content height.

`tests/native-overlays.mjs` covers the full/mixed-state cycle, independent
preferences, resize authorization and bounds, current-target magnetic alignment,
monitor boundaries and retained manual height. `tests/overlay-ui.mjs` verifies
state labels and next actions. The real Electron smoke additionally checks all
four native windows, header controls, resize capabilities, grip/hit geometry,
keyboard-driven own-panel resize and Triggers alignment after a real native
Parse bounds change. The Windows source smoke passed on 2026-10-22, including
trusted injected pointer input through the visible resize handle, native bounds
changes and pointer-capture release. Its keyboard regression deliberately acts
before the prior viewport resize has painted, proving deltas use current host
bounds; native logical-pixel rounding allows a one-pixel measurement difference.
Pointer injection supplies Electron's explicit global coordinates and waits for
a fresh visible frame. It runs after hidden screenshot checks because Windows
Viz can stall an immediate hidden `capturePage` following show/resize/hide.
The inspected Parse and Triggers images show distinct grips and corner controls.
These use disposable profiles and synthetic log data;
physical OS dragging, foreground-game composition and native Wayland remain
manual acceptance limits. Native image evidence remains private under
`D:/EQLWiki/.local/validation/eoz-overlay-cycle-090`.

## Intel viewport stability

Owner: root. `rareMobsForZone` ranks sources using current distance. The Intel
renderer now orders each normal/raid section by stable name/identity, retaining
original source indices for actions. Ordinary snapshot/loot refreshes capture
the first visible mob and its viewport offset, then restore that anchor after
DOM replacement. Expanded drops and collapsed sections remain intact. A new
explicit focus sequence still reveals its mob once; its later snapshots do not
pull the user back after manual scrolling. Keyboard focus is restored without
scrolling only when the panel currently owns focus.

`tests/intel-stability.mjs` covers ordering/grouping/action identity. The actual
Electron `scripts/test-intel-stability.mjs` preserves viewport geometry through
12 distance/order changes, expanded loot and collapsed sections, then exercises
one deliberate focus jump followed by manual scrolling. Both pass locally;
Windows/Linux workflows include the native check before final packaging.

## Map ground marker and Auto Z

Owner: capture_pipeline_089. The shared `zoneviewer/player-state.js` adapter
draws an independent cyan ring in both Top 3D and First Person. It uses the
pinned viewer's existing mesh factory on an isolated temporary adapter; the
vendor bundle, geometry decoder, route meshes, navigation target and camera
remain separate. Its mesh is excluded from collision selection and disposed
when the zone/source is cleared or the frame is released.

Only finite, explicitly present world X/Y/Z values establish a player marker.
Null, blank and boolean values cannot become zero. The ground probe must return
the same horizontal point within the configured nearby movement/eye-height
tolerance; a distant floor/ceiling is rejected. If no nearby ground is validated,
the ring uses the observed logged elevation and the status text states that
ground is unavailable. This is a display marker, not evidence that the player
is physically standing on a validated surface or that a route is traversable.

The main viewer has an **Auto Z** toggle next to its Z control. The native map
has the same toggle in its collapsible header. Auto Z starts enabled and centers
the slice on the latest known logged Z. The native Reset action enables it
again. Moving a Z slider or inspecting an NPC floor switches to manual; later
log samples still move the player ring but leave that slice and inspection
camera alone. Automatic clipping preserves the full-zone manual slider range;
turning it off still permits inspection of distant floors outside the current
automatic band. Re-enabling Auto Z consumes the latest known elevation. Missing
height preserves the last/manual slice; it never invents a floor at zero. Hate's
Z120 presentation fallback remains available when no known player height exists,
while a known logged height takes precedence. A zone change starts fresh Auto Z;
a source/data revision discards the previous source's cached player height.

`window.eqlEyeOfZommViewer.syncLocation(location,{moveCamera:false,timestamp?})`
records the logged player marker, HUD, heading sample and route start without
moving the camera. Omission of `moveCamera` preserves existing Follow behavior.
NPC focus continues to use the camera-only `focusAtLocation` path. The native
controller synchronizes new logged samples even with camera Follow disabled.
`setAutoZ(enabled,{tolerance?})` controls the main shared helper, while the native
host owns its own slice state. `status().playerMarker` reports only
`{autoZ,hasKnownZ,markerVisible,groundBasis}`; it adds no player coordinates.

`clearPlayerLocation()` clears the logged pose, heading samples, ring and latest
known automatic height while retaining the camera and deliberate manual slice.
The main app's source guard clears parser location, pending samples and partial
log fragments, increments `mapDataRevision` and invokes that API on actual
log/root changes. Queued polling and viewer work retain and recheck source,
revision and zone across asynchronous boundaries. A same-source mode change
retains location. The existing zone-load guard clears the ring before a new
zone can become ready; a stale decode cannot restore it.

Focused checks passed locally: `tests/viewer-player-state.mjs`,
`tests/map-overlay-3d.mjs`, `tests/map-overlay-data.mjs`,
`tests/map-sync-integration.mjs` and `scripts/check-viewer-inline.mjs`.
The actual Electron/WebGL `scripts/test-map-overlay-3d.mjs` additionally exercises
native Top/First rings, camera-only NPC focus, Follow-off log updates, manual and
resumed Auto Z, source clear, main-viewer Auto Z, unknown elevation rejection,
zone reset, configured-folder S3D/EQG hydration and restricted child APIs. Its
geometry is a synthetic plane after a real parser Worker reports the expected
empty synthetic archive error; this does not claim proprietary-zone collision
coverage or live game compositing. Optional `--screenshots <directory>` writes
synthetic `map-player-top.png` and `map-player-first.png`; no game pixels or
installed player profiles are read by the fixture.
