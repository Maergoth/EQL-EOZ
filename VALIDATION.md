# Validation report — v0.9.4

## 0.9.4 compact Character inventory

The scoped source/model/view checks and isolated native walkthrough passed.
The walkthrough exercises canonical names, one displayed tier, ambiguous match
selection with evidence preservation, known-only assignment, loose/equipped
physical identity, metadata and AA persistence, dynamic estimates and an actual
legacy unknown assignment excluded from totals. Compact 1024px and 20px-font
layout checks pass. Two actual synthetic screenshots were visually reviewed and
archived under 0.9.4; historical images remain unchanged.

Independent review found a mixed AC/ATK fallback issue: each stat family now
suppresses its generic value only when its own detailed components are present.
Unit regressions cover both partial-baseline directions. The compact resource
summary also selects one HP/Mana/Endurance row when maximum values are known.

The full `npm test` suite and dependency audit passed locally. The full-main
workspace fixture also passed against 0.9.4: offline PNG import, Character
matching/copies and persistence, sharing, reviewed loopback wiki plans and
partial retry. Additional full-app 13/20px screenshots were visually inspected;
fixture framing was corrected without changing production behavior.

Initial Linux CI exposed an older Modern OCR fixture that assigned bare OCR
cards without catalog identity. Its name/stat pixel assertions had passed.
The fixture now first confirms that rejection, explicitly selects independent
golden catalog records and checks observed text/stats/evidence/progress remain
unchanged before assigning. Both source and assembled-runtime Modern pixel
checks passed locally after the fixture correction; production code is unchanged.

Final changed-head Windows/Linux native/package CI and public-download
verification are required before publication is reported complete.
Exact results belong to the release PR and private publication ledger. Fixtures
do not establish all game skins, transient live tooltip throughput, production
wiki authentication/writes or native Wayland. The installed player profile is
untouched; no user/game pixels or new game artwork enter the repository.


## 0.9.3 live item recovery

The installed 0.9.2 journal contains actual item observations rejected after
Re-equip ended, while the walkthrough still displayed running capture. Native
full-resolution game pixels also reproduce a missed tooltip anchor. Reading
the same frame's complete tooltip region recovers its item and supported stats
in about 1.6 seconds versus 6.5 seconds for the failed full-scene read. This
single-frame comparison does not establish transient capture throughput.

A deterministic transition test also reproduces live-video reads producing one
frame's fingerprint with the next frame's PNG. The source now freezes once for
detector geometry, fingerprinting and encoding, following PNUT's coherent-frame
pattern. The regression and independent cleanup/throttle review pass. Native
fixtures match original PNG hashes, capture times and context within real tooltip
exposures, including multiple valid compositor variants; late heartbeats cannot
substitute for queued items.

A Windows CI trace also retained all three correct frozen tooltip images while
renderer PNG callbacks took 6.7 and 5.2 seconds and blocked admission. Encoding
now uses one same-origin browser worker; it receives only immutable pixels and
an opaque job ID. The source keeps original capture metadata and validates
context again before submission. Exact-head worker, native and package gates
are required; the earlier main-thread encoder passes do not certify that change.

Source changes, actual-pixel measurements and acceptance are tracked in
[LIVE_CAPTURE_RECOVERY.md](docs/LIVE_CAPTURE_RECOVERY.md). Private screenshots,
OCR text and profile projections are excluded from Git. Exact-head CI,
packaging and public release verification remain pending until recorded in
the release PR/private publication ledger. Historical results below retain
their original scope.

## 0.9.1 guided Character and overlay layout

The owner authorizes publishing the completed walkthrough, resizing, touching
docks and **Unlocked → Locked → Hidden** cycle. The active source map and gates
are in [CHARACTER_WALKTHROUGH.md](docs/CHARACTER_WALKTHROUGH.md). Every platform
must pass on the final changed head; exact CI/public-download results belong to
the release PR and private publication ledger. Earlier records below describe
their stated historical heads.

Local synthetic native checks exercise the complete guided flow at 1024px and
13/20px fonts, stage-scoped base reads, separate AC/ATK components, raw Haste
correction, durable manual edits and removal, ANY-slot review, source replacement,
and copy/save completion versus cancellation. Source capture tests retain the
Character session across transient failures and allow explicit lost-source
recovery. Actual Windows native checks resize all 32 panel edge/corner targets,
verify client hit tests, touching shared dimensions, resize following and cycle.
The full source suite, exact-ASAR contracts and physical 238-file OCR manifest
also pass locally. These fixtures do not establish live-client totals, all UI
skins, foreground-game compositing, production wiki writes or native Wayland.

## 0.9.0 feature observations and release scope

The owner authorizes completing PR11 and publishing 0.9.0. Final changed-head
CI/package checks and public asset verification are pending in
[the release plan](docs/RELEASE_090.md); the earlier runs below establish their
recorded baseline only.

[CI 39874322031](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874322031)
passed the source, Windows native and Linux native/package jobs for feature head
`5b967c5` through PR merge `61fbaa8` against main `6937d35`.
[Windows installer 39874315883](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874315883)
passed on that feature head. The Linux job used Ubuntu 22.04, Xvfb and Openbox;
its shipped-executable smoke explicitly recorded `installed:false` and
`waylandTested:false`. Both platforms passed exact-ASAR and packaged local OCR
checks. This does not establish an installed-player upgrade or native Wayland.

The combined source suite passed after merging 0.8.9 into the feature branch.
Native font/cache/map-loot regressions also passed against the combined app.
The [shared plan](docs/CAPTURE_CONTRIBUTIONS.md) links the implementation ledgers
for capture, wiki contribution and Character components. Actual isolated native
fixtures exercised local OCR and capture ownership, offline PNG import, current
blueprint review, hardened login cookies, guarded multi-page partial retry across
renderer restart, editable gear/augments, separate base/equipped values and PNG
clipboard/save. Loopback wiki writes used only synthetic state.

Final calibration of the supplied small private examine image yields observed
`Boots of the Long Road +10`, AC14, HP15, tier10 and size. Bounded item-name/stat
row follow-up reads preserve the original name alternative and raw text. Weight
loses its decimal and remains unknown; full character totals remain unverified.
Four existing combat/world screenshots yielded zero item/character proposals.
The optional current-frame calibration dialog has mouse/keyboard, saved-owner,
resize/reset and preview-cleanup checks, with actual native crop OCR exercised.
The history includes 29 versions/29 images and six current-version captures.
Details are in the release plan. This does not certify arbitrary
game skins/resolutions. Production login/2FA/CAPTCHA, live wiki contributions,
Linux portal/Wayland capture and installed upgrades remain manual acceptance.

An independent Character audit reproduced real epoch timestamps being rejected
by the stat-value bound. The correction retains capture/stat times and stable-
instance removal cutoffs across reload. Real-2026 replay/removal regressions,
share-host checks, the main/preload workspace fixture and deterministic canvas
exports passed locally after that correction. The inspected exports remain
1800 × 4032 / 366,581 bytes and 1800 × 4224 / 578,154 bytes. Linux CI Character
editor/share captures were also inspected. See the
[component audit](docs/design/CHARACTER_CAPTURE.md#090-platform-and-character-acceptance-audit)
for exact scope. Final-head remote checks must include this and later fixes.

## 0.8.9 pre-release observations

The full source suite passed on Windows before the release PR. Isolated native
fixtures verified 193 installed font families, selection of Calibri outside the
presets, main/four-overlay/viewer propagation, full process persistence and reset.
Unicode manual fallback and CSS quoting were checked without font downloads.
The font policy retains main-viewer pointer lock/fullscreen while denying its
font enumeration and unrelated device permissions.

A real Chromium cache regression reproduced missing Fonts across old process
restarts, then verified one-time eviction and current `no-store` responses. Live
Map tests selected eight normal drops and one same-name raid drop through the
real viewer iframe, checked matching tier tooltips and explicit actions,
rejected a sibling iframe, and kept the eighth drop reachable at 1024 px / 20 px
text. Main and Intel changed-value colors were inspected.

Swing engine/UI/native fixtures verify off by default and explicit opt-in.
Countdown tests cover five-second installation, cancellation, Later-to-download,
pending IPC, restored packages, installer errors and Linux's manual handoff.
History checks cover 28 releases and 23 version-owned screenshots, unread skipped
versions, reviewed image hashes and exact packaged bytes. Captures use synthetic
records without player logs, game archives or account data.

Windows/Linux workflows repeat source, native and packaging gates, including
installed-font access in the verified ASAR. Record CI outcomes and published
asset digests in the release PR after completion. These observations are not
foreground-game, physical-DPI, native-Wayland or installed-upgrade certification.

## 0.8.8 font controls and Linux

The owner requested font-family/base-size options and a Linux release from the
same repository, then authorized publication after completion. Source ownership
and required platform checks are recorded in [FONTS_LINUX.md](docs/FONTS_LINUX.md).
The candidate keeps Windows and Linux on one version and shared verified wiki
bootstrap. Tests/builds/captures run in GitHub CI; the owner's local application
is not run or installed for this work.

The [Windows package build](https://github.com/Maergoth/EQL-EOZ/actions/runs/39862378605)
and [Linux package job](https://github.com/Maergoth/EQL-EOZ/actions/runs/39862385659/job/120116045766)
passed on candidate `74d9cbd`. Both ran the full source suite, catalog relevance,
actual Electron native-window/session checks, map sizing, software WebGL camera
and file-isolation checks, and appearance controls. Font checks exercised 10/20
px with 0.75/1.75 panel multipliers, bounded menus and controls at a non-maximized
1024px main window, Triggers auto-height, canvas labels, active timer identity/
deadline retention, renderer reload, process restart and Reset fonts. Review
also retained native panels' `connect-src 'none'` with deterministically generated
font presets and matched Linux names to the pinned builder's real expansion.

Linux produced AppImage/deb artifacts and launched the original packaged binary
with its original ASAR, sandbox intact and isolated XDG/profile directories.
The real packaged app selected a synthetic Proton path, read appended log damage,
zone and location, exposed four native panels and opened its real tour dialog.
The appearance harness additionally ran against exact packaged ASAR sources.
Windows produced the NSIS installer with its existing identity and updater flow.
Exact source/image/bootstrap byte checks passed on both platforms. Both included
manifest `20261022T000652Z-ecd7d8648c90`, pack `wiki-20261022T000157Z`, with 124 zones,
8,679 NPCs and 11,270 items; the production refresh policy is unchanged.

The [release PR](https://github.com/Maergoth/EQL-EOZ/pull/9) records final-head
checks after the capture/download-note follow-up. One publisher waits for both
platforms, supplies one verified bootstrap to both, validates package checksums,
and publishes the complete asset set together. It generates direct Windows and
Linux download links and refuses to replace published artifacts on reruns.

Ubuntu 22.04/Xvfb/Openbox establishes an X11 baseline. Native Wayland, foreground
game/compositor behavior, OS clipboard capture and complete installed upgrades
remain separate acceptance. The Linux binary smoke is not an AppImage mount,
deb installation, distribution-wide certification or installed upgrade test.

## 0.8.7 Triggers, sessions and complete Intel

The Timers workspace/native panel is now labeled Triggers while keeping its
existing view IDs, storage keys, definitions and deadlines. Rune grants appear
under Healing as capacity granted, separately from actual healing/HPS and
measured incoming damage. A manual New session clears parse/encounter/loot
totals at the consumed log cursor while preserving partial lines, profile,
location, Intel identity, trigger/discovery owners and their replay guards.

The reported missing Hate drops originate in wiki NPC `known_loot` entries
without matching item `dropsfrom` entries. The matching producer now reconciles
both directions against canonical exported item pages, with exact instance
scope and public NPC revision/field provenance. It does not generate item stats
or rewrite articles. Counter fixtures ensure existing joins are not counted as
new and repeated merges add nothing; internal-case title collisions remain
distinct. The catalog gate requires the refreshed capability plus Vicar's 11
documented items and Lord of Loathing's Diamond Rod/Wand of Conflagration.
My Class still enforces class eligibility but retains equippable click/worn/
focus-effect gear that lacks numeric stats.

Intel mob actions overlay the existing name row, with keyboard access and no
hover reflow. Name/icon tooltips use bounded local item metadata and the shared
tier/base values; the viewport-constrained popup supports scrolling. Raid and
normal sections have explicit disclosure state that survives heartbeats, tier
and search changes; a fresh named focus can reopen its matching section.
Plane of Hate's native map starts/resets at Z 120, preserving manual overrides
and unknown-Z markers. An unknown-height inspection uses the selected slice
for its estimated camera ground ray; known wiki Z remains authoritative.

Authored checks cover the actual owner split/cursor/backfill functions, parser
totals, trigger-state preservation, trusted native command, enriched snapshot
bounds, rendered row geometry at tier 7 and multiple font scales/widths,
name/icon/stat-popup interaction, disclosure/focus transitions, healing rune
placement and logged Hate/default/manual-slice behavior. Execution and captures
run in GitHub CI. No local app tests/build/install are used. Live game focus,
actual Hate ceiling geometry and a complete installed update remain separate
manual acceptance; the Z 120 presentation default does not change collision data.

The follow-up Fine Steel Rapier report concerns the main app. Its published
record has an exact name/wikiTitle and numeric stats. Item-browser pictures
lacked hover hooks, while unconditional Item/NPC list reconstruction could
detach a hovered target during live updates. Both name/icon surfaces now share
the local tooltip path; unchanged presentation keeps its DOM, required redraws
rebind an active item, and real pointer motion can recover a dismissed target.
Native CI exercises trusted main-window name/icon hover, keyboard focus,
preserved Wiki links and active tooltip/DOM retention through a logged rune.

The refreshed public dataset is `20261022T000652Z-ecd7d8648c90`, with 124 zones,
8,679 NPC records and 11,270 item pages. All NPC identities/locations and
source-independent item metadata remain unchanged, and all 21,440 prior source
identities remain. Reconciliation adds 23,151 source variants to 1,997 items;
the actual differences match producer counters. Vicar has 11 normal-source
items; Lord of Loathing has five items in each normal/raid source variant.
There are no raw markup names, exact duplicates or unjoined known-loot sources.
The raw audit flagged nine evidence/stat-article differences. All eight exact
public revisions were independently reviewed: four existing internal-case NPC
article pairs explain those nine entries. Loot provenance identifies the actual
article, independently of the case-folded stat winner. The private review keeps
these exact exceptions; unrelated revision/title mismatches are not waived.

Wiki producer PRs #47/#48 passed their source checks and separate deployments;
the installed producer SHA-256 matched `1f74b8209cde131049d756c177845e062f6a43be7925d5be8832be43c0cc7cf3`.
The first export exposed a separate 128 MB CLI validator limit. Wiki PR #49
passed [CI 39696823387](https://github.com/Maergoth/EQLWiki/actions/runs/39696823387),
including 71 producer, 111 raid/presence and synthetic actual-wrapper checks.
Its reviewed 768 MB/stdin validator was explicitly installed with a private backup
and exact hash verification. The second complete candidate passed that actual
validator and the reviewed audit before publication through the existing syncer.
GitHub API/raw manifest delivery agreed; the public 3,792,469-byte gzip matched
SHA-256 `ab756d21c86dac9373ee1b098f767d9a3762818bb8fd2a8efa4c07aa38695061`.

The unified refresh follow-up uses hourly host eligibility checks with a 24-hour
successful-completion guard for expensive exports/staging database copies.
The app checks the published manifest at startup, hourly while open and on
manual sync. One in-flight operation owns those requests; completion schedules
the next attempt even after failure. Settings distinguishes successful checks,
dataset generation and downloads. Authored CI regressions cover overlap, offline
last-good retention, completion-relative scheduling, shutdown and status display.
Private staging database replacement retains its separate recovery/access rules;
it is not a public dataset or a database backup published to clients.

[GitHub CI 39698239325](https://github.com/Maergoth/EQL-EOZ/actions/runs/39698239325)
passed full Linux/Windows source, production catalog and native Electron gates
on `1b937de`. The Intel geometry check uses a focused native document and trusted
Tab/Shift+Tab, retaining strict same-row/no-reflow/full-button bounds. An inactive
window probe confirms that changing `activeElement` alone emitted no focus events.
Main hover checks use trusted pointer delivery with frame/departure settlement,
then actual logged considers change the NPC card from level 30 to 35/36. Duplicate
drop removal hides the old hover; keyboard focus restores the exact source row.
Shared parse splits preserve trigger deadlines, and Hate slicing/unknown-height
camera plumbing pass the existing native gates. Updated bundled/README captures
come from this run and were visually reviewed; all data and geometry are synthetic.

Unified refresh Wiki PRs #50/#51 passed
[staging CI 39697959120](https://github.com/Maergoth/EQLWiki/actions/runs/39697959120)
and [isolated production CI 39698086772](https://github.com/Maergoth/EQLWiki/actions/runs/39698086772).
Their separate staging and
[production deployment 39698214062](https://github.com/Maergoth/EQLWiki/actions/runs/39698214062)
passed. The installed producer remained byte-identical. The private refresh wrapper
was explicitly backed up and installed, with SHA-256
`8afc2c480d9b95982bbf4b6658cd6da9d69760707a1930f0d9f2bcaca4a4d171`.
Its completion marker was seeded from the verified dataset publication, and an
actual `--if-stale` invocation skipped without rebuilding. Only the existing EoZ
cron entry changed; all other cron entries matched their prior bytes. The default
branch staging workflow is active with its hourly schedule; its first scheduled
execution has not been observed as part of these checks. Explicit manual staging
refresh still means a full replacement and retains its existing recovery rules.

## 0.8.6 map interaction and Intel source repair

The live 0.8.5 report exposed gaps in the earlier synthetic acceptance checks:
keyboard focus revealed the header, but did not prove mouse hover over its
Windows drag region; substituted folder/archive setup did not exercise the
loader's complete support-file requests. The new header uses a full-width
pointer surface with a separate drag grip, and the loading regression must use
the real configured directory and file hydration code.

Source inspection confirms `filesForZone` includes `mp3index.txt` for S3D and
EQG, and reads EQG asset-list text. The 0.8.5 Map policy rejected those paths.
The selected local installation contains `mp3index.txt`; no game file was
changed or published. Execution remains in GitHub CI per owner preference,
with physical game input and complete proprietary-zone acceptance separate.

The Intel screenshot also exposed raw `Loc` and `VeliousGray` templates in item
drop sources, which Intel projects into mob rows. The reported 0.8.5 pack
contained 145 template-shaped drop sources (64 location notes and 68 styled
labels among them), and 173 sources with raw template/link markup in total,
while its actual NPC records have no template-shaped names.
The producer must interpret supported style/link syntax, exclude annotation
templates and resolve styled zone headings before associating drops. The live
producer and filtered dataset require their separate reviewed deployment and
refresh; changing the desktop alone does not repair existing cached records.

[GitHub CI 39687241470](https://github.com/Maergoth/EQL-EOZ/actions/runs/39687241470)
passed source and Windows native checks on `aca75f6`. The Map test uses trusted
Electron pointer input over the title at 260/460px in both lock states, checks
same-row geometry and Follow clicks/exit collapse, then checks real Tab focus.
The loader test restores the actual configured folder, hydrates S3D/EQG support
files over the restricted bridge and delivers native Files to the shipped parser
Worker. Empty synthetic archives deliberately produce no geometry; camera/WebGL
assertions then use synthetic geometry. No proprietary archive render is claimed.
Current tour/README images were collected by that run and visually reviewed.

The matching producer passed both PHP source harnesses in wiki PR #43 and the
isolated production promotion #44. Production deployment
[39687256914](https://github.com/Maergoth/EQLWiki/actions/runs/39687256914)
passed; the installed producer hash matched the reviewed source. The structured
follow-up in #45/#46 also passed its PHP checks and isolated staging/production
deployments; the final installed SHA-256 was
`f2335fffc7704a3546666c0fd99462bde7920796fcbcf04ec8cfc307c1dce9bb`.

The complete source audit found one valid structured `ItemWhereRow` association
among the remaining malformed entries. Narrow positional parsing preserves its
Zone/NPC fields, including balanced multiline/piped/numeric arguments and explicit
instance anchors. Area/Loc links, commented rows and unrelated transclusions do
not establish sources; a row cannot change the surrounding list's zone. Wiki
PRs #45/#46 carry the isolated follow-up and matching PHP regression fixtures.
The production-catalog gate also rejects raw template/link markup in NPC and
item-source names. An older cached production pack must fail this gate before
an installer can publish; a successful source-only fixture is insufficient.

The existing low-priority host refresh rebuilt the full filtered pack. A
before/after read-only audit found zero raw template/link NPC or source names
(previously 173 malformed sources), preserved all NPC identities/locations and
confirmed the Book of Souls, Slowstone Amber and Tiny Brass Shuriken associations.
Exact same-zone/instance NPC source joins increased from 18,350 to 18,915. Two
existing normalized NPC alias collisions are unchanged. The item metadata flags
were reviewed against 90 public revisions: all 45 old/new item pairs reproduced
exactly through the installed producer. Newer wiki edits and two existing
redirect consolidations explain every difference; no article edits were made.

The reviewed [public dataset manifest](https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json)
is `20261021T225644Z-29f86651a9b9`: 124 zones, 8,679 NPC records and 11,270 items.
GitHub API and raw delivery agreed; the published 3,155,997-byte gzip matched
SHA-256 `5aea0f63f5942f29ffd37f27ab060e53734392442884f32579a5187568e74109`.
Installer bootstrap/catalog and exact packaged-content checks remain required
on the final release commit.

## 0.8.6 explicit silent restart/update

The explicit **Restart to install update** action replaces the second native
confirmation and normal setup wizard. Source inspection of the pinned
electron-builder 26.15.3 NSIS templates establishes `/S`, `--updated` and
`--force-run`, with the unquoted `/D` argument last. The launcher uses no shell,
preserves the running installation directory, and matches its canonical path
to the existing application's fixed HKCU/HKLM registration before choosing scope.
An ambiguous registration, or a machine upgrade that would remove a separate
user copy, keeps EoZ running with manual recovery guidance.

Regression coverage checks registry identity against the pinned builder, scope
selection, custom paths with spaces, fixed launch arguments, accepted-spawn
ordering, failed-launch retry, re-verification and duplicate click suppression.
The main-frame-only IPC boundary remains intact. A disposable Windows CI
fixture roundtrips a real non-ASCII HKCU install path through the fixed UTF-8
registry reader and canonical resolver; it refuses existing values and cleans
up its own value/key. Ordinary local runs skip that fixture. Other coverage
uses launch/registry mocks and Electron UI/IPC checks, not an executed installation.
OS security/elevation prompts, cancellation after process handoff and a complete
installed silent upgrade remain separate Windows acceptance. The owner's local
build and profile have not been upgraded or used for these checks.

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

[GitHub CI run 39658890201](https://github.com/Maergoth/EQL-EOZ/actions/runs/39658890201)
passed on `f5df94e`: Linux/Windows source suites, production bootstrap/catalog,
desktop worker/CSP, window lifecycle, map sizing, native Map WebGL/cameras/file
isolation, native overlay session/UI and inline discovery checks. Its real
Electron captures were visually inspected and copied into the README and tour.
The name-target check observes actual canvas text and dispatches renderer
pointer events because its native windows stay hidden; it does not establish
physical OS input or foreground-game compositing. The Intel check covers
name-only action activation, pointer travel, keyboard focus and anchored
filters while the list scrolls. Final packaged contents remain a release gate.

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
