# EQLWiki server-side dataset sync

These files build the **EQLWiki - Eye of Zomm** dataset directly from the production MediaWiki installation and mirror it to the public GitHub repository.

No player/client requests are involved in this process, and the exporter itself makes **zero HTTP/API requests** back into EQLWiki.

## Files

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

Run the same command manually after major wiki changes whenever you want an immediate dataset update.

## What the clients hit

Desktop clients check GitHub, not EQLWiki:

```text
https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json
https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/eqlwiki-eye-of-zomm-data.json.gz
```

The manifest is checked once on each application startup and when the user presses **Sync with Wiki**. The gzip is downloaded only when the manifest version changes.
