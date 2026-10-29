'use strict';
const {DropObservationStorage,account,sameAccount}=require('./drop-observation-storage.cjs');
const CHANNEL='eye-of-zomm:observations';
class DropObservationHost{
    constructor({electron,origin,getMainWindow,stateDir,client,version='development',storage,now=Date.now,setIntervalImpl=setInterval,clearIntervalImpl=clearInterval,autoStart=true,isFeatureEnabled=()=>true}={}){
        const url=new URL(origin);if(url.origin!==origin||url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Observation collection requires the local app.');
        if(!client)throw Error('The wiki observation client is required.');
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.client=client;this.version=version;this.now=now;this.storage=storage||new DropObservationStorage({directory:stateDir,now});this.clearInterval=clearIntervalImpl;this.owner=null;this.epoch=0;this.closed=false;this.inflight=null;this.error=null;
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
        this.isFeatureEnabled=isFeatureEnabled;this.ready=this.storage.initialize();
        if(autoStart){this.timer=setIntervalImpl(()=>{void this.tick().catch(()=>{});},60000);this.timer.unref?.();void this.ready.then(()=>this.tick()).catch(()=>{});}
    }
    allowed(event){const main=this.getMainWindow?.();return !this.closed&&Boolean(main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    status(){return{...this.storage.status(),uploading:Boolean(this.inflight),authenticated:Boolean(this.owner),account:this.owner?{...this.owner}:null,error:this.error||this.storage.status().error};}
    async handle(event,action,value){if(!this.allowed(event))throw Error('Observation actions are available only in the main app.');await this.ready;if(!this.allowed(event))throw Error('The main app changed before observation collection.');
        if(action==='status'){if(value!==undefined&&value!==null)throw Error('Invalid observation status request.');return this.status();}
        if(action==='configure'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||typeof value.enabled!=='boolean')throw Error('Invalid observation preference.');this.epoch++;await this.storage.configure(value.enabled);this.error=null;return this.status();}
        if(action==='collect'){if(!this.isFeatureEnabled())return {featureDisabled:true,status:this.status()};if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray(value.events))throw Error('Invalid observation collection.');try{const result=await this.storage.append(value.events,this.owner);this.error=null;return{...result,status:this.status()};}catch(error){this.error='Observations could not be saved. Pending observations were preserved.';throw error;}}
        throw Error('Unknown observation action.');
    }
    async accountChanged(status){
        let owner=null;try{if(status?.authenticated)owner=account(status.user);}catch{/* Invalid account status cannot grant an upload. */}
        if(sameAccount(owner,this.owner)||!owner&&!this.owner)return;
        this.owner=owner;this.epoch++;await this.ready;
        if(owner&&!this.closed){await this.storage.resumeAfterLogin();void this.tick().catch(()=>{});}
    }
    async tick(){
        await this.ready;if(this.inflight){await this.inflight;return this.status();}const state=this.storage.status();if(this.closed||!this.isFeatureEnabled()||!state.enabled||this.storage.error||this.now()<state.nextAttemptAt)return this.status();
        const epoch=this.epoch,current=()=>!this.closed&&this.isFeatureEnabled()&&epoch===this.epoch&&this.storage.status().enabled;
        const task=(async()=>{
            // Persist the attempt before network work so a restart cannot turn
            // every log event into another upload attempt.
            await this.storage.beginAttempt();if(!current())return;
            try{
                if(!this.storage.status().pending){await this.storage.recordAttempt({success:true});return;}
                const status=await this.client.status();if(!current())return;
                if(!status.authenticated||status.blocked){this.owner=null;throw Error('authentication');}
                const owner=account(status.user);this.owner=owner;
                const capability=await this.client.observationStatus();if(!current())return;
                if(capability?.enabled===false||capability?.available===false)throw Error('disabled');
                if(capability?.account&&!sameAccount(capability.account,owner))throw Error('account');
                const maximum=Math.max(1,Math.min(10,Number(capability?.limits?.hourlyBatches)||10));
                for(let count=0;count<maximum&&current();count++){
                    const batch=await this.storage.prepareBatch(owner,this.version);if(!current()||!batch)break;
                    const receipt=await this.client.submitObservations(batch,{expectedUser:owner});if(!current())return;
                    await this.storage.acknowledge(batch,owner,receipt);
                }
                if(current()){this.error=null;await this.storage.recordAttempt({success:true});}
            }catch(error){if(current()){this.error=error.message==='authentication'?'Log in to the wiki to send pending observations.':error.message==='disabled'?'Wiki observation storage is unavailable. Pending observations are retained.':'Observation upload was not confirmed. Pending observations are retained for retry.';await this.storage.recordAttempt({success:false,error:this.error});}}
        })();this.inflight=task;
        try{await task;}finally{if(this.inflight===task)this.inflight=null;}return this.status();
    }
    featuresChanged(){this.epoch++;}
    async close(){if(this.closed)return;this.closed=true;this.epoch++;if(this.timer)this.clearInterval(this.timer);this.electron.ipcMain.removeHandler(CHANNEL);if(this.inflight)await this.inflight.catch(()=>{});await this.storage.close();}
    dispose(){return this.close();}
}
module.exports={DropObservationHost,CHANNEL};
