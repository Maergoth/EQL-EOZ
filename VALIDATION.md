# Validation report — v0.5.4

Validated in the build environment on 2026-09-03 UTC.

## Automated checks

- `npm test` passes.
- Parser/scaling/con tests and folder/log-selection filesystem tests pass.
- Inline Zone Viewer module validation and `node --check` pass for first-party JavaScript.
- Static UI validation confirms the removed overview surfaces stay absent, all three map modes exist, Settings owns the EQ folder, and retired naming is absent.
- Release validation confirms version `0.5.0`, required production data, optional certificate handling, and Authenticode verification whenever signing is enabled in either Windows workflow.
- Item scaling tests cover standalone DMG, static Cold DMG, Ammo +10 Range/tier, and negative-stat recovery.
- Con-color tests cover modern blue/light-blue/green/gray boundaries plus white, +1 through +3 yellow, and +4 red.
- Exporter checks require schema v3 and exercise two-coordinate, three-coordinate, template, and multiple-tuple location fixtures when PHP is available.
- `bash -n` passes for the dataset refresh/publish/GitHub-sync shell scripts.
- Bundled JSON files parse successfully.
- The bootstrap script validates manifest shape, gzip SHA-256, decompression, and schema v3 before embedding a production snapshot.
- Runtime dataset checks now target the GitHub `dataset` branch rather than eqlwiki.com.
- Signed `/loc` normalization is covered with the reported Befallen `Y -30, X -961, Z -66` regression and retains negative map X.
- Location and named-destination grounding are release-checked to start at the trusted Z rather than a 24–35 unit offset that could select Befallen's next floor.
- Legends rare-creature/scowls consider wording is covered with the reported Soldier of V Zher line and clean-name assertion.
- Directed route-policy tests allow exactly +6 Z, reject greater climbs, allow exposed drops of any height, and reject drops through an overlapping upper floor.
- UI checks require persistent minimal-mode map controls, folder/map readiness states, current-zone item scope, tier-adjusted tooltip output, and player-centered Top/Map restoration.
- A production-size relevance gate exercises all 11,168 embedded items and confirms Befallen/MNK defaults return useful local equipment before generic consumables.
- The product/UX vision is release-checked for click budgets, complete flows, feature user stories, acceptance scenarios, and a phased roadmap.

## Full supplied-log parse

The parser was previously run across the complete supplied 133,220-line log rather than only fixtures.

Observed parsed events:

- zone transitions: 40
- consider events: 70
- profile/level events: 7
- raw target lines in the source log: 36 (intentionally no longer used by the app)
- outgoing damage events: 27,393
- rune events: 4,185
- healing events: 1,107
- kills: 232
- distinct locally observed NPC/zone keys: 99
- total outgoing damage parsed: 2,079,300
- total healing parsed: 90,003

## Desktop packaging note

The final Windows NSIS compilation runs in GitHub Actions. The workflow installs the locked Electron/Electron Builder versions, runs the test suite, and requires the schema-v3 GitHub dataset. When both trusted PFX secrets are configured it signs and verifies the application and installer; otherwise it records an unsigned-build warning and still uploads the installer.

A release tag uses the same gates. It attaches a verified signed installer when credentials are configured, or a clearly identified unsigned installer while signing is deferred.
