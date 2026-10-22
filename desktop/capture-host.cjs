'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { ScreenReadJournal } = require('./screen-read-journal.cjs');
const { OcrService } = require('./ocr-service.cjs');
const { validateCapturePng,captureOcrScale } = require('./capture-image.cjs');
const CHANNEL = 'eye-of-zomm:capture', SOURCE_CHANNEL = 'eye-of-zomm:capture-source';
const MODES = new Set(['contribution','character']);
const clean = (value, length = 240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,length);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const isOwnWindow = name => /^Eye of Zomm|^EQLWiki - Eye of Zomm/i.test(name);
const sameOrigin=(value,origin)=>{try{return new URL(value).origin===origin;}catch{return false;}};
function isCapturePermission(permission,details){
    // Electron 43 reports getDisplayMedia as media with no camera/mic types.
    // Later releases distinguish display-capture. Camera/microphone stay denied.
    return permission==='display-capture'||(permission==='media'&&Array.isArray(details?.mediaTypes)&&details.mediaTypes.length===0);
}

class CaptureHost {
    constructor({ electron, origin, getMainWindow, root, journal, ocr, onObservation = () => {}, now = Date.now } = {}) {
        this.electron = electron; this.origin = origin; this.getMainWindow = getMainWindow; this.now = now;
        this.journal = journal || new ScreenReadJournal({ root:root || path.join(electron.app.getPath('userData'),'capture','journal') });
        this.ocr = ocr || new OcrService({ packaged:electron.app.isPackaged,resourcesPath:process.resourcesPath });
        this.onObservation = onObservation; this.choices = []; this.source = null; this.captureWindow = null;
        this.owner = null; this.sessionId = ''; this.phase = 'disabled'; this.enabled = false; this.error = null;
        this.generation = 0; this.revision = 0; this.ownerStartedAt = 0; this.lastFrame = null; this.pending = null;
        this.processing = null; this.skippedFrames = 0; this.lastObservationAt = null; this.disposed = false;
        this.contributionResume = null; this.hold = false; this.sequence = 0; this.seen = new Map();
        this.parseModule = import(pathToFileURL(path.join(__dirname,'..','app','screen-read-parser.js')).href);
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
        electron.ipcMain.handle(SOURCE_CHANNEL,(event,action,value)=>this.handleSource(event,action,value));
    }
    isMain(event) {
        const main = this.getMainWindow();
        return Boolean(main && !main.isDestroyed() && event.sender===main.webContents &&
            event.senderFrame===main.webContents.mainFrame && event.senderFrame?.url===`${this.origin}/`);
    }
    isSource(event) {
        const window = this.captureWindow;
        return Boolean(window && !window.isDestroyed() && event.sender===window.webContents &&
            event.senderFrame===window.webContents.mainFrame && event.senderFrame?.url===`${this.origin}/capture-source.html`);
    }
    getStatus() {
        return { enabled:this.enabled,phase:this.phase,owner:this.owner,source:this.source ? {label:clean(this.source.name),type:this.source.id.startsWith('screen:')?'display':'window'}:null,
            sessionId:this.sessionId,characterSessionId:this.owner==='character'?this.sessionId:null,generation:this.generation,
            queuedFrames:this.pending?1:0,skippedFrames:this.skippedFrames,lastObservationAt:this.lastObservationAt,
            contributionPaused:this.owner==='character'&&Boolean(this.contributionResume),error:this.error };
    }
    emitStatus() {
        const main = this.getMainWindow();
        if (main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:capture-status',this.getStatus());
    }
    async handle(event,action,value) {
        if (this.disposed || !this.isMain(event)) throw new Error('Screen reading is available only in the main app.');
        if (action==='status') return this.getStatus();
        if (action==='sources') return this.listSources();
        if (action==='start') return this.start(value);
        if (action==='stop') return this.stop(value);
        if (action==='pause') return this.pause();
        if (action==='resume') return this.resume();
        if (action==='read') return this.journal.read(value);
        if (action==='clear-history') { await this.journal.clear(); return this.getStatus(); }
        if (action==='import-image') return this.importImage(value);
        if (action==='observe-log') return this.ingestLogObservation(value?.event,value?.context);
        throw new Error('Unknown screen-reading action.');
    }
    async listSources() {
        if (this.disposed) throw new Error('Screen reading has closed.');
        const sources = await this.electron.desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
        this.choices = sources.filter(source=>!isOwnWindow(source.name));
        return this.choices.map(source=>({id:source.id,name:clean(source.name),type:source.id.startsWith('screen:')?'display':'window'}));
    }
    async cancelWork({ destroySource = false } = {}) {
        this.generation++; this.pending = null; this.lastFrame = null;
        clearTimeout(this.sourceTimer);this.sourceTimer=null;
        if (destroySource && this.captureWindow) { const window = this.captureWindow; this.captureWindow = null; if (!window.isDestroyed()) window.destroy(); }
        await this.ocr.stop();
        if (this.processing) await this.processing.catch(()=>{});
    }
    async start({mode,sourceId,sessionId} = {}) {
        if (!MODES.has(mode) || (sourceId!==undefined && typeof sourceId!=='string') || (sessionId!==undefined && !/^[\w-]{1,120}$/.test(sessionId))) throw new Error('Invalid screen-reading session.');
        if (this.disposed) throw new Error('Screen reading has closed.');
        const source = sourceId ? this.choices.find(choice=>choice.id===sourceId) : this.source;
        if (!source) throw new Error('Choose a currently available game window or display first.');
        if (this.owner==='character' && mode==='contribution') {
            this.contributionResume = {source,sessionId:sessionId||crypto.randomUUID()}; this.emitStatus(); return this.getStatus();
        }
        const previous = this.owner==='contribution' && this.phase==='running' ? {source:this.source,sessionId:this.sessionId}:null;
        const revision=++this.revision; await this.cancelWork({destroySource:true});
        if(revision!==this.revision||this.disposed)return this.getStatus();
        if (mode==='character' && previous) this.contributionResume = previous;
        this.enabled = true; this.owner = mode; this.sessionId = sessionId || crypto.randomUUID();
        this.source = source; this.phase = 'selecting'; this.error = null; this.ownerStartedAt = this.now(); this.seen.clear(); this.emitStatus();
        await this.journal.initialize();
        try { await this.startSource(); } catch (error) { this.phase='error';this.error=clean(error.message,500);this.emitStatus();throw error; }
        return this.getStatus();
    }
    async startSource() {
        const { BrowserWindow,session } = this.electron;
        const captureSession = session.fromPartition(`eoz-capture-${crypto.randomUUID()}`);
        const window = this.captureWindow = new BrowserWindow({show:false,width:1,height:1,skipTaskbar:true,
            webPreferences:{session:captureSession,preload:path.join(__dirname,'capture-source-preload.cjs'),sandbox:true,
                nodeIntegration:false,contextIsolation:true,webSecurity:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
        const captureUrl=`${this.origin}/capture-source.html`;
        captureSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(
            this.captureWindow===window && contents===window.webContents && isCapturePermission(permission,details) &&
            details?.requestingUrl===captureUrl && details?.isMainFrame!==false && this.phase==='selecting'));
        captureSession.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>Boolean(
            this.captureWindow===window && contents===window.webContents && permission==='display-capture' &&
            sameOrigin(requestingOrigin,this.origin) && details?.isMainFrame!==false && window.webContents.mainFrame?.url===captureUrl));
        captureSession.setDisplayMediaRequestHandler((request,callback)=>{
            if (this.disposed || this.captureWindow!==window || request.frame!==window.webContents.mainFrame ||
                !sameOrigin(request.securityOrigin,this.origin) || !this.source || this.phase!=='selecting' || request.audioRequested) return callback(null);
            callback({video:this.source});
        });
        window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        window.webContents.on('will-navigate',(event,url)=>{if(url!==`${this.origin}/capture-source.html`)event.preventDefault();});
        window.webContents.on('render-process-gone',()=>{if(this.captureWindow===window)void this.fail('Screen capture stopped. Choose the game window again.');});
        await window.loadURL(captureUrl);
        if (this.captureWindow!==window || this.disposed) return;
        // Static call into our own isolated page, with the initiating user's gesture.
        this.sourceTimer=setTimeout(()=>{if(this.captureWindow===window&&this.phase==='selecting')void this.fail('Screen capture did not start. Choose the game window again.');},15000);
        void window.webContents.executeJavaScript('window.startScreenReadCapture()',true).catch(()=>{
            if(this.captureWindow===window&&!this.disposed)void this.fail('Screen capture did not start. Choose the game window again.');
        });
    }
    async handleSource(event,action,value) {
        if (!this.isSource(event) || this.disposed) throw new Error('Capture source is unavailable.');
        if (action==='configuration') return {allowed:this.phase==='selecting',intervalMs:2000};
        if (action==='started') { clearTimeout(this.sourceTimer);this.sourceTimer=null;this.phase='running';this.error=null;this.emitStatus();return {ok:true}; }
        if (action==='error' || action==='ended') { await this.fail(action==='ended'?'The selected capture source ended. Choose it again.':clean(value,500));return {ok:false}; }
        if (action==='frame') return this.submitFrame(value);
        throw new Error('Unknown capture source action.');
    }
    async fail(message) {
        this.phase='error';this.error=clean(message,500);this.revision++;
        await this.cancelWork({destroySource:true});this.emitStatus();
    }
    async stop({mode} = {}) {
        if (mode!==undefined && !MODES.has(mode)) throw new Error('Invalid capture mode.');
        if (this.owner==='character' && mode==='contribution') { this.contributionResume=null;this.emitStatus();return this.getStatus(); }
        if(mode&&this.owner&&mode!==this.owner)return this.getStatus();
        const restore = this.owner==='character' && mode==='character' ? this.contributionResume:null;
        const revision=++this.revision; this.contributionResume=null;this.enabled=false;this.phase='disabled';this.owner=null;this.sessionId='';
        await this.cancelWork({destroySource:true});this.emitStatus();
        if (revision===this.revision && restore && this.choices.some(source=>source.id===restore.source.id)) return this.start({mode:'contribution',sourceId:restore.source.id,sessionId:restore.sessionId});
        return this.getStatus();
    }
    async pause() {
        this.revision++;this.phase='paused';this.contributionResume=null;await this.cancelWork({destroySource:true});this.emitStatus();return this.getStatus();
    }
    async resume() {
        if (!this.owner || !this.source) throw new Error('Choose a capture source first.');
        return this.start({mode:this.owner,sourceId:this.source.id,sessionId:this.sessionId});
    }
    submitFrame(value) {
        if (this.phase!=='running' || this.hold || !this.owner) return {accepted:false};
        if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width<1 || value.height<1 ||
            value.width*value.height>16*1024*1024 || !value.bytes || value.bytes.byteLength>32*1024*1024 ||
            !Number.isFinite(value.capturedAt) || value.capturedAt<this.ownerStartedAt || Math.abs(this.now()-value.capturedAt)>30000) throw new Error('Invalid capture frame.');
        const png = Buffer.from(value.bytes);
        validateCapturePng(png,{width:value.width,height:value.height});
        const image = this.electron.nativeImage.createFromBuffer(png);
        const size = image.getSize();
        if (image.isEmpty() || size.width!==value.width || size.height!==value.height) throw new Error('Invalid capture dimensions.');
        this.lastFrame = {png,at:value.capturedAt,sourceId:this.source?.id};
        const frame = {png,image,size,capturedAt:value.capturedAt,generation:this.generation,owner:this.owner,sessionId:this.sessionId};
        if (this.pending) this.skippedFrames++;
        this.pending = frame;
        if (!this.processing) this.processing = this.pump().finally(()=>{this.processing=null;});
        return {accepted:true,queued:Boolean(this.pending)};
    }
    async pump() {
        while (this.pending && !this.disposed) {
            const frame = this.pending;this.pending=null;
            try {
                const hash = digest(frame.png);
                if (this.seen.has(`frame:${hash}`)) {this.skippedFrames++;continue;}
                const scale = captureOcrScale(frame.size);
                const png = scale===1 ? frame.png : frame.image.resize({width:frame.size.width*scale,height:frame.size.height*scale,quality:'best'}).toPNG();
                const result = await this.ocr.recognize(png);
                if (frame.generation!==this.generation || this.phase!=='running' || this.hold) continue;
                const {parseScreenRead} = await this.parseModule;
                const observations = parseScreenRead({...result,owner:frame.owner,sessionId:frame.sessionId,
                    capturedAt:new Date(frame.capturedAt).toISOString(),input:{frameId:hash,captureGeneration:frame.generation,
                        sourceSize:frame.size,region:{x:0,y:0,width:frame.size.width,height:frame.size.height},scale}});
                for (const observation of observations) await this.saveObservation(observation,frame.generation);
                this.remember(`frame:${hash}`);this.emitStatus();
            } catch (error) {
                if (frame.generation===this.generation && !this.disposed) {
                    this.phase='error';this.error=clean(error.message,500);this.pending=null;this.emitStatus();
                    // Destroy the source immediately; do not recursively await this pump.
                    if(this.captureWindow){const window=this.captureWindow;this.captureWindow=null;if(!window.isDestroyed())window.destroy();}
                    void this.ocr.stop();
                }
            }
        }
    }
    remember(key) { this.seen.set(key,this.now());if(this.seen.size>2000)this.seen.delete(this.seen.keys().next().value); }
    async saveObservation(observation,generation=this.generation) {
        const values=(observation.fields||[]).map(field=>[field.key,field.value]).sort((a,b)=>a[0].localeCompare(b[0]));
        const semantic = JSON.stringify([observation.owner,observation.sessionId,observation.subject,values,observation.relations||[],
            observation.kind==='game-log'?[observation.input?.logId,observation.input?.cursor,observation.capturedAt]:null]);
        const key=digest(semantic);if(this.seen.has(key))return null;
        if(generation!==this.generation || this.disposed)return null;
        const record=await this.journal.append({...observation,id:crypto.randomUUID(),dedupKey:key});
        if(generation!==this.generation || this.disposed)return null;
        this.remember(key);this.lastObservationAt=record.recordedAt;
        const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('eye-of-zomm:capture-observation',record);
        try{this.onObservation(record);}catch{}
        return record;
    }
    async ingestLogObservation(event,context={}) {
        if (!event || context.live!==true || !Number.isFinite(context.at) || Math.abs(this.now()-context.at)>10000 ||
            !['kill','loot','consider','zone','profile'].includes(event.type)) return {accepted:false};
        const kind=event.type==='loot'?'item':['kill','consider'].includes(event.type)?'monster':event.type==='zone'?'zone':'character';
        const name=clean(event.type==='loot'?event.item:event.type==='kill'?event.victim:event.type==='consider'?event.target?.name:event.type==='zone'?event.zone:event.character);
        if(!name)return {accepted:false};
        const fields=[{key:'name',raw:name,value:name,confidence:100}];
        if(event.type==='loot' && Number.isSafeInteger(event.quantity) && event.quantity>0)fields.push({key:'quantity',raw:String(event.quantity),value:event.quantity,confidence:100});
        if(event.type==='consider' && Number.isFinite(event.target?.level))fields.push({key:'level',raw:String(event.target.level),value:event.target.level,confidence:100});
        const zone=clean(context.zone||event.zone),source=clean(event.source),sourceKind=clean(event.sourceEvidence?.kind,40);
        const relations=event.type==='loot'&&source&&source!=='Unknown'?[{type:'drop-source',name:source,zone,evidence:sourceKind||'unknown',reviewRequired:sourceKind!=='explicit-corpse'}]:[];
        // A local caller supplies parser events, never raw log lines or paths.
        const logId=digest(clean(context.logId,2048));
        const cursor=Number.isSafeInteger(context.cursor)?context.cursor:++this.sequence;
        const record=await this.saveObservation({kind:'game-log',owner:'contribution',sessionId:`log-${logId.slice(0,16)}`,
            capturedAt:new Date(context.at).toISOString(),input:{logId,cursor,event:event.type,zone,live:true},parser:{name:'eq-log',version:1},
            subject:{kind,name},fields,relations,evidence:{text:'',imageId:null}},this.generation);
        return {accepted:Boolean(record)};
    }
    async importImage({mode,sessionId}={}) {
        if((mode!==undefined&&!MODES.has(mode))||(sessionId!==undefined&&!/^[\w-]{1,120}$/.test(sessionId)))throw new Error('Invalid screenshot review session.');
        if(this.hold)throw new Error('Another screenshot is already being read.');
        const answer=await this.electron.dialog.showOpenDialog(this.getMainWindow(),{title:'Read an item or character screenshot',properties:['openFile'],filters:[{name:'PNG screenshots',extensions:['png']}]});
        if(answer.canceled||!answer.filePaths?.length)return {cancelled:true};
        const target=answer.filePaths[0],stat=await fs.stat(target);
        if(!stat.isFile()||stat.size>32*1024*1024)throw new Error('Choose an image smaller than 32 MB.');
        const png=await fs.readFile(target);validateCapturePng(png);
        const image=this.electron.nativeImage.createFromBuffer(png),size=image.getSize();
        if(image.isEmpty()||size.width*size.height>16*1024*1024)throw new Error('Choose an image smaller than 16 megapixels.');
        if(this.hold)throw new Error('Another screenshot is already being read.');
        this.hold=true;this.generation++;this.pending=null;
        const generation=this.generation,scale=captureOcrScale(size),owner=mode||this.owner||'contribution';
        const reviewSession=sessionId||(owner===this.owner?this.sessionId:null)||crypto.randomUUID();
        try{
            await this.ocr.stop();if(this.processing)await this.processing.catch(()=>{});
            if(generation!==this.generation||this.disposed)return {records:[],cancelled:true};
            const result=await this.ocr.recognize(scale===1?png:image.resize({width:size.width*scale,height:size.height*scale,quality:'best'}).toPNG());
            const {parseScreenRead}=await this.parseModule;
            const records=[];
            for(const observation of parseScreenRead({...result,kind:'manual',owner,sessionId:reviewSession,
                capturedAt:new Date(this.now()).toISOString(),input:{frameId:digest(png),sourceSize:size,region:{x:0,y:0,width:size.width,height:size.height},scale}})){
                const record=await this.saveObservation(observation,generation);if(record)records.push(record);
            }
            return {records,message:records.length?'Screenshot read. Review the proposed fields.':'No item examine or character stat block was recognized. Try a larger, clearer screenshot.'};
        }finally{
            this.hold=false;this.emitStatus();
        }
    }
    async captureScreenshot({sourceId}={}) {
        if(this.hold)throw new Error('A screenshot is already in progress.');
        this.hold=true;const revision=this.revision;this.generation++;this.pending=null;
        try{
            await this.ocr.stop();if(this.processing)await this.processing.catch(()=>{});
            if(this.lastFrame&&this.now()-this.lastFrame.at<10000&&(!sourceId||sourceId===this.lastFrame.sourceId)){
                this.electron.clipboard.writeImage(this.electron.nativeImage.createFromBuffer(this.lastFrame.png));
                return {captured:true,message:'Paste your clipboard into discord!'};
            }
            const sources=(await this.electron.desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:4096,height:2160},fetchWindowIcons:false})).filter(source=>!isOwnWindow(source.name));
            const games=sources.filter(source=>/everquest/i.test(source.name));
            const source=sourceId?sources.find(source=>source.id===sourceId):games.length===1?games[0]:null;
            if(sourceId&&!source)throw new Error('Choose a currently available window or display.');
            if(!source)return {choices:sources.map(source=>({id:source.id,name:clean(source.name)}))};
            if(!source.thumbnail||source.thumbnail.isEmpty())throw new Error('That window could not be captured. Choose a display or use windowed mode.');
            this.electron.clipboard.writeImage(source.thumbnail);return {captured:true,message:'Paste your clipboard into discord!'};
        }finally{this.hold=false;if(revision===this.revision)this.emitStatus();}
    }
    async dispose() {
        if(this.disposed)return;this.disposed=true;this.phase='disabled';this.enabled=false;
        this.electron.ipcMain.removeHandler(CHANNEL);this.electron.ipcMain.removeHandler(SOURCE_CHANNEL);
        await this.cancelWork({destroySource:true});await this.journal.close();
    }
}
module.exports={CaptureHost,CHANNEL,SOURCE_CHANNEL};
