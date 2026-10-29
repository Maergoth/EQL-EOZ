# Contributing

EQLWiki - Eye of Zomm is intentionally conservative about its game integration boundary.

Contributions are welcome for UI/UX, log parsing, wiki-data extraction, map navigation, performance, tests, and documentation. Changes must not:

- hook or inject into the EverQuest client;
- inspect game process memory;
- write or patch game files;
- synthesize gameplay input or commands;
- turn normal app use into repeated MediaWiki API polling.

Before opening a pull request:

```bash
npm ci
npm test
```

For changes to log parsing, include representative sanitized log lines and tests. For data-export changes, keep the exporter server-local and low-priority rather than adding client-side page/API fan-out.

Start with [DEVELOPMENT.md](DEVELOPMENT.md) for the current technical component
index, ownership boundaries, implementation style and verification guidance.
Use its focused component links when changing capture, contributions, Character,
maps or native services; older execution plans retain historical evidence.
Preserve capture ownership, default-off Screen Reading permission, bounded private
journals, offline OCR and guarded wiki writes. Use synthetic fixtures and isolated
profiles; never commit player logs/screenshots, account data or game archives.
Record live-game, production-authentication and compositor acceptance separately
from fixture tests.
