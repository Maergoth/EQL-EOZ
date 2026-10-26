# Private Character storage

Desktop Character inventory lives in a private SQLite repository, not one large
JSON string in a profile roster. There is no aggregate item-count or inventory
byte limit in this native path. Records grow on local disk; disk space and
individual record/operation safety limits still apply.

The Character screen keeps equipped items, pending placements, the selected item
and one inventory page in memory. Search and location filters query the repository.
Keyring and unmatched export rows have their own read-only pages. Ordinary edits
save changed records and Character metadata instead of rewriting every item in
every character. A pending edit is not a durable save acknowledgment.

Inventory files are streamed into an inactive import. After both inventory and
achievement exports validate, one transaction activates the complete result.
Canceled, invalid or failed imports keep the last committed inventory. Physical
copies, socket positions, original locations, manual edits, icons and recorded
stats retain their meaning. Sharing still includes equipped gear, reviewed
character totals and achievements; carried/bank/depot contents stay private.

Existing schema-1 characters, all registered profiles and the unregistered draft
are migrated from the original native store with a private verified backup and
count/hash proof. Migration bypasses old card-array truncation. Its activation is
atomic and repeatable. Once active, the database is authoritative; corruption
blocks writes and reports recovery instead of loading stale browser data.
The original JSON is retained in the verified private recovery backup. After
stored-record proofs and a fresh equality check, its three Character keys retire
from the old host file so contribution saves no longer rewrite the old roster.
Older app versions do not read new database edits. Downgrading requires recovery
from that backup and is not a round-trip migration.

The old fixed-key JSON host remains for legacy recovery, contribution drafts and
explicit browser-only operation. That fallback has finite model/roster/browser
quota limits and cannot provide expandable inventory storage. A full inventory is
not mirrored to localStorage after native migration.

See [the architecture and acceptance contract](SCALABLE_INVENTORY_STORAGE.md) for
worker/IPC, paging, migration, import atomicity and release-proof requirements.
All databases, WAL files, backups and player exports remain private. Source
fixtures, actual native execution and packaged platform evidence are distinct.
