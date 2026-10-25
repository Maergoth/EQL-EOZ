# Combatant overview and AA gains

The native Parse panel lists logged combatant names in Overview for Whole session
and individual encounters. Damage, Healing and Taken each have a keyboard-accessible
disclosure for every combatant with actions in that metric. Open one to inspect
its abilities or incoming attackers. Disclosures stay open across log updates.

One damage line credits damage to its logged attacker and damage taken to its
recipient. Those describe the same hit; adding the columns together counts it
twice. A heal credits the logged healer, using the effective amount before the
optional parenthesized amount. Rune capacity stays separate from healing. Names
do not imply NPC/player classification; pets retain their logged names, and
unattributed non-melee damage retains an Unknown attacker. No owner credit,
overheal, absorption or unseen actions are inferred. Results depend on the game's
combat message filters and range; an incomplete game log is not a raid-wide parse.
Server messages that misidentify an actor are displayed as logged; the app does
not guess a correction from a nearby spell or timing coincidence.
Names containing combat verbs can create multiple valid attacker/recipient
splits. An established exact name can disambiguate them; otherwise that line is
left uncredited instead of inventing actor names.

Own damage, healing, taken, DPS clocks, kills, loot and trigger inputs keep their
existing meanings. Nearby actions have separate event types and cannot inflate
those player totals or create wiki discovery evidence. All names share the
encounter duration for encounter rates. Whole-session other-combatant rates use
the span from the first to last observed combat action; own DPS retains the
existing outgoing-damage clock. A per-name row always uses only that name's
damage, even when a log/profile switch preserves combined legacy session totals.
The panel explains the clock distinction.

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
