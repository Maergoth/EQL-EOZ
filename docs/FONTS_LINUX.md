# Font settings and Linux release

## 0.8.8 scope and continuation

Branch `codex/fonts-linux` starts from released 0.8.7 (`d174ee3`). The owner
requested font-family and font-size options, Linux support in the existing
repository, and publication after completion. Keep one codebase and version;
Windows and Linux artifacts belong to the same release. A permanent Linux
branch would duplicate fixes and is unnecessary.

Application tests, builds and screenshots run in GitHub CI. Do not run or
install the application locally. Do not change game files, wiki articles,
production databases or the established data-refresh schedule for this work.
The published dataset remains an independent, verified bootstrap input.

| Work | Critical source and contract |
| --- | --- |
| Font controls | Main Settings, `app/app.js`, `app/index.html`, `app/styles.css`; saved local preferences, immediate application, bounded size and reset. Fixed pixel typography must follow the selected size. |
| Overlay typography | `app/overlay.js`, `app/overlay.css`, `app/map-overlay.js`, `desktop/overlay-host.cjs`; share the global font choice/base size while preserving saved per-panel text multipliers. Keep triggers auto-sizing, sticky filters, map controls and tooltips readable. |
| Linux runtime | `desktop/main.cjs`, `desktop/linux-runtime.cjs`, `desktop/log-selection.cjs`; native filesystem paths, original filename spelling, selected Wine/Proton client directory and an explicit display-backend policy. |
| Application updater | `desktop/app-updater.cjs`, `app/app-update-ui.js`; preserve Windows verified silent NSIS behavior. Linux selects its own verified package and clearly describes the package handoff rather than promising a Windows-style restart/install. |
| Packaging | `package.json`, exact ASAR/image/bootstrap checks and GitHub workflows; build Windows x64 plus Linux x64 AppImage/deb, run platform gates, and publish through one release owner only after both builds pass. Preserve existing tag provenance. |
| Evidence | Source tests, Windows native interaction/font checks, Linux Xvfb runtime and packaged executable checks. Keep synthetic captures separate from real game/compositor acceptance. |

Font presets have one canonical JSON source. `scripts/build-appearance.mjs`
generates the browser script during the existing prestart/pretest/package build
step; desktop code reads that same JSON. Parity and exact ASAR checks prevent a
stale module. Native panels retain `connect-src 'none'`: font choices require
neither a network allowance nor downloaded fonts.

## Linux compatibility boundary

EoZ runs separately from the game and reads the ordinary client files the user
selects. On Linux, select the actual EverQuest Legends directory inside the
Wine/Proton prefix or mounted installation. EoZ does not install Wine, launch
the game or translate arbitrary Windows paths into Linux paths.

Use X11/XWayland for independently positioned overlays. Native Wayland can
restrict saved global positions, programmatic sizing/focus and topmost behavior;
see Electron's [BrowserWindow platform notices](https://www.electronjs.org/docs/latest/api/browser-window).
An explicit user backend choice must remain respected. CI on Xvfb establishes
an X11 baseline, not foreground-game composition or all Linux desktop behavior.

AppImage and deb are supported upstream build targets; see the pinned builder's
[Linux configuration](https://www.electron.build/v26/docs/linux/). This release
does not create a separate application data source or Linux-only feature fork.

## Release gates

1. Review font persistence, scaling, native transport and Linux-specific paths.
2. Pass source, native interaction and platform packaging checks in CI; repair
   actual failures without replacing meaningful assertions with source wording.
3. Inspect refreshed synthetic captures and document observed platform limits.
4. Merge only the exact passing PR head; retain a single publisher waiting for
   Windows and Linux artifacts and their verified production bootstrap.
5. Verify tag/commit, all uploaded package sizes/digests and release notes. Do
   not describe a packaged smoke check as an installed upgrade or live-game test.

## Observed evidence and ongoing maintenance

[VALIDATION.md](../VALIDATION.md) links the passing Windows installer and Linux
package/runtime jobs. Both exercise fonts and the shared session; Linux also
launches the actual packaged executable with its original ASAR and a synthetic
Proton directory. Native Wayland and real game compositing remain manual.

Keep one version and share one Releases link. The publisher generates direct
Windows installer, Linux AppImage and deb links from the same artifact-name
contract used by checksums. Future releases need no separate Linux branch,
manual package uploads, data refresh or release-note download-link editing.
The updater selects the matching platform/package format; Linux's verified
manual handoff remains distinct from Windows' silent restart/install action.
