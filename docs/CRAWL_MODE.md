# Crawl mode

The Map Auto Z row and the Zone & loot item-level row share a small **Crawl**
checkbox. It starts off in each main-app session. Checking either control
updates both through the existing authenticated overlay session owner.

While checked, a fresh ordinary log kill marks a matching current-zone NPC
defeated when it has a map location or known Intel drops. Its map marker dims,
its name is struck through in both panels, and Intel collapses its drops and
actions. Map destinations remain selectable. The wiki, location and loot
records are unchanged.

Defeated mobs remain dimmed for the rest of the visit. Further considerations,
session heartbeats and late drop-loading responses cannot reopen their drops.
Unchecking Crawl clears the defeated presentation and restores the normal
previews. Entering or re-entering a zone also clears defeated mobs, while
leaving the checkbox checked. A source/log/root replacement, character or
class-profile change, explicit session split, log reset or main-app restart
clears the visit state. The checkbox itself is not saved to disk.

Only newly ingested, recent kills participate. Opening a panel or enabling
Crawl never replays historical kills. Player characters, explicit pet labels
and unverified generated pet names are excluded. Matching uses canonical NPC
and zone identities plus documented aliases, with separate Normal/Raid keys.
Logs normally omit the instance type: if the same NPC is present in both
variants, an unqualified kill is skipped rather than assigned to either one.
The bounded defeated set keeps its first 2,048 identities for a visit; reaching
that cap cannot reactivate an earlier defeat.

Explicit reminders configured in the Triggers timer engine keep their existing
behavior. Crawl affects Map and Intel presentation; it does not silently cancel
or rewrite those reminders.

## Validation

`tests/crawl-mode.mjs` exercises eligibility, freshness, alias/variant ambiguity,
players/pets, reset boundaries and bounded state without catalog mutations.
`tests/crawl-intel.mjs` covers the shared checkbox, collapsed drops/actions,
accessibility, stale asynchronous replies and restoration. Native overlay
tests retain exact frame/URL admission and reject malformed Crawl payloads.

`scripts/test-map-player-marker.mjs` renders actual canvas dimming and accessible
struck labels at 100% and 150% scale. `scripts/test-map-overlay-3d.mjs` runs the
real main owner, public overlay IPC, ordinary synthetic log ingestion, native
Intel, and the shipped WebGL viewer. Synthetic geometry replaces only archive
geometry; no real game data, profile, wiki writes or game input are used.
These fixtures verify native behavior, not compositing over a foreground game.
