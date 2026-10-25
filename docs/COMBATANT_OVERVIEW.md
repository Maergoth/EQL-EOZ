# Combatant overview and AA gains

The native Parse panel lists logged combatant names in Overview for Whole session
and individual encounters. Damage, Healing and Taken each have a keyboard-accessible
disclosure for every combatant with actions in that metric. Open one to inspect
its abilities or incoming attackers. Disclosures stay open across log updates.

Live follows the active encounter automatically. After combat ends it keeps
the most recently active encounter visible, labelled **Live (ended)** with an
ended badge. Its recorded duration, damage and rates remain fixed while idle.
The next encounter replaces it automatically; the first empty session can still
show Waiting for combat. Whole session, Previous and pinned history remain
explicit selections. A held encounter keeps its open disclosures and keyboard
focus. A new encounter starts with its own disclosures; if a focused old row
disappears, keyboard focus returns to the encounter selector.

One damage line credits damage to its logged attacker and damage taken to its
recipient. Those describe the same hit; adding the columns together counts it
twice. A heal credits the logged healer, using the effective amount before the
optional parenthesized amount. Rune capacity stays separate from healing. Names
do not imply NPC/player classification; pets retain their logged names, and
unattributed non-melee damage retains an Unknown attacker. No pet-owner merges,
overheal, absorption or unlogged damage amounts are inferred. Results depend on the game's
combat message filters and range; an incomplete game log is not a raid-wide parse.
Explicit actor names are preserved as logged. The cast-order assumption below
applies only when a DoT tick omits its caster.
Names containing combat verbs can create multiple valid attacker/recipient
splits. An established exact name can disambiguate them; otherwise that line is
left uncredited instead of inventing actor names.

Direct heals and heal-over-time ticks use the same actor and recipient rules.
The phrase `over time` is a tick modifier, never part of a combatant's name.
Exact reflexive recipients such as `herself` resolve to the logged healer;
`you` and `yourself` resolve to the selected character. Each tick contributes
only its logged effective amount at its logged time. Critical heal endings are
accepted without adding their marker to the ability name. A cast or regeneration
message without a measured heal cannot imply future ticks or healing credit.

Measured short heal messages retain their named healer and recipient even when
no ability is given. DoT messages without a caster retain the measured damage
and recipient, with ownership inferred from cast order when usable context is
available. Otherwise their attacker remains unknown. An unknown-attacker
placeholder cannot connect otherwise unrelated encounters. Damage-shield retaliation credits the owner
explicitly named in the message, without guessing who originally cast the buff.
Its damage and the recipient's damage taken represent the same retaliation hit.

Cast-order matching assumes the earliest pending cast of the exact same spell
produced the first eligible anonymous tick. Spell ranks remain distinct, and
the tick supplies the target rather than a guessed current target. A retained
pairing can identify later ticks while its context remains fresh. Explicit
caster names always take priority. Competing casters on the same target and
spell remain ambiguous instead of being assigned by last caster or round robin.
Cast starts do not themselves count as damage or create encounters; inferred
ownership is recorded separately from directly named ticks and does not create
wiki discovery evidence.

Pending starts expire after 30 seconds. A retained target/spell pairing expires
after the configured encounter inactivity gap; this is a correlation window,
not a measured spell duration. Session, source, zone-visit and gap-setting
changes clear the context. A target's death clears its pairings, and any death
retires starts whose targets are still unknown. A caster's death does not remove
already paired effects on other targets. Exact logged interruptions, resists,
protected-target failures and wear-off messages invalidate applicable context.
Limits retain 128 pending starts, 256 target/spell pairs and eight owners per
pair. Overflow falls back to unknown rather than assigning the next remaining
caster. Retired unresolved competitors remain ambiguous until that effect's
context ends; long identities are rejected rather than truncated into matches.

Own damage, healing, taken, DPS clocks, kills, loot and trigger inputs keep their
existing meanings. Nearby actions have separate event types and cannot inflate
those player totals or create wiki discovery evidence. All names share the
encounter duration for encounter rates. Whole-session other-combatant rates use
the span from the first to last observed combat action; own DPS retains the
existing outgoing-damage clock. A per-name row always uses only that name's
damage, even when a log/profile switch preserves combined legacy session totals.
Routine attribution and clock explanations remain in this guide rather than
appearing below each parse. A limited encounter history still displays its
warning in the panel.

Encounter grouping retains the configured inactivity gap, zone and log-source
boundaries. Within that window, events connect through a shared actor/recipient.
Own target changes and healing remain in the owner's encounter. An interleaved
nearby fight with no shared name gets a separate encounter. Nearby-only labels
show `actor → recipient`; they do not claim the actor is a monster or that an
unrelated fight involved the selected character. The log cannot distinguish two
simultaneous NPCs with the same name.

Session and encounter combatant aggregates accumulate before compact event feeds
are trimmed. Memory limits retain 256 distinct names plus an explicitly grouped
Other combatants row, and 32 abilities/attackers plus an Other row per metric.
Native transport reductions may group more rows, preserving totals, rates and
action counts. Session aggregates survive regrouping. Changing the encounter
gap after the existing 5,000-event regroup buffer overflows cannot reconstruct
older encounters; the panel explicitly marks that encounter history as limited.
The whole-session combatant totals still cover all admitted session actions.

Session adds **AA Gained**. It counts the exact `GAIN_ABILITY_POINT` message
identified in the upstream [EQEmu string table](https://github.com/EQEmu/EQEmu/blob/master/zone/string_ids.h):
the earned-point sentence, optionally followed by the current bank balance.
Singular, plural and literal `(s)` bank-balance suffixes are accepted. Each
earned-point message counts one. AA experience, current bank balances, skill
purchases and quoted chat never count. The app does not infer multiple earned
points from a bank-balance change. Legends-specific additional point-award
wording requires a verified sample before adding another parser rule.

New session resets AA and combatant totals. Log/profile changes preserve existing
session totals, as they already do for player damage, while preventing encounter
joins across sources. Historical context reads with `recordSession:false` cannot
repopulate either counter after a split. Existing log cursor/replay ownership
remains authoritative; opening a native panel does not create another log reader.

Implementation: `app/parser.js`, `app/combatants.js`, `app/overlay-session.js`,
`app/overlay.js` and `app/overlay.css`. The combatant module is included in the
packaged-runtime source gate. Synthetic checks cover actor credit, own-total
isolation, connected encounters, source/zone changes, retained-event boundaries,
AA grammar, HTML escaping and transport conservation. Run:

```sh
node tests/combatant-overview.mjs
node scripts/test-combatant-overview.mjs --screenshots .local/combatant-proof
```

The native fixture uses the actual parser, compaction and overlay renderer in a
sandboxed Electron window with an isolated profile and no external network.
It is interface evidence, not physical-game or installed-release acceptance.
