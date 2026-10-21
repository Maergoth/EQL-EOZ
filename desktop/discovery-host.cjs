'use strict';
const CHANNEL = 'eye-of-zomm:discovery';

// Pending catalog suggestions and user-requested clipboard capture only.
// Inline notices are rendered by the main app/native Timers panel; this host
// never constructs, opens or focuses a BrowserWindow.
class DiscoveryHost {
    constructor({ electron, origin, getMainWindow, isTimerPanel = () => false }) {
        this.electron = electron; this.origin = origin; this.getMainWindow = getMainWindow; this.isTimerPanel = isTimerPanel;
        this.queue = []; this.disposed = false; this.capturing = false; this.captureId = null; this.captureGeneration = 0;
        electron.ipcMain.handle(CHANNEL, (event, action, value) => this.handle(event, action, value));
    }
    isMain(event) {
        const main = this.getMainWindow();
        return Boolean(main && !main.isDestroyed() && event.sender === main.webContents &&
            event.senderFrame === main.webContents.mainFrame && event.senderFrame?.url === `${this.origin}/`);
    }
    allowed(event) {
        if (this.isMain(event)) return true;
        try { return this.isTimerPanel(event) === true; } catch { return false; }
    }
    state() { return this.queue.map(item => ({ ...item })); }
    async handle(event, action, value) {
        if (this.disposed) throw new Error('Wiki discovery has closed.');
        if (action === 'show') {
            if (!this.isMain(event)) throw new Error('Wiki discovery registration is unavailable.');
            if (!value || !['item', 'monster'].includes(value.kind) || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 512 ||
                typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240) throw new Error('Invalid wiki discovery.');
            if (this.queue.some(item => item.id === value.id)) return { ok:true, queued:true };
            if (this.queue.length >= 20) return { ok:false, queued:false, error:'The wiki suggestion list is full.' };
            this.queue.push({ id:value.id, kind:value.kind, name:value.name, zone:String(value.zone || '').slice(0, 240) });
            return { ok:true, queued:true };
        }
        if (!this.allowed(event)) throw new Error('Wiki discovery action is unavailable.');
        if (action === 'get-state') return this.state();
        const item = this.queue.find(item => item.id === value?.id);
        if (!item) throw new Error('This suggestion has already been dismissed.');
        if (action === 'ignore' || action === 'dismiss') {
            if (this.captureId === item.id) throw new Error('Please wait for the screenshot.');
            this.queue = this.queue.filter(entry => entry.id !== item.id);
            const main = this.getMainWindow();
            if (main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:discovery-action', { action, id:item.id });
            return this.state();
        }
        if (action === 'capture') return this.capture(value);
        throw new Error('Unknown wiki discovery action.');
    }
    async capture(value) {
        if (this.disposed || !this.queue.some(item => item.id === value?.id)) throw new Error('This suggestion has already been dismissed.');
        if (this.capturing) throw new Error('A screenshot is already in progress.');
        this.capturing = true; this.captureId = value.id;
        const generation = ++this.captureGeneration;
        try {
            const displays = this.electron.screen.getAllDisplays();
            const width = Math.min(8192, Math.max(1, ...displays.map(display => Math.ceil(display.size.width * display.scaleFactor))));
            const height = Math.min(8192, Math.max(1, ...displays.map(display => Math.ceil(display.size.height * display.scaleFactor))));
            // Reached only through an explicit Screenshot action from the exact
            // main frame or native Timers frame validated by OverlayHost.
            const sources = await this.electron.desktopCapturer.getSources({ types:['window', 'screen'], thumbnailSize:{ width, height }, fetchWindowIcons:false });
            if (this.disposed || generation !== this.captureGeneration) throw new Error('The screenshot was cancelled.');
            const choices = sources.filter(source => !/^Eye of Zomm|^EQLWiki - Eye of Zomm/i.test(source.name));
            const games = choices.filter(source => /everquest/i.test(source.name));
            if (value.sourceId !== undefined && (typeof value.sourceId !== 'string' || !choices.some(source => source.id === value.sourceId))) throw new Error('Choose a currently available window or display.');
            const source = value.sourceId !== undefined ? choices.find(source => source.id === value.sourceId) : games.length === 1 ? games[0] : null;
            if (!source) return { choices:choices.map(source => ({ id:source.id, name:source.name.slice(0, 160) })) };
            const usableThumbnail = candidate => candidate.thumbnail && typeof candidate.thumbnail.isEmpty === 'function' && !candidate.thumbnail.isEmpty();
            if (!usableThumbnail(source)) {
                // A minimized/exclusive-fullscreen game can have no thumbnail.
                // Offer usable alternatives without silently copying a display.
                if (value.sourceId === undefined) {
                    const alternatives = choices.filter(candidate => candidate !== source && usableThumbnail(candidate));
                    if (alternatives.length) return { choices:alternatives.map(candidate => ({ id:candidate.id, name:candidate.name.slice(0, 160) })) };
                }
                throw new Error('That window could not be captured. Try a display or run EverQuest in windowed mode.');
            }
            this.electron.clipboard.writeImage(source.thumbnail);
            return { captured:true, message:'Paste your clipboard into discord!' };
        } finally { if (this.captureGeneration === generation) { this.capturing = false; this.captureId = null; } }
    }
    dispose() {
        this.disposed = true; this.clear(); this.electron.ipcMain.removeHandler(CHANNEL);
    }
    clear() { this.captureGeneration++; this.queue = []; this.capturing = false; this.captureId = null; }
}
module.exports = { DiscoveryHost };
