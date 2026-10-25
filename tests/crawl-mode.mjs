import assert from 'node:assert/strict';
import {createCrawlMode} from '../app/crawl-mode.js';

const zone='Synthetic Keep',normal={name:'Synthetic Keeper',wikiTitle:'Synthetic Keeper',aliases:['Keeper Alias'],zone,raidInstance:false,loc:[1,2],dropCount:0};
const drops={name:'Loot Only Watcher',zone,raidInstance:false,dropCount:1},plain={name:'Ordinary Rat',zone,raidInstance:false,dropCount:0};
const pack={zones:[{name:zone,aliases:['synthetickeep']}],npcs:[normal,drops,plain]};
const original=JSON.stringify(pack);let now=100000;
const model=createCrawlMode({getPack:()=>pack,now:()=>now,maxDefeated:2});
const context={zone:'synthetickeep',character:'Fixture',source:'fixture-log',profile:'MNK',session:1,visit:1,live:true,at:now};
const kill=(victim,extra={})=>({type:'kill',victim,...extra});
const consume=(victim,{event={},...options}={},candidates=[normal,drops,plain])=>model.consume(kill(victim,event),{...context,...options},candidates);
assert.equal(model.snapshot().enabled,false);assert.equal(consume(normal.name),null,'Default off never marks kills');
model.setEnabled(true);
for(const options of [{live:false},{at:now-10001},{at:now+2001},{event:{isPet:true}},{event:{victimIsPlayer:true}},{playerNames:[normal.name]}])assert.equal(consume(normal.name,options),null);
assert.equal(consume(plain.name),null,'An NPC needs a map location or known Intel drops');
assert.equal(consume('Keeper'),null,'Prefixes and similar names cannot identify a mob');
assert(consume('Keeper Alias'));assert(model.isDefeated(normal),'A positively documented alias identifies the same canonical mob');
now+=7200000;assert(model.isDefeated(normal),'Elapsed timer/respawn time cannot reactivate a defeated Crawl marker');now-=7200000;
assert(!model.isDefeated({...normal,zone:'Elsewhere'}));assert(!model.isDefeated({...normal,raidInstance:true}));
assert(consume(drops.name));assert(model.isDefeated(drops),'Drops alone make an NPC eligible');
const third={...plain,loc:[2,3]};assert.equal(consume(third.name,{},[third]),null);assert.equal(model.snapshot().defeatedCount,2,'A full bounded set never evicts/reactivates an earlier defeat');
assert(consume(normal.name));assert.equal(model.snapshot().defeatedCount,2);
for(const field of ['zone','character','source','profile','session','visit','instanceId']){
    model.context({...context,[field]:field==='session'||field==='visit'?2:'replacement'});
    assert.equal(model.snapshot().defeatedCount,0,field+' change clears the visit');assert.equal(model.snapshot().enabled,true);
    assert(consume(normal.name));
}
model.consume({type:'zone'},context);assert(!model.isDefeated(normal),'Re-entering the same zone resets the crawl');
assert(consume(normal.name));model.setEnabled(false);assert.equal(model.snapshot().defeatedCount,0);assert(!model.isDefeated(normal));
model.setEnabled(true);assert(!model.isDefeated(normal),'Re-enabling never replays earlier kills');
const raid={...normal,raidInstance:true};
assert.equal(consume(normal.name,{},[normal,raid]),null,'Unknown Normal/Raid identity never defeats both or guesses a variant');
assert(consume(normal.name,{instance:'raid'},[normal,raid]));assert(model.isDefeated(raid));assert(!model.isDefeated(normal));
assert.equal(consume('A loathling lich pet',{},[{name:'A loathling lich pet',zone,raidInstance:false,loc:[1,2]}]),null,'Explicit pet suffix is never eligible');
assert.equal(consume('Gonab',{},[{name:'Gonab',zone,raidInstance:false,loc:[1,2]}]),null,'Generated pet labels stay excluded without positive NPC identity');
assert.equal(consume('Fixture',{},[{name:'Fixture',zone,raidInstance:false,loc:[1,2]}]),null,'Player character stays excluded');
model.reset();assert(!model.isDefeated(raid));assert.equal(JSON.stringify(pack),original,'Presentation state never modifies catalog/wiki/location/drop records');
assert.throws(()=>model.setEnabled('true'),/whether Crawl/);
console.log('Crawl session model: fresh-only kills, location/drop eligibility, canonical aliases, strict variants, players/pets, bounded visit state, all reset scopes and reversible presentation passed.');
