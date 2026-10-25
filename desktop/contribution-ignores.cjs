'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readBoundedFile}=require('./wiki-attachments.cjs');
const FILE_NAME='wiki-contribution-ignores.json',MAX_ENTRIES=2000,MAX_BYTES=2*1024*1024;
const CHANNEL='eye-of-zomm:contribution-ignores',CHANGED='eye-of-zomm:contribution-ignores-changed';
const READ_WARNING='Ignored entities could not be read. Existing ignores remain on disk; automatic contributions are paused for review.';
const modules=()=>import('../app/contribution-ignore-identity.js');
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=300&&!/[\u0000-\u001f\u007f]/.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>Object.assign(new Error(message),{code});
function savedEntry(value){
    if(!fields(value,['id','kind','name','canonicalTitle','basis','createdAt'])||typeof value.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id)||!['npc','item'].includes(value.kind)||!text(value.name)||!['canonical','exact'].includes(value.basis)||value.basis==='canonical'&&!text(value.canonicalTitle)||value.basis==='exact'&&value.canonicalTitle!==null||typeof value.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt)))throw fail('ignore-ledger-unavailable',READ_WARNING);
    return clone(value);
}
class ContributionIgnores{
    constructor({stateDir=null,getCatalog=async()=>({}),now=Date.now,maxEntries=MAX_ENTRIES,maxBytes=MAX_BYTES}={}){
        this.file=stateDir?path.join(stateDir,FILE_NAME):null;this.getCatalog=getCatalog;this.now=now;this.maxEntries=Math.min(MAX_ENTRIES,Math.max(1,maxEntries));this.maxBytes=Math.min(MAX_BYTES,Math.max(1,maxBytes));
        this.entries=[];this.loaded=false;this.blocked=false;this.warning='';this.chain=Promise.resolve();this.version=0;this.matcher=null;this.matcherPack=null;this.matcherVersion=-1;
    }
    async load(){
        if(this.loaded)return;if(this.loading)return this.loading;
        this.loading=(async()=>{try{
            if(!this.file)return;
            const value=JSON.parse((await readBoundedFile(this.file,MAX_BYTES)).toString('utf8'));
            if(!fields(value,['schemaVersion','entries'])||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)throw Error();
            const entries=value.entries.map(savedEntry);if(new Set(entries.map(entry=>entry.id)).size!==entries.length)throw Error();this.entries=entries;
        }catch(error){if(error.code!=='ENOENT'){this.blocked=true;this.warning=READ_WARNING;}}finally{this.loaded=true;}})();return this.loading;
    }
    snapshot(){return {schemaVersion:1,entries:clone(this.entries),maxEntries:this.maxEntries,...(this.warning?{warning:this.warning}:{}),...(this.blocked?{blocked:true}:{})};}
    async list(){await this.load();await this.chain;return this.snapshot();}
    assertReadable(){if(this.blocked)throw fail('ignore-ledger-unavailable',READ_WARNING);}
    async isIgnored(target,catalog){
        await this.load();await this.chain;this.assertReadable();const pack=catalog||await this.getCatalog()||{},identity=await modules();
        if(!this.matcher||this.matcherPack!==pack||this.matcherVersion!==this.version){this.matcher=identity.createContributionIgnoreMatcher(this.entries,pack);this.matcherPack=pack;this.matcherVersion=this.version;}
        return this.matcher(target);
    }
    async persist(entries){
        if(!this.file)throw fail('ignore-storage','Device ignore storage is unavailable.');
        const value=JSON.stringify({schemaVersion:1,entries});
        if(entries.length>this.maxEntries||Buffer.byteLength(value)>this.maxBytes)throw fail('ignore-capacity','The device ignore list is full. Restore an entry before ignoring another entity. Existing entries were kept.');
        let temporary;
        try{await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});temporary=`${this.file}.${crypto.randomUUID()}.tmp`;await fs.writeFile(temporary,value,{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);temporary=null;}
        catch{throw fail('ignore-storage','The device ignore list could not be saved. No ignore preference changed.');}
        finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
        this.entries=entries;this.version++;this.warning='';return this.snapshot();
    }
    change(task){const work=this.chain.then(async()=>{await this.load();this.assertReadable();return task();});this.chain=work.then(()=>{},()=>{});return work;}
    ignore(value){return this.change(async()=>{
        if(!fields(value,['kind','name'])||!['npc','item'].includes(value.kind)||!text(value.name))throw fail('ignore-target','Choose one item or NPC to ignore.');
        const pack=await this.getCatalog()||{},identity=await modules(),target=identity.contributionIgnoreIdentity(pack,value);if(!target)throw fail('ignore-target','Choose one item or NPC to ignore.');
        if(identity.createContributionIgnoreMatcher(this.entries,pack)(value))return this.snapshot();
        const entry={id:crypto.randomUUID(),kind:target.kind,name:target.name,canonicalTitle:target.canonicalTitle,basis:target.basis,createdAt:new Date(this.now()).toISOString()};
        return this.persist([...this.entries,entry]);
    });}
    restore(value){return this.change(async()=>{
        if(!fields(value,['id'])||typeof value.id!=='string'||value.id.length>100)throw fail('ignore-target','Choose an ignored entry to restore.');
        const entries=this.entries.filter(entry=>entry.id!==value.id);if(entries.length===this.entries.length)return this.snapshot();return this.persist(entries);
    });}
}
class ContributionIgnoresHost{
    constructor({ipcMain,origin,getMainWindow,store,onChanged=()=>{}}){this.ipcMain=ipcMain;this.origin=origin;this.getMainWindow=getMainWindow;this.store=store;this.onChanged=onChanged;this.disposed=false;ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));}
    async handle(event,action,value){
        const window=this.getMainWindow();if(this.disposed||!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame?.url!==`${this.origin}/`)throw Error('Contribution ignore preferences are available only in the main app.');
        if(action==='list'&&value===undefined)return this.store.list();
        let result;if(action==='ignore')result=await this.store.ignore(value);else if(action==='restore')result=await this.store.restore(value);else throw Error('Unknown contribution ignore action.');
        try{this.onChanged(result);}catch{}return result;
    }
    dispose(){this.disposed=true;this.ipcMain.removeHandler(CHANNEL);}
}
module.exports={ContributionIgnores,ContributionIgnoresHost,FILE_NAME,MAX_ENTRIES,MAX_BYTES,CHANNEL,CHANGED};
