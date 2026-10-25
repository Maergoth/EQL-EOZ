# 0.9.14 contribution history and safer loot discovery

This release retains the shared wiki item engine, bundled formula rules and
tier-zero verification behavior introduced in 0.9.12, including the exact
`Tier 0 Verification Needed` category correction released in 0.9.13. Both earlier
releases' notes, screenshots and hashes remain unchanged.

## Scope and ownership

- **Contribute → History:** native metadata receipts for manual/automatic plans,
  account/origin filtering, local status filters and pagination, confirmed
  revision/diff links, partial/uncertain results, and safe bounded persistence.
  See [the native contract](CONTRIBUTION_HISTORY.md).
- **Pet exclusion:** the shared explicit owner-labelled pet check protects parser,
  discovery, queue and native contribution planning. Existing edited/submitted
  work remains available; similar ordinary monster names remain literal.
- **Cached global loot placement:** six distinct monsters means Common; fewer
  means Unique only with complete native cached count provenance. There are no
  live count requests. See [the contract](CONTRIBUTION_LOOT_CLASSIFICATION.md).
- **Weight regression:** retain the existing formula and check that base weight
  2.5 at rank ten displays as 0.3.

## Validation and release gates

The focused native history suite passes metadata privacy, fresh native account
filtering, cross-account/origin/cursor isolation, 80 receipts across 30-plan
pruning/restart, the 500-entry/2 MiB caps, partial/unknown/pre-write failures,
corrupt-file preservation, atomic writes, non-fatal storage errors, retrying a
failed receipt save, and exact main-frame read-only IPC/preload admission.

The UI suite covers escaped text/fixed-origin links, upload rows, account races,
logout clearing, local filters, pagination/deduplication, recoverable errors and
no background history reads. jsdom 27.0.0 is pinned as a development-only test
dependency; it is not an application runtime dependency.

Before publication, record final integration results for the complete source
suite, dependency audit, generated runtime sources, Windows/Linux package CI,
actual archived screenshot/hash, exact release commit and public asset checks.
No installed player profile or production wiki write is part of these fixtures.
App publication and the separate dataset exporter/pack refresh have independent
receipts; this document does not claim that an exporter change is installed.

The version-owned screenshot at
`app/assets/whats-new/0.9.14/contribution-history.png` is an actual CUA capture of
the integrated `mountCaptureWorkspace` UI, modules and styles with synthetic
receipts and isolated wiki/storage APIs. The History tab and partial outcomes
were visually checked. It contains no game/player pixels, installed profiles or
production wiki submissions. Its reviewed SHA-256 is recorded in the release
history.
