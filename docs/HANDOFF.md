# Eye of Zomm contributor handoff

This repository is the source of truth. A new contributor should be able to resume from this page without prior chat history.

## Start here

1. Read the [product and UX vision](UX_VISION.md) for the approved experience, user stories, acceptance contracts, and ordered road to v1.
2. Read [implementation status](IMPLEMENTATION_STATUS.md) for what is shipped, what still needs real-client evidence, and the exact next task.
3. Run the automated gates in [VALIDATION.md](../VALIDATION.md), then use the [Windows/game-client checklist](WINDOWS_MANUAL_TEST.md) for proprietary archives the repository cannot contain.
4. Check [CHANGELOG.md](../CHANGELOG.md) for the current code version and [SAFETY.md](../SAFETY.md) before changing any game-facing data flow.

Current code baseline: **0.8.5**. Four independent native windows provide Parse, Map, Zone & loot and Timers. Intel lists Raid Zone before Normal Zone, preserves class filters and expands every matching drop through Show More. Its item-level/class controls stay anchored above scrolling mobs; per-mob actions appear on hover/focus. Named considers/kills select and expand Intel with a mild flash/blip, without activating the window. Class-filtered loot excludes statless and weight-only items. Minimal mode and the separate Consider window are retired. Items use cumulative Through era choices present in the dataset.

[Overlay workspace follow-up](OVERLAY_MAP_WORKSPACE.md) is the 0.8.5 continuation
index. Native Map has a collapsing control header and Map/Top/First cycle;
its optional 3D iframe reuses the existing viewer on demand. The main renderer
still owns all parsing and routing. Per-mob Map opens a camera-only preview,
never a fabricated player `/loc`. Intel tier is the same saved main-app value.

[Window/map follow-up](WINDOW_MAP_POLISH.md) records the report from 0.8.1,
confirmed current gaps, source ownership and verification. The main window now
uses the native frame and saves normal bounds/maximized state in
`eye-of-zomm-window.json`. Minimize to tray and Start minimized are independent
settings, both off by default; failed tray creation retains taskbar recovery.
Pin to top is removed from the main window. Independent overlays keep lock and
mouse passthrough. Embedded Local Map zoom is distinct from native Map zoom;
native Map uses a Z slider with a tolerance band and keeps unknown-Z NPCs visible.
Settings includes the exact GitHub project link and a manually opened visual
tour; `app/assets/whats-new` contains actual synthetic-data captures reused by
README. The header keeps a green Update Available action while an offer exists,
including after Later. The user requested GitHub verification/publication
without further local testing or changing their installed build.

The [wiki/map integration audit](INTEGRATION_AUDIT.md) records the 0.8.1 repairs,
the fresh export, source locations, and remaining data/visual gates. The
[map validation](MAP_VALIDATION.md) records rendered local-archive evidence
and the additional repairs. The [destination-only audit](ROUTE_REJECTION_AUDIT.md)
classifies every initial rejection and records verified ramp/stair/drop
repairs: 36 rendered requests, 20 valid paths, 16 markers, and exact endpoints.
This patch retains guarded established-first
routing; both engines are checked before drawing. The reviewed exporter/catalog
is deployed in production and the rebuilt initial-download snapshot is
`20261021T101150Z-dd346c8cc55d` (124 zones, 8,679 NPCs, 11,270 items,
117 raid variants and a complete public entity catalog).
The integration audit records deployment and checksum evidence.

Desktop zone indexing remains metadata-only and hydrates the selected archive on demand. The WLD exporter advances across skipped material groups so later textures stay assigned to their actual polygon ranges; bitmap aliases and repeating UV sampling remain in place. EQEmu's sequential WLD polygon/material assignment independently supports this repair. The local rendered pass now confirms Mistmoore and Commonlands textures; live game comparison remains separate.

The pinned Recast/Detour worker is a guarded integration candidate. The established line-map worker builds and collision-projects a route, then the independent established-route guard checks support, body clearance, and directed elevation before drawing. The wrapper crops decoded collision geometry around that safe route, or around the requested endpoints if it was rejected, and transfers buffers to Recast. Only a complete validated candidate replaces the ribbon. Failure retains a safe line or destination marker. Real game-client evidence is still required before Recast becomes first-choice routing.

The parser also treats the current character's Legends `/who` row as an authoritative zone signal. It strips the volatile instance number, retains the parenthesized short name for catalog/archive matching, ignores other players, and suppresses repeat-zone reloads. Keep the exact capture in `tests/test.mjs` when extending this grammar.

When multiple map families exist under the installation, `mapFamilyForZone` prefers the root `maps` directory so it matches the client's `default` map dropdown. The sync footer names the selected map set. Do not return to the prior byte-size heuristic; add an explicit user-facing selector before allowing a custom folder to win.

## Run and verify

Requirements are Node.js 22+ and a normal EverQuest Legends installation for real map validation.

```bash
npm ci
npm test
npm run test:catalog
npm start
```

`npm run test:catalog` needs a production bootstrap pack. Fetch and validate it first when it is absent:

```bash
node scripts/fetch-bootstrap-pack.mjs --required
npm run test:catalog
```

Do not commit proprietary S3D/EQG archives, player logs, exported diagnostics, or the generated bootstrap pack.

## Application updates, native overlays and timers

The 0.8.3 candidate adds application releases independently of wiki-data Sync.
`desktop/app-updater.cjs` owns release selection, bounded download/verification,
saved staging and explicit NSIS handoff. `desktop/preload.cjs` exposes a fixed
API only to the main local application frame; `app/app-update-ui.js` presents
status, Download, Later and Install update… in Settings and a compact badge.
Downloads on startup are opt-in; installation is never automatic. App ID,
profile paths and the game-read boundary stay intact.

[PNUT_UX_PLAN.md](PNUT_UX_PLAN.md) retains the pinned PNUT reference, implementation
map and acceptance gates. Four actual native windows (Parse, Map, Zone & loot,
Timers) share the existing main renderer's single log/parser/route
session. `app/overlay-session.js` owns timer persistence and bounded snapshots;
`desktop/overlay-host.cjs` owns window layout, restricted IPC, tray and shortcut
recovery. Lightweight renderers have no log, filesystem or updater API.

Layout lock preserves keyboard/menu interaction; mouse passthrough is separate.
The main window hides on close while recoverable panels remain; tray Quit exits
all windows. Explicit Open main reloads a crashed owner; parse history rebuilds
from the tail while saved timer deadlines survive. Timers include manual/repeat,
literal/regex log triggers, named captures and preview, cooldowns, display/cue
actions, user-duration kill reminders and an observed melee swing
estimate. Only fresh appended timestamps drive them. Read [TIMERS.md](TIMERS.md)
for precision/replay rules. Regex matching runs in a bounded isolated worker.
The native Map draws client line geometry and shares owner route/location state;
the single heavy 3D Map Explorer remains in the main app.
The native Parse UI directly translates PNUT's compact header, flat meter
rows and exact Overview/Damage/Healing/Taken/Session tabs. Taken uses own incoming
melee/spell/DoT events; rune grants remain capacity, not observed absorption.
The timer window is display-only radial rows plus a thin swing bar, fitted to
its contents. All timer configuration and actions live on the main Timers page.
The PNUT MIT notice ships under THIRD_PARTY/PNUT.

`app/wiki-discovery.js` requires a complete public entity catalog before claiming
absence. `app/wiki-discovery-ui.js` mounts the same Screenshot/Ignore notices
inside main Timers and native Timers, with a visible 15-second queue and hover/focus
pause. Only one surface owns the visible notices: native Timers while visible
and interactive, otherwise main Timers. `desktop/discovery-host.cjs` authenticates explicit screenshot requests,
offers source choices and copies to the local clipboard; it creates no popup and
uploads nothing. Ignore persists locally. Raid/catalog producer changes require
the reviewed wiki deployment and a fresh pack; a source push alone proves neither.

Preserve player-only parses and rune-capacity semantics; Revenge and
Elitist/Carebear remain excluded.

## Runtime architecture

The desktop process in [`desktop/main.cjs`](../desktop/main.cjs) owns the selected EverQuest root, safe loopback file bridge, log selection, cached dataset, and Electron window. [`app/app.js`](../app/app.js) consumes that bridge, parses appended log text with [`app/parser.js`](../app/parser.js), derives the session UI, and coordinates the embedded viewer.

[`app/coordinate-system.js`](../app/coordinate-system.js) is the authoritative boundary: log/wiki `(Y,X,Z)` → world `(X,Y,Z)`; client map `(-X,-Y,Z)` and world/WLD both meet in viewer `(-Y,Z,X)`. Visible coordinate text converts canonical world positions back to `/loc (Y,X,Z)` and must never expose internal axis labels. The embedded wrapper in [`app/zoneviewer/viewer.html`](../app/zoneviewer/viewer.html) applies those named adapters. The upstream-derived viewer implementation stays under [`app/zoneviewer/`](../app/zoneviewer/). Movement constraints live in [`app/navigation-policy.js`](../app/navigation-policy.js); pure turn/distance behavior lives in [`app/route-guidance.js`](../app/route-guidance.js).

Spatial candidate ownership is intentionally split at testable boundaries:

- [`app/collision-geometry.js`](../app/collision-geometry.js) flattens `zoneGroup` collision meshes after `matrixWorld`, preserves winding under mirrored transforms, skips props/pass-through/degenerate triangles, yields during large exports, and crops a bounded corridor around the established route.
- [`app/zone-load-guard.js`](../app/zone-load-guard.js) serializes archive loads across toolbar and shell; [`app/viewer-zone-selection.js`](../app/viewer-zone-selection.js) resolves exact IDs and aliases. [`app/zone-identity.js`](../app/zone-identity.js) shares identity checks with the app shell.
- [`app/established-route-guard.js`](../app/established-route-guard.js) validates the established path before its first draw and abandons stale zone/request work. [`app/viewport-framing.js`](../app/viewport-framing.js) defers fitting hidden viewports.
- [`app/drop-certification.js`](../app/drop-certification.js) proves a bounded exposed descent before a single directed-link retry. It cannot replace a successful ordinary detour or authorize a reverse ascent.
- [`app/recast-route-client.js`](../app/recast-route-client.js) transfers ephemeral crop buffers, enforces latest-request-wins, terminates stale/failed/timed-out workers, and resolves every failure as fallback rather than throwing away the current route.
- [`app/recast-route-engine.js`](../app/recast-route-engine.js) generates and queries the navmesh in the dedicated bundled worker, rejects partial goals, and uses the shared +6 climb policy.
- [`app/route-validation.js`](../app/route-validation.js) builds a worker-local X/Z triangle index, projects the sparse result back onto supplied triangles, and independently fails closed on unsupported segments, undeclared drops, and excessive upward climbs. Large triangles that span many cells stay in a broad-triangle bucket; retain that fallback when tuning the index.
- [`app/diagnostics.js`](../app/diagnostics.js) exposes only allow-listed aggregate collision/candidate status, counts, timings, and reasons under diagnostics schema v2. Location readiness is boolean. Do not add character/target identity, player or route coordinates, path points, raw worker error detail, or local paths.

```mermaid
flowchart TD
    A["Selected EQ folder"] --> B["Desktop file bridge"]
    B --> C["Log parser and session state"]
    B --> D["Local zone and map files"]
    E["Cached EQLWiki pack"] --> C
    C --> F["App shell and loot context"]
    C --> G["Viewer coordinate adapter"]
    D --> G
    G --> H["Rare markers and golden path"]
```

The app is read-only with respect to EverQuest. It may consume `/loc` lines produced by user-created game bindings; it must never emit input, issue game commands, inspect memory, inject code, or automate route following.

## Data sources and external references

- Production data is built by [`server/BuildEyeOfZommPack.php`](../server/BuildEyeOfZommPack.php) and mirrored on the repository's `dataset` branch. The client never crawls EQLWiki pages.
- No EQLWiki archive ZIP or EQEmu source checkout is required or stored in this repository.
- The spatial design cites EQEmu's public [Detour pathfinder](https://github.com/EQEmu/EQEmu/blob/master/zone/pathfinder_nav_mesh.cpp) and [map raycasts](https://github.com/EQEmu/EQEmu/blob/master/zone/map.cpp) only as conceptual references. Eye of Zomm keeps its own read-only viewer boundary.
- EQEmu's deprecated but directly relevant [azone2 WLD exporter](https://github.com/EQEmu/EQEmu/blob/master/utils/deprecated/azone2/wld.cpp) assigns each material group's `polycount` to the next sequential polygons. That is corroborating evidence for the skipped-material cursor repair, not a replacement for proprietary client rendering tests.

## Exact next work

For native overlays, use the source map in [PNUT_UX_PLAN.md](PNUT_UX_PLAN.md) and
repeat `npm run test:native-overlays` against the current runtime. Complete
physical game-window passthrough, OS scaling/monitor removal, sleep and live log
acceptance in [WINDOWS_MANUAL_TEST.md](WINDOWS_MANUAL_TEST.md). The synthetic
native smoke does not establish those physical interactions. Complete controlled
Windows updater/installer acceptance before claiming an installed upgrade;
automated smokes never execute the installer.

Use [MAP_VALIDATION.md](MAP_VALIDATION.md) for completed 0.8.1 rendered checks,
aggregate results, and private local rerun context. Continue section 16.3 of
the vision with the remaining live-client gates; use a build from this PR,
not the older 0.8.0 installer.

1. **Compare with the live client.** Local rendered texture checks pass for Mistmoore/Commonlands/Befallen. Compare First/Top textures, HUD, marker, heading, and stacked-floor placement during real game movement. Use the corrected Befallen anchor in the current checklist. Never commit archives, logs, installation paths, or character-linked coordinates.
2. **Extend known-walkable coverage.** Revisit the destination-only ramp/drop probes, then exercise narrow corridors, stairs, doors, and directed drops with independently known legal routes. Both established and candidate paths must validate; a candidate may replace guidance only with `viewer.spatial.candidate.status` equal to `ready`.
3. **Repeat continuity with live updates.** Synthetic-log and rendered cancellation/replacement/zoning checks complement the async regressions. During real updates, move, zoom, switch First/Top/Map, change the Z slice, open loot, choose a second target, cancel, and change zones. Preserve camera/presentation/target choices and keep failed routes as safe guidance or honest markers.
4. **Capture redacted evidence.** At 100%, 125%, and 150% Windows scaling, record `viewer.spatial.collision` triangle counts/export time and candidate crop/generation/query/total time, status, violation count, and fallback reason. Manually inspect the JSON before attaching it. It must not contain an NPC target, route points, raw worker error detail, logs, or filesystem paths.
5. **Classify every failure before tuning.** Use one of: texture mapping, no collision export, oversized/empty crop, generation failure, unreachable goal, validation rejection, stale cancellation, responsiveness, or visual route defect. Add the nearest redistributable fixture/contract when possible; do not weaken validation, raise triangle caps, or broaden diagnostic data without evidence.
6. **Make the promotion decision.** If every real-zone case and responsiveness check passes, change orchestration so cached Recast geometry is queried first with the established worker-line route as automatic fallback. If any case fails, keep the current established-first/candidate-second behavior and record the exact category, zone type, aggregate diagnostics, and next code seam here.

Do not start durable history or upgrade scoring from 0.9 until this matrix passes. Both 8/8 synthetic corpora, typed export-to-Recast integration, cancellation, redaction, and package contracts pass. The expanded rendered matrix found 20 valid paths/16 markers across 36 requests. Original outcomes remain 14/14; supplemental probes prove real ramp-candidate and marker-to-drop repairs. Complex stair side panels and alternate itineraries remain uncertified. Live movement, dynamic doors, OS-wide scaling, and installer acceptance remain. Preserve the guard while extending coverage.

## Release path

- Every change must keep `npm test` green. Catalog-affecting changes must also pass `npm run test:catalog` against the verified production pack. Fetch the pack before packaging: `node scripts/fetch-bootstrap-pack.mjs --required`; `npm run test:artifact` requires a production-scale schema-v3 bootstrap with bytes identical to that fetched source, and logs its versions and record counts.
- Pushes to `main` run CI and the Windows build workflow. After all gates, the first successful build for each new `0.x` package version creates a versioned GitHub prerelease; later commits with that same version preserve its tag and only upload the temporary Actions artifact. A matching `vX.Y.Z` tag runs the explicit release workflow, which also classifies `0.x` and semantic prerelease versions as prereleases. Both Windows workflows inspect the built ASAR with `npm run test:artifact`; never publish an installer that has not passed that package/source/version check.
- Keep `package.json`, `package-lock.json`, CHANGELOG, validation notes, and installer filename expectations on the same version.
- Trusted Authenticode signing is required for 1.0. Until certificates are configured, workflows may produce a clearly identified unsigned 0.x installer.
- Before promoting a build, complete [`WINDOWS_MANUAL_TEST.md`](WINDOWS_MANUAL_TEST.md). Repository tests cannot validate proprietary zone textures, stacked-floor placement, label alignment, or subjective route quality.

When handing off again, update the baseline and **Exact next work** here, the matching status row in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), and the implementation note in vision section 16.
