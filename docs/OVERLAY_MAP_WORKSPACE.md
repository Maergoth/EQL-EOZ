# Overlay map and Intel workspace

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
