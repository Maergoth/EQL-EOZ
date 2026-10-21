import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {wikiLocationToWorld} from '../app/coordinate-system.js';

// Execute the actual main owner's action handler. These fixtures prove camera
// preview cannot become a logged player position or choose a different source.
const source=readFileSync(new URL('../app/app.js',import.meta.url),'utf8');
const from=source.indexOf('async function handleOverlayCommand('),to=source.indexOf('function currentEraIndex()',from);
assert(from>=0&&to>from);
const normal={name:'Synthetic Keeper',zone:'Synthetic Zone',loc:[10,20],raidInstance:false};
const raid={...normal,loc:[30,40,50],raidInstance:true};
let current={zone:'Synthetic Zone',location:Object.freeze({x:1,y:2,z:3})};
const calls=[];
const context=vm.createContext({
    state:()=>current,zoneKey:value=>String(value||'').toLowerCase(),
    npcRecordForName:(name,zone,isRaid)=>name===normal.name&&zone===normal.zone?(isRaid?raid:normal):null,
    intelIdentity:npc=>`${npc.zone}|${npc.name}|${npc.raidInstance?'raid':'normal'}`,
    raidVariant:npc=>Boolean(npc.raidInstance),wikiLocationToWorld,
    settings:{itemTier:0},prefs:{save:settings=>calls.push(['saved',settings.itemTier])},
    renderAll:()=>calls.push(['render']),refreshItemTooltip:()=>calls.push(['tooltip']),
    mapDataRevision:3,overlayMapFocus:null,overlayMapFocusSequence:0,focusedIntelTarget:null,intelFocusSequence:0,
    window:{eyeOfZommOverlays:{control:async(...args)=>calls.push(args)}}
});
vm.runInContext(`${source.slice(from,to)};this.handle=handleOverlayCommand;`,context);
const originalLocation=current.location;
await context.handle({action:'session:map-focus',payload:{npc:raid.name,zone:raid.zone,raidInstance:true,id:`${raid.zone}|${raid.name}|raid`}});
assert.deepEqual(JSON.parse(JSON.stringify(context.overlayMapFocus.loc)),[40,30,50]);
assert.equal(context.overlayMapFocus.mode,'first');assert.equal(context.overlayMapFocus.sequence,1);
assert.equal(context.overlayMapFocus.dataVersion,3);assert.deepEqual(calls,[['show','map']]);
assert.equal(current.location,originalLocation,'A map preview never writes a synthetic log location');
await context.handle({action:'session:map-focus',payload:{npc:normal.name,zone:normal.zone,raidInstance:false}});
assert.equal(context.overlayMapFocus.loc.length,2,'Unknown height stays unknown');
assert.equal(context.overlayMapFocus.sequence,2,'Each deliberate click has a new focus identity');
await assert.rejects(context.handle({action:'session:map-focus',payload:{npc:normal.name,zone:'Old Zone'}}),/previous zone/);
await assert.rejects(context.handle({action:'session:map-focus',payload:{npc:normal.name,zone:normal.zone,raidInstance:false,id:'stale-source'}}),/source is no longer/);
assert.equal(context.overlayMapFocus.sequence,2,'Rejected stale commands cannot replace the camera target');
await context.handle({action:'session:item-tier',payload:{tier:10}});
assert.equal(context.settings.itemTier,10);assert(calls.some(call=>call[0]==='saved'&&call[1]===10));
assert(calls.some(call=>call[0]==='render'));assert(calls.some(call=>call[0]==='tooltip'));
for(const tier of [-1,11,1.5,'5',NaN])await assert.rejects(context.handle({action:'session:item-tier',payload:{tier}}),/Base to 10/);
assert.equal(context.settings.itemTier,10,'Invalid overlay values cannot corrupt the shared item level');
console.log('Owner actions: exact raid identity, camera-only native map preview, unknown Z, stale-source rejection and shared item-level persistence passed.');
