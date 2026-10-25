'use strict';
const path=require('node:path');
const NOTICE_PAGE='discovery-notices.html',STATE_CHANNEL='eye-of-zomm:discovery-notices-state';

// One informational surface, independent of the optional Timers overlay.
// The owner alone registers notices; this exact frame can only act on them.
class DiscoveryNoticeWindow {
    constructor({electron,origin,getMainWindow,getState}){
        Object.assign(this,{electron,origin,getMainWindow,getState});
        this.window=null;this.ready=null;this.generation=0;this.disposed=false;this.height=160;this.displayId=null;
        this.reposition=()=>this.position();
        for(const event of ['display-metrics-changed','display-removed','display-added'])electron.screen.on?.(event,this.reposition);
    }
    allowed(event){
        const window=this.window;
        return Boolean(window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/${NOTICE_PAGE}`);
    }
    display(){
        const screen=this.electron.screen,displays=screen.getAllDisplays?.()||[];
        let selected=displays.find(display=>display.id===this.displayId);
        if(!selected){
            const main=this.getMainWindow();
            const bounds=main&&!main.isDestroyed()?main.getBounds?.():null;
            selected=bounds&&screen.getDisplayMatching?.(bounds)||screen.getPrimaryDisplay?.()||displays[0];
            this.displayId=selected?.id??null;
        }
        return selected||{workArea:{x:0,y:0,width:800,height:600}};
    }
    position(){
        const window=this.window;if(!window||window.isDestroyed())return;
        const work=this.display().workArea,padding=Math.min(12,Math.max(0,Math.floor(Math.min(work.width,work.height)/8)));
        const width=Math.max(1,Math.min(380,work.width-2*padding)),height=Math.max(1,Math.min(this.height,work.height-2*padding));
        const bounds={x:Math.round(work.x+work.width-width-padding),y:Math.round(work.y+work.height-height-padding),width,height};
        const current=window.getBounds?.();
        if(!current||Object.keys(bounds).some(key=>bounds[key]!==current[key]))window.setBounds(bounds);
    }
    resize(value){
        if(!Number.isFinite(value)||value<1||value>10000)throw Error('Invalid wiki notice height.');
        this.height=Math.max(1,Math.ceil(value));this.position();return {ok:true};
    }
    publish(){
        const window=this.window;if(!window||window.isDestroyed())return;
        const state=this.getState();window.webContents.send(STATE_CHANNEL,state);
        if(!state.length){window.hide();this.displayId=null;}
    }
    async show(){
        if(this.disposed||!this.getState().length)return;
        let window=this.window;
        if(!window||window.isDestroyed()){
            const generation=++this.generation;
            window=new this.electron.BrowserWindow({title:'Eye of Zomm · Wiki suggestions',width:380,height:this.height,show:false,frame:false,transparent:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#101722',autoHideMenuBar:true,
                webPreferences:{preload:path.join(__dirname,'discovery-notice-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,devTools:false,partition:'eoz-discovery-notices'}});
            this.window=window;
            const session=window.webContents.session;
            session?.setPermissionRequestHandler?.((_contents,_permission,callback)=>callback(false));
            session?.setPermissionCheckHandler?.(()=>false);
            const resources=new Set([NOTICE_PAGE,'discovery-notices.js','discovery-notices.css','wiki-discovery-ui.js'].map(file=>`${this.origin}/${file}`));
            session?.webRequest?.onBeforeRequest?.({urls:['<all_urls>']},(details,callback)=>callback({cancel:!resources.has(details.url)}));
            window.webContents.setWindowOpenHandler?.(()=>({action:'deny'}));
            window.webContents.on('will-navigate',(event,url)=>{if(url!==`${this.origin}/${NOTICE_PAGE}`)event.preventDefault();});
            window.webContents.on('will-redirect',event=>event.preventDefault());
            window.webContents.on('render-process-gone',()=>{if(this.window===window){this.window=null;this.ready=null;}if(!window.isDestroyed())window.destroy();});
            window.on('closed',()=>{if(this.window===window){this.window=null;this.ready=null;}});
            this.ready=window.loadURL(`${this.origin}/${NOTICE_PAGE}`);
            try{await this.ready;}catch(error){if(this.window===window){this.window=null;this.ready=null;}if(!window.isDestroyed())window.destroy();throw error;}
            if(this.disposed||generation!==this.generation||this.window!==window||window.isDestroyed()){if(!window.isDestroyed())window.destroy();return;}
        }
        if(this.ready)await this.ready;
        if(this.disposed||this.window!==window||window.isDestroyed()||!this.getState().length)return;
        this.position();window.setAlwaysOnTop?.(true,'screen-saver');this.publish();window.showInactive();
    }
    clear(){
        this.generation++;const window=this.window;this.window=null;this.ready=null;this.displayId=null;this.height=160;
        if(window&&!window.isDestroyed())window.destroy();
    }
    dispose(){
        this.disposed=true;this.clear();
        for(const event of ['display-metrics-changed','display-removed','display-added'])this.electron.screen.removeListener?.(event,this.reposition);
    }
}
module.exports={DiscoveryNoticeWindow,NOTICE_PAGE,STATE_CHANNEL};
