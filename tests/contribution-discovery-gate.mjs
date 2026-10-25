import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createContributionDiscoveryGate} from '../app/contribution-discovery-gate.js';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
let clock=Date.now(),pack={meta:{version:'synthetic-1'},items:[],npcs:[],zones:[]};
const fact={type:'mob-zone',name:'A synthetic keeper',zone:'Synthetic Vale',instance:'normal',evidence:'kill'};
const candidate={id:'synthetic-discovery',kind:'npc',name:'A synthetic keeper',title:'A synthetic keeper',zone:'Synthetic Vale',instance:'normal',membership:'missing',intent:'create',reasons:['missing-page'],relations:[fact],sources:[],fields:{level:{value:42,confirmed:false},knownLoot:{value:['Unverified Gem'],confirmed:false}},status:'needs-review'};
const proof=(extra={})=>({state:'missing',reasons:['missing-page'],canonicalTitle:candidate.name,confirmedRelations:[fact],checkedAt:new Date(clock).toISOString(),...extra});

{
    const gate=createContributionDiscoveryGate({getPack:()=>pack,now:()=>clock});
    assert.equal(gate.project(candidate),null,'Old desktop or missing API cannot reveal automatic cache misses');
    assert.equal(gate.project({...candidate,manual:true}).name,candidate.name,'Explicit manual drafts remain accessible');
    assert(gate.project({...candidate,status:'partial',planId:'real-partial-review'}),'Truthful saved partial reviews remain accessible');
    assert.equal(gate.project({...candidate,planId:'prepared-only'}),null,'A prepared automatic plan is not a published-review exception');
    assert.equal(gate.project({...candidate,fields:{level:{value:42,confirmed:true}}}),null,'An automatically confirmed field is not manual authorization');
    gate.dispose();
}
{
    let calls=0;const pending=deferred(),gate=createContributionDiscoveryGate({verify:()=>{calls++;return pending.promise;},getPack:()=>pack,now:()=>clock});
    assert.equal(gate.project({...candidate,reasons:[]}),null);await tick();assert.equal(calls,0,'Cached positives cause no HTTP request');
    assert.equal(gate.project(candidate),null);assert.equal(gate.project(candidate),null);await tick();assert.equal(calls,1,'Pending identical requests deduplicate');
    pending.resolve(proof({reasons:['missing-page','missing-source'],confirmedRelations:[fact,{...fact,name:'Unverified other NPC'}]}));await tick();
    const shown=gate.project(candidate);assert.deepEqual(shown.reasons,['missing-page']);assert.deepEqual(shown.relations,[fact]);assert.equal(shown.fields.level.value,42,'Observed primary stats can accompany a verified new page');assert.deepEqual(shown.fields.knownLoot.value,[],'Unchecked related loot stays hidden');
    assert.equal(gate.project({...candidate,instance:'raid'}),null,'A result cannot authorize another instance');
    assert.equal(gate.project({...candidate,zone:'Other Vale'}),null,'A result cannot authorize another zone');
    clock+=60001;assert.equal(gate.project(candidate),null,'Expired proof hides the row before a new check finishes');gate.dispose();
}
for(const result of [{state:'covered'},{state:'unknown'},null,proof({checkedAt:new Date(clock-60001).toISOString()}),proof({reasons:'missing-page',confirmedRelations:{bad:true}})]){
    const gate=createContributionDiscoveryGate({verify:async()=>result,getPack:()=>pack,now:()=>clock});await gate.check(candidate);assert.equal(gate.project(candidate),null,'Covered, unavailable, malformed or stale proof stays invisible');gate.dispose();
}
{
    const gate=createContributionDiscoveryGate({verify:async()=>{throw Error('synthetic offline');},getPack:()=>pack,now:()=>clock});await gate.check(candidate);assert.equal(gate.project(candidate),null,'A failed live request never reveals a fallback cache miss');gate.dispose();
}
for(const mutate of [gate=>gate.clear(),()=>{pack={...pack,meta:{version:'synthetic-2'}};}]){
    const pending=deferred(),gate=createContributionDiscoveryGate({verify:()=>pending.promise,getPack:()=>pack,now:()=>clock});const checked=gate.check(candidate);await tick();mutate(gate);pending.resolve(proof());await checked;assert.equal(gate.project(candidate,{request:false}),null,'Source/dataset changes invalidate pending proof');gate.dispose();
}
{
    const first={type:'drop-source',name:'First keeper',item:'Synthetic Gem',zone:'Synthetic Vale',instance:'normal',evidence:'explicit-corpse'},second={...first,name:'Second keeper'};
    const item={...candidate,kind:'item',name:'Synthetic Gem',title:'Synthetic Gem',membership:'present',intent:'update',reasons:['missing-source','missing-population'],relations:[first,second],sources:[first,second].map(value=>({npc:value.name,zone:value.zone,instance:value.instance,sourceEvidence:value.evidence,confirmed:false})),fields:{knownNPCs:{value:['First keeper','Second keeper']}}};
    const before=structuredClone(item),gate=createContributionDiscoveryGate({verify:async()=>proof({canonicalTitle:item.name,reasons:['missing-source'],confirmedRelations:[first]}),getPack:()=>pack,now:()=>clock});await gate.check(item);
    const visible=gate.project(item);assert.deepEqual(visible.reasons,['missing-source']);assert.deepEqual(visible.relations,[first]);assert.equal(visible.sources.length,1);assert.equal(visible.sources[0].npc,'First keeper');assert.deepEqual(visible.fields.knownNPCs.value,[]);assert.deepEqual(item,before,'Filtering is an ephemeral view and preserves captured observations');gate.dispose();
    const unrelated={...first,item:'Another Gem'},wrong={...item,relations:[unrelated]},other=createContributionDiscoveryGate({verify:async()=>proof({canonicalTitle:item.name,reasons:['missing-source'],confirmedRelations:[unrelated]}),getPack:()=>pack,now:()=>clock});await other.check(wrong);assert.equal(other.project(wrong),null,'A confirmed fact for another primary item cannot expose this item or borrow its source');other.dispose();
}

const original={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window,discovery:globalThis.eyeOfZommDiscovery};
clock=Date.now();
async function workspace({verify,manual=false,seed=true,active=true,itemName='',instance='normal'}={},run){
    const dom=new JSDOM('<section class="view '+(active?'is-active':'')+'"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
    const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},pack={meta:{version:'synthetic-workspace',sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[{name:'Synthetic Vale'}],wikiEntities:{items:[],npcs:[],zones:['Synthetic Vale'],titles:['Synthetic Vale']}};
    const queue=createContributionQueue({storage,getPack:()=>pack}),draft=seed?queue.add(itemName?{kind:'item',name:itemName,zone:candidate.zone,instance,fields:{hp:12}}:{kind:'npc',name:candidate.name,zone:candidate.zone,instance,fields:{level:42},relations:[fact]},manual):null,shows=[],notices=[],navigations=[];
    globalThis.eyeOfZommDiscovery={show:async value=>{shows.push(value);return value;},action:async()=>({})};
    const wiki={status:async()=>({authenticated:false}),blueprints:async()=>({eras:[]}),onStatus:()=>()=>{},...(verify?{verifyDiscovery:verify}:{})};
    const view=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,inventory:null,share:null,getPack:()=>pack,notify:message=>notices.push(message),navigate:value=>navigations.push(value)});
    try{await run({dom,data,storage,pack,draft,view,shows,notices,navigations,rows:()=>[...dom.window.document.querySelectorAll('[data-candidate-id]')],editor:()=>dom.window.document.querySelector('[data-candidate-form]')});}finally{view.dispose();dom.window.close();Object.assign(globalThis,{FormData:original.FormData,document:original.document,window:original.window,eyeOfZommDiscovery:original.discovery});}
}
await workspace({},async({draft,view,rows,editor,navigations})=>{assert.equal(rows().length,0);assert.equal(editor(),null);view.openContribution(draft.id);assert.equal(editor(),null);assert.deepEqual(navigations,[],'A hidden legacy draft cannot be opened by its stale ID');});
await workspace({manual:true},async({rows,editor})=>{assert.equal(rows().length,1);assert(editor(),'Manual new-page creation works without live admission API');});
{
    const calls=[],raid=deferred();await workspace({itemName:'Synthetic Unknown Blade +4',instance:'unknown',verify:request=>{calls.push(request);return request.instance==='raid'?raid.promise:Promise.resolve(proof({canonicalTitle:request.name,confirmedRelations:[]}));}},async({dom,data,draft,rows,editor})=>{
        assert.equal(editor(),null);await tick();assert.equal(rows().length,1);assert(editor(),'Tier recovery can mount after unknown-instance item proof');assert.equal(editor().elements.raid.indeterminate,true,'Unknown instance has a visible mixed-state control');assert.match(editor().querySelector('[data-instance-unknown]').textContent,/Instance unconfirmed/);
        const saved=()=>JSON.parse(data.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.id===draft.id);
        assert.equal(saved().instance,'unknown','Rendering and recovery initialization never manufacture Normal');assert.equal(saved().fields.tier.value,4);assert.equal(calls.length,1,'Implicit form saving retains the exact proved projection');
        const stats=editor().querySelector('[data-field-key="statLines"] [data-field-value]');stats.value='HP: 14\nSV Void: 0';stats.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(saved().instance,'unknown');assert(editor());assert.equal(calls.length,1,'Editing stats does not silently select an instance');
        editor().elements.raid.checked=true;editor().elements.raid.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(editor(),null,'An explicit instance change hides the old proof immediately');assert.equal(saved().instance,'raid');await tick();assert.equal(calls.at(-1).instance,'raid');
        raid.resolve(proof({canonicalTitle:'Synthetic Unknown Blade',confirmedRelations:[]}));await tick();assert(editor());assert.equal(editor().elements.raid.checked,true);
        editor().elements.raid.checked=false;editor().elements.raid.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await tick();assert.equal(saved().instance,'normal','An explicit unchecked choice can select Normal');assert.equal(calls.at(-1).instance,'normal');assert(editor());
    });
}
{
    let calls=0;await workspace({active:false,verify:async()=>{calls++;return proof();}},async({view,dom,draft,rows,navigations})=>{
        await tick();view.refresh();await tick();assert.equal(calls,0,'Inactive background renders do not check persisted misses');assert.equal(rows().length,0);
        dom.window.document.querySelector('.view').classList.add('is-active');view.refresh();await tick();assert.equal(calls,1,'Opening Discoveries starts admission');assert.equal(rows().length,1);
        dom.window.document.querySelector('.view').classList.remove('is-active');view.cancelSource();view.refresh();await tick();assert.equal(calls,1,'Source reset and background refresh hide receipts without rechecking every saved row');
        view.openContribution(draft.id);await tick();assert.equal(calls,2,'An explicit request may check while the panel is closed');assert.deepEqual(navigations,['contribute']);
    });
}
{
    let calls=0,gate;gate=createContributionDiscoveryGate({getPack:()=>pack,freshnessMs:15,verify:async()=>{calls++;return proof({checkedAt:new Date().toISOString()});},onChange:()=>gate.project(candidate,{request:false})});await gate.check(candidate);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,1,'An inactive expiry callback hides the receipt without periodic network work');assert.equal(gate.project(candidate,{request:false}),null);gate.dispose();
}
for(const state of ['covered','unknown'])await workspace({verify:async()=>proof({state,reasons:[]})},async({rows,editor})=>{assert.equal(rows().length,0);await tick();assert.equal(rows().length,0);assert.equal(editor(),null);});
{
    const pending=deferred();await workspace({verify:()=>pending.promise},async({rows,editor})=>{assert.equal(rows().length,0);assert.equal(editor(),null);pending.resolve(proof());await tick();assert.equal(rows().length,1);assert.equal(editor().elements.name.value,candidate.name);assert.equal(editor().querySelector('[data-field-key="level"] input').value,'42');});
}
for(const outcome of ['missing','covered','unknown','failure','source-change','zone-change','projection-change']){
    const pending=deferred();await workspace({verify:()=>pending.promise,seed:false},async({view,rows,editor,shows,notices,data})=>{
        const at=Date.now(),context={live:true,at,zone:'Synthetic Vale',instance:'normal',logId:'synthetic-log',cursor:1},kill={type:'kill',victim:candidate.name,at};
        const result=view.consumeLog(kill,context);assert(result.prompt);assert.equal(rows().length,0);assert.equal(editor(),null);assert.deepEqual(shows,[]);assert.deepEqual(notices,[],'There is no immediate toast while lookup is pending');
        const location=view.consumeLog({type:'location',y:1,x:2,z:3,at:at+1000},{...context,at:at+1000,cursor:2});assert.equal(location.locationCaptured,null,'Pending proof cannot silently arm a /loc request');
        if(outcome==='source-change')view.cancelSource();
        if(outcome==='zone-change')view.consumeLog({type:'zone',zone:'Other Vale',at:at+2000},{...context,zone:'Other Vale',at:at+2000,cursor:3});
        if(outcome==='projection-change')view.consumeLog({...kill,at:at+2000},{...context,instance:'raid',at:at+2000,cursor:3});
        await tick();if(outcome==='failure')pending.reject(Error('offline'));else pending.resolve(proof({state:['covered','unknown'].includes(outcome)?outcome:'missing',reasons:['covered','unknown'].includes(outcome)?[]:['missing-page']}));await tick();await tick();
        if(outcome==='missing'){assert.equal(shows.length,1);assert.equal(notices.length,1);assert.equal(rows().length,1);assert(editor());const opened=await view.beginDiscoveryContribution({...shows[0],id:shows[0].id});assert.equal(opened.ok,true);assert.equal(JSON.parse(data.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.id===result.candidate.id).manual,true,'A fresh confirmed Contribute click promotes deliberate manual review');}
        else{assert.equal(shows.length,0,outcome+' cannot open a stale/unconfirmed prompt');assert.equal(notices.length,0,outcome+' cannot emit a fallback toast');if(['covered','unknown','failure'].includes(outcome))assert.equal(rows().length,0);}
        if(outcome==='unknown'){const opened=await view.beginDiscoveryContribution({id:'spawn-'+result.candidate.id,purpose:'spawn-location',candidateId:result.candidate.id,name:result.candidate.name});assert.equal(opened.ok,false);assert.notEqual(JSON.parse(data.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.id===result.candidate.id).manual,true,'An unknown or stale popup request cannot promote an automatic draft');}
        assert(data.get('eql-eye-of-zomm-contributions-v1'),'Hidden observations remain saved without exposing them');
    });
}
console.log('Discovery admission: pending/covered/unknown/failed/stale hidden, persisted queue and editor gated, manual/partial reviews preserved, confirmed facts only, exact source/dataset/instance lifetime and disarmed async spawn prompts passed.');
