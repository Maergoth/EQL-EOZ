# Source integration notes

Use [DEVELOPMENT.md](DEVELOPMENT.md) for the current component and authority map.
This page summarizes external source boundaries rather than release status.

## EQLWiki

Eye of Zomm treats EQLWiki as the source of truth for structured world/item/NPC data and as an explicit browser destination.

Normal desktop use must not enumerate wiki pages through MediaWiki APIs. Structured zone/NPC/item data is built on the wiki server by `server/BuildEyeOfZommPack.php`, then mirrored to the GitHub `dataset` branch.

For content that does not fit the structured dataset, the app opens the appropriate EQLWiki page or `Special:Search` in the user's normal browser.

## Item Level Slider

`app/item-scaling.js` adapts catalog input to the wiki-owned engine and rules
bundled under `app/vendor/`; it does not maintain an independent formula copy.
Release preparation resolves one fixed wiki snapshot for Windows and Linux.
Installed apps retain that snapshot until an app update, without runtime formula
polling. Backstab, weapon Accuracy, intrinsic/generated Void and base-recovery
rules follow that shared contract; recorded Character totals stay unchanged.
See [shared item formulas](docs/SHARED_ITEM_SCALING.md) for canonical sources,
provenance, current behavior and synchronization checks.

## Era filtering

The exported record carries a compact era label derived server-side from page categories. Client filtering is local. This avoids running the full page-link era-filter workflow against every desktop row.

## Zone Viewer

The supplied Zone Viewer JS/workers remain under `app/zoneviewer/` and their notices remain under `THIRD_PARTY/ZoneViewer/`.

The wrapper exposes navigation controls and a small API for zone sync,
logged-coordinate sync and path-to-label requests. Upstream sources remain
pinned; the app records narrow compatibility changes as readable, checked
helpers/patches rather than an unreviewed renderer/parser replacement. See
[the map component contracts](DEVELOPMENT.md#maps-geometry-and-navigation).
