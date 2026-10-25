// Whole-wiki drop counts come from the installed, native-owned data pack.
// Renderer fields and an incomplete catalog cannot establish a Unique count.
import {createWikiResolver,normalizeWikiIdentity,wikiPageTitleKey} from './wiki-identity.js';
import {isOwnedPetName} from './generated-pets.js';

const isGroundSpawnLabel=value=>['ground spawn','ground spawns'].includes(normalizeWikiIdentity(value));

export function classifyCachedLoot(pack,itemTitle,proposedNpcs=[],{resolver=createWikiResolver(pack||{})}={}){
    const item=resolver.resolve('item',itemTitle),canonicalItemTitle=item.canonicalTitle||itemTitle,npcs=new Map();
    const modern=pack?.meta?.lootSourceCountsVersion===2,hasCounts=[1,2].includes(pack?.meta?.lootSourceCountsVersion);
    const map=hasCounts&&pack?.lootSourceCounts&&typeof pack.lootSourceCounts==='object'?pack.lootSourceCounts:null,mapKey=map&&(Object.hasOwn(map,canonicalItemTitle)?canonicalItemTitle:Object.keys(map).find(title=>wikiPageTitleKey(title)===wikiPageTitleKey(canonicalItemTitle))),metadata=mapKey?map[mapKey]:null;
    const records=pack?.meta?.sample===true?[]:metadata?[metadata]:item.records||[];
    let complete=modern&&resolver.complete&&item.membership!=='ambiguous'&&records.length>0,declaredCount=null;
    const add=(raw,{canonical=false,proposed=false}={})=>{
        const name=String(typeof raw==='string'?raw:raw?.title||'').trim();if(!name||name.length>230||/[\[\]{}<>|#\r\n]/.test(name)||isOwnedPetName(name)||isGroundSpawnLabel(name)){complete=false;return;}
        const found=resolver.resolve('npc',name);
        if(found.membership==='ambiguous'){complete=false;return;}
        // Older packs could count this acquisition label as a monster. Removing
        // it corrects the lower bound but cannot establish a complete count.
        if(isGroundSpawnLabel(found.canonicalTitle)){complete=false;return;}
        // Explicit exporter names are already canonical. Older source rows can
        // prove a lower bound only when a rich NPC record establishes identity.
        if(!canonical&&!proposed&&(!found.canonicalTitle||!found.records.length)){complete=false;return;}
        const title=found.canonicalTitle||name,key=wikiPageTitleKey(title);
        npcs.set(key,title);
    };
    for(const record of records){
        if(hasCounts&&Array.isArray(record.lootSourceNpcs)&&record.lootSourceNpcs.length<=100000&&Number.isSafeInteger(record.lootSourceCount)&&record.lootSourceCount>=0&&record.lootSourceCount<=100000){
            if(record.lootSourceCountComplete!==true||record.lootSourceCount!==record.lootSourceNpcs.length)complete=false;
            if(declaredCount!==null&&declaredCount!==record.lootSourceCount)complete=false;declaredCount=record.lootSourceCount;
            for(const name of record.lootSourceNpcs)add(name,{canonical:modern});
        }else{
            complete=false;
            for(const source of Array.isArray(record.dropSources)?record.dropSources:[])add(source.name||source.npc||source.title);
        }
    }
    if(declaredCount!==null&&declaredCount!==npcs.size)complete=false;
    const recordedCount=npcs.size;
    for(const npc of proposedNpcs)add(npc,{canonical:true,proposed:true});
    const count=npcs.size,kind=count>=6?'common':complete?'unique':null;
    return {schemaVersion:1,itemTitle:item.canonicalTitle||itemTitle,global:true,complete,count,recordedCount,kind,source:'cached-wiki-dataset',datasetVersion:String(pack?.meta?.version||''),generatedAt:String(pack?.meta?.generatedAt||''),npcs:[...npcs.values()].sort((a,b)=>a.localeCompare(b)),...(kind?{}:{reason:'The cached wiki source count cannot prove fewer than six monsters. Review the wiki source coverage or sync newer data before publishing new Unique loot.'})};
}

export function cachedLootKindLabel(pack,itemTitle,proposedNpcs=[]){
    const proof=classifyCachedLoot(pack,itemTitle,proposedNpcs);
    return {proof,label:proof.kind?(proof.kind==='common'?'Common Loot':'Unique Loot')+' · '+(proof.complete?'':'at least ')+proof.count+' distinct monsters across the wiki':'Classification needs complete cached wiki data'};
}
