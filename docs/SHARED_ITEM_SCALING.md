# Shared item formulas

The wiki owns item rank calculations in
[`extensions/ItemLevelSlider`](https://github.com/Maergoth/EQLWiki/tree/main/extensions/ItemLevelSlider).
Eye of Zomm uses that portable MIT engine and its revisioned JSON coefficient
file. Each installed app version has fixed formulas. There is no formula API,
startup/hourly source check, remote rule cache or runtime override.

## Release process

1. Change the wiki-owned engine/rules, increment the rules revision when balance
   changes, and deploy the reviewed wiki change through its normal process.
2. Push the next Eye of Zomm app version. The release coordinator resolves the
   wiki's production `main` **once**, downloads the shared files at that immutable
   commit and checks their source hashes/schema.
3. Both Windows and Linux receive the **same** generated formula artifact before
   source tests and packaging. A missing/incompatible source or failed formula
   regression blocks the release; it never silently publishes stale formulas.
4. Publish the normal app update. Users get the new bundled formulas through
   that update. Older installations retain their own version's formulas.

Release notes record the exact wiki source commit. The packaged
`app/vendor/item-scaling-source.json` records that commit and each file's SHA-256.
Both platforms' archive checks verify the bundled formula files against the
shared snapshot. Existing published versions and their formula snapshots are
never replaced in place.

The item database mirror is independent. A formula change needs no item-data
pull; it ships in a normal application update. Formula refreshes happen centrally
when preparing app releases, not on players' machines. If a new algorithm needs
adapter changes, update the app and compatibility fixtures before its release.

## Development synchronization

For a reviewed wiki feature commit before it reaches production:

```sh
npm run sync:item-scaling -- --ref FULL_WIKI_COMMIT_SHA
npm run check:item-scaling
node tests/wiki-item-scaling.mjs
node tests/item-base-recovery.mjs
node tests/item-scaling-release.mjs
```

For a committed local checkout, append `--source-root PATH`; the helper verifies
working bytes against that exact commit. Commit the generated vendor files
together, never edit a second formula implementation. Normal development/PR
checks use these pinned files and do not query the live wiki.

The release coordinator uses `--from-wiki-main` automatically. That command is
release tooling and is not part of the installed app. It generates one artifact
for both package builds; no platform independently resolves a later wiki commit.

## Consumers and evidence

`app/item-scaling.js` adapts catalog fields and whole-card context to the shared
engine. Browsing, equipment previews and overlay cards use the same Backstab,
percentage Accuracy, listed Range, conditional Void, weight and rank-cap rules
as the wiki. Unitless Accuracy stays unchanged; ammo-only cards do not gain
weapon Accuracy. Recorded examine values are never scaled twice.

Reverse-calculation proposals use the same forward engine and record its fixed
rules identity. An app update can invalidate an older pending recovery review
if its formula identity changed. Existing ambiguity/review guards remain;
aligned weight rounding does not independently certify its inverse. Character
totals still come solely from the recorded character sheet.

Rules revision 2, bundled with 0.9.14, floors the total for positive primary
stats above ten: `floor(base + base × effectiveRank / 10)`. Small positive
primary stats still add whole ranks; negative penalties retain their existing
rounding. Screenshot regressions cover HP 50 → 75 at rank 5 plus 4/32,
AC 14 → 22 at rank 6 plus 5/64, and HP 50 → 71 at rank 4 plus 4/16.
The inverse searches this same forward engine, including fractional progress;
it does not use a separate inverse formula. The revision change invalidates
pending recovery reviews made with the older rounded-primary rules.
The same revision expands Void eligibility to AC, HP, Mana, Endurance and their
three regeneration fields in addition to attributes and ordinary saves. Two
distinct qualifying base fields still earn one Void per whole rank. Aliases
count once; unknown fields do not qualify. Weapon damage, Backstab, Haste,
Attack, delay and weight stay outside that whitelist.

Focused checks cover canonical math/wiki DOM behavior, Character/cards/recovery,
release snapshot integrity and the shared Windows/Linux artifact contract.
Synthetic checks do not constitute new game calibration or live-site testing.

## Calibration limits

The current wiki statistics are treated as tier-zero values, as requested.
The supplied Lustrous Russet Vambraces +3 screenshot remains an AC outlier:
wiki base AC 15 predicts 19 under the shared rule, while the screenshot shows
16. Its Strength and Dexterity agree with rank three. No item-specific
exception or silent change to the wiki base was added. Another unmodified
examine of that item at tier zero and a known higher rank would resolve this
disagreement more reliably than fitting an exception to one image.

Backstab here is the listed weapon Backstab Dmg field, not final combat damage.
The rule is `base + floor(base × effectiveRank / 20)`. Whole ranks alone cannot
distinguish linear accuracy from logarithmic progress; the supplied fractional
Thornstinger, bow and staff readings provide that additional evidence.
Weight follows the requested screenshot rule: subtract nine percent of base
weight per logarithmic rank, then round upward to one decimal place.
