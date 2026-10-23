import { scaleItemStat } from './item-scaling.js';

// Local, versioned data only. This module has no DOM, capture, network or wiki
// write dependency. One candidate represents one physical copy, not a title.
export const CHARACTER_STORAGE_KEY = 'eql-eye-of-zomm-character-v1';
export const CHARACTER_LIMITS = Object.freeze({ candidates:120, evidence:6, stats:48, augments:8, removedObservations:1000, removedInstances:100, storageBytes:1500000, iconBytes:24000 });
export const CHARACTER_STAT_KEYS = Object.freeze(['AC','HP','MP','END','ATK','STR','STA','AGI','DEX','WIS','INT','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE','HP_REGEN','MANA_REGEN','END_REGEN','HASTE']);
export const CHARACTER_SLOTS = Object.freeze([
    ['charm','Charm','CHARM'],['ear1','Left ear','EAR'],['head','Head','HEAD'],['face','Face','FACE'],['ear2','Right ear','EAR'],
    ['neck','Neck','NECK'],['shoulders','Shoulders','SHOULDERS'],['arms','Arms','ARMS'],['back','Back','BACK'],
    ['wrist1','Left wrist','WRIST'],['wrist2','Right wrist','WRIST'],['range','Range','RANGE'],['hands','Hands','HANDS'],
    ['primary','Primary','PRIMARY'],['secondary','Secondary','SECONDARY'],['finger1','Left finger','FINGER'],['finger2','Right finger','FINGER'],
    ['chest','Chest','CHEST'],['legs','Legs','LEGS'],['feet','Feet','FEET'],['waist','Waist','WAIST'],['ammo','Ammo','AMMO'],['power','Power source','POWER SOURCE']
].map(([id,label,kind]) => Object.freeze({id,label,kind})));
const SLOT_BY_ID = new Map(CHARACTER_SLOTS.map(slot => [slot.id,slot]));
const SLOT_KINDS = new Set(CHARACTER_SLOTS.map(slot => slot.kind));
const clean = (value, limit=240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,limit);
const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
const numeric = value => finite(value) ? value : typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()) && finite(Number(value)) ? Number(value) : null;
// Dates use milliseconds since the epoch, independently of bounded stat values.
const atTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15 ? value : null;
const list = value => Array.isArray(value) ? value : [];
const has = (object,key) => Object.prototype.hasOwnProperty.call(object || {},key);
const fullTier = value => Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
const tierFraction = (value,tier) => tier === null || numeric(value) === null ? null : Math.max(0,Math.min(2 ** tier - 1,Math.floor(numeric(value))));
const keyFor = value => clean(value,32).toUpperCase().replace(/[ -]+/g,'_');

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
        .filter(slot => SLOT_KINDS.has(slot)))];
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

const OBSERVATION_STATS = Object.freeze({ac:'AC',hp:'HP',mana:'MP',endurance:'END',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',
    resistPoison:'SV_POISON',resistMagic:'SV_MAGIC',resistDisease:'SV_DISEASE',resistFire:'SV_FIRE',resistCold:'SV_COLD',resistCorruption:'SV_CORRUPTION',
    weight:'WT',damage:'DMG',damageBonus:'DMG_BONUS',delay:'DELAY',hpCurrent:'HP_CURRENT',hpMaximum:'HP_MAXIMUM',manaCurrent:'MP_CURRENT',manaMaximum:'MP_MAXIMUM',
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
    return {name:fields.name || observation.subject?.name,tier:fields.tier,fraction:fields.fraction,slots:fields.slots,stats,
        level:fields.requiredLevel,augments:list(fields.augmentNames).map(name=>({name})),augmentStatus:'unknown',statsComplete:false};
}
function metadata(value={}) {
    return { name:clean(value.name,120), server:clean(value.server,100), level:numeric(value.level), race:clean(value.race,80),
        classes:list(value.classes).slice(0,3).map(value => clean(value,40)), sessionName:clean(value.sessionName,120) };
}
function augmentRecord(value={}) {
    return {name:clean(value.name), id:clean(value.id,120), stats:normalizeCharacterStats(value.stats), statsComplete:value.statsComplete === true};
}
function normalizeCandidate(value={}) {
    const tier = fullTier(value.tier);
    return { id:clean(value.id,100), instanceKey:clean(value.instanceKey,200), name:clean(value.name), wikiTitle:clean(value.wikiTitle),
        wikiMatch:['confirmed','suggested','unmatched'].includes(value.wikiMatch) ? value.wikiMatch : 'unmatched',
        iconId:clean(value.iconId,120), icon:safeCharacterIcon(value.icon), slots:characterSlotKinds(value.slots), tier,
        fraction:tierFraction(value.fraction,tier),
        observedStats:normalizeCharacterStats(value.observedStats), baseStats:normalizeCharacterStats(value.baseStats),
        unscaledStatKeys:[...new Set(list(value.unscaledStatKeys).slice(0,CHARACTER_LIMITS.stats).map(keyFor).filter(key=>/^[A-Z][A-Z0-9_]{0,31}$/.test(key)))],
        observedStatsComplete:value.observedStatsComplete === true, baseStatsComplete:value.baseStatsComplete === true,
        augments:list(value.augments).slice(0,CHARACTER_LIMITS.augments).map(augmentRecord),
        augmentStatus:['none','included','excluded','unknown'].includes(value.augmentStatus) ? value.augmentStatus : 'unknown',
        level:numeric(value.level), notes:clean(value.notes,600), evidence:list(value.evidence).slice(-CHARACTER_LIMITS.evidence).map(evidenceRecord),
        createdAt:atTime(value.createdAt), updatedAt:atTime(value.updatedAt), seenCount:Math.max(1,Math.min(100000,Math.floor(numeric(value.seenCount)||1))) };
}
function statSnapshot(value) {
    if (!value || typeof value !== 'object') return null;
    return {stats:normalizeCharacterStats(value.stats || value.values), label:clean(value.label,100), at:atTime(value.at ?? value.timestamp),
        notes:clean(value.notes,600), evidence:evidenceRecord(value.evidence || value), confirmed:value.confirmed === true};
}
function emptyState() {
    return {schemaVersion:1, sequence:0, metadata:metadata(), candidates:[], equipment:{}, statSnapshots:{base:null,equipped:null}, removedObservations:[],removedInstances:[],updatedAt:null};
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
        if (seen.has(id) && !assigned.has(id)) { result.equipment[slot.id]=id; assigned.add(id); }
    }
    result.statSnapshots = {base:statSnapshot(value.statSnapshots?.base),equipped:statSnapshot(value.statSnapshots?.equipped)};
    result.removedObservations=list(value.removedObservations).slice(-CHARACTER_LIMITS.removedObservations).map(record=>({observationId:clean(record?.observationId,180),sessionId:clean(record?.sessionId,180)})).filter(record=>record.observationId);
    result.removedInstances=list(value.removedInstances).slice(-CHARACTER_LIMITS.removedInstances).map(record=>({instanceKey:clean(record?.instanceKey,200),variant:normalizeCandidate(record?.variant),at:atTime(record?.at)})).filter(record=>record.instanceKey&&record.at!==null);
    result.updatedAt=atTime(value.updatedAt); return result;
}

/** Effective item values are separate from both catalog base and observed totals.
 * Observed examine stats take precedence and are never scaled again. Unknown
 * tier prevents scaling catalog stats. Augments add only when explicitly excluded.
 */
export function characterItemStats(candidate) {
    const item = normalizeCandidate(candidate), observed = Object.keys(item.observedStats).length > 0;
    const stats = observed ? {...item.observedStats} : Object.fromEntries(Object.entries(item.baseStats).map(([key,value]) =>
        [key,value === null || item.tier === null || item.fraction === null || item.tier>0&&item.unscaledStatKeys.includes(key) ? null : scaleItemStat(key,value,item.tier,{fraction:item.fraction})]));
    const warnings = [];
    let complete = observed ? item.observedStatsComplete : item.baseStatsComplete && item.tier !== null && item.fraction !== null;
    let uncertainAll = false;
    if (!observed && item.tier === null) warnings.push('Item tier is unknown; catalog base stats are not an equipped value.');
    if (!observed && item.tier !== null && item.fraction === null) warnings.push('Fractional progress is unknown; review it before scaling catalog base stats.');
    if (!observed && item.tier>0 && item.unscaledStatKeys.length) warnings.push(`Tier adjustment is unverified for ${item.unscaledStatKeys.join(', ')}; those equipped values remain unknown.`);
    if (!complete) warnings.push('Item stats are incomplete.');
    if (item.augmentStatus === 'unknown') { complete=false; uncertainAll=true; warnings.push('Augment presence or stat inclusion needs review.'); }
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
    return {stats, complete, uncertainAll, basis:observed ? 'observed-examine' : 'scaled-catalog', warnings};
}

export function characterSlotCompatibility(candidate, slotId) {
    const slot = SLOT_BY_ID.get(slotId);
    if (!slot) return {compatible:false,unknown:false,warning:'Unknown equipment slot.'};
    const kinds = characterSlotKinds(candidate?.slots);
    if (!kinds.length) return {compatible:false,unknown:true,warning:'Compatible slots are unknown; confirm the placement.'};
    const compatible = kinds.includes(slot.kind);
    return {compatible,unknown:false,warning:compatible ? '' : `${clean(candidate?.name) || 'Item'} is not listed for ${slot.label}.`};
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
    return {base:clone(state.statSnapshots.base),equipped:clone(state.statSnapshots.equipped),derived,assignedCount:assigned.length,
        emptySlots:CHARACTER_SLOTS.filter(slot=>!state.equipment[slot.id]).map(slot=>slot.id),
        warnings:gear.flatMap(item=>item.warnings.map(message=>({candidateId:item.candidateId,slot:item.slot,message})))};
}

/** intake accepts {id,sessionId,source,at,confidence,text,item:{...}}. Pass a
 * catalog record as {wikiItem,icon}; catalog stats are base-only. Only an explicit
 * stable item.instanceKey or identical observation id deduplicates cards.
 */
export function createCharacterModel({storage=globalThis.localStorage,now=Date.now,onWarning=()=>{}}={}) {
    let state=emptyState(), warned=false;
    const warn = message => { try { onWarning(message); } catch { /* UI warnings cannot break the model. */ } };
    try { const raw=storage?.getItem(CHARACTER_STORAGE_KEY); if (raw && raw.length<=CHARACTER_LIMITS.storageBytes) state=normalizeState(JSON.parse(raw)); }
    catch { warn('Saved character data could not be read. A new local snapshot is available.'); }
    const timestamp = () => atTime(now());
    const nextId = () => { let id; do { id=`character-${++state.sequence}`; } while (state.candidates.some(candidate=>candidate.id===id)); return id; };
    const protectedIds = () => new Set(Object.values(state.equipment));
    const trim = () => {
        const protectedSet=protectedIds();
        while (state.candidates.length>CHARACTER_LIMITS.candidates || JSON.stringify(state).length>CHARACTER_LIMITS.storageBytes) {
            const index=state.candidates.findIndex(candidate=>!protectedSet.has(candidate.id));
            if (index>=0) {state.candidates.splice(index,1);continue;}
            // The assigned array itself is small and remains intact. Under an
            // extreme protected-only payload, expire oldest evidence and cached
            // pixels (the exact icon ID can resolve again from the local pack).
            const evidence=state.candidates.find(candidate=>candidate.evidence.length>1);
            if(evidence) {evidence.evidence.shift();continue;}
            const icon=state.candidates.find(candidate=>candidate.icon);
            if(icon) {icon.icon='';continue;}
            const text=state.candidates.find(candidate=>candidate.evidence.some(record=>record.text));
            if(text) {for(const record of text.evidence)record.text='';continue;}
            break;
        }
    };
    const save = () => {
        state.updatedAt=timestamp(); trim();
        try { storage?.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(state)); return true; }
        catch { if (!warned) { warned=true;warn('Character changes remain in memory because local storage could not save them.'); } return false; }
    };
    const get = id => state.candidates.find(candidate=>candidate.id===id);
    const variantKey = source => JSON.stringify([fullTier(source.tier),tierFraction(source.fraction,fullTier(source.tier)),list(source.augments).map(augment=>[clean(augment.name),clean(augment.id)])]);
    const rememberRemoval = candidate => {
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
    function intake(observation={},options={}) {
        const source=characterObservationInput(observation);
        const wiki=options.wikiItem || {}, evidence=evidenceRecord(observation);
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
            return result(prior,{deduplicated:true});
        }
        const candidate=normalizeCandidate({id:nextId(),instanceKey,name:source.name || wiki.name,wikiTitle:source.wikiTitle || wiki.wikiTitle || wiki.name,
            wikiMatch:options.wikiItem ? 'suggested' : source.wikiMatch,iconId:source.iconId ?? wiki.iconId,icon:options.icon || source.icon,
            slots:source.slots?.length ? source.slots : wiki.slots,tier:source.tier,fraction:source.fraction,observedStats:source.observedStats || source.stats,
            observedStatsComplete:source.statsComplete || source.observedStatsComplete,baseStats:wiki.stats || source.baseStats,
            unscaledStatKeys:source.unscaledStatKeys,
            baseStatsComplete:options.wikiItem ? true : source.baseStatsComplete,augments:source.augments,augmentStatus:source.augmentStatus,
            level:source.level,notes:source.notes,evidence:[evidence],createdAt:timestamp(),updatedAt:timestamp()});
        if (!candidate.name) return {ok:false,error:'An item name is required.'};
        state.candidates.push(candidate); return result(candidate,{deduplicated:false});
    }
    function updateCandidate(id,patch={}) {
        const current=get(id); if (!current) return {ok:false,error:'Item card no longer exists.'};
        const next=normalizeCandidate({...current,...patch,id:current.id,instanceKey:current.instanceKey,createdAt:current.createdAt,evidence:current.evidence,updatedAt:timestamp()});
        if (!next.name) return {ok:false,error:'An item name is required.'};
        state.candidates[state.candidates.indexOf(current)]=next; return result(next);
    }
    function assign(id,slotId,{replace=false,allowIncompatible=false}={}) {
        const candidate=get(id); if (!candidate) return {ok:false,error:'Item card no longer exists.'};
        const compatibility=characterSlotCompatibility(candidate,slotId);
        if (!SLOT_BY_ID.has(slotId)) return {ok:false,error:compatibility.warning};
        if (!compatibility.compatible && !allowIncompatible) return {ok:false,error:compatibility.warning,needsConfirmation:true};
        const previous=state.equipment[slotId];
        if (previous && previous!==id && !replace) return {ok:false,error:'This slot already has an item. Confirm replacement.',needsConfirmation:true};
        for (const [slot,assigned] of Object.entries(state.equipment)) if (assigned===id) delete state.equipment[slot];
        state.equipment[slotId]=id;
        return {ok:true,replaced:previous && previous!==id ? previous : null,warning:compatibility.warning,saved:save()};
    }
    return {intake,updateCandidate,assign,
        snapshot:()=>clone(state), totals:()=>characterTotals(state),
        duplicateCandidate(id) { const source=get(id);if(!source)return {ok:false,error:'Item card no longer exists.'};
            const candidate=normalizeCandidate({...source,id:nextId(),instanceKey:'',evidence:[],seenCount:1,createdAt:timestamp(),updatedAt:timestamp()});
            state.candidates.push(candidate);return result(candidate); },
        removeCandidate(id) { if (!get(id)) return {ok:false,error:'Item card no longer exists.'};rememberRemoval(get(id));
            state.candidates=state.candidates.filter(candidate=>candidate.id!==id);
            for (const [slot,assigned] of Object.entries(state.equipment)) if (assigned===id) delete state.equipment[slot];
            return {ok:true,saved:save()}; },
        unassign(slotId) { if(!SLOT_BY_ID.has(slotId))return {ok:false,error:'Unknown equipment slot.'};delete state.equipment[slotId];return {ok:true,saved:save()}; },
        setMetadata(patch) { state.metadata=metadata({...state.metadata,...patch});return {ok:true,saved:save()}; },
        setStatSnapshot(kind,value) { if(!['base','equipped'].includes(kind))return {ok:false,error:'Stat snapshot must be base or equipped.'};
            state.statSnapshots[kind]=statSnapshot(value);return {ok:true,saved:save()}; },
        reset() { for(const candidate of state.candidates)rememberRemoval(candidate);const {removedObservations,removedInstances}=state;state={...emptyState(),removedObservations,removedInstances};return {ok:true,saved:save()}; }
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
            derived:totals.derived},
        equipment:CHARACTER_SLOTS.map(slot=>{const item=byId.get(state.equipment[slot.id]);return {slot:slot.id,label:slot.label,item:item ? {
            name:item.name,wikiTitle:item.wikiTitle,wikiMatch:item.wikiMatch,iconId:item.iconId,tier:item.tier,fraction:item.fraction,level:item.level,
            slots:item.slots,observedStats:item.observedStats,baseStats:item.baseStats,...characterItemStats(item),
            augments:clone(item.augments),augmentStatus:item.augmentStatus,slotWarning:characterSlotCompatibility(item,slot.id).warning} : null};}),
        caveat:'Base and equipped values are separate observations. Derived item sums are partial where marked and do not predict equipped totals, caps, buffs or effects.'};
}
