# Changelog

## 0.8.0 - Guarded real-zone spatial candidate

- Exported the viewer's already-decoded collision meshes as finite `Float32Array`/`Uint32Array` data in its existing right-handed Y-up basis, skipping props and pass-through geometry without introducing another EQ coordinate transform.
- Added cooperative, cancellable zone export plus a bounded route-corridor crop so zone rendering and the established worker-first route remain available while the Recast/Detour candidate prepares.
- Wired the pinned Recast worker into named-mob routing. It receives transferable route-local geometry, rejects partial or unvalidated results, and atomically replaces only the rendered golden ribbon while preserving destination, view mode, camera, Z slice, cue HUD, and automatic fallback.
- Made zone, destination, and request changes terminate stale candidate workers. Timeouts, engine faults, missing geometry, oversized crops, and validation failures leave the existing route or destination marker intact.
- Matched Recast and the independent post-query guard to the shared +6 upward-climb rule, generated only downward off-mesh drop links, and indexed corridor triangles in worker-local X/Z cells so dense validation does not scan the full crop for every sample.
- Added diagnostics schema v2 with allow-listed collision counts, timings, engine outcome, validation count, and fallback reason; character/target identity, player and route coordinates, worker error detail, and filesystem paths are excluded while location readiness remains boolean.
- Added viewer-export/crop/winding/cancellation/drop tests, an export-to-Recast integration test, latest-request worker replacement tests, and Windows ASAR checks for the collision module, client, integration markers, and bundled worker.
- Carried forward the 0.7.9 intel-first Minimal defaults and WLD skipped-material cursor repair. EQEmu's WLD polygon/material loop independently confirms that material groups consume polygon ranges sequentially; proprietary Mistmoore/outdoor visual confirmation remains a release gate.

## 0.7.9 - Intel-first minimal view and WLD material repair

- Made Minimal view default to the named-and-rare-mob intel panel, with the 3D map hidden unless explicitly enabled in Settings.
- Added independent **Show map** and **Show path controls** preferences. Waypoint copying, consider detection, and loot remain available when both are off.
- Removed the minimal-header destination search; routing, when enabled, starts from the mob list rather than duplicating a search surface.
- Changed **My Class** loot in both Minimal view and the consider tray to exclude statless and weight-only items.
- Replaced eager desktop archive reads with metadata indexing and current-zone hydration, and corrected the false permission status.
- Fixed WLD material-group cursor drift so skipped groups consume their polygon counts instead of shifting every later texture onto the wrong faces.
- Added release checks for lazy reads, material-group alignment, minimal defaults, and class-loot eligibility.

## 0.7.8 - Compact fly-first map controls

- Collapsed the embedded map viewer to one control bar: zone load, Succor reset, a compact pop-out Z-depth slicer, and view controls now share the same row; the Grounded and Floors controls are no longer exposed.
- Made First Person initialize in Fly mode and removed the center-screen click-to-enter prompt. Clicking the map still captures mouselook without covering the scene.
- Changed Reset to target an explicit `Succor`/`Safe Point` map label, with the conventional zone origin as fallback, while preserving First, Top, or Map presentation.
- Moved route graph generation to the existing Web Worker before any collision projection. The renderer no longer performs the old 24k/50k/full collision-graph passes, while projected candidate segments still enforce the six-Z upward bound.
- Made Cancel Path clear the destination owner state as well as the in-flight calculation, preventing movement-driven automatic rerouting from restarting a cancelled route.
- Expanded S3D texture aliases, forced repeating WLD texture sampling instead of clamp-to-edge stretching, and invalidated v16 parsed-zone caches.
- Added a focused regression gate covering fly-only UI, one-row chrome, Succor reset, worker-first routing, persistent cancellation, and texture sampling.

## 0.7.7 - Verifiable map-coordinate release

- Added the reported side-by-side Mistmoore capture as an exact regression: game Map `X -222.75, Y 125.50, Z -154.10`, canonical world, client `.txt` map, and viewer placement must all converge without an axis swap.
- Changed the viewer HUD and sync footer to use the in-game Map window's explicit `X / Y / Z` labels instead of exposing canonical world-axis names or relying on an unlabeled `/loc` tuple.
- Added the running app version to the always-visible desktop title bar and browser/taskbar title so a surviving or duplicate older installation is immediately identifiable.
- Added a post-build ASAR integrity gate to both Windows workflows. The uploaded installer must contain the current package version, title-bar version binding, coordinate formatter, viewer transform, and Map HUD before it can be published.
- Added Legends `/who` zone detection from the current character's row, including instance-number removal and stable short-name matching, so the map can recover without waiting for a separate zoning line.
- Added automatic versioned GitHub prereleases for the first verified `main` build of each `0.x` version; repeat builds preserve the existing tag, and explicit `0.x` tags are also marked prerelease.

## 0.7.6 - Player-facing coordinate clarity

- Corrected the player anchor itself: client `.txt` maps negate canonical world X/Y but do not swap them. Restored the viewer's matching map basis so Mistmoore game `/loc -330, 120, -178.13` lands at the real local-map Succor anchor `-120, 330, -180` instead of the rotated `330, -120` point.
- Made every visible viewer coordinate use EverQuest's exact `/loc Y, X, Z` order; canonical world and client-map axes remain internal implementation details.
- Removed the Map-only reverse conversion that made the same synced position appear numerically different when changing First, Top, and Map presentations.
- Added real Mistmoore and Befallen Succor map anchors as end-to-end transform regressions alongside the stacked-floor fixture.
- Made the root `maps` family win over silently selected larger custom map packs, matching the in-game `default` dropdown unless the player deliberately chooses another set in a future preference; sync status now names the map set in use.
- Updated the Windows acceptance script to compare the app's displayed `/loc` directly with game chat in multiple zones.

## 0.7.5 - Coordinate truth and compact navigation

- Separated logged/wiki, canonical world, client `.txt` map, and Three.js viewer coordinates instead of sending all four through one ambiguous transform. This release still swapped the two client-map axes; 0.7.6 corrects that remaining defect with real zone anchors.
- Normalized EQLWiki NPC locations into world X/Y before distance, labels, and routing, while converting back to EverQuest Y/X/Z when copying a game command.
- Restored paste-ready `/waypoint` copying from NPC names in the minimal rail and NPC browser, with keyboard access, non-modal confirmation, a guarded Electron clipboard bridge, and fallback behavior.
- Moved minimal-mode destination search, Path, and Clear into the persistent 48-pixel header and removed the redundant route band so the map receives the recovered vertical space.
- Kept Map Overlay intentionally readable as client `.txt` line art, while adding safe available/material/resolved texture counts to diagnostics for First/Top S3D troubleshooting.
- Added coordinate-boundary, waypoint-order, compact-header, clipboard-bridge, texture-instrumentation, and packaged-viewer regression gates.

## 0.7.4 - Presentation-safe route selection

- Stopped wiki-coordinate route starts from forcing First Person or closing Map Overlay.
- Wrapped local map-label route starts so their legacy internal setup cannot commandeer the player's Top Down or Map Overlay choice while background routing runs.
- Restored the original route-progress message after presentation restoration and added a release regression that forbids the known forced-First-Person path.

## 0.7.3 - Isolated navmesh worker proof

- Added a pinned, deterministic 747 KiB `recast-navigation` 0.43.1 module-worker bundle with transferable geometry buffers and build/package checks.
- Ran both the reference topology router and candidate Recast/Detour engine against the same eight redistributable fixtures; all expected path/no-path outcomes pass.
- Rejected Detour partial paths, projected sparse funnel results back onto collision surfaces, and added independent post-query guards for walkable support and downward-only drop links.
- Added a latest-request-wins worker client with calm Finding/Updating/fallback states, stale-result suppression, timeouts, worker restart, and an explicit contract that callers retain the last valid route.
- Retained the current viewer pathfinder as production authority; the candidate worker is bundled but dormant until real zone geometry and Windows/game-client gates pass.
- Added exact MIT/Zlib notices, pinned lockfile integrity, dependency-tree validation, and high-severity audit gates to CI and Windows release workflows.

## 0.7.2 - Geometry-backed spatial contract

- Extended every asset-free route fixture into shared typed triangle geometry with one right-handed Y-up coordinate contract, upward winding, start/goal anchors, and agent constraints.
- Represented exposed drops as downward-only off-mesh connections, kept closed doors physically disconnected, and retained the +6 ascent contract for candidate engines.
- Selected pinned `recast-navigation` 0.43.1 for an isolated worker prototype after documenting licensing, package footprint, packaging, supply-chain, fallback, and API risks; the production pathfinder is unchanged.
- Defined calm route-engine UX states: keep the last valid path visible, never block map input or change views, swap validated routes atomically, hide implementation jargon, and preserve explicit recovery.
- Quantized player-facing distance labels while keeping exact internal values, reducing distracting single-unit churn during movement-bound `/loc` streams.

## 0.7.1 - Live route confidence and handoff

- Added live remaining distance plus turn, facing, off-route, and arrival cues derived from the collision-valid golden path in First Person, Top Down, and Map Overlay.
- Kept the full and minimal route status synchronized with new `/loc` samples so a moving player sees the next action without reopening route controls.
- Added a Settings export for redacted support diagnostics using an explicit allow-list that excludes character names, log contents, log filenames, and filesystem paths.
- Added a deterministic, asset-free route corpus with eight outdoor, indoor, stacked-floor, ramp, closed-door, exposed-drop, and illegal-ascent expectations plus pass-rate and segment-policy reporting.
- Added a repository-native contributor handoff and implementation-status index, cross-linked from the README and vision with the exact next road-to-v1 task.
- Marked shared geometry-backed corpus adapters as the next 0.8 evidence gate before adopting a reviewed worker-based Recast/Detour pathfinder.

## 0.7.0 - Replacement-map navigation loop

- Added dataset-backed named and rare-mob labels directly to First Person, Top Down, and Map Overlay views, prioritized by known current-class loot and routable with one click.
- Rebuilt the minimal-mode mob rail around useful current-zone targets, relevant-first ordering, mob/loot search, route state, distance, and expandable Itembox-enabled loot instead of a long undifferentiated list.
- Added stable heading interpolation across recent `/loc` samples, retaining facing through duplicate/jitter lines and refusing to invent a heading after a zone-scale position jump.
- Made location sync preserve the selected map presentation internally instead of switching through First Person on every update.
- Increased live log responsiveness while a map or route is active and coalesced bursts to the newest `/loc`, preventing movement-key bindings from creating a renderer backlog.
- Kept persistent routes updating during continuous movement without an endlessly-reset debounce, while retaining collision validation and the eight-unit re-route threshold.
- Documented `/loc` movement-key setup in the compact navigation surface and expanded the v1 roadmap around a replacement-map product contract.

## 0.6.0 - Usable exploration loop

- Replaced ambiguous map Sync failures with a visible Folder → Log → Zone → `/loc` readiness sequence and state-specific recovery actions.
- Added one persistent current-zone destination field with named suggestions, explicit route/marker/error status, shortest routed distance, Clear, and automatic re-routing after meaningful `/loc` movement.
- Kept First Person, Top Down, and Map Overlay controls available across full/minimal transitions, remembered the last full view, and preserved explicit same-zone floor filters during re-centering and route updates.
- Added a remembered minimal-mode intel collapse control while retaining current-fight DPS, named mobs, class drops, route controls, pinning, and Full view.
- Expanded current-zone/class item discovery with embedded icons, slot and sort overrides, one-click Reset, useful-gear-first ranking, and honest scope/empty states.
- Made Itembox details keyboard reachable and made tier-adjusted values update immediately, visibly highlight changes, and retain base values for comparison.
- Repaired S3D WLD material resolution by using bitmap fragments' actual `fileName`, normalizing BMP/DDS names, supporting animated frame filenames, and invalidating stale v15 parsed-zone caches.
- Replaced routine focus-stealing browser alerts with dismissible in-app notices, and added Ctrl/Cmd+K plus `/` shortcuts for the reliable wiki-only Search EQLWiki field.
- Improved NPC relevance ordering while retaining modern con text and tile tinting, and kept all existing consider tray, encounter, loot evidence, pin/taskbar, coordinate, and directed movement contracts.
- Expanded the product vision into a release-gated road to v1 with journey contracts, user stories, click budgets, risk ownership, uncoached usability tasks, and a Windows/game-client acceptance script.

## 0.5.4 - Release pipeline reliability

- Separated clean-checkout tests from the production catalog relevance gate so CI no longer expects the intentionally git-ignored bootstrap pack before it has been downloaded.
- Added a verified production-data fetch followed by the relevance gate to CI, Windows installer, and tagged-release workflows.

## 0.5.3 - Live map and movement routing

- Removed the erroneous planar sign inversion from logged `/loc` coordinates while retaining EverQuest's Y/X-to-X/Y ordering, so negative in-game map positions remain negative in the viewer.
- Stopped trusted `/loc` and NPC-label elevations from snapping to an upper floor in stacked dungeons; grounding now honors the reported Z with only the six-unit movement tolerance.
- Added the Legends rare-creature consider wording (`- a rare creature - scowls at you`) to the parser so a fresh consider opens the bottom-docked loot tray with the clean NPC name.
- Reworked geometry-derived routing as a directed movement graph: upward travel is capped at exactly 6 Z, downward travel is unlimited, and a drop cannot be reversed as an invalid climb.
- Prevented routes from falling through overlapping floors, tightened indoor-zone sampling for narrow corridors and stairs, and retained wall/collision validation for every route edge.
- Matched first-person step and jump configuration to the same six-unit routing constraint and invalidated old parsed-zone cache data.
- Kept First Person, Top Down, and Map Overlay controls available in minimal mode, persisted the chosen mode, and recentered that mode instead of forcing First Person after every `/loc` update.
- Added explicit game-folder/map-file readiness states and automatic viewer reconnection so Sync distinguishes a missing folder from a configured folder that is only waiting for `/loc`.
- Changed the Items default from an alphabetical global catalog to current-zone, current-class results ranked toward equipment and meaningful stats; deliberate search broadens the scope.
- Made detected classes visible through an Auto filter state and added a clear Current zone scope control.
- Made the Item Level Slider update already-open Itembox tooltips and display a clearly labeled tier-adjusted stat block alongside wiki base lines.
- Kept repeated `/loc` events out of Overview activity and renamed manual map recovery actions around their actual result: reload the zone or center on the last `/loc`.
- Added a comprehensive product and UX vision with click budgets, end-to-end flows, user stories, recovery language, acceptance scenarios, and a phased roadmap.

## 0.5.2 - Consider loot tray

- Restored consider-driven loot intelligence as a temporary bottom-docked tray without bringing back the unreliable permanent Current Target card.
- Added class filtering, item icons and Itembox hovers, wiki links, and direct pathing for the considered NPC.
- Kept the tray open while hovered or keyboard-focused, then resumed its dismissal timer after inspection.
- Normalized apostrophe and backtick variants when matching considered NPC names to EQLWiki drop sources.

## 0.5.1 - Map alignment and navigation

- Normalized logged `/loc` output into the coordinate basis used by EverQuest map files and EQLWiki locations, fixing the swapped and inverted player marker in Befallen and other zones.
- Made the first-person minimap player-centered and heading-up from consecutive `/loc` samples, with nearby named mobs and the active route labeled directly on the map.
- Switched route calculation to a height-aware walkable-surface graph derived from the rendered zone collision mesh, preserving floors, ramps, walls, jump limits, and drops while reporting shortest-route distance.
- Repaired S3D material-to-bitmap resolution so original zone textures load instead of placeholder gray/white materials.
- Bumped the parsed-zone cache version so existing installations rebuild previously cached zones with corrected texture data.

## 0.5.0 - Release UX and map overhaul

- Added first-run EverQuest folder setup and automatic selection of the most recently modified `eqlog_*.txt` under `Logs`, with folder and log overrides in Settings.
- Removed the unreliable current-target surface, last-location metric, and remaining player-card redundancy; the header now shows character, classes, level, and zone.
- Added explicit First Person 3D, Top Down 3D, and Map Overlay modes, with all floors shown by default.
- Corrected the EQ-to-viewer coordinate flow and made consecutive `/location` updates face the player's movement trajectory.
- Kept route-to-NPC support map-label-first with schema-v3 EQLWiki coordinates as the fallback.
- Changed pinned mode to hide the draggable title bar while keeping Eye of Zomm visible in the Windows taskbar.
- Added the modern light-blue consider band and verified yellow at +1 through +3 and red at +4 or higher.
- Reduced helper copy and removed every retired product-name reference from the app and repository.
- Upgraded the exported dataset to schema v3 so two-coordinate locations and pages with multiple location tuples are handled safely.
- Added loopback request/file bounds, state-changing POST guards, first-run/log-selection tests, exporter fixtures, UI checks, and release checks.
- Added optional trusted Authenticode signing and verification while allowing clearly identified unsigned builds until a certificate is configured.

## 0.4.0 - Map and target focus

- Corrected consider colors so +1 through +3 are yellow and +4 or higher is red.
- Made Current Target a permanent, prominent Overview panel with class-filtered loot.
- Expanded minimal mode with current-fight DPS, a pathable mob list, and a temporary hoverable target-loot panel.
- Persisted the user-approved EverQuest folder handle and inferred the installation root from the selected log path.
- Added automatic first-person location focus and NPC route fallback to exported EQLWiki coordinates.
- Changed pinned mode to hide the application from the Windows taskbar.
- Restyled item hovers after EQLWiki's Itembox and extended the cPanel exporter with Itembox lines and embedded icons.
- Removed redundant helper copy and the duplicate Player card.
- Added optional Authenticode signing and signature verification to Windows build/release workflows.

## 0.3.0 - EQLWiki - Eye of Zomm

- Rebranded the project as **EQLWiki - Eye of Zomm**.
- Changed the Windows application identity, installer name, shortcuts, and custom protocol to `eqleoz://`.
- Moved player-facing dataset checks away from EQLWiki and onto the GitHub `dataset` branch.
- Dataset synchronization now checks GitHub on every application startup and on **Sync with Wiki** button press.
- Added low-priority MediaWiki server exporter + one-commit GitHub dataset branch publishing workflow.
- Added repository-scoped deploy-key support for weekly/manual cPanel synchronization without a personal token.
- Kept the embedded Zone Viewer navigation-focused and removed additional nonessential viewer controls from the app UI.
- Expanded exported NPC metadata with race, class, and description where present.
- Retained local wiki search and explicit Open on Wiki behavior.
- Added persistent **Pin to top** and a compact map + named-drop minimal view.
- Added local item hover tooltips, observed loot history, and logged drop-rate estimates.
- Added configurable combat encounters named for the first attacked NPC and their start time.
- Repaired embedded Zone Viewer startup and current-zone/location synchronization.
- Simplified the header search to a reliable, wiki-only **Search EQLWiki** field.
- Added con-color tinting to NPC cards and current-zone NPC rows.
- Screen reading remains intentionally unimplemented.
