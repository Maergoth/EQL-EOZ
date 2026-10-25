# Eye of Zomm 0.9.10 — reliable overlays and wiki contributions

Published baseline: **0.9.9**, main
`481ce17c9d4202f36092eac12c0effd329e7eca9`, published 2026-10-24 with Windows
installer, Linux AppImage/deb and both checksum files. The remote main/package
and public release collection were checked before preparing this release.
All releases are prereleases, so GitHub's `/releases/latest` endpoint returns
404; the release collection and version-specific URLs are authoritative.

The owner authorized live publication. This plan tracks source integration and
release receipts separately; a completed synthetic check is not a live-game,
installed-upgrade or production-wiki result. No dataset producer run or database
refresh is requested. Preserve all historical release media and private profiles.

## Scope and integration checklist

- [x] PR27 overlay drag lifecycle: immediate selected-panel detachment, fixed
  size and peers, explicit resize, release-only eight-DIP docking and old-group
  exclusion. Drag grips clear native resize regions at fractional DPI.
- [x] PR27 map trajectory arrow, stationary retention/reset, transparent 2D
  canvas and opacity for the complete 3D surface.
- [x] PR27 shared local wiki Itembox across Character, main catalog/loot/Live
  Map and native Intel, with original frame artwork, linked effects, green
  adjusted values, tier controls and compact Exaltation name/effect summaries.
- [x] PR27 screenshot-first item evidence with adjacent inline Icon ID paste,
  no exposed fractional-maximum/socket-capacity metadata, editable SV Void zero,
  automatic compatible base proposals and preserved manual/observed evidence.
- [x] PR27 encoded live-chat item links, missing-wiki checks and local-only chat
  evidence. Accepted notices pin until fresh matching live examine OCR, then
  flash green and close. No inferred chat loot or source associations.
- [x] PR27 explicit monster contribution re-arms a fresh persistent next `/loc`;
  automatic kill-only arming retains its existing timeout. Request tokens,
  source/zone/cursor boundaries, capture generations and cancellation protect
  completion. Reuse existing contribution reading; preserve Character ownership;
  stop only request-owned readers with native session/source guards.
- [x] Integrate remaining PR24 single-action Character sharing. Keep preview,
  account/destination/revision/digest and retry guards.
- [x] Integrate remaining PR25 durable kill/death-only discovery intake and
  journal replay, bounded private triggering lines, safe untouched-draft cleanup,
  exact-match headings and explicit addition/destination links.
- [x] Integrate remaining PR26 multiselect Classes/Equipment slots, shared Zone,
  Preview → Publish review with one overall checkbox, saved-page links,
  effect preservation and reviewed late-created monster source recovery.
- [ ] Final source/native integration suite and exact-head Windows/Linux checks.
- [ ] Merge reviewed source and publish one 0.9.10 prerelease only after both
  platform/package gates pass; verify all public assets/checksums and update
  selection. Do not execute an installer as a verification step.

PR24–26 source integration is complete. One overall **I reviewed these page
changes** checkbox sits directly above Publish; destination, live-match,
per-field and per-page checkboxes are removed. Character sharing has one Share
button and no checkbox. The related
wiki renderer/template/API work has its own repository and activation receipts;
an app release does not claim to deploy those changes.

## Component map and developer entry points

Start with [HANDOFF.md](HANDOFF.md), then the focused component contracts:

- [Overlay drag and item follow-ups](OVERLAY_DRAG_DETACH_PLAN.md): renderer
  `overlay-drag.js`/`overlay.js`, native `overlay-host.cjs`, map rendering and
  request flow ownership.
- [Shared item hovers](WIKI_ITEM_HOVERS_PLAN.md): `character-itembox.js`,
  `catalog-itembox.js`, shared CSS and original frame assets. This renderer uses
  cached wiki data locally; it does not embed a live wiki iframe.
- [Character inventory/export](CHARACTER_WALKTHROUGH.md): gear stays equipped,
  fresh inventory export and reviewed unbuffed recorded totals. Preview tiers
  and item values never alter the recorded Character total.
- [Contribution evidence](CONTRIBUTION_EVIDENCE_PLAN.md): separate minimal
  kill/loot outbox, hourly authenticated batches, offline retention and privacy.
  Raw triggering log lines and chat context stay in the local review journal.
- [Wiki interaction and activation](RELEASE_098_PLAN.md): current MediaWiki API,
  attribution, templates/schema and cross-repository deployment boundaries.

`parser.js` recognizes encoded item links. `wiki-discovery.js` verifies typed
membership. `discovery-host.cjs` authenticates notice actions and issues tokens.
`discovery-contribution-flow.js` matches current proof to the requested evidence;
`capture-workspace.js` owns the inline source picker and fresh queue `/loc`
boundary. Native `capture-host.cjs` enforces capture ownership and guarded Stop.

Never publish raw log/chat lines, screenshots, player paths or character data
through automatic observation batches. Articles still require a deliberate
review/publish action attributed to the authenticated account. No game input,
memory access or item-stat addition to Character totals is introduced.

## Verification ledger

PR27 source and synthetic receipts already recorded in its execution plan:

- Complete `npm test`, parser/provenance/privacy and request/host lifecycle
  checks; exact source receipts apply to the tested head only.
- Actual Windows Electron: 32 resize-edge and seven trusted drag cases at the
  actual 150% DPI work area and compact 1024×700 / forced 100%.
- Actual Chromium: map arrow/transparency pixels, screenshot-first form,
  compatible tiered base proposals, manual-edit preservation and shared cards.
- Actual main/preload with isolated profile/loopback wiki: explicit reviewed
  publication, saved-page links, persisted partial retry and OCR/manual state.
- Focused Chromium discovery-to-workspace/coordinator: source choice, existing
  selecting/running reader reuse, fresh matching OCR, generation refresh,
  terminal retry, last-owned-reader cleanup and Character queued-resume safety.
- Native monster prompt: non-activating display, pinned contribution wait,
  matched-location green completion and trusted manual dismissal.

One broader native smoke passed its overlay/map checks, then failed an unrelated
main hover while physical pointer input moved over the window. That result stays
partial; it is not counted as a complete passing smoke. Physical game-window
focus/passthrough, actual OCR skins, monitor changes, native Wayland and installed
upgrades retain their manual acceptance requirements.

Version-owned 0.9.10 screenshots are captured from the implemented synthetic UI,
visually reviewed, SHA-256 archived in `app/release-history.js` and retained in
the package. Four current captures show main/Intel wiki cards and the integrated
screenshot-first/multiselect form. `test-system-fonts.mjs` passed both selection
and process restoration; the integrated `test-099-workspace.mjs` passed after
PR24–26 integration. Release/history/assets checks and current developer links
pass. The release owner records final exact-head run IDs and public
downloads in the PR/publication ledger after completion. Do not premark those
receipts from earlier passing runs.

## Packaging and publication contract

`.github/workflows/release.yml` runs on main and version tags. For a new `0.*`
version it builds both platforms, verifies the complete asset/checksum set,
creates one draft prerelease and publishes only after both builds pass. A
version tag must match `package.json`; an existing published tag/assets are
immutable and cannot be replaced from another source commit.

The required prepare-bootstrap step downloads the **already published**
`dataset/manifest.json` and referenced compressed pack once, verifies its SHA-256
and schema, and shares identical bytes with Windows/Linux. This is packaging
input, not a producer/database pull. It remains network-dependent: unavailable,
invalid or undersized catalog input fails the release gate. The manifest can
advance between candidate CI and release; record the actual packaged generation
and counts from build logs instead of claiming a stale candidate baseline.
No workflow or producer changes are included in this release preparation.

Unsigned Windows output follows the existing signing policy. Linux/X11 is the
positioned-overlay baseline; native Wayland remains compositor-dependent.
Publication preserves saved data, but it does not prove or perform a local
installed upgrade. Installer launch and private-profile changes are out of scope.
