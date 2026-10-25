'use strict';
// Public anonymous source only. Retention is context, never a global count or
// collection-completeness proof. The verifier separately limits proof freshness.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readBoundedFile}=require('./wiki-attachments.cjs');
const FILE_NAME='live-wiki-entries.json',ORIGIN='https://eqlwiki.com';
const MAX_SOURCE=512*1024,MAX_ENTRIES=1000,MAX_BYTES=32*1024*1024;
const FRESH_MS=24*60*60*1000,RETENTION_MS=7*24*60*60*1000;
const READ_WARNING='Temporary public wiki entries could not be read. Existing cache data remains on disk.';
const WRITE_WARNING='Temporary public wiki entries could not be saved. Public source checks can still run.';
const modules=Promise.all([import('../app/wiki-identity.js'),import('../app/contribution-model.js')]);
const clone=value=>JSON.parse(JSON.stringify(value));
const fields=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
const revision=value=>Number.isSafeInteger(value)&&value>0;
const ENTRY_KEYS=['title','namespace','revision','content','categories','fetchedAt','aliases','sha256','source','origin'];
const digest=entry=>crypto.createHash('sha256').update(JSON.stringify([entry.title,entry.namespace,entry.revision,entry.content,entry.categories,entry.fetchedAt,entry.aliases,entry.source,entry.origin])).digest('hex');
function title(value,model){
    if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value)||value.length>230)throw Error('Invalid public title.');
    return model.contributionTitle(value);
}
function validated(value,{identity,model,now,saved=false}){
    if(!fields(value,ENTRY_KEYS)||value.namespace!==0||value.source!=='public-wiki'||value.origin!==ORIGIN||!revision(value.revision)||typeof value.content!=='string'||Buffer.byteLength(value.content)>MAX_SOURCE||!Array.isArray(value.categories)||value.categories.length>500||!Array.isArray(value.aliases)||value.aliases.length>32)throw Error('Invalid public cache entry.');
    const canonical=title(value.title,model),key=identity.wikiPageTitleKey(canonical);
    if(typeof value.fetchedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.fetchedAt)||!Number.isFinite(Date.parse(value.fetchedAt))||Date.parse(value.fetchedAt)>now+300000)throw Error('Invalid public retrieval date.');
    const categories=value.categories.map(name=>{
        if(typeof name!=='string'||!name||name.length>240||/[\u0000-\u001f\u007f\[\]{}<>|#]/.test(name)||/^Category:/i.test(name))throw Error('Invalid public category.');return name;
    });
    const aliases=value.aliases.map(name=>title(name,model)).filter(name=>identity.wikiPageTitleKey(name)!==key);
    if(new Set(categories).size!==categories.length||new Set(aliases.map(identity.wikiPageTitleKey)).size!==aliases.length)throw Error('Duplicate cache proof.');
    const entry={title:canonical,namespace:0,revision:value.revision,content:value.content,categories,fetchedAt:value.fetchedAt,aliases,source:'public-wiki',origin:ORIGIN};
    entry.sha256=digest(entry);
    if(saved&&(value.sha256!==entry.sha256||canonical!==value.title||JSON.stringify(aliases)!==JSON.stringify(value.aliases)))throw Error('Changed public cache proof.');
    return entry;
}
class LiveWikiCache{
    constructor({stateDir=null,now=Date.now,onChange=()=>{},maxEntries=MAX_ENTRIES,maxBytes=MAX_BYTES}={}){
        this.file=stateDir?path.join(stateDir,FILE_NAME):null;this.now=now;this.onChange=onChange;
        this.maxEntries=Math.max(1,Math.min(MAX_ENTRIES,Number(maxEntries)||MAX_ENTRIES));this.maxBytes=Math.max(1,Math.min(MAX_BYTES,Number(maxBytes)||MAX_BYTES));
        this.entries=[];this.loaded=false;this.blocked=false;this.warning='';this.chain=Promise.resolve();this.version=0;this.disposed=false;this.packSignature=null;this.packRevisions=new Map();
    }
    async load(){
        if(this.loaded)return;if(this.loading)return this.loading;
        this.loading=(async()=>{try{
            if(!this.file)return;
            const [identity,model]=await modules,value=JSON.parse((await readBoundedFile(this.file,MAX_BYTES)).toString('utf8'));
            if(!fields(value,['schemaVersion','entries'])||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)throw Error('Invalid cache file.');
            const entries=value.entries.map(entry=>validated(entry,{identity,model,now:this.now(),saved:true})),names=new Set();
            for(const entry of entries)for(const name of [entry.title,...entry.aliases]){const key=identity.wikiPageTitleKey(name);if(names.has(key))throw Error('Ambiguous public cache alias.');names.add(key);}
            this.entries=entries;
        }catch(error){if(error.code!=='ENOENT'){this.blocked=true;this.warning=READ_WARNING;}}finally{this.loaded=true;}})();return this.loading;
    }
    serial(task){
        const work=this.chain.then(async()=>{await this.load();if(this.disposed)return null;return task();});this.chain=work.then(()=>{},()=>{});return work;
    }
    async save(entries){
        this.entries=entries;this.version++;
        if(this.file&&!this.blocked){let temporary;
            try{
                const value=JSON.stringify({schemaVersion:1,entries});if(Buffer.byteLength(value)>this.maxBytes)throw Error('Cache capacity.');
                await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});temporary=`${this.file}.${crypto.randomUUID()}.tmp`;
                await fs.writeFile(temporary,value,{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);temporary=null;this.warning='';
            }catch{this.warning=WRITE_WARNING;}finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
        }
        try{Promise.resolve(this.onChange({schemaVersion:1,version:this.version})).catch(()=>{});}catch{}
    }
    async prune(pack){
        const [identity,model]=await modules,signature=[pack?.items,pack?.npcs,pack?.zones,pack?.wikiRelationshipCoverage,pack?.meta?.version,pack?.meta?.manifestVersion,pack?.meta?.generatedAt];
        if(!this.packSignature||signature.some((value,index)=>value!==this.packSignature[index])){
            const revisions=new Map(),add=(name,value)=>{if(!revision(value))return;try{const key=identity.wikiPageTitleKey(title(name,model));revisions.set(key,Math.max(value,revisions.get(key)||0));}catch{}};
            for(const [name,record]of Object.entries(pack?.wikiRelationshipCoverage||{}))if(record&&typeof record==='object')add(record.wikiTitle||name,record.revisionId);
            for(const kind of ['items','npcs','zones'])for(const record of Array.isArray(pack?.[kind])?pack[kind]:[])if(record&&typeof record==='object')add(record.wikiTitle||record.title||record.name,record.revisionId||record.revision);
            this.packSignature=signature;this.packRevisions=revisions;
        }
        const now=this.now(),entries=this.entries.filter(entry=>now-Date.parse(entry.fetchedAt)<RETENTION_MS&&(this.packRevisions.get(identity.wikiPageTitleKey(entry.title))||0)<entry.revision);
        if(entries.length!==this.entries.length)await this.save(entries);
    }
    read(name,pack={}){return this.serial(async()=>{
        const [identity,model]=await modules;let key;try{key=identity.wikiPageTitleKey(title(name,model));}catch{return null;}
        await this.prune(pack);const entry=this.entries.find(entry=>[entry.title,...entry.aliases].some(value=>identity.wikiPageTitleKey(value)===key));
        const age=entry?this.now()-Date.parse(entry.fetchedAt):Infinity;
        return entry&&age>=-2000&&age<FRESH_MS?clone(entry):null;
    });}
    snapshot(pack={}){return this.serial(async()=>{await this.prune(pack);return {schemaVersion:1,version:this.version,entries:clone(this.entries),...(this.warning?{warning:this.warning}:{}),...(this.blocked?{blocked:true}:{})};});}
    put(page,{aliases=[]}={}){return this.serial(async()=>{
        const [identity,model]=await modules;let entry;
        if(!fields(page,['title','namespace','revision','content','categories','fetchedAt','source','origin']))return null;
        try{entry=validated({title:page.title,namespace:page.namespace,revision:page.revision,content:page.content,categories:page.categories,fetchedAt:page.fetchedAt,aliases,source:page.source,origin:page.origin},{identity,model,now:this.now()});}catch{return null;}
        const key=identity.wikiPageTitleKey(entry.title),entries=this.entries.filter(value=>identity.wikiPageTitleKey(value.title)!==key);
        // Conflicting aliases cannot overwrite a separate canonical page or
        // borrow another cached article's source. Exact canonical reads win.
        const occupied=new Set(entries.flatMap(value=>[value.title,...value.aliases].map(identity.wikiPageTitleKey)));
        entry.aliases=entry.aliases.filter(alias=>!occupied.has(identity.wikiPageTitleKey(alias)));entry.sha256=digest(entry);
        for(let i=0;i<entries.length;i++)if(entries[i].aliases.some(alias=>identity.wikiPageTitleKey(alias)===key)){entries[i]={...entries[i],aliases:entries[i].aliases.filter(alias=>identity.wikiPageTitleKey(alias)!==key)};entries[i].sha256=digest(entries[i]);}
        const prior=this.entries.find(value=>identity.wikiPageTitleKey(value.title)===key);
        if(prior&&(prior.revision>entry.revision||prior.revision===entry.revision&&Date.parse(prior.fetchedAt)>Date.parse(entry.fetchedAt)))return clone(prior);
        entries.push(entry);entries.sort((a,b)=>Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt));
        while(entries.length>this.maxEntries||Buffer.byteLength(JSON.stringify({schemaVersion:1,entries}))>this.maxBytes){if(!entries.length)break;entries.shift();}
        await this.save(entries);return entries.includes(entry)?clone(entry):null;
    });}
    invalidate(name){return this.serial(async()=>{
        const [identity,model]=await modules;let key;try{key=identity.wikiPageTitleKey(title(name,model));}catch{return false;}
        const entries=this.entries.filter(entry=>![entry.title,...entry.aliases].some(value=>identity.wikiPageTitleKey(value)===key));
        if(entries.length===this.entries.length)return false;await this.save(entries);return true;
    });}
    dispose(){this.disposed=true;}
}
module.exports={LiveWikiCache,FILE_NAME,ORIGIN,MAX_SOURCE,MAX_ENTRIES,MAX_BYTES,FRESH_MS,RETENTION_MS};
