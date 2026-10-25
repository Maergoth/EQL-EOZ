import {loggedZoneName} from './zone-identity.js';
import {createWikiResolver,normalizeWikiIdentity} from './wiki-identity.js';

export const CONSIDER_MAX_AGE_MS=6*60*60*1000;
const MAX_TARGETS=512,MAX_SAMPLES=16;
const text=value=>typeof value==='string'?value.trim().slice(0,230):'';
const level=value=>Number.isSafeInteger(value)&&value>0&&value<=1000;
// These facts describe one continuous visit in one selected log, not a global
// NPC level. Unknown normal/raid designation stays unknown; a visit boundary
// still prevents observations from two different instances being joined.
export class LogContext {
    constructor({getPack=()=>({})}={}){this.getPack=getPack;this.reset();}
    reset(){this.zone='';this.shortName='';this.instanceId='';this.instance='unknown';this.visit=0;this.anchorAt=0;this.latestAnchorAt=0;this.readings=new Map();}
    canonicalZone(value,shortName=''){return loggedZoneName(this.getPack()?.zones||[],value,shortName);}
    anchor(value,{shortName='',instanceId='',at=0,entered=false}={}){
        const zone=this.canonicalZone(value,shortName);if(!zone||at<this.latestAnchorAt)return false;
        const changed=entered||normalizeWikiIdentity(zone)!==normalizeWikiIdentity(this.zone)||!!(instanceId&&this.instanceId&&instanceId!==this.instanceId);
        if(changed){this.visit++;this.readings.clear();this.instance='unknown';this.instanceId='';this.anchorAt=at;}
        this.zone=zone;this.shortName=text(shortName);this.instanceId=text(instanceId)||this.instanceId;this.latestAnchorAt=at;
        return changed;
    }
    consider(name,value,at){
        name=text(name);if(!name||!level(value)||!this.zone||!this.visit||!Number.isFinite(at)||at<this.anchorAt)return;
        const key=normalizeWikiIdentity(name),samples=this.readings.get(key)||[];
        samples.push({name,level:value,at});this.readings.delete(key);this.readings.set(key,samples.filter(sample=>at-sample.at<=CONSIDER_MAX_AGE_MS).slice(-MAX_SAMPLES));
        while(this.readings.size>MAX_TARGETS)this.readings.delete(this.readings.keys().next().value);
    }
    levelFor(name,at){
        if(!this.zone||!this.visit||!Number.isFinite(at))return null;
        const pack=this.getPack()||{};if(this.resolverPack!==pack){this.resolverPack=pack;this.resolver=createWikiResolver(pack);}const resolver=this.resolver,identity=value=>{const found=resolver.resolve('npc',value);return found.membership==='ambiguous'?null:normalizeWikiIdentity(found.canonicalTitle||value);},key=identity(name);if(!key)return null;
        const samples=[...this.readings.values()].flat().filter(sample=>identity(sample.name)===key&&sample.at<=at&&at-sample.at<=CONSIDER_MAX_AGE_MS).sort((a,b)=>a.at-b.at).slice(-MAX_SAMPLES);
        if(!samples.length)return null;const latest=samples.at(-1),minimum=Math.min(...samples.map(sample=>sample.level)),maximum=Math.max(...samples.map(sample=>sample.level));
        return {schemaVersion:1,kind:'explicit-con-level',npc:text(name),zone:this.zone,instance:this.instance,instanceId:this.instanceId,visit:this.visit,at:latest.at,level:latest.level,minimum,maximum,samples:samples.length,value:minimum===maximum?minimum:`${minimum}-${maximum}`};
    }
    snapshot(){return {schemaVersion:1,zone:this.zone,shortName:this.shortName,instance:this.instance,instanceId:this.instanceId,visit:this.visit,anchorAt:this.anchorAt,latestAnchorAt:this.latestAnchorAt,readings:[...this.readings.values()].flat()};}
    restore(seed){
        this.reset();if(seed?.schemaVersion!==1||!text(seed.zone)||!Number.isSafeInteger(seed.visit)||seed.visit<1||!Number.isFinite(seed.anchorAt)||!Array.isArray(seed.readings)||seed.readings.length>MAX_TARGETS*MAX_SAMPLES)return false;
        this.zone=this.canonicalZone(text(seed.zone),text(seed.shortName));this.shortName=text(seed.shortName);this.instanceId=text(seed.instanceId);this.instance=['normal','raid'].includes(seed.instance)?seed.instance:'unknown';this.visit=seed.visit;this.anchorAt=seed.anchorAt;this.latestAnchorAt=Number.isFinite(seed.latestAnchorAt)&&seed.latestAnchorAt>=seed.anchorAt?seed.latestAnchorAt:seed.anchorAt;
        for(const sample of seed.readings)this.consider(sample?.name,sample?.level,sample?.at);
        return true;
    }
}

export function validConsiderLevelProof(proof,{name,zone,instance='unknown',visit,at}={}){
    return proof?.schemaVersion===1&&proof.kind==='explicit-con-level'&&normalizeWikiIdentity(proof.npc)===normalizeWikiIdentity(name)&&normalizeWikiIdentity(proof.zone)===normalizeWikiIdentity(zone)&&Number.isSafeInteger(proof.visit)&&proof.visit>0&&proof.visit===visit&&typeof proof.instanceId==='string'&&proof.instanceId.length<=230&&
        ['normal','raid','unknown'].includes(proof.instance)&&(!['normal','raid'].includes(instance)||proof.instance==='unknown'||proof.instance===instance)&&
        Number.isFinite(proof.at)&&Number.isFinite(at)&&proof.at<=at&&at-proof.at<=CONSIDER_MAX_AGE_MS&&level(proof.level)&&level(proof.minimum)&&level(proof.maximum)&&proof.minimum<=proof.level&&proof.level<=proof.maximum&&
        Number.isSafeInteger(proof.samples)&&proof.samples>0&&proof.samples<=MAX_SAMPLES&&proof.value===(proof.minimum===proof.maximum?proof.minimum:`${proof.minimum}-${proof.maximum}`);
}
