# Live verification before automatic discoveries

The local dataset is the first gate. A recorded page, population or source fact
needs no wiki request and produces no discovery. A cached apparent gap is only
a proposal: `desktop/contribution-gap-verifier.cjs` checks anonymous current
public wiki data before automatic UI may describe a missing fact.

`ContributionGapVerifier({getPack, liveCache, fetchImpl, now})` exposes `check`, `clear` and
`dispose`. `check` accepts the bounded candidate projection: `kind`, `name`,
`zone`, `instance`, `reasons`, and observed `relations`. Relation fields are
`type`, `npc`/`name`, `item`, `zone`, `instance`, and `evidence`. It returns
`state` (`missing`, `covered` or `unknown`), confirmed-only `reasons` and
`confirmedRelations`, `unknownReasons`, `canonicalTitle`, and ISO `checkedAt`.
It never returns raw wiki source or writes a page/history record.
Optional bounded `proofs` contain only canonical title, revision, actual source
retrieval time (`fetchedAt`) and `live-wiki`/`live-cache` origin.

The renderer must bind the verdict to the exact projected facts, dataset and
active source generation. Only confirmed reasons/relations can become visible.
Original drafts remain internal; manual/reviewed work has its separate review
flow. A late result, failed check or unsupported source is not missing evidence.

The service uses a fixed production API origin and anonymous GET requests with
cookies omitted, independently of wiki login/publication. It checks canonical
normalization/redirect chains, current revisions, literal NPC zone fields,
normal category membership and scoped Various, plus reciprocal live item/NPC
coverage. A normal field/category does not prove a raid gap. New-article absence
must be explicit; an existing redirect is never a missing article, even if its
target is missing. Inferred-base tasks require the current authored marker.

Source absence requires supported live fields on both sides. Broad, ambiguous,
protected or unsupported fields stay unknown. Every referenced loot article must
currently prove a direct Itempage before a new source absence is confirmed;
collections cannot borrow a stale snapshot's absent membership. Known positive
coverage can still suppress redundant work without writing reciprocal copies.

Limits are two active jobs, twenty pending checks, twenty observed facts and
twenty page reads per job. Per-read deadlines are at most eight seconds, with a
fifteen-second job budget and bounded source/response bytes. Verdicts are bounded
to 1,000 entries, keyed by dataset version and exact projection: missing proof
expires after sixty seconds, covered proof after five minutes, unknown after
fifteen seconds. `clear`/`dispose` cancel queued work and discard late proof.

## Temporary public entry cache

`desktop/live-wiki-cache.cjs` stores validated anonymous, main-namespace authored
source independently of login and contribution history. `LiveWikiCache` accepts
`stateDir`, `now`, and a lightweight `onChange` callback. Its async `read`, `put`,
`snapshot` and `invalidate` methods serialize atomic JSON writes. The main host
owns this cache and injects it into the verifier; disposing a verifier does not
dispose the shared store.

Entries contain the canonical title, namespace zero, positive revision, full
wikitext, public categories, actual ISO retrieval time, API-validated aliases,
fixed public origin and a SHA-256 over all proof-bearing fields. Negative results
are never persisted. A corrupt existing file is preserved and reported as a
warning; fresh public checks can still run. Storage is bounded to 1,000 pages,
512 KiB of source per page and 32 MiB total serialized data, with oldest entries
evicted when full.

Fresh positive source is reusable for twenty-four hours, including after a
restart. Retained positive context remains available for at most seven days or
until the **base** bundled dataset contains the same canonical page at an equal
or newer revision. A newer manifest or generic title membership alone does not
prove catch-up. The temporary overlay must not be compared against itself when
evicting entries, and it must not manufacture global loot counts or collection
completeness. An additional verified NPC source invalidates any affected older
complete-count claim rather than guessing its new total.

Retention is not absence freshness. A cached empty source/zone field or inferred
base marker older than sixty seconds triggers a fresh anonymous reread before
the service may return `missing`. The original job deadline still applies.
Confirmed missing proof keeps the oldest actual retrieval time and expires at
that time plus sixty seconds; reusing it cannot extend the lifetime. Older
positive context may suppress redundant work, while failed refreshes remain
unknown and invisible. Published page changes clear verifier verdicts first,
then invalidate that exact canonical entry and its aliases.

Run `node tests/live-wiki-cache.mjs` and the verifier suite below. They cover
restart reuse with zero HTTP, matching-revision catch-up, distinct title case,
validated aliases, source/category hash integrity, corrupt-file preservation,
capacity, atomic concurrency and invalidation. Stale population/source/inferred
marker fixtures also verify that corrected live data suppresses yesterday's gap
and that short absence proof is never restamped as a fresh check.

Run `node tests/contribution-gap-verifier.mjs`. Synthetic checks cover stale
snapshots, live literal/category/Various coverage, instance scope, reciprocal
sources, collection uncertainty, exact candidate ownership, inferred markers,
redirect safety, timeouts, bytes, namespaces, source epochs, cache expiry and
concurrency limits. A separate bounded public sanity read of Corrupted
Kedgespawn/Lake Nerius suppressed the installed snapshot's false population gap
using two anonymous requests; an identical repeat required none. This is not a
real-game UI acceptance test.

## Global count replay

The source-domain audit was replayed locally over anonymous public API data,
with no candidate code sent to the host and no article/pack writes. Current
category enumeration included 11,357 Item members (one redirect) and 8,064 NPC
members. All redirect/template/source dependencies were fetched and verified;
none were silently treated as redlinks.

The actual producer/count helpers completed with no global incomplete reason:
11,356 authored item records, 37,637 references, 279 collections and 11,509
count entries. Of those entries, 10,505 were complete and 1,004 incomplete;
9,704 complete counts were below six, including 4,303 with a positive verified
NPC source. The 1,380 verified Common lower bounds were unchanged. All fifty
Research materials remained incomplete; the six conditional/unresolved groups
retained uncertainty-only membership and no positive cross-product.

Replaying only the original complete snapshot's candidate inventory changed no
NPC source counts. Current enumeration additionally found Elite Guard, C`rate,
and Fractured Malice. Their actual direct authored sources account for the only
existing-count change (Long Sword 97 to 98 via Elite Guard) and three new count
entries. This is source freshness, not inferred group expansion. The actual
Corrupted Kedgespawn revision 199345 also exported literal Lake Nerius and its
independent category membership after public zone catalog augmentation.

The audit receipts and public-source corpus are private `.local/` files, not
release assets. API reads are not an atomic database snapshot; production source
deployment and a fresh dataset build/verification remain separate release steps.
