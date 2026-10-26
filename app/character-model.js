import {characterCatalogDetails,normalizeCharacterItemDetails,characterEffectDetails} from './character-item-card.js';
import { catalogBaseStats, scaledItemStats } from './item-scaling.js';
import { parseItemAugmentSlots } from './screen-read-parser.js';
import { normalizeAchievementExport, ACHIEVEMENT_LIMITS } from './achievement-export.js';

// Local, versioned data only. This module has no DOM, capture, network or wiki
// write dependency. One candidate represents one physical copy, not a title.
export const CHARACTER_STORAGE_KEY = 'eql-eye-of-zomm-character-v1';
export const CHARACTER_LIMITS = Object.freeze({ candidates:1000, evidence:6, stats:48, augments:8, observationRefs:6000, removedObservations:1000, removedInstances:100, storageBytes:8*1024*1024, iconBytes:24000, rawStatBlock:8192, rawStatLines:60 });
export const CHARACTER_STAT_KEYS = Object.freeze(['AC','AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','HP','MP','END','ATK','ATK_OFFENSE','ATK_ACCURACY','STR','STA','AGI','DEX','WIS','INT','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE','HP_REGEN','MANA_REGEN','END_REGEN','HASTE','ACCURACY','AVOIDANCE','COMBAT_EFFECTS','STRIKETHROUGH','STUN_RESIST','DAMAGE_SHIELD','DAMAGE_SHIELD_MITIGATION','DOT_SHIELDING','MELEE_SHIELDING','SPELL_SHIELDING']);
const STAT_LABELS=Object.freeze({MP:'Mana',END:'Endurance',ATK:'Attack',AC_MITIGATION:'Mitigation AC',AC_MITIGATION_SOFTCAP:'AC softcap',AC_EVASION:'Evasion AC',
    ATK_OFFENSE:'Offense',ATK_ACCURACY:'Accuracy',SV_MAGIC:'Magic resist',SV_FIRE:'Fire resist',SV_COLD:'Cold resist',SV_POISON:'Poison resist',SV_DISEASE:'Disease resist',
    SV_CORRUPTION:'Void resist',ATTACK_SPEED:'Attack speed %',DMG_BONUS:'Damage bonus',BACKSTAB_DMG:'Backstab dmg',HP_REGEN:'HP regen',MANA_REGEN:'Mana regen',END_REGEN:'End. regen',ACCURACY:'Accuracy bonus',AVOIDANCE:'Avoidance',COMBAT_EFFECTS:'Combat effects',STRIKETHROUGH:'Strikethrough',STUN_RESIST:'Stun resist',DAMAGE_SHIELD:'Damage shield',DAMAGE_SHIELD_MITIGATION:'Damage shield mitigation',DOT_SHIELDING:'DoT shielding',MELEE_SHIELDING:'Melee shielding',SPELL_SHIELDING:'Spell shielding'});
export const characterStatLabel=key=>STAT_LABELS[key] || String(key||'').replace(/_/g,' ');
export const CHARACTER_SLOTS = Object.freeze([
    ['charm','Charm','CHARM'],['ear1','Left ear','EAR'],['head','Head','HEAD'],['face','Face','FACE'],['ear2','Right ear','EAR'],
    ['neck','Neck','NECK'],['shoulders','Shoulders','SHOULDERS'],['arms','Arms','ARMS'],['back','Back','BACK'],
    ['wrist1','Left wrist','WRIST'],['wrist2','Right wrist','WRIST'],['range','Range','RANGE'],['hands','Hands','HANDS'],
    ['primary','Primary','PRIMARY'],['secondary','Secondary','SECONDARY'],['finger1','Left finger','FINGER'],['finger2','Right finger','FINGER'],
    ['chest','Chest','CHEST'],['legs','Legs','LEGS'],['feet','Feet','FEET'],['waist','Waist','WAIST'],['ammo','Ammo','AMMO'],
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
const EDITABLE_CAPTURE_FIELDS=new Set(['name','wikiTitle','slots','tier','fraction','rawStatBlock','level','augmentSlots','augments']);
const socketCount=value=>Number.isInteger(value)&&value>=0&&value<=CHARACTER_LIMITS.augments?value:null;

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
    const exaltation=candidate?.itemRole==='exaltation'||exportedExaltationOrigin(candidate?.inventoryOrigin);
    return {known,canEquip:known&&!exaltation,reason:exaltation?'This exported Exaltation is a socket item, not equipment.':known?'':'Choose a known cached item match before equipping this copy.'};
}

const INVENTORY_SLOTS=new Set(CHARACTER_SLOTS.filter(slot=>slot.id!=='charm').map(slot=>slot.id));
const INVENTORY_GROUPS=new Set(['equipment','inventory','bank','shared-bank','personal-depot','held','augment','keyring']);
function inventoryOrigin(value){
    if(!value||typeof value!=='object'||!INVENTORY_GROUPS.has(value.group)||typeof value.key!=='string'||!value.key||value.key.length>600||!Number.isSafeInteger(value.itemId)||value.itemId<=0||value.itemId>2147483647||!Number.isInteger(value.count)||value.count<1||value.count>1e9||fullTier(value.tier)===null)return null;
    const location=clean(value.location,180),name=clean(value.name),baseName=clean(value.baseName),slot=INVENTORY_SLOTS.has(value.slot)?value.slot:null;
    return location&&name&&baseName?{key:value.key,location,name,baseName,itemId:value.itemId,tier:value.tier,count:value.count,group:value.group,slot,importedAt:atTime(value.importedAt)}:null;
}
function exportedExaltationOrigin(value){
    const origin=inventoryOrigin(value);
    return Boolean(origin&&!origin.slot&&['inventory','bank','shared-bank','personal-depot','held','augment'].includes(origin.group)&&/\(Exaltation\)$/i.test(characterBaseItemName(origin.baseName||origin.name)));
}
function inventoryFile(value){
    if(!value||typeof value!=='object')return null;
    return {name:clean(String(value.name||'').split(/[\\/]/).at(-1)),bytes:Number.isSafeInteger(value.bytes)&&value.bytes>=0?value.bytes:null,modifiedAt:atTime(value.modifiedAt),sha256:/^[a-f\d]{64}$/i.test(value.sha256||'')?value.sha256.toLowerCase():''};
}
function achievementFile(value){
    if(value===undefined||value===null)return null;
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Achievement file information is invalid.');
    const name=typeof value.name==='string'?value.name.split(/[\\/]/).at(-1):'';
    if(!name||name.length>240||name!==clean(name)||/[\u0000-\u001f\u007f]/.test(name)||
        value.bytes!==undefined&&value.bytes!==null&&(!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>ACHIEVEMENT_LIMITS.characters*4)||
        value.modifiedAt!==undefined&&value.modifiedAt!==null&&atTime(value.modifiedAt)===null||
        value.sha256!==undefined&&value.sha256!==''&&(typeof value.sha256!=='string'||!/^[a-f\d]{64}$/i.test(value.sha256)))throw Error('Achievement file information is invalid.');
    return {name,bytes:value.bytes??null,modifiedAt:atTime(value.modifiedAt),sha256:typeof value.sha256==='string'?value.sha256.toLowerCase():''};
}
function achievementExportRecord(value){
    if(!value||value.schemaVersion!==1||atTime(value.importedAt)===null)return null;
    try{return {schemaVersion:1,importedAt:value.importedAt,file:achievementFile(value.file)};}catch{return null;}
}
function inventoryExportRecord(value){
    if(!value||value.schemaVersion!==1)return null;
    return {schemaVersion:1,importedAt:atTime(value.importedAt),file:inventoryFile(value.file),rowCount:Number.isSafeInteger(value.rowCount)?value.rowCount:0,equipmentSlotCount:23,candidateIds:list(value.candidateIds).slice(0,CHARACTER_LIMITS.candidates).map(value=>clean(value,100)).filter(Boolean),
        emptyEquipmentCount:Number.isInteger(value.emptyEquipmentCount)?value.emptyEquipmentCount:0,inventoryCount:Number.isInteger(value.inventoryCount)?value.inventoryCount:0,
        keyring:list(value.keyring).slice(0,CHARACTER_LIMITS.candidates).map(entry=>({...inventoryOrigin(entry),known:entry?.known===true,wikiTitle:clean(entry?.wikiTitle),iconId:clean(entry?.iconId,120)})).filter(entry=>entry.key),
        rejectedItems:list(value.rejectedItems).slice(0,12000).map(entry=>({name:clean(entry?.name),baseName:clean(entry?.baseName),tier:fullTier(entry?.tier),itemId:Number.isSafeInteger(entry?.itemId)?entry.itemId:null,location:clean(entry?.location,180),...(INVENTORY_SLOTS.has(entry?.slot)?{slot:entry.slot}:{}),reason:clean(entry?.reason,100)})).filter(entry=>entry.name&&entry.location),warnings:list(value.warnings).slice(0,30).map(value=>clean(value,300)).filter(Boolean)};
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
    enduranceCurrent:'END_CURRENT',enduranceMaximum:'END_MAXIMUM',attack:'ATK',attackMelee:'ATK_MELEE',attackRanged:'ATK_RANGED',attackSpeed:'ATTACK_SPEED',haste:'HASTE',hpRegen:'HP_REGEN',manaRegen:'MANA_REGEN',enduranceRegen:'END_REGEN',
    accuracy:'ACCURACY',avoidance:'AVOIDANCE',combatEffects:'COMBAT_EFFECTS',strikeThrough:'STRIKETHROUGH',stunResist:'STUN_RESIST',damageShield:'DAMAGE_SHIELD',damageShieldMitigation:'DAMAGE_SHIELD_MITIGATION',dotShielding:'DOT_SHIELDING',meleeShielding:'MELEE_SHIELDING',spellShielding:'SPELL_SHIELDING',velocity:'VELOCITY',primaryDps:'PRIMARY_DPS',secondaryDps:'SECONDARY_DPS',rangedDps:'RANGED_DPS'});

/** Adapt the capture parser's immutable field proposals to editable character
 * inputs. Unknown fields stay in the original observation/journal, not in sums.
 * Current/max resources remain separate; no max/total/base value is inferred.
 */
export function characterObservationInput(observation={}) {
    if (!Array.isArray(observation.fields)) {
        const input=observation.item || observation.fields?.item || observation.fields || observation;
        if((observation.kind==='ocr'||observation.source==='ocr')&&input&&typeof input==='object'){
            const {fraction,fractionMaximum,...item}=input;return item;
        }
        return input;
    }
    const fields=Object.fromEntries(observation.fields.slice(0,100).filter(field=>typeof field?.key==='string').map(field=>[field.key,field.value]));
    const stats={};
    for (const [key,target] of Object.entries(OBSERVATION_STATS)) if(has(fields,key)) stats[target]=fields[key];
    const block=fields.rawStatBlock ?? fields.statBlockText ?? (has(fields,'statLines')?list(fields.statLines).join('\n'):undefined);
    const augments=list(fields.augments).filter(value=>value&&Number.isInteger(value.index)).map(value=>({index:value.index,name:value.name})),capacity=socketCount(fields.augmentSlotCount),empty=socketCount(fields.emptyAugmentSlots);
    return {name:fields.name || observation.subject?.name,tier:fields.tier,slots:fields.slots,stats,...(block!==undefined?{rawStatBlock:block}:{}),
        level:fields.requiredLevel,...(has(fields,'augments')?{augments}:{}),...(capacity!==null?{augmentSlots:capacity}:{}),...(empty!==null?{emptyAugmentSlots:empty}:{}),augmentStatus:capacity!==null&&empty===capacity&&!augments.length?'none':'unknown',statsComplete:false};
}
function metadata(value={}) {
    const aaCount=numeric(value.aaCount);
    return { name:clean(value.name,120), server:clean(value.server,100), level:numeric(value.level), race:clean(value.race,80),
        classes:[...new Set(list(value.classes).slice(0,3).map(value => clean(value,40)).filter(Boolean))],
        aaCount:Number.isInteger(aaCount) && aaCount >= 0 ? aaCount : null, sessionName:clean(value.sessionName,120) };
}
function augmentRecord(value={},index=0) {
    value=value&&typeof value==='object'?value:{};
    return {index,sourceSlot:Number.isInteger(value.sourceSlot)&&value.sourceSlot>0&&value.sourceSlot<=1e6?value.sourceSlot:null,inventoryOrigin:inventoryOrigin(value.inventoryOrigin),details:normalizeCharacterItemDetails(value.details),baseStats:normalizeCharacterStats(value.baseStats),unscaledStatKeys:list(value.unscaledStatKeys).map(keyFor),name:clean(value.name),wikiTitle:clean(value.wikiTitle),catalogIdentity:catalogIdentity(value.catalogIdentity),id:clean(value.id,120),iconId:clean(value.iconId,120),icon:safeCharacterIcon(value.icon),tier:fullTier(value.tier),stats:normalizeCharacterStats(value.stats),statsComplete:value.statsComplete===true||value.complete===true};
}
function normalizeAugments(values){
    const result=[],used=new Set();
    for(const value of list(values).slice(0,CHARACTER_LIMITS.augments)){
        let index=Number.isInteger(value?.index)&&value.index>=0&&value.index<CHARACTER_LIMITS.augments&&!used.has(value.index)?value.index:0;
        while(used.has(index))index++;
        used.add(index);result.push(augmentRecord(value,index));
    }
    return result.sort((a,b)=>a.index-b.index);
}
function augmentBaseline(value){
    return value&&typeof value==='object'&&['included','excluded','unknown'].includes(value.mode)?{mode:value.mode,emptyKnown:value.emptyKnown===true,augments:normalizeAugments(value.augments),uncertain:value.uncertain===true,overrides:normalizeCharacterStats(value.overrides)}:null;
}
function augmentContribution(augments,key){
    let total=0;for(const augment of augments){const value=has(augment.stats,key)?augment.stats[key]:augment.statsComplete?0:null;if(value===null)return null;total+=value;}return total;
}
function originalAugmentContribution(baseline,key){
    if(has(baseline.overrides,key))return baseline.overrides[key];
    if(baseline.uncertain)return null;
    if(baseline.mode==='excluded')return 0;
    return baseline.emptyKnown?augmentContribution(baseline.augments,key):null;
}
const automaticObservation=value=>Boolean(value&&((value.kind==='ocr'||value.source==='ocr')&&(!value.subject?.kind||value.subject.kind==='item')||Array.isArray(value.fields)&&value.subject?.kind==='item'));
function normalizeCandidate(value={}) {
    const tier = fullTier(value.tier);
    const evidence=list(value.evidence).slice(-CHARACTER_LIMITS.evidence).map(evidenceRecord),captured=evidence.some(record=>record.observationId&&(record.parserVersion||record.source==='ocr'));
    const observedTier=has(value,'observedTier')?fullTier(value.observedTier):captured&&!list(value.editedFields).some(key=>key==='tier'||key==='fraction')?tier:null;
    const block=rawStatBlock(value.rawStatBlock ?? value.statBlockText ?? list(value.statLines).join('\n')),sockets=parseItemAugmentSlots(block),augments=normalizeAugments(Array.isArray(value.augments)?value.augments:sockets.augments);
    const explicitCapacity=value.augmentSlots!==undefined?socketCount(value.augmentSlots):value.augmentSlotCount!==undefined?socketCount(value.augmentSlotCount):sockets.augmentSlotCount;
    const augmentSlots=explicitCapacity??Math.max(5,...augments.map(augment=>augment.index+1));
    return { id:clean(value.id,100), instanceKey:clean(value.instanceKey,200), inventoryOrigin:inventoryOrigin(value.inventoryOrigin),itemRole:value.itemRole==='exaltation'||exportedExaltationOrigin(value.inventoryOrigin)?'exaltation':'',name:characterBaseItemName(value.name), observedName:has(value,'observedName')?clean(value.observedName):list(value.evidence).some(record=>record?.observationId||record?.text)?clean(value.name):'', wikiTitle:clean(value.wikiTitle),catalogIdentity:catalogIdentity(value.catalogIdentity),
        origin:['automatic','manual'].includes(value.origin)?value.origin:captured?'automatic':'manual',legacyManualStats:value.legacyManualStats===true||!has(value,'origin')&&!captured,lastObservedAt:atTime(value.lastObservedAt)??evidence.reduce((latest,record)=>record.at!==null?Math.max(latest??0,record.at):latest,null),lastObservedSequence:journalSequence(value.lastObservedSequence),
        observedTier,observedFraction:tierFraction(has(value,'observedFraction')?value.observedFraction:value.fraction,observedTier),statBasis:value.statBasis==='catalog-tier-preview'?'catalog-tier-preview':'observed',previewWarning:clean(value.previewWarning,300),slotReadWarning:clean(value.slotReadWarning,300),
        wikiMatch:['confirmed','suggested','unmatched'].includes(value.wikiMatch) ? value.wikiMatch : 'unmatched',
        iconId:clean(value.iconId,120), icon:safeCharacterIcon(value.icon), details:normalizeCharacterItemDetails(value.details), slots:characterSlotKinds(value.slots), tier,
        fraction:tierFraction(value.fraction,tier),
        observedStats:normalizeCharacterStats(value.observedStats), baseStats:normalizeCharacterStats(value.baseStats),accuracyPercent:value.accuracyPercent===true||/\bAccuracy\s*:\s*[+\-]?\d+(?:\.\d+)?\s*%/i.test(block),
        editedStatKeys:[...new Set(list(value.editedStatKeys).map(keyFor).filter(key=>/^[A-Z][A-Z0-9_]{0,31}$/.test(key)))].slice(-CHARACTER_LIMITS.stats*2),
        editedFields:[...new Set(list(value.editedFields).filter(key=>EDITABLE_CAPTURE_FIELDS.has(key)))],
        unscaledStatKeys:[...new Set(list(value.unscaledStatKeys).slice(0,CHARACTER_LIMITS.stats).map(keyFor).filter(key=>/^[A-Z][A-Z0-9_]{0,31}$/.test(key)))],
        observedStatsComplete:value.observedStatsComplete === true, baseStatsComplete:value.baseStatsComplete === true,
        augments,augmentSlots,emptyAugmentSlots:value.emptyAugmentSlots!==undefined?socketCount(value.emptyAugmentSlots):sockets.emptyAugmentSlots,augmentBaseline:augmentBaseline(value.augmentBaseline),
        augmentStatus:['none','included','excluded','unknown'].includes(value.augmentStatus) ? value.augmentStatus : 'unknown',
        level:numeric(value.level), notes:clean(value.notes,600), rawStatBlock:block,evidence,
        createdAt:atTime(value.createdAt), updatedAt:atTime(value.updatedAt), seenCount:Math.max(1,Math.min(100000,Math.floor(numeric(value.seenCount)||1))) };
}
function statSnapshot(value) {
    if (!value || typeof value !== 'object') return null;
    return {stats:normalizeCharacterStats(value.stats || value.values), label:clean(value.label,100), at:atTime(value.at ?? value.timestamp),
        notes:clean(value.notes,600), evidence:evidenceRecord(value.evidence || value), confirmed:value.confirmed === true};
}
function emptyState() {
    return {schemaVersion:1, sequence:0, metadata:metadata(), candidates:[], equipment:{}, pendingEquipment:{},inventoryExport:null,achievements:null,achievementExport:null,statSnapshots:{base:null,equipped:null,current:null}, observationRefs:[],observationFloor:0,removedObservations:[],removedInstances:[],updatedAt:null};
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
            if(characterSlotCompatibility(candidate,slot.id).compatible)result.equipment[slot.id]=id;
            else if(!candidate.inventoryOrigin)result.pendingEquipment[slot.id]=id;
            assigned.add(id);
        }
        const pendingId=clean(value.pendingEquipment?.[slot.id],100);
        if(!result.equipment[slot.id]&&!result.pendingEquipment[slot.id]&&seen.has(pendingId)&&!assigned.has(pendingId)&&!result.candidates.find(candidate=>candidate.id===pendingId)?.inventoryOrigin){result.pendingEquipment[slot.id]=pendingId;assigned.add(pendingId);}
    }
    result.statSnapshots = {base:statSnapshot(value.statSnapshots?.base),equipped:statSnapshot(value.statSnapshots?.equipped),current:statSnapshot(value.statSnapshots?.current)};
    result.inventoryExport=inventoryExportRecord(value.inventoryExport);
    result.achievements=normalizeAchievementExport(value.achievements);
    result.achievementExport=result.achievements?achievementExportRecord(value.achievementExport):null;
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
 * Observed examine stats take precedence and are never scaled again. Catalog
 * previews use whole tiers; old progress metadata is retained but not required.
 * Unknown tier prevents scaling. Augments add only when explicitly excluded.
 */
export function characterExaltationStats(item={}){
    if(Object.keys(item.stats||{}).length)return {stats:normalizeCharacterStats(item.stats),complete:item.statsComplete===true,basis:'observed-examine'};
    return characterItemStats({...item,observedStats:{},baseStats:item.baseStats||{},baseStatsComplete:Object.keys(item.baseStats||{}).length>0,augmentStatus:'none',augments:[],augmentBaseline:null});
}

export function characterItemStats(candidate) {
    const item = normalizeCandidate(candidate),previewRequested=item.statBasis==='catalog-tier-preview',preview=previewRequested&&characterEquipmentEligibility(item).known&&Object.keys(item.baseStats).length>0, observed = !preview&&Object.keys(item.observedStats).length > 0;
    const bases=preview?Object.fromEntries([...new Set([...Object.keys(item.baseStats),...Object.keys(item.observedStats)])].map(key=>[key,has(item.baseStats,key)?item.baseStats[key]:null])):item.baseStats;
    const unsupportedKeys=item.unscaledStatKeys.filter(key=>key!=='SV_CORRUPTION');
    const stats = observed ? {...item.observedStats} : item.tier===null?Object.fromEntries(Object.keys(bases).map(key=>[key,null])):scaledItemStats({...item,stats:bases},item.tier,{fraction:0});
    if(!observed&&item.tier>0)for(const key of unsupportedKeys)if(has(stats,key))stats[key]=null;
    const warnings = [];
    const suffix=item.observedName.match(/(?:\s*\+(?:10|[0-9]))+\s*$/u)?.[0],writtenTiers=suffix?[...suffix.matchAll(/\+(10|[0-9])/g)].map(match=>Number(match[1])):[];
    const nameTier=preview?item.observedTier:item.tier;
    if(new Set(writtenTiers).size>1||nameTier!==null&&writtenTiers.some(tier=>tier!==nameTier))warnings.push('The written name tier conflicts with another tier value; review the original item reading.');
    if(item.previewWarning)warnings.push(item.previewWarning);
    if(item.slotReadWarning)warnings.push(item.slotReadWarning);
    if(previewRequested&&!preview)warnings.push('Catalog tier preview is unavailable; captured values remain unchanged.');
    if(preview)warnings.push('Catalog tier preview; captured item values remain unchanged and are not rescaled.');
    let complete = observed ? item.observedStatsComplete : item.baseStatsComplete && item.tier !== null;
    let uncertainAll = false;
    if (!observed && item.tier === null) warnings.push('Item tier is unknown; catalog base stats are not an equipped value.');
    if (!observed && item.tier>0 && unsupportedKeys.length) warnings.push(`Tier adjustment is unverified for ${unsupportedKeys.join(', ')}; those equipped values remain unknown.`);
    if (!complete) warnings.push('Item stats are incomplete.');
    if (item.augmentStatus === 'unknown') { complete=false; uncertainAll=true; warnings.push('Exaltation presence or stat inclusion needs review.'); }
    if(preview&&item.augmentStatus==='included'){complete=false;uncertainAll=true;warnings.push('Catalog preview does not establish the effects included in the captured item with Exaltations.');}
    if(item.augmentBaseline){
        const baseline=item.augmentBaseline,originals=new Map(baseline.augments.map(augment=>[augment.index,augment])),current=new Map(item.augments.map(augment=>[augment.index,augment]));
        const additive=!observed||baseline.mode==='excluded',baseComplete=observed?item.observedStatsComplete:item.baseStatsComplete&&item.tier!==null,originalValues={...stats};
        if(observed&&baseline.uncertain){for(const key of new Set([...Object.keys(stats),...item.augments.flatMap(augment=>Object.keys(augment.stats))]))stats[key]=null;complete=false;uncertainAll=true;}
        else for(const index of new Set([...originals.keys(),...current.keys()])){
            const before=originals.get(index),after=current.get(index);
            if(!additive&&JSON.stringify(before)===JSON.stringify(after))continue;
            if(additive&&!after)continue;
            for(const key of new Set([...Object.keys(stats),...Object.keys(before?.stats||{}),...Object.keys(after?.stats||{})])){
                if(observed&&has(baseline.overrides,key))continue;
                const base=has(stats,key)?stats[key]:baseComplete?0:null;
                const old=additive?0:before?(has(before.stats,key)?before.stats[key]:before.statsComplete?0:null):baseline.emptyKnown?0:null;
                const next=after?(has(after.stats,key)?after.stats[key]:after.statsComplete?0:null):0;
                stats[key]=base===null||old===null||next===null?null:base-old+next;
            }
            if(!additive&&!before&&!baseline.emptyKnown||before&&!before.statsComplete||after&&!after.statsComplete){complete=false;uncertainAll=true;}
        }
        if(observed)for(const [key,old]of Object.entries(baseline.overrides)){
            // A protected/manual or not-reread number still belongs to its
            // earlier socket basis. Do not reinterpret it as the new capture.
            if(!has(originalValues,key)){delete stats[key];continue;}
            const value=originalValues[key],next=augmentContribution(item.augments,key);
            stats[key]=value===null||old===null||next===null?null:value-old+next;
        }
        if(uncertainAll)warnings.push('An original socket contribution is unknown; the Exaltation adjustment remains partial.');
    }else if (item.augmentStatus === 'excluded') {
        for (const augment of item.augments) {
            if (!augment.statsComplete) { complete=false; uncertainAll=true; }
            for (const key of new Set([...Object.keys(stats),...Object.keys(augment.stats)])) {
                const left = has(stats,key) ? stats[key] : complete ? 0 : null;
                const right = has(augment.stats,key) ? augment.stats[key] : augment.statsComplete ? 0 : null;
                stats[key] = left === null || right === null ? null : left + right;
            }
        }
        if (!item.augments.length) { complete=false; uncertainAll=true; warnings.push('Excluded Exaltation stats have not been supplied.'); }
    }
    if (Object.values(stats).some(value => value === null)) complete=false;
    return {stats, complete, uncertainAll,accuracyPercent:item.accuracyPercent||!observed&&!has(item.baseStats,'ACCURACY')&&has(stats,'ACCURACY'),basis:preview?'catalog-tier-preview':observed ? 'observed-examine' : 'scaled-catalog', warnings};
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

/** Character totals are a single reviewed, fully equipped observation.
 * Item tiers, Exaltations, catalog stats and legacy baselines never enter totals.
 */
export function characterTotals(snapshot) {
    const state=normalizeState(snapshot),current=clone(state.statSnapshots.current),computed={};
    const keys=new Set([...CHARACTER_STAT_KEYS,...Object.keys(current?.stats||{})]);
    for(const key of keys){
        const value=current?.confirmed===true&&has(current.stats,key)?current.stats[key]:null;
        computed[key]={value,complete:value!==null,method:value===null?'unknown':'observed-equipped',caveats:value===null?['Current equipped statistic has not been read and reviewed.']:[]};
    }
    return {current,observed:clone(current),computed,derived:{},assignedCount:Object.keys(state.equipment).length,
        emptySlots:CHARACTER_SLOTS.filter(slot=>!state.equipment[slot.id]).map(slot=>slot.id),warnings:[]};
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
        const baseStats=normalizeCharacterStats(catalogBaseStats(item));
        return {name:identity.name,wikiTitle:identity.wikiTitle,catalogIdentity:identity,wikiMatch:match==='fuzzy'?'suggested':'confirmed',
            baseStats,baseStatsComplete:Object.keys(baseStats).length>0&&item.statsComplete!==false,details:characterCatalogDetails(item),
            unscaledStatKeys:[],accuracyPercent:item.accuracyPercent===true,iconId:clean(item.iconId,120),icon:safeCharacterIcon(icon)};
    }
    function resolveCatalog(id,item,options={}) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        const patch=catalogPatch(item,options);if(!patch)return {ok:false,error:'Choose a known cached item.'};
        const next=normalizeCandidate({...current,...patch,slots:current.slots.length?current.slots:item.slots,updatedAt:timestamp()});
        state.candidates[state.candidates.indexOf(current)]=next;return result(next);
    }
    function invalidateCatalog(id) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        current.catalogIdentity=null;current.wikiMatch='unmatched';if(!characterEquipmentEligibility(current).canEquip)detach(id);return result(current);
    }
    /** Recheck against the current local pack. Only exact legacy identities can
     * recover their old slot; fuzzy/ambiguous/missing cards remain loose. */
    function reconcileCatalog(resolve) {
        if(typeof resolve!=='function')return {ok:false,error:'A local catalog resolver is required.'};
        let resolutions;try{resolutions=state.candidates.map(candidate=>({parent:resolve(clone(candidate)),augments:candidate.augments.map(augment=>resolve(clone(augment),{socket:true}))}));}catch{return {ok:false,error:'The local catalog could not be read.'};}
        const refreshEffects=(augment,resolution)=>{
            if(resolution?.status!=='exact'||!resolution.item)return augment;
            const item=resolution.item,exact=value=>String(value||'').normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').trim().toLowerCase();
            const identities=[augment.name,augment.wikiTitle,augment.catalogIdentity?.wikiTitle].filter(Boolean).map(exact);
            if(resolution.exaltationAlias===true&&/\(Exaltation\)$/i.test(augment.name))identities.push(exact(augment.name.replace(/\s*\(Exaltation\)$/i,'')));
            if(![item.name,item.wikiTitle].some(name=>name&&identities.includes(exact(name))))return augment;
            const effects=characterEffectDetails(characterCatalogDetails(item));if(!effects.length)return augment;
            const replaced=new Set(effects.map(detail=>detail.label));
            return {...augment,details:normalizeCharacterItemDetails([...effects,...augment.details.filter(detail=>!replaced.has(detail.label))])};
        };
        const exact=new Set();
        state.candidates=state.candidates.map((candidate,index)=>{
            const resolution=resolutions[index].parent,augments=candidate.augments.map((augment,position)=>refreshEffects(augment,resolutions[index].augments[position])),patch=resolution?.status==='exact'&&resolution.item?catalogPatch(resolution.item,{match:candidate.catalogIdentity?.match||'exact',icon:resolution.icon}):null;
            if(!patch){const next=normalizeCandidate({...candidate,augments,catalogIdentity:null,wikiMatch:'unmatched'});if(!characterEquipmentEligibility(next).canEquip)detach(candidate.id);return next;}
            exact.add(candidate.id);return normalizeCandidate({...candidate,augments,...patch,...(Object.keys(candidate.baseStats).length?{baseStats:catalogBaseStats(resolution.item,candidate.baseStats),baseStatsComplete:candidate.baseStatsComplete,unscaledStatKeys:candidate.unscaledStatKeys}:{}),slots:candidate.slots.length?candidate.slots:resolution.item.slots});
        });
        for(const [slot,id]of Object.entries(state.pendingEquipment))if(exact.has(id)&&characterSlotCompatibility(get(id),slot).compatible&&!state.equipment[slot]&&!Object.values(state.equipment).includes(id))state.equipment[slot]=id;
        state.pendingEquipment={};return {ok:true,saved:save()};
    }
    /** Commit a complete parsed /outputfile inventory result. The parser and
     * exact local catalog resolver supply data, never filesystem paths. All
     * validation/resolution/storage checks finish before replacing live state.
     */
    function applyInventory(parsed,{resolveItem=()=>null,file}={},achievementImport=null) {
        const fail=message=>({ok:false,saved:false,error:message});
        try{
            if(parsed?.schemaVersion!==1||parsed.kind!=='eql-inventory-export'||!Array.isArray(parsed.equipment)||parsed.equipment.length!==23||parsed.equipmentSlotCount!==23||!Array.isArray(parsed.inventory)||!Array.isArray(parsed.keyring)||parsed.inventory.length>CHARACTER_LIMITS.candidates||parsed.keyring.length>CHARACTER_LIMITS.candidates||!Number.isSafeInteger(parsed.rowCount)||parsed.rowCount<23+parsed.inventory.length+parsed.keyring.length||parsed.rowCount>20000||typeof resolveItem!=='function')return fail('A complete supported inventory export is required. Existing inventory was kept.');
            const slots=new Set(),locations=new Set(),occurrences=new Map(),entries=[];
            const validate=(entry,group,slot=null)=>{
                if(!entry||typeof entry!=='object'||typeof entry.location!=='string'||!entry.location.trim()||entry.location.length>180||typeof entry.name!=='string'||entry.name.length>240||typeof entry.baseName!=='string'||entry.baseName.length>240||/[\u0000-\u001f\u007f]/.test(entry.location+entry.name+entry.baseName)||!Number.isSafeInteger(entry.itemId)||entry.itemId<0||entry.itemId>2147483647||!Number.isInteger(entry.count)||entry.count<0||entry.count>1e9||fullTier(entry.tier)===null)throw Error('The inventory export contains an invalid item row.');
                const suffix=/\s+\+(10|[0-9])$/u.exec(entry.name),baseName=suffix?entry.name.slice(0,suffix.index).trimEnd():entry.name;
                if(entry.baseName!==baseName||entry.tier!==(suffix?Number(suffix[1]):0))throw Error('The inventory export contains inconsistent item tiers.');
                if(entry.empty===true){if(!slot||entry.itemId!==0||entry.count!==0||entry.name&&entry.name!=='Empty')throw Error('The inventory export contains an invalid empty slot.');return null;}
                if(!entry.itemId||!entry.count||!entry.name.trim()||entry.name==='Empty')throw Error('The inventory export contains an invalid occupied item.');
                if(!slot&&group!=='augment'&&group!=='keyring'){const locationKey=group+'|'+entry.location;if(locations.has(locationKey))throw Error('The inventory export repeats a storage location.');locations.add(locationKey);}
                const identity=JSON.stringify([slot||group,entry.location,entry.itemId,entry.tier]),occurrence=occurrences.get(identity)||0;occurrences.set(identity,occurrence+1);
                const result={...entry,group,slot,key:JSON.stringify([slot||group,entry.location,entry.itemId,entry.tier,occurrence])};
                if(entry.contentsSeparate!==undefined&&(!['container','unverified'].includes(entry.contentsSeparate)||entry.augments!==undefined||entry.augmentSlots!==undefined))throw Error('The inventory export contains conflicting contents and socket relationships.');
                if(entry.augments!==undefined||entry.augmentSlots!==undefined){
                    if(!Array.isArray(entry.augments)||entry.augments.length>CHARACTER_LIMITS.augments||entry.augmentSlots!==entry.augments.length)throw Error(`The inventory export contains an unsupported Exaltation layout for ${entry.name} at ${entry.location} (maximum ${CHARACTER_LIMITS.augments} observed sockets).`);
                    const used=new Set();result.augments=entry.augments.map((child,index)=>{
                        if(child?.index!==index||!Number.isInteger(child.sourceSlot)||child.sourceSlot<1||child.sourceSlot>1e6||used.has(child.sourceSlot)||child.augments!==undefined)throw Error('The inventory export contains an invalid Exaltation location.');used.add(child.sourceSlot);
                        validate(child,'augment','socket');return {...child,group:'augment',slot:null,key:JSON.stringify([result.key,'socket',child.sourceSlot,child.itemId,child.tier])};
                    });
                }
                return result;
            };
            for(const entry of parsed.equipment){if(!INVENTORY_SLOTS.has(entry?.slot)||slots.has(entry.slot))throw Error('The inventory export must contain each of the 23 equipment slots once.');slots.add(entry.slot);const valid=validate(entry,'equipment',entry.slot);if(valid)entries.push(valid);}
            if([...INVENTORY_SLOTS].some(slot=>!slots.has(slot))||parsed.emptyEquipmentCount!==23-entries.length)throw Error('The inventory export has an incomplete equipment table.');
            for(const entry of parsed.inventory){if(!['inventory','bank','shared-bank','personal-depot','held','augment'].includes(entry?.group))throw Error('The inventory export contains an unsupported storage group.');entries.push(validate(entry,entry.group));}
            const keyring=parsed.keyring.map(entry=>{if(!['keyring','augment'].includes(entry?.group))throw Error('The inventory export contains an unsupported keyring group.');return validate(entry,entry.group);});
            const draft=clone(state),byKey=new Map();
            for(const candidate of draft.candidates)if(candidate.inventoryOrigin){const key=candidate.inventoryOrigin.key;if(byKey.has(key))throw Error('Saved inventory contains ambiguous export bindings. Existing cards were kept.');byKey.set(key,candidate);}
            const at=timestamp(),candidateIds=[],equipment={},rejectedItems=[];
            const resolve=entry=>{
                const resolution=resolveItem(clone(entry)),item=resolution?.item;
                const exact=value=>String(value??'').normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').trim().toLowerCase();
                const exactName=exact(entry.baseName),socketAlias=entry.group==='augment'&&resolution?.exaltationAlias===true&&/\s*\(Exaltation\)$/i.test(entry.baseName)?exact(entry.baseName.replace(/\s*\(Exaltation\)$/i,'')):null;
                const exportAlias=resolution?.exportNameAlias===true&&/[^*]\*$/u.test(entry.baseName)?exact(entry.baseName.slice(0,-1).trim()):null;
                return item&&[item.name,item.wikiTitle].some(name=>exact(name)===exactName||socketAlias&&exact(name)===socketAlias||exportAlias&&exact(name)===exportAlias)?catalogPatch(item,{match:'exact',icon:resolution.icon}):null;
            };
            const reject=(entry,reason='wiki-item-missing',slot=entry.slot)=>rejectedItems.push({name:entry.name,baseName:entry.baseName,tier:entry.tier,itemId:entry.itemId,location:entry.location,...(slot?{slot}:{}),reason});
            // Earlier imports gave loose Exaltations an ordinary storage key.
            // Reuse only a unique exact physical binding when its role changes.
            for(const entry of entries)if(entry.group==='augment'&&!byKey.has(entry.key)){
                const prior=draft.candidates.filter(candidate=>{const origin=candidate.inventoryOrigin;return origin&&['inventory','bank','shared-bank','personal-depot','held'].includes(origin.group)&&origin.location===entry.location&&origin.itemId===entry.itemId&&origin.tier===entry.tier&&origin.baseName===entry.baseName;});
                if(prior.length===1)byKey.set(entry.key,prior[0]);
            }
            const resolvedEntries=entries.map(entry=>({entry,patch:resolve(entry)}));
            const missing=resolvedEntries.filter(({entry,patch})=>patch&&!byKey.has(entry.key)).length;
            if(draft.candidates.length+missing>CHARACTER_LIMITS.candidates)return fail(`This export exceeds the ${CHARACTER_LIMITS.candidates}-card inventory bound. Existing cards were kept; clear unused inventory before importing.`);
            for(const {entry,patch} of resolvedEntries){
                const prior=byKey.get(entry.key);
                const socketPatch={};
                if(entry.contentsSeparate){
                    const manual=(prior?.augments||[]).filter(augment=>!augment.inventoryOrigin);
                    const provenEmpty=entry.contentsSeparate==='container'&&!manual.length;
                    const capacity=manual.length||prior?.editedFields.includes('augmentSlots')?prior?.augmentSlots??5:5;
                    Object.assign(socketPatch,{augments:manual,augmentSlots:provenEmpty?0:capacity,emptyAugmentSlots:provenEmpty?0:null,augmentStatus:provenEmpty?'none':'unknown',augmentBaseline:null});
                }
                if(!patch){
                    reject(entry);for(const child of entry.augments||[])if(!child.empty)reject(child,'parent-item-missing',entry.slot);
                    if(prior){prior.catalogIdentity=null;prior.wikiTitle='';prior.wikiMatch='unmatched';Object.assign(prior,socketPatch);}
                    continue;
                }
                const origin={...entry,importedAt:at},slot=entry.slot?SLOT_BY_ID.get(entry.slot):null;
                let id=prior?.id;if(!id){do{id=`character-${++draft.sequence}`;}while(draft.candidates.some(candidate=>candidate.id===id));}
                if(entry.augments){
                    socketPatch.augmentSlots=entry.augmentSlots;socketPatch.augments=[];
                    for(const child of entry.augments.filter(child=>!child.empty)){
                        const known=resolve(child),old=prior?.augments.find(augment=>augment.inventoryOrigin?.key===child.key);
                        if(!known){reject(child,'wiki-item-missing',entry.slot);continue;}
                        socketPatch.augments.push(augmentRecord({...old,index:child.index,sourceSlot:child.sourceSlot,inventoryOrigin:{...child,importedAt:at},name:known.name,wikiTitle:known.wikiTitle,catalogIdentity:known.catalogIdentity,details:known.details,baseStats:known.baseStats,unscaledStatKeys:known.unscaledStatKeys,iconId:known.iconId||old?.iconId||'',icon:known.icon||old?.icon||'',tier:child.tier,stats:old?.stats||{},statsComplete:old?.statsComplete===true},child.index));
                    }
                    socketPatch.emptyAugmentSlots=entry.augmentSlots-socketPatch.augments.length;
                    socketPatch.augmentStatus=socketPatch.augments.length?'included':'none';
                    if(prior?.observedStats&&Object.keys(prior.observedStats).length)socketPatch.augmentBaseline={mode:'unknown',emptyKnown:false,augments:[],uncertain:true};
                }
                const candidate=normalizeCandidate({...prior,...patch,id,name:patch?.name||entry.baseName,wikiTitle:patch?.wikiTitle||'',catalogIdentity:patch?.catalogIdentity||null,wikiMatch:patch?'confirmed':'unmatched',inventoryOrigin:origin,
                    ...socketPatch,origin:prior?.origin||'manual',tier:entry.tier,fraction:0,slots:slot?[slot.universal?'ANY':slot.kind]:prior?.slots||[],createdAt:prior?.createdAt??at,updatedAt:at});
                if(prior)draft.candidates[draft.candidates.indexOf(prior)]=candidate;else draft.candidates.push(candidate);
                candidateIds.push(id);if(slot)equipment[slot.id]=id;
            }
            const exportedKeyring=keyring.map(entry=>{const patch=resolve(entry);if(!patch)reject(entry);return {...entry,importedAt:at,known:Boolean(patch),wikiTitle:patch?.wikiTitle||'',iconId:patch?.iconId||''};});
            draft.equipment=equipment;draft.pendingEquipment={};draft.statSnapshots.current=null;
            draft.inventoryExport=inventoryExportRecord({schemaVersion:1,importedAt:at,file,candidateIds,rowCount:parsed.rowCount,equipmentSlotCount:23,emptyEquipmentCount:parsed.emptyEquipmentCount,inventoryCount:parsed.inventory.length,keyring:exportedKeyring,rejectedItems,warnings:parsed.warnings});draft.updatedAt=at;
            if(achievementImport){draft.achievements=achievementImport.data;draft.achievementExport={schemaVersion:1,importedAt:at,file:achievementImport.file};}
            const serialized=JSON.stringify(draft);if(new TextEncoder().encode(serialized).length>CHARACTER_LIMITS.storageBytes)return fail('This export exceeds the bounded Character storage. Existing inventory was kept.');
            if(achievementImport&&typeof storage?.setItem!=='function')return fail('Character storage is unavailable. Existing inventory and achievements were kept.');
            try{storage?.setItem(CHARACTER_STORAGE_KEY,serialized);}catch{return fail('The inventory export could not be saved. Existing inventory was kept.');}
            state=draft;return {ok:true,saved:true,importedCount:candidateIds.length,equippedCount:Object.keys(equipment).length,keyringCount:exportedKeyring.length,unknownCount:rejectedItems.length,rejectedCount:rejectedItems.length,inventoryExport:clone(draft.inventoryExport),...(achievementImport?{achievements:clone(draft.achievements),achievementExport:clone(draft.achievementExport)}:{})};
        }catch(error){return fail(error?.message||'The inventory export could not be applied. Existing inventory was kept.');}
    }
    function prepareAchievements(parsed,file){
        const data=normalizeAchievementExport(parsed);
        if(!data)throw Error('A complete supported achievement export is required. Existing Character data was kept.');
        return {data,file:achievementFile(file)};
    }
    function applyInventoryExport(parsed,options={}){return applyInventory(parsed,options);}
    function applyAchievementExport(parsed,{file}={}){
        try{
            const prepared=prepareAchievements(parsed,file),at=timestamp();
            if(at===null)throw Error('The achievement import time is invalid.');
            const draft=clone(state);draft.achievements=prepared.data;draft.achievementExport={schemaVersion:1,importedAt:at,file:prepared.file};draft.updatedAt=at;
            const serialized=JSON.stringify(draft);
            if(new TextEncoder().encode(serialized).length>CHARACTER_LIMITS.storageBytes)throw Error('This achievement export exceeds the bounded Character storage. Existing Character data was kept.');
            if(typeof storage?.setItem!=='function')throw Error('Character storage is unavailable.');
            storage.setItem(CHARACTER_STORAGE_KEY,serialized);state=draft;
            return {ok:true,saved:true,achievements:clone(draft.achievements),achievementExport:clone(draft.achievementExport)};
        }catch(error){return {ok:false,saved:false,error:error?.message||'The achievement export could not be saved. Existing Character data was kept.'};}
    }
    function applyCharacterExports({inventory,achievements}={}, {inventoryFile,achievementFile,resolveItem}={}){
        try{
            const prepared=prepareAchievements(achievements,achievementFile);
            if(timestamp()===null)throw Error('The achievement import time is invalid.');
            return applyInventory(inventory,{file:inventoryFile,resolveItem},prepared);
        }catch(error){return {ok:false,saved:false,error:error?.message||'The Character exports could not be saved. Existing Character data was kept.'};}
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
            details:source.details,accuracyPercent:source.accuracyPercent===true,slots:source.slots?.length ? source.slots : wiki.slots,tier:source.tier,fraction:source.fraction,observedStats:source.observedStats || source.stats,
            observedStatsComplete:source.statsComplete || source.observedStatsComplete,editedStatKeys:automaticObservation(observation)?[]:Object.keys(normalizeCharacterStats(source.observedStats||source.stats)),baseStats:wiki.stats || source.baseStats,
            unscaledStatKeys:source.unscaledStatKeys,
            baseStatsComplete:options.wikiItem ? true : source.baseStatsComplete,augments:source.augments,augmentSlots:source.augmentSlots,emptyAugmentSlots:source.emptyAugmentSlots,augmentStatus:source.augmentStatus,
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
        const next=normalizeCandidate({...current,...patch,itemRole:current.itemRole,origin:current.origin,lastObservedAt:current.lastObservedAt,lastObservedSequence:current.lastObservedSequence,observedTier:current.observedTier,observedFraction:current.observedFraction,catalogIdentity:current.catalogIdentity,observedName:current.observedName,editedStatKeys,editedFields,id:current.id,instanceKey:current.instanceKey,createdAt:current.createdAt,evidence:current.evidence,updatedAt:timestamp()});
        if (!next.name) return {ok:false,error:'An item name is required.'};
        if(has(patch,'slots')){next.slotReadWarning='';if(Object.entries(state.equipment).some(([slot,assigned])=>assigned===id&&!characterSlotCompatibility(next,slot).compatible))detach(id);}
        const eligibility=characterEquipmentEligibility(next);if(!eligibility.known)next.catalogIdentity=null;if(!eligibility.canEquip)detach(id);
        state.candidates[state.candidates.indexOf(current)]=next; return result(next);
    }
    function setTierPreview(id,{tier}={}) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(fullTier(tier)===null)return {ok:false,error:'Choose tier 0–10.'};
        const available=characterEquipmentEligibility(current).known&&Object.keys(current.baseStats).length>0,original=Object.keys(current.observedStats).length>0&&current.observedTier===tier;
        if(original)return setObservedBasis(id);
        return updateCandidate(id,{tier,fraction:0,statBasis:available?'catalog-tier-preview':'observed',previewWarning:available?'':'Catalog tier preview is unavailable; captured values remain unchanged.'});
    }
    function setObservedBasis(id) {
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(!Object.keys(current.observedStats).length)return {ok:false,error:'No captured item values are available.'};
        const next=normalizeCandidate({...current,tier:current.observedTier,fraction:current.observedFraction,statBasis:'observed',previewWarning:'',editedFields:current.editedFields.filter(key=>key!=='tier'&&key!=='fraction'),updatedAt:timestamp()});
        state.candidates[state.candidates.indexOf(current)]=next;return result(next);
    }
    function socketBaseline(current){
        if(current.augmentBaseline)return clone(current.augmentBaseline);
        const excluded=!Object.keys(current.observedStats).length||['none','excluded'].includes(current.augmentStatus);
        return {mode:excluded?'excluded':current.augmentStatus==='included'?'included':'unknown',emptyKnown:excluded||current.augmentSlots!==null&&current.emptyAugmentSlots!==null&&current.emptyAugmentSlots+current.augments.length===current.augmentSlots,augments:clone(current.augments),uncertain:false,overrides:{}};
    }
    function recapturedSocketBaseline(current,source,mergedStatKeys){
        if(!current.augmentBaseline||!mergedStatKeys.length)return current.augmentBaseline;
        const previous=current.augmentBaseline,raw=parseItemAugmentSlots(source.rawStatBlock),capacity=socketCount(source.augmentSlots)??raw.augmentSlotCount,empty=socketCount(source.emptyAugmentSlots)??raw.emptyAugmentSlots;
        const incoming=Array.isArray(source.augments)?source.augments:raw.augments,known=[...current.augments,...previous.augments],occupied=[],indices=new Set();
        let verified=capacity!==null&&empty!==null&&incoming.length+empty===capacity;
        for(const entry of incoming){
            const index=entry?.index,name=characterBaseItemName(entry?.name).normalize('NFKC').toLowerCase(),suffix=String(entry?.name||'').match(/\+(10|[0-9])\s*$/),tier=fullTier(entry?.tier)??(suffix?Number(suffix[1]):0);
            const match=known.find(augment=>augment.index===index&&characterEquipmentEligibility(augment).known&&characterBaseItemName(augment.name).normalize('NFKC').toLowerCase()===name&&augment.tier===tier);
            if(!Number.isInteger(index)||index<0||index>=capacity||indices.has(index)||!match)verified=false;
            indices.add(index);if(match)occupied.push(clone(match));
        }
        const fresh=new Set(mergedStatKeys),overrides={};
        for(const key of Object.keys(current.observedStats))if(!fresh.has(key))overrides[key]=originalAugmentContribution(previous,key);
        // Fresh measured values may already include the configured augment.
        // Only fully enumerated, known sockets establish that new inclusion
        // basis. Otherwise the adjustment is unknown instead of adding twice.
        return verified?{mode:'included',emptyKnown:true,augments:occupied,uncertain:false,overrides}:{...clone(previous),uncertain:true,overrides};
    }
    function setAugmentSlots(id,count){
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(socketCount(count)===null)return {ok:false,error:'Choose 0–8 augment slots.'};
        if(current.augments.some(augment=>augment.index>=count))return {ok:false,error:'Remove occupied Exaltations before reducing the slot count.'};
        return updateCandidate(id,{augmentSlots:count});
    }
    function setAugment(id,index,known){
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(current.augmentSlots===null)return {ok:false,error:'Set the Exaltation slot count first.'};
        if(!Number.isInteger(index)||index<0||index>=current.augmentSlots)return {ok:false,error:'Choose an available numbered Exaltation slot.'};
        if(!characterEquipmentEligibility(known).known)return {ok:false,error:'Choose a known cached item for this Exaltation slot.'};
        // A catalog ingredient supplies its own tiered base stats; it does not
        // recursively contain the selected item's possible sockets/effects.
        const effective=has(known,'baseStats')||has(known,'observedStats')?characterItemStats({...known,augmentStatus:'none',augments:[],augmentBaseline:null}):{stats:normalizeCharacterStats(known.stats),complete:known.statsComplete===true||known.complete===true};
        const augment=augmentRecord({...known,stats:effective.stats,statsComplete:effective.complete},index),augments=[...current.augments.filter(value=>value.index!==index),augment];
        return updateCandidate(id,{augments,augmentBaseline:socketBaseline(current),augmentStatus:current.augmentStatus==='none'?'excluded':current.augmentStatus});
    }
    function removeAugment(id,index){
        const current=get(id);if(!current)return {ok:false,error:'Item card no longer exists.'};
        if(!Number.isInteger(index)||index<0||index>=CHARACTER_LIMITS.augments)return {ok:false,error:'Choose a numbered Exaltation slot.'};
        if(!current.augments.some(value=>value.index===index))return {ok:true,candidate:clone(current),saved:true};
        return updateCandidate(id,{augments:current.augments.filter(value=>value.index!==index),augmentBaseline:socketBaseline(current)});
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
        if(current.augmentBaseline)patch.augmentBaseline=recapturedSocketBaseline(current,source,mergedStatKeys);
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
        if(!editedFields.has('augmentSlots')&&!current.augmentBaseline&&source.augmentSlots!==undefined)patch.augmentSlots=source.augmentSlots;
        if(!editedFields.has('augments')&&!current.augmentBaseline&&source.augments!==undefined)patch.augments=source.augments;
        if(!current.augmentBaseline&&source.emptyAugmentSlots!==undefined)patch.emptyAugmentSlots=source.emptyAugmentSlots;
        if(numeric(source.level)!==null&&!editedFields.has('level'))patch.level=source.level;
        const wiki=options.wikiItem;
        if(wiki&&typeof wiki==='object') {
            const identity=catalogPatch(wiki,{match:options.catalogMatch||'exact',icon:options.icon}),protectedIdentity=editedFields.has('name')||editedFields.has('wikiTitle')||current.catalogIdentity?.match==='manual';
            if(identity&&(!protectedIdentity||identityName(current.name)===identityName(identity.name)&&identityTitle(current.wikiTitle)===identityTitle(identity.wikiTitle))){
                if(Object.keys(current.baseStats).length){identity.baseStats=catalogBaseStats(wiki,current.baseStats);delete identity.baseStatsComplete;delete identity.unscaledStatKeys;}
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
    return {intake,lookupObservation,updateCandidate,mergeObservation,setTierPreview,setObservedBasis,setAugmentSlots,setAugment,removeAugment,resolveCatalog,invalidateCatalog,reconcileCatalog,assign,autoAssign,
        snapshot:()=>clone(state), totals:()=>characterTotals(state),applyInventoryExport,applyAchievementExport,applyCharacterExports,
        duplicateCandidate(id) { const source=get(id);if(!source)return {ok:false,error:'Item card no longer exists.'};
            if(state.candidates.length>=CHARACTER_LIMITS.candidates)return capacityError();const beforeAddition=clone(state);
            const candidate=normalizeCandidate({...source,id:nextId(),origin:'manual',instanceKey:'',inventoryOrigin:null,evidence:[],seenCount:1,createdAt:timestamp(),updatedAt:timestamp()});
            state.candidates.push(candidate);return addedResult(candidate,beforeAddition); },
        removeCandidate(id) { if (!get(id)) return {ok:false,error:'Item card no longer exists.'};rememberRemoval(get(id));
            state.candidates=state.candidates.filter(candidate=>candidate.id!==id);
            detach(id);
            return {ok:true,saved:save()}; },
        unassign(slotId) { if(!SLOT_BY_ID.has(slotId))return {ok:false,error:'Unknown equipment slot.'};delete state.equipment[slotId];delete state.pendingEquipment[slotId];return {ok:true,saved:save()}; },
        setMetadata(patch) { state.metadata=metadata({...state.metadata,...patch});return {ok:true,saved:save()}; },
        beginSnapshot(patch={}) {state.metadata=metadata({...state.metadata,...patch});state.statSnapshots.current=null;return {ok:true,saved:save()};},
        clearCurrentStats(){state.statSnapshots.current=null;return {ok:true,saved:save()};},
        clearInventory(){for(const candidate of state.candidates)rememberRemoval(candidate);state.candidates=[];state.equipment={};state.pendingEquipment={};state.inventoryExport=null;state.statSnapshots.current=null;return {ok:true,saved:save()};},
        setStatSnapshot(kind,value) { if(!['base','equipped','current'].includes(kind))return {ok:false,error:'Stat snapshot must be current, base or equipped.'};
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
        stats:{current:totals.current?{stats:totals.current.stats,confirmed:totals.current.confirmed,at:totals.current.at}:null,computed:totals.computed},
        equipment:CHARACTER_SLOTS.map(slot=>{const item=byId.get(state.equipment[slot.id]);return {slot:slot.id,label:slot.label,item:item ? {
            name:item.name,wikiTitle:item.wikiTitle,wikiMatch:item.wikiMatch,iconId:item.iconId,tier:item.tier,fraction:item.fraction,observedTier:item.observedTier,observedFraction:item.observedFraction,statBasis:item.statBasis,level:item.level,
            details:normalizeCharacterItemDetails(item.details),slots:item.slots,observedStats:item.observedStats,baseStats:item.baseStats,...characterItemStats(item),
            augments:item.augments.map(augment=>({index:augment.index,name:augment.name,wikiTitle:augment.wikiTitle,iconId:augment.iconId,tier:augment.tier,details:normalizeCharacterItemDetails(augment.details),...characterExaltationStats(augment)})),augmentSlots:item.augmentSlots,augmentStatus:item.augmentStatus,slotWarning:characterSlotCompatibility(item,slot.id).warning} : null};}),
        caveat:'Character totals are the reviewed equipped statistics. Individual gear, tier and Exaltation values never change the observed totals.'};
}
