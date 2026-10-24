'use strict';
const {randomUUID}=require('node:crypto');
const CHANNEL='eye-of-zomm:renderer-drain';
// The main frame confirms local persistence before a normal close/reload.
// Network upload is deliberately outside this short shutdown barrier.
class RendererDrain {
    constructor({ipcMain,origin,getMainWindow,timeout=8000}) {
        Object.assign(this,{ipcMain,origin,getMainWindow,timeout});this.ready=false;this.pending=null;
        ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    allowed(event){const main=this.getMainWindow();return Boolean(main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    handle(event,action,value){
        if(!this.allowed(event))throw Error('Only the main app can confirm local persistence.');
        if(action==='ready'&&value===undefined){this.ready=true;return true;}
        if(action==='complete'&&value&&Object.keys(value).length===2&&typeof value.id==='string'&&typeof value.ok==='boolean'&&this.pending?.id===value.id){this.pending.finish(value.ok);return true;}
        throw Error('Invalid local persistence confirmation.');
    }
    async drain(){
        const main=this.getMainWindow();if(!this.ready||!main||main.isDestroyed()||main.webContents.isCrashed?.())return true;
        if(this.pending)return this.pending.promise;
        const id=randomUUID();let finish;const promise=new Promise(resolve=>{finish=ok=>{clearTimeout(timer);this.pending=null;resolve(ok);};const timer=setTimeout(()=>finish(false),this.timeout);});
        this.pending={id,promise,finish};main.webContents.send(CHANNEL,{id});return promise;
    }
    reset(){this.ready=false;this.pending?.finish(false);}
    resume(){const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send(CHANNEL,{resume:true});}
    dispose(){this.reset();this.ipcMain.removeHandler(CHANNEL);}
}
module.exports={RendererDrain,CHANNEL};
