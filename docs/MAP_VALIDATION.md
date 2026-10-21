# Map explorer validation — 0.8.1

Checked October 21, 2026 on Windows using the owner's installed client archives
and default text maps. This records the evidence for the integration PR and
the remaining release limits. The app's read-only game boundary was retained.
Client files, decoded geometry, screenshots, synthetic log files, and raw
diagnostic exports remain private and are absent from Git.

## Method and context

Tests launched the actual Electron desktop entry point with an isolated user
profile and synthetic log outside the game installation. The renderer used
the shipped parser, viewer, file bridge, and bundled Recast worker. Developer
instrumentation selected geometry-derived synthetic start/goal positions;
these were not character positions or recordings of live game movement.

The current contracts and source map are in [HANDOFF.md](HANDOFF.md),
[INTEGRATION_AUDIT.md](INTEGRATION_AUDIT.md), and
[NAVMESH_EVALUATION.md](NAVMESH_EVALUATION.md). Reproduce the public regressions
with `npm test` and `npm run test:desktop-worker`; use
[WINDOWS_MANUAL_TEST.md](WINDOWS_MANUAL_TEST.md) for live client acceptance.

Private rerun context is kept under the wiki checkout's ignored
`.local/eoz-map-validation/`: `GEOMETRY_VALIDATION_NOTES.md`,
`contract-review.md`, `cases.json`, `render-matrix.cjs`,
`render-scales.cjs`, and `render-interactions.cjs`. These are local evidence,
not downloadable repository fixtures. Final summaries are `render-matrix.json`,
`render-scales.json`, and `render-interactions.json`; earlier headless results
must not be substituted for the final rendered run.

## Defects corrected

- Exact archive IDs now win over display-name aliases. `commons` no longer
  selects `ecommons`; ordinary Mistmoore zoning uses the same exact aliases
  as the app shell. Unknown/ambiguous names cannot select a substring match.
- All load entry points are serialized. The newest queued selection wins,
  superseded promises settle, failed loads clear readiness, and old scene or
  collision results cannot become the new zone's data.
- A zone change clears stale location readiness. Repeated same-zone `/who`
  preserves the current position. Async failures, cancellation, replacement,
  and route preparation respect their request owner; failed preparation can
  retry after later movement.
- Temporary First-view transitions during a route cannot replace the logged
  player pose with the previous target. Replacement and moved-start routes use
  a cloned current-zone logged ground point; the arrow and later First view
  retain that position. Unsynced manual exploration keeps its original start.
- The HUD retains the logged elevation while the camera grounds to the local
  floor. Hidden loads defer Top/Map framing until a visible viewport exists.
- Viewer batching preserves pass-through collision metadata instead of
  turning those faces into solid obstacles.
- Established routes are validated before drawing, as are Recast candidates.
  Both must have walkable support, body clearance, legal climbs, and exposed
  directed drops. Thin ceilings, walls, unsupported segments, narrow gaps,
  and drops through intervening floors fail closed.
- Recast uses the viewer's 6-unit height, 2.25-unit radius, and +6 climb;
  these world dimensions are converted to voxel units. Route-local raster
  bounds and a cell budget prevent oversized rasterization.
- The desktop response policy permits WebAssembly compilation. A real
  Electron worker test verifies a valid route and confirms JavaScript string
  evaluation remains blocked; the test runs in Windows CI and build gates.
- Redacted diagnostics retain aggregate established-route rejection reasons.
  ASAR checks detect missing or stale runtime modules and generated workers.

The former Befallen acceptance fixture had its two logged axes transposed.
Local map/archive bounds support `/loc -961, -30, -66` and client-map anchor
`(30, 961, -66)`. The checklist and parser fixture are corrected; the shared
coordinate transform did not change.

## Rendered routes and appearance

The final route matrix covers five decoded S3D zones and rotates First, Top,
and Map across 28 requests: open surfaces, ramps in both directions, wall
probes, stacked-floor ascents, and downward/reverse-drop probes. Every
displayed path was independently checked against exported collision geometry.

| Zone | Collision triangles | Requests | Valid paths | Destination only |
| --- | ---: | ---: | ---: | ---: |
| Befallen | 23,286 | 7 | 1 | 6 |
| Commonlands (`commons`) | 9,932 | 5 | 3 | 2 |
| Upper Guk (`guktop`) | 27,228 | 5 | 4 | 1 |
| Kurn's Tower | 41,887 | 5 | 3 | 2 |
| Mistmoore | 26,635 | 6 | 3 | 3 |

Result: **14 displayed paths, zero displayed validation violations, and 14
honest no-path/validation rejections**. These are safety and integration
observations, not a 100% route-completion claim. Some ramp/drop probes cannot
currently produce a safe route. The guarded established-first policy remains;
Recast is not promoted to first-choice routing.

Longest observed generation was 2.37 seconds in the worker. Maximum observed
frame interval was 317 ms across route preparation and 84 ms during the
candidate phase. Rendering continued during calculation; those pauses remain
performance observations, not a claim of uniformly smooth frame pacing.

The appearance matrix exercised Mistmoore, Commonlands, and Befallen in all
three views at 100%, 125%, and 150% **emulated renderer scale**: 27 captures.
Toolbars stayed within the viewport and canvas resolution followed scale.
First/Top showed decoded textures; Map showed the intended text-map line art.
Resolved/material counts were Mistmoore 130/130, Commonlands 115/116, and
Befallen 70/70. Commonlands' remaining material was a transparent boundary,
not an opaque missing texture. The host ran at 150% Windows scaling; the
other cases do not establish OS-wide DPI behavior.

## Release decision and remaining checks

Eleven actual-renderer interaction checks pass: cancel, pending-target
replacement, view/camera/Z-slice continuity during worker calculation, zoning
during a route, exact ordinary-log zoning, latest synthetic log bursts in all
three modes, repeated same-zone `/who`, Mistmoore alias/elevation, and an actual
diagnostic export. In the worker interaction probe, the presentation change
completed in 9 ms and retained the selected camera and slice. The exported
schema-v2 JSON was inspected for the synthetic identity/target, log names,
local paths, and raw geometry; none appeared. Established rejection diagnostics
contain only status, reason, and violation count.

The fixes are suitable for review as a guarded map integration repair. Keep
destination-only behavior when a route cannot be validated. Do not weaken
clearance, promote Recast, or claim that a rendered synthetic probe proves a
walkable in-game itinerary.

The full automated suite, actual Electron worker smoke, dependency audit at
the high-severity gate, production catalog gate, Windows NSIS compilation,
and exact-source ASAR check pass. Both synthetic route corpora pass 8/8.
Eight moderate builder-chain advisories remain. The local installer is unsigned
(`Get-AuthenticodeSignature`: `NotSigned`) and was not installed.

Live game movement/heading comparison, dynamic doors and actors, a complete
known-walkable route matrix, OS-wide DPI transitions, and NSIS installation/
Authenticode verification still require the Windows acceptance checklist.
The related wiki exporter catalog requires its own reviewed installation
and subsequent dataset rebuild; pushing this desktop PR does not install it.
