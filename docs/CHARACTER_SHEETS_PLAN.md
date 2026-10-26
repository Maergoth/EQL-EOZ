# Character inspect sheets and wiki sharing

## Current 0.9.8 override

The historical 0.9.6 implementation plan below remains as a receipt. Current
0.9.7+ Character totals use only confirmed recorded fully equipped statistics;
catalog, tier, Exaltation and legacy baseline values never add to them. The
0.9.8 candidate adds bounded rich card `details` to the existing schema-1 flat
parameters, calls sockets Exaltations, defaults unknown capacity to five while
preserving observed capacity through eight, and targets new interactive shares
to the authenticated account's **User:Name** page. Old talk-page sheets remain
untouched; persisted destination changes require fresh review. See
[the current walkthrough](CHARACTER_WALKTHROUGH.md) and
[release/activation plan](RELEASE_098_PLAN.md). Source implementation is not proof
that the updated helper/templates/schema or public package are installed.

## Request and accepted layout

Use the compact in-game inventory as the reference for Character and its shared
wiki view: character identity, dense equipment icons, and one totals panel.
Show maximum HP, mana and endurance, not changing current resource values. Keep
mitigation/evasion AC and offense/accuracy distinct. Tier is editable; individual
item fractional progress is not captured or requested. Remove Power Source;
retain two Any slots. Existing Power Source cards must remain in Inventory.

On the account's User_talk page, each Character (Server) has an independently
collapsed, expandable inspect sheet. Items link to their canonical wiki articles.
Sharing again replaces only the same character's managed sheet. Preserve other
characters and all unrelated talk-page content. Local PNG export remains useful;
wiki sharing should publish structured equipment, rather than append screenshots.

## Source map and ownership

- App checkout: `D:\EQL-EOZ`, branch `codex/interactive-character-sheets`, based on
  released 0.9.5. Character model/catalog/inventory view: character_model_089.
- App share backend/export: capture_pipeline_089 owns
  `desktop/wiki-client.cjs`, `desktop/wiki-host.cjs`, preload exposure and focused
  client/export tests. Root owns `app/capture-workspace.js`, local PNG layout,
  shared totals presentation, styles, integration checks and release notes.
- Wiki checkout: `C:\Users\ryan\.codex\worktrees\eoz-export-contract\EQLWiki`,
  branch `codex/interactive-character-sheets`, based on `origin/staging`.
  wiki_contribution_089 owns renderer/template, relevant registration, tests and
  wiki component/operation documentation. Do not edit the dirty D:\EQLWiki tree.
- Existing Magelo PHP is unregistered historical code. Inspect the actual
  runtime before reusing anything. The active EQLImmersive item hover uses
  `span.ih a`; ItemLevelSlider owns tier math. Reuse current template/hover
  contracts where appropriate, not historical Magelo SQL or calculations.

## Publication contract

Use `{{Character_sheet|schema=1|name=...|server=...|...}}` with hand-editable flat
parameters. `total_<lowercase stat key>` contains one equipped value; each of the
24 named equipment IDs accepts `_item`, `_tier`, `_icon`, `_stats`,
`_augment_slots`, and `_augment_1..8_item/details`. Exaltation parameters contain
only identity and direct effect metadata (including Focus effects); their tier,
icon, numeric stats and unrelated item details remain in the compatible private
schema-1 DTO and model. Parent equipment parameters are unchanged. Only existing numeric
wiki icon IDs are emitted. Host code validates and serializes;
renderer-supplied raw wikitext is not an edit authority. Exclude OCR text, paths,
capture sessions and loose inventory. Use existing wiki item icon IDs/artwork;
do not upload game assets or add a new per-view database/search fanout.

The shared schema/serializer and guarded block replacement live in
`app/character-wiki-sheet.js`; `app/character-totals.js` supplies the same totals
selection to Character, PNG and wiki review. The host exposes
`wiki.characterSheetCapability()` and `wiki.shareCharacter({sheet,caption,
confirmed,shareId})`. It checks both database template version markers and an
unsaved API parse containing the component and its registered skin module before
publishing. The wiki changes use two tracked templates and a conditional
EQLImmersive module; no Magelo extension or new authentication system is enabled.

The app must check that the target wiki supports the renderer before publishing.
Use authenticated own-page edits with `assertuser`, a fresh page revision,
conflict protection and deterministic per-character markers. Retry uncertain
writes by checking the current managed block. Refuse ambiguous or malformed
markers rather than deleting talk content. No automatic contributions or wiki
page edits during capture. Keep a single explicit share review.

## Work and evidence checklist

- [x] Remove Character progress controls/imports while preserving observed stats.
- [x] Remove Power Source and prove old gear becomes loose inventory.
- [x] One compact totals view in Character and local share export; maximum
  resources only, component AC/attack retained, honest unknown/partial values.
- [x] Finalize and implement wiki contract, collapsed multi-character view and
  clickable item inspect behavior; update this document with exact paths/schema.
- [x] Authenticated per-character upsert, account boundaries, edit conflicts,
  uncertain-write retry, Unicode identity, malformed blocks and escaping tests.
- [x] Source/model/DOM checks and sequential native integration fixtures using
  isolated synthetic profiles. Local MediaWiki parse uses unsaved synthetic
  content; do not use production writes as a test.
- [x] Capture real synthetic UI screenshots for the app's next What's New;
  preserve all published 0.9.5 artifacts and history.
- [ ] App PR targets main. Wiki PR targets staging. Report actual checks and
  activation limitations separately from deployment claims.

## Wiki activation boundary

Git deployment does not create database templates. If a template is required,
track its reviewed source and a guarded publication procedure, with a fresh
private backup and expected revision immediately before any authorized write.
Do not merge the entire staging branch into production. A source push does not
install host scripts or configuration. Complete reviewable code and PRs before
requesting any additional activation approval the final concrete design needs.

## Current status

The full app source suite passes. The actual native walkthrough passes with the
24-slot board and one total panel. Wiki tests parse both templates in the local
MediaWiki parser without saving pages and then exercise the parsed DOM. Native
capture/workspace and deterministic actual-canvas PNG checks pass. Six reviewed
version-owned captures are archived for 0.9.6, with older history unchanged. The
actual app serializer also passes 182 checks through unsaved MediaWiki parsing.

User follow-ups included clickable indexed augment sockets (any known item kind,
including weapons in armor), quiet item tooltips, and empty equipment slots that
open Add item with focused filtered wiki search, a tier slider and explicit
clipboard/file screenshot OCR. Augment deltas retain original examine evidence
and prevent counting an already included augment twice. Explicit clipboard reads
use the existing local OCR pipeline; capture never polls the clipboard. New
picker epochs prevent a canceled picker from acting on a later one.

Staging activation passed source/hash, private-backup, revision/create guard,
live capability and responsive component checks. Its template revisions are
199101 (helper) and 199102 (main). Production activation and public package
receipts are tracked in the linked PRs rather than inferred from source pushes.
Private synthetic evidence is under
`D:\EQLWiki\.local\validation\eoz-character-sheets-096`.

Wiki review: [EQLWiki PR #58](https://github.com/Maergoth/EQLWiki/pull/58),
targeting staging at reviewed head `62d7b6bad1a5c46b5cca23368d767805c7120c3f`.
The final full source suite, dependency audit, catalog relevance, native workspace
(including canceled/late modal imports), native walkthrough and real canvas
exports pass locally. Public release and wiki activation remain separate gates.

Production promotion uses only the reviewed component and a narrowly tested
publisher newline normalization fix: [EQLWiki PR #59](https://github.com/Maergoth/EQLWiki/pull/59).
App review is [EoZ PR #19](https://github.com/Maergoth/EQL-EOZ/pull/19).
Final review also covers observed augment recapture rebasing (including offline
projections and protected manual fields), initial screenshot status replies
across character/picker cancellation, and literal wiki behavior-switch text.
The actual serializer/PST roundtrip now passes 186 checks; raw behavior switches
are a negative control, while escaped caption/identity text stays literal.
