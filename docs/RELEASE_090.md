# 0.9.0 calibration and release plan

## Authorization and baseline

The owner now authorizes OCR calibration, the remaining checks on PR11 and
publication of 0.9.0. This supersedes the earlier draft-only release boundary.
PR: https://github.com/Maergoth/EQL-EOZ/pull/11 . Starting head:
`5b967c564bc39197fc68b27b1c992e06dabb292d`; main/released 0.8.9: `6937d35`.
Keep one Windows/Linux codebase and one verified bootstrap generation.

Prior exact-head CI39874322031 and Windows installer39874315883 passed,
including Linux native/package and offline OCR. Revalidate the final changed
head before merging. No installed player profile is a test fixture; no public
wiki test edits/uploads, private game images/logs or account data go into Git.
Preserve unrelated EQLWiki dirty files.

## Critical context

- `docs/CAPTURE_CONTRIBUTIONS.md`: shared feature plan and source contracts.
- `docs/design/CAPTURE_PIPELINE.md`: exact capture/OCR/journal API and evidence.
- `docs/design/WIKI_CONTRIBUTIONS.md`: current blueprints/auth/partial retry.
- `docs/design/CHARACTER_CAPTURE.md`: slots, base/equipped totals and sharing.
- Private calibration: `D:/EQLWiki/.local/validation/eoz-capture-ocr-*.json`.
- Private reference image: supplied codex-clipboard-81fe8ac6 image in Temp.
- Read-only game assets/screenshots: `C:/EverQuest Legends`.
- Current Help standard: https://eqlwiki.com/Help:Contents; fetch fresh revision.

## Ownership and sequence

| Work | Owner | Status |
| --- | --- | --- |
| OCR calibration/parser/preprocessing + regressions | capture_pipeline_089 | Modern live frame and selected panes measured; focused parser/reader/cancellation suites pass |
| Fresh wiki contracts/auth acceptance | wiki_contribution_089 | Read-only contracts/parse and loopback write flows passed; independent Modern evidence/stat-default review |
| Character/Linux/package acceptance | character_model_089 | Modern adapters and unknown-progress handling; synthetic native pixel gate and final-head platform checks |
| Game UI evidence, integration, metadata, CI and publication | root | PR11 merged; first release held on preview race; follow-up PR12 must pass all changed-head gates |

1. Gather game-window/screenshot/UI-file evidence, record measured truth privately.
2. Calibrate item and character fields without guessing stats or disguising OCR
   corrections. Prefer bounded pane/region controls over repeated whole-screen
   processing. Review potential catalog matches separately from observed text.
3. Resolve concrete remaining contract/platform bugs. Clearly scope supported
   X11/XWayland behavior and untested native Wayland/production account flows.
4. Update release notes/walkthrough/captures as the final implementation needs;
   retain historical screenshots. Run appropriate local and exact-head CI and
   Windows/Linux packaged OCR/native checks.
5. Mark PR ready and merge the exact passing head. Follow the unified Release
   workflow; verify tag/source, public downloads/checksums and the identical
   bundled wiki dataset across Windows/AppImage/deb before reporting live.

## Calibration evidence

The owner limits first-release OCR support to the currently displayed Modern
skin. The live client configuration identifies it as `default_modern`; Settings,
Character instructions and the release walkthrough require Default Modern
(`default_modern`) for screen reading. Other game skins remain unverified; log
parsing is independent of skin. A newly available 3840×2088 live Inventory and
three-examine frame exposed centered-tab and split-column parsing defects. The
corrected production reader now returns three independent exact item names,
tiers and bare slot labels plus a separate right-side Inventory proposal. Full
frame processing took about 7.6 seconds; each selected examine pane about
1.0–1.3 seconds and Inventory about 2.7 seconds. Selected panes recovered the
small attribute column more completely. Full-frame weak digits and an Inventory
resource maximum and resist disputed between passes stay unknown; no catalog supplies OCR
truth. This measures these panes and items, not every Modern layout or slot.
Private game pixels and character values stay outside Git.

The supplied 748×331 composite now yields the exact observed item name
`Boots of the Long Road +10`, AC14, HP15, tier10 and Size SMALL through the
production reader in about 2.3 seconds. The baseline scene is followed by at
most two detected refinements: a name crop capped at 1MP, or a stat/Inventory
atlas capped at 4MP. An atlas joins at most four detected source regions, each
at most 1MP, and maps every retained OCR word back to its own source pane.
Aligned higher-confidence name words can improve their nearest matching scene
word; original name alternatives, pane-scoped raw rows and conflicting numeric
reads remain evidence. Independently observed labels may align a damaged label;
values are never repaired from the wiki or from another item. No wiki data supplies
numeric truth. Weight0.2 remains unknown: OCR repeatedly reads `02`, even at
95% confidence, and no missing decimal or digits are invented. Complete totals
from this tiny overlap remain unverified; confidence is not measured accuracy.

All four actual 2560×1369 combat/world screenshots in the local game directory
were negative controls: zero item/character proposals on each, one scene pass,
with a single scene pass. All four were rechecked after the Modern changes.
The actual images contain no item examine or Inventory panes. Large synthetic item/character fixtures continue to read known
stats correctly; they remain separate evidence from real-game accuracy.

The engine supports normalized explicit regions tied to source/session and
encoded frame dimensions, with a 16px minimum each way and full-frame reset on
size change. No capture starts automatically. Root owns Settings' explicit
preview/draw/Reset UI and persistence. Whole-frame enlargement now uses 2x for
normal-resolution game screens when the 16MP/8192 limit allows it; 4K falls back
to 1x. Stop/import/source changes guard every awaited scene/refinement result.
All focused `npm run test:capture` suites pass, including ROI bounds/resize reset,
word geometry/alternates, numeric unknowns, cancellation, worker retirement and
journal handling. Root also observed the new Windows native capture path pass.

Private JSON/text/geometry reports remain under
`D:/EQLWiki/.local/validation/eoz-090-*`. The source screenshot was untouched.
See [CAPTURE_PIPELINE.md](design/CAPTURE_PIPELINE.md) for exact APIs, source
contracts, measurements and limitations. Final changed-head CI/package gates
must supersede the earlier passing baseline before merging.

## Wiki acceptance

The fresh read-only check on 2026-10-22 EDT found unchanged Help198282,
BlueprintLoader168748, Itempage176024 and Namedmobpage149842. Synthetic item,
normal NPC, raid NPC and zone drafts rendered through the live read-only parse
API with the expected article/tooltip and category contracts. Local patches
against current Lodizal, A dracoliche, Fine Steel Rapier and Boots of the Long
Road source were idempotent and preserved unrelated fields, common loot and
player-authored notes. Complete public-source captures remain private.

Two concrete flow issues were corrected: unverified zone `/who` names remain
Unknown instead of borrowing a human article title, and verified NPC knownLoot
now prepares reciprocal existing-item source diffs in the same complete review.
The latter requires a reviewed zone and explicit normal/raid selection, uses
canonical NPC/zone titles and existing revision guards, and preserves per-page
retry after restart. Missing/redirected/ambiguous identities warn and fall back
to manual wiki editing. Focused pure/client fixtures and the actual native
workspace passed these changes without public writes.

The actual production login page rendered inside the dedicated native WikiHost
window using a temporary anonymous profile. Username/password controls were
empty, form targets remained on eqlwiki.com, and Node/preload/app bridges were
absent with sandbox/context isolation enabled. No login was submitted. Public
capabilities advertise OATHAuth, ConfirmEdit and Turnstile; no challenge appeared
before credential submission. Real account login, any second factor/email or
CAPTCHA requirement, and the first intentional production contribution remain
normal user actions. No account credentials, edits or uploads were used as a
production test. No remaining current wiki source/rendering blocker was found;
see [the component acceptance record](design/WIKI_CONTRIBUTIONS.md#090-live-wiki-acceptance)
for private evidence locations and precise limits.

## Character/platform acceptance

The independent audit inspected actual logs and artifact metadata from
[CI39874322031](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874322031)
and [Windows installer39874315883](https://github.com/Maergoth/EQL-EOZ/actions/runs/39874315883)
for feature head `5b967c5`. CI tested PR merge `61fbaa8` against main `6937d35`.
Windows and Linux workspace fixtures passed slot placement, editable augments,
separate base/equipped captures, recoverable stat errors, PNG clipboard/save,
renderer restart and offline Character import. Both platforms passed exact-ASAR
and packaged capture/local OCR gates. The Linux packaged smoke launched the
actual shipped executable and original ASAR with sandbox intact, using an
isolated profile and synthetic Proton directory. Package artifacts were present
and unexpired; the component doc records their IDs and ZIP provenance digests.

Linux used Ubuntu 22.04, Xvfb and Openbox, establishing the X11 baseline. Downloaded
CI Character editor/share captures and both complete local canvas exports were
visually inspected. Native Wayland, capture portals, foreground-game composition,
arbitrary game skins/resolutions and production wiki authentication/upload remain
unverified. No installed player profile or public wiki write was used as a test.

One concrete defect was fixed: real epoch timestamps had reused the 1e9 stat
bound, erasing dates and weakening stable-instance removal on reload. Real-2026
ISO/date regression assertions now retain timestamps and removal cutoffs, reject
old journal replay beyond six evidence records and permit a fresh examine after
removal. Model/share-host tests, real main/preload workspace integration and
deterministic theme10/Verdana20 exports pass locally after the correction.
Exports remain 1800 × 4032 / 366,581 bytes and 1800 × 4224 / 578,154 bytes.

No remaining Character/share blocker was found within that scope. The earlier
remote runs predate the timestamp correction and current OCR/wiki work; final
changed-head CI/package validation is still pending. See the
[Character component audit](design/CHARACTER_CAPTURE.md#090-platform-and-character-acceptance-audit)
and private `D:/EQLWiki/.local/validation/eoz-character-090-acceptance` evidence.

## Final verification

The full source suite and dependency audit now pass locally after the Modern
follow-up, alongside native capture/calibration/workspace, unknown/zero progress
round trips, catalog relevance and actual source/assembled offline Modern pixel
OCR. The generated fixture uses synthetic text/geometry only; Windows and Linux
X11 build workflows repeat that gate. Final exact-head remote and packaged
checks remain required. PR11 was merged after exact-head CI/installer checks passed. Its first unified
release attempt exposed a timing bug when reopening calibration immediately after
Save: a queued close event could invalidate the new preview. Publication was
blocked. The follow-up keeps stale close events from affecting an opening/open
preview and adds a portable, deterministic native close-event regression before
retrying 0.9.0 publication. PR12 also contains the measured Modern pane fixes,
Character field adapters and explicit unknown progress, and reviewed item-stat
defaults that exclude OCR metadata from generated wiki stat text.
Final independent review also corrected duplicate item-source zone headings:
sequential NPC additions now reuse the unique existing block, with LF/CRLF,
protected-comment, preservation and idempotence regressions.
Actual Windows native capture now exercises the current-frame thumbnail,
calibrated crop OCR and crop provenance, Full frame, clipboard and Stop. The
native calibration component exercises mouse/keyboard selection, bounded saved
areas, owner separation, corruption recovery, resize invalidation and preview
cleanup. The actual main/preload workspace still passes contribution diff/retry,
offline imports, gear/augment/base/equipped and PNG sharing flows. Images were
inspected at 13/20px; the release history now has 29 versions and 29 images,
including six 0.9.0 captures. Private pixels remain outside Git; only synthetic
UI captures are included.

Final exact-head CI, installer run, merge SHA, release run, shared bootstrap and
public asset digests are recorded in [PR11](https://github.com/Maergoth/EQL-EOZ/pull/11),
[PR12](https://github.com/Maergoth/EQL-EOZ/pull/12) and private
`D:/EQLWiki/.local/validation/eoz-0.9.0-release-verified.json` when
those gates finish. That evidence must be verified before reporting publication;
the source tree itself does not assert results of its future build.
