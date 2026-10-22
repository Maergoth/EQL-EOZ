# Safety boundary

EQLWiki - Eye of Zomm is intentionally designed around a narrow, auditable boundary.

## It may read

- `eqlog_*.txt` files under the EverQuest folder explicitly selected by the user;
- the most recently modified log automatically, or a specific log explicitly chosen in Settings;
- local EverQuest zone/archive/map files under that selected folder;
- Eye of Zomm's own preferences/cache files;
- the public GitHub `dataset` branch manifest and compressed EQLWiki dataset.
- release metadata and the exact matching Windows/Linux package from the public Eye of Zomm GitHub repository, when checking/downloading an app update.
- a window or display image only after the player clicks Screenshot on a wiki-discovery notice; the image goes to the local clipboard.

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
- read the screen for tracking, parsing, timers or NPC identification.

The desktop service binds only to `127.0.0.1`. Renderer polling therefore stays on the user's own PC.

The native Map's archive bridge admits client maps, supported archives and only
the root text sidecars required by the decoder (`mp3index.txt`, `*_assets.txt`).
It excludes arbitrary root text, logs, settings and mutation endpoints. An
asset-list reference does not grant permission to read another file type.

Native overlays are separate transparent app windows, never injected into the
game. One main renderer owns log parsing and timers; sandboxed panels receive
bounded local snapshots without raw lines, paths or installer access. The host
persists layout preferences only. Local timer preferences/deadlines/replay guards
are stored in EoZ's profile, and the checked recovery shortcut affects only EoZ
windows. Log-driven features never use screen reading, game input or process hooks.
Wiki-discovery screenshots are optional, explicit captures. EoZ selects the sole
EverQuest window when identifiable; otherwise the player chooses a window or
display. It copies the image locally without saving or uploading it. Pasting
into Discord is a separate player action. Screenshot IPC accepts only the main
app or the authenticated native Timers panel and a current discovery ID.

The embedded Zone Viewer receives bounded, read-only access to supported zone/map files under the selected folder. Its parsed/cached data is maintained by the viewer runtime and is never written back into the EverQuest installation.

The native Map can lazily embed that viewer for Top/First modes. Its isolated
session permits only packaged viewer resources and bounded read-only zone/map
files, denying log/configuration endpoints and mutations. This camera preview
does not set the logged player position or send game input. Other panels keep
their no-frame/no-file bridge. Hiding Map or returning to its line map releases
the extra scene.

Remote structured knowledge arrives from GitHub as a static gzip data pack originally generated on EQLWiki. The app verifies the published SHA-256 before replacing the previous local pack.

Application updates use a separate bounded release check and SHA-256-verified
installer staged only in Eye of Zomm's own user-data directory. Automatic
downloads are opt-in. The explicit **Restart to install update** action
revalidates the staged package, hands it to NSIS in silent upgrade mode and
closes EoZ only after Windows accepts the launch. NSIS relaunches the installed
app afterward. Checking, downloading, closing and starting EoZ alone never
install an update. Windows security/elevation prompts remain under OS control.
The installer upgrades Eye of Zomm, preserving the existing profile and game files.

Linux uses the same bounded metadata, package-size and checksum verification.
Its explicit action opens only the verified package's download directory and
explains the manual AppImage/deb installation steps. It does not execute a
package manager, run NSIS, request root privileges or quit the app automatically.
The user's chosen native game/client directory remains read only.

Font preferences select packaged allowlisted system-font stacks and a bounded
base size. They are local presentation settings and do not fetch web fonts or
change game files.
