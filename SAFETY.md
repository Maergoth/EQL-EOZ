# Safety boundary

EQLWiki - Eye of Zomm is intentionally designed around a narrow, auditable boundary.

## It may read

- the EverQuest text log explicitly selected by the user;
- newer rotated text logs from the same selected character/server log family;
- local EverQuest zone/archive files after the user explicitly selects the EverQuest folder in the embedded Zone Viewer;
- Eye of Zomm's own preferences/cache files;
- the public GitHub `dataset` branch manifest and compressed EQLWiki dataset.

## It does not

- open or inspect the EverQuest process;
- read process memory;
- inject a DLL or code;
- install a game hook;
- synthesize keyboard/mouse input;
- send `/location` or any other game command;
- write to, patch, replace, or modify EverQuest files;
- upload EverQuest archives or logs;
- poll MediaWiki APIs during play;
- perform screen capture or screen-reading in the current product.

The desktop service binds only to `127.0.0.1`. Renderer polling therefore stays on the user's own PC.

The embedded Zone Viewer receives read access through the user-selected directory/file input. Its parsed/cached data is maintained by the viewer/browser runtime and is never written back into the EverQuest installation.

Remote structured knowledge arrives from GitHub as a static gzip data pack originally generated on EQLWiki. The app verifies the published SHA-256 before replacing the previous local pack.
