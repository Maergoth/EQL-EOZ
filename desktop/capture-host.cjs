'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { ScreenReadJournal } = require('./screen-read-journal.cjs');
const { OcrService } = require('./ocr-service.cjs');
const { validateCapturePng,normalizeCaptureRegion } = require('./capture-image.cjs');
const { recognizeCaptureImage } = require('./capture-reader.cjs');
const CHANNEL = 'eye-of-zomm:capture', SOURCE_CHANNEL = 'eye-of-zomm:capture-source';
const MODES = new Set(['contribution','character']);
const FRAME_QUEUE_LIMIT=12,FRAME_QUEUE_BYTES=48*1024*1024,FRAME_QUEUE_AGE=15000,OCR_INTERVAL=250,SCREEN_DEDUP_MS=3000;
const ITEM_QUEUE_AGE=60000;
const ITEM_EVIDENCE_TTL=30000,ITEM_EVIDENCE_LIMIT=6,ITEM_EVIDENCE_BYTES=16*1024*1024;
const clean = (value, length = 240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,length);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const isOwnWindow = name => /^Eye of Zomm|^EQLWiki - Eye of Zomm/i.test(name);
function preferredCaptureSource(sources=[]) {
    const games=sources.filter(source=>typeof source?.id==='string'&&source.id.startsWith('window:')&&
        /^(?:EverQuest(?: Legends)?)(?:$|\s*[([])/i.test(String(source.name||''))&&
        !/\b(?:Chrome|Chromium|Firefox|Edge|Opera|Brave|browser|launchpad|launcher|patcher)\b/i.test(source.name));
    return games.length===1?games[0].id:null;
}
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
        this.retiredSources=new WeakSet();
        this.owner = null; this.sessionId = ''; this.phase = 'disabled'; this.enabled = false; this.error = null;
        this.generation = 0; this.generationStartedAt=this.now();this.revision = 0; this.ownerStartedAt = 0; this.lastFrame = null; this.pending = [];
        this.queuedBytes=0;this.activeFrameHash=null;this.activeFrameGeneration=null;this.overflowFrames=0;this.queueWarning=null;this.ocrStartedAt=0;this.readDelay=null;
        this.frameStatusAt=0;this.frameStatusTimer=null;
        this.lastReadAt=null;this.lastReadItemCount=null;
        this.priorityReads=0;
        this.captureDiagnostics={accepted:0,visualCandidates:0,emptyReads:0,completedReads:0,semanticDuplicates:0,rejections:{},sourceDropped:0,sceneReplacements:0,sceneCopies:0,lastEncodeMs:null,lastSourceQueueMs:null,lastTransportMs:null,lastSubmissionMs:null,lastQueueMs:null,lastReadMs:null,lastSelection:null};
        this.processing = null; this.skippedFrames = 0; this.lastObservationAt = null; this.disposed = false;
        this.contributionResume = null; this.hold = false; this.sequence = 0; this.seen = new Map();
        this.itemEvidenceFrames=new Map();
        this.region=null;this.referenceSize=null;this.sourceSize=null;this.calibrationWarning=null;
        this.readWarning=null;this.frameWarning=null;this.readErrors=0;this.nextReadAt=0;
        this.parseModule = import(pathToFileURL(path.join(__dirname,'..','app','screen-read-parser.js')).href);
        this.logEvidenceModule = import(pathToFileURL(path.join(__dirname,'..','app','contribution-evidence.js')).href);
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
        return { enabled:this.enabled,phase:this.phase,reconfiguring:Boolean(this.hold),owner:this.owner,source:this.source ? {id:this.source.id,label:clean(this.source.name),type:this.source.id.startsWith('screen:')?'display':'window'}:null,
            sessionId:this.sessionId,characterSessionId:this.owner==='character'?this.sessionId:null,generation:this.generation,generationStartedAt:this.generationStartedAt,ownerStartedAt:this.ownerStartedAt,
            queuedFrames:this.pending.length,queuedBytes:this.queuedBytes,queueLimit:FRAME_QUEUE_LIMIT,queueByteLimit:FRAME_QUEUE_BYTES,
            overflowFrames:this.overflowFrames,queueWarning:this.queueWarning,reading:this.phase==='running'&&!this.hold&&this.activeFrameGeneration===this.generation&&Boolean(this.activeFrameHash),lastFrameAt:this.lastFrame?.at??null,lastReadAt:this.lastReadAt,lastReadItemCount:this.lastReadItemCount,skippedFrames:this.skippedFrames,lastObservationAt:this.lastObservationAt,
            contributionPaused:this.owner==='character'&&Boolean(this.contributionResume),error:this.error,
            hasPreview:Boolean(this.lastFrame&&this.lastFrame.sourceId===this.source?.id&&this.phase==='running'),
            sourceSize:this.sourceSize,region:this.region,referenceSize:this.referenceSize,calibrationWarning:this.calibrationWarning,
            captureDiagnostics:{...this.captureDiagnostics,rejections:{...this.captureDiagnostics.rejections}},
            readWarning:this.readWarning||this.frameWarning||this.queueWarning,resumable:Boolean(this.enabled&&this.owner&&this.source&&['error','paused'].includes(this.phase)) };
    }
    emitStatus() {
        this.frameStatusAt=Date.now();
        const main = this.getMainWindow();
        if (main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:capture-status',this.getStatus());
    }
    emitFrameStatus(){const delay=250-(Date.now()-this.frameStatusAt);if(delay<=0){if(this.frameStatusTimer)clearTimeout(this.frameStatusTimer);this.frameStatusTimer=null;this.emitStatus();}else if(!this.frameStatusTimer){this.frameStatusTimer=setTimeout(()=>{this.frameStatusTimer=null;if(!this.disposed)this.emitStatus();},delay);this.frameStatusTimer.unref?.();}}
    async handle(event,action,value) {
        if (this.disposed || !this.isMain(event)) throw new Error('Screen reading is available only in the main app.');
        if (action==='status') return this.getStatus();
        if (action==='sources') return this.listSources();
        if (action==='start') return this.start(value);
        if (action==='stop') return this.stop(value);
        if (action==='pause') return this.pause();
        if (action==='resume') return this.resume();
        if (action==='read') return this.journal.read(value);
        if (action==='clear-history') { this.itemEvidenceFrames.clear();await this.journal.clear(); return this.getStatus(); }
        if (action==='import-image') return this.importImage(value);
        if (action==='preview') return this.preview();
        if (action==='item-evidence') return this.itemEvidence(value);
        if (action==='set-region') return this.setRegion(value);
        if (action==='observe-log') return this.ingestLogObservation(value?.event,value?.context);
        throw new Error('Unknown screen-reading action.');
    }
    async listSources() {
        if (this.disposed) throw new Error('Screen reading has closed.');
        const sources = await this.electron.desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
        this.choices = sources.filter(source=>!isOwnWindow(source.name));
        const preferred=preferredCaptureSource(this.choices);
        return this.choices.map(source=>({id:source.id,name:clean(source.name),type:source.id.startsWith('screen:')?'display':'window',recommended:source.id===preferred}));
    }
    async cancelWork({ destroySource = false } = {}) {
        this.advanceGeneration(); this.clearPending(); this.lastFrame = null;
        clearTimeout(this.sourceTimer);this.sourceTimer=null;
        if (destroySource && this.captureWindow) { const window = this.captureWindow; this.retiredSources.add(window.webContents);this.captureWindow = null; if (!window.isDestroyed()) window.destroy(); }
        await this.ocr.stop();
        if (this.processing) await this.processing.catch(()=>{});
    }
    clearPending(){this.pending=[];this.queuedBytes=0;if(this.readDelay){clearTimeout(this.readDelay.timer);this.readDelay.resolve();this.readDelay=null;}}
    advanceGeneration(at=this.now()){this.generation++;this.generationStartedAt=at;this.lastReadAt=null;this.lastReadItemCount=null;this.priorityReads=0;this.itemEvidenceFrames.clear();}
    recentlySeen(key){return this.seen.has(key)&&this.now()-this.seen.get(key)<SCREEN_DEDUP_MS;}
    discardQueued(index=0){const [frame]=this.pending.splice(index,1);if(frame)this.queuedBytes-=frame.png.length;return frame;}
    rejectFrame(reason){this.captureDiagnostics.rejections[reason]=(this.captureDiagnostics.rejections[reason]||0)+1;}
    noteOverflow(reason='capacity'){this.skippedFrames++;this.overflowFrames++;this.rejectFrame(reason);this.queueWarning=`Screen reading could not keep every changing frame (${this.overflowFrames} dropped). Hold each item still briefly or narrow the capture area.`;}
    prunePending(){for(let index=this.pending.length-1;index>=0;index--)if(this.now()-this.pending[index].capturedAt>(this.pending[index].priority?ITEM_QUEUE_AGE:FRAME_QUEUE_AGE)){this.discardQueued(index);this.noteOverflow('age');}}
    startPump(){if(!this.processing)this.processing=new Promise(resolve=>setImmediate(resolve)).then(()=>this.pump()).finally(()=>{this.processing=null;});}
    queueSceneReference(frame){
        const old=this.pending.findIndex(value=>value.kind==='scene');if(old>=0){this.discardQueued(old);this.captureDiagnostics.sceneReplacements++;}
        if(this.pending.length>=FRAME_QUEUE_LIMIT||this.queuedBytes+frame.png.length>FRAME_QUEUE_BYTES){this.rejectFrame('scene-capacity');return false;}
        // Reuse the same immutable compressed PNG. Count its bytes again
        // conservatively, so the existing shared memory cap cannot be weakened.
        this.pending.push({...frame,key:`frame:${frame.hash}`,kind:'scene',priority:false,region:null,referenceSize:null});this.queuedBytes+=frame.png.length;this.captureDiagnostics.sceneCopies++;return true;
    }
    async start({mode,sourceId,sessionId,region=null,referenceSize=null} = {}) {
        if (!MODES.has(mode) || (sourceId!==undefined && typeof sourceId!=='string') || (sessionId!==undefined && !/^[\w-]{1,120}$/.test(sessionId))) throw new Error('Invalid screen-reading session.');
        if (this.disposed) throw new Error('Screen reading has closed.');
        const selection=normalizeCaptureRegion(region,referenceSize);
        const source = sourceId ? this.choices.find(choice=>choice.id===sourceId) : this.source;
        if (!source) throw new Error('Choose a currently available game window or display first.');
        if (this.owner==='character' && mode==='contribution') {
            this.contributionResume = {source,sessionId:sessionId||crypto.randomUUID(),...selection}; this.emitStatus(); return this.getStatus();
        }
        const previous = this.owner==='contribution' && this.phase==='running' ? {source:this.source,sessionId:this.sessionId,region:this.region,referenceSize:this.referenceSize}:null;
        const revision=++this.revision; await this.cancelWork({destroySource:true});
        if(revision!==this.revision||this.disposed)return this.getStatus();
        if (mode==='character' && previous) this.contributionResume = previous;
        this.enabled = true; this.owner = mode; this.sessionId = sessionId || crypto.randomUUID();
        this.source = source; this.phase = 'selecting'; this.error = null; this.ownerStartedAt = this.now(); this.seen.clear();
        this.region=selection?.region||null;this.referenceSize=selection?.referenceSize||null;this.sourceSize=null;this.calibrationWarning=null;
        this.readWarning=null;this.frameWarning=null;this.readErrors=0;this.nextReadAt=0;
        this.overflowFrames=0;this.queueWarning=null;
        this.lastReadAt=null;this.lastReadItemCount=null;
        this.emitStatus();
        try {
            await this.journal.initialize();
            if(revision!==this.revision||this.disposed)return this.getStatus();
            await this.startSource();
        } catch (error) {
            if(revision!==this.revision||this.disposed)return this.getStatus();
            this.phase='error';this.error=clean(error.message,500);this.emitStatus();throw error;
        }
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
        window.on('closed',()=>{if(this.captureWindow===window&&!this.disposed)void this.fail('The capture window closed. Resume capture to choose the game window again.');});
        await window.loadURL(captureUrl);
        if (this.captureWindow!==window || this.disposed) return;
        // Static call into our own isolated page, with the initiating user's gesture.
        this.sourceTimer=setTimeout(()=>{if(this.captureWindow===window&&this.phase==='selecting')void this.fail('Screen capture did not start. Choose the game window again.');},15000);
        void window.webContents.executeJavaScript('window.startScreenReadCapture()',true).catch(()=>{
            if(this.captureWindow===window&&!this.disposed)void this.fail('Screen capture did not start. Choose the game window again.');
        });
    }
    async handleSource(event,action,value) {
        // Already queued IPC from our own destroyed source carries no remaining
        // authority. Deny it quietly instead of logging a normal Stop race.
        if(this.retiredSources.has(event.sender))return action==='configuration'?{allowed:false,capture:null}:action==='frame'?{accepted:false,stale:true}:{ok:false};
        if (!this.isSource(event) || this.disposed) throw new Error('Capture source is unavailable.');
        if (action==='configuration') return {allowed:this.enabled&&this.phase==='selecting',intervalMs:1000,encodeIntervalMs:1000,heartbeatMs:1000,
            capture:this.enabled&&!this.hold&&['selecting','running'].includes(this.phase)?{generation:this.generation,owner:this.owner,sessionId:this.sessionId,sourceId:this.source?.id,region:this.region}:null};
        if (action==='started') { if(!this.enabled||this.phase!=='selecting')return {ok:false};clearTimeout(this.sourceTimer);this.sourceTimer=null;this.phase='running';this.error=null;this.emitStatus();return {ok:true}; }
        if (action==='frame-error') { if(this.enabled&&this.phase==='running'){this.frameWarning='A capture frame was unavailable. Waiting for the selected game window.';this.emitStatus();}return {ok:true}; }
        if (action==='sample-drop') {
            if(this.enabled&&this.phase==='running'&&['capacity','age','encode'].includes(value?.reason)&&Number.isInteger(value.count)&&value.count>=1&&value.count<=100){
                for(let n=0;n<value.count;n++){this.captureDiagnostics.sourceDropped++;this.noteOverflow(`source-${value.reason}`);}this.emitFrameStatus();return {ok:true};
            }return {ok:false};
        }
        if (action==='error' || action==='ended') { await this.fail(action==='ended'?'The selected capture source ended. Choose it again.':clean(value,500));return {ok:false}; }
        if (action==='frame') return this.submitFrame(value);
        throw new Error('Unknown capture source action.');
    }
    async fail(message) {
        this.phase='error';this.error=clean(message,500);this.revision++;
        await this.cancelWork({destroySource:true});this.emitStatus();
    }
    async stop({mode,expectedSessionId,expectedSourceId} = {}) {
        if (mode!==undefined && !MODES.has(mode)) throw new Error('Invalid capture mode.');
        const expected=expectedSessionId!==undefined||expectedSourceId!==undefined;
        if(expected&&(typeof expectedSessionId!=='string'||/^[\w-]{1,120}$/.test(expectedSessionId)===false||
            typeof expectedSourceId!=='string'||!expectedSourceId.length||expectedSourceId.length>512||/[\u0000-\u001f\u007f]/.test(expectedSourceId)))throw new Error('Invalid expected capture session.');
        if(expected){
            // Popup cleanup can arrive after another reader has taken over.
            // Under Character ownership it may cancel only its own queued
            // contribution, never a later request waiting to resume.
            const target=this.owner==='character'&&mode==='contribution'?this.contributionResume:this;
            if(target?.sessionId!==expectedSessionId||target?.source?.id!==expectedSourceId)return this.getStatus();
        }
        if (this.owner==='character' && mode==='contribution') { this.contributionResume=null;this.emitStatus();return this.getStatus(); }
        if(mode&&this.owner&&mode!==this.owner)return this.getStatus();
        const restore = this.owner==='character' && mode==='character' ? this.contributionResume:null;
        const revision=++this.revision; this.contributionResume=null;this.enabled=false;this.phase='disabled';this.owner=null;this.sessionId='';
        await this.cancelWork({destroySource:true});this.emitStatus();
        if (revision===this.revision && restore && this.choices.some(source=>source.id===restore.source.id)) return this.start({mode:'contribution',sourceId:restore.source.id,sessionId:restore.sessionId,region:restore.region,referenceSize:restore.referenceSize});
        return this.getStatus();
    }
    async pause() {
        this.revision++;this.phase='paused';this.contributionResume=null;await this.cancelWork({destroySource:true});this.emitStatus();return this.getStatus();
    }
    async resume() {
        if (!this.enabled || !this.owner || !this.source) throw new Error('Choose a capture source first.');
        const revision=this.revision;await this.listSources();
        if(revision!==this.revision||this.disposed)return this.getStatus();
        if(!this.choices.some(source=>source.id===this.source.id)){await this.fail('The selected game window is no longer available. Choose a source and start capture again.');return this.getStatus();}
        return this.start({mode:this.owner,sourceId:this.source.id,sessionId:this.sessionId,region:this.region,referenceSize:this.referenceSize});
    }
    preview() {
        if(this.disposed||this.phase!=='running'||!this.lastFrame||this.lastFrame.sourceId!==this.source?.id)throw new Error('Start capture and wait for a frame before calibrating.');
        const image=this.electron.nativeImage.createFromBuffer(this.lastFrame.png),sourceSize=image.getSize();
        const scale=Math.min(1,1200/sourceSize.width,800/sourceSize.height);
        const thumbnail=scale===1?image:image.resize({width:Math.max(1,Math.round(sourceSize.width*scale)),height:Math.max(1,Math.round(sourceSize.height*scale)),quality:'best'});
        return {dataUrl:thumbnail.toDataURL(),sourceSize,sourceId:this.source.id,owner:this.owner,sessionId:this.sessionId,region:this.region,referenceSize:this.referenceSize};
    }
    pruneItemEvidence(){
        for(const [token,entry] of this.itemEvidenceFrames)if(this.now()-Date.parse(entry.proof.capturedAt)>ITEM_EVIDENCE_TTL)this.itemEvidenceFrames.delete(token);
    }
    prepareItemEvidence(observation,context,id){
        const {frame,image,input,result}=context||{};
        if(observation.kind!=='ocr'||observation.owner!=='contribution'||observation.subject?.kind!=='item'||observation.parser?.name!=='item-examine'||!frame?.region||frame.kind!=='visual-item'||frame.configuredRegion)return null;
        if(frame.owner!==this.owner||frame.sessionId!==this.sessionId||frame.generation!==this.generation||frame.sourceId!==this.source?.id||this.phase!=='running'||this.hold||this.now()-frame.capturedAt>ITEM_EVIDENCE_TTL)return null;
        const crop=input?.region,size=frame.size;
        if(!crop||!size||!['x','y','width','height'].every(key=>Number.isSafeInteger(crop[key]))||crop.x<0||crop.y<0||crop.width<32||crop.height<32||crop.x+crop.width>size.width||crop.y+crop.height>size.height||crop.width*crop.height>3*1024*1024||crop.x===0&&crop.y===0&&crop.width===size.width&&crop.height===size.height)return null;
        // Only the detected item's exact visual ROI is retained. A configured
        // rectangle may include unrelated UI despite parsing just one item.
        // Scenes, calibration rectangles and ambiguous reads are never attached.
        const cropped=image.crop(crop),png=cropped.toPNG();if(cropped.isEmpty()||png.length>8*1024*1024)return null;
        const proof={token:crypto.randomBytes(24).toString('hex'),observationId:id,frameId:frame.hash,sessionId:frame.sessionId,generation:frame.generation,sourceId:frame.sourceId,capturedAt:observation.capturedAt};
        let iconDataUrl;
        // Default Modern hover panes leave a distinct icon cell to the left of
        // aligned Class/Race labels. Other layouts retain manual icon paste.
        if(frame.kind==='visual-item'&&Number.isFinite(input.scale)&&input.scale>0){
            const words=Array.isArray(result?.words)?result.words:[],classWord=words.find(word=>/^class:?$/i.test(String(word.text||'').trim())&&word.bbox),box=classWord?.bbox;
            const race=box&&words.find(word=>/^race:?$/i.test(String(word.text||'').trim())&&word.bbox&&Math.abs(word.bbox.x0-box.x0)<(box.y1-box.y0)*1.5&&word.bbox.y0>box.y0&&word.bbox.y0-box.y0<(box.y1-box.y0)*4);
            const font=box?(box.y1-box.y0)/input.scale:0,left=box?box.x0/input.scale:0,top=box?box.y0/input.scale:0;
            if(race&&font>=6&&font<=36&&left>=font*3.5&&left<=font*9&&top>=font*2&&top<=font*7){
                const inset=Math.max(2,Math.floor(font*.5)),edge=Math.floor(left-font*1.5);
                if(edge>=24&&edge<=128&&inset+edge<crop.width&&inset+edge<crop.height){
                    const icon=cropped.crop({x:inset,y:inset,width:edge,height:edge}),pixels=icon.toBitmap?.({scaleFactor:1});let colored=0;
                    if(pixels)for(let index=0;index<pixels.length;index+=4)if(Math.max(pixels[index],pixels[index+1],pixels[index+2])-Math.min(pixels[index],pixels[index+1],pixels[index+2])>30)colored++;
                    if(colored>=Math.max(10,edge*edge*.01)){const bytes=icon.toPNG();if(bytes.length<=1024*1024)iconDataUrl='data:image/png;base64,'+bytes.toString('base64');}
                }
            }
        }
        const nativeObservation=JSON.parse(JSON.stringify({...observation,id})),bytes=png.length+(iconDataUrl?.length||0)+Buffer.byteLength(JSON.stringify(nativeObservation));
        this.pruneItemEvidence();while(this.itemEvidenceFrames.size>=ITEM_EVIDENCE_LIMIT||[...this.itemEvidenceFrames.values()].reduce((sum,entry)=>sum+entry.bytes,0)+bytes>ITEM_EVIDENCE_BYTES)this.itemEvidenceFrames.delete(this.itemEvidenceFrames.keys().next().value);
        this.itemEvidenceFrames.set(proof.token,{proof,observation:nativeObservation,png,bytes,width:crop.width,height:crop.height,...(iconDataUrl?{iconDataUrl}:{})});return proof;
    }
    getItemEvidence(proof){
        this.pruneItemEvidence();const entry=proof&&this.itemEvidenceFrames.get(proof.token),keys=['token','observationId','frameId','sessionId','generation','sourceId','capturedAt'];
        if(this.disposed||this.phase!=='running'||this.hold||this.owner!=='contribution'||!entry||keys.some(key=>entry.proof[key]!==proof[key])||entry.proof.generation!==this.generation||entry.proof.sessionId!==this.sessionId||entry.proof.sourceId!==this.source?.id)throw Error('This item image is no longer current. Keep its examine window visible for a fresh reading, or paste a screenshot.');
        return {...entry,observation:JSON.parse(JSON.stringify(entry.observation)),proof:{...entry.proof},png:Buffer.from(entry.png)};
    }
    itemEvidence(proof){const entry=this.getItemEvidence(proof);return{proof:entry.proof,dataUrl:'data:image/png;base64,'+entry.png.toString('base64'),width:entry.width,height:entry.height,...(entry.iconDataUrl?{iconDataUrl:entry.iconDataUrl}:{})};}
    async setRegion({region=null,referenceSize=null,sourceId,sessionId}={}) {
        if(this.disposed||this.phase!=='running'||this.hold||!this.lastFrame||sourceId!==this.source?.id||sessionId!==this.sessionId)throw new Error('Capture changed. Open a fresh calibration preview.');
        const selection=normalizeCaptureRegion(region,referenceSize);
        if(selection&&(selection.referenceSize.width!==this.sourceSize?.width||selection.referenceSize.height!==this.sourceSize?.height))throw new Error('Capture size changed. Open a fresh calibration preview.');
        const revision=++this.revision;this.hold=true;this.advanceGeneration();this.clearPending();this.emitStatus();
        try{
            await this.ocr.stop();if(this.processing)await this.processing.catch(()=>{});
            if(revision===this.revision&&!this.disposed){
                this.region=selection?.region||null;this.referenceSize=selection?.referenceSize||null;this.calibrationWarning=null;this.seen.clear();
            }
        }finally{this.hold=false;this.emitStatus();}
        return this.getStatus();
    }
    submitFrame(value) {
        const submittedAt=Date.now();
        if (this.phase!=='running' || this.hold || !this.owner) {this.rejectFrame('inactive');return {accepted:false};}
        if(value?.captureGeneration!==this.generation||value?.owner!==this.owner||value?.sessionId!==this.sessionId||value?.sourceId!==this.source?.id){this.rejectFrame('stale');return {accepted:false,stale:true};}
        if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width<1 || value.height<1 ||
            value.width*value.height>16*1024*1024 || !value.bytes || value.bytes.byteLength>32*1024*1024 ||
            !Number.isFinite(value.capturedAt) || value.capturedAt<this.ownerStartedAt || this.now()-value.capturedAt>30000||value.capturedAt>this.now()+1000) throw new Error('Invalid capture frame.');
        const png = Buffer.from(value.bytes);
        validateCapturePng(png,{width:value.width,height:value.height});
        const kind=value.selectionKind===undefined?'legacy':value.selectionKind;
        if(!['legacy','configured','scene','visual-item'].includes(kind))throw new Error('Invalid capture selection.');
        let automatic=null;
        if(kind==='visual-item'){
            if(typeof value.visualKey!=='string'||!/^[a-f0-9]{16}$/.test(value.visualKey))throw new Error('Invalid visual capture identity.');
            automatic=normalizeCaptureRegion(value.itemRegion,{width:value.width,height:value.height});
            if(!automatic)throw new Error('Invalid visual capture region.');
        }
        // Queue compressed PNGs only. Native decode waits until the serial OCR
        // slot, so a brief tooltip cannot create many large decoded images.
        const size={width:value.width,height:value.height};
        const sizeChanged=this.sourceSize?.width!==size.width||this.sourceSize?.height!==size.height;
        if(this.sourceSize&&sizeChanged){this.advanceGeneration(value.capturedAt);this.clearPending();this.seen.clear();}
        this.sourceSize=size;
        if(this.region&&(this.referenceSize.width!==size.width||this.referenceSize.height!==size.height)){
            this.region=null;this.referenceSize=null;this.calibrationWarning='The capture size changed. Region calibration was reset to the full frame.';
            this.clearPending();this.seen.clear();
        }
        this.lastFrame = {png,at:value.capturedAt,sourceId:this.source?.id};
        const recoveredFrame=Boolean(this.frameWarning);this.frameWarning=null;
        if(sizeChanged||recoveredFrame)this.emitStatus();
        if(this.now()<this.nextReadAt){this.skippedFrames++;this.rejectFrame('retry');return {accepted:false,retrying:true};}
        const hash=digest(png),configuredKey=this.region&&typeof value.visualKey==='string'&&/^[a-f0-9]{16}$/.test(value.visualKey)?value.visualKey:null;
        const key=configuredKey?`roi:${configuredKey}`:automatic&&!this.region?`pane:${value.visualKey}`:`frame:${hash}`;
        this.prunePending();
        const base={png,hash,size,capturedAt:value.capturedAt,generation:this.generation,owner:this.owner,sessionId:this.sessionId,sourceId:this.source?.id};
        const sharedScene=kind==='visual-item'&&!this.region&&value.sceneFallback===true;
        if(this.recentlySeen(key)||(this.activeFrameGeneration===this.generation&&this.activeFrameHash===key)||this.pending.some(frame=>frame.key===key)){
            this.skippedFrames++;this.rejectFrame('duplicate');const sceneAccepted=sharedScene&&this.queueSceneReference(base);if(sceneAccepted){this.startPump();this.emitFrameStatus();}return {accepted:false,duplicate:true,...(sceneAccepted?{sceneAccepted:true}:{})};
        }
        // Animated scenery gets one replaceable fallback slot. It cannot evict
        // an item proposal, and proposals are read before that latest scene.
        if(kind==='scene'){
            const old=this.pending.findIndex(frame=>frame.kind==='scene');if(old>=0){this.discardQueued(old);this.captureDiagnostics.sceneReplacements++;}
            if(this.pending.length>=FRAME_QUEUE_LIMIT||this.queuedBytes+png.length>FRAME_QUEUE_BYTES){this.skippedFrames++;this.rejectFrame('scene-capacity');return {accepted:false,lowPriority:true};}
        }
        while(this.pending.length>=FRAME_QUEUE_LIMIT||this.queuedBytes+png.length>FRAME_QUEUE_BYTES){const scene=this.pending.findIndex(frame=>frame.kind==='scene');this.discardQueued(scene<0?0:scene);this.noteOverflow('capacity');}
        const selection=this.region?{region:{...this.region},referenceSize:{...this.referenceSize}}:automatic;
        const frame = {...base,key,kind,priority:kind==='visual-item'||kind==='configured',configuredRegion:Boolean(this.region),
            region:selection?.region||null,referenceSize:selection?.referenceSize||null};
        const scene=this.pending.findIndex(frame=>frame.kind==='scene');this.pending.splice(kind==='scene'||scene<0?this.pending.length:scene,0,frame);this.queuedBytes+=png.length;
        this.captureDiagnostics.accepted++;if(kind==='visual-item')this.captureDiagnostics.visualCandidates++;
        const encode=value.sourceTiming?.encodeMs;this.captureDiagnostics.lastEncodeMs=Number.isFinite(encode)&&encode>=0&&encode<=120000?encode:null;
        const sourceQueue=value.sourceTiming?.sourceQueueMs;this.captureDiagnostics.lastSourceQueueMs=Number.isFinite(sourceQueue)&&sourceQueue>=0&&sourceQueue<=120000?sourceQueue:null;
        this.captureDiagnostics.lastTransportMs=this.captureDiagnostics.lastEncodeMs===null?null:Math.max(0,this.now()-value.capturedAt-encode-(this.captureDiagnostics.lastSourceQueueMs??0));
        if(sharedScene)this.queueSceneReference(base);
        // Acknowledge the bounded compressed frame before native resize/PNG
        // preparation runs on main. The single serial OCR pump is unchanged.
        this.startPump();
        this.captureDiagnostics.lastSubmissionMs=Date.now()-submittedAt;
        this.emitFrameStatus();
        return {accepted:true,queued:this.pending.length};
    }
    async pump() {
        while (this.pending.length && !this.disposed) {
            this.prunePending();if(!this.pending.length)break;
            const fallback=this.priorityReads>=3?this.pending.findIndex(frame=>frame.kind==='scene'):-1;
            const frame = this.discardQueued(fallback<0?0:fallback);this.activeFrameHash=frame.key;this.activeFrameGeneration=frame.generation;this.captureDiagnostics.lastQueueMs=Math.max(0,this.now()-frame.capturedAt);this.emitFrameStatus();
            const readAt=Date.now();
            const isCurrent=()=>frame.generation===this.generation&&!this.disposed&&this.phase==='running'&&!this.hold&&frame.owner===this.owner&&frame.sessionId===this.sessionId&&frame.sourceId===this.source?.id;
            try {
                const delay=Math.max(0,OCR_INTERVAL-(Date.now()-this.ocrStartedAt));
                if(delay)await new Promise(resolve=>{const timer=setTimeout(()=>{this.readDelay=null;resolve();},delay);this.readDelay={timer,resolve};});
                if(!isCurrent())continue;this.ocrStartedAt=Date.now();
                const image=this.electron.nativeImage.createFromBuffer(frame.png),size=image.getSize();
                if(image.isEmpty()||size.width!==frame.size.width||size.height!==frame.size.height)throw new Error('Invalid capture dimensions.');
                const read=await recognizeCaptureImage({ocr:this.ocr,image,region:frame.region,referenceSize:frame.referenceSize,nativeImage:this.electron.nativeImage,isCurrent,characterOnly:frame.owner==='character'});
                if (!isCurrent()) continue;
                if(read.cancelled)continue;
                if(read.warning)this.calibrationWarning=read.warning;
                const {parseScreenRead} = await this.parseModule;
                const observations = parseScreenRead({...read.result,owner:frame.owner,sessionId:frame.sessionId,
                    capturedAt:new Date(frame.capturedAt).toISOString(),input:{...read.input,frameId:frame.hash,captureGeneration:frame.generation,sourceId:frame.sourceId,...(frame.kind!=='legacy'?{captureSelection:this.region?'configured':frame.kind}: {})}});
                const evidenceContext=observations.length===1&&observations[0].subject?.kind==='item'?{frame,image,input:read.input,result:read.result}:null;
                for (const observation of observations) await this.saveObservation(observation,frame.generation,evidenceContext);
                if(!isCurrent())continue;
                this.lastReadAt=this.now();this.lastReadItemCount=observations.filter(observation=>observation.subject?.kind==='item').length;
                this.priorityReads=frame.priority?this.priorityReads+1:0;
                this.captureDiagnostics.completedReads++;if(!observations.length)this.captureDiagnostics.emptyReads++;this.captureDiagnostics.lastReadMs=Date.now()-readAt;this.captureDiagnostics.lastSelection=frame.kind;
                this.readWarning=null;this.readErrors=0;this.nextReadAt=0;
                this.remember(frame.key);
            } catch (error) {
                if (frame.generation===this.generation && !this.disposed) {
                    // A timeout or unreadable frame does not revoke the user's
                    // selected stream. Retry later with one fresh worker, keeping
                    // the Character session and its queued observations intact.
                    this.readErrors++;this.nextReadAt=this.now()+Math.min(30000,2000*2**Math.min(this.readErrors-1,4));
                    this.readWarning=`Screen reading will retry: ${clean(error.message,380)}`;this.clearPending();this.emitStatus();
                    await this.ocr.stop();
                }
            }finally{if(this.activeFrameHash===frame.key){this.activeFrameHash=null;this.activeFrameGeneration=null;}this.emitFrameStatus();}
        }
    }
    remember(key) { this.seen.set(key,this.now());if(this.seen.size>2000)this.seen.delete(this.seen.keys().next().value); }
    async saveObservation(observation,generation=this.generation,evidenceContext=null) {
        const values=(observation.fields||[]).map(field=>[field.key,field.value]).sort((a,b)=>a[0].localeCompare(b[0]));
        const semantic = JSON.stringify([observation.owner,observation.sessionId,observation.subject,values,observation.relations||[],
            observation.kind==='game-log'?[observation.input?.logId,observation.input?.cursor,observation.capturedAt]:null]);
        const key=digest(semantic);if(observation.kind!=='manual'&&(observation.kind==='game-log'?this.seen.has(key):this.recentlySeen(key))){this.captureDiagnostics.semanticDuplicates++;return null;}
        if(observation.kind!=='game-log'&&generation!==this.generation || this.disposed)return null;
        const id=crypto.randomUUID();let proof;
        try{proof=this.prepareItemEvidence(observation,evidenceContext,id);}catch{/* OCR fields remain useful when a bounded image crop is unavailable. */}
        let record;
        try{record=await this.journal.append({...observation,...(proof?{input:{...observation.input,captureEvidence:proof}}:{}),id,dedupKey:key});}
        catch(error){if(proof)this.itemEvidenceFrames.delete(proof.token);throw error;}
        if(observation.kind!=='game-log'&&generation!==this.generation || this.disposed)return null;
        this.remember(key);this.lastObservationAt=record.recordedAt;
        const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('eye-of-zomm:capture-observation',record);
        try{this.onObservation(record);}catch{}
        return record;
    }
    async ingestLogObservation(event,context={}) {
        if(!['kill','loot','zone'].includes(event?.type))return {accepted:false};
        const {logContributionObservation}=await this.logEvidenceModule;
        const cursor=Number.isSafeInteger(context.cursor)?context.cursor:++this.sequence;
        const observation=logContributionObservation(event,{...context,cursor},{now:this.now()});
        if(!observation)return {accepted:false};
        // Match the direct queue gate and evidence contract. Only this bounded
        // triggering line is retained in the private journal, never a log path
        // or surrounding chat, and never the hourly observation payload.
        const relations=observation.relations.map(relation=>relation.type==='drop-source'?{...relation,reviewRequired:relation.evidence!=='explicit-corpse'}:relation);
        const record=await this.saveObservation({...observation,sessionId:`log-${observation.input.logId}`,
            parser:{name:'eq-log',version:2},relations},this.generation);
        return {accepted:Boolean(record)};
    }
    async importImage({mode,sessionId,source='file'}={}) {
        if((mode!==undefined&&!MODES.has(mode))||(sessionId!==undefined&&!/^[\w-]{1,120}$/.test(sessionId)))throw new Error('Invalid screenshot review session.');
        if(!['file','clipboard'].includes(source))throw new Error('Choose a screenshot file or paste an image.');
        if(this.hold)throw new Error('Another screenshot is already being read.');
        let png,image;
        if(source==='clipboard'){
            image=this.electron.clipboard.readImage();
            if(!image||image.isEmpty())throw new Error('Copy an item screenshot to the clipboard, then paste it here.');
            const size=image.getSize();if(size.width*size.height>16*1024*1024)throw new Error('Choose an image smaller than 16 megapixels.');
            png=image.toPNG();if(png.length>32*1024*1024)throw new Error('Choose an image smaller than 32 MB.');validateCapturePng(png);
        }else{
            const answer=await this.electron.dialog.showOpenDialog(this.getMainWindow(),{title:'Read an item or character screenshot',properties:['openFile'],filters:[{name:'PNG screenshots',extensions:['png']}]});
            if(answer.canceled||!answer.filePaths?.length)return {cancelled:true};
            const target=answer.filePaths[0],stat=await fs.stat(target);
            if(!stat.isFile()||stat.size>32*1024*1024)throw new Error('Choose an image smaller than 32 MB.');
            png=await fs.readFile(target);validateCapturePng(png);image=this.electron.nativeImage.createFromBuffer(png);
        }
        return this.importPng(png,{mode,sessionId});
    }
    async importPng(png,{mode='contribution',sessionId}={}) {
        if(!Buffer.isBuffer(png)||png.length>32*1024*1024||!MODES.has(mode))throw new Error('Invalid screenshot pixels.');
        validateCapturePng(png);
        const image=this.electron.nativeImage.createFromBuffer(png),size=image.getSize();
        if(image.isEmpty()||size.width*size.height>16*1024*1024)throw new Error('Choose an image smaller than 16 megapixels.');
        if(this.hold)throw new Error('Another screenshot is already being read.');
        this.hold=true;this.advanceGeneration();this.clearPending();
        const generation=this.generation,owner=mode||this.owner||'contribution';
        const reviewSession=sessionId||(owner===this.owner?this.sessionId:null)||crypto.randomUUID();
        try{
            await this.ocr.stop();if(this.processing)await this.processing.catch(()=>{});
            if(generation!==this.generation||this.disposed)return {records:[],cancelled:true};
            const read=await recognizeCaptureImage({ocr:this.ocr,image,nativeImage:this.electron.nativeImage,isCurrent:()=>generation===this.generation&&!this.disposed,characterOnly:owner==='character'});
            if(read.cancelled||generation!==this.generation||this.disposed)return {records:[],cancelled:true};
            const {parseScreenRead}=await this.parseModule;
            const records=[];
            for(const observation of parseScreenRead({...read.result,kind:'manual',owner,sessionId:reviewSession,
                capturedAt:new Date(this.now()).toISOString(),input:{...read.input,frameId:digest(png),sourceId:null,captureGeneration:generation}})){
                const record=await this.saveObservation(observation,generation);if(record)records.push(record);
            }
            return {records,message:records.length?'Screenshot read. Review the proposed fields.':'No item examine or character stat block was recognized. Try a larger, clearer screenshot.'};
        }finally{
            this.hold=false;this.emitStatus();
        }
    }
    async captureScreenshot({sourceId}={}) {
        if(this.hold)throw new Error('A screenshot is already in progress.');
        this.hold=true;const revision=this.revision;this.advanceGeneration();this.clearPending();
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
        clearTimeout(this.frameStatusTimer);this.frameStatusTimer=null;
        this.electron.ipcMain.removeHandler(CHANNEL);this.electron.ipcMain.removeHandler(SOURCE_CHANNEL);
        await this.cancelWork({destroySource:true});await this.journal.close();
    }
}
module.exports={CaptureHost,CHANNEL,SOURCE_CHANNEL,preferredCaptureSource};
