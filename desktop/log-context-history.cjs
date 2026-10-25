'use strict';
const path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');

// One cancellable worker reads only the selected file's prefix. It keeps
// bounded zone/explicit-consider facts, never surrounding chat or raw lines.
class LogContextHistory {
    constructor({timeoutMs=8000}={}){this.timeoutMs=timeoutMs;this.generation=0;this.active=null;this.disposed=false;}
    reset(){this.generation++;this.active?.cancel();this.active=null;}
    async prefix({logPath,startOffset,zones=[]}={}){
        if(this.disposed)return null;this.reset();
        if(typeof logPath!=='string'||!Number.isSafeInteger(startOffset)||startOffset<=0)return null;
        const generation=this.generation;
        return new Promise(resolve=>{
            let settled=false,worker;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);if(this.active?.generation===generation)this.active=null;void worker?.terminate();resolve(!this.disposed&&generation===this.generation?value:null);};
            const timer=setTimeout(()=>finish(null),this.timeoutMs);timer.unref?.();
            try{worker=new Worker(__filename,{workerData:{logPath,startOffset,zones:zones.map(zone=>({name:zone.name,viewerName:zone.viewerName,wikiTitle:zone.wikiTitle,aliases:zone.aliases||[]}))}});worker.unref();this.active={generation,cancel:()=>finish(null)};worker.once('message',value=>finish(value?.ok===true?value.context:null));worker.once('error',()=>finish(null));worker.once('exit',()=>finish(null));}catch{finish(null);}
        });
    }
    dispose(){this.disposed=true;this.reset();}
}
async function readPrefix({logPath,startOffset,zones}){
    const fs=require('node:fs'),{StringDecoder}=require('node:string_decoder'),{pathToFileURL}=require('node:url'),{EQLogParser}=await import(pathToFileURL(path.join(__dirname,'..','app','parser.js')).href);
    const parser=new EQLogParser({getPack:()=>({zones})});parser.setCharacterFromFilename(logPath);const decoder=new StringDecoder('utf8');let partial='',oversize=false;
    for await(const chunk of fs.createReadStream(logPath,{start:0,end:startOffset-1,highWaterMark:128*1024})){
        const lines=(partial+decoder.write(chunk)).split('\n');partial=lines.pop()||'';
        for(let line of lines){if(oversize){oversize=false;continue;}if(line.length>65536)continue;line=line.replace(/\r$/,'');if(!/^\[[^\]]+\]/.test(line)||!(/You have entered|\bZONE:|\(Lvl:/i.test(line)))continue;parser.parse(line,{recordSession:false});parser.observed.clear();}
        if(partial.length>65536){partial='';oversize=true;}
    }
    return parser.logContextSnapshot();
}
if(!isMainThread)readPrefix(workerData).then(context=>parentPort.postMessage({ok:true,context})).catch(()=>parentPort.postMessage({ok:false}));
module.exports={LogContextHistory};
