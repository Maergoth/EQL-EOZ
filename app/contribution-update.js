export const contributionSourceIncluded=source=>source?.confirmed===true||source?.edited!==true&&source?.sourceEvidence==='explicit-corpse';
// Targeted presentation contract for reviewed updates. Publication still derives
// every edit from canonical live pages and an account/revision-bound plan.
const names={item:'Item',npc:'Monster',zone:'Zone',spell:'Spell'};
export function contributionUpdateSummary(candidate={}){
    const updating=candidate.intent==='update'||candidate.intent!=='create'&&candidate.membership==='present',reasons=new Set(candidate.reasons||[]),fields=new Set(),gaps=[],additions=[];
    const sections={sources:false,loot:false,population:false,stats:false,screenshot:false};
    const gap=(key,label,description)=>gaps.push({key,label,description});
    if(updating&&reasons.has('missing-source')){
        gap('missing-source','Drop source','Add the observed item and drop-source relationship to the linked pages.');
        if(candidate.kind==='item'){
            sections.sources=true;fields.add('sources');
            const sources=(candidate.sources||[]).filter(source=>source.npc&&source.zone&&contributionSourceIncluded(source));
            for(const source of sources)additions.push('Add '+source.npc+' ('+source.zone+') to this item’s sources. Preview checks the monster’s authored loot and documented item sets before adding an individual loot entry, and completes the zone’s '+(source.instance==='raid'?'Raid Zone':'Normal Zone')+' references.');
            if(!sources.length)additions.push('Include a source below, or enter the monster and zone that dropped this item. The review will show updates to the item, monster and zone.');
        }else if(candidate.kind==='npc'){sections.loot=true;fields.add('knownLoot');fields.add('lootKinds');additions.push('Add the observed loot here and add this monster/zone to each existing item’s sources, with the same zone references.');}
        else if(candidate.kind==='zone'){sections.loot=true;fields.add('knownLoot');fields.add('lootKinds');additions.push('Add the observed loot to this zone and complete the linked item and monster drop-source entries.');}
    }
    if(updating&&reasons.has('missing-population')){
        gap('missing-population','Zone population','Add the monster to the observed zone.');
        if(candidate.kind==='zone'){sections.population=true;fields.add('knownNPCs');additions.push('Add the listed monsters to this zone’s '+(candidate.instance==='raid'?'Raid Zone':'Normal Zone')+' population.');}
        if(candidate.kind==='npc'){fields.add('zone');fields.add('instance');additions.push('Add the observed zone to this monster and add the monster to that zone’s '+(candidate.instance==='raid'?'Raid Zone':'Normal Zone')+' population.');}
    }
    if(updating&&reasons.has('tier0-verification')){gap('tier0-verification','Tier 0 verification','Replace inferred item statistics with the reviewed tier 0 reading.');sections.stats=true;fields.add('statLines');additions.push('Update only the verified base statistics and remove the reverse-calculated notice after an accepted tier 0 reading.');}
    if(updating&&!gaps.length)gap('review-update','Review update','Select the information to add; the review shows the exact changes before submission.');
    return {updating,title:updating?'Update Page':'New Page',pageType:names[candidate.kind]||'Page',gaps,fields:[...fields],sections,additions:[...new Set(additions)],hasTargetedGap:updating&&[...reasons].some(reason=>['missing-source','missing-population','tier0-verification'].includes(reason))};
}
