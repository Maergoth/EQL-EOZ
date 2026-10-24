// Local presentation only. Live page checks and reviewed CAS plans own writes.
const kinds={item:'Item',npc:'Monster',zone:'Zone',spell:'Spell'};
export const CONTRIBUTION_FILTERS=Object.freeze([
    {key:'new-npc',label:'New monsters'},
    {key:'new-item',label:'New items'},
    {key:'new-zone',label:'New zones'},
    {key:'missing-source',label:'Drop sources'},
    {key:'missing-population',label:'Zone populations'},
    {key:'tier0-verification',label:'Tier 0 verification'},
    {key:'review',label:'Other page reviews'}
].map(Object.freeze));
const gapLabels={'missing-source':'Drop source','missing-population':'Zone population','tier0-verification':'Tier 0 verification',review:'Check page match'};
export function contributionQueueInfo(candidate={}){
    const isNew=candidate.membership!=='present'&&(candidate.intent==='create'||candidate.membership==='missing'&&candidate.intent!=='update');
    const categories=isNew?[['npc','item','zone'].includes(candidate.kind)?`new-${candidate.kind}`:'review']:[...new Set((candidate.reasons||[]).filter(key=>Object.hasOwn(gapLabels,key)))];
    if(!categories.length)categories.push('review');
    return {kind:kinds[candidate.kind]||'Page',pageType:isNew?'New Page':'Update Page',isNew,categories,
        labels:isNew?[]:categories.map(key=>gapLabels[key]),
        priority:isNew?({npc:0,item:1,zone:2}[candidate.kind]??3):categories.includes('missing-source')?10:categories.includes('missing-population')?11:categories.includes('tier0-verification')?12:13};
}
export function visibleContributionQueue(candidates=[],enabled=CONTRIBUTION_FILTERS.map(value=>value.key)){
    const allowed=new Set(enabled);
    return candidates.map((candidate,index)=>({candidate,index,info:contributionQueueInfo(candidate)}))
        .filter(row=>row.info.categories.some(key=>allowed.has(key)))
        .sort((a,b)=>a.info.priority-b.info.priority||a.index-b.index).map(row=>row.candidate);
}
export function contributionQueueCounts(candidates=[]){
    return Object.fromEntries(CONTRIBUTION_FILTERS.map(({key})=>[key,candidates.filter(candidate=>contributionQueueInfo(candidate).categories.includes(key)).length]));
}
