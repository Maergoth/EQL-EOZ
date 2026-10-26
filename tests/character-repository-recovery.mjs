import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {decomposeLegacyCharacterStorage,legacyInventoryProof} from '../app/inventory-legacy-migration.js';

const require=createRequire(import.meta.url),{DatabaseSync}=require('node:sqlite'),{CharacterRepository}=require('../desktop/character-repository.cjs');
const temporary=await mkdtemp(join(tmpdir(),'eoz-repository-recovery-')),opened=new Set();
const modelKey='eql-eye-of-zomm-character-v1',rosterKey='eql-eye-of-zomm-character-profiles-v1',flowKey='eql-eye-of-zomm-character-walkthrough-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const core=name=>({schemaVersion:1,metadata:{name,server:'Synthetic'},equipment:{},pendingEquipment:{},inventoryExport:null,statSnapshots:{current:null},removedInstances:[],unknownCore:{kept:true}});
const card=id=>({id,name:'Synthetic Recovery Relic',wikiTitle:'Synthetic Recovery Relic',catalogIdentity:{name:'Synthetic Recovery Relic',wikiTitle:'Synthetic Recovery Relic',match:'exact'},tier:0,notes:'Preserve private manual fields',unrecognized:{kept:true}});
function environment(directory){
    const frame={url:'http://127.0.0.1:53148/'},contents={mainFrame:frame,send(){}},window={webContents:contents,isDestroyed:()=>false};
    const electron={ipcMain:{handle(){},removeHandler(){}},dialog:{showOpenDialog:async()=>({canceled:true})}};
    const repo=new CharacterRepository({directory:join(directory,'repository'),electron,origin:'http://127.0.0.1:53148',getMainWindow:()=>window,readConfig:async()=>({}),getPack:async()=>({items:[]})});
    opened.add(repo);return {repo,event:{sender:contents,senderFrame:frame}};
}
async function shutdown(repo){await repo.close();opened.delete(repo);}
async function folder(name){const directory=join(temporary,name);await mkdir(directory);return directory;}
const checked=result=>{assert.equal(result.ok,true,result.error);return result;};
try{
    // Independently recompute the source proof from the actual persisted rows,
    // not from the original in-memory objects used by the migration writer.
    const directory=await folder('stored-proof'),model={...core('Stored Proof'),candidates:Array.from({length:1003},(_,index)=>card('legacy-'+index)),inventoryExport:{schemaVersion:1,rowCount:1100,candidateIds:['legacy-0','legacy-0'],keyring:[{name:'Synthetic key',opaque:'same'}],rejectedItems:[{name:'Synthetic unknown',reason:'wiki-item-missing',opaque:'keep'}]}};
    const originalProfile={id:'proof',name:'Stored Proof',server:'Synthetic',model:JSON.stringify(model),walkthrough:JSON.stringify({schemaVersion:1,step:'review',privateFlow:{kept:true}}),counts:{future:'opaque'},core:{future:'opaque'},flow:{future:'opaque'},profileId:'not-a-derived-binding'};
    const roster={schemaVersion:1,activeId:'proof',draft:{model:null,walkthrough:null,futureDraft:{kept:true}},profiles:[originalProfile],futureRoster:{kept:true}};
    const envelope={schemaVersion:1,unknownEnvelope:{kept:true},values:{[modelKey]:JSON.stringify(model),[rosterKey]:JSON.stringify(roster),futureKey:'opaque'}},raw=JSON.stringify(envelope);
    await writeFile(join(directory,'eye-of-zomm-character-storage.json'),raw);
    let {repo}=environment(directory);const boot=checked(await repo.initialize());assert.equal(boot.migration.proofs.find(proof=>proof.profileId==='proof').counts.candidates,1003);await shutdown(repo);
    const database=new DatabaseSync(join(directory,'repository','inventory.sqlite'),{readOnly:true});
    try{
        const decomposition=decomposeLegacyCharacterStorage(envelope);
        for(const source of decomposition.profiles()){
            const stored=database.prepare('SELECT core,flow,metadata FROM legacy_profiles WHERE profile=?').get(source.profileId);assert(stored);
            const proof=await legacyInventoryProof({profileId:source.profileId,core:JSON.parse(stored.core),flow:JSON.parse(stored.flow),counts:source.counts,records:function*(){for(const record of database.prepare("SELECT kind,ordinal,payload FROM legacy_records WHERE profile=? ORDER BY CASE kind WHEN 'candidate' THEN 0 WHEN 'candidate-id' THEN 1 WHEN 'keyring' THEN 2 ELSE 3 END,ordinal").iterate(source.profileId))yield {kind:record.kind,ordinal:record.ordinal,value:JSON.parse(record.payload)};}},{hashBytes:hash});
            assert.deepEqual(proof,boot.migration.proofs.find(proof=>proof.profileId===source.profileId));
            assert.deepEqual(JSON.parse(stored.metadata),source.legacyMetadata,'Opaque original profile keys survive derived migration key collisions');
        }
        const storedEnvelope=JSON.parse(database.prepare("SELECT value FROM meta WHERE key='legacy_envelope'").get().value);
        assert.deepEqual(storedEnvelope.outerFields,decomposition.outerFields);assert.deepEqual(storedEnvelope.roster.futureRoster,{kept:true});
        assert.equal(database.prepare("SELECT value FROM meta WHERE key='activated'").get().value,'1');
    }finally{database.close();}
    assert.equal(await readFile(join(directory,'eye-of-zomm-character-storage.json'),'utf8'),raw);

    // A worker/process interruption before generation activation cannot expose
    // partial staged rows or destroy the previous physical inventory.
    const crashDirectory=await folder('staging-interruption');let env=environment(crashDirectory);repo=env.repo;checked(await repo.initialize());
    const profile=checked(await repo.handle(env.event,'createProfile',{metadata:{name:'Crash Proof',server:'Synthetic'}}));
    const before=checked(await repo.handle(env.event,'transaction',{profileId:profile.profileId,expectedRevision:profile.revision,upserts:[card('keep-me')]}));
    checked(await repo.request('beginImport',{jobId:'interrupted-generation',profileId:profile.profileId,expectedRevision:before.revision,pack:{items:[]}}));
    checked(await repo.request('appendImport',{jobId:'interrupted-generation',kind:'inventory',text:'Location\tName\tID\tCount\tSlots\nHead\tSynthetic staged gear\t123\t1\t0\n'}));
    await repo.worker.terminate();await shutdown(repo);env=environment(crashDirectory);repo=env.repo;checked(await repo.initialize());
    const after=checked(await repo.request('getCore',{profileId:profile.profileId}));assert.equal(after.generation,before.generation);assert.equal(after.revision,before.revision);assert.equal(after.counts.candidates,1);assert.deepEqual(checked(await repo.request('get',{profileId:profile.profileId,id:'keep-me'})).item,card('keep-me'));
    checked(await repo.request('beginImport',{jobId:'after-restart',profileId:profile.profileId,expectedRevision:after.revision,pack:{items:[]}}));checked(await repo.request('cancelImport',{jobId:'after-restart'}));await shutdown(repo);

    // Once SQLite is authoritative, corrupt data blocks startup instead of
    // silently falling back to the old JSON snapshot and losing newer edits.
    const corrupt=Buffer.from('synthetic-corrupt-sqlite-header');await writeFile(join(directory,'repository','inventory.sqlite'),corrupt);
    env=environment(directory);repo=env.repo;const unavailable=await repo.initialize();assert.equal(unavailable.ok,false);assert.equal(unavailable.available,false);await shutdown(repo);
    assert.deepEqual(await readFile(join(directory,'repository','inventory.sqlite')),corrupt);assert.equal(await readFile(join(directory,'eye-of-zomm-character-storage.json'),'utf8'),raw);

    // A bad/canceled browser seed must leave the native draft pristine and the
    // original browser-owned strings untouched. Recheck pristine state inside
    // the activation transaction even if a second internal writer raced it.
    const seedDirectory=await folder('seed-failures');env=environment(seedDirectory);repo=env.repo;assert.equal(checked(await repo.initialize()).legacySeedAllowed,true);
    const seedText=JSON.stringify({schemaVersion:1,values:{[modelKey]:JSON.stringify({...core('Browser Recovery'),candidates:[card('browser')]}),[flowKey]:JSON.stringify({schemaVersion:1,step:'review'})}});
    let seed=checked(await repo.handle(env.event,'beginLegacySeed',{}));checked(await repo.handle(env.event,'appendLegacySeed',{token:seed.token,text:seedText}));
    const wrong=await repo.handle(env.event,'commitLegacySeed',{token:seed.token,sha256:'0'.repeat(64)});assert.equal(wrong.ok,false);assert.equal(wrong.code,'backup-failed');assert.equal(checked(await repo.handle(env.event,'bootstrap',{})).legacySeedAllowed,true);assert.equal(checked(await repo.request('getCore',{profileId:'draft'})).counts.total,0);
    seed=checked(await repo.handle(env.event,'beginLegacySeed',{}));checked(await repo.handle(env.event,'appendLegacySeed',{token:seed.token,text:seedText.slice(0,20)}));checked(await repo.handle(env.event,'cancelLegacySeed',{token:seed.token}));assert.equal(checked(await repo.handle(env.event,'bootstrap',{})).legacySeedAllowed,true);
    seed=checked(await repo.handle(env.event,'beginLegacySeed',{}));checked(await repo.handle(env.event,'appendLegacySeed',{token:seed.token,text:seedText}));
    const draft=checked(await repo.request('getCore',{profileId:'draft'}));const denied=await repo.request('transaction',{profileId:'draft',expectedRevision:draft.revision,upserts:[card('new-native-item')]});assert.equal(denied.ok,false,'Seed ownership also blocks direct worker mutations');
    // Fault injection through a second connection models an external writer;
    // no ordinary API can bypass the pending-seed guard above.
    const external=new DatabaseSync(join(seedDirectory,'repository','inventory.sqlite'));
    try{external.exec('BEGIN IMMEDIATE');external.prepare('INSERT INTO items(profile,generation,id,ordinal,physical_key,name,group_name,kind,equipped_slot,payload) VALUES(?,?,?,?,?,?,?,?,NULL,?)').run('draft',draft.generation,'new-native-item',1,null,'synthetic recovery relic','manual','card',JSON.stringify(card('new-native-item')));external.prepare("UPDATE profiles SET revision=revision+1,counts=? WHERE id='draft'").run(JSON.stringify({total:1,candidates:1,equipped:0,loose:1,keyring:0,rejected:0,rawRows:0,groups:{manual:1}}));external.exec('COMMIT');}finally{external.close();}
    const blocked=await repo.handle(env.event,'commitLegacySeed',{token:seed.token,sha256:hash(seedText)});assert.equal(blocked.ok,false);assert.equal(blocked.code,'seed-not-allowed');assert.equal(checked(await repo.request('getCore',{profileId:'draft'})).revision,draft.revision+1);assert.deepEqual(checked(await repo.request('get',{profileId:'draft',id:'new-native-item'})).item,card('new-native-item'));await shutdown(repo);
    env=environment(seedDirectory);repo=env.repo;assert.equal(checked(await repo.initialize()).legacySeedAllowed,false);assert.deepEqual(checked(await repo.request('get',{profileId:'draft',id:'new-native-item'})).item,card('new-native-item'));await shutdown(repo);
    console.log('Character repository recovery: stored count/SHA/opaque metadata proof, staged-worker interruption, corrupt-authority failclosed and browser-seed failure/pristine guards passed.');
}finally{
    await Promise.allSettled([...opened].map(repo=>repo.close()));assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-repository-recovery-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
