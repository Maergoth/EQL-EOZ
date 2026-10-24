import assert from 'node:assert/strict';
import {buildContributionDraft,extractContributionBlueprints,patchContributionPrimary,patchContributionRelationship,contributionItemEffects} from '../app/contribution-model.js';
import {contributionFieldMarkup,contributionLootMarkup,contributionMatchMarkup,contributionScreenshotMarkup,contributionPublishedPagesMarkup} from '../app/contribution-editor.js';
const wrap=value=>({value,confirmed:true}),blueprints=extractContributionBlueprints('=== Item Page Blueprint ===\n<pre>{{Itempage|itemname=?|statsblock=?}}</pre>\n=== NPC Page Blueprint ===\n<pre>{{Namedmobpage|name=?}}</pre>\n=== Raid Encounter Blueprint ===\n<pre>{{Namedmobpage|name=?}}</pre>\n=== Zone Page Blueprint ===\n<pre>{| class="zoneTopTable"\n|}</pre>\n=== Spell Page Blueprint ===\n<pre>{{Spellpage\n|spellname=Spell\n|description=Description\n|classes=Classes\n|items_with_effect=Items\n|casting_time=Time\n|mana=Mana\n|slots=Effects\n}}</pre>',123);
const item={kind:'item',name:'Synthetic Thorn',fields:{effectName:wrap('Synthetic Rampage'),effectType:wrap('Combat'),effectCastTime:wrap('Instant'),effectLevel:wrap(45)}};
const draft=buildContributionDraft(item,blueprints);assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/Classic Era/);assert.match(draft.text,/Effect: \[\[Synthetic Rampage\]\] \(Combat, Casting Time: Instant\) at Level 45/);assert.match(draft.text,/Exaltation capacity: 5/);
const npc={kind:'npc',name:'A synthetic lich',zone:'Synthetic Vale',fields:{location:wrap('12, -30, 120'),knownLoot:wrap(['Redlinked Gem','Common Gem']),lootKinds:wrap({'Common Gem':'common'})}};
const mob=buildContributionDraft(npc,blueprints);assert.deepEqual(mob.blockers,[]);assert.match(mob.text,/\| HP = \?/);assert.match(mob.text,/known_loot = <ul>\n<li>\{\{:Redlinked Gem\}\}/);assert.match(mob.text,/common_loot = <ul>\n<li>\{\{:Common Gem\}\}/);assert.ok(buildContributionDraft({...npc,fields:{}},blueprints).blockers.some(message=>message.includes('spawn location')));
const spell=buildContributionDraft({kind:'spell',name:'Synthetic Rampage',fields:{itemsWithEffect:wrap(['Synthetic Thorn']),castTime:wrap('Instant')}},blueprints);assert.deepEqual(spell.blockers,[]);assert.match(spell.text,/spellname = Synthetic Rampage/);assert.match(spell.text,/items_with_effect = \* \[\[Synthetic Thorn\]\]/);assert.match(spell.text,/classes = \?/);assert.doesNotMatch(spell.text,/Combat|Rogue|Wizard/);
assert.deepEqual(contributionItemEffects({fields:{effects:wrap(['Combat Effect: Synthetic Rampage (Req Level 45)','Proc Exaltation: Synthetic Thorn'])}}).map(effect=>effect.name),['Synthetic Rampage']);
const source='{{Itempage\n|itemname=Synthetic Thorn\n|statsblock=HP: 20\n|notes=Keep me\n|dropsfrom=?\n}}\nUnrelated prose.';
const changed=patchContributionPrimary(source,{...item,intent:'update',fields:{},sources:[{npc:'A synthetic lich',zone:'Synthetic Vale',confirmed:true}]});assert.match(changed.text,/\[\[A synthetic lich\]\]/);assert.match(changed.text,/HP: 20/);assert.match(changed.text,/Keep me/);assert.match(changed.text,/Unrelated prose/);assert.equal(patchContributionPrimary(changed.text,{...item,intent:'update',fields:{},sources:[{npc:'A synthetic lich',zone:'Synthetic Vale',confirmed:true}]}).changed,false);
const dual='{{Namedmobpage|name=Lich|known_loot=?\n}}\n== Raid Instance ==\n{{Namedmobpage|name=Lich|known_loot=?\n}}';
const raid=patchContributionRelationship(dual,{role:'npc-loot',itemTitle:'Raid Gem',instance:'raid'}).text;assert.equal(raid.indexOf('{{:Raid Gem}}')>raid.indexOf('== Raid Instance =='),true);assert.equal((raid.match(/\{\{:Raid Gem\}\}/g)||[]).length,1);
const normal=patchContributionRelationship(dual,{role:'npc-loot',itemTitle:'Normal Gem',instance:'normal'}).text;assert.equal(normal.indexOf('{{:Normal Gem}}')<normal.indexOf('== Raid Instance =='),true);
const itemDual='{{Itempage\n|dropsfrom=\n[[Synthetic Vale]]\n* [[Normal Mob]]\n=== Raid Instance ===\n[[Synthetic Vale]]\n* [[Raid Mob]]\n}}';
const itemRaid=patchContributionRelationship(itemDual,{role:'item-source',npcTitle:'New Raid Mob',zoneTitle:'Synthetic Vale',instance:'raid'}).text;assert.equal(itemRaid.indexOf('New Raid Mob')>itemRaid.indexOf('=== Raid Instance ==='),true);assert.match(itemRaid,/Normal Mob/);assert.equal(patchContributionRelationship(itemRaid,{role:'item-source',npcTitle:'New Raid Mob',zoneTitle:'Synthetic Vale',instance:'raid'}).changed,false);
const match=contributionMatchMarkup({name:'Thing',title:'Thing',fields:{},reasons:['missing-source'],intent:'update'},[{title:'Known Thing'}]);assert.match(match,/Use this page/);assert.match(match,/value="update" selected/);assert.doesNotMatch(contributionFieldMarkup('HP',wrap(20),{kind:'npc'}),/Verified|data-field-confirmed/);assert.match(contributionFieldMarkup('respawnTime',wrap(''),{kind:'npc'}),/placeholder="ex. 3h"/);assert.match(contributionLootMarkup(npc),/Common Loot/);assert.doesNotMatch(contributionLootMarkup(npc),/knownLootOne wiki/);assert.match(contributionScreenshotMarkup({name:'Thing'}),/contribution-image-plus/);assert.match(contributionScreenshotMarkup({name:'Thing'}),/Select a screenshot or paste/);
for(const title of ['<script>alert(1)</script>','x" onmouseover="oops'])assert.doesNotMatch(contributionMatchMarkup({fields:{}},[{title}]),/<script>| onmouseover="oops/);
console.log('Contribution editor: optional fields, location gate, complete effect links, real spell blueprint, scoped existing-page patches, Common/Unique loot, matching-first and screenshot controls passed.');

assert.match(contributionMatchMarkup({fields:{},membership:'present',intent:'create'}),/value="create" selected/,'An explicit create choice survives a stale cached membership; live plan still checks actual page existence');

const identityCards=contributionMatchMarkup({kind:'npc',fields:{},intent:'update'},[{title:'A Loathing Lich'},{title:'A_Loathing_Lich'},{title:'A loathing lich'}]);
assert.equal((identityCards.match(/data-use-existing=/g)||[]).length,1,'Case and underscore variants do not show duplicate cards');
assert.match(identityCards,/data-use-existing="A Loathing Lich"/);assert.match(identityCards,/data-check-matches/);assert.match(identityCards,/name="intent"/);
for(const intent of ['create','update']){
    const destination=contributionMatchMarkup({kind:'item',fields:{},intent,matchesReviewed:true},[{title:'Synthetic Destination'}]);
    assert.doesNotMatch(destination,/type="checkbox"|data-matches-reviewed|This is the correct existing page|I checked that this page does not already exist|page identity and contribution type/,'Destination review is performed by the explicit preview action, without a second approval checkbox.');
    assert.match(destination,new RegExp(`value="${intent}" selected`));
    assert.match(destination,/Use this page/);
}
assert.match(contributionFieldMarkup('location',wrap(''),{kind:'npc',requireLocation:false}),/placeholder="ex\. /);
assert.doesNotMatch(contributionFieldMarkup('location',wrap(''),{kind:'npc',requireLocation:false}),/required/,'A source update does not demand a new spawn location');

const saved=contributionPublishedPagesMarkup({status:'partial',pages:[
    {kind:'item',title:'Synthetic Blade',operation:'create',status:'applied'},
    {kind:'zone',title:'Synthetic Vale',operation:'replace-reviewed',status:'applied'},
    {kind:'npc',title:'A synthetic keeper',operation:'create',status:'applied'},
    {kind:'spell',title:'Synthetic Effect',operation:'update',status:'applied'},
    {title:'Unfinished related page',operation:'update',status:'failed'},
    {title:'Pending related page',operation:'create',status:'pending'},
    {title:'Unknown result',operation:'update',status:'mystery'}
]});
assert.match(saved,/<h3>Saved pages<\/h3>/);
assert.equal((saved.match(/>View page<\/a>/g)||[]).length,4,'Every successfully applied page has its own link, independent of entity kind.');
assert.match(saved,/Created/);assert.match(saved,/Updated/);
for(const title of ['Synthetic Blade','Synthetic Vale','A synthetic keeper','Synthetic Effect']){
    assert(saved.includes(`href="https://eqlwiki.com/${encodeURIComponent(title)}"`));
    assert(saved.includes(`aria-label="View page: ${title}"`));
}
assert.doesNotMatch(saved,/Unfinished related page|Pending related page|Unknown result/,'Partial publication links only the pages which succeeded.');
for(const title of ['<img src=x onerror="oops"> & bad','//evil.example/page','javascript:alert(1)']){
    const hostile=contributionPublishedPagesMarkup({pages:[{title,status:'applied',operation:'create',result:{url:'javascript:alert(99)'}}]});
    assert.doesNotMatch(hostile,/<img| onerror="oops"|href="javascript:|alert\(99\)/);
    assert.match(hostile,/rel="noopener noreferrer"/);
    const href=hostile.match(/href="([^"]+)"/)[1];assert.equal(new URL(href).origin,'https://eqlwiki.com');
}
assert.equal(contributionPublishedPagesMarkup({pages:[{title:'\ud800',status:'applied'}]}),'','Malformed title encoding cannot break rendering the remaining results.');
for(const plan of [null,{}, {pages:[]},{pages:[{title:'Not saved',status:'pending'}]},{pages:[{title:'No status'}]},{pages:[{title:'',status:'applied'}]}])assert.equal(contributionPublishedPagesMarkup(plan),'','No saved-page section is rendered without successfully saved, named pages.');
