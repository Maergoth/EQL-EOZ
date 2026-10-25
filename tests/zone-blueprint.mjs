import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ZONE_BLUEPRINT_TOKENS,inspectZoneCreationBlueprint,fillZoneCreationBlueprint} from '../app/zone-blueprint.js';
import {buildContributionDraft,extractContributionBlueprints,assertZoneCreationLayout,patchContributionPrimary,patchContributionRelationship,safeZoneMapFilename} from '../app/contribution-model.js';
const subsection=await readFile(new URL('./fixtures/zone-page-blueprint.wiki',import.meta.url),'utf8');
const blueprints=extractContributionBlueprints('== Zones ==\n'+subsection,700),blueprint=blueprints.entries.zone.text;
const reviewed=value=>({value,confirmed:true});
const candidate=(availability='unknown',fields={})=>({kind:'zone',name:'Synthetic Vale',era:'Classic Era',instance:'normal',fields:{raidAvailability:reviewed(availability),...fields}});
const make=(availability='unknown',fields={})=>buildContributionDraft(candidate(availability,fields),blueprints);
const count=(text,pattern)=>[...text.matchAll(pattern)].length;
assert(inspectZoneCreationBlueprint(blueprint));
const values=Object.fromEntries(ZONE_BLUEPRINT_TOKENS.map(key=>[key,key==='DYNAMIC_ZONE_LIST'?'{{Special:DynamicZoneList/Synthetic Vale}}':'?']));
assert(!fillZoneCreationBlueprint(blueprint,{raidAvailability:'no',values}).includes('= Raid Instance ='));
for(const availability of [undefined,null,true,'normal','raid','YES',''])assert.throws(()=>fillZoneCreationBlueprint(blueprint,{raidAvailability:availability,values}),/raid instance|Unknown/);
for(const source of [
    '{| class="zoneTopTable"\n|}',
    blueprint.replace('EQL-ZONE-BLUEPRINT:1','EQL-ZONE-BLUEPRINT:2'),
    blueprint.replace('<!-- EQL-ZONE-RAID:END -->',''),
    blueprint.replace('<!-- EQL-ZONE-RAID:BEGIN -->','<!-- EQL-ZONE-RAID:END -->'),
    blueprint.replace('@@WHO_NAME@@','@@UNSUPPORTED_WHO@@'),
    blueprint.replace('@@RAID_MAP_NOTES@@',''),
    blueprint.replace('= Raid Instance =','== Raid Instance =='),
    blueprint.replace('== Raid Map ==','== Map =='),
    blueprint.replace('@@RAID_OVERVIEW@@','@@DYNAMIC_ZONE_LIST@@\n@@RAID_OVERVIEW@@')
])assert.throws(()=>inspectZoneCreationBlueprint(source),/blueprint|layout|Map|raid|fields|dynamic/i,'Legacy or structurally changed blueprints cannot silently become new-zone layouts');
const missingValue={...values};delete missingValue.MAP_IMAGE;assert.throws(()=>fillZoneCreationBlueprint(blueprint,{raidAvailability:'no',values:missingValue}),/missing.*MAP_IMAGE/);

for(const availability of ['no','unknown','yes']){
    const draft=make(availability);assert.deepEqual(draft.blockers,[]);assert.equal(assertZoneCreationLayout(draft.text,{raidAvailability:availability,mapFiles:{}}),true);
    assert.equal(count(draft.text,/class="zoneTopTable"/g),availability==='yes'?2:1);assert.equal(count(draft.text,/^== Map ==$/gm),1);assert.equal(count(draft.text,/^== Raid Map ==$/gm),availability==='yes'?1:0);
    assert.equal(count(draft.text,/^= Raid Instance =$/gm),availability==='yes'?1:0);assert.equal(count(draft.text,/\[\[Category:Zones\]\]/g),1);assert.equal(count(draft.text,/\{\{Special:DynamicZoneList\/Synthetic Vale\}\}/g),1);
    assert.match(draft.text,/Notable NPCs/);assert.match(draft.text,/Unique Items/);assert.match(draft.text,/Map needed/);assert.doesNotMatch(draft.text,/@@[A-Z_]+@@|ZONE_NAME|0, 0|File:0/);
    assert(draft.text.indexOf('zoneTopTable')<draft.text.indexOf('== Map =='),'opening overview precedes Map');
    assert(draft.text.indexOf('== Map ==')<draft.text.indexOf("== What's in this zone? =="));
}
const unanswered=buildContributionDraft({...candidate(),fields:{}},blueprints);assert(unanswered.blockers.some(message=>/raid instance/.test(message)),'observed normal instance does not answer whether a raid instance exists');
const unreviewed=make('unknown',{raidAvailability:{value:'yes',confirmed:false}});assert(unreviewed.blockers.some(message=>/raid instance/.test(message)));
const missingLayout=buildContributionDraft(candidate('no'),extractContributionBlueprints('== Zones ==\n=== Zone Page Blueprint ===\n<pre>{| class="zoneTopTable"\n|}</pre>',1));assert(missingLayout.blockers.some(message=>/unified/.test(message)));
const details=make('yes',{
    whoName:reviewed('syntheticshort'),levelRange:reviewed('10–20'),notableNPCs:reviewed(['Normal Guardian']),knownNPCs:reviewed(['Ordinary Watcher']),
    raidWhoName:reviewed('syntheticraid'),raidLevelRange:reviewed('50–60'),raidNotableNPCs:reviewed(['Raid Guardian']),
    mapFilename:reviewed('Synthetic_Map.PNG'),raidMapFilename:reviewed('Synthetic Raid.jpg'),mapNotes:reviewed('Normal marker.'),raidMapNotes:reviewed('Raid marker.'),
    knownLoot:reviewed(['Common Relic','Unique Relic']),lootKinds:reviewed({'Common Relic':'common','Unique Relic':'unique'}),relatedQuests:reviewed(['Synthetic Quest']),adjacentZones:reviewed(['Next Vale'])
});
assert.deepEqual(details.blockers,[]);assertZoneCreationLayout(details.text,{raidAvailability:'yes',mapFiles:{normal:'Synthetic_Map.PNG',raid:'Synthetic Raid.jpg'}});
const [normal,raid]=details.text.split('= Raid Instance =');
assert.match(normal,/Normal Guardian/);assert.match(normal,/syntheticshort/);assert.match(normal,/Synthetic_Map\.PNG/);assert.match(normal,/Normal marker/);assert.match(normal,/\{\{:Common Relic\}\}/);assert.doesNotMatch(normal,/Raid Guardian|syntheticraid|Raid marker|Unique Relic|Ordinary Watcher/);
assert.match(raid,/Raid Guardian/);assert.match(raid,/syntheticraid/);assert.match(raid,/Synthetic Raid\.jpg/);assert.match(raid,/Raid marker/);assert.doesNotMatch(raid,/Normal Guardian|syntheticshort|Common Relic|Special:DynamicZoneList/,'normal facts are never copied into raid');
assert(details.warnings.some(message=>/Ordinary zone population/.test(message)));assert(details.warnings.some(message=>/pre-existing Unique Items/.test(message)));
const hiddenRaid=make('no',{raidWhoName:reviewed('secret'),raidNotableNPCs:reviewed(['Hidden Raid Mob']),raidMapFilename:reviewed('Hidden.png')});assert.doesNotMatch(hiddenRaid.text,/secret|Hidden/);
const prose=buildContributionDraft({...candidate('no'),playerText:'= Raid Instance =\n{{Injected}} [[Category:Zones]]'},blueprints);assert.doesNotMatch(prose.text,/^= Raid Instance =$/m);assert.equal(count(prose.text,/\[\[Category:Zones\]\]/g),1);assert.match(prose.text,/&#61; Raid Instance/);
for(const filename of ['File:Injected.png','bad.png|link=elsewhere','{{bad}}.png','bad.png\nInjected','fake.txt','../bad.png'])assert.throws(()=>safeZoneMapFilename(filename));
for(const fields of [{mapFilename:reviewed('bad.png|x')},{notableNPCs:reviewed(['Template:Bad'])}])assert(make('no',fields).blockers.length>0);

const base=make('yes').text;
for(const [description,edited]of [
    ['missing map',base.replace('== Map ==','== Missing ==')],
    ['raid subheading',base.replace('= Raid Instance =','== Raid Instance ==')],
    ['unreviewed raid answer',base.replace("! ''' Raid Instance: '''\n| Yes","! ''' Raid Instance: '''\n| No")],
    ['removed summary row',base.replace("! ''' Notable NPCs: '''","! ''' Monsters: '''")],
    ['duplicate summary table',base+'\n{| class="zoneTopTable"\n|}'],
    ['duplicate category',base+'\n[[Category:Zones]]'],
    ['missing category',base.replace('[[Category:Zones]]','')],
    ['unreviewed image',base.replace("''Map needed.''",'[[File:Unreviewed.png]]')]
])assert.throws(()=>assertZoneCreationLayout(edited,{raidAvailability:'yes',mapFiles:{}}),/overview|Map|Raid|raid|Zones|images/,'edited new-zone layout must reject '+description);
const reviewedMap=details.text.match(/\[\[File:Synthetic_Map\.PNG[^\n]+/)[0],movedMap=details.text.replace(reviewedMap,'').replace('== Dangers ==','== Dangers ==\n'+reviewedMap);
assert.throws(()=>assertZoneCreationLayout(movedMap,{raidAvailability:'yes',mapFiles:{normal:'Synthetic_Map.PNG',raid:'Synthetic Raid.jpg'}}),/Map images/,'a reviewed map moved outside its Map section no longer satisfies that field');
for(const [index,label]of [[0,'normal'],[1,'raid']]){
    const table=[...base.matchAll(/\{\| class="zoneTopTable"[\s\S]*?\n\|\}/g)][index][0],moved=base.replace(table,'').replace(label==='normal'?'== Map ==':'== Raid Map ==',heading=>heading+'\n'+table);
    assert.throws(()=>assertZoneCreationLayout(moved,{raidAvailability:'yes',mapFiles:{}}),/overview|before|opening|Map/,'the '+label+' overview must remain before its Map section');
}

const existing='{{Classic Era}}\nCustom intro.\n{| class="zoneTopTable"\n! Notable NPCs\n| ?\n|}\n== Raid Instance ==\nPreserve established raid body.\n[[File:Old_Map.png|thumb|Old caption]]\n[[Category:Zones]]';
assert.equal(patchContributionPrimary(existing,{kind:'zone',name:'Synthetic Vale',intent:'update',instance:'normal',reasons:['missing-population'],fields:{knownNPCs:reviewed(['Ordinary Watcher'])}}).text,existing,'a normal population proposal still leaves the editorial summary alone');
const patched=patchContributionRelationship(existing,{role:'zone-population',npcTitle:'New Guardian',instance:'normal',notable:true});
assert.match(patched.text,/\[\[New Guardian\]\]/);assert(patched.text.includes(existing.slice(existing.indexOf('== Raid Instance =='))),'narrow updates preserve existing raid/body/map bytes');assert.doesNotMatch(patched.text,/Map needed|EQL-ZONE-BLUEPRINT/,'existing pages are not migrated by a narrow update');
console.log('Zone blueprint: shared versioned layout, explicit reviewed raid availability, per-instance overview/maps, safe placeholders, protected edits and narrow-update preservation pass.');
