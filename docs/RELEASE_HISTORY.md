# Browsable release history

Version 0.9.6 adds six reviewed synthetic screenshots: the compact one-total
inspect, empty-slot item picker, augment picker, share review, wiki item inspect
and independent collapsed characters. The four app captures use the actual main
window/preload at 13px with an isolated profile and loopback wiki. The two wiki
captures use actual unsaved MediaWiki parse output and the registered component;
they establish component behavior, not a live deployment. All prior release
entries and image bytes remain unchanged.


Version 0.9.5 adds five actual synthetic captures of selected-item tier
controls, Rescan/25-slot board, Character Select, equipped X and direct item search. Both were captured by the isolated
native Character walkthrough and visually inspected before archiving; no
player or game pixels. Every older entry and image stays unchanged.

Version 0.9.4 adds two actual synthetic Character captures: the dense equipment
sheet and an unmatched-item wiki picker. Both come from the native walkthrough
with a disposable profile, fake capture/share APIs and synthetic item records,
at 20px. They were visually inspected before archiving. Raw game/player frames
remain private; all prior release images and hashes remain immutable.


The manual **What's new** action opens a release selector with version-specific
notes, a walkthrough and the screenshots actually captured for that version.
Opening EoZ does not open the viewer automatically. The selector keeps old
versions available; each unviewed release has its own **New** label.

`app/release-history.js` is the durable, append-only release content. All 28
changelog versions through 0.8.9 are represented. Twenty original synthetic captures
and their original tour text were recovered from released commits:

| Release | Screenshot source commit |
| --- | --- |
| 0.8.4 | `58c760f9f7c76cea8b979b91eb45660a28c35f32` |
| 0.8.5 | `47878900f7fe27470a5c762d0f55d771a2f305af` |
| 0.8.6 | `1790c93cdabddd5f6d20168c73cfd1cfac66e22d` |
| 0.8.7 | `d174ee3319b502024edebe47490442bf6397fc22` |
| 0.8.8 | `1d241637acb340c490071caa52efd6ff0352dc27` |

Version 0.8.9 adds three new captures of installed fonts, adjusted item stats
and the Live Map loot pane, bringing the archive to 23 images.

Version 0.9.0 adds ten captures of Screen reading, OCR area calibration, reviewed
contributions, Character slots, editable augments, the character share preview,
catalog search, base recovery, overlay layout controls and Map Auto Z,
bringing the archive to 33 images across 29 browsable versions. Its publication gate
also checks the final calibrated capture UI and preserves every older version.

Version 0.9.1 adds five actual synthetic Character captures: inline source,
20px base review, written item/Haste editing, final guided review and computed
equipped estimates. These were captured by `test-character-walkthrough.mjs`
with a disposable profile and fake capture/share boundaries, and visually
inspected before copying. Historical 0.9.0 images remain intact. The current
guide describes the changed baseline-only flow; older entries describe their
original controls. A sixth capture shows the actual unlocked native Parse and
its resize grip, bringing the archive to 39 images across 30 browsable versions.

Version 0.9.2 adds one actual Character capture showing the hover-reading
instructions, three synthetic item cards and queued/read status. It uses the
existing isolated Character component fixture with synthetic observations and
capture APIs; the real native stream/OCR test is separate. The archive now has
40 images across 31 browsable versions. Every older image remains intact.

Version 0.9.3 adds an actual synthetic Character capture showing item intake
continuing during Confirm slots, its active-reading guidance and the new item
card. The disposable native component fixture exercises new live reads and
imports through Slots/Review separately from private actual-game diagnostics.
The archive now has 41 images across 32 browsable versions.

Each PNG is stored under `app/assets/whats-new/<version>/` and has a reviewed
SHA-256 in its step. Files were extracted as binary Git objects, without image
regeneration or re-encoding. Original top-level images remain available to the
README and existing capture tools. Updating those current illustrations cannot
overwrite the archived viewer media. Original 0.8.4 workspace and 0.8.7 Intel
captures were visually inspected during recovery.

Older versions have changelog notes with an explicit unavailable-screenshot
message. A modern screenshot is never presented as evidence of an older UI.
Historical controls or names may have changed since their captured version.
The **Open** feature action navigates to the corresponding current workspace.

## Viewed state and integration

`app/release-history-state.js` stores a bounded explicit set of viewed versions
under `eql-eye-of-zomm-release-seen-v1`. Merely mounting EoZ does not mark anything
viewed. Opening or choosing a release marks just that version; skipped versions
keep their **New** indicators across upgrades and restarts. **Mark all viewed**
is an explicit way to clear available releases. Corrupt optional state fails
open to unviewed; storage errors leave the viewer usable. A first profile has no
previous viewing record, so historical releases start unviewed.

`mountWhatsNew` retains the existing manual button/navigation API and accepts:

```js
mountWhatsNew({
  button, navigate,
  getVersion: () => bridgeInfo?.version,
  storage: localStorage,
  onUnreadChange: ({ count, versions }) => {}, // optional indicator integration
  onWarning: message => {}                   // optional persistence warning
});
```

The returned controller has `open(version?)`, `close()`, `refresh()` and
`dispose()`. `refresh()` updates unread labels when asynchronous bridge/version
information arrives. Only entries up to the installed version are available.
The trigger gets a visible **New** label and an accessible unread count. Native
dialog Escape/focus restoration, select keyboard operation, Previous/Next and
feature navigation remain supported.

## Required process for every future release

1. Add a new version entry at the top of `app/release-history.js`, with the exact
   current package version, release title and concrete player-facing changes.
   Keep every previous entry and its screenshots intact.
2. Capture the actual implemented UI using an isolated synthetic profile and
   the existing real Electron capture harnesses. Inspect the captured result at
   the supported sizes/fonts. Do not invent screenshots or reuse another
   version's image as evidence of changed controls.
3. Copy the reviewed PNGs into a new
   `app/assets/whats-new/<new-version>/` directory. Add walkthrough text,
   accessible alt/caption, feature target and each PNG's SHA-256. Captures may
   precede the final commit; record their source/check evidence in the PR.
4. Update CHANGELOG and the release validation record, then run `npm test` and
   the normal native/platform checks. Include manual viewer navigation and
   current/historical images in the reviewable UI evidence.
5. Keep the image archive in the application package. The shared source/image
   ASAR gate compares every historical PNG and both history modules byte for
   byte with the reviewed source tree.

`scripts/check-release.mjs`, already run by the normal source/release suite,
calls `check-release-history.mjs`. Packaging is rejected if the current package
version has no history entry, a 0.8.4-or-newer entry lacks captures, an image is
not under its own version directory, a PNG is missing/invalid/oversized, or its
bytes differ from its reviewed SHA-256. Every changelog release must remain
browsable. This is a mandatory future release gate, not a reminder to overwrite
the same four images.

## Validation

`node tests/whats-new.mjs`, `node scripts/check-release-history.mjs` and
`node scripts/check-release.mjs` passed after recovery. Tests cover manual-only
opening, the historical 0.8.8 four-step tour, historical selection, honest missing-media
fallback, Escape/focus restoration, explicit marking, persisted skipped-release
unread state and missing-current/missing-media/corrupted-image counterexamples.
A separate hidden Electron module fixture used a disposable profile and blocked
external networking to load the real archived media. Version 0.8.8 at
1100 × 850 / 10px, 0.8.4 at 700 × 900 / 20px and older 0.8.3 notes at 700 × 900 /
20px all loaded, exposed all 27 choices and had no dialog horizontal overflow.
The PNGs were inspected under private validation output. Large-font content
scrolls vertically; the narrow selector then received its own full-width row.
Full-app native UI screenshots and keyboard/viewport acceptance are recorded by
the integration owner; the module fixture does not establish all desktop flows.

The 0.8.9 native lifecycle check additionally opens the current three-step tour,
verifies its selected release and loaded screenshot, navigates Next/Previous,
and verifies Escape and restored focus. Its expected count comes from the
current release entry rather than assuming every future tour has four pages.
