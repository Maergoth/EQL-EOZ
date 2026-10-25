# Stable discovery presentation

The 1.0 editor lease preserved only the selected form while live missing-fact
proof renewed. The sidebar still replaced its complete list and filter HTML on
every workspace refresh, OCR update and gate callback. Every non-selected row
also disappeared when its one-minute receipt expired, then returned after the
renewal. Stable editor nodes alone could not prevent that list churn.

The workspace now reconciles rows by the durable candidate ID. Equivalent
updates do not mutate list or filter DOM. Changed row text/controls are patched
in place, additions/removals touch only affected rows, and existing focus and
scroll containers survive. New entries do not change the current selection.

While Discoveries stays open, an in-memory display receipt retains an already
verified identity during a pending or unavailable recheck. New observations can
extend that candidate without withdrawing its previously verified display.
Only the previous confirmed relation/source subset is retained. A genuine
covered result, removal, ignore, submission, changed identity/zone/instance,
source reset or dataset generation retires the retained display. Leaving the
Discoveries view clears this list retention; app restarts still need fresh proof.
The map is bounded by the existing 200-candidate queue and never persists proof.

Ordinary app renders call `captureWorkspace.refresh()` and were enough to
replace every row several times per second. The actual `getPack` returns the
current `pack` directly. Unchanged live-entry snapshots are memoized by the
overlay, but a newly fetched positive entry may replace that pack wrapper while
the base dataset version is unchanged. This still invalidates action proof at
the existing gate, while display retention survives until renewed proof or a
genuine retirement. A new dataset version or explicit source/zone/profile reset
invalidates display retention too. No equivalent wrapper is mistaken for fresh
proof, and Previous/Next always reads the current incremental row order.

This is local presentation, not action permission. `selected()` remains the
fresh-proof path for OCR admission, Preview, automatic actions and publication.
Retained rows can be selected for local review, with the existing rechecking or
unavailable message and disabled actions. No new request timer, shorter timeout,
server polling or proof bypass was added. A never-verified row stays hidden.

Run the actual mounted test and native Chromium scenario:

```sh
node tests/discovery-queue-stability.mjs
node scripts/test-discovery-queue-stability.mjs
node tests/discovery-review-lease.mjs
```

The shared scenario uses synthetic ordinary log item links and deferred wiki
replies. It checks zero list/filter mutations on repeated equivalent refreshes,
actual node/focus/scroll retention during proof renewal/failure, review-only
selection, fresh admission of new rows, affected-row-only covered retirement,
saved draft preservation, dismiss, and source/dataset invalidation. The native
test mounts the production workspace in a sandboxed Electron window with an
isolated profile and loopback-only resources; it does not capture the desktop,
read a player log or write a production wiki page.
