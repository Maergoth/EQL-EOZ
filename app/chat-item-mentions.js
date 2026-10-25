import { itemExaltationBaseIdentity, normalizeWikiIdentity, wikiPageTitleKey } from './wiki-identity.js';

// Flattened chat has lost the native link boundaries. Capitalization cannot
// establish where prose ends and an unknown item starts. Typed catalog names
// establish known identities; quotes/brackets alone cannot prove unknown items.
const indexes = new WeakMap(), EMPTY = Object.freeze({});
const rank = '(10|[0-9])(?![\\p{L}\\p{N}]|\\.\\d|\\+\\d)';
const markerPatterns = [new RegExp('\\[([^\\]\\r\\n]{1,240})\\](?:[ \\t]+\\+'+rank+')?','gu'),new RegExp('"([^"\\r\\n]{1,240})"(?:[ \\t]+\\+'+rank+')?','gu')];
const safeName = value => {
    const name=String(value||'').trim().replace(/\s+/g,' ');
    return name.length>=1&&name.length<=230&&name.split(' ').length<=16&&/[\p{L}]/u.test(name)&&!/[\u0000-\u001f\u007f\\<>\[\]{}|+]/.test(name)?name:null;
};
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
    const initials=new Map();
    for(const entry of byName.values()){
        const first=[...entry.key][0],rows=initials.get(first)||[];rows.push(entry);initials.set(first,rows);
    }
    for(const rows of initials.values())rows.sort((a,b)=>b.key.length-a.key.length);
    const result={byName,initials};indexes.set(pack,result);return result;
}
const chatPayload=text=>String(text||'').slice(0,16384).match(/^(?:You|[\p{L}][\p{L}'’-]{0,63}) (?:tells? (?:you|the (?:guild|group|raid)|[\p{L}][\p{L}\d_-]{0,40}:\d{1,3})|says?(?: out of character)?|shouts?|auctions?),[ \t]*'([^\r\n]{1,2048})'$/u)?.[1];

const wordCharacter=character=>character!==undefined&&/[\p{L}\p{N}\p{M}]/u.test(character);
// Catalog identities can bound a flattened label; English prefix lists cannot.
// This is deliberately not used to reinterpret authentic encoded item labels.
// Exact full titles win. Otherwise discard contained shorter names, and keep
// disjoint/overlapping identities ambiguous rather than choosing one arbitrarily.
export function canonicalChatItemMatch(text,pack=EMPTY,{suffixOnly=false}={}) {
    const input=String(text||'').slice(0,512);
    const value=normalizeWikiIdentity(suffixOnly?input:itemExaltationBaseIdentity(input));
    if(!value)return {state:'none'};
    const catalog=catalogIndex(pack),exact=catalog.byName.get(value);
    const resolved=(entries,isExact)=>{
        const titles=new Map();
        for(const entry of entries)for(const [key,title] of entry.titles)titles.set(key,title);
        return titles.size===1?{state:'matched',name:[...titles.values()][0],exact:isExact}: {state:'ambiguous'};
    };
    if(exact)return resolved([exact],true);
    const characters=[...value],matches=[];let offset=0;
    for(let start=0;start<characters.length;start++){
        const position=offset;offset+=characters[start].length;
        if(wordCharacter(characters[start-1]))continue;
        for(const entry of catalog.initials.get(characters[start])||[]){
            const end=position+entry.key.length,next=end<value.length?String.fromCodePoint(value.codePointAt(end)):undefined;
            if(value.startsWith(entry.key,position)&&!wordCharacter(next)&&(!suffixOnly||end===value.length)){
                matches.push({start:position,end,entry});break;
            }
        }
    }
    let furthestEnd=-1;
    const longest=matches.filter(match=>{if(match.end<=furthestEnd)return false;furthestEnd=match.end;return true;});
    return longest.length?resolved(longest.map(match=>match.entry),false):{state:'none'};
}

export function rankedChatItemMentions(text, pack=EMPTY) {
    // Explicit non-item or malformed link controls must not be reinterpreted
    // as plain chat. Authentic item links have already won in the parser.
    if(/[\x12]|\\a(?:ITEM|PC)\b/i.test(String(text||'')))return [];
    const payload=chatPayload(text);if(!payload||!/[ \t]\+(?:10|[0-9])(?!\d)/u.test(payload))return [];
    const found=[],marked=[];
    const append=(name,tier,index)=>{if(name)found.push({name:`${name} +${tier}`,index});};
    for(const pattern of markerPatterns){
        pattern.lastIndex=0;
        for(const match of payload.matchAll(pattern)){
            marked.push([match.index,match.index+match[0].length]);
            const inside=match[1].match(/^(.+?)[ \t]+\+(10|[0-9])$/u),tier=match[2]??inside?.[2];
            if(tier===undefined||match[2]!==undefined&&inside)continue;
            const name=safeName(match[2]!==undefined?match[1]:inside?.[1]);if(!name)continue;
            const known=canonicalChatItemMatch(name,pack);
            if(known.state==='ambiguous')continue;
            if(known.state==='matched')append(known.name,tier,match.index);
        }
    }
    for(const match of payload.matchAll(new RegExp('[ \\t]+\\+'+rank,'gu'))){
        if(marked.some(([start,end])=>match.index>=start&&match.index<end))continue;
        const prefix=payload.slice(0,match.index).slice(-512);
        // Longest exact known name wins; never grow it with preceding prose.
        const known=canonicalChatItemMatch(prefix,pack,{suffixOnly:true});
        if(known.state==='matched')append(known.name,match[1],match.index);
    }
    const seen=new Set();
    return found.sort((a,b)=>a.index-b.index).filter(value=>{const key=normalizeWikiIdentity(value.name);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8).map(value=>value.name);
}
