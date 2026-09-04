# Eye of Zomm implementation status

Last updated: 2026-09-04

Code baseline: 0.7.3

This is the compact execution index for the [road to v1](UX_VISION.md#16-road-to-v1). For setup and architecture, use the [contributor handoff](HANDOFF.md). “Implemented” means the code and automated contract exist; proprietary map behavior still requires the linked Windows/game-client test.

| Vision area | Status | Evidence | Next condition |
|---|---|---|---|
| 0.6 usable loop | Implemented | Folder/log/zone/`/loc` readiness, persistent mode/destination, relevant item defaults, live tier details, non-modal recovery; `npm test` | Retain all [v0.7 manual gates](V0.7_MANUAL_TEST.md) |
| 0.7 replacement map | Implemented; real-client gate required | Dataset rare labels, minimal loot research, stabilized heading, latest-location coalescing, mode-safe live sync, continuous route refresh | Pass sections 1–4 of the Windows checklist on the release installer |
| 0.8 live route guidance | Implemented in 0.7.1; real-client gate required | Pure projection/remaining-distance/turn/facing/off-route tests; cue HUD in First/Top/Map; route summary updates from `/loc` | Verify cue direction and readability while moving in all three modes |
| 0.8 redacted diagnostics | Implemented in 0.7.1 | Allow-list snapshot and regression test proving character, log name, paths, and future unknown settings are absent | Attach one exported JSON to a test issue after manually inspecting it |
| 0.8 route corpus contract | Implemented in 0.7.3 | Reference and candidate both pass 8/8 shared triangle expectations; invalid surface exits and reversed drops are rejected | Extend the same boundary to decoded proprietary real-zone geometry |
| 0.8 Recast/Detour worker | Isolated prototype implemented; production integration gated | Pinned 0.43.1 + 747 KiB deterministic module bundle; transferable buffers; p95 synthetic query report; latest-request-wins client; timeout/restart/fallback; package and notice checks | Connect viewer collision export, then pass real-zone and responsiveness matrix before preference |
| 0.9 decision intelligence beta | Planned | User stories and data rules in vision 16.4 | Begin only after the 0.8 95% corpus/collision/non-blocking exit gate |
| 1.0 trusted release | Planned | Quality gate in vision 16.5 | Signing, upgrade path, support/compatibility docs, clean Windows matrix, no S1/S2 defects |

## Current highest-priority task

Connect the proven Recast/Detour worker boundary to decoded viewer collision geometry without changing the visible navigation flow. Production viewer integration remains blocked on a single coordinate export, independent validation, request identity, and the real-zone Windows matrix.

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

Acceptance for the next integration slice:

- the viewer exports one finite typed collision buffer in its existing right-handed Y-up basis;
- zone changes cancel/restart candidate work and stale zone/location/destination results are ignored;
- the existing golden path is available immediately and remains visible until a validated candidate replacement is ready;
- candidate projection/validation happens before any path reaches First/Top/Map or the cue HUD;
- real-zone diagnostics report only redacted zone/archive identity, timings, outcome, and fallback reason;
- Windows checks prove no camera, floor, zoom, destination, minimal/full, or input-responsiveness regression.

## Known evidence gaps

- GitHub cannot contain or exercise a player's proprietary zone archives or logs.
- Automated geometry contracts do not establish visual texture fidelity, rare-label alignment at every camera angle, or route usefulness in a live dungeon.
- The 0.7.1 cue is still derived from the current grounded production path. The formal navmesh prototype is not yet connected to proprietary viewer geometry.
- A signed Windows release still depends on trusted Authenticode credentials being configured.
