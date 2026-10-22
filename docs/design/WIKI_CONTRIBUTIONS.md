# Wiki contribution integration design

Owner: `wiki_contribution_089`. Status: implemented; local synthetic and native
integration checks passed, 2026-10-22. Feature PR review is still required.
Parent plan: [CAPTURE_CONTRIBUTIONS.md](../CAPTURE_CONTRIBUTIONS.md).
This document records source contracts, implementation boundaries and actual
observations. Production login, edits and uploads were not exercised.

## Verified source map

Read the wiki README, CONTRIBUTING, relevant development/component guides and
PROJECT before inspecting these components. No wiki files were changed.

| Contract | Evidence |
| --- | --- |
| Contributor standards and blueprints | Live [Help:Contents](https://eqlwiki.com/Help:Contents), revision **198282**, timestamp 2026-10-17T20:31:11Z. Root saved its public source privately. Fetch again for draft preparation. |
| Running source-editor loader | Database `MediaWiki:BlueprintLoader.js`, live revision **168748**. Reviewed mirror: `D:\EQLWiki\extensions\EQL-Editor-Tools-Icon-Finder\MediaWiki_BlueprintLoader.js`. It discovers heading sections ending in Blueprint/Blueprints on Help:Contents and extracts the first pre block. A Git deployment does not publish this database script. |
| Item article and transclusion | Live `Template:Itempage` revision **176024**. Article source wraps its Itempage call in onlyinclude; transcluded items become hover links. Template supplies Items membership. Exact field boundaries and existing markup must survive an update. |
| NPC article | Live `Template:Namedmobpage` revision **149842** supplies NPCs/Named Mobs membership. `known_loot` and optional `common_loot` are independent fields. Never replace one by regenerating the whole page. |
| Dynamic zone lists | `D:\EQLWiki\extensions\DynamicZoneList\DynamicZoneList_body.php`: category intersections with Quests, NPCs and Items; an explicit supported-zone allowlist; balanced Itempage extraction for drop sources. New categories do not extend that allowlist. |
| API availability | Public siteinfo on 2026-10-22: MediaWiki **1.45.3**, `/api.php`, write API enabled, uploads enabled, maximum server upload **134217728 bytes**. Normal users have createpage/edit/upload rights; rights are not proof that a particular edit is permitted. |
| Authentication | Public extension inventory includes OATHAuth and ConfirmEdit, no OAuth. `LocalSettings.example.php` documents verified-email editing and Turnstile. Runtime/API responses and the actual login flow remain authoritative. |
| Source-name provenance | `app/parser.js`, `noteLoot`: an absent explicit source falls back to last kill or recent encounter. The new additive `sourceEvidence.kind` and `sourceConfidence` fields preserve that distinction. Inferred sources remain unconfirmed proposals. |

Private read-only evidence files are beneath
`D:\EQLWiki\.local\validation\eoz-capture-*`:
`help-contents.json`, `siteinfo.json`, `paraminfo.json`, `wiki-sources.json`.
Do not include those full captures in the public PR. Their public revisions and
sanitized synthetic fixtures are sufficient for reproducible tests.

## Contribution standard translated into app behavior

The wiki requires player-authored prose and artwork, objective confirmed facts,
duplicate avoidance and meaningful era distinctions. The app therefore fills a
blueprint deterministically from reviewed evidence; it does not write narrative.
Unobserved values stay unresolved, rather than becoming zero, None or guessed
mechanics. No unedited instructional placeholder may be published.

Keep exact observed NPC prefixes and spellings. Similar titles and same-name
NPCs from another zone are suggestions, not automatic identities. Preserve raid
versus normal contexts and tier/augment evidence. Zone category membership can
populate an existing dynamic list; a new unsupported zone needs separate wiki
work. Personal snapshot discussion belongs on the contributor's own talk page.

## Data contracts and provenance

Pure preparation and patch helpers are in `app/contribution-model.js`;
`app/contribution-queue.js` owns durable proposals, reviewed fields and Ignore
keys. `desktop/wiki-client.cjs` owns fixed-origin API transport and persistent
page plans; `desktop/wiki-host.cjs` owns the dedicated login session/window and
exact main-frame IPC checks. Root's `app/capture-workspace.js` renders the review.

```js
// Local private state, never a cloud telemetry record.
Candidate = {
  schemaVersion: 1, id, kind: 'item' | 'npc' | 'zone',
  observedName, proposedTitle, canonicalPageId: null,
  zone: { title, shortName, instance: 'normal' | 'raid' | 'unknown' },
  era: { value: null, evidenceIds: [], confirmed: false },
  fields: { /* field -> {value, evidenceIds, confirmed, uncertainty} */ },
  evidenceIds: [], relationProposals: [],
  wiki: { membership: 'present' | 'missing' | 'unknown', checkedAt: null,
          catalogVersion: null, normalizedTitle: null, redirects: [] },
  status: 'needs-review' | 'draft' | 'ready' | 'partial' | 'submitted' | 'ignored'
};
```

An observation remains immutable; corrected values live in candidate fields with
their evidence references. Store display text separately from normalized search
keys. No API tokens, cookies, raw account information or image bytes in candidates.

The shared parser now adds explicit source provenance to loot events:

```js
sourceEvidence: {kind: 'explicit-corpse' | 'recent-kill' | 'encounter-target' | 'unknown',
                 timeGapMs?: number, sourceAt?: number},
sourceConfidence: number
```

The shared parser remains the source for logged loot/kill/zone/profile/location
events. A recent kill is a proposed drop relationship requiring confirmation,
even when the existing parser displays it as the source. `/who` currently parses
the selected character's line; it does not establish a full zone population.
OCR of a visible NPC is an encounter observation, not proof of an unseen spawn
or an exhaustive population. A character item card is not a contribution until
the player explicitly adds it to the contribution queue.

Queue proposals preserve NPC prefixes rather than using the older discovery
normalizer that strips a/an/the. A known base item with an observed +tier suffix
does not create a false missing-item candidate. Explicit corpse-source evidence
also creates a missing NPC proposal with an unconfirmed knownLoot array. Observed
loot merges only into unedited proposals; player corrections marked edited are
never overwritten by historical replay. Later evidence remains available for
review. Ignore persists across startup replay and can be overridden by a manual
Add for review action.

## Potential matches and title identity

1. Use the bundled complete wiki catalog for immediate presence and suggestions.
   Incomplete/stale/unavailable data yields unknown. Reuse
   `buildWikiEntityCatalog` for presence, but do not reuse its prefix-stripping
   `wikiEntityKey` as a creation or entity-identity key.
2. Rank bounded local candidates by exact normalized spelling, known aliases,
   punctuation alternatives, token overlap and edit distance. Filter by entity
   type where known, show zone/era/instance differences, and keep original titles.
3. On review, request exact proposed titles/known variants through
   `action=query&prop=info|revisions&redirects=1&converttitles=1`; retain normalized
   titles, redirect chains, page IDs, current revision and missing status.
4. Run bounded `list=prefixsearch` and `list=search&srwhat=title` requests for
   potential matches; dedupe by page ID. Read results as text, never insert search
   snippets as trusted HTML. Debounce, cancel obsolete queries and cache briefly.
5. Before creation, repeat exact-title/redirect checks against the server. Require
   review of potential matches; use createonly to close the final creation race.

Observed production examples: prefix search for `Vicar M` and title search for
`Vicar Kari` return `Vicar M\`Kari`. The apostrophe version `Vicar M'Kari` is
missing. `A goblin alchemist` currently redirects to a missing `Goblin Alchemist`.
An absent redirect target must not be treated as a safe independent new identity.
These examples are read-only observations, not permission to fix those pages.

Search backends differ. Do not depend on CirrusSearch-only fuzzy syntax or claim
server typo correction as guaranteed. Local ranking provides consistent fallback.
Official [prefix search](https://www.mediawiki.org/wiki/API:Prefixsearch) and
[search](https://www.mediawiki.org/wiki/API:Search) contracts apply.

## Blueprint extraction and safe assembly

Fetch a single current Help revision with source and sections, pin it while
preparing the draft, and show its revision/date. Heading indexes can move between
revisions; never fetch indexes from one revision and source from another. Prefer
the revision's complete source parsed into sections locally, or pin oldid in
section requests. Select Item, NPC, Raid Encounter, Zone or City explicitly.

Keep the exact live blueprint as reference; build only its supported structural
fields. Validate expected template names and field names before using it. If the
blueprint contract changes, keep local drafts but require fresh review. Do not
execute wiki HTML or remote JavaScript while building drafts.

| Entity | Reviewed prefill | Leave unresolved or ask the player |
| --- | --- | --- |
| Item | Name, observed flags/slot/class/race, examine stats and effects, player-confirmed source, supported categories | Base stats when only an upgraded/augmented item was read; icon ID without verified matching; unidentified effects; era; factual prose |
| NPC | Exact name, confirmed zone, observed `/loc` with location provenance, confirmed loot relationships | Mob HP/AC/level/abilities, spawn point from player location, image, drop frequency, raid identity, description |
| Zone/city | Observed zone identity and confirmed category references | Adjacent zones, level ranges, lore, map/artwork, full population, unsupported DynamicZoneList support |

Do not copy every optional category from the item blueprint. Derive only reviewed
class/slot/skill/source categories, using existing wiki spelling (for example,
Fingers differs from the examine slot label FINGER). Existing template-provided
categories need not be duplicated. Unknown values do not justify a negative fact.

Stat blocks are built from allowlisted structured fields. Escape wiki-breaking
characters in evidence-derived text and validate page titles with the API. Effect
links use resolved page titles; free-form contributor prose is explicitly
editable wikicode with preview, never substituted into template parameter names.
Do not emit a fake File name or overwrite a canonical icon. A screenshot upload
is a separate reviewed step. No automatic inverse scaling of tiered items.

## Cross-page page plan

```js
PagePlan = {
  schemaVersion: 1, id, candidateId, wikiOrigin: 'https://eqlwiki.com',
  expectedUser: { id, name }, blueprintRevision,
  reviewedAt, reviewDigest,
  pages: [{ id, title, namespace, operation: 'create' | 'replace-reviewed',
            baseRevision: null, baseTimestamp: null, startTimestamp,
            beforeHash, afterText, afterHash, summary, evidenceIds: [],
            dependsOn: [], status: 'pending' | 'applied' | 'failed' | 'unknown',
            result: null }]
};
```

A confirmed new item/drop normally proposes the item article, the NPC's loot
parameter and the appropriate zone category on each relevant article. An existing
dynamic zone page usually needs no edit. A manually maintained notable-loot list
is an optional separate diff; do not blanket append to every zone section.

Use balanced-template parsing with top-level parameter ranges. A minimal patch
inserts one nonduplicate item transclusion inside the correct existing loot field
or one source entry in the correct item field. Preserve comments, provenance,
frequency annotations, art, unrelated fields and normal/raid sections. Ambiguous
multiple matching templates/sections require contributor selection or source
editor fallback. Do not rewrite the page from a new blueprint.

The review shows every page, before/after diff, evidence, additions/categories,
identity/era/instance, unresolved fields and any dynamic-list limitation. The
player may exclude optional reciprocal edits. Changing text, matches, source or
account invalidates the review digest. Persist the plan before the first write.

## Login and trusted transport

Use normal wiki login in a dedicated BrowserWindow with partition
`persist:eye-of-zomm-wiki`, no app preload, Node disabled, sandbox/context
isolation/web security enabled. Restrict top-level navigation to the exact
HTTPS wiki origin, deny window opens/downloads and native permission requests.
Allow the normal site's required subresources (including Turnstile); do not
disable browser security to work around an authentication challenge.

The main process uses that session's `fetch` for a fixed `/api.php` endpoint with
bounded responses, request timeout and exact-origin redirect validation. Electron
documents [session networking](https://www.electronjs.org/docs/latest/api/session#sesfetchinput-init)
separately from Node fetch; test cookie continuity in the actual Electron runtime.
Do not copy cookie headers into renderer code. No app-owned password form,
forum bridge key, bot password, shared server secret or new OAuth deployment.

The `eyeOfZommWiki` bridge exposes `status`, `login`, `logout`, `matches`,
`blueprints`, `preparePlan`, `getPlan`, `submitPlan`, `uploadCharacter` and
`onStatus`. Verify sender WebContents, main frame and
exact local main URL. Overlays, viewer frames and the remote login window cannot
invoke these methods. No arbitrary URL/file path/API-action passthrough.

`status` returns a sanitized named-user identity and required-right booleans,
never tokens, full rights dumps, email address or cookies. Keep CSRF tokens only
in main-process memory. On logout clear this dedicated partition's wiki storage
and invalidate review/account state; leave private local drafts intact. Normal
wiki login supports account verification/recovery/2FA without app reimplementation.

`blueprints()` also returns the current canonical full-page era template names
from Category:Era Templates, omitting inline/short/P99 helpers. Preparation checks
that the selected template actually exists. Names such as ClassicEra without a
space do not exist on this wiki; Classic Era is the valid template title.

## Publishing and recovery

For each sequential write, recheck the expected named user and current page state,
fetch the CSRF token, and include assert=user plus assertuser. New pages use
createonly; reviewed existing pages use nocreate, page ID and baserevid with the
recorded start time. Do not silently regenerate or merge changed source. A changed
base is a conflict requiring a new diff/review. Avoid basetimestamp when the aim
is to reject self-conflicts as well. These guards follow the official
[edit](https://www.mediawiki.org/wiki/API:Edit) and
[assert](https://www.mediawiki.org/wiki/API:Assert) contracts.

On success save the returned revision/page identifiers immediately. Pause after
conflict, permissions/email/blocked/protected errors, CAPTCHA/abuse filter,
rate-limit or login expiry. Keep Copy wikicode/Open wiki editor available. Do not
automate Turnstile, downgrade permissions or retry content under another identity.
Honor server backoff; bounded transient read retry must not blindly retry writes.

A timeout or lost connection after POST is an unknown result, not a failed edit.
Refetch source/history to reconcile the exact after content and known result
before retrying. A resumed plan skips applied pages; each remaining page gets a
fresh base/review if needed. If item creation succeeds and reciprocal edits fail,
show that partial outcome with links and retain unfinished work. Never undo a
successful public page automatically as rollback for an unrelated failure.

The renderer saves the private plan ID beside its candidate and offers Resume
saved review after restart. Restoring a plan resets the live-match and per-page
acknowledgments; publishing still requires the current explicit final action.
Changing the candidate or pressing Stop invalidates an in-flight review response.
Editing is suspended while the sequential publish runs. Corrected field values
retain an edited marker even when not yet verified, so journal replay cannot
replace a player's draft corrections with earlier OCR. Newly observed loot
remains evidence when its proposed list would overwrite a corrected list.

## Character snapshot to own User_talk

Resolve `User_talk:<current canonical user name>` from the active named account;
the app does not accept another user's target. Preview the PNG and an editable
topic/message before explicit Upload. The generated image contains only selected
character data, no app window chrome, journal paths, tokens or hidden capture area.

Create a unique PNG filename with a sanitized character label and random snapshot
ID, app-side byte/pixel bounds, and PNG signature validation. Upload the verified
in-memory PNG through the normal multipart upload API with its CSRF/assert guards.
Never set ignorewarnings to bypass exists/duplicate/deleted-file warnings: the
official [upload contract](https://www.mediawiki.org/wiki/API:Upload) states that
ignoring exists can overwrite a file. Stop and offer the existing file/review or
a different unique name.

After upload success, append a reviewed signed topic using section=new and a
stable private snapshot marker plus File link. Record upload filename/hash and
talk revision separately. On ambiguous timeout, inspect existing file info and
the talk marker before retry. An uploaded image with a failed talk edit is a
recoverable partial result; retry the talk step without a second upload. Never
post a signature in item/NPC/zone article content.

The character editor exposes captured augment names and separate stat blocks,
the inclusion state of those augments, the optional confirmed wiki match, and
base values with tier/fraction provenance. The snapshot preview reports copy,
save and upload errors inside its dialog. Upload results link to the image and
the current user's talk page. A partial retry reuses its saved snapshot ID;
reopening the same PNG under the same account also resumes the existing record.

Character's Import examine screenshot action reads one chosen PNG through the
same main-process capture host and local OCR worker without enabling live
capture. It passes the current Character capture session ID when available, or
a new renderer-lifetime offline review ID. Imported proposals appear as editable
cards. The separate Settings screenshot import explicitly selects contribution
ownership, so it cannot accidentally populate Character during a live session.

## Acceptance and implementation ordering

1. Implement pure candidate identity/provenance, blueprint parsing, bounded match
   ranking and balanced source patches with synthetic fixtures.
2. Add the dedicated auth/service boundary and local API fixture tests for
   cookies, CSRF/assertions, named-user changes, permissions, conflicts, title
   races, unknown write outcomes, partial retry and upload warning safety.
3. Wire durable queue plus main-tab review/edit/diff UI to journal/log observations.
   Validate small/large fonts, keyboard access and long names in narrow windows.
4. Exercise normal login and fixture mutations locally using an isolated profile
   and disposable local wiki account if available; production checks are read-only.
5. Record actual exercised behavior and limitations in the feature PR. Never
   describe fixture tests as real game OCR accuracy or live wiki submission.

Remaining manual acceptance includes current production CAPTCHA/2FA behavior,
review of a real normal/raid article containing multiple matching templates,
base-versus-upgraded examine calibration and the supported-zone list for a truly
new zone. These are acceptance items, not reasons to add a server integration by
default. Native cookie continuity and fixture multipart behavior were exercised
as recorded below.

## Observed validation

The following checks ran locally against disposable synthetic state. None sent
an edit or upload to the public wiki or used the installed player app profile.

| Check | Actual result |
| --- | --- |
| `node tests/wiki-contributions.mjs` | Passed literal-safe stat fields, confirmation gates, upgraded/augmented base-stat blocking, prefix-preserving matching, complete nested-heading blueprints, existing-source minimal patches, duplicate/no-op and ambiguous-template rejection. |
| `node tests/wiki-client.mjs` | Passed a real loopback HTTP fixture: account/blueprint races, create-only and revision checks, partial retry after client recreation, ambiguous POST reconciliation, image bounds, upload-success/talk-failure retry, no token/cookie/image persistence. Multipart bytes were exercised. |
| `node tests/contribution-queue.mjs` | Passed durable Ignore/replay, player-edited unconfirmed fields retained across restart/replay, unconfirmed missing-NPC loot proposals, evidence retained when later drops cannot overwrite edited loot, upgraded-known-item presence and incomplete-catalog handling. |
| `node tests/capture-workspace.mjs` | Passed stat editor aliases and thousands separators, unknown values, invalid/duplicate stat rejection and bounded numeric values. |
| `node scripts/test-wiki-auth.mjs` | Passed actual Electron HttpOnly cookie continuity from the hardened native login window to session.fetch, CSRF/create-only fixture POST, exact multipart PNG bytes and own-talk edit, no remote Node/preload/IPC, blocked external navigation, foreign/subframe sender denial and logout cookie clearing. |
| `node scripts/test-capture-workspace.mjs` | Passed actual main/preload/renderer: canonical era and reviewed item/NPC blueprints, commas preserved in stat lines, no write on preview, explicit loopback-only two-page publish, partial failure followed by renderer restart and per-page retry without repeating the primary create, reset review acknowledgments, stale review suppression after selection/Stop, edited unconfirmed fields retained across replay, 10/20px fonts in a 1024px window, manual card/slot and editable augment provenance, distinct base/equipped values, recoverable invalid-stat input, dialog-local confirmation/save errors, PNG preview, clipboard host, real temporary PNG save and gear persistence after reload. Actual open-file import of a synthetic PNG traversed preload, CaptureHost, local OCR and journal into an editable Character card while capture remained disabled; the Settings import of the same PNG entered the contribution queue instead. Clipboard writes were intercepted in memory so the player's clipboard was untouched. |
| Current Help source | Revision198282 yielded all five complete relevant blocks: NPC941, raid807, item3309, zone2191 and city1148 characters. Literal map/danger/service headings did not truncate extraction. |

Synthetic screenshots were inspected at both font extremes and in the character
PNG preview. Controls remained inside the viewport; scroll allowed access to long
forms and the long image. These observations do not establish OCR accuracy on
every UI skin/resolution, native Wayland behavior, real account 2FA/Turnstile
acceptance or a successful production wiki contribution. Real normal/raid source
ambiguity deliberately falls back to the wiki source editor instead of guessing.
