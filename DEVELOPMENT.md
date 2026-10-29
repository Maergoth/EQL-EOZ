# Developing Eye of Zomm

This is the current technical entry point for contributors and coding agents.
Use [README.md](README.md) for the user guide, [CONTRIBUTING.md](CONTRIBUTING.md)
for contribution rules, and [CHANGELOG.md](CHANGELOG.md) for released changes.
The focused guides linked below explain component contracts in more detail;
[UX direction](docs/UX_VISION.md) describes the product's interaction goals.
Historical plans, handoffs and release receipts explain earlier decisions;
they are not a substitute for inspecting the current implementation.

## Get started

Use Node.js 22 and npm, matching CI. Put a PHP 8.x CLI on `PATH` for the
PHP-backed exporter/wiki fixtures in the source suite; the installed Electron
app does not need PHP.

```bash
npm ci
npm test
npm start
```

`npm ci` installs the committed lockfile. `npm start` builds the workers and
generated runtime assets through `prestart`, then opens the desktop app. Pure
tests use synthetic fixtures and need no real game or wiki account. Native
desktop fixtures also need the platform dependencies and a display; follow
[validation](VALIDATION.md), the [Windows acceptance guide](docs/WINDOWS_MANUAL_TEST.md)
and the [Linux runtime/display guide](docs/FONTS_LINUX.md).

## Start with the boundary

Eye of Zomm reads ordinary logs and supported files from a user-selected game
directory. Optional screen reading processes explicitly selected images locally.
It does not inspect the game process, inject code, modify game files or generate
gameplay input. Preserve the full [safety](SAFETY.md) and
[security](SECURITY.md) contracts when adding a feature.

EQLWiki is a separate application and database. App code, the public
dataset, wiki application code, wiki templates/interface pages, uploaded images
and private host scripts have separate publication boundaries. An app PR does
not install a wiki helper, publish an article or rebuild a dataset. Keep real
logs, images, account information, client archives, generated packs, databases
and recovery backups out of Git. Use synthetic fixtures and disposable profiles.

Before editing a component:

1. Find its renderer owner, native boundary and durable store in the index below.
2. Read the focused contract and the existing tests, including failure paths.
3. Identify which values are observed, authored, calculated or inferred. Keep
   those authorities separate throughout the change.
4. Define how cancellation, profile/source changes, restart and failed writes
   affect the operation before adding another asynchronous path.
5. Make the smallest coherent change, update the relevant guide, and choose
   checks that exercise the changed boundary. Record what was actually run.

## Runtime and source layout

The desktop entry point is [desktop/main.cjs](desktop/main.cjs). It owns the
loopback HTTP server, native windows, configuration, file access, services and
shutdown. [desktop/preload.cjs](desktop/preload.cjs) exposes narrow APIs through
Electron's context bridge. The main UI is plain HTML/CSS and browser ES modules
under `app/`; [app/app.js](app/app.js) composes its long-lived owners and
[app/capture-workspace.js](app/capture-workspace.js) composes Character and
Contribute. Native code uses CommonJS `.cjs`; renderer/pure shared code uses ES
modules. Native services can dynamically import pure app modules without
exposing Node to a renderer.

| Directory | Responsibility |
| --- | --- |
| `app/` | Main UI, pure models/parsers/policies, overlay UIs and browser worker entries |
| `desktop/` | Electron authority: IPC, files, private stores, wiki session, OCR, windows and updates |
| `server/` | Reviewed mirrors of the wiki's server-local public dataset producer and its contract |
| `scripts/` | Generated runtime preparation, source/package checks and actual desktop fixtures |
| `tests/` | Pure, DOM, service and worker regressions; synthetic fixtures |
| `app/vendor/`, `vendor/`, `THIRD_PARTY/` | Pinned shared/upstream sources, assembly inputs, provenance and notices |
| `app/assets/whats-new/` | Reviewed release illustrations, using synthetic data |
| `.github/workflows/` | Source checks, platform builds and the coordinated release publisher |

### Processes and data flow

```text
selected local log ── native bounded read ── main renderer parser/session
                                              │
cached public dataset ── local indexes ─────────┼── views and compact overlays
                                              ├── evidence-backed discoveries
                                              └── triggers and local alerts

selected capture ── native coordinator ── offline OCR ── structured observations
                                                           │
inventory/achievement files ── native SQLite worker ── Character working set
                                                           │
reviewed draft/sheet ── native wiki client ── guarded wiki write + receipt
```

One main renderer owns the interactive log/session/timer pipeline. A native
`AutomaticLogReader` independently witnesses the actual configured-file bytes
for the narrowly supported automatic source workflow; renderer-proposed events
cannot grant that write authority. Opening an overlay must not create a second
interactive parser, timer engine, log poller or screenshot reader.

### Native trust and cancellation

The server binds to loopback and validates its Host header. Mutating HTTP
endpoints require the existing same-origin marked POST contract. Native IPC
handlers check the sending `webContents`, exact main frame and local origin;
checking only a channel name or a renderer-supplied ID is insufficient. The
login window, capture source and overlay renderers have different capabilities.
Preserve their separate preloads and permission/navigation policies.

Every asynchronous result belongs to a context: source/session/generation,
profile/revision, account, selected item or request epoch as applicable. Capture
that context before starting work and recheck it after awaits and immediately
before committing or publishing. Revoke an epoch synchronously before awaiting
worker shutdown. An abort signal alone does not make a late result harmless.
Use disposal methods to remove timers, listeners, IPC handlers and worker jobs.

An operation that might already have reached the wiki cannot be treated as
cancelled with certainty. Preserve its journal and reconcile the exact prior
write before retrying; never create a replacement identity to bypass an unknown
result. Read-only reconciliation and new publication are distinct decisions.

## Component index and invariants

### Application shell, settings and appearance

Start in [app/index.html](app/index.html), [app/app.js](app/app.js),
[app/styles.css](app/styles.css) and the native configuration/window handlers
in [desktop/main.cjs](desktop/main.cjs). Appearance is shared through
[app/appearance.js](app/appearance.js),
[desktop/appearance.cjs](desktop/appearance.cjs) and the appearance presets.
Installed-font discovery belongs to `system-font-settings.js` and
`font-permissions.cjs`; it enumerates family names, not font uploads.

Settings should name the user-visible outcome, group related controls and keep
advanced diagnostics secondary. Reuse theme variables, existing form classes
and spacing. Preserve keyboard operation, labels, focus-visible treatment,
small-window scrolling, text-size scaling and native overlay contrast. A
background status update must not remount an edited form or steal its focus.
See [fonts/Linux](docs/FONTS_LINUX.md),
[window/config writes](docs/WINDOWS_CONFIG_WRITES.md) and
[frontend cache](docs/design/FRONTEND_CACHE.md).

#### Whole-feature controls

The availability catalog is `map`, `npcIntel`, `items`, `drops`, `combat`, `triggers`,
`contributions`, `character`, `overlays`, `screenReading` and
`dropObservations`, with stable definitions in
[app/feature-registry.js](app/feature-registry.js).
Availability defaults to true. Native configuration accepts only known boolean
feature patches; consumers receive a revisioned full snapshot through
`window.eyeOfZommFeatures.getState()`, `.set(patch)` and `.onChanged(handler)`.
Overview, Settings, shared log context and cached data remain core services.
The native [FeatureControls host](desktop/feature-controls.cjs) serializes changes
and runs preparation before revoking per-feature leases or changing availability.
Disabling drop observations first uses the existing renderer persistence barrier
to save buffered local data while collection is still allowed. A failed drain
leaves availability, revisions and leases unchanged. Successful preparation is
released after the lifecycle/save outcome; quit or reload retains ownership of
its own drain. Feature epochs revoke before asynchronous stop/persistence work.
A failed change restores prior availability with a newer revision; it does not
revive stopped work. [Host regressions](tests/feature-controls-host.mjs) exercise
this injected contract independently of the actual Electron integration.
The [native integration fixture](scripts/test-feature-controls-workspace.mjs)
uses disposable profiles to check the real main/preload boundary and restart.

Availability is separate from consent. Enabling Screen Reading as a feature
does not enable the existing default-off `screenReadingEnabled` permission;
observation availability does not rewrite observation consent. Disabling a
feature preserves its data, selections, drafts and preferences. Re-enabling it
does not restart an old capture intent or replay missed automatic actions.
Running timers become paused. Overlay visibility preferences remain saved, but
their transient suspension requires an explicit Show, toggle or cycle action
before a window can reopen; a later session publication or display change cannot
revive it.

Availability changes are not authoring actions. Do not save an untouched editor
projection or its default values merely because a feature flag changes. Actual
form input and explicit actions persist their edits; feature preparation only
drains writes already accepted by the component. Cover exact raw draft equality,
including legacy empty fields and registry timestamps, across unrelated toggles
as well as disable/re-enable, and separately prove authored edits survive.

Retain an operation's original feature lease across awaits and check it before
using a result or admitting a write. Continuous capture ownership and a manual
image import can differ, so gate both independently. Log observations belong to
Contribute and do not require OCR consent. The shared wiki client keeps
Character, contributions and drop observations independent; its request context
combines nested leases rather than renewing a disabled intent. An already sent
POST retains its confirmed or unknown result for reconciliation. Staged imports
and browser recovery cancel before activation, while an admitted atomic commit
drains and reports its actual result before disable is acknowledged.

When extending the catalog, add one stable ID rather than a scattered list of
navigation labels. Define dependencies and effective availability centrally,
then cover every entry point: navigation, deep links, native IPC/HTTP, overlays,
scheduled work and post-await commit guards. A hidden tab is not a disabled
feature. Stop owned readers/workers/alerts and withdraw transient windows while
allowing already accepted local saves to drain safely. Test default migration,
restart, invalid patches, disabled direct calls and late results. Update this
index and the relevant focused guide with the new feature's ownership contract.

Every future optional feature must also support complete UI hiding. Register its
ownership with the [feature visibility projection](app/feature-visibility.js),
including generated controls, Settings cards, Overview summaries, links from
other tools and native menus. Set `data-feature-ui` to one stable catalog ID or
space-separated IDs; every listed feature must be available (AND semantics).
Unknown or empty identities fail closed. The projector owns only
`data-feature-ui-hidden`, leaving the component's own `hidden`, readiness and
input state intact. Its observer projects newly inserted controls and changed
ownership; removing ownership from a reused core action clears only the
projection's hiding. Use the same helper in native overlay renderers and send
their authoritative feature map through the existing state contract.
Disabled-feature controls leave layout, keyboard navigation and the accessible
tree; their switches remain available in Settings → Features for re-enabling.
Hide empty groups and their topic links. Keep projection-owned hiding separate
from a component's own loading, empty or readiness state, and reapply projection
after dynamic rendering. Shared item displays, generic wiki navigation and core
log identity remain available to enabled consumers. Add regressions for both
disabled startup and disable/re-enable after those surfaces have rendered.
The user-facing control guide is [Feature controls](docs/FEATURE_CONTROLS.md).

### Logs, identity, combat and sessions

[app/parser.js](app/parser.js) turns supported log messages into typed events;
`log-context.js`, `zone-identity.js`, `chat-item-mentions.js`, `combatants.js`
and `dot-cast-order.js` hold narrower rules. `overlay-session.js` owns shared
session/timer state and compact presentation snapshots. Native log selection,
bounded reads and contextual history belong to `desktop/log-selection.cjs`,
`desktop/main.cjs` and `desktop/log-context-history.cjs`.

Treat a source switch, truncation, zone visit, cursor reset and New session as
explicit boundaries. Historical context reads must not replay counters or
authorize new wiki writes. Maintain partial-line handling and byte offsets;
do not replace the tail reader with repeated full-file parsing.

Measured damage dealt and damage taken describe the same hit from different
perspectives; summing them double-counts it. Keep healing, rune capacity and
unmeasured effect/cast metadata separate. Preserve exact actor names and unknown
attribution. Cast-order DoT inference has explicit provenance and cannot create
NPC or wiki-source evidence. Add sanitized grammar examples with negative,
ambiguous and quoted-chat counterexamples. See
[combatants](docs/COMBATANT_OVERVIEW.md),
[chat boundaries](docs/CHAT_ITEM_BOUNDARIES.md) and
[zone/consider context](docs/CONSIDER_LEVEL_PREFILL.md).

### Triggers, countdowns and alerts

`timer-engine.js`, `trigger-match-core.js`, `trigger-matcher.js` and
`app/workers/trigger-match.worker.js` implement deadlines and bounded matching.
`timer-settings.js` owns editing; `timer-alerts.js` owns local sound/speech;
`overlay-session.js` receives commands from native panels.

Use absolute deadlines and event-time replay/quiet guards, not accumulated
interval ticks. Trigger definitions and active timer instances are separate.
Keep unsaved editor values during live updates and surface matcher timeouts.
Expression evaluation stays in the bounded worker; do not execute arbitrary
expressions on the UI thread or turn a match into game input. Disabling trigger
work must stop alert side effects as well as its visible rows. See
[Timers](docs/TIMERS.md).

### Native overlays

`desktop/overlay-host.cjs`, `overlay-docking.cjs`, `overlay-preload.cjs` and
`window-placement.cjs` own windows, trusted commands, docking and persistence.
`app/overlay-controller.js` is the main-renderer broker; `overlay.js`,
`overlay.css`, `map-overlay.js` and `map-overlay-3d.js` present bounded state.
The internal `timers` panel ID survives the user-facing rename to Triggers.

Native panels receive compact snapshots, not raw logs, filesystem paths, cookies
or full inventories. Aggregate totals before truncating display feeds. Maintain
one owner for session actions; use sequence/revision guards for late commands.
Keep manual height distinct from content-driven automatic height, and account
for native DPI rounding, minimum sizes, actual visibility and compositor
acknowledgment. Preserve recovery controls when the main window is hidden or
reloaded. See [overlay layout](docs/design/OVERLAY_LAYOUT.md),
[drag detach](docs/OVERLAY_DRAG_DETACH_PLAN.md) and
[location delivery](docs/MAP_LOCATION_LATENCY.md).

### Maps, geometry and navigation

`coordinate-system.js` owns transformations: game `/loc` is Y/X/Z, runtime world
positions are X/Y/Z, client text maps negate planar axes, and the decoded viewer
has a separate adapter. Do not repair a drawing by changing these conventions
at an unrelated call site. `zone-identity.js` preserves exact catalog/archive
identity, aliases, short names and normal/raid context.

The wrapper is `app/zoneviewer/viewer.html`; the pinned viewer bundle is assembled
from `vendor/zoneviewer/` by `scripts/assemble-zone-viewer.mjs`. Readable guarded
compatibility code lives in `viewer-archive-discovery.js`,
`viewer-archive-header.js`, `viewer-gltf-images.js`, `viewer-terrain-indices.js`
and `scripts/patch-viewer-terrain-indices.mjs`. Keep exact-seam validation,
idempotence, cache versions, archive bounds, material/geometry preservation and
third-party notices. Do not hand-edit a generated minified bundle as the only
record of a fix.

Routes pass through `recast-route-client.js`, `recast-route-engine.js`,
`route-validation.js`, `collision-geometry.js` and `route-guidance.js`.
Worker/zone generations must agree before results become current. A destination
marker is the correct fallback when geometry cannot prove a safe route; never
draw an unvalidated path or fake flat geometry to report a successful load.
See [zone aliases/archive compatibility](docs/MAP_ZONE_ALIASES.md),
[navigation design](docs/NAVMESH_EVALUATION.md),
[route rejection evidence](docs/ROUTE_REJECTION_AUDIT.md) and
[map validation](docs/MAP_VALIDATION.md).

### NPC Intel, items, drops and Crawl

The main catalog views are composed in `app/app.js`; native Intel renders in
`app/overlay.js`. `wiki-identity.js`, `item-browse.js`, `loot-classification.js`,
`loot-set-coverage.js`, `catalog-itembox.js` and `tooltip-delay.js` provide shared
identity, filters, classification and item presentation. `crawl-mode.js` shares
per-zone-visit kill progress between map and Intel.

Resolve canonical identity and normal/raid source scope before deduplication or
classification. A lower bound of six verified canonical monsters can establish
Common; a smaller incomplete count cannot establish Unique. Missing fields or
unknown collection membership are not negative evidence. Do not infer a pet,
monster, rare status or item-set membership from name similarity.

Keep stable row DOM across unrelated heartbeats, distance changes and reader
updates. Preserve open disclosures, scroll, hover targets and keyboard state.
Item cards use the shared presenter and hover timing rather than a per-view
formatter or arbitrary HTML. See [Crawl](docs/CRAWL_MODE.md),
[loot classification](docs/CONTRIBUTION_LOOT_CLASSIFICATION.md) and
[automatic coverage](docs/AUTOMATIC_CONTRIBUTION_COVERAGE.md).

### Item formulas, base recovery and recorded values

[app/item-scaling.js](app/item-scaling.js) adapts catalog fields to the pinned
wiki-owned engine/rules in `app/vendor/`. `item-base-recovery.js`,
`item-base-review.js` and `item-base-review-ui.js` handle conservative inverse
proposals and manual review; `item-stat-presentation.js` owns adjusted-value
presentation. Use [the shared formula contract](docs/SHARED_ITEM_SCALING.md),
[tier-zero verification](docs/TIER_ZERO_VERIFICATION.md) and
[base recovery](docs/CHARACTER_CATALOG_BASE_RECOVERY.md).

Do not create an independent formula in a view. Preserve explicit zero, negative,
unknown and absent as distinct inputs. Canonical aliases must take the same
path. Contextual Void recovery cannot invent a base zero; a proposed base must
round-trip through the current forward rules before certification. Authored
tier-zero bases and recorded Character totals are separate authorities. A
catalog refresh or slider move must never rescale a recorded total or rewrite
observed evidence.

### Character models, private inventory and imports

`character-model.js`, `character-profiles.js`, `character-walkthrough.js`,
`character-catalog.js` and the inventory/inspect/itembox/achievement view modules
model the current Character workflow. `character-class-picker.js` accepts two
or three canonical classes; preserve normalization of legacy metadata while
keeping new registration validation explicit.

The native full-inventory authority is `desktop/character-repository-worker.cjs`
using built-in `node:sqlite`, behind `character-repository.cjs` and
`character-repository-contract.cjs`. `app/character-repository-client.js` keeps
a bounded working set, not a complete in-memory roster. Large record reads,
pages and mutations have individual byte/count limits; the native collection
has no arbitrary aggregate item-count or total-byte product limit.

Use profile revision/CAS transactions and explicit durable acknowledgments.
Preserve unknown private fields when applying known-field changes. Keep local
mutation epochs separate from native revisions so an old read cannot overwrite
an unacknowledged edit. Share/import/profile switches flush first; closing drains
accepted work without pretending a failed save succeeded. Do not restore stale
browser mirrors over an activated native database.

`desktop/character-import-files.cjs` owns stable selected-file reads and paired
imports. `inventory-stream-parser.js`, `inventory-import-record.js`,
`inventory-legacy-migration.js` and `achievement-export.js` provide pure parsing,
physical-entry merge and legacy extraction. Stage an inactive generation, verify
both sources and the selected profile, then activate atomically. Retain physical
copy IDs, exact origins, manual changes, sparse sockets, loose Exaltation roles,
keyrings and unknown/raw rows. A container child is not automatically a socket.

Migration must preserve original source backups and verify stored counts/hashes
before retiring old Character keys. `character-storage.cjs` remains the limited
legacy/contribution host, not the expandable-inventory authority. Do not repeat
historical 1,000-card or whole-roster limits as the native contract. See
[storage](docs/CHARACTER_STORAGE.md),
[scalable inventory](docs/SCALABLE_INVENTORY_STORAGE.md),
[inventory review](docs/CHARACTER_INVENTORY_REVIEW.md) and
[achievements](docs/CHARACTER_ACHIEVEMENTS.md).

### Screen reading and offline OCR

`desktop/capture-host.cjs` is the coordinator. `capture-source-preload.cjs` and
`app/capture-source.js` own the selected source; `capture-reader.cjs`,
`ocr-service.cjs`, `ocr-worker.cjs` and `ocr-runtime.cjs` run bounded offline
recognition. `app/screen-read-parser.js` produces typed proposals with confidence
and provenance; `screen-read-journal.cjs` persists structured observations.

Screen Reading permission is default-off and independent of an active session.
One owner coordinates Character, Contribute and explicit capture requests. Keep
source/session/generation, timestamp, parser version and requested purpose bound
through capture, refinement, journaling and replay. Default and Default Modern
Character layouts require positive bounded pane identity; unrelated item panes
must not supply nearby numbers. Low-confidence or conflicting digits stay
unknown, and unsupported modifiers remain raw evidence rather than guessed stats.

Use existing image, tile/pixel, queue and deadline budgets. Do not add another
OCR pass or relax confidence because one fixture becomes unreadable. Preserve
the explicit unknown set and inspect actual words/geometry when diagnosing it.
Continuous frames are not a recording archive. See
[Screen Reading permission](docs/SCREEN_READING_MASTER.md),
[capture pipeline](docs/design/CAPTURE_PIPELINE.md),
[recovery](docs/LIVE_CAPTURE_RECOVERY.md) and
[tooltip capture](docs/TOOLTIP_CAPTURE.md).

### Discoveries, contribution review and publishing

`contribution-queue.js` owns durable drafts; `contribution-evidence.js`,
`contribution-discovery-gate.js`, `contribution-reader.js` and
`discovery-contribution-flow.js` bind evidence, visibility and editor ownership.
`contribution-model.js`, `contribution-editor.js`, `item-contribution-stats.js`
and `contribution-review-view.js` build structured edits and reviewed source.
Native `discovery-host.cjs`/`discovery-notice-window.cjs` own popups;
`contribution-gap-verifier.cjs` and `live-wiki-cache.cjs` own bounded anonymous
public proof. `automatic-log-reader.cjs` and `automatic-loot-sources.cjs` own
the restricted fresh-log automatic source path.

The dataset is the first coverage gate. A cached apparent gap is not a missing
page/fact until supported current-public proof confirms it. Failed, stale,
unsupported or ambiguous checks stay unknown. Keep raw evidence immutable;
OCR may enrich a matching log-backed draft, not invent a kill, zone or source.
Protect manual, reviewed, published and uncertain-write work during cleanup.
Proof renewal should update an existing editor without replacing its DOM.

`desktop/wiki-host.cjs` owns trusted actions and a separate cookie-backed wiki
session. `wiki-client.cjs`, `wiki-attachments.cjs`, `contribution-history.cjs`
and the category/identity helpers own account assertions, blueprint/revision
checks, prepared plan hashes, uploads and durable outcomes. Do not expose cookies
or tokens to renderers. New writes must match their actual reviewed text and
current permission/account/source context; a UI click alone is not that proof.
Keep narrowly authorized automatic paths separate from manual publication.

All generated/edited page text carries the reviewed `eoz-page-category.js`
policy before hashing, Copy or publication. A stale untagged plan needs a fresh
Preview; submit must not silently edit reviewed source. Preserve partial receipts
and reconcile unknown results without duplicate writes. See
[gap verification](docs/CONTRIBUTION_GAP_VERIFICATION.md),
[queue stability](docs/DISCOVERY_QUEUE_STABILITY.md),
[item form](docs/ITEM_CONTRIBUTION_FORM.md),
[history](docs/CONTRIBUTION_HISTORY.md),
[ignores](docs/CONTRIBUTION_IGNORES.md) and
[page tracking](docs/WIKI_PAGE_TRACKING.md).

### Character sharing, pictures and local export

`character-wiki-sheet.js` builds schema-1 equipment/recorded-total/achievement
source and patches only the matching managed Character block on the signed-in
account's own User page. Preserve other characters, unrelated prose and accepted
manual image overrides. Local PNG copy/save uses `character-share.js` and
`desktop/share-host.cjs`; those actions do not publish a wiki image.

`character-screenshot.js`, `character-screenshot-picker.js`,
`desktop/character-screenshot-image.cjs` and `character-screenshots.cjs` handle
the optional picture. Native private files/journals retain pixels behind opaque
IDs and digests; do not embed raw image data in Character models or profile
rosters. Validate image bounds before decoding, normalize only supported formats,
and make the full selected picture reviewable before explicit publication.

Canonical File titles, account/digest-bound review and stable collision targets
must survive process restart. A matching existing file can be reused only with
the required uploader/digest proof; never overwrite artwork or choose another
random name to evade a pending result. File upload and User-page edit have
separate durable outcomes. Screen Reading availability is not a prerequisite
for selecting or sharing a Character picture. See
[screenshots](docs/CHARACTER_SCREENSHOTS.md) and
[sheet contract](docs/CHARACTER_SHEETS_PLAN.md).

### Observation outbox

`app/drop-observations.js`, `desktop/drop-observation-host.cjs` and
`drop-observation-storage.cjs` collect minimal fresh structured kill/loot events
and retain account-bound batches. This is a separate data API, not article edits.
Collection/upload consent, persisted backoff, batch identity and acknowledgments
must remain intact. Opting out stops new collection/send work and retains pending
records. Do not include raw chat/logs, player identities, paths, coordinates or
screenshots, and do not infer unseen zero drops or drop probabilities. See
[contribution evidence](docs/CONTRIBUTION_EVIDENCE_PLAN.md).

### Public dataset, producer mirrors and updates

`desktop/main.cjs` owns verified bootstrap/cache selection and single-flight
manifest refresh. `scripts/fetch-bootstrap-pack.mjs` verifies release inputs;
`server/` mirrors the canonical wiki exporter/parser/count/catalog sources.
The build bootstrap compacts the same full public pack and adds provenance
metadata; it does not filter out entities. This public pack is separate from
the wiki's private database, account information and uploads.
Respect schema/version/capability fields, canonical IDs, source revisions and
completeness. An absent field is not proof that a relationship does not exist.
Normal browsing uses local indexes; bounded workflow-specific live verification
does not authorize broad page enumeration or API polling.

`desktop/app-updater.cjs` and `app/app-update-ui.js` own matching platform assets,
download verification, explicit installation and countdown/restart handling.
The release coordinator resolves one bootstrap and one fixed formula snapshot
for both platform builds. A single publisher runs after both succeed. Stable
publication is tag-bound; an ordinary main build is not proof that a release
was published. Preserve existing release assets/tags and use the existing updater
selection rules. See [producer responsibilities](server/README.md),
[shared formulas](docs/SHARED_ITEM_SCALING.md) and [signing](SIGNING.md).

## Implementation style

Keep pure parsing, normalization, identity and policy decisions outside DOM/native
side-effect code where possible. Prefer small explicit exports with injected
clock, storage, fetch or worker boundaries to a second parallel implementation.
Match nearby syntax and indentation; the repository has both conventional and
compact modules, not one assumed formatter. Explain non-obvious invariants in
comments, especially why a stale/ambiguous input must be rejected.

Use canonical helpers instead of repeated string substitutions. Validate enum,
number, byte, path and schema boundaries before coercion. Preserve `null`, absent,
zero and negative values according to the component contract. Keep physical IDs,
canonical page identity and display labels distinct. Reject ambiguity rather
than choosing an arbitrary longest/nearest/last match.

Render untrusted names/effects as text or through existing bounded typed
presenters. Avoid raw HTML insertion and dynamic code evaluation. Escape output
at its actual boundary: HTML, URL, JSON, shell and wikitext are different formats.
Do not pass private error bodies, cookies, account payloads or raw player
evidence into user-facing diagnostics or shared overlay snapshots.

Make durable writes atomic and serialized through their owner. Do not mutate an
optimistic in-memory value as if it were persisted before the backing operation
acknowledges. Preserve the original file/store on failure; a warning is not a
save. Retention and cleanup must operate only on positively owned, unreferenced
paths/records, never arbitrary neighboring files.

## Verification and generated sources

Read the current `package.json` scripts and workflow before choosing checks.
Typical source work uses an affected `node tests/<component>.mjs` command and
the required broader `npm test` gate. `npm test` has a `pretest` build step and
regenerates runtime assets; it is not a read-only lint command. Start the desktop
with `npm start`; its `prestart` prepares workers. Follow task-specific scope and
permission constraints rather than running every native/build command routinely.

| Change | Meaningful evidence |
| --- | --- |
| Pure parser/policy/model | Positive grammar/value cases plus ambiguity, malformed input, null/zero and conservation cases |
| DOM/interaction | Actual mounted module, keyboard/focus, idempotence, stable edits and stale asynchronous replies |
| Native IPC/store/worker | Real sender checks, restart, CAS, cancellation, disk/worker errors and retained bytes |
| OCR/layout | Actual offline OCR on synthetic pixels, golden values or explicit unknowns, zero wrong accepted values |
| Windows/overlays/maps | Sandboxed desktop fixture with actual native bounds/input/visibility and image review |
| Package/release | Exact ASAR/source/image/bootstrap/OCR assets, actual platform jobs and shared-input provenance |

Native fixtures under `scripts/test-*.mjs` use isolated profiles and synthetic
local files/APIs. Several require a display or Xvfb and can move real desktop
windows; coordinate them instead of running competing foreground fixtures.
Keep synthetic, source-only, native, packaged, live-game and public-release
evidence distinct. A fixture pass is not a production wiki write, an installed
upgrade or proof of every OS/compositor combination.

`npm run build:workers` prepares offline OCR assets, appearance presets, the
pinned viewer, terrain compatibility patch and Recast worker. Edit their source
inputs/guarded patches, retain notices and verify deterministic output. New
runtime modules must be packaged and included in
`scripts/packaged-runtime-sources.mjs` and its tests where appropriate. A fresh
HTML wrapper is insufficient if an imported module/worker is stale or absent.
Register new native checks in the relevant CI/platform build workflows; source
tests alone do not exercise Electron's packaged runtime.

## Documentation and evidence maintenance

Keep this guide as the technical component/contract index. Put a focused change
in its component guide and link it here; put user instructions/screenshots in
README and release changes in CHANGELOG. Do not duplicate a running release log
across architecture pages. [VALIDATION.md](VALIDATION.md), historical `RELEASE_*`
plans, [HANDOFF.md](docs/HANDOFF.md),
[IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and old integration
audits retain their dates, versions and receipt scope; old completed
authorizations are not a new deployment instruction.

Screenshots for documentation must show the actual app with synthetic or
explicitly authorized data. Inspect them at readable scale and record their
context. Do not fabricate app UI or reuse player pixels as a public fixture.
Private detailed receipts belong in ignored `.local/`; committed guides describe
contracts and limitations without credentials, installed profile paths or raw
player data. Source completion, source deployment, wiki-page publication,
dataset generation, host installation and public app release are separate
claims and require their own evidence.
