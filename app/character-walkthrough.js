export const CHARACTER_WALKTHROUGH_KEY='eql-eye-of-zomm-character-walkthrough-v1';
export const CHARACTER_WALKTHROUGH_STEPS=Object.freeze(['details','source','unequip','base','reequip','slots','review','complete']);
export const CHARACTER_ITEM_READ_STEPS=Object.freeze(['unequip','reequip','slots','review']);
const clone=value=>JSON.parse(JSON.stringify(value)),bounded=(value,max=240)=>String(value??'').trim().slice(0,max);
const baseDraft=value=>String(value??'').slice(0,12000),MAX_ALIASES=6,MAX_STORED_CHARACTERS=1500000;
const finiteTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
const ITEM_STEPS=new Set(CHARACTER_ITEM_READ_STEPS),MAX_ITEM_WINDOWS=32;
const generation=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function itemIdentity(item={}){
    return {name:bounded(item.name).normalize('NFKC').toLocaleLowerCase(),tier:Number.isInteger(item.tier)?item.tier:null,
        fraction:Number.isInteger(item.fraction)?item.fraction:null,augments:(Array.isArray(item.augments)?item.augments:[]).slice(0,8).map(a=>bounded(a?.name||a,120).toLocaleLowerCase()).sort()};
}
const matches=(a,b)=>a.name&&a.name===b.name&&['tier','fraction'].every(k=>a[k]===null||b[k]===null||a[k]===b[k])&&(!a.augments.length||!b.augments.length||JSON.stringify(a.augments)===JSON.stringify(b.augments));
const identityKey=value=>JSON.stringify(value);
function identityAliases(values,current){
    // Keep the initial observed identity and the five most recent alternatives.
    // The editable current identity is also checked independently during lookup.
    const input=Array.isArray(values)?values:[],boundedInput=input.length>MAX_ALIASES?[input[0],...input.slice(-(MAX_ALIASES-1))]:input;
    const distinct=[...new Map([...boundedInput,current].map(itemIdentity).filter(identity=>identity.name).map(identity=>[identityKey(identity),identity])).values()];
    return distinct.length>MAX_ALIASES?[distinct[0],...distinct.slice(-(MAX_ALIASES-1))]:distinct;
}
function initial(){return {schemaVersion:1,step:'details',sourceReturnStep:'unequip',active:false,sessionId:'',sourceId:'',startedAt:0,baseAfterAt:0,baseAfterSequence:0,
    baseAccepted:false,baseDraft:'',baseDirty:false,items:[],ignored:[],slotChoices:{},completedAt:0,itemReadTracking:false,itemPhaseStartedAt:0,itemReadWindows:[]};}
function normalize(raw){
    const result=initial();if(!raw||typeof raw!=='object')return result;
    if(CHARACTER_WALKTHROUGH_STEPS.includes(raw.step))result.step=raw.step;
    if(['unequip','base','reequip','slots','review'].includes(raw.sourceReturnStep))result.sourceReturnStep=raw.sourceReturnStep;
    result.active=raw.active===true&&result.step!=='complete';
    result.sessionId=/^[\w-]{1,120}$/.test(raw.sessionId||'')?raw.sessionId:'';
    if(result.active&&!result.sessionId){result.active=false;result.step='details';}
    result.sourceId=bounded(raw.sourceId,180);
    for(const key of ['startedAt','baseAfterAt','completedAt'])result[key]=finiteTime(raw[key]);
    result.baseAfterSequence=Number.isSafeInteger(raw.baseAfterSequence)?Math.max(0,raw.baseAfterSequence):0;
    result.baseAccepted=raw.baseAccepted===true;
    result.baseDraft=baseDraft(raw.baseDraft);result.baseDirty=raw.baseDirty===true;
    result.itemReadTracking=raw.itemReadTracking===true;
    result.itemPhaseStartedAt=finiteTime(raw.itemPhaseStartedAt);
    result.itemReadWindows=(Array.isArray(raw.itemReadWindows)?raw.itemReadWindows:[]).slice(-MAX_ITEM_WINDOWS).filter(window=>window&&ITEM_STEPS.has(window.step)&&finiteTime(window.from)>0&&generation(window.generation)!==null&&bounded(window.sourceId,180)&&(window.until===null||finiteTime(window.until)>=window.from)).map(window=>({step:window.step,from:finiteTime(window.from),until:window.until===null?null:finiteTime(window.until),sourceId:bounded(window.sourceId,180),generation:window.generation}));
    result.items=[...new Map((Array.isArray(raw.items)?raw.items:[]).slice(-120).filter(x=>x&&bounded(x.id)).map(x=>{const identity=itemIdentity(x.identity);return[bounded(x.id,180),{id:bounded(x.id,180),identity,aliases:identityAliases(x.aliases,identity)}];})).values()];
    result.ignored=(Array.isArray(raw.ignored)?raw.ignored:[]).slice(-120).map(itemIdentity).filter(x=>x.name);
    for(const [id,choice] of Object.entries(raw.slotChoices||{}).slice(0,120))if(/^[\w-]{1,180}$/.test(id))result.slotChoices[id]=bounded(choice,40);
    return result;
}
/** Resumable local workflow. This controller never starts capture by itself. */
export function createCharacterWalkthrough({storage=globalThis.localStorage,now=Date.now,id=()=>globalThis.crypto.randomUUID(),onWarning=()=>{}}={}){
    let state=initial();try{const raw=storage?.getItem(CHARACTER_WALKTHROUGH_KEY);if(raw&&raw.length<=MAX_STORED_CHARACTERS)state=normalize(JSON.parse(raw));}catch{/* Optional draft cannot block Character. */}
    let captureContext=null;
    const save=()=>{try{storage?.setItem(CHARACTER_WALKTHROUGH_KEY,JSON.stringify(state));}catch{onWarning('This walkthrough remains open, but its progress could not be saved.');}return clone(state);};
    function closeItemWindow(at=now()){for(const window of state.itemReadWindows)if(window.until===null)window.until=Math.max(window.from,at);}
    function openItemWindow(){
        if(!state.active||!ITEM_STEPS.has(state.step)||!captureContext)return;
        const prior=state.itemReadWindows.at(-1);
        if(prior?.until===null&&prior.step===state.step&&prior.sourceId===captureContext.sourceId&&prior.generation===captureContext.generation)return;
        closeItemWindow();state.itemReadWindows.push({step:state.step,from:Math.max(state.itemPhaseStartedAt,captureContext.startedAt),until:null,sourceId:captureContext.sourceId,generation:captureContext.generation});state.itemReadWindows=state.itemReadWindows.slice(-MAX_ITEM_WINDOWS);
    }
    function setStep(step,{itemReadStartedAt}={}){const boundary=now();closeItemWindow(boundary);state.step=step;state.itemPhaseStartedAt=ITEM_STEPS.has(step)?Math.max(state.startedAt,finiteTime(itemReadStartedAt)||boundary):0;openItemWindow();}
    // Status supplies the trusted source/generation boundary; phase actions
    // supply the other boundary. Neither opening the app nor late OCR extends
    // an earlier item phase into Base, source selection or a completed flow.
    function syncCapture(status={},{startedAt}={}){
        const prior=captureContext,sourceId=bounded(status.source?.id,180),nextGeneration=generation(status.generation);
        captureContext=state.active&&status.owner==='character'&&status.sessionId===state.sessionId&&status.phase==='running'&&sourceId&&(!state.sourceId||state.sourceId===sourceId)&&nextGeneration!==null?{sourceId,generation:nextGeneration,startedAt:finiteTime(status.generationStartedAt)||finiteTime(startedAt)||(prior?.sourceId===sourceId&&prior.generation===nextGeneration?prior.startedAt:now())}:null;
        const before=JSON.stringify([state.itemReadTracking,state.itemPhaseStartedAt,state.itemReadWindows]);
        if(captureContext&&(!state.itemReadTracking||ITEM_STEPS.has(state.step)&&!state.itemPhaseStartedAt)){
            const last=state.itemReadWindows.at(-1);
            // Released drafts stopped item admission at Re-equip. Only its
            // latest, trusted boundary can extend into Slots/Review; starting
            // from generation time could accidentally admit Base frames.
            const legacyBoundary=state.itemReadTracking&&['slots','review'].includes(state.step)&&state.baseAccepted&&last?.step==='reequip'&&last.until!==null&&last.until>=state.baseAfterAt&&last.sourceId===captureContext.sourceId&&last.generation===captureContext.generation?last.until:null;
            state.itemReadTracking=true;if(ITEM_STEPS.has(state.step))state.itemPhaseStartedAt=legacyBoundary??now();
        }
        if(!captureContext||prior?.sourceId!==captureContext.sourceId||prior.generation!==captureContext.generation)closeItemWindow();openItemWindow();if(before!==JSON.stringify([state.itemReadTracking,state.itemPhaseStartedAt,state.itemReadWindows]))return save();return clone(state);
    }
    function itemWindow(observation){
        const at=Date.parse(observation?.capturedAt||''),sourceId=observation?.input?.sourceId,readGeneration=generation(observation?.input?.captureGeneration);
        return Number.isFinite(at)&&at<=now()&&typeof sourceId==='string'&&readGeneration!==null&&state.itemReadWindows.some(window=>window.sourceId===sourceId&&window.generation===readGeneration&&at>=window.from&&(window.until===null||at<window.until));
    }
    function begin(){captureContext=null;state={...initial(),active:true,sessionId:bounded(id(),120),startedAt:now(),itemReadTracking:true};return save();}
    function advance({captureRunning=false,sequence=0,itemReadStartedAt}={}){
        if(!state.active)throw Error('Start the Character walkthrough first.');
        if(state.step==='source'&&!captureRunning)throw Error('Start or resume the selected capture source first.');
        if(state.step==='base'&&!state.baseAccepted)throw Error('Review and accept your No Equipment values first.');
        if(state.step==='review'||state.step==='complete')return clone(state);
        const step=state.step==='source'?state.sourceReturnStep:CHARACTER_WALKTHROUGH_STEPS[CHARACTER_WALKTHROUGH_STEPS.indexOf(state.step)+1];
        if(step==='base'){state.baseAfterAt=now();state.baseAfterSequence=Math.max(0,Number(sequence)||0);state.baseAccepted=false;state.baseDraft='';state.baseDirty=false;}
        setStep(step,{itemReadStartedAt});return save();
    }
    function isCurrent(observation){return state.active&&observation?.owner==='character'&&observation.sessionId===state.sessionId;}
    function compatibleIds(item){const identity=itemIdentity(item);return [...new Set(state.items.filter(entry=>[entry.identity,...entry.aliases].some(alias=>matches(alias,identity))).map(entry=>entry.id))];}
    return {snapshot:()=>clone(state),begin,syncCapture,
        advance,
        back({sequence=0}={}){if(!state.active)return clone(state);const index=CHARACTER_WALKTHROUGH_STEPS.indexOf(state.step);if(index>0)setStep(CHARACTER_WALKTHROUGH_STEPS[index-1]);if(state.step==='base'){state.baseAfterAt=now();state.baseAfterSequence=Math.max(0,Number(sequence)||0);state.baseAccepted=false;state.baseDraft='';state.baseDirty=false;}return save();},
        selectSource(){if(!state.active)return clone(state);if(['unequip','base','reequip','slots','review'].includes(state.step))state.sourceReturnStep=state.step;setStep('source');return save();},
        source(sourceId){state.sourceId=bounded(sourceId,180);return save();},
        editBase(text){state.baseDraft=baseDraft(text);state.baseDirty=true;return save();},
        acceptsItem(observation,{manualRead}={}){if(!isCurrent(observation))return false;if(observation.kind==='manual')return manualRead?.eligible===true&&manualRead.sessionId===state.sessionId&&Number.isFinite(Date.parse(observation.capturedAt))&&Date.parse(observation.capturedAt)>=manualRead.at;return Boolean(captureContext&&observation.input?.sourceId===captureContext.sourceId&&observation.input?.captureGeneration===captureContext.generation&&itemWindow(observation));},
        acceptsReplayItem(observation){return observation?.sessionId!==state.sessionId||!state.itemReadTracking||Boolean(isCurrent(observation)&&captureContext&&observation.input?.sourceId===captureContext.sourceId&&observation.input?.captureGeneration===captureContext.generation&&itemWindow(observation));},
        acceptsBase(observation){const at=Date.parse(observation?.capturedAt||'');return isCurrent(observation)&&state.step==='base'&&Number.isFinite(at)&&at>=state.baseAfterAt&&(Number(observation.sequence)||0)>state.baseAfterSequence;},
        acceptBase(){if(state.step!=='base')throw Error('No Equipment is reviewed in the base-stat step.');state.baseAccepted=true;return save();},
        findItem(item){const compatible=compatibleIds(item);return compatible.length===1?compatible[0]:null;},
        ambiguousItem(item){return compatibleIds(item).length>1;},
        ignores(item){const identity=itemIdentity(item);return state.ignored.some(x=>matches(x,identity));},
        rememberItem(candidate){const identity=itemIdentity(candidate),prior=state.items.find(x=>x.id===candidate.id);if(prior){prior.aliases=identityAliases([...(prior.aliases||[]),prior.identity],identity);prior.identity=identity;}else state.items.push({id:candidate.id,identity,aliases:identityAliases([],identity)});state.items=state.items.slice(-120);return save();},
        removeItem(candidate){const prior=state.items.find(x=>x.id===candidate.id),identities=[...(prior?.aliases||[]),...(prior?[prior.identity]:[]),itemIdentity(candidate)];state.items=state.items.filter(x=>x.id!==candidate.id);state.ignored=[...new Map([...state.ignored,...identities].filter(identity=>identity.name).map(identity=>[identityKey(identity),identity])).values()].slice(-120);delete state.slotChoices[candidate.id];return save();},
        chooseSlot(id,value){state.slotChoices[bounded(id,180)]=bounded(value,40);return save();},
        complete(){if(state.step!=='review')throw Error('Review the snapshot before completing this walkthrough.');closeItemWindow();captureContext=null;state.active=false;state.step='complete';state.completedAt=now();return save();},
        cancel(){closeItemWindow();captureContext=null;state.active=false;state.step='details';state.sourceId='';return save();}
    };
}
