# Screen-reading master permission

Settings → Screen reading uses one device-local boolean, `screenReadingEnabled`,
in the existing native configuration. Only literal `true` enables it. Missing,
false or malformed values remain disabled. The former checkbox had no persisted
preference and could be silently enabled by automatic Contribute or Character
starts; that session activity is not migrated into consent.

The main-frame-only capture IPC exposes `setReadingEnabled(boolean)` and reports
`status.readingEnabled`. This permission is distinct from `status.enabled`, which
describes an active capture session. While permission is enabled, the active
Contribute discoveries tab starts reading automatically. Enabling the master
while that tab is active starts a new bounded reader intent after native
acknowledgement. A unique recommended game window is selected; ambiguous sources
require a choice. Character stats remain an explicit Character workflow. Disabling
clears queued resume intent. New enabled/visible intent cannot revive an old OCR
frame or asynchronous source request; explicit Pause remains paused until Start
or a fresh explicit item request.

CaptureHost enforces the permission on source selection, both capture owners,
resume, calibration, previews, item evidence, frame admission, file/clipboard
imports and direct PNG OCR. Disabling synchronously revokes the generation and
owner before awaiting worker termination, destroys the source window and clears
pending frames/evidence. Worker results must still match the current generation
and enabled permission before journaling or emission. Delayed file-dialog work
cannot become a new OCR request after permission changes. DiscoveryHost's separate
clipboard screenshot path uses the same native permission before enumeration and
after awaiting source capture.

The setting does not disable text logs, inventory exports, manual stat text,
existing saved evidence or wiki uploads. An attached image can still be reviewed
and uploaded while its optional OCR enrichment is skipped. Icon-artwork matching
is not screen OCR. No camera/audio permissions or remote OCR are introduced.

`node tests/capture-host.mjs` covers unchecked native entry points, explicit zero
work, active Character/contribution cancellation, no automatic resume, late worker
results and independent log observations. `npm run test:screen-reading-master`
uses the actual main/preload in three disposable synthetic processes to verify
the visible red warning, checkbox IPC, default migration, one automatic active-tab source request,
native denial and enabled/disabled restart persistence. It never touches the
installed profile or captures the real desktop. Source-only fixtures and native
fixture observations are not a live-game acceptance claim.

Contribute OCR only enriches an existing chat/log-backed item or an explicit linked-item request. Image-only and replayed image observations cannot create queue entries, NPC/zone population or loot relationships. Exact canonical identity takes priority; a uniquely matching rn/m confusion or one-character typo in a longer multiword name can fill proposals while preserving the log name. Ambiguous candidates stay unfilled. The queue preserves its bounded original log proof even after repeated OCR. Equivalent reader/gate updates retain the editor DOM rather than remounting its form, focus, expanded sections or scroll state. The linked popup receives a separate draft-bound identity after the coordinator independently validates the narrow correction; raw OCR text and its native session/generation/source/time evidence remain unchanged. The actual native discovery workspace fixture verifies green completion through DiscoveryHost IPC and its popup DOM, plus stale/ambiguous rejection and explicit master-off navigation.
