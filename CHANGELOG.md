# Changelog

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
- Kept the embedded Zone Viewer navigation-focused and removed additional nonessential viewer controls from the companion UI.
- Expanded exported NPC metadata with race, class, and description where present.
- Retained local wiki search and explicit Open on Wiki behavior.
- Added persistent **Pin to top** and a compact map + named-drop minimal view.
- Added local item hover tooltips, observed loot history, and logged drop-rate estimates.
- Added configurable combat encounters named for the first attacked NPC and their start time.
- Repaired embedded Zone Viewer startup and current-zone/location synchronization.
- Simplified the header search to a reliable, wiki-only **Search EQLWiki** field.
- Added con-color tinting to NPC cards and current-zone NPC rows.
- Screen reading remains intentionally unimplemented.
