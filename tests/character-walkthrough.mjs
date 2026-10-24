import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCharacterWalkthrough} from '../app/character-walkthrough.js';
import {createCharacterModel} from '../app/character-model.js';
const {CaptureHost}=createRequire(import.meta.url)('../desktop/capture-host.cjs');
let clock=1000,saved='';const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
const flow=createCharacterWalkthrough({storage,now:()=>clock,id:()=> 'synthetic-walkthrough'});
assert.equal(flow.snapshot().active,false);flow.begin();flow.advance();assert.equal(flow.snapshot().step,'source');
assert.throws(()=>flow.advance(),/capture source/);flow.source('window:synthetic');
const capture={owner:'character',sessionId:'synthetic-walkthrough',phase:'running',source:{id:'window:synthetic'},generation:1,generationStartedAt:1001};
clock=1010;flow.syncCapture(capture);flow.advance({captureRunning:true,itemReadStartedAt:1001});
const item={kind:'ocr',owner:'character',sessionId:'synthetic-walkthrough',subject:{kind:'item'},capturedAt:new Date(1002).toISOString(),sequence:2,input:{sourceId:'window:synthetic',captureGeneration:1}};
assert.equal(flow.acceptsItem(item),true);assert.equal(flow.acceptsItem({...item,sessionId:'retired'}),false);
assert.equal(flow.snapshot().itemReadWindows[0].from,1001,'An authorized first frame before the renderer handles running status is retained');
flow.rememberItem({id:'card-1',name:'Synthetic Ring',tier:2,fraction:0});
assert.equal(flow.findItem({name:'synthetic ring',tier:2,fraction:0}),'card-1');assert.equal(flow.findItem({name:'synthetic ring',tier:3,fraction:0}),null);
flow.rememberItem({id:'card-tier3',name:'Synthetic Ring',tier:3,fraction:0});assert.equal(flow.findItem({name:'Synthetic Ring'}),null,'Unread tier cannot choose the first variant');assert.equal(flow.ambiguousItem({name:'Synthetic Ring'}),true);
clock=2000;flow.advance({sequence:7});assert.equal(flow.snapshot().step,'base');assert.equal(flow.acceptsItem(item),true,'An item captured during Unequip can complete after advancing to Base');
assert.equal(flow.acceptsItem({...item,capturedAt:new Date(2000).toISOString()}),false,'An item first captured in Base is not admitted at the phase boundary');
assert.equal(flow.acceptsItem({...item,input:{...item.input,captureGeneration:0}}),false);
assert.equal(flow.acceptsItem({...item,input:{...item.input,sourceId:'window:retired'}}),false);
assert.equal(flow.acceptsBase({...item,sequence:8,capturedAt:new Date(1500).toISOString()}),false,'late OCR of pre-unequip pixels cannot become base');
assert.equal(flow.acceptsBase({...item,sequence:7,capturedAt:new Date(2200).toISOString()}),false);
assert.equal(flow.acceptsBase({...item,sequence:8,capturedAt:new Date(2200).toISOString()}),true);
assert.throws(()=>flow.advance(),/No Equipment/);flow.acceptBase();flow.advance();assert.equal(flow.snapshot().step,'reequip');
flow.selectSource();assert.equal(flow.snapshot().sourceReturnStep,'reequip');flow.advance({captureRunning:true});assert.equal(flow.snapshot().step,'reequip','Source replacement returns to the correct phase');
flow.back({sequence:9});assert.equal(flow.snapshot().step,'base');flow.editBase('HP MAXIMUM: 123\nMitigation AC: 401');assert.equal(createCharacterWalkthrough({storage}).snapshot().baseDraft,'HP MAXIMUM: 123\nMitigation AC: 401');assert.equal(flow.snapshot().baseDirty,true);flow.acceptBase();flow.advance();
const restored=createCharacterWalkthrough({storage,now:()=>clock});assert.equal(restored.snapshot().step,'reequip');assert.equal(restored.acceptsItem(item),false,'A restored draft does not authorize a running source by itself');restored.syncCapture(capture);assert.equal(restored.acceptsItem(item),true,'Captured phase windows survive remount once the same source/generation is confirmed');
restored.removeItem({id:'card-1',name:'Synthetic Ring',tier:2,fraction:0});assert.equal(restored.findItem({name:'Synthetic Ring',tier:2,fraction:0}),null);assert.equal(restored.ignores({name:'Synthetic Ring',tier:2,fraction:0}),true);
restored.advance();restored.chooseSlot('card-2','__skip__');restored.advance();assert.equal(restored.snapshot().step,'review');restored.complete();assert.equal(restored.snapshot().step,'complete');assert.equal(restored.acceptsItem(item),false);
restored.begin();restored.cancel();assert.equal(restored.snapshot().active,false);assert.equal(restored.snapshot().step,'details');
assert.equal(restored.acceptsItem(item),false);assert.equal(restored.acceptsReplayItem({...item,sessionId:restored.snapshot().sessionId}),false,'Canceled-session journal replay cannot promote previously rejected items');
const whitespace='  HP MAXIMUM: 123\n\nMitigation AC: 401\n  ';
flow.editBase(whitespace);assert.equal(flow.snapshot().baseDraft,whitespace,'Typing a new stat line preserves spaces and trailing newlines');
assert.equal(createCharacterWalkthrough({storage}).snapshot().baseDraft,whitespace,'Draft whitespace survives storage and remount');
flow.editBase(' '.repeat(12001));assert.equal(flow.snapshot().baseDraft.length,12000,'Whitespace preservation remains bounded');

let aliasSaved='';const aliasStorage={getItem:()=>aliasSaved,setItem:(_key,value)=>aliasSaved=value};
const aliases=createCharacterWalkthrough({storage:aliasStorage,id:()=> 'synthetic-aliases'});aliases.begin();
aliases.rememberItem({id:'copy-a',name:'Synthetic OCR Rlng',tier:2,fraction:0});
assert.equal(aliases.findItem({name:'Synthetic OCR Rlng +2 +2',tier:2,fraction:0}),'copy-a','Repeated tier display decorations do not create another physical identity');
assert.equal(aliases.findItem({name:'Synthetic OCR Rlng +2',tier:3,fraction:0}),null,'Stripping name decoration never conflates explicit tiers');
aliases.rememberItem({id:'copy-a',name:'Synthetic corrected Ring',tier:3,fraction:2});
assert.equal(aliases.findItem({name:'Synthetic OCR Rlng',tier:2,fraction:0}),'copy-a','A corrected name/tier retains the original capture identity');
assert.equal(aliases.findItem({name:'Synthetic corrected Ring',tier:3,fraction:2}),'copy-a');
assert.equal(aliases.ambiguousItem({name:'Synthetic OCR Rlng'}),false);
aliases.rememberItem({id:'copy-a',name:'Synthetic corrected Ring',tier:4,fraction:1});
assert.equal(aliases.findItem({name:'Synthetic corrected Ring'}),'copy-a','Several matching aliases on one physical copy count once');
assert.equal(aliases.ambiguousItem({name:'Synthetic corrected Ring'}),false);
aliases.rememberItem({id:'copy-b',name:'Synthetic OCR Rlng',tier:2,fraction:0});
assert.equal(aliases.findItem({name:'Synthetic OCR Rlng',tier:2,fraction:0}),null,'An original alias cannot silently choose between different cards');
assert.equal(aliases.ambiguousItem({name:'Synthetic OCR Rlng',tier:2,fraction:0}),true);
assert.equal(aliases.findItem({name:'Synthetic corrected Ring',tier:4,fraction:1}),'copy-a');
for(let index=0;index<20;index++)aliases.rememberItem({id:'copy-a',name:`Synthetic corrected ${index}`,tier:4,fraction:1});
const aliasCard=aliases.snapshot().items.find(item=>item.id==='copy-a');assert.equal(aliasCard.aliases.length,6,'Alias retention is bounded per card');
assert.equal(aliasCard.aliases[0].name,'synthetic ocr rlng','The original observed identity survives many corrections');
assert.equal(aliases.findItem({name:'Synthetic corrected 19',tier:4,fraction:1}),'copy-a');
const aliasRestart=createCharacterWalkthrough({storage:aliasStorage});
assert.equal(aliasRestart.findItem({name:'Synthetic corrected 19',tier:4,fraction:1}),'copy-a');
assert.equal(aliasRestart.ambiguousItem({name:'Synthetic OCR Rlng',tier:2,fraction:0}),true,'Ambiguity across original aliases persists after restart');
aliasRestart.removeItem({id:'copy-a',name:'Synthetic corrected 19',tier:4,fraction:1});
assert.equal(aliasRestart.ignores({name:'Synthetic OCR Rlng',tier:2,fraction:0}),true,'Removing a corrected card also suppresses its original mistaken read');
assert.equal(aliasRestart.ignores({name:'Synthetic corrected 19',tier:4,fraction:1}),true);

const augmented=createCharacterWalkthrough({storage:null});
augmented.rememberItem({id:'gem-a',name:'Synthetic gem piece',augments:[{name:'Ruby'}]});
augmented.rememberItem({id:'gem-a',name:'Synthetic gem piece',augments:[{name:'Emerald'}]});
assert.equal(augmented.findItem({name:'Synthetic gem piece'}),'gem-a','Unknown augment read does not count each same-card alias as a copy');
augmented.rememberItem({id:'gem-b',name:'Synthetic gem piece',augments:[{name:'Onyx'}]});
assert.equal(augmented.ambiguousItem({name:'Synthetic gem piece'}),true);assert.equal(augmented.findItem({name:'Synthetic gem piece',augments:[{name:'Onyx'}]}),'gem-b');

// Existing drafts migrate one old identity; bounded aliases may legitimately
// exceed the earlier100k read limit without making progress unrestorable.
const largeDraft={schemaVersion:1,items:Array.from({length:120},(_,index)=>({id:`copy-${index}`,identity:{name:`Synthetic ${index}`},aliases:Array.from({length:6},(_,alias)=>({name:`Synthetic ${index}/${alias} `+'x'.repeat(220)}))}))};
const largeSerialized=JSON.stringify(largeDraft);assert(largeSerialized.length>100000);
const largeRestored=createCharacterWalkthrough({storage:{getItem:()=>largeSerialized}});
assert.equal(largeRestored.snapshot().items.length,120);assert(largeRestored.snapshot().items.every(card=>card.aliases.length<=6));
const oldDraft=createCharacterWalkthrough({storage:{getItem:()=>JSON.stringify({items:[{id:'old',identity:{name:'Synthetic old'}}]})}});
assert.equal(oldDraft.findItem({name:'Synthetic old'}),'old');assert.equal(oldDraft.snapshot().items[0].aliases.length,1);

// One active source can produce delayed frames across several UI transitions.
// Item admission uses capture time; baseline admission retains its own strict
// fresh timestamp and journal sequence requirements.
let lateClock=10000,lateSaved='';const lateStorage={getItem:()=>lateSaved,setItem:(_key,value)=>lateSaved=value};
const late=createCharacterWalkthrough({storage:lateStorage,now:()=>lateClock,id:()=> 'synthetic-delayed'});
late.begin();late.advance();late.source('window:late');
const lateStatus={owner:'character',sessionId:'synthetic-delayed',phase:'running',source:{id:'window:late'},generation:4,generationStartedAt:10010};
lateClock=10030;late.syncCapture(lateStatus);late.advance({captureRunning:true,itemReadStartedAt:10005});
const delayed={kind:'ocr',owner:'character',sessionId:'synthetic-delayed',capturedAt:new Date(10015).toISOString(),sequence:8,input:{sourceId:'window:late',captureGeneration:4}};
assert(late.acceptsItem(delayed),'A first tooltip captured between Start and renderer acknowledgement is admitted');
lateClock=10100;late.advance({sequence:7});
assert(late.acceptsItem(delayed),'Busy OCR may finish an Unequip tooltip in Base');
assert(!late.acceptsBase(delayed),'That same old item frame cannot seed the baseline');
assert(!late.acceptsItem({...delayed,capturedAt:new Date(10101).toISOString()}),'A tooltip actually captured during Base stays rejected');
assert(!late.acceptsBase({...delayed,capturedAt:new Date(10101).toISOString(),sequence:7}),'Base sequence cutoff stays strict');
assert(late.acceptsBase({...delayed,capturedAt:new Date(10101).toISOString(),sequence:9}),'Unchanged inventory pixels with a fresh timestamp and sequence remain eligible');
lateClock=10200;late.acceptBase();late.advance();
lateClock=10300;late.advance();assert.equal(late.snapshot().step,'slots');
const reequip={...delayed,capturedAt:new Date(10250).toISOString()};
assert(late.acceptsItem(reequip),'A Re-equip tooltip can finish after advancing to Slots');
assert(late.acceptsItem({...reequip,capturedAt:new Date(10300).toISOString()}),'Adjacent Re-equip and Slots windows have no timestamp gap');
lateClock=10301;assert(late.acceptsItem({...reequip,capturedAt:new Date(10301).toISOString()}),'An item first captured in Slots remains eligible');
late.advance();assert.equal(late.snapshot().step,'review');assert(late.acceptsItem(reequip));
lateClock=10350;const reviewItem={...reequip,capturedAt:new Date(10325).toISOString()};assert(late.acceptsItem(reviewItem),'An item first captured in Review remains eligible until completion');
assert(!late.acceptsItem({...reviewItem,capturedAt:new Date(10150).toISOString()}),'Continuing Review capture cannot admit an earlier Base-time item');
for(const patch of [{owner:'contribution'},{sessionId:'retired'},{input:{...reviewItem.input,sourceId:'window:retired'}},{input:{...reviewItem.input,captureGeneration:3}}])assert(!late.acceptsItem({...reviewItem,...patch}),'Review still requires the current Character owner/session/source/generation');
const legacySlots={...late.snapshot(),step:'slots',itemPhaseStartedAt:0,itemReadWindows:late.snapshot().itemReadWindows.filter(window=>['unequip','reequip'].includes(window.step))};
for(const step of ['slots','review']){
    const legacy=createCharacterWalkthrough({storage:{getItem:()=>JSON.stringify({...legacySlots,step})},now:()=>lateClock});
    assert(!legacy.acceptsReplayItem(reviewItem),'A saved draft cannot authorize replay before trusted capture status');legacy.syncCapture(lateStatus);
    assert.equal(legacy.snapshot().itemReadWindows.at(-1).from,10300,'Released Slots/Review drafts extend only the latest trusted Re-equip boundary');
    assert(legacy.acceptsReplayItem(reviewItem),'A real post-Re-equip record can recover through the still-active legacy flow');
    assert(!legacy.acceptsReplayItem({...reviewItem,capturedAt:new Date(10150).toISOString()}),'Legacy migration does not expand to the Base phase');
    legacy.syncCapture({...lateStatus,generation:5,generationStartedAt:10350});assert(!legacy.acceptsReplayItem(reviewItem),'Legacy migration cannot authorize a retired generation');
}
const missingBoundary=createCharacterWalkthrough({storage:{getItem:()=>JSON.stringify({...legacySlots,itemReadWindows:[]})},now:()=>lateClock});missingBoundary.syncCapture(lateStatus);assert.equal(missingBoundary.snapshot().itemReadWindows.at(-1).from,lateClock,'Without the trusted prior boundary, an old Slots draft starts fresh');assert(!missingBoundary.acceptsItem(reviewItem));
late.syncCapture({...lateStatus,generation:5,generationStartedAt:10350});assert(!late.acceptsItem(reequip),'Old crop/source generations cannot enter even with an eligible capture time');
late.complete();assert(!late.acceptsItem(reequip));assert(!late.acceptsReplayItem(reequip));

lateClock=11000;late.begin();late.advance();late.source('window:late');late.syncCapture({...lateStatus,generation:6,generationStartedAt:11000});late.advance({captureRunning:true,itemReadStartedAt:11000});
const manual={...delayed,kind:'manual',capturedAt:new Date(11100).toISOString(),input:{sourceId:null}};
const manualRead={sessionId:'synthetic-delayed',at:11010,eligible:true};
lateClock=11020;late.advance();lateClock=11110;
assert(late.acceptsItem(manual,{manualRead}),'An explicitly imported item invoked during Unequip can finish during Base');
assert(!late.acceptsItem(manual),'Unsolicited manual events do not bypass the capture gate');
assert(!late.acceptsItem(manual,{manualRead:{...manualRead,eligible:false}}),'An import invoked during Base cannot create item cards');
assert(!late.acceptsItem(manual,{manualRead:{...manualRead,sessionId:'retired'}}));
late.cancel();assert(!late.acceptsItem(manual,{manualRead}));

lateClock=12000;late.begin();late.advance();late.source('window:late');late.syncCapture({...lateStatus,generation:10,generationStartedAt:12000});late.advance({captureRunning:true,itemReadStartedAt:12000});
for(let index=11;index<60;index++){lateClock+=10;late.syncCapture({...lateStatus,generation:index,generationStartedAt:lateClock});}
assert.equal(late.snapshot().itemReadWindows.length,32,'Per-source/generation capture windows are bounded');
const lateRestart=createCharacterWalkthrough({storage:lateStorage,now:()=>lateClock});assert.equal(lateRestart.snapshot().itemReadWindows.length,32);
const migrated=createCharacterWalkthrough({storage:{getItem:()=>JSON.stringify({active:true,step:'unequip',sessionId:'synthetic-delayed',sourceId:'window:late',startedAt:1000})},now:()=>20000});
migrated.syncCapture({...lateStatus,generationStartedAt:1000});assert.equal(migrated.snapshot().itemReadWindows[0].from,20000,'An old draft without phase history cannot authorize all earlier session frames on app mount');
assert(!migrated.acceptsItem({...delayed,capturedAt:new Date(15000).toISOString()}));

// An append can finish after Pause invalidates its generation. The host must
// suppress its live message, and remount must not resurrect its persisted row.
const replayValues=new Map(),replayStorage={getItem:key=>replayValues.get(key)||null,setItem:(key,value)=>replayValues.set(key,value)};
let replayClock=30000,releaseAppend=null,holdAppend=false;
const journal={records:[],async initialize(){},async close(){},async append(value){const record={...structuredClone(value),sequence:this.records.length+1,recordedAt:new Date(replayClock).toISOString()};this.records.push(record);if(holdAppend)await new Promise(resolve=>{releaseAppend=resolve;});return record;}};
const messages=[],main={isDestroyed:()=>false,webContents:{send:(channel,record)=>messages.push({channel,record})}};
const host=new CaptureHost({electron:{ipcMain:{handle(){},removeHandler(){}}},journal,ocr:{async stop(){}},getMainWindow:()=>main,now:()=>replayClock});
const replayFlow=createCharacterWalkthrough({storage:replayStorage,now:()=>replayClock,id:()=> 'append-race'}),replayModel=createCharacterModel({storage:replayStorage,now:()=>replayClock});
try{
    host.owner='character';host.sessionId='append-race';host.source={id:'window:append',name:'Synthetic append source'};host.enabled=true;host.phase='running';host.ownerStartedAt=replayClock;host.advanceGeneration();
    replayFlow.begin();replayFlow.advance();replayFlow.source(host.source.id);replayFlow.syncCapture(host.getStatus());replayFlow.advance({captureRunning:true,itemReadStartedAt:replayClock});
    host.onObservation=record=>{if(replayFlow.acceptsItem(record))replayModel.intake(record);};
    replayClock+=10;
    const observation=name=>({kind:'ocr',owner:'character',sessionId:host.sessionId,capturedAt:new Date(replayClock).toISOString(),input:{sourceId:host.source.id,captureGeneration:host.generation},subject:{kind:'item',name},fields:[{key:'name',value:name},{key:'hp',value:7}]});
    await host.saveObservation(observation('Synthetic accepted before pause'));
    assert.equal(replayModel.snapshot().candidates.length,1);
    holdAppend=true;replayClock+=10;const pending=host.saveObservation(observation('Synthetic canceled append'));
    assert.equal(journal.records.length,2);assert.equal(typeof releaseAppend,'function');
    replayClock+=10;await host.pause();replayFlow.syncCapture(host.getStatus());
    releaseAppend();assert.equal(await pending,null,'Invalidated pending append emits no live item');
    assert.equal(messages.filter(message=>message.channel==='eye-of-zomm:capture-observation').length,1);
    const persistedOld=journal.records.at(-1),remount=createCharacterWalkthrough({storage:replayStorage,now:()=>replayClock}),retainedModel=createCharacterModel({storage:replayStorage,now:()=>replayClock});
    assert.equal(remount.acceptsReplayItem(persistedOld),false,'Unknown/offline capture context cannot promote a pending journal record');
    host.phase='running';replayClock+=10;remount.syncCapture(host.getStatus());
    assert.notEqual(host.generation,persistedOld.input.captureGeneration);
    assert.equal(remount.acceptsReplayItem(persistedOld),false,'The previous crop/generation remains rejected once a new running context is known');
    assert.equal(retainedModel.snapshot().candidates.length,1,'Accepted cards remain loaded from the durable model independently of replay');
    replayClock+=10;const current={...persistedOld,id:'current-generation',capturedAt:new Date(replayClock).toISOString(),input:{sourceId:host.source.id,captureGeneration:host.generation}};
    assert.equal(remount.acceptsReplayItem(current),true,'Valid current-generation journal recovery remains available');
}finally{await host.dispose();}
console.log('Character walkthrough: explicit source start, resumable phases, stage/time/sequence/session-scoped base reads, recapture identity, removed-item suppression and completion/cancel passed.');
console.log('Walkthrough review: whitespace-preserving bounded drafts, bounded original identity aliases, unique physical-card matching and alias-aware ambiguity/removal passed.');
console.log('Delayed item reads: bounded capture-phase windows, first-frame start timing, strict base freshness, session/source/generation rejection, explicit imports and canceled replay passed.');
console.log('Pending journal append: actual host suppresses the invalidated live event and remount rejects canceled-generation recovery while preserving accepted cards.');
