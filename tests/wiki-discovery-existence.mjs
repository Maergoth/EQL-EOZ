import assert from 'node:assert/strict';
import {createWikiDiscovery} from '../app/wiki-discovery.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const full=()=>({meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],titles:[]},items:[],npcs:[]});
function fixture({verifyItem=async()=>({status:'missing'}),onMissing,pack=full(),suppressed=false}={}){
    let clock=Date.UTC(2026,9,25,12),currentPack=pack,suppression=suppressed;
    const prompts=[],warnings=[];
    const discovery=createWikiDiscovery({storage:null,getPack:()=>currentPack,now:()=>clock,verifyItem,
        getSuppression:()=>({suppressed:suppression}),onMissing:onMissing||((prompt)=>prompts.push(prompt)),onWarning:message=>warnings.push(message)});
    const consume=(event={type:'loot',item:'Synthetic Missing Item'},context={})=>discovery.consume({at:clock,...event},{live:true,logId:'synthetic-log',...context});
    return{discovery,prompts,warnings,consume,advance:ms=>{clock+=ms;},setPack:value=>{currentPack=value;},suppress:()=>{suppression=true;}};
}

let reads=0;
const known={...full(),meta:{wikiEntitiesComplete:false},wikiEntities:{items:['Known Relic'],npcs:[],titles:['Known Relic','Known Statless Page','Known Redirect']},items:[{name:'Known Relic',wikiTitle:'Known Relic',aliases:['Known Alias']} ]};
const cached=fixture({pack:known,verifyItem:async()=>{reads++;return{status:'missing'};}});
for(const item of ['Known Relic','Known Alias +5','Known Statless Page','Known Redirect'])assert.equal(cached.consume({type:'loot',item}),null);
await tick();assert.equal(reads,0,'Any local positive, including generic/statless titles and aliases, bypasses live checks');
cached.setPack({...known,wikiEntities:{...known.wikiEntities,titles:[...known.wikiEntities.titles,'Synthetic Distinct Relic (Exaltation)']}});
cached.consume({type:'item-links',items:['Synthetic Distinct Relic (Exaltation) +4']});await tick();assert.equal(reads,0,'An exact cached Exaltation title takes precedence over its absent base');

for(const event of [
    {type:'loot',item:'Synthetic Missing Item'},
    {type:'item-links',items:['Synthetic Missing Item +5']},
    {type:'item-links',items:['Synthetic Missing Item +5'],itemLinkFormat:'plain-tiered-chat'}
]){
    const gate=deferred();let calls=0;
    const f=fixture({verifyItem:()=>{calls++;return gate.promise;}});
    assert.equal(f.consume(event),null);assert.equal(calls,1);assert.equal(f.prompts.length,0);assert.equal(f.discovery.snapshot().pending.length,0,'Unverified absence cannot enter the visible notice queue');
    gate.resolve({status:'missing'});await tick();assert.equal(f.prompts.length,1);assert.equal(f.discovery.snapshot().pending.length,1);
    assert.equal(f.prompts[0].expiresAt-f.prompts[0].createdAt,10000,'Native show receives a bounded lifetime');
}
for(const status of ['present','unknown']){
    const f=fixture({verifyItem:async()=>({status,title:'Synthetic Canonical Item'})});f.consume();await tick();
    assert.equal(f.prompts.length,0);assert.equal(f.discovery.snapshot().pending.length,0,'Existing/redirect or unverified results never claim missing');
}
const absentChecker=fixture({verifyItem:null});assert.equal(absentChecker.consume(),null);assert.equal(absentChecker.prompts.length,0,'Missing native verification fails closed');
const partial=fixture({pack:{items:[],npcs:[]}});partial.consume();await tick();assert.equal(partial.prompts.length,1,'Explicit live missing proof works even when the local dataset is incomplete');

for(const change of ['cancel','dispose','expire','catalog','ignore']){
    const gate=deferred(),f=fixture({verifyItem:()=>gate.promise});f.consume();
    if(change==='cancel')f.discovery.cancelChecks();
    if(change==='dispose')f.discovery.dispose();
    if(change==='expire')f.advance(10001);
    if(change==='catalog')f.setPack({...full(),wikiEntities:{items:['Synthetic Missing Item'],npcs:[],titles:['Synthetic Missing Item']}});
    if(change==='ignore')f.suppress();
    gate.resolve({status:'missing'});await tick();assert.equal(f.prompts.length,0,change+' invalidates stale admission');
}
const old=deferred(),fresh=deferred();let generationCalls=0;
const changed=fixture({verifyItem:()=>++generationCalls===1?old.promise:fresh.promise});
changed.consume();changed.discovery.cancelChecks();changed.consume(undefined,{logId:'new-synthetic-log'});
old.resolve({status:'missing'});await tick();assert.equal(changed.prompts.length,0,'The previous log cannot consume the new lookup token');
fresh.resolve({status:'missing'});await tick();assert.equal(changed.prompts.length,1,'A fresh source may retry a cancelled check');

let attempts=0;
const retried=fixture({verifyItem:async()=>{if(++attempts===1)throw Error('Synthetic network error');return{status:'missing'};}});
retried.consume();await tick();assert.equal(retried.prompts.length,0);assert.equal(retried.warnings.length,0,'Network errors remain unverified, without a false missing warning');
retried.consume();await tick();assert.equal(retried.prompts.length,1,'Unknown/error results do not permanently suppress a later verified encounter');
const shared=deferred();let sharedCalls=0;
const coalesced=fixture({verifyItem:()=>{sharedCalls++;return shared.promise;}});
coalesced.consume();coalesced.consume({type:'item-links',items:['Synthetic Missing Item +3']});assert.equal(sharedCalls,1);
shared.resolve({status:'missing'});await tick();assert.equal(coalesced.prompts.length,1);

let boundedCalls=0;const gates=[];
const bounded=fixture({verifyItem:()=>{boundedCalls++;const gate=deferred();gates.push(gate);return gate.promise;}});
for(let i=0;i<25;i++)bounded.consume({type:'loot',item:'Synthetic Bounded Item '+i});
assert.equal(boundedCalls,20,'Renderer verification reservations are bounded before native requests');
for(const gate of gates)gate.resolve({status:'missing'});await tick();assert.equal(bounded.prompts.length,20);

let deliveries=0;
const deferredHost=fixture({verifyItem:()=>({status:'missing'}),onMissing:async()=>{deliveries++;return{ok:true,suppressed:true,deferred:true};}});
deferredHost.consume();await tick();assert.equal(deferredHost.discovery.snapshot().pending.length,0);
deferredHost.consume();await tick();assert.equal(deliveries,2,'A native recheck that becomes unverified permits a later retry');
console.log('Discovery item existence: local positives without reads, chat/loot gates, confirmed missing only, partial caches, cancellation/log generations, expiry/suppression, retries and bounded queues passed.');
