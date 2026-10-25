import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{WikiItemExistence}=require('../desktop/wiki-item-existence.cjs');
const response=pages=>new Response(JSON.stringify({query:{pages}}),{status:200,headers:{'Content-Type':'application/json'}});
const missing=title=>response([{ns:0,title,missing:true}]);
const present=title=>response([{ns:0,title,pageid:12}]);
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pack={meta:{sample:false,wikiEntitiesComplete:true},wikiEntities:{items:['Synthetic Cached Relic'],npcs:[],titles:['Synthetic Cached Relic','Synthetic Statless Relic','Synthetic Public Redirect']},items:[{name:'Synthetic Cached Relic',wikiTitle:'Synthetic Cached Relic',aliases:['Synthetic Relic Alias']}]};
let calls=[];
const local=new WikiItemExistence({getPack:async()=>pack,fetchImpl:async(...args)=>{calls.push(args);throw Error('Cache positives must not fetch');}});
for(const name of ['Synthetic Cached Relic','Synthetic Relic Alias +4','Synthetic Statless Relic','Synthetic Public Redirect']){const result=await local.check({name});assert.equal(result.status,'present');assert.equal(result.source,'cache');}
assert.equal(calls.length,0,'Rich items, aliases and public statless/redirect titles suppress a missing toast locally');
const exaltation=new WikiItemExistence({getPack:async()=>({wikiEntities:{titles:['Synthetic Distinct Relic (Exaltation)']}}),fetchImpl:async()=>{throw Error('A distinct cached Exaltation title must not fetch its absent base');}});
assert.equal((await exaltation.check({name:'Synthetic Distinct Relic (Exaltation) +4'})).status,'present');exaltation.dispose();
const ambiguous=new WikiItemExistence({getPack:async()=>({...pack,items:[{name:'Synthetic Shared Alias',wikiTitle:'First Synthetic Relic'},{name:'Synthetic Shared Alias',wikiTitle:'Second Synthetic Relic'}]}),fetchImpl:async()=>{throw Error('An ambiguous local positive is still present');}});
assert.equal((await ambiguous.check({name:'Synthetic Shared Alias'})).status,'present');

calls=[];
const live=new WikiItemExistence({getPack:async()=>({}),fetchImpl:async(url,init)=>{
    const query=new URL(url);assert.equal(query.origin,'https://eqlwiki.com');assert.equal(query.pathname,'/api.php');assert.equal(query.username,'');assert.equal(query.password,'');
    for(const [key,value]of Object.entries({action:'query',prop:'info',redirects:'1',converttitles:'1',formatversion:'2'}))assert.equal(query.searchParams.get(key),value);
    assert.equal(init.credentials,'omit');assert(!Object.keys(init.headers||{}).some(key=>/^(?:authorization|cookie)$/i.test(key)));assert.notEqual(init.method,'POST');calls.push(query.searchParams.get('titles'));return missing(query.searchParams.get('titles'));
}});
let result=await live.check({name:'Synthetic Unknown Relic +5'});assert.equal(result.status,'missing');assert.equal(result.source,'live');assert.deepEqual(calls,['Synthetic Unknown Relic'],'Tier decoration is removed before the single-title lookup');
assert.equal((await live.check({name:'Synthetic Unknown Relic +5'})).status,'missing');assert.equal(calls.length,1,'Confirmed results are cached within their lifetime');
for(const name of ['', 'a\nsecond item','Item|Other','https://attacker.example/','x'.repeat(1000)])assert.equal((await live.check({name})).status,'unknown');
assert.equal(calls.length,1,'Malformed names never become URLs or batched article queries');

for(const payload of [
    {query:{pages:[]}},
    {query:{pages:[{ns:0,title:'Unrelated Synthetic Article',missing:true}]}},
    {query:{pages:[{ns:1,title:'Synthetic Missing Relic',missing:true}]}},
    {query:{pages:[{ns:0,title:'Synthetic Missing Relic',invalid:true}]}},
    {query:{pages:[{ns:0,title:'Synthetic Missing Relic'}]}},
    {error:{code:'badtitle'}}
]){
    const malformed=new WikiItemExistence({fetchImpl:async()=>new Response(JSON.stringify(payload),{status:200})});
    assert.equal((await malformed.check({name:'Synthetic Missing Relic'})).status,'unknown','Only an explicit matching public missing page proves absence');malformed.dispose();
}
const redirect=new WikiItemExistence({fetchImpl:async()=>new Response(JSON.stringify({query:{redirects:[{from:'Synthetic Old Relic',to:'Synthetic Canonical Relic'}],pages:[{ns:0,title:'Synthetic Canonical Relic',pageid:22}]}}),{status:200})});
result=await redirect.check({name:'Synthetic Old Relic'});assert.equal(result.status,'present');assert.equal(result.title,'Synthetic Canonical Relic');

const shared=deferred();let sharedCalls=0;
const coalesced=new WikiItemExistence({fetchImpl:async()=>{sharedCalls++;return shared.promise;}});
const checks=[coalesced.check({name:'Synthetic Concurrent Relic'}),coalesced.check({name:'Synthetic Concurrent Relic +2'})];await tick();assert.equal(sharedCalls,1,'Concurrent checks of one base item share one live request');shared.resolve(missing('Synthetic Concurrent Relic'));assert.deepEqual((await Promise.all(checks)).map(value=>value.status),['missing','missing']);

for(const action of ['clear','dispose']){
    const pending=deferred();const checker=new WikiItemExistence({fetchImpl:async()=>pending.promise});
    const check=checker.check({name:'Synthetic Stale Relic'});await tick();checker[action]();pending.resolve(present('Synthetic Stale Relic'));
    assert.equal((await check).status,'unknown',action+' discards a result belonging to the previous capture/dataset lifetime');
}
let clock=0,attempts=0;
const retry=new WikiItemExistence({now:()=>clock,fetchImpl:async()=>{attempts++;if(attempts===1)throw Error('Synthetic outage');return missing('Synthetic Retry Relic');}});
assert.equal((await retry.check({name:'Synthetic Retry Relic'})).status,'unknown');assert.equal((await retry.check({name:'Synthetic Retry Relic'})).status,'unknown');assert.equal(attempts,1,'Immediate repeated failures are held behind bounded retry backoff');clock+=3600000;assert.equal((await retry.check({name:'Synthetic Retry Relic'})).status,'missing');assert.equal(attempts,2);

let active=0,maxActive=0;const gates=[];
const bounded=new WikiItemExistence({maxConcurrent:2,maxPending:2,fetchImpl:async url=>{active++;maxActive=Math.max(maxActive,active);const gate=deferred();gates.push({gate,title:new URL(url).searchParams.get('titles')});await gate.promise;active--;return missing(new URL(url).searchParams.get('titles'));}});
const queued=Array.from({length:12},(_,index)=>bounded.check({name:'Synthetic Bounded Relic '+index}));await tick();assert.equal(maxActive,2);assert.equal(gates.length,2);
for(let index=0;index<12;index++){for(const value of gates)value.gate.resolve();await tick();}
const statuses=(await Promise.all(queued)).map(value=>value.status);assert(maxActive<=2);assert(statuses.includes('unknown'),'Queue overflow is bounded and cannot prove missing');assert(statuses.includes('missing'));
for(const checker of [local,ambiguous,live,redirect,coalesced,retry,bounded])checker.dispose();
console.log('Item existence: local positive identity, fixed anonymous single-title query, strict missing proof, redirects, coalescing/cache, stale-result guards, retry backoff and request bounds passed.');

{
let sharedCalls=0,sharedClock=100000,sharedResult={state:'covered',canonicalTitle:'Synthetic Downloaded Relic',checkedAt:new Date(sharedClock).toISOString()};
const shared=new WikiItemExistence({getPack:async()=>({}),now:()=>sharedClock,entryVerifier:{check:async request=>{sharedCalls++;assert.equal(request.kind,'item');assert.deepEqual(request.reasons,['missing-page']);return sharedResult;}},fetchImpl:()=>{throw Error('Shared source verifier must replace the duplicate info-only lookup');}});
assert.equal((await shared.check({name:'Synthetic Downloaded Relic'})).status,'present');assert.equal((await shared.check({name:'Synthetic Downloaded Relic'})).status,'present');assert.equal(sharedCalls,1);shared.clear();
sharedResult={state:'missing',canonicalTitle:'Synthetic Missing Relic',reasons:['missing-page'],checkedAt:new Date(sharedClock-59000).toISOString()};assert.equal((await shared.check({name:'Synthetic Missing Relic'})).status,'missing');sharedClock+=2000;assert.equal((await shared.check({name:'Synthetic Missing Relic'})).status,'unknown','Shared absence proof cannot gain a second sixty-second lifetime');assert.equal(sharedCalls,3);shared.dispose();
console.log('Item presence uses the shared full-entry verifier and preserves original absence freshness.');
}
