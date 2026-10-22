# Capture, wiki contributions and character snapshots

## Scope, authorization and release boundary

The owner requested two new app tabs, optional screen reading, a local working
implementation and a reviewable PR. This feature branch is
`codex/capture-contributions`, originally based on 0.8.8/main `1d24163` and now
merged with released 0.8.9/main `6937d35`. The feature version is 0.9.0 candidate. Keep one
Windows/Linux codebase. Do not merge/publish this larger feature automatically
under the earlier authorization to release font/Linux fixes.

The 0.8.8 release is now published and verified: three public package downloads,
GitHub digests/checksum files, tag/commit, shared dataset and download links.
Release workflow `39864202817` and main CI `39864202794` passed.
PR #9 was merged after exact head `39c2943` passed source/Windows/Linux CI.

The smaller **0.8.9** follow-up is isolated in `D:\EQL-EOZ-hotfix`, branch
`codex/system-fonts-cache`, PR #10. It bundles installed system fonts, permanent
interface cache repair, green adjusted item stats, swing timer default off,
historical What's New, the restart countdown and the Live Map loot pane.
Head `d1b4a9d` passed final CI `39871328293` and Windows installer
`39871321634` and was merged in PR10 as main `6937d35`. Release workflow
`39871980124` and main CI `39871980105` passed. Public 0.8.9 downloads, tag,
checksums, packaged runtime/images and byte-identical Windows/AppImage/deb
bootstraps are verified in private `eoz-0.8.9-release-verified.json`. Do not confuse that release PR with this feature
branch. Feature commit `f116ef6` and merges `dedcca4`/`4cb8e2e` preserve both
implementations; combined source and native font/cache/map checks pass. The
separate [draft PR #11](https://github.com/Maergoth/EQL-EOZ/pull/11) retains
manual acceptance items; do not auto-promote it. Baseline feature CI
`39873212882` and Windows installer `39873211969` passed before cross-review.
Final capture/retention/wiki-retry fixes pass the complete local source suite,
deterministic race/retention/retry fixtures and native capture/workspace checks;
exact-head remote revalidation is pending.

The new request authorizes local development and testing. Use isolated app
profiles and synthetic/private fixtures. Do not replace the installed EoZ or
publish test edits/uploads to the live wiki. Preserve unrelated dirty files in
`D:\EQLWiki`: `docs/EQL_DEVELOPMENT.md`, `ops/itembox.wiki` and
`maintenance/.mweval_history`. Any required wiki code PR targets staging.

## Sources to read before changing behavior

| Contract | Source and observation |
| --- | --- |
| Contribution standards / blueprints | https://eqlwiki.com/Help:Contents, live revision **198282**, fetched 2026-10-22; canonical item/NPC/zone fields and categories, no invented factual prose, duplicate avoidance, dynamic zone lists and user talk conventions. Recheck the current revision at draft preparation/submission. |
| Blueprint discovery | `D:\EQLWiki\extensions/EQL-Editor-Tools-Icon-Finder/MediaWiki_BlueprintLoader.js`; the running script is the database page `MediaWiki:BlueprintLoader.js`. It reads heading sections and pre blocks from Help:Contents. A Git mirror is not proof of the current database revision. |
| Wiki component map | `D:\EQLWiki\README.md`, `CONTRIBUTING.md`, `docs/EQL_DEVELOPMENT.md`, `docs/EQL_COMPONENTS.md`, `PROJECT.md` read for this task. Preserve template/category contracts, normal edit permissions, verification/email and wiki/forum authentication. |
| Existing capture | `desktop/discovery-host.cjs`: trusted main/Triggers IPC, explicit desktopCapturer window/display selection, clipboard. New capture arbitration must include this existing Screenshot action. |
| Authoritative log events | `app/parser.js`, `app/overlay-session.js`, `app/app.js`; retain one parser and existing log identity/cursor/replay guards. Identify actual supported kill/loot/zone/who/loc grammar before adding OCR equivalents. |
| Catalog / item scaling | `app/wiki-discovery.js`, `app/item-scaling.js`, `app/item-browse.js`, canonical zone/source helpers, complete wiki presence catalog. Preserve base versus tier-adjusted stats, exact icons, raid identity and unknown fields. |
| Native boundary | `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/overlay-host.cjs`; remote login content never gets local file/capture/editor IPC. Native overlays do not receive auth credentials or raw capture frames. |
| UI / tests | `app/index.html`, `app/app.js`, `app/styles.css`, `scripts/test-native-overlays.mjs`, current appearance/native CI. New tabs retain fonts and normal app/overlay behavior. |

Private source evidence is stored outside Git under
`D:\EQLWiki\.local\validation\eoz-capture-*`; do not commit the supplied game
screenshot, account data, capture frames, tokens or real logs.

## Data responsibilities

1. **Game log first:** kills, loot text/quantity, zone changes, `/who`, `/loc`,
   character identity and timing use existing parser events wherever available.
   Reuse catalog discovery rather than making a second parser session.
2. **OCR supplements:** item examine text, visible equipment, character/base
   statistics and visible population lists. OCR can propose names/fields; it
   cannot establish an unseen spawn population, mob HP, drop source or a negative
   fact. A nearby kill and loot alone remain a proposed relationship to review.
3. **Screen-read journal:** append bounded, versioned structured observations to
   a private local NDJSON journal, with capture/session ID, source, timestamp,
   region, text/confidence, parser version and dedup key. Process asynchronously,
   with backpressure, one in-flight OCR job, replay cursor and retention limits.
   Do not continuously encode/store full-screen video. Evidence images are local,
   bounded and explicitly selected for sharing.
4. Preserve raw observed values and provenance. Do not silently turn a tier +10
   examine into a base-stat wiki item or add an augment's stats twice. Prefer a
   known catalog match; unresolved tiers/augments need user review.

## Capture ownership and controls

- Screen reading is disabled by default in Settings, with source selection and
  visible running/paused/error status. Stop releases the source and OCR worker.
- One coordinator owns `contribution`, `character`, or explicit one-shot discovery
  capture. Character Start pauses contribution capture; Stop returns to the
  previous explicitly enabled contribution mode only if its source is still valid.
- Handle permission denial, missing/minimized sources, source replacement,
  background queues, pause, crash/restart and app quit without a busy loop.
- Use a cross-platform local OCR engine with pinned dependencies and bundled or
  verified local language data. Inspect official engine/Electron documentation
  and licensing before selecting the implementation. No cloud OCR by default.

## Contribute to Wiki flow

1. Observations create/reconcile durable candidates for item, NPC or zone. Existing
   game-log missing-entity notices link into this queue; screen reading is optional.
2. Show evidence, editable extracted fields, uncertainty, current wiki catalog
   membership and flexible potential matches (normalization, aliases, token/fuzzy
   title search plus a fresh server check). Treat an unavailable/stale catalog as
   unknown, not proof that a page is missing.
3. Load the current Help:Contents blueprint revision and prepare wikicode from
   verified structured fields plus the contributor's own prose. Do not generate
   narrative, publish placeholder instructions, overwrite artwork or invent data.
4. Build an explicit page plan: primary item/NPC/zone page, supported reciprocal
   loot/location changes and categories. Dynamic zone lists may update from
   categories without editing the zone page; inspect real templates/source first.
5. Submit opens a review of every page/change and potential duplicate. Require an
   authenticated, permitted wiki user and an explicit final publish action.
   Use current revision/create-only guards; conflicts require a fresh review.
   Multi-page writes are sequential, with per-page results and safe partial retry.

## Wiki authentication and upload

- Inspect available authentication mechanisms first. Prefer the wiki's normal
  login UI in a hardened dedicated native window/session, or a supported OAuth
  flow if already enabled; do not embed a password form or bypass site policy.
- Keep cookies/CSRF tokens in the trusted desktop service, never in snapshots,
  journals, diagnostics, screenshots or Git. Require exact main-frame IPC.
- API mutations use current user assertions, tokens, permissions and edit-conflict
  guards. Protected pages, unverified accounts, CAPTCHA/abuse filters, logout and
  session changes must produce clear recoverable errors.
- Character upload targets only the authenticated user's own User_talk page,
  with an explicit preview/upload action. Upload a new unique file, then add an
  idempotent signed topic/link; report upload-success/talk-failure separately.

## Character flow

1. Start a named capture session, with contribution capture visibly paused.
2. Prompt the player to examine equipment manually. Capture editable item cards,
   identify likely wiki matches, retain tier/augment/icon evidence and unknowns.
3. Drag cards into named character slots; provide keyboard/select alternatives,
   compatible-slot hints, duplicate-slot handling and clear/remove controls.
4. Prompt for a **No Equipment** stat capture, then a fully equipped stat capture.
   Preserve both observed stat blocks. Keep calculated item sums separate from
   observed character totals (caps, buffs, effects and scaling are not assumed).
5. Review a shareable visual with character metadata, observed total/base stats,
   slots, gear icons/names/levels/stats and missing/uncertain fields. Copy to
   clipboard or save a PNG. Optional authenticated own-talk upload requires review.

## Execution ledger and agent ownership

Agents may update their row and append findings below. Do not overwrite another
owner's sections or files; communicate interface changes first.

| Work package | Owner | Status | Expected files / handoff |
| --- | --- | --- | --- |
| 0.8.8 final publication verification | root | complete | public release v0.8.8; private eoz-0.8.8-release-verified.json |
| Wiki standard/auth/edit plan | wiki_contribution_089 | implemented, isolated validation | docs/design/WIKI_CONTRIBUTIONS.md; blueprint parser, hardened native auth, guarded multi-page plans, persisted partial retry and actual main/preload UI checks. Ownership returned to root. |
| Capture/OCR journal | capture_pipeline_089 | implemented, private/synthetic validation | docs/design/CAPTURE_PIPELINE.md; coordinator, local OCR worker/runtime assets, private bounded journal and native/offline tests; handoff complete |
| Character data/share model | character_model_089 | implemented, synthetic validation | slots, observed base/total stats, item card provenance, deterministic share renderer and tests |
| App UI / integration / PR | root | implemented; draft PR11 created | Settings, tabs, offline Character import, guarded review/retry, source/native checks and screenshots; baseline Windows/Linux packaged CI passed, final cross-review fixes pass locally with remote revalidation pending |
| Versioned What's New | character_model_089 | 0.8.9 released; 0.9.0 candidate prepared | current feature captures plus historical screenshots, unseen labels and release gate; 29 versions/28 images |
| Live Map loot pane / update UX | root | 0.8.9 released and merged into feature | right-hand full loot table, cache eviction on upgrade, checkbox layout, five-second Windows restart countdown |

### Required acceptance before PR is ready

- Existing source/native gates remain green on Windows/Linux.
- Real local OCR is exercised on provided private or synthetic examine/stat
  images; document accuracy and confidence/region calibration limitations.
- Journal replay/dedup, capture handoff/cancellation/backpressure and private
  retention are tested, not just UI marker strings.
- Blueprint output matches real current parameter/section/category contracts;
  duplicate/conflict/partial-retry behavior is exercised with a local API fixture
  and, where available, the private local wiki using a disposable test account.
- Test capture, export/save/clipboard and own-talk upload using isolated/synthetic
  data; do not claim fixture tests are live game or live wiki submissions.
- Inspect both tabs at small/large fonts and narrow windows; capture reviewable
  screenshots, update docs, create/attach the feature PR. Do not auto-merge it.

### Findings / decisions

- 2026-10-22: Help:Contents revision 198282 is the supplied standard. Its current
  editor loader derives blueprints from that page rather than separate Blueprint:
  pages. Dynamic zone listings and normal wiki edit permissions must be reused.
- 2026-10-22: Full feature `npm test` passed after capture/parser calibration and
  wiki/Character UI hardening. Native workspace/auth/capture checks also passed
  with isolated profiles, real local OCR and loopback-only wiki mutations. The
  Character header supports offline PNG import while capture stays disabled;
  Settings imports explicitly target contributions. No installed app or public
  wiki edits/uploads were used for validation.
- The supplied tiny composite screenshot yields an editable upgraded item
  proposal, preserving OCR's `Leng` misspelling for correction, AC14 and tier10.
  HP, weight and full character totals are not reliable at that size and are
  omitted. Reviewable manual corrections remain essential; do not claim live
  skin/resolution or production login/CAPTCHA/Wayland acceptance from fixtures.
