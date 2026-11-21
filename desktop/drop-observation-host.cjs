'use strict';
const {account,sameAccount}=require('./drop-observation-storage.cjs');
const {SQLiteDropObservationStorage}=require('./drop-observation-sqlite.cjs');
const CHANNEL='eye-of-zomm:observations';
class DropObservationHost{
    constructor({electron,origin,getMainWindow,stateDir,client,version='development',storage,now=Date.now,setIntervalImpl=setInterval,clearIntervalImpl=clearInterval,setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout,autoStart=true,isFeatureEnabled=()=>true,startupAccountReady=Promise.resolve()}={}){
        const url=new URL(origin);if(url.origin!==origin||url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Observation collection requires the local app.');
        if(!client)throw Error('The wiki observation client is required.');
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.client=client;this.version=version;this.now=now;this.storage=storage||new SQLiteDropObservationStorage({directory:stateDir,now});this.clearInterval=clearIntervalImpl;this.owner=null;this.epoch=0;this.closed=false;this.inflight=null;this.error=null;
        this.autoStart=autoStart;this.setTimeout=setTimeoutImpl;this.clearTimeout=clearTimeoutImpl;this.startupPending=true;
        this.startupAccountReady=Promise.resolve(startupAccountReady).catch(()=>{}).then(()=>{this.startupPending=false;});
        this.characterNameSupported=false;this.capabilityCheck=null;
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
        this.isFeatureEnabled=isFeatureEnabled;this.ready=this.storage.initialize();
        if(autoStart){this.timer=setIntervalImpl(()=>{void this.tick().catch(()=>{});},60000);this.timer.unref?.();void Promise.all([this.ready,this.startupAccountReady]).then(async()=>{if(this.closed)return;await this.storage.requestSoon(5000,{owner:this.owner});this.scheduleNext();}).catch(()=>{});}
    }
    allowed(event){const main=this.getMainWindow?.();return !this.closed&&Boolean(main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    status(){return{...this.storage.status(),characterNameSupported:this.characterNameSupported,uploading:Boolean(this.inflight),authenticated:Boolean(this.owner),account:this.owner?{...this.owner}:null,error:this.error||this.storage.status().error};}
    publishStatus(){const main=this.getMainWindow?.();if(main&&!main.isDestroyed())main.webContents.send?.(`${CHANNEL}-state`,this.status());}
    scheduleNext(){if(!this.autoStart||this.closed||this.storage.error)return;if(this.nextTimer)this.clearTimeout(this.nextTimer);this.nextTimer=this.setTimeout(()=>{this.nextTimer=null;void this.tick().catch(()=>{});},Math.max(250,this.storage.status().nextAttemptAt-this.now()));this.nextTimer.unref?.();}
    async handle(event,action,value){if(!this.allowed(event))throw Error('Observation actions are available only in the main app.');await this.ready;if(!this.allowed(event))throw Error('The main app changed before observation collection.');
        if(action==='status'){if(value!==undefined&&value!==null)throw Error('Invalid observation status request.');return this.status();}
        if(action==='configure'){if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(key=>!['enabled','includeCharacterName'].includes(key)||typeof value[key]!=='boolean'))throw Error('Invalid observation preference.');if(Object.hasOwn(value,'enabled'))this.epoch++;await this.storage.configure(value);if(value.enabled){await this.storage.requestSoon(0,{afterLogin:true,owner:this.owner});this.scheduleNext();}this.error=null;this.publishStatus();return this.status();}
        if(action==='collect'){
            if(!this.isFeatureEnabled())return {featureDisabled:true,status:this.status()};if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray(value.events))throw Error('Invalid observation collection.');
            await this.startupAccountReady;if(!this.allowed(event))throw Error('The main app changed before observation collection.');if(!this.isFeatureEnabled())return {featureDisabled:true,status:this.status()};
            try{const result=await this.storage.append(value.events,this.owner);this.error=null;if(result.stored){await this.storage.requestSoon(5000,{owner:this.owner});this.scheduleNext();}return{...result,status:this.status()};}catch(error){this.error='Observations could not be saved. Pending observations were preserved.';throw error;}
        }
        throw Error('Unknown observation action.');
    }
    async accountChanged(status){
        let owner=null;try{if(status?.authenticated)owner=account(status.user);}catch{/* Invalid account status cannot grant an upload. */}
        if(sameAccount(owner,this.owner)||!owner&&!this.owner)return;
        const duringStartup=this.startupPending;this.owner=owner;this.epoch++;this.characterNameSupported=false;this.publishStatus();await this.ready;
        if(owner&&!this.closed&&this.isFeatureEnabled()&&this.storage.status().enabled){await this.storage.requestSoon(0,{afterLogin:!duringStartup,owner:this.owner});void this.refreshCapability().catch(()=>{});this.scheduleNext();}
    }
    async refreshCapability(){
        const owner=this.owner,epoch=this.epoch;if(!owner||this.closed)return null;
        if(this.capabilityCheck?.epoch===epoch)return this.capabilityCheck.promise;
        const current=()=>!this.closed&&epoch===this.epoch&&sameAccount(owner,this.owner);
        const task=(async()=>{try{
            const capability=await this.client.observationStatus();if(!current())return null;
            if(capability?.account&&!sameAccount(capability.account,owner))throw Error('account');
            this.characterNameSupported=capability?.enabled===true&&capability?.available===true&&Array.isArray(capability?.limits?.optionalEventFields)&&capability.limits.optionalEventFields.includes('characterName');
            this.publishStatus();return capability;
        }catch(error){if(current()){this.characterNameSupported=false;this.publishStatus();}throw error;}})();
        const check={epoch,promise:task};this.capabilityCheck=check;
        try{return await task;}finally{if(this.capabilityCheck===check)this.capabilityCheck=null;}
    }
    async tick(){
        await Promise.all([this.ready,this.startupAccountReady]);if(this.inflight){await this.inflight;return this.status();}const state=this.storage.status();if(this.closed||!this.isFeatureEnabled()||!state.enabled||this.storage.error||this.now()<state.nextAttemptAt)return this.status();
        const epoch=this.epoch,current=()=>!this.closed&&this.isFeatureEnabled()&&epoch===this.epoch&&this.storage.status().enabled;
        const task=(async()=>{
            // Persist the attempt before network work so a restart cannot turn
            // every log event into another upload attempt.
            try{
                await this.storage.beginAttempt();if(!current())return;
                if(!this.storage.status().pending){await this.storage.recordAttempt({success:true});return;}
                const status=await this.client.status();if(!current())return;
                if(!status.authenticated||status.blocked){this.owner=null;this.characterNameSupported=false;throw Error('authentication');}
                const owner=account(status.user);if(!sameAccount(owner,this.owner))this.characterNameSupported=false;this.owner=owner;
                const capability=await this.refreshCapability();if(!current())return;
                if(capability?.enabled===false||capability?.available===false)throw Error('disabled');
                if(capability?.account&&!sameAccount(capability.account,owner))throw Error('account');
                const bounded=(value,fallback,min,max)=>Number.isSafeInteger(value)?Math.max(min,Math.min(max,value)):fallback;
                const hourlyLimit=bounded(capability?.limits?.hourlyBatches,12,1,120);
                const maximum=Math.min(10,hourlyLimit),maxEvents=bounded(capability?.limits?.events,100,1,100),maxBytes=bounded(capability?.limits?.bytes,262144,8192,262144);
                let sent=0,quotaAt=0;
                for(let count=0;count<maximum&&current();count++){
                    const batch=await this.storage.prepareBatch(owner,this.version,{characterNameSupported:this.characterNameSupported,maxEvents,maxBytes});if(!current()||!batch)break;
                    const budget=await this.storage.reserveBatchAttempt(batch.batchId,hourlyLimit,owner);if(!current())return;if(!budget.allowed){quotaAt=budget.nextAllowedAt;break;}
                    const receipt=await this.client.submitObservations(batch,{expectedUser:owner});if(!current())return;
                    await this.storage.acknowledge(batch,owner,receipt);sent++;
                }
                if(current()){
                    const remaining=await this.storage.pendingForAccount(owner,{characterNameSupported:this.characterNameSupported,existsOnly:true});if(!current())return;
                    this.error=!this.characterNameSupported&&this.storage.status().pendingWithCharacterName?'The wiki does not currently support public character names. Named observations are retained unchanged.':quotaAt?'The wiki hourly upload allowance is in use. Remaining observations will continue automatically.':null;
                    await this.storage.recordAttempt({success:true,delayMs:quotaAt?Math.max(1000,quotaAt-this.now()):remaining&&sent===maximum?2500:3600000});
                }
            }catch(error){if(current()){this.error=error.message==='authentication'?'Log in to the wiki to send pending observations.':error.message==='disabled'?'Wiki observation storage is unavailable. Pending observations are retained.':'Observation upload was not confirmed. Pending observations are retained for retry.';await this.storage.recordAttempt({success:false,error:this.error,retryAfterMs:error.retryAfterMs||0});}}
        })();this.inflight=task;
        try{await task;}finally{if(this.inflight===task)this.inflight=null;this.publishStatus();if(!this.closed&&this.storage.status().enabled&&this.isFeatureEnabled())this.scheduleNext();}return this.status();
    }
    featuresChanged(){this.epoch++;if(this.isFeatureEnabled())void this.ready.then(()=>this.storage.requestSoon(5000,{owner:this.owner})).then(()=>this.scheduleNext()).catch(()=>{});}
    async close(){if(this.closed)return;this.closed=true;this.epoch++;if(this.timer)this.clearInterval(this.timer);if(this.nextTimer)this.clearTimeout(this.nextTimer);this.electron.ipcMain.removeHandler(CHANNEL);if(this.inflight)await this.inflight.catch(()=>{});await this.storage.close();}
    dispose(){return this.close();}
}
module.exports={DropObservationHost,CHANNEL};
