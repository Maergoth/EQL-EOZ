# Contribution form: simpler review, multiselects and inline icon paste

Prepare a separate next-release PR from published 0.9.9. Do not merge, release,
refresh datasets or change installed profiles/wiki pages in this task.

The user corrected the initial checkbox request: **both Classes and Slots must
be multiselect dropdowns, not checkboxes**. Use fixed canonical game choices,
clear selected summaries and keyboard support. Preserve unedited legacy draft
values, optional blank fields and the existing array storage/submission format.
Selecting classes must handle ALL/NONE consistently. Do not introduce free text
that can produce mistyped abbreviations.
Selected Classes/Slots must agree with visible `Class:`/`Slot:` stat lines,
not only article categories. Existing pages change only explicitly edited fields.

Icon matching belongs inside the existing Icon ID field: one focusable paste
box, a local preview/status and closest-result choices after an explicit paste.
Remove the separate Icon Finder section and browse/file/search controls from
this item form. Retain exact artwork aliases, user selection, image bounds,
local fingerprint processing and stale-result/disposal guards. An icon paste
must not trigger the form's general screenshot attachment handler.

The follow-up request removes duplicate Source Zone entry and repeated approval
checkboxes. Adding a drop source uses the current **Zone** and **Raid Instance**
above; existing sources retain their own zone/instance. A missing zone focuses
the existing field instead of creating a second input. Keep source inclusion
choices and data filters, which select content rather than approve publication.

The flow is **Preview wiki changes → Publish wiki changes**. Preview explicitly
selects the current destination for a fresh guarded plan. Show all live matches,
redirects, upload details, account and complete before/after page changes.
Publish is the single final authorization; no destination, duplicate-result or
per-page approval checkbox is needed. Preview/resume never writes automatically.
Draft edits invalidate previews; a saved partial plan requires an explicit Retry.
Keep the desktop account, live duplicate, blueprint revision, review-digest,
create-only/content/revision guards and reconciliation of partial writes.

Successful publication must provide **View page** links for every confirmed
saved page, whether an item, monster, zone, spell or related update. Use the
canonical title saved in the plan, with a fixed wiki origin; show already-applied
pages during a partial result and after restart. Pending, uncertain and failed
pages must not claim success. Do not navigate automatically.

Empty item template fields stay blank, including effect metadata. A chosen
effect/proc must replace a stale `Effect: ?` line rather than be suppressed by
it. Preserve unrelated item text and scoped existing-page edits. Keep `?` for
missing factual monster fields such as HP and spawn location; keep the existing
new-monster location requirement and all server-side edit guards.

## Ownership and source map

Worktree `D:/EQLWiki/.local/worktrees/eoz-item-form`, branch
`codex/item-form-class-icons`, based on main
`481ce17c9d4202f36092eac12c0effd329e7eca9`.

- Choice agent: shared contribution-choice-picker module and focused tests for
  Classes/Slots multiselect markup, keyboard/state and legacy preservation.
- Icon agent: app/icon-finder.js compact paste mode and focused widget checks.
- Root: contribution-editor.js and capture-workspace.js/CSS integration, native
  item-form checks/screenshots, developer documentation, final commit and PR.

Authenticated attributed page publication, identity/revision validation and
private capture boundaries stay in force. The pending hover/discovery PRs are
independent; this PR does not claim their changes are already released.

## Acceptance ledger

- [x] Fixed-choice Classes and Slots multiselect dropdowns, with keyboard and
  optional/ALL/NONE behavior; unedited old draft values remain intact.
- [x] Inline Icon ID paste box and post-paste matches; no separate finder UI.
- [x] Icon paste remains local and cannot attach a screenshot accidentally.
- [x] Meaningful source/native checks, narrow/large-text visual review and
  updated documentation; synthetic captures only.
- [x] Commit/push, create/attach next-release PR #26 and inspect initial CI.
- [x] Reuse Zone for new drop sources; preserve other-zone sources and require
  a zone before adding a source.
- [x] Replace repeated approvals with explicit Preview and one Publish/Retry,
  retaining full diffs and host validation.
- [x] Validate the review simplification; push its amendment to PR #26.
- [x] Verify and push successful-page links for every page kind and partial
  results, including resumed plans.
- [x] Fix selected effect serialization and blank item fields; retain factual
  monster unknowns and scoped existing-page patches.


## Validation and maintenance

The complete source suite passed, including the registered canonical-choice
regression. The actual Chromium workspace checks multi-selection, Space/Escape
keyboard input, saved canonical arrays, no checkbox inputs in the dropdowns,
upward viewport-edge placement, and an inline icon paste that never also creates
a screenshot attachment. The real-main/preload contribution flow passed with an
isolated profile and loopback wiki, including native icon fingerprint matching
and reviewed attributed publication.

`npm run test:icon-finder-ui` separately covers real PNG/canvas fingerprints,
exact artwork aliases, no requests before explicit paste, bounded crops, stale
replacement responses and disposal. Keyboard Tab/Shift+Tab return to the trigger
before normal focus navigation; menus use available viewport/scroll-panel room.
These are synthetic fixture checks, not an installed-app or live-game test.

The simplification amendment passes the complete source suite and unchanged
desktop wiki-client safeguards. The real-main/preload loopback flow verifies
zero writes on Preview, all three related page diffs visible, a single Publish
with no approval boxes, stale-review invalidation, and an explicit partial Retry
after restart without repeated completed edits. The Chromium form check verifies
blank-zone refusal/focus, current-Zone reuse, case deduplication and preservation
of existing other-zone sources. The historical `test:workspace-098` command now
forwards to the current superset fixture rather than expecting retired controls.

The later page-link/effect amendment passes focused contribution, editor,
choice-picker, client, base-recovery and tier-zero checks. The real-main loopback
workflow confirms links for the created item immediately during a partial
result, retains those links after restart, and adds the successful monster and
zone links after explicit Retry. Pure cases cover spell links too, fixed-origin
escaping, and no success links for pending/failed/uncertain pages. The selected
effect replaces a placeholder without losing other effects, including names
with escaped entities. Explicit changes to existing effects and Class/Slot lines
are scoped and idempotent; unknown item metadata stays empty and NPC factual
unknowns/location requirements remain. The prior complete source-suite receipt
belongs to the review simplification; this follow-up uses the focused checks
and the same complete native contribution workflow, without repeating unrelated
route/OCR checks. No production writes or installed-profile changes occurred.

![Full page previews retain one explicit Publish action](screenshots/contribution-single-publish.png)

![Drop sources reuse the Zone above without a second zone input](screenshots/contribution-compact-drop-sources.png)

![Successful item, monster and zone submissions offer View page links](screenshots/contribution-saved-page-links.png)

![Equipment slots multiselect, selected classes and inline Icon ID paste box](screenshots/item-form-multiselect-slots.png)

![Closest icon choices appear within Icon ID only after a paste](screenshots/item-form-inline-icon-paste.png)

No icon crop is uploaded, no new artwork/IDs are introduced, and the regular
article screenshot controls remain separate. The full finder mode remains
available to existing non-form callers. The user explicitly replaced the
initial checkbox idea with multiselect dropdowns for both fields. This candidate
does not change the Character inventory slots or retired capture flow.
