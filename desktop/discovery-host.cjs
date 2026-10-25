'use strict';
const path = require('node:path');
const CHANNEL = 'eye-of-zomm:discovery';
const SPAWN_CHANNEL = 'eye-of-zomm:spawn-prompt';
const itemIdentity = value => String(value || '').normalize('NFKC').replace(/_/g,' ').replace(/[\u2018\u2019`]/g,"'").replace(/\s*\+(?:10|[0-9])\s*$/,'').replace(/\s*\(Exaltation\)\s*$/i,'').replace(/\s*\+(?:10|[0-9])\s*$/,'').replace(/\s+/g,' ').trim().toLowerCase();

// Pending catalog suggestions and user-requested clipboard capture only.
// Inline notices are rendered by the main app/native Timers panel; this host
// ordinary suggestions stay inline. Only an armed spawn request gets a small
// non-activating native surface; it never captures pixels or sends game input.
class DiscoveryHost {
    constructor({ electron, origin, getMainWindow, isTimerPanel = () => false, showMain = null }) {
        this.electron = electron; this.origin = origin; this.getMainWindow = getMainWindow; this.isTimerPanel = isTimerPanel;
        this.showMain = showMain; this.spawnWindow = null; this.spawnReady = null; this.spawnGeneration = 0;
        this.queue = []; this.disposed = false; this.capturing = false; this.captureId = null; this.captureGeneration = 0; this.contributionSequence = 0;
        electron.ipcMain.handle(CHANNEL, (event, action, value) => this.handle(event, action, value));
        electron.ipcMain.handle(SPAWN_CHANNEL, (event, action, value) => this.handleSpawn(event, action, value));
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
    spawnState() { return this.queue.filter(item => item.purpose === 'spawn-location').map(item => ({ ...item })); }
    isSpawn(event) {
        const window = this.spawnWindow;
        return Boolean(window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === `${this.origin}/spawn-prompt.html`);
    }
    contributionDetails(item) {
        return {id:item.id,purpose:item.purpose,name:item.name,...(item.candidateId?{candidateId:item.candidateId}:{}),...(item.captureRequest?{captureRequest:item.captureRequest,captureState:item.captureState}:{}),...(item.captureMessage?{captureMessage:item.captureMessage}:{})};
    }
    startContribution(item) {
        const main = this.getMainWindow();
        if (!main || main.isDestroyed()) throw new Error('Open the main app and try again.');
        item.captureRequest = `capture-${++this.contributionSequence}`; item.captureState = 'waiting'; delete item.captureMessage;
        if (this.showMain) this.showMain();
        else {if(main.isMinimized?.())main.restore?.();main.show?.();main.focus?.();}
        const details = this.contributionDetails(item);
        main.webContents.send('eye-of-zomm:discovery-action',{action:'contribute',...details});
        if (item.purpose === 'spawn-location') this.publishSpawn();
        return {pendingCapture:true,...details};
    }
    async handleSpawn(event, action, value) {
        if (this.disposed || !this.isSpawn(event)) throw new Error('The spawn prompt is unavailable.');
        if (action === 'get-state') return this.spawnState();
        if (!['contribute','ignore','dismiss'].includes(action)) throw new Error('Unknown spawn prompt action.');
        const item = this.queue.find(item => item.purpose === 'spawn-location' && item.id === value?.id);
        if (!item) throw new Error('This spawn prompt has expired.');
        if (action === 'contribute') return this.startContribution(item);
        this.queue = this.queue.filter(entry => entry.id !== item.id);
        const main = this.getMainWindow();
        if (main && !main.isDestroyed()) {
            main.webContents.send('eye-of-zomm:discovery-action', {action,...this.contributionDetails(item)});
        }
        this.publishSpawn(); return this.spawnState();
    }
    publishSpawn() {
        const window = this.spawnWindow;
        if (!window || window.isDestroyed()) return;
        window.webContents.send('eye-of-zomm:spawn-state', this.spawnState());
        if (!this.spawnState().length) window.hide();
    }
    async showSpawn() {
        let window = this.spawnWindow;
        if (!window || window.isDestroyed()) {
            const generation = ++this.spawnGeneration;
            window = new this.electron.BrowserWindow({title:'Eye of Zomm · Spawn location',width:380,height:218,show:false,frame:false,transparent:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#101722',autoHideMenuBar:true,
                webPreferences:{preload:path.join(__dirname,'spawn-prompt-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,devTools:false,partition:'eoz-spawn-prompt'}});
            this.spawnWindow = window;
            const session = window.webContents.session;
            session?.setPermissionRequestHandler?.((_contents,_permission,callback)=>callback(false));
            session?.setPermissionCheckHandler?.(()=>false);
            const allowed = new Set(['spawn-prompt.html','spawn-prompt.js','spawn-prompt.css','wiki-discovery-ui.js'].map(file=>`${this.origin}/${file}`));
            session?.webRequest?.onBeforeRequest?.({urls:['<all_urls>']},(details,callback)=>callback({cancel:!allowed.has(details.url)}));
            window.webContents.setWindowOpenHandler?.(()=>({action:'deny'}));
            window.webContents.on('will-navigate',(event,url)=>{if(url!==`${this.origin}/spawn-prompt.html`)event.preventDefault();});
            window.webContents.on('will-redirect',event=>event.preventDefault());
            window.webContents.on('render-process-gone',()=>{if(this.spawnWindow===window){this.spawnWindow=null;window.destroy();}});
            window.on('closed',()=>{if(this.spawnWindow===window)this.spawnWindow=null;});
            const ready=window.loadURL(`${this.origin}/spawn-prompt.html`);this.spawnReady=ready;
            try { await ready; }
            catch (error) { if (this.spawnWindow===window) this.spawnWindow=null; if(!window.isDestroyed())window.destroy(); throw error; }
            if (this.disposed || generation !== this.spawnGeneration || this.spawnWindow !== window || window.isDestroyed()) { if(!window.isDestroyed())window.destroy(); return; }
        }
        if(this.spawnReady)await this.spawnReady;
        if (!this.spawnState().length || this.disposed || this.spawnWindow!==window || window.isDestroyed()) return;
        const screen=this.electron.screen,point=screen.getCursorScreenPoint?.(),display=point&&screen.getDisplayNearestPoint?.(point)||screen.getPrimaryDisplay?.()||screen.getAllDisplays()[0],work=display?.workArea||{x:0,y:0,width:800,height:600};
        const width=Math.max(1,Math.min(380,work.width-24)),height=Math.max(1,Math.min(218,work.height-24));
        window.setBounds({x:Math.round(work.x+work.width-width-12),y:Math.round(work.y+work.height-height-12),width,height});
        window.setAlwaysOnTop?.(true,'pop-up-menu');this.publishSpawn();window.showInactive();
    }
    async handle(event, action, value) {
        if (this.disposed) throw new Error('Wiki discovery has closed.');
        if (action === 'show') {
            if (!this.isMain(event)) throw new Error('Wiki discovery registration is unavailable.');
            if (!value || !['item', 'monster'].includes(value.kind) || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 512 ||
                typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240) throw new Error('Invalid wiki discovery.');
            const spawn = value.purpose === 'spawn-location';
            const itemLink = value.purpose === 'item-link';
            if (itemLink && value.kind !== 'item') throw new Error('Invalid item link request.');
            if (spawn && (value.kind !== 'monster' || typeof value.candidateId !== 'string' && !value.id.startsWith('spawn-') || typeof value.candidateId==='string'&&(!value.candidateId.trim()||value.candidateId.length>240) || !value.candidateId&&!value.id.slice(6).trim())) throw new Error('Invalid spawn location request.');
            if (this.queue.some(item => item.id === value.id)) return { ok:true, queued:true };
            // The newest kill owns the one armed /loc target. Never display an
            // old, inactive prompt after the new one expires.
            if (spawn) this.queue = this.queue.filter(item => item.purpose !== 'spawn-location');
            if (this.queue.length >= 20) return { ok:false, queued:false, error:'The wiki suggestion list is full.' };
            this.queue.push({ id:value.id, kind:value.kind, name:value.name, zone:String(value.zone || '').slice(0, 240),...(typeof value.hint==='string'?{hint:value.hint.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400)}:{}),...(spawn?{purpose:'spawn-location',candidateId:String(value.candidateId||value.id.slice(6)).slice(0,240)}:itemLink?{purpose:'item-link'}:{}) });
            if (spawn) try { await this.showSpawn(); } catch { this.queue=this.queue.filter(item=>item.id!==value.id);return {ok:false,queued:false,error:'The spawn prompt could not open. The request remains in Contribute.'}; }
            return { ok:true, queued:true };
        }
        if (!this.allowed(event)) throw new Error('Wiki discovery action is unavailable.');
        if (action === 'get-state') return this.state();
        const item = this.queue.find(item => item.id === value?.id);
        if (!item) throw new Error('This suggestion has already been dismissed.');
        if (action === 'capture-status') {
            if (!this.isMain(event)) throw new Error('Capture completion is unavailable.');
            if (!['item-link','spawn-location'].includes(item.purpose) || value?.purpose !== item.purpose || typeof value.captureRequest !== 'string' || value.captureRequest !== item.captureRequest || !['waiting','retry','captured'].includes(value.status)) throw new Error('This capture request is no longer active.');
            if (value.status === 'captured' && (item.captureState !== 'waiting' || item.purpose === 'item-link' && (typeof value.matchedName !== 'string' || value.matchedName.length > 240 || !itemIdentity(value.matchedName) || itemIdentity(value.matchedName) !== itemIdentity(item.name)) || item.purpose === 'spawn-location' && value.candidateId !== item.candidateId)) throw new Error('The captured evidence does not match this request.');
            if (item.captureState === 'captured') return {ok:true,...this.contributionDetails(item)};
            item.captureState = value.status;
            item.captureMessage = typeof value.message === 'string' ? value.message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400) : '';
            const details = this.contributionDetails(item), main = this.getMainWindow();
            if (main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:discovery-action',{action:'capture-status',...details});
            if (item.purpose === 'spawn-location') this.publishSpawn();
            return {ok:true,...details};
        }
        if (action === 'contribute') {
            if (item.purpose !== 'item-link' && item.purpose !== 'spawn-location') throw new Error('This suggestion has no contribution capture.');
            return this.startContribution(item);
        }
        if (action === 'ignore' || action === 'dismiss') {
            if (this.captureId === item.id) throw new Error('Please wait for the screenshot.');
            this.queue = this.queue.filter(entry => entry.id !== item.id);
            if (item.purpose === 'spawn-location') this.publishSpawn();
            const main = this.getMainWindow();
            if (main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:discovery-action', { action, id:item.id,...(item.purpose?this.contributionDetails(item):{}) });
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
        this.disposed = true; this.clear(); this.electron.ipcMain.removeHandler(CHANNEL); this.electron.ipcMain.removeHandler(SPAWN_CHANNEL);
    }
    clear() { this.captureGeneration++; this.spawnGeneration++; this.queue = []; this.capturing = false; this.captureId = null;const window=this.spawnWindow;this.spawnWindow=null;this.spawnReady=null;if(window&&!window.isDestroyed())window.destroy(); }
}
module.exports = { DiscoveryHost, SPAWN_CHANNEL };
