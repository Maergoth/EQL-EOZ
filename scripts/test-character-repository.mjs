// Real sandboxed main/preload, native SQLite worker, streamed UI import and restart.
// Disposable synthetic data only; no installed profile, game assets or wiki writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const root=arg('--packaged-root')?resolve(arg('--packaged-root')):sourceRoot;
const output=arg('--screenshots')?resolve(arg('--screenshots')):null;
const require=createRequire(import.meta.url),temporary=await mkdtemp(join(tmpdir(),'eoz-inventory-repository-'));
const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),proofs=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function icon(seed){
    const width=48,height=48,raw=Buffer.alloc((width*4+1)*height);let random=seed+1;
    const noise=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random>>>24;};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const p=y*(width*4+1)+1+x*4,diamond=Math.abs(x-23.5)+Math.abs(y-23.5)<20,n=noise();
        const base=diamond?[35+seed*18,120+seed*8,145+seed*5]:[12,20,31];
        for(let c=0;c<3;c++)raw[p+c]=Math.max(0,Math.min(255,base[c]+(diamond?n%55:n%18)+(x<y?12:0)));
        raw[p+3]=255;
    }
    const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
    const chunk=(name,data)=>{const kind=Buffer.from(name),body=Buffer.concat([kind,data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE(crc32(body),result.length-4);return result;};
    const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
async function native({root,temporary,profile,port,phase,output,expectedCards,keyringCount}){
    const electron=require('electron'),{app,BrowserWindow,session}=electron,Module=require('node:module'),path=require('node:path'),fs=require('node:fs/promises'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
    app.setPath('userData',profile);app.disableHardwareAcceleration();
    const watchdog=setTimeout(()=>{console.error('Character repository fixture watchdog');app.exit(2);},150000);watchdog.unref();
    const original=Module._load,showInactive=BrowserWindow.prototype.showInactive;
    function HiddenWindow(options){const win=new BrowserWindow({...options,show:false});win.show=()=>{};win.showInactive=()=>{};win.focus=()=>{};return win;}
    Object.setPrototypeOf(HiddenWindow,BrowserWindow);HiddenWindow.prototype=BrowserWindow.prototype;
    // Dialogs are forbidden: both matching exports exist in the configured root.
    const dialog={...electron.dialog,showOpenDialog:async()=>{throw Error('Unexpected file chooser for existing matching exports');}};
    Module._load=function(name,...args){return name==='electron'?{...electron,BrowserWindow:HiddenWindow,dialog}:original.call(this,name,...args);};
    const create=http.createServer;http.createServer=function(...args){const server=create.apply(this,args),listen=server.listen;server.listen=function(...values){if(values[0]===53147)values[0]=port;return listen.apply(this,values);};return server;};
    global.fetch=async()=>{throw Error('External fixture requests disabled');};
    await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((details,done)=>{try{const url=new URL(details.url);done({cancel:['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1'});}catch{done({cancel:false});}});
    const wait=ms=>new Promise(done=>setTimeout(done,ms)),execute=(win,fn,...args)=>win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const until=async(fn,label)=>{const end=Date.now()+90000;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await wait(50);}throw Error(label+(last?': '+last.message:''));};
    let owner;
    const work=(async()=>{
        owner=await until(()=>BrowserWindow.getAllWindows().find(win=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(win.webContents.getURL())),'actual main root');
        await until(()=>execute(owner,()=>document.readyState==='complete'&&Boolean(window.eyeOfZommCharacterRepository)&&Boolean(document.querySelector('[data-inventory-scope]'))),'actual repository workspace');
        owner.setContentSize(1560,1160);await execute(owner,()=>document.querySelector('[data-view="character"]').click());
        await until(()=>execute(owner,()=>document.querySelector('[data-character-identity]')?.textContent.includes('Storage Demonstration')&&!document.querySelector('[data-inventory-page="next"]').disabled),'actual migrated/restored inventory page');
        const migrated=await execute(owner,async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap(),core=await api.getCore({profileId:b.activeProfileId}),manual=await api.get({profileId:b.activeProfileId,id:'legacy-keepsake'});return{bootstrap:b,core,manual};});
        assert(migrated.bootstrap.ok);assert.equal(migrated.bootstrap.profiles.length,2);assert(migrated.manual.ok);assert.equal(migrated.manual.item?.notes||migrated.manual.card?.notes,'Keep this manual evidence.');
        if(phase==='import'){
            assert.equal(migrated.core.counts.candidates,1003,'The actual desktop migrates beyond the old 1000-card slice');
            assert.equal(migrated.core.core.statSnapshots.current.stats.HP,3456,'Migration preserves reviewed game totals');
            await execute(owner,()=>document.querySelector('[data-character-reimport]').click());
            await until(()=>execute(owner,()=>Boolean(document.querySelector('[data-inventory-read]'))&&!document.querySelector('[data-character-select]').disabled),'explicit paired file import step');
            await execute(owner,()=>document.querySelector('[data-inventory-read]').click());
            await until(()=>execute(owner,expected=>document.querySelector('[data-character-inventory-count]')?.textContent.startsWith(expected.toLocaleString()+' saved'),expectedCards),'complete streamed native import');
            const refreshed=await execute(owner,async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap();return api.getCore({profileId:b.activeProfileId});});
            assert.equal(refreshed.core.statSnapshots.current,null,'A new equipment import requires fresh recorded totals');
            await until(()=>execute(owner,()=>Boolean(document.querySelector('[data-walkthrough-stats]'))&&!document.querySelector('[data-character-select]').disabled),'reviewed manual stat step');
            await execute(owner,()=>{const form=document.querySelector('[data-walkthrough-stats]'),field=form.querySelector('[data-walkthrough-stats-values]');field.value='HP: 3460\nSTR: 124';field.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();});
            await until(()=>execute(owner,async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap(),c=await api.getCore({profileId:b.activeProfileId});return c.core.statSnapshots.current?.stats?.HP===3460;}),'fresh manual stats durably saved');
        }
        const query=async(scope,needle='')=>execute(owner,async(scope,needle)=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap(),c=await api.getCore({profileId:b.activeProfileId});return api.list({profileId:b.activeProfileId,generation:c.generation,scope,query:needle,limit:50});},scope,needle);
        const core=await execute(owner,async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap();return api.getCore({profileId:b.activeProfileId});});
        assert(core.ok);assert.equal(core.counts.candidates,expectedCards);assert.equal(core.counts.equipped,23);assert.equal(core.counts.keyring,keyringCount);assert.equal(core.core.statSnapshots.current.stats.HP,3460,'Fresh reviewed totals survive storage/restart');assert.equal(core.core.achievements.achievementCount,1);
        assert(!Object.hasOwn(core.core,'candidates'));assert(!Object.hasOwn(core.core.inventoryExport,'keyring'));assert(!Object.hasOwn(core.core.inventoryExport,'candidateIds'));
        const first=await query('loose');assert(first.ok);assert(first.items.length<=50);assert(first.nextCursor);assert(Buffer.byteLength(JSON.stringify(first))<=1024*1024);
        const before=await execute(owner,()=>Array.from(document.querySelectorAll('[data-character-inventory] [data-edit-card]'),node=>node.dataset.editCard));assert(before.length<=50);assert(before.length>0);
        await execute(owner,()=>document.querySelector('[data-inventory-page="next"]').click());
        await until(()=>execute(owner,before=>{const now=Array.from(document.querySelectorAll('[data-character-inventory] [data-edit-card]'),node=>node.dataset.editCard);return now.length>0&&now.length<=50&&now[0]!==before[0];},before),'actual next page changes only bounded cards');
        await execute(owner,()=>{const input=document.querySelector('[data-inventory-search]');input.value='Storage Prize';input.dispatchEvent(new Event('input',{bubbles:true}));});
        await until(()=>execute(owner,()=>document.querySelectorAll('[data-character-inventory] [data-edit-card]').length===1&&document.querySelector('[data-character-inventory]')?.textContent.includes('Storage Prize')),'actual native inventory search');
        const itemId=await execute(owner,()=>{const button=document.querySelector('[data-character-inventory] [data-edit-card]');button.click();return button.dataset.editCard;});
        await until(()=>execute(owner,()=>Boolean(document.querySelector('[data-character-editor] [data-card-tier]'))),'selected row editor');
        if(phase==='import'){
            await execute(owner,()=>{const range=document.querySelector('[data-character-editor] [data-card-tier]');range.value='7';range.dispatchEvent(new Event('input',{bubbles:true}));});
            await until(()=>execute(owner,async id=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap(),r=await api.get({profileId:b.activeProfileId,id});return (r.item||r.card)?.tier===7;},itemId),'durably acknowledged single-row edit');
        }
        const selected=await execute(owner,async id=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap();await api.flush();return api.get({profileId:b.activeProfileId,id});},itemId);assert.equal((selected.item||selected.card).tier,7);
        const keyring=await query('keyring');assert.equal(keyring.filteredTotal,keyringCount);assert(keyring.items.length<=50);assert(keyring.nextCursor);
        const unknown=await query('rejected','Unmatched Expedition Find');assert.equal(core.counts.rejected,keyringCount+1,'Unknown keyring rows preserve their old missing-catalog record as well as their keyring record');assert.equal(unknown.items.length,1);assert(unknown.items[0].entry.name.includes('Unmatched Expedition Find'));
        const worn=await query('equipped'),primary=worn.items.find(card=>card.id===core.core.equipment.primary);assert.equal(primary.augmentSlots,3);assert.equal(primary.augments.length,1);assert.equal(primary.augments[0].index,1);assert.equal(primary.augments[0].sourceSlot,4);
        await execute(owner,()=>{const scope=document.querySelector('[data-inventory-scope]');scope.value='keyring';const search=document.querySelector('[data-inventory-search]');search.value='';scope.dispatchEvent(new Event('change'));});
        await until(()=>execute(owner,()=>document.querySelector('[data-character-inventory]')?.textContent.includes('Synthetic Key')&&document.querySelectorAll('[data-character-inventory] [data-edit-card]').length===0),'raw keyring records are accessible without equipment actions');
        // The same native projection used for sharing contains equipped rows only.
        const shareProof=await execute(owner,async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap(),c=await api.getCore({profileId:b.activeProfileId}),rows=[];let cursor;do{const p=await api.list({profileId:b.activeProfileId,generation:c.generation,scope:'equipped',limit:25,cursor});if(!p.ok)throw Error(p.error);rows.push(...p.items);cursor=p.nextCursor;}while(cursor);const {buildCharacterWikiSheet}=await import('./character-wiki-sheet.js');const sheet=buildCharacterWikiSheet({...c.core,candidates:rows});return{items:sheet.equipment.length,hasLoose:JSON.stringify(sheet).includes('Storage Prize'),hp:sheet.totals.stats?.HP??sheet.totals.HP,storageBytes:new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.includes('character'))))).length};});
        assert.equal(shareProof.items,23);assert.equal(shareProof.hasLoose,false);assert.equal(shareProof.hp.value,3460);assert(shareProof.storageBytes<65536,'No complete inventory browser mirror');
        const origin=new URL(owner.webContents.getURL()).origin,foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
        try{await foreign.loadURL(origin+'/overlay.html?panel=parse');const denied=await execute(foreign,async()=>{const api=window.eyeOfZommCharacterRepository;return Promise.all([()=>api.bootstrap(),()=>api.getCore({profileId:'draft'}),()=>api.list({profileId:'draft'}),()=>api.transaction({profileId:'draft'}),()=>api.importFiles({profileId:'draft'}),()=>api.flush()].map(async call=>{try{await call();return false;}catch{return true;}}));});assert.deepEqual(denied,[true,true,true,true,true,true]);}finally{foreign.destroy();}
        await execute(owner,()=>{const input=document.querySelector('[data-inventory-search]');input.value='';const scope=document.querySelector('[data-inventory-scope]');scope.value='loose';scope.dispatchEvent(new Event('change'));document.querySelector('[data-character-workbench]').open=true;});
        await until(()=>execute(owner,()=>document.querySelectorAll('[data-character-inventory] [data-edit-card]').length>0),'final bounded page');
        await execute(owner,()=>{document.querySelectorAll('#toast-region .toast-close').forEach(button=>button.click());document.querySelector('.character-bags').scrollIntoView({block:'start'});return Promise.all(Array.from(document.images,image=>image.decode().catch(()=>{})));});
        if(output){showInactive.call(owner);await execute(owner,()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await wait(150);owner.webContents.invalidate();const image=await owner.capturePage();assert(!image.isEmpty());await fs.writeFile(path.join(output,phase+'.png'),image.toPNG());}
        await execute(owner,()=>window.eyeOfZommCharacterRepository.flush());
        const proof={ok:true,phase,actualMainPreload:true,actualUiImport:phase==='import',actualProcessRestart:phase==='restart',sqlite:process.versions.sqlite,node:process.versions.node,electron:process.versions.electron,migratedProfiles:migrated.bootstrap.profiles.length,counts:core.counts,pageRows:first.items.length,pageBytes:Buffer.byteLength(JSON.stringify(first)),selectedItemId:itemId,editedTier:7,shareProof,foreignDenied:true,verifiedLegacyBackup:true};
        await fs.writeFile(path.join(temporary,phase+'.json'),JSON.stringify(proof,null,2));owner.hide();clearTimeout(watchdog);app.quit();
    })();
    require(path.join(root,'desktop/main.cjs'));
    try{await work;}catch(error){if(owner&&!owner.isDestroyed()){try{const diagnostic=await execute(owner,()=>({identity:document.querySelector('[data-character-identity]')?.textContent,count:document.querySelector('[data-character-inventory-count]')?.textContent,status:document.querySelector('[data-character-repository-status]')?.textContent,importStatus:document.querySelector('[data-inventory-import-status]')?.textContent,alerts:Array.from(document.querySelectorAll('[role="alert"]'),node=>node.textContent)}));console.error(JSON.stringify(diagnostic));if(output)await fs.writeFile(path.join(output,'failure-'+phase+'.png'),(await owner.capturePage()).toPNG());}catch{}}throw error;}
}

try{
    if(output)await mkdir(output,{recursive:true});await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});await writeFile(join(game,'Logs','eqlog_Storage_Fixture.txt'),'');
    const pkg=JSON.parse(await readFile(join(sourceRoot,'package.json'),'utf8'));
    const slotKinds=['ANY','EAR','HEAD','FACE','EAR','NECK','SHOULDERS','ARMS','BACK','WRIST','WRIST','RANGE','HANDS','PRIMARY','SECONDARY','FINGER','FINGER','CHEST','LEGS','FEET','WAIST','ANY','AMMO'];
    const slotLabels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
    const icons=Object.fromEntries(Array.from({length:8},(_,i)=>['synthetic-'+i,icon(i)])),catalog=[],rows=['Location\tName\tID\tCount\tSlots'];
    const importedCards=1500,keyringCount=21030;
    for(let index=0;index<importedCards;index++){
        const worn=index<23,name=worn?'Expedition Equipment '+String(index+1).padStart(2,'0'):index===importedCards-1?'Storage Prize':'Stored Expedition Relic '+String(index%32).padStart(2,'0'),kind=worn?slotKinds[index]:'FINGER';
        if(!catalog.some(item=>item.name===name))catalog.push({name,wikiTitle:name,iconId:'synthetic-'+index%8,classes:['WAR'],races:['ALL'],slots:[kind],stats:{AC:12,HP:25,STR:3},details:[{label:'Notes',value:'Synthetic inventory repository demonstration.'}]});
        rows.push(`${worn?slotLabels[index]:index<500?'General '+(index-22):index<1000?'Bank'+(index-499):'Personal-Depot'+(index-999)}\t${name} +${index%6}\t${10000+(worn?index:index%32)}\t1\t0`);
        if(index===13||index===23){const location=index===13?'Primary':'General 1';rows.push(`${location}-Slot1\tEmpty\t0\t0\t0`,`${location}-Slot4\tSocket Bloom (Exaltation) +1\t900001\t1\t0`,`${location}-Slot8\tEmpty\t0\t0\t0`);}
    }
    catalog.push({name:'Socket Bloom',wikiTitle:'Socket Bloom',slots:[],classes:['ALL'],stats:{HP:5},iconId:'synthetic-0'});
    rows.push('Personal-Depot99999\tUnmatched Expedition Find +2\t900002\t1\t0');
    rows.push('','KeyRing\tName\tID');for(let index=0;index<keyringCount;index++)rows.push(`Equipment\tSynthetic Key ${String(index).padStart(6,'0')} ${'for a distant expedition '.repeat(4).trim()}\t${50000+index}`);
    const tsv=rows.join('\n')+'\n';assert(Buffer.byteLength(tsv)>2*1024*1024,'Fixture exceeds the former whole-file bound');
    const pack={meta:{schemaVersion:3,version:'synthetic-inventory-repository',manifestVersion:'synthetic-inventory-repository',sample:false,wikiEntitiesComplete:true},zones:[],npcs:[],items:catalog,icons,wikiEntities:{items:catalog.map(item=>item.name),npcs:[],zones:[],titles:catalog.map(item=>item.name)}};
    await writeFile(join(game,'Storage Demonstration_Synthetic-Inventory.txt'),tsv);await writeFile(join(game,'Storage Demonstration_Synthetic-Achievements.txt'),'Synthetic: Exploration\nC\tA prepared expedition\nC\t\tPrepare equipment and supplies.\n');
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify(pack));
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:join(game,'Logs','eqlog_Storage_Fixture.txt'),frontendCacheVersion:pkg.version,screenReadingEnabled:false,logSelection:'manual'}));
    const card=(id,name)=>({id,name,wikiTitle:name,catalogIdentity:{name,wikiTitle:name,match:'manual'},slots:['FINGER'],tier:2,fraction:0,observedStats:{HP:10},augments:[],augmentStatus:'none',notes:'Keep this manual evidence.'});
    const legacyModel={schemaVersion:1,sequence:1003,metadata:{name:'Storage Demonstration',server:'Synthetic',classes:['WAR'],race:'Human',level:50,aaCount:0},candidates:[card('legacy-keepsake','Legacy Keepsake'),...Array.from({length:1002},(_,index)=>card('legacy-copy-'+index,'Earlier Planning Copy '+index))],equipment:{},pendingEquipment:{},statSnapshots:{current:{stats:{HP:3456,STR:123},confirmed:true,at:1}},observationRefs:[],removedObservations:[],removedInstances:[]};
    const alternate={...legacyModel,metadata:{...legacyModel.metadata,name:'Storage Alternate'},candidates:[card('alternate-card','Alternate Keepsake')]},draft={...legacyModel,metadata:{...legacyModel.metadata,name:'',server:''},candidates:[card('draft-card','Draft Keepsake')]};
    const values={'eql-eye-of-zomm-character-v1':JSON.stringify(legacyModel),'eql-eye-of-zomm-character-walkthrough-v1':null,'eql-eye-of-zomm-character-profiles-v1':JSON.stringify({schemaVersion:1,activeId:'storage-primary',draft:{model:JSON.stringify(draft),walkthrough:null},profiles:[{id:'storage-primary',name:'Storage Demonstration',server:'Synthetic',model:JSON.stringify(legacyModel),walkthrough:null},{id:'storage-alternate',name:'Storage Alternate',server:'Synthetic',model:JSON.stringify(alternate),walkthrough:null}]})};
    const legacy=Buffer.from(JSON.stringify({schemaVersion:1,values})),legacyFile=join(profile,'eye-of-zomm-character-storage.json');await writeFile(legacyFile,legacy);
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-inventory-repository-fixture',version:pkg.version,main:'main.cjs'}));
    const probe=http.createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done));
    for(const phase of ['import','restart']){
        await writeFile(join(temporary,'main.cjs'),`(${native.toString()})(${JSON.stringify({root,temporary,profile,port,phase,output,expectedCards:importedCards+1003,keyringCount})}).catch(error=>{console.error(error.stack||String(error));require('electron').app.exit(1);});`);
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise((done,reject)=>{const child=spawn(require('electron'),[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:165000});let log='';child.stdout.on('data',chunk=>{log=(log+chunk).slice(-200000);});child.stderr.on('data',chunk=>{log=(log+chunk).slice(-200000);});child.once('error',reject);child.once('close',code=>done({code,log}));});
        if(output)await writeFile(join(output,phase+'.log'),result.log);assert.equal(result.code,0,result.log);proofs.push(JSON.parse(await readFile(join(temporary,phase+'.json'),'utf8')));
    }
    assert.equal(proofs[0].selectedItemId,proofs[1].selectedItemId,'Physical item ID survives process restart');
    const retained=JSON.parse(await readFile(legacyFile,'utf8'));
    for(const key of Object.keys(values))assert.equal(retained.values[key],null,'Verified migrated Character keys retire from the old whole-roster file');
    assert.equal(hash(await readFile(join(profile,'character-repository','character-legacy-'+hash(legacy)+'.json'))),hash(legacy),'Verified migration backup preserves exact original bytes');
    const bytes=(await stat(join(profile,'character-repository','inventory.sqlite'))).size;
    const receipt={ok:true,version:pkg.version,packaged:root.endsWith('.asar'),actualProcesses:2,rawExportBytes:Buffer.byteLength(tsv),rawRows:importedCards+keyringCount,databaseBytes:bytes,syntheticOnly:true,installedProfile:false,externalNetwork:false,proofs};
    if(output)await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log('EOZ_CHARACTER_REPOSITORY='+JSON.stringify(receipt));
}finally{
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-inventory-repository-'));
    await rm(temporary,{recursive:true,force:true,maxRetries:6,retryDelay:150});
}
