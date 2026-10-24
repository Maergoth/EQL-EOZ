'use strict';
const {WikiClient,WikiError,PRODUCTION_ORIGIN,validatePNG}=require('./wiki-client.cjs');
const {readBoundedFile}=require('./wiki-attachments.cjs');
const CHANNEL='eye-of-zomm:wiki';

class WikiHost {
    constructor({electron,origin,getMainWindow,stateDir,version,devWikiOrigin=null,allowLoopbackDevelopment=false,client=null,onStatus=null,onAttachmentPrepared=null,onIconRequest=null}) {
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.disposed=false;this.loginWindow=null;this.onStatus=onStatus;
        this.onAttachmentPrepared=onAttachmentPrepared;this.onIconRequest=onIconRequest;
        this.statusRevision=0;
        this.session=electron.session.fromPartition(devWikiOrigin?'eye-of-zomm-wiki-development':'persist:eye-of-zomm-wiki');
        this.client=client||new WikiClient({session:this.session,version,stateDir,origin:devWikiOrigin||PRODUCTION_ORIGIN,allowLoopbackDevelopment});
        this.session.setPermissionRequestHandler?.((_contents,_permission,callback)=>callback(false));
        this.session.setPermissionCheckHandler?.(()=>false);
        this.session.setDevicePermissionHandler?.(()=>false);
        this.downloadHandler=event=>event.preventDefault();this.session.on?.('will-download',this.downloadHandler);
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    allowed(event){const window=this.getMainWindow();return !this.disposed&&Boolean(window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    async handle(event,action,value){
        if(!this.allowed(event))throw new WikiError('sender','Wiki contribution actions are available only in the main app.');
        if(typeof action!=='string')throw new WikiError('action','Invalid wiki action.');
        try{
            switch(action){
            case 'status':{await this.client.load();return await this.freshStatus();}
            case 'observation-status':return await this.client.observationStatus();
            case 'submit-observations':return await this.client.submitObservations(value?.batch,{expectedUser:value?.expectedUser});
            case 'prepare-attachment':return await this.prepareAttachment(value);
            case 'discard-attachment':return await this.client.attachments.discard(String(value?.attachmentId||''));
            case 'icon-catalog':case 'icon-match':if(typeof this.onIconRequest!=='function')throw new WikiError('icon','The wiki icon service is unavailable.');return await this.onIconRequest(action,value);
            case 'login':return this.login();
            case 'logout':return await this.logout();
            case 'matches':return await this.client.findMatches(value);
            case 'blueprints':return await this.client.blueprints({force:value?.force===true});
            case 'prepare-plan':return await this.client.preparePlan(value);
            case 'get-plan':return await this.client.getPlan(String(value?.planId||''));
            case 'submit-plan':return await this.client.submitPlan(value);
            case 'character-sheet-capability':return await this.client.characterSheetCapability();
            case 'share-character':return await this.client.shareCharacter(value);
            case 'upload-character':{
                if(!value||typeof value!=='object')throw new WikiError('png','Invalid character snapshot.');
                const bytes=validatePNG(value.png);
                const image=this.electron.nativeImage.createFromBuffer(bytes);
                if(image.isEmpty())throw new WikiError('png','The snapshot could not be decoded as an image.');
                return await this.client.uploadCharacter(value);
            }
            default:throw new WikiError('action','Unknown wiki action.');
            }
        }catch(error){if(['prepare-attachment','discard-attachment'].includes(action)&&typeof error.code==='string'&&/^E[A-Z]+$/.test(error.code))throw new Error('[attachment] The screenshot could not be read or saved. Select it again.');throw new Error(`${error.code?`[${error.code}] `:''}${String(error.message||'The wiki action failed.').slice(0,600)}`);}
    }
    async prepareAttachment({candidateId,kind,source}={}){
        if(typeof candidateId!=='string'||candidateId.length>160||!/^[A-Za-z0-9_-]+$/.test(candidateId)||!['item','npc','zone','spell'].includes(kind)||!['clipboard','file'].includes(source))throw new WikiError('attachment','Choose a candidate and explicitly paste/select a PNG screenshot.');
        let bytes;
        if(source==='clipboard'){const image=this.electron.clipboard.readImage();if(image.isEmpty())throw new WikiError('attachment','The clipboard does not contain an image.');const size=image.getSize();if(size.width>8192||size.height>8192||size.width*size.height>15000000)throw new WikiError('png','The screenshot exceeds the image size limit.');bytes=image.toPNG();}
        else{const selected=await this.electron.dialog.showOpenDialog(this.getMainWindow(),{title:'Select contribution screenshot',properties:['openFile'],filters:[{name:'PNG screenshot',extensions:['png']}]});if(selected.canceled||!selected.filePaths?.[0])return {cancelled:true};bytes=await readBoundedFile(selected.filePaths[0]);}
        if(this.disposed)throw new WikiError('closed','The wiki service closed.');
        bytes=validatePNG(bytes);const image=this.electron.nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new WikiError('png','The screenshot could not be decoded.');
        const descriptor=await this.client.attachments.add(bytes,{candidateId,kind}),size=image.getSize();
        try{if(kind==='item'&&typeof this.onAttachmentPrepared==='function')await this.onAttachmentPrepared({png:bytes,candidateId,kind});}
        catch(error){descriptor.warning='The screenshot was saved, but its item text could not be read. Review the entry manually.';}
        return {id:descriptor.id,attachmentId:descriptor.id,thumbnail:image.resize({width:240,height:240,quality:'good'}).toDataURL(),width:size.width,height:size.height,bytes:descriptor.bytes,...(descriptor.warning?{warning:descriptor.warning}:{})};
    }
    async forwardStatus(status){
        if(this.disposed)return;
        if(typeof this.onStatus==='function')await this.onStatus(status);
        else{const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('eye-of-zomm:wiki-state',status);}
    }
    async freshStatus(){const revision=++this.statusRevision,status=await this.client.status();if(revision===this.statusRevision)await this.forwardStatus(status);return status;}
    publishStatus(){
        if(this.disposed)return Promise.resolve();
        return this.freshStatus().catch(()=>{});
    }
    login(){
        if(this.disposed)throw new WikiError('closed','Wiki login has closed.');
        if(this.loginWindow&&!this.loginWindow.isDestroyed()){this.loginWindow.show();this.loginWindow.focus();void this.publishStatus();return {opening:true};}
        const window=new this.electron.BrowserWindow({width:1000,height:760,minWidth:640,minHeight:480,title:'Log in to EQL Wiki',autoHideMenuBar:true,backgroundColor:'#0b1420',parent:this.getMainWindow(),webPreferences:{session:this.session,nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false}});
        this.loginWindow=window;
        const trusted=url=>{try{const parsed=new URL(url);return parsed.origin===this.client.origin&&!parsed.username&&!parsed.password;}catch{return false;}};
        const guard=(event,url)=>{if(!trusted(url))event.preventDefault();};
        window.webContents.on('will-navigate',guard);window.webContents.on('will-redirect',guard);
        window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        window.webContents.on('did-finish-load',()=>this.publishStatus());
        window.on('closed',()=>{if(this.loginWindow===window)this.loginWindow=null;this.publishStatus();});
        window.loadURL(`${this.client.origin}/index.php?title=Special:UserLogin&returnto=Help%3AContents`).catch(()=>this.publishStatus());
        return {opening:true};
    }
    async logout(){
        if(this.client.busy)throw new WikiError('busy','Wait for the current wiki submission before logging out.');
        this.statusRevision++;
        if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();
        await this.session.clearStorageData();await this.session.clearCache();await this.client.clearAccountState();this.statusRevision++;const status={origin:this.client.origin,authenticated:false,user:null,canEdit:false,canCreate:false,canUpload:false,blocked:false};await this.forwardStatus(status);void this.publishStatus();return status;
    }
    dispose(){this.disposed=true;this.electron.ipcMain.removeHandler(CHANNEL);this.session.removeListener?.('will-download',this.downloadHandler);if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();this.loginWindow=null;}
}
module.exports={WikiHost,CHANNEL};
