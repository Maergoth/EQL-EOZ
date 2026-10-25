'use strict';
const path = require('node:path');
const {DiscoveryNoticeWindow}=require('./discovery-notice-window.cjs');
const CHANNEL = 'eye-of-zomm:discovery';
const SPAWN_CHANNEL = 'eye-of-zomm:spawn-prompt';
const itemIdentity = value => String(value || '').normalize('NFKC').replace(/_/g,' ').replace(/[\u2018\u2019`]/g,"'").replace(/\s*\+(?:10|[0-9])\s*$/,'').replace(/\s*\(Exaltation\)\s*$/i,'').replace(/\s*\+(?:10|[0-9])\s*$/,'').replace(/\s+/g,' ').trim().toLowerCase();

// Pending catalog suggestions and user-requested clipboard capture only.
// Suggestions use a dedicated non-activating window, independent of Timers.
// Registration never captures pixels or sends game input.
class DiscoveryHost {
    constructor({ electron, origin, getMainWindow, showMain = null, itemExistence = null, verifyDiscovery=null, isContributionIgnored=null, now=Date.now }) {
        this.electron = electron; this.origin = origin; this.getMainWindow = getMainWindow; this.itemExistence=itemExistence;this.verifyDiscovery=verifyDiscovery;this.isContributionIgnored=isContributionIgnored;this.now=now;this.noticeGeneration=0;
        this.showMain = showMain; this.spawnWindow = null; this.spawnReady = null; this.spawnGeneration = 0;
        this.queue = []; this.disposed = false; this.capturing = false; this.captureId = null; this.captureGeneration = 0; this.contributionSequence = 0;
        this.pendingNotices=new Map();this.retiredNotices=new Set();this.notableSequence=0;
        this.notices=new DiscoveryNoticeWindow({electron,origin,getMainWindow,getState:()=>this.noticeState()});
        electron.ipcMain.handle(CHANNEL, (event, action, value) => this.handle(event, action, value));
        electron.ipcMain.handle(SPAWN_CHANNEL, (event, action, value) => this.handleSpawn(event, action, value));
    }
    isMain(event) {
        const main = this.getMainWindow();
        return Boolean(main && !main.isDestroyed() && event.sender === main.webContents &&
            event.senderFrame === main.webContents.mainFrame && event.senderFrame?.url === `${this.origin}/`);
    }
    allowed(event) {
        return this.isMain(event)||this.notices.allowed(event);
    }
    state() { return this.queue.map(item => ({ ...item })); }
    async reconcileIgnores(){
        if(this.disposed||typeof this.isContributionIgnored!=='function')return;
        const generation=this.noticeGeneration,checked=await Promise.all(this.queue.map(async item=>{try{return await this.isContributionIgnored({kind:item.kind==='monster'?'npc':'item',name:item.name})?item:null;}catch{return item;}}));
        if(this.disposed||generation!==this.noticeGeneration)return;
        const hidden=new Set(checked.filter(Boolean));for(const item of hidden)this.retire(item.id);
        this.queue=this.queue.filter(item=>!hidden.has(item));this.publishSpawn();this.notices.publish();if(!this.noticeState().length)this.notices.clear();
    }
    retire(id){this.retiredNotices.add(id);while(this.retiredNotices.size>128)this.retiredNotices.delete(this.retiredNotices.values().next().value);}
    noticeState() { return this.state().filter(item=>item.purpose!=='spawn-location'); }
    spawnState() { return this.queue.filter(item => item.purpose === 'spawn-location').map(item => ({ ...item })); }
    isSpawn(event) {
        const window = this.spawnWindow;
        return Boolean(window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === `${this.origin}/spawn-prompt.html`);
    }
    contributionDetails(item) {
        return {id:item.id,purpose:item.purpose,name:item.name,...(item.candidateId?{candidateId:item.candidateId,zone:item.zone,...(item.spawnEvidenceId?{spawnEvidenceId:item.spawnEvidenceId}:{}),...(typeof item.notable==='boolean'?{notable:item.notable}:{})}:{}),...(item.captureRequest?{captureRequest:item.captureRequest,captureState:item.captureState}:{}),...(item.captureMessage?{captureMessage:item.captureMessage}:{})};
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
        else this.notices.publish();
        return {pendingCapture:true,...details};
    }
    async handleSpawn(event, action, value) {
        if (this.disposed || !this.isSpawn(event)) throw new Error('The spawn prompt is unavailable.');
        if (action === 'get-state') return this.spawnState();
        if (!['contribute','ignore','dismiss','set-notable'].includes(action)) throw new Error('Unknown spawn prompt action.');
        const item = this.queue.find(item => item.purpose === 'spawn-location' && item.id === value?.id);
        if (!item) throw new Error('This spawn prompt has expired.');
        if(action==='set-notable'){
            if(value.candidateId!==item.candidateId||typeof value.notable!=='boolean')throw Error('This notable choice does not match the current monster.');
            if(item.notablePending)throw Error('Wait for the current notable choice to be saved.');
            const main=this.getMainWindow();if(!main||main.isDestroyed())throw Error('Open the main app and try again.');
            const previousNotable=typeof item.notable==='boolean'?item.notable:null;
            item.notable=value.notable;item.notablePending=true;item.notableChoiceId=`notable-${++this.notableSequence}`;delete item.notableMessage;
            main.webContents.send('eye-of-zomm:discovery-action',{action:'set-notable',...this.contributionDetails(item),previousNotable,notableChoiceId:item.notableChoiceId});
            this.publishSpawn();return{ok:true,pending:true,...this.contributionDetails(item)};
        }
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
            window = new this.electron.BrowserWindow({title:'Eye of Zomm · Spawn location',width:400,height:300,show:false,frame:false,transparent:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#101722',autoHideMenuBar:true,
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
        const width=Math.max(1,Math.min(400,work.width-24)),height=Math.max(1,Math.min(300,work.height-24));
        window.setBounds({x:Math.round(work.x+work.width-width-12),y:Math.round(work.y+work.height-height-12),width,height});
        window.setAlwaysOnTop?.(true,'pop-up-menu');this.publishSpawn();window.showInactive();
    }
    async handle(event, action, value) {
        if (this.disposed) throw new Error('Wiki discovery has closed.');
        if(action==='check-item-exists'){
            if(!this.isMain(event))throw Error('Wiki item lookup is unavailable.');
            return this.itemExistence?this.itemExistence.check(value):{status:'unknown',source:'cache'};
        }
        if(action==='cancel-item-checks'){if(!this.isMain(event))throw Error('Wiki item lookup is unavailable.');this.noticeGeneration++;this.pendingNotices.clear();this.itemExistence?.clear();return{ok:true};}
        if(action==='notable-status'){
            if(!this.isMain(event))throw Error('Notable choice confirmation is unavailable.');
            const item=this.queue.find(item=>item.purpose==='spawn-location'&&item.id===value?.id);
            if(!item||!item.notablePending||value.candidateId!==item.candidateId||value.notableChoiceId!==item.notableChoiceId)throw Error('This notable choice is no longer active.');
            if(typeof value.ok!=='boolean'||value.ok&&value.notable!==item.notable)throw Error('Invalid notable choice confirmation.');
            item.notablePending=false;
            if(!value.ok){if(typeof value.notable==='boolean')item.notable=value.notable;else delete item.notable;item.notableMessage=String(value.error||'Review the notable choice in Contribute.').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);}
            this.publishSpawn();return{ok:true};
        }
        if (action === 'show') {
            if (!this.isMain(event)) throw new Error('Wiki discovery registration is unavailable.');
            if (!value || !['item', 'monster'].includes(value.kind) || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 512 ||
                typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240) throw new Error('Invalid wiki discovery.');
            const spawn = value.purpose === 'spawn-location';
            const itemLink = value.purpose === 'item-link';
            if (itemLink && value.kind !== 'item') throw new Error('Invalid item link request.');
            if (spawn && (value.kind !== 'monster' || typeof value.candidateId !== 'string' && !value.id.startsWith('spawn-') || typeof value.candidateId==='string'&&(!value.candidateId.trim()||value.candidateId.length>240) || !value.candidateId&&!value.id.slice(6).trim())) throw new Error('Invalid spawn location request.');
            if(spawn&&(value.spawnEvidenceId!==undefined&&(typeof value.spawnEvidenceId!=='string'||!value.spawnEvidenceId||value.spawnEvidenceId.length>240)||value.notable!==undefined&&typeof value.notable!=='boolean'))throw Error('Invalid spawn classification request.');
            const generation=this.noticeGeneration,startedAt=this.now();let expiresAt=startedAt+15000;
            if(value.kind==='item'&&(value.createdAt!==undefined||value.expiresAt!==undefined)){
                if(!Number.isSafeInteger(value.createdAt)||!Number.isSafeInteger(value.expiresAt)||value.createdAt>startedAt+1000||value.expiresAt<=value.createdAt||value.expiresAt-value.createdAt>60000)throw Error('Invalid wiki notice lifetime.');
                expiresAt=value.expiresAt;
            }
            const ignored=async()=>{try{return typeof this.isContributionIgnored==='function'&&await this.isContributionIgnored({kind:value.kind==='monster'?'npc':'item',name:value.name});}catch{return true;}};
            if(await ignored())return{ok:true,suppressed:true};
            if(value.kind==='monster'){
                const key='npc|'+String(value.name).normalize('NFKC').replace(/_/g,' ').trim()+'|'+String(value.zone||'').trim();
                if(this.retiredNotices.has(value.id)||this.pendingNotices.has(key)||this.pendingNotices.size>=20)return{ok:true,suppressed:true};
                const pending={id:value.id,kind:value.kind,name:value.name,cancelled:false};this.pendingNotices.set(key,pending);
                let proof;try{proof=typeof this.verifyDiscovery==='function'?await this.verifyDiscovery({id:value.candidateId||value.id,kind:'npc',name:value.name,zone:String(value.zone||'').slice(0,240),instance:'unknown',reasons:['missing-page'],relations:[]}):null;}catch{}finally{if(this.pendingNotices.get(key)===pending)this.pendingNotices.delete(key);}
                const checkedAt=typeof proof?.checkedAt==='number'?proof.checkedAt:Date.parse(proof?.checkedAt||'');
                if(this.disposed||pending.cancelled||this.retiredNotices.has(value.id)||generation!==this.noticeGeneration||!this.isMain(event)||this.now()-startedAt>=60000||proof?.state!=='missing'||!Array.isArray(proof.reasons)||!proof.reasons.includes('missing-page')||!Number.isFinite(checkedAt)||checkedAt>this.now()+2000||this.now()-checkedAt>=60000||await ignored())return{ok:true,suppressed:true,deferred:proof?.state!=='covered'};
            }
            if(value.kind==='item'){
                if(startedAt>=expiresAt)return{ok:true,suppressed:true};
                const key=itemIdentity(value.name);
                if(this.retiredNotices.has(value.id)||this.pendingNotices.has(key)||this.queue.some(item=>item.kind==='item'&&itemIdentity(item.name)===key))return{ok:true,suppressed:true};
                if(this.pendingNotices.size>=20)return{ok:true,suppressed:true,deferred:true};
                const pending={id:value.id,kind:value.kind,name:value.name,cancelled:false};this.pendingNotices.set(key,pending);
                let existing;try{existing=this.itemExistence?await this.itemExistence.check({name:value.name}):{status:'unknown'};}finally{if(this.pendingNotices.get(key)===pending)this.pendingNotices.delete(key);}
                if(this.disposed||pending.cancelled||this.retiredNotices.has(value.id)||generation!==this.noticeGeneration||!this.isMain(event)||this.now()>=expiresAt||existing.status!=='missing')return{ok:true,suppressed:true,...(existing.status==='unknown'?{deferred:true}:{})};
                if(await ignored())return{ok:true,suppressed:true};
                if(this.queue.some(item=>item.kind==='item'&&item.id!==value.id&&itemIdentity(item.name)===itemIdentity(value.name)))return{ok:true,suppressed:true};
            }
            if (this.queue.some(item => item.id === value.id)) return { ok:true, queued:true };
            // The newest kill owns the one armed /loc target. Never display an
            // old, inactive prompt after the new one expires.
            if (spawn) this.queue = this.queue.filter(item => item.purpose !== 'spawn-location');
            if (this.queue.length >= 20) return { ok:false, queued:false, error:'The wiki suggestion list is full.' };
            this.queue.push({ id:value.id, kind:value.kind, name:value.name, zone:String(value.zone || '').slice(0, 240),...(typeof value.hint==='string'?{hint:value.hint.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400)}:{}),...(spawn?{purpose:'spawn-location',candidateId:String(value.candidateId||value.id.slice(6)).slice(0,240),...(value.spawnEvidenceId?{spawnEvidenceId:value.spawnEvidenceId}:{}),...(typeof value.notable==='boolean'?{notable:value.notable}:{})}:itemLink?{purpose:'item-link'}:{}) });
            if (spawn) try { await this.showSpawn(); } catch { this.queue=this.queue.filter(item=>item.id!==value.id);return {ok:false,queued:false,error:'The spawn prompt could not open. The request remains in Contribute.'}; }
            else try{await this.notices.show();}catch{this.queue=this.queue.filter(item=>item.id!==value.id);return{ok:false,queued:false,error:'The wiki suggestion popup could not open.'};}
            return { ok:true, queued:true };
        }
        if (!this.allowed(event)) throw new Error('Wiki discovery action is unavailable.');
        if (action === 'get-state') return this.isMain(event)?this.state():this.noticeState();
        if(action==='notice-height'){if(!this.notices.allowed(event))throw Error('Wiki notice sizing is unavailable.');return this.notices.resize(value);}
        const item = this.queue.find(item => item.id === value?.id);
        if(!item&&this.isMain(event)&&['ignore','dismiss'].includes(action)){
            const pending=[...this.pendingNotices.values()].find(item=>item.id===value?.id);
            if(pending){pending.cancelled=true;this.retire(pending.id);this.getMainWindow().webContents.send('eye-of-zomm:discovery-action',{action,id:pending.id});return this.state();}
        }
        if (!item) throw new Error('This suggestion has already been dismissed.');
        if(this.notices.allowed(event)&&item.purpose==='spawn-location')throw Error('This spawn request belongs to its own prompt.');
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
            else this.notices.publish();
            return {ok:true,...details};
        }
        if (action === 'contribute') {
            if (item.purpose !== 'item-link' && item.purpose !== 'spawn-location') throw new Error('This suggestion has no contribution capture.');
            return this.startContribution(item);
        }
        if (action === 'ignore' || action === 'dismiss') {
            if (this.captureId === item.id) throw new Error('Please wait for the screenshot.');
            this.queue = this.queue.filter(entry => entry.id !== item.id);
            this.retire(item.id);
            if (item.purpose === 'spawn-location') this.publishSpawn();
            else this.notices.publish();
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
            // main frame or exact dedicated notice frame.
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
        this.disposed = true; this.clear(); this.notices.dispose();this.itemExistence?.dispose();this.electron.ipcMain.removeHandler(CHANNEL); this.electron.ipcMain.removeHandler(SPAWN_CHANNEL);
    }
    clear() { this.captureGeneration++; this.noticeGeneration++;this.spawnGeneration++; this.queue = [];this.pendingNotices.clear();this.retiredNotices.clear(); this.capturing = false; this.captureId = null;this.notices.clear();this.itemExistence?.clear();const window=this.spawnWindow;this.spawnWindow=null;this.spawnReady=null;if(window&&!window.isDestroyed())window.destroy(); }
}
module.exports = { DiscoveryHost, SPAWN_CHANNEL };
