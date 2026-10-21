# Overlay completion context — October 21, 2026

The requested next slice removes Minimal view entirely and makes native overlays
the play interface. It adds a standalone map/intel overlay, PNUT's full timer
and trigger editor (including regex), Normal Zone / Raid Zone intel sections,
and expandable complete drop lists. Consider is removed; consider/kill selects
and expands listed named NPCs with a mild flash and blip, without game focus
stealing. Unknown live NPC/item events check the bundled catalog and show cards
inside Timers/Triggers for 15 seconds, pausing on hover/focus. No extra window.
Cards offer Screenshot/Ignore and capture only on an explicit Screenshot click.
Capture goes to the clipboard, never an upload. Continue existing PR #2 from 87d7891.

## Critical context and ownership

- Root owns app/app.js integration, removal of Minimal HTML/CSS/native API,
  native overlay host/preloads/controller, request/reply IPC, map modules,
  snapshot budgets, package/smoke tests, documentation and final build/PR.
- overlay_ui owns overlay.html/css/js and presentation tests: Normal/Raid
  groups, red raid subsection, Show More, and mounting the new map module.
- log_timers owns timer-engine/settings, isolated regex matching worker,
  timer tests and TIMERS.md. Literal timers migrate unchanged. Regex must not
  run on the session renderer or freeze parsing. Root owns cue playback.
- native_overlay_host owns server/BuildEyeOfZommPack.php and raid provenance
  tests/audit. That agent is doing data work, not the native host in this slice.

Read-only references: PNUT commit 28bbf8d in the private reference checkout;
mnmparse/app/map_overlay.py, triggers_page.py, triggers_runtime.py and triggers.py.
PNUT MIT attribution is already bundled under THIRD_PARTY/PNUT.

## Architecture and data contracts

The main renderer remains the only log/parser/timer/pack/route owner. The map
overlay renders client map text as a lightweight 2D canvas, current /loc, named
NPC destinations and validated route guidance. Do not duplicate the heavy 3D
viewer or fabricate collision-valid paths. Read maps through the existing safe
loopback bridge, using the client's root maps family before custom map folders.
All coordinate text uses the existing coordinate-system adapters.

Snapshots stay bounded and carry current location, zone, map status/target and
intel previews. Large static map data and full drop lists are fetched lazily
through authenticated bounded request/reply IPC, not repeated each second.
Map renderer: app/map-overlay.js mountMapOverlay({root,bridge,getSession}) with
render(session)/dispose(). Native map panel ID is map.

Intel variants have raidInstance boolean and instanceType normal/raid. Identity
includes zone, normalized name and variant. A Raid Instance heading applies to
its section, not every record on the page; normal/raid same-name variants must
survive export and class filtering. session:intel-drops receives npc, zone,
raidInstance and returns the complete matching items, with stale-zone guards.

## Operational and acceptance context

EoZ is D:\EQL-EOZ. Wiki checkout D:\EQLWiki has unrelated owner edits to
docs/EQL_DEVELOPMENT.md and ops/itembox.wiki; do not touch or reset them.
The owner-prepared wiki DB listens on 127.0.0.1:3308; ignored local runtime
settings contain private credentials. Never print or commit them or DB dumps.
Wiki README/CONTRIBUTING/development/component guides were read. Production
data/export refresh is separate from Git deployment; use PROJECT.md and the
existing private host jobs after reviewed exporter changes are concrete.

At the start of this slice the installed app was 0.8.2, using the existing shortcut and profile. User
requested local installation earlier; back up preferences before any further
upgrade. New functionality must be present in a rebuilt, exact-source-verified
installer; do not equate a source push with a local or production installation.
The owner subsequently authorized publishing all tested fixes live. Candidate
version is 0.8.3; merge scoped wiki producer changes through staging then promote
only those commits, rebuild the production dataset, merge EoZ PR #2, await its
verified GitHub beta release, then install locally with the same shortcut.

Verify: full suite; actual Electron map window, lazy reply, Show More, regex
matching/timeouts and timer editor; local C:\EverQuest Legends map parsing;
Normal/Raid exporter fixtures and production pack provenance; NSIS and ASAR
parity; current PR CI. Keep actual game/DPI interaction distinct from fixtures.

## Verified release handoff

Wiki #39 and its separate main promotion #40 are merged. Production deployment
`cc70c432` succeeded, and the installed exporter matches reviewed Git bytes.
The existing host refresh job saved its prior filtered output and published
`20261021T095417Z-c7004672e0f3`: 124 zones, 8,679 NPCs, 11,270 items, 117 raid
variants, complete public wiki presence. This verified pack is the local 0.8.3
bootstrap. Full source tests, actual Electron worker/native/discovery smokes,
catalog relevance, NSIS build and exact-source ASAR gate pass. Complete EoZ
PR #2 publication and local installed-upgrade/shortcut verification next.
