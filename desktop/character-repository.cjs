'use strict';
const path=require('node:path'),fsp=require('node:fs/promises'),{Worker}=require('node:worker_threads'),{randomUUID,createHash}=require('node:crypto');
const {CHANNEL,PROGRESS_CHANNEL,LIMITS,ACTIONS,object,failure,json}=require('./character-repository-contract.cjs');
const {locate,streamExport}=require('./character-import-files.cjs');
class CharacterRepository{
    constructor({directory,electron,origin,getMainWindow,readConfig,getPack,retireLegacy,warn=()=>{}}={}){
        if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('A private Character repository directory is required.');
        this.directory=directory;this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.readConfig=readConfig;this.getPack=getPack;this.retireLegacy=retireLegacy;this.warn=warn;this.pending=new Map();this.sequence=0;this.selectionEpoch=0;this.activeProfileId='draft';this.job=null;this.seed=null;this.closed=false;this.error=null;
        const url=new URL(origin);if(url.origin!==origin||url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Character repository requires the local app origin.');
        this.worker=new Worker(path.join(__dirname,'character-repository-worker.cjs'),{workerData:{directory,file:path.join(directory,'inventory.sqlite'),legacyFile:path.join(path.dirname(directory),'eye-of-zomm-character-storage.json'),appRoot:path.resolve(__dirname,'..')}});
        this.ready=new Promise(resolve=>this.resolveReady=resolve);
        this.worker.on('message',message=>{if(message.ready){this.error=message.error;this.resolveReady();return;}const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);pending.resolve(message.result);});
        this.worker.on('error',error=>this.fail(error));this.worker.on('exit',code=>{if(!this.closed)this.fail(Error(`Character repository worker stopped (${code}).`));});
        if(electron?.ipcMain)electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    fail(error){this.error={code:'repository-unavailable',message:'Saved Character inventory is unavailable. Its original database was preserved.'};this.warn(error.message);this.resolveReady?.();for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.resolve({ok:false,code:this.error.code,error:this.error.message});}this.pending.clear();}
    async retire(result){if(result.ok&&this.retireLegacy){try{result.retirement=await this.retireLegacy(result.migration?.source??null);await fsp.writeFile(path.join(this.directory,'retirement-receipt.json'),JSON.stringify(result.retirement),{mode:0o600});}catch(error){this.warn('The previous Character recovery data was left unchanged: '+error.message);result.retirement={ok:false,error:'The old recovery data was preserved.'};}}return result;}
    async initialize(){await this.ready;const result=await this.request('bootstrap');if(result.ok){this.activeProfileId=result.activeProfileId||'draft';await this.sweepRetainedData();}return this.retire(result);}
    async sweepRetainedData(){
        if(this.sweeping)return this.sweeping;
        this.sweeping=(async()=>{try{
            for(;;){const result=await this.request('collectGarbage');if(!result.ok)throw Error(result.error);if(result.done)break;await new Promise(resolve=>setImmediate(resolve));}
            const directory=path.join(this.directory,'imports'),stat=await fsp.lstat(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!stat)return;if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('The private import directory is unsafe.');
            let batch=[];const prune=async()=>{if(!batch.length)return;const result=await this.request('backupReferences',{names:batch});if(!result.ok)throw Error(result.error);const referenced=new Set(result.referenced);for(const name of batch){if(referenced.has(name))continue;const file=path.join(directory,name),before=await fsp.lstat(file,{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!before||!before.isFile()||before.isSymbolicLink())continue;const current=await fsp.lstat(file,{bigint:true});if(current.isFile()&&!current.isSymbolicLink()&&current.dev===before.dev&&current.ino===before.ino&&current.size===before.size&&current.mtimeNs===before.mtimeNs&&current.ctimeNs===before.ctimeNs)await fsp.unlink(file);}batch=[];};
            for await(const entry of await fsp.opendir(directory)){if(entry.isFile()&&!entry.isSymbolicLink()&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(?:inventory|achievements)\.txt$/u.test(entry.name)){batch.push(entry.name);if(batch.length===50)await prune();}}await prune();
        }catch(error){this.warn('Old inventory recovery snapshots could not be pruned: '+error.message);}finally{this.sweeping=null;}})();return this.sweeping;
    }
    isMain(event){const main=this.getMainWindow?.();return Boolean(!this.closed&&main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    async request(action,value={}){
        await this.ready;if(this.error)return {ok:false,code:this.error.code,error:this.error.message,available:false};if(this.closed)return {ok:false,code:'repository-unavailable',error:'Character storage is closed.'};
        if(this.pending.size>=16)return {ok:false,code:'storage-busy',error:'Too many storage operations are pending. Wait for the current save to finish.'};
        const requestId=++this.sequence;return new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(requestId);this.fail(Error('Storage acknowledgment timed out.'));void this.worker.terminate();resolve({ok:false,code:'outcome-unknown',error:'Storage did not acknowledge this operation. It may have committed. Restart and reload the saved character before making more changes.'});},60000);timer.unref?.();this.pending.set(requestId,{resolve,timer});this.worker.postMessage({id:requestId,action,value});});
    }
    progress(job,value){if(this.job!==job||job.cancelled||job.epoch!==this.selectionEpoch)return;const main=this.getMainWindow?.();if(main&&!main.isDestroyed())main.webContents.send(PROGRESS_CHANNEL,{jobId:job.id,profileId:job.profileId,...value});}
    async handle(event,action,value={}){
        if(!this.isMain(event))throw Error('Character inventory is available only in the main app.');if(!ACTIONS.includes(action))throw Error('Unknown Character repository action.');if(!object(value))return {ok:false,code:'invalid-request',error:'Invalid Character storage request.'};
        if(['beginLegacySeed','appendLegacySeed','commitLegacySeed','cancelLegacySeed'].includes(action))return this.legacySeed(event,action,value);
        if(this.seed&&['createProfile','selectProfile','transaction','importFiles'].includes(action))return {ok:false,code:'seed-pending',error:'Finish or cancel legacy browser recovery first.'};
        if(action==='cancelImport'){if(this.job&&(!value.jobId||value.jobId===this.job.id)){this.job.cancelled=true;void this.request('cancelImport',{jobId:this.job.id});}return {ok:true};}
        if(action==='importFiles')return this.importFiles(event,value);
        if(action==='selectProfile'||action==='createProfile'){this.selectionEpoch++;if(this.job){this.job.cancelled=true;void this.request('cancelImport',{jobId:this.job.id});}}
        if(action==='transaction'){try{json({upserts:value.upserts||[],removes:value.removes||[],updates:value.updates||[],duplicates:value.duplicates||[]},LIMITS.batchBytes,'Item edits');if(value.core!==undefined)json(value.core,LIMITS.coreBytes,'Character core');if(value.flow!==undefined)json(value.flow,LIMITS.flowBytes,'Character walkthrough');}catch(error){return {ok:false,code:error.code,error:error.message};}if(value.profileId!==this.activeProfileId)return {ok:false,code:'selection-changed',error:'The selected character changed. Reload before saving.'};}
        const result=await this.request(action,value);if(!this.isMain(event))throw Error('The app changed before the Character request completed.');if(result.ok&&(action==='selectProfile'||action==='createProfile')){this.activeProfileId=result.profileId;this.selectionEpoch++;}return result;
    }
    async legacySeed(event,action,value){
        if(this.seedBusy)return {ok:false,code:'seed-busy',error:'Wait for the current legacy recovery chunk to finish.'};
        this.seedBusy=true;try{return await this.legacySeedOperation(event,action,value);}finally{this.seedBusy=false;}
    }
    async legacySeedOperation(event,action,value){
        try{
            if(action==='beginLegacySeed'){
                if(this.seed||this.job&&!this.job.done)throw failure('seed-busy','Another recovery or import is active.');const token=randomUUID(),approved=await this.request('beginSeed',{token});if(!approved.ok)return approved;
                const file=path.join(this.directory,`browser-seed-${token}.json`);let handle;try{handle=await fsp.open(file,'wx+',0o600);}catch(error){await this.request('cancelSeed',{token});throw error;}
                this.seed={token,file,handle,hash:createHash('sha256'),length:0,carry:'',epoch:this.selectionEpoch};return {ok:true,token};
            }
            const seed=this.seed;if(!seed||value.token!==seed.token||seed.epoch!==this.selectionEpoch||!this.isMain(event))throw failure('seed-not-allowed','Legacy browser recovery is no longer active.');
            if(action==='appendLegacySeed'){
                if(typeof value.text!=='string'||value.text.length>LIMITS.chunkBytes)throw failure('invalid-request','Legacy recovery uses bounded text chunks.');let text=seed.carry+value.text;seed.carry='';if(/[\uD800-\uDBFF]$/u.test(text)){seed.carry=text.at(-1);text=text.slice(0,-1);}if(!text.isWellFormed())throw failure('invalid-encoding','Legacy recovery contains an incomplete Unicode character.');const bytes=Buffer.from(text,'utf8');let written=0;while(written<bytes.length){const result=await seed.handle.write(bytes,written,bytes.length-written,null);if(!result.bytesWritten)throw failure('backup-failed','Legacy recovery could not be written.');written+=result.bytesWritten;}seed.hash.update(bytes);seed.length+=bytes.length;return {ok:true,bytes:seed.length};
            }
            if(action==='cancelLegacySeed'){await seed.handle.close();await this.request('cancelSeed',{token:seed.token});this.seed=null;return {ok:true};}
            if(seed.carry)throw failure('invalid-encoding','Legacy recovery ended inside a Unicode character.');await seed.handle.sync();const digest=seed.hash.digest('hex'),verified=createHash('sha256'),buffer=Buffer.alloc(LIMITS.chunkBytes);let position=0;while(position<seed.length){const result=await seed.handle.read(buffer,0,Math.min(buffer.length,seed.length-position),position);if(!result.bytesRead)throw failure('backup-failed','Legacy recovery is incomplete.');verified.update(buffer.subarray(0,result.bytesRead));position+=result.bytesRead;}if((await seed.handle.stat()).size!==seed.length||verified.digest('hex')!==digest||value.sha256!==undefined&&value.sha256!==digest)throw failure('backup-failed','Legacy recovery did not match its source.');await seed.handle.close();seed.handle=null;
            if(!this.isMain(event)||this.seed!==seed||seed.epoch!==this.selectionEpoch)throw failure('cancelled','The app changed before legacy recovery could be activated.');const result=await this.request('commitSeed',{token:seed.token,file:seed.file});if(result.ok){this.activeProfileId=result.activeProfileId||'draft';this.selectionEpoch++;this.seed=null;return this.retire(result);}await this.request('cancelSeed',{token:seed.token});this.seed=null;return result;
        }catch(error){if(this.seed){await this.seed.handle?.close().catch(()=>{});await this.request('cancelSeed',{token:this.seed.token});this.seed=null;}return {ok:false,code:error.code||'seed-failed',error:String(error.message||'Legacy data could not be recovered. Its browser copy was preserved.').slice(0,400)};}
    }
    async importFiles(event,value){
        if(this.job&&!this.job.done)return {ok:false,code:'import-busy',error:'An inventory import is already active. Cancel it before starting another.'};
        if(value.profileId!==this.activeProfileId)return {ok:false,code:'selection-changed',error:'The selected character changed.'};
        const job={id:randomUUID(),profileId:value.profileId,expectedRevision:value.expectedRevision,epoch:this.selectionEpoch,cancelled:false,done:false};
        this.job=job;setImmediate(()=>void this.runImport(event,value,job));return {ok:true,jobId:job.id};
    }
    async runImport(event,value,job){
        const current=()=>this.job===job&&!job.cancelled&&!this.closed&&job.epoch===this.selectionEpoch&&this.activeProfileId===job.profileId&&this.isMain(event);
        const check=result=>{if(!result?.ok)throw failure(result?.code||'import-failed',result?.error||'Inventory import failed.');return result;};
        try{
            const config=await this.readConfig();if(!current())throw failure('cancelled','Import canceled.');const pack=await this.getPack?.();
            check(await this.request('beginImport',{jobId:job.id,profileId:job.profileId,expectedRevision:job.expectedRevision,pack}));
            const files={};for(const kind of ['inventory','achievements']){
                const target=await locate({electron:this.electron,window:this.getMainWindow(),config,metadata:value.metadata,kind,choose:value[kind==='inventory'?'chooseInventory':'chooseAchievements']===true,isCurrent:current});
                files[kind]=await streamExport({target,backupDirectory:path.join(this.directory,'imports'),jobId:job.id,kind,isCurrent:current,onChunk:async text=>check(await this.request('appendImport',{jobId:job.id,kind,text})),onProgress:progress=>this.progress(job,progress)});
                check(await this.request('finishImportFile',{jobId:job.id,kind,file:files[kind]}));
            }
            for(;;){if(!current())throw failure('cancelled','Import canceled.');const page=check(await this.request('prepareImportPage',{jobId:job.id}));this.progress(job,{phase:'resolve',rows:page.rows});if(page.done)break;}
            if(!current())throw failure('cancelled','Import canceled.');const result=check(await this.request('commitImport',{jobId:job.id}));if(current())this.progress(job,{state:'complete',phase:'complete',...result});
        }catch(error){await this.request('cancelImport',{jobId:job.id}).catch(()=>{});if(this.job===job&&job.epoch===this.selectionEpoch){const main=this.getMainWindow?.();if(main&&!main.isDestroyed())main.webContents.send(PROGRESS_CHANNEL,{jobId:job.id,profileId:job.profileId,state:error.code==='cancelled'||job.cancelled?'cancelled':'error',code:error.code||'import-failed',error:String(error.message||'Inventory import failed. The saved inventory was kept.').slice(0,400)});}}
        finally{await this.sweepRetainedData();job.done=true;}
    }
    async close(){if(this.closed)return;if(this.seed){await this.seed.handle?.close().catch(()=>{});await this.request('cancelSeed',{token:this.seed.token});this.seed=null;}if(this.job){this.job.cancelled=true;await this.request('cancelImport',{jobId:this.job.id});}await this.request('close');this.closed=true;this.electron?.ipcMain?.removeHandler(CHANNEL);await this.worker.terminate();}
}
module.exports={CharacterRepository,CHANNEL,PROGRESS_CHANNEL};
