# Source integration notes

## EQLWiki

Eye of Zomm treats EQLWiki as the source of truth for structured world/item/NPC data and as an explicit browser destination.

Normal desktop use must not enumerate wiki pages through MediaWiki APIs. Structured zone/NPC/item data is built on the wiki server by `server/BuildEyeOfZommPack.php`, then mirrored to the GitHub `dataset` branch.

For content that does not fit the structured dataset, the app opens the appropriate EQLWiki page or `Special:Search` in the user's normal browser.

## Item Level Slider

`app/item-scaling.js` mirrors the companion-relevant slider rules locally. In particular:

- positive primary stats scale by +1/tier for values <= 10, otherwise ~10% per effective tier;
- negative primary stats improve toward zero by at least one point/tier or 10%, whichever rule applies by magnitude;
- standalone `DMG` scales;
- elemental/Bane/Backstab damage remains static;
- Ammo `RANGE` gains +10 per whole tier;
- regen/haste flat fields and weight follow their local slider rules.

## Era filtering

The exported record carries a compact era label derived server-side from page categories. Client filtering is local. This avoids running the full page-link era-filter workflow against every desktop row.

## Zone Viewer

The supplied Zone Viewer JS/workers remain under `app/zoneviewer/` and their notices remain under `THIRD_PARTY/ZoneViewer/`.

Eye of Zomm does not rewrite the renderer/parser. The wrapper exposes only the navigation-focused controls needed by the companion and a small integration API for zone sync, logged-coordinate sync, and path-to-label requests.
