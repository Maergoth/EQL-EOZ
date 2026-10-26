# Expandable private inventory storage

The game allows players to keep buying inventory capacity. The Character feature
must therefore stop treating an entire inventory as one bounded JSON value.
Increasing that value repeatedly is a temporary workaround, not the final design.

## Ownership

- The native Character repository owns full item records in a private SQLite
  database under Electron's user-data directory. Built-in `node:sqlite` runs in
  one dedicated Node worker; no renderer gains SQL or filesystem access and no
  third-party native addon is required.
- The renderer owns a bounded working set: equipped and pending-equipment items,
  the selected item and one inventory page. Its mature stat/equipment model is
  reused as a projection, never as the complete storage collection.
- Profile identity, equipment references, observed stat snapshots, walkthrough
  progress and achievements are stored separately from the inventory rows. The
  roster is a profile index, not nested full-character strings.
- Whole-item JSON semantics remain unchanged. Custom icons, manual edits,
  observed values, provenance and sockets are retained. This is a storage
  container/access change, not a lossy packing or stat-recalculation scheme.

There is no product-wide total inventory-byte or item-count limit in the native
repository. Available local disk space remains a physical limit. Individual
records, text lines/chunks, IPC requests/responses, worker queues and displayed
pages retain deliberate safety bounds independent of inventory size.

## Reads and edits

Inventory is queried by profile, location/search and an opaque keyset cursor.
Each page is bounded by both row count and encoded bytes. The UI renders only
that page and retains at most 100 prior cursors; First page and search remain
available without keeping navigation history proportional to the collection.
Unknown filtered counts are not presented as exact matches.

Every record retains its physical ID and exact inventory-origin binding. Location,
item ID, tier and occurrence keep their current identity rules; a similar name or
new location cannot establish that two physical copies are the same item. Manual
planning copies and items retained from earlier imports remain independently
accessible. Sockets stay attached to their physical parent. Keyring and rejected
rows are retained separately rather than expanding Character metadata arrays.

Edits commit changed rows and small core/flow state with an expected profile
revision. A stale request cannot overwrite newer state. The visible projection
distinguishes pending work from a confirmed durable save. Share, profile changes
and imports flush pending edits first; failure restores the last acknowledged
projection and retains the committed database state.

Page and editor replies bind to the selected profile/generation and UI epoch.
Superseded requests cannot replace a newer character or page. Catalog enrichment
operates on loaded records or bounded batches, never an entire inventory rewrite.

## Imports

The native file boundary retains its fixed configured game directory/native
chooser and regular-file checks. Inventory text is streamed in bounded chunks
and validated line by line, including encoding, fields, parent relationships and
all 23 worn slots. The old whole-file 2 MiB and parser 20,000-row inventory limits
do not define the new native path's total capacity.

Raw rows stage into an inactive import generation. Cached catalog resolution and
per-physical-record merging run in bounded batches. Known gear/ornament socket
semantics remain separate from container or unverified-parent contents. Empty and
sparse socket positions, loose Exaltation roles, unknown items and every stored
location retain their existing meaning.

Inventory and the paired achievement export activate in one durable
transaction only after complete validation and source/profile checks. Cancellation,
a changing source, invalid data or disk failure leaves the previous generation
and manual work intact. No raw inventory is uploaded as part of local storage.
Wiki/PNG sharing uses the equipped projection, reviewed totals and achievements.

Keep the current and one previous committed inventory generation and their
verified inventory/achievement source pairs. Successful reimports do not retain
an unlimited chain of full copies. Delete older and failed inactive staging rows
in worker transactions of at most 500 records, yielding between operations;
remove only fixed-name source files proven unreferenced by those generations or
an active job. Original migration backups and forensic migration records remain.
SQLite reuses free pages; no full database VACUUM or repeated whole-file rewrite
is part of a normal edit/import. The file can retain its previous high-water size.

## Legacy migration and recovery

Migration reads original schema-1 model/roster data directly, including registered
profiles and the unregistered draft. It never passes complete legacy collections
through a loader that truncates at 1,000 cards or slices keyring/source arrays.

Preserve the original private source in a verified recovery backup. Stage profiles,
core, complete item rows, keyring/rejected records and migration proof in a
transaction, verify counts and record hashes, then activate the new authority
atomically. After database count/hash proof and equality with the current legacy
values, retire only the old Character keys; independent contribution drafts keep
their existing host. A repeated migration is idempotent. A crash before activation keeps
the legacy authority; a corrupt store after activation blocks and reports recovery
rather than silently loading stale browser data.

If no native Character key has ever existed, an untouched repository can accept
current-origin browser legacy values through bounded chunks and a SHA-256-checked
private backup before the same atomic migration. Present native null tombstones
are authoritative and cannot be resurrected by stale browser data. Concurrent
native writes, changed source bytes, cancellation or failed proof reject activation.

Browser storage retains small preferences or an explicit limited fallback. It is
not a full-inventory mirror or a promise of unlimited browser quota. Backups and
database/WAL files remain private and are excluded from public artifacts.

## Required evidence before release

- More than 20,000 streamed rows and more than 1,000 persisted physical records,
  including carried items, bank, depot, keyrings, empty/sparse sockets and unknowns.
- Bounded page/working-set/IPC size as total inventory grows, with no render-all
  or whole-roster model rewrite on ordinary item edits.
- Exact legacy round-trip/count/hash migration, every profile and draft, manual
  data conservation, repeat migration and crash points around activation.
- Atomic paired imports, interruption/disk failure, stable physical IDs, reimport
  preservation, stale-page/profile/pack cancellation and independent characters.
- Correct equipped-only totals, PNG/wiki output and existing contribution-proof
  gates; no automatic whole-inventory wiki traffic.
- Actual sandboxed main/preload import, edit/page navigation, process restart and
  packaged Windows/Linux SQLite availability, followed by exact-head CI and
  public release verification. Source-only fixtures are not those proofs.
