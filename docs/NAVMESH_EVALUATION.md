# Navmesh dependency and UX evaluation

Status: isolated corpus prototype passed; real-zone production integration not yet approved

Reviewed: 2026-09-04

Candidate: [`recast-navigation` 0.43.1](https://github.com/isaac-mason/recast-navigation-js)

## Decision

The pinned `recast-navigation` 0.43.1 worker passed the shared geometry corpus and is approved for real-zone integration testing. Do not replace the current collision-validated pathfinder or add a player-facing engine toggle until proprietary-zone and responsiveness gates pass. The dormant local bundle may ship in 0.7.3 so packaging can be tested without activating it.

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

The implemented prototype lives behind `app/recast-route-client.js`. It transfers cloned typed buffers to a generated local module worker, applies a 12-second timeout, ignores stale responses, and restarts after worker-level failure. `app/recast-route-engine.js` rejects Detour partial results; `app/route-validation.js` grounds sparse funnel points and independently rejects paths that leave the supplied surface or reverse an exposed drop.

The shared corpus emits:

- `Float32Array positions` in viewer `(x, y-up, z)` coordinates;
- `Uint32Array indices` with upward-facing winding;
- start and goal points in the same basis;
- directed off-mesh drop connections;
- agent constraints including the +6 EQ-Z climb limit.

The spatial boundary is explicit and singular: logged and wiki values arrive in displayed `(Y, X, Z)` order, normalize to world `(X, Y, Z)`, then convert to viewer/Recast `(Y, Z, X)`. Client `.txt` map points use `(-world Y, -world X, world Z)` and therefore convert to the same viewer anchor as world/WLD geometry. No route engine should parse displayed or client-map coordinates or perform its own second transform.

The future worker response must include engine/version, status, path points, generation/query duration, and a machine-readable fallback reason. Before display, every candidate path must pass the existing collision and directed-elevation validator. A failed candidate is evidence for diagnostics, never permission to display an invalid segment.

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

Items 1–5 pass in 0.7.3: 8/8 shared outcomes, zero accepted validation violations, a deterministic 747 KiB worker artifact, and retained MIT/Zlib notices. Item 6 and decoded real-zone performance remain the activation gate. `npm audit --audit-level=high` is enforced in GitHub CI/build/release; the restricted local environment timed out contacting the advisory service, while `npm ls --all` confirmed a complete pinned dependency tree.

## Sources reviewed

- [`recast-navigation-js` README](https://github.com/isaac-mason/recast-navigation-js): browser/Node ESM support, geometry format, generation/query APIs, worker approach, and MIT license.
- [`recast-navigation-js` worker example](https://github.com/isaac-mason/recast-navigation-js/blob/main/examples/three-vite-worker-example/src/navmesh-worker.ts): worker initialization, generation, serialization, transfer, and cleanup.
- [`recast-navigation` changelog](https://github.com/isaac-mason/recast-navigation-js/blob/main/packages/recast-navigation/CHANGELOG.md): current 0.43.1 package line and ongoing changes.
- [Upstream Recast Navigation](https://github.com/recastnavigation/recastnavigation): rasterization model, Detour modules, industry use, and Zlib license.
