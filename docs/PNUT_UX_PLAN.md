# PNUT interaction patterns for Eye of Zomm

## Scope and source map

Requested October 21, 2026: add an application update flow comparable to PNUT,
then implement actual modular native overlays and timers while retaining
Eye of Zomm's custom tools. The updater, four native windows and timer engine
are implemented in the 0.8.2 PR candidate, which is not yet merged or released.
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

## Native overlay workspace in 0.8.2

Four transparent, frameless, always-on-top Electron BrowserWindows live outside
the main application window. Choose **Overlays** in the header or use
**Settings → Native overlays**. Fresh installs start with all panels hidden.
Each window saves its visibility, bounds, opacity, font scale, layout lock and
mouse passthrough separately in EoZ's profile. EQL navy/gold surfaces, readable
numbers and hover/click/focus menus apply throughout.

| Native window | Interactions and retained content |
| --- | --- |
| Parse | Damage, Healing, Rune capacity and Feed tabs; Live, Previous, Session and saved encounters; complete ability aggregates with a bounded recent feed |
| Zone & loot | Named/rare NPCs, con colors, distance, class filter, tier-scaled drops, wiki links, waypoint copying and opt-in routing |
| Consider | Current considered target, con, class filter and known drops; opens full item/NPC views |
| Timers | Manual/repeating countdowns, reusable literal log triggers and kill-triggered reminders, one-time reminder from the latest kill, pause/resume/reset/dismiss and observed swing bar |

The main app retains the complete item browser and the single heavy Map
Explorer. A panel's Map Explorer or Route action opens it explicitly. Opening
panels never enables map/routing preferences that the player left off. This
slice adds no duplicate 3D window, archive decoder, meshes or route worker.
Native docking and layout presets are not implemented.

### Interaction and recovery

| State | Move/resize | Tabs, menus, keyboard | Recovery |
| --- | --- | --- | --- |
| Layout unlocked | Header and window edges | Enabled | Lock layout |
| Layout locked | Disabled | Enabled | Panel menu, main controller or tray |
| Ignore mouse | All input passes through | Unavailable | Tray, main controller or registered Ctrl+Shift+O |

Lock and passthrough are independent. Windows use `showInactive`; locked
interactive panels remain focusable. Opacity changes only the background.
Shortcut registration failure is disclosed. If neither tray nor shortcut works,
passthrough is disabled and closing the main app cannot strand the session.
Monitor changes clamp bounds to a current screen. Reset positions also restores
mouse input and unlocks layouts.

Closing the main app while recoverable panels are visible hides it and keeps
its one parser running. **Quit Eye of Zomm** in the tray exits all windows. With
no visible panel, closing exits normally. A stale/crashed owner is shown as
unavailable and session actions are disabled. Explicit Open main recovers a
crashed renderer. Parse history is in memory; saved timer deadlines and panel
preferences survive restart.

### Shared session and boundaries

`app/app.js` remains the sole parser, log cursor, pack and route owner.
`app/overlay-session.js` owns one timer engine, batches local persistence and
publishes once per second. Panels interpolate bars without scheduling timer
state or reading logs. `desktop/overlay-host.cjs` brokers bounded snapshots and
allowlisted commands through authenticated root frames and separate sandboxed
preloads. Panels have no installer, filesystem or main-window preload API.

Only appended lines with valid original timestamps within ten seconds can start
log-driven timers or swings. Initial tails, truncation replay, stale lines and
missing timestamps still populate parse history without starting timers. Replay
guards persist locally. Historical reads align timer zone visibility. Rules and
precision limits are documented in [TIMERS.md](TIMERS.md).

Snapshots omit raw lines, paths and the full pack. The latest 20 encounters have
complete aggregates before raw feeds are bounded to 120 events each. Session
aggregates cover every retained encounter; the recent session feed has 60 events.
Intel previews up to 50 NPCs and five drops each; considers show 16 drops, with
full drop counts. Item icons share a 240 KiB budget. Host snapshots are ephemeral
and stay in local app processes. The metrics remain player outgoing damage,
healing and rune **capacity granted**, not absorption or a group leaderboard.
No game hook, process inspection, synthetic input, OCR or game-file write is
added. Revenge and Elitist/Carebear controls remain excluded.

## Source map and continuation plan

| Area | Implementation and checks |
| --- | --- |
| Native lifecycle, trust, layout and rescue | `desktop/overlay-host.cjs`, `desktop/overlay-preload.cjs`, `desktop/main.cjs`; `tests/native-overlays.mjs` |
| Sole session, bounded summaries, timer persistence | `app/overlay-session.js`, `app/app.js`; `tests/overlay-session.mjs`, freshness integration in `tests/map-sync-integration.mjs` |
| Native renderers and main controls | `app/overlay.html`, `app/overlay.css`, `app/overlay.js`, `app/overlay-controller.js`; `tests/overlay-ui.mjs` |
| Timer rules and log grammar | `app/timer-engine.js`, `app/parser.js`; `tests/timer-engine.mjs`, `docs/TIMERS.md`; pinned PNUT `swing.py`, `timer_panel.py`, `triggers_runtime.py` |
| Actual Windows runtime | `scripts/test-native-overlays.mjs`; isolated profile and synthetic log, never player files |
| Installer source parity | `scripts/packaged-runtime-sources.mjs`, `scripts/check-packaged-artifact.mjs` |

Before completing the PR: run the full suite, Electron worker and native-window
smokes, production bootstrap/catalog checks, NSIS build and exact-source artifact
gate. These establish synthetic-input behavior. Complete [Windows acceptance](WINDOWS_MANUAL_TEST.md)
separately for physical click-through over the game, 100/125/150% OS scaling,
monitor removal, sleep and live log grammar. Building an installer does not prove
an installed upgrade. Keep the guarded routing-engine policy unchanged.
