# Validation report — v0.8.5

## 0.8.5 native Map and Intel workspace

This slice adds a collapsing Map header, Reset/default view, matching monster
name/marker hit targets, on-demand Top/First modes in the native window, pinned
Intel tier/class controls and source-specific first-person camera previews.
The source and security map lives in
[OVERLAY_MAP_WORKSPACE.md](docs/OVERLAY_MAP_WORKSPACE.md).

Regression coverage is authored for GitHub execution: exact source identity,
camera-only focus without changing logged position, shared tier persistence,
header/hover/keyboard behavior, label hit rectangles, Map-only request policy,
stale iframe cancellation and actual Electron wiring. The additional viewer
reuses the shipped parser/rendering code; synthetic camera/scene fixtures do
not prove every proprietary zone, physical pointer-lock comfort or game focus.

The owner requested no local test/build/install runs. Current UI screenshots
are collected by GitHub's synthetic Electron fixture and reviewed before
packaging. All existing source, native-window, worker, discovery, catalog and
exact ASAR source/image/bootstrap gates remain required.

## 0.8.4 window and map follow-up

The initial focused checks reproduced the map-footer clipping in the current
build: at 1024×700 the footer was below the embedded frame. The responsive
shell and wrapper now fit the footer at 1100×760, 1024×700, 900×600 and emulated
125/150% renderer scaling. These are renderer measurements, not physical OS DPI
or second-monitor acceptance. Local Map zoom retains its player-follow basis.

The initial disposable-profile Electron lifecycle check passed native framing,
Settings IPC/persistence, normal placement behind maximization, immediate Quit
flush, deferred startup maximization, foreign-renderer denial, and taskbar
fallback when tray creation fails. Unit coverage checks negative-coordinate
monitors, removed displays and unrestricted dragging between monitors.

Current routing was separately verified with two actual Mistmoore wall detours,
including a candidate recovery without an established fallback. Both routes
passed full decoded-geometry validation with zero violations; see the
[rejection audit](docs/ROUTE_REJECTION_AUDIT.md). The routing modules are
unchanged between tagged 0.8.1 and 0.8.3. This is evidence of current detour
support, not a fix for the unlocated original target.

Later additions cover the native Z slider/tolerance with unknown-Z markers,
raid-first Intel, the green update header action, Settings repository link and
the packaged screenshot tour. The source suite, actual Electron lifecycle,
map-layout, native-overlay and discovery checks are required in GitHub CI;
the user requested no further local test/build/install runs. Documentation
captures use a disposable synthetic profile. The release also requires current
catalog and exact source/image/bootstrap ASAR checks.

Production bootstrap refreshed for this slice:
`20261021T101150Z-dd346c8cc55d`, 124 zones, 8,679 NPCs and 11,270 items;
production catalog relevance passed. The dependency audit gate passed without
adding a runtime dependency. Physical game focus, monitor/DPI changes and live
movement retain their manual acceptance limits.

## 0.8.3 map, intel, triggers and inline wiki notices

The full source suite passes, including dynamic Raid Instance section fixtures,
normal/raid identities, complete lazy drop replies, catalog completeness,
regex worker timeouts/recovery, capture/Ignore authorization, fifteen-second
notice deadlines and hover/focus holds. Source review also recovered stale
map-root races and rejects an incomplete file inventory instead of claiming a
map is missing. No runtime dependency was added.

The actual Electron native-window smoke passes with a synthetic layered map,
twelve normal drops versus two raid drops, consider selection/expansion without
window activation, regex match preview and live named captures, Taken totals,
hidden-owner continuity and cumulative Classic/Velious item filtering. All
First/Top/Map controls are contained by the main map page. The worker/CSP smoke
passes with JavaScript evaluation blocked and the WASM route worker available.

Read-only parsing of the selected local client Maps directory matched 123 of
124 catalog identities after the Kerra Island `kerraridge` alias correction,
covering 862,469 lines and 4,358 labels. New Sebilis Expedition has no matching
client map in this installation. Missing maps show an explicit fallback;
markers never fabricate a validated route. Game files and raw logs are excluded.

The discovery smoke uses a synthetic capture source and an in-memory clipboard
spy. It verifies explicit capture, copied pixels and instructions without
touching the user's clipboard or reading the desktop. This is separate from a
physical game screenshot, foreground/DPI, click-through or audio-device check.
Known named targets continue to use log text; screenshots do not drive parsing.

The reviewed wiki producer reached staging in EQLWiki #39 and production through
the separate scoped promotion #40 (`cc70c432`). Deployment succeeded; the installed
producer matched the reviewed Git source hash. The prior filtered manifest/gzip
pair was preserved before the existing low-priority refresh job published
`20261021T095417Z-c7004672e0f3` to the dataset branch. This export contains 124
zones, 8,679 NPC records (117 raid variants), 11,270 items and a complete public
presence index (8,159 NPC names, 11,259 item names and 26,342 titles). King Tranix
remains raid-only; Fire Giant Warrior retains both variants; Robe of the Kedge
retains raid and normal-zone sources. No database pages or host scripts changed.

The local 0.8.3 NSIS build passes exact-source ASAR validation against that freshly
fetched bootstrap, including the map renderer, regex worker, discovery UI/host,
timer editor, and native preloads. The installer remains unsigned. Physical
game/DPI/audio/desktop-capture checks and installed upgrades are distinct from
these build and synthetic checks. Earlier 0.8.2 observations remain historical.

The first public Windows build stopped before publication when its normal
8.3 TEMP path was rejected by a lexical cache-path comparison. The updater now
checks requested directory components for symlinks/junctions and pins normal
paths to their canonical spelling. Twenty-six updater tests pass on Windows
Node 22 and Node 25, including a distinct real 8.3 alias, case variants,
verified handoff, restore and redirected-parent rejection. PR CI now runs the
entire source suite on Windows as well as Linux before release.

The follow-up producer ordering fix passed wiki staging #41 and scoped main
promotion #42 (`c1fe84d2`). Its installed source hash was verified after a
successful deployment. Only NPC ordering changed in the fresh filtered public
export; an unordered content digest, round-trip check and unchanged counts
proved every field and NPC record was preserved. Normal coordinates for 25
shared NPCs survive older clients' last-record-wins behavior again. The existing
publisher/syncer published `20261021T101150Z-dd346c8cc55d`; that verified pack is
the final 0.8.3 bootstrap. Catalog and artifact gates reject the earlier unsafe
ordering. The previous filtered manifest/gzip pair remains available privately.

## 0.8.2 application updates, native overlays and timers

The dependency-free updater has 22 mocked lifecycle/network/IPC checks plus
renderer checks for progress, cancellation, Later, explicit install action,
retryable error visibility and stale responses. Independent review identified
and verified fixes for hidden retry errors and redownloading changed/missing
staged installers. Actual Electron smoke exercises the preload API and Settings
controls in unsupported development mode while retaining the worker/CSP check.

The full test suite, both 8/8 route corpora, production catalog relevance (64
Befallen/MNK items), and the high-severity dependency gate pass. The existing
eight moderate builder-chain advisories remain; no new dependency is added.
A read-only unauthenticated GitHub check selects the actual v0.8.1 installer
and valid asset digest for a simulated 0.8.0 client, and correctly finds no newer
release for the 0.8.2 candidate. It downloads or executes no installer.

Local Windows NSIS compilation and the expanded exact-source ASAR gate pass
for 0.8.2 with production snapshot `20261021T062421Z-830bd5a89bfa` (124 zones,
8,645 NPC records, 11,262 items). The ASAR exact-source gate includes the updater, isolated native host/preload,
parser/timer/session/controller modules, panel HTML/CSS/JS and Settings markup. The installer reports `NotSigned`
and was not installed or used to perform an upgrade.

The overlay implementation now creates four actual independent transparent
BrowserWindows: Parse, Zone & loot, Consider and Timers. Twenty-one mocked native
checks cover bounds/default grid, trust, independent preferences, lock versus
passthrough, unavailable recovery controls, stale/crashed owner, explicit recovery
and route actions that span a zone/opt-in change. Renderer tests cover complete
parse aggregates, scopes, escaped dataset text, timer forms, scaling/opacity,
menus, recovery and command-error visibility. The source map is retained in the
[PNUT UX plan](docs/PNUT_UX_PLAN.md).

Timer tests cover manual/repeat and sleep/restart phase, pause/resume/reset,
literal triggers, kill-based deadlines, zone filters, malformed saved data,
capacity, replay guards, valid original timestamp freshness, initial history,
character/log changes, own melee hits/misses, same-second deduplication, special
exclusion, casts, delay seeds, idle reset and faster/slower estimate changes.
Snapshot tests prove bounded UTF-8 payloads below 2 MiB preserve aggregate
damage/healing/rune totals, action counts and timer deadlines; raw lines and
paths are omitted. No runtime dependency is added.

`npm run test:native-overlays` passes using the real desktop bootstrap and
separate native handles with an isolated profile and synthetic log. It proves
four frameless/transparent sandboxed windows, independent bounds, locked
interaction, native passthrough/recovery calls, real preload IPC, storage isolation and CSP
rejection of direct HTTP API access, a shared
140-damage parse and two timers using an isolated synthetic dataset/icon,
editor values across timer paints, error
feedback, panel reload/recreation and continued parsing with the owner hidden.
Five synthetic compositor captures were inspected: parse, intel, consider,
timers and the main controller. They were captured at this desktop's 1.5 device
pixel ratio, not a complete OS-wide DPI matrix.

The native test keeps windows hidden and captures their actual renderers. It
does not click through a foreground game, establish foreground focus behavior,
exercise physical monitor removal or sleep, or validate live log wording.
Native docking and another 3D map window are not implemented. Installed upgrade
execution also remains untested; use the updated [Windows checklist](docs/WINDOWS_MANUAL_TEST.md)
for those checks. Building/hash-checking an unsigned installer does not prove
installation or signing.

## 0.8.1 integration audit

Checked October 21, 2026 on Windows. `npm test` passes, including Range/class
parity, exporter zone aliases, actual-wrapper routing, 15 dataset/runtime
checks, supported stair flights, certified drops, and exact endpoint guards.
The regressions reproduced failures before their fixes. Both synthetic route
corpora remain 8/8; no routing engine promotion is included.

The corrected producer/catalog passed staging and production deployment.
The subsequent live-wiki export published
`20261021T062421Z-830bd5a89bfa`. Bootstrap SHA-256/schema checks pass for 124
zones, 8,645 NPC records, and 11,262 items. It recovers 750 previously unzoned
NPC pages (19 remain unresolved) and normalizes all 712 `ALL except` records.
`npm run test:catalog` passes with 64 Befallen/MNK items. A rebuilt Windows
ASAR contains exactly the fetched bootstrap bytes and tested runtime sources.
Direct final-data checks confirm the repaired explicit/multiple-zone records;
all represented NPC pages and revision IDs are preserved. See the
[integration audit](docs/INTEGRATION_AUDIT.md) for exact provenance.

The follow-up [map validation](docs/MAP_VALIDATION.md) uses the actual Electron
renderer and bundled workers against five local zones. The
[destination-only audit](docs/ROUTE_REJECTION_AUDIT.md) repeats the original
14 paths/14 markers and adds eight verified probes: **36 requests, 20 valid
paths, 16 markers, zero displayed violations, and exact endpoint matches**.
It recovers real Mistmoore/Kurn drops, corrects ramp candidate completion, and
tests supported stair flights. Twenty-seven view/scale captures cover
Mistmoore, Commonlands, and Befallen at emulated 100/125/150% renderer scale.
Loader, readiness, body-clearance, stale route, hidden framing, and browser
WASM-policy regressions are repaired. No client files, raw logs, generated
geometry, or packs are committed. These results do not establish live game
movement, dynamic doors, complete safe-route coverage, or OS-wide DPI behavior.

`npm run test:desktop-worker` runs the real desktop response policy and browser
worker in isolated Electron: a synthetic route succeeds with zero violations
while JavaScript string evaluation remains blocked. Windows CI and installer
build workflows enforce this check. Focused regressions cover queued loads,
exact archive selection, async app/route ownership, deferred viewport fitting,
walls/ceilings/narrow passages/drop clearance, and redacted rejection reasons.

Electron 43.8.3 and compatible transitive updates clear all high findings;
`npm run audit:deps` passes with eight remaining moderate builder-chain
advisories. `npm ls --all` passes. The packaged-artifact check now additionally
requires the tested app/map/class/scaling/desktop source bytes in the ASAR.
The unpacked Windows build, NSIS compilation, and `npm run test:artifact` pass with the fresh
production bootstrap, all new runtime modules, and the 759 KiB worker checked
against current source. The generated installer reports `NotSigned` under
`Get-AuthenticodeSignature`; installation and the interactive game-client
matrix were not exercised.

## Prior 0.8.0 validation context

Validated in the build environment on 2026-09-05 UTC.

## Automated checks

- `npm test` passes.
- Parser/scaling/con tests and folder/log-selection filesystem tests pass.
- Inline Zone Viewer module validation and `node --check` pass for first-party JavaScript.
- Focused contracts prove intel-first Minimal defaults, removal of its destination surface and legacy CSS/JS hooks, optional map/row-routing controls, class-stat loot eligibility, lazy current-zone archive hydration, WLD material-group cursor alignment, one-row viewer chrome, fly initialization, Succor reset, worker-first routing, persistent cancellation, and repeating texture sampling.
- Static UI validation confirms the removed overview surfaces stay absent, all three map modes persist across window modes, Settings owns the EQ folder, route/readiness surfaces exist, routine browser alerts are absent, and retired naming is absent.
- Release validation confirms the current package/lock/changelog version, required production data, optional certificate handling, and Authenticode verification whenever signing is enabled in either Windows workflow.
- Release validation requires the first successful `main` build of a new `0.x` version to publish one immutable-tagged GitHub prerelease, while repeat builds at the same version preserve that release and explicit `0.x` tags remain classified as prerelease.
- Item scaling tests cover standalone DMG, static Cold DMG, Ammo +10 Range/tier, and negative-stat recovery.
- Con-color tests cover modern blue/light-blue/green/gray boundaries plus white, +1 through +3 yellow, and +4 red.
- Exporter checks require schema v3 and exercise two-coordinate, three-coordinate, template, and multiple-tuple location fixtures when PHP is available.
- `bash -n` passes for the dataset refresh/publish/GitHub-sync shell scripts.
- Bundled JSON files parse successfully.
- The bootstrap script validates manifest shape, gzip SHA-256, decompression, and schema v3 before embedding a production snapshot.
- Runtime dataset checks now target the GitHub `dataset` branch rather than eqlwiki.com.
- The exact side-by-side Mistmoore capture is fixed as a regression: the app Map HUD must show `X -222.75, Y 125.50, Z -154.10`, and its canonical-world and client-map-file paths must resolve to the same viewer point.
- The exact multi-player Legends `/who` capture is covered: another player's row is ignored, the current character's row emits one zone transition, the volatile instance number is removed, `mistmoore` is retained for catalog/archive resolution, and a repeated row does not reload the zone.
- The reported coordinate regression is covered end to end: displayed Mistmoore `/loc -330, 120, -178.13` normalizes to world `X 120, Y -330, Z -178.13`, projects to the real map's Succor anchor around `X -120, Y 330, Z -180`, and both paths reach the same viewer point. A Befallen Succor anchor independently guards the same no-swap `(-world X,-world Y,Z)` rule.
- Location and named-destination grounding are release-checked to start at the trusted Z rather than a 24–35 unit offset that could select Befallen's next floor.
- Legends rare-creature/scowls consider wording is covered with the reported Soldier of V Zher line and clean-name assertion.
- Directed route-policy tests allow exactly +6 Z, reject greater climbs, allow exposed drops of any height, and reject drops through an overlapping upper floor.
- UI checks require the four-step readiness rail, the full-view destination planner, no Minimal-view destination form or stale styling/hooks, list-driven optional Route actions, NPC waypoint-copy affordances and clipboard bridge, current-zone item scope, keyboard Itembox access, and player-centered Top/Map restoration.
- Movement tracking tests cover first-sample behavior, recent-step heading, jitter/duplicate suppression, reversal, teleport rejection, and active-map/route polling cadence.
- Route-guidance tests cover nearest-segment projection, remaining distance, right-turn detection, opposite-facing recovery, off-route recovery, arrival, and absent-path behavior.
- The asset-free route corpus passes 8/8 expected outcomes (100%) with zero segment-policy violations across outdoor, indoor, stacked-floor, ramp, closed-door, exposed-drop, and illegal-ascent topology fixtures.
- Every corpus fixture emits finite typed triangle buffers with in-range indices and upward-facing winding; route requests retain their start/goal anchors, closed doors have no bridge geometry, and exposed drops emit exactly one directed off-mesh link.
- Pinned `recast-navigation` 0.43.1 passes the same 8/8 shared geometry outcomes; Detour partial paths are treated as no-path rather than displayed.
- Sparse candidate paths are projected back to supplied collision surfaces, then independently sampled through a worker-local X/Z triangle index; routes that leave the surface, exceed the +6 upward climb, or reverse a directed drop fail closed, and a broad-surface fixture protects triangles spanning many index cells.
- Viewer collision-export tests apply mesh world transforms, preserve upward winding under mirrored transforms, exclude props, reject non-finite/degenerate triangles, support cooperative cancellation, crop only the route corridor, cap route payload size, and emit downward-only links.
- An integration contract sends exported/cropped viewer-format triangles through Recast and the independent validator with a successful full-goal result and zero violations.
- The wrapper's static contract requires cooperative zone export, route-local transfer, established-first scheduling, atomic candidate-owner messaging, aggregate spatial status, and cancellation on clear/unload. Runtime client tests require transferred buffers, latest-request-wins worker termination, fallback, and engine-fault restart.
- The deterministic module worker builds to approximately 748 KiB and contains no build-machine/Node filesystem references. Windows ASAR checks require the collision exporter/cropper, client, viewer orchestration, app-owner update, generated worker, route engine/validator, and both Recast license files.
- A local unpacked Electron build completes. Windows workflows also run `npm run test:artifact` after packaging to prove the ASAR contains a production-scale schema-v3 bootstrap pack and that its version, always-visible version label, coordinate formatter, viewer transform, Map HUD, texture cursor patch, and spatial candidate modules match the source being released.
- MIT and Zlib notices are retained. `npm ls --all` validates the pinned dependency tree; local and GitHub CI/Windows workflows enforce `npm audit --audit-level=high`.
- Route-distance formatting tests retain near-target precision while quantizing medium/long distances to prevent noisy HUD churn.
- Diagnostic-export tests prove schema v2 retains useful session/map/route readiness plus aggregate collision/candidate identity, counts, timings, outcome, and fallback reason while excluding character and target names, player/route coordinates, raw worker detail, log filename, filesystem paths, viewer messages, and unknown future settings.
- Inline viewer checks require dataset rare markers, marker-to-route messaging, mode-preserving location sync, and the shared heading tracker.
- Inline viewer checks require both local-label and wiki-coordinate route starts to preserve the active First/Top/Map presentation while retaining the route-progress message.
- Application checks require newest-location coalescing, continuous-movement route scheduling, current-zone rare ranking, and compact mob/loot search.
- A production-size relevance gate exercises all 11,168 embedded items and confirms Befallen/MNK defaults return useful local equipment before generic consumables.
- The S3D parser check requires WLD bitmap `fileName` resolution, expanded BMP/DDS/material aliases, animated-frame filenames, repeat wrapping for out-of-range WLD UVs, skipped-group polygon cursor advancement, parsed-zone cache version v18, and a resolved-local-texture marker exposed only as aggregate redacted diagnostics. Map Overlay remains `.txt` line art; First/Top are the texture acceptance surfaces.
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

The repository cannot redistribute proprietary S3D/EQG archives. Authorized local inspection and rendering are recorded in [MAP_VALIDATION.md](docs/MAP_VALIDATION.md). Live coordinate placement, heading, dynamic doors, and route quality still use [`docs/WINDOWS_MANUAL_TEST.md`](docs/WINDOWS_MANUAL_TEST.md). Automated and local rendered tests do not substitute for comparison against the running game.

## Desktop packaging note

The final Windows NSIS compilation runs in GitHub Actions. The workflow installs the locked Electron/Electron Builder versions, runs the test suite, and requires the schema-v3 GitHub dataset. When both trusted PFX secrets are configured it signs and verifies the application and installer; otherwise it records an unsigned-build warning and still uploads the installer.

A release tag uses the same gates. It attaches a verified signed installer when credentials are configured, or a clearly identified unsigned installer while signing is deferred.

## PNUT layout correction in the 0.8.2 PR

The native UI now directly follows PNUT's compact encounter header, exact
Overview/Damage/Healing/Taken/Session tabs, flat meter tables, radial timer rows
and thin attack bar. All timer forms, countdown actions and swing configuration
are in the main Timers page. The native timer window fits its visible rows,
with a 36px minimum; it no longer retains a 420px configuration window.
The pinned PNUT MIT attribution is bundled and checked in the ASAR.

Taken grammar is backed by a read-only local-log pattern audit and synthetic
regressions for own incoming melee, direct spells, DoTs, unknown casters,
player/pet exclusion, rune capacity, mixed encounters and counts/rates. No raw
logs or player names are committed. Main editor tests cover editing, all overlap
modes, live draft retention, pause/resume/reset/dismiss, kill reminders, swing
preferences and visible error handling.

The read-only grammar rerun recognized 135,916/135,916 candidate incoming lines
across 11 local logs: 115,341 melee, 11,251 direct/unknown-caster non-melee and
9,324 DoT lines. This measures recognition of those grammar families, not an
independent gameplay damage total. Nine synthetic Taken regressions retain the
observed multiword-attacker and additional-verb forms. A native geometry check
also prevents Chromium table pseudo-elements from creating an empty first cell
and clipping attacker/ability names.
