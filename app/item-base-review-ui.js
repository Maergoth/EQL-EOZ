import { itemBaseReviewPreview, itemBaseReviewChoices, itemBaseReviewInitialChoices, createItemBaseReview, itemRecoverySource, itemRecoveryLabel, validateItemBaseReview } from './item-base-review.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountItemBaseReview({host,getCandidate,onApply,onInvalidate=()=>{}}={}){
    if(!host)return {dispose(){}};
    let disposed=false,preview=null,manualError='';const candidate=getCandidate(),source=itemRecoverySource(candidate),saved=candidate.baseRecovery;
    host.innerHTML=`<section class="item-base-review"><label>Observed tier<input type="number" min="0" max="10" step="1" data-base-tier value="${saved?.tier??source.tier??0}" aria-label="Observed item tier"></label><p data-base-note class="settings-helper"></p><div data-base-results></div><p data-base-status role="status"></p></section>`;
    const $=selector=>host.querySelector(selector),status=$('[data-base-status]'),results=$('[data-base-results]');
    const options=()=>({tier:Number($('[data-base-tier]').value),fraction:null,reviewMode:'provisional'});
    function commit(){
        if(disposed||!preview)return;
        try{
            const choices={};for(const input of results.querySelectorAll('[data-base-choice]'))if(input.value.trim()!=='')choices[input.dataset.baseChoice]=Number(input.value);
            const current=getCandidate(),review=createItemBaseReview(current,{...options(),choices,reviewed:true});
            onApply(current,review);status.textContent='Base values will be included in the wiki preview.';
        }catch(error){status.textContent=error.message;}
    }
    function paint(choices={}){
        if(disposed)return;const current=getCandidate(),settings=options();
        $('[data-base-note]').textContent=settings.tier>0?'Editable base proposals. These stats will need verification with a tier 0 item.':'';
        if(settings.tier===0){results.replaceChildren();status.textContent='';preview=null;return;}
        preview=itemBaseReviewPreview(current,settings);
        manualError='';let defaults;
        try{defaults=itemBaseReviewInitialChoices(current,preview);}catch(error){manualError=error.message;defaults=itemBaseReviewChoices(preview);}
        const entries=Object.entries(preview.fields||{});
        if(!entries.some(([key])=>key==='SV_CORRUPTION'))entries.push(['SV_CORRUPTION',{status:'unsupported'}]);
        results.innerHTML=`<div class="item-base-table-wrap"><table class="item-base-table"><thead><tr><th>Stat</th><th>Observed</th><th>Base value</th></tr></thead><tbody>${entries.map(([key,result])=>{
            const isVoid=key==='SV_CORRUPTION',supported=['exact','range'].includes(result.status),chosen=Object.hasOwn(choices,key)?choices[key]:Object.hasOwn(defaults,key)?defaults[key]:isVoid?0:supported?result.ranges[0].min:'';
            const hint=isVoid?'Default base SV Void is 0; the tiered reading includes contextual gains.':result.status==='range'?'Unverified proposal; rounding permits more than one base value.':supported?'Unverified reverse-calculated base value.':'No supported base calculation; this observed value stays in the evidence.';
            return `<tr><th>${escape(itemRecoveryLabel(key))}</th><td>${escape(preview.observed[key]??'—')}</td><td title="${escape(hint)}">${supported||isVoid?`<input type="number" step="${key==='WT'?'.1':'1'}" data-base-choice="${escape(key)}" value="${escape(chosen)}" aria-label="Base ${escape(itemRecoveryLabel(key))}">`:'—'}</td></tr>`;
        }).join('')}</tbody></table></div>`;
        status.textContent=manualError||(preview.blockedReason?'Exaltation or modified values cannot establish base statistics.':'');
    }
    $('[data-base-tier]').oninput=()=>{onInvalidate(options());paint();commit();};
    results.oninput=()=>{onInvalidate(options());commit();};
    try{
        paint(saved?.choices);
        // Reopening a draft preserves contributor edits. Fresh proposals and
        // intact saved provisional text need no separate Apply/checkbox step.
        const intact=saved?.reviewMode==='provisional'&&validateItemBaseReview({...candidate,fields:{...candidate.fields,statLines:{...candidate.fields?.statLines,confirmed:true}}}).ok;
        if(!saved&&!manualError||intact&&candidate.fields?.statLines?.confirmed!==true)commit();
        else if(intact)status.textContent='Base values will be included in the wiki preview.';
    }catch(error){status.textContent=error.message;}
    return {dispose(){disposed=true;host.replaceChildren();}};
}
