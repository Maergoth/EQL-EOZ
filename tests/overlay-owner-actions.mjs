import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {wikiLocationToWorld} from '../app/coordinate-system.js';
import {EQLogParser} from '../app/parser.js';
import {scaledItemStats} from '../app/item-scaling.js';
import {characterCatalogDetails} from '../app/character-item-card.js';

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

// Execute the same owner reset and line-consumption functions used by the main
// button and native Session tab. Splitting never rewinds/reopens the log, drops
// an incomplete line, rebuilds trigger/discovery state, or reapplies a reset tail.
const parser = new EQLogParser();
parser.setCharacterFromFilename('C:\\Synthetic\\eqlog_Fixture_eql.txt');
parser.parse('[Wed Oct 21 12:00:00 2026] You have entered Synthetic Zone.');
parser.parse('[Wed Oct 21 12:00:01 2026] You slash Synthetic Keeper for 50 points of damage.');
const resetFrom=source.indexOf('function startNewSession('),resetTo=source.indexOf('const raidVariant',resetFrom);
const consumeFrom=source.indexOf('function consumeText('),consumeTo=source.indexOf('function state()',consumeFrom);
assert(resetFrom>=0&&resetTo>resetFrom&&consumeFrom>=0&&consumeTo>consumeFrom);
const triggerCalls=[], discoveryCalls=[], contributionCalls=[], notices=[], publications=[];
const overlayOwner={consume:(...args)=>triggerCalls.push(args),flush(){},publish:async()=>publications.push(parser.snapshot())};
const discoveryOwner={consume:(...args)=>discoveryCalls.push(args)};
const splitContext=vm.createContext({parser,partialLine:'[Wed Oct 21 12:00:02 2026] You slash Synthetic Keeper for ',logOffset:12345,
    selectedEncounterId:'old-fight',fightExpiryTimer:77,clearTimeout:id=>calls.push(['clear-timer',id]),
    renderAll:()=>calls.push(['render-split']),showNotice:message=>notices.push(message),overlaySession:overlayOwner,wikiDiscovery:discoveryOwner,
    // Collection/outbox behavior has its own fixtures; splitting a session must
    // retain these owner-action assertions regardless of telemetry preference.
    observationPreference:false,
    bridgeInfo:{logPath:'synthetic-log'},state:()=>parser.snapshot()});
splitContext.observedLogCursor=0;
splitContext.captureWorkspace={consumeLog:(...args)=>contributionCalls.push(args)};
vm.runInContext(`${source.slice(resetFrom,resetTo)};${source.slice(consumeFrom,consumeTo)};${source.slice(from,to)};this.handle=handleOverlayCommand;this.consume=consumeText;`,splitContext);
await splitContext.handle({action:'session:new-session',payload:{}});
assert.equal(parser.snapshot().totalDamage,0);
assert.equal(splitContext.selectedEncounterId,'');
assert.equal(splitContext.logOffset,12345,'manual split keeps the exact existing byte cursor');
assert.equal(splitContext.partialLine,'[Wed Oct 21 12:00:02 2026] You slash Synthetic Keeper for ','manual split retains a split UTF-8/log line for the next read');
assert.equal(splitContext.overlaySession,overlayOwner);
assert.equal(splitContext.wikiDiscovery,discoveryOwner);
assert.equal(publications.at(-1).sessionNumber,2);
assert.match(notices.at(-1),/New session started/);
splitContext.consume('7 points of damage.\n',true);
assert.equal(parser.snapshot().totalDamage,7,'the next unread fragment completes exactly once in the new session');
splitContext.consume('[Wed Oct 21 12:00:01 2026] You slash Synthetic Keeper for 50 points of damage.\n',false);
assert.equal(parser.snapshot().totalDamage,7,'an initial/replacement tail cannot restore cleared combat');
assert.equal(triggerCalls.at(-1)[0],null);
assert.equal(triggerCalls.at(-1)[1].live,false,'reset-tail freshness protection remains active for triggers');
assert.equal(discoveryCalls.at(-1)[1].live,false,'reset-tail freshness protection remains active for wiki discoveries');
assert.equal(contributionCalls.at(-1)[1].live,false,'reset tails cannot enter the durable contribution journal as fresh discoveries');
assert.equal(contributionCalls.at(-1)[1].cursor,2,'each consumed line has a distinct contribution cursor');

// Native item hover gets the stat block from bounded local data, including base
// comparisons at the shared tier, without granting another file/network API.
const itemFrom=source.indexOf('function overlayItemSummary('),itemTo=source.indexOf('const mapDataLoader',itemFrom);
assert(itemFrom>=0&&itemTo>itemFrom);
const itemContext=vm.createContext({settings:{itemTier:7},scaledItemStats,characterCatalogDetails,itemIconSource:()=>'',});
vm.runInContext(`${source.slice(itemFrom,itemTo)};this.summarize=overlayItemSummary;`,itemContext);
const summary=itemContext.summarize({name:'Synthetic Sword',slots:['PRIMARY'],classes:['WAR'],displayLines:['MAGIC ITEM','Class: WAR'],
    stats:{HP:20,DMG:10,WT:1,INVALID:Infinity},notes:'Synthetic note',privatePath:'C:\\Private\\fixture'}, {remaining:1000});
assert.equal(summary.tier,7);
assert.equal(summary.baseStats.HP,20);
assert.equal(summary.stats.HP,34);
assert.equal(summary.baseStats.INVALID,undefined,'non-finite numeric stats do not enter the native snapshot');
assert.deepEqual(Array.from(summary.classes),['WAR']);
assert.deepEqual(Array.from(summary.displayLines),['MAGIC ITEM','Class: WAR']);
assert.equal(summary.notes,'Synthetic note');
assert.doesNotMatch(JSON.stringify(summary),/privatePath|Private/);
const bounded=itemContext.summarize({name:'X'.repeat(500),classes:Array(100).fill('Y'.repeat(100)),displayLines:Array(100).fill('Z'.repeat(1000)),notes:'N'.repeat(5000)}, {remaining:1000});
assert.equal(bounded.name.length,240);
assert.equal(bounded.classes.length,20);assert.equal(bounded.classes[0].length,40);
assert.equal(bounded.displayLines.length,32);assert.equal(bounded.displayLines[0].length,400);
assert.equal(bounded.notes.length,1200);
console.log('Owner actions: exact raid identity, camera-only native map preview, unknown Z, stale-source rejection and shared item-level persistence passed.');
