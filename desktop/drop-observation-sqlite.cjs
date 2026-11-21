'use strict';
const path=require('node:path'),{Worker}=require('node:worker_threads'),{randomUUID}=require('node:crypto');

/** Bounded messages over a worker-owned durable outbox. No queue is loaded into main memory. */
class SQLiteDropObservationStorage{
    constructor({directory,now=Date.now,id=randomUUID}={}){
        if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('A private observation directory is required.');
        this.directory=directory;this.file=path.join(directory,'drop-observations.sqlite');this.now=now;this.id=id;this.pending=new Map();this.sequence=0;this.accepting=true;this.closed=false;this.error=null;
        this.current={enabled:true,includeCharacterName:false,pending:0,pendingWithCharacterName:0,conflicts:0,rejected:0,acknowledged:0,lastAttemptAt:0,lastSuccessAt:0,nextAttemptAt:now(),failures:0,error:null};
    }
    status(){return {...this.current,error:this.error||this.current.error};}
    fail(){
        this.error='Saved observations could not be opened. The original files were preserved; collection and uploads are paused.';
        for(const entry of this.pending.values())entry.reject(Error(this.error));this.pending.clear();
    }
    start(){
        if(this.worker)return;
        this.worker=new Worker(path.join(__dirname,'drop-observation-worker.cjs'),{workerData:{directory:this.directory,file:this.file,legacyFile:path.join(this.directory,'eye-of-zomm-drop-observations.json')}});
        this.exited=new Promise(resolve=>this.worker.once('exit',resolve));
        this.worker.on('message',message=>{const entry=this.pending.get(message.id);if(!entry)return;this.pending.delete(message.id);if(message.status)this.current=message.status;if(message.ok)entry.resolve(message.value);else entry.reject(Error(message.error||'Observation storage is unavailable.'));});
        this.worker.on('error',()=>this.fail());this.worker.on('exit',()=>{if(!this.closed)this.fail();});
    }
    send(action,value){
        if(this.error)return Promise.reject(Error(this.error));
        this.start();const requestId=++this.sequence;
        return new Promise((resolve,reject)=>{this.pending.set(requestId,{resolve,reject});try{this.worker.postMessage({id:requestId,action,value,now:this.now()});}catch(error){this.pending.delete(requestId);reject(error);}});
    }
    initialize(){
        if(!this.loading)this.loading=this.send('initialize').then(()=>this.status()).catch(()=>{this.fail();return this.status();});
        return this.loading;
    }
    async request(action,value){if(!this.accepting)throw Error('Observation storage has closed.');await this.initialize();if(this.error)throw Error(this.error);return this.send(action,value);}
    configure(value){return this.request('configure',value);}
    append(events,owner=null){return this.request('append',{events,owner});}
    pendingForAccount(owner,options={}){return this.request('pendingForAccount',{owner,options});}
    prepareBatch(owner,version,options={}){return this.request('prepareBatch',{owner,version,options,batchId:this.id()});}
    acknowledge(batch,owner,receipt){return this.request('acknowledge',{batch,owner,receipt});}
    beginAttempt(){return this.request('beginAttempt');}
    requestSoon(delayMs=0,options={}){return this.request('requestSoon',{delayMs,options});}
    resumeAfterLogin(owner){return this.requestSoon(0,{afterLogin:true,...(owner===undefined?{}:{owner})});}
    reserveBatchAttempt(batchId,hourlyLimit,owner){return this.request('reserveBatchAttempt',{batchId,hourlyLimit,...(owner===undefined?{}:{owner})});}
    recordAttempt(value){return this.request('recordAttempt',value);}
    async close(){
        if(this.closing)return this.closing;this.accepting=false;
        this.closing=(async()=>{if(!this.worker){this.closed=true;return;}await this.loading;if(!this.error)await this.send('close').catch(()=>{});this.closed=true;if(this.error)await this.worker.terminate();await this.exited;})();
        return this.closing;
    }
}
module.exports={SQLiteDropObservationStorage};
