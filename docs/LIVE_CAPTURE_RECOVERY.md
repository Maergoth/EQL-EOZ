# Live Default_Modern capture recovery

## Scope and released baseline

The owner reports that 0.9.2 captured only Executioner's Hood during the
Character walkthrough. Work starts at released main `c22ffe2` on
`codex/live-item-capture-recovery`. Fix actual full-window capture and Character
admission before publishing another release. The existing authorization to
publish remains; a passing small fixture is not evidence of live reliability.

Read [the prior tooltip plan](TOOLTIP_CAPTURE.md),
[pipeline map](design/CAPTURE_PIPELINE.md),
[walkthrough contract](CHARACTER_WALKTHROUGH.md), and
[release contract](RELEASE_HISTORY.md) when continuing this work.

## Evidence and private context

The installed executable and its ASAR both identify 0.9.2. The actual selected
game-window source is 3840 x 2088, with Inventory, bags, chat and animated game
scenery visible. Journal records take approximately 9–11 seconds from capture
to persistence. Successful item records have `scene`, `item-stats` and
`character-stats` passes, without an `item-name` pass. The visible Inventory
stats displace the planned item-name reread in the parser's two-refinement
budget. Small synthetic hover scenes did not exercise that interaction.

Released 0.9.2 source acquisition admits up to four full PNGs per second into a
12-frame, 48 MiB, 15-second pending queue with one serial OCR operation. Motion
outside a tooltip changes the whole-frame fingerprint. Whether this evicted
specific missed items still requires bounded measurement; do not infer exact
drop causes from journal silence.

The shadow-only profile projection contains one accepted item candidate and
one current-session model reference. The three additional item observations
were captured 1 ms, 9,172 ms and 17,470 ms after the saved Re-equip window
closed. The released controller rejected all three even with the matching
session, source and generation. They were not merged into the accepted card or
suppressed by current-session removal markers. Later private item proposals
from the explicitly requested tooltip were also rejected while still in Slots.
This contradicts the intended continuous capture through walkthrough completion.
Intended items that produced no item proposal remain a separate capture/OCR
investigation. Negative OCR results and queue losses are not currently journaled.

Item admission now continues through Slots and Review, with original capture
timestamps and current owner/session/source/generation checks. Adjacent item
phases share one boundary timestamp. A released Slots/Review draft can extend
only its latest matching Re-equip boundary after Base acceptance; it cannot
authorize earlier Base frames or replay without current capture status. Base,
source selection, canceled and completed walkthroughs retain their strict gates.
The status explains that missing items can still be hovered here and queued
earlier reads can finish. Explicit item screenshot imports remain available.

Local Windows acceptance uses the actual renderer workspace with four private
journal-record projections and the shadow-projected active Slots flow in a
disposable profile. All four original records reach one recovered card with
four evidence records; the existing card remains separate. Acquisition is not
started and the installed profile is untouched. This proves record-to-Character
recovery, not new live OCR accuracy. A synthetic native regression covers new
Slots/Review items, same-session remount merging, older-session separation,
manual-edit preservation, repeated replay, and the unchanged stale/Base guards.
The reviewed Slots screenshot contains synthetic UI data only, stored separately
from the private journal/profile projections.

A second private check composes the new automatic path with Character intake:
the exact observation exported after a saved native PNG passed through canvas
MediaStream, detector, host and real offline OCR enters the actual Slots
renderer with the exported trusted context. A fresh synthetic walkthrough was
already in Slots before that original capture timestamp. One item card and its
original evidence render without starting acquisition. The record and timestamp
are unchanged. This is saved-pixels stream acceptance, not a new live gameplay
action; no private screenshots, player stats or profile writes are part of the
renderer check.

Recurring reads retain the focused ANY-slot control and its current choice.
When another ambiguous item arrives during that interaction, its choice is
deferred until focus leaves the slot controls, then refreshed without needing
another OCR result. The native regression checks the same DOM control, retained
focus/value, a real focusout event and the newly available choice after blur.

Private screenshots, profile shadows, OCR words and measurements belong under
`D:/EQLWiki/.local/validation/eoz-live-capture-recovery/`. Never commit those
files, player data or game assets. Do not open the user's active LevelDB as a
database or launch a second app against their profile. A copied profile may be
decoded privately for minimal flow/model projections. Use synthetic fixtures
in Git.

## Ownership and next checks

| Owner | Responsibility |
| --- | --- |
| capture_pipeline_089 | Parser/reader and their tests: retain item identity refinement with real-shaped Inventory; full-frame and scene-missed-name coverage; preserve conservative evidence |
| wiki_contribution_089 | Source/host acquisition and tests: bounded handling of animated full-resolution scenes, timing/drop evidence, preserve lifecycle and privacy |
| character_model_089 | Shadow-profile phase audit, continuous Slots/Review intake, same-session recovery and native walkthrough regression |
| root | Actual screen evidence, integration, this plan, native end-to-end checks, review and release |

The requested live Thornstinger hover produced repeated item observations in
the installed 0.9.2 journal, approximately ten seconds after capture. Character
did not accept them because the user was already in Slots. This is direct
evidence of an intake cutoff that contradicts the running-capture experience.
Extend item intake through Slots and Review until completion, retaining the
strict Base phase, ownership, source, session and generation guards.

Two distinct actual full-resolution frames are retained privately. The first
includes a desktop notification over part of the inspect footer, and the
released reader produces no observations from those occluded pixels. A second
3840 x 2100 PNG came through the actual CaptureHost/getDisplayMedia source in a
disposable profile, without a notification or gameplay input. Full-scene OCR
misses the green title and Weight label despite reading the complete footer.
The released reader takes 6.52 seconds and proposes no item. Selecting the
complete tooltip in those same pixels produces one usable item in 1.553 seconds
with its original source dimensions and crop offsets. Supported HP, damage,
backstab damage, delay, bonus, attributes and resistance survive; weight remains
unknown. This establishes a real full-scene recognition gap and supports an
automatic visual region proposal without weakening item anchors.

The tooltip title retains an `rn`/`m` spelling ambiguity. Thirty private bounded
title reads tested 2x, 3x, 4x, 6x and 8x color, green-mask ordering, binary and
nearest-pixel variants. None recovered the exact spelling; stronger masks were
generally worse. No extra OCR passes, dictionary replacement or numeric rules
are introduced on that evidence. The original observed name remains editable.

The name-budget fix is separately causal: a new mixed Inventory/tooltip pixel
fixture fails against released 0.9.2 and passes with scene plus two refinements
from source and assembled OCR. A 4K geometry test preserves crop-coordinate
mapping and evidence isolation; it does not claim native 4K recognition.

## Acceptance before publication

1. Explain the actual failed item using source pixels, OCR passes and admission
   results. Distinguish a missing OCR proposal from an ineligible capture phase.
2. Recover a complete Default_Modern item beside full Inventory at actual game
   resolution, including its identity and supported visible statistics. Keep
   uncertain values unknown and preserve original written evidence.
3. Exercise animated full-resolution background with transient distinct tooltips
   through the real native stream and serial reader. Measure actual admission,
   queue wait, completion and loss. A neutral image embedding is insufficient.
4. Verify a captured eligible item reaches Character inventory with original
   timestamps/source/session/generation, including delayed phase transitions.
   Fresh unequipped baseline and stale-session guards remain required.
5. Run component checks and relevant native/full tests. Record observations and
   limitations here. Review exact source head and packaged runtime before merge;
   verify public release assets after publication. Preserve existing releases.

## Progress

- Investigation: installed-version, actual full-resolution source, journal
  latency, parser name-budget conflict and Slots intake cutoff confirmed.
- Passed locally: native source acquisition, same-pixel full/cropped comparison,
  parser budget regression, active Slots/Review intake and private actual-record
  recovery through the real Character renderer. Spelling remains editable.
- Passed locally: the same actual 4K native PNG through Chromium canvas stream,
  automatic visual detection, host ROI and real offline OCR produces one usable
  item in approximately 1.8 seconds of OCR. This saved-pixel stream is not a new
  game interaction. Full-photo PNG encoding remains variable; no subsecond
  capture guarantee is made.
- Read-only review caught and verified fixes for source-side scene starvation
  and candidate crowding. Continuing changes can share a due scene reference;
  least-recent selection rotates up to four proposed panes. Host scheduling
  gives a waiting scene a turn after three priority reads, within existing
  compressed-byte/count limits. Diagnostic counters contain no text or pixels.
- Passed locally: full normal `npm test`, including worker/runtime preparation,
  and the native window/release-history lifecycle check. Windows parser/reader,
  Modern and compact-hover pixel checks pass from source and assembled OCR.
  Linux repeats 24 hover cases across DejaVu/Liberation and both runtimes;
  genuine scene-title dropout is recovered, with conflicting numbers unknown.
- Passed locally: actual 978 x 664 native-window and 3840 x 2100 canvas-stream
  checks recover three exact synthetic items over moving backgrounds while the
  first OCR call is held ten seconds. B/C have fixed approximately two-second
  visibility windows; original frame timestamps lie within those windows and
  match current source/session/generation. No overflow. The 4K canvas test is
  explicitly distinct from a new live-game action.
- Passed locally: the exact new automatic saved-pixels stream observation also
  reaches one item card through the actual Slots renderer in a disposable
  profile, without changing the record or starting capture in that renderer.
- An initial bounded live-game probe had no tooltip present and did not exercise
  item recognition. The coordinated follow-up did: the current actual game
  stream produced an automatic item observation at 3840 x 2100, approximately
  1.9 seconds of OCR and 157 ms PNG encoding, with no overflow. The exact live
  observation then reached one card through the real Slots renderer under its
  matching trusted context in a disposable profile. The installed profile and
  game inputs were untouched.
- The private photo-background stress exposed a separate source busy-gate miss:
  encoding an earlier full PNG for 2.3 seconds prevented capturing the next
  fixed two-second tooltip. Do not widen that exposure merely to pass. Decouple
  bounded raw snapshots from serial encoding, retaining original timestamps and
  lifecycle guards; rerun the same stress and final source/native checks.
- Passed after the snapshot fix: the unchanged photographic-background stress
  retains all three exact synthetic items at true 3840 x 2100. B/C remain visible
  for approximately two seconds, with original captures 111/163 ms after draw.
  No source/host overflow. This private fixture uses retained native scenery and
  synthetic tooltips; it is separate from the live-game acceptance above.
- Final independent review and focused source/host checks passed. Raw acquisition
  retains at most two pending snapshots / 64 MiB for 15 seconds, separately from
  one serial PNG encoder and the bounded compressed queue. Pending duplicate
  panes keep their first pixels and capture timestamp; changing capture context
  clears pending snapshots and prevents late posts.
- Final native and 4K synthetic gates also pass with a deliberately delayed
  2.5-second second PNG callback. The next tooltip is captured while that encoder
  is occupied, and survives with its original pixels/time. The final undelayed
  private photographic-background run captures B/C 70/230 ms into their fixed
  approximately two-second exposures, with zero source/host drops. The actual
  live game's successful observation and frame hash are retained privately;
  that probe's small in-memory image cache did not retain its original PNG.
- The final normal `npm test` passed after all source/host changes were frozen,
  including runtime preparation and release/history/source-manifest checks.
- Final combined review reproduced and fixed a resize-generation dedup edge:
  an invalidated active OCR key could suppress the first matching pane at the
  new source size. Active-key dedup now requires the current generation. Its
  held-old-read regression fails before the guard and passes afterward, keeping
  current-generation coalescing and stale-result rejection intact.
- A final local static native-window fixture missed its 500 ms draw-to-capture
  assertion. A private instrumented run traces 3.228 seconds of unchanged video
  pixels/currentTime before Windows delivers the redraw; source sampling stays
  at 125–140 ms, configuration waits at 0–1 ms and candidate detection at 2–4 ms.
  The new pixels are snapshotted 47 ms after delivery. This is a native static
  window/compositor limitation, distinct from encoder loss. Both Windows CI
  jobs passed that fixture on the first PR head. Adding only a 16 x 16 non-item
  8 Hz animation passes the unchanged 500 ms assertion: stage 2 is captured in
  316 ms and stage 3 in 50 ms, with all three OCR identities, calibration, fresh
  baseline and Stop checks passing. The native fixture now models continuously
  changing game scenery this way; no production workaround is introduced.
- The full uninstrumented native gate passes after that fixture-only correction
  on the resize-guard-fixed source: B/C captures 328/193 ms after draw, all
  three exact identities and original provenance, calibration/clipboard,
  unchanged fresh baseline, journal and Stop. The strict 500 ms assertion stays.
- Final-head CI on `279950f` exposed two additional native-fixture failures:
  Windows reaches the three names but fails the generic queued-record
  provenance assertion; Linux admits all three pixel stages without overflow
  but retains three pending visual frames rather than the fixture's exact two.
  Investigate their original records/native transition variants before changing
  assertions. Preserve timing, original source/session/generation/timestamps,
  fixed exposure and bounded queues. The release remains unmerged.
- The corrected priority fixture reproduces Linux's three native variants and
  passes by matching retained B/C PNG SHA-256, original timestamps and trusted
  context to actual stage exposures. Every pending visual variant must map to
  a marked stage; final named OCR records must map to their original admitted
  image. Native and 4K stream gates pass on Windows and private WSL Linux with
  the unchanged two-second exposures, delayed PNG, held OCR and zero drops.
- The native fixture now hides its final tooltip before releasing OCR and
  matches each named result's exact PNG hash, original capture time and trusted
  context to a marked admission during that tooltip's actual exposure. A later
  heartbeat cannot substitute; legitimate retained variants or scene reads can
  satisfy this generic stream check, while the priority fixture specifically
  requires visual-item reads. Bounded mismatch diagnostics preserve the stage
  ledger and original observations. The stricter native gate passes locally.
- The final post-review normal `npm test` passed. Pending: exact-head CI/platform/package
  checks and publication. No new release is yet claimed.
