# Character screenshots

The Character Share review offers an optional picture above the interactive
equipment preview. Select a PNG, JPEG or ordinary uncompressed 24/32-bit BMP, or
paste an image. Replace it, inspect the entire image, or **Remove selected image**.
Removing the selection is local: it does not delete a public wiki image.

Selection works with **Screen Reading off** and never starts OCR or captures a
screen. The app shows a contained local preview and a larger view without
cropping. Copy PNG and Save PNG remain independent exports of the equipment and
statistics snapshot, and can be followed by Share in the same review.

Only **Share on my User page** publishes the selected picture. The review shows
the exact public File name and explains collisions before confirmation. Review
chat and other private information anywhere in the image before sharing. A
changed wiki account requires a fresh filename review and another Share click.
Skipping the image preserves the current wiki picture or its **Add an image**
placeholder; an image can be added on the wiki later.

## Compatibility and filenames

The existing schema-1 Character sheet gains the optional `screenshotFile`
identity, serialized as the bare `screenshot` filename. It contains no image
bytes, paths, attachment IDs or local source information. The wiki must expose
`EQL_CHARACTER_SCREENSHOT_V1` and a parsed `.eql-character-screenshot-v1` before
the app uploads a picture. Ordinary equipment-only sharing still works without
this image capability.

The default filename is `Character <User page PAGENAME> - <name> (<server>).png`.
The full User-page name, including subpages, is used. The app resolves the File
title through MediaWiki and accepts its canonical spelling. This matches the
template default, so an image uploaded there later survives older app reshares.
A valid custom image parameter in the exact managed Character block is retained
by current equipment-only shares. Older app releases can remove an unfamiliar
custom parameter when replacing that block; update the app to retain custom
overrides. No server write interceptor or hidden retention database is used.

Image identities are local raster File titles under 240 UTF-8 bytes, without URL,
path-prefix, control, template or link syntax. Invalid or excessively long
optional filenames block the image action with a recoverable message, while a
no-image share remains available.

## Private storage and retries

Selected images live in `character-screenshots/` beneath the app's private data
directory, with opaque filenames and a small atomic journal. The journal stores
only an attachment ID, digest, dimensions and byte count keyed to normalized
character name/server. It does not change Character/inventory storage, local
browser storage or the public sheet DTO. At most 20 selections / 96 MiB are
retained; a replacement commits its new journal before retiring the old image.
Source files are read only. Corrupt/missing private images are reported rather
than silently published or replaced.

Input is bounded to 48 MiB, 8,192 pixels per side and 15 megapixels. Headers are
checked before pixel allocation. BMP palette/compression/bitfield formats are
rejected explicitly. PNG/JPEG/native BMP pixels are re-encoded as a PNG under
12 MiB; original metadata and filenames are not uploaded. No image is resized
or cropped for the public upload. Only local preview thumbnails are resized.

The authenticated native wiki client binds each upload review to the exact
character, account, attachment digest and canonical target. It never overwrites
an existing file. An occupied default uses a reviewed digest suffix. Existing
files are reusable only when the SHA1 and uploader match; the saved target is
retained across reopen/restart even if the unrelated default file changes.
Upload and User-page edit states are saved before writes. An uncertain upload
is reconciled by reading its exact File identity; an uploaded picture with a
failed page update retries the page without uploading another copy. Concurrent
human page edits retain the existing revision-conflict protection. Other
characters, user prose and old talk-page content stay outside the managed edit.

## Validation

`tests/character-screenshot.mjs` is imported by the existing wiki-attachments
suite. It covers literal-safe File identities, custom-field preservation,
bounded headers/BMP pixels, private restart/quota/corruption and mounted
optional/account/stale-profile behavior. `tests/wiki-client.mjs` exercises a
local HTTP wiki, including collision-path uncertain upload and page-failure
restart, canonical titles, capability denial and no-image sharing.

`npm run test:character-screenshot` uses a disposable sandboxed Chromium window,
production preload/WikiHost and real native image decoding against a synthetic
loopback wiki. It checks Screen Reading off/no OCR, local PNG completion followed
by sharing, BMP/JPEG normalization, explicit upload, native journal reopen and
idempotent reshare. It neither contacts the public wiki nor reads installed
profiles. This fixture does not establish live authentication or a live upload.
