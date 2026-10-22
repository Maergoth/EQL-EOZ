import assert from 'node:assert/strict';
import { CHARACTER_SLOTS, CHARACTER_LIMITS, CHARACTER_STORAGE_KEY, createCharacterModel, characterItemStats, characterObservationInput, characterShareSummary, characterSlotCompatibility, normalizeCharacterStats, safeCharacterIcon } from '../app/character-model.js';
import { CHARACTER_SHARE_LIMITS, characterShareLayout } from '../app/character-share.js';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};};
const storage=memory(),model=createCharacterModel({storage,now:()=>12345});
const item=(name='Synthetic Ring',extra={})=>({id:`observation-${name}`,sessionId:'synthetic-session',source:'synthetic-examine',at:12300,text:'PRIVATE_SYNTHETIC_EVIDENCE',item:{name,slots:['FINGER'],tier:0,stats:{HP:10,STR:2},statsComplete:true,augmentStatus:'none',...extra}});
assert.equal(CHARACTER_SLOTS.length,23);
assert.equal(new Set(CHARACTER_SLOTS.map(slot=>slot.id)).size,23);
for(const kind of ['EAR','WRIST','FINGER']) assert.equal(CHARACTER_SLOTS.filter(slot=>slot.kind===kind).length,2);
assert.deepEqual(normalizeCharacterStats({HP:'100',MP:'unknown',STR:Infinity,AC:null,constructor:5}),{HP:100,MP:null,STR:null,AC:null,CONSTRUCTOR:5});
assert.equal(safeCharacterIcon('https://invalid.test/tracker.png'),'');
assert.equal(safeCharacterIcon('data:image/svg+xml;base64,PHN2Zz4='),'');
const adapted=characterObservationInput({subject:{name:'Observed Charm'},fields:[{key:'slots',value:['CHARM']},{key:'tier',value:10},{key:'hp',value:999},{key:'manaMaximum',value:650},{key:'augmentNames',value:['Synthetic Ruby']},{key:'effects',value:'unmeasured'}]});
assert.deepEqual(adapted.stats,{HP:999,MP_MAXIMUM:650});
assert.equal(adapted.augments[0].name,'Synthetic Ruby');
assert.equal(adapted.augmentStatus,'unknown');

const first=model.intake(item());assert(first.ok);
assert.equal(model.intake(item()).deduplicated,true,'same observation replay is idempotent');
const copy=model.intake({...item(),id:'second-physical-copy'}).candidate;
assert.notEqual(copy.id,first.candidate.id,'same name/stat data never identifies a physical copy');
const otherSession=model.intake({...item(),sessionId:'another-session'});assert.equal(otherSession.deduplicated,false);
const tier0=model.intake(item('Stable Examine',{instanceKey:'selected-item'})).candidate;
const tier10=model.intake({...item('Stable Examine',{instanceKey:'selected-item',tier:10}),id:'tier-upgraded'}).candidate;
assert.notEqual(tier0.id,tier10.id,'tier variants retain separate evidence');
const augVariant=model.intake({...item('Stable Examine',{instanceKey:'selected-item',augments:[{name:'Synthetic Ruby'}]}),id:'with-augment'}).candidate;
assert.notEqual(augVariant.id,tier0.id,'augment variants retain separate evidence');

assert.equal(model.assign(first.candidate.id,'head').needsConfirmation,true);
assert.deepEqual(model.snapshot().equipment,{});
assert.equal(model.assign(first.candidate.id,'finger1').ok,true);
assert.equal(model.assign(copy.id,'finger1').needsConfirmation,true);
assert.equal(model.assign(copy.id,'finger2').ok,true);
assert.equal(model.assign(first.candidate.id,'finger2',{replace:true}).replaced,copy.id);
assert.deepEqual(model.snapshot().equipment,{finger2:first.candidate.id},'one physical card can occupy only one slot');
assert.equal(model.assign(copy.id,'finger1').ok,true);
assert.equal(characterSlotCompatibility({slots:[]},'head').unknown,true);
assert.equal(characterSlotCompatibility({slots:['WRIST']},'wrist2').compatible,true);
assert.equal(model.unassign('not-a-slot').ok,false);
assert.equal(model.unassign('finger1').ok,true);
assert.equal(model.removeCandidate(copy.id).ok,true);
assert.equal(model.snapshot().candidates.some(candidate=>candidate.id===copy.id),false);
const removalStorage=memory(),removals=createCharacterModel({storage:removalStorage,now:()=>200});
const oldObservation={...item('Removed OCR'),id:'removed-observation'};
const removedCard=removals.intake(oldObservation).candidate;removals.removeCandidate(removedCard.id);
const removalRestart=createCharacterModel({storage:removalStorage,now:()=>200});
assert.equal(removalRestart.intake(oldObservation).ignored,true,'Journal replay cannot resurrect a removed OCR card');
assert.equal(removalRestart.snapshot().candidates.length,0);
assert.equal(removalRestart.intake({...oldObservation,id:'fresh-observation'}).deduplicated,false,'A fresh observation of the same item remains available');
assert.equal(removalRestart.intake({...oldObservation,sessionId:'fresh-session'}).deduplicated,false);
const instanceObservation={...item('Removed instance',{instanceKey:'stable-copy'}),id:'first-instance',at:100};
const instanceCard=removalRestart.intake(instanceObservation).candidate;
for(let index=0;index<10;index++)removalRestart.intake({...instanceObservation,id:`later-${index}`,at:101+index});
removalRestart.removeCandidate(instanceCard.id);
const instanceRestart=createCharacterModel({storage:removalStorage,now:()=>202});
assert.equal(instanceRestart.intake(instanceObservation).ignored,true,'Past stable-instance captures remain removed even after evidence retention expired');
assert.equal(instanceRestart.intake({...instanceObservation,id:'fresh-instance-examine',at:201}).deduplicated,false,'A new examine after removal is allowed');

model.setStatSnapshot('base',{stats:{HP:100,MP:null},confirmed:true,evidence:{text:'PRIVATE_BASE_CAPTURE'}});
model.setStatSnapshot('equipped',{stats:{HP:450,MP:300},confirmed:true});
const totals=model.totals();
assert.equal(totals.base.stats.HP,100);assert.equal(totals.equipped.stats.HP,450);assert.equal(totals.derived.HP.value,10);
assert.equal(totals.derived.HP.complete,true);
assert.notEqual(totals.equipped.stats.HP,totals.base.stats.HP+totals.derived.HP.value,'no observed total is replaced with base + gear');
assert.equal(totals.base.stats.MP,null,'unknown remains unknown');
model.setStatSnapshot('equipped',null);assert.equal(model.totals().equipped,null,'captured values can be cleared');
assert.equal(model.setStatSnapshot('invented',{}).ok,false);

const catalog={name:'Catalog Blade',wikiTitle:'Catalog Blade',iconId:'42',slots:['PRIMARY'],stats:{HP:100,STR:5,DMG:10,RANGE:20}};
const scaled=model.intake({id:'catalog',item:{name:'Catalog Blade',tier:2,augmentStatus:'none'}},{wikiItem:catalog}).candidate;
assert.deepEqual(characterItemStats(scaled).stats,{HP:120,STR:7,DMG:12,RANGE:40});
const observed=model.intake({id:'observed',item:{name:'Catalog Blade',tier:10,stats:{HP:999},statsComplete:true,augmentStatus:'included',augments:[{name:'Ruby',stats:{HP:50},statsComplete:true}]}},{wikiItem:catalog}).candidate;
assert.equal(characterItemStats(observed).stats.HP,999,'examine stats are not rescaled or augmented twice');
const excluded={...observed,observedStats:{HP:100},augmentStatus:'excluded'};
assert.equal(characterItemStats(excluded).stats.HP,150,'only explicitly excluded augment stats are added');
assert.equal(characterItemStats({...excluded,augmentStatus:'unknown'}).uncertainAll,true);
assert.equal(characterItemStats({...scaled,tier:null}).stats.HP,null,'unknown tier cannot silently become base/tier zero');
const incomplete=model.intake(item('Incomplete',{slots:['HEAD'],stats:{HP:5},statsComplete:false,augmentStatus:'unknown'})).candidate;
model.assign(incomplete.id,'head');
assert.equal(model.totals().derived.HP.value,15);
assert.equal(model.totals().derived.HP.complete,false,'unknown augment inclusion marks even known-number sums partial');
assert.equal(model.totals().derived.MP.complete,false,'absent partial stats are not treated as known zero');

const snapshot=model.snapshot();snapshot.candidates[0].name='mutated external copy';
assert.notEqual(model.snapshot().candidates[0].name,snapshot.candidates[0].name);
const restored=createCharacterModel({storage,now:()=>12345});assert.deepEqual(restored.snapshot(),model.snapshot());
const summary=characterShareSummary(model.snapshot()),serialized=JSON.stringify(summary);
assert(!serialized.includes('PRIVATE_SYNTHETIC_EVIDENCE'));assert(!serialized.includes('PRIVATE_BASE_CAPTURE'));
assert(!serialized.includes('synthetic-session'));assert(!serialized.includes('Catalog Blade'),'unassigned inventory stays private');
assert.equal(summary.equipment.length,23);
assert.equal(characterShareLayout(model.snapshot()).width,1800);
assert.deepEqual(characterShareLayout(model.snapshot()),characterShareLayout(model.snapshot()),'same inputs have deterministic geometry');
assert(characterShareLayout(model.snapshot()).height<=8192);

const boundedStorage=memory(),bounded=createCharacterModel({storage:boundedStorage,now:()=>1});
const protectedCard=bounded.intake(item('Keep equipped')).candidate;bounded.assign(protectedCard.id,'finger1');
for(let index=0;index<CHARACTER_LIMITS.candidates+10;index++) bounded.intake(item(`Card ${index}`));
assert.equal(bounded.snapshot().candidates.length,CHARACTER_LIMITS.candidates);
assert.equal(bounded.snapshot().equipment.finger1,protectedCard.id);
assert(bounded.snapshot().candidates.some(candidate=>candidate.id===protectedCard.id));
assert(!bounded.snapshot().candidates.some(candidate=>candidate.name==='Card 0'));
assert(boundedStorage.getItem(CHARACTER_STORAGE_KEY).length<=CHARACTER_LIMITS.storageBytes);
const protectedStorage=memory(),protectedOnly=createCharacterModel({storage:protectedStorage,now:()=>1});
const largeStats=Object.fromEntries(Array.from({length:48},(_,index)=>[`STAT_${String(index).padStart(27,'0')}`,1000000000]));
for(const slot of CHARACTER_SLOTS){const card=protectedOnly.intake(item(`Protected ${slot.id}`,{slots:[slot.kind]})).candidate;protectedOnly.assign(card.id,slot.id);
    protectedOnly.updateCandidate(card.id,{icon:'data:image/png;base64,'+'A'.repeat(23970),name:'N'.repeat(240),wikiTitle:'W'.repeat(240),notes:'X'.repeat(600),baseStats:largeStats,observedStats:largeStats,augments:Array.from({length:8},()=>({name:'A'.repeat(240),stats:largeStats,statsComplete:true}))});}
assert.equal(Object.keys(protectedOnly.snapshot().equipment).length,23);
assert(protectedStorage.getItem(CHARACTER_STORAGE_KEY).length<=CHARACTER_LIMITS.storageBytes,'Protected equipment cannot defeat the serialized state bound');
const warnings=[],failed=createCharacterModel({storage:{getItem(){throw Error('synthetic read failure');},setItem(){throw Error('synthetic full disk');}},onWarning:value=>warnings.push(value)});
assert.equal(failed.intake(item()).saved,false);failed.setMetadata({name:'Still usable'});assert.equal(warnings.length,2);
assert.equal(failed.snapshot().metadata.name,'Still usable');
const hostile=memory();hostile.setItem(CHARACTER_STORAGE_KEY,JSON.stringify({schemaVersion:1,candidates:[{id:'dupe',name:'First'},{id:'dupe',name:'Second'}],equipment:{head:'dupe',face:'dupe',injected:'dupe'}}));
assert.deepEqual(createCharacterModel({storage:hostile}).snapshot().equipment,{head:'dupe'});

export function createCharacterDemo() {
    const demo=createCharacterModel({storage:null,now:()=>Date.UTC(2026,9,22,12)});
    demo.setMetadata({name:'Synthetic Wayfarer',server:'Fixture server',level:60,race:'Human',classes:['MNK','SHM'],sessionName:'Synthetic capture preview · no player records'});
    demo.setStatSnapshot('base',{stats:{AC:180,HP:1200,MP:600,STR:95,STA:90,AGI:100,DEX:105,WIS:90,INT:80,CHA:75,SV_MAGIC:25,SV_FIRE:20,SV_COLD:20,SV_POISON:15,SV_DISEASE:15},confirmed:true});
    demo.setStatSnapshot('equipped',{stats:{AC:540,HP:2500,MP:940,END:900,ATK:780,STR:170,STA:160,AGI:160,DEX:175,WIS:135,INT:110,CHA:95,SV_MAGIC:90,SV_FIRE:85,SV_COLD:70,SV_POISON:60,SV_DISEASE:65,HASTE:30},confirmed:true});
    const icon='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC';
    for(const [index,slot] of CHARACTER_SLOTS.entries()) {
        if(index===22) continue;
        const candidate=demo.intake(item(`Synthetic ${slot.label} piece`,{slots:[slot.kind],tier:index%5,stats:{AC:12,HP:30,STR:2,STA:2,DEX:1,SV_MAGIC:4},statsComplete:index!==3,augmentStatus:index===3 ? 'unknown' : 'none',icon,iconId:`synthetic-${index}`,wikiTitle:`Synthetic ${slot.label} piece`,wikiMatch:'confirmed',level:45})).candidate;
        demo.assign(candidate.id,slot.id);
    }
    return demo.snapshot();
}

// Optional real Chromium canvas acceptance uses a disposable profile and a
// hidden fixture window, never the installed app or an actual game directory.
if(process.argv.includes('--render-demo')) {
    const {spawn}=await import('node:child_process'),{createRequire}=await import('node:module');
    const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve}=await import('node:path');
    const root=resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
    const temporary=await mkdtemp(join(tmpdir(),'eoz-character-share-'));
    const outputIndex=process.argv.indexOf('--output'),output=outputIndex<0 ? join(temporary,'screenshots') : resolve(process.argv[outputIndex+1]);
    await mkdir(output,{recursive:true});
    const fixture=async({root,output,snapshot,profile})=>{
        const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        app.setPath('userData',profile);await app.whenReady();
        const server=http.createServer(async(req,res)=>{try {const requested=new URL(req.url,'http://fixture').pathname;
            if(requested==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic character renderer</title>');return;}
            if(!/^\/app\/[a-z.-]+\.(?:js|json)$/.test(requested)) {res.writeHead(404);res.end();return;}
            res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(root,requested)));}catch {res.writeHead(404);res.end();}});
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
        const window=new BrowserWindow({show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true}});
        window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')}));
        try {
            await window.loadURL(origin);
            for(const appearance of [{fontFamily:'theme',fontSize:10},{fontFamily:'verdana',fontSize:20}]) {
                const result=await window.webContents.executeJavaScript(`(async()=>{const {renderCharacterShare}=await import('/app/character-share.js');const snapshot=${JSON.stringify(snapshot)};const options=${JSON.stringify({appearance})};const first=await renderCharacterShare(snapshot,options);const second=await renderCharacterShare(snapshot,options);return {dataUrl:first.dataUrl,deterministic:first.dataUrl===second.dataUrl,width:first.width,height:first.height,size:first.blob.size,summary:first.summary};})()`);
                assert(result.deterministic,'Repeated rendering yields identical PNG bytes in this runtime');
                assert.equal(result.width,1800);assert(result.height<=8192&&result.size<12000000);
                const name=`character-${appearance.fontFamily}-${appearance.fontSize}`;
                await fs.writeFile(path.join(output,`${name}.png`),Buffer.from(result.dataUrl.split(',')[1],'base64'));
                await fs.writeFile(path.join(output,`${name}.json`),JSON.stringify({...result,dataUrl:undefined},null,2));
                console.log(`Rendered ${name}: ${result.width}x${result.height}, ${result.size} bytes, deterministic PNG`);
            }
        } finally {window.destroy();server.close();app.quit();}
    };
    try {
        await writeFile(join(temporary,'main.cjs'),`(${fixture.toString()})(${JSON.stringify({root,output,snapshot:createCharacterDemo(),profile:join(temporary,'profile')})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
        const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const status=await new Promise((resolve,reject)=>{const child=spawn(electron,[join(temporary,'main.cjs')],{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
        assert.equal(status,0,'Real canvas fixture succeeds');
    } finally {if(outputIndex>=0) {assert(temporary.startsWith(resolve(tmpdir())+'\\') || temporary.startsWith(resolve(tmpdir())+'/'));await rm(temporary,{recursive:true,force:true});}}
}
console.log('Character model passed: physical copies/variants, slot operations, separate observations, partial sums, scaling/augments, bounded persistence and private share summary.');
