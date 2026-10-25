import assert from 'node:assert/strict';
import {createAutomaticItemContribution} from '../app/automatic-item-contribution.js';
const candidate={id:'synthetic-item'},observation={input:{captureEvidence:{token:'synthetic'}}};
const deferred=()=>{let resolve;return{promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
function fixture({gate=null,defer=false,fail=false}={}){
    let valid=true;const calls={prepare:[],submit:[],cancel:[],plan:[],result:[],deferred:[],errors:[],busy:[]};
    const plan={id:'synthetic-plan',reviewDigest:'synthetic-digest',status:'prepared'};
    const flow=createAutomaticItemContribution({prepare:async input=>{calls.prepare.push(input);if(gate)await gate.promise;if(fail)throw Error('Synthetic native failure');return defer?{ok:false,deferred:true,reason:'Possible existing page'}:{ok:true,plan};},submit:async input=>{calls.submit.push(input);return{ok:true,plan:{...plan,status:'submitted'}};},cancel:async input=>{calls.cancel.push(input);},onBusy:value=>calls.busy.push(value),onPlan:(item,value)=>calls.plan.push(value),onResult:(item,value)=>calls.result.push(value),onDeferred:(item,reason)=>calls.deferred.push(reason),onError:(item,error)=>calls.errors.push(error.message)});
    return{flow,calls,attempt:()=>flow.attempt({candidate,observation,isCurrent:()=>valid}),invalidate:()=>{valid=false;}};
}
let f=fixture();assert.equal(await f.attempt(),true);assert.equal(f.calls.submit.length,1);assert.equal(f.calls.result[0].status,'submitted');assert.equal(await f.attempt(),false);assert.equal(f.calls.prepare.length,1,'A candidate is attempted once per controller lifetime');
for(const cancel of [false,true]){const gate=deferred();f=fixture({gate});const pending=f.attempt();if(cancel)f.flow.cancel();else f.invalidate();gate.resolve();assert.equal(await pending,false);assert.equal(f.calls.submit.length,0);assert.deepEqual(f.calls.cancel,[{planId:'synthetic-plan'}],'A preparation that finishes after cancellation is revoked before submit');}
f=fixture({defer:true});assert.equal(await f.attempt(),false);assert.equal(f.calls.submit.length,0);assert.equal(f.calls.deferred.length,1);assert.equal(await f.attempt(),false,'Duplicate/incomplete checks do not run every frame');
f=fixture({fail:true});assert.equal(await f.attempt(),false);assert.equal(f.calls.submit.length,0);assert.equal(f.calls.errors.length,1);assert.deepEqual(f.calls.busy,[true,false]);
console.log('Automatic item controller: native two-phase handoff, cancellation, deferral and no repeat passed.');
{
    let notices=0;const flow=createAutomaticItemContribution({prepare:async()=>({ok:true,plan:{id:'opted-out',reviewDigest:'native-proof'}}),submit:async()=>({ok:false,skipped:true,plan:{id:'opted-out',status:'opted-out',automaticOptOut:{reason:'authored-various'}}}),onDeferred:()=>notices++,onError:()=>notices++});
    assert.equal(await flow.attempt({candidate:{id:'opted-out-item'},observation,isCurrent:()=>true}),false);assert.equal(notices,0,'An intentional automatic opt-out creates no attention notification');
}
