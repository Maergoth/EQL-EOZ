# Logged location delivery

The map uses locations already written to the selected game log. It does not
read game memory or produce location commands. Time before the game writes a
line is outside EoZ's control; a stationary marker can also mean no new `/loc`
has been logged.

The log owner polls every 250 ms while a native or main map is visible, 180 ms
while routing, and 650 ms otherwise. Restored native visibility now initializes
that choice before any panel-control event. A later visibility event wins over
an old initial-state response.

Previously, a successfully read location usually waited for the shared
one-second overlay heartbeat. Publishing while an earlier IPC publication was
in flight also discarded the request. Changed-coordinate batches now request a
prompt shared snapshot. Requests coalesce before building the snapshot, at most
once per 100 ms; busy transport retains one newest request and builds it from
current state after completion. Identical X/Y/Z samples do not request another
snapshot. The one-second heartbeat still updates timers, stale-position labels
and idle parse rates. Explicit user actions keep their immediate publication.

There is one in-flight renderer log request. A concurrent request schedules one
trailing read. When a response proves an unread tail remains and made progress,
EoZ permits three 25 ms catchup waits, then yields for the ordinary polling
interval. Every response still has the existing 2 MiB native read bound; no
progress restores normal cadence. This accelerates catching up after a busy
period without turning idle polling into a tight loop.

Source replacement, same-path truncation and a new visit to the same zone retire
queued/awaited viewer coordinates as well as the native marker. The existing
source/zone/generation checks prevent an old await from putting that location
back. A confirming `/who` that retains a valid location does not clear it.

## Synthetic observations

Measured on Windows using the actual application, ordinary synthetic append-only
files, production log API/parser, native IPC broker and native map canvas. The
profile, map geometry and character names were disposable. These are four local
samples per run, not a live-game or cross-platform timing guarantee.

| Stage | Before | Updated |
| --- | --- | --- |
| Append to reader response | 16–647 ms | 18–252 ms |
| Reader response to native map draw | 347–983 ms | 2–93 ms |
| Append to native map draw | 994–1006 ms | 111–254 ms |

A synthetic tail of approximately 6.6 MiB reached its final location in 479 ms
across four bounded reads. A batch of 100 identical coordinates caused only one
ordinary heartbeat snapshot during the following 1.15 seconds. The same fixture
selected a second log in the same zone, verified the old marker cleared, then
checked the replacement position and cyan marker pixels on the actual canvas.

## Checks

`tests/location-publication.mjs` checks pre-snapshot coalescing, transport
serialization, newest source clears, heartbeat and disposal.
`tests/map-sync-integration.mjs` executes the owner's real functions for changed
versus repeated samples, backlog yields, single poll admission, initial-state
races and stale source/zone awaits, including same-path reset/same-zone reentry.

Run `npm run test:map-location-latency -- --screenshots .local/map-timing` for the
native file-to-canvas fixture. It runs in Windows and Linux CI and release source
smoke even when extended UI checks are disabled. `--baseline` records timing
without the new latency expectations, for comparison with an older source tree.
Production authentication, physical game compositing, unusual filesystem delays
and a heavily loaded main renderer remain live acceptance checks.
