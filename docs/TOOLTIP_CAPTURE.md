# Brief item tooltip capture

## Request and current evidence

After 0.9.1, the owner reported no captured items while unequipping and
re-equipping. Two private Default Modern hover-tooltip screenshots show the
ordinary compact layout: a single green item name, Class/Race, an unlabeled
equipment slot, stat columns and an inspect/upgrade footer. These are different
from the larger examine pane used by the original calibration.

The 0.9.1 source requests a 1 fps stream and samples at two-second intervals.
The host has one active OCR operation and only one replaceable pending frame.
The parser's fallback expects a repeated item name when Description is absent;
compact tooltips have neither. Character item intake also checks the current
walkthrough phase when OCR completes, so an eligible item can be lost after a
phase transition. These are independent defects; increasing OCR concurrency
alone does not correct them.

Start at released merge `6d8954692ffb7d6d934932df297dd0da12f381e9` on
`codex/transient-item-tooltips`. Preserve published packages and older history.
Keep player screenshots, OCR reports and installed profiles out of Git. Private
calibration belongs under `D:/EQLWiki/.local/validation/`; tests use synthetic
equivalents and disposable profiles.

## Ownership and context for continuation

| Owner | Files and responsibilities |
| --- | --- |
| capture_pipeline_089 | `app/screen-read-parser.js`, `desktop/capture-reader.cjs`, parser/reader tests and synthetic tooltip geometry; privately measure both supplied images through real offline OCR |
| wiki_contribution_089 | `app/capture-source.js`, `desktop/capture-host.cjs`, source preload and source/host/native tests; acquisition cadence, bounded distinct-frame queue and lifecycle cancellation |
| character_model_089 | `app/character-walkthrough.js`, `app/capture-workspace.js` and their tests; accept eligible delayed item results while retaining strict baseline freshness |
| root | Integration, review, release metadata/media, this plan and component guides, final source/native/package acceptance and publication |

The existing ownership, source/session/generation, frame bounds, exact-main IPC,
private journal and explicit wiki-write contracts remain authoritative. Refer
to [the pipeline map](design/CAPTURE_PIPELINE.md), [Character walkthrough](CHARACTER_WALKTHROUGH.md),
[release history contract](RELEASE_HISTORY.md) and [capture feature plan](CAPTURE_CONTRIBUTIONS.md).

## Implementation requirements

1. Recognize complete Default Modern hover tooltips without Description or a
   repeated name. Use local identity/metadata/slot geometry; do not promote chat,
   a loose green name or an effect name into an item. Keep single-word names,
   original observed stats, source text and uncertainty. Retain the existing
   explicit Tier/name-suffix tier contract; a suffix cannot establish fractional
   progress, unseen augments/modifiers or the item's unscaled base statistics.
2. Sample screen changes more frequently without running 20 full OCR jobs per
   second. Keep one offline worker, bounded in-memory frame bytes and an explicit
   overload policy. Preserve distinct short-lived frames while OCR is busy;
   coalesce duplicate work and describe remaining saturation limits honestly.
3. Pause/Stop, source/session changes, import, region changes, resized frames
   and disposal invalidate all stale work. Queued pixels remain ephemeral.
4. Accept item reads according to their actual capture phase and timestamp,
   including a valid delayed result after the user advances. Do not relax the
   fresh No Equipment baseline or allow another session to populate this one.
5. Show practical capture/reading feedback and instruct users to wait for an
   item card when needed. Do not claim unlimited capture throughput.

## Acceptance and evidence ledger

Private baseline measurement on 2026-10-23 reproduced zero item proposals from
both supplied crops: 558x502 in 726 ms and 553x639 in 709 ms. Final measurements
produce one item from each crop and its private neutral 1920x1080 embedding,
using three bounded passes in 868-1156 ms. The armor identity and several useful
armor/weapon statistics are recovered. One weapon letter pair remains an OCR
spelling error; ambiguous decimal weights stay unknown and unsupported Accuracy
stays in the written text. No catalog values replace observed evidence. Neutral
embeddings are not actual uncropped gameplay; these timings do not establish
live 4K throughput. No private image or output enters a fixture or release.

- Passed: parser v6 handles strict compact-hover anchors, single-word names,
  missing first-pass name words with a bounded anchored name crop, bare slots
  and separate base/backstab damage. Explicit Tier/name suffix remains the old
  contract; empty slots do not create augments/progress and effect ranks do not
  become item statistics. Lost decimal weights remain unknown.
- Passed: real offline synthetic full-scene and mixed examine/hover pixels,
  original Modern pixels and legacy explicit Character Stats pixels with source
  and assembled runtimes. Inventory/chat alone does not establish character
  stats. Four retained private real negative reparses produce no observations.
- Passed: native Windows window stream reports 8 fps; while the first real OCR
  call is held, three compact tooltips appear 700 ms apart and all three are
  later recovered with their original source/session/generation/timestamps.
- Passed: deterministic FIFO/count/48 MiB/15-second bounds, duplicate
  coalescing, visible overflow, exclusive-import/area holds and stale
  encode/queue/result rejection on lifecycle changes. Unchanged-screen dedup
  expires after three seconds; game-log cursor dedup remains permanent.
- Passed: delayed eligible items across Next, first-frame timing, wrong
  source/session/generation/phase rejection, explicit-import eligibility,
  bounded saved windows and fresh baseline gates. Actual native walkthrough and
  main/preload workspace checks pass with isolated profiles and synthetic data.
- Passed: pending journal append followed by a generation change persists no
  live event; replay checks the known current generation before promoting a
  tracked current-session record. Accepted model cards remain available.
- Passed: actual native unchanged Modern Inventory pixels produce a new
  post-cutoff baseline. A retained callback from a known retired source gets an
  inert result; unknown source IPC remains rejected.
- Passed: full `npm test`, dependency audit (zero vulnerabilities), current
  verified bootstrap and catalog relevance. The new hover gate is registered
  in Windows CI and both platform builds. Native source/capture, guided UI and
  full workspace fixtures pass locally.
- Passed: one reviewed actual synthetic 0.9.2 screenshot in the append-only
  illustrated What's New archive; 31 versions/40 history images are verified.
- Pending: exact-head Windows/Linux/package gates and final anonymous public
  download/extraction verification. Preserve every older release.

The first PR build at `0eee876` passed source checks but stopped at the native
window-lifecycle fixture: it incorrectly required every current release tour
to contain multiple pages. The correction verifies the actual single-page
current tour and uses the real history picker to exercise an older multi-page
tour. Current image/title/count, Previous/Next, Done, Escape and focus assertions
remain covered; the corrected four native lifecycle scenarios pass locally.
Those initial runs did not reach capture or packaging and are not acceptance
evidence for those stages. Final integration also retains newly parsed backstab
damage in editable/shared item statistics separately from base damage; no
equipped-total formula is inferred for it.
