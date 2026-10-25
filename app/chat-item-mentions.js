import { itemExaltationBaseIdentity, normalizeWikiIdentity, wikiPageTitleKey } from './wiki-identity.js';

// Flattened chat has lost the native link boundaries. Capitalization cannot
// establish where prose ends and an unknown item starts. Typed catalog names
// establish known identities; explicit inner quotes/brackets bound unknowns.
const indexes = new WeakMap(), EMPTY = Object.freeze({});
const rank = '(10|[0-9])(?![\\p{L}\\p{N}]|\\.\\d|\\+\\d)';
const markerPatterns = [new RegExp('\\[([^\\]\\r\\n]{1,240})\\](?:[ \\t]+\\+'+rank+')?','gu'),new RegExp('"([^"\\r\\n]{1,240})"(?:[ \\t]+\\+'+rank+')?','gu')];
const safeName = value => {
    const name=String(value||'').trim().replace(/\s+/g,' ');
    return name.length>=1&&name.length<=230&&name.split(' ').length<=16&&/[\p{L}]/u.test(name)&&!/[\u0000-\u001f\u007f\\<>\[\]{}|+]/.test(name)?name:null;
};
const mechanic = /^(?:AC|HP|Mana|Endurance|STR|STA|AGI|DEX|WIS|INT|CHA|Strength|Stamina|Agility|Dexterity|Wisdom|Intelligence|Charisma|Damage Shield|Spell Shield|Armor Class|Attack Speed|Damage Bonus|Haste|Attack|Accuracy|Avoidance|Weight|Delay|Tier|Level|Stats?|Buffs?|Spells?|SV (?:Fire|Cold|Magic|Poison|Disease|Void|Corruption))$/i;
function catalogIndex(pack) {
    pack=pack&&typeof pack==='object'?pack:EMPTY;
    if(indexes.has(pack))return indexes.get(pack);
    const byName=new Map();
    const add=(name,title)=>{
        if(typeof name!=='string'||typeof title!=='string')return;
        name=itemExaltationBaseIdentity(name);title=itemExaltationBaseIdentity(title);
        const key=normalizeWikiIdentity(name);if(!key||name.length>230||!safeName(name)||!safeName(title))return;
        const entry=byName.get(key)||{key,titles:new Map()};entry.titles.set(wikiPageTitleKey(title),title);byName.set(key,entry);
    };
    const rich=[...(Array.isArray(pack.items)?pack.items:[]),...(Array.isArray(pack.wikiEntities?.items)?pack.wikiEntities.items.filter(value=>value&&typeof value==='object'):[])];
    for(const item of rich){const title=item?.wikiTitle||item?.title||item?.name;for(const name of [item?.name,item?.title,item?.wikiTitle,...(Array.isArray(item?.aliases)?item.aliases:[])])add(name,title);}
    // Flat aliases supply membership, not a competing canonical page.
    for(const name of Array.isArray(pack.wikiEntities?.items)?pack.wikiEntities.items:[])if(typeof name==='string'&&!byName.has(normalizeWikiIdentity(name)))add(name,name);
    const tails=new Map();
    for(const entry of byName.values()){const last=entry.key.split(' ').at(-1),rows=tails.get(last)||[];rows.push(entry);tails.set(last,rows);}
    for(const rows of tails.values())rows.sort((a,b)=>b.key.length-a.key.length);
    const result={byName,tails};indexes.set(pack,result);return result;
}
const chatPayload=text=>String(text||'').slice(0,16384).match(/^(?:You|[\p{L}][\p{L}'’-]{0,63}) (?:tells? (?:you|the (?:guild|group|raid)|[\p{L}][\p{L}\d_-]{0,40}:\d{1,3})|says?(?: out of character)?|shouts?|auctions?),[ \t]*'([^\r\n]{1,2048})'$/u)?.[1];

export function rankedChatItemMentions(text, pack=EMPTY) {
    // Explicit non-item or malformed link controls must not be reinterpreted
    // as plain chat. Authentic item links have already won in the parser.
    if(/[\x12]|\\a(?:ITEM|PC)\b/i.test(String(text||'')))return [];
    const payload=chatPayload(text);if(!payload||!/[ \t]\+(?:10|[0-9])(?!\d)/u.test(payload))return [];
    const catalog=catalogIndex(pack),found=[],marked=[];
    const append=(name,tier,index)=>{if(name)found.push({name:`${name} +${tier}`,index});};
    for(const pattern of markerPatterns){
        pattern.lastIndex=0;
        for(const match of payload.matchAll(pattern)){
            marked.push([match.index,match.index+match[0].length]);
            const inside=match[1].match(/^(.+?)[ \t]+\+(10|[0-9])$/u),tier=match[2]??inside?.[2];
            if(tier===undefined||match[2]!==undefined&&inside)continue;
            const name=safeName(match[2]!==undefined?match[1]:inside?.[1]);if(!name)continue;
            const known=catalog.byName.get(normalizeWikiIdentity(itemExaltationBaseIdentity(name)));
            if(known?.titles.size>1)continue;
            if(known)append([...known.titles.values()][0],tier,match.index);
            else if(name.length>=4&&!mechanic.test(name)&&!/\b(?:Spell|Buff|Stats?|Level)\b/i.test(name))append(name,tier,match.index);
        }
    }
    for(const match of payload.matchAll(new RegExp('[ \\t]+\\+'+rank,'gu'))){
        if(marked.some(([start,end])=>match.index>=start&&match.index<end))continue;
        const prefix=normalizeWikiIdentity(payload.slice(0,match.index).slice(-512)),rows=catalog.tails.get(prefix.split(' ').at(-1))||[];
        // Longest exact known name wins; never grow it with preceding prose.
        const known=rows.find(row=>prefix.endsWith(row.key)&&(prefix.length===row.key.length||/[\s\p{P}]/u.test(prefix[prefix.length-row.key.length-1])));
        if(known?.titles.size===1)append([...known.titles.values()][0],match[1],match.index-known.key.length);
    }
    const seen=new Set();
    return found.sort((a,b)=>a.index-b.index).filter(value=>{const key=normalizeWikiIdentity(value.name);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8).map(value=>value.name);
}
