# Raid instance data and wiki presence audit

Checked October 21, 2026 against the owner-prepared local MediaWiki database, using read-only page/category/revision lookups. This audit does not establish current production content or deploy the producer.

## Source evidence

The local snapshot contains `= Raid Instance =` sections on these zone articles:

| Article | Reviewed revision |
| --- | ---: |
| [Kedge Keep](https://eqlwiki.com/Kedge_Keep#Raid_Instance) | 178873 |
| [Nagafen's Lair](https://eqlwiki.com/Nagafen%27s_Lair#Raid_Instance) | 179111 |
| [Permafrost](https://eqlwiki.com/Permafrost#Raid_Instance) | 168831 |
| [Plane of Fear](https://eqlwiki.com/Plane_of_Fear#Raid_Instance) | 174287 |
| [Plane of Hate](https://eqlwiki.com/Plane_of_Hate#Raid_Instance) | 174286 |
| [The Hole](https://eqlwiki.com/The_Hole#Raid_Instance) | 175178 |

These names are evidence, not an implementation allowlist. The exporter discovers zone pages through `Category:Zones`, using the existing catalog for canonical names and aliases. A newly categorized zone with a Raid Instance section is registered without adding a hardcoded raid zone. NPC and item articles are also inspected by section. No NPC/item article in this snapshot used that literal heading; synthetic fixtures verify those future layouts.

Raid membership comes from monster/boss table fields and raid-target tables inside the active section. Entrance instructions, unrelated prose links, and later sibling sections do not establish membership. An explicit `Raid Instance Only` annotation, a raid-only respawn field, or `Raid Encounters` category can establish exclusivity. Explicit per-template normal/raid sections take precedence over page-level category evidence.

Observed examples:

- King Tranix has no raid category, but the zone explicitly marks him Raid Instance Only: one raid NPC record and a raid source for Crown of King Tranix.
- Fire Giant Warrior appears in both public and raid content: separate normal and raid records, with separate source variants for shared loot.
- The entrance Voidling remains normal; a link in entrance prose does not turn it into raid trash.
- Robe of the Kedge retains its Phinigel raid source and its normal Kithicor Forest sources.

## Additive schema 3 fields

NPC records and individual `items[].dropSources[]` carry:

- `raidInstance`: boolean; absent in older packs means normal/unknown legacy data.
- `instanceType`: `normal` or `raid`.
- `instanceSources`: public article title, reviewed revision, section, and optional evidence reason when known.

Identity and deduplication include canonical zone, NPC name, and instance variant. An item itself is not marked wholly raid because one of its sources is raid. Same-name Itempage templates can contribute section-specific sources while the first template remains the canonical item stat record; a differently named comparison item is excluded. Source limits apply independently to normal and raid groups.

Cloning a shared NPC does not establish a raid spawn coordinate. Derived raid copies omit the public `loc`; an explicit raid-template location remains available. Levels and class metadata still come from the NPC article and are not asserted to match every game difficulty. Wiki spelling/redirect coverage can leave unmatched references; the exporter does not guess NPC identities from nearby prose.

## Presence catalog

`wikiEntities` contains sorted `npcs`, `items`, and `titles` arrays. NPC/item category candidates are indexed before record validation; recognized template name aliases are added even when an item lacks a usable stats block. `titles` includes only main-namespace public page titles, including redirect aliases, as a fallback for uncategorized pages. No account data, private namespaces, page contents, or revision history enter this presence-only index.

`meta.wikiEntitiesComplete` is true only for a full export with `--limit=0`. Clients must suppress missing-page prompts for older/incomplete packs. A missing stat record or absence from the current intel panel is not evidence that a wiki page is missing.

## Validation and release path

Source-only checks:

```powershell
php -l server/BuildEyeOfZommPack.php
node tests/wiki-raid-instances.mjs
node tests/wiki-zone-aliases.mjs
node tests/wiki-class-filter.mjs
node scripts/check-exporter.mjs
```

The private read-only audit built 8,669 NPC records from 7,964 NPC pages, including 117 raid records and 62 explicit zone raid memberships. Compared with the old producer, 24 shared NPC variants were added. It built 11,244 item records from 11,245 item candidates; the skipped item still entered the presence index. Presence arrays contained 8,152 normalized NPC names, 11,233 item names, and 26,301 public titles. Case-insensitive deduplication can make name counts smaller than page counts. These are local-snapshot observations, not expected production totals.

Active producer source is the wiki repository's `maintenance/BuildEyeOfZommPack.php`; this repository retains the matching `server/` copy. Production loads `/home/eqlwikdq/public_html/maintenance/BuildEyeOfZommPack.php`. The existing host job `/home/eqlwikdq/bin/eoz-pack-refresh.sh` separately builds and publishes the filtered dataset to the EoZ dataset branch, as documented in the wiki's `PROJECT.md` scheduled-jobs section. It does not run when desktop source is merged.

Promote only the reviewed producer commit through wiki staging and a separate main promotion. After deployment, preserve the previous filtered manifest/gzip recovery pair, rebuild using the installed producer, verify variant/provenance/presence fields and manifest hash, then fetch the verified pack for the desktop bootstrap. Keep private audit scripts, database snapshots, generated packs, and host logs out of Git. No wiki article edits, SQL migration, icon changes, or host-script installation are required by this producer update.
