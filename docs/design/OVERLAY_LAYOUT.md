# Native overlay layout

Current changes support the guided Character follow-up. Published 0.9.0 history
and images retain their original version. The global header cycle is now
**Unlocked → Locked → Hidden → Unlocked**. Showing from Hidden restores mouse
input for layout editing; locking and hiding retain explicit Ignore mouse
preferences. Mixed visible layouts resolve to Unlocked if any known panel is
unlocked, otherwise Locked; no visible panels resolves to Hidden.

## Resize hit regions

Electron documents that [transparent windows do not support dependable native
resizing](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#transparent-windows).
The old transparent frameless overlays enabled native resize borders anyway;
the native edge could reject input even though the small renderer corner's IPC
passed. All four panels now keep `thickFrame:false` and native resizing disabled.
Eight body-level renderer handles provide seven-DIP edges and twenty-DIP
corners, with axis/diagonal cursors and a visible bottom-right grip. Each is
explicitly outside every native draggable ancestor. Electron's
[drag-region behavior](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions#custom-draggable-regions)
requires this separation because draggable regions swallow pointer events.

Trusted pointer capture calls the existing exact-own-frame resize IPC. North
and west edges preserve their opposite anchor. Native bounds remain constrained
to the work area and existing minimum/maximum dimensions. Keyboard arrows on the
bottom-right grip remain available. Locking, hiding or Ignore mouse cancels
in-flight dragging and hides/disables handles; none bypass host checks.

## Touching docks

`desktop/overlay-docking.cjs` owns pure geometry; `overlay-host.cjs` owns native
windows, trusted gesture intent, persistence and propagation. Any visible panel
can dock to another visible panel on the same work area within twelve DIPs.
Above/below share x and width, and touch their y edge without a gap. Left/right
share y and height, and touch their x edge. Nearest edge wins, followed by
alignment distance, panel ID and edge order. Distant corners, off-screen fits,
incompatible minimum sizes, third-panel collisions, hidden/self/cross-monitor
targets and cycles are rejected.

The child stores only `{targetId,edge}` as `panels[id].dock`; no session or
player data enters layout preferences. Target movement/resize propagates down
an acyclic dependency chain using current bounds. Shared dimensions remain
controlled by that target; the dependent retains its perpendicular dimension.
Dragging a child beyond the magnet threshold clears its relation. A complete
group change is rejected if followers cannot fit or would overlap, rather than
partially clamping/jumping followers. Global Hide suspends the existing group:
relations and independent saved bounds persist, hidden content/auto-fit ticks
cannot resize or propagate it, and showing all restores only fitted groups.
Individual Hide detaches affected relations. Hidden targets never control
visible dependents. Startup and monitor restoration prune any saved relation
which becomes impossible or misaligned after independent work-area clamping;
they retain the safely clamped individual bounds instead of moving panels to
repair stale geometry. Reset clears relations. Native bounds updates are guarded against
reentrant resize events and automatic Triggers fitting retains docking geometry
without changing the user's manual-height preference.

## Observed verification and limits

- `tests/overlay-docking.mjs` checks all touching directions, live target size,
  deterministic choice, collision/work-area/size/display/visibility/cycle guards.
- `tests/native-overlays.mjs` checks authenticated host resize, north/west anchor,
  persistence, target-to-grandchild propagation, deliberate undock, group fit
  rejection, hidden suspension/restart, stale post-clamp startup pruning and
  cycle state/mouse handling.
- `scripts/test-overlay-resize.mjs` uses four actual isolated Electron windows.
  Thirty-two trusted renderer pointer drags resize actual native bounds, with
  lock cancellation, the new global cycle, global hide/re-show restoration and
  real touching/resize propagation.
  On Windows, native `WM_NCHITTEST` reports client input at all thirty-two hit
  points and the OS thick-frame style is absent. The fixture never moves the
  physical mouse or uses the installed profile. Small native DIP rounding is
  measured for independent dimensions; shared edges remain aligned.

These checks are synthetic native input and geometry checks, not a claim about
physical game focus, arbitrary desktop compositors or native Wayland capture.
Linux's native gates must run on the final reviewed head before release.

On 2026-10-23 the working-tree Windows checks passed both the focused native
resize/docking fixture and the full `test-native-overlays.mjs` app smoke. The
latter exercised the actual shared synthetic log/session, main header cycle,
Parse controls, Triggers attachment, hidden owner, reload/recreate and clipboard
isolation. A real captured Parse window with a synthetic damage session, unlocked
move grip and visible resize corner was inspected for the new release artwork.
No installed profile, physical mouse movement or production player data was
used. This is local acceptance evidence; final commit/platform CI remains a
separate release gate.
