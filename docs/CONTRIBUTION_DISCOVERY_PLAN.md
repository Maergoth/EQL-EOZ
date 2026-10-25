# Contribution discovery

## Current item notification contract

Item suggestions use the [local-first existence gate](ITEM_DISCOVERY_EXISTENCE.md)
and a dedicated native popup at the screen's bottom right, independent of
Cooldowns/Timers. Cached item, alias or generic public-title presence needs no
live request. Only a cache miss permits one bounded anonymous exact-title query
with redirect resolution before a missing-item notice. Errors remain unverified.
This exception does not add live loot-count classification or background wiki
polling. The historical release records below describe their earlier behavior.

## Untouched legacy chat captions

Updating the parser does not remove already saved suggestions. Queue reconciliation
also checks untouched chat-only item drafts against the current procedural item
matcher. When every retained plaintext chat line resolves to the same different
known item, a caption such as sales prose joined to that name is archived with
its original evidence under `chat-caption-covered`. It is not renamed into a
wiki contribution or permanently ignored. An archive failure rolls back the
active queue; a full archive preserves the record while retiring its false gap.

Manual, edited, confirmed, reviewed, planned, partial/submitted, attachment,
numeric-stat, OCR, loot and source-bearing records are retained. Encoded links
and retained native hex bodies remain untouched: a genuine longer item may
contain a shorter known name. Missing, conflicting or ambiguous chat evidence
cannot prove a legacy caption error. New flattened mentions retain their
`plain-tiered-chat` interpretation in the private journal for later diagnosis.

`tests/contribution-queue.mjs` covers dry runs, reversible original records,
protected work, ambiguity, save rollback, archive bounds and restart idempotence.

## 0.9.10 contract

The [chat/capture follow-up](CHAT_CAPTURE_FOLLOWUP_PLAN.md) supersedes the
encoded-only chat boundary below: tier-decorated plain chat can produce a
possible-item suggestion, with the same canonical/suppression guards. It also
adds low-frequency reading while the Contribute view is active. See that record
for source and package status; the historical 0.9.10 receipts remain unchanged.

The 0.9.10 release integrates the kill-evidence work from [PR25](https://github.com/Maergoth/EQL-EOZ/pull/25) with the persistent request flow from PR27. See [the release checklist](RELEASE_0910_PLAN.md) for final integration, exact-head checks and publication receipts. The earlier implementation record below is preserved as historical evidence; its next-release/no-version-change statements describe that original PR, not the current release authorization.

Automatic monster discovery requires a fresh kill/death event or an explicit named-corpse loot source. Considers and nearby spell casts may still serve combat/Intel behavior but cannot admit a monster contribution. Known players, generated pets and owner-labelled pets are excluded. Durable queue intake and journal replay enforce the same boundary. Conservative reconciliation archives only proven untouched passive-only tasks; edited, manual/OCR-supported and submitted/partial work remains protected.

A captured trigger line is bounded and escaped for local review. It never enters generated article text or hourly observation telemetry. Old captures cannot recover a discarded line and explicitly report unavailable evidence. Exact canonical matches say **Matched existing page**; ambiguous/fuzzy choices remain distinct. Proposed additions show their destination page and compare already-recorded cached associations before offering a gap patch. The final live revision-guarded diff owns exact edits.

A missing encoded live-chat item link may offer Contribute without inventing loot/source evidence. After explicit Contribute, the notice stays pinned until fresh matching live item-examine OCR from the request's current source/session/generation is saved. Monster Contribute re-arms a persistent next-/loc boundary; automatic kill arming retains the normal timeout. Completion stays green for 15 seconds of visible time then closes; manual dismissal cancels pending work. Source/zone changes, stale tokens and unrelated/manual/replayed observations cannot complete it. Character capture is preserved and reader cleanup uses native expected-session/source guards.

Current modules: parser.js, contribution-evidence.js, contribution-queue.js, wiki-discovery.js, discovery-contribution-flow.js, capture-workspace.js and native capture/discovery hosts. Source and isolated Chromium/native receipts are in the release plan; they are not installed-build, physical-game or production-wiki acceptance.

## Original PR25 implementation record

# Contribution discovery: kills, evidence and destinations

Next-release PR scope, following published 0.9.9. Prepare reviewable source and
documentation; do not merge, release, refresh the dataset or modify the installed
profile/wiki during this pass. The separate item-hover PR remains independent.

## User-visible requirements

- Automatic monster discoveries require a kill/death event. Considers, nearby
  spell casts and other passive player activity must not become verification
  tasks. Keep player/pet filtering and Intel's useful consider behavior.
- Captured evidence includes the actual bounded triggering log line, displayed
  as escaped text. It stays private to local contribution review and never enters
  kill/loot telemetry or wiki article content automatically.
- Show what addition is proposed and the linked destination page beside it,
  including zone population/loot and reciprocal item/monster source updates.
  Explain direct canonical matches as matches, keeping fuzzy suggestions clearly
  separate and retaining the existing destination review/write guards.
- Review legacy passive-only discoveries conservatively: preserve edited,
  reviewed, manual/OCR-supported, submitted/partial and planned work. No silent
  loss of legitimate kill/source evidence.

## Owners and critical source map

Worktree: `D:/EQLWiki/.local/worktrees/eoz-discovery-evidence`, branch
`codex/discovery-kill-evidence`, based on main
`481ce17c9d4202f36092eac12c0effd329e7eca9`.

- `discovery_kill_evidence`: contribution-evidence.js, contribution-queue.js,
  necessary parser/app intake, desktop/capture-host.cjs, focused evidence/replay
  tests. There are two intake paths: direct queue plus desktop journal replay;
  both must enforce the event gate and retain local evidence.
- `discovery_destination_ui`: pure contribution-editor.js/presentation.js and
  tests, direct/fuzzy match labels and destination-aware addition helpers.
- Root: capture-workspace.js/CSS integration, native fixture, developer docs,
  final review/commit/PR. Root and UI helper must reflect the actual scoped
  contribution-update.js and desktop/wiki-client.cjs page planning contract.
- `discovery_profile_audit`: read-only installed-profile audit, privately
  correlating Plane of Hate/Ethereal Mist Vambraces and passive monster entries.
  Store receipts only under ignored `.local/validation/discovery-evidence`.

Do not weaken ambiguity handling, source confidence, partial-plan recovery,
Ignore suppression, review gating, account attribution or revision-guarded edits.
Preview hints remain proposed destinations; the eventual live guarded diff owns
the exact edits. No remote page lookup is added to ordinary gameplay.

## Acceptance ledger

- [x] Reproduce actual admission paths and relevant private queue symptoms.
- [x] Kill/death-only automatic monster admission at both boundaries; restart
  and safe passive-only legacy handling, player/pet exclusion regressions.
- [x] Actual bounded trigger lines survive local intake/restart; escape hostile
  text and prove absence from telemetry/automatic article output.
- [x] Exact vs fuzzy match labels, per-addition destination links and clear
  relationship wording in the editor/queue.
- [x] Focused source/native verification with synthetic records and screenshots,
  developer contract updated; report fixture/live limitations honestly.
- [ ] Commit/push and create/attach next-release PR; record checks and head.


## Validation and release boundary

The complete source suite passed, including new real-parser kill/consider/cast,
known-player/pet, raw-evidence privacy, durable replay and conservative cleanup
regressions. The initial restricted-shell PHP launch was denied by the sandbox;
the remaining suite was resumed successfully with the normal runtime. A real
main/preload workflow passed against an isolated profile and loopback wiki,
including reviewed contribution publication and partial-plan recovery. The real
Chromium fixture checks exact/fuzzy headings, linked per-page additions, known
loot exclusion, escaped actual log lines, and live title/raid changes without
losing typing focus. Screenshots below use synthetic records only.

![Direct match and proposed additions with page destinations](https://raw.githubusercontent.com/Maergoth/EQL-EOZ/28babe5f924f0daeafcffd4daf5bbee7cca5370a/docs/screenshots/discovery-direct-match-destinations.png)

![Already-recorded loot and the original triggering log line](https://raw.githubusercontent.com/Maergoth/EQL-EOZ/28babe5f924f0daeafcffd4daf5bbee7cca5370a/docs/screenshots/discovery-triggering-log-line.png)

The read-only private audit confirmed nearby casts were already excluded;
considers and saved replay needed the tighter contribution boundary. No installed
profile was changed. Existing captures cannot recover discarded original lines
automatically and explicitly say when a line is unavailable. Unknown player
casualties that have never been identified by /who remain a log limitation.
Proposed links use cached associations; only the guarded live diff determines
the exact additions and preserves article formatting. No raw evidence enters
automatic article content or the minimal observation API.

This feature is independent of the pending wiki-style item-hover PR. It does not
change release 0.9.9, publish packages, regenerate data, alter wiki schema or edit
wiki pages. The final PR tracks platform CI before the next release.
