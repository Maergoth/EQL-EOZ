# Capture and observation pipeline

Status: initial implementation and local verification, 2026-10-22. Owner: `capture_pipeline_089`.
Parent plan: [Capture, wiki contributions and character snapshots](../CAPTURE_CONTRIBUTIONS.md).
The design contract follows the implementation ledger below. Unmeasured platform,
packaged and live-game behavior remains an explicit acceptance item.

## Implementation ledger and exact API

Implemented files: `desktop/capture-host.cjs`, `capture-image.cjs`,
`screen-read-journal.cjs`, `ocr-service.cjs`, `ocr-worker.cjs`,
`capture-source-preload.cjs`; `app/capture-source.html`, `capture-source.js` and
`screen-read-parser.js`. Existing parser changes are additive `sourceEvidence`
and `sourceConfidence` fields, preserving its current source attribution/totals.

`new CaptureHost({electron,origin,getMainWindow,root?,journal?,ocr?,onObservation?,now?})`
registers exact-main-frame `eye-of-zomm:capture` IPC. Actions are `status`,
`sources`, `start({mode,sourceId,sessionId?})`, `stop({mode?})`, `pause`, `resume`,
`read({afterSequence,limit})`, `observe-log({event,context})`,
`import-image({mode?,sessionId?})` and
`clear-history`. Events are `eye-of-zomm:capture-status` and
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

Source startup rechecks its operation revision after journal initialization and
ignores errors from a superseded source load. Every OCR startup, message, exit,
error and timeout callback is bound to its exact worker; recognition also checks
that its awaited initialization still belongs to the active worker. A retired
worker or completed job cannot cancel a replacement job while termination drains.

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
- `prepare-ocr-assets.mjs` assembled 14 resolved packages and 240 size/digest
  verified files, including notices. OCR dependencies are development/build
  inputs; packages receive one physical `resources/ocr-runtime` resource tree.
  CI now includes Windows/Linux source and packaged-ASAR capture paths, plus
  wiki-auth and workspace native gates. Those CI/packaged/Linux results were
  **not yet observed** during this handoff.
- Private calibration used the supplied **748×331** composite screenshot at
  1x, 2x and 3x, plus an explicit examine-pane crop at 2x/3x/4x with color,
  inverted grayscale and high contrast under sparse/block segmentation. This is
  separate from the large synthetic fixture tests. Mean full-image OCR confidence
  was 28/52/54; these values are engine estimates, not measured accuracy.
- The default single color pass now enlarges sources narrower than 1000 pixels
  by 3x (1000–1599 by 2x), bounded to 16 megapixels and an 8192-pixel dimension
  after enlargement. The supplied image produces one editable item proposal at
  the default 3x: **`Boots of the Leng Road +10`, AC 14, tier 10**. The visual
  screenshot reads `Boots of the Long Road +10`; the misspelling remains observed
  OCR evidence for the contributor to correct or match to the catalog. It is
  not silently replaced with a guessed canonical name.
- The explicit crop's 4x color/block pass recognizes
  **`Boots of the Long Road «10`**, tier 10, Class/Race ALL. Inverted/high-contrast
  processing does not consistently improve names or numeric fields; it remains
  a calibration option, not an automatic multi-pass capture cost. The original
  supplied file is untouched and no private image is committed.
- AC 14 is grounded in aligned same-row word geometry. Two parser defects found
  during calibration are fixed: whitespace cannot cross rows to consume an
  unrelated number, and tall noisy glyphs cannot shift a small digit to the next
  stat row. Exact aligned Class/Race plus an independently repeated title/body
  name can recover an unreadable Description tab. Leading-zero integers such as
  OCR `Weight 02` are omitted because the decimal may have been lost; the parser
  does not invent `0.2`.
- HP 15, Weight 0.2 and a complete character snapshot are visually present but
  **not reliably extracted** from this tiny overlapping screenshot. A larger
  source and explicit user review remain necessary. Final private text/geometry/
  proposal evidence is outside Git at
  `D:\EQLWiki\.local\validation\eoz-capture-ocr-final.json`.
- After the calibration changes, `npm run test:capture` passed again (including
  synthetic cross-row/height/missing-tab regressions, bounded scaling, offline
  Character import and live/import worker arbitration). The actual Windows
  persistent synthetic source smoke also passed again in approximately four
  seconds. No installed profile, live wiki or user clipboard content was used
  as a fixture.

Remaining work before claiming the capture feature complete: broader real-game
accuracy/usability, optional user-selected regions, packaged and Linux native
outcomes, root UI review, retention/error acceptance and PR review. The capture
branch remains separate from the urgent font/cache hotfix.

### Repeating private calibration

Use `node scripts/calibrate-screen-read.mjs --image PRIVATE.png --output
PRIVATE-results.json` with paths outside Git. Optional `--crop x,y,width,height`
adds a bounded in-memory crop matrix; it never changes or copies the source
image. The report contains private recognized text and word geometry and must
remain ignored. Production capture uses one sparse color pass and one reusable
offline worker, with one in-flight frame and one replaceable newest frame.

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
| Item examine details, augment/tier display, equipped slots, character stat panes | Not present in the supported log grammar | Local OCR plus contributor review. Prefer exact known catalog records over OCR reconstruction. |

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

Start with one in-flight job, one replaceable newest-frame slot, and an adaptive
minimum sampling interval of two seconds. Do not queue a backlog of screenshots
behind slow OCR; count skipped frames. Character's explicit Capture now may
replace a pending automatic frame but cannot start concurrent recognition.
Timeout/crash handling terminates the worker; show an error after a bounded
retry, with an explicit Resume. Stop must not wait indefinitely for recognition.

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
