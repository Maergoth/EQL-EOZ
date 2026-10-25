import {itemBaseReviewPreview,itemBaseReviewInitialChoices,createItemBaseReview,applyItemBaseReview,itemRecoverySource,validateItemBaseReview,itemRecoveryFingerprint,itemRecoveryHasKnownModifiers} from './item-base-review.js';
import {ITEM_CONTRIBUTION_STATS,itemContributionStatSource,itemContributionStatLines,itemContributionNumericLine} from './item-contribution-stats.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const invalidReview=tier=>({schemaVersion:2,reviewMode:'provisional',tier,fraction:null,sourceFingerprint:'',choices:{},reviewed:true,modifiersExcluded:null});

export function mountItemBaseReview({host,getCandidate,onChange,onApply,onInvalidate=()=>{}}={}){
    if(!host)return {dispose(){},readPatch(){return null;}};
    let disposed=false,dirty=new Set(),reviewEdited=false,tierEdited=false,acceptedUpdatedReading=false,stale=false,manualProblem='';
    const candidate=getCandidate(),source=itemRecoverySource(candidate),saved=candidate.baseRecovery;
    host.innerHTML=`<section class="item-base-review"><label>Observed tier<input type="number" min="0" max="10" step="1" data-base-tier value="${candidate.fields?.itemStatDraft?.value?.invalidTier===true?'':saved?.tier??source.tier??0}" aria-label="Observed item tier"></label><p data-base-note class="settings-helper"></p><div data-base-results></div><p data-base-status role="status"></p><button type="button" class="secondary-button" data-base-refresh hidden>Use updated reading</button></section>`;
    const $=selector=>host.querySelector(selector),status=$('[data-base-status]'),results=$('[data-base-results]'),tierInput=$('[data-base-tier]');
    const tier=()=>tierInput.value.trim()===''?null:Number(tierInput.value);
    const ranked=()=>Number.isInteger(tier())&&tier()>0;
    function paint(current){
        const read=itemContributionStatSource(current.fields),level=tier(),base=level===0;
        let values=read.values,hints={},problem='';manualProblem='';
        stale=Boolean(current.baseRecovery&&!validateItemBaseReview(current).ok);
        if(!base){
            const preview=itemBaseReviewPreview(current,{tier:level,fraction:null,reviewMode:'provisional'});
            try{values=current.baseRecovery?.choices||itemBaseReviewInitialChoices(current,preview);}catch(error){values=Object.fromEntries(ITEM_CONTRIBUTION_STATS.flatMap(stat=>finite(read.legacy[stat.field])?[[stat.key,read.legacy[stat.field]]]:[]));problem=manualProblem=error.message;}
            values=Object.fromEntries(ITEM_CONTRIBUTION_STATS.flatMap(stat=>finite(values[stat.key])?[[stat.field,values[stat.key]]]:[]));
            for(const stat of ITEM_CONTRIBUTION_STATS){const observed=current.fields?.[stat.field]?.value;
                if(finite(observed))hints[stat.field]=`Read: ${observed}. ${['exact','range'].includes(preview.fields?.[stat.key]?.status)?'Unverified base proposal.':'No reliable base calculation; leave blank until a tier 0 reading.'}`;
            }
            if(stale)problem='The reading or item changed. Use the updated reading or review the base fields again before previewing.';
        }
        const draft=current.fields?.itemStatDraft?.value,invalid=new Set(Array.isArray(draft?.invalidFields)?draft.invalidFields:[]);
        if(draft?.schemaVersion===1&&(draft.tier===level||draft.invalidTier===true)&&draft.values&&typeof draft.values==='object')values=Object.fromEntries(ITEM_CONTRIBUTION_STATS.flatMap(stat=>finite(draft.values[stat.field])?[[stat.field,draft.values[stat.field]]]:[]));
        if(invalid.size||draft?.invalidTier===true)problem='Correct the invalid number, or explicitly clear that field to omit it, before previewing.';
        if(Object.keys(values).length&&itemRecoveryHasKnownModifiers(current))problem='Known Exaltation or modified readings cannot establish base statistics. Use an unmodified tier 0 reading.';
        else if(draft?.reason==='known-modifiers')problem='Use the updated unmodified reading before previewing these base statistics. Your prior draft stays preserved until then.';
        $('[data-base-note]').textContent=base?'Enter the tier 0 item values. Blank fields are omitted; an entered 0 is kept.':'These are editable, unverified base proposals from the observed rank. Blank fields are omitted. A tier 0 reading is needed to verify them.';
        results.innerHTML=`<fieldset class="item-stat-fields"><legend>${base?'Item statistics':'Base proposals'}</legend><div class="item-stat-grid">${ITEM_CONTRIBUTION_STATS.map(stat=>`<label>${escape(stat.label)}<input type="number" step="any" data-item-stat-field="${stat.field}" data-base-choice="${stat.key}" value="${finite(values[stat.field])?escape(values[stat.field]):''}" aria-label="${escape((base?'':'Base ')+stat.label)}"${invalid.has(stat.field)?' aria-invalid="true"':''}${hints[stat.field]?` title="${escape(hints[stat.field])}"`:''}></label>`).join('')}</div></fieldset>${read.retained.length?`<details class="item-stat-retained"><summary>Saved item text</summary><p class="settings-helper">This text stays with the draft. Numeric text without a supported base calculation is kept as evidence and omitted from ranked proposals.</p><ul>${read.retained.map(line=>`<li>${escape(line)}</li>`).join('')}</ul></details>`:''}`;
        tierInput.setAttribute('aria-invalid',String(draft?.invalidTier===true));
        status.textContent=problem; $('[data-base-refresh]').hidden=!stale||invalid.size>0||draft?.invalidTier===true||itemRecoveryHasKnownModifiers(current);
    }
    function readPatch(current=getCandidate(),{reviewed=false}={}){
        if(disposed)return null;
        const level=tier(),fields={...current.fields,tier:{...current.fields?.tier,value:level,confirmed:reviewed||current.fields?.tier?.confirmed===true,edited:current.fields?.tier?.edited===true||tierEdited}},read=itemContributionStatSource(current.fields);
        const inputs=[...results.querySelectorAll('[data-item-stat-field]')],values=Object.fromEntries(inputs.flatMap(input=>input.value.trim()!==''&&Number.isFinite(Number(input.value))?[[input.dataset.itemStatField,Number(input.value)]]:[]));
        const prior=fields.itemStatDraft?.value,bad=inputs.filter(input=>input.validity.badInput).map(input=>input.dataset.itemStatField),pending=(Array.isArray(prior?.invalidFields)?prior.invalidFields.slice(0,ITEM_CONTRIBUTION_STATS.length):[]).filter(field=>ITEM_CONTRIBUTION_STATS.some(stat=>stat.field===field)&&!dirty.has(field)),invalidFields=[...new Set([...bad,...pending])];
        const invalidTier=tierInput.validity.badInput||prior?.invalidTier===true&&!tierEdited||!Number.isInteger(level)||level<0||level>10;
        if(invalidFields.length||invalidTier){fields.itemStatDraft={value:{schemaVersion:1,tier:level,values,invalidFields,invalidTier,...(itemRecoveryHasKnownModifiers(current)||prior?.reason==='known-modifiers'?{reason:'known-modifiers'}:{})},confirmed:false,edited:true};tierInput.setAttribute('aria-invalid',String(invalidTier));status.textContent='Correct the invalid number, or explicitly clear that field to omit it, before previewing.';return {fields,baseRecovery:invalidReview(level)};}
        tierInput.removeAttribute('aria-invalid');
        if(read.conflicts.some(field=>!dirty.has(field))){status.textContent='Correct the conflicting saved statistics before previewing.';return {fields,baseRecovery:invalidReview(level)};}
        read.retained=read.retained.filter(line=>!dirty.has(itemContributionNumericLine(line)?.field));
        if(level===0&&Object.keys(values).length&&(itemRecoveryHasKnownModifiers(current)||prior?.reason==='known-modifiers'&&!acceptedUpdatedReading)){
            fields.itemStatDraft={value:{schemaVersion:1,tier:level,values,reason:'known-modifiers',sourceFingerprint:itemRecoveryFingerprint({...current,fields})},confirmed:false,edited:true};
            status.textContent=itemRecoveryHasKnownModifiers(current)?'Known Exaltation or modified readings cannot establish base statistics. Use an unmodified tier 0 reading.':'Use the updated unmodified reading before previewing these base statistics.';
            $('[data-base-refresh]').hidden=itemRecoveryHasKnownModifiers(current);
            return {fields,baseRecovery:invalidReview(level)};
        }
        if(level===0){
            delete fields.itemStatDraft;
            for(const {field}of ITEM_CONTRIBUTION_STATS){const previous=fields[field],present=Object.hasOwn(values,field);
                if(present||previous||dirty.has(field))fields[field]={...previous,value:present?values[field]:null,confirmed:present&&(reviewed||previous?.confirmed===true||dirty.has(field)),edited:previous?.edited===true||dirty.has(field)};
            }
            fields.statLines={...fields.statLines,value:itemContributionStatLines(values,read.retained,fields),confirmed:reviewed||dirty.size>0||fields.statLines?.confirmed===true,edited:fields.statLines?.edited===true||dirty.size>0,structured:true};
            preserveOmittedText(fields,read.retained);
            if(fields.statsblock)fields.statsblock={...fields.statsblock,confirmed:false};
            status.textContent='';return {fields,baseRecovery:null};
        }
        if((stale||manualProblem)&&!reviewEdited)return {fields,baseRecovery:current.baseRecovery||invalidReview(level)};
        try{
            const choices=Object.fromEntries(ITEM_CONTRIBUTION_STATS.flatMap(stat=>Object.hasOwn(values,stat.field)?[[stat.key,values[stat.field]]]:[]));
            const review=createItemBaseReview({...current,fields},{tier:level,fraction:null,choices,reviewMode:'provisional',reviewed:true});
            const outgoing={...fields,statLines:{...fields.statLines,value:itemContributionStatLines({},read.retained,fields)}};
            const patch=applyItemBaseReview({...current,fields:outgoing},review);
            delete patch.fields.itemStatDraft;
            if(fields.statsblock)patch.fields.statsblock={...fields.statsblock,confirmed:false};
            preserveOmittedText(patch.fields,read.retained);
            status.textContent='Blank statistics stay omitted. Base proposals will be marked for tier 0 verification.';
            return patch;
        }catch(error){status.textContent=error.message;fields.itemStatDraft={value:{schemaVersion:1,tier:level,sourceFingerprint:itemRecoveryFingerprint({...current,fields}),values},confirmed:false,edited:true};return {fields,baseRecovery:invalidReview(level)};}
    }
    function preserveOmittedText(fields,retained){
        const missing=retained.filter(line=>!fields.statLines?.value?.includes(line));
        if(missing.length)fields.savedItemStatText={value:[...new Set([...(Array.isArray(fields.savedItemStatText?.value)?fields.savedItemStatText.value:[]),...missing])],confirmed:false};
    }
    function emit(){
        const current=getCandidate();if(!current)return;
        const patch=readPatch(current);if(!patch)return;
        if(onChange)onChange(patch);
        else if(patch.baseRecovery?.sourceFingerprint&&onApply)onApply(current,patch.baseRecovery);
        else onInvalidate({tier:tier()});
    }
    tierInput.oninput=()=>{tierEdited=true;reviewEdited=true;acceptedUpdatedReading=true;dirty=new Set();const current=getCandidate();paint({...current,baseRecovery:null,fields:{...current.fields,itemStatDraft:null,statLines:{...current.fields?.statLines,edited:false},tier:{...current.fields?.tier,value:tier()}}});emit();};
    results.oninput=event=>{if(!event.target.matches('[data-item-stat-field]'))return;dirty.add(event.target.dataset.itemStatField);reviewEdited=true;stale=false;event.target.setAttribute('aria-invalid',String(event.target.validity.badInput));emit();};
    $('[data-base-refresh]').onclick=()=>{acceptedUpdatedReading=true;reviewEdited=true;dirty=new Set();const current=getCandidate();paint({...current,baseRecovery:null,fields:{...current.fields,itemStatDraft:null,statLines:{...current.fields?.statLines,edited:false}}});stale=false;emit();$('[data-base-refresh]').hidden=true;};
    paint(candidate);
    // Wait for actual OCR values instead of protecting a manufactured empty
    // proposal before the screen reader has supplied any statistics.
    if(!saved&&Object.keys(itemRecoverySource(candidate).observed).length&&ranked())emit();
    return {readPatch,dispose(){disposed=true;host.replaceChildren();}};
}
