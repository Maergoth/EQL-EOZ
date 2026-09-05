# Eye of Zomm implementation status

Last updated: 2026-09-05

Code baseline: 0.8.0

This is the compact execution index for the [road to v1](UX_VISION.md#16-road-to-v1). For setup and architecture, use the [contributor handoff](HANDOFF.md). “Implemented” means the code and automated contract exist; proprietary map behavior still requires the linked Windows/game-client test.

| Vision area | Status | Evidence | Next condition |
|---|---|---|---|
| 0.6 usable loop | Implemented | Folder/log/zone/`/loc` readiness, persistent mode/destination, relevant item defaults, live tier details, non-modal recovery; `npm test` | Retain all [Windows/manual gates](WINDOWS_MANUAL_TEST.md) |
| 0.7 replacement map | Implemented; real-client gate required | Explicit coordinate adapters, intel-first Minimal defaults with no destination field, optional map/row routing, NPC waypoint copy, fly-first controls, Succor reset, Z slicer, worker-first routes, persistent cancel, lazy archive hydration, WLD material-group alignment | Pass sections 1–5 and the UI/texture checks on the 0.8.0 installer |
| 0.8 live route guidance | Implemented in 0.7.1; real-client gate required | Pure projection/remaining-distance/turn/facing/off-route tests; cue HUD in First/Top/Map; route summary updates from `/loc` | Verify cue direction and readability while moving in all three modes |
| 0.8 redacted diagnostics | Schema v2 implemented | Allow-list snapshot retains aggregate collision/candidate identity, counts, timings, outcome, validation count, and fallback reason while tests exclude character, target, worker detail, log name, paths, and future unknown settings | Manually inspect one real-zone export before attaching it to a test issue |
| 0.8 route corpus contract | Implemented in 0.7.3 | Reference and candidate both pass 8/8 shared triangle expectations; invalid surface exits and reversed drops are rejected | Extend the same boundary to decoded proprietary real-zone geometry |
| 0.8 Recast/Detour worker | Guarded real-zone candidate integrated; promotion gated | Pinned 0.43.1 + deterministic module bundle; cooperative decoded-viewer collision export; bounded route crop; transferable buffers; established-first atomic replacement; latest-request-wins cancellation; independent validation; package and notice checks | Pass the full proprietary-zone and responsiveness matrix before making Recast first choice |
| 0.9 decision intelligence beta | Planned | User stories and data rules in vision 16.4 | Begin only after the 0.8 95% corpus/collision/non-blocking exit gate |
| 1.0 trusted release | Planned | Quality gate in vision 16.5 | Signing, upgrade path, support/compatibility docs, clean Windows matrix, no S1/S2 defects |

## Current highest-priority task

Validate the carried WLD material-group alignment correction in Mistmoore and one outdoor S3D zone, then run the integrated candidate through the complete outdoor/indoor/stacked/ramp/door/drop Windows matrix. Capture only aggregate schema-v2 diagnostics and interaction observations. The established line-map route remains the first visible authority until that matrix supports promotion; do not reintroduce a renderer-thread collision graph or expose an engine selector.

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
- the existing golden path is available immediately and remains visible until a validated candidate replacement is ready;
- candidate projection/validation happens before any path reaches First/Top/Map or the cue HUD;
- real-zone diagnostics report only redacted zone/archive identity, timings, outcome, and fallback reason;
- Windows checks prove no camera, floor, zoom, destination, minimal/full, or input-responsiveness regression.

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
