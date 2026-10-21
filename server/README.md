# EQLWiki server-side dataset sync

These files build the **EQLWiki - Eye of Zomm** dataset directly from the production MediaWiki installation and mirror it to the public GitHub repository.

No player/client requests are involved in this process, and the exporter itself makes **zero HTTP/API requests** back into EQLWiki.

## Files

EQLWiki's deployed producer lives in its application repository at
`maintenance/BuildEyeOfZommPack.php` and `maintenance/zone-catalog.json`.
The files here mirror that contract. Review matching producer changes in both
repositories; merging an EoZ PR alone does not install a wiki exporter or
publish a new dataset. EQLWiki contribution PRs target `staging`, and promotion
of those reviewed commits to production is a separate owner action.

Copy to MediaWiki `maintenance/`:

- `BuildEyeOfZommPack.php`
- `zone-catalog.json`

Copy to `$HOME/bin/` and make executable:

- `eoz-pack-refresh.sh`
- `eoz-publish-dataset.sh`
- `eoz-sync-github.sh`

## Initial local data pull

From the wiki account:

```bash
bash "$HOME/bin/eoz-pack-refresh.sh" --local-only
```

This builds the full dataset at low priority and **does not modify GitHub**.

It produces:

```text
$HOME/private-cache/mediawiki/eoz-dataset/manifest.json
$HOME/private-cache/mediawiki/eoz-dataset/eqlwiki-eye-of-zomm-data.json.gz
```

Those are the only two generated files needed by the desktop app. If you want to inspect or transfer the initial dataset manually, download those two files. There is no need to download `public_html`, `LocalSettings.php`, database credentials, uploads, or the entire hosting account.

## One-time GitHub deploy-key setup

The automated sync uses a repository-scoped SSH deploy key so the server does not need a personal GitHub token.

Generate the key on cPanel:

```bash
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keygen -t ed25519 \
  -f "$HOME/.ssh/eql_eoz_dataset" \
  -C "eqlwiki-eye-of-zomm-dataset" \
  -N ''
chmod 600 "$HOME/.ssh/eql_eoz_dataset"
cat "$HOME/.ssh/eql_eoz_dataset.pub"
```

In GitHub, open `Maergoth/EQL-EOZ` → **Settings → Deploy keys → Add deploy key**. Paste the public key and enable **Allow write access**.

The private key never leaves cPanel.

Make sure GitHub's host key is present in the account's `known_hosts` using your hosting provider's normal SSH/GitHub setup procedure.

## Manual production sync

Once the deploy key is configured:

```bash
bash "$HOME/bin/eoz-pack-refresh.sh"
```

That performs a complete rebuild, validates it, compresses it, and force-replaces the dedicated GitHub `dataset` branch with one new commit containing only:

```text
manifest.json
eqlwiki-eye-of-zomm-data.json.gz
```

The force push is intentional and limited to the `dataset` branch. Keeping the branch at one commit prevents weekly binary snapshots from bloating repository history.

## Weekly cron

Recommended example: Monday at 4:17 AM server time.

```cron
17 4 * * 1 /bin/bash /home/eqlwikdq/bin/eoz-pack-refresh.sh >> /home/eqlwikdq/private-cache/mediawiki/eoz-pack-refresh.log 2>&1
```

Adjust the account path if needed.

The refresh wrapper uses:

- `flock` so two runs cannot overlap;
- `nice -n 19`;
- `ionice -c 3`;
- a default 25 ms cooperative pause after each content page;
- JSON validation before publication;
- SHA-256 in the manifest.

The schema-v3 exporter also reads each unique `File:Item_<lucy_img_ID>.png` from MediaWiki's local file repository and embeds it once in the compressed pack. It accepts two- or three-coordinate NPC locations and keeps the first complete tuple when a page lists multiple spawns. It does not fetch icon URLs over HTTP. Clients therefore receive Itembox icons through the same GitHub dataset mirror as the rest of the wiki data.

Schema v3 changes only the exported JSON pack. It does not require SQL, a MediaWiki database migration, or table changes.

Item `classes` contains allowed playable class codes, `ALL` for unrestricted
equipment, or `NONE` when no class can equip the item. An empty array means
missing/unknown class metadata. `ALL except ...` expands to the complement of
the 16 playable classes; never export `ALL` alongside excluded classes.

Run the same command manually after major wiki changes whenever you want an immediate dataset update.

### Applying the 0.8.1 producer corrections

The [integration audit](../docs/INTEGRATION_AUDIT.md) records missing exact zone
aliases and `Class: ALL except ...` parsing errors. After review, promote the
matching EQLWiki producer/catalog commits through its normal release process,
then run the existing refresh command once. Check the new manifest version,
gzip checksum, affected zone NPC coverage, and class-excluded items. The EoZ
client also understands exclusions in legacy packs while that rebuild is pending.

Recognized explicit NPC template zones take precedence and retain every listed
zone. Categories and article-title suffixes are fallbacks; newly recognized
categories must not override a field or remove a second spawn zone.

Drop-source names use wiki-link destinations rather than display labels or
revamp notes. The producer unwraps `VeliousGray` presentation, removes `Era`
and `Loc` annotations, and recognizes styled zone headings before assigning
the following NPCs. Real nested NPC links remain sources; coordinate-only
bullets, file links, and unresolved templates do not become monsters. These
repairs take effect after the matching wiki producer is deployed and its
dataset is rebuilt/published; no wiki article or database edit is required.

The October 21, 2026 owner-approved rollout completed staging and production
deployment via EQLWiki PRs #35/#36 and the explicit-zone precedence follow-up
#37/#38, then rebuilt and published final manifest
`20261021T062421Z-830bd5a89bfa`: 124 zones, 8,645 NPC records, 11,262 items.
The [integration audit](../docs/INTEGRATION_AUDIT.md#approved-production-rollout)
records the verified checksum, recovered coverage, and initial-download checks.

Keep the old verified manifest/pack as a private recovery pair before rebuilding.
To recover from incorrect exported data, restore the reviewed producer/catalog
and rebuild a new dataset version; clients skip an unchanged manifest version.
Never substitute a database dump or game-file archive for the filtered pack.

## What the clients hit

Desktop clients check GitHub, not EQLWiki:

```text
https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json
https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/eqlwiki-eye-of-zomm-data.json.gz
```

The manifest is checked once on each application startup and when the user presses **Sync with Wiki**. The gzip is downloaded only when the manifest version changes.
