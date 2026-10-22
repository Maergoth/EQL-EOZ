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
