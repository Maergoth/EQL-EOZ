# Window and map follow-up

## Scope and baseline

The reported screenshot and routing observations came from **0.8.1**. Compare
against shipped **0.8.3** before treating an older report as a new regression.
The owner's final window direction is a normal main application window, with
no Pin to top option; independent overlays retain lock and mouse passthrough.

## Execution map

| Request | Current evidence | Implementation and verification seam |
| --- | --- | --- |
| Remember main size/location | Overlay layouts persist; main window always starts at its default size | `desktop/main.cjs`, new `desktop/window-placement.cjs`; persist normal bounds/maximized state, clamp disconnected displays, serialize writes |
| Minimize to tray / Start minimized | Neither preference exists in 0.8.3 | Main-only authenticated `eyeOfZommWindow` settings IPC, `app/app.js`, Settings in `app/index.html`; use the existing overlay tray and preserve a taskbar fallback |
| Remove Pin to top | Main pin currently both hides custom chrome and changes OS stacking | Use the native main-window frame, remove pin API/UI and old CSS offsets; overlay stacking/lock stays independent |
| Map note clipping | Main fixed/minimum heights and embedded viewer minimums exceed short viewport height | `app/styles.css`, `app/zoneviewer/viewer.html`; rendered non-maximized layout/scale assertions |
| Local Map zoom | Native Map has zoom; embedded `.eqlzv-mini-map` has a fixed radius | Tracked viewer patch source and wrapper controls; regenerate with `scripts/assemble-zone-viewer.mjs`, test bounded zoom and reset |
| Overlay floor slicing | All floors/Near my Z dropdown does not offer an arbitrary floor | `app/map-overlay.js`; Z slider with adjustable tolerance, preserve unknown Z through every slice, retain selection across snapshots |
| Raid list priority | Intel currently renders Normal Zone first | `app/overlay.js`; render red Raid Zone section before Normal Zone while retaining source identity and complete drops |
| Settings links and What's new | No project link or interactive visual release tour | `app/whats-new.js`, `app/whats-new.css`, packaged `app/assets/whats-new/*.png`; manually opened keyboard-accessible tour, actual synthetic-data UI captures reused in README |
| Collision detours | 0.8.3 includes 20 validated paths/16 honest markers in a 36-request rendered matrix | `docs/ROUTE_REJECTION_AUDIT.md`, `docs/MAP_VALIDATION.md`; reuse private local-archive harness, classify failures before changing collision validation |

Routing source boundaries are documented in [HANDOFF.md](HANDOFF.md): the
established worker, independent established-route guard, collision crop,
Recast worker and final route validator must agree. Keep exact endpoints,
support/body-clearance checks and directed elevation policy. A failure to find
an alternate itinerary is not proof that every route through a zone is blocked.

## Completion gates

1. Compare old reports with the installed/source 0.8.3 baseline; retain only
   confirmed gaps and evidence-backed routing changes.
2. Exercise saved placement, monitor bounds, startup/minimize recovery and
   settings IPC; render the main Map and native Map at short window sizes.
3. Re-run local-archive detours and any changed routing regressions. Keep
   proprietary geometry, logs and screenshots private; commit synthetic cases.
4. Run source and actual Electron gates, fetch/validate the current production
   bootstrap, build/check the exact packaged runtime, then create a scoped PR.
5. Publish the reviewed release only after checks pass. Preserve the user
   profile, verify the installed version and existing shortcut targets.

Physical Windows DPI changes, a disconnected physical monitor and moving in
the live game remain distinct from synthetic display/layout and archive tests.

## Results

The initial focused window/layout checks passed. Actual decoded Mistmoore wall
detours passed in the current build; the routing modules did not change between
tagged 0.8.1 and 0.8.3, and no new engine change was justified. Full release gates
run in GitHub, following the owner's request to skip further local testing and
leave the installed app alone. `VALIDATION.md` separates those evidence sources.
This file is the durable continuation index for `codex/window-map-polish`.
