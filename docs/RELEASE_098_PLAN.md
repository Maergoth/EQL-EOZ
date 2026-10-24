# Eye of Zomm 0.9.8 execution plan

Updated: 2026-10-24. This is the active plan for the next release after 0.9.7.

## Read this first after context compaction

The owner wants all work below implemented and released, with a concrete record
that survives long-running work. Do not treat a completed audit, pushed source,
passing fixture, or published app package as proof that the wiki API, schema,
database templates, host jobs, or local queue cleanup are installed.

The tracked `docs/RELEASE_098_PLAN.md` is authoritative and is linked from
`docs/HANDOFF.md`.
Keep private evidence and machine-specific recovery instructions in the local
checkpoint; never commit player data, account data or secrets.

**Current state: implementation in progress on the follow-up branch. No 0.9.8
features are published yet.** The candidate package version is now 0.9.8; production remains 0.9.7 until publication.

### Resume procedure

1. Read this document, the latest checkpoint and `docs/HANDOFF.md`.
2. Check working trees, current heads and live deployment receipts. Preserve
   unrelated modifications. Confirm what actually shipped before changing status.
3. Pick the next unchecked task whose dependencies are satisfied. Claim file
   ownership before parallel edits, especially `capture-workspace.js` and shared
   wiki template generators.
4. Update the task's status, files, commit/PR, validation and remaining work
   before ending a work session or context compaction. Record an exact next action.
5. A task is done only when its acceptance condition is met. Release and host
   activation have separate checkboxes. Do not silently drop deferred requirements.

## User decisions and boundaries

- Implement and push live when complete; existing owner release authorization
  remains in force. Coordinate several small PRs if useful, then one app release.
- Skip an additional database/dataset refresh. Reuse the existing public dataset.
  Reading a few referenced pages or current revision metadata is not a full pull.
- Keep checks focused on changed behavior and required CI/release gates. Do not
  repeat unrelated map/OCR corpus, historic updater matrices or full-data audits.
- Character totals come **only from the recorded fully equipped, unbuffed
  character sheet**. Item tiers, catalog values and Exaltations never add to them.
- Character flow stays identity -> `/outputfile inventory` -> recorded current
  stats -> review/share. Keep equipment on; Open Inventory, Scroll down, Click
  off buffs. Item OCR belongs to Contribute, not Character intake. Capture stays
  optional and low cadence; do not reopen the retired unequip/base-stat workflow.
- Unknown exported gear is rejected from public equipment; leave its slot empty
  and direct the player to Contribute, then re-export after the wiki is updated.
- No game injection, process memory reads, game-file writes or generated game
  commands. `/loc` is typed by the player; the app listens to the log.
- Reuse active custom wiki components and existing authenticated MediaWiki edit
  APIs. Preserve contributor attribution, normal permissions and account isolation.
- The API must support page creation and editing for other tools as well as EoZ.
  Publish a real `API_Documentation` wiki page with supported contracts/examples;
  repository notes alone do not satisfy this requirement. Prefer the standard
  attributed Action API for writes over inventing an EoZ-only edit proxy.
- Wiki feature PRs target `staging`. Promote only scoped reviewed commits to
  `main`; never merge all staging into production. Every main push deploys files.
- Database templates/interface scripts, schema and private host scripts need
  explicit installation. Template writes require fresh private backups and
  expected revisions. Do not overwrite whole Common.js with a partial source.

## Verified starting point and evidence

| Component | Baseline |
| --- | --- |
| App | [0.9.7 release](https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.9.7), published 2026-10-24; main `e30028b330554760a5240131105365fe43aeef63` |
| App local source | `D:/EQL-EOZ`; clean at reviewed `b782aebe902b800e6fff5656ad3fb23956deaef6`, same tree as 0.9.7 main; fetch main before branching |
| Wiki | main `2a45c44b5b25d0a8a0ae53735ad40e0da102a060`; local main remote ref was stale on this audit |
| Character templates | Published main template revision 199390, helper 199382; re-read immediately before any future write |
| Public dataset | Generation `20261024T085302Z-c28bb275d34c`; 124 zones, 8,744 NPCs, 11,321 items; reuse, do not regenerate |
| References | [Contribution guidelines/blueprints](https://eqlwiki.com/Help:Contents), [Thornstinger](https://eqlwiki.com/Thornstinger), [target User page](https://eqlwiki.com/User:Maergoth) |

Private release receipts and local paths are indexed in the separate checkpoint.
Previous acceptance establishes the baseline only, not this follow-up.

## Work order, ownership and dependencies

All work packages below are in scope. Task IDs stay stable through compaction.
Statuses: TODO, AUDITED, IN PROGRESS, IMPLEMENTED, VERIFIED, LIVE.
Only check a box when its stated condition is satisfied.

| Phase | Packages | Depends on | Initial owner |
| --- | --- | --- | --- |
| 0. Durable context | P1 plan, P2 source and contract audit | None | Root; all agents report findings |
| 1. Shared contracts | D1 identity/gaps, C2 sockets, W1 API/schema design | P2 | Queue/model agent; Character agent; wiki agent |
| 2. App implementation | C1-C4 Character/cards; D2-D4 detection; U1-U5 editor | Phase 1 contracts agreed | Character and queue agents; root owns shared workspace UI |
| 3. Wiki integration | W2-W5 API, page patches, effects, templates; S1 sender | W1; C3/U3 contracts | Wiki agent plus root integration |
| 4. Local cleanup | L1 migration and actual user queue cleanup | D1-D4; U2 existing-page tasks | Root, private backup first |
| 5. Release | R1 docs/media, R2 lean gates, R3 wiki install, R4 app release | All acceptance conditions | Root |

Do not concurrently edit root-owned `app/capture-workspace.js/css` without a
specific section handoff. Agents can independently own pure modules/tests and
report integration APIs. Root owns plan integration and completion receipts.

## P — Planning and source audit

- [x] **P1 / AUDITED:** Inventory all current user requirements, override obsolete
  plans, assign stable tasks, dependencies, file ownership and deployment gates.
- [x] **P1b:** Commit this plan in app source and link it from HANDOFF. Keep a
  private checkpoint with current branch, receipts, dirty paths and exact next task.
- [x] **P2 / AUDITED:** Review current Character/import/cards, queue/discovery,
  contribution editor, wiki client and active wiki components. Three audit streams
  performed read-only source inspection; findings below are implementation inputs.
- [ ] **P3:** Recheck active registration/configuration before wiki changes and
  pin blueprint/template/API contracts. Public page reads are allowed; no dataset
  refresh or database snapshot is needed for planning.

## C — Character inventory, cards and User-page sharing

### C1. Tier slider in the equipped item mouseover — AUDITED

- [ ] Put the tier slider immediately below the item name in the equipped hover.
- [ ] Keep the hover open while moving into/using the slider, including keyboard
  focus. Update its card without moving the equipment grid or losing focus.
- [ ] Synchronize selected-item and hover controls. Keep modified preview values
  green. Character totals remain the recorded values, independent of tier edits.

Files: `app/character-inventory-view.js` (`characterItemTooltipMarkup`,
`characterTierControlsMarkup`), `app/capture-workspace.js/css` (tooltip events,
`setTierPreview`, profile/session guards).

Acceptance: change an equipped item's tier with the pointer and keyboard without
scrolling; card preview updates, hover stays usable, totals do not change.

### C2. Imported Exaltations and capacity — AUDITED

- [ ] Rename all user-facing Augment labels to **Exaltation**, including pickers,
  tooltips, inspect/PNG and wiki Character rendering. Internal persisted key names
  may remain compatible; do not destroy old saves just to rename a label.
- [ ] For attached socket rows only, resolve a trailing `(Exaltation)` name to
  its exact known base item when no distinct article exists. Keep original name,
  tier and sourceSlot as private provenance. Never weaken worn-item matching.
- [ ] Apply the same bounded alias in both `resolveInventoryCatalog` and the
  model's independent import identity guard. Unknown base items stay empty.
- [ ] Prefill occupied sockets from the parsed parent/child export structure;
  keep paired physical copies distinct and KeyRing entries out of worn gear.
- [ ] Use five sockets when capacity is unknown. Preserve explicit observed
  capacity and occupied indices above five through existing max eight. Do not
  infer capacity from the ambiguous TSV Slots column or discard occupied sockets.
  Explicit confirmed capacity below five stays exact; evidence wins and five is
  the fallback when capacity is unknown. This is an implementation decision,
  not a reason to block on another permission question.
- [ ] Capture visible total/empty/occupied socket counts in Contribute, with
  user correction available. Store total capacity separately from occupied rows.

Files: `app/inventory-export.js`, `character-catalog.js`, `character-model.js`,
`character-inventory-view.js`, `capture-workspace.js`, `character-inspect-view.js`,
`character-share.js`, `character-wiki-sheet.js`; wiki template helper/generator.

Audit: parser attachment already exists. The current dataset has no rich
`(Exaltation)` records for these examples, so exact suffix identity blocks prefill.
Imported socket stats deliberately stay empty; card metadata must be obtained
from canonical catalog data, not invented from OCR or added to character totals.

Acceptance: exported Thornstinger (Exaltation) fills its parent socket with the
correct canonical item/tier; unknown children stay empty; restart preserves it.

### C3. Complete shared item cards — AUDITED

- [ ] Centralize bounded item-card details shared by Character equipment hover,
  selected item, manual search, inventory and share-preview. Audit other app item
  hovers and reuse the same presentation/data where compatible.
- [ ] Retain effects/procs, effect type, cast time, required level, skill/delay,
  flags, slot/class/race, size/weight and other real wiki card content.
- [ ] Show Thornstinger's **Rampage (Combat, Casting Time: Instant), level 45**.
  Its existing pack displayLines already contain this; no dataset pull is needed.
- [ ] Avoid showing unlabelled base numeric text alongside scaled previews.
  Reuse wiki slider/presentation rules; escape all plain text and restrict links.
- [ ] Extend the public Character sheet serialization only with explicit bounded
  safe metadata fields; no raw HTML, raw OCR, paths or private import provenance.
- [ ] Update wiki helper/template rendering and skin hovers to produce equivalent
  rich cards. Reuse active AjaxHoverHelper/ItemLevelSlider DOM contracts where
  practical, without executing arbitrary remote script in the desktop app.

Files: `app/character-catalog.js`, `character-model.js`,
`character-inventory-view.js`, `character-inspect-view.js`,
`character-wiki-sheet.js`, existing item hover/scaling modules; wiki
`ops/build-character-sheet-templates.cjs`, `ops/character-sheet*.wiki`,
`skins/EQLImmersive/resources/character-sheet.js/css`, AjaxHoverHelper and item
slider source as reference. Prefer cached data; no API request on every hover.

Acceptance: Thornstinger shows its proc in app inventory/equipment/share and
wiki Character hover, with tier-adjusted numeric values and safe effect links.

Additional audit: full hover parity also needs to preserve `focus_effect`, which
the exporter and AjaxHoverHelper Itempage-to-Itembox adapter currently omit.
Existing displayLines/main-card limits can truncate later effects/classes/race.
Prefer a bounded structured card over simply raising arbitrary text-line caps.
An exporter source improvement must not trigger a fresh dataset in this release;
use already-cached proc lines and explicit review-time metadata where needed.

### C4. Share to the user's User page — AUDITED

- [ ] New interactive sheets publish to authenticated account's **User:Name**.
  Update preview, confirmation, button, status and result link text.
- [ ] Keep separate collapsed Character (Server) sections. Sharing again replaces
  only that character's owned marker block and preserves unrelated user content.
- [ ] Bind persisted share attempts to their destination. An old User_talk retry
  must not replay a talk-page beforeHash against a User page. Require fresh preview
  for a destination change; preserve old on-wiki talk content.
- [ ] Preserve normal edit attribution, permissions, account assertions,
  revision-conflict checks, redirects and uncertain-write idempotency.

Files: `desktop/wiki-client.cjs::shareCharacter`, `desktop/wiki-host.cjs`,
`app/capture-workspace.js`, share serialization/tests and documentation.

Acceptance: two characters can be shared/updated on own User page, unrelated
content survives, and old attempts/account switches cannot write to the wrong page.

## D — Correct contribution detection and immediate spawn capture

### D1. One typed identity/presence resolver — AUDITED

- [ ] Unify queue and transient discovery identity rules: Unicode normalization,
  apostrophe/backtick variants, whitespace/underscores, canonical wikiTitle,
  first-letter/case variants, known aliases and supported item tier decorations.
- [ ] Retain grammatical articles in NPC identity. Do not create false equality
  by stripping arbitrary suffixes or fuzzy-matching distinct entities.
- [ ] Complete cached presence establishes absence; incomplete cache means
  unknown. Reconcile saved candidates when catalog membership changes.
- [ ] Route both notices and queue intake through the same eligibility decision.
  A known Cloak of Flames +tier must not get a missing-wiki notice.

Files: `app/contribution-evidence.js`, `contribution-queue.js`,
`wiki-discovery.js`, `character-catalog.js`, `app.js` and integration delivery.

Audit: ordinary lowercasing already works. Queue strips item tiers, folds
apostrophes/NFKC and indexes wikiTitle; legacy notices do not do so consistently.
The fix must remove divergent decisions rather than add another lowercase patch.

### D2. Typed contribution reasons and partial-page work — AUDITED

- [ ] Store explicit reasons such as `missing-page`, `missing-source`,
  `tier0-verification`, with known canonical page/revision where available.
- [ ] Unknown mob pages are new-mob tasks. Known mobs are not new merely because
  a case or tier differs. Missing sources on known items are patch tasks.
- [ ] Preserve genuinely missing zone/item tasks too, with the collected
  mob-zone-item links. Known zone pages get only actual missing population/loot
  relationship work, not a duplicate blank page. Existing Contribute intake stays
  independent of whether Character or its walkthrough is open.
- [ ] Tier-zero evidence for reverse-calculated stats becomes a confirmation
  task on the existing item, with a supported provenance transition that removes
  the warning only after genuine tier-zero verification.
- [ ] Do not add every known item as new. Exclude items whose wiki already states
  an intentional non-mob source (quest/crafted/vendor/no drops) unless evidence
  proposes a distinct real missing source that the user can review.
- [ ] Queue known-item/known-NPC/known-zone missing relationships too. Existing
  source links are compared canonically; preserve normal/raid section identity.
- [ ] Retain locally submitted/ignored/reviewed identity state until wiki catches
  up. New evidence may enrich a task without repeatedly calling it new or alerting.

Files: queue/evidence, metadata normalization, editor task summary,
`app/contribution-model.js`, `desktop/wiki-client.cjs`.

### D3. Unknown kill -> immediate bottom-right /loc prompt — AUDITED

- [ ] On the first fresh unknown mob kill, automatically arm next `/loc` and
  show a non-interrupting bottom-right prompt immediately, independent of opening
  Contribute or enabling OCR. Say to stand at its spawn before typing `/loc`.
- [ ] Save next valid location as the targeted spawn proposal. Keep current
  log/source, zone, time, cursor and sequence guards; a kill position is not spawn.
- [ ] If another unknown dies before `/loc`, the newest eligible kill becomes
  the one active target and its prompt names it. Older requests remain saved but
  inactive for explicit re-arm. Never silently retarget after capturing one loc
  or apply one location to several mobs. UI shows actual armed/cancelled state.
- [ ] Expire/cancel arming on source/zone change and stale timeout. Preserve the
  draft/request, permit explicit re-arm, and avoid reopening old prompts on replay.
- [ ] Suppress duplicate/queued/submitted/ignored prompts across restart and live
  intake. Reuse hover-paused notice behavior without stealing game focus.

Files: `contribution-queue.js` (`consumeLog`, `armSpawnLocation`),
`capture-workspace.js`, `wiki-discovery-ui.js`, `app.js`,
`desktop/discovery-host.cjs`, overlay notice integration.

Audit: current queue creates `requested` but does not arm automatically. A saved
submitted NPC without prior spawnRequest can still re-prompt; fix suppression too.

### D4. Generated pet suppression — SOURCE VERIFIED

- [ ] Implement a bounded generated-name matcher based on EQEmu's algorithm,
  not a broad prefix regex or just the user's example list.
- [ ] Prefer positively known wiki NPCs over heuristic pet suppression; retain
  manual contribution override and separate explicit pet evidence when available.
- [ ] Cover consider/kill/source-derived intake consistently. Do not suppress
  all short names or unrelated creatures.

Source: [EQEmu GetRandPetName, pinned revision](https://github.com/EQEmu/EQEmu/blob/4aceae18b94ffaafc08e2b17bc41cd72c77f795d/zone/pets.cpp#L34).
Parts: `G/J/K/L/V/X/Z` + optional
`ab/ar/as/eb/en/ib/ob/on` + optional `an/ar/ek/ob` + `er/ab/n/tik`.
Both optional parts empty forces `tik`; `ektik` is excluded; Laser is excluded
by this source (some legacy community examples therefore are not current EQEmu
outputs). Record any explicitly supported legacy exceptions separately.

## U — Simplified Contribute editor

### U1. Match review first — TODO

- [ ] Show potential existing pages and task reason at the top, before fields.
- [ ] Offer selection of existing page for a patch, or explicit confirmation of
  genuinely missing page. Use one clear identity decision instead of many boxes.
- [ ] Disable submission until matching is reviewed; changing identity/zone
  invalidates only the affected review/plan. Full wiki diff preview stays required.

### U2. Fields, loot and defaults — TODO

- [ ] Remove per-field Verified checkboxes and the meaningless OCR/log disclaimer.
  Keep provenance internally and one final reviewed diff for writes.
- [ ] Human-readable labels and grey formatting-example placeholders. Confirm
  respawn-time syntax from live blueprint/example source before choosing `3h/3d`.
- [ ] All empty fields optional except NPC spawn location; serialize blank
  blueprint values as `?` where supported. Do not create bogus item-location
  requirements or treat `?` as a real number/link/relationship.
- [ ] Default Classic Era and Normal instance. Raid Instance is a checkbox beside
  zone; preserve dynamic existing Raid Instance sections and put Raid first.
- [ ] Prepopulate observed loot as item rows with **Common Loot / Unique Loot**
  buttons. Preserve evidence and allow redlinks. Remove `knownLoot`/one-title-per-
  line presentation. Extend zone/NPC patch rendering to the correct loot section.
  These are section classifications, not statistical Common/Rare drop-frequency
  claims; do not derive them from the new observation archive.
- [ ] Preserve in-progress edits if new log evidence arrives in the background.
  Review state/digests still invalidate when material data actually changes.

### U3. Screenshot and Icon Finder — TODO

- [ ] Large empty **+** drop zone supports select and paste. Show selected image,
  change/remove controls and upload target without requiring OCR for all tasks.
- [ ] Keep local OCR import distinct from actual file upload. Bind upload and
  article link to the authenticated user and reviewed plan; show upload outcome.
- [ ] Reuse wiki static Icon Finder catalog/index, matching algorithm and original
  aliases/IDs; lazy-load on explicit image/search use, cache locally and bound UI.
- [ ] Keep exact artwork IDs, attribution/license fields and PNG/JPEG validation;
  no screenshot is silently published, no raw private capture in a public fixture.

### U4. Base recovery without checkbox clutter — TODO

- [ ] Observed tier >0 shows the short note that tier-zero verification is needed.
  Remove fractional-progress UI and repeated verification checkboxes/descriptions
  from this flow; preserve old observation metadata internally.
- [ ] Reuse bounded inverse scaling. Present ambiguous values for correction/
  selection when needed; do not silently invent a unique base, progress or subtract
  Exaltation/modifier values. Final diff remains the one publication review.
- [ ] Append the requested warning to any item whose base stats were recovered:
  "These stats are reverse calculated from a tier X item. Please confirm with a
  tier 0 item and remove this message". Store machine-readable provenance without
  changing the human wording unnecessarily.
- [ ] Tier-zero confirmation task can replace recovered proposals and remove
  this warning through a scoped reviewed patch, keeping other article content.

### U5. Effect -> spell contribution — TODO

- [ ] Detect item effect/proc name, type, cast time and required level in input.
- [ ] Resolve existing spell/effect page first. Never duplicate a known spell.
- [ ] If missing, include a spell-blueprint page in the same multi-page reviewed
  plan, with unknown optional data `?` and item/effect reciprocal links as supported.
- [ ] Handle partially applied plans, existing-page races and retry safely; never
  silently overwrite a spell page or mark an unattempted write successful.

Files for U1-U5: `app/capture-workspace.js/css`, `contribution-model.js`,
`contribution-queue.js`, `item-base-review-ui.js`, `item-base-review.js`,
`desktop/wiki-client.cjs`, `wiki-host.cjs`, screenshot/clipboard host and tests.

## W — Wiki contracts, API and server deployment

### W1. API/schema contract — AUDITED, DESIGN TO FINALIZE

Active `extensions/EQLClientData` 1.1.2 currently exposes only the read-only POST
`action=eqlmetadata`; there is no observation-write API or schema updater.
Do not claim hourly storage already exists.

Registration/API files: `extensions/EQLClientData/extension.json`,
`includes/ApiMetadata.php`, `ConfigRepository.php`, `Hooks.php`,
`ServiceWiring.php`. Planned new files: `includes/ApiObservations.php`,
`includes/ObservationRepository.php`, schema updater hook and extension-owned SQL
definitions. Keep the existing `eqlmetadata` contract backward compatible.

- [ ] Freeze versioned request/response contracts before client/server parallel
  edits. Extend the active extension rather than adding an unauthenticated PHP
  upload/edit service. Use existing normal Action API for page edits and uploads.
- [ ] Provide bounded batched identity/source/recovery metadata needed for explicit
  contribution review when the cached pack is insufficient. Reuse revisions/cache;
  no repeated polling or per-hover requests during normal play.
- [ ] Add authenticated CSRF-protected write module for observation batches with
  normal account permission/block/rate-limit checks and server-recorded actor.
- [ ] Add schema definitions and LoadExtensionSchemaUpdates hook; use unique
  batch/event keys, bounded fields and prepared DB queries. No raw log archive.
  Proposed tables: attributed batch/receipt records plus typed observation rows;
  unique `(actor_id, event_uuid)` and payload hash. Exact same-ID replay is a
  duplicate acknowledgement; changed payload under the same ID is a conflict.
  Keep observed_at separate from received_at. Derive actor server-side.
- [ ] Document failure behavior for unavailable API/schema, old clients and
  disabled collection. Never discard a local unsent batch on failed submission.

### W2. Drop-observation storage — TODO

- [ ] Store versioned opaque event IDs, batch ID, game/server scope, canonical
  NPC/item/zone identities, instance normal/raid/unknown, observed count, event
  kind, evidence confidence and source correlation. Keep ingestion actor private.
- [ ] Store kills separately from loot observations; incomplete looting and log
  gaps are unknown completeness, never zero drops. Avoid overclaiming denominators.
- [ ] Deduplicate retries within a sender; multiple players observing the same
  kill are not automatically independent kills. Preserve enough non-sensitive
  provenance for later server-side cross-client reconciliation; do not publish
  misleading percentages or unique-kill counts before that is solved.
- [ ] Keep speculative recent-kill/encounter sources distinct from explicit
  corpse wording. Exclude pet/irrelevant events through shared intake rules.
- [ ] Add private retention/size limits and indexed lookups. Scope this release
  to collection/storage, not automatic percentages or loot-page overlays.

### W3. Attributed partial-page plans, effects and uploads — TODO

- [ ] Extend existing plan builder to scoped patches on known primary pages:
  missing sources, tier-zero verification, NPC/zone loot and missing effect pages.
- [ ] Use fresh revisions, complete preview, expected account and CSRF on every
  edit/upload. Keep partial success receipts; refuse ambiguous sections/redirects
  instead of replacing whole existing articles.
- [ ] Preserve captions/license/attribution and file naming; store actual wiki
  file reference in the planned article. Never expose login tokens to renderer.
- [ ] Spell/NPC/item/zone templates come from the live reviewed Help blueprints;
  no ad hoc namespace/category/casing conventions invented by the app.

### W4. Character template/card update — TODO

- [ ] Agree safe optional schema extension with C3; preserve old schema readers
  and existing eight dense socket helper support.
- [ ] Generate/review template sources and unsaved render. Publish only reviewed
  revisions using expected current revisions plus fresh private backups.
- [ ] Deploy skin/template support before app enables new fields/User-page flow.

### W5. Actual activation and documentation — TODO

- [ ] Wiki component map/development/API docs identify active modules, payloads,
  schema, limits, auth, attribution, retention and recovery behavior.
- [ ] Scoped feature PR to staging, then scoped production promotion. Record
  source commit and successful file deployment separately from schema/templates.
- [ ] Install schema once as a reviewed deployment step; never run write-enabled
  maintenance as a routine test. Verify tables/API health read-only afterward.
- [ ] Any required host-only job/config is installed separately with a receipt;
  ops source alone is not installed. Prefer app hourly push so an extra wiki cron
  is unnecessary unless the finalized contract actually needs one.
- [ ] Rollback: disable ingestion/sender first; preserve accepted observations,
  revert compatible files, restore DB template only via fresh backup/revision
  guard. No automatic destructive table drop or database restore.

### W6. Reusable create/edit API and public API_Documentation — IN PROGRESS

- [ ] Make page creation/editing an explicit supported integration contract for
  external tools. No EoZ-only secret, user-agent gate or shared bot authorship.
- [ ] Reuse MediaWiki `action=query` for source/revision/account context,
  `action=parse` for unsaved previews, `action=edit` with createonly/nocreate,
  baserevid/starttimestamp, assert/assertuser and user CSRF; reuse `action=upload`
  with normal image warnings/license review. Every edit remains the caller's.
- [ ] Document blueprint retrieval from reviewed Help source and safe minimal
  item/NPC/zone/spell patches, existing-page races and partially applied retries.
- [ ] Provide public schema, auth/login options actually enabled here, examples,
  limits, error/retry handling, API versioning and endpoint discovery for metadata
  and observations. Other clients can implement the same workflow without EoZ.
- [ ] Save reviewed page source in `ops/api-documentation.wiki`; publish to
  [API_Documentation](https://eqlwiki.com/API_Documentation) with current revision
  checks and a fresh private backup (or createonly if missing). Verify rendered
  content and examples. File deployment alone does not publish this page.
- [ ] Link documentation from app Contribute/settings and the wiki/API component
  guide. Publish only endpoints that are actually enabled; mark future proposals
  clearly rather than documenting unshipped behavior as live.

## S — Hourly persisted app sender

- [ ] **S1:** Collect minimal structured kill/loot observations alongside existing
  log parsing, independent of OCR and whether Contribute is open. Tap fresh events
  before wiki-presence, queued/submitted and Ignore filters: known mobs/items must
  still contribute observations. Apply explicit pet/player safety classification
  to telemetry separately from contribution eligibility.
- [ ] **S2:** Persist a bounded private outbox in main-process storage. Use atomic
  writes, stable batch/event IDs and retry acknowledgements; retain offline data.
  New session, clearing Contribute, Ignore and the bounded OCR journal must not
  erase unacknowledged observations. Ordinary batches exclude player names, paths,
  raw chat, screenshots and coordinates.
- [ ] **S3:** Flush at most hourly while running and authenticated; on launch,
  catch up if due, not every log event. Back off on network/auth errors. Closing
  the app preserves pending data; no promise of transmission while app is closed.
- [ ] **S4:** Make collection/upload state clear in settings, use existing wiki
  login, and never silently upload personal logs/screenshots or unrelated data.
  No new external service/database beyond the wiki is needed.
- [ ] **S5:** Keep accepted telemetry separate from reviewed wiki edits. Actor
  attribution on ingestion does not fabricate article revision authorship.

Proposed files: `app/drop-observations.js`, `desktop/drop-observation-storage.cjs`,
wiki-client/host scheduling integration; exact module names finalized in W1.

## L — Clean up the user's existing local Contribute list

New explicit owner request: clean up the local app's current list after the new
matching/eligibility rules are installed. This is part of completion, not just
a future release-note suggestion.

- [ ] **L1:** Identify actual installed profile/storage and take a private fresh
  backup before changing it. Do not commit/upload the queue, user data or screenshots.
- [ ] **L2:** Dry-run the new resolver over every saved entry, producing a private
  count/reason report: false missing-page, generated pet, duplicate, missing source,
  tier0-verification, genuine unknown, submitted/partial plan, unresolved.
- [ ] **L3:** Archive obsolete false positives and consolidate safe untouched
  duplicates. Preserve user-written fields, evidence, in-flight/partial plans and
  legitimate patch/verification tasks. Reclassify known items with real gaps.
- [ ] **L4:** Apply idempotent versioned migration to the user's queue; never clear
  their whole list. If an entry's identity/plan is ambiguous, retain it for review.
- [ ] **L5:** Reopen/read back the cleaned queue and verify counts. Record backup
  location, before/after counts and restoration instructions privately. Keep a
  future-client load migration so other users' false positives are handled too.

Acceptance: this user's list no longer shows known complete Cloak of Flames,
case/tier duplicates or generated pets as new, but real source/verification tasks
and edited work remain. Restoring the backup remains possible.

## R — Focused verification and release

- [ ] **R1:** Update relevant guides, changelog, README and browsable What's New
  with actual synthetic screenshots of the changed Character/Contribute UI. Keep
  older release media immutable and clearly distinguish shipped versus planned.
- [ ] **R2:** Run focused regressions for identity/gap reasons, pets, automatic
  location targeting, retry suppression, sockets, hover tiers, proc cards, User-
  page destinations, partial edits, uploads and authenticated idempotent ingestion.
  One representative native UI check covers pointer/focus/layout. PHP/JS syntax,
  required CI and Windows/Linux packaging gates remain mandatory.
- [ ] **R3:** Verify deployed wiki API/schema/templates before publishing the app;
  record actual production activation and minimal read-back. Fixtures are not
  live edits; do not create real test contributions just to claim live coverage.
- [ ] **R4:** Bump app version only when feature work is integrated. Open/update
  app PR against main; attach all PRs to this chat. Merge exact reviewed passing
  source, allow release workflow to build Windows+Linux, and verify required assets
  and updater metadata for this version. Do not rerun unrelated exhaustive audits.
- [ ] **R5:** Reuse current dataset/bootstrap; do not trigger a producer pull.
  Preserve prior releases and cached user data. Record any ordinary cached-read
  download separately from generating/pulling a new database dataset.
- [ ] **R6:** Complete local cleanup L1-L5 and final checkpoint. Report app release
  URL, wiki activation, local cleanup outcome and any genuine remaining limitation.

Minimal acceptance examples: known base item +5; backtick/case NPC; known item
missing a source; genuine missing NPC -> one prompt -> next valid /loc; repeated
submitted kill -> no prompt; generated pet -> no new mob; imported socket suffix;
Thornstinger proc; two User-page characters with retry; duplicate hourly batch ->
one storage effect; unsigned/blocked actor -> refused; empty optional field -> ?;
missing NPC location -> submit blocked; recovered tier4 warning -> tier0 reviewed
confirmation. No broad map-route or live OCR recalibration sweep is requested.

Focused existing commands to use when their modules change:

```text
node tests/contribution-evidence.mjs
node tests/contribution-queue.mjs
node tests/wiki-discovery.mjs
node tests/loot-provenance.mjs
node tests/wiki-contributions.mjs
node tests/wiki-client.mjs
node tests/item-base-recovery.mjs
node tests/item-base-review.mjs
node tests/inventory-export.mjs
node tests/character-model.mjs
node tests/character-catalog.mjs
node tests/character-inventory-view.mjs
node tests/character-inspect.mjs
node tests/character-wiki-sheet.mjs
node scripts/test-capture-workspace.mjs
node ops/test-character-sheet.cjs
php maintenance/run.php ./ops/test-character-sheet.php
```

Run app commands in EQL-EOZ and wiki commands in its current isolated worktree.
Add narrow ingestion/outbox tests with the new modules. The unsaved wiki parser
test needs the prepared local runtime; report unavailable runtime honestly. CI
may run the repository's required complete source suite; do not repeatedly rerun
it locally after unchanged passing results.

## Decisions to resolve from code/data, not by losing scope

1. Confirmed capacity below five: preserve actual evidence; five is proposed
   fallback. Implementation decision recorded in C2; no clarification required.
2. Source-completeness metadata versus explicit non-mob source: inspect existing
   pack source representation before deciding eligibility; fetch bounded live
   metadata only during review when needed.
3. Respawn placeholder units and Common/Unique placement: verify live blueprint
   and representative page conventions, then pin examples in tests/docs.
4. Reverse-scaling ambiguity: select from bounded candidates in the single form/
   diff review; short warning never legitimizes fabricated exact base values.
5. Screenshot upload type/license and spell effect linkage: reuse existing wiki
   capabilities; freeze fields and preview contract before implementation.
6. Hourly observation identity/cross-client duplicates: collection/storage now;
   no percentages until a later separately scoped denominator design is sound.

## Not part of this release

Automatic public drop percentages/labels are explicitly future work. Multi-skin
OCR, game-map overhaul, automatic commands, rewriting historical release assets,
full database refresh and moving/deleting old User_talk uploads are not requested
for this follow-up. Every requirement above remains on this checklist until done.

## Required source reads by work package

| Package | Read before editing |
| --- | --- |
| All app work | README, CONTRIBUTING, SAFETY, this plan and HANDOFF; current source takes precedence over obsolete historical walkthrough prose |
| C1-C4 | `docs/INVENTORY_EXPORT_CHARACTER_PLAN.md`, `docs/CHARACTER_SHEETS_PLAN.md`, Character model/catalog/import/inspect/wiki serialization and current wiki-client share retry records |
| D1-D4 | `docs/CONTRIBUTION_EVIDENCE_PLAN.md`, `contribution-evidence.js`, queue, discovery, parser source context, `loot-provenance` tests and pinned EQEmu pet source |
| U1-U5/W3 | `docs/design/WIKI_CONTRIBUTIONS.md`, live Help blueprints, `contribution-model.js`, base recovery/review, wiki-client per-page plans and upload receipts |
| W1-W5 | Wiki README/CONTRIBUTING, relevant EQL_DEVELOPMENT/EQL_COMPONENTS, PROJECT; active extension registration, current database page revisions and deployment receiver contract |
| S1-S5/L1-L5 | Main/native persisted storage authority and limits, parser fresh-source boundaries, real queue schema/migrations, private backup/restore checkpoint |
| R1-R6 | `docs/RELEASE_HISTORY.md`, `scripts/check-release.mjs`, `.github/workflows/release.yml` and existing Windows/Linux package gates |

Wiki source locations for rich card work: `maintenance/BuildEyeOfZommPack.php`,
matching app `server/BuildEyeOfZommPack.php`,
`extensions/AjaxHoverHelper/AjaxHoverHelper_body.php`, ItemLevelSlider,
`skins/EQLImmersive/resources/item-hover.js/css`, Character sheet generator and
helper. The private primary wiki checkout is older and dirty: use a current
isolated feature worktree, not accidental edits to inactive copies.

Read-only blueprint/component pins from this audit (re-read before writes):
Help 198282; Itempage 176024; Itembox 192952; Spellpage 168155;
Spellpagesmart 138101; SpellHoverLink 132750; Module:SpellHover 132707;
IconFinder 192885; BlueprintLoader 168748; Icon List 192817.
Active EQLClientData 1.1.2, UserPageEditProtection 4.1.0.

Official mechanics: [API extensions](https://www.mediawiki.org/wiki/API:Extensions),
[extension schema hooks](https://www.mediawiki.org/wiki/Manual:Hooks/LoadExtensionSchemaUpdates),
[edits and conflict guards](https://www.mediawiki.org/wiki/API:Edit),
[uploads](https://www.mediawiki.org/wiki/API:Upload).

## Completion ledger (update every work session)

Do not collapse this ledger into a vague "mostly done" summary.

| Task | Implementation | Evidence/PR | Live/local activation |
| --- | --- | --- | --- |
| P1/P2 plan and audits | Complete | This plan; draft app PR21 | Planning does not install features |
| C1 tier hover | Implemented | Native workspace slider keeps focus; totals unchanged | App release pending |
| C2 Exaltations/default sockets | Implemented | Import/model/inspect/socket suites | App release pending |
| C3 rich item cards/procs | Implemented across app/overlay/wiki source | Shared safe metadata; native Character hover; unsaved wiki parser | Wiki template activation and app release pending |
| C4 User-page share/retries | Implemented | Destination/account-bound client retry suite | App release pending |
| D1 shared identity | Implemented | Resolver/queue/discovery suites | App release pending |
| D2 typed existing-page gaps | Implemented | Queue reconciliation and protected-work tests | App release pending |
| D3 immediate prompt/automatic loc | Implemented | Native main/preload hover-held prompt, source cancellation | App release pending |
| D4 generated pets | Implemented | Pinned EQEmu source and exact-generator tests | App release pending |
| U1 matching-first review | Implemented | Native editor identity gate and fresh final review | App release pending |
| U2 simplified fields/loot/defaults | Implemented | Native Common/Unique controls, hidden raw field | App release pending |
| U3 screenshot upload/Icon Finder | Implemented | Exact wiki algorithm6 native matching; explicit upload/retry tests | App release pending |
| U4 simplified recovery/tier0 verification | Implemented | Bounded provisional recovery and proof-preserving patch tests | App release pending |
| U5 item-effect spell pages | Implemented | Missing spell child plan, known spell reuse and retry tests | App release pending |
| W1 API/schema contract | Implemented, v1 frozen | Wiki PR62; actual MW registration/CSRF tests | Source/schema/config activation pending |
| W2 drop storage | Implemented | Separate transactional actor/event/receipt storage tests | Narrow schema/config activation pending |
| W3 partial-page plans | Implemented | Canonical per-page grouping and normal/raid guarded updates | App release pending |
| W4 rich Character templates | Implemented | 808 serializer-to-unsaved-wiki parser checks; hover DOM | Template/CSS activation pending |
| W5 wiki deployment | In progress | Staging PR62 exact-head checks | Scoped production promotion pending |
| W6 reusable create/edit API and API_Documentation | Implemented | Standard attributed Action API; guarded fixed page publisher | Actual public page publication pending |
| S1-S5 hourly outbox | Implemented | Durable exact-account/ACK retry suites; normal close/reload drain | App release pending |
| L1-L5 this user's local cleanup | Applied | Private backup/hash-CAS/readback receipt; no fresh catalog pull | 49 active ->37 active +12 archived; unrelated values retained |
| R1-R6 release/docs/lean gates | In progress | Illustrated history and focused native gates pass; source gate running | App PR21/published release pending |

## Progress log

- 2026-10-24: 0.9.7 and current main heads verified via GitHub. Three source-audit
  streams completed/under consolidation. Character proc is already in cached
  displayLines; imported socket matching and divergent discovery identity are
  concrete gaps. New API/storage work confirmed. Local queue cleanup added from
  the owner's newest request. No app source, profile, wiki content/schema, host
  configuration or dataset changed during planning.
- Planning checkpoint: final audits consolidated; this plan and HANDOFF are
  committed on the isolated follow-up branch. Private recovery checkpoint saved.
- Next action: implement D1 shared typed identity and C2/C3 socket/item-card
  contracts; finalize W1 ingestion payload/schema before client/server edits.
- 2026-10-24 implementation: Character pure model/cards/socket suites pass;
  root is integrating hover/editor/shared cards. Queue identity/pet modules and
  telemetry contract are in implementation. Wiki API/schema and destination-bound
  User-page sharing are assigned. Nothing from this follow-up is published yet.
- Owner added reusable page creation/editing and an actual API_Documentation wiki
  page. W6 records the attributed standard API workflow, reviewed public examples
  and explicit database-page publication. This is part of the release scope.

- Integration checkpoint: Character/editor/overlay and main/preload are assembled.
  Matching-first review, Common/Unique loot, optional fields, screenshot paste,
  wiki Icon Finder, provisional recovery, tier-zero confirmation and spell child
  plans are implemented. Existing normal/raid reciprocal pages group into one CAS
  review per canonical title. Account status forwarding and local close/reload
  drain protect the observation outbox. Focused native workspace and spawn gates
  pass. Actual installed queue cleanup completed with a fresh private backup:
  12 stale entries archived,37 retained; character/profile values preserved.
- Wiki feature PR62 targets staging. Source/schema/config/templates/public API
  page installation remain distinct release gates. App package+lock are0.9.8;
  baseline production is0.9.7 until actual publication. Required full source and
  exact-head Windows/Linux gates remain in progress. No dataset refresh occurred.
