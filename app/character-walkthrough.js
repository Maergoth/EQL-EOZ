export const CHARACTER_WALKTHROUGH_KEY='eql-eye-of-zomm-character-walkthrough-v1';
export const CHARACTER_WALKTHROUGH_STEPS=Object.freeze(['details','inventory','stats','review','complete']);
// Character reads one equipped stat pane. Item OCR belongs to Contribute.
export const CHARACTER_ITEM_READ_STEPS=Object.freeze([]);
const clone=value=>JSON.parse(JSON.stringify(value));
const bounded=(value,max=240)=>String(value??'').trim().slice(0,max);
const finiteTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
const sequence=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const generation=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const MAX_STORED_CHARACTERS=1500000;
const draft=value=>String(value??'').slice(0,12000);
function initial(){return {schemaVersion:1,flowVersion:2,step:'details',active:false,sessionId:'',sourceId:'',startedAt:0,completedAt:0,
    inventoryAfterAt:0,inventoryAccepted:false,statsAfterAt:0,statsAfterSequence:0,statsAccepted:false,statsDraft:'',statsDirty:false,legacy:null};}
function normalize(raw,migratedAt){
    const result=initial();if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
    result.sessionId=/^[\w-]{1,120}$/.test(raw.sessionId||'')?raw.sessionId:'';
    result.active=raw.active===true&&Boolean(result.sessionId);
    result.sourceId=bounded(raw.sourceId,180);result.startedAt=finiteTime(raw.startedAt);result.completedAt=finiteTime(raw.completedAt);
    if(raw.flowVersion!==2){
        // Retain former phase history privately. It authorizes no item reads
        // or final statistics in the replacement inventory-export flow.
        result.legacy=clone(raw);result.step=result.active?'inventory':raw.step==='complete'?'complete':'details';result.inventoryAfterAt=result.active?migratedAt:0;
        return result;
    }
    if(CHARACTER_WALKTHROUGH_STEPS.includes(raw.step))result.step=raw.step;
    if(result.step==='complete')result.active=false;
    if(!result.active&&result.step!=='complete')result.step='details';
    result.inventoryAfterAt=finiteTime(raw.inventoryAfterAt);result.inventoryAccepted=raw.inventoryAccepted===true;
    result.statsAfterAt=finiteTime(raw.statsAfterAt);result.statsAfterSequence=sequence(raw.statsAfterSequence);
    result.statsAccepted=raw.statsAccepted===true;result.statsDraft=draft(raw.statsDraft);result.statsDirty=raw.statsDirty===true;
    result.legacy=raw.legacy&&typeof raw.legacy==='object'&&!Array.isArray(raw.legacy)?clone(raw.legacy):null;
    return result;
}
/** Resumable metadata -> inventory export -> equipped stats -> review flow.
 * Capture is always explicit. Stored legacy phase history never authorizes
 * current statistics; the workspace separately validates manual import tokens.
 */
export function createCharacterWalkthrough({storage=globalThis.localStorage,now=Date.now,id=()=>globalThis.crypto.randomUUID(),onWarning=()=>{}}={}){
    let state=initial(),migrated=false;try{const raw=storage?.getItem(CHARACTER_WALKTHROUGH_KEY);if(raw&&raw.length<=MAX_STORED_CHARACTERS){const parsed=JSON.parse(raw);state=normalize(parsed,now());migrated=parsed?.flowVersion!==2;}}catch{/* Optional workflow cannot block saved gear. */}
    let captureContext=null;
    const save=()=>{try{const text=JSON.stringify(state);if(text.length>MAX_STORED_CHARACTERS)throw Error('Walkthrough storage bound exceeded.');storage?.setItem(CHARACTER_WALKTHROUGH_KEY,text);}catch{onWarning('This walkthrough remains open, but its progress could not be saved.');}return clone(state);};
    if(migrated)save();
    function resetStats(readSequence=0){state.statsAfterAt=now();state.statsAfterSequence=sequence(readSequence);state.statsAccepted=false;state.statsDraft='';state.statsDirty=false;}
    function requireStats(){if(!state.active||state.step!=='stats')throw Error('Read current equipped statistics from the stats step.');}
    function begin(){const legacy=state.legacy;captureContext=null;state={...initial(),legacy,active:true,sessionId:bounded(id(),120),startedAt:now()};return save();}
    function syncCapture(status={}){
        const sourceId=bounded(status.source?.id,180),readGeneration=generation(status.generation);
        captureContext=state.active&&state.step==='stats'&&status.owner==='character'&&status.sessionId===state.sessionId&&status.phase==='running'&&sourceId&&state.sourceId===sourceId&&readGeneration!==null
            ?{sourceId,generation:readGeneration,startedAt:finiteTime(status.generationStartedAt)||now()}:null;
        return clone(state);
    }
    function inventoryImported({sequence:readSequence=0}={}){
        if(!state.active||state.step!=='inventory')throw Error('Import the inventory export from the inventory step.');
        state.inventoryAccepted=true;state.step='stats';captureContext=null;resetStats(readSequence);return save();
    }
    function advance({sequence:readSequence=0}={}){
        if(!state.active)throw Error('Start the Character walkthrough first.');
        if(state.step==='details'){state.step='inventory';state.inventoryAfterAt=now();}
        else if(state.step==='inventory'){if(!state.inventoryAccepted)throw Error('Import the game inventory export first.');return inventoryImported({sequence:readSequence});}
        else if(state.step==='stats'){if(!state.statsAccepted)throw Error('Review and accept the current equipped statistics first.');state.step='review';captureContext=null;}
        return save();
    }
    function acceptsStats(observation){
        const at=Date.parse(observation?.capturedAt||'');
        if(!state.active||state.step!=='stats'||observation?.owner!=='character'||observation.subject?.kind!=='character'||observation.sessionId!==state.sessionId||!Number.isFinite(at)||at<state.statsAfterAt||at>now()||sequence(observation.sequence)<=state.statsAfterSequence)return false;
        return observation.kind==='manual'||Boolean(observation.kind==='ocr'&&captureContext&&observation.input?.sourceId===captureContext.sourceId&&observation.input?.captureGeneration===captureContext.generation&&at>=captureContext.startedAt);
    }
    return {snapshot:()=>clone(state),begin,advance,syncCapture,inventoryImported,acceptsStats,
        back(){if(!state.active)return clone(state);const index=CHARACTER_WALKTHROUGH_STEPS.indexOf(state.step);if(index>0)state.step=CHARACTER_WALKTHROUGH_STEPS[index-1];captureContext=null;if(state.step==='inventory'){state.inventoryAccepted=false;state.inventoryAfterAt=now();}if(state.step==='stats')state.statsAccepted=false;return save();},
        selectSource(){requireStats();captureContext=null;return save();},
        source(sourceId){const value=bounded(sourceId,180);if(value!==state.sourceId)captureContext=null;state.sourceId=value;return save();},
        restartStats({sequence:readSequence=0}={}){requireStats();resetStats(readSequence);return save();},
        editStats(text){requireStats();state.statsDraft=draft(text);state.statsDirty=true;return save();},
        acceptStats(){requireStats();state.statsAccepted=true;return save();},
        acceptsItem(){return false;},acceptsReplayItem(){return false;},
        complete(){if(!state.active||state.step!=='review')throw Error('Review the snapshot before completing this walkthrough.');captureContext=null;state.active=false;state.step='complete';state.completedAt=now();return save();},
        cancel(){captureContext=null;state.active=false;state.step='details';state.sourceId='';return save();}
    };
}
