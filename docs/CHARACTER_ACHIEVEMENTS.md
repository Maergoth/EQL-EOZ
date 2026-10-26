# Character achievement exports

Character asks for both `/outputfile inventory` and `/outputfile achievements`,
then offers one **Import files** button. The main-process hosts read the current
matching `Name_server-Inventory.txt` and `Name_server-Achievements.txt` from the
configured EverQuest directory. If either is missing, its native chooser opens.
The app does not type commands or monitor the directory in the background.

## Data and ownership

The format has plain category headings, C/I plus one tab before achievement
names, and C/I plus two tabs before objectives. An objective may have a final
tab and an integer `current/required` counter. C means complete; I means
incomplete. Parent completion comes from its own marker because optional
objectives can remain incomplete. Identical names in different categories
remain separate. The format has no character identity or end-of-file sentinel.
Import ownership comes from the selected character and host filename lookup,
or the user's explicit file selection.

`app/achievement-export.js` parses and strictly normalizes a bounded hierarchy.
The protected main-process hosts share decoding, regular-file checks,
stable-read verification, size limits and main-frame ownership checks.
`app/character-export-import.js` reads both files under one selected-character
guard and returns no partial successful result. `applyCharacterExports()` in
`app/character-model.js` validates both and commits one draft. Cancellation,
malformed data, quota failures and profile changes retain the saved character.

`snapshot.achievements` holds the normalized hierarchy. The separate private
`achievementExport` record holds file provenance and import time. Both persist
in the existing per-character roster. Importing gear again or **Clear inventory**
retains achievements. Character totals still use only the reviewed equipped,
unbuffed game stat reading.

## Shared character sheets

The optional schema-1 `sheet.achievements` field contains category names,
completion flags, objective text and counters. It excludes file paths, file
hashes, timestamps and unrelated private inventory. App review shows the same
hierarchy as a read-only disclosure below equipment and stats.

The serializer writes escaped literal text into generated fixed HTML in
`Character_sheet`'s optional `achievements` parameter. The wiki template puts
it below the equipment/stat layout; the skin adds independent accessible
disclosures for the section and categories. Legacy sheets without this
parameter remain unchanged. Sharing again replaces only the existing managed
Character (Server) block and preserves other characters.

Achievement shares require the main template's
`EQL_CHARACTER_ACHIEVEMENTS_V1` marker and a successful unsaved parse probe.
Deploying Git source does not publish that database template. See the wiki
repository's character-sheet guide and guarded synchronization procedure.
Public DTOs, generated template source and target User pages have separate
bounded size limits; oversized results fail without partial truncation.

## Verification

Use synthetic files and profiles for parser, combined-read, model, storage,
workspace, serializer and wiki DOM checks. A private real export may be replayed
read-only without copying its content to fixtures, screenshots, PRs or logs.
Source checks do not establish live-game or production-auth acceptance.
