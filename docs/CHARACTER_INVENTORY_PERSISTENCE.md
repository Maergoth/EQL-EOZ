# Character tier controls and durable inventory

## Current request and context

Follow-up to published 0.9.4, source main
`1596770cd5ed7cf922c57bd973ed49f4f1070d14`. The selected item's tier changes
often: show its slider in the main details, outside Edit captured values.
Inventory must survive app and capture sessions. Automatic screen reads should
update one item by default; additional physical copies are explicit manual
actions. Preserve prior saved/manual cards and reviewed observations.

Work branch: `codex/character-tier-persistence`; target 0.9.5, never
replace published 0.9.4. Standing owner release authorization applies after
source/native/platform/public-package verification. No installed profile or
player screenshot is a fixture; keep wiki/game files and unrelated work intact.

## Critical context after compaction

- `app/capture-workspace.js/css`: selected editor, tier controls, intake and
  phase/source checks. Root owns UI/integration.
- `app/character-model.js`, `character-walkthrough.js`: saved cards, explicit
  physical copies, manual corrections, bounded evidence/removals, capture-time
  windows and session selection. Model agent owns these and unit suites.
- `desktop/main.cjs`, `desktop/preload.cjs`: actual process/storage boundary,
  loopback server origin and cache handling. Persistence agent audits these.
- `scripts/test-character-walkthrough.mjs`, `test-capture-workspace.mjs`:
  synthetic native flow/remount tests. Native agent owns both; reserve actual
  process-restart persistence for the desktop agent's separate fixture.
- `docs/CHARACTER_WALKTHROUGH.md`, `docs/design/CHARACTER_CAPTURE.md`,
  `docs/CHARACTER_INVENTORY_REVIEW.md`: prior contracts. Preserve known-only
  equipment, source/session/base freshness and raw OCR evidence.
- `docs/RELEASE_HISTORY.md`: archive new actual synthetic screenshots; preserve
  older media, package source/OCR checks and a fresh shared dataset.

## Ownership and decisions

| Owner | Scope |
| --- | --- |
| root | UI/CSS, integration, plan/docs, version/history/PR and publication |
| character_model_089 | Model/walkthrough dedupe and unit tests |
| capture_pipeline_089 | Actual restart/storage audit and desktop-only fix/test if needed |
| wiki_contribution_089 | Native Character/workspace fixture updates |

Agree APIs before integration. Keep screen-read dedupe separate from manual
catalog Add/Second copy. A canonical identity may match across capture sessions
and changing tiers, but ambiguous explicit copies cannot silently overwrite one
another. Do not auto-delete legacy or manual physical cards without reliable
provenance. New session/walkthrough actions must retain the inventory; a new
baseline still requires the explicit fresh No Equipment phase.

## Acceptance

- Main selected-item tier slider is visible with the advanced editor closed,
  keyboard accessible, immediate and persistent. Stat calculations retain
  observed/catalog provenance and do not silently rescale captured values.
- Inventory, metadata, equipment and reviewed changes survive actual app exit
  and relaunch, not just remounting one page at the same origin.
- Repeated OCR IDs/frames, tier changes and fresh capture sessions reuse the
  automatic item card. Removing a card still blocks stale replay.
- Manual additional copies remain distinct; uncertain selection between copies
  requests review without inventing another automatic card.
- No normal log/capture ownership/base freshness regression. Native fixtures
  use disposable profiles, synthetic records and loopback services only.
- Final source/native/platform checks and public package verification precede
  publication claims. Exact run IDs/receipts belong to the PR/private ledger.

## Confirmed persistence and removal audit

The released desktop server normally uses `http://127.0.0.1:53147`. It chooses
an ephemeral port only when that port is occupied. The main renderer uses
Electron's default session, but browser localStorage is still origin-specific:
a different port exposes a different storage area. The prior Character fixtures
proved reload/remount at one origin; they did not prove inventory across a real
process restart with a changed port. Cache upgrade handling calls `clearCache`,
which clears HTTP cache, not DOM storage. It is not evidence that an upgrade
deleted inventory. See the [HTML storage standard](https://html.spec.whatwg.org/multipage/webstorage.html#dom-localstorage)
and [Electron session methods](https://www.electronjs.org/docs/latest/api/session#sesclearcache).

The isolated three-process native test reproduces this distinction: an ordinary
origin-only marker survives restart at the same port and disappears at a forced
fallback origin. The new private file preserves Character and walkthrough values
in both cases, including the actual Character identity and equipped-item DOM.
This uses a disposable profile, synthetic game/log folder and an occupied
fixture port; it never reads or changes the installed player profile.

An independent cause of missing cards was a removed-name ignore lasting through
an entire walkthrough. A held tooltip must not immediately recreate an X-removed
card, but a later deliberate reading pass must be able to recover it. Ignores
now retain removal time and phase/source/generation boundaries, rather than
permanently hiding a name for that walkthrough. This is separate from OCR
recognition and does not claim that every unobserved tooltip was readable.

## Current 0.9.5 behavior

- The selected item's tier slider and fractional progress are above the closed
  advanced editor. Updates keep the same focused control and surrounding scroll
  position. Unknown tier/progress stay explicit; tier 10 uses progress zero.
- Changing tier previews known catalog base values, with modified values green.
  Original observed stats/text/evidence and observed tier/progress remain
  separate. **Use captured stats** restores that basis. Missing base data,
  unknown progress and unsupported conditional Void scaling remain unknown or
  visibly unavailable; the catalog never invents observed numbers.
- Eligible automatic reads reuse a unique matching saved item across journal
  rereads, source sessions and tier changes. Older evidence cannot overwrite a
  newer observed value; reviewed edits and deliberate nulls remain protected.
  A different tier is not proof of another physical item. **Add to inventory**
  and **Second copy** explicitly create separate cards. Multiple possible copies
  require a choice and produce no third automatic card; the choice is rechecked
  against current identities and capture/removal context before merging.
- Inventory IDs survive a new walkthrough. Starting one deliberately clears its
  equipment layout and No Equipment baseline, not its saved cards. Normal
  remount/relaunch retains the existing layout until that explicit action.
- The board has 25 slots: 23 normal slots plus **Any 1** and **Any 2**. Either
  universal slot accepts a known cached item by deliberate placement. Normal
  slots enforce compatibility, with no force override. Unknown identities cannot
  equip anywhere. Occupied compatible slots ask before replacement. Automatic
  placement never chooses a universal slot or displaces another card.
- Removing an item blocks held/queued rereads from that same pass, including OCR
  tier fluctuations. A fresh eligible phase, resumed source generation or
  **Rescan removed items** can recover it from a newly captured frame. Rescan
  starts a new time boundary; it does not re-admit pre-removal journal entries,
  queued pre-Rescan frames or a pending old manual import. It does not open Base
  to item intake or bypass current owner/session/source/generation checks.
- Dragging preserves source/slot DOM through incoming reads, highlights valid
  targets and restores current content afterward. Invalid targets do not create
  a confirmation route around the model.

## Private durable storage boundary

`desktop/character-storage.cjs` owns the fixed
`userData/eye-of-zomm-character-storage.json` file. The preload bridge
`eyeOfZommCharacterStorage` exposes only `read()`, `write({key,value})` and
`flush()`, restricted to the exact trusted main window/root frame. It accepts
only `eql-eye-of-zomm-character-v1` and
`eql-eye-of-zomm-character-walkthrough-v1`, each bounded to 1,500,000 UTF-8 bytes.
One active atomic, synced write and one coalesced current state bound pending
work; normal Quit drains accepted writes and flushes DOM storage.

`app/character-storage.js` reads this store before mounting Character. A present
file key is authoritative, including a null deletion tombstone. Only a missing
key may be seeded from the current origin's legacy localStorage. A browser mirror
remains for rollback/recovery; contributions, OCR calibration and other browser
preferences retain their existing stores. Writes start immediately and errors
warn visibly. An unreadable/corrupt existing file is preserved, gets at most one
bounded recovery copy when possible, and is write-blocked. Local edits remain
usable; they cannot silently overwrite that damaged file.

The renderer separately checks that each stored inner value is a JSON object
with supported `schemaVersion:1`, before migration or browser mirroring. A
malformed/unsupported inner entry blocks set/remove for that key and retains its
original host or legacy-browser bytes with a warning. A valid outer wrapper must
not turn an unreadable inventory into an automatically saved empty one.

Migration does not scan abandoned earlier ephemeral origins. Data there remains
untouched and may require explicit recovery. Ordinary relaunch/cache upgrade is
tested; sudden power loss, a killed process before a write is accepted, every
filesystem failure and installed-player recovery are not certified by this
fixture. Inventory remains bounded to 120 cards; full/oversized additions are
refused rather than silently deleting existing physical cards.

## Validation and release boundary

- `node tests/character-storage.mjs`: renderer migration, file authority,
  tombstones, bounds, corruption and asynchronous write-failure warnings.
- `node tests/character-storage-host.mjs`: exact-main IPC, key/byte bounds,
  coalesced atomic saves, immediate-close draining, corruption preservation,
  one recovery copy and retryable write failure.
- `node scripts/test-character-storage.mjs`: three actual Electron/main/preload
  processes, same-origin restart, cache upgrade, occupied-port fallback, exact
  file values, restored Character DOM and denial of foreign-frame operations.
- Model/walkthrough tests cover cross-session dedupe, explicit copies, older
  observations, preserved corrections, strict/universal slots and bounded removal
  passes. Native Character/workspace gates cover trusted keyboard tier edits,
  focus/scroll retention, 25-slot layouts, preview provenance, Rescan, copy choice,
  source/base guards and reviewed sharing with synthetic/loopback data.

These local checks passed for the 0.9.5 working tree, along with the full source
suite, dependency audit (zero vulnerabilities) and production catalog check.
The release owner retains exact-head CI, platform/package and anonymous public
download receipts. No new release is claimed by this document. Prior evidence
in the linked guides remains historical; neither synthetic fixtures nor this
storage audit certify all skins, live transient capture throughput, native
Wayland, production wiki writes or exact server-derived equipped totals.
