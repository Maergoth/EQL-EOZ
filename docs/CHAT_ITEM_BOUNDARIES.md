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
- Quoted and bracketed ranked mentions also require a positive catalog match;
  those punctuation marks are text boundaries, not authenticated item links.
  The parser matches known item names and aliases anywhere inside that phrase. Thus
  `[Free Brown Chitin Protector +3]` and
  `"WTS FULL SET OF Rubicite Breastplate +3"` resolve to the catalog item, rather
  than inventing a missing page from the surrounding prose. Matching applies
  to both preceding and trailing prose and uses whole Unicode word boundaries.
  A phrase without a known item identity remains quiet.
- A full exact catalog title wins over a contained shorter item title. An item
  genuinely named `Free Brown Chitin Protector` therefore stays intact when
  present in the catalog. Otherwise longer containing matches beat their
  shorter substrings. Multiple distinct, disjoint or partially overlapping
  canonical items, or an alias shared by different pages, stay ambiguous. There
  is no English sales-prefix strip list. Authentic encoded labels keep their
  complete delimited identity, even when an unknown title contains a known
  item name.
- Unknown flattened names stay quiet, even title-cased standalone chat such as
  `Uncatalogued Relic +3` or explicit `[Uncatalogued Relic +3]` and quoted forms.
  The log provides no procedural way to prove that these are item names rather
  than prose. New unknown items require a genuine encoded item link retained by
  the log, actual loot, or explicit manual creation. Screenshots continue to
  enrich existing discoveries.

Only supported chat wrappers are considered. Non-chat combat/system messages,
unsupported ranks and historical context reads do not become item mentions.
The parser uses the catalog already supplied to its zone/log context. Both the
main renderer's `getPack` callback and the native automatic reader's
`setLogIdentityPack` updates supply that catalog; no live wiki request is added.
The name index is cached weakly by catalog object and rebuilt when the pack or
live-overlay object changes. `canonicalChatItemMatch(text, pack)` exposes the
same bounded positive-only match for local reconciliation: `matched` includes
the canonical `name` and whether the whole title was `exact`; `ambiguous` and
`none` provide no replacement identity. It does not fetch the wiki or establish
an unknown item's absence. Callers must separately preserve edited or authentic
encoded-link evidence.

Existing discovery admission remains unchanged: known items are skipped locally;
missing candidates require live confirmation before notification, and existing
queue/ignore/replay suppression still applies. Chat cannot establish loot sources,
zones or kills, and text stays in local evidence rather than wiki prose.

`app/chat-item-mentions.js` owns the plain boundary rules. `app/parser.js` retains
encoded extraction and ordinary loot parsing. The module is included in the
packaged-runtime source gate. `tests/item-links.mjs` covers catalog names/aliases
after prose, exact unknown encoded links, quiet unknown marked text, ambiguous and
unsafe negatives, native pack updates, and downstream no-notice behavior.

`npm run test:chat-item-boundaries -- --screenshots .local/chat-boundaries`
exercises the real parser/discovery/queue modules and dedicated native popup in
an isolated sandboxed Electron profile. Its synthetic live-proof service verifies
that marked and unmarked unknown prose generates no native lookup while genuinely
unknown native/escaped links reach correctly named cards. It is UI evidence, not a production wiki or
physical-game test.

The post-1.0 reported screenshots established incorrect discovery names, not
their original game-log bytes. A synthetic replay proves a concrete gap in the
quoted/bracketed ranked route: 1.0 matched only the entire marked phrase, then
treated it as unknown if that full phrase was absent. Its tests separately
covered ordinary known-item prose and accepted unknown marked names, but did not
challenge the assumption that punctuation could authenticate an unknown item.
The regression covers both embedded known titles and unknown sales prose; only
catalog-backed flattened identities survive. It does not claim that
the screenshot's source used brackets, escaped links or a particular binary
encoding; that requires the original bytes. Stored `plain-tiered-chat` evidence
identifies a parser interpretation, not authenticated game-link provenance.

## Untouched historical trade captions (1.0.5)

Flattened input already requires a known catalog identity and cannot create a
new title from `Free`, `WTS` or other prose. Historical cleanup formerly handled
only one unambiguous known item and a ranked source line; it retained combined
captions and unranked sales text. Screenshots of the false names do not establish
the original link encoding or whether the records came from an older release.

`coveredTradeChatCaption(caption, logLine, pack)` now supplies a separate,
positive-only cleanup decision. It requires the complete saved caption at whole
word boundaries in a supported ordinary chat wrapper, a leading trade cue
(`Free`, `Selling`, `Trading`, `WTS`, `WTT`, `WTB`, `Buying`, `Sell`, `Trade` or
`Giving away`) outside any known item title, and exact sequential catalog title
or alias spans covering at least half the caption's Unicode words. The count
uses non-overlapping spans; repeated/contained names cannot double-count words.
Partial overlaps, ambiguous aliases, reordered/shared words, low coverage and
unknown-only text provide no cleanup proof. An exact whole catalog title always
wins, even a genuine title starting with `Free` or `Trading`.

The decision suppresses a caption rather than renaming it into one of its known
items. It applies only to untouched chat-only queue entries with name/tier
fields. Native/escaped link controls and retained legacy hex bodies preserve
their exact or uncertain provenance. Loot, sources, screenshot/OCR evidence,
manual entries, confirmed/edited fields and reviewed/submitted work stay intact.
Each retained chat evidence line must independently support cleanup.

Old captions move reversibly into the bounded private archive with their names
and evidence unchanged. If the archive is full, the original record remains
saved with no false gap claim; the existing visible-row and editor-lease guards
retire its task. A failed storage write rolls the transaction back without
discarding evidence. No installer/profile migration, live wiki calls or ordinary
bag-of-words suppression is added.

The parser/queue suites include both reported captions and `Trading Wurmslayer`,
the exact 50% boundary, aliases and protected-work negatives. The mounted and
native queue-stability scenario covers retirement of previously visible rows
after catalog refresh with a full archive. The native chat-boundaries fixture
confirms zero false lookups while authentic unknown links still reach the popup.
