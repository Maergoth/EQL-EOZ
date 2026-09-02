# EQLWiki - Eye of Zomm

**Eye of Zomm** is an open-source, local-first desktop companion for **EverQuest Legends** and **EQLWiki**.

It watches ordinary EverQuest text logs, presents zone/NPC/item information from a locally cached EQLWiki dataset, and embeds a simplified version of the EQL Zone Viewer for navigation. It never hooks the game client or modifies game files.

## Core boundary

Eye of Zomm may read user-selected EverQuest logs and local map/archive files. It does **not** inspect process memory, inject code, patch game files, automate input, or issue game commands.

## Dataset architecture

The desktop application does not crawl EQLWiki.

```text
EQLWiki MediaWiki DB/content
        |
        | weekly/manual low-priority export
        v
Eye of Zomm JSON dataset
        |
        | gzip + manifest
        v
GitHub repository: Maergoth/EQL-EOZ, branch `dataset`
        |
        | manifest check on startup / Sync with Wiki
        v
Local cached dataset on each player's PC
```

Every Eye of Zomm startup checks the tiny GitHub dataset manifest. The **Sync with Wiki** button performs the same check on demand. If the manifest version is unchanged, nothing else is downloaded. When it changes, the app downloads the compressed data file from GitHub, verifies SHA-256, validates the schema, and atomically replaces its local cache.

Players therefore do **not** hit EQLWiki to check for dataset updates.

## Current structured data

The server exporter is designed to include:

- zone names, aliases, Zone Viewer names and wiki titles;
- NPC names, zones, level ranges/averages, race, class, era, wiki title, revision ID, description, and coordinates where present;
- item names, classes, slots, Item Level Slider-relevant stats, era, notes, wiki title, revision ID, and drop/source records.

NPC loot lists are derived locally from item drop/source records.

## Wiki search / Open in browser

Eye of Zomm searches its local structured dataset first. Known zones, NPCs and items can open their exact EQLWiki article. Queries that do not fit neatly into the companion open EQLWiki `Special:Search` in the user's normal browser.

## Lightweight Zone Viewer

The embedded Zone Viewer is intentionally navigation-focused. Eye of Zomm keeps current-zone loading, top-down/first-person navigation, grounded/reset controls, floor selection, logged `/location` sync, minimap/navigation and path-to-NPC integration. Advanced display tuning, performance diagnostics, world-atlas controls, cut-plane controls, duplicate path-search UI, help and fullscreen controls are not exposed in the companion surface.

## Windows application

The production application is branded **EQLWiki - Eye of Zomm**. The Windows installer is built with Electron Builder/NSIS and uses the `eqleoz://` application protocol.

Expected installer name:

```text
EQLWiki-Eye-of-Zomm-Setup-<version>-x64.exe
```

## Data publishing

The intended wiki-side schedule is one low-priority export each week, plus manual refreshes after important wiki updates. The generated dataset is mirrored to a dedicated one-commit `dataset` branch so weekly compressed snapshots do not bloat source history.

See the `server/` tooling in the source package for the MediaWiki exporter and cPanel/GitHub synchronization workflow.

## Open source

Eye of Zomm is released under the MIT License. Third-party Zone Viewer notices are retained with the source.
