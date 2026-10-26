import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
const require=createRequire(import.meta.url),{CharacterStorage,CHARACTER_STORAGE_KEYS}=require('../desktop/character-storage.cjs');
const temporary=await mkdtemp(join(tmpdir(),'eoz-legacy-retirement-'));
const characterKeys=CHARACTER_STORAGE_KEYS.filter(key=>!key.includes('contributions')),contributionKey=CHARACTER_STORAGE_KEYS.find(key=>key.includes('contributions'));
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(name){
    const directory=join(temporary,name),repository=join(directory,'character-repository');await mkdir(repository,{recursive:true});
    const values=Object.fromEntries(characterKeys.map((key,index)=>[key,JSON.stringify({schemaVersion:1,synthetic:index})]));values[contributionKey]='synthetic independent contribution';
    const original=Buffer.from(JSON.stringify({schemaVersion:1,values})),source={name:'character-legacy-'+digest(original)+'.json',bytes:original.length,sha256:digest(original)};
    await writeFile(join(directory,'eye-of-zomm-character-storage.json'),original);await writeFile(join(repository,source.name),original);
    const store=new CharacterStorage({directory});await store.initialize();return{directory,repository,values,original,source,store};
}
try{
    {
        const f=await fixture('verified'),result=await f.store.retireCharacterData({directory:f.repository,source:f.source});assert(result.ok);assert(result.contributionPreserved);
        const saved=JSON.parse(await readFile(f.store.file,'utf8'));for(const key of characterKeys)assert.equal(saved.values[key],null);assert.equal(saved.values[contributionKey],f.values[contributionKey]);
        assert.deepEqual(await readFile(join(f.repository,f.source.name)),f.original,'The complete original source remains byte-exact in the verified recovery backup');
        await assert.rejects(f.store.write({key:characterKeys[0],value:'new stale model'}),/native repository/);
        await f.store.write({key:contributionKey,value:'new independent contribution'});await f.store.close();
        const reopened=new CharacterStorage({directory:f.directory});await reopened.initialize();for(const key of characterKeys)assert.equal(reopened.read().values[key],null);assert.equal(reopened.read().values[contributionKey],'new independent contribution');await reopened.close();
    }
    {
        const f=await fixture('bad-digest');await assert.rejects(f.store.retireCharacterData({directory:f.repository,source:{...f.source,sha256:'0'.repeat(64)}}),/match/);assert.deepEqual(f.store.read().values,f.values);await f.store.close();
    }
    {
        const f=await fixture('changed-values');await f.store.write({key:characterKeys[0],value:'deliberately newer source'});
        await assert.rejects(f.store.retireCharacterData({directory:f.repository,source:f.source}),/changed/);assert.equal(f.store.read().values[characterKeys[0]],'deliberately newer source');assert.equal(f.store.read().values[contributionKey],f.values[contributionKey]);await f.store.close();
    }
    {
        const f=await fixture('replacement-backup');await writeFile(join(f.repository,f.source.name),'a replaced synthetic backup');await assert.rejects(f.store.retireCharacterData({directory:f.repository,source:f.source}),/match/);assert.deepEqual(f.store.read().values,f.values);await f.store.close();
    }
    {
        const f=await fixture('failed-save'),flush=f.store.flush.bind(f.store);f.store.flush=async()=>{throw Error('Synthetic disk failure');};
        await assert.rejects(f.store.retireCharacterData({directory:f.repository,source:f.source}),/disk failure/);assert.deepEqual(f.store.read().values,f.values,'An unacknowledged retirement restores the previous in-memory keys');assert.deepEqual(await readFile(f.store.file),f.original,'A failed retirement does not replace the original file');f.store.flush=flush;await f.store.close();
    }
    {
        const directory=join(temporary,'contribution-only');await mkdir(directory);const store=new CharacterStorage({directory});await store.initialize();await store.write({key:contributionKey,value:'independent draft'});
        const result=await store.retireCharacterData();assert(result.ok&&result.alreadyRetired);assert.equal(store.read().values[contributionKey],'independent draft');await assert.rejects(store.write({key:characterKeys[0],value:'stale browser mirror'}),/native repository/);await store.close();
    }
    console.log('Legacy Character retirement: exact verified backup, contribution independence, stale-writer block, changed-source/digest rejection and idempotent empty-source handling passed.');
}finally{
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-legacy-retirement-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
