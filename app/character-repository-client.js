import {CHARACTER_STORAGE_KEY,createCharacterModel,normalizeCharacterCandidate} from './character-model.js';
import {CHARACTER_WALKTHROUGH_KEY,createCharacterWalkthrough} from './character-walkthrough.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const fail=result=>{if(!result?.ok)throw Error(result?.error||'Character storage did not confirm this operation.');return result;};
const readOnlyModel=new Set(['snapshot','totals','lookupObservation']);
const readOnlyFlow=new Set(['snapshot','acceptsStats','acceptsItem','acceptsReplayItem','syncCapture']);
const changedFields=(previous,current)=>Object.fromEntries(Object.entries(current||{}).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous?.[key])));
const stripCore=snapshot=>{
    const {candidates,...core}=snapshot;
    if(core.inventoryExport){const {candidateIds,keyring,rejectedItems,...metadata}=core.inventoryExport;core.inventoryExport=metadata;}
    return core;
};

/** A bounded renderer projection, never the full private inventory. Native
 * transactions own durability; each write is serial/CAS and an explicit flush
 * is required before sharing, importing or changing the selected character. */
export function createCharacterRepositoryClient({api,legacyStorage=globalThis.localStorage,onChange=()=>{},onWarning=()=>{},id=()=>globalThis.crypto.randomUUID()}={}){
    let profileId='draft',revision=0,generation=0,epoch=0,mutationEpoch=0,ready=false,disposed=false,error='',loading=false,closing=false;
    let profiles=[],counts={total:0,candidates:0,equipped:0,loose:0,keyring:0,rejected:0},core={},flow=null;
    let equipment=new Map(),page=new Map(),selected=null,pageResult=null,actual,walkthrough,staged=new Map(),queued=false,active=null;
    let acknowledged=null,waiters=[],job=null,importDone=null,cancelRequested=false,lastQuery={scope:'loose',limit:50},earlyProgress=[],duplicates=new Map();
    const contextKey=()=>`${profileId}:${epoch}:${generation}:${revision}`;
    const changed=()=>{if(!disposed)onChange({ready,loading,pending:queued||Boolean(active),error,profileId,revision,generation,counts:{...counts}});};
    const warn=message=>{try{onWarning(message);}catch{/* A warning is not persistence. */}};
    const storage={getItem:key=>staged.get(key)||null,setItem:(key,value)=>staged.set(key,value),removeItem:key=>staged.delete(key)};
    function rebuild(snapshot=null,flowSnapshot=flow){
        const cards=new Map([...equipment,...page]);if(selected)cards.set(selected.id,selected);
        const projection=snapshot||{...core,schemaVersion:1,candidates:[...cards.values()]};
        staged=new Map([[CHARACTER_STORAGE_KEY,JSON.stringify(projection)]]);
        if(flowSnapshot)staged.set(CHARACTER_WALKTHROUGH_KEY,JSON.stringify(flowSnapshot));
        actual=createCharacterModel({storage,workingSet:true,id,onWarning:warn});
        walkthrough=createCharacterWalkthrough({storage,onWarning:warn,id});
    }
    rebuild();
    const state=()=>({snapshot:actual.snapshot(),flow:walkthrough.snapshot()});
    function enqueue(){if(!ready||disposed||loading)return;mutationEpoch++;queued=true;changed();queueMicrotask(()=>void drain());}
    const model=new Proxy({}, {get(_target,key){const method=actual[key];if(typeof method!=='function')return method;return(...args)=>{
        if(readOnlyModel.has(key))return method(...args);
        if(!ready||loading||error||closing)return {ok:false,saved:false,error:error||(closing?'Character storage is closing.':'Character storage is loading.')};
        if(key==='reconcileCatalog'){
            if(queued||active)return {ok:true,saved:false};
            const result=method(...args);acknowledged=state();return {...result,saved:false};
        }
        if(['applyInventoryExport','applyAchievementExport','applyCharacterExports'].includes(key))return {ok:false,saved:false,error:'Import inventory files through the desktop repository.'};
        const result=method(...args);if(result?.ok!==false){if(key==='clearInventory'||key==='reset')clearRequested=true;if(key==='duplicateCandidate'&&result.candidate)duplicates.set(result.candidate.id,args[0]);enqueue();}
        return result&&typeof result==='object'?{...result,saved:false,pending:result.ok!==false}:result;
    };}});
    const flowModel=new Proxy({}, {get(_target,key){const method=walkthrough[key];if(typeof method!=='function')return method;return(...args)=>{
        if(!readOnlyFlow.has(key)&&(!ready||loading||error||closing))throw Error(error||(closing?'Character storage is closing.':'Character storage is loading.'));
        const result=method(...args);if(!readOnlyFlow.has(key))enqueue();return result;
    };}});
    let clearRequested=false;
    async function readItem(itemId,target=profileId,expectedRevision=revision,expectedGeneration=generation){
        const response=fail(await api.get({profileId:target,id:itemId}));
        if(response.revision!==undefined&&response.revision!==expectedRevision||response.generation!==undefined&&response.generation!==expectedGeneration)throw Error('The inventory item changed while loading.');
        if(response.kind&&response.kind!=='card')throw Error('This export row is not an equipment item.');
        if(!response.large){const value=response.item||response.card;if(!value||value.id!==itemId)throw Error('The inventory item identity could not be verified.');return normalizeCharacterCandidate(value);}
        if(!Number.isSafeInteger(response.totalBytes)||response.totalBytes<1||response.totalBytes>8*1024*1024||typeof api.getChunk!=='function')throw Error('This saved inventory item could not be read safely.');
        let offset=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
        while(offset<response.totalBytes){
            const part=fail(await api.getChunk({profileId:target,id:itemId,revision:expectedRevision,generation:expectedGeneration,offset,length:Math.min(524288,response.totalBytes-offset)}));
            if(part.revision!==expectedRevision||part.generation!==expectedGeneration||part.totalBytes!==response.totalBytes)throw Error('The saved item changed during its bounded read.');
            const chunk=part.bytes instanceof Uint8Array?part.bytes:new Uint8Array(part.bytes);
            if(!chunk.length||chunk.length>524288||offset+chunk.length>response.totalBytes||part.nextOffset!==offset+chunk.length)throw Error('The saved item returned an invalid chunk.');
            offset=part.nextOffset;text+=decoder.decode(chunk,{stream:offset<response.totalBytes});
        }
        const value=JSON.parse(text);if(value?.id!==itemId)throw Error('The saved item identity changed.');return normalizeCharacterCandidate(value);
    }
    async function equippedRows(target,key,expectedRevision){
        const rows=new Map();let cursor;const seen=new Set();
        do{const result=fail(await api.list({profileId:target,generation:key,revision:expectedRevision,scope:'equipped',cursor,limit:24}));
            if(result.generation!==key||result.revision!==expectedRevision)throw Error('The equipped inventory changed while loading.');
            for(const card of result.items||[]){if(result.kinds?.[card.id]&&result.kinds[card.id]!=='card')throw Error('Equipment returned an unsupported row.');rows.set(card.id,card.repositoryLarge?await readItem(card.id,target,result.revision,key):normalizeCharacterCandidate(card));}
            if(rows.size>48)throw Error('The equipment layout exceeds its supported slots.');
            cursor=result.nextCursor;if(cursor){if(seen.has(cursor))throw Error('Equipment paging repeated a cursor.');seen.add(cursor);}
        }while(cursor);return rows;
    }
    async function accept(result,token,{clearPage=true}={}){
        fail(result);const target=result.profileId||profileId,newGeneration=result.generation??generation;
        const rows=await equippedRows(target,newGeneration,result.revision);
        if(disposed||token!==epoch)return false;
        profileId=target;revision=result.revision;generation=newGeneration;core=stripCore(clone(result.core||{}));flow=clone(result.flow||null);counts={...counts,...result.counts};equipment=rows;
        if(clearPage){page.clear();selected=null;pageResult=null;}
        rebuild();acknowledged=state();return true;
    }
    async function drain(){
        if(active||!queued||disposed)return;
        queued=false;const token=epoch,before=acknowledged,next=state(),clearing=clearRequested;clearRequested=false;
        const prior=new Map((before?.snapshot.candidates||[]).map(card=>[card.id,card]));
        const nextMap=new Map(next.snapshot.candidates.map(card=>[card.id,card]));
        const changedCards=clearing?[]:[...nextMap.values()].filter(card=>!prior.has(card.id)||JSON.stringify(card)!==JSON.stringify(prior.get(card.id)));
        const delta=(previous,current)=>Object.fromEntries(Object.entries(current).filter(([key,value])=>key!=='id'&&JSON.stringify(value)!==JSON.stringify(previous?.[key])));
        const cloneSource=target=>{let source=duplicates.get(target);const seen=new Set();while(source&&!prior.has(source)&&duplicates.has(source)&&!seen.has(source)){seen.add(source);source=duplicates.get(source);}return prior.has(source)?source:null;};
        const cloneRows=changedCards.filter(card=>duplicates.has(card.id)&&cloneSource(card.id)).map(card=>({id:card.id,sourceId:cloneSource(card.id),patch:{...delta(prior.get(cloneSource(card.id)),card),...(card.itemRole==='exaltation'?{itemRole:'exaltation'}:{})}}));
        const cloneIds=new Set(cloneRows.map(row=>row.id));
        const updates=changedCards.filter(card=>prior.has(card.id)&&!duplicates.has(card.id)).map(card=>({id:card.id,patch:delta(prior.get(card.id),card)}));
        const upserts=changedCards.filter(card=>!prior.has(card.id)&&!cloneIds.has(card.id));
        const removes=clearing?[]:[...prior.keys()].filter(key=>!nextMap.has(key));
        // Compare normalized projections to detect deliberate changes, then
        // apply only those changes to the rich native records. In particular,
        // displaying a file/stat/flow field must not erase recovery provenance
        // or legacy subfields that the pure working model does not interpret.
        const coreChanges=changedFields(stripCore(before.snapshot),stripCore(next.snapshot));
        if(Object.hasOwn(coreChanges,'metadata'))coreChanges.metadata={...core.metadata,...changedFields(before.snapshot.metadata,next.snapshot.metadata)};
        if(Object.hasOwn(coreChanges,'statSnapshots'))coreChanges.statSnapshots={...core.statSnapshots,...changedFields(before.snapshot.statSnapshots,next.snapshot.statSnapshots)};
        const nextCore={...core,...coreChanges},flowChanges=changedFields(before.flow,next.flow);
        const nextFlow=Object.keys(flowChanges).length?{...(flow||before.flow),...flowChanges}:flow;
        const payload={profileId,expectedRevision:revision,core:nextCore,flow:nextFlow,upserts,updates,duplicates:cloneRows,removes,...(clearing?{clearInventory:true}:{})};
        if(changedCards.length+removes.length>50||bytes({upserts,updates,duplicates:cloneRows,removes})>1024*1024){
            error='This edit exceeds one safe inventory operation. Existing saved items are unchanged.';rebuild(before.snapshot,before.flow);queued=false;changed();settle();return;
        }
        active=(async()=>{try{
            const result=fail(await api.transaction(payload));if(token!==epoch||disposed)return;
            revision=result.revision;generation=result.generation??generation;counts={...counts,...result.counts};
            // Preserve later local edits while acknowledging precisely this write.
            acknowledged=next;core=nextCore;flow=nextFlow;
            const label=profiles.find(item=>item.id===profileId);if(label)Object.assign(label,{name:core.metadata?.name||label.name,server:core.metadata?.server||label.server});
            const assigned=new Set([...Object.values(next.snapshot.equipment||{}),...Object.values(next.snapshot.pendingEquipment||{})]);
            equipment=new Map([...assigned].filter(itemId=>nextMap.has(itemId)).map(itemId=>[itemId,nextMap.get(itemId)]));
            for(const card of changedCards){if(page.has(card.id))page.set(card.id,card);if(selected?.id===card.id)selected=card;duplicates.delete(card.id);}
            for(const removed of removes){equipment.delete(removed);page.delete(removed);if(selected?.id===removed)selected=null;}
            if(clearing){equipment.clear();page.clear();selected=null;pageResult=null;}
            error='';
        }catch(reason){if(token!==epoch||disposed)return;error=reason.message;queued=false;clearRequested=false;duplicates.clear();rebuild(before.snapshot,before.flow);warn(`Character changes were not saved: ${error}`);
        }finally{active=null;changed();if(queued&&!error)queueMicrotask(()=>void drain());else settle();}})();
        await active;
    }
    function settle(){const pending=waiters;waiters=[];for(const {resolve,reject}of pending)error?reject(Error(error)):resolve();}
    async function flush(){if(disposed)throw Error('Character storage is closed.');if(error)throw Error(error);if(queued||active)await new Promise((resolve,reject)=>{waiters.push({resolve,reject});void drain();});fail(await api.flush());}
    async function open(target,{select=false}={}){
        await flush();const token=++epoch;loading=true;changed();
        try{const result=fail(await (select?api.selectProfile({profileId:target}):api.getCore({profileId:target})));await accept(result,token);error='';}
        catch(reason){if(token===epoch){error=reason.message;warn(error);}throw reason;}
        finally{if(token===epoch){loading=false;changed();}}
    }
    function receiveProgress(event){
        if(!job||event.jobId!==job.id){if(loading&&earlyProgress.length<8)earlyProgress.push(event);return;}
        if(event.state==='complete'||event.phase==='complete'||event.status==='complete'||event.ok===true&&event.core){const pending=job;job=null;void accept(event,pending.epoch).then(accepted=>{if(accepted){pending.resolve(event);changed();}else pending.reject(Error('Character changed during import.'));}).catch(pending.reject);}
        else if(event.state==='error'||event.state==='cancelled'||event.phase==='error'||event.status==='error'||event.ok===false||event.cancelled){const pending=job;job=null;pending.reject(Error(event.error||'Import canceled. Saved inventory is unchanged.'));}
        else{job.onProgress?.(event);}
    }
    const progress=api?.onProgress?.(receiveProgress);
    async function seedBrowserLegacy(result){
        if(result.legacySeedAllowed!==true)return result;
        const values={};for(const key of [CHARACTER_STORAGE_KEY,CHARACTER_WALKTHROUGH_KEY,'eql-eye-of-zomm-character-profiles-v1']){const value=legacyStorage?.getItem(key);if(value!==null&&value!==undefined)values[key]=value;}
        if(!Object.keys(values).length)return result;
        if(!api.beginLegacySeed||!api.appendLegacySeed||!api.commitLegacySeed)throw Error('Browser Character data is preserved. Restart with a desktop version that can migrate it before creating a new character.');
        const text=JSON.stringify({schemaVersion:1,values}),digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)),sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
        const {token}=fail(await api.beginLegacySeed());
        try{for(let offset=0;offset<text.length;){let end=Math.min(text.length,offset+16000);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;fail(await api.appendLegacySeed({token,text:text.slice(offset,end)}));offset=end;}
            return fail(await api.commitLegacySeed({token,sha256}));
        }catch(reason){try{await api.cancelLegacySeed?.({token});}catch{/* The browser original is still untouched. */}throw reason;}
    }
    return {model:()=>model,walkthrough:()=>flowModel,contextKey,flush,
        async drainForClose(){
            closing=true;
            // Staged imports are not accepted inventory. Cancel admission now;
            // the native close path also drains/cancels the worker generation.
            if(importDone){cancelRequested=true;if(job)fail(await api.cancelImport({jobId:job.id}));}
            if(queued||active){try{await flush();}catch(reason){if(queued||active)throw reason;}}
            // A failed save has already restored the last acknowledged view.
            // A corrupt/migration-blocked original has accepted no new writes.
            // Neither condition may trap Quit after data is safely preserved.
            if(!error&&ready)fail(await api.flush());
        },
        resumeAfterCloseDrain(){closing=false;},
        get ready(){return ready;},get counts(){return {...counts};},get page(){return pageResult;},get status(){return {ready,loading,pending:queued||Boolean(active),error};},
        retainSelection(itemId){selected=itemId?actual.snapshot().candidates.find(card=>card.id===itemId)||null:null;},
        profiles:{list:()=>profiles.map(item=>({...item})),activeId:()=>profileId==='draft'?null:profileId,
            select:async target=>{await open(target,{select:true});return {ok:true,id:profileId};},
            newCharacter:async()=>{await open('draft',{select:true});return {ok:true,id:null};},
            register:async metadata=>{if(!ready||loading)throw Error('Character storage is loading.');await flush();if(profileId!=='draft')return {ok:true,id:profileId};
                const token=++epoch;loading=true;changed();
                try{const result=fail(await api.createProfile({metadata,fromProfileId:'draft',expectedRevision:revision}));
                    if(result.core)await accept(result,token);else await accept(fail(await api.getCore({profileId:result.profileId||result.id})),token);
                    profiles.push({id:profileId,name:metadata.name,server:metadata.server});return {ok:true,id:profileId};
                }catch(reason){error=reason.message;throw reason;}finally{if(token===epoch){loading=false;changed();}}}},
        async start(){loading=true;changed();try{const result=await seedBrowserLegacy(fail(await api.bootstrap()));profiles=[];let cursor,seen=new Set();
            // Profile metadata is small and paged independently; never fetch all
            // profile cores or nested inventory strings to build the selector.
            if(typeof api.listProfiles==='function'){
                do{const batch=fail(await api.listProfiles({cursor,limit:50}));for(const profile of batch.profiles||[])if(!profiles.some(item=>item.id===profile.id))profiles.push(profile);
                    cursor=batch.nextCursor||batch.continue||null;if(cursor){if(seen.has(cursor))throw Error('Character profile paging repeated a cursor.');seen.add(cursor);}
                }while(cursor);
            }else profiles=result.profiles||[];
            profileId=result.activeProfileId||'draft';
            await accept(fail(await api.getCore({profileId})),epoch);ready=true;error='';return result;
        }catch(reason){error=reason.message;warn(error);throw reason;}finally{loading=false;changed();}},
        async queryPage({scope='loose',search='',query=search,cursor,limit=50,signal}={}){
            await flush();const token=epoch,key=contextKey(),mutation=mutationEpoch;lastQuery={scope,query,limit};
            const result=fail(await api.list({profileId,generation,scope,query,cursor,limit}));
            if(disposed||signal?.aborted||token!==epoch||key!==contextKey()||mutation!==mutationEpoch)throw Error('Inventory page is no longer current.');
            if(result.revision!==revision||result.generation!==generation)throw Error('Inventory changed while this page was loading.');
            const cards=(result.items||[]).filter(row=>(!result.kinds?.[row.id]||result.kinds[row.id]==='card')&&!row.repositoryLarge);page=new Map(cards.map(card=>[card.id,card]));counts={...counts,...result.counts};
            pageResult={...result,contextKey:key};rebuild();acknowledged=state();return pageResult;
        },
        async selectItem(itemId){await flush();const token=epoch,key=contextKey(),mutation=mutationEpoch,item=await readItem(itemId);if(token!==epoch||key!==contextKey()||mutation!==mutationEpoch||disposed)return false;
            selected=item;rebuild();acknowledged=state();return true;},
        async importFiles({metadata,onProgress,chooseInventory=false,chooseAchievements=false}={}){
            await flush();if(importDone)throw Error('An inventory import is already running.');const token=epoch;loading=true;earlyProgress=[];cancelRequested=false;let finishImport;importDone=new Promise(resolve=>{finishImport=resolve;});changed();
            try{const result=fail(await api.importFiles({profileId,expectedRevision:revision,metadata,chooseInventory,chooseAchievements}));
                if(result.cancelled)return result;
                let resolve,reject;const done=new Promise((yes,no)=>{resolve=yes;reject=no;});job={id:result.jobId,epoch:token,resolve,reject,onProgress,done};const buffered=earlyProgress;earlyProgress=[];for(const event of buffered)receiveProgress(event);if(cancelRequested&&job)fail(await api.cancelImport({jobId:job.id}));return await done;
            }finally{finishImport();importDone=null;if(token===epoch){loading=false;changed();}}
        },
        async cancelImport(){cancelRequested=true;const pending=job,finished=importDone;if(pending)fail(await api.cancelImport({jobId:pending.id}));if(finished)await finished;},
        async retry(){error='';await open(profileId,{select:true});},
        dispose(){disposed=true;epoch++;progress?.();if(job){job.reject(Error('Character workspace closed.'));job=null;}settle();},
        lastQuery:()=>({...lastQuery})
    };
}
