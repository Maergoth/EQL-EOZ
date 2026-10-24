import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {createRequire} from 'node:module';
const {CharacterStorage,CHARACTER_STORAGE_KEYS,MAX_VALUE_BYTES,CHANNEL}=createRequire(import.meta.url)('../desktop/character-storage.cjs');
const directory=await mkdtemp(join(tmpdir(),'eoz-character-storage-unit-'));
try{
    const warnings=[],handlers=new Map(),main={isDestroyed:()=>false,webContents:{mainFrame:{url:'http://127.0.0.1:1234/'}}};
    const store=new CharacterStorage({directory,electron:{ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)}},origin:'http://127.0.0.1:1234',getMainWindow:()=>main,warn:value=>warnings.push(value)});
    assert.deepEqual(await store.initialize(),{values:{},error:null});
    const event={sender:main.webContents,senderFrame:main.webContents.mainFrame},invoke=handlers.get(CHANNEL);
    assert.deepEqual(invoke(event,'read'),{values:{},error:null});
    for(const patch of [{sender:{}},{senderFrame:{url:main.webContents.mainFrame.url}},{senderFrame:{url:'http://127.0.0.1:1234/overlay.html'}}])assert.throws(()=>invoke({...event,...patch},'read'),/unavailable/);
    await assert.rejects(store.write({key:'arbitrary-path',value:'private'}),/Invalid/);
    await assert.rejects(store.write({key:CHARACTER_STORAGE_KEYS[0],value:42}),/Invalid/);
    await assert.rejects(store.write({key:CHARACTER_STORAGE_KEYS[0],value:'x'.repeat(MAX_VALUE_BYTES+1)}),/Invalid/);
    await assert.rejects(store.write({key:CHARACTER_STORAGE_KEYS[0],value:'x',extra:true}),/Invalid/);
    const work=Array.from({length:30},(_,n)=>store.write({key:CHARACTER_STORAGE_KEYS[n%2],value:JSON.stringify({schemaVersion:1,n})}));
    await Promise.all(work);const finalWrite=store.write({key:CHARACTER_STORAGE_KEYS[0],value:JSON.stringify({schemaVersion:1,n:30})});await Promise.all([finalWrite,store.close()]);assert.equal(handlers.has(CHANNEL),false);
    const restored=new CharacterStorage({directory});await restored.initialize();
    assert.equal(JSON.parse(restored.read().values[CHARACTER_STORAGE_KEYS[0]]).n,30,'Immediate close drains the accepted in-flight write');assert.equal(JSON.parse(restored.read().values[CHARACTER_STORAGE_KEYS[1]]).n,29);
    await restored.write({key:CHARACTER_STORAGE_KEYS[0],value:null});await restored.close();
    const tombstone=new CharacterStorage({directory});await tombstone.initialize();assert(Object.hasOwn(tombstone.read().values,CHARACTER_STORAGE_KEYS[0]));assert.equal(tombstone.read().values[CHARACTER_STORAGE_KEYS[0]],null);await tombstone.close();
    const original=await readFile(join(directory,'eye-of-zomm-character-storage.json'),'utf8');
    const corrupt='{broken private fixture';await writeFile(join(directory,'eye-of-zomm-character-storage.json'),corrupt);
    for(let n=0;n<2;n++){
        const blocked=new CharacterStorage({directory,warn:value=>warnings.push(value)});const result=await blocked.initialize();assert(result.error);assert.deepEqual(result.values,{});await assert.rejects(blocked.write({key:CHARACTER_STORAGE_KEYS[0],value:original}),/could not be read/);await assert.rejects(blocked.close(),/could not be read/);
    }
    assert.equal(await readFile(join(directory,'eye-of-zomm-character-storage.json'),'utf8'),corrupt);assert.equal(await readFile(join(directory,'eye-of-zomm-character-storage.recovery.json'),'utf8'),corrupt);assert.equal((await readdir(directory)).filter(name=>name.includes('.recovery')).length,1,'Repeated starts cannot accumulate recovery copies');
    const failure=join(directory,'write-failure');await mkdir(failure);const failed=new CharacterStorage({directory:failure,warn:value=>warnings.push(value)});await failed.initialize();await mkdir(failed.file);
    await assert.rejects(failed.write({key:CHARACTER_STORAGE_KEYS[0],value:'synthetic'}),/could not be saved/);assert(warnings.some(value=>value.includes('could not be saved')));assert.equal(dirname(resolve(failed.file)),resolve(failure));await rm(failed.file,{recursive:true});await failed.flush();await failed.close();
    console.log('Character storage: exact-main IPC, bounded allowlist, coalesced atomic writes/restart, authoritative tombstones, preserved corruption/recovery and retryable failures passed.');
}finally{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('eoz-character-storage-unit-'));await rm(directory,{recursive:true,force:true});}
