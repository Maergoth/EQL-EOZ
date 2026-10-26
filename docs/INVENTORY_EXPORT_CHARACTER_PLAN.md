# Character inventory export and observed statistics

## Achievement extension

The current walkthrough combines inventory and achievements. Run
`/outputfile inventory` and `/outputfile achievements`, then click one
**Import files** button to read both matching character files from the configured
game folder, with native picker fallback. Both records commit atomically.
Automatic inventory polling and separate import buttons are retired.
The [current walkthrough](CHARACTER_WALKTHROUGH.md) and
[achievement contract](CHARACTER_ACHIEVEMENTS.md) supersede conflicting details
in the historical inventory-only plan below.

## Current request and priority

This replaces the unreleased 0.9.7 baseline-retry design. Do not ship that older
walkthrough or its screenshots. The user explicitly requires this sequence:

1. Enter character name, race, server, classes, level and AA count.
2. Keep all equipment on and type `/outputfile inventory` in the game.
3. Automatically detect a fresh matching `Name_server-Inventory.txt` and import
   its known worn gear. Prominently instruct **Open your Inventory → Scroll down
   → Click off your buffs**, then read the whole fully equipped, unbuffed stat
   panel including Additional Modifiers. Offer Contribute for missing wiki items.
4. Review, save or share the character. Never request an unequipped baseline,
   add gear stats to totals, or OCR equipment items into Character.

Item OCR is for Contribute, never Character gear intake. Unknown inventory
items/augments are rejected from public equipment and leave slots/sockets empty;
non-blocking missing-wiki prompts ask the player to open an examine window for
reviewed contribution. Sync accepted wiki data and re-export to add them later.
Optional capture runs at a lower **1 FPS** cadence for stable stats/examine
panes. The selected character also has a red Clear inventory action; other
characters and contribution drafts are independent.

## Critical context and ownership

Starting release: 0.9.6/main `8181472621c8dffb9c00d10809894737a53c7db7`.
Working branch: `codex/inventory-export-contributions`.
Version 0.9.7 is unreleased. Prior 0.9.6 packages and history are immutable.

| Owner | Files and responsibility |
| --- | --- |
| Root | `app/capture-workspace.js/css`, Character native fixture, public share/PNG integration, docs/history/media/release. |
| capture_pipeline_089 | `desktop/inventory-file-host.cjs`, main/preload IPC and tests; lower capture cadence, source watchdog and source/host pure tests. |
| character_model_089 | `app/character-model.js`, `character-walkthrough.js`, `character-totals.js` and tests: atomic inventory import, observed current totals, new flow, migration and clear. |
| baseline_recovery_review | `app/inventory-export.js` and synthetic parser tests; coordinate result schema with model agent. |

Read `README.md`, `CONTRIBUTING.md`, the existing capture/Character guides and
this plan before editing. Preserve optional local capture, offline OCR, source
ownership, wiki authentication and reviewed publishing, all unrelated overlays
and maps, and the dirty user checkout in `D:\EQLWiki`.

## Observed export format

The actual local export was inspected read-only. Fixtures must be synthetic.
The first section is tab-separated `Location, Name, ID, Count, Slots`, with 23
worn rows (including repeated Ear/Wrist/Fingers/Any Slot), followed by General
bags/nested locations, Held, Bank, SharedBank and Personal-Depot storage. Depot
rows retain their locations and counts as private stored items, never worn gear;
their container/socket children follow the same catalog classification rules.
A blank line then introduces
`KeyRing, Name, ID`; its Equipment/Augmentation rows are keyring entries and must
never be mistaken for worn gear. Empty/id-zero rows are explicit empty slots.
The Slots column is ambiguous and does not establish augment capacity. Preserve
IDs, counts, exact locations, physical duplicates and literal trailing tiers.

## Contracts

- Exact-main desktop `eyeOfZommInventory.read({name,server,chooseFile?})` reads
  only the configured game root automatically, or an explicitly chosen native
  file. No renderer-provided paths. Return bounded decoded text and public file
  metadata `{name,bytes,modifiedAt,sha256}`, never a full path.
- The inventory step polls local files only while its explicit walkthrough is
  active. Auto-import a newly generated matching file; offer file selection when
  absent. Guard all async work by selected profile/session/epoch and stop polling
  on navigation, cancellation and disposal.
- Pure `parseInventoryExport` returns a validated complete gear table plus
  separately classified inventory/keyring entries. Malformed imports leave the
  saved inventory and equipment intact. Never infer worn slots from a keyring.
- The model stores a reviewed `statSnapshots.current`. Legacy base/equipped
  evidence stays private and never becomes final stats automatically. All UI,
  PNG and wiki totals use only current observed values; missing values stay
  unknown. Individual item previews never feed the character totals. Maximum
  resource values appear once; AC/ATK components and all ten Additional Modifiers
  retain separate observed fields, including Accuracy bonus versus ATK Accuracy.
- New flow: `details → inventory → stats → review → complete`. Legacy active
  walks migrate to inventory with cards/metadata preserved. Current-source,
  generation, capture time/sequence and explicit import token guards remain.
- Wiki gaps use the complete cached presence catalog. An unavailable/incomplete
  cache means unknown, not definitely missing. Create drafts and ask for an
  examine; never publish automatically or interrupt the game.
- Clear inventory removes this character's gear, loose items, export evidence
  and now-mismatched current stat snapshot, retaining identity and other profiles.

## Checks and evidence

Run synthetic parser/model/controller/security tests, native flow and lower-rate
capture tests, then exact-head Windows/Linux gates. Capture new actual synthetic
screenshots for 0.9.7; remove the unreleased baseline-retry tour. Public package
acceptance and live-game evidence remain separate. The display-only wiki template
update for observed modifiers is prepared separately and must not publish before
final release coordination. No test talk pages, account data, uploads or schema
writes are part of acceptance.

Private audit/evidence: `D:\EQLWiki\.local\validation\eoz-inventory-export-097`.
The prior private `eoz-baseline-stall-097` findings remain diagnostic history.

## Integration acceptance

Local full source/audit and native Character/main-workspace/restart gates pass;
see VALIDATION.md and CONTRIBUTION_EVIDENCE_PLAN.md for the observed boundaries.
The latest flow never starts item OCR from Character. Log evidence is independent
of screen-reading opt-in, and exact base/tier reads enrich existing contribution
drafts. Source changes clear old zone/location/kill/encounter attribution.
Public release and exact-head CI remain separate gates.
