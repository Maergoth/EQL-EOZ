# EQLWiki - Eye of Zomm

**Eye of Zomm** is an open-source, local-first desktop companion for **EverQuest Legends** and **EQLWiki**.

It watches ordinary EverQuest text logs, presents zone/NPC/item information from a locally cached EQLWiki dataset, and embeds a simplified version of the EQL Zone Viewer for navigation. It never hooks the game client or modifies game files.

## Core boundary

Eye of Zomm may:

- read user-selected EverQuest log files;
- follow normal rotated `eqlog_*.txt` logs;
- read user-selected local zone/map files for the Zone Viewer;
- download the static EQLWiki dataset mirror from this GitHub repository;
- open EQLWiki pages/searches in the user's normal browser.

Eye of Zomm does **not** inspect process memory, inject code, load into the game process, patch game files, automate keyboard/mouse input, or issue game commands. See [SAFETY.md](SAFETY.md).

## What it does

- Detects the active character from the log filename.
- Detects zones from normal log output.
- Detects level/classes when `/who` output appears and follows later level-up messages.
- Parses considers, targets, outgoing damage, DoTs, heals, runes, kills, and recent activity.
- Shows current-zone NPCs and EQ-style con colors relative to the player's level.
- Filters items locally by class and era.
- Applies EQLWiki Item Level Slider scaling locally.
- Shows item sources and known NPC drops without requesting item/NPC pages from the wiki.
- Embeds a deliberately simplified EQL Zone Viewer.
- Can synchronize the viewer with logged `/location` output when a supported line is present.
- Searches the local structured dataset first and offers **Open on Wiki** / EQLWiki search for anything better handled in the browser.

## Data architecture

The desktop application does **not** crawl EQLWiki.

The data path is:

```text
EQLWiki MediaWiki DB/content
        |
        | one low-priority server-side export
        v
Eye of Zomm JSON dataset
        |
        | gzip + manifest
        v
GitHub repository: Maergoth/EQL-EOZ, branch `dataset`
        |
        | tiny manifest check on app startup / Sync with Wiki
        v
Local cached dataset on each player's PC
```

### Initial dataset

The production dataset is created on the EQLWiki server by `server/BuildEyeOfZommPack.php`. It uses MediaWiki's local database/content services directly; it does not perform HTTP requests back into the wiki.

The generated pack currently contains:

- the Zone Viewer zone/alias catalog;
- NPC names, zones, level ranges/averages, race, class, era, wiki title, revision ID, description, and coordinates when available;
- item names, classes, slots, Item Level Slider-relevant stats, era, notes, wiki title, revision ID, and drop/source records.

The app derives NPC loot indexes locally from the item drop/source records.

### Weekly updates

The recommended production schedule is one low-priority rebuild per week during an off-peak hour. The same script can be run manually after important wiki changes.

The server refresh process:

1. builds the dataset locally with `nice`/`ionice` and a cooperative per-page pause;
2. validates the JSON before replacing the previous output;
3. creates `manifest.json` and `eqlwiki-eye-of-zomm-data.json.gz`;
4. pushes only those two files to the repository's dedicated `dataset` branch.

The dataset branch is intentionally force-replaced with a single commit on each update. This avoids accumulating a large weekly compressed-data history in the source repository.

### Client synchronization

Every Eye of Zomm startup checks:

```text
https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json
```

The **Sync with Wiki** button performs the same check on demand.

If the manifest version matches the cached version, nothing else is downloaded. If it changes, Eye of Zomm downloads the compressed data file from GitHub, verifies its SHA-256, validates the schema, and atomically replaces the local cached copy.

**Players do not hit EQLWiki to check for dataset updates.**

## Wiki search / Open in browser

The global search box searches the local zone/NPC/item dataset first.

- Known zones, NPCs, and items can open their exact EQLWiki page.
- Item/NPC cards expose direct Wiki links.
- The current zone exposes an **Open zone wiki** action.
- Queries that are not represented neatly in the structured dataset open EQLWiki `Special:Search` in the normal browser.

This keeps Eye of Zomm useful without trying to recreate every wiki article inside the desktop application.

## Lightweight Zone Viewer

Eye of Zomm reuses the existing EQL Zone Viewer parsing/rendering code, but exposes a smaller navigation-focused UI.

The companion keeps:

- select EverQuest folder;
- current-zone load/sync;
- top-down / first-person navigation;
- grounded movement/reset;
- floor selection;
- logged `/location` synchronization;
- path-to-NPC integration;
- local map/minimap functionality needed for navigation.

Advanced display tuning, performance diagnostics, world-atlas controls, duplicate path-search controls, cut-plane controls, help, and fullscreen UI are not exposed in Eye of Zomm.

## Windows installation

Official builds are normal per-user x64 Windows installers produced by GitHub Actions with Electron Builder/NSIS:

```text
EQLWiki-Eye-of-Zomm-Setup-<version>-x64.exe
```

The installer creates Start Menu/Desktop shortcuts and registers the `eqleoz://` protocol so EQLWiki can launch/focus the installed companion.

Until the project has a code-signing certificate, Windows SmartScreen may warn about an unsigned installer. Source and automated build workflows remain public for inspection/reproducibility.

## Development

Requirements:

- Node.js 22+
- Windows, macOS or Linux for normal development
- Windows or GitHub Actions for the production NSIS installer

```bash
npm install
npm test
npm start
```

Build Windows installer:

```bash
npm run dist:win
```

Fetch the current GitHub-mirrored production dataset into the installer:

```bash
node scripts/fetch-bootstrap-pack.mjs --required
```

## Repository layout

```text
app/                 UI, log parser, local data/filtering, Zone Viewer wrapper
desktop/             Electron runtime and local loopback bridge
server/              MediaWiki exporter + GitHub dataset synchronization
scripts/             Build/bootstrap tooling
tests/               Parser/scaling tests
wiki/                Optional EQLWiki launcher integration
THIRD_PARTY/         Zone Viewer notices/license
.github/workflows/   CI and Windows installer/release builds
```

## Open source

Eye of Zomm is released under the [MIT License](LICENSE). Third-party notices for the Zone Viewer are retained under `THIRD_PARTY/`.
