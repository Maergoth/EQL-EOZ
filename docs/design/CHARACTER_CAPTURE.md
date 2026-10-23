# Character capture data and share image

The Character tab uses `app/character-model.js` for local editable data and
`app/character-share.js` for a deterministic canvas PNG. Capture arbitration,
OCR, authentication, clipboard/save and own-talk submission belong to their
separate services. These modules never open a source, read game memory, submit a
wiki edit, load remote artwork or interpret an item's text as markup.

## UI contract

```js
import {
  CHARACTER_SLOTS, createCharacterModel, characterObservationInput,
  characterItemStats, characterSlotCompatibility, characterShareSummary
} from './character-model.js';
import { renderCharacterShare } from './character-share.js';

const character = createCharacterModel({ storage: localStorage, onWarning });
const result = character.intake(observation, {
  wikiItem: matchingCachedItem, // optional; its stats are catalog base values
  icon: cachedPack.icons[matchingCachedItem.iconId] // optional raster data URL
});
character.assign(result.candidate.id, 'finger1');
character.setStatSnapshot('base', {
  stats: characterObservationInput(statObservation).stats,
  evidence: statObservation, confirmed: false
});
const rendered = await renderCharacterShare(character.snapshot(), {
  appearance: savedAppearance,
  resolveIcon: id => cachedPack.icons[id] // local cache only
});
// Review rendered.canvas/dataUrl, then send the PNG to the trusted share host.
```

Mutation results contain `ok`, `error` on failure, and `saved` when saving was
attempted. `saved:false` means the current in-memory change exists but could not
persist. An `onWarning` callback explains failures without stopping the model.
Pass `storage:null` for an isolated fixture. Reads and snapshots are copies.

| Method/export | Contract |
| --- | --- |
| `snapshot()` | Version-1 JSON state: metadata, candidates, equipment, statSnapshots and updatedAt. Keep this local. |
| `intake(observation, {wikiItem?, icon?})` | Returns `{ok,candidate,deduplicated,saved}`. A removed replay returns `{ok:true,ignored:true,deduplicated:true,candidate:null}`. Accepts `observation.item` or capture parser field-array proposals. |
| `updateCandidate(id, patch)` | Edits reviewed fields, without replacing the physical-copy ID or evidence. |
| `duplicateCandidate(id)` | Explicitly creates another physical copy with its own ID and no claimed capture evidence. |
| `removeCandidate(id)` | Removes a card and its assignment. |
| `assign(id, slotId, {replace?,allowIncompatible?})` | Moves the same copy between slots. Occupied/incompatible/unknown slots return `needsConfirmation:true` until the caller explicitly enables the relevant override. |
| `unassign(slotId)` | Clears the slot and keeps the inventory card. |
| `setMetadata(patch)` | Name, server, level, race, up to three classes, named session. Unknown numeric level is null. |
| `setStatSnapshot('base' \| 'equipped', value)` | Value is `{stats,confirmed?,evidence?,at?,notes?,label?}`. Null clears a capture. `base` means observed **No Equipment**. |
| `totals()` | Separate captured `base`/`equipped`, derived item sums with per-stat completeness/unknown-card IDs, empty slots and warnings. |
| `reset()` | Clears character state and retains bounded replay-removal markers. UI should offer clear confirmation/recovery as appropriate. |
| `characterItemStats(candidate)` | Effective item values with basis, completeness, uncertainty and warnings. |
| `characterSlotCompatibility(candidate, slotId)` | Returns compatible/unknown/warning. Both ear slots accept EAR, both wrists WRIST and both fingers FINGER. |
| `characterObservationInput(observation)` | Converts the shared capture parser's immutable `{fields:[{key,value,...}],subject}` proposals into an editable item/stat input. |
| `characterShareSummary(snapshot)` | Shareable JSON, deliberately excluding raw text, capture/session identifiers, source images and unassigned inventory. |

`CHARACTER_SLOTS` contains 23 stable IDs, including charm and power source:
`charm,ear1,head,face,ear2,neck,shoulders,arms,back,wrist1,wrist2,range,hands,
primary,secondary,finger1,finger2,chest,legs,feet,waist,ammo,power`.
Each has an English label and catalog slot kind. The UI can use exactly the same
assign operation for drag/drop and keyboard-accessible card + slot selects.
Replacement returns the displaced card ID; that card remains in inventory.

## Item and observation semantics

Each card retains name, wiki title/match state, exact icon ID, compatible slot
kinds, nullable tier, fractional tier progress, required level, catalog base
stats, observed examine stats, completeness flags, augments and bounded evidence.
Fractional progress is nullable: an unread value stays null, while an explicitly
reviewed zero remains zero. Unknown progress is shown in sharing and kept distinct
from zero during variant matching. Catalog-only values remain unknown until both
tier and progress are known; observed examine values are still usable unchanged.
Bounded `unscaledStatKeys` metadata retains known catalog base values whose
tier adjustment lacks required context. Those derived values stay null above
tier zero; direct observed examine stats still take precedence. The Character
catalog currently uses this for conditional SV Void scaling. See
[catalog search and base recovery](../CHARACTER_CATALOG_BASE_RECOVERY.md).
`wikiMatch` is `suggested`, `confirmed` or `unmatched`; passing a known catalog
record suggests a match for review and does not claim human confirmation.

Captured cards default to unknown augment inclusion. Set `augmentStatus` after
review:

- `none`: no augments confirmed;
- `included`: examine values already include augments; do not add them;
- `excluded`: add separately supplied augment stats once;
- `unknown`: the derived result remains partial, even when a number is present.

Observed examine stats take precedence and never pass through scaling again.
When only catalog base stats exist, an explicitly known tier uses the existing
`scaleItemStat` helper, including fractional progress. Unknown tier is null and
cannot silently become zero. Complete-item metadata may establish an omitted
stat as zero; missing fields on an incomplete observation remain unknown.

The OCR adapter maps `hp`, `mana`, `endurance`, attributes, resists, weight,
damage/delay and regens to the existing stat keys. Resource `*Current` and
`*Maximum` observations stay separate keys. It does not manufacture total HP
from a current-HP field. Unknown parser fields remain in the original private
journal rather than being treated as additive stats. The supplied observation
ID/session, text, time and parser version are retained as bounded local evidence.

For the supported `default_modern` layout, producer slot arrays such as `Feet`,
`Primary` and `Fingers` normalize to the existing feet, primary and paired finger
slots. Explicit `Tier N numerator/2^N` progress is supplied as `tier` plus
`fraction` (the numerator), with observed `fractionMaximum` retained in private
parser evidence. The adapter preserves `fraction`; it never infers progress from
a tier alone or legacy `Tier 10/10` text. The parser validates the denominator.
An unambiguous observed `attack` maps to `ATK`; `attackSpeed` maps to the separate
`ATTACK_SPEED` key and never implies `HASTE`. A bare Attack pair in the modern
Inventory pane denotes ambiguous components and must not become invented
melee/ranged or current/maximum fields. Explicit `damageBonus` remains a separate
`DMG_BONUS` value; it is never added to observed `DMG`, substituted for `DELAY` or
scaled again. Attribute/resist and resource current/
maximum keys retain their existing separate mappings through review, persistence
and the share summary. Synthetic interoperability checks cover these contracts;
they do not certify another skin or publish any live character data.

An observation ID within its session is idempotent. An explicit stable
`item.instanceKey` within a session can accumulate evidence for the same card,
but different tier/fraction/augment identities produce separate variants.
Names, content-based journal dedup keys and identical stats alone never merge
physical copies. The UI must use explicit duplicate-copy creation where a
single examine cannot distinguish two identical items.

Removal persists up to 1000 observation/session markers, so startup journal
replay does not recreate a discarded OCR card. Up to 100 stable-instance/variant
cutoffs also suppress older captures beyond the six-record evidence window.
A new observation, session, manual add, or new examine after the cutoff remains
available. Marker retention is bounded and contains no raw OCR text or pixels.

No Equipment and equipped totals are distinct observations. The model never
replaces either with a base-plus-gear calculation. Caps, buffs, worn effects,
combat state and server formulas are not inferred. The calculated column marks
partial sums with `*` and reports unknown contributors. Empty slots are stated
separately; an empty assignment is not proof of the player's actual equipment.

## Bounds and persistence

The versioned localStorage key is `eql-eye-of-zomm-character-v1`. Up to 120 cards
persist, with six evidence records/card, 48 supplied stat fields/block and eight
augments/card. Strings and numerics have explicit bounds. The serialized state
has a 1,500,000-character local-storage budget; oldest unassigned cards are
evicted first. Equipped cards are protected; extreme protected-only payloads
expire older evidence and cached icon pixels while preserving IDs and gear.
Damaged state is normalized and
duplicate assignments are removed on restore. Storage failure leaves the
current in-memory review usable and visibly warns once.

Icons keep original IDs and allow only bounded PNG/JPEG/WebP base64 data URLs.
Remote URLs and SVG are excluded. The renderer checks raster headers before
decode and accepts icons up to 256 × 256 pixels. Missing/invalid artwork uses a
placeholder, never invented replacement art. Cached source artwork is drawn
unchanged.

## Renderer and sharing

`renderCharacterShare(snapshot, {document?,appearance?,resolveIcon?})` returns a
promise for `{canvas,dataUrl,blob,summary,width,height}`. The width is fixed at
1800 px; height is deterministic from the full stat block and 23 gear cards,
rounded to 64 px and bounded to 2400–8192 px / 15 million pixels. PNG payloads
are bounded to 12 MB. Explicit overflow errors require editing excessive fields
instead of producing clipped or silently incomplete exports.

EQL dark/gold colors and the selected local font family are used. Export text
has a readable 18 px minimum and follows larger settings up to a 1.3 multiplier.
The result includes separately observed base/equipped values, partial calculated
sums, gear icons/names/tiers/required levels/augments/stats, empty slots and
uncertainty. Item text uses canvas text operations, never HTML or script. No
network calls occur. A trusted `resolveIcon` callback must read the local pack
only. Determinism is within the same browser/font environment; installed font
fallbacks can change pixels across Windows and Linux.

For an own-talk upload, hand `blob`/`dataUrl` and the reviewed summary to the
authenticated service after its explicit preview/upload action. These modules
do not contain credentials, issue upload requests or select a wiki user.

## Observed validation

`node tests/character-model.mjs` passed synthetic checks for physical copies,
observation replay, tier/augment variants, paired slots, move/replace/remove,
unknown fields, independent base/equipped captures, known scaling, augment
inclusion, partial sums, local persistence bounds/corruption/failure and removal
of private evidence from share JSON.

On 2026-10-22, a hidden Electron fixture with a disposable profile and external
network blocked exercised the real canvas encoder:

```powershell
node tests/character-model.mjs --render-demo --output D:\EQLWiki\.local\validation\eoz-character-share-20261022
```

The inspected theme/10px export was 1800 × 4032, 366,581 bytes; Verdana/20px was
1800 × 4224, 578,154 bytes. Both contained all slots, distinct observed totals,
partial markers, cached synthetic icon art and readable item rows. Repeated
renders produced identical PNG bytes within that runtime. These are synthetic
canvas checks, not live game OCR, installed-app upgrades, clipboard/save-host
acceptance or live wiki uploads. UI/host tests remain the integration owner's
responsibility.

The additional Default Modern (`default_modern`) interoperability check on
2026-10-22 passed the model and real canvas encoder with nullable progress,
separate Attack/Attack speed/Damage bonus values, current/maximum resources and
Void resist labels. Unknown progress remains unknown after persistence and in
the PNG; explicit zero remains distinct. The inspected modern export was
1800 × 3904, 278,517 bytes.

`node tests/modern-ocr.mjs` also passed actual pinned offline OCR with both source
dependencies and the assembled `.generated/ocr-runtime`. It reads only the
2560 × 1100 canvas-generated synthetic fixture at
`tests/fixtures/screen-read/modern-layout.png`; it never captures a screen or
opens a game source. The fixture has two independent examine panes and Inventory
on the right. Checks cover item names, split label/value columns, slots, explicit
tier progress, resource current/maximum, seven attributes, six resists, bounded
refinement and usable Character cards without cross-pane fields. A conflicting
regen digit must remain unknown rather than becoming the wrong value. Main and
worker network access is denied; temporary profiles are bounded and removed.
Regenerate with `node scripts/create-modern-ocr-fixture.mjs`. The visually
inspected PNG SHA-256 is
`5f9b0d3c6b40ec4d8d79725aca5ddb26ba4172b4cb1cf4ff67d8346ba3f1c8ec`.
This is a synthetic pixel regression, not evidence of another skin, production
wiki writes, native Wayland support or universal live-game OCR accuracy.

### 0.9.0 platform and Character acceptance audit

On 2026-10-22, the workflow jobs, their actual logs and uploaded artifact metadata
were independently inspected for feature head `5b967c564bc39197fc68b27b1c992e06dabb292d`.
[CI run 39874322031](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874322031)
tested PR merge `61fbaa815ee669a002f006b6dbf3a1d5e246f414` against main `6937d35`.
The source, Windows native and Linux desktop/package jobs all passed.
[Windows installer run 39874315883](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874315883)
also passed for the feature head. These runs predate the timestamp correction
below; the release owner must revalidate the final changed head.

The Linux job used Ubuntu 22.04, Xvfb at 1920 × 1080 and Openbox. Its actual
workspace result included reviewed slot placement, editable augments, separate
observed base/equipped values, recoverable stat errors, PNG clipboard/save,
renderer restart and offline Character PNG import. The saved PNG was 429,702
bytes. A separate native-source fixture exercised window selection, persistent
capture, local OCR, Character-owned observations, the private journal and Stop.
The same capture fixture passed with the packaged ASAR and physical offline OCR
resources. The uploaded Linux interface artifact's Character editor and share
preview were downloaded and visually inspected; readable fields, distinct
observed/calculated columns and the scrollable image preview were present.

The exact-ASAR gate compares current runtime sources, historical screenshots and
the fetched production bootstrap with packaged bytes. The Linux packaged smoke
then launches the shipped executable with its original ASAR and sandbox intact,
using a disposable profile and synthetic Proton client directory. Its recorded
result explicitly states `installed:false` and `waylandTested:false`. The Windows
installer job also passed source workspace, exact-ASAR, packaged capture/OCR and
packaged font checks. Uploaded package artifacts were present and unexpired:
Linux artifact `12467592119` (213,956,081-byte ZIP), Windows artifact
`12467891026` (110,738,560-byte ZIP). Their GitHub ZIP digests are, respectively,
`56c503b8c444e092b02b82dad81e3eb2dfb211cf07f4b21fbc8b194f9614fca8`
and `11e7cd8d59e3d5835681e36948e08bf4dc026cece86a62ac657986f5526709d1`.
These ZIP digests are CI artifact provenance, not public installer checksums.

The audit reproduced and corrected one model defect: timestamps had reused the
1e9 stat-value bound, rejecting real epoch milliseconds. This erased capture and
stat times and dropped stable-instance removal cutoffs after reload. Timestamps
now accept safe integer milliseconds in the JavaScript Date range independently
of stat bounds. A real 2026 ISO observation regression verifies retained dates,
removal beyond the six-record evidence window across reload, and a fresh examine
after removal. Invalid dates remain unknown.

After that correction, focused local model/share-host tests, the real main/preload
workspace fixture and both deterministic canvas exports passed. The latter remain
1800 × 4032 / 366,581 bytes and 1800 × 4224 / 578,154 bytes and were visually
inspected again. Evidence is private under
`D:\EQLWiki\.local\validation\eoz-character-090-acceptance`.

No remaining Character/share blocker was found in these checks. Linux acceptance
establishes the documented X11 baseline; native Wayland placement, capture portals
and real foreground-game composition remain manual limits. These fixtures do not
establish production wiki authentication/upload, actual game OCR accuracy or an
installed-player upgrade. Offline screenshot import and explicit manual card/stat
review remain available when live capture is unavailable. Final release ownership,
both-platform publication checks and OCR calibration are tracked in
[the 0.9.0 release plan](../RELEASE_090.md).
