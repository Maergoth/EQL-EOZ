# Navmesh dependency and UX evaluation

Status: guarded decoded-viewer integration implemented; first-choice promotion awaits the real-zone matrix

Reviewed: 2026-09-05

Candidate: [`recast-navigation` 0.43.1](https://github.com/isaac-mason/recast-navigation-js)

## Decision

The pinned `recast-navigation` 0.43.1 worker passed the shared geometry corpus and now runs as a guarded candidate against decoded viewer collision geometry. The established collision-validated pathfinder still produces the first visible route. Recast may atomically replace only its rendered ribbon after full-goal, collision-surface, and directed-elevation validation. Do not make it first choice or add a player-facing engine toggle until the proprietary-zone and responsiveness gates pass.

Why it is the preferred prototype:

- It is a maintained WebAssembly port of upstream [Recast Navigation](https://github.com/recastnavigation/recastnavigation), with high-level generation and Detour query APIs.
- It ships as ECMAScript modules for browsers and Node, accepts flat right-handed counter-clockwise triangle input, and documents both solo and tiled generation.
- Its maintained example demonstrates navmesh generation in a Web Worker and transfer through exported navmesh bytes, matching Eye of Zomm's non-blocking requirement.
- The wrapper is MIT licensed; upstream Recast/Detour is Zlib licensed. Both are compatible with Eye of Zomm's MIT distribution when notices are retained.
- Version 0.43.1's published umbrella/core/generator/WASM packages total approximately 2.35 MB unpacked according to npm registry metadata. The WASM package is the majority at approximately 1.99 MB.

## Risks and required proof

| Risk | Consequence | Required mitigation before production |
|---|---|---|
| The API remains pre-1.0 | Minor releases may break integration | Pin the exact version and update only through corpus-tested dependency review |
| The package supplies an example, not a ready-made worker | Main-thread use could stall map interaction | Bundle a dedicated module worker; generation and queries must never execute in the renderer |
| Eye of Zomm currently ships browser modules without a bundler | Bare npm imports will not resolve reliably from the packaged viewer | Add a deterministic build step that emits one local worker bundle and verify it is included in ASAR |
| Directed drops need off-mesh connections | A bidirectional link could display an impossible climb | Generate downward-only links and retain post-query +6 ascent/collision validation |
| Navmesh generation can fail on unusual decoded geometry | A route could vanish or block the user | Keep the current engine ready as fallback and never clear a usable route before a validated replacement exists |
| Not all upstream functionality is exposed by the wrapper | A required low-level operation may be unavailable | Prove generation, queries, serialization, off-mesh links, and cleanup in the synthetic corpus before integration |
| New supply-chain surface | A compromised dependency would enter a desktop release | Pin lockfile integrity, run `npm audit`, record notices, inspect transitive packages, and build only through CI |

Directly compiling upstream Recast/Detour with Emscripten remains the control-heavy fallback if the wrapper cannot support directed links or stable worker packaging. It is not preferred for the first prototype because Eye of Zomm would own the bindings and build toolchain.

## Route-engine boundary

The integrated candidate lives behind `app/recast-route-client.js`. `app/collision-geometry.js` cooperatively flattens the viewer's transformed `zoneGroup` collision meshes in the existing right-handed Y-up basis, skips props/pass-through/degenerate triangles, and crops a bounded corridor around the established route. The full zone buffer remains local; only ephemeral route-local typed buffers transfer to the generated module worker.

The client applies a 12-second timeout, uses latest-request-wins worker termination, and restarts after worker-level failure. Zone, destination, clear, and reroute changes invalidate orchestration serials before any response can display. `app/recast-route-engine.js` rejects Detour partial results and shares the +6 climb limit; `app/route-validation.js` grounds sparse funnel points and independently rejects paths that leave the supplied surface, exceed upward policy, or reverse an exposed drop.

The shared corpus emits:

- `Float32Array positions` in viewer `(x, y-up, z)` coordinates;
- `Uint32Array indices` with upward-facing winding;
- start and goal points in the same basis;
- directed off-mesh drop connections;
- agent constraints including the +6 EQ-Z climb limit.

The spatial boundary is explicit and singular: logged and wiki values arrive in displayed `(Y, X, Z)` order, normalize to world `(X, Y, Z)`, then convert to viewer/Recast `(-Y, Z, X)`. Client `.txt` map points use `(-world X, -world Y, world Z)` and therefore convert to the same viewer anchor as world/WLD geometry. No route engine should parse displayed or client-map coordinates or perform its own second transform.

The worker response includes engine/version, status, path points, generation/query duration, validation count, and a machine-readable fallback reason. Before display, every candidate path passes the collision and directed-elevation validator. Diagnostics schema v2 retains only the aggregate engine/version, counts, timings, status, validation count, and reason; it deliberately drops path points, targets, coordinates, worker error detail, and local paths. A failed candidate is evidence for diagnostics, never permission to display an invalid segment.

## 0.8.0 integration state

- `exportViewerCollisionGeometry` applies each collision mesh's `matrixWorld`, reverses winding under negative determinants, produces finite `Float32Array` positions and `Uint32Array` indices, and yields cooperatively during large zones.
- `cropCollisionGeometryForRoute` bounds work around the established route, caps the payload at 250,000 triangles, and derives downward-only links from exposed drops already accepted by that route.
- The established route is calculated and shown before candidate work is scheduled. Recast success removes only render-order 910–912 route meshes, preserves the destination beam/target/camera/presentation, and installs the new line and existing cue logic atomically.
- Missing geometry, empty/oversized crops, generation/query failure, partial goals, validator rejection, timeout, cancellation, and stale responses cannot remove the established line.
- The asset-free integration test runs exported/cropped viewer-format triangles through Recast and independent validation; winding, prop exclusion, crop selection, mirrored transforms, cancellation, and one-way drops have focused contracts.
- Windows ASAR verification requires the collision exporter, worker client, viewer orchestration, owner-state message, and bundled Recast worker to ship together.

This is integration evidence, not the real-client promotion decision. See the exact matrix and failure taxonomy in [the handoff](HANDOFF.md#exact-next-work) and [Windows checklist](WINDOWS_MANUAL_TEST.md#5b-guarded-spatial-candidate-and-fallback).

## Player-facing UX contract

The route engine is implementation detail. Smooth behavior matters more than exposing its sophistication.

| Internal state | Player experience |
|---|---|
| Zone geometry is still preparing | Map, markers, view controls, and `/loc` continue working. A destination uses the existing route engine immediately. |
| Candidate route is calculating | Keep the last valid golden path visible and label the state “Updating path…”; never blank the map or force a view change. |
| Candidate route is better and valid | Replace the line atomically, retain the destination, and continue the same calm turn/distance cue. |
| Candidate generation/query fails | Continue with the existing valid route. Only mention compatibility routing when it materially affects the result; put technical detail in redacted diagnostics. |
| Neither engine finds a valid route | Keep the destination marker and say why a line is unavailable, with Clear and Wiki actions preserved. |
| `/loc` arrives during work | The newest position wins. Stale worker results are discarded by request/zone/destination identity. |

Normal use gets no engine selector, navmesh settings, Recast terminology, blocking spinner, or success toast. First/Top/Map and full/minimal choices remain untouched. Distance is quantized for glanceability while the underlying value remains exact for route logic and diagnostics.

## Prototype acceptance

1. Both reference and candidate adapters consume the same generated triangle fixtures.
2. Candidate generation and query execute in a module worker with transferable buffers.
3. At least 95% of corpus expectations match and zero displayed segments violate collision or directed elevation.
4. Slow or failed candidate work leaves the existing path and input responsiveness intact.
5. The packaged Windows build contains only pinned local worker/WASM assets and required MIT/Zlib notices.
6. Real-client tests confirm stacked floors, ramps, doors, and drops without adding engine-specific controls to the UI.

Items 1–5 pass through 0.8.0: 8/8 shared outcomes, zero accepted validation violations, a deterministic worker artifact, decoded-viewer export-to-Recast coverage, and retained MIT/Zlib notices. Item 6—real-client correctness and responsiveness across the complete matrix—remains the promotion gate. `npm audit --audit-level=high` is enforced locally and in GitHub CI/build/release, and `npm ls --all` confirms the pinned dependency tree.

## Sources reviewed

- [`recast-navigation-js` README](https://github.com/isaac-mason/recast-navigation-js): browser/Node ESM support, geometry format, generation/query APIs, worker approach, and MIT license.
- [`recast-navigation-js` worker example](https://github.com/isaac-mason/recast-navigation-js/blob/main/examples/three-vite-worker-example/src/navmesh-worker.ts): worker initialization, generation, serialization, transfer, and cleanup.
- [`recast-navigation` changelog](https://github.com/isaac-mason/recast-navigation-js/blob/main/packages/recast-navigation/CHANGELOG.md): current 0.43.1 package line and ongoing changes.
- [Upstream Recast Navigation](https://github.com/recastnavigation/recastnavigation): rasterization model, Detour modules, industry use, and Zlib license.
