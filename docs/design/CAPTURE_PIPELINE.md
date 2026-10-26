# Capture and observation pipeline

The 0.9.7 [inventory-export flow](../INVENTORY_EXPORT_CHARACTER_PLAN.md) keeps
gear equipped: Character imports `/outputfile inventory`, then reads the fully
equipped, unbuffed stat panel. **Open Inventory → Show the full stat panel →
Click off buffs** must precede the explicit stat read. Default uses Inventory's
**Stats** tab; Default Modern uses its scrolled stat panel and Additional
Modifiers. Visible pane identity selects the layout automatically; unidentified
or ambiguous panes cannot establish a layout. Character totals use reviewed current stats
only; item OCR is for Contribute and cannot populate Character gear.

Optional acquisition now requests **1 FPS**, with one-second sampling/encoding
for stable stat/examine panes. Prior 0.9.2/0.9.3 high-rate/brief-tooltip measurements
below are historical receipts, not a current recall guarantee. The immutable
frozen-frame/worker pipeline, bounded queues, privacy and source/session/generation
guards remain. A stuck bitmap acquisition retains its original 15-second deadline
across context changes, then releases the renderer and reports recoverable loss.
Calibration reports reconfiguration truthfully; stale work cannot restart capture.
The obsolete unreleased baseline-retry UI is not part of this release.

New 0.9.7 source/native/platform/package acceptance remains pending. Preserve
historical evidence below without treating it as certification of the new flow.

Historical implementation/calibration ledger: 0.9.3 live capture recovery, 2026-10-23. Owner: `capture_pipeline_089`.
Parent plan: [Capture, wiki contributions and character snapshots](../CAPTURE_CONTRIBUTIONS.md).
Current acceptance and ownership: [live capture recovery](../LIVE_CAPTURE_RECOVERY.md).
Prior evidence: [brief item tooltip capture](../TOOLTIP_CAPTURE.md).
The design contract follows the implementation ledger below. Unmeasured platform,
packaged and live-game behavior remains an explicit acceptance item.

## Implementation ledger and exact API

Implemented files: `desktop/capture-host.cjs`, `capture-image.cjs`,
`screen-read-journal.cjs`, `capture-reader.cjs`, `ocr-service.cjs`, `ocr-worker.cjs`,
`ocr-runtime.cjs`, `capture-source-preload.cjs`; `app/capture-source.html`, `capture-source.js`, `capture-png.worker.js` and
`screen-read-parser.js`. Existing parser changes are additive `sourceEvidence`
and `sourceConfidence` fields, preserving its current source attribution/totals.

`new CaptureHost({electron,origin,getMainWindow,root?,journal?,ocr?,onObservation?,now?})`
registers exact-main-frame `eye-of-zomm:capture` IPC. Actions are `status`,
`sources`, `start({mode,sourceId,sessionId?,region?,referenceSize?})`,
`stop({mode?})`, `pause`, `resume`,
`read({afterSequence,limit})`, `observe-log({event,context})`,
`import-image({mode?,sessionId?})`, `preview`,
`set-region({region,referenceSize,sourceId,sessionId})` and `clear-history`.
Events are `eye-of-zomm:capture-status` and
`eye-of-zomm:capture-observation`. No initialization call is required.
`dispose()` is asynchronous and must participate in app shutdown flushing.
The existing DiscoveryHost calls the trusted `captureScreenshot({sourceId?})`
helper; overlays do not receive the general capture API.

`observe-log` accepts the one shared parser's allowlisted events with
`context:{zone,logId,at,live,cursor?}`. Full paths are hashed before journaling.
Game-log dedup includes log identity, cursor and timestamp; OCR dedup uses sorted
field values, excluding confidence/raw-whitespace jitter. Captured frames are
ephemeral; the current implementation persists relevant recognized field text,
not image files or full-scene OCR text. Manual import currently accepts bounded
PNG screenshots. Explicit `mode:'character'` supports an offline Character
review session without enabling capture; omitted mode follows active capture
ownership, defaulting to contribution. Optional session IDs use the same bounded
alphanumeric/underscore/hyphen contract as Start. Imports reserve the one OCR
worker, cancel any stale live job, and release the hold afterward while retaining
the existing capture owner/source. A failed or cancelled import cannot leak an
old result into the new review session.
Manual observations carry `input.captureGeneration` for that exact import. The
Character workspace separately checks the initiating phase/context before using
such a file as a current-stat proposal; its completion timestamp cannot prove
that an older image belongs to the new phase/profile. Explicit manual imports
are not suppressed by live-screen semantic dedup; selecting the same PNG again
returns a new review record with its own sequence, time and import generation.

`preview` is an explicit exact-main-window action against the current running
source's last captured frame; it does not select or capture another display.
It returns a proportional PNG preview up to 1200×800 with original encoded
`sourceSize`, source/session identity and current selection. `region` stores
normalized finite `{x,y,width,height}` coordinates within 0–1; `referenceSize`
must match the frame's exact pixel dimensions and each selected dimension must
be at least 16 source pixels. `set-region` checks current source/session, cancels
stale OCR generations and clears dedup without destroying the capture stream.
Null region resets full-frame reading. A source-size change resets calibration
with a visible warning. Settings persists at most 12 optional area profiles by
source label/type and owner, with reference dimensions; it does not enable
capture on restart. Include the examine/Inventory heading in a selected area
so the parser can identify the pane; isolated numbers cannot establish its type.
Closing the area dialog clears its preview immediately. A delayed close event
from an earlier dialog cannot invalidate a newer opening/open preview; Escape
uses the same synchronous cleanup. Deterministic regressions cover both queued
event delivery orders and immediate reopen cycles.

`capture-image.cjs` exports pure `normalizeCaptureRegion(region,referenceSize)`
and `prepareCaptureImage({image,region,referenceSize})`. The latter returns
`{png,input:{sourceSize,region:pixelRectangle,scale},warning?}`. Its final resize
stays within 16 megapixels and 8192 pixels on either axis. `capture-reader.cjs`
exports `recognizeCaptureImage({ocr,image,region?,referenceSize?,nativeImage,
isCurrent}) -> {result,input,warning,cancelled?}`. The result retains scene
text/word geometry and at most two anchored refinements; input records each
region (or atlas `tiles`), scale, preprocessing/layout and confidence. A name
refinement is limited to 1MP output; item-stat/Inventory refinements to 4MP and
4096 pixels per axis. A stat atlas contains at most four source tiles, each at
most 1MP, stacked with separators in one bounded recognition call; mapped word
coordinates return to the selected source frame. The baseline remains within
16MP/8192. Each recognition result keeps at most 2,000 words and 16KiB text.
Every awaited
recognition is guarded by `isCurrent()` before and after, preventing Stop or a
new import/source from reviving stale OCR. Mock results without word boxes
remain a single pass.

Source startup rechecks its operation revision after journal initialization and
ignores errors from a superseded source load. Every OCR startup, message, exit,
error and timeout callback is bound to its exact worker; recognition also checks
that its awaited initialization still belongs to the active worker. A retired
worker or completed job cannot cancel a replacement job while termination drains.

The Character walkthrough keeps that explicit owner/session through transient
OCR timeouts, canvas/IPC frame failures and blank/minimized frames. OCR failures
stop only the failed worker, retain the selected capture stream and retry on a
later frame with bounded 2–30 second backoff; successful reads clear the warning.
Frame warnings also clear on valid duplicate frames. `getStatus()` adds
`readWarning` and `resumable`. Genuine source end, renderer loss or permission
failure releases the stream and worker into a visible resumable error. Resume
is explicit, re-enumerates the selected source and revision-checks cancellation;
it cannot restart after Stop, permission loss or disposal by itself. Encoding
which finishes after page cancellation cannot post a stale frame.

`listSources()` adds `recommended:boolean`. The pure
`preferredCaptureSource(sources)` helper recommends only one enumerated exact
EverQuest/EverQuest Legends game-window identity, excluding displays,
browser/launcher titles and ambiguous multiple game windows. It never enables
capture. The walkthrough still requires an explicit source/start action; app
startup and ordinary tab navigation cannot authorize capture.

`ocr-runtime.cjs` exports synchronous `validateOcrRuntime(runtimeRoot)` for the
artifact gate and packaged OCR startup. It checks every bounded manifest path,
physical file size/SHA-256, package version and resolved package entry within
the external resource tree; symlinks, traversal and dependency fallback outside
that tree fail. The package copies `ocr-runtime/**/*` from `.generated`, keeping
`node_modules` nested beneath the copy root. Assembly omits only `.gitkeep` and
`.DS_Store`, which the packager always discards. Packaged native capture copies
the ASAR and physical OCR tree to an isolated temporary resources directory,
removes `NODE_PATH`, and runs outside repository ancestry before recognition.

Journal append, read, clear and maintenance share one serialized queue. Expired
segments include the current idle segment, which can be retired because no write
handle remains open between operations. Cleanup runs during initialization,
append and read, and on an unreferenced hourly timer while initialized. Shutdown
clears the timer. The seven-day expiry is measured from each segment's last
write; daily/4 MiB rotation means older observations in that segment can include
the remainder of its recording day. Cleanup can lag expiry by up to the hourly
cadence and a busy queue; sleep or a closed app defers physical cleanup until the
next running maintenance/access. It is not instantaneous per-record deletion.
Pruning preserves the durable sequence, and reads report gaps even when every
retained segment has expired and the app has restarted.

Local observations:

- `npm run test:capture` passed parser, journal, ownership/backpressure/cancellation,
  additive loot provenance and actual offline OCR suites. PNG IHDR/pixel dimensions
  are checked before native decoding, including forged-size regression coverage.
- Focused review regressions passed Stop during delayed journal initialization,
  superseded source-load rejection, retired worker startup/message/error/exit and
  timeout delivery, and a stopped initialization continuing on a newer worker.
  Long-idle tests expired the current segment by read and by hourly maintenance
  without append/restart, verified serialized cleanup/writes and durable gap
  reporting, and confirmed the maintenance timer is cleared at shutdown. The
  actual Windows native capture and isolated full-workspace/import checks also
  passed after these fixes. No production or installed-player state was used.
- Actual OCR passed with network APIs blocked for both source dependencies and
  the assembled external runtime. Synthetic item name/tier/AC/HP/level/delay and
  character resource current/max/STR values matched. The worker was reused.
- `scripts/test-capture-native.mjs` passed an actual Windows synthetic source
  window through persistent getDisplayMedia, OCR, character observation, journal,
  clipboard and Stop in approximately four seconds. It uses a temporary profile
  and restores common clipboard formats afterward. No installed EoZ was modified.
- Electron 43.8.3 reports this desktop permission as `media` with **empty**
  mediaTypes and a trailing slash on securityOrigin. The implementation accepts
  that form only for the exact isolated capture page/session/main frame, denies
  camera/mic mediaTypes and audio requests, and normalizes the origin. It also
  accepts the newer dedicated `display-capture` permission. Source startup has
  a bounded timeout; failure no longer waits on a destroyed renderer promise.
- `prepare-ocr-assets.mjs` assembles 14 resolved packages and 238 size/digest
  verified runtime files, including notices. Public archive verification of the
  withdrawn 0.9.0 found the whole OCR dependency tree missing; repository-based
  native checks had resolved developer dependencies instead. After fixing the
  copy root and excluding two empty `.gitkeep` placeholders, an actual isolated
  Windows directory build contained all 238 files/65,564,867 bytes. Physical
  manifest validation and isolated packaged-ASAR persistent capture/OCR,
  calibration, journal, clipboard and Stop passed. Linux and final-head package
  checks must rerun; native Wayland remains unverified.
- Private calibration used the supplied **748×331** composite screenshot at
  1x, 2x and 3x, plus an explicit examine-pane crop at 2x/3x/4x with color,
  inverted grayscale and high contrast under sparse/block segmentation. This is
  separate from the large synthetic fixture tests. Mean full-image OCR confidence
  was 28/52/54; these values are engine estimates, not measured accuracy.
- The initial sparse color pass now enlarges sources narrower than 1000 pixels
  by 3x and normal-resolution captures by 2x whenever the final 16MP/8192 limits
  permit it; 4K falls back to 1x. At most two regions/atlases are refined: an
  optional green-name row (ordinary color for white text), observed item tables
  and an independently detected Inventory table. Modern attribute rows use an
  original-pixel maxRGB threshold before enlargement; ordinary compact tables
  and Inventory use inverted maxRGB. Thresholding is confined to the detected
  attribute table because it can damage small white weapon/weight digits.
  These regions come from pane/word coordinates, never item names, numeric truth
  or hardcoded screen positions. Output limits are 1MP for names and 4MP for
  stat/Inventory atlases, with at most four original tiles of at most 1MP each.
- The production reader now produces **`Boots of the Long Road +10`, AC14,
  HP15, tier10, Size SMALL** from the supplied tiny composite in approximately
  2.5 seconds and three bounded passes on the final rerun. Higher-confidence aligned row words
  replace only their nearest corresponding scene word, retaining the initial
  `Leng` spelling and both raw row reads as evidence. The final name combines
  observed words across those reads; no wiki catalog value supplies OCR truth.
  The private report is `D:\EQLWiki\.local\validation\eoz-090-reader-final.json`.
- AC 14 is grounded in aligned same-row word geometry. Two parser defects found
  during calibration are fixed: whitespace cannot cross rows to consume an
  unrelated number, and tall noisy glyphs cannot shift a small digit to the next
  stat row. Exact aligned Class/Race plus an independently repeated title/body
  name can recover an unreadable Description tab. Leading-zero integers such as
  OCR `Weight 02` are omitted because the decimal may have been lost; the parser
  does not invent `0.2`.
- Weight0.2 and complete character totals remain **unreliable** on the tiny
  composite. Narrow decimal experiments repeatedly returned `02`, sometimes at
  95% engine confidence; that remains unknown, never inferred as 0.2 or 2.
  Larger source panels/manual review are needed. The source screenshot was
  untouched and no private images/text reports enter Git.
- All four actual 2560×1369 combat/world screenshots from the player's directory
  were measured as negative controls: **zero item/character proposals each**,
  one scene pass each, approximately 3.9/5.2/6.2/8.4 seconds. Visible player bars,
  target names and a discipline tooltip did not become examined items or totals.
  Private reports: `eoz-090-negative-final-{0..3}.json` under the same ignored
  validation directory. These controls contain no item/Inventory panes.
- A newly supplied **3840×2088** real Modern (`default_modern`) frame contains
  three examine panes plus Inventory on the right. Its baseline initially
  produced no proposals. Centered Description tabs had cropped away name
  prefixes; the parser also assumed one examine pane and Inventory on its left.
  Parser v4 instead derives independent bounds from Description/Class/Race,
  uses visible title/body names, excludes giant icon glyphs, and detects the
  Inventory headings independently. Nothing assumes that Inventory is left of
  the items. Each item's evidence contains only its own mapped refinement words;
  another item or Character refinement cannot enter its contribution evidence.
- The final private real-frame measurement returns exactly three item proposals
  and one Character proposal in approximately **7.6 seconds / three passes**.
  The separate examine regions take approximately **1.0/1.3/1.1 seconds**, each
  with three passes, and produce their exact observed names, tier and compatible
  Feet/Primary/Fingers slots. The selected ring region recovers all seven
  attributes; full-frame reading retains only two confident attributes for that
  item and leaves the other five unknown. The weapon's selected pane recovers
  explicit tier progress, damage/delay/bonus and weight. Whole-frame progress is
  omitted when its numerator is malformed. The Inventory region takes about
  **2.7 seconds / two passes**, recovers all seven visible attributes and resource
  pairs, and leaves a conflicting resource maximum and resist value unknown. The full frame
  reads all seven attributes and all six resource current/maximum fields.
  Player identity/stat numbers and image pixels remain private in
  `D:\EQLWiki\.local\validation\eoz-090-live-measure-v4.json`.
- These measurements cover **three real items and their slots in the current
  Default Modern skin only**. They do not establish every item, slot, UI
  scale or game skin. Other canonical slot labels/aliases have synthetic
  coverage; a multiword Power Source remains one slot. Small weight decimals
  and some full-frame attributes are still unknown. An effect name still has an
  observed OCR spelling error and requires ordinary review/search; the parser
  never substitutes a wiki title or missing digits. Modern's always-visible
  `Modified` checkbox label is not a checked-state fact; an explicitly observed
  `(Augmented)`/`(Modified)` title can remain a proposal. Near-empty augment labels
  are ignored. Numeric conflicts stay unknown with both reads in scoped raw
  evidence. Modern character attributes/resists require observed slash pairs;
  malformed slash-loss integers and ambiguous Attack component pairs are not
  promoted to totals. Low-confidence single-digit refinement values are omitted.
  Numeric disagreements also invalidate an already parsed field when a second
  pass fragments its label: the synthetic `HP Regen 1` / `HP R ... 11` case now
  stays unknown instead of retaining the first truncated digit. Both mapped
  reads remain evidence; no label reconstruction chooses a numeric value.
- After the calibration changes, `npm run test:capture` passed again (including
  synthetic three-pane/right-Inventory/slot/progress/evidence-isolation,
  conflict/unchecked-label, cross-row/height/missing-tab/nearest-word regressions, bounded scaling,
  normalized region/reset/mapped refinements, cancellation, offline Character
  import and live/import worker arbitration). Separate actual OCR of large
  synthetic item/character fixtures still passes with the new reader, preserving
  known item stats and character current/max values. The actual Windows
  persistent synthetic source smoke also passed again in approximately four
  seconds. No installed profile, live wiki or user clipboard content was used
  as a fixture.

The owner authorizes publication of 0.9.0 after the final follow-up PR checks. Remaining
release work is the root-owned calibration UI acceptance, final changed-head
Windows/Linux package checks and publication. Broader skin/resolution accuracy,
native Wayland and actual production wiki login/writes remain explicit limits.

### Repeating private calibration

Use `node scripts/calibrate-screen-read.mjs --image PRIVATE.png --output
PRIVATE-results.json --reader` with paths outside Git to measure the real reader.
The helper also accepts private JPEG files for negative calibration; the app's
manual import remains PNG only. Optional `--crop x,y,width,height`, `--scales`,
`--layouts`, `--preprocessing` and `--only-crop` run a bounded research matrix
without changing or copying the source image. Reports contain private recognized
text/word geometry and must remain ignored. Production uses one reusable offline
worker and a scene pass plus at most two small refinements. The 0.9.2 acquisition
and bounded distinct-frame queue replace the original newest-frame slot below.

## Existing source contracts

The main renderer remains the sole live log parser/session owner. Do not add a
second parser, replay old combat into the current session, inject commands into
the game or read the game's process memory.

| Information | Current authoritative source | Contribution handling |
| --- | --- | --- |
| Player/group kills | `app/parser.js`: `You have slain ...!` and `... has been slain by ...!` emit `kill`; nearby kills do not become the player's combat encounter | Retain the observed mob name, zone context and timestamp. A kill does not prove mob HP or a drop. |
| Loot and quantity | `noteLoot` handles `loot/looted/receive/received/acquire/acquired`, grammatical articles, quantity and explicit `from ...` corpse text; currency is excluded | Use parsed events; preserve whether a source was explicit, inferred or unknown. |
| Considered mob and level | Legends regard/judge/glare/scowl wording ending `(Lvl: N)` emits `consider` | Candidate mob/observed level; keep raid/normal identity unresolved unless supported. |
| Zone | `You have entered ...` or the current character's Legends `/who` row with a stable short name | Reuse `zoneRecord`/canonical zone mapping after `consumeText` canonicalizes the event. |
| Character identity/level/classes | The selected character's self `/who` row; level-up text | Context for a character session. The parser does not currently establish race or all stat fields. |
| Player coordinates | Supported `/loc` variants emit normalized world X/Y/Z from logged Y/X/Z | Keep the coordinate basis and observation time. A player's location is not a mob's spawn location. |
| General population | No general NPC `/who` population grammar exists in the current parser | Visible names can become observations, not an exhaustive zone population. Add a proven log grammar only if private evidence establishes it. |
| Equipped gear and worn/augment locations | Fresh selected-character `/outputfile inventory` | Import the validated worn table. Unknown wiki items/augments remain missing; no Character item OCR. |
| Item examine details | Optional selected-source OCR | Contribute review only; prefer known canonical wiki identities and preserve evidence. |
| Fully equipped, unbuffed character stats | Reviewed current stat-pane OCR/manual proposal | Character current snapshot only; no gear/base addition. Keep the Inventory heading and scrolled Additional Modifiers visible. |

`app/app.js::consumeText` distinguishes initial/reset tails from live input,
checks log timestamps before transient UI, and supplies the shared timer engine.
Attach one new observation consumer after this parser/canonicalization step.
Use a separate persistent contribution queue; the existing 20-entry ephemeral
missing-wiki notice queue is not durable storage.

### Provenance correction needed before publishing loot relationships

`noteLoot(itemName, sourceName)` currently resolves `source` from explicit text,
then a recent kill (at most `max(60, encounterGapSeconds * 2)` seconds), then a
recent encounter target. Its emitted event does not distinguish those cases.
Add a backward-compatible field without changing existing parse totals:

```js
sourceEvidence: {
  kind: 'explicit-corpse' | 'recent-kill' | 'encounter-target' | 'unknown',
  // Where applicable: stable evidence ID, time gap and the observed source name.
}
```

Only explicit text establishes a log-observed loot/source association. A recent
kill is a suggested association to review. Also check nonnegative time gaps:
an out-of-order loot line must not inherit a future kill. Candidate provenance
must not rely solely on the display-friendly `source` string.

## Local OCR selection and distribution

Recommendation: one reusable **Tesseract.js 7.0.0** Node worker using the LSTM
English model, with **tesseract.js-core 7.0.0** and
**@tesseract.js-data/eng 1.0.0**, pinned by the application lockfile. These exact
versions and their registry integrities were inspected on 2026-10-22. This avoids
requiring users to install a system OCR program or a separate platform binding.
The engine is a WASM build; this is an architectural choice, not an accuracy
guarantee for the game's small text. See the upstream [package source](https://github.com/naptha/tesseract.js/blob/v7.0.0/package.json)
and [language-data distribution](https://github.com/naptha/tessdata/blob/gh-pages/README.md).

Bundle the worker entry, resolved dependency tree, all matching core builds and
the English `4.0.0_best_int/eng.traineddata.gz` resource in both platform packages.
Resolve local asset paths explicitly; first capture must work with networking
blocked. Never retain an implicit CDN/default language fallback. A packaged
asset manifest should record version, relative path, byte count and SHA-256;
verify the manifest against packaged files in CI. Keep language-cache writes
under `app.getPath('userData')`, never the install/ASAR directory.

The Node worker selects its installed core automatically, including relaxed
SIMD, SIMD and fallback builds. Do not copy only the one build used by the CI
machine. The v7 [core package manifest](https://github.com/naptha/tesseract.js-core/blob/v7.0.0/package.json)
and [Node core selection](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/worker-script/node/getCore.js)
are more precise packaging evidence than old examples that mention four browser
builds. Use an unpacked runtime resource directory if packaged worker/WASM
loading requires physical files; exercise that exact arrangement in both built
apps rather than assuming development paths will work inside ASAR.

The wrapper/core declare Apache-2.0; the English npm wrapper declares MIT.
Include those notices and the applicable upstream trained-data notices in
`THIRD_PARTY/`. Do not infer the embedded model's license from its npm wrapper
alone. Review transitive licenses when generating the asset manifest. Official
license sources: [Tesseract.js](https://github.com/naptha/tesseract.js/blob/v7.0.0/LICENSE.md),
[core metadata](https://github.com/naptha/tesseract.js-core/blob/v7.0.0/package.json),
[language registry metadata](https://registry.npmjs.org/@tesseract.js-data%2feng/1.0.0),
and [upstream model license](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE).

Reuse one worker while capture is active and terminate it on Stop. Do not use
the convenience API that constructs a worker for every image. Upstream explicitly
recommends worker reuse and bounded concurrency in its [performance guide](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/performance.md).

## Capture owner and native boundaries

Add `desktop/capture-host.cjs` as the only capture coordinator. It owns the
source handle, generation, scheduled work, OCR service and journal writer.
Renderer code receives sanitized state/observations, not arbitrary filesystem
access, worker configuration or executable paths. Keep screen reading disabled
by default. Enabling it never silently chooses a whole display.

Suggested coordinator interface (trusted code calls only):

```js
getState()
listSources()                              // explicit user source-selection UI
selectSource(sourceId)                     // current enumerated/portal source only
setContributionEnabled(enabled)
startCharacter({ sessionId })
stopCharacter({ sessionId })
pause() / resume() / stop()
captureDiscovery({ suggestionId, sourceId })
readJournal({ afterSequence, limit })       // bounded sanitized observations
subscribe(callback)
dispose()
```

Expose narrow versions through `desktop/preload.cjs` on
`eye-of-zomm:capture`. Validate the exact main `webContents`, main frame and local
origin for every control/read/import call. The existing `DiscoveryHost` may call
the coordinator from trusted code after validating the existing main/Triggers
Screenshot sender. Native overlays do not get a general capture API. Remote wiki
login content must have a separate session, no local preload and no capture IPC.

`DiscoveryHost` currently has a private `capturing` boolean and generation plus
independent `desktopCapturer.getSources`. Delegate acquisition to the coordinator
instead of retaining a second capture lock. Preserve its explicit choice UI,
clipboard/shutter behavior and no-focus gameplay flow.

Suggested sanitized state:

```js
{
  enabled: false,
  phase: 'disabled' | 'idle' | 'selecting' | 'running' | 'paused' | 'error',
  owner: null | 'contribution' | 'character' | 'discovery',
  source: null | { label, type: 'window' | 'display' },
  characterSessionId: null,
  generation: 0,
  queuedFrames: 0,
  skippedFrames: 0,
  lastObservationAt: null,
  pauseReason: null,
  error: null
}
```

Source IDs are opaque current-session values; do not treat window names or a
saved ID as durable authorization after restart/re-enumeration. Exclude EoZ's
own main/overlay/login/capture windows. A missing, minimized/empty, replaced,
ended or permission-denied source pauses capture with a readable status; never
fall back to a display or another similarly named window.

### Acquisition strategy

For an initial Windows/X11 implementation, explicit-source desktop thumbnails
can provide bounded still frames, using their actual image dimensions rather
than assuming the requested thumbnail size. Avoid repeatedly capturing every
display/window at full resolution merely to read the selected source.

For ongoing cross-platform capture, prefer a single user-approved
`getDisplayMedia` stream and sample its video frames without MediaRecorder,
audio or video-file storage. Main approves only the exact trusted local capture
frame and the selected source. A dedicated local capture surface, if needed,
gets no game-log/session ownership and stops tracks on every cancellation.
Reuse that source for one-shot captures when explicitly selected.

Linux PipeWire can return only one portal-selected source, so a Windows-style
enumeration/poll loop is not a cross-platform guarantee. Portal cancellation
must deny capture, and restarting may need another picker interaction. Use
Electron's [desktop capture contract](https://www.electronjs.org/docs/latest/api/desktop-capturer)
and [display-media request handler](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts),
then test the pinned Electron 43.8.3 build. Keep existing X11/XWayland overlay
limitations explicit. No native-Wayland live-game capture claim follows from an
Xvfb smoke test.

### Arbitration and cancellation

| Trigger | Required result |
| --- | --- |
| Start contribution | Run only if Settings enable it and a currently selected source is usable. |
| Start character | Record prior contribution intent/source generation, pause its acquisition, cancel stale queued work, then assign character ownership. |
| Stop character | Release character ownership. Resume contribution only if it was previously running, user intent has not changed, and the same source remains valid. |
| Disable/pause contribution during character | Change the saved intent too; Stop character must not re-enable it. |
| Explicit discovery screenshot | Temporarily hold acquisition; take/copy exactly one approved frame, then restore the prior owner only if its intent/generation still matches. It is not a new background OCR session. |
| Change source, Stop, navigation/crash, quit | Increment generation before releasing capture/worker. Late results from old generations cannot enter either queue. |

All operations serialize through the coordinator. Character Stop and source
replacement invalidate both in-flight OCR results and queued callbacks. A
one-shot discovery failure releases its temporary hold in `finally`. If the
character session ends during that hold, do not resurrect it. Stop terminates
OCR and stream tracks, drains only bounded already-accepted journal writes,
and rejects new work immediately.

## OCR processing and evidence

The 0.9.3 source requests an 8 fps window/display stream and samples every
125 ms, encoding at most once every 250 ms with one encode/IPC active. Without
a user-selected area, a bounded visual scan proposes up to four Default Modern
tooltip rectangles from a green title, dark frame and white metadata rows.
This is a crop proposal only; the ordinary OCR/parser must still establish all
item anchors, identity and statistics. A 256x144 pane-local fingerprint ignores
animated scenery. At most eight recent pane fingerprints are held in memory;
an unchanged pane refreshes after five seconds. Least-recent selection prevents
one continuously changing candidate from excluding the others. The source retains truthful
full-frame PNGs for preview and provenance; the host crops before enlarging and
reading the candidate. Configured areas take precedence and retain their
750 ms unchanged heartbeat. Periodic full-scene fallback covers white names,
examine panes, Inventory and contribution evidence: normally 1.5 seconds, or
five seconds while a visual tooltip is present. A due scene can share that
candidate's already encoded full PNG, preserving the tooltip admission rather
than substituting a scene-only frame. These are upper sampling bounds,
not a guarantee that a minimized source or compositor supplies every frame.
See the official
[Electron acquisition example](https://www.electronjs.org/docs/latest/api/desktop-capturer/).

Acquisition freezes one frame before visual detection and fingerprinting; the
same immutable pixels become the queued PNG. Independent live-video reads can
otherwise mix one tooltip's geometry/key with the next tooltip's pixels. A
deterministic video-advance regression exercises that race. Acquisition continues
while PNG encoding awaits. One same-origin browser worker encodes an ImageBitmap
created from that already frozen canvas using OffscreenCanvas. This avoids
main-renderer idle PNG scheduling, which a Windows CI trace measured delaying
correctly retained items for several seconds. No game identity, authentication
or capture authority enters the encoder: it receives pixels, dimensions and an
opaque job ID. Only the matching worker instance/job may resolve a request.

Before the single encoder, the source retains at most two raw canvas snapshots
and 64 MiB of pending pixel bytes, plus one capped working frame during analysis.
The active encode can briefly have three bounded image surfaces (source canvas,
transferred bitmap and worker canvas); the source releases its canvas immediately
after successful transfer, and the worker closes its bitmap after drawing.
All surfaces are bounded to 4096 x 2160. These are logical image bounds, not an
application RSS guarantee. Encoded PNGs remain capped at 32 MiB. The working
frame is released on every nonqueue return. Items precede one replaceable scene;
queued duplicate pane pixels coalesce. Each snapshot carries its original
capture time and immutable context. Source changes, null configuration,
source-size/ROI/generation changes and disposal release pending canvases and
terminate the encoder. Worker errors, malformed replies and a 15-second encoding
timeout report the existing visible encode warning. The browser's noncancellable
bitmap creation retains the one serial slot until it settles, then closes any
stale bitmap; source changes cannot accumulate bitmap acquisitions. Stop itself
does not await it. After transfer, cancellation releases the job promptly. There
is no silent renderer fallback after image transfer. A future current job can
create a new worker. Post-encode configuration checks prevent late delivery.
Raw snapshots expire
after 15 seconds, within the host's 30-second
incoming-frame boundary. Capacity, age and encode losses feed the existing
visible warning and a no-text source-drop aggregate. Raw pixels remain in
memory only; there is no continuous image recording.

The host processes one offline OCR job at a time, with at least 250 ms between
scene starts. Its queue retains at most 12 compressed PNGs and 48 MiB. Item and
configured-area proposals precede one replaceable, latest-only fallback scene.
Fallback cannot evict an item proposal. After three completed priority reads,
a waiting scene gets a turn so character-stat evidence cannot starve. Candidate frames expire after 60 seconds;
ordinary scenes after 15 seconds. Capacity eviction removes fallback first,
then the oldest candidate. Native image decode waits until the serial read
slot. Submission acknowledges before the deferred serial OCR pump performs
native preparation. Pane visual keys coalesce repeated pixels even when the
full PNG changes outside that area; full-scene hashes remain exact.
Completed screen hashes and OCR semantic duplicates expire after three seconds,
allowing unchanged Inventory pixels to produce fresh stat evidence after a
walkthrough transition. Game-log identity/cursor deduplication does not expire
with this screen-specific window. Repeated item proposals belong to the contribution queue; Character gear is
now sourced only from the inventory export.
Overflow updates a visible warning/count;
busy game backgrounds can still exceed throughput. The player should keep each
complete item tooltip visible until its editable card appears. Queued pixels
are ephemeral and never become a continuous image/video recording.

Status includes bounded in-memory aggregate acceptance, empty-read, duplicate,
age/capacity/retry/stale rejection and scene-replacement counters, plus last
encode/source-queue/transport/submission/queue/read durations and the selection kind. These
contain no OCR text, player/item names, source labels or pixels. They are not
telemetry or an automatic recording/export. Strict source/session/generation,
dimension and normalized-region validation remains at the IPC boundary.

For valid compact tooltips, the two refinement slots retain item-name and
item-stat passes when Inventory is visible. Inventory-only stat scenes still
receive the character refinement. Scene plus two refinements remains the bound;
name/number uncertainty and conflicting-value handling are unchanged.

Before drawing, source configuration supplies the current owner, source,
session and generation; the timestamp precedes PNG encoding. Main rechecks all
four identities. Each queued frame snapshots its crop/reference dimensions.
Stop, pause, source/owner changes, imports and area/size changes invalidate all
stale queued/in-flight work. Timeout/crash handling terminates the failed worker
and retains the existing bounded retry policy. Stop cannot wait indefinitely
for recognition. Current Character stat proposals must match their explicit
stat phase/profile boundary; item OCR does not become Character gear.

Initial full-source analysis finds visible item/stat panes; subsequent work uses
stable recognized or user-adjusted regions and change hashes. A user can choose
full-source reading or restrict regions. Preserve original source dimensions,
region coordinates and preprocessing scale. The supplied screenshot has tiny
text, an overlapping item examine pane, a modified +10 item, an augment/effect
section and several adjacent stat columns; fixed pixel positions and a flat
name/value regex are insufficient across UI scales.

Use a small tested preprocessing set: original/color-aware grayscale,
contrast/inversion and 2x/3x upscale for text crops. Keep item artwork separate
from text preprocessing. Extract text plus word/block geometry explicitly; v7
returns text alone unless additional output is requested. Its [recognition API](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md)
supports region recognition and documents the benefit of adequate resolution.
Treat confidence as a ranking signal, not a factual probability.

Keep parsers pure and testable: item examine, inventory stats and visible entity
names accept OCR blocks plus geometry and return proposed fields, raw field text,
confidence/uncertainty and evidence IDs. Separate current/max values (`330/398`),
composite attack values and displayed capped values. Preserve spelling, suffixes,
tier, modified-stat and augment context. Never strip `+10` to silently create a
base item; never add an augment's values twice. Catalog matching may suggest a
correction but does not overwrite the raw reading.

All observations remain reviewable. Duplicate frames/identical examine panes
merge into one candidate with evidence counts; a different tier, augment set or
explicitly captured item instance may be separate. Time adjacency alone never
joins a screen-observed item to a killed mob. Full-scene text is ephemeral;
persist only recognized relevant blocks/fields unless a contributor explicitly
retains a larger evidence crop. Do not journal unrelated visible chat by default.

## Private screen-read journal

Use `<userData>/capture/journal/`, with generated segment filenames and a private
`evidence/` sibling. Never put files in the game directory, repository, bundled
dataset or web server root. Set private file/directory modes on POSIX; Windows
uses the user's profile permissions. Do not expose journals through HTTP routes.

Proposed NDJSON record shape:

```js
{
  schema: 1,
  journalId: 'generated UUID',
  sequence: 24,
  id: 'stable observation ID',
  kind: 'ocr' | 'game-log' | 'manual' | 'capture-state',
  capturedAt: 'ISO UTC',
  recordedAt: 'ISO UTC',
  owner: 'contribution' | 'character',
  sessionId: 'generated UUID',
  input: {
    // OCR: capture/source generation, frame ID, source size, pixel crop, scale.
    // Log: opaque log identity/segment, line/event cursor, explicit live flag.
  },
  parser: { name: 'item-examine', version: 1 },
  subject: { kind: 'item' | 'monster' | 'zone' | 'character', name: 'Observed name' },
  fields: [{ key: 'ac', raw: 'AC 14', value: 14, confidence: 82 }],
  relations: [],
  evidence: { text: 'bounded relevant text', imageId: null },
  dedupKey: 'hash of normalized semantic observation and provenance context'
}
```

The journal contains observations, never passwords, cookies, tokens, wiki API
responses, machine usernames or full filesystem paths. Fields remain untrusted
text and are rendered as text. Evidence IDs resolve only inside the managed
directory; reject traversal, symlinks/reparse escapes and caller-supplied paths.

Initial bounds, to validate under representative sessions:

- At most 128 KiB per record, 16 KiB relevant text and 2,000 OCR words. Reject
  oversized input before append; explicit image imports also require byte/pixel
  limits before decode. PNG signature alone is not an image dimension check.
- Rotate at UTC day change or 4 MiB, whichever comes first. Keep at most seven
  days and 64 MiB of raw journal, with a visible Clear capture history action.
- Keep evidence only when explicitly retained for a candidate/session: seven-day
  temporary retention and a 128 MiB total evidence budget. Copy approved field
  values into materialized drafts before pruning; do not silently erase a draft.
  User-retained evidence counts toward the budget and needs visible removal/export
  controls, not an unlimited exemption.
- Bound the append queue by bytes and records. When the writer is blocked/full,
  stop scheduling OCR and show paused/storage status. Never silently drop an
  accepted observation while continuing to claim it was saved.

One serialized writer appends complete JSON plus newline. Publish an observation
only after its append succeeds. Materializers save their processed journal ID,
segment and sequence cursor atomically after applying a record idempotently.
On restart, accept only complete bounded lines, ignore a crash-truncated trailing
line and surface/quarantine middle corruption rather than treating arbitrary
bytes as observations. A missing retained segment produces an explicit history
gap, not fabricated continuity.

Replay updates drafts/character inventories only. It never sends live parser
events, timers, transient wiki notices, screenshots or wiki writes. A versioned
parser upgrade reprocesses retained evidence through an explicit action and
retains the original observation/provenance. Users need not process OCR at video
frame rate; reading and candidate reconciliation can proceed after capture ends.

## Concrete source plan

| File | Responsibility |
| --- | --- |
| `desktop/capture-coordinator.cjs` | Pure ownership/generation/backpressure state machine with injected capture/OCR services; no Electron imports. |
| `desktop/capture-host.cjs` | Exact-frame IPC, source approval, acquisition adapter, status, worker and journal lifecycle. |
| `desktop/capture-journal.cjs` | Bounded append/rotation/replay/cursors/evidence path validation; injectable fs/root for tests. |
| `desktop/ocr-service.cjs` | Reusable pinned worker, local asset resolution, timeout/cancellation, bounded structured results. |
| `app/capture-observations.js` | Pure OCR-block interpretation and common observation schema; no network or storage. |
| `app/contribution-observations.js` | Catalog-aware candidate merge, uncertainty/evidence and relationship suggestions; no wiki mutation. Coordinate with the contribution owner. |
| `app/parser.js` | Add sourceEvidence only; preserve every current parser/timer/parse contract. |
| `app/app.js` | Feed parsed/canonicalized events once, wire UI/status and local capture start/stop; preserve session reset guards. Root owns integration. |
| `desktop/discovery-host.cjs` | Delegate acquisition to shared coordinator, retain existing sender/notice behavior. |
| `desktop/main.cjs`, `desktop/preload.cjs` | Initialize/dispose and narrowly expose capture; include shutdown flushes. Root coordinates edits. |
| `scripts/prepare-ocr-assets.mjs`, package/build manifests | Deterministic local runtime/data assembly, checksums/notices and packaged source checks on both OSes. |

Do not export the whole coordinator or an arbitrary `invoke(channel, args)`
bridge. Agree on callback payloads with character/contribution owners before
they depend on them. Root owns shared files and their final integration.

## Required verification and honest limits

1. Pure coordinator tests: competing starts, repeated Stop, source loss,
   generation cancellation, discovery failure, user disabling contribution during
   character ownership, quit during OCR and bounded queue replacement.
2. Journal tests in a temporary isolated root: duplicate/replayed records,
   half-written final line, malformed/oversized middle lines, I/O failure,
   cursor crash windows, rotation/retention and evidence path escapes.
3. Parser regression tests: explicit versus inferred/unknown loot, negative time
   gap, initial-tail suppression and manual New session preserving the current
   live cursor. No new parser implementation in the capture service.
4. Actual local OCR on synthetic text/layout images, plus private calibration
   against the supplied examine/stat screenshot. Record exact raw/corrected
   results, field omissions and confidence without committing the source image.
   The supplied low-resolution composite alone cannot establish live OCR quality.
5. Run the same offline first-use OCR/Stop/restart checks in source and packaged
   Windows/Linux apps, using isolated profiles. Verify every WASM/model dependency
   is present and no network request is needed.
6. Exercise actual source capture on Windows and an available Linux desktop;
   test portal permission rejection/source ending when possible. Xvfb proves
   selected harness behavior only, not Proton/Wayland game acceptance.
7. Inspect both tabs/status/source selection with 10/13/20 px fonts, narrow main
   windows, current overlays visible, and existing discovery Screenshot active.

The original context/design audit preceded implementation. The ledger at the top
records what was subsequently exercised; proposed sections do not override its
explicit limitations.

## Historical item-text/Modern calibration and retained parser behavior

Parser version 5 adds `rawStatBlock`, a separate item observation field containing
at most 8,192 characters and 60 lines. It preserves the observed metadata/stat
block and unknown intervening written lines, plus relevant independently read
stat refinements. Its full value is retained separately from the 512-character
`field.raw` preview, and appears first in scoped item evidence. It is never an
automatically confirmed wiki `statLines` value. Original pane identity, tier,
observed numbers and raw evidence remain separate from catalog/base values.

An observed isolated Done button ends the block; chat/command lines stop it.
When no closing button is recognized, retention ends at the last recognizable
item metadata/stat/effect/cast/cooldown row, preserving unknown intervening lines.
This bounds relevant text without claiming that unreadable pixels, offscreen or
scrolled-out content were captured. The original journal provenance still applies;
no screenshot or full desktop/chat text is persisted by this change.

`parseItemStatBlock(text)` is the shared pure entry point for explicit Character
text edits/reparse. It returns `{fields,conflicts,warnings}` with recognized
numeric fields only. It rejects text over the same character/line bounds;
different repeated values for one key are omitted and reported as conflicts.
It does not mutate the supplied text, read a catalog, scale a tier or verify a
fact. Returned field confidence is zero until an owner separately records its
manual/observation provenance. Explicit Haste percentages are parsed as `haste`,
distinct from `attackSpeed`; effect names/ranks such as Worn Effect: Haste 12
and an item's own name do not manufacture a numeric Haste stat. Range, Damage
Bonus and the full Endurance Regen spelling join the existing supported stat
aliases. Unsupported written lines remain raw text rather than invented numbers.

The local active client file
`C:/EverQuest Legends/uifiles/default_modern/EQUI_InventoryWindow.xml` was read
without modification. Its `IWS_ArmorClassScreen` orders CurrentMitigation
(EQType22), slash, SoftcapMitigation (853), vertical divider, Evasion (403).
The tooltips explicitly identify mitigation, mitigation softcap and evasion.
`IWS_AttackScreen` orders CurrentOffense (23), vertical divider, Accuracy (402),
whose tooltips identify offense and accuracy. Therefore Modern observation keys
are `acMitigation`, `acMitigationSoftcap`, `acEvasion`, `attackOffense` and
`attackAccuracy`. The middle AC value is not a maximum, and Attack's two values
are not melee/ranged or an aggregate. Generic item AC/Attack remain separate.

Missing component separators cannot turn concatenated OCR digits into a giant
single component. When the independently observed Modern AC divider establishes
the shared column, the existing character refinement atlas may include small
Offense/Accuracy digit crops and, when needed, an Evasion crop. The crop stops
before another attribute label; its coordinates, component role and local Otsu
contrast preprocessing are recorded. It reads the original pixels rather than
splitting a recognized digit string. A single numeric result with confidence at
least 85 is required; multiple, malformed, weak or conflicting readings remain
unknown. Tall OCR noise is excluded before character rows are aligned. The
existing maximum two refinements, four source tiles, 4MP stat atlas and source
pixel limits are unchanged; there is no extra OCR call or cloud service.

Focused parser/reader tests and the actual canvas-only Modern pixel gate pass
against source dependencies and the assembled offline OCR runtime. The updated
synthetic image exercises explicit item Haste, all five AC/Attack components,
independent item panes and right-side Inventory resources/attributes/resists.
Private provided-image measurement on 2026-10-23 recovered all five requested
components from the selected Inventory area, with no incorrect component values.
The full frame recovered the three AC components and left both Attack components
unknown. All three item panes and their separately retained stat text were
recognized. This is measured evidence for that supplied Modern image, not a claim
that every item, skin, resolution or live source is calibrated. Private source,
measurement reports and temporary helper output remain outside Git. Measurement
helpers run under an awaited parent with ignored pipes, closed-output/error exit
guards and watchdog cleanup; no installed player profile is used.
