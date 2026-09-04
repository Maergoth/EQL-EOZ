# Validation report — v0.7.5

Validated in the build environment on 2026-09-04 UTC.

## Automated checks

- `npm test` passes.
- Parser/scaling/con tests and folder/log-selection filesystem tests pass.
- Inline Zone Viewer module validation and `node --check` pass for first-party JavaScript.
- Static UI validation confirms the removed overview surfaces stay absent, all three map modes persist across window modes, Settings owns the EQ folder, route/readiness surfaces exist, routine browser alerts are absent, and retired naming is absent.
- Release validation confirms the current package/lock/changelog version, required production data, optional certificate handling, and Authenticode verification whenever signing is enabled in either Windows workflow.
- Item scaling tests cover standalone DMG, static Cold DMG, Ammo +10 Range/tier, and negative-stat recovery.
- Con-color tests cover modern blue/light-blue/green/gray boundaries plus white, +1 through +3 yellow, and +4 red.
- Exporter checks require schema v3 and exercise two-coordinate, three-coordinate, template, and multiple-tuple location fixtures when PHP is available.
- `bash -n` passes for the dataset refresh/publish/GitHub-sync shell scripts.
- Bundled JSON files parse successfully.
- The bootstrap script validates manifest shape, gzip SHA-256, decompression, and schema v3 before embedding a production snapshot.
- Runtime dataset checks now target the GitHub `dataset` branch rather than eqlwiki.com.
- The reported Befallen `/loc` regression is covered end to end: displayed `Y -30, X -961, Z -66` normalizes to world `X -961, Y -30, Z -66`, projects to client-map `X 30, Y 961, Z -66`, and both paths reach the same viewer anchor.
- Location and named-destination grounding are release-checked to start at the trusted Z rather than a 24–35 unit offset that could select Befallen's next floor.
- Legends rare-creature/scowls consider wording is covered with the reported Soldier of V Zher line and clean-name assertion.
- Directed route-policy tests allow exactly +6 Z, reject greater climbs, allow exposed drops of any height, and reject drops through an overlapping upper floor.
- UI checks require the four-step readiness rail, synchronized full/minimal destinations, the minimal header search with the redundant route band removed, NPC waypoint-copy affordances and clipboard bridge, current-zone item scope, keyboard Itembox access, and player-centered Top/Map restoration.
- Movement tracking tests cover first-sample behavior, recent-step heading, jitter/duplicate suppression, reversal, teleport rejection, and active-map/route polling cadence.
- Route-guidance tests cover nearest-segment projection, remaining distance, right-turn detection, opposite-facing recovery, off-route recovery, arrival, and absent-path behavior.
- The asset-free route corpus passes 8/8 expected outcomes (100%) with zero segment-policy violations across outdoor, indoor, stacked-floor, ramp, closed-door, exposed-drop, and illegal-ascent topology fixtures.
- Every corpus fixture emits finite typed triangle buffers with in-range indices and upward-facing winding; route requests retain their start/goal anchors, closed doors have no bridge geometry, and exposed drops emit exactly one directed off-mesh link.
- Pinned `recast-navigation` 0.43.1 passes the same 8/8 shared geometry outcomes; Detour partial paths are treated as no-path rather than displayed.
- Sparse candidate paths are projected back to supplied collision surfaces, then independently sampled; routes that leave the surface or reverse a directed drop fail closed.
- The deterministic module worker builds to 747 KiB, contains no build-machine/Node filesystem references, and is covered by transferable-buffer, timeout, stale-result, fallback, and worker-restart contracts.
- A local unpacked Electron build completes, and its ASAR contains the generated worker, route engine/validator, and both Recast third-party license files.
- MIT and Zlib notices are retained. `npm ls --all` validates the pinned dependency tree; GitHub CI and Windows workflows enforce `npm audit --audit-level=high` because the local restricted environment could not reach the advisory service before timeout.
- Route-distance formatting tests retain near-target precision while quantizing medium/long distances to prevent noisy HUD churn.
- Diagnostic-export tests prove the allow-list retains useful session/map/route state while excluding the character name, log filename, filesystem paths, viewer messages, and unknown future settings.
- Inline viewer checks require dataset rare markers, marker-to-route messaging, mode-preserving location sync, and the shared heading tracker.
- Inline viewer checks require both local-label and wiki-coordinate route starts to preserve the active First/Top/Map presentation while retaining the route-progress message.
- Application checks require newest-location coalescing, continuous-movement route scheduling, current-zone rare ranking, and compact mob/loot search.
- A production-size relevance gate exercises all 11,168 embedded items and confirms Befallen/MNK defaults return useful local equipment before generic consumables.
- The S3D parser check requires WLD bitmap `fileName` resolution, normalized BMP/DDS lookup, animated-frame filenames, parsed-zone cache version v16, and a resolved-local-texture marker exposed only as aggregate redacted diagnostics. Map Overlay remains `.txt` line art; First/Top are the texture acceptance surfaces.
- The product/UX vision is release-checked for click budgets, complete flows, feature user stories, acceptance scenarios, and the release-gated road to v1.
- README, vision, implementation status, and contributor handoff cross-link the current baseline and exact next spatial-confidence task.

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

## Real-client checks still required

The repository cannot ship or inspect a player's proprietary S3D/EQG archives. Signed coordinate placement, stacked-floor selection, S3D texture fidelity, rare-label alignment, live heading, and route quality therefore also use the Windows checklist in `docs/V0.7_MANUAL_TEST.md`. Automated tests prevent known transform and movement-policy regressions; they do not substitute for the final visual check against the game.

## Desktop packaging note

The final Windows NSIS compilation runs in GitHub Actions. The workflow installs the locked Electron/Electron Builder versions, runs the test suite, and requires the schema-v3 GitHub dataset. When both trusted PFX secrets are configured it signs and verifies the application and installer; otherwise it records an unsigned-build warning and still uploads the installer.

A release tag uses the same gates. It attaches a verified signed installer when credentials are configured, or a clearly identified unsigned installer while signing is deferred.
