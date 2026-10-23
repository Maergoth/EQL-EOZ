# Map marker loot review

Selecting a named marker in the embedded main map opens a separate loot pane.
The authenticated event must come from the actual `#zone-viewer` iframe and the
same loopback origin. Same-origin sibling frames are rejected. Marker payloads
carry normal/raid identity; identical NPC names do not merge instance loot.

The pane lists every known drop in the cached catalog, sorting current-class
items first without hiding other classes. It uses the existing item-scaling
helper, original cached icons, exact wiki links and local item tooltip path.
Its independent tier choice applies to both the card and its tooltip. Monster
wiki, item wiki, local waypoint copy and route actions remain explicit. Merely
selecting a marker does not start a route. Closing or changing zone clears the
selection.

`npm run test:map-loot` exercises the real main renderer and embedded viewer:
`setRareMobs` creates actual marker buttons, their click posts the real iframe
message, and the resulting pane is checked. The isolated synthetic catalog has
eight normal drops (including other-class items), one same-name raid drop and
one same-name other-zone drop. Checks cover full lists, exact instance/zone
isolation, tier-7 HP values and focus-triggered tooltips, sibling rejection,
explicit intercepted wiki/clipboard actions, a route waiting for `/loc`,
close/reopen and a logged zone change. At 1024px with 20px Verdana, the eighth
item remains reachable inside the pane with no horizontal overflow.

The test uses a disposable app profile, generated text map/log/catalog and a
synthetic current-zone record for marker construction. It does not load
proprietary zone geometry, test a collision-valid route, read the OS clipboard,
open a real wiki page or exercise foreground game composition. The hidden
fixture dispatches a DOM focus-in event after focusing the card because an
inactive hidden window does not emit all platform keyboard focus events.

Windows PR/build and Linux native CI run the smoke. Use `--screenshots <dir>` to
retain real renderer captures. On 2026-10-22, the local smoke exposed a base-tier
tooltip mismatch; the integration owner fixed tooltip context and reran it
successfully. Private normal/tier and large-font/eighth-drop captures were
inspected; these are synthetic app evidence rather than live-game captures.
