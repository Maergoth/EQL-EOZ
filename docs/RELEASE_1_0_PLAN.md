# Eye of Zomm 1.0 release record

The owner authorized publication of the six queued application features and the
explicit weapon-stat wiki fix on October 25, 2026. Wiki PR102 is promoted only as
its scoped change; unrelated staging work is excluded. The application release
retains one Windows/Linux version and one publisher, with no installed-profile
or game-file modification as a test.

## Integrated source

The release branch starts at the verified combined tree
`8f493bcf72d8ca4fb005b436b359da28a3eec07f`, based on main
`fa42520d64ccd333b62b3c4c78b94f98690e665f`. Normal merges retain the original
reviewed PR heads as ancestors. Each merge is required to leave the tested tree
unchanged; shared script/workflow conflicts preserve the complete test union.

| Feature | Reviewed PR head |
| --- | --- |
| Native eye desktop / installer artwork, PR35 | `c861117a7dc3523b66d89403de3bf846d2b6513f` |
| Explicit weapon bases and decimal weight, PR36 | `a297c29984d25afabdba08e6cb585db537b804b3` |
| Shared Crawl state, PR37 | `73d3212d99e97b4fbaf71005bbb72187eaadd979` |
| Combatants, AA and retained Live encounters, PR38 | `4695240795bc1b7653f4096e00bd80b767b26f95` |
| Structured contributions and capture permission, PR39 | `ee7445ff86d0772b60d249d631f300a4d70ed5d7` |
| Prompt minimap updates and bounded native checks, PR40 | `65b911f59a5a556581dda9362df563f31ba26327` |

All six heads passed source, Windows desktop and Linux native/build/package PR
checks before integration. The private combined source suite, native workflows,
unpublished Windows build and exact ASAR/source/image/bootstrap/offline OCR
checks are recorded privately. An additional local resize attempt was partial
amid foreign physical cursor activity; it is not reported as a passing run.
The later complete hosted Windows and Linux resize/popup checks passed.

## Wiki and dataset dependency

Wiki PR102 supplies rules revision 3 and the exporter BACKSTAB / DELAY / DMGBON
aliases. Its scoped production promotion is wiki commit
`780b61946cdb7167cb88ff38eb7d1fe53bd59d3e`. The application source receipt pins
that commit. Backstab keeps its own base independently of ordinary damage;
whole-rank weight uses exact decimal arithmetic. The explicit Torturer's
Signature bases produce Backstab21 and weight0.7 at rank8.

The live dataset refresh is independent of application publication. The release
must consume the successfully verified new producer receipt, not claim that
shipping source installed a producer or rebuilt public data. Both platform
builds consume the same verified bootstrap and formula snapshot from the release
coordinator. Final dataset and publication receipts are appended after completion.

## Release history

The 1.0 entry has four reviewed actual Electron captures of the integrated
runtime: Crawl in Intel, per-combatant Overview, structured item fields and the
native New Item Found popup. They use synthetic records / fixture responses,
retain their provenance captions and SHA-256 values, and occupy new 1.0.0 paths.
Earlier releases and image bytes are unchanged. No private game/player pixels,
production credentials or game archives are included.

## Remaining final gates

Run the source and native release checks after the 1.0 metadata change. Review
the new version's history and preserve all previous tour entries. Verify the
exact final PR / main / tag source, the unified Windows and Linux build jobs,
all package sizes and SHA-256 sums, the published release notes and updater
selection. Stable 1.0 publication requires its matching explicit `v1.0.0` tag.
Keep live-game compositing and installed shortcut/upgrade acceptance distinct
from disposable synthetic fixtures and packaged-runtime checks.
