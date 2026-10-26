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

const catalogStatAliases=Object.freeze({BACKSTAB:'BACKSTAB_DMG',BACKSTAB_DAMAGE:'BACKSTAB_DMG',BACKSTAB_DMG:'BACKSTAB_DMG',ATK_DELAY:'DELAY',ATTACK_DELAY:'DELAY',DELAY:'DELAY',DMG_BON:'DMG_BONUS',DAMAGE_BON:'DMG_BONUS',DAMAGE_BONUS:'DMG_BONUS',DMG_BONUS:'DMG_BONUS'});
const catalogStatKey=label=>core.canonicalStatKey(label)==='SV_CORRUPTION'?'SV_CORRUPTION':catalogStatAliases[String(label).trim().toUpperCase().replace(/[\s.-]+/g,'_')];
const literalNumber=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^[+\-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())&&Number.isFinite(Number(value))?Number(value):null;
// Older catalog cards group ordinary resist fields on one display line. Only a
// complete line of recognized resist atoms qualifies; embedded prose does not.
const resistLabel='(?:SV[\\s._-]*(?:MAGIC|FIRE|COLD|DISEASE|POISON|VOID|CORRUPTION)|VOID|CORRUPTION|RESISTVOID|RESISTCORRUPTION)';
const resistValue='(?:[+\\-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)|\\?|unknown)';
const catalogResistLine=new RegExp(`^${resistLabel}\\s*:\\s*${resistValue}(?:\\s+${resistLabel}\\s*:\\s*${resistValue})*$`,'i');
const catalogResistFields=new RegExp(`(${resistLabel})\\s*:\\s*(${resistValue})`,'gi');

/** Recover explicit weapon/Void catalog fields omitted by older packs. Structured own
 * values, including zero/unknown, win. Conflicting or nonliteral card values
 * stay unknown; notes and observed examine text are never consulted. A saved
 * catalog base can fill only these missing fields from a refreshed record. */
export function catalogBaseStats(item={},preservedStats) {
    const stats={...(preservedStats??item.stats??{})},aliases=new Map(),explicit=new Map();
    const collect=(values,key,value)=>{if(!key)return;const numeric=literalNumber(value);values.set(key,values.has(key)&&values.get(key)!==numeric?null:numeric);};
    for(const [label,value]of Object.entries(stats)){
        const key=catalogStatKey(label);if(!key||label===key)continue;
        collect(aliases,key,value);delete stats[label];
    }
    for(const [key,value]of aliases)if(!Object.hasOwn(stats,key))stats[key]=value;
    if(preservedStats!==undefined){
        const fresh=catalogBaseStats(item);
        for(const key of ['BACKSTAB_DMG','DELAY','DMG_BONUS','SV_CORRUPTION'])if(!Object.hasOwn(stats,key)&&Object.hasOwn(fresh,key))stats[key]=fresh[key];
        return stats;
    }
    for(const raw of (Array.isArray(item.displayLines)?item.displayLines:[]).slice(0,32)){
        if(typeof raw!=='string'||raw.length>400)continue;
        const line=raw.trim(),direct=line.match(/^([^:\r\n]{1,60}):\s*(.*?)\s*$/);
        if(catalogResistLine.test(line)){for(const field of line.matchAll(catalogResistFields))collect(explicit,catalogStatKey(field[1]),field[2]);}
        else if(direct)collect(explicit,catalogStatKey(direct[1]),direct[2]);
        const skill=line.match(/^Skill:\s*[\w /&-]{1,80}?\s+(?:Atk\s+|Attack\s+)?Delay:\s*(.*?)\s*$/i);
        if(skill)collect(explicit,'DELAY',skill[1]);
    }
    const details=Array.isArray(item.details)?item.details:Array.isArray(item.cardDetails)?item.cardDetails:[];
    for(const detail of details.slice(0,32))if(typeof detail?.label==='string'&&detail.label.length<=60&&typeof detail.value==='string'&&detail.value.length<=400)collect(explicit,catalogStatKey(detail.label),detail.value);
    for(const [key,value]of explicit)if(!Object.hasOwn(stats,key))stats[key]=value;
    return stats;
}

/** Catalog cards need whole-item context for conditional weapon Accuracy and
 * Void resist. Recorded examine/character totals never pass through here. */
export function scaledItemStats(item={},fullLevel,options={}) {
    const stats=catalogBaseStats(item),details=Array.isArray(item.details)?item.details:Array.isArray(item.cardDetails)?item.cardDetails:[];
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
    // Unknown authored keys still establish field presence. In particular, a
    // null Void alias must suppress generated Void rather than create two fields.
    return {...engine.scaleItemStats({...known,...unknown},fullLevel,{...options,slots,accuracyPercent}),...unknown};
}
