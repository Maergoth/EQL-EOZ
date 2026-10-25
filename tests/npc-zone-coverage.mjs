import assert from 'node:assert/strict';
import {createWikiResolver} from '../app/wiki-identity.js';
import {contributionReasons,contributionNpcZoneStatus} from '../app/contribution-reasons.js';
import {contributionDestinations} from '../app/contribution-presentation.js';
const npc='Corrupted Kedgespawn',zone='Lake Nerius';
const candidate={kind:'npc',name:npc,title:npc,zone,instance:'normal',intent:'update',membership:'present',reasons:['missing-population'],relations:[{type:'mob-zone',zone,evidence:'kill',instance:'normal'}]};
function pack(record){return {meta:{wikiEntitiesComplete:true},wikiEntities:{npcs:[npc],zones:[zone],titles:[npc,zone]},npcs:[{name:npc,...record}],zones:[{name:zone}]};}
for(const record of [{zone:''},{zone:'',categoryZones:[]}]){
 const data=pack(record),resolver=createWikiResolver(data);
 assert.equal(contributionNpcZoneStatus(resolver,resolver.resolve('npc',npc).records,zone,{instance:'normal'}),'unknown');
 assert(!contributionReasons(candidate,resolver,{pack:data}).reasons.includes('missing-population'));
 assert(!contributionDestinations(candidate,{pack:data}).some(page=>page.changes.some(change=>change.role==='mob-zone')));
}
for(const record of [{zone},{zone:'',categoryZones:[zone]},{zone:'',zoneScope:'various'}]){
 const data=pack(record),resolver=createWikiResolver(data);
 assert.equal(contributionNpcZoneStatus(resolver,resolver.resolve('npc',npc).records,zone,{instance:'normal'}),'recorded');
 assert(!contributionReasons(candidate,resolver,{pack:data}).reasons.includes('missing-population'));
}
const other=pack({zone:'Other Lake'}),resolver=createWikiResolver(other);
assert(contributionReasons(candidate,resolver,{pack:other}).reasons.includes('missing-population'),'A different positive documented zone remains a useful gap');
console.log('NPC zone coverage: empty cache metadata is unknown; positive authored zones are preserved.');
