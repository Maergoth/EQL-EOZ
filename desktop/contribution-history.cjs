'use strict';

// Native-only, bounded receipts. Never copy plan requests, wikicode, screenshots,
// OCR, logs, credentials, or arbitrary server error messages into this store.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readBoundedFile}=require('./wiki-attachments.cjs');
const MAX_ENTRIES=500,MAX_BYTES=2*1024*1024;
const FILE_NAME='wiki-contribution-history.json';
const READ_WARNING='Saved contribution history could not be read. Existing history remains on disk.';
const WRITE_WARNING='Contribution history could not be saved. The wiki submission result is unchanged.';
const clone=value=>JSON.parse(JSON.stringify(value));
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>0;
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
const code=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)?value:undefined;
const account=value=>value&&Number.isSafeInteger(value.id)&&value.id>0&&text(value.name,240)?{id:value.id,name:value.name}:null;
function origin(value){try{const url=new URL(value);return url.origin===value&&!url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))?value:null;}catch{return null;}}
const sameAccount=(a,b)=>Boolean(a&&b&&a.id===b.id&&a.name===b.name);
const compare=(a,b)=>a.updatedAt<b.updatedAt?1:a.updatedAt>b.updatedAt?-1:a.id<b.id?1:a.id>b.id?-1:0;
const identity=entry=>JSON.stringify([entry.origin,entry.account.id,entry.account.name,entry.planId]);
const fields=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));

function planReceipt(plan,now){
    const user=account(plan?.expectedUser),wikiOrigin=origin(plan?.wikiOrigin);
    if(!user||!wikiOrigin||!text(plan.id,160)||!Array.isArray(plan.pages)||!plan.pages.length||plan.pages.length>12)return null;
    const attempted=Boolean(plan.historyAttempt)||['submitted','partial','needs-attention'].includes(plan.status)||
        plan.pages.some(page=>['applied','unknown','failed'].includes(page?.status))||['applied','unknown','failed'].includes(plan.attachment?.status);
    if(!attempted)return null;
    const pages=[];
    for(const page of plan.pages){
        if(!text(page?.title,300)||!['create','update'].includes(page.operation))return null;
        const status=['applied','unknown','failed'].includes(page.status)?page.status:'pending';
        pages.push({title:page.title,operation:page.operation,status,...(text(page.role,64)?{role:page.role}:{}),
            ...(status==='applied'&&revision(page.result?.revision)?{revision:page.result.revision}:{}),
            ...(revision(page.baseRevision)?{baseRevision:page.baseRevision}:{}),
            ...(code(page.result?.code)?{code:code(page.result.code)}:{})});
    }
    if(plan.attachment&&text(plan.attachment.filename,295))pages.push({title:'File:'+plan.attachment.filename,operation:'upload',
        status:['applied','unknown','failed'].includes(plan.attachment.status)?plan.attachment.status:'pending',
        ...(code(plan.attachment.error?.code)?{code:code(plan.attachment.error.code)}:{})});
    const applied=pages.filter(page=>page.status==='applied').length,uncertain=pages.some(page=>['unknown','failed'].includes(page.status));
    const status=pages.every(page=>page.status==='applied')?'submitted':
        applied?'partly-submitted':uncertain||plan.status==='needs-attention'||plan.historyAttempt?.status==='failed'?'needs-attention':'pending';
    const createdAt=date(plan.createdAt)?plan.createdAt:date(plan.historyAttempt?.at)?plan.historyAttempt.at:now;
    return {id:plan.id,planId:plan.id,title:pages[0].title,origin:wikiOrigin,account:user,createdAt,updatedAt:date(plan.historyAttempt?.at)?plan.historyAttempt.at:createdAt,
        mode:plan.automaticItem||plan.automaticSource?'automatic':'manual',status,pages,
        ...(code(plan.historyAttempt?.code)?{code:code(plan.historyAttempt.code)}:{})};
}

function savedReceipt(entry){
    if(!fields(entry,['id','planId','title','origin','account','createdAt','updatedAt','mode','status','pages','code'])||
        !text(entry.id,160)||entry.id!==entry.planId||!text(entry.title,300)||!origin(entry.origin)||!account(entry.account)||
        !fields(entry.account,['id','name'])||!date(entry.createdAt)||!date(entry.updatedAt)||
        !['manual','automatic'].includes(entry.mode)||!['pending','partly-submitted','submitted','needs-attention'].includes(entry.status)||
        !Array.isArray(entry.pages)||entry.pages.length<1||entry.pages.length>13||entry.code!==undefined&&!code(entry.code))throw Error(READ_WARNING);
    for(const page of entry.pages)if(!fields(page,['title','operation','status','role','revision','baseRevision','code'])||!text(page.title,300)||
        !['create','update','upload'].includes(page.operation)||!['pending','applied','unknown','failed'].includes(page.status)||
        page.role!==undefined&&!text(page.role,64)||page.revision!==undefined&&!revision(page.revision)||
        page.baseRevision!==undefined&&!revision(page.baseRevision)||page.code!==undefined&&!code(page.code))throw Error(READ_WARNING);
    return clone(entry);
}

function withLinks(entry){
    const result=clone(entry);
    for(const page of result.pages){
        page.url=`${result.origin}/${encodeURIComponent(page.title.replace(/ /g,'_'))}`;
        if(page.status==='applied'&&revision(page.revision)){
            page.revisionUrl=`${result.origin}/index.php?${new URLSearchParams({title:page.title,oldid:String(page.revision)})}`;
            if(revision(page.baseRevision)&&page.baseRevision!==page.revision)page.diffUrl=`${result.origin}/index.php?${new URLSearchParams({title:page.title,diff:String(page.revision),oldid:String(page.baseRevision)})}`;
        }
        delete page.baseRevision;
    }
    return result;
}

class ContributionHistory {
    constructor({stateDir=null,now=Date.now}={}){this.file=stateDir?path.join(stateDir,FILE_NAME):null;this.now=now;this.entries=new Map();this.loaded=false;this.blocked=false;this.warning=null;this.dirty=false;this.chain=Promise.resolve();}
    async load(){
        if(this.loaded)return;if(this.loading)return this.loading;
        this.loading=(async()=>{try{
            if(!this.file)return;
            const value=JSON.parse((await readBoundedFile(this.file,MAX_BYTES)).toString('utf8'));
            if(!fields(value,['schemaVersion','entries'])||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)throw Error(READ_WARNING);
            const loaded=new Map();for(const raw of value.entries){const entry=savedReceipt(raw),key=identity(entry);if(loaded.has(key))throw Error(READ_WARNING);loaded.set(key,entry);}this.entries=loaded;
        }catch(error){if(error.code!=='ENOENT'){this.blocked=true;this.warning=READ_WARNING;}}finally{this.loaded=true;}})();
        return this.loading;
    }
    recordPlans(plans){
        const now=new Date(this.now()).toISOString(),receipts=plans.map(plan=>planReceipt(plan,now)).filter(Boolean);
        const task=async()=>{
            await this.load();let changed=false;
            for(const receipt of receipts){const key=identity(receipt),previous=this.entries.get(key);
                if(previous){receipt.createdAt=previous.createdAt;receipt.updatedAt=previous.updatedAt;if(JSON.stringify(receipt)===JSON.stringify(previous))continue;receipt.updatedAt=now;}
                this.entries.set(key,receipt);changed=true;
            }
            if(changed)this.dirty=true;if(!this.dirty)return;
            let entries=[...this.entries.values()].sort(compare).slice(0,MAX_ENTRIES),value=JSON.stringify({schemaVersion:1,entries});
            while(Buffer.byteLength(value)>MAX_BYTES&&entries.length){entries.pop();value=JSON.stringify({schemaVersion:1,entries});}
            this.entries=new Map(entries.map(entry=>[identity(entry),entry]));
            if(!this.file||this.blocked)return;
            let temporary;
            try{await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});temporary=`${this.file}.${crypto.randomUUID()}.tmp`;await fs.writeFile(temporary,value,{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);temporary=null;this.warning=null;this.dirty=false;}
            catch{this.warning=WRITE_WARNING;}
            finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
        };
        const work=this.chain.then(task,task);this.chain=work.catch(()=>{this.warning=WRITE_WARNING;});return this.chain;
    }
    async list({user,wikiOrigin,limit=50,before=null}={}){
        await this.load();await this.chain;
        if(!Number.isInteger(limit)||limit<1||limit>100||before!==null&&(typeof before!=='string'||before.length>512))throw Error('Invalid contribution history range.');
        const current=account(user),base={entries:[],account:current,hasMore:false,nextCursor:null,...(this.warning?{warning:this.warning}:{})};
        if(!current)return base;
        const binding=crypto.createHash('sha256').update(JSON.stringify([wikiOrigin,current.id,current.name])).digest('hex').slice(0,24);
        let cursor=null;
        if(before!==null){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString('utf8'));if(!fields(cursor,['at','id','binding'])||!date(cursor.at)||!text(cursor.id,160)||cursor.binding!==binding)throw Error();}catch{throw Error('Invalid contribution history cursor.');}}
        const entries=[...this.entries.values()].filter(entry=>entry.origin===wikiOrigin&&sameAccount(entry.account,current)).sort(compare)
            .filter(entry=>!cursor||entry.updatedAt<cursor.at||entry.updatedAt===cursor.at&&entry.id<cursor.id);
        const selected=entries.slice(0,limit),hasMore=entries.length>limit,last=selected.at(-1);
        return {...base,entries:selected.map(withLinks),hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({at:last.updatedAt,id:last.id,binding})).toString('base64url'):null};
    }
}
module.exports={ContributionHistory,MAX_ENTRIES,MAX_BYTES,FILE_NAME};
