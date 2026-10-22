'use strict';

// Native Wayland deliberately withholds global positioning and always-on-top.
// Prefer X11/XWayland for independently placed overlays when it is available;
// preserve an explicit Ozone backend choice, and never disable the sandbox.
function configureLinuxRuntime(app, { platform = process.platform, env = process.env } = {}) {
    if (platform !== 'linux') return;
    app.setDesktopName?.('com.eqlwiki.eyeofzomm.desktop');
    if (env.DISPLAY && app.commandLine && !app.commandLine.hasSwitch('ozone-platform') && !app.commandLine.hasSwitch('ozone-platform-hint')) {
        app.commandLine.appendSwitch('ozone-platform', 'x11');
    }
}

module.exports = { configureLinuxRuntime };
