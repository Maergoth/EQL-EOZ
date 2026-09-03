# Eye of Zomm implementation status

Last updated: 2026-09-03  
Code baseline: 0.7.1

This is the compact execution index for the [road to v1](UX_VISION.md#16-road-to-v1). For setup and architecture, use the [contributor handoff](HANDOFF.md). “Implemented” means the code and automated contract exist; proprietary map behavior still requires the linked Windows/game-client test.

| Vision area | Status | Evidence | Next condition |
|---|---|---|---|
| 0.6 usable loop | Implemented | Folder/log/zone/`/loc` readiness, persistent mode/destination, relevant item defaults, live tier details, non-modal recovery; `npm test` | Retain all [v0.7 manual gates](V0.7_MANUAL_TEST.md) |
| 0.7 replacement map | Implemented; real-client gate required | Dataset rare labels, minimal loot research, stabilized heading, latest-location coalescing, mode-safe live sync, continuous route refresh | Pass sections 1–4 of the Windows checklist on the release installer |
| 0.8 live route guidance | Implemented in 0.7.1; real-client gate required | Pure projection/remaining-distance/turn/facing/off-route tests; cue HUD in First/Top/Map; route summary updates from `/loc` | Verify cue direction and readability while moving in all three modes |
| 0.8 redacted diagnostics | Implemented in 0.7.1 | Allow-list snapshot and regression test proving character, log name, paths, and future unknown settings are absent | Attach one exported JSON to a test issue after manually inspecting it |
| 0.8 route corpus contract | Foundation implemented in 0.7.1 | 8/8 outdoor/indoor/stacked/ramp/door/drop/elevation route expectations pass with zero segment-policy violations | Add shared triangle/collision geometry and run it through production/prototype engine adapters |
| 0.8 Recast/Detour worker | Planned, approval point retained | Architecture contract in vision 16.3; current collision graph remains fallback | Choose a maintained license-compatible WASM dependency only after corpus exists |
| 0.9 decision intelligence beta | Planned | User stories and data rules in vision 16.4 | Begin only after the 0.8 95% corpus/collision/non-blocking exit gate |
| 1.0 trusted release | Planned | Quality gate in vision 16.5 | Signing, upgrade path, support/compatibility docs, clean Windows matrix, no S1/S2 defects |

## Current highest-priority task

Make the route corpus geometry-backed, then evaluate the Recast/Detour worker against it. The topology harness now establishes outcomes and directed elevation rules independently of a navmesh library; its next adapter must provide the same redistributable collision input to both the retained pathfinder and the prototype.

Acceptance for the completed topology slice:

- synthetic redistributable topology fixtures cover outdoor, narrow indoor, stacked floors, a legal ramp, a blocked door/wall, an exposed drop, and an illegal ascent over +6 EQ Z;
- each case declares path/no-path plus any required directional asymmetry;
- test output reports pass rate and segment-policy violations;
- the harness runs from `npm test` without proprietary game files;
- all eight expectations pass and documentation names the next exact task.

Acceptance for the next geometry/engine slice:

- corpus fixtures provide triangle/collision input without proprietary assets;
- both route adapters consume the same start, goal, and geometry contract;
- Recast generation and queries execute outside the renderer thread;
- the candidate reaches at least 95% expected outcomes with zero displayed segment-policy violations;
- dependency provenance/license/security review and fallback behavior are documented.

## Known evidence gaps

- GitHub cannot contain or exercise a player's proprietary zone archives or logs.
- Automated geometry contracts do not establish visual texture fidelity, rare-label alignment at every camera angle, or route usefulness in a live dungeon.
- The 0.7.1 cue is derived from the current grounded path; it improves following but does not make the underlying graph a formal navmesh.
- A signed Windows release still depends on trusted Authenticode credentials being configured.
