# EQLWiki - Eye of Zomm — production architecture

## Product objective

Provide a polished EverQuest Legends desktop app that understands the player's ordinary log stream, current zone, level/classes, locally observed NPCs/combat, EQLWiki NPC/item knowledge, and the existing EQL Zone Viewer without becoming a new source of wiki CPU/API load.

## Runtime architecture

```text
EverQuest text log ─read only─┐
                              │
Selected EQ map/archive files ├──> Eye of Zomm desktop app
                              │       │
Cached EQLWiki dataset ───────┘       ├─ local search/filter/scaling
                                      ├─ local log parsing
                                      └─ local Zone Viewer

EQLWiki MediaWiki content
        │
        │ weekly/manual, low priority
        v
BuildEyeOfZommPack.php
        │
        v
validated gzip + manifest
        │
        │ one server-side push
        v
GitHub `dataset` branch
        │
        └── clients check manifest on startup / button press
```

The desktop shell is Electron. A small loopback HTTP service remains internal to the process because it provides safe incremental log access and allows the worker/module-based Zone Viewer to run under normal same-origin HTTP semantics.

## Data lifecycle

### Initial release data

Official release builds fetch the current production dataset from the GitHub `dataset` branch and embed it into the installer. `scripts/fetch-bootstrap-pack.mjs --required` verifies the gzip hash and schema before writing the bundled snapshot.

The installer is therefore useful immediately and does not reconstruct the wiki corpus on first launch.

### Subsequent updates

Eye of Zomm checks the tiny GitHub dataset manifest on every startup and on explicit **Sync with Wiki**. If the version is unchanged, no pack download occurs. If it changes, the verified gzip replaces the cached local dataset atomically.

Search/filtering never calls MediaWiki APIs.

### Wiki-side rebuild

The exporter reads MediaWiki's local DB/content APIs in a maintenance process. The wrapper is single-instance and deliberately low priority. Weekly plus manual-after-major-edits is the default schedule.

The completed dataset is mirrored once to GitHub. Players read GitHub, not EQLWiki.

## Structured data

### Zones

Canonical zone name, Zone Viewer name, wiki title, aliases/log variants.

### NPCs

Name, zone, level min/max/average, race, class, era, wiki title, revision provenance, description, and location coordinates when parseable.

### Items

Name, wiki title, era, usable classes, slots, Item Level Slider numeric stats, notes, revision provenance, and drop/source records.

## Wiki fallback

Not every useful wiki page belongs in the structured pack. The global search therefore opens EQLWiki `Special:Search` in the normal browser. It does not mix app records into the search behavior.

This is explicit user navigation, not background API work.

## Zone Viewer scope

Keep only the capabilities that directly support Eye of Zomm navigation:

- select and remember the local EQ folder;
- load/sync current zone;
- first-person 3D, top-down 3D, and top-down map-overlay views;
- grounded/reset;
- floor selection;
- location sync;
- path-to-NPC/location.

Do not expose advanced tuning, performance diagnostics, world atlas, duplicate path-search UI, cut planes, controls help, or fullscreen controls in the app surface.

## Safety boundary

Allowed: normal text logs, user-selected local map/archive reads, GitHub-mirrored static EQLWiki data.

Disallowed: process hooks, memory inspection, injection, game-file writes, generated input, automated commands, gameplay automation, screen reading.

## Release model

- public GitHub repository: `Maergoth/EQL-EOZ`;
- MIT license;
- CI tests on pushes/PRs;
- Windows x64 NSIS installer built by GitHub Actions;
- production release workflow refuses to ship without a verified GitHub-mirrored production dataset;
- Windows artifacts are Authenticode-signed and signature-verified when trusted certificate secrets are configured; until signing is funded/configured, workflows may publish a clearly identified unsigned installer.

Detailed user stories, click budgets, recovery flows, acceptance scenarios, and the phased UX roadmap are maintained in [docs/UX_VISION.md](docs/UX_VISION.md).
