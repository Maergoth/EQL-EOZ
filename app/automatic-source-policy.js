import {createWikiResolver} from './wiki-identity.js';
import {classifyCachedLoot} from './loot-classification.js';
import {contributionTemplates} from './contribution-model.js';

// Suppress routine automatic source backfill only when the public cached record
// positively describes a common, unequippable material. Missing metadata is not
// evidence of statlessness. Manual contributions never use this policy.
const flagLine=/^(?:(?:MAGIC ITEM|LORE ITEM|NO DROP|NODROP|NO TRADE|QUEST ITEM|QUEST|TEMPORARY|ATTUNABLE|PLACEABLE)[,\s]*)+$/i;
function explicitMaterialRecord(record){
    if(!record||!record.stats||typeof record.stats!=='object'||Array.isArray(record.stats)||!Array.isArray(record.slots)||record.slots.length||!Array.isArray(record.displayLines)||!record.displayLines.length||record.displayLines.length>60)return false;
    if(Object.entries(record).some(([key,value])=>/^(?:effects?|effectName|effectType|focusEffect|clickEffect|wornEffect|combatEffect|proc|procs|instrument(?:Type|Mod(?:ifier)?)?|focus_effect|click_effect|worn_effect)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
    if(Object.entries(record).some(([key,value])=>/^(?:questLinks?|quests?|questRoles?|specialDamage|baneDamage|lore|noTrade|noDrop|bound)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
    const entries=Object.entries(record.stats);if(entries.length!==1||entries[0][0]!=='WT'||typeof entries[0][1]!=='number'||!Number.isFinite(entries[0][1])||entries[0][1]<0)return false;
    let weightSeen=false;
    for(const value of record.displayLines){
        if(typeof value!=='string'||value.length>1000)return false;
        const line=value.trim();if(!line)return false;
        // Bound/lore quest objects can be important despite a WT-only card.
        // Ordinary tradeable materials need positive simple metadata proof.
        if(/\b(?:NO\s*TRADE|NO\s*DROP|LORE|TEMPORARY|ATTUNABLE)\b/i.test(line))return false;
        if(flagLine.test(line))continue;
        let metadata=false,remaining=line.replace(/\b(?:WT|Weight)\s*:\s*(\d+(?:\.\d+)?)/gi,(_match,weight)=>{if(Number(weight)!==record.stats.WT)return _match;metadata=true;weightSeen=true;return '';})
            .replace(/\bSize\s*:\s*(?:TINY|SMALL|MEDIUM|LARGE|GIANT)\b/gi,()=>{metadata=true;return '';})
            .replace(/\bClass\s*:\s*(?:ALL|NONE)\b/gi,()=>{metadata=true;return '';})
            .replace(/\bRace\s*:\s*ALL\b/gi,()=>{metadata=true;return '';});
        if(!metadata||remaining.trim())return false;
    }
    return weightSeen;
}
export function skipAutomaticSourceBackfill(pack,itemTitle,{resolver=createWikiResolver(pack||{}),manual=false}={}){
    if(manual||pack?.meta?.sample===true||pack?.meta?.lootSourceCountsVersion!==2||!resolver.complete)return false;
    const item=resolver.resolve('item',itemTitle);
    if(item.membership!=='present'||!item.records.length||!item.records.every(explicitMaterialRecord))return false;
    const proof=classifyCachedLoot(pack,itemTitle,[],{resolver});
    return proof.kind==='common'&&proof.recordedCount>=6;
}

const BASIC_SLOTS=new Set(['PRIMARY','SECONDARY','RANGE','AMMO','ARMS','BACK','CHEST','CHARM','EAR','FACE','FEET','FINGER','FINGERS','HANDS','HEAD','LEGS','NECK','SHOULDERS','WAIST','WRIST']);
const basicKey=key=>({DAMAGE:'DMG',BASE_DMG:'DMG',BACKSTAB:'BACKSTAB_DMG'})[key.toUpperCase()]||key.toUpperCase();
const BASIC_STATS=new Set(['AC','DMG','BACKSTAB_DMG','DMG_BONUS','DELAY','RANGE','WT']);
const CLASSES='(?:WAR|CLR|PAL|RNG|SHD|DRU|MNK|BRD|ROG|SHM|NEC|WIZ|MAG|ENC|BST|BER)';
function explicitBasicEquipment(record){
    if(!record||!record.stats||typeof record.stats!=='object'||Array.isArray(record.stats)||!Array.isArray(record.slots)||!record.slots.length||record.slots.some(slot=>typeof slot!=='string'||!BASIC_SLOTS.has(slot.toUpperCase()))||!Array.isArray(record.displayLines)||!record.displayLines.length||record.displayLines.length>60)return false;
    // Binding, effects, quest roles and special modifiers remain useful even
    // when a legacy stats object omitted their numeric/display representation.
    if(Object.entries(record).some(([key,value])=>/^(?:effects?|effectName|effectType|focusEffect|clickEffect|wornEffect|combatEffect|proc|procs|instrument(?:Type|Mod(?:ifier)?)?|focus_effect|click_effect|worn_effect|questLinks?|quests?|questRoles?|special.*|bane.*|elemental.*|modifiers?|bonuses?|lore|noTrade|noDrop|bound)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
    const stats=new Map();
    for(const [key,value]of Object.entries(record.stats)){
        const name=basicKey(key);if(!BASIC_STATS.has(name)||typeof value!=='number'||!Number.isFinite(value)||value<0||stats.has(name))return false;stats.set(name,value);
    }
    if(!stats.has('WT')||!((stats.get('AC')||0)>0||(stats.get('DMG')||0)>0))return false;
    let weightSeen=false,slotSeen=false,baseSeen=false;const seen=new Set();
    for(const value of record.displayLines){
        if(typeof value!=='string'||value.length>1000||!value.trim()||/\b(?:NO\s*TRADE|NO\s*DROP|LORE|TEMPORARY)\b/i.test(value))return false;
        const line=value.trim();if(flagLine.test(line))continue;
        let mismatch=false;
        const labels=/(?:\b(?:Base\s+)?(?:DMG|Damage)|\bBackstab(?:\s+DMG)?|\bDmg\s+Bon(?:us)?|\bAC|\bWT|\bWeight|\b(?:Atk\s+)?Delay|\bRange)\s*:\s*(\+?\d+(?:\.\d+)?)(?![\d.])/gi;
        let remaining=line.replace(labels,(match,raw)=>{
            const label=match.slice(0,match.indexOf(':')).replace(/\s+/g,' ').toUpperCase(),name=label==='WEIGHT'?'WT':label==='BASE DMG'||label==='BASE DAMAGE'||label==='DAMAGE'?'DMG':/^BACKSTAB/.test(label)?'BACKSTAB_DMG':/^DMG BON/.test(label)?'DMG_BONUS':label==='ATK DELAY'?'DELAY':label;
            const number=Number(raw);if(!Number.isFinite(number)||stats.has(name)&&stats.get(name)!==number)mismatch=true;
            seen.add(name);if(name==='WT')weightSeen=true;if(['AC','DMG'].includes(name))baseSeen=true;return '';
        });
        remaining=remaining.replace(/\bSlot\s*:\s*((?:[A-Z]+[ ]*)+)/gi,(match,slots)=>{const names=slots.trim().split(/\s+/);if(!names.length||names.some(slot=>!BASIC_SLOTS.has(slot.toUpperCase()))||names.length!==record.slots.length||names.some(slot=>!record.slots.includes(slot.toUpperCase())))mismatch=true;slotSeen=true;return '';})
            .replace(/\bSkill\s*:\s*(?:(?:1H|2H)\s+)?(?:Slashing|Piercing|Blunt|Hand\s+to\s+Hand|Archery|Throwing)\b/gi,'')
            .replace(/\bSize\s*:\s*(?:TINY|SMALL|MEDIUM|LARGE|GIANT)\b/gi,'')
            .replace(new RegExp('\\bClass\\s*:\\s*(?:ALL(?:\\s+except\\s+'+CLASSES+'(?:\\s+'+CLASSES+')*)?|'+CLASSES+'(?:\\s+'+CLASSES+')*)\\b','gi'),'')
            .replace(/\bRace\s*:\s*ALL\b/gi,'');
        if(mismatch||remaining.trim())return false;
    }
    return weightSeen&&slotSeen&&baseSeen&&[...stats.keys()].every(name=>seen.has(name));
}
function liveBasicEquipment(record,page){
    if(page.missing||typeof page.content!=='string'||page.content.length>512*1024)return false;
    try{
        const templates=contributionTemplates(page.content,'Itempage');if(templates.length!==1)return false;
        const fields=templates[0].fields,names=fields.map(field=>field.name.toLowerCase());if(new Set(names).size!==names.length)return false;
        const stats=fields.filter(field=>field.name.toLowerCase()==='statsblock');if(stats.length!==1)return false;
        const metadata=new Set(['itemname','statsblock','dropsfrom','drops_from','lucy_img_id','icon','icon_id','notes']);
        if(fields.some(field=>!metadata.has(field.name.toLowerCase())&&field.value.trim()))return false;
        const text=stats[0].value.replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
        if(/\{\{|\}\}|<(?:img|script|style|object)\b/i.test(text))return false;
        const lines=text.replace(/<br\s*\/?>|<\/p\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/'''|''/g,'').replace(/&nbsp;|&#160;/gi,' ').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
        return explicitBasicEquipment({...record,displayLines:lines});
    }catch{return false;}
}

// Basic AC/weapon metadata is not an exception to broad authored coverage.
// This predicate is deliberately narrower than "common gear": only a broad
// affected field plus a complete plain-card proof can suppress enumeration.
export function skipBroadAutomaticSourceBackfill(pack,itemTitle,{coverage,itemPage,resolver=createWikiResolver(pack||{}),manual=false}={}){
    if(manual||coverage?.state!=='broad'||pack?.meta?.sample===true||pack?.meta?.lootSourceCountsVersion!==2||!resolver.complete)return false;
    const item=resolver.resolve('item',itemTitle);
    if(item.membership!=='present'||!item.records.length||!item.records.every(record=>explicitBasicEquipment(record)&&(!itemPage||liveBasicEquipment(record,itemPage))))return false;
    const proof=classifyCachedLoot(pack,itemTitle,[],{resolver});return proof.kind==='common'&&proof.recordedCount>=6;
}
