import { scaleItemStat } from './item-scaling.js';

// Local, versioned data only. This module has no DOM, capture, network or wiki
// write dependency. One candidate represents one physical copy, not a title.
export const CHARACTER_STORAGE_KEY = 'eql-eye-of-zomm-character-v1';
export const CHARACTER_LIMITS = Object.freeze({ candidates:120, evidence:6, stats:48, augments:8, observationRefs:6000, removedObservations:1000, removedInstances:100, storageBytes:1500000, iconBytes:24000, rawStatBlock:8192, rawStatLines:60 });
export const CHARACTER_STAT_KEYS = Object.freeze(['AC','AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','HP','MP','END','ATK','ATK_OFFENSE','ATK_ACCURACY','STR','STA','AGI','DEX','WIS','INT','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE','HP_REGEN','MANA_REGEN','END_REGEN','HASTE']);
const STAT_LABELS=Object.freeze({MP:'Mana',END:'Endurance',ATK:'Attack',AC_MITIGATION:'Mitigation AC',AC_MITIGATION_SOFTCAP:'AC softcap',AC_EVASION:'Evasion AC',
    ATK_OFFENSE:'Offense',ATK_ACCURACY:'Accuracy',SV_MAGIC:'Magic resist',SV_FIRE:'Fire resist',SV_COLD:'Cold resist',SV_POISON:'Poison resist',SV_DISEASE:'Disease resist',
    SV_CORRUPTION:'Void resist',ATTACK_SPEED:'Attack speed %',DMG_BONUS:'Damage bonus',BACKSTAB_DMG:'Backstab dmg',HP_REGEN:'HP regen',MANA_REGEN:'Mana regen',END_REGEN:'End. regen'});
export const characterStatLabel=key=>STAT_LABELS[key] || String(key||'').replace(/_/g,' ');
export const CHARACTER_SLOTS = Object.freeze([
    ['charm','Charm','CHARM'],['ear1','Left ear','EAR'],['head','Head','HEAD'],['face','Face','FACE'],['ear2','Right ear','EAR'],
    ['neck','Neck','NECK'],['shoulders','Shoulders','SHOULDERS'],['arms','Arms','ARMS'],['back','Back','BACK'],
    ['wrist1','Left wrist','WRIST'],['wrist2','Right wrist','WRIST'],['range','Range','RANGE'],['hands','Hands','HANDS'],
    ['primary','Primary','PRIMARY'],['secondary','Secondary','SECONDARY'],['finger1','Left finger','FINGER'],['finger2','Right finger','FINGER'],
    ['chest','Chest','CHEST'],['legs','Legs','LEGS'],['feet','Feet','FEET'],['waist','Waist','WAIST'],['ammo','Ammo','AMMO'],['power','Power source','POWER SOURCE'],
    ['any1','Any slot 1','UNIVERSAL'],['any2','Any slot 2','UNIVERSAL']
].map(([id,label,kind]) => Object.freeze({id,label,kind,...(kind==='UNIVERSAL'?{universal:true}:{})})));
const SLOT_BY_ID = new Map(CHARACTER_SLOTS.map(slot => [slot.id,slot]));
const SLOT_KINDS = new Set(CHARACTER_SLOTS.filter(slot=>!slot.universal).map(slot => slot.kind));
const clean = (value, limit=240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,limit);
const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
const numeric = value => finite(value) ? value : typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()) && finite(Number(value)) ? Number(value) : null;
// Dates use milliseconds since the epoch, independently of bounded stat values.
const atTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15 ? value : null;
const journalSequence = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const list = value => Array.isArray(value) ? value : [];
const has = (object,key) => Object.prototype.hasOwnProperty.call(object || {},key);
const fullTier = value => Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
const tierFraction = (value,tier) => tier === null || numeric(value) === null ? null : Math.max(0,Math.min(2 ** tier - 1,Math.floor(numeric(value))));
const keyFor = value => clean(value,32).toUpperCase().replace(/[ -]+/g,'_');
const rawStatBlock = value => String(value ?? '').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').split('\n').slice(0,CHARACTER_LIMITS.rawStatLines).join('\n').trim().slice(0,CHARACTER_LIMITS.rawStatBlock);
const EDITABLE_CAPTURE_FIELDS=new Set(['name','wikiTitle','slots','tier','fraction','rawStatBlock','level']);

/** Tier is separate metadata. Remove only complete trailing +0..+10 labels;
 * never infer a numeric tier or alter the original OCR observation. */
export function characterBaseItemName(value) {
    return clean(value).replace(/(?:\s*\+(?:10|[0-9]))+\s*$/u,'').trim();
}
const identityName=value=>characterBaseItemName(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const identityTitle=value=>clean(value).normalize('NFKC').replace(/_/g,' ').toLowerCase();
function catalogIdentity(value) {
    if(!value||typeof value!=='object')return null;
    const name=characterBaseItemName(value.name||value.wikiTitle),wikiTitle=clean(value.wikiTitle||value.name);
    return name&&wikiTitle?{name,wikiTitle,match:['exact','fuzzy','manual'].includes(value.match)?value.match:'manual'}:null;
}
export function characterEquipmentEligibility(candidate) {
    const identity=catalogIdentity(candidate?.catalogIdentity),known=Boolean(identity&&identityName(candidate?.name)===identityName(identity.name)&&identityTitle(candidate?.wikiTitle)===identityTitle(identity.wikiTitle));
    return {known,canEquip:known,reason:known?'':'Choose a known cached item match before equipping this copy.'};
}

export function normalizeCharacterStats(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const [rawKey,rawValue] of Object.entries(value).slice(0,CHARACTER_LIMITS.stats)) {
        const key = keyFor(rawKey);
        if (/^[A-Z][A-Z0-9_]{0,31}$/.test(key)) result[key] = numeric(rawValue);
    }
    return result;
}

export function characterSlotKinds(value) {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,|;]/) : [];
    return [...new Set(values.slice(0,30).map(slot => clean(slot,40).toUpperCase().replace(/_/g,' '))
        .map(slot => ({EARS:'EAR',WRISTS:'WRIST',FINGERS:'FINGER',RANGED:'RANGE',POWERSOURCE:'POWER SOURCE'}[slot] || SLOT_BY_ID.get(slot.toLowerCase())?.kind || slot))
        .filter(slot => slot === 'ANY' || SLOT_KINDS.has(slot)))];
}

// Raster data only; a remote URL, HTML/SVG or an arbitrarily large data URL is
// never persisted or handed to an image decoder. IDs remain separate/exact.
export function safeCharacterIcon(value) {
    return typeof value === 'string' && value.length <= CHARACTER_LIMITS.iconBytes && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

function evidenceRecord(value={}) {
    const captured = typeof value.capturedAt === 'string' ? Date.parse(value.capturedAt) : null;
    return { observationId:clean(value.observationId || value.id,180), sessionId:clean(value.sessionId,180), source:clean(value.source,80),
        at:atTime(value.at ?? value.timestamp ?? captured), confidence:numeric(value.confidence), text:clean(value.text || value.rawText || value.evidence?.text,1600),
        region:clean(typeof value.region === 'string' ? value.region : value.region?.name,100), parserVersion:clean(value.parserVersion || value.parser?.version,50) };
}

const OBSERVATION_STATS = Object.freeze({ac:'AC',acMitigation:'AC_MITIGATION',acMitigationSoftcap:'AC_MITIGATION_SOFTCAP',acEvasion:'AC_EVASION',
    attackOffense:'ATK_OFFENSE',attackAccuracy:'ATK_ACCURACY',hp:'HP',mana:'MP',endurance:'END',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',
    resistPoison:'SV_POISON',resistMagic:'SV_MAGIC',resistDisease:'SV_DISEASE',resistFire:'SV_FIRE',resistCold:'SV_COLD',resistCorruption:'SV_CORRUPTION',
    weight:'WT',damage:'DMG',damageBonus:'DMG_BONUS',backstabDamage:'BACKSTAB_DMG',delay:'DELAY',hpCurrent:'HP_CURRENT',hpMaximum:'HP_MAXIMUM',manaCurrent:'MP_CURRENT',manaMaximum:'MP_MAXIMUM',
    enduranceCurrent:'END_CURRENT',enduranceMaximum:'END_MAXIMUM',attack:'ATK',attackMelee:'ATK_MELEE',attackRanged:'ATK_RANGED',attackSpeed:'ATTACK_SPEED',haste:'HASTE',hpRegen:'HP_REGEN',manaRegen:'MANA_REGEN',enduranceRegen:'END_REGEN'});

/** Adapt the capture parser's immutable field proposals to editable character
 * inputs. Unknown fields stay in the original observation/journal, not in sums.
 * Current/max resources remain separate; no max/total/base value is inferred.
 */
export function characterObservationInput(observation={}) {
    if (!Array.isArray(observation.fields)) return observation.item || observation.fields?.item || observation.fields || observation;
    const fields=Object.fromEntries(observation.fields.slice(0,100).filter(field=>typeof field?.key==='string').map(field=>[field.key,field.value]));
    const stats={};
    for (const [key,target] of Object.entries(OBSERVATION_STATS)) if(has(fields,key)) stats[target]=fields[key];
    const block=fields.rawStatBlock ?? fields.statBlockText ?? (has(fields,'statLines')?list(fields.statLines).join('\n'):undefined);
    return {name:fields.name || observation.subject?.name,tier:fields.tier,fraction:fields.fraction,slots:fields.slots,stats,...(block!==undefined?{rawStatBlock:block}:{}),
        level:fields.requiredLevel,augments:list(fields.augmentNames).map(name=>({name})),augmentStatus:'unknown',statsComplete:false};
}
function metadata(value={}) {
    const aaCount=numeric(value.aaCount);
    return { name:clean(value.name,120), server:clean(value.server,100), level:numeric(value.level), race:clean(value.race,80),
        classes:[...new Set(list(value.classes).slice(0,3).map(value => clean(value,40)).filter(Boolean))],
        aaCount:Number.isInteger(aaCount) && aaCount >= 0 ? aaCount : null, sessionName:clean(value.sessionName,120) };
}
function augmentRecord(value={}) {
    return {name:clean(value.name), id:clean(value.id,120), stats:normalizeCharacterStats(value.stats), statsComplete:value.statsComplete === true};
}
const automaticObservation=value=>Boolean(value&&((value.kind==='ocr'||value.source==='ocr')&&(!value.subject?.kind||value.subject.kind==='item')||Array.isArray(value.fields)&&value.subject?.kind==='item'));
function normalizeCandidate(value={}) {
    const tier = fullTier(value.tier);
    const evidence=list(value.evidence).slice(-CHARACTER_LIMITS.evidence).map(evidenceRecord),captured=evidence.some(record=>record.observationId&&(record.parserVersion||record.source==='ocr'));
    const observedTier=has(value,'observedTier')?fullTier(value.observedTier):captured&&!list(value.editedFields).some(key=>key==='tier'||key==='fraction')?tier:null;
    return { id:clean(value.id,100), instanceKey:clean(value.instanceKey,200), name:characterBaseItemName(value.name), observedName:has(value,'observedName')?clean(value.observedName):list(value.evidence).some(record=>record?.observationId||record?.text)?clean(value.name):'', wikiTitle:clean(value.wikiTitle),catalogIdentity:catalogIdentity(value.catalogIdentity),
        origin:['automatic','manual'].includes(value.origin)?value.origin:captured?'automatic':'manual',legacyManualStats:value.legacyManualStats===true||!has(value,'origin')&&!captured,lastObservedAt:atTime(value.lastObservedAt)??evidence.reduce((latest,record)=>record.at!==null?Math.max(latest??0,record.at):latest,null),lastObservedSequence:journalSequence(value.lastObservedSequence),
        observedTier,observedFraction:tierFraction(has(value,'observedFraction')?value.observedFraction:value.fraction,observedTier),statBasis:value.statBasis==='catalog-tier-preview'?'catalog-tier-preview':'observed',previewWarning:clean(value.previewWarning,300),slotReadWarning:clean(value.slotReadWarning,300),
        wikiMatch:['confirmed','suggested','unmatched'].includes(value.wikiMatch) ? value.wikiMatch : 'unmatched',
        iconId:clean(value.iconId,120), icon:safeCharacterIcon(value.icon), slots:characterSlotKinds(value.slots), tier,
        fraction:tierFraction(value.fraction,tier),
        observedStats:normalizeCharacterStats(value.observedStats), baseStats:normalizeCharacterStats(value.baseStats),
        editedStatKeys:[...new Set(list(value.editedStatKeys).map(keyFor).filter(key=>/^[A-Z][A-Z0-9_]{0,31}$/.test(key)))].slice(-CHARACTER_LIMITS.stats*2),
        editedFields:[...new Set(list(value.editedFields).filter(key=>EDITABLE_CAPTURE_FIELDS.has(key)))],
        unscaledStatKeys:[...new Set(list(value.unscaledStatKeys).slice(0,CHARACTER_LIMITS.stats).map(keyFor).filter(key=>/^[A-Z][A-Z0-9_]{0,31}$/.test(key)))],
        observedStatsComplete:value.observedStatsComplete === true, baseStatsComplete:value.baseStatsComplete === true,
        augments:list(value.augments).slice(0,CHARACTER_LIMITS.augments).map(augmentRecord),
        augmentStatus:['none','included','excluded','unknown'].includes(value.augmentStatus) ? value.augmentStatus : 'unknown',
        level:numeric(value.level), notes:clean(value.notes,600), rawStatBlock:rawStatBlock(value.rawStatBlock ?? value.statBlockText ?? list(value.statLines).join('\n')),evidence,
        createdAt:atTime(value.createdAt), updatedAt:atTime(value.updatedAt), seenCount:Math.max(1,Math.min(100000,Math.floor(numeric(value.seenCount)||1))) };
}
function statSnapshot(value) {
    if (!value || typeof value !== 'object') return null;
    return {stats:normalizeCharacterStats(value.stats || value.values), label:clean(value.label,100), at:atTime(value.at ?? value.timestamp),
        notes:clean(value.notes,600), evidence:evidenceRecord(value.evidence || value), confirmed:value.confirmed === true};
}
function emptyState() {
    return {schemaVersion:1, sequence:0, metadata:metadata(), candidates:[], equipment:{}, pendingEquipment:{}, statSnapshots:{base:null,equipped:null}, observationRefs:[],observationFloor:0,removedObservations:[],removedInstances:[],updatedAt:null};
}
function normalizeState(value) {
    const result = emptyState();
    if (value?.schemaVersion !== 1) return result;
    result.metadata = metadata(value.metadata); result.sequence = Math.max(0,Math.min(1e9,Math.floor(numeric(value.sequence)||0)));
    const seen = new Set();
    for (const record of list(value.candidates).slice(-CHARACTER_LIMITS.candidates)) {
        const candidate = normalizeCandidate(record);
        if (!candidate.id || seen.has(candidate.id)) continue;
        result.candidates.push(candidate); seen.add(candidate.id);
    }
    const assigned = new Set();
    for (const slot of CHARACTER_SLOTS) {
        const id = clean(value.equipment?.[slot.id],100);
        if (seen.has(id) && !assigned.has(id)) {
            const candidate=result.candidates.find(item=>item.id===id);
            (characterSlotCompatibility(candidate,slot.id).compatible?result.equipment:result.pendingEquipment)[slot.id]=id; assigned.add(id);
        }
        const pendingId=clean(value.pendingEquipment?.[slot.id],100);
        if(!result.equipment[slot.id]&&!result.pendingEquipment[slot.id]&&seen.has(pendingId)&&!assigned.has(pendingId)){result.pendingEquipment[slot.id]=pendingId;assigned.add(pendingId);}
    }
    result.statSnapshots = {base:statSnapshot(value.statSnapshots?.base),equipped:statSnapshot(value.statSnapshots?.equipped)};
    result.observationFloor=journalSequence(value.observationFloor)||0;
    const references=new Map();
    for(const record of list(value.observationRefs)) {
        const observationId=clean(record?.observationId,180),sessionId=clean(record?.sessionId,180),candidateId=clean(record?.candidateId,100),sequence=journalSequence(record?.sequence);
        if(observationId)references.set(JSON.stringify([sessionId,observationId]),{observationId,sessionId,candidateId:seen.has(candidateId)?candidateId:'',sequence});
    }
    result.observationRefs=[...references.values()];
    for(const record of result.observationRefs.splice(0,Math.max(0,result.observationRefs.length-CHARACTER_LIMITS.observationRefs)))result.observationFloor=Math.max(result.observationFloor,record.sequence||0);
    result.removedObservations=list(value.removedObservations).slice(-CHARACTER_LIMITS.removedObservations).map(record=>({observationId:clean(record?.observationId,180),sessionId:clean(record?.sessionId,180)})).filter(record=>record.observationId);
    result.removedInstances=list(value.removedInstances).slice(-CHARACTER_LIMITS.removedInstances).map(record=>({instanceKey:clean(record?.instanceKey,200),variant:normalizeCandidate(record?.variant),at:atTime(record?.at)})).filter(record=>record.instanceKey&&record.at!==null);
    result.updatedAt=atTime(value.updatedAt); return result;
}

/** Effective item values are separate from both catalog base and observed totals.
 * Observed examine stats take precedence and are never scaled again. Unknown
 * tier prevents scaling catalog stats. Augments add only when explicitly excluded.
 */
export function characterItemStats(candidate) {
    const item = normalizeCandidate(candidate),previewRequested=item.statBasis==='catalog-tier-preview',preview=previewRequested&&characterEquipmentEligibility(item).known&&Object.keys(item.baseStats).length>0, observed = !preview&&Object.keys(item.observedStats).length > 0;
    const bases=preview?Object.fromEntries([...new Set([...Object.keys(item.baseStats),...Object.keys(item.observedStats)])].map(key=>[key,has(item.baseStats,key)?item.baseStats[key]:null])):item.baseStats;
    const stats = observed ? {...item.observedStats} : Object.fromEntries(Object.entries(bases).map(([key,value]) =>
        [key,value === null || item.tier === null || item.fraction === null || item.tier>0&&item.unscaledStatKeys.includes(key) ? null : scaleItemStat(key,value,item.tier,{fraction:item.fraction})]));
    const warnings = [];
    const suffix=item.observedName.match(/(?:\s*\+(?:10|[0-9]))+\s*$/u)?.[0],writtenTiers=suffix?[...suffix.matchAll(/\+(10|[0-9])/g)].map(match=>Number(match[1])):[];
    const nameTier=preview?item.observedTier:item.tier;
    if(new Set(writtenTiers).size>1||nameTier!==null&&writtenTiers.some(tier=>tier!==nameTier))warnings.push('The written name tier conflicts with another tier value; review the original item reading.');
    if(item.previewWarning)warnings.push(item.previewWarning);
    if(item.slotReadWarning)warnings.push(item.slotReadWarning);
    if(previewRequested&&!preview)warnings.push('Catalog tier preview is unavailable; captured values remain unchanged.');
    if(preview)warnings.push('Catalog tier preview; captured item values remain unchanged and are not rescaled.');
    let complete = observed ? item.observedStatsComplete : item.baseStatsComplete && item.tier !== null && item.fraction !== null;
    let uncertainAll = false;
    if (!observed && item.tier === null) warnings.push('Item tier is unknown; catalog base stats are not an equipped value.');
    if (!observed && item.tier !== null && item.fraction === null) warnings.push('Fractional progress is unknown; review it before scaling catalog base stats.');
    if (!observed && item.tier>0 && item.unscaledStatKeys.length) warnings.push(`Tier adjustment is unverified for ${item.unscaledStatKeys.join(', ')}; those equipped values remain unknown.`);
    if (!complete) warnings.push('Item stats are incomplete.');
    if (item.augmentStatus === 'unknown') { complete=false; uncertainAll=true; warnings.push('Augment presence or stat inclusion needs review.'); }
    if(preview&&item.augmentStatus==='included'){complete=false;uncertainAll=true;warnings.push('Catalog preview does not establish the effects included in the captured augmented item.');}
    if (item.augmentStatus === 'excluded') {
        for (const augment of item.augments) {
            if (!augment.statsComplete) { complete=false; uncertainAll=true; }
            for (const key of new Set([...Object.keys(stats),...Object.keys(augment.stats)])) {
                const left = has(stats,key) ? stats[key] : complete ? 0 : null;
                const right = has(augment.stats,key) ? augment.stats[key] : augment.statsComplete ? 0 : null;
                stats[key] = left === null || right === null ? null : left + right;
            }
        }
        if (!item.augments.length) { complete=false; uncertainAll=true; warnings.push('Excluded augment stats have not been supplied.'); }
    }
    if (Object.values(stats).some(value => value === null)) complete=false;
    return {stats, complete, uncertainAll, basis:preview?'catalog-tier-preview':observed ? 'observed-examine' : 'scaled-catalog', warnings};
}

export function characterSlotCompatibility(candidate, slotId) {
    const slot = SLOT_BY_ID.get(slotId);
    if (!slot) return {compatible:false,unknown:false,warning:'Unknown equipment slot.'};
    const eligibility=characterEquipmentEligibility(candidate);if(!eligibility.canEquip)return {compatible:false,unknown:true,warning:eligibility.reason};
    if(slot.universal)return {compatible:true,unknown:false,warning:''};
    const kinds = characterSlotKinds(candidate?.slots);
    if (!kinds.length) return {compatible:false,unknown:true,warning:'Compatible slots are unknown; confirm the placement.'};
    const compatible = kinds.includes('ANY') || kinds.includes(slot.kind);
    return {compatible,unknown:false,warning:compatible ? '' : `${clean(candidate?.name) || 'Item'} is not listed for ${slot.label}.`};
}

/** Auto-placement never displaces a card or decides between meaningful kinds.
 * Paired ears/wrists/fingers use the first free canonical slot. ANY is reviewed
 * manually, even if the observation lists an additional narrower kind. */
export function characterAutoAssignment(snapshot,candidateId) {
    const state=normalizeState(snapshot),candidate=state.candidates.find(item=>item.id===candidateId);
    if(!candidate)return {ok:false,assigned:false,slot:null,reason:'missing',choices:[]};
    if(!characterEquipmentEligibility(candidate).canEquip)return {ok:true,assigned:false,slot:null,reason:'unknown-catalog',choices:[]};
    const existing=CHARACTER_SLOTS.find(slot=>state.equipment[slot.id]===candidateId);
    if(existing)return {ok:true,assigned:true,slot:existing.id,reason:'already-assigned',choices:[existing.id]};
    const kinds=candidate.slots,choices=CHARACTER_SLOTS.filter(slot=>!slot.universal&&(kinds.includes('ANY')||kinds.includes(slot.kind))).map(slot=>slot.id);
    if(!kinds.length)return {ok:true,assigned:false,slot:null,reason:'unknown-slots',choices};
    if(kinds.includes('ANY'))return {ok:true,assigned:false,slot:null,reason:'any-slot',choices};
    if(kinds.length!==1)return {ok:true,assigned:false,slot:null,reason:'multiple-slot-kinds',choices};
    const slot=choices.find(slot=>!state.equipment[slot]);
    return {ok:true,assigned:Boolean(slot),slot:slot||null,reason:slot?'available':'occupied',choices};
}

/** Loose inventory is a view, never deletion. Equal catalog titles still retain
 * distinct physical IDs; only the exact equipped copy leaves this list. */
export function characterLooseCandidates(snapshot) {
    const state=normalizeState(snapshot),assigned=new Set(Object.values(state.equipment));
    return state.candidates.filter(candidate=>!assigned.has(candidate.id));
}

const ADDITIVE_ESTIMATE_KEYS=new Set(['HP','MP','END','STR','STA','AGI','DEX','WIS','INT','CHA',
    'SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE','SV_CORRUPTION','HP_REGEN','MANA_REGEN','END_REGEN']);
const RESOURCE_GEAR_KEYS=Object.freeze({HP_MAXIMUM:'HP',MP_MAXIMUM:'MP',END_MAXIMUM:'END'});
const FORMULA_COMPONENT_KEYS=new Set(['AC','AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','ATK','ATK_OFFENSE','ATK_ACCURACY','ATK_MELEE','ATK_RANGED','HASTE','ATTACK_SPEED']);

// These estimates intentionally have a smaller claim than a client stat
// calculator. A No Equipment observation supplies the baseline, not the server
// rules, AA ranks, skill values, worn effects, softcaps or resource multipliers.
function equippedEstimates(base,derived,assignedCount) {
    const baseline=base?.stats||{},keys=[...new Set([...Object.keys(derived),...Object.keys(baseline)])],computed={};
    for(const key of keys) {
        const gearKey=RESOURCE_GEAR_KEYS[key]||key,gear=derived[gearKey]||{value:0,complete:assignedCount===0,unknownCandidates:[]};
        const baseValue=has(baseline,key)?baseline[key]:null,record={value:null,complete:false,method:'unknown',baseKey:key,baseValue,baseConfirmed:base?.confirmed===true,
            gearKey,gearValue:gear.value,unknownCandidates:[...gear.unknownCandidates],caveats:[]};
        if(baseValue===null)record.caveats.push('No Equipment baseline is unknown.');
        if(!gear.complete)record.caveats.push('Some assigned item values or augment inclusion are unknown.');
        if(assignedCount===0 && baseValue!==null) {
            record.value=baseValue;record.complete=true;record.method='observed-baseline';
        } else if(ADDITIVE_ESTIMATE_KEYS.has(key)||has(RESOURCE_GEAR_KEYS,key)) {
            record.method='base-plus-gear';
            if(baseValue!==null)record.value=baseValue+gear.value;
            record.complete=baseValue!==null&&gear.complete;
            record.caveats.push('Additive estimate; caps, buffs, worn effects and server modifiers are not applied.');
            if(['HP','MP','END'].includes(gearKey))record.caveats.push('Attribute-derived resource changes and percentage AA bonuses are not calculated.');
            if(key==='AGI')record.caveats.push('Encumbrance changes are not calculated.');
        } else if(/_CURRENT$/.test(key)) {
            record.method='current-resource-unknown';record.gearKey=null;record.gearValue=null;
            record.caveats.push('Current resources cannot be predicted from equipment.');
        } else {
            record.method=FORMULA_COMPONENT_KEYS.has(key)?'formula-unknown':'unsupported';
            if(['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','ATK_OFFENSE','ATK_ACCURACY'].includes(key)) {record.gearKey=null;record.gearValue=null;}
            record.caveats.push(FORMULA_COMPONENT_KEYS.has(key)?'Client component formula, stacking, skills or cap context is unavailable; gear is not added to this component.':'No equipped-total formula is supported for this field.');
        }
        computed[key]=record;
    }
    return computed;
}

export function characterTotals(snapshot) {
    const state = normalizeState(snapshot), assigned = CHARACTER_SLOTS.filter(slot => state.equipment[slot.id]);
    const byId = new Map(state.candidates.map(candidate => [candidate.id,candidate]));
    const gear = assigned.map(slot => ({slot:slot.id,candidateId:state.equipment[slot.id],...characterItemStats(byId.get(state.equipment[slot.id]))}));
    const keys = [...new Set([...CHARACTER_STAT_KEYS,...gear.flatMap(item=>Object.keys(item.stats)),
        ...Object.keys(state.statSnapshots.base?.stats || {}),...Object.keys(state.statSnapshots.equipped?.stats || {})])];
    const derived = {};
    for (const key of keys) {
        let value=0; const unknown=[];
        for (const item of gear) {
            if (has(item.stats,key) && item.stats[key] !== null) value+=item.stats[key];
            if (item.uncertainAll || (has(item.stats,key) ? item.stats[key] === null : !item.complete)) unknown.push(item.candidateId);
        }
        derived[key]={value,complete:unknown.length===0,unknownCandidates:unknown};
    }
    return {base:clone(state.statSnapshots.base),equipped:clone(state.statSnapshots.equipped),derived,
        computed:equippedEstimates(state.statSnapshots.base,derived,assigned.length),assignedCount:assigned.length,
        emptySlots:CHARACTER_SLOTS.filter(slot=>!state.equipment[slot.id]).map(slot=>slot.id),
        warnings:gear.flatMap(item=>item.warnings.map(message=>({candidateId:item.candidateId,slot:item.slot,message})))};
}

/** intake accepts {id,sessionId,source,at,confidence,text,item:{...}}. Pass a
 * trusted local catalog record as {wikiItem,icon,catalogMatch:'exact'|'fuzzy'};
 * catalog stats are base-only. Manual catalog cards carry the identity made by
 * characterCatalogCard. Typed wiki titles/match checkboxes are not identities.
 * Only a stable item.instanceKey or identical observation id deduplicates cards.
 */
export function createCharacterModel({storage=globalThis.localStorage,now=Date.now,onWarning=()=>{}}={}) {
    let state=emptyState(), warned=false;
    const warn = message => { try { onWarning(message); } catch { /* UI warnings cannot break the model. */ } };
    try { const raw=storage?.getItem(CHARACTER_STORAGE_KEY); if (raw && raw.length<=CHARACTER_LIMITS.storageBytes) state=normalizeState(JSON.parse(raw)); }
    catch { warn('Saved character data could not be read. A new local snapshot is available.'); }
    const timestamp = () => atTime(now());
    const nextId = () => { let id; do { id=`character-${++state.sequence}`; } while (state.candidates.some(candidate=>candidate.id===id)); return id; };
    const expireReference = () => {const record=state.observationRefs.shift();if(record)state.observationFloor=Math.max(state.observationFloor,record.sequence||0);return record;};
    const trim = () => {
        while(state.observationRefs.length>CHARACTER_LIMITS.observationRefs)expireReference();
        while (JSON.stringify(state).length>CHARACTER_LIMITS.storageBytes) {
            // ID-only history yields to inventory under storage pressure. A
            // monotonic journal floor expires those old replay records without
            // guessing a physical identity from names, tiers or timestamps.
            if(state.candidates.length<=CHARACTER_LIMITS.candidates&&state.observationRefs.length){
                const excess=JSON.stringify(state).length-CHARACTER_LIMITS.storageBytes;let released=0;
                while(state.observationRefs.length&&released<excess){const record=expireReference();released+=JSON.stringify(record).length+1;}
                continue;
            }
            // Inventory is durable. Expire redundant evidence and cached pixels
            // before refusing an oversized addition/edit; never delete a card.
            const evidence=state.candidates.find(candidate=>candidate.evidence.length>1);
            if(evidence) {evidence.evidence.shift();continue;}
            const icon=state.candidates.find(candidate=>candidate.icon);
            if(icon) {icon.icon='';continue;}
            break;
        }
    };
    const save = () => {
        state.updatedAt=timestamp(); trim();
        try { const serialized=JSON.stringify(state);if(serialized.length>CHARACTER_LIMITS.storageBytes)throw Error('Character storage bound exceeded.');storage?.setItem(CHARACTER_STORAGE_KEY,serialized); return true; }
        catch { if (!warned) { warned=true;warn('Character changes remain in memory because local storage could not save them.'); } return false; }
    };
    const get = id => state.candidates.find(candidate=>candidate.id===id);
    const observationReference = evidence => evidence.observationId ? state.observationRefs.find(record=>record.observationId===evidence.observationId&&record.sessionId===evidence.sessionId) : null;
    const expiredObservation = observation => {const sequence=journalSequence(observation.sequence);return sequence!==null&&sequence<=state.observationFloor;};
    const rememberObservation = (candidateId,observation,evidence=evidenceRecord(observation)) => {
        if(!evidence.observationId)return;
        const existing=observationReference(evidence);
        if(existing){if(existing.sequence===null)existing.sequence=journalSequence(observation.sequence);return;}
        state.observationRefs.push({observationId:evidence.observationId,sessionId:evidence.sessionId,candidateId,sequence:journalSequence(observation.sequence)});
    };
    const variantKey = source => JSON.stringify([fullTier(source.tier),tierFraction(source.fraction,fullTier(source.tier)),list(source.augments).map(augment=>[clean(augment.name),clean(augment.id)])]);
    const observationDetails=observation=>{
        const source=characterObservationInput(observation),evidence=evidenceRecord(observation),instance=clean(source.instanceKey||observation.instanceKey,160);
        return {source,evidence,instanceKey:instance?clean(`${clean(observation.sessionId,80)}|${instance}`,200):'',variant:variantKey(source)};
    };
    const wasRemoved=({evidence,instanceKey,variant})=>state.removedObservations.some(record=>record.observationId===evidence.observationId&&record.sessionId===evidence.sessionId)||Boolean(instanceKey&&evidence.at!==null&&state.removedInstances.some(record=>record.instanceKey===instanceKey&&variantKey(record.variant)===variant&&evidence.at<=record.at));
    function lookupObservation(observation={},options={}) {
        const details=observationDetails(observation),{source,evidence,instanceKey,variant}=details,reference=observationReference(evidence);
        if(reference)return {status:get(reference.candidateId)?'match':'ignored',candidateId:get(reference.candidateId)?.id||null,choices:get(reference.candidateId)?[reference.candidateId]:[],reason:'reference'};
        if(expiredObservation(observation)||wasRemoved(details))return {status:'ignored',candidateId:null,choices:[],reason:'removed-or-expired'};
        const instance=instanceKey?state.candidates.find(candidate=>candidate.instanceKey===instanceKey&&variantKey(candidate)===variant):null;
        if(instance)return {status:'match',candidateId:instance.id,choices:[instance.id],reason:'instance'};
        if(!automaticObservation(observation))return {status:'new',candidateId:null,choices:[],reason:'manual-add'};
        const incomingIdentity=catalogIdentity(options.wikiItem||source.catalogIdentity),name=value=>characterBaseItemName(value).normalize('NFKC').toLowerCase(),names=new Set([source.name,incomingIdentity?.name].map(name).filter(Boolean));
        const choices=state.candidates.filter(candidate=>{
            const known=characterEquipmentEligibility(candidate).known;
            if(incomingIdentity&&known)return identityTitle(incomingIdentity.wikiTitle)===identityTitle(candidate.catalogIdentity.wikiTitle);
            return [candidate.name,candidate.observedName].map(name).some(value=>value&&names.has(value));
        }).map(candidate=>candidate.id);
        return {status:choices.length>1?'ambiguous':choices.length?'match':'new',candidateId:choices.length===1?choices[0]:null,choices,reason:'item-identity'};
    }
    const rememberRemoval = candidate => {
        for(const reference of state.observationRefs)if(reference.candidateId===candidate.id)reference.candidateId='';
        for(const evidence of candidate.evidence) if(evidence.observationId && !state.removedObservations.some(record=>record.observationId===evidence.observationId&&record.sessionId===evidence.sessionId)) state.removedObservations.push({observationId:evidence.observationId,sessionId:evidence.sessionId});
        state.removedObservations=state.removedObservations.slice(-CHARACTER_LIMITS.removedObservations);
        if(candidate.instanceKey) {
            const variant={tier:candidate.tier,fraction:candidate.fraction,augments:candidate.augments.map(augment=>({name:augment.name,id:augment.id}))};
            state.removedInstances=state.removedInstances.filter(record=>record.instanceKey!==candidate.instanceKey||variantKey(record.variant)!==variantKey(variant));
            state.removedInstances.push({instanceKey:candidate.instanceKey,variant,at:timestamp()});state.removedInstances=state.removedInstances.slice(-CHARACTER_LIMITS.removedInstances);
        }
    };
    const result = (candidate,extra={}) => {
        const saved=save();
        return get(candidate.id) ? {ok:true,candidate:clone(get(candidate.id)),...extra,saved}
            : {ok:false,error:'This item did not fit in the bounded inventory. Remove unused cards before adding it.',saved};
    };
    const capacityError=()=>({ok:false,error:`Inventory holds ${CHARACTER_LIMITS.candidates} cards. Remove an unused card before adding another copy.`});
    const addedResult=(candidate,before,extra={})=>{
        const outcome=result(candidate,extra);
        if(JSON.stringify(state).length>CHARACTER_LIMITS.storageBytes){state=before;return {ok:false,error:'This item exceeds the bounded inventory storage. Existing cards were kept; remove an unused card before adding it.',saved:false};}
        return outcome;
    };
    const detach=id=>{for(const assignments of [state.equipment,state.pendingEquipment])for(const [slot,assigned]of Object.entries(assignments))if(assigned===id)delete assignments[slot];};
    function catalogPatch(item,{match='manual',icon}={}) {
        const identity=catalogIdentity({...item,match});
        if(!identity)return null;
        const baseStats=normalizeCharacterStats(item.stats);
        return {name:identity.name,wikiTitle:identity.wikiTitle,catalogIdentity:identity,wikiMatch:match==='fuzzy'?'suggested':'confirmed',
            baseStats,baseStatsComplete:Object.keys(baseStats).length>0&&item.statsComplete!==false,
            unscaledStatKeys:has(baseStats,'SV_CORRUPTION')?['SV_CORRUPTION']:[],iconId:clean(item.iconId,120),icon:safeCharacterIcon(icon)};
    }
    function resolveCatalog(id,item,options={}) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        const patch=catalogPatch(item,options);if(!patch)return {ok:false,error:'Choose a known cached item.'};
        const next=normalizeCandidate({...current,...patch,slots:current.slots.length?current.slots:item.slots,updatedAt:timestamp()});
        state.candidates[state.candidates.indexOf(current)]=next;return result(next);
    }
    function invalidateCatalog(id) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        current.catalogIdentity=null;current.wikiMatch='unmatched';detach(id);return result(current);
    }
    /** Recheck against the current local pack. Only exact legacy identities can
     * recover their old slot; fuzzy/ambiguous/missing cards remain loose. */
    function reconcileCatalog(resolve) {
        if(typeof resolve!=='function')return {ok:false,error:'A local catalog resolver is required.'};
        let resolutions;try{resolutions=state.candidates.map(candidate=>resolve(clone(candidate)));}catch{return {ok:false,error:'The local catalog could not be read.'};}
        const exact=new Set();
        state.candidates=state.candidates.map((candidate,index)=>{
            const resolution=resolutions[index],patch=resolution?.status==='exact'&&resolution.item?catalogPatch(resolution.item,{match:candidate.catalogIdentity?.match||'exact',icon:resolution.icon}):null;
            if(!patch){detach(candidate.id);return normalizeCandidate({...candidate,catalogIdentity:null,wikiMatch:'unmatched'});}
            exact.add(candidate.id);return normalizeCandidate({...candidate,...patch,...(Object.keys(candidate.baseStats).length?{baseStats:candidate.baseStats,baseStatsComplete:candidate.baseStatsComplete,unscaledStatKeys:candidate.unscaledStatKeys}:{}),slots:candidate.slots.length?candidate.slots:resolution.item.slots});
        });
        for(const [slot,id]of Object.entries(state.pendingEquipment))if(exact.has(id)&&characterSlotCompatibility(get(id),slot).compatible&&!state.equipment[slot]&&!Object.values(state.equipment).includes(id))state.equipment[slot]=id;
        state.pendingEquipment={};return {ok:true,saved:save()};
    }
    function intake(observation={},options={}) {
        const source=characterObservationInput(observation);
        const wiki=options.wikiItem || {}, evidence=evidenceRecord(observation);
        const decision=lookupObservation(observation,options);
        if(decision.status==='ignored')return {ok:true,ignored:true,deduplicated:true,candidate:null};
        if(decision.status==='ambiguous')return {ok:true,ambiguous:true,deduplicated:true,candidate:null,choices:decision.choices};
        if(decision.status==='match'&&decision.reason!=='reference'&&automaticObservation(observation))return {...mergeObservation(decision.candidateId,observation,options),deduplicated:true,merged:true};
        const reference=observationReference(evidence);
        if(reference) {
            const prior=get(reference.candidateId);
            if(!prior)return {ok:true,ignored:true,deduplicated:true,candidate:null};
            return result(prior,{deduplicated:true});
        }
        if(expiredObservation(observation))return {ok:true,ignored:true,deduplicated:true,candidate:null};
        const instance=clean(source.instanceKey || observation.instanceKey,160);
        const instanceKey=instance ? clean(`${clean(observation.sessionId,80)}|${instance}`,200) : '';
        const variant=variantKey(source);
        const removed=state.removedObservations.some(record=>record.observationId===evidence.observationId&&record.sessionId===evidence.sessionId) || instanceKey&&evidence.at!==null&&state.removedInstances.some(record=>record.instanceKey===instanceKey&&variantKey(record.variant)===variant&&evidence.at<=record.at);
        if(removed)return {ok:true,ignored:true,deduplicated:true,candidate:null};
        const prior=state.candidates.find(candidate=>instanceKey ? candidate.instanceKey===instanceKey && variantKey(candidate)===variant : evidence.observationId && candidate.evidence.some(record=>record.observationId===evidence.observationId && record.sessionId===evidence.sessionId));
        if (prior) {
            const already=prior.evidence.some(record=>record.observationId && record.observationId===evidence.observationId && record.sessionId===evidence.sessionId);
            if (!already) prior.evidence=[...prior.evidence,evidence].slice(-CHARACTER_LIMITS.evidence);
            prior.seenCount=Math.min(100000,prior.seenCount+1); prior.updatedAt=timestamp();
            rememberObservation(prior.id,observation,evidence);
            return result(prior,{deduplicated:true});
        }
        if(state.candidates.length>=CHARACTER_LIMITS.candidates)return capacityError();
        const beforeAddition=clone(state);
        const identity=options.wikiItem?catalogPatch(wiki,{match:options.catalogMatch||'exact',icon:options.icon}):null;
        const candidate=normalizeCandidate({id:nextId(),instanceKey,origin:automaticObservation(observation)?'automatic':'manual',lastObservedAt:evidence.at,lastObservedSequence:journalSequence(observation.sequence),observedTier:automaticObservation(observation)?fullTier(source.tier):null,observedFraction:automaticObservation(observation)?source.fraction:null,name:source.name || wiki.name,observedName:source.observedName ?? (!source.catalogIdentity&&(Array.isArray(observation.fields)||evidence.observationId)?source.name:''),wikiTitle:source.wikiTitle || wiki.wikiTitle || wiki.name,catalogIdentity:source.catalogIdentity,
            wikiMatch:options.wikiItem ? 'suggested' : source.wikiMatch,iconId:source.iconId ?? wiki.iconId,icon:options.icon || source.icon,
            slots:source.slots?.length ? source.slots : wiki.slots,tier:source.tier,fraction:source.fraction,observedStats:source.observedStats || source.stats,
            observedStatsComplete:source.statsComplete || source.observedStatsComplete,editedStatKeys:automaticObservation(observation)?[]:Object.keys(normalizeCharacterStats(source.observedStats||source.stats)),baseStats:wiki.stats || source.baseStats,
            unscaledStatKeys:source.unscaledStatKeys,
            baseStatsComplete:options.wikiItem ? true : source.baseStatsComplete,augments:source.augments,augmentStatus:source.augmentStatus,
            level:source.level,notes:source.notes,rawStatBlock:source.rawStatBlock ?? source.statBlockText ?? list(source.statLines).join('\n'),evidence:[evidence],createdAt:timestamp(),updatedAt:timestamp(),...identity});
        if (!candidate.name) return {ok:false,error:'An item name is required.'};
        state.candidates.push(candidate);
        rememberObservation(candidate.id,observation,evidence);
        const assignment=options.autoAssign===true ? autoAssign(candidate.id) : undefined;
        return addedResult(candidate,beforeAddition,{deduplicated:false,...(assignment?{assignment}:{})});
    }
    function updateCandidate(id,patch={}) {
        const current=get(id); if (!current) return {ok:false,error:'Item card no longer exists.'};
        const editedStatKeys=has(patch,'observedStats')?[...current.editedStatKeys,...Object.keys(current.observedStats),...Object.keys(normalizeCharacterStats(patch.observedStats))]:current.editedStatKeys;
        const editedFields=[...current.editedFields,...Object.keys(patch).filter(key=>EDITABLE_CAPTURE_FIELDS.has(key))];
        if(has(patch,'tier')||has(patch,'fraction'))editedFields.push('tier','fraction');
        const next=normalizeCandidate({...current,...patch,origin:current.origin,lastObservedAt:current.lastObservedAt,lastObservedSequence:current.lastObservedSequence,observedTier:current.observedTier,observedFraction:current.observedFraction,catalogIdentity:current.catalogIdentity,observedName:current.observedName,editedStatKeys,editedFields,id:current.id,instanceKey:current.instanceKey,createdAt:current.createdAt,evidence:current.evidence,updatedAt:timestamp()});
        if (!next.name) return {ok:false,error:'An item name is required.'};
        if(has(patch,'slots')){next.slotReadWarning='';if(Object.entries(state.equipment).some(([slot,assigned])=>assigned===id&&!characterSlotCompatibility(next,slot).compatible))detach(id);}
        if(!characterEquipmentEligibility(next).canEquip){next.catalogIdentity=null;detach(id);}
        state.candidates[state.candidates.indexOf(current)]=next; return result(next);
    }
    function setTierPreview(id,{tier,fraction=0}={}) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(fullTier(tier)===null||!Number.isInteger(fraction)||fraction<0||fraction>=(tier===10?1:2**tier))return {ok:false,error:'Choose tier 0–10 and valid fractional progress; tier 10 uses zero only.'};
        const available=characterEquipmentEligibility(current).known&&Object.keys(current.baseStats).length>0,original=Object.keys(current.observedStats).length>0&&current.observedTier===tier&&current.observedFraction!==null&&current.observedFraction===fraction;
        if(original)return setObservedBasis(id);
        return updateCandidate(id,{tier,fraction,statBasis:available?'catalog-tier-preview':'observed',previewWarning:available?'':'Catalog tier preview is unavailable; captured values remain unchanged.'});
    }
    function setObservedBasis(id) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(!Object.keys(current.observedStats).length)return {ok:false,error:'No captured item values are available.'};
        const next=normalizeCandidate({...current,tier:current.observedTier,fraction:current.observedFraction,statBasis:'observed',previewWarning:'',editedFields:current.editedFields.filter(key=>key!=='tier'&&key!=='fraction'),updatedAt:timestamp()});
        state.candidates[state.candidates.indexOf(current)]=next;return result(next);
    }
    /** Explicit same-copy recapture for the guided flow, never general replay or
     * title-based identity matching. New observed keys can fill gaps, including
     * null conflict clears; deliberate edits/removals remain protected. */
    function mergeObservation(id,observation={},options={}) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        const evidence=evidenceRecord(observation),reference=observationReference(evidence);
        if(reference&&reference.candidateId!==id)return reference.candidateId?{ok:false,error:'This observation already belongs to a different item copy.'}:{ok:true,ignored:true,deduplicated:true,candidate:null};
        if(!reference&&expiredObservation(observation))return {ok:true,ignored:true,deduplicated:true,candidate:null};
        if(!reference&&wasRemoved(observationDetails(observation)))return {ok:true,ignored:true,deduplicated:true,candidate:null};
        const duplicate=Boolean(reference)||evidence.observationId&&current.evidence.some(record=>record.observationId===evidence.observationId&&record.sessionId===evidence.sessionId),sequence=journalSequence(observation.sequence);
        const stale=current.lastObservedAt!==null?(evidence.at===null||evidence.at<current.lastObservedAt):sequence!==null&&current.lastObservedSequence!==null&&sequence<current.lastObservedSequence;
        if(stale){const next=normalizeCandidate({...current,evidence:duplicate?current.evidence:[...current.evidence,evidence],seenCount:current.seenCount+(duplicate?0:1),updatedAt:timestamp()});state.candidates[state.candidates.indexOf(current)]=next;rememberObservation(id,observation,evidence);return result(next,{stale:true,mergedStatKeys:[],preservedStatKeys:[]});}
        const source=characterObservationInput(observation),incoming=normalizeCharacterStats(source.observedStats||source.stats),protectedKeys=new Set(current.editedStatKeys);
        if(current.legacyManualStats)for(const key of Object.keys(current.observedStats))protectedKeys.add(key);
        const observedStats={...current.observedStats},mergedStatKeys=[],preservedStatKeys=[];
        for(const [key,value]of Object.entries(incoming)) {
            if(protectedKeys.has(key)){preservedStatKeys.push(key);continue;}
            observedStats[key]=value;mergedStatKeys.push(key);
        }
        const patch={observedStats},editedFields=new Set(current.editedFields);
        if(automaticObservation(observation)&&Object.keys(incoming).length){patch.observedTier=fullTier(source.tier);patch.observedFraction=tierFraction(source.fraction,patch.observedTier);}
        const slots=characterSlotKinds(source.slots);
        if(slots.length&&!editedFields.has('slots')){
            const conflicts=Object.entries(state.equipment).some(([slot,assigned])=>assigned===id&&!characterSlotCompatibility({...current,slots},slot).compatible);
            if(conflicts)patch.slotReadWarning='A newer slot reading conflicts with this placed copy; review its compatible slots.';
            else {patch.slots=slots;patch.slotReadWarning='';}
        }
        const tier=fullTier(source.tier);
        if(tier!==null&&!editedFields.has('tier')) {
            patch.tier=tier;
            if(tier!==current.tier&&!editedFields.has('fraction'))patch.fraction=null;
        }
        const effectiveTier=patch.tier??current.tier;
        if(source.fraction!==undefined&&!editedFields.has('fraction')&&(tier===null||tier===effectiveTier))patch.fraction=source.fraction;
        if(source.rawStatBlock!==undefined&&!editedFields.has('rawStatBlock'))patch.rawStatBlock=source.rawStatBlock;
        if(numeric(source.level)!==null&&!editedFields.has('level'))patch.level=source.level;
        const wiki=options.wikiItem;
        if(wiki&&typeof wiki==='object') {
            const identity=catalogPatch(wiki,{match:options.catalogMatch||'exact',icon:options.icon}),protectedIdentity=editedFields.has('name')||editedFields.has('wikiTitle')||current.catalogIdentity?.match==='manual';
            if(identity&&(!protectedIdentity||identityName(current.name)===identityName(identity.name)&&identityTitle(current.wikiTitle)===identityTitle(identity.wikiTitle))){
                if(Object.keys(current.baseStats).length){delete identity.baseStats;delete identity.baseStatsComplete;delete identity.unscaledStatKeys;}
                Object.assign(patch,identity);
            }
        }
        if(!current.icon&&safeCharacterIcon(options.icon))patch.icon=options.icon;
        const next=normalizeCandidate({...current,...patch,lastObservedAt:evidence.at??current.lastObservedAt,lastObservedSequence:Math.max(sequence||0,current.lastObservedSequence||0)||null,editedStatKeys:[...protectedKeys],evidence:duplicate?current.evidence:[...current.evidence,evidence],seenCount:current.seenCount+(duplicate?0:1),updatedAt:timestamp()});
        state.candidates[state.candidates.indexOf(current)]=next;
        rememberObservation(id,observation,evidence);
        return result(next,{mergedStatKeys,preservedStatKeys});
    }
    function assign(id,slotId,{replace=false}={}) {
        const candidate=get(id); if (!candidate) return {ok:false,error:'Item card no longer exists.'};
        const eligibility=characterEquipmentEligibility(candidate);if(!eligibility.canEquip)return {ok:false,error:eligibility.reason,reason:'unknown-catalog'};
        const compatibility=characterSlotCompatibility(candidate,slotId);
        if (!SLOT_BY_ID.has(slotId)) return {ok:false,error:compatibility.warning};
        if (!compatibility.compatible) return {ok:false,error:compatibility.warning};
        const previous=state.equipment[slotId];
        if (previous && previous!==id && !replace) return {ok:false,error:'This slot already has an item. Confirm replacement.',needsConfirmation:true};
        detach(id);delete state.pendingEquipment[slotId];
        state.equipment[slotId]=id;
        return {ok:true,replaced:previous && previous!==id ? previous : null,warning:compatibility.warning,saved:save()};
    }
    function autoAssign(id) {
        const decision=characterAutoAssignment(state,id);
        if(!decision.assigned || decision.reason==='already-assigned')return decision;
        const outcome=assign(id,decision.slot);
        return outcome.ok ? {...decision,saved:outcome.saved} : {...decision,ok:false,assigned:false,slot:null,error:outcome.error};
    }
    return {intake,lookupObservation,updateCandidate,mergeObservation,setTierPreview,setObservedBasis,resolveCatalog,invalidateCatalog,reconcileCatalog,assign,autoAssign,
        snapshot:()=>clone(state), totals:()=>characterTotals(state),
        duplicateCandidate(id) { const source=get(id);if(!source)return {ok:false,error:'Item card no longer exists.'};
            if(state.candidates.length>=CHARACTER_LIMITS.candidates)return capacityError();const beforeAddition=clone(state);
            const candidate=normalizeCandidate({...source,id:nextId(),origin:'manual',instanceKey:'',evidence:[],seenCount:1,createdAt:timestamp(),updatedAt:timestamp()});
            state.candidates.push(candidate);return addedResult(candidate,beforeAddition); },
        removeCandidate(id) { if (!get(id)) return {ok:false,error:'Item card no longer exists.'};rememberRemoval(get(id));
            state.candidates=state.candidates.filter(candidate=>candidate.id!==id);
            detach(id);
            return {ok:true,saved:save()}; },
        unassign(slotId) { if(!SLOT_BY_ID.has(slotId))return {ok:false,error:'Unknown equipment slot.'};delete state.equipment[slotId];delete state.pendingEquipment[slotId];return {ok:true,saved:save()}; },
        setMetadata(patch) { state.metadata=metadata({...state.metadata,...patch});return {ok:true,saved:save()}; },
        beginSnapshot(patch={}) {state.metadata=metadata({...state.metadata,...patch});state.equipment={};state.pendingEquipment={};state.statSnapshots.base=null;return {ok:true,saved:save()};},
        setStatSnapshot(kind,value) { if(!['base','equipped'].includes(kind))return {ok:false,error:'Stat snapshot must be base or equipped.'};
            state.statSnapshots[kind]=statSnapshot(value);return {ok:true,saved:save()}; },
        reset() { for(const candidate of state.candidates)rememberRemoval(candidate);const {removedObservations,removedInstances,observationRefs,observationFloor}=state;state={...emptyState(),removedObservations,removedInstances,observationRefs,observationFloor};return {ok:true,saved:save()}; }
    };
}

/** Share/upload JSON intentionally excludes raw OCR text, capture/session IDs,
 * local paths, evidence pictures and unassigned candidates. No auth is included.
 */
export function characterShareSummary(snapshot) {
    const state=normalizeState(snapshot),totals=characterTotals(state),byId=new Map(state.candidates.map(item=>[item.id,item]));
    return {schemaVersion:1,kind:'eoz-character-snapshot',metadata:clone(state.metadata),updatedAt:state.updatedAt,
        stats:{base:state.statSnapshots.base ? {stats:state.statSnapshots.base.stats,confirmed:state.statSnapshots.base.confirmed} : null,
            equipped:state.statSnapshots.equipped ? {stats:state.statSnapshots.equipped.stats,confirmed:state.statSnapshots.equipped.confirmed} : null,
            derived:totals.derived,computed:totals.computed},
        equipment:CHARACTER_SLOTS.map(slot=>{const item=byId.get(state.equipment[slot.id]);return {slot:slot.id,label:slot.label,item:item ? {
            name:item.name,wikiTitle:item.wikiTitle,wikiMatch:item.wikiMatch,iconId:item.iconId,tier:item.tier,fraction:item.fraction,observedTier:item.observedTier,observedFraction:item.observedFraction,statBasis:item.statBasis,level:item.level,
            slots:item.slots,observedStats:item.observedStats,baseStats:item.baseStats,...characterItemStats(item),
            augments:clone(item.augments),augmentStatus:item.augmentStatus,slotWarning:characterSlotCompatibility(item,slot.id).warning} : null};}),
        caveat:'Equipped estimates add No Equipment + gear; caps, buffs, worn effects and attribute-derived resource changes are omitted. AC/ATK components need unavailable formulas. Prior equipped captures stay separate.'};
}
