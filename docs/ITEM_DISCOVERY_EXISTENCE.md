# Item discovery existence checks

Missing-item notices use cached wiki presence first. Rich item names, aliases,
statless item titles and generic public titles all establish presence, including
in an incomplete pack. Such items make no live existence request. Ambiguous
local matches also suppress a missing-page claim.

For a local cache miss, the native `WikiItemExistence` service performs one
anonymous GET to the fixed production `api.php`: `action=query`, `prop=info`,
one exact base item title, and redirect/title normalization. It does not fetch
revision text, search similar names, use account cookies, write wiki pages or
request loot counts. An existing exact page or public redirect suppresses the
notice. Only an explicit matching main-namespace missing-page response proves
absence. A redirect to a missing destination still establishes that the named
redirect article exists.

Network errors, timeouts, namespace/invalid responses, warnings and incomplete
or unrelated results remain unverified and show no missing-item claim. Repeated
encounters may retry after a 15-second failure backoff. Confirmed missing results
cache for one minute and present results for 24 hours; the current local pack
is checked before either cache. The in-memory cache holds at most 1,000 entries,
with at most 20 pending base titles, two simultaneous requests and an eight-second
request timeout. Concurrent encounters of one title share the request.

`app/wiki-discovery.js` applies the gate to ordinary loot, encoded chat links and
possible tiered chat mentions. Native `DiscoveryHost` applies it again before
admitting any item notice, including capture/OCR or restored pending paths.
The repeated admission read uses the same cache, so the normal flow makes one
HTTP request for a cache miss. Log/profile changes cancel outstanding checks;
renderer tokens, native generations and bounded prompt lifetimes reject stale
results. Ignore, new cached presence and changed suppression are checked before
admission. Unverified native rechecks release renderer retry suppression.

Verified notices appear in a dedicated native window at the bottom right of
the selected display, without activating or focusing it. They are independent
of the optional Timers overlay. Only the main app registers notices or requests
existence checks. The exact native notice frame can act on its displayed queue;
other overlay, child and remote frames cannot use those capabilities. Clipboard
capture still requires the explicit Screenshot action.

Run `npm run test:discovery-existence` for synthetic native transport and
renderer admission tests. Native popup fixtures separately check placement,
frame isolation, display changes and action routing. Fixtures do not establish
physical-game/fullscreen compositor acceptance or live wiki writes.
