import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs');
const account={id:7,name:'Fixture Observer'},requests=[];
const batch={schemaVersion:1,batchId:'batch_fixture_01',clientVersion:'fixture',events:[{id:'event_fixture_01',kind:'loot',observedAt:'2026-10-24T10:00:00Z',item:'Synthetic relic'}]};
let alter=x=>x,network=false;
const client=new WikiClient({fetchImpl:async(url,init={})=>{
 const params=init.method==='POST'?new URLSearchParams(init.body):new URL(url).searchParams;requests.push(Object.fromEntries(params));
 let data;if(params.get('meta')==='userinfo')data={query:{userinfo:{...account,rights:['edit','createpage']}}};
 else if(params.get('meta')==='tokens')data={query:{tokens:{csrftoken:'PRIVATE-TOKEN'}}};
 else {assert.equal(params.get('action'),'eozobservations');assert.equal(params.get('token'),'PRIVATE-TOKEN');assert.equal(params.get('assert'),'user');assert.equal(params.get('assertuser'),account.name);assert.equal(init.method,'POST');
 if(network)throw Error('fixture response lost');
 data={eozobservations:alter(params.get('operation')==='status'?{schemaVersion:1,enabled:false,available:false,account,limits:{events:100,bytes:262144,eventBytes:4096,hourlyBatches:12}}:{schemaVersion:1,batchId:batch.batchId,account,accepted:[batch.events[0].id],duplicates:[],conflicts:[],rejected:[],receivedAt:'2026-10-24T10:00:01Z'})};}
 return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
}});
assert.equal((await client.observationStatus()).enabled,false);
assert.deepEqual((await client.submitObservations(batch,{expectedUser:account})).accepted,[batch.events[0].id]);
for(const change of [x=>({...x,batchId:'another_batch'}),x=>({...x,account:{id:8,name:'Other'}}),x=>({...x,accepted:[]}),x=>({...x,duplicates:x.accepted}),x=>({...x,accepted:['foreign_event']}),x=>({...x,accepted:[],rejected:[{id:batch.events[0].id}]})]){alter=change;await assert.rejects(client.submitObservations(batch,{expectedUser:account}),e=>e.code==='observation-ack');}
alter=x=>({...x,duplicates:x.accepted,accepted:[]});assert.deepEqual((await client.submitObservations(batch)).duplicates,[batch.events[0].id]);
alter=x=>({...x,rejected:[{id:batch.events[0].id,code:'capacity'}],accepted:[]});assert.equal((await client.submitObservations(batch)).rejected[0].code,'capacity');
alter=x=>x;network=true;await assert.rejects(client.submitObservations(batch),e=>e.code==='unknown-write');network=false;
const before=requests.length;await assert.rejects(client.submitObservations({...batch,events:[...batch.events,...batch.events]}),/unique/);assert.equal(requests.length,before);
await assert.rejects(client.submitObservations(batch,{expectedUser:{id:9,name:'Changed'}}),/account changed/);
assert(requests.filter(r=>r.action==='eozobservations').every(r=>r.assertuser===account.name));
console.log('Wiki observation transport: named-session CSRF/assertions, capability, exhaustive/account-bound ACK, safe unknown retry and duplicate-ID rejection passed.');
