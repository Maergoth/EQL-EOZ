# Safety boundary

EQLWiki - Eye of Zomm is intentionally designed around a narrow, auditable boundary.

## It may read

- `eqlog_*.txt` files under the EverQuest folder explicitly selected by the user;
- the most recently modified log automatically, or a specific log explicitly chosen in Settings;
- local EverQuest zone/archive/map files under that selected folder;
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

The embedded Zone Viewer receives bounded, read-only access to supported zone/map files under the selected folder. Its parsed/cached data is maintained by the viewer runtime and is never written back into the EverQuest installation.

Remote structured knowledge arrives from GitHub as a static gzip data pack originally generated on EQLWiki. The app verifies the published SHA-256 before replacing the previous local pack.
