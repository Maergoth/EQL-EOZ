# Eye of Zomm 0.9.9 — contribution and inventory clarity

Baseline: published 0.9.8; app main 5df1aad7438025a1fe7d6151310f7fd12d3a1160.
Work branch: codex/0.9.9-contribution-clarity in D:/EQL-EOZ.
Owner request 2026-10-24: fix photographed contribution and Character UX defects.
No dataset regeneration or wiki schema changes are needed.

## Work and ownership

- [x] I1 (identity_gap_fix): case-forgiving canonical presence, flat membership dedup,
  terminal Exaltation base-item presence, Backpack* export placeholders; retain
  genuine page ambiguity and protected drafts.
- [x] U1 (root): match cards place Use this page below title, dedupe local/live
  results, plain destination confirmation, explicit ex. placeholders.
- [x] U2 (root): Page Type > New Page / Update Page tags, gap category filters,
  new monster/item priority, filtered previous/next navigation.
- [x] U3 (root + reciprocal_gap_updates): existing-page updates show identified gap,
  exact additions and compact relevant fields; optional other edits collapsed.
- [x] W1 (reciprocal_gap_updates): source updates reach item + NPC + relevant zone,
  preserve actual normal/raid formatting, canonicalize, one CAS plan per page,
  idempotency/attribution and partial retry remain enforced.
- [x] C1 (character_tooltip_polish + root): numeric tier slider only, +# slot badge
  updates in place without destroying focus, 350ms cancellable item hover,
  compact named Exaltations with underlying evidence preserved.
- [ ] R1 (root): targeted regressions and actual synthetic native UI captures at
  normal/large font, full required CI gates, illustrated release history/README.
- [ ] R2 (root): PR, review, exact-head platform checks, merge/release 0.9.9,
  public assets/checksums/update selection verification. No new dataset pull.

## Source map and contracts

Identity: app/wiki-identity.js, contribution-reasons.js, contribution-queue.js,
inventory-export.js, character-catalog.js. Editor/layout: contribution-editor.js,
new contribution-presentation.js, capture-workspace.js and capture-workspace.css.
Planning/patches: contribution-update.js, contribution-model.js and
desktop/wiki-client.cjs. Character: character-inventory-view.js,
character-inspect-view.js and capture-workspace.js handlers.

Character totals remain only the recorded stat sheet. Unknown historical tiers
remain evidence; users choose numeric 0–10 going forward. Never auto-publish
articles or remove protected work. Existing wiki pages use revision guards and
an explicit final reviewed multi-page diff. Keep real game/profile data private.

## Progress/evidence ledger

2026-10-24: read app contracts and wiki repository instructions. Created branch
from fresh origin/main. Three independent implementation streams assigned.
Confirmed badge query is small while actual rendered badge is span[data-item-tier].
Confirmed current resolver treats cached spelling variants as competing pages;
existing match markup is a wrapping inline row and update editor always shows
creation fields. Baseline0.9.8 completion receipts remain historical evidence.

Update this file and .local/plans/CHECKPOINT_099.md before compaction. Do not
mark release complete until its actual public artifacts and platform gates pass.

2026-10-24 implementation acceptance: source suite passes; focused identity/import
and canonical reciprocal planner checks pass. Existing bootstrap audit of 11,321
ordinary items plus NPCs/zones found zero changed ordinary identity outcomes.
The focused actual Chromium fixture passes matching layout/dedup, seven gap
filters/priority, targeted existing-page source details, manual source dedup,
include/exclude summary, filtered Ignore navigation, numeric tier/in-place badges,
350ms real-pointer delay and adjacent-hover cancellation at ordinary/large text.
The full actual main/preload fixture passes loopback-only reviewed three-page
plans, persisted partial retries, attribution, inventory/state and recorded-only
totals. Its previous two-page expectations were updated for the intended third
zone edit; an explicit completed-live-match marker replaces an obsolete text wait.

Three version-owned synthetic screenshots are visually reviewed; all historical
images/hashes remain immutable. Required Windows/Linux source/native/package
CI is still a separate gate, as is public0.9.9 publication. No production article
test writes, live-game recapture, installed profile edits or dataset producer
run occurred. Safe untouched old false gaps reconcile automatically on startup;
edited/partial work remains protected. Ambiguous wiki pages or unsupported zone
layouts require explicit resolution rather than silently inventing formatting.
