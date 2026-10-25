import {createWikiResolver,wikiPageTitleKey} from './wiki-identity.js';

// Only explicit, complete, producer-owned set membership establishes coverage.
// A similar title, shared prefix or an incomplete list is not membership proof.
export function lootSetCoverage(pack,itemTitle,authoredTitles,{resolver=createWikiResolver(pack||{})}={}){
    if(pack?.meta?.lootSetsVersion!==1||pack.meta.sample===true||!pack.lootSets||typeof pack.lootSets!=='object'||Array.isArray(pack.lootSets)||!Array.isArray(authoredTitles)||authoredTitles.length>1000)return null;
    const canonical=value=>{
        if(typeof value!=='string'||!value.trim()||value.length>240||/[\u0000-\u001f|#\[\]{}]/.test(value)||/^(?:talk|user|file|image|template|category|special|mediawiki):/i.test(value.trim()))return null;
        const match=resolver.resolve('item',value);return match.membership==='ambiguous'?null:wikiPageTitleKey(match.canonicalTitle||value);
    };
    const item=canonical(itemTitle);if(!item)return null;
    const sets=Object.entries(pack.lootSets);if(sets.length>20000)return null;
    for(const authored of authoredTitles){
        const title=canonical(authored);if(!title)continue;
        const matches=sets.filter(([key])=>canonical(key)===title);if(matches.length!==1)continue;
        const [setTitle,record]=matches[0];
        if(!record||record.complete!==true||!Array.isArray(record.items)||!record.items.length||record.items.length>1000)continue;
        const members=record.items.map(canonical);if(members.some(member=>!member))continue;
        if(members.includes(item))return{setTitle:canonical(setTitle),itemTitle:item};
    }
    return null;
}
