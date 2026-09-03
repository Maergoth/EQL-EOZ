# Changelog

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
