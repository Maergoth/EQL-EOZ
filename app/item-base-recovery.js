import { scaleItemStat, getItemScalingRules, getItemScalingRevision, getItemScalingIdentity, itemStatFamily } from './item-scaling.js';

// An inverse is a reviewed proposal under an explicit tier/unit/modifier
// contract. It never replaces the observation or confirms/publishes a field.
export const ITEM_BASE_RECOVERY_VERSION = 2;
export const ITEM_BASE_RECOVERY_LIMITS = Object.freeze({ min:-2147483648,max:2147483647,fields:64,sample:16 });
export const ITEM_BASE_RECOVERY_CONTRACT = Object.freeze({
    forward:'app/item-scaling.js',
    wiki:'https://eqlwiki.com/extensions/ItemLevelSlider/item-scaling-core.js',
    get rulesRevision(){return getItemScalingRevision();},
    get rulesIdentity(){return getItemScalingIdentity();}
});
const STATIC = new Set(['DELAY','COLD_DMG','FIRE_DMG','MAGIC_DMG','POISON_DMG','DISEASE_DMG','CORRUPTION_DMG','CHROMATIC_DMG','PRISMATIC_DMG','ELEMENTAL_DMG','BANE_DMG']);
const ALIASES = Object.freeze({MANA:'MP',ENDURANCE:'END',WEIGHT:'WT',DAMAGE:'DMG',BASE_DMG:'DMG',
    STRENGTH:'STR',STAMINA:'STA',AGILITY:'AGI',DEXTERITY:'DEX',WISDOM:'WIS',INTELLIGENCE:'INT',CHARISMA:'CHA',
    RESISTMAGIC:'SV_MAGIC',RESISTFIRE:'SV_FIRE',RESISTCOLD:'SV_COLD',RESISTPOISON:'SV_POISON',RESISTDISEASE:'SV_DISEASE',RESISTCORRUPTION:'SV_CORRUPTION',SV_VOID:'SV_CORRUPTION',
    HPREGEN:'HP_REGEN',MANAREGEN:'MANA_REGEN',ENDURANCEREGEN:'END_REGEN',ENDURANCE_REGEN:'END_REGEN',MP_REGEN:'MANA_REGEN',
    DAMAGEBONUS:'DMG_BONUS',DAMAGE_BONUS:'DMG_BONUS',BACKSTAB:'BACKSTAB_DMG',BACKSTAB_DAMAGE:'BACKSTAB_DMG',BACKSTABDAMAGE:'BACKSTAB_DMG',ATTACKSPEED:'ATTACK_SPEED',ATTACK:'ATK'});
const canonical = value => {const key=String(value??'').trim().replace(/[ .-]+/g,'_').toUpperCase().slice(0,80);return ALIASES[key]||key;};
const finite = value => typeof value==='number'&&Number.isFinite(value);
const familyOf = key => STATIC.has(key)?'static':['primary','flat','damage','backstab','range','weight'].includes(itemStatFamily(key))?itemStatFamily(key):null;
const point = (index,unit) => index/unit;

function context(options={}) {
    const tier=options?.tier,fraction=options?.fraction,augmentStatus=options?.augmentStatus;
    const maximum=getItemScalingRules().maxTier;
    if(!Number.isInteger(tier)||tier<0||tier>maximum)return {reason:'unknown-or-invalid-tier'};
    if(!Number.isInteger(fraction)||fraction<0||fraction>=2**tier||tier===maximum&&fraction!==0)return {reason:'unknown-or-invalid-fraction'};
    if(!['none','excluded'].includes(augmentStatus))return {reason:'unverified-augment-or-modifier-context'};
    if(augmentStatus==='none'&&Array.isArray(options.augments)&&options.augments.length)return {reason:'contradictory-augment-context'};
    return {tier,fraction,augmentStatus};
}
function domain(family,bounds) {
    const unit=family==='weight'?10:1,absoluteMin=family==='weight'?0:ITEM_BASE_RECOVERY_LIMITS.min,absoluteMax=ITEM_BASE_RECOVERY_LIMITS.max;
    let min=absoluteMin,max=absoluteMax;
    if(bounds!==undefined){
        if(!bounds||!finite(bounds.min)||!finite(bounds.max))return null;
        const low=bounds.min*unit,high=bounds.max*unit;
        if(Math.abs(low-Math.round(low))>1e-7||Math.abs(high-Math.round(high))>1e-7||low<absoluteMin||high>absoluteMax||low>high)return null;
        min=Math.round(low);max=Math.round(high);
    }
    return {min,max,unit,step:1/unit};
}
function firstAtLeast(low,high,target,forward) {
    let right=high+1;
    while(low<right){const middle=low+Math.floor((right-low)/2);if(forward(middle)<target)low=middle+1;else right=middle;}
    return low;
}
function lastAtMost(low,high,target,forward) {
    let left=low-1;
    while(left<high){const middle=left+Math.ceil((high-left)/2);if(forward(middle)>target)high=middle-1;else left=middle;}
    return left;
}
function inverseRanges(key,observed,state,bounds,family) {
    const {min,max,unit}=bounds,forward=index=>scaleItemStat(key,point(index,unit),state.tier,{fraction:state.fraction});
    // Primary scaling has a genuine discontinuity between -11 and -10 near
    // the cap. Searching that whole domain as one monotone curve loses valid
    // penalties/zeroes. Every branch is independently monotone on this grid.
    const threshold=Math.floor(getItemScalingRules().primary.smallThreshold);
    const branches=family==='primary'&&state.tier>0?[[ITEM_BASE_RECOVERY_LIMITS.min,-threshold-1],[-threshold,-1],[0,0],[1,threshold],[threshold+1,ITEM_BASE_RECOVERY_LIMITS.max]]:[[family==='weight'?0:ITEM_BASE_RECOVERY_LIMITS.min,ITEM_BASE_RECOVERY_LIMITS.max]];
    const ranges=[];let outside=false,omittedLow=false,omittedHigh=false;
    // Search the complete declared domain before applying optional narrower
    // review bounds. A hidden disjoint branch must not create false uniqueness.
    for(const [low,high]of branches){
        const first=firstAtLeast(low,high,observed,forward),last=lastAtMost(low,high,observed,forward);
        if(first>last||first>high||last<low||forward(first)!==observed||forward(last)!==observed){
            if(low===(family==='weight'?0:ITEM_BASE_RECOVERY_LIMITS.min)&&forward(low)>observed||high===ITEM_BASE_RECOVERY_LIMITS.max&&forward(high)<observed)outside=true;
            continue;
        }
        const clippedLow=first<min||first===ITEM_BASE_RECOVERY_LIMITS.min&&forward(first-1)===observed,clippedHigh=last>max||last===ITEM_BASE_RECOVERY_LIMITS.max&&forward(last+1)===observed;
        omittedLow ||= clippedLow;omittedHigh ||= clippedHigh;
        const start=Math.max(min,first),end=Math.min(max,last);if(start>end){outside=true;continue;}
        ranges.push({low:start,high:end,clippedLow,clippedHigh});
    }
    const merged=[];
    for(const range of ranges.sort((a,b)=>a.low-b.low)){const prior=merged.at(-1);if(prior&&range.low<=prior.high+1){prior.high=Math.max(prior.high,range.high);prior.clippedHigh=range.clippedHigh;prior.clippedLow=prior.clippedLow||range.clippedLow;}else merged.push({...range});}
    if(omittedLow&&merged.length)merged[0].clippedLow=true;if(omittedHigh&&merged.length)merged.at(-1).clippedHigh=true;
    return {ranges:merged,outside,forward};
}
function describeRanges(ranges,unit) {
    return ranges.map(range=>({min:point(range.low,unit),max:point(range.high,unit),step:1/unit,count:range.high-range.low+1,
        clipped:Boolean(range.clippedLow||range.clippedHigh),clippedLow:Boolean(range.clippedLow),clippedHigh:Boolean(range.clippedHigh)}));
}
function sampleRanges(ranges,unit,count) {
    const samples=[],half=ITEM_BASE_RECOVERY_LIMITS.sample/2;
    for(const range of ranges)for(let index=range.low;index<=range.high&&samples.length<(count<=ITEM_BASE_RECOVERY_LIMITS.sample?ITEM_BASE_RECOVERY_LIMITS.sample:half);index++)samples.push(point(index,unit));
    if(count>ITEM_BASE_RECOVERY_LIMITS.sample){const tail=[];for(const range of [...ranges].reverse())for(let index=range.high;index>=range.low&&tail.length<half;index--)tail.push(point(index,unit));samples.push(...tail.reverse());}
    return samples;
}

export function recoverItemBaseStat(inputKey,observed,options={}) {
    const key=canonical(inputKey),family=familyOf(key),state=context(options),bounds=domain(family,options?.bounds);
    const provenance={version:ITEM_BASE_RECOVERY_VERSION,...ITEM_BASE_RECOVERY_CONTRACT,key,inputKey:String(inputKey??'').slice(0,80),
        tier:Number.isInteger(options?.tier)?options.tier:null,fraction:Number.isInteger(options?.fraction)?options.fraction:null,
        augmentStatus:options?.augmentStatus||'unknown',domain:bounds?{min:point(bounds.min,bounds.unit),max:point(bounds.max,bounds.unit),step:bounds.step}:null,
        assumptions:['observed item stats exclude augments and other modifiers','integer base stats; weight uses tenths','current forward rules apply'],
        limits:['bounded base domain','an inverse is not proof that OCR or item identity is correct','no automatic publication']};
    const result={key,observed,status:'unknown',value:null,candidates:[],candidateCount:0,ranges:[],sampleTruncated:false,reason:'',provenance,autoPublish:false};
    if(!family)return {...result,status:'unsupported',reason:key==='SV_CORRUPTION'?'contextual-void-resist-not-an-independent-base':key==='DMG_BONUS'?'damage-bonus-is-derived-or-contextual':'unsupported-stat'};
    if(!finite(observed))return {...result,reason:'unknown-or-nonnumeric-observation'};
    if(state.reason)return {...result,reason:state.reason};
    if(!bounds)return {...result,reason:'invalid-base-domain'};
    if(family!=='weight'&&!Number.isInteger(observed))return {...result,reason:'observation-outside-integer-stat-grid'};
    if(family==='weight'&&(observed<0||Math.abs(observed*10-Math.round(observed*10))>1e-7))return {...result,reason:'observation-outside-weight-grid'};
    const inverse=inverseRanges(key,observed,state,bounds,family),candidateCount=inverse.ranges.reduce((sum,range)=>sum+range.high-range.low+1,0),ranges=describeRanges(inverse.ranges,bounds.unit),
        details={...result,candidateCount,ranges,candidates:sampleRanges(inverse.ranges,bounds.unit,candidateCount),sampleTruncated:candidateCount>ITEM_BASE_RECOVERY_LIMITS.sample};
    if(!candidateCount)return {...details,reason:inverse.outside?'outside-base-domain':'no-forward-roundtrip'};
    // Forward weight now exactly shares the wiki's ceiling. Keep reverse weight
    // diagnostic: decimal floating boundaries need a stronger inverse-domain
    // contract before a captured weight can be certified as an item base.
    if(family==='weight'&&state.tier>0&&observed>0)return {...details,reason:'weight-inverse-not-certified'};
    const clipped=ranges.some(range=>range.clipped);
    return {...details,status:candidateCount===1&&!clipped?'exact':'range',value:candidateCount===1&&!clipped?details.candidates[0]:null,
        reason:clipped?'bounded-range-clipped':candidateCount===1?'unique-forward-roundtrip':'multiple-forward-roundtrips'};
}

export function recoverItemBaseStats(stats,options={}) {
    const fields={},sourceKeys={},warnings=[];
    if(!stats||typeof stats!=='object'||Array.isArray(stats))return {fields,sourceKeys,warnings:['invalid-stat-block'],provenance:{version:ITEM_BASE_RECOVERY_VERSION,...ITEM_BASE_RECOVERY_CONTRACT},autoPublish:false};
    const entries=Object.entries(stats);
    for(const [inputKey,value]of entries.slice(0,ITEM_BASE_RECOVERY_LIMITS.fields)){
        const key=canonical(inputKey),next=recoverItemBaseStat(inputKey,value,options);
        (sourceKeys[key]??=[]).push(inputKey);
        if(fields[key]&&fields[key].observed!==value)fields[key]={...next,status:'unknown',value:null,candidates:[],candidateCount:0,ranges:[],reason:'conflicting-stat-aliases'};
        else if(!fields[key])fields[key]=next;
    }
    if(entries.length>ITEM_BASE_RECOVERY_LIMITS.fields)warnings.push('stat-block-truncated');
    return {fields,sourceKeys,warnings,provenance:{version:ITEM_BASE_RECOVERY_VERSION,...ITEM_BASE_RECOVERY_CONTRACT},autoPublish:false};
}

export function isItemBaseCandidate(key,base,observed,options={}) {
    const result=recoverItemBaseStat(key,observed,options);
    if(!['exact','range'].includes(result.status)||!finite(base))return false;
    const inRange=result.ranges.some(range=>base>=range.min&&base<=range.max&&Math.abs((base-range.min)/range.step-Math.round((base-range.min)/range.step))<1e-7);
    return inRange&&scaleItemStat(result.key,base,options.tier,{fraction:options.fraction})===observed;
}
