import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {createAtomicWriteJson,WINDOWS_RENAME_RETRY_DELAYS_MS}=require('../desktop/atomic-write-json.cjs');
const root=await fs.mkdtemp(path.join(tmpdir(),'eoz-atomic-json-'));
const old={keep:'Synthetic previous settings',minimizeToTray:false,startMinimized:false};
const fault=code=>Object.assign(new Error(`Synthetic ${code}`),{code});
const json=file=>fs.readFile(file,'utf8').then(JSON.parse);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let caseId=0;
async function fixture(){
    const directory=path.join(root,String(++caseId));await fs.mkdir(directory);const file=path.join(directory,'config.json');
    await fs.writeFile(file,JSON.stringify(old));return {directory,file,async clean(){assert.deepEqual(await fs.readdir(directory),['config.json'],'No temporary file is left after the operation');}};
}
try {
    {
        const f=await fixture(),delays=[],removed=[],codes=['EPERM','EACCES','EBUSY'];let attempts=0;
        const writer=createAtomicWriteJson({platform:'win32',io:{...fs,async rename(...args){const code=codes[attempts++];if(code)throw fault(code);return fs.rename(...args);},async unlink(file){removed.push(file);return fs.unlink(file);}},async sleep(delay){delays.push(delay);assert.deepEqual(await json(f.file),old,'Retries preserve the complete original destination');}});
        await writer(f.file,{saved:true});assert.deepEqual(await json(f.file),{saved:true});assert.equal(attempts,4);assert.deepEqual(delays,[25,50,100]);assert(!removed.includes(f.file),'The destination is never unlinked');await f.clean();
    }
    {
        const f=await fixture(),error=fault('EPERM'),delays=[];let attempts=0;
        const writer=createAtomicWriteJson({platform:'win32',io:{...fs,async rename(){attempts++;throw error;}},sleep:async delay=>delays.push(delay)});
        await assert.rejects(writer(f.file,{discarded:true}),actual=>actual===error,'The original rename error is surfaced unchanged');
        assert.equal(attempts,WINDOWS_RENAME_RETRY_DELAYS_MS.length+1);assert.deepEqual(delays,WINDOWS_RENAME_RETRY_DELAYS_MS);assert.equal(delays.reduce((a,b)=>a+b,0),775);assert.deepEqual(await json(f.file),old);await f.clean();
    }
    for(const [platform,code]of [['linux','EPERM'],['darwin','EACCES'],['win32','ENOENT'],['win32','ENOSPC'],['win32','EINVAL']]){
        const f=await fixture(),error=fault(code);let attempts=0,sleeps=0;
        const writer=createAtomicWriteJson({platform,io:{...fs,async rename(){attempts++;throw error;}},sleep:async()=>sleeps++});
        await assert.rejects(writer(f.file,{discarded:true}),actual=>actual===error);assert.equal(attempts,1,`${platform}/${code}: not a transient Windows rename`);assert.equal(sleeps,0);assert.deepEqual(await json(f.file),old);await f.clean();
    }
    {
        const f=await fixture(),error=fault('ENOSPC');let renames=0,sleeps=0;
        const writer=createAtomicWriteJson({platform:'win32',io:{...fs,async writeFile(...args){await fs.writeFile(...args);throw error;},async rename(){renames++;}},sleep:async()=>sleeps++});
        await assert.rejects(writer(f.file,{discarded:true}),actual=>actual===error);assert.equal(renames,0);assert.equal(sleeps,0);assert.deepEqual(await json(f.file),old);await f.clean();
    }
    {
        const f=await fixture(),original=fault('EBUSY');
        const writer=createAtomicWriteJson({platform:'linux',io:{...fs,async rename(){throw original;},async unlink(file){await fs.unlink(file);throw fault('EACCES');}}});
        await assert.rejects(writer(f.file,{discarded:true}),actual=>actual===original,'Cleanup cannot mask the rename failure');assert.deepEqual(await json(f.file),old);await f.clean();
    }
    {
        const f=await fixture(),temporary=[],fixedTime=Date.now;Date.now=()=>42;
        try {
            const writer=createAtomicWriteJson({io:{...fs,async writeFile(file,...args){temporary.push(file);return fs.writeFile(file,...args);}}});
            await Promise.all([writer(f.file,{write:1}),writer(f.file,{write:2})]);
        }finally{Date.now=fixedTime;}
        assert.equal(new Set(temporary).size,2,'Concurrent same-millisecond writes use distinct exclusive temporary files');await f.clean();
    }
    {
        const f=await fixture(),temporary=`${f.file}.tmp-${process.pid}-another-writer`;
        await fs.writeFile(temporary,'Synthetic other writer');
        const writer=createAtomicWriteJson({uuid:()=> 'another-writer'});
        await assert.rejects(writer(f.file,{discarded:true}),error=>error.code==='EEXIST');
        assert.equal(await fs.readFile(temporary,'utf8'),'Synthetic other writer','Exclusive creation failure cannot delete another writer\'s temporary file');
        assert.deepEqual(await json(f.file),old);await fs.unlink(temporary);await f.clean();
    }
    // Execute the actual main-process queue and merge functions, with real
    // synthetic files and only rename/sleep fault injection. Electron and the
    // installed profile are never loaded.
    const main=await fs.readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');
    const source=main.slice(main.indexOf('async function readJson('),main.indexOf('async function resolveLogPath('));
    for(const failCompletely of [false,true]){
        const f=await fixture(),renameError=fault('EPERM'),writes=[];let attempts=0,release,entered;
        const paused=new Promise(resolve=>release=resolve),sleeping=new Promise(resolve=>entered=resolve);
        const writer=createAtomicWriteJson({platform:'win32',io:{...fs,async writeFile(file,text,...args){writes.push(JSON.parse(text));return fs.writeFile(file,text,...args);},async rename(...args){attempts++;if(attempts<=(failCompletely?6:1))throw renameError;return fs.rename(...args);}},async sleep(){entered();await paused;}});
        const context=vm.createContext({fsp:fs,writeJsonAtomically:writer,configPath:()=>f.file,configWriteQueue:Promise.resolve(),desktopSettings:{},automaticLogReader:null,logContextHistory:{reset(){}},servedLogPath:'',windowSettings:value=>({minimizeToTray:value.minimizeToTray,startMinimized:value.startMinimized})});
        vm.runInContext(source,context);
        const first=context.updateConfig({minimizeToTray:true}),second=context.updateConfig({startMinimized:true});
        // Attach rejection observation before releasing the deliberately failed
        // first write, so an expected terminal error is never unhandled.
        const firstResult=first.then(value=>({value}),error=>({error}));
        await sleeping;await tick();assert.equal(writes.length,1,'The second config update waits through the first rename retry');assert.deepEqual(await json(f.file),old);release();
        const result=await firstResult;await second;
        if(failCompletely)assert.equal(result.error,renameError);else assert.equal(result.value.minimizeToTray,true);
        assert.deepEqual(await json(f.file),{eqRootPath:'',logPath:'',logSelection:'automatic',...old,minimizeToTray:!failCompletely,startMinimized:true},'Serialized updates merge the last durable settings, including after a terminal failure');
        assert.equal(writes.length,2);assert.equal(attempts,failCompletely?7:3);await f.clean();
    }
    console.log('Atomic JSON: Windows-only bounded rename recovery, original errors, destination preservation, unique temp cleanup and actual serialized config updates passed.');
}finally{
    if(path.dirname(path.resolve(root))!==path.resolve(tmpdir())||!path.basename(root).startsWith('eoz-atomic-json-'))throw Error('Unexpected synthetic cleanup path');
    await fs.rm(root,{recursive:true,force:true});
}
