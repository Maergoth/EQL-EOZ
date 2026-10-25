'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const modules=Promise.all(['parser.js','contribution-evidence.js','zone-identity.js'].map(name=>import(pathToFileURL(path.join(__dirname,'..','app',name)).href)));

// Witness actual bytes read from the configured log. Renderer observe-log IPC
// remains useful for local drafts, but cannot authorize automatic wiki edits.
class AutomaticLogReader {
    constructor({getPack=()=>({}),onObservation=()=>{},onReset=()=>{},now=Date.now}={}){
        this.getPack=getPack;this.onObservation=onObservation;this.onReset=onReset;this.now=now;
        this.parser=null;this.source='';this.offset=0;this.partial='';this.cursor=0;this.chain=Promise.resolve();this.disposed=false;this.revision=0;
    }
    reset(force=false){if(!force&&!this.parser&&!this.source)return;this.revision++;this.parser=null;this.source='';this.offset=0;this.partial='';this.cursor=0;this.onReset();}
    ingest(window){
        const task=this.chain.then(()=>this.read(window));this.chain=task.catch(()=>{});return task;
    }
    async read(window={}){
        if(this.disposed)return;
        if(!window.logExists){this.reset();return;}
        if(typeof window.logPath!=='string'||typeof window.text!=='string'||window.text.length>3*1024*1024||
            !Number.isSafeInteger(window.startOffset)||!Number.isSafeInteger(window.newOffset)||window.startOffset<0||window.newOffset<window.startOffset)return;
        const beforeModules=this.revision;
        const [{EQLogParser},{logContributionObservation},{resolveZoneRecord,viewerZoneName}]=await modules;
        if(this.disposed||this.revision!==beforeModules)return;
        const reset=!this.parser||this.source!==window.logPath||window.reset===true||window.startOffset>this.offset;
        if(!reset&&window.startOffset<this.offset)return;
        let text=window.text;
        if(reset){
            this.reset(true);this.parser=new EQLogParser();this.parser.setCharacterFromFilename(window.logPath);
            this.source=window.logPath;this.offset=window.startOffset;this.partial='';this.cursor=0;
            // A bounded initial tail may begin inside a line. Seed state only;
            // reopening a log never retroactively edits the wiki.
            if(window.startOffset>0){const newline=text.indexOf('\n');text=newline<0?'':text.slice(newline+1);}
        }
        const revision=this.revision,pack=await this.getPack()||{};
        if(this.disposed||revision!==this.revision)return;
        const lines=(this.partial+text).split('\n');this.partial=lines.pop()||'';
        if(this.partial.length>65536)this.partial='';
        this.offset=window.newOffset;
        for(const raw of lines){
            if(this.disposed)return;
            const line=raw.replace(/\r$/,'');if(line.length>65536)continue;
            const event=this.parser.parse(line,{recordSession:!reset});this.cursor++;
            if(event?.type==='zone')this.parser.zone=resolveZoneRecord(pack.zones||[],event.zone)?.name||viewerZoneName(event.zone);
            if(reset||!event||!['kill','loot','zone'].includes(event.type))continue;
            const at=Date.parse(line.match(/^\[([^\]]+)\]/)?.[1]||'');
            if(!Number.isFinite(at)||this.now()-at>10000||at-this.now()>2000)continue;
            const zone=resolveZoneRecord(pack.zones||[],this.parser.zone)?.name||viewerZoneName(this.parser.zone);
            const record=logContributionObservation(event,{live:true,at,zone,instance:'normal',logId:this.source,cursor:this.cursor,
                logLine:line,playerNames:[this.parser.character,...this.parser.knownPlayerNames].filter(Boolean)}, {now:this.now()});
            if(record){
                // Do not wait for network writes on the log-serving HTTP path.
                try{Promise.resolve(this.onObservation({...record,parser:{name:'native-eq-log',version:1}})).catch(()=>{});}catch{}
            }
        }
    }
    dispose(){this.disposed=true;this.partial='';this.parser=null;}
}
module.exports={AutomaticLogReader};
