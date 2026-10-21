# Wiki and map integration audit

## Scope and execution plan

Requested on October 21, 2026: compare Eye of Zomm with the current EQLWiki
application and a fresh production-derived dataset, investigate obvious map
explorer defects using the local EverQuest installation and EQEmu references,
and prepare a reviewable Eye of Zomm PR. Do not merge or deploy the application.

The subsequent [map explorer validation](MAP_VALIDATION.md) records actual
Electron rendering against local client archives, additional loader/route/
clearance/CSP fixes, and the remaining live-client acceptance limits. Use that
page for final map results; the initial parse-only observations below are
retained as audit history.

Baseline: EoZ `76f02e3` (0.8.0). EQLWiki is a separate MediaWiki application;
its Git repository does **not** contain the live database. Wiki content,
account data, uploads, client archives, and generated packs must stay outside
this PR. The desktop reads logs/maps and downloads the filtered public pack;
it must retain its read-only game boundary and avoid client wiki crawling.

### Context to retain when resuming

| Question | Authoritative sources |
| --- | --- |
| Desktop architecture and unresolved map acceptance gates | [HANDOFF.md](HANDOFF.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [WINDOWS_MANUAL_TEST.md](WINDOWS_MANUAL_TEST.md), [NAVMESH_EVALUATION.md](NAVMESH_EVALUATION.md) |
| Wiki data producer and schedule | EQLWiki `maintenance/BuildEyeOfZommPack.php`, `maintenance/zone-catalog.json`, `ops/host-bin/eoz-*.sh`, `PROJECT.md` section Existing scheduled jobs; EoZ [server/README.md](../server/README.md) |
| Dataset consumer and cache | [desktop/main.cjs](../desktop/main.cjs), [fetch-bootstrap-pack.mjs](../scripts/fetch-bootstrap-pack.mjs), GitHub `dataset` branch manifest and pack |
| Item calculations | Current wiki `extensions/ItemLevelSlider/itemlevelslider.js` and `ops/test-item-level-slider.cjs`; EoZ [item-scaling.js](../app/item-scaling.js), [app.js](../app/app.js) |
| Coordinate and destination contracts | [coordinate-system.js](../app/coordinate-system.js), [viewer.html](../app/zoneviewer/viewer.html), vendored `gotoNpcLabel` and `pathToWikiLocation` in the generated viewer |
| Geometry and route ownership | [collision-geometry.js](../app/collision-geometry.js), [recast-route-client.js](../app/recast-route-client.js), [route-validation.js](../app/route-validation.js), [route-corpus.js](../app/route-corpus.js) |
| Independent format/navigation references | [EQEmu WLD reader](https://github.com/EQEmu/EQEmu/blob/master/utils/deprecated/azone2/wld.cpp), [map collision](https://github.com/EQEmu/EQEmu/blob/master/zone/map.cpp), [Detour pathfinder](https://github.com/EQEmu/EQEmu/blob/master/zone/pathfinder_nav_mesh.cpp) |

The initial manifest was `20261019T042526Z-33a2a5dd67ab` (October 19 UTC).
The installed weekly export job was confirmed over SSH and manually run to
completion for this audit. It read the production wiki at low priority and
published only the existing filtered dataset branch. A staging database
replacement was unnecessary for this integration audit.

Fresh manifest: `20261021T042355Z-2acd4aba91ab`, generated October 21 at
04:23:56 UTC; gzip bytes `2765979`; SHA-256
`b6ea3f925477cc0a4529bec52fc07ba6f190a73a2f9825c7cb9d3c8cee4dfa7a`.
The build fetch verified that checksum and schema v3: **124 zones, 8,389 NPC
records, 11,262 items**, with 776 embedded icon IDs. The fresh pack still has
769 blank NPC zones and 64 non-AMMO items with Range; the producer fixes below
are proposed source changes, not installed by this refresh.

### Ordered work

1. Gather baseline docs, branch/release policy, exporter deployment evidence,
   dataset provenance, item calculations, map coordinate boundaries, and
   dependency audit results. Preserve unrelated dirty wiki files.
2. Complete the fresh export, verify the gzip hash/schema, and inspect aggregate
   catalog coverage without committing data or game assets.
3. Fix reproducible integration defects with behavioral regressions: wiki NPC
   destinations entering a client-map coordinate API, moved-start rerouting and
   cancellation, item Range scaling, class exclusions, missing exact zone aliases,
   and failed dataset recovery/verification. Prepare matching producer fixes in
   an isolated EQLWiki branch against `staging`; deployment/rebuild stays separate.
4. Exercise representative local archives/maps privately where feasible;
   distinguish parse/coordinate evidence from real in-game visual validation.
   Preserve established-first routing and the real-client promotion gate.
5. Run relevant tests, production-catalog checks, dependency audit, and packaging
   checks when affected. Record observations, remaining limitations, and follow-up
   tasks here and in the handoff. Push a feature branch and open an EoZ PR.

## Findings and results

### Reproduced defects and proposed repairs

| Finding | Evidence and resulting behavior |
| --- | --- |
| Wiki NPC route mirrored away from its marker | The wrapper injected world X/Y into `gotoNpcLabel`, which accepts negated client-map X/Y. Convert through `worldToClientMap`; marker and route now converge. |
| Moving toward the same NPC reused the original start | The vendor target cache keys only the destination. The wrapper now also checks `requestStart`, recalculates after movement, and invalidates the prior spatial candidate before awaiting the line worker. |
| Cancel could recreate a target through fallback | A stale label-router result returned false and entered wiki fallback. Check the navigation generation before fallback, so Cancel/new-target stays authoritative. |
| Listed Range differed from the live wiki | 64 non-AMMO records in the initial pack have Range. Live wiki source scales all listed Range by +10/full tier; EoZ now matches bows, throwing weapons, and ammo. |
| `ALL except` recommended unusable equipment | 712 initial records exported `ALL` plus excluded codes. The exporter now emits allowed classes; the client repairs legacy packs from their preserved Class line. Empty metadata remains unknown; `NONE` explicitly permits no class. |
| Exact zone aliases discarded NPC context | 769 initial NPC records have blank zones. Replaying their current public pages through the real exporter recovers 750 pages / 751 zone records with 18 exact aliases; 19 remain unresolved. Canonical/viewer names are preserved. Requires the separate producer release and rebuild. |
| Sync could claim a corrupt cache was current | Validate the same-version cache before skipping a download; require a valid SHA-256 and preserve the last good cache on failure. Runtime/build reads now bound manifest, gzip, and decoded size; timeouts cover body reads and invalid schemas fall back correctly. |
| High dependency advisories failed CI | Update Electron from 43.4.0 to 43.8.3 and refresh compatible affected transitive packages. The high-severity audit passes. Eight moderate advisories remain in the builder's `sprintf-js` chain; no builder downgrade or major runtime upgrade is included. |

The fresh export uses the currently installed producer/catalog. The alias and
producer class repairs in this PR are not installed by that export. Legacy
class filtering works immediately in the client; blank NPC zones require the
reviewed server release and another rebuild.

### Local game-file observations

The shipped parser worker decoded three privately supplied S3D zone families
without writing game files or persisting generated geometry:

| Zone | GLB primitives | Returned textures | Parse time in this harness |
| --- | ---: | ---: | ---: |
| Mistmoore | 58 | 127 | 930 ms |
| Commons | 41 | 115 | 475 ms |
| Befallen | 18 | 69 | 826 ms |

These are decoder observations from a Node harness, not WebGL rendering,
texture fidelity, or real walking/route evidence. EQEmu references corroborate
coordinate/ground/partial-path/material concepts; no EQEmu implementation is
copied and no renderer/parser replacement is justified by this evidence.

### Follow-up work kept out of this patch

- **NPC game names versus article titles:** 227 initial NPC records have
  parenthesized disambiguators. Export the actual template name plus separate
  wikiTitle/aliases, and match names with zone context; stripping every suffix
  in the client risks merging distinct identities.
- **Itembox-derived fields:** raw-template export omits generated damage bonus,
  Backstab, and tier SV VOID. Initial pack inference finds 1,444 weapons meeting
  damage-bonus prerequisites, 228 possible generated Backstab fields, and 3,323
  items qualifying for tier SV VOID. Preserve explicit overrides and distinguish
  base values from generated contributions before adding them. These are
  inferred coverage counts, not verified rendered output for every article.
- **Typed drop sources and zone matching:** plain annotations can become source
  names, and name-only fallback can combine drops across zones. Export source
  title/name/annotation separately and constrain fallback when a zone is known.
- **Effects:** 1,528 initial items retain Effect text; there is no structured
  spell/proc corpus, and separate focus-effect template fields need review.
  Full wiki links remain the detailed reference.
- **Spatial release gate:** rendered local-archive and emulated-scale results
  are now recorded in [MAP_VALIDATION.md](MAP_VALIDATION.md). Complete live
  movement, known-walkable drop/door coverage, and OS-wide DPI acceptance.
  Keep guarded established-first routing until that evidence supports promotion.

### Verification and release procedure

Baseline and updated `npm test` pass, including both 8/8 synthetic route corpora.
New behavioral regressions failed before the corresponding fixes. Exporter
fixtures execute actual PHP methods with synthetic inputs; map tests execute
the real wrapper and shipped label router with synthetic geometry. Dataset
tests exercise the runtime, build script, and renderer with temporary caches
and a local fixture server. They do not imply live game validation.

The fresh production catalog check passes (64 Befallen/MNK items), the unpacked
Windows build passes, and the ASAR check confirms v0.8.1, production data, and
the tested runtime source bytes. NSIS installation, Authenticode verification,
and the interactive in-game matrix were not exercised by this audit.

Before merging: run `npm ci`, `npm test`, `npm run audit:deps`, fetch a verified
production bootstrap, run `npm run test:catalog`, and package/check the ASAR.
Review [EQLWiki producer PR #35](https://github.com/Maergoth/EQLWiki/pull/35)
against `staging`. Owner promotion of
the producer/catalog and a subsequent refresh are separate steps; see
[server/README.md](../server/README.md). Merge neither repository automatically.
