import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const source=await readFile(new URL('../desktop/ocr-service.cjs',import.meta.url),'utf8'),require=createRequire(import.meta.url);
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(){
    const workers=[],timers=[];
    class Worker extends EventEmitter{
        constructor(){super();workers.push(this);this.messages=[];this.terminated=false;}
        postMessage(message){this.messages.push(message);}
        terminate(){this.terminated=true;return new Promise(resolve=>{this.finish=()=>{this.emit('exit',1);resolve(1);};});}
    }
    const sandbox={module:{exports:{}},__dirname:'D:/synthetic-eoz',Buffer,
        require:name=>name==='node:worker_threads'?{Worker}:name==='node:fs'?{existsSync:()=>true}:require(name),
        setTimeout:callback=>{const timer={callback,cleared:false};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cleared=true;}};
    vm.runInNewContext(source,sandbox,{filename:'ocr-service.cjs'});
    const service=new sandbox.module.exports.OcrService({timeoutMs:100});
    return{service,workers,timers,async ready(){const result=service.initialize(),worker=workers.at(-1);worker.emit('message',{ready:true});await result;return worker;},
        async close(){const stopped=service.stop();for(const worker of workers)if(worker.terminated&&worker.finish)worker.finish();await stopped;}};
}
const png=Buffer.alloc(8);
{
    const f=fixture();
    try{
        const worker=await f.ready(),first=f.service.recognize(png);await flush();const prior=f.service.pending;
        worker.emit('message',{id:prior.id,result:'first result'});assert.equal(await first,'first result');
        const second=f.service.recognize(png);await flush();const current=f.service.pending;
        prior.timer.callback();f.timers[0].callback();
        assert.equal(f.service.pending,current,'a cleared timeout cannot reject the next job on the same worker');assert.equal(worker.terminated,false);
        worker.emit('message',{id:current.id,result:'second result'});assert.equal(await second,'second result');
    }finally{await f.close();}
}
{
    const f=fixture();
    try{
        const oldStartup=f.service.initialize(),old=f.workers[0],oldTimer=f.timers[0];
        const rejected=assert.rejects(oldStartup,/was stopped/),stopping=f.service.stop();await rejected;
        const reading=f.service.recognize(png),current=f.workers[1];current.emit('message',{ready:true});await flush();
        const pending=f.service.pending;
        old.emit('message',{ready:true});old.emit('message',{error:'retired startup error'});old.emit('message',{id:pending.id,result:'wrong worker'});oldTimer.callback();old.emit('error',Error('retired worker failed'));old.finish();await stopping;
        assert.equal(f.service.worker,current);assert.equal(f.service.pending,pending);assert.equal(current.terminated,false,'retired callbacks cannot terminate the replacement worker');
        current.emit('message',{id:pending.id,result:'current result'});assert.equal(await reading,'current result');
    }finally{await f.close();}
}
{
    const f=fixture();
    try{
        const old=await f.ready(),oldRead=f.service.recognize(png);await flush();const oldTimer=f.service.pending.timer;
        const rejected=assert.rejects(oldRead,/was stopped/),stopping=f.service.stop();await rejected;
        const currentRead=f.service.recognize(png),current=f.workers.at(-1);current.emit('message',{ready:true});await flush();const pending=f.service.pending;
        oldTimer.callback();old.emit('message',{id:pending.id,error:'retired recognition failed'});old.finish();await stopping;
        assert.equal(f.service.pending,pending);assert.equal(f.service.worker,current);
        current.emit('message',{id:pending.id,result:'replacement result'});assert.equal(await currentRead,'replacement result');
    }finally{await f.close();}
}
{
    const f=fixture();
    try{
        const oldRead=f.service.recognize(png),old=f.workers[0];old.emit('message',{ready:true});
        const rejected=assert.rejects(oldRead,/was stopped/),stopping=f.service.stop();
        const currentRead=f.service.recognize(png),current=f.workers.at(-1);current.emit('message',{ready:true});await rejected;await flush();
        assert.equal(old.messages.length,0,'recognize awaiting initialization cannot post after its worker was stopped');assert.equal(current.messages.length,1);
        current.emit('message',{id:current.messages[0].id,result:'fresh initialization'});assert.equal(await currentRead,'fresh initialization');old.finish();await stopping;
    }finally{await f.close();}
}
{
    const f=fixture();
    try{
        const startup=f.service.initialize(),old=f.workers[0],rejected=assert.rejects(startup,/startup timed out/);f.timers[0].callback();await rejected;
        assert.equal(f.service.worker,null);assert.equal(old.terminated,true);
        const current=await f.ready();old.finish();assert.equal(f.service.worker,current);
        const reading=f.service.recognize(png);await flush();const timer=f.service.pending.timer,timeout=assert.rejects(reading,/image timed out/);timer.callback();await timeout;
        assert.equal(f.service.worker,null);assert.equal(current.terminated,true);
    }finally{await f.close();}
}
{
    const f=fixture();
    try{
        const startup=f.service.initialize(),old=f.workers[0],rejected=assert.rejects(startup,/model unavailable/);old.emit('message',{error:'model unavailable'});await rejected;assert.equal(old.terminated,true);
        const current=await f.ready();old.finish();assert.equal(f.service.worker,current);
        const reading=f.service.recognize(png);await flush();const failed=assert.rejects(reading,/stopped unexpectedly/);current.emit('error',Error('worker failure'));await failed;assert.equal(f.service.worker,null);
    }finally{await f.close();}
}
console.log('OCR lifecycle: retired startup/message/error/exit/timeouts cannot affect replacement workers or jobs; stopped initialization never posts a frame.');
