// Shared mounted-browser scenario; all observations, storage and wiki replies
// are synthetic. This module is test code, never part of the app bundle.
export async function discoveryQueueStabilityScenario({document,mountCaptureWorkspace,assert,onPending=async()=>{}}){
    const flush=async()=>{for(let index=0;index<16;index++)await Promise.resolve();};
    const saved={dateNow:Date.now,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
    let at=1770000000000,sequence=0;const timers=new Map(),checks=[],values=new Map(),calls={prepare:0,submit:0};
    Date.now=()=>at;
    globalThis.setTimeout=(callback,delay,...args)=>{if(delay>=15000&&delay<=60001){const timer={unref(){}};timers.set(timer,{at:at+delay,callback:()=>callback(...args)});return timer;}return saved.setTimeout.call(globalThis,callback,delay,...args);};
    globalThis.clearTimeout=timer=>{if(!timers.delete(timer))saved.clearTimeout.call(globalThis,timer);};
    let pack={meta:{schemaVersion:3,version:'stable-list',sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],titles:[]}};
    const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const wiki={status:async()=>({authenticated:false}),onStatus:()=>()=>{},blueprints:async()=>({eras:['Classic Era']}),matches:async()=>({matches:[]}),verifyDiscovery:request=>new Promise((resolve,reject)=>checks.push({request,resolve,reject})),preparePlan:async()=>{calls.prepare++;throw Error('No plan should use stale proof');},submitPlan:async()=>{calls.submit++;throw Error('No synthetic publication');}};
    const capture={status:async()=>({readingEnabled:false,enabled:false,phase:'disabled'}),read:async()=>({records:[],lastSequence:0}),onStatus:()=>()=>{},onObservation:()=>()=>{}};
    const view=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture,share:null,inventory:null,getPack:()=>pack});
    const row=name=>[...document.querySelectorAll('[data-contribution-row-id]')].find(node=>node.querySelector('strong')?.textContent===name);
    const add=name=>view.consumeLog({type:'item-links',items:[name],at},{live:true,at,cursor:++sequence,logId:'stable-log'});
    const answer=(entry,state='missing')=>entry.resolve({state,canonicalTitle:entry.request.name,checkedAt:new Date(at).toISOString(),reasons:state==='missing'?entry.request.reasons:[],confirmedRelations:state==='missing'?entry.request.relations:[]});
    const advance=async ms=>{at+=ms;for(const [id,timer] of [...timers])if(timer.at<=at){timers.delete(id);timer.callback();}await flush();};
    try{
        await flush();view.refresh();await flush();
        for(const name of ['Stable Amber','Stable Bronze','Stable Copper'])add(name);
        await flush();assert(document.querySelectorAll('[data-contribution-row-id]').length===0,'Never-verified discoveries remain hidden');
        for(const check of checks.slice())answer(check);await flush();
        const amber=row('Stable Amber'),bronze=row('Stable Bronze'),copper=row('Stable Copper'),list=document.querySelector('[data-contribution-list]'),filter=document.querySelector('[data-gap-filter="new-item"]');
        assert(amber&&bronze&&copper,'Three independently verified rows are displayed');
        assert(document.querySelector('[data-queue-position]').textContent==='1 / 3','Incremental admission updates editor navigation without remounting');
        const form=document.querySelector('[data-candidate-form]'),note=form.querySelector('[name=playerText]');note.value='Keep my saved draft';note.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
        const details=form.querySelector('details');if(details)details.open=true;
        list.style.maxHeight='90px';list.style.overflow='auto';list.parentElement.style.maxHeight='250px';list.parentElement.style.minHeight='0px';list.parentElement.style.overflow='auto';
        const button=bronze.querySelector('[data-candidate-id]');button.focus();list.scrollTop=47;list.parentElement.scrollTop=31;
        const scrollPosition={list:list.scrollTop,sidebar:list.parentElement.scrollTop};
        const mutations=[],observer=new document.defaultView.MutationObserver(records=>mutations.push(...records));observer.observe(list,{subtree:true,childList:true,attributes:true,characterData:true});observer.observe(filter.parentElement.parentElement,{subtree:true,childList:true,attributes:true,characterData:true});
        for(let index=0;index<12;index++){view.refresh();add('Stable Amber');}await flush();
        assert(row('Stable Amber')===amber&&row('Stable Bronze')===bronze&&row('Stable Copper')===copper,'Equivalent refreshes keep actual row elements');
        assert(document.activeElement===button&&document.querySelector('[data-candidate-form]')===form,'List keyboard focus and active editor are unchanged');
        assert(mutations.length===0,'Equivalent background refreshes perform zero list/filter DOM mutations');
        assert(list.scrollTop===scrollPosition.list&&list.parentElement.scrollTop===scrollPosition.sidebar,'List and sidebar scroll remain stable: '+JSON.stringify({before:scrollPosition,after:{list:list.scrollTop,sidebar:list.parentElement.scrollTop}}));
        filter.focus();for(let index=0;index<5;index++)view.refresh();await flush();assert(document.activeElement===filter,'Filter focus survives refreshes');button.focus();
        // The actual app returns its stable pack directly. A positive live-entry
        // overlay can replace that wrapper without changing the base dataset.
        const wrapperChecks=checks.length;pack={...pack,meta:{...pack.meta}};view.refresh();await flush();
        assert(row('Stable Amber')===amber&&row('Stable Bronze')===bronze&&document.querySelector('[data-candidate-form]')===form,'An equivalent pack wrapper does not withdraw visible discoveries');
        assert(document.querySelector('[data-prepare-contribution]').disabled,'Pack wrapper changes still invalidate action proof');
        for(const check of checks.slice(wrapperChecks))answer(check);await flush();
        assert(document.querySelector('[data-candidate-form]')===form,'Fresh wrapper proof renews the same active form');
        const firstRenewal=checks.length;await advance(60001);
        assert(checks.length===firstRenewal+3,'Expired proof starts one coalesced renewal per identity');
        assert(row('Stable Amber')===amber&&row('Stable Bronze')===bronze&&row('Stable Copper')===copper,'All already-verified rows remain during pending proof');
        assert(document.querySelector('[data-candidate-form]')===form&&document.activeElement===button,'Pending proof retains editor and row focus');
        assert(document.querySelector('[data-prepare-contribution]').disabled,'Retained display rows do not authorize Preview');
        await onPending();
        for(const check of checks.slice(firstRenewal))check.reject(Error('Synthetic unavailable'));await flush();
        assert(row('Stable Bronze')===bronze&&document.querySelector('[data-candidate-form]')===form,'Unavailable proof does not empty and repopulate the list');
        assert(document.querySelector('[data-prepare-contribution]').disabled,'Unavailable proof cannot authorize Preview');
        // Selecting a previously verified non-active row while its check is
        // unavailable is local review only, not a new missing-fact admission.
        button.click();await flush();assert(document.querySelector('[data-candidate-form] h2').textContent==='Stable Bronze','A retained row remains selectable for local review');assert(document.querySelector('[data-prepare-contribution]').disabled,'Selecting a retained row cannot bypass proof');
        const bronzeForm=document.querySelector('[data-candidate-form]');
        const newCandidate=add('Stable Diamond');await flush();assert(!row('Stable Diamond'),'A genuinely new row still waits for proof');answer(checks.at(-1));await flush();
        assert(row('Stable Diamond')&&row('Stable Bronze')===bronze&&row('Stable Copper')===copper,'A newly proved row appends without replacing existing rows');
        assert(document.querySelector('[data-candidate-form]')===bronzeForm,'New discoveries do not steal the selected draft');
        await advance(15001);view.refresh();await flush();const renewal=checks.filter(check=>!checks.slice(0,firstRenewal+3).includes(check)&&check.request.name!=='Stable Diamond');
        for(const check of renewal)answer(check,check.request.name==='Stable Amber'?'covered':'missing');await flush();
        assert(!row('Stable Amber')&&row('Stable Bronze')===bronze&&row('Stable Copper')===copper,'A genuinely covered result removes only its own row');
        assert(document.querySelector('[data-candidate-form]')===bronzeForm,'Unrelated covered retirement preserves the selected editor');
        assert(document.querySelector('[data-queue-position]').textContent==='1 / 3','Covered retirement updates the current navigation position');
        assert(document.querySelector('[data-prepare-contribution]').disabled===false,'Fresh missing proof restores normal Preview eligibility');
        assert(JSON.parse(values.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.name==='Stable Amber').playerText==='Keep my saved draft','Covered retirement preserves the saved draft');
        const remove= row('Stable Diamond').querySelector('[data-dismiss-discovery]');remove.click();await flush();assert(!row('Stable Diamond')&&row('Stable Bronze')===bronze,'Dismiss removes only the requested row');
        document.querySelector('[data-candidate-next]').click();await flush();assert(document.querySelector('[data-candidate-form] h2').textContent==='Stable Copper','Next uses the current incremental row order');
        const copperNote=document.querySelector('[name=playerText]');copperNote.value='Preserve a locally covered draft';copperNote.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
        pack={...pack,items:[{name:'Stable Copper',wikiTitle:'Stable Copper'}],wikiEntities:{...pack.wikiEntities,items:['Stable Copper']}};view.refresh();await flush();
        assert(!row('Stable Copper')&&row('Stable Bronze')===bronze,'New positive local facts retire a covered gap without withdrawing unrelated rows');
        assert(document.querySelector('[data-candidate-form]')===null,'A covered edited draft cannot keep a stale active lease');
        assert(JSON.parse(values.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.name==='Stable Copper').playerText==='Preserve a locally covered draft','Local coverage preserves edited saved work');
        observer.disconnect();
        view.cancelSource();await flush();assert(document.querySelectorAll('[data-contribution-row-id]').length===0&&document.querySelector('[data-candidate-form]')===null,'Source reset retires all old display receipts');
        view.refresh();await flush();for(const check of checks.slice(-3))answer(check);await flush();
        assert(row('Stable Bronze'),'New source proof can admit stored rows again');
        pack={...pack,meta:{...pack.meta,version:'stable-list-new-pack'}};view.refresh();await flush();assert(document.querySelectorAll('[data-contribution-row-id]').length===0,'A new dataset invalidates retained old proof');
        return{verifiedRows:3,unchangedRefreshes:17,pendingAndUnavailableStable:true,equivalentPackWrapperStable:true,selectableReviewOnly:true,newRowsRequireProof:true,coveredRetiresOnlyAffected:true,sourceAndPackInvalidate:true,calls};
    }finally{view.dispose();Date.now=saved.dateNow;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;}
}
