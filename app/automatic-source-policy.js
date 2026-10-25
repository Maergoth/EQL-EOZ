import {createWikiResolver} from './wiki-identity.js';
import {classifyCachedLoot} from './loot-classification.js';
import {contributionTemplates} from './contribution-model.js';

// Suppress routine automatic source backfill only when the public cached record
// positively describes a common, unequippable material. Missing metadata is not
// evidence of statlessness. Manual contributions never use this policy.
const flagLine=/^(?:(?:MAGIC ITEM|LORE ITEM|NO DROP|NODROP|NO TRADE|QUEST ITEM|QUEST|TEMPORARY|ATTUNABLE|PLACEABLE)[,\s]*)+$/i;
const completeCard=record=>record?.contributionCard?.schemaVersion===1&&record.contributionCard.complete===true&&typeof record.contributionCard.questContext==='boolean';
function explicitMaterialRecord(record){
    if(!completeCard(record)||!record.stats||typeof record.stats!=='object'||Array.isArray(record.stats)||!Array.isArray(record.slots)||record.slots.length||!Array.isArray(record.displayLines)||!record.displayLines.length||record.displayLines.length>16)return false;
    if(Object.entries(record).some(([key,value])=>/^(?:effects?|effectName|effectType|focusEffect|clickEffect|wornEffect|combatEffect|proc|procs|instrument(?:Type|Mod(?:ifier)?)?|focus_effect|click_effect|worn_effect)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
    if(Object.entries(record).some(([key,value])=>/^(?:questRoles?|specialDamage|baneDamage|lore|noTrade|noDrop|bound)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
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
export function skipAutomaticSourceBackfill(pack,itemTitle,{resolver=createWikiResolver(pack||{}),manual=false,itemPage}={}){
    if(manual||pack?.meta?.sample===true||pack?.meta?.lootSourceCountsVersion!==2||!resolver.complete)return false;
    const item=resolver.resolve('item',itemTitle);
    if(item.membership!=='present'||!item.records.length||!item.records.every(record=>explicitMaterialRecord(record)&&(!itemPage||liveCardMatches(record,itemPage,explicitMaterialRecord))))return false;
    const proof=classifyCachedLoot(pack,itemTitle,[],{resolver});
    return proof.kind==='common'&&proof.recordedCount>=6;
}

const BASIC_SLOTS=new Set(['PRIMARY','SECONDARY','RANGE','AMMO','ARMS','BACK','CHEST','CHARM','EAR','FACE','FEET','FINGER','FINGERS','HANDS','HEAD','LEGS','NECK','SHOULDERS','WAIST','WRIST']);
const basicKey=key=>({DAMAGE:'DMG',BASE_DMG:'DMG',BACKSTAB:'BACKSTAB_DMG'})[key.toUpperCase()]||key.toUpperCase();
const BASIC_STATS=new Set(['AC','DMG','BACKSTAB_DMG','DMG_BONUS','DELAY','RANGE','WT']);
const CLASSES='(?:WAR|CLR|PAL|RNG|SHD|DRU|MNK|BRD|ROG|SHM|NEC|WIZ|MAG|ENC|BST|BER)';
function explicitBasicEquipment(record){
    if(!completeCard(record)||!record.stats||typeof record.stats!=='object'||Array.isArray(record.stats)||!Array.isArray(record.slots)||!record.slots.length||record.slots.some(slot=>typeof slot!=='string'||!BASIC_SLOTS.has(slot.toUpperCase()))||!Array.isArray(record.displayLines)||!record.displayLines.length||record.displayLines.length>16)return false;
    // Binding, effects, quest roles and special modifiers remain useful even
    // when a legacy stats object omitted their numeric/display representation.
    if(Object.entries(record).some(([key,value])=>/^(?:effects?|effectName|effectType|focusEffect|clickEffect|wornEffect|combatEffect|proc|procs|instrument(?:Type|Mod(?:ifier)?)?|focus_effect|click_effect|worn_effect|questRoles?|special.*|bane.*|elemental.*|modifiers?|bonuses?|lore|noTrade|noDrop|bound)$/i.test(key)&&value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)))return false;
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
const KNOWN_CARD_FIELDS=new Set(['itemname','statsblock','dropsfrom','drops_from','lucy_img_ID','lucy_img_id','icon','icon_id','notes','soldby','merchant_value','recipes','relatedquests','foraged']);
const CONTEXT_TEMPLATES=new Set(['ItemWhereTable','ItemWhereRow','Loc','VeliousGray','Era']);
const templateKey=value=>{const [first,...rest]=value.trim().replace(/^Template\s*:/i,'').replace(/_/g,' ');return first?first.toUpperCase()+rest.join(''):'';};
function templateParts(body){
    let start=0,depth=0,links=0;const parts=[];
    for(let index=0;index<body.length;index++){
        const pair=body.slice(index,index+2);
        if(pair==='{{'){depth++;index++;}else if(pair==='}}'){if(!depth)return null;depth--;index++;}
        else if(pair==='[['){links++;index++;}else if(pair===']]'){if(!links)return null;links--;index++;}
        else if(body[index]==='|'&&!depth&&!links){parts.push(body.slice(start,index));start=index+1;}
    }
    if(depth||links)return null;parts.push(body.slice(start));return parts;
}
function literalContext(value,depth=0){
    if(depth>=8||/\{\{\{/.test(value))return false;
    let cursor=0,count=0;
    while(cursor<value.length){
        const start=value.indexOf('{{',cursor);if(start<0)return !value.slice(cursor).includes('}}');
        if(value.slice(cursor,start).includes('}}')||++count>1000)return false;
        let nested=1,end=start+2;
        for(;end<value.length-1;end++){const pair=value.slice(end,end+2);if(pair==='{{'){nested++;end++;}else if(pair==='}}'){nested--;end++;if(!nested){end++;break;}}}
        if(nested)return false;
        const parts=templateParts(value.slice(start+2,end-2));if(!parts)return false;
        const name=templateKey(parts.shift());
        if(!CONTEXT_TEMPLATES.has(name))return false;
        const keys=new Set();for(const part of parts){const named=part.match(/^\s*([A-Za-z][A-Za-z0-9_ ]*)\s*=/);if(named){const key=named[1].trim().toLowerCase();if(keys.has(key))return false;keys.add(key);}if(!literalContext(part,depth+1))return false;}
        cursor=end;
    }
    return true;
}
function liveCardMatches(record,page,predicate){
    if(page.missing||typeof page.content!=='string'||new TextEncoder().encode(page.content).byteLength>512*1024)return false;
    try{
        const source=page.content.replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,value=>value.replace(/[^\r\n]/g,' '));
        const templates=contributionTemplates(source,'Itempage');if(templates.length!==1)return false;
        let depth=0;for(const match of source.matchAll(/\{\{|\}\}/g)){if(match.index===templates[0].start&&depth!==0)return false;if(match[0]==='{{')depth++;else if(depth)depth--;else return false;}if(depth)return false;
        const parts=templateParts(source.slice(templates[0].start+2,templates[0].end-2));if(!parts||parts.slice(1).some(part=>part.trim()&&!/^\s*[A-Za-z][A-Za-z0-9_ ]*\s*=/.test(part)))return false;
        if(templateKey(parts[0])!=='Itempage')return false;
        const fields=templates[0].fields,names=fields.map(field=>field.name.toLowerCase());if(new Set(names).size!==names.length)return false;
        const stats=fields.filter(field=>field.name==='statsblock'),name=fields.find(field=>field.name==='itemname');if(stats.length!==1||!stats[0].value.trim()||!name?.value.trim())return false;
        if(names.includes('dropsfrom')&&names.includes('drops_from'))return false;
        const literal=page.content.slice(templates[0].start,templates[0].end).replace(/<!--[\s\S]*?(?:-->|$)/g,'');if(/<\/?(?:nowiki|pre|source|syntaxhighlight|ref|code)\b/i.test(literal))return false;
        if(fields.some(field=>!KNOWN_CARD_FIELDS.has(field.name)&&field.value.trim()))return false;
        if(fields.some(field=>field.name.toLowerCase()!=='statsblock'&&!literalContext(field.value)))return false;
        if(fields.some(field=>['itemname','lucy_img_id','icon','icon_id'].includes(field.name.toLowerCase())&&/\{\{|\}\}/.test(field.value)))return false;
        const text=page.content.slice(stats[0].valueStart,stats[0].end).replace(/<!--[\s\S]*?(?:-->|$)/g,'');
        if(/<(?:nowiki|pre|source|syntaxhighlight|ref|code)\b/i.test(text))return false;
        if(/\{\{|\}\}|<(?!br\s*\/?\s*>|\/?(?:b|strong|i|em|p)\s*>)[^>]*>/i.test(text))return false;
        if(/[<>]/.test(text.replace(/<br\s*\/?\s*>|<\/?(?:b|strong|i|em|p)\s*>/gi,'')))return false;
        const decode=value=>value.replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|[0-9]+);/gi,entity=>{const named={'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[entity.toLowerCase()];if(named!==undefined)return named;const code=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));return Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):entity;});
        const lines=text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/<[^>]*>/g,'').split(/\r\n|\n|\r/).map(line=>decode(line).replace(/\s+/g,' ').trim()).filter(Boolean);
        if(lines.length>16||lines.some(line=>line.length>1000))return false;
        if(JSON.stringify(lines)!==JSON.stringify(record.displayLines.map(line=>line.replace(/\s+/g,' ').trim())))return false;
        return predicate({...record,displayLines:lines});
    }catch{return false;}
}

// Basic AC/weapon metadata is not an exception to broad authored coverage.
// This predicate is deliberately narrower than "common gear": only a broad
// affected field plus a complete plain-card proof can suppress enumeration.
export function skipBroadAutomaticSourceBackfill(pack,itemTitle,{coverage,itemPage,resolver=createWikiResolver(pack||{}),manual=false}={}){
    if(manual||coverage?.state!=='broad'||pack?.meta?.sample===true||pack?.meta?.lootSourceCountsVersion!==2||!resolver.complete)return false;
    const item=resolver.resolve('item',itemTitle);
    if(item.membership!=='present'||!item.records.length||!item.records.every(record=>explicitBasicEquipment(record)&&(!itemPage||liveCardMatches(record,itemPage,explicitBasicEquipment))))return false;
    const proof=classifyCachedLoot(pack,itemTitle,[],{resolver});return proof.kind==='common'&&proof.recordedCount>=6;
}
