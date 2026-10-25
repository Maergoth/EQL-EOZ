# Desktop icons for 1.0

The native application icon uses the same eye artwork as the header and favicon,
from `app/assets/eye-of-zomm.svg`. The compact gold system-tray eye remains intact.

- `build/icon.ico` contains transparent 16, 20, 24, 32, 40, 48, 64, 128 and 256px
  images. Electron Builder uses it for the Windows executable, NSIS installer,
  uninstaller, desktop shortcut and Start menu shortcut.
- `build/icon.png` is a transparent 512px image used for the Linux desktop entry,
  AppImage and Debian package.
- `app/assets/eye-of-zomm.png` is the identical PNG bundled inside the app. Main
  and wiki-login windows explicitly use it so development/Linux windows do not
  inherit the Electron icon. Packaged image checks require those exact bytes.

Run `npm run generate:icons` after editing the vector, inspect the exported PNG
and the small ICO sizes on light and dark backgrounds, then run
`npm run check:icons`. Generation uses the project's pinned Electron/Chromium in
a hidden window, without network access or an installed user profile.
`build/app-icons.json` records the reviewed source and output hashes. Icon
generation is an explicit artwork step; ordinary builds consume the reviewed
assets without regenerating them on a different platform.

For 1.0 acceptance, check both a fresh Windows installation and an upgrade:
desktop and Start menu shortcuts, executable, taskbar/title bar and installer
should show the eye. Check the Linux launcher and application switcher too.
Existing Windows shell icon caches can retain an old rendering briefly; do not
change application IDs, install paths or updater identity to force a refresh.

This change prepares the assets for 1.0. It does not change the package version,
publish a release, replace an existing user's shortcuts, or alter tray recovery.
