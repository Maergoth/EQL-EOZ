// Keep Character and reviewed contribution drafts independent of loopback ports.
// Calibration and other UI preferences retain their existing browser store.
import { CHARACTER_STORAGE_KEY } from './character-model.js';
import { CHARACTER_WALKTHROUGH_KEY } from './character-walkthrough.js';
import { CONTRIBUTION_QUEUE_KEY, CONTRIBUTION_QUEUE_BYTES } from './contribution-evidence.js';

const PROFILE_STORAGE_KEY='eql-eye-of-zomm-character-profiles-v1';
const CONTRIBUTION_STORAGE_KEY=CONTRIBUTION_QUEUE_KEY;
const KEYS=new Set([CHARACTER_STORAGE_KEY,CHARACTER_WALKTHROUGH_KEY,PROFILE_STORAGE_KEY,CONTRIBUTION_STORAGE_KEY]);
const valueLimit=key=>key===PROFILE_STORAGE_KEY?32*1024*1024:key===CONTRIBUTION_STORAGE_KEY?CONTRIBUTION_QUEUE_BYTES:key===CHARACTER_STORAGE_KEY?8*1024*1024:1500000;
export async function createCharacterStorage({api=globalThis.eyeOfZommCharacterStorage,legacyStorage=globalThis.localStorage,onWarning=()=>{},repositoryMode=typeof globalThis.eyeOfZommCharacterRepository?.bootstrap==='function'}={}) {
    const allowedKeys=repositoryMode?new Set([CONTRIBUTION_STORAGE_KEY]):KEYS;
    const values=new Map(),pending=new Set(),pendingCounts=new Map(),failedKeys=new Set(),blockedKeys=new Set(),listeners=new Set();let hostReady=false,writeWarning=false,localWarning=false;
    const warn=message=>{try{onWarning(message);}catch{/* A warning must not break editing. */}};
    const notify=()=>{for(const callback of listeners)try{callback();}catch{/* Status listeners cannot break persistence. */}};
    const localGet=key=>{try{return legacyStorage?.getItem(key)??null;}catch{return null;}};
    const mirror=(key,value)=>{try{if(value===null)legacyStorage?.removeItem(key);else legacyStorage?.setItem(key,value);}catch{if(!hostReady&&!localWarning){localWarning=true;warn('Character changes could not be saved in browser storage. Keep this window open and save a snapshot.');}}};
    const persist=(key,value)=>{
        if(!hostReady||blockedKeys.has(key))return;
        let request;try{request=Promise.resolve(api.write({key,value}));}catch(error){request=Promise.reject(error);}
        const tracked=request.then(result=>{if(result?.ok!==true)throw Error('Character storage did not confirm the save.');failedKeys.delete(key);if(!failedKeys.size)writeWarning=false;},error=>{throw error;}).catch(()=>{
            failedKeys.add(key);
            if(!writeWarning){writeWarning=true;warn(key===CONTRIBUTION_STORAGE_KEY?'Contribution drafts could not be saved to disk. Keep Eye of Zomm open and retry saving.':'Character inventory could not be saved to disk. Your changes remain in this window; keep it open and save a snapshot.');}
            return {ok:false};
        }).finally(()=>{pending.delete(tracked);const remaining=(pendingCounts.get(key)||1)-1;if(remaining)pendingCounts.set(key,remaining);else pendingCounts.delete(key);notify();});pending.add(tracked);pendingCounts.set(key,(pendingCounts.get(key)||0)+1);notify();
    };
    let saved={};
    if(api?.read&&api?.write&&api?.flush){
        try{
            const result=await api.read(repositoryMode?{keys:[CONTRIBUTION_STORAGE_KEY]}:undefined);
            if(result?.error)warn(`Saved Character inventory could not be loaded. ${String(result.error).slice(0,240)} Changes will stay in browser storage until recovery.`);
            else if(result?.values&&typeof result.values==='object'&&!Array.isArray(result.values)){saved=result.values;hostReady=true;}
            else warn('Saved Character inventory could not be loaded. Changes will stay in browser storage for this session.');
        }catch{warn('Saved Character inventory is unavailable. Changes will stay in browser storage for this session.');}
    }
    for(const key of allowedKeys){
        const present=hostReady&&Object.hasOwn(saved,key),value=present?saved[key]:localGet(key);
        const limit=valueLimit(key);
        if(value!==null&&(typeof value!=='string'||value.length>limit||new TextEncoder().encode(value).length>limit)){blockedKeys.add(key);warn('A saved Character entry exceeds its supported limit and was left unchanged.');continue;}
        if(value!==null){
            let valid=false;try{const parsed=JSON.parse(value);valid=Boolean(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.schemaVersion===1);}catch{/* Preserve unreadable values before the model can replace them. */}
            if(!valid){blockedKeys.add(key);warn('A saved Character entry is malformed or uses an unsupported version and was left unchanged. Recover that entry before saving changes to it.');continue;}
        }
        values.set(key,value);mirror(key,value);
        if(hostReady&&!present&&value!==null)persist(key,value);
    }
    return {
        status(key){return {pending:pendingCounts.has(key),failed:failedKeys.has(key),blocked:blockedKeys.has(key)};},
        subscribe(callback){if(typeof callback!=='function')return()=>{};listeners.add(callback);return()=>listeners.delete(callback);},
        getItem(key){return allowedKeys.has(key)?values.get(key)??null:null;},
        setItem(key,value){
            if(!allowedKeys.has(key))throw Error('Unsupported Character storage key.');
            if(blockedKeys.has(key))throw Error('This saved Character entry is preserved until its malformed or unsupported data is recovered.');
            const limit=valueLimit(key);
            if(typeof value!=='string'||value.length>limit||new TextEncoder().encode(value).length>limit)throw Error('Character storage value exceeds its limit.');
            if(!hostReady){
                // Browser storage is the only authority in this fallback. Let
                // quota failures reach the atomic model/profile transaction.
                if(typeof legacyStorage?.setItem!=='function')throw Error('Character storage is unavailable.');
                legacyStorage.setItem(key,value);values.set(key,value);return;
            }
            values.set(key,value);mirror(key,value);persist(key,value);
        },
        removeItem(key){if(!allowedKeys.has(key))throw Error('Unsupported Character storage key.');if(blockedKeys.has(key))throw Error('This saved Character entry is preserved until its malformed or unsupported data is recovered.');values.set(key,null);mirror(key,null);persist(key,null);},
        async flush(){
            const results=await Promise.all([...pending]);if(failedKeys.size||blockedKeys.size||results.some(result=>result?.ok===false))return {ok:false};
            if(!hostReady)return {ok:false};
            try{const result=await api.flush();if(result?.ok!==true)throw Error('Save not confirmed');return result;}catch{warn(repositoryMode?'Contribution drafts are still waiting to save. Keep Eye of Zomm open and retry saving.':'Character inventory is still waiting to save. Keep this window open and save a snapshot.');return {ok:false};}
        }
    };
}
