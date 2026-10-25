# Contribution history

Contribution history is a native receipt list for manual and automatic wiki plans.
It includes attempted submissions and saved partial or uncertain results. A
preview with no submission attempt is not a receipt. Opening history does not
submit, retry, upload, reconcile wiki pages, or start capture.

Discoveries and Contribution History are tabs inside the same Contribute
section, below shared wiki account controls. Discoveries keeps a compact item
reader toolbar and one latest source-result summary linking to History; full
receipts are retained in the native list. Opening History pauses only the
reader owned by Contribute and preserves the current editable discovery.
Pause reading also stops that owned reader when a missing-item request remains
pending, including a late start. Refreshing or returning to Discoveries cannot
restart it; an explicit Start or new Contribute action can resume the workflow.
This control affects screen reading, not ordinary log processing.
Arrow keys, Home and End move between tabs. Logging out clears visible history
immediately before any asynchronous refresh can finish.

`WikiClient.persist()` records sanitized plan metadata, including automatic item
and loot-source plans that use the same native client. The submission boundary
also records an attempt before authentication and records failures that occur
before a page write. Existing saved plans with applied, failed, uncertain, or
terminal results are backfilled on load. Old plans already pruned before this
feature was installed cannot be recovered.

The private profile file `wiki-contribution-history.json` retains at most 500
receipts and 2 MiB of UTF-8 JSON, independently of the 30 retained editable plans.
It contains plan IDs, UTC timestamps, account/origin identity, manual/automatic
mode, page titles and operations, outcomes, revision numbers, and bounded error
codes. It does not contain page diffs or wikicode, raw log/OCR evidence,
screenshots, cookies, tokens, captions, or arbitrary server error text. Receipt
updates use a private temporary file and atomic rename. Malformed or oversized
history stays on disk without being replaced; read/save failures produce a
warning without turning a confirmed wiki edit into a failed edit.

The only renderer API is `eyeOfZommWiki.contributionHistory({limit?, before?})`.
It uses the existing exact main-frame wiki IPC guard and performs one fresh
native account-status request per invocation. Logged-out callers receive an empty
list; authenticated callers receive only exact account-ID/name and origin matches.
Pagination cursors are bound to that identity. No renderer method accepts receipt
writes. The renderer must discard an in-flight response when its account changes.

Responses contain `entries`, `account`, `hasMore`, `nextCursor`, and an optional
string `warning`. Each entry includes `id`, `planId`, `title`, `origin`, `account`,
`createdAt`, `updatedAt`, `mode`, `status`, and `pages`. Entry statuses are
`pending`, `partly-submitted`, `submitted`, or `needs-attention`. Page statuses are
`pending`, `applied`, `unknown`, or `failed`; an optional upload appears as a File
page with operation `upload`. Fixed-origin page URLs are generated natively;
revision/diff URLs are emitted only for confirmed applied revisions. An uncertain
result does not prove that an edit was saved.

Run `node tests/contribution-workspace-layout.mjs` for integrated section, latest
results, draft and keyboard/account behavior, and
`node scripts/test-discovery-capture-workspace.mjs` for actual Electron reader
ownership and History pausing. Run `node tests/contribution-history-host.mjs` for synthetic native transport,
storage/restart/privacy, bounded retention, account isolation, partial/uncertain
results, failure handling, and read-only IPC coverage. These fixtures do not
establish production authentication, live-game capture, or a production edit.
