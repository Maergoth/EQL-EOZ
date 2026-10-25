# Shared item formulas

The wiki owns item rank calculations under
[`extensions/ItemLevelSlider`](https://github.com/Maergoth/EQLWiki/tree/main/extensions/ItemLevelSlider).
Eye of Zomm uses an exact, checksummed copy of that extension's portable MIT
`item-scaling-core.js`. It does not maintain an independent set of formulas.
The source commit and all file hashes are recorded in
`app/vendor/item-scaling-source.json`.

## Changing the balance rules

Edit the wiki's **`item-scaling-rules.json`**, increment its integer `revision`,
and use the wiki's normal reviewed deployment. Its slider loads these rules
through ResourceLoader configuration. This public read-only endpoint returns
the same rules:

```
GET https://eqlwiki.com/api.php?action=eqlitemscaling&format=json&formatversion=2
```

The response's `eqlitemscaling` object contains `schemaVersion`, `engineVersion`,
`revision`, and `rules`. The core validates every section and bounds coefficients.
It rejects unknown fields, unsupported algorithms, unreasonable values, older
revisions, and a changed configuration with an unchanged revision.

The desktop host checks at startup when due and once per hour. It serves the
accepted snapshot through local `/api/info`; normal renderer refreshes do not
make wiki requests. The small JSON document is independent of the item database
mirror. A balance-coefficient update needs neither a database export nor a new
app installer. New tabs/page loads on the wiki use its deployed rules; an already
open wiki tab retains its current page configuration until reloaded.

Accepted rules and check time are saved atomically in the private app profile.
Offline startup uses saved rules or bundled defaults. Failures, malformed data,
oversized responses and an unsupported future engine retain the last good rules.
The request has a deadline and size bound. Downloaded JavaScript, expressions
and arbitrary URLs are never evaluated.

## Changing the algorithm

A new calculation family/algorithm requires a reviewed wiki engine change and an
app update. Increment `engineVersion` for an incompatible rules contract. An old
app then keeps its supported snapshot until upgraded.

Synchronize the reviewed wiki commit mechanically:

```sh
npm run sync:item-scaling -- --ref FULL_WIKI_COMMIT_SHA
npm run check:item-scaling
node tests/wiki-item-scaling.mjs
node tests/item-base-recovery.mjs
node tests/item-scaling-host.mjs
```

For a committed local wiki checkout, append `--source-root PATH`. The helper
verifies local bytes against that exact commit before recording provenance.
Commit the generated vendor files together. Never edit them separately.
`npm test` and packaging validate the bundled source hashes and generated rules.
Refreshing bundled defaults to a newer rule revision improves new/offline installs;
the native data refresh also delivers supported coefficient changes to existing
installs without a release.

## Consumers and recorded data

`app/item-scaling.js` adapts catalog fields and whole-card context to the shared
engine. All browsing, equipment previews and overlay item cards use this adapter.
Backstab, weapon percentage Accuracy, listed Range, conditional Void resist,
weight and capped/fractional rank semantics therefore come from the same source
as the wiki. Unitless Accuracy is preserved; ammo-only items do not gain weapon
Accuracy. Recorded examine values are not scaled twice.

Reverse-calculation proposals use this same forward engine and record the rules
identity. A changed snapshot invalidates older pending recovered-base reviews
before publication. Unsupported/ambiguous inputs retain the existing review
guards; aligned forward weight rounding does not certify its inverse. Recorded
character-sheet totals remain the sole source for Character totals.

## Rollout and verification

Publish the wiki endpoint before releasing this app change. Before that, the
app safely uses its bundled snapshot. Deploying an older rule revision never
silently rolls back an app: to correct a balance coefficient, issue the desired
values under a new revision.

Focused source checks cover wiki DOM behavior and canonical math, app card and
reverse-calculation behavior, native hourly/cache/error handling and generated
source integrity. These checks use synthetic values; they do not constitute a
new in-game calibration or a live wiki publication test.
