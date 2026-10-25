# Overlay dragging and contribution follow-ups

Branch: `codex/overlay-drag-detach`, based on main `481ce17` / 0.9.9.
This is a next-release change; source, installer publication and installed-app
acceptance are separate milestones. Preserve the pending feature PRs below.

## Requested behavior

- [x] Dragging immediately detaches the selected panel's incident dock links.
  Keep its size and leave all other panels where they were. A short drag must
  work; no aggressive motion or threshold is required to break free.
- [x] Do not magnetize or share sizes during a drag. Only release within eight
  display-independent pixels of a new peer edge can dock it. Exclude the old
  connected group for that gesture, so free placement cannot rubberband.
- [x] Keep edge resizing and docked shared dimensions. Keep grips separate from
  all eight resize hit regions, including compact Triggers and fractional DPI.
- [x] Use an explicit portable pointer/IPC lifecycle; stop safely on cancellation,
  lock, hide, renderer failure, monitor changes and disposal. Keep a native
  window-manager move fallback. Serialize move and resize requests.
- [x] Unknown-monster prompts require kill/death evidence, never `/consider` or
  nearby casting. Preserve the triggering log line as local captured evidence.
  The main queue/evidence change is pending PR #25; this branch closes the
  separate wiki-discovery prompt path as well.
- [x] Item forms: screenshot first, adjacent icon screenshot input using the
  existing compact finder; no standalone Fraction Maximum or Exaltation capacity
  fields. Capacity remains a Character/User-page concern.
- [x] Default the item form's base SV Void to zero without inventing observed
  OCR values or modifying recorded Character totals.
- [x] Keep visible decimal punctuation in OCR weight, including separated dot
  or comma. Ambiguous missing punctuation remains local evidence for correction,
  never a silently accepted weight of 32. Explicit manual numbers remain valid.
- [x] Remove the extra fresh-live-match confirmation; retain the final form
  confirmation. Put confirmed saved-page links directly in the success receipt.
- [x] Fix missing submitted item stats. Prefill jointly compatible editable base
  proposals without a separate Apply action or Possible base column. Preserve
  observed numbers as evidence and attach tier-zero verification whenever the
  observed tier is greater than zero, including drafts prepared without Apply.
- [x] Share the wiki-style Itembox appearance across Character, main item-list
  and native overlay hovers; preserve current hover delay, tier editing, compact
  Exaltations and actual catalog effect text.
- [x] Native minimap direction marker estimates trajectory from two accepted
  planar samples. Hold on stationary/jitter updates; reset across zones, missing
  positions and large jumps. The main embedded minimap already estimates heading.
- [x] Make the native map card respect panel opacity: clear the 2D canvas and
  keep its lines/markers crisp; fade the complete 3D surface with panel opacity.
- [x] Exclude explicit owner-labelled pets from parser found-NPC state, kill
  discovery, loot-source proposals and observation uploads. Archive only safe
  untouched old false positives; preserve edited and in-flight drafts.

## Components and related change PRs

`app/overlay-drag.js` owns gesture capture and ordered coalesced IPC;
`app/overlay.js` integrates it with panel state and resize controls;
`desktop/overlay-host.cjs` owns detachment, native rectangles and release docking.
`app/overlay.css` and `app/map-overlay.js` own pointer-hit geometry.

Pending next-release related changes (do not silently drop or claim deployed):

- #24 `codex/wiki-item-hovers`: wiki-style cards and single-button sharing.
- #25 `codex/discovery-kill-evidence`: kill-only queue/journal acceptance, raw
  triggering evidence, passive-only safe archival, clearer destinations.
- #26 `codex/item-form-class-icons`: compact inline icon finder, multiselects,
  simpler reviews, saved-page links, effect preservation and later source links.

This branch reuses the compact icon/saved-link and shared Itembox pieces needed
by the newest requests. Integrate the related change branches explicitly before a release and
resolve any shared form hunks in favor of the final requested behavior.

## Verification ledger

- [x] Renderer queue tests: fast release before start reply, coalesced movement,
  cancellation, state invalidation and interactive controls.
- [x] Host tests: 47 passed, including small drag breakaway, peer immobility,
  unrelated chain preservation, eight-versus-nine-pixel release snapping,
  lifecycle cleanup and native move-only fallback.
- [x] Written OCR parser tests: decimal punctuation and missing-decimal evidence.
- [x] Actual Windows Electron trusted-pointer checks: all four panel grips,
  36px Triggers, fractional-DPI hit regions, small release and free placement,
  intentional new-target docking, existing eight-edge resize coverage.
- [x] Contribution form native layout/saved receipt checks and focused sources.
- [x] Wiki-style main/Intel tooltips: actual Electron font-choice/restoration
  fixture passed and both silver-frame screenshots were visually inspected.
- [x] Map heading/transparency: actual Chromium pixel tests passed for cardinal
  directions, stationary hold/reset, transparent canvas corners and panel alpha.
- [x] Full required source suite (`npm test`), including final syntax checks.
- [x] Real main/preload loopback contribution workflow: proposal persistence,
  observed-versus-base evidence, saved-page receipts, partial retry and reload.
- [ ] Exact-head CI and scoped PR.
- [ ] Next installer release (version/history screenshots/platform packaging).
- [ ] Installed build / physical game acceptance. Synthetic fixtures do not
  establish these results. No private profile, production wiki or dataset writes.

Native drag/resize passed both the actual Windows150% DPI work area and a
1024x700/forced100% fixture:32 resize edges plus7 trusted drag cases. Windows
rounds a requested36px Triggers minimum to38px/56px respectively; the test also
checks its grip fits the requested36px height. Peer positions and dragged size
stay unchanged through1/3/6px steps, broadcasts and release near the old group.
The broad main/preload smoke reached and passed overlay/map checks, then failed
an unrelated main-item hover while physical pointer events moved across the
window; this is recorded as a partial fixture result, not a successful full run.

The separate real main/preload capture workspace passes on the final app code:
seven loopback wiki writes, explicit review, saved-page links, partial restart/
retry, original HP147 retained separately from proposed HP108, manual HP109
preserved across repeat OCR/reload, and the tier3 verification note in the draft.
The edited-stat overwrite found during independent review is fixed: valid manual
HP29 stays29; unsupported/invalid manual numbers stay untouched and block preview.
