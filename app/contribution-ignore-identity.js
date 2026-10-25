import {createWikiResolver,wikiPageTitleKey} from './wiki-identity.js';

const nameText=value=>{
    if(typeof value!=='string'||value.length>300||/[\u0000-\u001f\u007f]/.test(value))return '';
    const name=value.normalize('NFKC').replace(/_/g,' ').replace(/\s+/g,' ').trim();return name.length<=300?name:'';
};
export function contributionIgnoreIdentity(pack,{kind,name}={},resolver=createWikiResolver(pack||{})){
    kind=kind==='monster'?'npc':kind;name=nameText(name);
    if(!['npc','item'].includes(kind)||!name)return null;
    const found=resolver.resolve(kind,name),canonicalTitle=found.membership==='present'?nameText(found.canonicalTitle):'';
    return {kind,name,canonicalTitle:canonicalTitle||null,basis:canonicalTitle?'canonical':'exact',key:`${kind}|${wikiPageTitleKey(canonicalTitle||name)}`,membership:found.membership};
}

// Persisted targets are never broadened by spelling/family guesses. An exact
// unknown can acquire an alias only after the current catalog proves identity.
export function createContributionIgnoreMatcher(entries=[],pack={}){
    const resolver=createWikiResolver(pack||{}),rows=[];
    for(const entry of Array.isArray(entries)?entries:[]){
        if(!entry||!['npc','item'].includes(entry.kind)||!['canonical','exact'].includes(entry.basis)||!nameText(entry.name)||entry.basis==='canonical'&&!nameText(entry.canonicalTitle))continue;
        const current=contributionIgnoreIdentity(pack,{kind:entry.kind,name:entry.canonicalTitle||entry.name},resolver);
        rows.push({entry,current,observedKey:`${entry.kind}|${wikiPageTitleKey(entry.name)}`,canonicalKey:entry.canonicalTitle?`${entry.kind}|${wikiPageTitleKey(entry.canonicalTitle)}`:null});
    }
    return target=>{
        const query=contributionIgnoreIdentity(pack,target,resolver);if(!query)return false;
        for(const row of rows){
            if(row.entry.kind!==query.kind)continue;
            if(query.basis==='canonical'){
                if(row.canonicalKey===query.key||row.current?.basis==='canonical'&&row.current.key===query.key)return true;
                continue;
            }
            // Competing case-distinct pages do not inherit a canonical ignore.
            if(query.membership==='ambiguous'&&row.entry.basis==='canonical')continue;
            if(row.observedKey===query.key||row.canonicalKey===query.key)return true;
        }
        return false;
    };
}
export const contributionEntityIgnored=(entries,pack,target)=>createContributionIgnoreMatcher(entries,pack)(target);
