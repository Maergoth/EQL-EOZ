# Eye of Zomm implementation status

0.9.6 adds a compact total-only character inspect, clickable indexed augment
sockets, filtered empty-slot Add item with a tier slider and explicit screenshot
paste, and reviewed interactive wiki sheets. Power Source and Character
fractional progress controls are removed without discarding saved cards or
observations. See [CHARACTER_SHEETS_PLAN.md](CHARACTER_SHEETS_PLAN.md) for the
cross-repository schema, ownership, actual checks and wiki activation boundary.
The wiki component and two database templates must be installed before app
sharing is enabled; source/PR preparation alone is not live deployment.


0.9.5 adds visible selected-item tier/progress controls with labeled catalog previews,
private Character storage independent of the loopback port, automatic cross-session
item reuse, explicit extra copies, two manual Any slots, strict compatible-slot
placement and drag highlights. Removed-item suppression is scoped to a capture
pass; fresh later passes and Rescan removed items recover valid reads. See
[the current persistence plan](CHARACTER_INVENTORY_PERSISTENCE.md) for the
archive audit, acceptance and limits.

The 0.9.4 Character inventory follow-up adds a compact 23-slot icon board,
identity and live estimates, known-only placement and explicit unmatched-item
review. [The current plan](CHARACTER_INVENTORY_REVIEW.md) records source ownership,
legacy recovery, native fixtures and release gates.


The 0.8.9 desktop follow-up adds installed system fonts, a one-time upgrade
cache repair, green item-level values, a complete Live Map loot pane, browsable
release screenshots, a five-second Windows restart countdown and an opt-in swing
estimate. See [frontend cache](design/FRONTEND_CACHE.md),
[release history](RELEASE_HISTORY.md) and [validation](../VALIDATION.md).

Last updated: 2026-10-24

Code baseline: 0.9.6; inspect follow-up tracked in [CHARACTER_SHEETS_PLAN.md](CHARACTER_SHEETS_PLAN.md)

This is the compact execution index for the [road to v1](UX_VISION.md#16-road-to-v1). For setup and architecture, use the [contributor handoff](HANDOFF.md). “Implemented” means the code and automated contract exist; proprietary map behavior still requires the linked Windows/game-client test.

| Vision area | Status | Evidence | Next condition |
|---|---|---|---|
| Optional capture and wiki contributions | Implemented; Windows/Linux X11 source/native baseline passed | Local OCR/journal, log-first candidates, current Help blueprints, hardened wiki login, reviewed multi-page changes and persisted partial retry; [execution plan](CAPTURE_CONTRIBUTIONS.md) | Final changed-head CI/package checks; real game skins, production CAPTCHA/2FA and native Wayland remain manual |
| Character snapshots | Implemented; guided native fixture passed | One details-to-save walkthrough, inline source, auto-slots/ANY review, durable raw-text/Haste edits and inventory X, computed equipped estimates, separate AC/ATK components, offline imports and guarded sharing | Final changed-head checks; preserve OCR uncertainty and unsupported server-formula limits |
| Font preferences | Implemented; native Windows/Linux CI passed | Shared main/overlay family and bounded base size, retained panel multipliers, process persistence/reset, canvas labels and compact Trigger sizing; [evidence](../VALIDATION.md) | Retain physical DPI/compositor acceptance |
| Linux desktop | Implemented; Ubuntu 22.04/X11 package/runtime CI passed | Same source/version, AppImage/deb, actual packaged binary/log/panels smoke, selected-folder paths and verified package handoff | Native Wayland, other desktops and complete installed upgrades remain manual acceptance |
| 0.6 usable loop | Implemented | Folder/log/zone/`/loc` readiness, persistent mode/destination, relevant item defaults, live tier details, non-modal recovery; `npm test` | Retain all [Windows/manual gates](WINDOWS_MANUAL_TEST.md) |
| 0.7 replacement map | Implemented; local rendering checked | Explicit coordinate adapters, exact/serialized loads, accurate logged HUD, hidden framing, intel-first defaults, optional map/routing, persistent cancel, WLD texture alignment; 27 view/scale captures | Complete live-client sections 1–5 and OS-wide DPI checks on a current build |
| 0.8 live route guidance | Implemented in 0.7.1; real-client gate required | Pure projection/remaining-distance/turn/facing/off-route tests; cue HUD in First/Top/Map; route summary updates from `/loc` | Verify cue direction and readability while moving in all three modes |
| 0.8 redacted diagnostics | Schema v2 implemented; actual export inspected | Allow-list retains aggregate collision/established/candidate status, counts, timings, and reasons; regressions and actual renderer export exclude private fields | Retain redaction when adding diagnostic fields |
| 0.8 route corpus contract | Implemented; decoded local geometry checked | Both corpora pass 8/8; expanded 36-case rendered matrix has 20 valid paths/16 markers and exact endpoints; supported stair and certified drop regressions | Extend complex stair/door/alternate-itinerary coverage without weakening validation |
| 0.8 Recast/Detour worker | Guarded real-zone candidate integrated; promotion gated | Pinned 0.43.1 + deterministic module bundle; cooperative decoded-viewer collision export; bounded route crop; transferable buffers; established-first atomic replacement; latest-request-wins cancellation; independent validation; package and notice checks | Pass the full proprietary-zone and responsiveness matrix before making Recast first choice |
| 0.9 decision intelligence beta | Planned | User stories and data rules in vision 16.4 | Begin only after the 0.8 95% corpus/collision/non-blocking exit gate |
| 1.0 trusted release | Planned | Quality gate in vision 16.5 | Signing, upgrade path, support/compatibility docs, clean Windows matrix, no S1/S2 defects |
| Application updater | Implemented; 0.8.6 adds silent upgrade/relaunch after the explicit restart action | GitHub beta discovery; verified bounded NSIS staging; trusted main-window IPC; launch-failure recovery; Electron IPC/UI smoke; prior official installer preserved profile and shortcut targets | Complete a later approved in-app silent upgrade; current publication leaves the owner's local installation unchanged |
| Native modular overlays | Implemented in 0.8.3 PR; physical game/OS acceptance pending | Parse/Map/Intel/Triggers are separate windows; PNUT five tabs, own Taken, one session, bounded complete aggregates, saved layouts, lock/passthrough and recovery; actual Electron smoke; [source map](PNUT_UX_PLAN.md) | Physical passthrough, focus, scaling and monitor/sleep matrix; no duplicate 3D decoder or native docking claimed |
| Native map and Intel | Implemented with synthetic IPC evidence and production dataset | Client line-map canvas, shared routes, Normal Zone/Raid Zone identity, lazy all-drop Show More, named consider/kill focus/expand/flash/blip without activation; Through era is cumulative; map modes only on main Map page | Live source/location acceptance |
| PNUT-style timers and swing | Implemented with synthetic log evidence | Main list/editor with literal/regex PNUT captures, preview, cooldown/overlap, warning/end colors and sound/speech, notifications; persisted deadlines/replay guards and observed swing; [rules](TIMERS.md) | Live EQL grammar and timing comparison; timestamps limit precision to one second |
| Missing wiki suggestions | Implemented; explicit clipboard capture acceptance pending | Complete-catalog membership guard, shared inline main/native Triggers notices, 15 visible seconds with hover/focus pause, Screenshot source choices/clipboard and persistent Ignore; no popup/upload | Fresh complete catalog, physical capture/source selection and local clipboard check |
| Main window and map controls | Implemented in 0.8.4; physical monitor acceptance pending | Native main frame; saved placement/maximized state; tray/start preferences; responsive map footer; embedded minimap zoom; native Z slider with unknown-Z markers; Raid Zone first; [continuation index](WINDOW_MAP_POLISH.md) | Physical monitor removal/DPI and live game interaction |
| Native map modes and Intel workspace | Implemented in 0.8.5; CI and physical acceptance tracked separately | Collapsing Reset/Follow/zoom/view header; exact label hit targets; lazy overlay Top/First viewer; camera-only mob preview; pinned shared tier/class controls; [source map](OVERLAY_MAP_WORKSPACE.md) | GitHub Windows gates, physical pointer-lock/focus and live archive acceptance |

## Current highest-priority task

Complete the authorized 0.9.5 Character inventory release using
[CHARACTER_INVENTORY_PERSISTENCE.md](CHARACTER_INVENTORY_PERSISTENCE.md). Revalidate the final changed head, then verify
the unified Windows/Linux publication. Screen reading defaults off; existing
combat/map/trigger functionality continues to use logs. Preserve all existing
map acceptance requirements and explicit wiki review boundaries.

Review the [0.8.1 integration audit](INTEGRATION_AUDIT.md) and
[rendered map validation](MAP_VALIDATION.md). The local-archive pass now covers
five zones, 36 route probes, 27 view/scale captures, and actual Electron worker
execution. Twenty routes validate and sixteen remain destination-only. The
[rejection audit](ROUTE_REJECTION_AUDIT.md) distinguishes original uncertified
probes from recovered valid ramps/drops; keep
the guarded engine policy and conservative clearance checks.

Next verify known-walkable ramp/drop/door coverage and live movement/heading,
OS-wide DPI changes, and installer behavior. The reviewed raid/catalog producer
includes raid variants and complete public presence indexes. The current
[dataset manifest](https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json)
is independent of application publication; 0.8.7 additionally requires the
reviewed NPC known-loot reconciliation and reported Hate drops. Capture only
aggregate schema-v2 diagnostics. Both established and candidate paths must
validate before display; do not introduce a renderer-thread collision graph
or expose an engine selector.

Acceptance for the completed topology slice:

- synthetic redistributable topology fixtures cover outdoor, narrow indoor, stacked floors, a legal ramp, a blocked door/wall, an exposed drop, and an illegal ascent over +6 EQ Z;
- each case declares path/no-path plus any required directional asymmetry;
- test output reports pass rate and segment-policy violations;
- the harness runs from `npm test` without proprietary game files;
- all eight expectations pass and documentation names the next exact task.

Acceptance for the completed geometry/evaluation slice:

- corpus fixtures provide triangle/collision input without proprietary assets;
- typed positions/indices use one documented right-handed Y-up basis and upward winding;
- exposed drops produce directed off-mesh links while closed doors remain disconnected;
- dependency provenance, licenses, package footprint, worker requirement, fallback behavior, and smooth UX states are documented.

Acceptance for the completed worker slice:

- reference and candidate adapters consume the same start, goal, and triangle buffers;
- Recast generation and queries execute outside the renderer thread through a deterministic local bundle;
- the candidate reaches at least 95% expected outcomes with zero displayed segment-policy violations;
- pinned dependency audit/notices and packaged-worker checks pass;
- candidate work never blanks a valid path, blocks interaction, changes view mode, or exposes engine jargon.

Acceptance for the completed integration slice:

- the viewer exports one finite typed collision buffer in its existing right-handed Y-up basis;
- zone changes cancel/restart candidate work and stale zone/location/destination results are ignored;
- the established golden path is validated before its first draw and remains visible until a validated candidate replacement is ready;
- candidate projection/validation happens before any path reaches First/Top/Map or the cue HUD;
- real-zone diagnostics report only redacted zone/archive identity, timings, outcome, and fallback reason;
- Windows checks prove no camera, floor, zoom, destination, main/native-window, or input-responsiveness regression.

The first five items now have automated implementation evidence: `app/collision-geometry.js` exports/crops finite typed data in the viewer basis; zone/destination/request serials terminate stale worker work; the established route is never cleared for candidate preparation; the Recast result is projected and validated before atomic display; and diagnostics schema v2 contains only explicit aggregate fields. The final Windows item, plus actual route quality on proprietary geometry, remains open.

Acceptance for promotion to first-choice Recast routing:

- Mistmoore and one outdoor S3D zone show correct texture assignment/tiling in First and Top;
- outdoor open ground, narrow indoor, stacked-floor stairs, legal ramp, closed wall/door, downward drop, and reverse ascent all match the manual expectations;
- candidate export/query does not visibly stall rendering or input at 100%, 125%, or 150% Windows scaling;
- target changes, Cancel, route refresh, and zone changes never allow a stale result to replace current guidance;
- every candidate failure retains the established valid line or honest destination marker and has a redacted machine-readable category;
- no displayed segment violates collision support or the +6 upward/directed-drop policy.

## Known evidence gaps

- GitHub cannot contain or exercise a player's proprietary zone archives or logs.
- Automated geometry contracts do not establish visual texture fidelity, rare-label alignment at every camera angle, or route usefulness in a live dungeon.
- The Recast candidate now consumes the same decoded collision geometry shown by the viewer, but no repository fixture can establish that every proprietary archive exposes the intended collision/material semantics or that candidate quality is better in a live dungeon.
- A signed Windows release still depends on trusted Authenticode credentials being configured.

## 0.7.5–0.7.7 coordinate incident note

The earlier transform treated canonical world X/Y, wiki display order, in-game Map labels, and client-map file axes as interchangeable, then incorrectly encoded the client map as `(-world Y,-world X)`. Real map data disproves that assumption: Mistmoore `/loc -330,120,-178.13` corresponds to the map's Succor point `(-120,330,-180)`, so the map file is `(-world X,-world Y,Z)` with no swap. The bad transform placed the marker at rotated point `(330,-120)`. `app/coordinate-system.js` now owns each conversion; real Mistmoore/Befallen anchors and the side-by-side Mistmoore Map capture `X -222.75, Y 125.50, Z -154.10` require map/world paths to meet at one Three.js point. Player-facing viewer readouts use the Map window's labels, not canonical axes.

The screenshot that prompted 0.7.7 still showed the pre-0.7.6 strings (`X … Y … Z …` and `Synced to map location X…`), even though the downloaded 0.7.6 installer's ASAR was independently confirmed to contain the corrected `/loc` HUD and transform. The running build was therefore stale or from another installation. Version is now always visible, and Windows builds inspect the packaged ASAR before upload so source/package drift fails the workflow.

Legends `/who` rows now provide a second zone-detection path. The parser accepts the current character's `ZONE: Display Name 1595 (shortname)` row, strips the instance ID, and lets the app resolve the stable short name to the canonical catalog/viewer zone. Other players and duplicate rows cannot cause a zone reload.
