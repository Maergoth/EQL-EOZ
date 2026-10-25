import './vendor/item-scaling-core.js';
import bundledRules from './vendor/item-scaling-rules.js';

// Every app version ships the wiki-owned engine and reviewed rules together.
// Formula changes arrive through app releases; no runtime refresh or override.
const core=globalThis.EQLItemScalingCore;
const engine=core.createEngine(bundledRules);
const canonical=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const identity=rules=>JSON.stringify(canonical(rules));
const snapshotIdentity=identity(engine.rules);
export const getItemScalingRules=()=>engine.rules;
export const getItemScalingRevision=()=>engine.revision;
export const getItemScalingIdentity=()=>snapshotIdentity;
export const itemStatFamily=key=>engine.statFamily(key);
export const itemEffectiveLevel=(fullLevel,fraction=0)=>engine.effectiveLevel(fullLevel,fraction);
export const scaleItemStat=(key,value,fullLevel,options={})=>value===null?null:engine.scaleStat(key,value,fullLevel,options);

/** Catalog cards need whole-item context for conditional weapon Accuracy and
 * Void resist. Recorded examine/character totals never pass through here. */
export function scaledItemStats(item={},fullLevel,options={}) {
    const stats={...(item.stats||{})},details=Array.isArray(item.details)?item.details:Array.isArray(item.cardDetails)?item.cardDetails:[];
    const lines=Array.isArray(item.displayLines)?item.displayLines:[];
    const detail=label=>details.find(value=>value?.label===label)?.value||'';
    const slotText=detail('Slot')||lines.find(line=>/^Slot:/i.test(line))?.replace(/^Slot:\s*/i,'')||'';
    const slots=options.slots??(Array.isArray(item.slots)?item.slots.length?item.slots:slotText:item.slots||slotText);
    const skill=String(detail('Skill')||lines.find(line=>/^Skill:/i.test(line))?.replace(/^Skill:\s*/i,'').replace(/\s+(?:Atk\s+)?Delay:.*$/i,'')||'');
    const classes=String(detail('Class')||(Array.isArray(item.classes)?item.classes.join(' '):'')||lines.find(line=>/^Class:/i.test(line))?.replace(/^Class:\s*/i,'')||'');
    // Itembox's wiki template supplies a Backstab baseline for rogue piercing
    // weapons. Apply the shared engine to that baseline once, like the wiki.
    if(!Object.hasOwn(stats,'BACKSTAB_DMG')&&!Object.hasOwn(stats,'BACKSTAB')&&/\b(?:ROG|ALL)\b/i.test(classes)&&/^(?:1H )?Piercing$/i.test(skill)&&Number.isFinite(stats.DMG)&&stats.DMG>0)stats.BACKSTAB_DMG=stats.DMG;
    const explicitAccuracy=Object.hasOwn(stats,'ACCURACY');
    const accuracyPercent=options.accuracyPercent??item.accuracyPercent??(/\bAccuracy\s*:\s*[+\-]?\d+(?:\.\d+)?\s*%/i.test(lines.join('\n'))?true:explicitAccuracy?false:undefined);
    const known={},unknown={};
    for(const [key,value]of Object.entries(stats)){
        const numeric=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
        if(Number.isFinite(numeric))Object.defineProperty(known,key,{value:numeric,enumerable:true});
        else Object.defineProperty(unknown,key,{value:null,enumerable:true});
    }
    return {...engine.scaleItemStats(known,fullLevel,{...options,slots,accuracyPercent}),...unknown};
}
