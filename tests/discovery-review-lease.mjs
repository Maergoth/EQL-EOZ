import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=async()=>{for(let index=0;index<16;index++)await Promise.resolve();};
async function fixture(){
    const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
    dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
    const saved={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,dateNow:Date.now};
    Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
    let at=1770000000000,sequence=0,listener;const timers=new Map();
    Date.now=()=>at;
    globalThis.setTimeout=(callback,delay,...args)=>{if(delay>=15000&&delay<=60001){const timer={unref(){}};timers.set(timer,{at:at+delay,callback:()=>callback(...args)});return timer;}return saved.setTimeout(callback,delay,...args);};
    globalThis.clearTimeout=timer=>{if(!timers.delete(timer))saved.clearTimeout(timer);};
    let pack={meta:{schemaVersion:3,version:'lease-fixture',sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],titles:[]}};
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},checks=[],notices=[],calls={prepare:0,automatic:0,submit:0};
    const wiki={status:async()=>({authenticated:false}),onStatus:()=>()=>{},blueprints:async()=>({eras:['Classic Era']}),matches:async()=>({matches:[]}),
        verifyDiscovery:request=>{const task=deferred();checks.push({request,...task});return task.promise;},
        preparePlan:async()=>{calls.prepare++;return{id:'lease-plan',reviewDigest:'digest',status:'prepared',pages:[{id:'primary',title:'Lease Relic',operation:'create',status:'pending',beforeText:'',afterText:'Synthetic page'}],warnings:[],blockers:[],matches:{matches:[]}};},
        submitPlan:async()=>{calls.submit++;throw Error('Unexpected synthetic publish');},
        prepareCapturedItem:async()=>{calls.automatic++;return{ok:false,deferred:true,reason:'Synthetic review only'};},submitCapturedItem:async()=>({ok:false}),cancelCapturedItem:async()=>({ok:true})};
    const captureState={readingEnabled:true,enabled:true,phase:'running',owner:'contribution',sessionId:'lease-reader',source:{id:'window:game',label:'EverQuest Legends'},generation:2};
    const capture={status:async()=>captureState,read:async()=>({records:[],lastSequence:0}),onStatus:()=>()=>{},onObservation:callback=>{listener=callback;return()=>{};}};
    const view=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture,share:null,inventory:null,getPack:()=>pack,notify:message=>notices.push(message)});
    await flush();view.refresh();await flush();
    const document=dom.window.document;
    const add=(name='Lease Relic')=>view.consumeLog({type:'item-links',items:[name],at},{live:true,at,cursor:++sequence,logId:'lease-log'});
    const answer=(index,state='missing',canonicalTitle=checks[index].request.name)=>checks[index].resolve({state,canonicalTitle,checkedAt:new Date(at).toISOString(),reasons:state==='missing'?['missing-page']:[],confirmedRelations:[]});
    const advance=async ms=>{at+=ms;for(const [id,timer]of [...timers])if(timer.at<=at){timers.delete(id);timer.callback();}await flush();};
    return{view,document,checks,notices,calls,values,add,answer,advance,rows:()=>JSON.parse(values.get('eql-eye-of-zomm-contributions-v1')||'{"candidates":[]}').candidates,
        elapseWithoutTimers(ms){at+=ms;},
        setActive(active){document.getElementById('contribution-workspace').closest('.view').classList.toggle('is-active',active);view.refresh();},
        replacePack(){pack={...pack,meta:{...pack.meta,version:'lease-new-pack'}};view.refresh();},
        emit(){listener?.({id:'lease-ocr',kind:'ocr',owner:'contribution',parser:{name:'item-examine'},subject:{kind:'item',name:'Lease Relic'},sessionId:'lease-reader',capturedAt:new Date(at).toISOString(),input:{captureGeneration:2,sourceId:'window:game',captureEvidence:{token:'synthetic'}},fields:[{key:'hp',value:12}]});},
        dispose(){view.dispose();Date.now=saved.dateNow;Object.assign(globalThis,{FormData:saved.FormData,document:saved.document,window:saved.window,setTimeout:saved.setTimeout,clearTimeout:saved.clearTimeout});dom.window.close();}};
}
for(const reentry of ['history','view']){
    const f=await fixture();try{
        f.add();await flush();f.answer(0);await flush();const form=f.document.querySelector('[data-candidate-form]');
        const note=form.querySelector('[name=playerText]');note.value='Draft survives '+reentry;note.dispatchEvent(new f.document.defaultView.Event('input',{bubbles:true}));
        if(reentry==='history'){
            f.document.querySelector('[data-contribution-tab=history]').click();await flush();
            f.document.querySelector('[data-contribution-tab=discoveries]').click();
        }else{f.setActive(false);f.setActive(true);}
        await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),form);
        await f.advance(60001);assert.equal(f.checks.length,2);assert.equal(f.document.querySelector('[data-candidate-form]'),form,'Fresh '+reentry+' reentry reacquires the active editor lease');
        assert(f.document.querySelector('[data-prepare-contribution]').disabled);assert.equal(note.value,'Draft survives '+reentry);
    }finally{f.dispose();}
}
{
    const f=await fixture();try{
        f.add();await flush();f.answer(0);await flush();f.setActive(false);await f.advance(60001);f.setActive(true);await flush();
        assert.equal(f.document.querySelector('[data-candidate-form]'),null,'Reentry after expiry cannot mint a lease from an old missing receipt');
        f.answer(1);await flush();assert(f.document.querySelector('[data-candidate-form]'),'Fresh proof admits the candidate again');
    }finally{f.dispose();}
}
{
    const f=await fixture();try{
        f.add();await flush();f.answer(0,'missing','Canonical Lease Relic');await flush();const form=f.document.querySelector('[data-candidate-form]');
        const note=form.querySelector('[name=playerText]');note.value='Saved under verified canonical identity';note.dispatchEvent(new f.document.defaultView.Event('input',{bubbles:true}));
        assert.equal(f.rows()[0].title,'Canonical Lease Relic');await f.advance(60001);
        assert.equal(f.document.querySelector('[data-candidate-form]'),form,'Saving the verified canonical spelling renews the exact active lease signature');assert(f.document.querySelector('[data-prepare-contribution]').disabled);
    }finally{f.dispose();}
}
{
    const f=await fixture();try{
        f.add();await flush();f.answer(0);await flush();const title=f.document.querySelector('[name=title]');title.value='Different Unverified Relic';title.dispatchEvent(new f.document.defaultView.Event('input',{bubbles:true}));
        f.view.refresh();await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),null,'An unproved identity edit cannot renew the original lease');assert.equal(f.checks.length,2);
    }finally{f.dispose();}
}
{
    const f=await fixture();try{
        f.add();await flush();f.answer(0);await flush();f.document.querySelector('[data-candidate-form]').dispatchEvent(new f.document.defaultView.Event('submit',{bubbles:true,cancelable:true}));await flush();
        const confirmation=f.document.querySelector('[data-reviewed-plan]');confirmation.checked=true;confirmation.dispatchEvent(new f.document.defaultView.Event('change'));
        const publish=f.document.querySelector('[data-publish-plan]');assert.equal(publish.disabled,false);f.elapseWithoutTimers(60001);publish.click();await flush();
        assert.equal(f.calls.submit,0,'Delayed expiry timers cannot leave Publish authorized by an expired receipt');assert(publish.disabled);assert.equal(f.checks.length,2);
        assert(f.notices.some(message=>/fresh live wiki check before publishing/.test(message)));
    }finally{f.dispose();}
}
{
    const f=await fixture();try{
        f.add();await flush();assert.equal(f.checks.length,1);assert.equal(f.document.querySelector('[data-candidate-form]'),null,'Never-proved rows and editors stay hidden');
        f.answer(0);await flush();const form=f.document.querySelector('[data-candidate-form]');assert(form);const note=form.querySelector('[name=playerText]');note.value='Keep my exact saved draft';note.dispatchEvent(new f.document.defaultView.Event('input',{bubbles:true}));note.focus();note.setSelectionRange(5,9);const details=form.querySelector('details');if(details)details.open=true;
        await f.advance(60001);assert.equal(f.checks.length,2);assert.equal(f.document.querySelector('[data-candidate-form]'),form,'Expiry/pending must retain the actual editor nodes and selected draft');assert.equal(note.value,'Keep my exact saved draft');assert.equal(f.document.activeElement,note);assert.equal(note.selectionStart,5);assert.equal(note.selectionEnd,9);if(details)assert(details.open);assert(f.document.querySelector('[data-prepare-contribution]').disabled);assert.match(f.document.querySelector('[data-contribution-proof-status]').textContent,/Rechecking/);
        note.value='Still editable during recheck';note.dispatchEvent(new f.document.defaultView.Event('input',{bubbles:true}));assert.equal(f.rows()[0].playerText,'Still editable during recheck','Local draft edits remain durable without granting live proof');assert.equal(f.document.querySelector('[data-candidate-form]'),form);
        form.dispatchEvent(new f.document.defaultView.Event('submit',{bubbles:true,cancelable:true}));await flush();assert.equal(f.calls.prepare,0,'Programmatic submit cannot use a stale review lease');
        f.checks[1].reject(Error('Synthetic unavailable'));await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),form);assert.match(f.document.querySelector('[data-contribution-proof-status]').textContent,/unavailable/);assert(f.document.querySelector('[data-prepare-contribution]').disabled);
        await f.advance(15001);f.view.refresh();await flush();assert.equal(f.checks.length,3);f.answer(2);await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),form,'Fresh missing proof renews without remounting the edited form');assert.equal(f.document.querySelector('[data-prepare-contribution]').disabled,false);assert(f.document.querySelector('[data-contribution-proof-status]').hidden);
        await f.advance(60001);f.answer(3,'covered');await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),null,'A covered verdict retires the review lease');assert.equal(f.rows()[0].playerText,'Still editable during recheck','Coverage never deletes the saved draft');
    }finally{f.dispose();}
}
{
    const f=await fixture();try{f.add();await flush();f.answer(0);await flush();const form=f.document.querySelector('[data-candidate-form]');form.dispatchEvent(new f.document.defaultView.Event('submit',{bubbles:true,cancelable:true}));await flush();assert.equal(f.calls.prepare,1);const preparedForm=f.document.querySelector('[data-candidate-form]');const confirmation=f.document.querySelector('[data-reviewed-plan]');confirmation.checked=true;confirmation.dispatchEvent(new f.document.defaultView.Event('change'));assert.equal(f.document.querySelector('[data-publish-plan]').disabled,false);await f.advance(60001);assert.equal(f.document.querySelector('[data-candidate-form]'),preparedForm);assert(f.document.querySelector('[data-publish-plan]').disabled,'A previously prepared review also waits for fresh missing proof');f.answer(1);await flush();assert.equal(f.document.querySelector('[data-publish-plan]').disabled,false,'Fresh missing proof restores the existing reviewed plan without recreating it');}finally{f.dispose();}
}
for(const reset of ['source','pack']){
    const f=await fixture();try{f.add();await flush();f.answer(0);await flush();assert(f.document.querySelector('[data-candidate-form]'));await f.advance(60001);if(reset==='source')f.view.cancelSource();else f.replacePack();await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),null,reset+' invalidates the old review lease');f.answer(1);await flush();assert.equal(f.document.querySelector('[data-candidate-form]'),null,'Late old proof cannot restore '+reset+' lease');}finally{f.dispose();}
}
{
    const f=await fixture();try{f.add();await flush();f.answer(0);await flush();await f.advance(60001);f.emit();await flush();assert.equal(f.calls.automatic,0,'Automatic publication never uses a review-only lease');assert.equal(f.rows()[0].fields.hp,undefined,'Stale proof does not admit additional OCR proposals');}finally{f.dispose();}
}
console.log('Mounted discovery review lease: initial invisibility, exact editor/focus/draft retention, pending/error disable, fresh renewal/reentry/canonical identity, covered retirement, source/pack cancellation and preview/publication guards passed.');
