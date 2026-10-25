import assert from 'node:assert/strict';
import { EQLogParser } from '../app/parser.js';
import { createContributionQueue } from '../app/contribution-queue.js';
import { CONTRIBUTION_QUEUE_KEY, contributionMembership, logContributionObservation } from '../app/contribution-evidence.js';
import {createItemBaseReview,applyItemBaseReview,validateItemBaseReview} from '../app/item-base-review.js';

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
let clock=Date.UTC(2026,9,24,12),cursor=0,source='C:/Synthetic/eqlog_Test_server.txt';
const pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Known Ring'],npcs:['Known Sentinel'],titles:['Known Ring','Known Sentinel','Known Vale']},items:[],npcs:[],zones:[{name:'Known Vale'}]};
const makeQueue=()=>createContributionQueue({storage,getPack:()=>pack,now:()=>clock});
let q=makeQueue();const parser=new EQLogParser();
const feed=text=>{clock+=1000;const logLine=`[${new Date(clock).toISOString()}] ${text}`,event=parser.parse(logLine);return {event,context:{live:true,at:clock,logId:source,cursor:++cursor,zone:parser.zone,logLine}};};
const consume=text=>{const {event,context}=feed(text);return q.consumeLog(event,context);};
const find=name=>q.snapshot().find(candidate=>candidate.name===name);

assert.equal(contributionMembership(pack,'npc','Known Sentinel'),'present');
assert.equal(contributionMembership(pack,'npc','a Known Sentinel'),'missing','A grammatical article is not silently removed from a real NPC title');
assert.equal(contributionMembership(pack,'item','Known Ring +4'),'present');
assert.equal(contributionMembership({items:[],npcs:[],zones:[]},'zone','Hidden Vale'),'unknown');
consume('You have entered Hidden Vale.');assert.equal(find('Hidden Vale').membership,'missing');
consume('a copper watcher regards you indifferently (Lvl: 37)');
assert.equal(find('a copper watcher'),undefined,'Considering still informs Intel but creates no contribution');
assert(parser.snapshot().observed.some(npc=>npc.name==='a copper watcher'&&npc.level===37));
let npc,zone=find('Hidden Vale');assert.equal(zone.fields.knownNPCs,undefined);

parser.location={x:999,y:888,z:777};
const killed=consume('You have slain a copper watcher!');npc=find('a copper watcher');assert.deepEqual(killed.prompt,{candidateId:npc.id,name:'a copper watcher',zone:'Hidden Vale',armed:true,expiresAt:clock+300000});
assert.equal(npc.evidence[0].event,'kill');assert.equal(npc.evidence[0].logLine,`[${new Date(clock).toISOString()}] You have slain a copper watcher!`);
zone=find('Hidden Vale');assert.deepEqual(zone.fields.knownNPCs,{value:['a copper watcher'],confirmed:false});
assert(npc.relations.some(relation=>relation.type==='mob-zone'&&relation.evidence==='kill'&&!relation.confirmed));
assert.equal(find('a copper watcher').fields.location,undefined,'A cached player/kill position is never a spawn');
assert(consume('Your Location is 1, 2, 3').locationCaptured,'The next fresh /loc attaches to the automatically armed unknown kill');
assert.equal(q.armSpawnLocation(npc.id).ok,true);
const located=consume('Your Location is -10.5, 20.25, 3');assert.equal(located.locationCaptured.display,'-10.5, 20.25, 3');
npc=find('a copper watcher');assert.deepEqual(npc.fields.location,{value:'-10.5, 20.25, 3',confirmed:false});assert.equal(npc.spawnRequest.status,'captured');
assert.equal(npc.evidence.at(-1).event,'location');assert.match(npc.evidence.at(-1).logLine,/Your Location is -10\.5, 20\.25, 3$/);
const location=npc.relations.findLast(relation=>relation.type==='spawn-location');assert.deepEqual(location.location,{x:20.25,y:-10.5,z:3});assert.equal(location.evidence,'player-requested-next-loc');assert.equal(location.confirmed,false);
assert.equal(consume('Your Location is 100, 200, 300').locationCaptured,null,'One request consumes exactly one fresh location');
assert.equal(consume('You have slain a copper watcher!').prompt,null,'An existing request is not prompted on every kill');

const second=consume('You have slain a silver watcher!');assert(second.prompt);assert.equal(q.armSpawnLocation(second.prompt.candidateId).ok,true);
q=makeQueue();assert.equal(find('a silver watcher').spawnRequest.status,'requested');assert.equal(consume('Your Location is 4, 5, 6').locationCaptured,null,'Restart preserves the request, never an armed /loc listener');
assert.equal(q.armSpawnLocation(second.prompt.candidateId).ok,true);source='C:/Synthetic/eqlog_Other_server.txt';
assert.equal(consume('Your Location is 4, 5, 6').locationCaptured,null,'Changing log source cancels the targeted capture');
assert.equal(q.armSpawnLocation(second.prompt.candidateId).ok,true);consume('You have entered Other Vale.');consume('You have entered Hidden Vale.');
assert.equal(consume('Your Location is 4, 5, 6').locationCaptured,null,'Leaving and returning to the zone does not restore an old listener');
assert.equal(q.armSpawnLocation(second.prompt.candidateId).ok,true);clock+=300001;assert.equal(consume('Your Location is 4, 5, 6').locationCaptured,null,'Location requests time out');
const persistentSpawn=q.armSpawnLocation(second.prompt.candidateId,{persistent:true});assert.equal(persistentSpawn.persistent,true);assert.equal(persistentSpawn.expiresAt,null);
const boundary=q.spawnStatus();clock+=3600000;assert.equal(q.spawnStatus().candidateId,second.prompt.candidateId,'An explicit Contribute request keeps waiting beyond the automatic five-minute timeout');
const beforePersistent=feed('Your Location is 7, 8, 9');beforePersistent.context.cursor=boundary.cursor;assert.equal(q.consumeLog(beforePersistent.event,beforePersistent.context).locationCaptured,null,'Persistent capture still rejects a location at the pre-click cursor');
assert.equal(consume('Your Location is 7, 8, 9').locationCaptured.candidateId,second.prompt.candidateId,'The next fresh location completes the persistent request');
assert.equal(q.armSpawnLocation(second.prompt.candidateId,{persistent:true}).ok,true);q.cancelSpawnLocation();clock+=3600000;assert.equal(consume('Your Location is 7, 8, 9').locationCaptured,null,'Manual dismissal cancels a persistent request');
assert.equal(q.armSpawnLocation(second.prompt.candidateId,{persistent:true}).ok,true);const previousSource=source;source='C:/Synthetic/eqlog_PersistentOther_server.txt';assert.equal(consume('Your Location is 7, 8, 9').locationCaptured,null,'Persistent capture retains the log-source guard');source=previousSource;
assert.equal(q.armSpawnLocation(second.prompt.candidateId,{persistent:true}).ok,true);consume('You have entered Other Vale.');consume('You have entered Hidden Vale.');assert.equal(consume('Your Location is 7, 8, 9').locationCaptured,null,'Persistent capture retains the zone-transition guard');
assert.equal(q.armSpawnLocation(second.prompt.candidateId).ok,true);
q.update(second.prompt.candidateId,{playerText:'A factual description entered while waiting for the requested /loc.'});
const stale=feed('Your Location is 4, 5, 6');stale.context.at-=20000;assert.equal(q.consumeLog(stale.event,stale.context).locationCaptured,null);
const historical=feed('Your Location is 4, 5, 6');historical.context.live=false;assert.equal(q.consumeLog(historical.event,historical.context).locationCaptured,null);
assert(consume('Your Location is 4, 5, 6').locationCaptured,'A rejected stale/history sample does not consume the actual next location');

consume('You have looted a New Copper Gem from the corpse of a bronze keeper.');
const item=find('New Copper Gem'),keeper=find('a bronze keeper');assert(keeper);assert.deepEqual(keeper.fields.knownLoot,{value:['New Copper Gem'],confirmed:false});
assert.equal(item.sources[0].sourceEvidence,'explicit-corpse');assert(item.relations.some(relation=>relation.type==='zone-loot'));
zone=find('Hidden Vale');assert(zone.fields.knownLoot.value.includes('New Copper Gem'));assert(zone.fields.knownNPCs.value.includes('a bronze keeper'));
consume('You have slain a speculative watcher!');consume('You have looted a Speculative Gem.');
assert.equal(find('Speculative Gem').sources[0].sourceEvidence,'recent-kill');assert.equal(find('a speculative watcher').fields.knownLoot,undefined,'Proximity is not a verified drop table');
consume('You have received a Gift Gem from a traveling vendor.');assert.equal(find('Gift Gem').sources[0].sourceEvidence,'explicit-source');assert.equal(find('a traveling vendor'),undefined,'A named provider is not automatically a corpse/NPC drop');

const duplicate=feed('You have looted a Persistent Gem from the corpse of a bronze keeper.');q.consumeLog(duplicate.event,duplicate.context);const once=JSON.stringify(q.snapshot());
q=makeQueue();q.consumeLog(duplicate.event,duplicate.context);assert.equal(JSON.stringify(q.snapshot()),once,'Live log duplicate admission stays suppressed after queue restart');
const saved=values.get(CONTRIBUTION_QUEUE_KEY);assert(!saved.includes('C:/Synthetic')&&!saved.includes('eqlog_'),'Saved provenance contains a correlation token, not a private path');
assert(find('a bronze keeper').relations.some(relation=>relation.evidenceIds.length));
const persistent=find('Persistent Gem');q.update(persistent.id,{fields:{statLines:{value:['AC: 9'],confirmed:true}}});
q.consume({id:'synthetic-ocr',kind:'screen-read',owner:'contribution',subject:{kind:'item',name:'Persistent Gem'},input:{},fields:[{key:'name',value:'Persistent Gem'},{key:'statLines',value:['AC: 999']},{key:'iconId',value:42}],evidence:{text:'Synthetic observed examine'}});
assert.equal(q.snapshot().filter(candidate=>candidate.kind==='item'&&candidate.name==='Persistent Gem').length,1,'An OCR read with no zone enriches the log item draft');assert.equal(find('Persistent Gem').fields.iconId.value,42);assert.deepEqual(find('Persistent Gem').fields.statLines,{value:['AC: 9'],confirmed:true});
consume('You have entered Other Vale.');consume('You have looted a Persistent Gem from the corpse of a ruby keeper.');
assert.equal(q.snapshot().filter(candidate=>candidate.name==='Persistent Gem').length,1,'One exact item identity can accumulate observations from multiple zones');
assert.deepEqual(new Set(find('Persistent Gem').relations.filter(value=>value.type==='zone-loot').map(value=>value.zone)),new Set(['Hidden Vale','Other Vale']));
assert(find('a ruby keeper').fields.knownLoot.value.includes('Persistent Gem'));q=makeQueue();assert.equal(q.snapshot().filter(candidate=>candidate.name==='Persistent Gem').length,1);
consume('You have entered Hidden Vale.');
q.remove(find('a bronze keeper').id);consume('You have slain a bronze keeper!');assert.equal(find('a bronze keeper'),undefined,'Ignored drafts are not recreated by the new live log path');
consume('You have entered Known Vale.');assert.equal(consume('You have slain Known Sentinel!').prompt,null,'Existing wiki monsters do not get missing-monster requests');
assert.equal(find('Known Sentinel'),undefined);
assert.equal(logContributionObservation({type:'location',location:{x:1,y:2,z:null}},{live:true,at:clock},{now:clock}),null,'Unknown elevation is never zero');
const partial=createContributionQueue({getPack:()=>({items:[],npcs:[],zones:[]}),now:()=>clock,storage:{getItem:()=>null,setItem(){}}});const uncertain=partial.consumeLog({type:'kill',victim:'a catalog-unknown watcher'},{zone:'Unknown Vale',at:clock,cursor:1,live:true});assert.equal(uncertain.prompt,null);assert.equal(uncertain.candidate.membership,'unknown','Incomplete absence stays unknown and never emits a missing-page alert');

const broken=new Map([[CONTRIBUTION_QUEUE_KEY,'{broken private synthetic queue']]),warnings=[];
const corrupt=createContributionQueue({storage:{getItem:key=>broken.get(key),setItem:(key,value)=>broken.set(key,value)},onWarning:message=>warnings.push(message)});
corrupt.add({kind:'npc',name:'a recovery watcher'},true);assert.equal(broken.get(CONTRIBUTION_QUEUE_KEY),'{broken private synthetic queue');assert(warnings.some(value=>value.includes('preserved')));
const oldIgnore=JSON.stringify({schemaVersion:1,candidates:[],ignored:['item|retired gem|former vale']}),legacyStorage={getItem:()=>oldIgnore,setItem(){}};const ignoredLegacy=createContributionQueue({storage:legacyStorage});assert.equal(ignoredLegacy.add({kind:'item',name:'Retired Gem',zone:'Another Vale'}),null);assert.equal(ignoredLegacy.add({kind:'item',name:'Retired Gem'}),null,'Legacy zone-specific Ignore also suppresses an unzoned screenshot');assert(ignoredLegacy.add({kind:'item',name:'Retired Gem'},true));
const gap=q.add({kind:'item',name:'Synthetic Gap Relic (Exaltation)',fields:{tier:4}}),tierRead={id:'synthetic-tier-examine',kind:'ocr',owner:'contribution',subject:{kind:'item',name:'Synthetic Gap Relic (Exaltation)+4'},input:{},fields:[{key:'tier',value:4},{key:'hp',value:42},{key:'fraction',value:0}],evidence:{text:'Observed name: Synthetic Gap Relic (Exaltation)+4\nHP 42'}};
q.consume(tierRead);let enriched=q.snapshot().find(candidate=>candidate.id===gap.id);assert.equal(q.snapshot().filter(candidate=>candidate.name.startsWith('Synthetic Gap Relic')).length,1);assert.equal(enriched.name,'Synthetic Gap Relic (Exaltation)');assert.equal(enriched.fields.hp.value,42);assert.equal(enriched.fields.tier.value,4);assert(enriched.evidence.some(value=>value.text.includes('Synthetic Gap Relic (Exaltation)+4')));
const review=createItemBaseReview(enriched,{tier:4,fraction:0,choices:{HP:30},modifiersExcluded:true,reviewed:true}),recovery=applyItemBaseReview(enriched,review);q.update(gap.id,{...recovery,fields:{...recovery.fields,statLines:{...recovery.fields.statLines,confirmed:true},iconId:{value:18,confirmed:true},classes:{value:['WAR'],confirmed:false,edited:true}}});
q.consume({...tierRead,id:'synthetic-tier-replay'});enriched=q.snapshot().find(candidate=>candidate.id===gap.id);assert.equal(validateItemBaseReview(enriched).ok,true,'Equivalent name spacing/tier evidence preserves reviewed base recovery');
q.consume({...tierRead,id:'synthetic-tier-changed',subject:{kind:'item',name:'Synthetic Gap Relic (Exaltation) +4'},fields:[{key:'tier',value:4},{key:'fraction',value:0},{key:'hp',value:43},{key:'iconId',value:999},{key:'classes',value:['WIZ']}]});enriched=q.snapshot().find(candidate=>candidate.id===gap.id);assert.equal(validateItemBaseReview(enriched).ok,false,'Changed observed stats still invalidate the recovery fingerprint');assert.equal(enriched.fields.iconId.value,18);assert.deepEqual(enriched.fields.classes.value,['WAR']);
q.consume({...tierRead,id:'synthetic-tier-next',subject:{kind:'item',name:'Synthetic Gap Relic (Exaltation) +5'},fields:[{key:'tier',value:5}]});assert.equal(q.snapshot().find(candidate=>candidate.id===gap.id).fields.tier.value,5,'Observed tier remains an independent field rather than name duplication');
for(const name of ['Synthetic Literal +11','Synthetic Literal +12','Synthetic Literal +40'])assert.equal(q.add({kind:'item',name}).name,name,'Only the explicitly supported +0..10 suffix is identity decoration');
const named=q.add({kind:'item',name:'Synthetic Named Relic +10'});assert.equal(named.name,'Synthetic Named Relic');assert.equal(named.fields.tier.value,10);assert(named.evidence.some(value=>value.text.includes('Synthetic Named Relic +10')));
consume('You have entered Tiered Vale.');consume('You have looted a Synthetic Tier Drop (Exaltation) +4 from the corpse of a tier watcher.');assert.deepEqual(find('a tier watcher').fields.knownLoot.value,['Synthetic Tier Drop (Exaltation)']);assert.deepEqual(find('Tiered Vale').fields.knownLoot.value,['Synthetic Tier Drop (Exaltation)']);assert(find('Synthetic Tier Drop (Exaltation)').relations.some(value=>value.type==='drop-source'&&value.item==='Synthetic Tier Drop (Exaltation)'));assert(find('Synthetic Tier Drop (Exaltation)').evidence.some(value=>value.text.includes('(Exaltation) +4')),'Related link names use the exact base, original acquisition remains written evidence');
const oldTierIgnore=createContributionQueue({storage:{getItem:()=>JSON.stringify({schemaVersion:1,candidates:[],ignored:['item|retired tier gem +4|former vale']}),setItem(){}}});assert.equal(oldTierIgnore.add({kind:'item',name:'Retired Tier Gem'}),null);assert.equal(oldTierIgnore.add({kind:'item',name:'Retired Tier Gem+5',zone:'Elsewhere'}),null,'Legacy decorated Ignore applies to the exact same base identity');
{
    const legacy={id:'legacy-tier-draft',kind:'item',name:'Synthetic Legacy Relic (Exaltation) +3',title:'Synthetic Legacy Relic (Exaltation) +3',key:'item|synthetic legacy relic (exaltation) +3|legacy vale',aliasKeys:['item|old alias|legacy vale'],zone:'Legacy Vale',status:'needs-review',fields:{hp:{value:31,confirmed:false}},sources:[{npc:'a legacy keeper',zone:'Legacy Vale',sourceEvidence:'recent-kill',confirmed:false}],evidence:[{id:'legacy-observed',text:'Synthetic original evidence'}]};
    const variants=[{}, {id:'explicit-tier',fields:{...legacy.fields,tier:{value:5,confirmed:false}}},
        ...[{title:'A custom item title'},{planId:'saved-plan'},{status:'submitted'},{status:'partial'},{matchesReviewed:true},{baseRecovery:{reviewed:true}},{fields:{hp:{value:31,confirmed:true}}},{fields:{hp:{value:32,confirmed:false,edited:true}}},{sources:[{...legacy.sources[0],confirmed:true}]},{relations:[{type:'mob-zone',name:'a keeper',zone:'Legacy Vale',confirmed:true}]}].map((patch,index)=>({id:`protected-${index}`,...patch}))];
    for(const [index,patch]of variants.entries()){
        const prior={...structuredClone(legacy),...structuredClone(patch)},disk=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,sequence:7,cursor:19,candidates:[prior],ignored:[]})]]),store={getItem:key=>disk.get(key),setItem:(key,value)=>disk.set(key,value)},mount=()=>createContributionQueue({storage:store,now:()=>clock});
        const migrated=mount().snapshot()[0];assert.equal(migrated.id,prior.id);assert.deepEqual(migrated.sources,prior.sources);assert(migrated.aliasKeys.includes(legacy.aliasKeys[0])&&migrated.aliasKeys.includes(prior.key));assert.equal(migrated.fields.hp.value,prior.fields.hp.value);
        if(index<2){assert.equal(migrated.name,'Synthetic Legacy Relic (Exaltation)');assert.equal(migrated.title,migrated.name);assert.equal(migrated.fields.tier.value,index===1?5:3,'An explicit existing tier is never replaced from its title');assert(migrated.evidence.some(value=>value.text.includes(prior.name)));const persisted=JSON.parse(disk.get(CONTRIBUTION_QUEUE_KEY)).candidates[0];assert.equal(persisted.title,migrated.title);assert.deepEqual(mount().snapshot()[0],migrated,'The migration is durable and idempotent');}
        else{assert.equal(migrated.name,prior.name);assert.equal(migrated.title,prior.title);assert.deepEqual(migrated.fields,prior.fields);assert.deepEqual(migrated.evidence,prior.evidence,'Protected historical drafts are not renamed or re-evidenced');}
    }
}
const fullValues=new Map(),fullWarnings=[],full=createContributionQueue({storage:{getItem:key=>fullValues.get(key),setItem:(key,value)=>fullValues.set(key,value)},onWarning:value=>fullWarnings.push(value)});for(let n=0;n<200;n++)assert(full.add({kind:'item',name:`Synthetic capacity item ${n}`}));const fullBefore=fullValues.get(CONTRIBUTION_QUEUE_KEY);assert.equal(full.add({kind:'item',name:'Synthetic overflow item'}),null);assert.equal(fullValues.get(CONTRIBUTION_QUEUE_KEY),fullBefore);assert.equal(full.snapshot()[0].name,'Synthetic capacity item 0');assert(fullWarnings.some(value=>value.includes('full')),'Capacity refuses the new draft without evicting saved evidence');
console.log('Contribution evidence: live log drafts/relationships, conservative sources, persistent dedup, explicit fresh targeted /loc, restart/source/zone/expiry guards and corruption preservation passed.');
