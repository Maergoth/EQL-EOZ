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
npm install
npm test
```

For changes to log parsing, include representative sanitized log lines and tests. For data-export changes, keep the exporter server-local and low-priority rather than adding client-side page/API fan-out.
