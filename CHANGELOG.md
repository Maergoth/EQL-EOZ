# Changelog

## 0.7.1 - Live route confidence and handoff

- Added live remaining distance plus turn, facing, off-route, and arrival cues derived from the collision-valid golden path in First Person, Top Down, and Map Overlay.
- Kept the full and minimal route status synchronized with new `/loc` samples so a moving player sees the next action without reopening route controls.
- Added a Settings export for redacted support diagnostics using an explicit allow-list that excludes character names, log contents, log filenames, and filesystem paths.
- Added a repository-native contributor handoff and implementation-status index, cross-linked from the README and vision with the exact next road-to-v1 task.
- Marked the route corpus as the next 0.8 evidence gate before adopting a reviewed worker-based Recast/Detour pathfinder.

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
