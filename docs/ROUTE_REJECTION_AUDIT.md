# Destination-only route investigation

This follows the initial 0.8.1 [map validation](MAP_VALIDATION.md). The first
rendered run returned 14 paths and 14 destination-only results. The follow-up
compares the exact viewer-grounded requests with decoded collision geometry;
fixture names such as "ramp" or "exposed drop" are hypotheses, not proof that
a route is walkable. No client assets, coordinates, or generated geometry are
published here.

## Reproduction and source map

The private `.local/eoz-map-validation/` directory in the wiki checkout keeps
the original results as `render-matrix-before-route-followup.json`. Actual
wrapper payloads and grounded endpoints are in `followup-request-*.json` and
`followup-all-grounded-anchors.json`. Collision geometry is exported from the
rendered scene, rather than inferred from text-map labels. `ROUTE_FOLLOWUP_PLAN.md`,
`RAMP_FOLLOWUP.md`, and the owner-prefixed classification/drop reports retain
the investigation context. `render-route-followup.cjs` reruns the original
matrix and separately identified positive probes.

Relevant runtime seams are:

- [recast-route-engine.js](../app/recast-route-engine.js): polygon corridor,
  funnel, and connectors to the exact trusted endpoints;
- [route-validation.js](../app/route-validation.js): walkable support,
  continuous body clearance, supported stair transitions, and directed drops;
- [drop-certification.js](../app/drop-certification.js): bounded independent
  proof of an exposed descent before permitting a worker link;
- [viewer.html](../app/zoneviewer/viewer.html): preserve successful detours,
  permit at most one certified retry, and discard cancelled/stale work.

## Initial rejection classification

| Initial case | Geometry evidence |
| --- | --- |
| Befallen ramp down | The raw upper anchor is only 4.8 units below an overlapping floor, insufficient for the 6-unit body. Viewer grounding correctly selects the upper floor instead. The resulting request has no complete local polygon corridor. |
| Befallen ramp up | Same endpoints in reverse; the raw "ramp" label does not establish connectivity between the grounded floors. A separate nearby clear ramp supplies the positive regression. |
| Befallen wall | The direct line crosses a solid wall; the candidate detour fails body clearance beside 10-unit wall faces. No safe alternate was certified. |
| Befallen stacked ascent | The direct same-position rise is 36 units; no complete local corridor was found. An endpoint must not be snapped to a different floor to manufacture success. |
| Commonlands wall | Direct solid-wall crossing; ordinary query cannot reach the goal. Expanding the local crop did not establish a safe alternate. |
| Commonlands stacked ascent | The direct rise is approximately 54.6 units. Candidate detours require independent clearance checks rather than accepting the vertical shortcut. |
| Upper Guk stacked ascent | The direct rise is 21 units. A one-unit riser exposed a genuine false clearance rejection; the complete route must still pass every later stair and side-panel check. |
| Kurn wall | The exact destination itself fails body clearance. Moving the destination to a nearby navmesh polygon would conceal the problem. |
| Kurn stacked ascent | The direct rise is 26 units; no complete local corridor was established. |
| Mistmoore wall | The exact destination fails body clearance; the direct wall crossing cannot be replaced by an endpoint teleport. |
| Befallen forward drop | Edge-projected proposal still crosses solid walls. Adding a directed link alone does not make it safe. |
| Befallen reverse drop | Reverse of the blocked descent; direct rise exceeds the +6 limit and no safe alternate was certified. |
| Mistmoore forward drop | Raw and edge-projected proposals fail wall/body clearance. It must remain destination-only. |
| Mistmoore reverse drop | Direct reverse ascent exceeds +6; no safe alternate was certified for this pair. |

"No safe alternate certified" describes the tested geometry/corridor. It is
not proof that every possible itinerary through the entire zone is impossible.
All 15 synthetic forward-drop anchors were also checked: their labels
did not establish safe exposed descents. Some reverse-labelled cases were
ordinary continuous slopes.

## Repairs and required invariants

A confirmed clear Befallen ramp reached its goal polygon, but the former
high-level funnel returned a point 1.25 units from the requested endpoint.
The one-unit completion test therefore reported it as unreachable. The engine
now proves that the entire polygon corridor reaches the goal, funnels between
the closest polygon points, and validates connectors to the exact original
start and goal. Partial corridors and unsupported endpoints still fail closed.

Stair validation now requires adjacent supported landings, an actual capped
riser, and a rise no greater than +6. Clearance permission belongs to that
specific traversal and its contiguous approach/exit. It cannot be borrowed
by an unrelated route segment, overlapping floor, floating cap, or overhang.
Thin ceilings, tall walls, unsupported climbs, and body width remain guarded.

Previously, rejecting the established line also removed every source of
one-way drop links. A short local descent can now be independently certified
from collision geometry. Its link starts at the actual exposed takeoff, after
a validated approach. The ordinary query runs first; a successful detour is
retained. Only a certified descent may retry an unreachable or independently
rejected ordinary result. There is one retry, bounded to 64 horizontal units
and 60 units of descent. Engine faults, timeouts, and allocation limits do not
trigger another query. Cancellation and zone ownership cover proof and retry.

The certificate does not reduce the actor dimensions. Link attachment allows
the navmesh's eroded edge to connect; the returned route and exact endpoint
connectors still pass full collision validation. No reverse ascent permission
is created. Redistributable regressions include disconnected landings, a
supported approach behind the ledge, intervening floors, overlapping floors,
walls, headroom, buffer transfer, and stale proof/retry results.

## Final rendered verification

The actual Electron renderer repeated all original 28 requests and added eight
separately verified probes. The original outcomes remain 14 paths/14 markers:
no prior valid path regressed, and no uncertified probe was forced to succeed.

| Supplemental requests | Observed result |
| --- | --- |
| Clear Befallen ramp, both directions | Candidate ready in both directions, exact endpoints, full-geometry validation. The old ascending candidate rejected its valid endpoint connection. |
| Mistmoore ordinary detour, both directions | Existing safe detours remain ready with one query and no added drop link. |
| Mistmoore clear descent | No established fallback; ordinary candidate rejects, one certified retry returns a valid path with one actual drop. |
| Kurn clear descent | No established fallback; ordinary candidate rejects, one certified retry returns a valid path with one actual drop. |
| Direct reverse of each recovered descent | Both remain markers. No reverse link or artificial ascent is authorized. |

Across the expanded **36 requests: 20 valid displayed paths, 16 markers,
zero displayed validation violations, and zero start/goal error on every
displayed path**. The two drop recoveries are actual marker-to-path repairs;
the ramp fix corrects candidate completion while retaining safe fallback.
Authorized links were captured before buffer transfer and used with the full
rendered collision mesh for the independent verification.

The original Guk request still fails full-body clearance at additional stair
side panels. Correcting single risers and supported stair flights does not
authorize arbitrary low wall faces. Complex stairs, conservative body bounds,
and alternate routes outside the tested corridor remain coverage limits;
this investigation does not claim every legal route is now found.

Both 8/8 corpora, focused stair/drop/endpoint regressions, and the complete
automated suite pass. Eleven actual-renderer interaction checks pass again.
Worker generation remains off the UI thread; longest observed combined
generation was 2.63 seconds, with a 287 ms maximum observed frame interval.
The guarded established-first policy remains. Live gameplay and installer
acceptance retain the limits in [MAP_VALIDATION.md](MAP_VALIDATION.md).

## Current 0.8.3 detour verification

A follow-up to a report from an older 0.8.1 installation exercised the current
0.8.3 desktop entry point, viewer wrapper, parser, and bundled browser worker.
The navigation engine, validator, collision exporter, movement policy, drop
certifier, and worker client are unchanged between the `v0.8.1` and `v0.8.3`
tags; this check establishes current behavior, not a new engine correction.

Two synthetic endpoint pairs derived from Mistmoore's decoded terrain were
submitted through the normal named-destination wrapper. Both direct segments
cross a solid wall. The freshly decoded scene contained 26,635 collision
triangles. The resulting 36- and 57-point paths traveled around the obstruction,
with route lengths 1.215 and 3.194 times their direct planar distances. Both
passed independent validation against the complete scene with zero violations.
The first retained a valid established fallback; the second recovered from an
established no-path result through a ready candidate without drop links.
Observed candidate generation took approximately 727 and 539 ms.

The check used a hidden isolated desktop profile and synthetic location inputs,
with external network access disabled and client archives read only. It does
not prove an arbitrary named target is reachable in live gameplay. The existing
Befallen wall, Guk/Commonlands stacked-floor, and Mistmoore wall probes still
reject for their documented body-clearance or incomplete-corridor reasons.
No new routing defect was established, and collision checks were not relaxed.
An older application's message alone cannot identify a current failure; a
repeatable current-version zone/target and redacted rejection status are needed
to classify any remaining report.
