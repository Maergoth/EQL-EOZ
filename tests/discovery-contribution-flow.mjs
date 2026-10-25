import assert from 'node:assert/strict';
import { createDiscoveryContributionFlow, discoveryItemIdentity } from '../app/discovery-contribution-flow.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve};};
const item = (id='one',captureRequest='capture-1') => ({id,purpose:'item-link',name:'Thornstinger +5',captureRequest});
const spawn = (id='spawn-npc',captureRequest='capture-1') => ({id,purpose:'spawn-location',name:'A synthetic rat',candidateId:'npc',captureRequest});
const capture = {phase:'running',owner:'contribution',sessionId:'session-one',generation:7,source:{id:'window:game'}};
function fixture(begin = async request => ({ok:true,capture,requestId:request.id})) {
    let at=10000; const starts=[],stops=[],statuses=[],dismissed=[];
    const flow=createDiscoveryContributionFlow({now:()=>at,begin:request=>{starts.push(request);return begin(request);},cancel:request=>{stops.push(request);},status:async value=>{statuses.push(value);return {ok:true};},dismiss:value=>dismissed.push(value)});
    const observation = (overrides={}) => ({kind:'ocr',owner:'contribution',sessionId:capture.sessionId,capturedAt:new Date(at).toISOString(),subject:{kind:'item',name:'Thornstinger'},parser:{name:'item-examine'},input:{captureGeneration:capture.generation,sourceId:capture.source.id},...overrides});
    return {flow,starts,stops,statuses,dismissed,observation,setNow:value=>{at=value;}};
}
assert.equal(discoveryItemIdentity('THORNSTINGER (Exaltation) +5'),'thornstinger');
assert.equal(discoveryItemIdentity('Thornstinger +5 (Exaltation)'),'thornstinger');
{
    const f=fixture(); await f.flow.request(item());
    for(const observation of [f.observation({kind:'manual'}),f.observation({owner:'character'}),f.observation({parser:{name:'manual-text'}}),f.observation({capturedAt:new Date(9999).toISOString()}),f.observation({capturedAt:new Date(10001).toISOString()}),f.observation({sessionId:'old'}),f.observation({input:{captureGeneration:6,sourceId:capture.source.id}}),f.observation({input:{captureGeneration:7,sourceId:'screen:other'}}),f.observation({subject:{kind:'item',name:'Earthshaker'}})])assert.equal(f.flow.recordItem(observation),false);
    assert.equal(f.statuses.length,0,'unrelated, manual, old and mismatched evidence never completes a prompt');
    assert.equal(f.flow.recordItem(f.observation()),true);f.flow.recordItem(f.observation()); await tick();
    assert.equal(f.statuses.length,1,'a matched reading completes once');
    assert.equal(f.statuses[0].matchedName,'Thornstinger');assert.equal(f.statuses[0].status,'captured');
    assert.equal(f.stops[0].completed,true);assert.equal(f.flow.snapshot().length,0);
}
{
    const pending=deferred(),f=fixture(()=>pending.promise);const work=f.flow.request(item());
    f.flow.recordItem(f.observation());assert.equal(f.statuses.length,0);
    pending.resolve({ok:true,capture});await work;await tick();assert.equal(f.statuses.length,1,'first frame waits for native capture proof');
}
{
    const pending=deferred(),f=fixture(()=>pending.promise);const work=f.flow.request(item());
    await f.flow.cancel(item());pending.resolve({ok:true,capture});await work;
    f.flow.recordItem(f.observation());await tick();assert.equal(f.statuses.length,0,'dismissal cancels an in-flight reader start');
}
{
    const f=fixture(async()=>({ok:true,needsSource:true}));await f.flow.request(item());
    f.flow.recordItem(f.observation());assert.equal(f.statuses.length,0,'source picker remains waiting');
    f.flow.ready(item(),{ok:true,capture});await tick();assert.equal(f.statuses.length,1,'explicit source Start can finish the same request');
}
{
    const f=fixture();await f.flow.request(item());await f.flow.request(item('one','capture-2'));
    await f.flow.cancel(item());assert.equal(f.flow.snapshot()[0].captureRequest,'capture-2','late dismissal cannot cancel a retry');
    f.flow.ready(item(),{ok:false,error:'old failure'});await tick();assert.equal(f.statuses.length,0);
    f.flow.recordItem(f.observation());await tick();assert.equal(f.statuses[0].captureRequest,'capture-2');
}
{
    const f=fixture(async()=>({ok:false,error:'Finish Character capture first.'}));await f.flow.request(item());await tick();
    assert.equal(f.statuses[0].status,'retry');assert.match(f.statuses[0].message,/Character/);assert.equal(f.stops.length,1);
}
{
    const f=fixture();assert.equal(f.flow.recordLocation({candidateId:'npc'}),false,'automatic /loc is not explicit contribution completion');
    await f.flow.request(spawn());assert.equal(f.flow.recordLocation({candidateId:'other'}),false);
    assert.equal(f.flow.recordLocation({candidateId:'npc'}),true);await tick();
    assert.equal(f.statuses[0].candidateId,'npc');assert.equal(f.statuses[0].status,'captured');
    await f.flow.request(spawn('spawn-new','capture-2'));await f.flow.cancel(spawn('spawn-new','capture-2'));
    assert.equal(f.flow.recordLocation({candidateId:'npc'}),false,'dismissed spawn request cannot go green');
}
{
    const f=fixture();await f.flow.request(item());await f.flow.request(spawn());
    await f.flow.cancelWhere(request=>request.purpose==='spawn-location',{close:true});
    assert.equal(f.dismissed.length,1);assert.equal(f.flow.snapshot()[0].purpose,'item-link');
    await f.flow.dispose();assert.equal(f.dismissed.length,2);assert.equal(f.flow.snapshot().length,0);
    assert.equal((await f.flow.request(item('closed','capture-9'))).ok,false);
}
{
    let cancelled=0; const statuses=[];
    const flow=createDiscoveryContributionFlow({now:()=>10000,begin:async()=>({ok:true,capture}),cancel:()=>cancelled++,status:async value=>{statuses.push(value);if(value.status==='captured')throw Error('The notice was removed.');return {ok:true};}});
    await flow.request(item());flow.recordItem(fixture().observation());await tick();
    assert.deepEqual(statuses.map(value=>value.status),['captured','retry']);assert.equal(cancelled,1,'host failure still releases owned capture');
}
console.log('Discovery contribution flow: fresh reader proof, source selection, retries, spawn completion and cancellation passed.');
