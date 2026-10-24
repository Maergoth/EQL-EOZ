import { itemBaseReviewPreview, createItemBaseReview, itemRecoverySource, itemRecoveryLabel } from './item-base-review.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountItemBaseReview({host,getCandidate,onApply,onInvalidate=()=>{}}={}){
    if(!host)return {dispose(){}};
    let disposed=false,preview=null;const candidate=getCandidate(),source=itemRecoverySource(candidate),saved=candidate.baseRecovery;
    host.innerHTML=`<section class="item-base-review"><label>Observed tier<input type="number" min="0" max="10" step="1" data-base-tier value="${saved?.tier??source.tier??0}" aria-label="Observed item tier"></label><p data-base-note class="settings-helper"></p><div data-base-results></div><button type="button" class="secondary-button" data-base-apply>Use selected base values</button><p data-base-status role="status"></p></section>`;
    const $=selector=>host.querySelector(selector),status=$('[data-base-status]'),results=$('[data-base-results]');
    const options=()=>({tier:Number($('[data-base-tier]').value),fraction:null,reviewMode:'provisional'});
    function paint(choices={}){
        if(disposed)return;const current=getCandidate(),settings=options();
        $('[data-base-note]').textContent=settings.tier>0?'These stats will need verification with a tier 0 item.':'';
        $('[data-base-apply]').hidden=settings.tier===0;
        if(settings.tier===0){results.replaceChildren();status.textContent='';preview=null;return;}
        preview=itemBaseReviewPreview(current,settings);
        const entries=Object.entries(preview.fields||{});
        results.innerHTML=entries.length?`<div class="item-base-table-wrap"><table class="item-base-table"><thead><tr><th>Stat</th><th>Observed</th><th>Possible base</th><th>Base value</th></tr></thead><tbody>${entries.map(([key,result])=>{const supported=['exact','range'].includes(result.status),chosen=Object.hasOwn(choices,key)?choices[key]:result.status==='exact'?result.value:'';return `<tr><th>${escape(itemRecoveryLabel(key))}</th><td>${escape(preview.observed[key])}</td><td>${escape(supported?result.ranges.map(range=>range.min===range.max?range.min:`${range.min}–${range.max}`).join(', '):'?')}</td><td>${supported?`<input type="number" step="${key==='WT'?'.1':'1'}" data-base-choice="${escape(key)}" value="${escape(chosen)}" aria-label="Base ${escape(itemRecoveryLabel(key))}" placeholder="?">`:'?'}</td></tr>`;}).join('')}</tbody></table></div>`:'';
        const blocked=entries.some(([,result])=>result.reason==='known-augment-or-modifier-present');
        status.textContent=blocked?'Exaltation or modified values cannot establish base statistics.':saved?'Base proposals selected; review them in the wiki preview.':'';
        $('[data-base-apply]').disabled=blocked||!entries.some(([,result])=>['exact','range'].includes(result.status));
    }
    $('[data-base-tier]').oninput=()=>{onInvalidate();paint();};
    results.oninput=()=>{onInvalidate();status.textContent='';};
    $('[data-base-apply]').onclick=()=>{try{if(!preview)return;const choices={};for(const input of results.querySelectorAll('[data-base-choice]'))if(input.value.trim()!=='')choices[input.dataset.baseChoice]=Number(input.value);const current=getCandidate(),review=createItemBaseReview(current,{...options(),choices,reviewed:true});onApply(current,review);}catch(error){status.textContent=error.message;}};
    try{paint(saved?.choices);}catch(error){status.textContent=error.message;}
    return {dispose(){disposed=true;host.replaceChildren();}};
}
