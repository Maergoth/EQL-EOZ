# Item names in flattened chat

The game can omit the binary item-link codes from a logged chat line. Once those
boundaries are gone, title case and a `+3` suffix do not prove which preceding
words belong to the item. Reading a whole prefix invented names such as a prose
word joined to a real ring name.

The parser now follows these rules:

- Authentic escaped `\aITEM … \/a` and current native binary links keep their
  exact delimited display names. They take precedence over plaintext parsing,
  including genuinely unknown items. Player links, quest proxies and malformed
  link controls cannot fall through into invented plain item names.
- Flattened ranked mentions use typed item names and aliases in the current
  bundled/live-overlay catalog. The longest exact known name directly before
  the rank is recognized, including after ordinary prose or punctuation. The
  preceding prose is never added to that identity. Ambiguous catalog identities
  are left quiet. No item title or prose word is hardcoded.
- An unknown plain name needs an explicit inner boundary, such as
  `[Uncatalogued Relic +3]`, `"Uncatalogued Relic +3"`, or `[Uncatalogued Relic] +3`
  inside the chat payload. These remain **possible mentions**, never proof of
  an encoded game link. Ordinary stat/spell text is excluded.
- Unknown unmarked names, even title-cased standalone chat such as
  `Uncatalogued Relic +3`, stay quiet. The log provides no procedural way to
  distinguish that name from prose before an item. To discover it, use a genuine
  item link retained by the log, an explicit item marker, actual loot, or manual
  review. Screenshots continue to enrich existing discoveries.

Only supported chat wrappers are considered. Non-chat combat/system messages,
unsupported ranks and historical context reads do not become item mentions.
The parser uses the catalog already supplied to its zone/log context. Both the
main renderer's `getPack` callback and the native automatic reader's
`setLogIdentityPack` updates supply that catalog; no live wiki request is added.
The name index is cached weakly by catalog object and rebuilt when the pack or
live-overlay object changes.

Existing discovery admission remains unchanged: known items are skipped locally;
missing candidates require live confirmation before notification, and existing
queue/ignore/replay suppression still applies. Chat cannot establish loot sources,
zones or kills, and text stays in local evidence rather than wiki prose.

`app/chat-item-mentions.js` owns the plain boundary rules. `app/parser.js` retains
encoded extraction and ordinary loot parsing. The module is included in the
packaged-runtime source gate. `tests/item-links.mjs` covers catalog names/aliases
after prose, exact unknown encoded links, bounded unknown mentions, ambiguous and
unsafe negatives, native pack updates, and downstream no-notice behavior.

`npm run test:chat-item-boundaries -- --screenshots .local/chat-boundaries`
exercises the real parser/discovery/queue modules and dedicated native popup in
an isolated sandboxed Electron profile. Its synthetic live-proof service verifies
that prose generates no native lookup while genuinely unknown encoded/bounded
items reach correctly named cards. It is UI evidence, not a production wiki or
physical-game test.
