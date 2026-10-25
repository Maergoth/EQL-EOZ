const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contributionQueueControls(candidate,{canIgnore=false,disabled=false}={}){
    const name=escape(candidate.name),id=escape(candidate.id),entity=['npc','item'].includes(candidate.kind);
    return `<div class="contribution-row-controls">${entity?`<button type="button" class="contribution-ignore-forever" data-ignore-forever="${id}" aria-label="Ignore ${name} forever" title="Ignore ${name} forever · restore in Contribution History" ${!canIgnore||disabled?'disabled':''}><span class="ignore-forever-symbol" aria-hidden="true"><span>∞</span><b>×</b></span></button>`:''}<button type="button" class="contribution-dismiss" data-dismiss-discovery="${id}" aria-label="Dismiss ${name} discovery" title="Dismiss this discovery" ${disabled?'disabled':''}>×</button></div>`;
}
