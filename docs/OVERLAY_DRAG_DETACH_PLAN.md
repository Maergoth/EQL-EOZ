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
- [x] Detect actual encoded item links in fresh chat, check complete wiki
  membership and local suppression, then offer Contribute for missing items.
  Keep the triggering line as private evidence without inferring a drop source.
- [x] Pin an accepted item-link prompt until a fresh matching live item-examine
  read from its contribution source/session/generation has been saved. Flash
  green for 900ms and close. Keep safe inline source selection and retry paths;
  preserve Character ownership and prior user-started capture sessions.
- [x] Pin an accepted monster prompt until its freshly re-armed next `/loc` is
  saved. Explicit waits persist until completion/cancellation; the initial
  automatic kill arm retains its bounded timeout. Flash green and close.
- [x] Manual dismissal cancels pending reader/location intent, including startup
  races. Old tokens, replay/manual/Character observations and unrelated items
  cannot complete a request. New monster targets, zone/log changes and disposal
  cancel incompatible work. Draft evidence remains available for review.

## Components and related change PRs

`app/overlay-drag.js` owns gesture capture and ordered coalesced IPC;
`app/overlay.js` integrates it with panel state and resize controls;
`desktop/overlay-host.cjs` owns detachment, native rectangles and release docking.
`app/overlay.css` and `app/map-overlay.js` own pointer-hit geometry.

`app/parser.js` extracts bounded encoded chat links; `app/wiki-discovery.js`
checks typed wiki membership before offering a prompt. `desktop/discovery-host.cjs`
authenticates actions and issues request tokens. The main renderer's
`app/discovery-contribution-flow.js` matches those tokens to fresh evidence;
`app/capture-workspace.js` owns reader source/ownership and queue `/loc` boundaries.
The shared notice UI and native spawn prompt render waiting/retry/captured states.
Only the exact main frame may mark completion; the native windows request actions.
The capture host accepts paired expected-session/source guards for request-owned
cleanup. A late Stop cannot end a replacement reader or clear another reader
queued behind Character capture. Trusted running-status updates refresh evidence
proof after resize/calibration/resume; stopped/error/takeover states offer retry.

Related changes integrated into the 0.9.10 source candidate:

- #24 `codex/wiki-item-hovers`: wiki-style cards and single-button sharing.
- #25 `codex/discovery-kill-evidence`: kill-only queue/journal acceptance, raw
  triggering evidence, passive-only safe archival, clearer destinations.
- #26 `codex/item-form-class-icons`: compact inline icon finder, multiselects,
  simpler reviews, saved-page links, effect preservation and later source links.

The final source combines all three related changes with this branch. Contribute
keeps one overall preview checkbox directly above Publish; Character sharing
uses its single Share button. The source integration and publication receipts
are tracked separately in [the 0.9.10 release plan](RELEASE_0910_PLAN.md).

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
- [x] Encoded modern/escaped chat-link parser fixtures, complete-catalog guards,
  deduplication and local-only triggering evidence; existing loot/combat totals
  remain intact. Coordinator/host tests cover token, provenance and cancellation.
- [x] Isolated actual Chromium workspace flow: existing/selecting reader reuse,
  safe game-window autostart, inline source choice, Character protection, fresh
  workspace-to-coordinator OCR completion, last-owned-stream cleanup, monster
  re-arming and persistent wait. Native spawn fixture covers green completion
  and manual dismissal. These are synthetic fixtures, not live-game acceptance.
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

PR #27 is open. The first CI source checks passed on all runners; both native
jobs stopped at a new pixel-test assumption about opaque cyan tip length. The
fixture now compares direction against the real CSS canvas center at forced
1x/1.5x and rejects dots, wrong-axis and reversed arrows. Both local runs pass;
the application marker geometry is unchanged. CI must pass on the amended head.

The subsequent CI run passed source and marker checks but reached an obsolete
map-loot fixture expecting a removed "Tier 7" label. It now checks the wiki-card
title's +7 badge and the exact scaled HP170 field; the actual native fixture
passes locally. The new discovery flow adds its own workspace fixture to both
platform jobs and the Windows installer workflow. Exact-head CI remains a gate.

The combined 0.9.10 source suite passes. The native main/preload workflow passes
ten synthetic loopback writes, single-final-review publication/retry, User-page
sharing, item-first/monster-later recovery and stale-source revision guards.
The full Windows native overlay smoke also passes after its fixture deliberately
detaches the former group before testing reattachment and isolates its independent
resize from earlier docked groups. App docking behavior is unchanged by those
fixture corrections. Package byte verification now includes the new helpers and
original wiki frame images.
