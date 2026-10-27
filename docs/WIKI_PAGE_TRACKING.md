# EoZ wiki page tracking

Starting with 1.0.9, pages generated or edited by Eye of Zomm carry
`[[Category:EoZ]]`. This includes reviewed and automatic contribution articles,
their related monster/item/zone/spell edits, Character User pages, the legacy
Character snapshot talk topic, and newly uploaded File descriptions. Local
proposed wikicode contains the same tag before review, Copy and publication.

The shared source helper appends a page-only footer:

```wikitext
<noinclude>[[Category:EoZ]]</noinclude>
```

`noinclude` keeps an item or other transcluded article from categorizing the
page that includes it. Existing direct membership, including a manual sort key,
is retained in place. Other source and category ordering remain unchanged.
Links such as `[[:Category:EoZ]]`, comments, literal examples, template arguments
and `includeonly` text do not prove the edited page belongs to the category.
Unbalanced template/link/comment/literal/transclusion scopes require manual
review instead of appending into an uncertain scope. See MediaWiki's official
[category](https://www.mediawiki.org/wiki/Help:Categories) and
[partial transclusion](https://www.mediawiki.org/wiki/Transclusion#Partial_transclusion_markup)
documentation for the wiki mechanics.

Contribution plans include the footer before their source hashes and review
digest are computed. A saved untagged draft needs a fresh Preview; publishing
never silently changes already reviewed text. Automatic source validation
allows only its original supported fact change plus this fixed tracking footer.
Previously confirmed partial writes keep their truthful receipts.

Character membership is outside all managed Character-sheet marker blocks, so
same-character replacement, other characters, manual image parameters and
unrelated User prose keep their existing contracts. A changed tracking policy
is part of the share-attempt identity; an old uncertain untagged attempt cannot
trap a newly reviewed share in a stale retry.

There is no background tagging job or retrospective bulk edit. A related page
with no new fact is not edited merely to add a category. Reusing an existing
image makes no extra File-page edit; a new upload includes the tag in its own
description. Observation batches update their existing data API, not wiki page
source. Authentication, explicit review, revision conflicts, image ownership and
uncertain-write reconciliation remain required.
