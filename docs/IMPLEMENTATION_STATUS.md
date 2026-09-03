# Eye of Zomm implementation status

Last updated: 2026-09-03  
Code baseline: 0.7.2

This is the compact execution index for the [road to v1](UX_VISION.md#16-road-to-v1). For setup and architecture, use the [contributor handoff](HANDOFF.md). “Implemented” means the code and automated contract exist; proprietary map behavior still requires the linked Windows/game-client test.

| Vision area | Status | Evidence | Next condition |
|---|---|---|---|
| 0.6 usable loop | Implemented | Folder/log/zone/`/loc` readiness, persistent mode/destination, relevant item defaults, live tier details, non-modal recovery; `npm test` | Retain all [v0.7 manual gates](V0.7_MANUAL_TEST.md) |
| 0.7 replacement map | Implemented; real-client gate required | Dataset rare labels, minimal loot research, stabilized heading, latest-location coalescing, mode-safe live sync, continuous route refresh | Pass sections 1–4 of the Windows checklist on the release installer |
| 0.8 live route guidance | Implemented in 0.7.1; real-client gate required | Pure projection/remaining-distance/turn/facing/off-route tests; cue HUD in First/Top/Map; route summary updates from `/loc` | Verify cue direction and readability while moving in all three modes |
| 0.8 redacted diagnostics | Implemented in 0.7.1 | Allow-list snapshot and regression test proving character, log name, paths, and future unknown settings are absent | Attach one exported JSON to a test issue after manually inspecting it |
| 0.8 route corpus contract | Geometry contract implemented in 0.7.2 | 8/8 route expectations pass; every fixture emits typed triangle buffers, start/goal anchors, agent constraints, and directed drop links | Run the shared buffers through reference and candidate worker adapters |
| 0.8 Recast/Detour worker | Candidate selected; prototype next | `recast-navigation` 0.43.1 dependency/worker/UX review in [NAVMESH_EVALUATION.md](NAVMESH_EVALUATION.md); current engine remains fallback | Add pinned audited dependency, deterministic worker bundle, corpus adapter, and post-query validation |
| 0.9 decision intelligence beta | Planned | User stories and data rules in vision 16.4 | Begin only after the 0.8 95% corpus/collision/non-blocking exit gate |
| 1.0 trusted release | Planned | Quality gate in vision 16.5 | Signing, upgrade path, support/compatibility docs, clean Windows matrix, no S1/S2 defects |

## Current highest-priority task

Prototype the selected Recast/Detour worker against the now geometry-backed route corpus. The harness establishes outcomes and directed elevation rules independently of the candidate; production viewer integration remains blocked until worker execution, packaging, off-mesh drops, and post-query validation pass.

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

Acceptance for the next worker slice:

- reference and candidate adapters consume the same start, goal, and triangle buffers;
- Recast generation and queries execute outside the renderer thread through a deterministic local bundle;
- the candidate reaches at least 95% expected outcomes with zero displayed segment-policy violations;
- pinned dependency audit/notices and packaged-worker checks pass;
- candidate work never blanks a valid path, blocks interaction, changes view mode, or exposes engine jargon.

## Known evidence gaps

- GitHub cannot contain or exercise a player's proprietary zone archives or logs.
- Automated geometry contracts do not establish visual texture fidelity, rare-label alignment at every camera angle, or route usefulness in a live dungeon.
- The 0.7.1 cue is derived from the current grounded path; it improves following but does not make the underlying graph a formal navmesh.
- A signed Windows release still depends on trusted Authenticode credentials being configured.
