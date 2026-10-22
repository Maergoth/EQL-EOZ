# Frontend cache across application upgrades

Released 0.8.8 served unversioned local HTML, JavaScript and CSS with
`Cache-Control: public, max-age=3600` in a packaged app. An executable/ASAR update
could therefore serve a fresh wrapper while Chromium reused the previous
version's disk-cached wrapper and scripts at the same loopback origin. This can
hide newly installed Settings controls after an ordinary close/reopen.

The current server sends `no-store` for application static files as well as
private APIs/data. During bootstrap, `frontendCacheVersion` in the local app
configuration is compared with `APP_VERSION`. A changed/missing marker clears
the default Electron session's HTTP cache before the main window loads and
persists the marker only after that clear completes. Ordinary same-version
restarts retain the marker. This does not clear cookies, localStorage, saved
preferences, data packs or game files.

`scripts/test-main-cache.mjs` exercises a real Chromium disk cache and the actual
current main process at one loopback origin across process restarts. It uses
only disposable profile/config/game fixtures and an alternate port, leaving an
existing EoZ instance and its profile alone. The previous-version wrapper/script
are explicitly synthetic; the cache behavior is browser behavior rather than a
mocked source-string assertion.

```powershell
node scripts/test-main-cache.mjs
node scripts/test-main-cache.mjs --installed-asar "$env:LOCALAPPDATA\Programs\EQLWiki - Eye of Zomm\resources\app.asar"
```

The optional affected 0.8.8 ASAR is read only, using its actual packaged cache
policy and fresh HTML to establish the bug. It is never launched, extracted over
the app or changed. The default form uses the current wrapper and an explicit
old-policy fixture so CI does not depend on an installed Windows app.

Both commands passed locally on 2026-10-22. The old policy preserved the previous
HTML and JavaScript after a complete process restart even though a direct HTTP
read returned fresh Fonts markup. The real updated `desktop/main.cjs` then
cleared once, loaded the new page and exposed Font family, Text size and Reset
fonts within the Settings scroll root. `/`, `/app.js`, `/styles.css` and
`/appearance.js` all returned `no-store`. A further actual-main restart performed
zero clears, retained the version marker and kept all three controls visible.

This verifies browser upgrade/cache behavior and the real local HTTP/bootstrap
path. It does not claim an installed-app upgrade or mutate the owner's browser
cache/profile. Linux execution needs the normal display/Xvfb environment.
