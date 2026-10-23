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
using three bounded passes in 868-1156 ms. After the title-crop correction below,
the supplied armor/weapon crops still yield one item each in 973/1099 ms.
The armor identity and several useful
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
- Passed locally: native Windows window stream reports 8 fps; while the first
  real OCR call is held, three compact tooltips cross the native stream. Changed
  tooltips remain visible at least 700 ms after admission; all three are later
  recovered with their original source/session/generation/timestamps.
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

The next remote head, `9388eae`, passed that tour gate and reached the new native
capture scenario. It exposed a fixture-only scale error: a 1920-wide canvas was
rendered at 960 CSS pixels, shrinking nominal 20px tooltip text to 10px at DPR 1.
The corrected synthetic source draws a 960x660 scene at its native font size,
preserves its geometry on every redraw, and commits the compositor surface.
Two adjacent marker colors outside the item acknowledge actual native pixels;
a bounded four-pixel blend transition handles fractional scaling. Changed
stages must reach capture admission within 1500 ms, then remain visible for at
least 700 ms. Exact three-item OCR, source/session/generation/original time,
queued-frame and fresh unchanged baseline assertions remain intact. Logs report
actual admission and visibility durations; they do not claim every stage lasted
exactly 700 ms. Test-only Chromium scale overrides leave OS display settings
unchanged. Neither failed remote run produced a release package.

The `c08fb09` Linux run admitted all three distinct marked frames within its
deadline, retained them without overflow and completed each read, but truncated
their item names. This exposed a production name-crop weakness: the crop used
Class/Race glyph height even when the actual item-name row was observed. Title
and metadata glyph metrics need not match. The accompanying Windows runs stopped
at a fixture viewport guard: the runner has 655 content pixels, while the scene
included ten unused pixels after the tallest tooltip. The fixture now retains
the entire tooltip including its border in a 652-pixel canvas, with the same
font size and item coordinates. Bounded synthetic-only OCR pass/word diagnostics
are included on failure; exact names and native provenance remain required.
These failed runs are diagnostic evidence, not capture/package acceptance.

The corrected name band includes the actual observed title boxes. When scene
OCR misses the green title, observed row spacing and the following Lore/No Trade
boundary constrain its reread. A geometry regression fails against the previous
head and passes after the correction, including short metadata glyphs, caption
offsets and absent Lore. All three native-size item names also pass real offline
OCR in a 1000x760 synthetic frame with a 27-pixel caption offset, using source and
assembled runtimes. Native Windows checks at Chromium DPR 1 and 1.5 retain all
three exact names, original provenance, queue counts and fresh unchanged baseline
assertions. The Linux native gate remains required; synthetic geometry alone
does not establish the precise cause of that platform's earlier failure.

Pre-release review found a separate manual-import baseline race: imported files
receive a completion timestamp, so a file started during Re-equip could finish
after Back and appear fresh for Base. The workspace now checks that a baseline
import began in the same Base phase after its cutoff, with unchanged session,
source and exact import-generation context. The native walkthrough fixture holds
that read, navigates Back and delivers mixed item/character records: the valid
item still merges, the stale baseline stays blank, and accepted base values stay
unchanged. A newly initiated Base import works; a subsequent generation change
clears only an unreviewed proposal, retaining the user's edited values.
Explicit imports bypass live-screen semantic dedup so immediately rereading the
same PNG in Base produces its own reviewed record. The host fixture verifies
identical image bytes within three seconds yield increasing sequence/time and
import generation without enabling or taking over continuous capture. Live OCR
still uses its three-second dedup; log cursor dedup remains unchanged.

At `8cc4f4e`, the full Windows installer workflow passed source/native gates and
the isolated packaged-ASAR capture/OCR checks. Linux recovered all three exact
transient names and its fresh baseline, then stopped at the new compact framed
armor fixture's AC expectation (`undefined`, expected 27); its underlying OCR
needs inspection before changing that assertion. Another Windows native run
showed roughly one second between frame timestamp and IPC admission. The fixture
now separates those measurements: changed stage pixels must be captured within
500 ms of drawing, while their native acknowledgment has a bounded five-second
wait. It still requires all three exact names, queue retention and original
provenance. That tests acquisition more strictly without treating transport
latency as an uncaptured frame. Bounded per-case synthetic hover diagnostics are
now emitted on failure. No release has been published from these runs.

An isolated local Linux Electron 43.8.3 run under WSLg, with privately extracted
runtime libraries and no global installation, recovered all ten source/assembled
fixture identities. Its default font produced scene STR `7211` at confidence 31
versus focused STR `21` at confidence 89. The parser deliberately leaves that
conflict unknown and retains both written observations; choosing a confident
value silently would change the existing safety contract. Numeric pixel checks
therefore retain exact assertions for every emitted value and allow at most one
missing expected numeric field only when it is explicitly marked conflicting
and independent retained stat blocks contain distinct values including the
expected value. Unexplained missing values, wrong emitted values, additional
missing stats, wrong identities or duplicate panes still fail. No production
parsing rule is relaxed by this platform-sensitive test correction.
With private per-process Liberation Sans font configuration, the exact CI AC
case is reproduced: compact armor scene AC `21` at confidence 41 and focused AC
`27` at confidence 95 occupy the same numeric box; AC remains unknown while STR
is correctly read. Both source and assembled runtimes retain that conflict.
The unchanged repository hover gate now passes under both isolated Linux font
environments: ten DejaVu and ten Liberation cases, each covering source and
assembled OCR. All ten Windows cases also pass with every expected numeric field
retained. Guard-negative probes reject wrong emitted values, unexplained missing
fields, a claimed conflict without distinct written numbers, and more than one
missing expected numeric field. Final exact-head CI/package checks remain required.

At `f1b77c4`, Linux completed the native sequence and began packaging. Windows
recovered all three exact tooltips with changed-pixel timestamps 159/422 ms after
drawing, then exposed an undersized baseline fixture wait. An identical frame
captured before the cutoff spent 6.9 seconds in delivery and finished OCR before
the three-second hash TTL restarted. The original ten-second freshness deadline
expired before a truly post-cutoff read could complete. The fixture now permits
20 seconds for that serial freshness cycle, within a 60-second overall watchdog;
it still requires original `capturedAt > phaseCutoff`, the same pixels, exact
source/generation and HP maximum. No timestamp or application rule changes.
