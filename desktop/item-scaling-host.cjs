'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const RULES_URL = 'https://eqlwiki.com/api.php?action=eqlitemscaling&format=json&formatversion=2';
const REFRESH_MS = 60 * 60 * 1000;
const MAX_BYTES = 16 * 1024;
const digest = rules => createHash('sha256').update(JSON.stringify(rules)).digest('hex');

/** One accepted snapshot feeds native recovery and all renderer previews.
 * A missing endpoint, offline connection or future engine retains saved rules.
 */
class ItemScalingHost {
    constructor({ file, fetch:fetchImpl=globalThis.fetch, now=Date.now, interval=REFRESH_MS,
        loadScaling=()=>import('../app/item-scaling.js') }={}) {
        this.file=file; this.fetch=fetchImpl; this.now=now; this.interval=interval; this.loadScaling=loadScaling;
        this.checkedAt=0; this.lastSuccessAt=0; this.error=''; this.source='bundled'; this.pending=null; this.timer=null;
    }
    async initialize() {
        this.scaling=await this.loadScaling();
        try {
            const stat=await fs.stat(this.file);
            if (stat.size>MAX_BYTES) throw Error('Saved item rules are too large.');
            const saved=JSON.parse(await fs.readFile(this.file,'utf8'));
            if (saved.schemaVersion!==1 || !saved.rules || saved.sha256!==digest(saved.rules)) throw Error('Saved item rules are invalid.');
            this.scaling.applyItemScalingRules(saved.rules);
            this.source='cached';
            this.checkedAt=Number.isFinite(saved.checkedAt)?Math.min(this.now(),saved.checkedAt):0;
            this.lastSuccessAt=Number.isFinite(saved.lastSuccessAt)?Math.min(this.now(),saved.lastSuccessAt):0;
        } catch (error) { if (error.code!=='ENOENT') this.error='Saved rules unavailable; using bundled item formulas.'; }
        return this.status();
    }
    status() {
        return { rules:this.scaling.getItemScalingRules(), source:this.source,
            checkedAt:this.checkedAt, lastSuccessAt:this.lastSuccessAt, error:this.error, checking:Boolean(this.pending) };
    }
    async save() {
        const rules=this.scaling.getItemScalingRules(), record={schemaVersion:1,rules,sha256:digest(rules),checkedAt:this.checkedAt,lastSuccessAt:this.lastSuccessAt};
        await fs.mkdir(path.dirname(this.file),{recursive:true});
        const temporary=`${this.file}.tmp`;
        await fs.writeFile(temporary,JSON.stringify(record));
        await fs.rename(temporary,this.file);
    }
    refresh() {
        if (this.pending) return this.pending;
        if (this.checkedAt && this.now()-this.checkedAt<this.interval) return Promise.resolve(this.status());
        this.pending=this.check().finally(()=>{this.pending=null;});
        return this.pending;
    }
    async check() {
        this.checkedAt=this.now();
        const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
        try {
            const response=await this.fetch(RULES_URL,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{'Accept':'application/json'}});
            if (!response.ok) throw Error(`Wiki item formulas unavailable (HTTP ${response.status}).`);
            if (Number(response.headers.get('content-length')||0)>MAX_BYTES) throw Error('Wiki item rules are too large.');
            const reader=response.body?.getReader();
            if (!reader) throw Error('Wiki item rules response is empty.');
            const chunks=[]; let size=0;
            try {
                while (true) {
                    const {done,value}=await reader.read(); if (done) break;
                    size+=value.byteLength;
                    if (size>MAX_BYTES) {void reader.cancel().catch(()=>{});throw Error('Wiki item rules are too large.');}
                    chunks.push(Buffer.from(value));
                }
            } finally {reader.releaseLock();}
            const body=JSON.parse(Buffer.concat(chunks,size).toString('utf8')), result=body.eqlitemscaling;
            if (body.error || !result || result.schemaVersion!==1 || result.engineVersion!==1 || result.revision!==result.rules?.revision) throw Error('Wiki uses unsupported item formulas; keeping saved rules.');
            this.scaling.applyItemScalingRules(result.rules);
            this.source='wiki'; this.lastSuccessAt=this.now(); this.error='';
        } catch (error) { this.error=String(error.message||'Wiki item formulas unavailable.').slice(0,200); }
        finally {clearTimeout(timer);}
        // Save the check time even after a failure; a broken endpoint must not
        // turn every startup/renderer poll into another remote request.
        try {await this.save();} catch {this.error ||= 'Item formulas are available this session; the offline cache could not be saved.';}
        return this.status();
    }
    start() {
        if (this.timer) return;
        void this.refresh();
        this.timer=setInterval(()=>void this.refresh(),this.interval);
        this.timer.unref?.();
    }
    stop() { clearInterval(this.timer); this.timer=null; }
}

module.exports={ItemScalingHost,RULES_URL,REFRESH_MS,MAX_BYTES};
