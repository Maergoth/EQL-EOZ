# PNUT interaction patterns for Eye of Zomm

## Scope and source map

Requested October 21, 2026: add an application update flow comparable to PNUT,
then conceptualize an EQL-themed overlay with PNUT's compact controls while
retaining Eye of Zomm's custom tools. The application updater is implemented
in the 0.8.2 candidate. The overlay is a proposed design, not a shipped feature.
Elitist/Carebear controls and Revenge are outside this design.

Reference PNUT commit:
[`28bbf8d`](https://github.com/Maergoth/pnut-mnm/tree/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0).
These source locations are the context to retain when resuming:

| Question | Source |
| --- | --- |
| PNUT application update lifecycle | [`mnmparse/app/app_updates.py`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/app_updates.py), `tests/test_app_updates.py`, `tests/test_pending_updates.py` |
| Layout lock versus mouse passthrough | [`overlay.py:1010`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/overlay.py#L1010), [`overlay.py:1536`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/overlay.py#L1536), `tray.py:63–86` |
| Parse tabs, encounter choice, hover controls | `overlay.py:123–129`, `503–552`, `901–959`, `1519–1534`, `1847–1857` at the reference commit |
| Map header and independent panels | [`map_overlay.py:666`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/map_overlay.py#L666), `730–761`; `docked_panel.py:46–53`, `85–156` |
| EoZ native window and updater | [main.cjs](../desktop/main.cjs), [preload.cjs](../desktop/preload.cjs), [app-updater.cjs](../desktop/app-updater.cjs) |
| EoZ update presentation | [app-update-ui.js](../app/app-update-ui.js), [index.html](../app/index.html) Application updates card |
| EoZ session ownership and current capabilities | [app.js](../app/app.js) parser instance, log offset, `pollLog`; [parser.js](../app/parser.js) damage/heal/rune parsers |
| Branding and existing product contracts | [styles.css](../app/styles.css) root tokens; [UX_VISION.md](UX_VISION.md), [HANDOFF.md](HANDOFF.md), [MAP_VALIDATION.md](MAP_VALIDATION.md) |

PNUT is a Python/Qt portable application; EoZ is an Electron/NSIS application.
Reuse its interaction model, not its ZIP replacement implementation or Python UI.
The EoZ implementation adds no runtime package dependency.

## Application updates in 0.8.2

Application updates and **Sync with Wiki** have distinct settings, state and
actions. Startup checks release metadata without blocking first paint. A small
header badge opens Application updates when a newer release is available.

1. **Check for updates** discovers an eligible newer Windows x64 installer.
   The installed 0.x beta channel includes eligible GitHub prereleases; a stable
   1.x installation does not silently switch to prereleases. Checks never downgrade.
2. **Download version** shows progress and permits cancellation. Automatic
   startup download is a separate preference and defaults off.
3. **Later** keeps a verified staged installer available in Settings, including
   after relaunch. It never installs merely because the app is closing or starting.
4. **Install update…** requires a native confirmation, rechecks the staged
   executable, opens the normal NSIS installer and quits only after successful
   handoff. The user completes the normal installer and relaunches EoZ.

GitHub's stable `/releases/latest` endpoint does not cover EoZ's 0.x prereleases.
Use the release collection and require agreement between the release tag,
semantic version, repository, exact NSIS filename, bounded asset size and GitHub
SHA-256 digest. Metadata, redirects, downloads and timeouts are bounded. The
main process owns verification and staging under EoZ's user-data directory.
The renderer receives status and allowlisted commands, not an arbitrary path
or download URL executor. Pack sync continues independently.

Preserve the existing NSIS application identity and user-data path. This is a
normal app upgrade: preferences, log/folder choices, cached wiki data and game
files must remain intact. A legacy 0.8.1 installation needs the first updater
build installed normally; it cannot acquire new application code through wiki
data synchronization. Unsigned beta installers remain unsigned; hash verification
does not turn them into Authenticode-signed releases.

## Proposed overlay workspace

Use the existing EQL deep navy surfaces, gold `#d8b75c`/`#f0d77f`, blue accents,
and readable light text. Keep serif type for small titles, sans-serif for
controls and tabular numerals for parses. Adjust background opacity independently
of text so lowering the panel background does not fade the numbers.

| Surface | PNUT-style interaction | EoZ content retained |
| --- | --- | --- |
| Parse | Compact tabs; Live / Previous encounter / Session dropdown; hover/focus toolbar | Player damage, healing, encounter history and event feed; optional rune-grant capacity view |
| Zone & loot | Compact current-zone list; hover/focus detail; clear sort and class filters | Named/rare mobs, con colors, distance/readiness, My Class loot, observed rates and exact wiki links |
| Consider | Small contextual pop-under, optionally pinned | Current consider target, class-aware drops, item icons and tier-adjusted Itembox details |
| Map & route | Optional independent panel; First / Top / Map header menus | Current logged location, selected NPC, waypoint copy, validated route cues, cancel and honest marker-only fallback |
| Workspace controller | Show/hide panels; Edit layout / Lock layout; reset and presets | Access to the complete main app, settings, update status and recovery |

Initial presets should be **Intel** (zone/loot and considers), **Parse**
(parse and considers), and **Explore** (intel and optional map/route). Opening
an overlay must not enable map/routing preferences that the player left off.
The complete item browser and Map Explorer remain in the main app.

## Interaction states

| State | Drag/resize | Tabs, menus and tooltips | Recovery |
| --- | --- | --- | --- |
| Edit layout | Enabled; show handles and panel controls | Enabled | Lock layout action |
| Locked layout | Disabled; quiet chrome | Enabled | Hover, click or keyboard access to controls |
| Ignore mouse | Disabled; all mouse input passes through | Unavailable | Independent tray/main-window controls; tested optional global shortcut |

Do not conflate pin-to-top, layout lock and mouse passthrough. Some PNUT comments
do conflate these, but its actual lock implementation preserves interaction.
Full passthrough cannot depend on hovering the ignored panel to unlock it.
Electron's [`setIgnoreMouseEvents`](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options)
ignores mouse input; forwarded move events do not restore click handling.

Hover dropdowns must also open by click and keyboard focus. Keep controls open
while a popup is active, a text field is being edited or a drag is underway.
Escape closes a menu without clearing its selection. Every parse explicitly
identifies Live, a pinned encounter or Session; selecting historical data must
not continue labeling the display Live.

Use nonactivating presentation during play and an explicit edit mode for text
input. Test the behavior with the actual Windows window manager. A proposed
global recovery shortcut must check whether registration succeeded, disclose a
conflict and retain tray/main-window recovery. PNUT's discovered Qt shortcuts
are app-local, not evidence that a global shortcut already exists. See
[Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut).

## Data and performance boundaries

EoZ currently owns its parser and log cursor in the main renderer. Loading that
same app page into several windows would create competing independent session
state. First introduce one shared session owner for parser, log offset,
encounters, loot observations, data pack and route selection. Overlay renderers
consume snapshots and send narrowly allowed actions to that owner. Preserve
the current sandbox, context isolation, loopback boundary and diagnostics redaction.

Current log support proves outgoing player damage, player healing and **rune
capacity granted**. It does not prove damage absorbed, damage taken or a group
actor leaderboard. Do not present those as new capabilities merely by borrowing
PNUT's tabs. Start with player-only parses; add other metrics only with real
sanitized log evidence and parser fixtures.

Keep one heavy Map Explorer and one owner of route selection. A lightweight map
overlay can share location/route state; it must not create duplicate archive
decoders, meshes, WebGL contexts or Recast workers. Hidden views should stop
painting without stopping the session parser. All current route validation,
exact zone ownership, location freshness and cancellation guards remain required.
The overlay reads ordinary logs/local files; it never injects into the game.

## Implementation order and acceptance

1. **Updater:** mocked metadata/download/cancellation/persistence and install
   approval tests; real Electron preload/UI checks; packaged-source verification;
   controlled Windows NSIS upgrade test before claiming installed upgrade success.
2. **Shared session:** replay synthetic logs into one owner; main and overlays
   agree on totals, encounters, loot and location. Open/hide/reload/destroy panels
   without resetting or double-counting. Prove viewer messages retain their owner.
3. **Parse and intel panels:** deliver lock versus passthrough, hover/click/focus
   menus, encounter tabs, saved layout, screen clamping, controller/tray recovery
   and shortcut-conflict feedback. Test 100/125/150% OS scaling and monitor removal.
4. **Map integration:** preserve opt-in defaults, presentation, target, route,
   cancel and latest-zone/current-location behavior. Compare CPU/GPU/memory with
   panels visible and hidden before allowing extra 3D windows.
5. **Acceptance:** synthetic fixtures and desktop window tests are separate
   from installation and live-game observations. Keep the guarded route engine
   policy until its existing real-client gates pass.

The interactive concept illustrates this proposed workspace with synthetic
sample data. It is not evidence that native passthrough, docking or shared
session migration has shipped.
