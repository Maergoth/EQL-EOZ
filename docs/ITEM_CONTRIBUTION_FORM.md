# Item contribution statistics

Item contributions use one grid of individual numeric stat inputs and one
**Observed tier** control. The screen reader fills the same fields; there is
no separate editable stat-block textarea or duplicate Observed/Base table.
Classes, slots, icon, effects and other page metadata keep their structured
controls. Source-only updates keep their existing focused editor.

At tier 0, the grid contains the actual base item values. Blank fields are
omitted from the contribution. An explicitly entered `0` or negative value is
retained. Missing Void resist does not create a default zero. Clearing a field
also protects that deliberate omission from later OCR.

A reading marked modified or augmented cannot establish any numeric base
statistic, including Accuracy and Avoidance at tier 0. Its values and notes stay
in the local draft. A later clean reading requires **Use updated reading** before
those values can become base statistics.

At higher tiers, the grid is labelled **Base proposals**. Captured numbers
remain unchanged as observed evidence. Supported proposals must match one
possible item progress state under the bundled scaling rules; unsupported
inverses stay blank. The wiki preview includes the existing tier 0 verification
notice and category. A blank selection omits those statistics rather than
posting the ranked observations as bases. Exaltations, modifiers, changed
observations and stale formula fingerprints retain their validation gates.

Typing an invalid proposal preserves the correction in a private structured
draft, while publication remains blocked. It survives reopening and later
OCR. When a saved reading changes, **Use updated reading** explicitly
recalculates the proposals; opening a draft does not silently approve stale
choices.

An incomplete browser number such as `1e`, or an invalid observed tier, also
keeps a durable blocked state after reopening. Correct that field or explicitly
clear a statistic to omit it; the form cannot silently restore its old number.

Legacy numeric `statLines` or `statsblock` entries populate the corresponding
inputs. Existing manual numbers take priority over unedited OCR values.
Conflicting duplicate numbers require correction. Unrecognized saved prose
remains visible under **Saved item text**. Unrecognized numeric text that
cannot safely be a ranked base stays in the local draft as evidence and is
omitted from ranked wiki output. Internal `statLines` serialization remains
the existing publication format.

Reviewed outgoing item pages use the live item-blueprint layout: flags and
Slot, Skill with `Atk Delay`, damage/AC, attributes, resists, other statistics
and effects, `WT` with Size, then Class and Race. Recognized single values are
grouped into normal card rows. Damage remains a standalone numeric row because
Itembox reads that row when supplying a default Backstab value. This changes presentation only; saved OCR,
manual numbers and reverse-scaling fingerprints keep their original values.
Explicit zeros remain explicit. Unknown extra lines and conflicting duplicate
values remain intact, and no flags, icon, effects or missing statistics are
invented. Unrelated updates to existing pages retain their authored layout.

The `Atk Delay` label is also functional: the wiki slider reads it for weapon
ratio, and Itembox uses it when deriving a default damage bonus. The formatter
does not compute or add a bonus. The observed value still requires review.

The item discovery popup now reads **New Item Found!**. Existing local-first,
anonymous live-gap verification still controls whether it can appear.

`tests/item-contribution-form.mjs` covers blank/zero handling, legacy migration,
conflicts, OCR/manual precedence, unsupported stats, ranked provenance and
stale reviews. The native 099 workspace and real main/preload capture workspace
use individual stat inputs and preserve their preview/publication safeguards.
All fixtures use synthetic data, not a production account or player pixels.
