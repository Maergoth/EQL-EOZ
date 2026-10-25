# Queued tier-stat corrections

Torturer's Signature at tier 8 reproduced the reported wrong Backstab 14 and
weight 0.8. Its public wiki revision 199615 and shipped snapshot both contain
base damage 10, Backstab 15, weight 2.5, delay 22 and damage bonus 10. The numeric
snapshot omitted Backstab, delay and damage bonus while retaining them as text.

The client then substituted damage 10 for the missing Backstab baseline. This
produced 14 at tier 8 instead of 21. The producer now accepts the literal
`BACKSTAB` label and exports the other explicit weapon fields. Catalog consumers
also recover missing explicit values from old snapshot text before the legacy
template default, so existing installations do not depend on a dataset refresh.
Typed values, including zero and unknowns, retain authority. Captured game stats
and recorded Character totals are not recalculated by this correction.

Weight had a separate arithmetic defect: the mathematical result of
`2.5 × (1 − 0.09 × 8) × 10` is 7, but the previous floating-point path yielded
`7.000000000000001`, which ceiling raised to 8. The wiki-owned shared engine now
uses checked decimal rational arithmetic at whole ranks. It preserves the
existing ceiling policy, rates and fractional-rank curve. Rules metadata is
revision 3; no per-item exception or app-only formula is added.

Expected whole tier-8 values for the reported item:

| Stat | Value |
| --- | --- |
| STR / DEX | 18 / 18 |
| STA | 13 |
| Fire / Cold resist | 13 / 13 |
| Damage / Backstab | 18 / 21 |
| Weight | 0.7 |
| Weapon Accuracy | +20% |
| Void resist | 8 |
| Delay / damage bonus | 22 / 10 |
| Ratio | 0.818 |

The native Intel summary uses the shared stat labels and percentage metadata,
so internal names such as `BACKSTAB_DMG` are not presented as user-facing labels.

## Release dependency

This is queued alongside [EQLWiki PR 102](https://github.com/Maergoth/EQLWiki/pull/102).
The app vendors that PR's exact reviewed commit and mirrors its producer source.
Before the 1.0 release, stage and promote only that scoped wiki feature so the
release coordinator's wiki-main snapshot contains the correction. A later
production export delivers the explicit numeric fields; client hydration repairs
the older snapshot immediately after the fixed app ships. Do not publish a
generated pack or promote all staging changes as part of this PR.

The package version remains unchanged. This PR does not edit wiki articles,
deploy source, rebuild a production dataset or publish another release.
