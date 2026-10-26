import { CHARACTER_STORAGE_KEY } from './character-model.js';
import { CHARACTER_WALKTHROUGH_KEY } from './character-walkthrough.js';

export const CHARACTER_PROFILES_KEY='eql-eye-of-zomm-character-profiles-v1';
export const CHARACTER_PROFILE_LIMITS=Object.freeze({profiles:32,storageBytes:32*1024*1024,valueBytes:8*1024*1024});
const INNER_KEYS=new Map([[CHARACTER_STORAGE_KEY,'model'],[CHARACTER_WALKTHROUGH_KEY,'walkthrough']]);
const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const bytes=value=>new TextEncoder().encode(value).length;
const copy=value=>JSON.parse(JSON.stringify(value));
const blank=()=>({model:null,walkthrough:null});
const initial=()=>({schemaVersion:1,activeId:null,draft:blank(),profiles:[]});
const folded=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const validId=value=>typeof value==='string'&&/^[\w-]{1,120}$/.test(value);
function identity(metadata){
    if(!object(metadata))return null;
    const name=typeof metadata.name==='string'?metadata.name.trim():'',server=typeof metadata.server==='string'?metadata.server.trim():'';
    return name&&server&&name.length<=120&&server.length<=100&&!/[\u0000-\u001f\u007f]/.test(name+server)?{name,server}:null;
}
const sameIdentity=(a,b)=>folded(a.name)===folded(b.name)&&folded(a.server)===folded(b.server);
function parseValue(value){
    if(value===null)return null;
    if(typeof value!=='string'||value.length>CHARACTER_PROFILE_LIMITS.valueBytes||bytes(value)>CHARACTER_PROFILE_LIMITS.valueBytes)throw Error('A saved Character profile entry exceeds its supported limit.');
    let parsed;try{parsed=JSON.parse(value);}catch{throw Error('A saved Character profile entry is malformed.');}
    if(!object(parsed)||parsed.schemaVersion!==1)throw Error('A saved Character profile entry uses an unsupported version or format.');
    return parsed;
}
function validateRecord(value){
    if(!object(value)||!Object.hasOwn(value,'model')||!Object.hasOwn(value,'walkthrough'))throw Error('A saved Character profile is malformed.');
    parseValue(value.model);parseValue(value.walkthrough);
    return {model:value.model,walkthrough:value.walkthrough};
}
function parseRoster(raw){
    if(typeof raw!=='string'||raw.length>CHARACTER_PROFILE_LIMITS.storageBytes||bytes(raw)>CHARACTER_PROFILE_LIMITS.storageBytes)throw Error('The saved Character roster exceeds its supported limit.');
    let value;try{value=JSON.parse(raw);}catch{throw Error('The saved Character roster is malformed.');}
    if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.profiles)||value.profiles.length>CHARACTER_PROFILE_LIMITS.profiles)throw Error('The saved Character roster uses an unsupported version or format.');
    const profiles=[],ids=new Set();
    for(const profile of value.profiles){
        const label=identity(profile);
        if(!label||!validId(profile.id)||ids.has(profile.id)||profiles.some(prior=>sameIdentity(prior,label)))throw Error('The saved Character roster contains an invalid or duplicate identity.');
        ids.add(profile.id);profiles.push({id:profile.id,...label,...validateRecord(profile)});
    }
    if(value.activeId!==null&&(!validId(value.activeId)||!ids.has(value.activeId)))throw Error('The saved Character selection is invalid.');
    return {schemaVersion:1,activeId:value.activeId,draft:validateRecord(value.draft),profiles};
}
function pastFirstStep(model,flow){
    // begin() is called after validated first-step submission. Back/Cancel may
    // later return to details without undoing that named registration evidence.
    if(Number.isFinite(flow?.startedAt)&&flow.startedAt>0&&validId(flow?.sessionId))return true;
    if(Number.isFinite(flow?.completedAt)&&flow.completedAt>0||flow?.baseAccepted===true)return true;
    if(model?.statSnapshots?.base?.confirmed===true&&object(model.statSnapshots.base.stats)&&Object.keys(model.statSnapshots.base.stats).length)return true;
    const ids=new Set(Array.isArray(model?.candidates)?model.candidates.filter(object).map(card=>card.id):[]);
    return object(model?.equipment)&&Object.values(model.equipment).some(id=>typeof id==='string'&&ids.has(id));
}

/** Synchronous model/walkthrough storage proxy over one atomic roster value.
 * Only an explicit register() or credible legacy first-step evidence creates a
 * listed character. The unregistered draft survives switching. Inner strings
 * remain opaque after schema validation: no card, evidence or layout migration.
 * A failed authoritative write leaves both selection and prior data unchanged.
 */
export function createCharacterProfiles({storage=globalThis.localStorage,onWarning=()=>{},id=()=>globalThis.crypto.randomUUID(),now=Date.now,mirrorLegacy=true}={}){
    let state=initial(),blocked=false;
    const warn=message=>{try{onWarning(message);}catch{/* Warning callbacks cannot break preservation. */}};
    const record=()=>state.activeId===null?state.draft:state.profiles.find(profile=>profile.id===state.activeId);
    const assertWritable=()=>{if(blocked)throw Error('The saved Character roster is preserved until its malformed or unsupported data is recovered.');};
    function mirror(){
        if(!mirrorLegacy||!storage)return;
        const current=record();
        try{for(const [key,field] of INNER_KEYS){if(current[field]===null)storage.removeItem(key);else storage.setItem(key,current[field]);}}
        catch{warn('The Character roster was saved, but its legacy browser mirror could not be updated. The roster remains authoritative.');}
    }
    function commit(next){
        assertWritable();
        const serialized=JSON.stringify(next);
        if(serialized.length>CHARACTER_PROFILE_LIMITS.storageBytes||bytes(serialized)>CHARACTER_PROFILE_LIMITS.storageBytes)throw Error('The Character roster is full. Existing characters were preserved; save a snapshot before adding more data.');
        if(!storage?.setItem)throw Error('Character profile storage is unavailable. Existing characters were preserved.');
        // No in-memory or legacy mutation happens until this save succeeds.
        storage.setItem(CHARACTER_PROFILES_KEY,serialized);state=next;mirror();
    }
    function profileId(){
        const value=id();if(!validId(value)||state.profiles.some(profile=>profile.id===value))throw Error('A unique Character profile ID could not be created.');return value;
    }
    const resultError=error=>{const message=String(error?.message||'Character profiles could not be saved.');warn(message);return {ok:false,error:message};};
    try{
        const raw=storage?.getItem(CHARACTER_PROFILES_KEY)??null;
        if(raw!==null)state=parseRoster(raw);
        else{
            const model=storage?.getItem(CHARACTER_STORAGE_KEY)??null,walkthrough=storage?.getItem(CHARACTER_WALKTHROUGH_KEY)??null;
            const parsedModel=parseValue(model),parsedFlow=parseValue(walkthrough),label=identity(parsedModel?.metadata),next=initial();
            next.draft={model,walkthrough};
            if(label&&pastFirstStep(parsedModel,parsedFlow)){
                const migratedId=profileId();next.profiles.push({id:migratedId,...label,model,walkthrough});next.activeId=migratedId;next.draft=blank();
            }
            if(model!==null||walkthrough!==null)commit(next);
        }
    }catch(error){blocked=true;warn(`${String(error?.message||'Saved Character profiles could not be loaded.')} Original data was left unchanged; profile writes are blocked until recovery.`);}
    const proxy={
        getItem(key){const field=INNER_KEYS.get(key);return field?record()[field]:null;},
        setItem(key,value){
            const field=INNER_KEYS.get(key);if(!field)throw Error('Unsupported Character profile storage key.');assertWritable();parseValue(value);
            if(value===null)throw Error('Character profile setItem requires a serialized value.');
            const next=copy(state),current=next.activeId===null?next.draft:next.profiles.find(profile=>profile.id===next.activeId);current[field]=value;commit(next);
        },
        removeItem(key){
            const field=INNER_KEYS.get(key);if(!field)throw Error('Unsupported Character profile storage key.');assertWritable();
            const next=copy(state),current=next.activeId===null?next.draft:next.profiles.find(profile=>profile.id===next.activeId);current[field]=null;commit(next);
        }
    };
    // now is injectable for callers that share a clock with model/controller;
    // profile persistence deliberately adds no timestamps to their evidence.
    void now;
    return {
        storage:proxy,
        list:()=>state.profiles.map(({id,name,server})=>({id,name,server})),
        activeId:()=>state.activeId,
        register(metadata){try{
            assertWritable();const label=identity(metadata);if(!label)throw Error('Enter a Character name and server before saving this character.');
            if(state.profiles.some(profile=>profile.id!==state.activeId&&sameIdentity(profile,label)))throw Error('A Character with this name and server already exists. Select that character instead.');
            const next=copy(state);let profile;
            if(next.activeId===null){
                if(next.profiles.length>=CHARACTER_PROFILE_LIMITS.profiles)throw Error('The Character roster is full (32 characters). Existing characters were preserved.');
                profile={id:profileId(),...label,...next.draft};next.profiles.push(profile);next.activeId=profile.id;next.draft=blank();
            }else{profile=next.profiles.find(value=>value.id===next.activeId);Object.assign(profile,label);}
            commit(next);return {ok:true,id:profile.id,profile:{id:profile.id,name:profile.name,server:profile.server}};
        }catch(error){return resultError(error);}},
        select(selectedId){try{
            assertWritable();const profile=state.profiles.find(value=>value.id===selectedId);if(!profile)throw Error('That Character profile is unavailable.');
            if(state.activeId!==selectedId)commit({...copy(state),activeId:selectedId});
            return {ok:true,id:profile.id,profile:{id:profile.id,name:profile.name,server:profile.server}};
        }catch(error){return resultError(error);}},
        newCharacter(){try{assertWritable();if(state.activeId!==null)commit({...copy(state),activeId:null});return {ok:true,id:null};}catch(error){return resultError(error);}}
    };
}
