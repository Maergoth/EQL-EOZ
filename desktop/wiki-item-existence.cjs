'use strict';

// One anonymous, fixed-origin existence read for a local item cache miss.
// This never reads revisions, searches page text, or classifies loot counts.
const API = 'https://eqlwiki.com/api.php';
const MAX_JSON = 128 * 1024;
const identityModule = import('../app/wiki-identity.js');
const unknown = () => ({status:'unknown',source:'live'});

class WikiItemExistence {
    constructor({getPack=async()=>({}),entryVerifier=null,fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=8000,maxConcurrent=2,maxPending=20}={}) {
        this.getPack=getPack;this.fetch=fetchImpl;this.entryVerifier=entryVerifier;this.now=now;
        this.timeoutMs=Math.max(1,Math.min(8000,Number(timeoutMs)||8000));
        this.maxConcurrent=Math.max(1,Math.min(2,Number(maxConcurrent)||2));
        this.maxPending=Math.max(1,Math.min(20,Number(maxPending)||20));
        this.cache=new Map();this.pending=new Map();this.queue=[];this.controllers=new Set();
        this.active=0;this.generation=0;this.disposed=false;this.pack=null;this.resolver=null;
    }
    async check(value) {
        const generation=this.generation;
        if(this.disposed||!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>240||/[\u0000-\u001f\u007f|#\[\]{}<>]/.test(value.name)||/^[a-z][a-z0-9+.-]*:\/\//i.test(value.name.trim()))return unknown();
        const identity=await identityModule;
        const title=identity.wikiPageTitleKey(identity.itemExaltationBaseIdentity(value.name));
        if(!title||/^(?:talk|user|user talk|file|image|template|category|mediawiki|special|help|project):/i.test(title))return unknown();
        let pack;
        try {pack=await this.getPack();} catch {return unknown();}
        if(this.disposed||generation!==this.generation)return unknown();
        if(pack!==this.pack||!this.resolver){this.pack=pack;this.resolver=identity.createWikiResolver(pack||{});}
        const local=this.resolver.resolve('item',value.name);
        if(['present','ambiguous'].includes(local.membership))return {status:'present',title:local.canonicalTitle||title,source:'cache'};
        const key=title, cached=this.cache.get(key);
        if(cached&&cached.until>this.now())return {...cached.result};
        this.cache.delete(key);
        const prior=this.pending.get(key);if(prior)return prior.promise;
        if(this.pending.size>=this.maxPending)return unknown();
        let resolve;
        const promise=new Promise(done=>{resolve=done;});
        const task={key,title,generation,promise,resolve};
        this.pending.set(key,task);this.queue.push(task);this.drain();return promise;
    }
    drain() {
        while(!this.disposed&&this.active<this.maxConcurrent&&this.queue.length){
            const task=this.queue.shift();this.active++;
            this.probe(task.title).then(result=>{
                if(this.disposed||task.generation!==this.generation){task.resolve(unknown());return;}
                const proofAt=Date.parse(result.checkedAt||'');const ttl=result.status==='present'?24*60*60*1000:result.status==='missing'?Math.max(0,60000-(Number.isFinite(proofAt)?this.now()-proofAt:0)):15000;
                this.cache.set(task.key,{result,until:this.now()+ttl});
                while(this.cache.size>1000)this.cache.delete(this.cache.keys().next().value);
                task.resolve({...result});
            },()=>task.resolve(unknown())).finally(()=>{
                if(this.pending.get(task.key)===task)this.pending.delete(task.key);
                this.active--;this.drain();
            });
        }
    }
    async probe(title) {
        if(this.entryVerifier){
            try{const result=await this.entryVerifier.check({kind:'item',name:title,zone:'',instance:'unknown',reasons:['missing-page'],relations:[]});
                if(result?.state==='covered')return{status:'present',title:result.canonicalTitle||title,source:'live'};
                if(result?.state==='missing'&&Array.isArray(result.reasons)&&result.reasons.includes('missing-page')){const checkedAt=Date.parse(result.checkedAt||'');if(Number.isFinite(checkedAt)&&checkedAt<=this.now()+2000&&this.now()-checkedAt<60000)return{status:'missing',title:result.canonicalTitle||title,source:'live',checkedAt:result.checkedAt};}
            }catch{}return unknown();
        }
        if(typeof this.fetch!=='function')return unknown();
        const controller=new AbortController();this.controllers.add(controller);
        let timer;
        try {
            const url=new URL(API);
            for(const [key,value] of Object.entries({action:'query',prop:'info',titles:title,redirects:'1',converttitles:'1',format:'json',formatversion:'2'}))url.searchParams.set(key,value);
            const request=(async()=>{
                const response=await this.fetch(url.href,{method:'GET',credentials:'omit',useSessionCookies:false,redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
                if(!response?.ok||Number(response.headers?.get?.('content-length'))>MAX_JSON)return unknown();
                const text=await response.text();if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_JSON)return unknown();
                const data=JSON.parse(text),pages=data?.query?.pages;
                if(data.error||data.warnings||data.continue||!Array.isArray(pages)||pages.length!==1)return unknown();
                const page=pages[0];
                if(!page||page.invalid||page.ns!==0||typeof page.title!=='string'||!page.title.trim()||page.title.length>240)return unknown();
                const identity=await identityModule;
                let expected=identity.wikiPageTitleKey(title),redirected=false;
                for(const field of ['normalized','converted','redirects']){
                    if(data.query[field]!==undefined&&!Array.isArray(data.query[field]))return unknown();
                    const mappings=data.query[field]||[];
                    if(mappings.length>16)return unknown();
                    for(const mapping of mappings){
                        if(!mapping||typeof mapping.from!=='string'||typeof mapping.to!=='string'||mapping.from.length>240||mapping.to.length>240)return unknown();
                        if(identity.wikiPageTitleKey(mapping.from)!==expected)return unknown();
                        expected=identity.wikiPageTitleKey(mapping.to);
                        if(field==='redirects')redirected=true;
                    }
                }
                if(identity.wikiPageTitleKey(page.title)!==expected)return unknown();
                // A public redirect is an existing article even if its target
                // is a redlink. It must never generate a missing-item notice.
                if(redirected)return {status:'present',title:page.title,source:'live'};
                if(Number.isInteger(page.pageid)&&page.pageid>0&&page.missing!==true)return {status:'present',title:page.title,source:'live'};
                if(page.missing===true&&!page.pageid)return {status:'missing',title:page.title,source:'live'};
                return unknown();
            })();
            const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(unknown());},this.timeoutMs);});
            return await Promise.race([request,timeout]);
        } catch {return unknown();}
        finally {clearTimeout(timer);this.controllers.delete(controller);}
    }
    clear() {
        this.generation++;this.cache.clear();
        for(const task of this.pending.values())task.resolve(unknown());
        this.pending.clear();this.queue=[];
        for(const controller of this.controllers)controller.abort();
    }
    dispose() {this.disposed=true;this.clear();}
}
module.exports={WikiItemExistence};
