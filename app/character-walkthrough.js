export const CHARACTER_WALKTHROUGH_KEY='eql-eye-of-zomm-character-walkthrough-v1';
export const CHARACTER_WALKTHROUGH_STEPS=Object.freeze(['details','source','unequip','base','reequip','slots','review','complete']);
const clone=value=>JSON.parse(JSON.stringify(value)),bounded=(value,max=240)=>String(value??'').trim().slice(0,max);
const baseDraft=value=>String(value??'').slice(0,12000),MAX_ALIASES=6,MAX_STORED_CHARACTERS=1500000;
const finiteTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
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
    baseAccepted:false,baseDraft:'',baseDirty:false,items:[],ignored:[],slotChoices:{},completedAt:0};}
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
    result.items=[...new Map((Array.isArray(raw.items)?raw.items:[]).slice(-120).filter(x=>x&&bounded(x.id)).map(x=>{const identity=itemIdentity(x.identity);return[bounded(x.id,180),{id:bounded(x.id,180),identity,aliases:identityAliases(x.aliases,identity)}];})).values()];
    result.ignored=(Array.isArray(raw.ignored)?raw.ignored:[]).slice(-120).map(itemIdentity).filter(x=>x.name);
    for(const [id,choice] of Object.entries(raw.slotChoices||{}).slice(0,120))if(/^[\w-]{1,180}$/.test(id))result.slotChoices[id]=bounded(choice,40);
    return result;
}
/** Resumable local workflow. This controller never starts capture by itself. */
export function createCharacterWalkthrough({storage=globalThis.localStorage,now=Date.now,id=()=>globalThis.crypto.randomUUID(),onWarning=()=>{}}={}){
    let state=initial();try{const raw=storage?.getItem(CHARACTER_WALKTHROUGH_KEY);if(raw&&raw.length<=MAX_STORED_CHARACTERS)state=normalize(JSON.parse(raw));}catch{/* Optional draft cannot block Character. */}
    const save=()=>{try{storage?.setItem(CHARACTER_WALKTHROUGH_KEY,JSON.stringify(state));}catch{onWarning('This walkthrough remains open, but its progress could not be saved.');}return clone(state);};
    function begin(){state={...initial(),active:true,sessionId:bounded(id(),120),startedAt:now()};return save();}
    function advance({captureRunning=false,sequence=0}={}){
        if(!state.active)throw Error('Start the Character walkthrough first.');
        if(state.step==='source'&&!captureRunning)throw Error('Start or resume the selected capture source first.');
        if(state.step==='base'&&!state.baseAccepted)throw Error('Review and accept your No Equipment values first.');
        if(state.step==='review'||state.step==='complete')return clone(state);
        const step=state.step==='source'?state.sourceReturnStep:CHARACTER_WALKTHROUGH_STEPS[CHARACTER_WALKTHROUGH_STEPS.indexOf(state.step)+1];
        if(step==='base'){state.baseAfterAt=now();state.baseAfterSequence=Math.max(0,Number(sequence)||0);state.baseAccepted=false;state.baseDraft='';state.baseDirty=false;}
        state.step=step;return save();
    }
    function isCurrent(observation){return state.active&&observation?.owner==='character'&&observation.sessionId===state.sessionId;}
    function compatibleIds(item){const identity=itemIdentity(item);return [...new Set(state.items.filter(entry=>[entry.identity,...entry.aliases].some(alias=>matches(alias,identity))).map(entry=>entry.id))];}
    return {snapshot:()=>clone(state),begin,
        advance,
        back({sequence=0}={}){if(!state.active)return clone(state);const index=CHARACTER_WALKTHROUGH_STEPS.indexOf(state.step);if(index>0)state.step=CHARACTER_WALKTHROUGH_STEPS[index-1];if(state.step==='base'){state.baseAfterAt=now();state.baseAfterSequence=Math.max(0,Number(sequence)||0);state.baseAccepted=false;state.baseDraft='';state.baseDirty=false;}return save();},
        selectSource(){if(!state.active)return clone(state);if(['unequip','base','reequip','slots','review'].includes(state.step))state.sourceReturnStep=state.step;state.step='source';return save();},
        source(sourceId){state.sourceId=bounded(sourceId,180);return save();},
        editBase(text){state.baseDraft=baseDraft(text);state.baseDirty=true;return save();},
        acceptsItem(observation){return isCurrent(observation)&&['unequip','reequip'].includes(state.step);},
        acceptsBase(observation){const at=Date.parse(observation?.capturedAt||'');return isCurrent(observation)&&state.step==='base'&&Number.isFinite(at)&&at>=state.baseAfterAt&&(Number(observation.sequence)||0)>state.baseAfterSequence;},
        acceptBase(){if(state.step!=='base')throw Error('No Equipment is reviewed in the base-stat step.');state.baseAccepted=true;return save();},
        findItem(item){const compatible=compatibleIds(item);return compatible.length===1?compatible[0]:null;},
        ambiguousItem(item){return compatibleIds(item).length>1;},
        ignores(item){const identity=itemIdentity(item);return state.ignored.some(x=>matches(x,identity));},
        rememberItem(candidate){const identity=itemIdentity(candidate),prior=state.items.find(x=>x.id===candidate.id);if(prior){prior.aliases=identityAliases([...(prior.aliases||[]),prior.identity],identity);prior.identity=identity;}else state.items.push({id:candidate.id,identity,aliases:identityAliases([],identity)});state.items=state.items.slice(-120);return save();},
        removeItem(candidate){const prior=state.items.find(x=>x.id===candidate.id),identities=[...(prior?.aliases||[]),...(prior?[prior.identity]:[]),itemIdentity(candidate)];state.items=state.items.filter(x=>x.id!==candidate.id);state.ignored=[...new Map([...state.ignored,...identities].filter(identity=>identity.name).map(identity=>[identityKey(identity),identity])).values()].slice(-120);delete state.slotChoices[candidate.id];return save();},
        chooseSlot(id,value){state.slotChoices[bounded(id,180)]=bounded(value,40);return save();},
        complete(){if(state.step!=='review')throw Error('Review the snapshot before completing this walkthrough.');state.active=false;state.step='complete';state.completedAt=now();return save();},
        cancel(){state.active=false;state.step='details';state.sourceId='';return save();}
    };
}
