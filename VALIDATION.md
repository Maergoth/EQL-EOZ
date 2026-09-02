# Validation report — v0.3.0

Validated in the build environment on 2026-09-01 UTC.

## Automated checks

- `npm test` passes.
- `tests/test.mjs` passes.
- `node --check` passes for the desktop runtime and first-party renderer/parser/scaling modules.
- Item scaling tests cover standalone DMG, static Cold DMG, Ammo +10 Range/tier, and negative-stat recovery.
- Con-color tests cover level-dependent blue boundaries and gray/green/white/yellow cases.
- `php -l server/BuildEyeOfZommPack.php` passes in the available PHP runtime.
- `bash -n` passes for the dataset refresh/publish/GitHub-sync shell scripts.
- Bundled JSON files parse successfully.
- The bootstrap script validates manifest shape, gzip SHA-256, decompression, and dataset schema before embedding a production snapshot.
- Runtime dataset checks now target the GitHub `dataset` branch rather than eqlwiki.com.

## Full supplied-log parse

The parser was previously run across the complete supplied 133,220-line log rather than only fixtures.

Observed parsed events:

- zone transitions: 40
- consider events: 70
- profile/level events: 7
- target events: 36
- outgoing damage events: 27,393
- rune events: 4,185
- healing events: 1,107
- kills: 232
- distinct locally observed NPC/zone keys: 99
- total outgoing damage parsed: 2,079,300
- total healing parsed: 90,003

## Desktop packaging note

The current Linux tool environment does not have the Electron npm payload cached and therefore does not perform the final Windows NSIS compilation locally. The repository includes a Windows GitHub Actions build that installs the pinned Electron/Electron Builder versions, runs the test suite, obtains the GitHub-mirrored dataset when available, and emits the installer artifact.

A release tag uses the same pipeline but requires a verified production dataset and attaches the resulting installer to the GitHub release.
