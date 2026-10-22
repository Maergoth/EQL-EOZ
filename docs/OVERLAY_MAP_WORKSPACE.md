# Overlay map and Intel workspace

## 0.8.7 follow-up and continuation

Branch `codex/intel-triggers-session` starts from released 0.8.6 (`1790c93`).
The approved work is: rename the Timers workspace/overlay to Triggers while
retaining stored IDs; show rune capacity within Healing with its measured
meaning intact; add a manual New session boundary without rereading the log;
repair missing Hate loot from NPC-page `known_loot`; replace mob-hover action
reflow with a same-row overlay; show item stats from both name and icon; make
Raid Zone collapsible; and default Plane of Hate's native map slice to Z 120.

| Work | Critical context and source |
| --- | --- |
| Combat/session | `app/parser.js`, `app/app.js`, `app/overlay-session.js`, main Combat controls and trusted native session commands. Keep log cursor, replay guards, identity/location, trigger state and discovery intact when splitting. |
| Intel interaction | `app/overlay.js`, `app/overlay.css`, native synthetic fixture. No row-height changes on hover at any tier; preserve keyboard action access and heartbeat state. Tooltips consume bounded item metadata at the shared tier. |
| Main item hovers | `app/app.js` Item/NPC render paths, `itemHoverAttrs`/`itemIconHtml`, shared tooltip presenter and `app/styles.css`. Main Fine Steel Rapier data is valid; icons lacked hooks and live redraws replaced hover targets. Keep unchanged list DOM and rebind/redetect active hovers on necessary redraws. |
| Missing loot | `server/BuildEyeOfZommPack.php` mirrors Wiki `maintenance/BuildEyeOfZommPack.php`. Vicar's 11 NPC-page loot entries have no reverse item sources; Lord of Loathing lacks Diamond Rod/Wand of Conflagration. Reconcile supported NPC loot with canonical exported items and normal/raid scope, with no per-mob lists. |
| Map default | `app/map-overlay.js` owns initial/reset slice; `app/map-overlay-3d.js` forwards it to `zoneviewer/overlay-mode.js` global clipping. Apply Z 120 only to exact Hate identities, keep manual overrides and unknown-Z markers. |
| Operational source | Existing clean Wiki worktree `eoz-export-contract`, feature branch `codex/eoz-npc-loot-joins` from `staging`; review PHP fixtures, promote only that feature to production, verify installed producer hash, then rebuild/audit/publish through the existing host wrapper. |
| Unified refresh | `desktop/main.cjs` owns startup/hourly/manual manifest single-flight and timestamps; the renderer polls only local state. Wiki `ops/host-bin/eoz-pack-refresh.sh` and `refresh-staging.yml` use hourly eligibility plus 24-hour successful-completion freshness. Host scripts require explicit installation, cron changes preserve other jobs, and GitHub schedules require isolated promotion to default `main`. |

Execute application checks/build/captures in GitHub CI; do not run or install
the app locally. Record dataset/release evidence privately under the task's
existing `.local/validation` directory. The prior dataset is
`20261021T225644Z-29f86651a9b9`, with 124 zones, 8,679 NPCs and 11,270 items.
Owner authorization to publish completed fixes continues to apply.

The 0.8.7 dataset was audited and published as
`20261022T000652Z-ecd7d8648c90` (3,792,469-byte gzip,
SHA-256 `ab756d21c86dac9373ee1b098f767d9a3762818bb8fd2a8efa4c07aa38695061`).
Its NPC/item metadata and old source identities are preserved, with 23,151
known-loot source variants added. Nine existing case-variant article/stat
differences were reviewed against eight exact public revisions. The private
release ledger records that review, the validator memory failure/fix and host
installation evidence. Current release still requires final desktop CI/media,
the unified scheduler installation, exact-head merge and installer verification.

## Approved follow-up

The 0.8.6 repair responds to live 0.8.5 feedback: put the zone title and controls
on one row, make the whole title band a dependable hover target, retain a
separate unlocked drag grip, and fix the read-policy mismatch for required
archive support files. CI must exercise native mouse input over the title and
real configured-folder/file hydration, not replace that loading boundary.
The Intel follow-up also repairs template-shaped item drop sources in the
producer. Keep `server/BuildEyeOfZommPack.php` aligned with the wiki's active
`maintenance/BuildEyeOfZommPack.php`, promote only the reviewed producer change,
then run the existing filtered-dataset refresh before releasing the desktop.

The 0.8.5 follow-up keeps Map and Intel as real independent native windows.
Map controls collapse when the pointer/focus leaves the header; Reset replaces
Fit and Reload is removed. One button cycles the client line map, top-down 3D
and navigable first person **inside the overlay**. Monster labels use matching
pointer/click targets. Intel pins Item Level Slider and My Class above its
scrolling list; per-mob actions appear on name hover or keyboard focus. A mob's
Map action opens the native map in first person at that mob's position.

## Source and state map

| Boundary | Active source / contract |
| --- | --- |
| Native map controls and labels | `app/map-overlay.js`: collapsed hover/focus header, Reset/default follow and zoom, placed-name hit rectangles, accessible marker buttons, view cycle |
| Lazy overlay 3D | `app/map-overlay-3d.js`, `app/zoneviewer/viewer.html?overlay=1`: reuse current decoder/viewer/first-person navigation; release child on line-map mode or hide; cancel stale zone/root loads |
| Native host and permissions | `desktop/overlay-host.cjs`, Map-only document CSP: fixed session commands, separate Map session with read-only viewer/game-file request allowlist, no log/settings/installer capabilities |
| Intel controls and scrolling | `app/overlay.js`, `app/overlay.css`: anchored tier 0..10 and My Class, scrolling `#intel-body`, hover/focus mob actions, no global Map shortcut |
| Shared owner | `app/app.js`: item tier and class remain one saved preference; resolve current NPC identity/normal/raid source before map focus; publish `intel.itemTier` and transient `map.focus` |
| Focus contract | `{sequence,id,name,zone,loc:[worldX,worldY,optionalZ],mode:'first'}`; camera-only preview, never a synthetic logged player position or route origin |
| Release gates | Source tests and actual Windows Electron gates in GitHub; exact packaged module/image/bootstrap checks; current production catalog |

3D is an explicit on-demand extension of the former lightweight-only Map
design. It may decode one additional selected zone while active; it does not
create another log parser/session or expose game-process access. The main map
retains the authoritative route owner. Shared validated route points may be
drawn, while an unvalidated camera target remains a marker.

Unknown-Z wiki markers stay unknown in snapshots. A first-person preview may
choose a nearby decoded floor for the camera; it cannot claim a known NPC
height or overwrite the player's last logged position. Known-Z markers and
geometry use the selected slice tolerance; unknown-Z labels remain visible.

## Validation and continuation

The owner requested no further local test/build/install runs and authorized
publishing after completion. Author regression coverage, use GitHub CI for
execution, and leave their installed build alone. Prior screenshots use only
synthetic fixtures; refresh affected product captures without publishing game
files, logs, local paths or private content. Physical game focus, pointer-lock
comfort, monitor/DPI transitions and route quality remain manual evidence.

The 0.8.5 release merged as `4787890`. The 0.8.6 repair starts there on
`codex/map-header-fetch-fix`. This file is the continuation index if task
context is compacted.

The same 0.8.6 release also updates `desktop/app-updater.cjs`, its main-process
wiring and `app/app-update-ui.js`: the explicit restart action verifies the
staged installer and uses the pinned NSIS silent-upgrade/automatic-run contract.
The application updater remains separate from wiki-pack refresh. Windows
security prompts and a complete installed-upgrade acceptance remain distinct
from CI launch mocks; do not install locally against the owner's preference.
