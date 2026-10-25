import assert from 'node:assert/strict';
import {EQLogParser,extractItemLinks} from '../app/parser.js';
import {createWikiDiscovery} from '../app/wiki-discovery.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {logContributionObservation} from '../app/contribution-evidence.js';
import {collectDropObservation} from '../app/drop-observations.js';
import {buildContributionDraft} from '../app/contribution-model.js';

const escaped=(name,id=123)=>`\\aITEM ${id} 0:${name}\\/a`;
const native=(name,id=123)=>'\x12'+'0'+id.toString(16).padStart(5,'0')+'0'.repeat(50)+name+'\x12';
let now=Date.UTC(2026,9,24,12),cursor=0;
const line=text=>`[${new Date(now).toISOString()}] ${text}`;
const parser=new EQLogParser();
const chat=items=>parser.parse(line(`Synthetic Speaker tells the guild, '${items.join(' ')}'`));
assert.deepEqual(extractItemLinks(`${native('AC Blade')} ${escaped('Escaped Blade')} ${native('ac blade')}`),['AC Blade','Escaped Blade'],'Both verified encodings retain display order and dedupe case variants');
for(const text of ["Synthetic Speaker says, 'Plain Item Name'",'[Plain Item Name]','\\aPC 123 0:Synthetic Player\\/a','\\aITEM invalid:Fake Blade\\/a','\\aITEM 123 0:Unclosed Blade',escaped('Zero Item',0),native('Empty Item',0),native('Quest Command',0xfffff),native('Legacy Quest Command',999999),'\x12'+'0'.repeat(45)+'Old Rat'+'\x12',escaped('<Unsafe Item>')]){
    assert.deepEqual(extractItemLinks(text),[],text);
    assert.equal(parser.parse(line(text)),null,'Ordinary text, player links, malformed links and quest proxies never become items');
}
assert.equal(extractItemLinks(Array.from({length:12},(_,index)=>escaped(`Bounded Item ${index}`)).join(' ')).length,8);
assert.deepEqual(extractItemLinks('x'.repeat(16384)+escaped('Outside Bound')),[]);
const linked=chat([escaped('Missing Blade +4'),native('Missing Charm'),escaped('Known Sword +5 (Exaltation)')]);
assert.equal(linked.type,'item-links');assert.deepEqual(linked.items,['Missing Blade +4','Missing Charm','Known Sword +5 (Exaltation)']);assert(linked.evidence.text.includes('Synthetic Speaker tells the guild'));
assert.equal(linked.at,now);assert.equal(parser.snapshot().totalLoot,0);assert.equal(parser.snapshot().observed.length,0);assert.equal(parser.snapshot().encounterCount,0);
assert.equal(parser.parse(line(`Synthetic Speaker says, '${escaped('Historical Item')}'`),{recordSession:false}),null,'Historical tail replay does not discover chat items');
const looted=parser.parse(line(`You have looted ${escaped('Rat Whiskers')} from the corpse of a sewer rat!`));assert.equal(looted.type,'loot');assert.equal(looted.item,'Rat Whiskers');assert.equal(parser.snapshot().totalLoot,1,'Existing loot remains a single normal loot event');
const nativeLoot=parser.parse(line(`You have looted ${native('Native Rat Whiskers')} from the corpse of a sewer rat!`));assert.equal(nativeLoot.type,'loot');assert.equal(nativeLoot.item,'Native Rat Whiskers');

let pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Known Sword'],npcs:[],titles:['Known Sword','Plain Existing Page']},items:[{name:'Known Sword',wikiTitle:'Known Sword',aliases:['Known Alias']}],npcs:[],zones:[]};
const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const options={storage,getPack:()=>pack,now:()=>now},queue=createContributionQueue(options),prompts=[];
const discovery=createWikiDiscovery({...options,getSuppression:(...args)=>queue.suppression(...args),onMissing:prompt=>prompts.push(prompt)});
const context=()=>({live:true,at:now,cursor:++cursor,zone:'Current Raid Zone',instance:'raid',logId:'C:/Private/eqlog_Player.txt'});
const linkedContext=context();
const prompt=discovery.consume(linked,linkedContext);assert.equal(prompt.name,'Missing Blade');assert.equal(prompt.purpose,'item-link');assert.equal(prompt.zone,'');assert.equal(prompts.length,2,'Each missing item opens its own notice; known decorated links are skipped');
const captured=queue.consumeLog(linked,linkedContext);assert.deepEqual(captured.candidates.map(candidate=>candidate.name),['Missing Blade','Missing Charm']);
for(const candidate of captured.candidates){assert.equal(candidate.kind,'item');assert.equal(candidate.zone,'');assert.equal(candidate.instance,'unknown');assert.deepEqual(candidate.sources,[]);assert.deepEqual(candidate.relations,[]);assert.equal(candidate.fields.quantity,undefined);assert(candidate.evidence[0].text.includes('Synthetic Speaker'));assert(!JSON.stringify(candidate).includes('C:/Private'),'Local path stays hashed even though the triggering chat evidence is retained locally');}
assert.equal(captured.candidates[0].fields.tier.value,4,'Displayed tier is evidence rather than a fabricated loot fact');
const observation=logContributionObservation({type:'item-link',item:'Missing Blade +4 (Exaltation)',evidence:linked.evidence},linkedContext,{now});assert.equal(observation.subject.name,'Missing Blade');assert.equal(observation.input.purpose,'item-link');assert.equal(observation.input.zone,'');assert.equal(observation.input.instance,'unknown');assert.deepEqual(observation.relations,[]);
const blueprints={entries:{item:{text:'{{Itempage|statsblock=}}'}}},draft=buildContributionDraft(captured.candidates[0],blueprints);assert(!draft.text.includes('Synthetic Speaker'),'Chat text stays in local evidence and never enters wiki prose');assert(!draft.text.includes('Current Raid Zone'),'A chat item is not assigned the player’s current zone');
assert.equal(collectDropObservation(linked,linkedContext,{now}),null,'Chat links never enter kill/loot observation uploads');
assert.equal(discovery.consume(chat([escaped('Missing Blade (Exaltation)'),escaped('Missing Blade +5'),escaped('Known Alias'),escaped('Plain Existing Page')]),context()),null,'Canonical queued, tiered, Exaltation and known aliases do not repeat notices');
const before=queue.snapshot().length;queue.consumeLog(chat([escaped('Missing Blade (Exaltation)'),escaped('Missing Blade +5')]),context());assert.equal(queue.snapshot().length,before,'Unknown tier/Exaltation links reuse the base item candidate');
const replay=createContributionQueue(options);const replayBefore=JSON.stringify(replay.snapshot());replay.consumeLog(linked,linkedContext);assert.equal(JSON.stringify(replay.snapshot()),replayBefore,'Repeated delivery remains idempotent after restart');
for(const change of [{live:false},{at:now-11000}]){const event={type:'item-links',items:['Stale Missing Item'],at:change.at??now};assert.equal(discovery.consume(event,{...context(),...change}),null);assert.equal(replay.consumeLog(event,{...context(),...change}).candidate,null);}
const partial={...pack,meta:{wikiEntitiesComplete:false}},partialQueue=createContributionQueue({storage:null,getPack:()=>partial,now:()=>now}),partialDiscovery=createWikiDiscovery({storage:null,getPack:()=>partial,now:()=>now});assert.equal(partialQueue.consumeLog({type:'item-links',items:['Unknown In Partial Catalog']},context()).candidate,null);assert.equal(partialDiscovery.consume({type:'item-links',items:['Unknown In Partial Catalog'],at:now},context()),null,'Incomplete cache absence never declares a linked item missing');

// Chat observations carry no zone claim, but must not cancel an already armed
// /loc request in the unchanged live game zone.
const spawn=queue.consumeLog({type:'kill',victim:'A missing spawn'},context());assert(spawn.prompt?.armed);const armed=queue.spawnStatus().candidateId;
queue.consumeLog(chat([escaped('Another Missing Chat Item')]),context());assert.equal(queue.spawnStatus().candidateId,armed);
console.log('Item links: bounded authentic escaped/modern links, no ordinary/player/quest false positives, preserved loot parsing, canonical missing-item notices, local chat evidence, no inferred sources/uploads, restart dedup and live catalog guards passed.');
