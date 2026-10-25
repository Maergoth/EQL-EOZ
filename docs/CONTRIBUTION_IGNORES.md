# Persistent contribution ignores

The queue's red X dismisses the current entry. Its infinity X saves a permanent
ignore for that item or NPC on this device. The ignored-entity manager lives in
**Contribute to Wiki > Contribution History** and remains available while signed
out. **Restore** removes one ignore. Restore does not delete any contribution
receipt or undo an existing wiki edit.

The native ledger is `wiki-contribution-ignores.json` in the application's local
state directory. It is independent of the wiki account, active game character,
log file and dataset generation. It has no expiry. Restarting, syncing data,
changing accounts or updating the app never clears it. The bounded ledger rejects
additional entries at capacity; it does not evict older preferences. Unreadable
storage is preserved and blocks automatic contribution attempts for review.

`app/contribution-ignore-identity.js` shares the renderer/native identity rule.
Items and NPCs have separate namespaces. A positive local wiki resolver can join
an observed alias to its canonical article. Unresolved names use an exact
normalized MediaWiki title key; a close spelling, NPC family, item tier suffix or
case-distinct competing title cannot establish an alias by itself. Later verified
dataset aliases can apply to an existing ignore without deleting its original
observed name.

`desktop/contribution-ignores.cjs` owns bounded atomic persistence and validates
main-window-only IPC. `desktop/preload.cjs` exposes `contributionIgnores`,
`ignoreContributionEntity`, `restoreContributionEntity`, and the ledger change
subscription. The renderer keeps a synchronous matcher for discovery/queue
filtering. Native automatic-source and wiki write paths check the ledger again,
including retries. An ignored NPC suppresses its own spawn/population/source
contributions; an unrelated new item remains discoverable. An ignored item
suppresses its own item/source/zone-loot contributions; an independent unknown
NPC remains discoverable. Existing successful or partially applied receipts
remain available in History.

Focused tests use disposable directories and synthetic records:

- `node tests/contribution-ignores.mjs` checks restart persistence, exact and
  canonical identity, account independence, explicit Restore, capacity and
  corruption handling, actual main-frame IPC and preload calls.
- `node tests/ignored-entities-view.mjs` checks signed-out management, local
  filtering, Restore failures and native snapshot races without changing receipts.
- `node tests/automatic-loot-ignores.mjs` checks native rejection before account
  or HTTP access, independent entity handling and an unreadable-ledger stop.

These source fixtures do not assert that a packaged desktop build was installed
or that a live wiki edit occurred.
