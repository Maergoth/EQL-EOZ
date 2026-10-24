# Persistent contribution evidence

## Current 0.9.8 candidate scope and owners

0.9.7 is the released baseline. The source contracts below include the candidate
0.9.8 changes; wiki schema, database pages, installed-list cleanup and packages
need separate receipts in [the active release plan](RELEASE_098_PLAN.md).

This extends [the inventory-export Character plan](INVENTORY_EXPORT_CHARACTER_PLAN.md).
Logs supply monster kills/deaths, acquired items, zone names
and explicit `/loc` responses. Optional offline item OCR enriches Contribute
drafts. Character equipment comes from `/outputfile inventory`, and Character
OCR reads only the displayed fully equipped statistics. Neither path publishes
wiki changes automatically.

| Owner | Integration boundary |
| --- | --- |
| Root | `app/app.js`, capture workspace UI, log delivery, prompts, review forms and safe zone/NPC/item wiki draft preparation. |
| capture_pipeline_089 | Pure `app/contribution-evidence.js`, durable contribution queue, narrow parser source provenance, fixed native storage key and focused unit/restart fixture coverage. |
| Wiki/docs agent | Current public guides and component links; retain the separate historical capture validation records. |

## Observations and article presence

`queue.consumeLog(event, context)` consumes existing parser events directly. It
does not depend on screen-reading opt-in, a selected capture source or an OCR
worker. The context must contain `live: true`, a finite original `at`, current
`zone`, `logId` and increasing consumed-line `cursor`. Only kill, loot, zone and location events are accepted. Considers still focus
Intel, but do not create monster contribution tasks. Nearby casts are excluded.
Both direct queue intake and desktop journal/replay enforce this boundary. Older than ten seconds, more than two
seconds in the future, out-of-order live lines and remembered duplicate IDs are
rejected. Historical journal replay uses the existing `queue.consume(record)`;
it cannot arm a spawn request or turn a historical kill into a live prompt.

Queue intake, transient notices and reconciliation share the typed resolver in
`app/wiki-identity.js`. It normalizes NFKC, supported apostrophes/backticks,
whitespace/underscores, case, canonical titles and declared aliases without
discarding NPC articles or applying fuzzy equality. Potential fuzzy matches
remain review choices. Generated pet names follow the pinned EQEmu algorithm;
positive known wiki NPC identity wins over that heuristic.

Missing articles are established only by a non-sample pack marked
`meta.wikiEntitiesComplete: true` with `wikiEntities.items`, `.npcs` and `.titles`
arrays. Older/incomplete packs establish positive presence but only **unknown**
absence. Drafts retain that `membership` distinction. Exact normalized names,
aliases, canonical titles and base item names behind a trailing tier decoration
can establish presence; no fuzzy match automatically declares an article known.
Monster articles retain grammatical `a`, `an` and `the` in their identity.

Item draft identity is global by exact normalized base name, removing only one
controlled trailing `+0` through `+10` (with or without a separating space).
`(Exaltation)` remains part of the name. Raw decorated names stay in evidence and
the observed tier stays a separate field; `+11` and other unsupported suffixes
remain literal. This is not fuzzy matching. A base inventory gap, a tiered item
screenshot with no zone, and the same item in another zone enrich one draft.
Proposed related item links use that same base identity. The first useful zone
remains its default review zone; all observed zones
remain in relationships. NPC drafts retain their zone identity. Old item
zone-specific keys remain aliases, including Ignore suppression. Historical
duplicate reviewed drafts are preserved for manual reconciliation rather than
silently deleting one or choosing conflicting verified fields.

Draft reasons distinguish `missing-page`, `missing-source`,
`missing-population`, `tier0-verification`, `catalog-unknown` and
`identity-review`. A known page with a real source/population gap is a patch
task, not a proposed duplicate. Existing exact source/zone/instance relationships
are compared before creating work; a bare acquisition in a zone does not prove
a drop source. Known quest/crafted/vendor items do not become new missing pages
merely because they have no mob source. Reviewed/ignored/submitted state remains
durable and new evidence can enrich a task without repeatedly alerting.

Existing untouched tier-named drafts receive one narrow load migration: only an
item with a supported trailing tier, a title exactly equal to its original name,
no saved plan/base recovery/match review, no confirmed or edited fields or
relationships, and an unset/needs-review status is renamed to its base name and
title. Its ID, aliases, sources and other fields remain; an absent tier field is
filled without replacing an explicit tier. The original raw name is appended as
bounded migration evidence. The migrated queue is saved immediately and loading
it again is idempotent. Custom titles, planned, reviewed and submitted/partial
historical drafts keep their names, titles, fields and review fingerprints.

## Queue and relationship contract

The UI iterates `queue.snapshot()`, and may keep editing a selected draft while
new evidence arrives. Existing confirmed or explicitly edited scalar fields are
preserved. Proposed `knownNPCs` and `knownLoot` arrays accumulate exact names;
new values require review. Removing a draft remembers its key/aliases; explicit
manual force-add may restore it.

`consumeLog` returns `{candidate, prompt, locationCaptured}`. The last two are
null unless that action occurred. A draft has bounded `evidence` and `relations`:

```js
{
  type: 'mob-zone' | 'zone-population' | 'zone-loot' |
        'drop-source' | 'spawn-location',
  name, zone, evidence, confirmed: false,
  firstAt, lastAt, evidenceIds: [id],
  item,                 // drop-source: item associated with this NPC/provider
  location: {x, y, z}    // spawn-location only: normalized world coordinates
}
```

- Consider/kill: observed NPC-zone and zone-population suggestions. A consider
  may also establish an observed level. Neither establishes spawn coordinates.
- Item acquisition: zone-loot evidence means an item was acquired while in that
  zone. It is a reviewed suggestion, not proof the item originates there.
- Explicit corpse wording: a proposed item source, missing NPC draft and its
  unconfirmed `knownLoot`; missing zone drafts can accumulate population/loot.
- Named provider without corpse wording: `explicit-source`, distinct from a
  corpse. Recent kill and encounter-target association remain low-confidence
  suggestions. They never independently populate an NPC drop list. Existing
  `candidate.sources` remains available for the current reviewed source UI.

The parser preserves existing source strings/counts, but classifies corpse
provenance only when that wording is present and never carries a recent
kill/encounter source across a zone or selected log/root change. Actual source
replacement clears its zone, short name, location, last kill and current fight.
Retained combat history has immutable per-event zones and current-source
membership; rebuilding encounters after changing the inactivity gap cannot make
an earlier log eligible as the current loot source. Until this log supplies a
zone or self `/who` line, its new discoveries keep an unknown/blank zone rather
than borrowing the previous character's location. A local opaque source correlation
token is stored instead of a log filesystem path; no raw chat/log lines are
persisted by this new adapter. Saved generated evidence describes the event,
entity, zone and source provenance.

## Explicit spawn confirmation

An unknown/missing NPC killed in a fresh live line creates one durable
`spawnRequest: {status:'requested', requestedAt, evidenceId}` and returns
`prompt: {candidateId,name,zone,armed:true,expiresAt}` after automatically arming
the next eligible `/loc`. Root supplies a nonblocking bottom-right prompt
without stealing focus. Killing the same NPC again does not repeatedly open it.
A newer eligible unknown kill replaces the one active target; the older request
remains saved and can be explicitly rearmed. One location cannot fill several
drafts, and a captured request does not silently advance to another monster.

The player must go to the actual spawn and type `/loc`. **Record next /loc** can
explicitly rearm a saved request. `queue.armSpawnLocation(candidateId)` returns `{ok,error?}` and
binds only that NPC, current source and current zone for five minutes. The next
fresh later line/cursor in that context supplies a proposal; an already cached
player location, kill location, historical line or `/loc` before arming cannot.
Source changes, zone changes, timeout, candidate identity edits, explicit
`cancelSpawnLocation()` and restart invalidate the listener. The request itself
remains durable, but armed listeners never resume after a restart.

Successful capture returns
`locationCaptured: {candidateId,name,zone,location:{x,y,z},display}`. `display`
and proposed `fields.location.value` use the game's **Y, X, Z** order. The
structured relation uses normalized world **X, Y, Z**. Coordinates must all be
finite; unknown Z is not zero. Both field and relation remain unconfirmed until
review, with `spawnRequest.status: 'captured'`. The app never sends `/loc` or
other gameplay commands itself.

## Reviewed editor and media

Match/task review appears before fields. The editor defaults to Classic Era
and Normal instance with a Raid Instance choice; dynamic existing raid sections
remain distinct. Human labels and optional unknown blueprint placeholders replace
per-field Verified checkboxes. Common Loot and Unique Loot are section choices,
not inferred drop-frequency claims. Fresh evidence does not overwrite deliberate
in-progress edits. A final reviewed multi-page diff is required for publication.

PNG screenshot selection/paste is separate from local OCR and actual upload.
Caption/license and the intended article link are included in the reviewed plan.
The local Icon Finder accepts only a bounded crop containing just the icon,
reuses the wiki's algorithm-6 fingerprint code and versioned static catalog,
and preserves every exact item artwork alias/ID. It fetches metadata/catalog/
fingerprint index only as needed and proxies bounded first-party thumbnails;
no crop pixels leave the renderer or upload to the wiki.

Tiered base recovery preserves original evidence, unsupported/ambiguous values
and explicit user choices. Recovered values include the visible warning:
"These stats are reverse calculated from a tier X item. Please confirm with a
tier 0 item and remove this message". A genuine reviewed tier-zero observation
can replace the proposal through a scoped existing-page patch. Missing item
effects may include a spell-blueprint page in the same guarded plan; existing
spell pages are resolved first. Sequential writes retain normal attribution,
fresh revision/create-only guards and partial-result retry.

## Durable storage and limits

Root passes the origin-independent native storage adapter to the queue through
the separate `contributionStorage` mount option. It is independent of selected
Character profiles. One added fixed allowlisted key,
`eql-eye-of-zomm-contributions-v1`, has a **1,800,000 UTF-8 byte** bound.
Existing Character keys keep their 1,500,000-byte limits and the roster keeps
8,000,000 bytes. The fixed outer-file worst escaped bound is 76,804,096 bytes.
Exact-main IPC, atomic queued writes, quit draining, authoritative file values,
browser migration only for absent keys, tombstones and corruption preservation
remain unchanged. Cache upgrades clear cache, not these private drafts.

The queue stores at most 200 drafts, 2,000 Ignore keys, 2,000 remembered live IDs,
six recent text evidence entries per draft, 100 distinct relationships per draft
and eight supporting event IDs per relationship. It refuses a new identity when
full rather than silently deleting an older draft. A storage/byte-limit failure
warns that changes remain in memory; recovery/removal is needed before closing.
Malformed/unsupported saved queue data is preserved and write-blocked. This is
not an unlimited raw log archive or recording.

`queue.reconcile({apply:false})` provides a bounded dry run. Versioned apply
archives safe untouched known-complete/generated-pet/duplicate entries while
retaining edited, reviewed, submitted and partial plans and real patch tasks.
Archive entries remain bounded and recoverable; a failed save rolls back the
active queue. Root must back up the installed profile, inspect the dry-run
counts, apply and read back before claiming the user's list is cleaned. No
player list or private backup belongs in Git.

## Separate hourly observation outbox

The observation archive is independent of the editable contribution queue.
`collectDropObservation(event, context)` taps fresh parsed kill/loot events
before Ignore, submitted and wiki-presence filters. Known NPCs/items therefore
still supply observations. Explicit player/pet evidence and generated-name
rules exclude ineligible kills; uncertain loot sources stay unknown. No zero
drop or probability calculation is performed.

`desktop/drop-observation-storage.cjs` stores minimal allowlisted events with
stable IDs and SHA-256 payload hashes in a private atomic file. Bounds are
16 MiB, 10,000 pending/issue records and 5,000 acknowledged dedup receipts.
Corrupt saved files are preserved and write-blocked. A full/unwritable store
warns; it never silently deletes pending data. New parse sessions, Contribute
Ignore/clear and journal retention cannot erase this outbox.

`desktop/drop-observation-host.cjs` restricts collection/status/configure IPC to
the exact main frame. **Collect and sync drop observations** defaults on and
controls both collection and upload; disabling retains existing pending data.
Uploads require the normal logged-in wiki account and a due hourly schedule.
Overdue startup checks resume when running; failures back off 1, 2, 4 and then
up to 24 hours. Closing the app cannot promise background transmission.

Events contain only ID, kill/loot kind, observed time, optional server/catalog
version, zone/NPC/item and canonical titles, quantity, tier, instance, source
kind and opaque source/session/sequence tokens. No player/actor fields, chat,
raw logs, paths, screenshots or coordinates are accepted. Batches have schema
version 1 and at most 100 events/262,144 bytes; each event is at most 4,096 bytes.
Normal authenticated cycles send at most ten batches, below the server's twelve
per-hour account cap.

Records collected with a known account are bound to it. An immutable persisted
batch precedes network work. A receipt must match schema, batch, account, payload
hashes and an exhaustive disjoint partition of accepted/duplicate/conflict/
rejected event IDs. Only accepted/duplicate records are acknowledged; conflicts
and rejected records remain for review. Uncertain writes retry the same IDs;
logout/account changes invalidate in-flight acknowledgements. Different accounts
cannot drain already-bound records.

Reviewed article edits use the normal attributed MediaWiki Action API, distinct
from `action=eozobservations` ingestion. The public
[API_Documentation](https://eqlwiki.com/API_Documentation) page must document
supported create/edit/upload, blueprint retrieval, metadata and observation
contracts for other tools. Server schema/API and the database documentation page
require actual activation; an app/source push is insufficient.

## Validation ledger

Synthetic pure checks (no installed profile, player data, OCR or production wiki
writes):

- `node tests/contribution-evidence.mjs`: live parser-to-draft flow, presence
  completeness, relationship retention, explicit versus speculative source,
  global base/tier/Exaltation item and blank-zone OCR enrichment, confirmed field
  protection, unchanged/changed base-review fingerprints, persistent
  replay/Ignore, guarded durable legacy tier-title migration and targeted `/loc`
  before/after restart/source/zone/timeout.
- Existing `tests/contribution-queue.mjs` and `tests/loot-provenance.mjs`: edited
  field/plan persistence and unchanged parse totals, including zone isolation and
  named provider versus actual corpse wording.
- `tests/character-storage.mjs` and `tests/character-storage-host.mjs`: fourth
  key limits, fallback-origin authority, malformed entry preservation and actual
  host file close/reopen beside full independently bounded entries.

`node scripts/test-character-storage.mjs` passed using the actual main/preload
and three disposable-profile processes. It restored the exact contribution key
and visible Contribute card after same-origin restart, actual frontend cache
upgrade and occupied preferred port causing a new browser origin. Both saved
Character profiles/equipment also restored; a foreign renderer was denied read,
write to all four keys and flush. The fixture uses the current inactive
`flowVersion: 2` schema with synthetic legacy history preserved; the obsolete
pre-overhaul seed was intentionally updated because its legitimate migration
cannot satisfy a byte-identical restart assertion. All helpers exited normally.
These checks do not establish new live-game wording, OCR accuracy or a production
wiki write. No installed app or profile was used.

Final integration review rechecked source reset, form snapshots and inventory
poll ownership. Untouched form metadata now retains newly arrived queue values;
an old in-flight inventory poll cannot block the selected profile's next poll.
The old result is still rejected by profile/session/revision and visibility
guards before it can change gear. The root-owned native walkthrough passed its
held-old-poll/profile-switch regression. Focused reruns of `tests/test.mjs`,
`tests/loot-provenance.mjs`, `tests/map-sync-integration.mjs`,
`tests/contribution-evidence.mjs` and `tests/contribution-queue.mjs` passed after
the fixes; the source provenance test also changes the encounter gap and returns
to the same zone before checking that an old source remains ineligible.


## Next-release discovery review clarification

Read [the discovery execution plan](CONTRIBUTION_DISCOVERY_PLAN.md). Automatic
monster work requires death evidence; explicit named-corpse loot may supply a
source relationship. Manual and optional screenshot drafts remain separate.
Player identities known from /who and the current player, plus generated pets,
remain excluded. This is conservative classification, not a claim that a log can
identify every unknown player casualty.

New local game-log evidence retains its actual triggering line (at most 2048
characters) separately from the structured summary and event type. Review renders
the line as escaped text. Older captures without that line say it is unavailable;
the UI never presents a reconstructed summary as the original line. It is private
queue/journal evidence and is not included in automatic article text or the
minimal kill/loot telemetry endpoint. No full logs or chat archive is introduced.

Untouched passive consider-only monster tasks are archived. Unsupported passive
population facts can be removed from an untouched zone task while preserving an
archived original; killed/corpse-supported facts and loot remain. Reviewed,
edited, planned, submitted/partial, manual and screenshot-supported work is
preserved, and a storage failure rolls reconciliation back.

Review identifies exact canonical page-name matches separately from fuzzy
suggestions and retains explicit destination confirmation. Each proposed change
names its operation and linked destination. Accumulated loot whose matching
source/zone/instance is already cached is labeled already recorded and excluded
from the proposed additions. Bare acquired-in-zone history is not promoted to a
monster source. These are cached proposals; the guarded live preview still owns
the final changes, article attribution, and existing formatting.
