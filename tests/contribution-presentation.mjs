import assert from 'node:assert/strict';
import {CONTRIBUTION_FILTERS,contributionQueueInfo,visibleContributionQueue,contributionQueueCounts,contributionDestinations,contributionLootEntryInfo} from '../app/contribution-presentation.js';
const rows=[
 {id:'tier',kind:'item',membership:'present',reasons:['tier0-verification']},
 {id:'source',kind:'item',membership:'present',reasons:['missing-source','tier0-verification']},
 {id:'newitem',kind:'item',membership:'missing',intent:'create'},
 {id:'newmob',kind:'npc',membership:'missing',intent:'create'},
 {id:'population',kind:'zone',membership:'present',reasons:['missing-population']},
 {id:'ambiguous',kind:'npc',membership:'ambiguous',intent:'review',reasons:['identity-review']}
];
assert.deepEqual(visibleContributionQueue(rows).map(row=>row.id),['newmob','newitem','source','population','tier','ambiguous']);
assert.deepEqual(visibleContributionQueue(rows,['tier0-verification']).map(row=>row.id),['source','tier']);
assert.deepEqual(visibleContributionQueue(rows,[]),[]);
assert.deepEqual(contributionQueueInfo(rows[1]).labels,['Drop source','Tier 0 verification']);
assert.equal(contributionQueueInfo(rows[3]).kind,'Monster');
assert.equal(contributionQueueInfo(rows[3]).pageType,'New Page');
assert.equal(contributionQueueInfo(rows[1]).pageType,'Update Page');
assert.equal(contributionQueueInfo({kind:'item',membership:'present',intent:'create'}).isNew,false,'Known pages are displayed as updates even when a stale draft requested creation');
assert.equal(contributionQueueCounts(rows)['tier0-verification'],2);
assert.equal(CONTRIBUTION_FILTERS.length,7);
console.log('Contribution queue presentation: plain tags, highest-impact discovery ordering and independent gap filters passed.');

const zone={kind:'zone',name:'Synthetic Vale',title:'Synthetic Vale',zone:'Synthetic Vale',instance:'normal',membership:'present',intent:'update',reasons:['missing-source'],fields:{knownLoot:{value:['Already Known Bracer','Missing Source Gem','Bare Loot'],confirmed:false}},relations:[{type:'drop-source',name:'A synthetic ghast',zone:'Synthetic Vale',item:'Already Known Bracer',instance:'normal',evidence:'explicit-corpse'},{type:'drop-source',name:'A synthetic ghast',zone:'Synthetic Vale',item:'Missing Source Gem',instance:'normal',evidence:'explicit-corpse'}]};
const pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Already Known Bracer','Missing Source Gem','Bare Loot'],npcs:['A synthetic ghast'],titles:['Synthetic Vale','Already Known Bracer','Missing Source Gem','Bare Loot','A synthetic ghast']},items:[{name:'Already Known Bracer',dropSources:[{name:'A synthetic ghast',zone:'Synthetic Vale',instance:'normal'}]},{name:'Missing Source Gem',dropSources:[]}],npcs:[{name:'A synthetic ghast',zone:'Synthetic Vale',instance:'normal'}],zones:[{name:'Synthetic Vale'}]};
assert.equal(contributionLootEntryInfo(zone,'Already Known Bracer',{pack}).status,'recorded');
assert.match(contributionLootEntryInfo(zone,'Already Known Bracer',{pack}).description,/Already recorded/);
assert.equal(contributionLootEntryInfo(zone,'Bare Loot',{pack}).status,'needs-source','Bare acquired-in-zone history does not become a drop-source proposal');
const destinations=contributionDestinations(zone,{pack}),changes=destinations.flatMap(destination=>destination.changes);
assert.equal(changes.some(change=>change.item==='Already Known Bracer'||change.subject==='Already Known Bracer'),false,'A mixed zone draft must not present cached sources as new additions');
assert.equal(changes.some(change=>change.item==='Bare Loot'||change.subject==='Bare Loot'),false);
assert.equal(changes.some(change=>change.role==='zone-loot'&&change.subject==='Missing Source Gem'),true);
assert.equal(destinations.some(destination=>destination.title==='Missing Source Gem'&&destination.changes.some(change=>change.role==='item-source')),true,'A true source gap names the reciprocal item page');
assert.equal(destinations.some(destination=>destination.title==='A synthetic ghast'&&destination.changes.some(change=>change.role==='npc-loot')),true,'A true source gap names the reciprocal monster page');
assert.equal(contributionLootEntryInfo({...zone,instance:'raid',relations:zone.relations.map(relation=>({...relation,instance:'raid'}))},'Already Known Bracer',{pack}).status,'missing','Normal sources must not hide raid source gaps');
assert.equal(contributionLootEntryInfo({...zone,title:'SYNTHETIC VALE'},'Already Known Bracer',{pack}).status,'recorded','Case-folded positive canonical identity uses the existing gap-classification rule');
assert.equal(contributionLootEntryInfo(zone,'Already Known Bracer').status,'unknown','Without cached facts the UI must not claim a recorded association');
assert.equal(contributionDestinations({...zone,fields:{knownLoot:{value:['Manually Reviewed Loot'],edited:true}},relations:[]},{pack}).some(destination=>destination.changes.some(change=>change.subject==='Manually Reviewed Loot')),true,'An explicit manually edited loot field remains a proposed change');
const tierOnly=contributionDestinations({kind:'item',name:'Synthetic Thorn',title:'Synthetic Thorn',membership:'present',intent:'update',reasons:['tier0-verification'],fields:{},sources:[{npc:'A synthetic ghast',zone:'Synthetic Vale',instance:'normal',confirmed:true}]},{pack});
assert.equal(tierOnly.flatMap(destination=>destination.changes).some(change=>change.role==='npc-loot'),false,'A tier-only review does not advertise untouched drop-source edits');
const manualNpc={kind:'npc',name:'A synthetic keeper',title:'A synthetic keeper',zone:'Synthetic Vale',instance:'normal',membership:'present',intent:'update',reasons:['manual-review'],fields:{knownLoot:{value:['Missing Source Gem'],confirmed:true,edited:false}}};
const manualNpcDestinations=contributionDestinations(manualNpc,{pack});
assert.equal(manualNpcDestinations.some(destination=>destination.primary&&destination.changes.some(change=>change.role==='npc-loot')),true,'An untargeted NPC update can propose its primary loot edit');
assert.equal(manualNpcDestinations.some(destination=>!destination.primary),false,'Untouched loot in a manual NPC review does not advertise reciprocal edits the trusted planner omits');
assert.equal(contributionDestinations({...manualNpc,fields:{knownLoot:{...manualNpc.fields.knownLoot,edited:true}}},{pack}).some(destination=>destination.title==='Missing Source Gem'),true,'Explicit loot edits do advertise the planner’s reciprocal item-source update');
console.log('Contribution delta presentation: known associations, real source gaps, reciprocal destinations, bare loot context, case/instance identity and targeted tier updates passed.');
