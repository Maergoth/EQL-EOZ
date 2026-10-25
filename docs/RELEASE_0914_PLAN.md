# 0.9.14 contribution history and safer loot discovery

This release retains the shared wiki item engine, bundled formula rules and
tier-zero verification behavior introduced in 0.9.12, including the exact
`Tier 0 Verification Needed` category correction released in 0.9.13. Both earlier
releases' notes, screenshots and hashes remain unchanged.

## Scope and ownership

- **Notable monster choice:** the new-monster popup asks `Is <monster> notable?`
  and saves explicit Yes/No for that exact draft without opening the main app.
  Unanswered stays separate from No and never discards the location draft.
  Contribute exposes the same editable choice. Native exact-frame, current
  candidate/evidence and acknowledgement guards reject stale requests; edited
  classification, saved reviews and partial/submitted work remain protected.
  The historical `Namedmobpage` template does not imply notable classification.
- **Contribute → History:** native metadata receipts for manual/automatic plans,
  account/origin filtering, local status filters and pagination, confirmed
  revision/diff links, partial/uncertain results, and safe bounded persistence.
  See [the native contract](CONTRIBUTION_HISTORY.md).
- **Contribute layout:** keep Discoveries and Contribution History inside one
  section beneath shared account controls. The compact reader toolbar and one
  latest-attention summary replace the repeated three-receipt feed. History keeps
  full receipts; tab changes preserve draft edits and pause the reader owned by
  this section. Keyboard tab navigation and immediate logout clearing remain.
  Explicit Pause also stops an owned pending-item reader or late start;
  refresh/re-entry cannot restart it until an explicit Start/Contribute action.
  The selected game source remains available for that explicit resume. Ordinary
  log processing continues independently of the local screen reader.
- **Pet exclusion:** the shared explicit owner-labelled pet check protects parser,
  discovery, queue and native contribution planning. Existing edited/submitted
  work remains available; similar ordinary monster names remain literal.
- **Cached global loot placement:** six distinct monsters means Common; fewer
  means Unique only with complete native cached count provenance. There are no
  live count requests. See [the contract](CONTRIBUTION_LOOT_CLASSIFICATION.md).
- **Authored coverage before publication:** use the typed affected-field
  contract in [the accepted research plan](AUTOMATIC_CONTRIBUTION_COVERAGE.md).
  Positive cached either-side sources need zero HTTP; exact unscoped sources
  and complete finite collections already count. A useful new supported source
  is authored once on the NPC, with independently eligible existing zone
  summaries only. Broad/qualified intent never becomes guessed membership or
  reciprocal item-page mirror writes. Quiet decisions are separate from
  publication History and retain manual/population/partial work.
- **Routine common materials:** suppress only automatic source-gap/backfill
  work for positively identified cached materials with WT-only statistics,
  explicitly empty equipment slots, recognized metadata-only display lines and
  at least six already recorded monster sources. Unknown/ambiguous entities,
  missing metadata, gear, effects, uncommon drops and manual contribution drafts
  retain their existing workflows. Native suppression occurs before account or
  live page resolution; authored generic source text is not treated as an exact
  monster identity. The shared helper has no hardcoded item/species names.
- **Weight regression:** retain the existing formula and check that base weight
  2.5 at rank ten displays as 0.3.
- **Shared rules revision 2:** floor positive primary-stat gains above ten,
  including HP 50 → 75 at rank 5 with 4/32 progress and AC 14 → 22 at rank 6
  with 5/64 progress. Reverse recovery uses the same engine and stale saved
  reviews require a new review. AC, HP, Mana, Endurance and regeneration also
  count toward the existing two-stat requirement for rank-based Void. Negative
  penalties retain their existing rounding. See [shared scaling](SHARED_ITEM_SCALING.md).
- **Missing-item notices:** use a separate lower-right desktop window, including
  when Timers is closed, without moving focus on receipt. Keep stacked notices,
  expiry/hover holds and explicit Contribute/Ignore/dismiss actions. Only an
  explicit Contribute action opens the reader workflow; a notice never captures
  the screen. Timers has no discovery-action IPC bridge.
- **Local first, live on a miss:** check the shipped cached item/page catalog
  before one bounded, coalesced public exact-title/redirect existence check.
  Existing live pages, lookup failures and stale source/profile results cannot
  produce a false missing-item notification. Loot source counts stay offline.
  See [the existence contract](ITEM_DISCOVERY_EXISTENCE.md).
- **Items Any:** put Any immediately left of Auto. Persist the Items-only
  override without changing detected/profile classes or other panel filters.
- **Documented item sets:** use only explicit complete producer membership to
  recognize a member already covered by an authored NPC/zone loot set in the
  selected instance. Preserve the set and its authored loot kind. An individual
  explicitly reviewed manual item-page source can still be filled without
  appending redundant NPC/zone entries. Automatic publication never repairs a
  covered source by copying its reverse field. Native preparation and saved-plan validation share this rule;
  title similarity never establishes membership.
- **Hover timing and Intel scrolling:** use one 350 ms pointer delay for rich
  item previews in the main app, Character and Intel. Keyboard focus remains
  immediate; source/view changes, leave and scrolling cancel a pending preview.
  Intel previously measured row geometry on every shared session update,
  including unrelated parse/timer heartbeats. Keep its DOM intact when displayed
  content is unchanged and update distance labels in place. This removes that
  measured source of work; it does not certify all physical scrolling/DPI cases.
- **Map startup integration:** allow only the two bundled shared-scaling
  JavaScript imports required by Map chrome. The request policy previously
  rejected those dependencies and prevented its renderer from mounting. Keep
  the remaining vendor files, formula provenance JSON, private data and
  mutation APIs outside that window's allowance. The focused Map policy suite
  passes the exact imports and denied neighboring-file counterexamples.

## Validation and release gates

The focused native history suite passes metadata privacy, fresh native account
filtering, cross-account/origin/cursor isolation, 80 receipts across 30-plan
pruning/restart, the 500-entry/2 MiB caps, partial/unknown/pre-write failures,
corrupt-file preservation, atomic writes, non-fatal storage errors, retrying a
failed receipt save, and exact main-frame read-only IPC/preload admission.

The UI suite covers escaped text/fixed-origin links, upload rows, account races,
logout clearing, local filters, pagination/deduplication, recoverable errors and
no background history reads. jsdom 27.0.0 is pinned as a development-only test
dependency; it is not an application runtime dependency.

The Contribute layout fixture covers its shared section/account header, compact
latest-result handling, visible failures, History link, draft preservation,
keyboard tabs and logout clearing. The native capture-workspace fixture checks
reader ownership, source choices, fresh evidence, automatic result processing,
manual edits and History pausing. The native popup fixture checks exact-frame
IPC, work-area placement, closed Timers, initial focus preservation, explicit
actions and completion expiry using a disposable synthetic profile.
The native spawn-prompt fixture also checks literal monster text, explicit Yes
and keyboard No through the sandboxed preload/native acknowledgement and real
durable queue, an unanswered default, retained keyboard focus, a replacement
question's visible scroll position, current-candidate protection and matched
location completion. The actual workspace fixture verifies the same choice in
the editor and rejects an older popup choice after an editor correction.

The tooltip scheduler fixture covers the full delay, updated pointer position,
adjacent-target cancellation, stale sources and disposal. The Intel interaction
fixture keeps 180 rows and their scroll position intact across 20 unrelated
heartbeats and distance updates with zero row geometry reads. The actual native
Intel fixture additionally checks 22 rendered rows, 20 heartbeat/distance
updates without geometry reads and twelve reordered updates with preserved
anchors/focus. These are isolated synthetic fixtures, not measurements of the
user's installed profile or a promise that every source of input latency is gone.

Before publication, record final integration results for the complete source
suite, dependency audit, generated runtime sources, Windows/Linux package CI,
actual archived screenshot/hash, exact release commit and public asset checks.
No installed player profile or production wiki write is part of these fixtures.
App publication and the separate dataset exporter/pack refresh have independent
receipts; this document does not claim that an exporter change is installed.

Earlier integration on October 25, 2026 passed the complete `npm test` source
suite with the isolated local PHP runtime, including the shared-rules and
mirrored producer fixtures, exact packaged runtime/bootstrap contracts,
navigation worker validation, release surfaces and the 43-version/77-image
archive gate. The final authored-set parsing adjustment additionally passed
`loot-set-coverage`, `contribution-submit-validation` and `wiki-client` after
the full run. The npm dependency audit reported zero vulnerabilities. Actual
isolated Electron capture-workspace and standalone popup checks passed after
the crash recovery, including the pending-item/late-start Pause regression.
Windows/Linux package CI, exact published commit/assets and the independent
live dataset rebuild still require their own final receipts.

The final coverage revision adds native zero-request/no-write regressions,
separate quiet decisions, colon namespace proof, failed-attempt History
retention and independently validated optional zone-summary retries. The full
native manual workspace, discovery workspace and overlay suites pass locally.
Final source/parser/exporter checks, including independent literal-card proof
review, pass locally. Refreshed dataset and cross-platform release verification
remain gates. Genuine unbounded Research-component groups cannot currently
prove finite membership; small global counts can remain incomplete and must
withhold Unique placement rather than invent a proof. This limitation does not
invalidate positive coverage or a verified Common lower bound of six.

Four version-owned screenshots in `app/assets/whats-new/0.9.14/` show the actual
implemented UI and styles: `contribute.png`, `contribution-history.png` and
`wiki-discovery.png`, plus `new-monster-notable.png`. They are isolated Electron Chromium captures with
synthetic data; the first uses generated screenshot pixels, the second expands
a partial history outcome, and the third comes from the real native popup
fixture. The fourth shows the real new-monster prompt and its unanswered
notable question. They are visually reviewed and contain no game/player pixels,
installed profiles, live wiki requests or production wiki submissions. Reviewed
SHA-256 values are recorded in the release history.

Zone contribution follow-up: local `zoneScope: various` includes the current zone
within the same NPC instance. Native previews preserve the literal Various field.
Separate `categoryZones` proof recognizes category-backed normal dynamic-list
membership even when an explicit NPC spawn field names another zone; the map/stat
record keeps its existing authoritative zone and raid scope.
DynamicZoneList is populated by the zone/NPC category intersection; normal mobs
update that NPC source rather than the manual Notable NPCs summary. A confirmed
Notable choice is required for the summary. Existing formatted/nested zone tables
are supported. Automatic zone Unique Items additions retain the global count
rule, require numeric gear stats beyond weight, and skip absent summary rows
(including Plane of Sky). Native preview and saved-plan retry validate these
boundaries; source-only fixtures do not make any production wiki edits.
