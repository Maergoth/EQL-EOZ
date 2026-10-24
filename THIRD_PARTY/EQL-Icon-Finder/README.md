# EQL Wiki Icon Finder provenance

Eye of Zomm reuses the EQL Wiki Icon Finder algorithm 6 functions at the repository owner’s explicit request.

- Source repository: https://github.com/Maergoth/EQLWiki
- Pinned source commit: 27d52901a3a3913acfe0e13abe0b2e5306c0576e
- Source file: extensions/EQL-Editor-Tools-Icon-Finder/MediaWiki_IconFinder.js
- Retained functions: drawScaled, luminance, computeDHash, computeColorGrid, fingerprintDrawable, popcount32, fingerprintDistance.
- The original EQL Wiki source attribution and algorithm bodies are preserved in app/icon-fingerprint.js. No remote JavaScript is downloaded or executed.
- The custom source file does not declare a separate per-file license. This notice records provenance and owner authorization; it does not invent or relicense the source. The wiki repository also contains its upstream MediaWiki licensing notices.

Only the user-selected icon crop is fingerprinted locally. Matching uses the wiki’s published immutable algorithm-6 icon index. Existing icon filenames, numeric IDs and exact-artwork aliases are preserved; thumbnails do not overwrite wiki artwork.
