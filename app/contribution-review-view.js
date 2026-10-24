// Local review evidence only. Never include these raw lines in article drafts
// or the minimal kill/loot observation transport.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eventLabels={kill:'Monster death',loot:'Loot',zone:'Zone entered',location:'Location',consider:'Legacy consider'};
export function contributionEvidenceMarkup(candidate={}){
    const evidence=Array.isArray(candidate.evidence)?candidate.evidence.slice(-6):[];
    return `<details class="contribution-evidence" data-contribution-evidence><summary>Captured evidence${evidence.length?' ('+evidence.length+')':''}</summary>${evidence.map(entry=>{
        const log=entry.kind==='game-log',label=log?eventLabels[entry.event]||'Game log':entry.kind||'Capture',line=typeof entry.logLine==='string'?entry.logLine.slice(0,2048):'';
        return `<article class="contribution-evidence-entry"><p class="settings-helper">${escape(label)}${entry.at?' · '+escape(entry.at):''}</p>${entry.text?log?`<p class="contribution-evidence-summary">${escape(entry.text)}</p>`:`<pre>${escape(entry.text)}</pre>`:''}${log?(line?`<p class="contribution-evidence-label">Triggering log line</p><pre data-triggering-log-line>${escape(line)}</pre>`:'<p class="settings-helper" data-log-line-unavailable>Original log line unavailable for this older capture.</p>'):''}</article>`;
    }).join('')||'<p>Manually entered.</p>'}</details>`;
}
export function contributionRelationsMarkup(candidate={}){
    const relations=Array.isArray(candidate.relations)?candidate.relations:[];
    const items=relations.filter(relation=>relation.type!=='zone-population').map(relation=>{
        let text;
        if(relation.type==='drop-source')text=`Drop source: ${relation.name} for ${relation.item||candidate.name}`;
        else if(relation.type==='zone-loot')text=`Loot recorded: ${relation.name}`;
        else if(relation.type==='spawn-location')text='Spawn location: '+[relation.location?.y,relation.location?.x,relation.location?.z].map(value=>value??'?').join(', ');
        else if(relation.evidence==='kill')text=`Monster killed: ${relation.name}`;
        else if(relation.evidence==='explicit-corpse')text=`Corpse looted: ${relation.name}`;
        else if(relation.evidence==='consider')text=`Legacy consider: ${relation.name}`;
        else text=`Monster entry: ${relation.name}`;
        const proof=relation.evidence==='explicit-corpse'?'Named corpse in loot message':relation.evidence==='kill'?'Death logged':relation.evidence==='consider'?'Not kill evidence':relation.evidence||'';
        return `<li>${escape(text)}${relation.zone?' · '+escape(relation.zone):''}${proof?` <small>(${escape(proof)})</small>`:''}</li>`;
    });
    return items.length?'<details class="contribution-context"><summary>Collected context</summary><ul>'+items.join('')+'</ul></details>':'';
}
