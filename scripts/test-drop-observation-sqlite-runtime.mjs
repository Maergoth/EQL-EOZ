// Actual Electron main/worker compatibility and synthetic legacy migration.
// Every profile/outbox is temporary; no game, installed profile or wiki is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),electron=require('electron');
const args=process.argv.slice(2);let renderer=true,packagedRoot=null;
for(let i=0;i<args.length;i++){
    if(args[i]==='--main-only')renderer=false;
    else if(args[i]==='--packaged-root'&&args[i+1]&&!packagedRoot)packagedRoot=resolve(args[++i]);
    else throw Error('Use --packaged-root <app.asar> and/or --main-only.');
}
if(packagedRoot){const stat=await lstat(packagedRoot);assert(stat.isFile()&&!stat.isSymbolicLink()&&basename(packagedRoot)==='app.asar','Use an explicit regular app.asar.');}
const archiveIdentity=async()=>{if(!packagedRoot)return null;const hash=createHash('sha256');for await(const bytes of createReadStream(packagedRoot))hash.update(bytes);return {bytes:(await lstat(packagedRoot)).size,sha256:hash.digest('hex')};};
const archiveBefore=await archiveIdentity(),metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const temporary=await mkdtemp(join(tmpdir(),'eoz-observation-runtime-'));

async function native({root,temporary,renderer,packaged,expectedVersion,expectedElectron}){
    const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
    app.setPath('userData',path.join(temporary,'electron-profile'));app.enableSandbox();app.disableHardwareAcceleration();
    const watchdog=setTimeout(()=>{console.error('Observation runtime fixture exceeded 45 seconds.');app.exit(2);},45000);watchdog.unref();
    await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((details,done)=>done({cancel:/^https?:/i.test(details.url)}));
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
    let window,store,reopened,legacy,beats=0,heartbeat;
    try{
        if(renderer){window=new BrowserWindow({show:false,width:320,height:200,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});await window.loadURL('about:blank');assert.equal(window.webContents.getLastWebPreferences().sandbox,true);assert.equal(await window.webContents.executeJavaScript('typeof require'), 'undefined');}
        assert.equal(process.versions.electron,expectedElectron,'Use the exact release Electron runtime');
        assert.equal(require(path.join(root,'package.json')).version,expectedVersion,'The tested artifact and source version must match');
        const {DropObservationStorage}=require(path.join(root,'desktop/drop-observation-storage.cjs'));
        const {SQLiteDropObservationStorage}=require(path.join(root,'desktop/drop-observation-sqlite.cjs'));
        const directory=path.join(temporary,'outbox'),user={id:70001,name:'Synthetic Runtime Observer'},other={id:70002,name:'Other Synthetic Observer'};
        let now=Date.UTC(2026,10,21,12),serial=0;
        const id=()=>`runtime-batch-${++serial}`;
        const event=(number,changes={})=>({id:`runtime-event-${number}`,kind:'loot',observedAt:new Date(now-(2000-number)*1000).toISOString(),server:'Synthetic',zone:'Synthetic Vale',npc:'Synthetic Guardian',item:'Synthetic Token',quantity:1,instance:'unknown',sourceKind:'explicit-corpse',...changes});
        const receipt=batch=>({schemaVersion:1,batchId:batch.batchId,account:user,accepted:batch.events.map(value=>value.id),duplicates:[],conflicts:[],rejected:[],receivedAt:new Date(now).toISOString()});
        legacy=new DropObservationStorage({directory,now:()=>now,id});await legacy.initialize();
        await legacy.append([event(1),event(2)],user);
        const accepted=await legacy.prepareBatch(user,'legacy-fixture',{maxEvents:1});await legacy.acknowledge(accepted,user,receipt(accepted));
        await legacy.append([event(3,{characterName:'Synthetic Runtime Character'})],user);
        const frozen=await legacy.prepareBatch(user,'legacy-fixture');
        await legacy.configure({enabled:false,includeCharacterName:true});await legacy.close();
        const original=await fs.readFile(legacy.file),digest=bytes=>createHash('sha256').update(bytes).digest('hex');

        store=new SQLiteDropObservationStorage({directory,now:()=>now,id});await store.initialize();
        assert.equal(store.status().error,null);assert.equal(store.status().enabled,false);assert.equal(store.status().includeCharacterName,true);
        assert.equal(store.status().pending,2);assert.equal(store.status().acknowledged,1);
        assert.deepEqual(await store.prepareBatch(user,'updated-fixture'),frozen,'Electron SQLite migration preserves exact immutable payload and client version');
        assert.equal(await store.prepareBatch(other,'updated-fixture'),null,'Another account cannot drain the migrated batch');
        const backups=(await fs.readdir(directory)).filter(name=>/^drop-observations-legacy-backup-.*\.json$/.test(name));assert.equal(backups.length,1);assert.equal(digest(await fs.readFile(path.join(directory,backups[0]))),digest(original));
        assert.equal((await fs.readFile(store.file)).subarray(0,16).toString('binary'),'SQLite format 3\0');
        await store.configure({enabled:true,includeCharacterName:false});await store.acknowledge(frozen,user,receipt(frozen));
        assert.equal(store.status().pending,0);assert.equal(store.status().acknowledged,3);
        assert.equal((await store.append([event(1),event(2)],user)).duplicates,2,'Acknowledged IDs remain deduplicated after migration');
        heartbeat=setInterval(()=>{beats++;},1);
        for(let first=1000;first<1200;first+=100)await store.append(Array.from({length:100},(_,offset)=>event(first+offset)),user);
        clearInterval(heartbeat);heartbeat=null;assert(beats>0,'Actual Electron main remains responsive while worker transactions run');
        await store.close();store=null;

        reopened=new SQLiteDropObservationStorage({directory,now:()=>now,id});await reopened.initialize();
        assert.equal(reopened.status().error,null);assert.equal(reopened.status().pending,200);assert.equal(reopened.status().acknowledged,3);assert.equal(reopened.status().includeCharacterName,false);
        const newest=await reopened.prepareBatch(user,expectedVersion,{maxEvents:100,maxBytes:262144,characterNameSupported:false});
        assert.equal(newest.events.length,100);assert.equal(newest.events[0].id,'runtime-event-1199');assert(Buffer.byteLength(JSON.stringify(newest))<=262144);
        assert.equal(digest(await fs.readFile(legacy.file)),digest(original),'Legacy source remains byte-identical after migration and restart');
        await reopened.close();reopened=null;
        console.log(JSON.stringify({ok:true,packaged,version:expectedVersion,electron:process.versions.electron,node:process.versions.node,sqlite:process.versions.sqlite,rendererSandboxed:renderer,mainHeartbeat:beats,legacyBackupVerified:true,immutableBatchVerified:true,accountIsolationVerified:true,restartPending:200,newestFirstVerified:true}));
    }finally{if(heartbeat)clearInterval(heartbeat);await reopened?.close();await store?.close();window?.destroy();clearTimeout(watchdog);}
    app.quit();
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${native.toString()})(${JSON.stringify({root:packagedRoot||root,temporary,renderer,packaged:Boolean(packagedRoot),expectedVersion:metadata.version,expectedElectron:metadata.devDependencies.electron})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,'Actual Electron observation runtime fixture passed');
    assert.deepEqual(await archiveIdentity(),archiveBefore,'The fixture cannot alter the tested ASAR');
    if(archiveBefore)console.log('Observation packaged ASAR verified:',JSON.stringify(archiveBefore));
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-observation-runtime-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
