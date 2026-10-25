import {wikiPageTitleKey} from '../app/wiki-identity.js';

const MAX_RECORDS=100000;
function titleKey(value){
    if(typeof value!=='string'||!value||value.trim()!==value||value.length>230||/[\u0000-\u001f\u007f[\]{}<>|#]/.test(value)||/^(?:talk|user|user talk|project|file|image|mediawiki|template|help|category|module|special|media):/i.test(value))throw Error('Global loot counts contain an invalid public main-namespace title.');
    return wikiPageTitleKey(value);
}
function recordKeys(record,title){
    if(!record||typeof record!=='object'||Array.isArray(record)||!Number.isSafeInteger(record.lootSourceCount)||record.lootSourceCount<0||record.lootSourceCount>MAX_RECORDS||typeof record.lootSourceCountComplete!=='boolean'||!Array.isArray(record.lootSourceNpcs)||record.lootSourceNpcs.length!==record.lootSourceCount)throw Error(title+': global loot count fields are missing or inconsistent.');
    const keys=record.lootSourceNpcs.map(titleKey);if(new Set(keys).size!==keys.length)throw Error(title+': global loot counts repeat a canonical monster.');
    return keys.sort();
}

export function assertGlobalLootCountContract(pack){
    const counts=pack?.lootSourceCounts;
    if(pack?.meta?.lootSourceCountsVersion!==1||!counts||typeof counts!=='object'||Array.isArray(counts))throw Error('Production bootstrap requires global loot count metadata version 1; rebuild and publish the reviewed wiki dataset.');
    const rows=Object.entries(counts);if(!rows.length||rows.length>MAX_RECORDS)throw Error('Production bootstrap requires a nonempty, bounded global loot count index.');
    const indexed=new Map();let complete=0,common=0;
    for(const [title,record]of rows){const key=titleKey(title);if(indexed.has(key))throw Error('Global loot count index repeats a canonical item title.');const keys=recordKeys(record,title);indexed.set(key,{record,keys});if(record.lootSourceCountComplete)complete++;if(record.lootSourceCount>=6)common++;}
    for(const item of pack.items||[]){
        const title=item.wikiTitle||item.name,key=titleKey(title),indexedRecord=indexed.get(key),keys=recordKeys(item,title);
        if(!indexedRecord||item.lootSourceCount!==indexedRecord.record.lootSourceCount||item.lootSourceCountComplete!==indexedRecord.record.lootSourceCountComplete||JSON.stringify(keys)!==JSON.stringify(indexedRecord.keys))throw Error(title+': rich item count fields disagree with the global index.');
    }
    return {items:rows.length,richItems:(pack.items||[]).length,complete,incomplete:rows.length-complete,commonLowerBounds:common};
}
