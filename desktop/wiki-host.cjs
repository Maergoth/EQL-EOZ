'use strict';
const {WikiClient,WikiError,PRODUCTION_ORIGIN,validatePNG}=require('./wiki-client.cjs');
const CHANNEL='eye-of-zomm:wiki';

class WikiHost {
    constructor({electron,origin,getMainWindow,stateDir,version,devWikiOrigin=null,allowLoopbackDevelopment=false,client=null,onStatus=null}) {
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.disposed=false;this.loginWindow=null;this.onStatus=onStatus;
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
            case 'status':await this.client.load();return await this.client.status();
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
        }catch(error){throw new Error(`${error.code?`[${error.code}] `:''}${String(error.message||'The wiki action failed.').slice(0,600)}`);}
    }
    publishStatus(){
        if(this.disposed)return;
        this.client.status().then(status=>{if(this.disposed)return;if(typeof this.onStatus==='function')this.onStatus(status);else{const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('eye-of-zomm:wiki-state',status);}}).catch(()=>{});
    }
    login(){
        if(this.disposed)throw new WikiError('closed','Wiki login has closed.');
        if(this.loginWindow&&!this.loginWindow.isDestroyed()){this.loginWindow.show();this.loginWindow.focus();return {opening:true};}
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
        if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();
        await this.session.clearStorageData();await this.session.clearCache();await this.client.clearAccountState();this.publishStatus();return {authenticated:false,user:null};
    }
    dispose(){this.disposed=true;this.electron.ipcMain.removeHandler(CHANNEL);this.session.removeListener?.('will-download',this.downloadHandler);if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();this.loginWindow=null;}
}
module.exports={WikiHost,CHANNEL};
