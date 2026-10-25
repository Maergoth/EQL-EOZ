# Chat discoveries and automatic Contribute reading

0.9.11 follows published 0.9.10. Source branch: `codex/chat-log-item-fallback`.
The owner requested diagnosis of a missed chat item, automatic gentle
screen reading while **Contribute to Wiki** is open, and automatic creation
after a new item's fresh examine reading when no near duplicate exists. Later
steering authorizes automatic append-only drop-source updates from actual loot
logs, including witnessed recent-kill inference and confident fuzzy titles. This record keeps the
implementation and publication boundaries explicit across context changes.

## Observed problem

The later [item-boundary correction](CHAT_ITEM_BOUNDARIES.md) supersedes the
permissive standalone plaintext admission described by this historical release
record. Unknown unmarked ranked prose stays quiet; genuine encoded links remain
supported, while known typed catalog names or explicit item markers establish
plaintext boundaries.

An installed 0.9.10 game log retained a tier-decorated item chat message as
plain text, without the encoded link delimiters expected by `parser.js`.
The current private cached catalog lacked the item. Its local contribution
queue also already held a draft; repeat suppression must remain intact.
Actual player chat, paths, profile records and screenshots stay private.

The sanitized reproduction is:

```text
[Sun Oct 25 00:02:53 2026] Exampleplayer tells General:1, 'Example Gauntlets +5'
```

## Scope and acceptance

- [x] Recognize conservative tier-decorated item mentions inside supported
  chat wrappers when the client removes link encoding. Preserve genuine
  encoded links. Do not infer arbitrary unranked prose, combat, spell or system
  messages as new items. A plain mention is a proposal, not proof of a link.
- [x] Retain complete-catalog, freshness, canonical identity and durable
  queued/submitted/ignored suppression. Never turn chat into loot/drop-source
  facts, uploads or article prose.
- [x] Entering Contribute starts a low-frequency local reader using the safe
  configured/unique game source, or shows the source picker in place. Prompt
  users to open the selected item's complete examine window.
- [x] Preserve Character ownership and preexisting readers. Stop only the
  workspace-owned reader on exit, unless an explicit pending discovery still
  needs it. Pause, cancellation and failure do not cause restart loops.
- [x] Fresh matching item observations populate unedited proposal fields.
  Preserve manually entered/reviewed fields and existing screenshots/icons.
- [x] Prepare a cropped item screenshot from the accepted frame, with bounded
  native session/source/generation identity. Avoid attaching a later preview
  or unrelated full desktop. Offer isolated icon matching when available;
  ambiguous artwork remains a choice.
- [x] Automatically create only a genuinely missing item page after fresh,
  matching native examine evidence and a successful live exact/redirect/near
  duplicate check. Incomplete/conflicting evidence, existing pages and ambiguous
  matches remain in the normal review flow. Preserve account attribution,
  create-only/revision guards, idempotent uncertain-write handling and the
  required tier-zero verification note for reverse-calculated statistics.
- [x] Automatic creation may include the bound item screenshot. It cannot
  change existing items, reciprocal sources, monsters, zones or spell pages.
  Those updates keep their ordinary review. Show the canonical created-page link.
- [x] Pause, navigation, dismissal and actual contributor edits can cancel the
  automatic attempt before submission. Do not retry ambiguous or partial writes
  repeatedly from OCR heartbeats.
- [x] Native log reads authorize append-only source updates for existing item,
  monster and zone pages. Preserve prior sources, stats and prose. A missing
  monster stays a redlink on the item; do not create monster/zone pages.
- [x] Initial replay and renderer-proposed log events cannot authorize writes.
  Inference requires the corresponding fresh native kill in the same log, zone
  and instance within 60 seconds. Pets/players and ordinary chat cannot establish drops.
- [x] Persist relationship-specific receipts so a later different monster adds
  its source instead of being suppressed by whole-item completion.
- [x] Run focused parser, capture ownership/evidence and renderer checks.
  Record actual observations and remaining live-game limitations.
- [ ] Push and attach a reviewable PR. Source completion is separate from
  installer publication and installed-app verification.

## Component ownership

`app/parser.js` owns chat admission; `wiki-discovery.js`,
`contribution-queue.js` and `contribution-evidence.js` keep identity, suppression
and evidence boundaries. `capture-workspace.js` owns Contribute activity,
prompts and proposal application. `automatic-item-contribution.js` coordinates
native new-item preparation/submission. `automatic-log-reader.cjs` witnesses
actual configured-file byte windows; `automatic-loot-sources.cjs` validates
canonical append-only plans and attributed updates. The native capture host and attachment store
own exact-frame pixels and local evidence capabilities. `icon-finder.js` owns
local artwork fingerprints and the bounded public icon-index lookup.

Use the existing one-second image sampling and two-second scene fallback;
never overlap OCR work or increase capture frequency for this feature.
Images remain local until an eligible automatic new-item creation or the
ordinary reviewed wiki publication action. Automatic creation is a separate
narrow native gate; it never bypasses duplicate checks through renderer flags.

## Later source evidence

Named-corpse loot, or loot correlated with a witnessed recent kill in the same
native log/zone/instance, can automatically append a source. An ordinary item
mention, nearby combat without a kill, or merely sharing a zone is insufficient.
Existing sources stay intact; granular receipts prevent duplicates without
suppressing later different monsters. The reciprocal wiki display resolves a
redlinked monster when its page is created later. Ambiguous titles and conflicts
remain available for review.

## Validation and publication record

Source implementation is complete. Focused parser, native capture/attachment,
automatic item (real host/client with synthetic transport), append-only source,
actual-byte log witness, receipt persistence and actual Chromium lifecycle/
cancellation/preview checks pass. The release/version/history contract passes;
one actual synthetic Chromium image is archived and visually reviewed. No
live wiki test write or physical-game automatic write is claimed.

Limitations: automatic item images/creation require a reliable detected visual
item pane; broad calibration rectangles and undetected white examine layouts
retain manual image/review options. Known augments, conflicting/low-confidence
readings, duplicate ambiguity and missing effect-page work defer to review.
Unsupported reverse-scaled values remain blank, and tiered inferred bases keep
the tier-zero note. Log source inference defaults to normal instance and needs
a native witnessed kill within60seconds when the corpse is not explicit.

Packaging uses the existing basic release path: essential source, native launch,
focused ownership, catalog, exact ASAR/media, signing/checksum and both-platform
publication gates. No producer dataset refresh or extended UI reruns are added.
Installer/publication receipts are pending; installed profiles are untouched.
