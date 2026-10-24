import { createContributionQueue } from './contribution-queue.js';
import { CHARACTER_SLOTS, createCharacterModel, characterObservationInput, characterSlotCompatibility, characterStatLabel, characterEquipmentEligibility, characterLooseCandidates, characterBaseItemName, safeCharacterIcon } from './character-model.js';
import { createCharacterProfiles } from './character-profiles.js';
import { createCharacterWalkthrough, CHARACTER_WALKTHROUGH_STEPS, CHARACTER_ITEM_READ_STEPS } from './character-walkthrough.js';
import { parseItemStatBlock } from './screen-read-parser.js';
import { renderCharacterShare } from './character-share.js';
import { buildCharacterWikiSheet } from './character-wiki-sheet.js';
import { characterInspectMarkup } from './character-inspect-view.js';
import { mountCharacterCatalog, resolveCharacterCatalog, searchCharacterCatalog, characterCatalogCard } from './character-catalog.js';
import { characterItemLabel, characterEquipmentMarkup, characterLooseInventoryMarkup, characterIdentityMarkup, characterStatSummaryMarkup, characterItemTooltipMarkup, characterItemTitleMarkup, characterItemStatBodyMarkup, characterTierControlsMarkup } from './character-inventory-view.js';
import { applyItemBaseReview } from './item-base-review.js';
import { mountItemBaseReview } from './item-base-review-ui.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let eras=['Classic Era','Kunark Era','Velious Era'];
const statText=stats=>Object.entries(stats||{}).map(([key,value])=>`${key}: ${value??'?'}`).join('\n');
const ITEM_CONTRIBUTION_STAT_LABELS={ac:'AC',hp:'HP',mana:'Mana',endurance:'Endurance',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',
    resistPoison:'SV Poison',resistMagic:'SV Magic',resistDisease:'SV Disease',resistFire:'SV Fire',resistCold:'SV Cold',resistCorruption:'SV Corruption',
    hpRegen:'HP Regen',manaRegen:'Mana Regen',enduranceRegen:'Endurance Regen',attackSpeed:'Attack Speed',requiredLevel:'Required Level',recommendedLevel:'Recommended Level',
    weight:'Weight',damage:'Damage',damageBonus:'Damage Bonus',delay:'Delay',attack:'Attack',haste:'Haste'};
export function withDefaultItemStatLines(fields={}){
    // Metadata remains available for review; only observed numeric item stats
    // become automatic stat text. Saved contributor text always takes priority.
    if(Object.hasOwn(fields,'statLines'))return {...fields};
    const value=Object.entries(ITEM_CONTRIBUTION_STAT_LABELS).flatMap(([key,label])=>{
        const number=fields[key]?.value;
        return typeof number==='number'&&Number.isFinite(number)?[`${label}: ${number}`]:[];
    });
    return {...fields,statLines:{value,confirmed:false}};
}
const OCR_AREA_STORAGE_KEY='eql-eye-of-zomm-ocr-areas-v1',MAX_OCR_AREAS=12;
export function normalizeOcrArea(value){
    if(!value||typeof value!=='object')return null;
    const region=Object.fromEntries(['x','y','width','height'].map(key=>[key,value[key]]));
    return Object.values(region).every(Number.isFinite)&&region.x>=0&&region.x<1&&region.y>=0&&region.y<1&&region.width>0&&region.height>0&&region.x+region.width<=1.000001&&region.y+region.height<=1.000001
        ?{x:region.x,y:region.y,width:Math.min(region.width,1-region.x),height:Math.min(region.height,1-region.y)}:null;
}
const frameSize=value=>value&&Number.isSafeInteger(value.width)&&Number.isSafeInteger(value.height)&&value.width>0&&value.height>0&&value.width<=8192&&value.height<=8192&&value.width*value.height<=16*1024*1024?{width:value.width,height:value.height}:null;
const validAreaProfile=value=>{const region=normalizeOcrArea(value?.region),size=frameSize(value?.referenceSize);return region&&size&&region.width*size.width>=16&&region.height*size.height>=16;};
const areaKey=(source,owner)=>source&&['character','contribution'].includes(owner)&&String(source.label||source.name||'').trim()?JSON.stringify([String(source.label||source.name).slice(0,160),String(source.type||'').slice(0,20),owner]):'';
export function parseEditedStats(text){
    const result={},aliases={MANA:'MP',ENDURANCE:'END',ATTACK:'ATK',STRENGTH:'STR',STAMINA:'STA',AGILITY:'AGI',DEXTERITY:'DEX',WISDOM:'WIS',INTELLIGENCE:'INT',CHARISMA:'CHA',MITIGATION_AC:'AC_MITIGATION',AC_SOFTCAP:'AC_MITIGATION_SOFTCAP',EVASION_AC:'AC_EVASION',OFFENSE:'ATK_OFFENSE',ACCURACY:'ATK_ACCURACY',DAMAGE_BONUS:'DMG_BONUS'};
    for(const line of String(text).split('\n').filter(value=>value.trim())){
        const match=line.match(/^\s*([A-Za-z][A-Za-z0-9_ .%]{0,39})\s*:\s*(\?|[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*$/);
        if(!match)throw Error(`Use STAT: number (or ?) on each line: ${line.slice(0,60)}`);
        Object.assign(aliases,{MAGIC_RESIST:'SV_MAGIC',FIRE_RESIST:'SV_FIRE',COLD_RESIST:'SV_COLD',POISON_RESIST:'SV_POISON',DISEASE_RESIST:'SV_DISEASE',VOID_RESIST:'SV_CORRUPTION'});
        const label=match[1].trim().replace(/[.]/g,'').replace(/[ %]+/g,'_').replace(/_+$/,'').toUpperCase(),key=aliases[label]||label,value=match[2]==='?'?null:Number(match[2].replace(/,/g,''));
        if(Object.hasOwn(result,key))throw Error(`Enter ${key} only once in the stat block.`);
        if(value!==null&&(!Number.isFinite(value)||Math.abs(value)>1e9))throw Error(`Review the numeric value for ${key}.`);
        result[key]=value;
    }
    return result;
}

export function mountCaptureWorkspace({document=globalThis.document,storage=globalThis.localStorage,characterStorage=storage,
    capture=globalThis.eyeOfZommCapture,wiki=globalThis.eyeOfZommWiki,share=globalThis.eyeOfZommShare,
    getPack=()=>({}),getProfile=()=>({}),getAppearance=()=>({}),notify=()=>{}}={}){
    const root=document.getElementById('contribution-workspace'),characterRoot=document.getElementById('character-workspace'),settingsRoot=document.getElementById('capture-settings');
    if(!root||!characterRoot||!settingsRoot)return{consumeLog(){},refresh(){},dispose(){}};
    const warning=message=>notify(message,{tone:'warning'}),queue=createContributionQueue({storage,getPack,onWarning:warning}),profiles=createCharacterProfiles({storage:characterStorage,onWarning:warning});
    let character=createCharacterModel({storage:profiles.storage,onWarning:warning}),walkthrough=createCharacterWalkthrough({storage:profiles.storage,onWarning:warning});
    const $=(selector,base=root)=>base.querySelector(selector),unsubscribers=[];
    let itemBaseUi=null;
    let disposed=false,busy=false,publishing=false,selectedId=queue.snapshot()[0]?.id||'',selectedCard='',captureState={phase:'disabled'},sources=[],optIn=false,account=null,plan=null,matches=null,lastStats=null,shareImage=null,shareSheet=null,uploadId=null,dragId='',cursor=0;
    let walkthroughStageKey='',walkthroughEpoch=0,baseProposalId='',walkthroughMessage='',sourceStart=null,characterRefreshPending=false,walkthroughSlotsPending=false,sourceListEpoch=0,manualItemRead=null,lastStatsManualRead=null;
    let catalogPackItems=null,catalogVersion='',matchResults=[],matchCardId='';
    let profileSeeded=Boolean(character.snapshot().metadata.name),wikiLoaded=false,reviewEpoch=0,offlineCharacterSessionId='';
    let areaProfiles=[],areaPreview=null,areaDraft=null,areaEpoch=0,areaOpening=false,areaSaving=false,areaDrag=null;
    try{const raw=storage?.getItem(OCR_AREA_STORAGE_KEY);if(raw&&raw.length<=24000){const parsed=JSON.parse(raw);if(Array.isArray(parsed))areaProfiles=parsed.slice(-MAX_OCR_AREAS).filter(value=>typeof value?.key==='string'&&value.key.length<=1000&&validAreaProfile(value)).map(value=>({key:value.key,region:normalizeOcrArea(value.region),referenceSize:frameSize(value.referenceSize)}));}}catch{/* A damaged optional calibration must not block ordinary capture. */}
    root.innerHTML=`<div class="capture-toolbar panel"><div><h2>Contribute to Wiki</h2><p>Review player-observed facts, check existing pages, then preview every wiki change.</p></div><div class="capture-actions"><button class="secondary-button" data-wiki-login>Log in to wiki</button><button class="text-button" data-wiki-refresh>Refresh account</button><span data-account-status role="status">Not connected</span></div></div>
        <div class="contribution-layout"><aside class="panel contribution-sidebar"><h3>Discovery queue</h3><form data-add-contribution><label>Type<select name="kind"><option value="item">Item</option><option value="npc">Monster</option><option value="zone">Zone</option></select></label><label>Name<input name="name" required maxlength="230"></label><button class="secondary-button">Add for review</button></form><div data-contribution-list></div></aside><article class="panel contribution-editor" data-contribution-editor></article></div><div class="panel wiki-review" data-wiki-review hidden></div>`;
    settingsRoot.innerHTML=`<h2>Screen reading</h2><label class="check-control"><input type="checkbox" data-capture-opt-in> Enable optional screen reading</label><p class="settings-helper">Screen reading currently requires the Default Modern (default_modern) game UI skin. Other skins are not yet calibrated. Logs supply kills, loot and zones. Screen reading supplies item tooltips, examine windows and visible character stats. It runs locally, without audio or video recording. Capture starts only when you choose a source and press Start.</p><div class="capture-settings-controls" hidden><label>Source<select data-capture-source aria-label="Capture source"><option value="">Choose a window or display</option></select></label><div class="capture-actions"><button class="secondary-button" data-capture-sources>Choose source</button><button class="primary-button" data-capture-start>Start contribution capture</button><button class="secondary-button" data-capture-pause>Pause</button><button class="secondary-button" data-capture-stop>Stop all capture</button><button class="secondary-button" data-capture-calibrate disabled>Calibrate OCR area</button><button class="text-button" data-capture-import>Read a screenshot</button></div></div><p data-capture-status class="settings-helper" role="status">Screen reading disabled.</p>`;
    characterRoot.innerHTML=`<div class="capture-toolbar panel"><div><label class="character-profile-select">Character Select<select data-character-select aria-label="Character Select"></select></label><p>One guided capture, from your empty equipment baseline to a shareable character. Use the Default Modern (default_modern) game UI.</p></div></div>
        <section class="panel character-walkthrough" aria-label="Character capture walkthrough"><ol data-walkthrough-steps></ol><div data-walkthrough-stage></div><p data-walkthrough-status role="status"></p><div class="capture-actions"><button class="text-button" data-walkthrough-back>Back</button><button class="text-button" data-character-stop>Cancel walkthrough</button></div></section><p data-character-status role="status"></p>
        <details class="character-workbench" data-character-workbench open><summary>Character inventory</summary><div class="character-sheet"><aside class="character-profile-panel"><div data-character-identity></div></aside><section class="character-equipment-panel"><div class="panel-heading"><h3>Equipment</h3><button class="text-button" data-character-import>Read screenshot</button></div><p class="settings-helper">Known items fill obvious slots. Drag onto a valid slot to equip, or back into Inventory to unequip.</p><div class="character-slots" data-character-slots aria-label="Equipment slots"></div><div class="capture-actions" data-character-placement-status role="status"></div></section><section class="character-totals-panel"><div class="character-mini-stats" data-character-stat-summary></div><p class="character-estimate-note">Equipment totals · ? unavailable · * estimate. Caps, buffs and unsupported formulas are not included.</p></section></div><section class="character-bags"><div class="panel-heading"><h3>Inventory <small data-character-inventory-count></small></h3><button class="text-button" data-character-add>Add item</button></div><p class="settings-helper">Loose items only. A yellow ! means the screen read needs a wiki match before it can be equipped.</p><div class="character-inventory" data-character-inventory data-loose-inventory aria-label="Loose inventory"></div></section><section class="character-selection" data-character-editor aria-label="Selected item"></section>
        <details class="panel"><summary>Search the wiki item catalog</summary><section class="character-catalog" data-character-catalog aria-label="Character item catalog"></section></details>
        <details class="panel character-stats"><summary>Edit No Equipment baseline</summary><div data-stat-proposal></div><div data-character-stats></div></details><button class="secondary-button" data-character-preview>Preview current snapshot</button></details>`;
    const dialog=document.createElement('dialog');dialog.className='character-share-dialog';dialog.setAttribute('aria-label','Review character snapshot');dialog.innerHTML='<div class="panel-heading"><h2>Review character inspect</h2><button class="text-button" data-share-close>Close</button></div><p>Your wiki sheet opens collapsed under Character (Server). Sharing again replaces that character’s previous sheet. Hover or focus gear to inspect it; click an item to open its wiki page.</p><section data-share-inspect></section><details><summary>PNG export preview</summary><img data-share-image alt="Character equipment and total statistics"></details><div class="capture-actions"><button class="primary-button" data-share-copy>Copy PNG</button><button class="secondary-button" data-share-save>Save PNG</button></div><label>Caption<textarea data-share-caption maxlength="1000" rows="2"></textarea></label><label class="check-control"><input type="checkbox" data-share-confirm> Share this reviewed character on my wiki talk page.</label><button class="secondary-button" data-share-upload>Share on my User_talk page</button><p data-share-status role="status"></p>';document.body.append(dialog);
    const areaDialog=document.createElement('dialog');areaDialog.className='ocr-area-dialog';areaDialog.setAttribute('aria-labelledby','ocr-area-title');areaDialog.innerHTML=`<h2 id="ocr-area-title">Calibrate OCR area</h2><p data-area-source></p><p>Select the complete item tooltip, examine window or Inventory/stat pane, including its item name or heading, metadata and footer. Keep it visible until an editable proposal appears. Drag over the pane, or enter its percentages below. Only this area will be read. The preview is the last frame from your selected source; it is never saved.</p><div class="ocr-area-stage" data-area-stage><img data-area-image alt="Last frame from the current capture source" draggable="false"><div class="ocr-area-selection" data-area-selection></div></div><form data-area-form><fieldset><legend>Area as a percentage of the full frame</legend><div class="ocr-area-fields">${[['x','Left'],['y','Top'],['width','Width'],['height','Height']].map(([key,label])=>`<label>${label} (%)<input data-area-percent="${key}" name="${key}" type="number" min="${key==='width'||key==='height'?'0.1':'0'}" max="100" step="0.1" required></label>`).join('')}</div></fieldset><p data-area-status role="status"></p><div class="capture-actions"><button class="primary-button" type="submit" data-area-save>Save area</button><button class="secondary-button" type="button" data-area-full>Full frame</button><button class="text-button" type="button" data-area-cancel>Cancel</button></div></form>`;document.body.append(areaDialog);
    const itemTooltip=document.createElement('aside');itemTooltip.className='character-item-tooltip';itemTooltip.hidden=true;itemTooltip.setAttribute('role','dialog');itemTooltip.setAttribute('aria-label','Item inspect');document.body.append(itemTooltip);
    const augmentDialog=document.createElement('dialog');augmentDialog.className='character-augment-picker';augmentDialog.setAttribute('aria-label','Choose augment');document.body.append(augmentDialog);
    let augmentCatalog=null,tooltipTimer=null,pickerEpoch=0;
    listen(augmentDialog,'close',()=>{if(!augmentDialog.open){pickerEpoch++;augmentDialog.onpaste=null;}});
    const characterCatalog=mountCharacterCatalog({host:$('[data-character-catalog]',characterRoot),getPack,onAdd(input){if(publishing)return{ok:false,error:'Wait until the reviewed wiki action completes.'};const result=character.intake(input);if(result.ok){if(walkthrough.snapshot().active){walkthrough.rememberItem(result.candidate);character.autoAssign(result.candidate.id);}selectedCard=result.candidate.id;shareImage=null;renderCharacter();}return result;}});
    function listen(element,event,callback){element?.addEventListener(event,callback);unsubscribers.push(()=>element?.removeEventListener(event,callback));}
    function shareStatus(message,error=false){const host=dialog.querySelector('[data-share-status]');host.textContent=message;host.classList.toggle('capture-warning',error);}
    async function act(callback){if(disposed||busy)return;busy=true;renderCharacterSelect();try{return await callback();}catch(error){const message=error.message||'This action could not complete.';if(dialog.open)shareStatus(message,true);else warning(message);}finally{busy=false;if(!disposed)renderCharacterSelect();}}
    function invalidatePlan(){reviewEpoch++;plan=null;$('[data-wiki-review]').hidden=true;}
    function reviewIsCurrent(candidate,epoch){return !disposed&&epoch===reviewEpoch&&selectedId===candidate?.id&&JSON.stringify(selected())===JSON.stringify(candidate);}
    function setPublishing(value){publishing=value;root.inert=value;characterRoot.inert=value;dialog.inert=value;root.setAttribute('aria-busy',String(value));characterRoot.setAttribute('aria-busy',String(value));updatePublishAvailability();}
    function selected(){return queue.snapshot().find(c=>c.id===selectedId);}
    function saveCandidate(){
        const candidate=selected(),form=$('[data-candidate-form]');if(!candidate||!form||publishing)return candidate;
        const data=new FormData(form),fields={...candidate.fields};
        for(const row of form.querySelectorAll('[data-field-key]')){
            const key=row.dataset.fieldKey,input=row.querySelector('[data-field-value]');let value=input.value;
            if(input.dataset.array==='true')value=value.split(['statLines','knownLoot'].includes(key)?/\n/:/[,\n]/).map(s=>s.trim()).filter(Boolean);
            else if(input.dataset.type==='boolean')value=value==='true';
            else if(input.dataset.type==='number'&&value.trim()!==''&&Number.isFinite(Number(value)))value=Number(value);
            const previous=candidate.fields[key],nonblank=Array.isArray(value)?value.length>0:value!==''&&value!==null;
            fields[key]={value,confirmed:row.querySelector('[data-field-confirmed]').checked,edited:previous?.edited===true||(previous?JSON.stringify(previous.value)!==JSON.stringify(value):nonblank)};
        }
        const sources=candidate.sources.map((source,index)=>({...source,confirmed:Boolean(form.querySelector(`[data-source-confirm="${index}"]`)?.checked)}));
        const patch={name:data.get('name'),title:data.get('title'),zone:data.get('zone'),instance:data.get('instance'),era:data.get('era'),playerText:data.get('playerText'),matchesReviewed:Boolean(form.querySelector('[data-matches-reviewed]')?.checked),fields,sources};
        const changed=Object.keys(patch).some(key=>JSON.stringify(patch[key])!==JSON.stringify(candidate[key]));
        if(changed){patch.planId=null;patch.status='needs-review';invalidatePlan();}
        return queue.update(candidate.id,patch);
    }
    function renderQueue(){const candidates=queue.snapshot();$('[data-contribution-list]').innerHTML=candidates.map(c=>`<button class="contribution-row ${c.id===selectedId?'is-active':''}" data-candidate-id="${escape(c.id)}"><strong>${escape(c.name)}</strong><small>${escape(c.kind)} · ${escape(c.status)} · ${escape(c.membership==='missing'?'absent from cache':c.membership==='present'?'cached page':'catalog incomplete')}</small></button>`).join('')||'<p class="empty-state">New discoveries from logs and screen reads appear here. You can also add one manually.</p>';}
    function renderCandidate(){itemBaseUi?.dispose();itemBaseUi=null;const candidate=selected(),host=$('[data-contribution-editor]');if(!candidate){host.innerHTML='<p class="empty-state">Choose an entry to review. Existing pages remain potential matches until you confirm the identity.</p>';return;}
        const fields=candidate.kind==='item'?withDefaultItemStatLines(candidate.fields):{...candidate.fields};for(const key of candidate.kind==='npc'?['level','race','class','location','respawnTime','AC','HP','special','knownLoot']:candidate.kind==='zone'?['whoName']:['classes','slots','iconId'])if(!fields[key])fields[key]={value:['knownLoot','classes','slots'].includes(key)?[]:'',confirmed:false};
        const localMatches=queue.matches(candidate);host.innerHTML=`<form data-candidate-form><h2>${escape(candidate.name)}</h2><p class="settings-helper">OCR and log context are proposals. Check each field you have verified. Keep descriptions in your own words.</p><div class="capture-form-grid"><label>Observed name<input name="name" value="${escape(candidate.name)}" maxlength="230" required></label><label>Wiki title<input name="title" value="${escape(candidate.title)}" maxlength="230" required></label><label>Zone<input name="zone" value="${escape(candidate.zone)}" maxlength="230"></label><label>Instance<select name="instance">${['unknown','normal','raid'].map(value=>`<option ${candidate.instance===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Era template<select name="era"><option value="">Confirm era</option>${eras.map(value=>`<option ${candidate.era===value?'selected':''}>${value}</option>`).join('')}</select></label></div>
        ${candidate.kind==='item'?'<section data-item-base-review></section>':''}<details open><summary>Extracted fields — confirm before use</summary>${Object.entries(fields).map(([key,field])=>`<label class="contribution-field" data-field-key="${escape(key)}"><span>${escape(key)}${key==='knownLoot'?'<small>One item title per line</small>':''}</span>${['statLines','knownLoot'].includes(key)?`<textarea data-field-value data-array="true" rows="${key==='statLines'?7:4}">${escape(Array.isArray(field.value)?field.value.join('\n'):field.value)}</textarea>`:`<input data-field-value data-type="${typeof field.value}" ${Array.isArray(field.value)?'data-array="true"':''} value="${escape(Array.isArray(field.value)?field.value.join(', '):field.value)}">`}<span class="check-control"><input data-field-confirmed type="checkbox" ${field.confirmed?'checked':''}> Verified</span></label>`).join('')}</details>
        ${candidate.sources.length?`<fieldset><legend>Potential drop sources</legend>${candidate.sources.map((source,index)=>`<label class="check-control"><input type="checkbox" data-source-confirm="${index}" ${source.confirmed?'checked':''}> ${escape(source.npc)} · ${escape(source.zone)} (${escape(source.sourceEvidence)}): I verified this drop source.</label>`).join('')}</fieldset>`:''}
        <label>Your factual description / notes<textarea name="playerText" rows="5" maxlength="12000">${escape(candidate.playerText)}</textarea></label><details><summary>Captured evidence</summary>${candidate.evidence.map(e=>`<p class="settings-helper">${escape(e.kind)} · ${escape(e.at)} · ${Math.round(e.confidence)}% OCR confidence</p><pre>${escape(e.text||'Authoritative game-log event; no screen image stored.')}</pre>`).join('')||'<p>Manually entered.</p>'}</details>
        <h3>Potential existing pages</h3><div data-potential-matches>${localMatches.map(match=>`<a href="https://eqlwiki.com/${encodeURIComponent(match.title)}" target="_blank" rel="noopener">${escape(match.title)}</a>`).join(' · ')||'No close cached titles. Check the live wiki before preparing.'}</div><button class="secondary-button" type="button" data-check-matches>Check live wiki</button><label class="check-control"><input data-matches-reviewed type="checkbox" ${candidate.matchesReviewed?'checked':''}> I reviewed potential matches and this is a separate missing page.</label><div class="capture-actions"><button class="primary-button" type="submit">Submit — preview wiki changes</button>${candidate.planId?'<button class="secondary-button" type="button" data-resume-plan>Resume saved review</button>':''}<button class="text-button" type="button" data-ignore-candidate>Ignore entry</button></div></form>`;
        if(candidate.kind==='item')itemBaseUi=mountItemBaseReview({host:$('[data-item-base-review]'),getCandidate:()=>saveCandidate()||selected(),onInvalidate(){if(publishing)return;queue.update(candidate.id,{baseRecovery:null,planId:null,status:'needs-review'});invalidatePlan();},onApply(current,review){if(publishing)return;queue.update(current.id,{...applyItemBaseReview(current,review),planId:null,status:'needs-review'});invalidatePlan();renderCandidate();notify('Base proposals applied. Review and verify the proposed stat text before submitting.',{tone:'warning'});}});
        const form=$('[data-candidate-form]');form.oninput=event=>{if(['name','title','zone','instance','era'].includes(event.target.name))form.querySelector('[data-matches-reviewed]').checked=false;saveCandidate();invalidatePlan();};form.onsubmit=event=>{event.preventDefault();void act(preparePlan);};
        $('[data-check-matches]').onclick=()=>void act(async()=>{const current=saveCandidate(),epoch=reviewEpoch;const result=await wiki.matches({name:current.title,kind:current.kind});if(!reviewIsCurrent(current,epoch))return;matches=result;$('[data-potential-matches]').innerHTML=(matches.matches||[]).map(match=>`<a target="_blank" rel="noopener" href="https://eqlwiki.com/${encodeURIComponent(match.title)}">${escape(match.title)}</a>`).join(' · ')||'No close live titles found.';});
        $('[data-resume-plan]')?.addEventListener('click',()=>void act(async()=>{const current=saveCandidate(),epoch=reviewEpoch;if(!current?.planId)throw Error('This draft changed. Prepare and review a fresh page plan.');const restored=await wiki.getPlan({planId:current.planId});if(!reviewIsCurrent(current,epoch))return;plan=restored;renderPlan();}));
        $('[data-ignore-candidate]').onclick=()=>{if(publishing)return;queue.remove(candidate.id);selectedId=queue.snapshot()[0]?.id||'';invalidatePlan();renderQueue();renderCandidate();};
    }
    async function refreshAccount(){if(!wiki)return;account=await wiki.status();$('[data-account-status]').textContent=account.authenticated?`Logged in as ${account.user.name}${account.canEdit?'':' · editing unavailable'}`:'Not logged in';$('[data-wiki-login]').textContent=account.authenticated?'Log out of wiki':'Log in to wiki';}
    async function preparePlan(){if(!wiki)throw Error('Wiki submission requires the desktop app.');const candidate=saveCandidate(),epoch=reviewEpoch,relatedPages=[];if(candidate.kind==='item')for(const source of candidate.sources.filter(s=>s.confirmed))relatedPages.push({title:source.npc,role:'npc-loot',itemTitle:candidate.title,npcTitle:source.npc,zoneTitle:source.zone});const prepared=await wiki.preparePlan({candidate,relatedPages,matchesReviewed:candidate.matchesReviewed===true});if(!reviewIsCurrent(candidate,epoch))throw Error('This draft changed while its review was loading. Prepare the updated review again.');plan=prepared;queue.update(candidate.id,{planId:plan.id});renderPlan();renderCandidate();}
    function updatePublishAvailability(){const host=$('[data-wiki-review]'),button=host.querySelector('[data-publish-plan]');if(!button)return;const boxes=[...host.querySelectorAll('[data-reviewed-page]')];button.disabled=publishing||!plan||plan.status==='submitted'||(plan.blockers||[]).length>0||!host.querySelector('[data-final-matches-reviewed]')?.checked||!boxes.length||!boxes.every(box=>box.checked);}
    function renderPlan(){
        const host=$('[data-wiki-review]');if(!plan){host.hidden=true;return;}host.hidden=false;
        const live=plan.matches||{},link=title=>`<a target="_blank" rel="noopener" href="https://eqlwiki.com/${encodeURIComponent(title)}">${escape(title)}</a>`;
        host.innerHTML=`<h2>Review all wiki changes</h2><p>Blueprint revision ${escape(plan.blueprintRevision)} · account ${escape(plan.expectedUser?.name||'not logged in')}</p>${[...(plan.blockers||[]),...(plan.warnings||[])].map(message=>`<p class="capture-warning">${escape(message)}</p>`).join('')}<section class="capture-proposal"><h3>Fresh live matches and redirects</h3><p>${(live.matches||[]).map(match=>link(match.title)).join(' · ')||'No close live titles were returned.'}</p>${(live.redirects||[]).map(redirect=>`<p>${link(redirect.from)} → ${link(redirect.to)}</p>`).join('')}<p class="settings-helper">Checked ${escape(live.checkedAt||'when this review was prepared')}. Creating an alternate spelling can duplicate an existing page.</p><label class="check-control"><input type="checkbox" data-final-matches-reviewed> I reviewed these live results and confirmed the page identity.</label></section><div>${plan.pages.map(page=>`<details open><summary>${escape(page.title)} · ${escape(page.operation)} · ${escape(page.status)}</summary><div class="wiki-diff"><label>Before<textarea readonly rows="10">${escape(page.beforeText)}</textarea></label><label>After<textarea readonly rows="10">${escape(page.afterText)}</textarea></label></div><button class="text-button" data-copy-page="${escape(page.id)}">Copy proposed wikicode</button>${page.result?`<p>${escape(page.result.message||`Revision ${page.result.revision||''}`)}</p>`:''}<label class="check-control"><input type="checkbox" data-reviewed-page="${escape(page.id)}"> I reviewed this complete page change.</label></details>`).join('')}</div><button class="primary-button" data-publish-plan disabled>${plan.status==='partial'||plan.status==='needs-attention'?'Retry unfinished pages':plan.status==='submitted'?'Contribution published':'Publish reviewed contribution'}</button><p data-publish-status role="status"></p>`;
        host.querySelectorAll('[data-reviewed-page],[data-final-matches-reviewed]').forEach(box=>box.onchange=updatePublishAvailability);
        host.querySelectorAll('[data-copy-page]').forEach(button=>button.onclick=()=>void act(()=>share.copyText(plan.pages.find(page=>page.id===button.dataset.copyPage).afterText)));
        $('[data-publish-plan]').onclick=()=>void act(async()=>{if(publishing)return;const pending=plan;setPublishing(true);try{$('[data-publish-status]').textContent='Publishing the reviewed pages. Please wait for the wiki result.';const result=await wiki.submitPlan({planId:pending.id,reviewDigest:pending.reviewDigest});plan=result;queue.update(selectedId,{status:result.status,planId:result.id});renderPlan();renderQueue();$('[data-publish-status]').textContent=result.status==='submitted'?'Contribution published. Thank you!':'Review the per-page results. Completed edits will not be repeated.';}finally{setPublishing(false);}});
        updatePublishAvailability();host.scrollIntoView({block:'start',behavior:'smooth'});
    }
    function renderCapture(){if(captureState.enabled)optIn=true;$('[data-capture-opt-in]',settingsRoot).checked=optIn;$('.capture-settings-controls',settingsRoot).hidden=!optIn;const label=captureState.error||`${captureState.phase||'disabled'}${captureState.owner?` · ${captureState.owner}`:''}${captureState.source?` · ${captureState.source.label}`:''}`;$('[data-capture-status]',settingsRoot).textContent=[label,captureState.readWarning,captureState.calibrationWarning,captureState.region?'Calibrated OCR area active.':''].filter(Boolean).join(' · ');$('[data-character-status]',characterRoot).textContent=captureState.owner==='character'?`Character reading ${captureState.phase}. ${captureState.contributionPaused?'Contribution reading is paused.':''}`:'';$('[data-capture-pause]',settingsRoot).textContent=captureState.phase==='paused'?'Resume':'Pause';$('[data-character-stop]',characterRoot).disabled=false;$('[data-capture-calibrate]',settingsRoot).disabled=!captureState.hasPreview||!capture?.preview||!capture?.setRegion||areaOpening;
        walkthrough.syncCapture(captureState,{startedAt:sourceStart?.at});
        const flow=walkthrough.snapshot();if(flow.active&&flow.step==='source'&&sourceStart?.epoch===walkthroughEpoch&&sourceStart.sessionId===flow.sessionId&&sourceStart.sourceId===captureState.source?.id&&captureState.owner==='character'&&captureState.sessionId===flow.sessionId&&captureState.phase==='running'){const itemReadStartedAt=sourceStart.at;sourceStart=null;lastStats=null;baseProposalId='';walkthrough.advance({captureRunning:true,sequence:cursor,itemReadStartedAt});walkthroughMessage='Capture started. Keep each item tooltip visible until its card appears.';renderCharacter();}else renderWalkthrough();
        if(areaPreview&&(!captureState.hasPreview||captureState.source?.id!==areaPreview.sourceId||captureState.sessionId!==areaPreview.sessionId||captureState.owner!==areaPreview.owner||captureState.sourceSize&&JSON.stringify(frameSize(captureState.sourceSize))!==JSON.stringify(areaPreview.sourceSize))){closeArea();warning('The capture source changed. Open calibration again for its current frame.');}
        if(captureState.calibrationWarning){const key=areaKey(captureState.source,captureState.owner);if(areaProfiles.some(profile=>profile.key===key)){areaProfiles=areaProfiles.filter(profile=>profile.key!==key);persistAreas();}}
    }
    function persistAreas(){try{storage?.setItem(OCR_AREA_STORAGE_KEY,JSON.stringify(areaProfiles.slice(-MAX_OCR_AREAS)));}catch{warning('The OCR area is active, but its preference could not be saved.');}}
    function closeArea(){areaEpoch++;areaOpening=false;areaPreview=null;areaDraft=null;areaDrag=null;const image=areaDialog.querySelector('[data-area-image]');image.removeAttribute('src');areaDialog.querySelector('[data-area-source]').textContent='';areaDialog.querySelector('[data-area-status]').textContent='';if(areaDialog.open)areaDialog.close();}
    function paintArea(updateInputs=true){if(!areaDraft)return;const selection=areaDialog.querySelector('[data-area-selection]');for(const [key,property] of [['x','left'],['y','top'],['width','width'],['height','height']])selection.style[property]=`${areaDraft[key]*100}%`;if(updateInputs){const rounded={x:Math.round(areaDraft.x*1000),y:Math.round(areaDraft.y*1000)};rounded.width=Math.round((areaDraft.x+areaDraft.width)*1000)-rounded.x;rounded.height=Math.round((areaDraft.y+areaDraft.height)*1000)-rounded.y;for(const input of areaDialog.querySelectorAll('[data-area-percent]'))input.value=String(rounded[input.dataset.areaPercent]/10);}}
    function areaFromInputs(){const value=Object.fromEntries([...areaDialog.querySelectorAll('[data-area-percent]')].map(input=>[input.dataset.areaPercent,input.value===''?NaN:input.valueAsNumber/100]));const region=normalizeOcrArea(value);if(!region)throw Error('Choose a non-empty area within the frame: Left + Width and Top + Height must each be at most 100%.');return region;}
    async function openArea(){
        if(disposed||areaOpening||areaDialog.open||!captureState.hasPreview)return;
        const epoch=++areaEpoch;areaOpening=true;renderCapture();
        try{const preview=await capture.preview();if(disposed||epoch!==areaEpoch)return;
            if(!captureState.hasPreview||preview.sourceId!==captureState.source?.id||preview.sessionId!==captureState.sessionId||preview.owner!==captureState.owner)throw Error('The capture source changed. Open calibration again.');
            const size=frameSize(preview.sourceSize);if(!size||typeof preview.dataUrl!=='string'||preview.dataUrl.length>24*1024*1024||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(preview.dataUrl))throw Error('The current frame preview is unavailable. Wait for a fresh frame and try again.');
            areaPreview={sourceId:preview.sourceId,sessionId:preview.sessionId,owner:preview.owner,sourceSize:size,referenceSize:frameSize(preview.referenceSize)||size,key:areaKey(captureState.source,preview.owner)};
            areaDraft=normalizeOcrArea(preview.region)||{x:0,y:0,width:1,height:1};const image=areaDialog.querySelector('[data-area-image]');image.src=preview.dataUrl;
            await image.decode();if(disposed||epoch!==areaEpoch)return;
            areaDialog.querySelector('[data-area-source]').textContent=`${captureState.source.label} · ${preview.owner} · ${size.width} × ${size.height}`;
            paintArea();areaDialog.showModal();areaDialog.querySelector('[data-area-percent="x"]').focus();
        }catch(error){if(epoch===areaEpoch){closeArea();warning(error.message||'The current frame could not be previewed.');}}finally{if(epoch===areaEpoch)areaOpening=false;if(!disposed)renderCapture();}
    }
    async function saveArea(fullFrame=false){if(!areaPreview||areaSaving||disposed)return;const epoch=areaEpoch,preview=areaPreview;try{
        const region=fullFrame?null:areaFromInputs();if(region&&!validAreaProfile({region,referenceSize:preview.sourceSize}))throw Error('Choose an area at least 16 pixels wide and high.');areaSaving=true;areaDialog.inert=true;areaDialog.querySelector('[data-area-status]').textContent='Saving OCR area…';
        const next=await capture.setRegion({region,referenceSize:preview.sourceSize,sourceId:preview.sourceId,sessionId:preview.sessionId});if(disposed||epoch!==areaEpoch)return;
        if(next.source?.id!==preview.sourceId||next.sessionId!==preview.sessionId||next.owner!==preview.owner)throw Error('Capture changed. Open a fresh calibration preview.');
        areaProfiles=areaProfiles.filter(profile=>profile.key!==preview.key);if(region&&preview.key)areaProfiles.push({key:preview.key,region,referenceSize:preview.sourceSize});areaProfiles=areaProfiles.slice(-MAX_OCR_AREAS);persistAreas();captureState=next;closeArea();renderCapture();notify(fullFrame?'OCR will read the full frame.':'OCR area saved for this source and capture mode.',{tone:'success'});
    }catch(error){if(!disposed&&epoch===areaEpoch)areaDialog.querySelector('[data-area-status]').textContent=error.message||'The area could not be saved.';}finally{areaSaving=false;areaDialog.inert=false;}}
    function areaPoint(event){const rect=areaDialog.querySelector('[data-area-stage]').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
    function dragArea(event){if(!areaDrag||event.pointerId!==areaDrag.id)return;const point=areaPoint(event),x=Math.min(areaDrag.start.x,point.x),y=Math.min(areaDrag.start.y,point.y);areaDraft={x,y,width:Math.abs(point.x-areaDrag.start.x),height:Math.abs(point.y-areaDrag.start.y)};paintArea();}
    function selectedSource(){return $('[data-capture-source]',settingsRoot).value;}
    async function chooseSources(){if(!capture)throw Error('Screen reading requires the desktop app.');const epoch=++sourceListEpoch;let listed;try{listed=await capture.sources();}catch(error){if(disposed||epoch!==sourceListEpoch)return;throw error;}if(disposed||epoch!==sourceListEpoch)return;const previous=selectedSource();sources=listed;$('[data-capture-source]',settingsRoot).innerHTML='<option value="">Choose a window or display</option>'+sources.map(source=>`<option value="${escape(source.id)}">${escape(source.name)} (${escape(source.type)})</option>`).join('');if(sources.some(s=>s.id===previous))$('[data-capture-source]',settingsRoot).value=previous;else $('[data-capture-source]',settingsRoot).value=sources.find(s=>s.recommended===true)?.id||'';renderWalkthrough();}
    function refreshSources(){void chooseSources().catch(error=>warning(error.message));}
    async function start(mode,{sourceId=selectedSource(),sessionId}={}){if(!capture)throw Error('Screen reading requires the desktop app.');if(mode!=='character'&&!optIn)throw Error('Enable Screen reading in Settings, then choose a source.');if(!sourceId)throw Error('Choose the game window first.');if(mode==='character')optIn=true;closeArea();const epoch=walkthroughEpoch,source=sources.find(source=>source.id===sourceId),profile=areaProfiles.find(profile=>profile.key===areaKey(source,mode)),next=await capture.start({mode,sourceId,...(sessionId?{sessionId}:{}),...(profile?{region:profile.region,referenceSize:profile.referenceSize}:{})});if(disposed||mode==='character'&&epoch!==walkthroughEpoch)return;captureState=next;renderCapture();}
    async function stopCapture(mode){if(!capture)throw Error('Screen reading requires the desktop app.');if(!publishing)invalidatePlan();captureState=await capture.stop(mode?{mode}:undefined);renderCapture();}
    async function importScreenshot(mode,{source='file',equipSlotId=null,isCurrent=()=>true}={}){
        if(!capture)throw Error('Screenshot reading requires the desktop app.');
        const epoch=walkthroughEpoch,profileId=profiles.activeId(),current=()=>!disposed&&isCurrent()&&(!equipSlotId||augmentDialog.open)&&(mode!=='character'||epoch===walkthroughEpoch&&profileId===profiles.activeId());
        if(!current())return;
        if(!Number.isSafeInteger(captureState.generation)){const next=await capture.status();if(!current())return;captureState=next;renderCapture();}
        if(!current())return;
        const flow=walkthrough.snapshot(),sessionId=mode==='character'?(flow.active?flow.sessionId:captureState.characterSessionId||(captureState.owner==='character'&&captureState.sessionId)||(offlineCharacterSessionId||=globalThis.crypto.randomUUID())):undefined;
        const token=mode==='character'?{sessionId,equipSlotId,at:Date.now(),epoch:walkthroughEpoch,eligible:!flow.active||CHARACTER_ITEM_READ_STEPS.includes(flow.step),inactive:!flow.active,baseEligible:!equipSlotId&&flow.active&&flow.step==='base',baseAfterAt:flow.baseAfterAt,captureGeneration:captureState.generation,captureSourceId:captureState.source?.id||null,captureSessionId:captureState.sessionId||''}:null;if(token)manualItemRead=token;
        try{const result=await capture.importImage({mode,source,...(sessionId?{sessionId}:{})});if(!current()||result.cancelled)return;
            if(equipSlotId&&isCurrent()&&token?.epoch===walkthroughEpoch&&CHARACTER_SLOTS.some(slot=>slot.id===equipSlotId)){
                const generation=token.captureGeneration;
                for(const observation of result.records||[]){
                    const at=Date.parse(observation.capturedAt||'');
                    if(observation.kind!=='manual'||observation.owner!=='character'||observation.subject?.kind!=='item'||observation.sessionId!==sessionId||!Number.isFinite(at)||at<token.at||at>Date.now()||!Number.isSafeInteger(generation)||observation.input?.captureGeneration!==generation+1||![generation,generation+1].includes(captureState.generation)||token.captureSourceId!==(captureState.source?.id||null)||token.captureSessionId!==(captureState.sessionId||''))continue;
                    const raw=characterObservationInput(observation),resolution=resolveCharacterCatalog(getPack(),raw.name),item=resolution.item;
                    const accepted=character.intake(observation,{...(item?{wikiItem:item,catalogMatch:resolution.status==='exact'?'exact':'fuzzy',icon:getPack().icons?.[item.iconId]}:{})});
                    if(!accepted.ok||!accepted.candidate){if(accepted.error)warning(accepted.error);continue;}
                    selectedCard=accepted.candidate.id;shareImage=null;
                    if(walkthrough.snapshot().active)walkthrough.rememberItem(accepted.candidate);
                    if(characterSlotCompatibility(accepted.candidate,equipSlotId).compatible){const placed=character.assign(accepted.candidate.id,equipSlotId);if(!placed.ok)warning(placed.error);else if(walkthrough.snapshot().active)walkthrough.chooseSlot(accepted.candidate.id,equipSlotId);}
                    else warning(characterEquipmentEligibility(accepted.candidate).known?'That item belongs in a different equipment slot; it is in Inventory.':'Choose a wiki match for the captured item in Inventory before equipping.');
                }
            }
            if(mode==='character'&&!$('[data-character-editor]',characterRoot).contains(document.activeElement))renderCharacter();
            if(result.message)notify(result.message,{tone:result.records?.length?'success':'warning'});
            return result;
        }finally{if(manualItemRead===token)manualItemRead=null;}
    }
    const stepLabels={details:'Details',source:'Game window',unequip:'Unequip',base:'Base stats',reequip:'Re-equip',slots:'Confirm slots',review:'Save snapshot',complete:'Saved'};
    function acceptsBaseRead(observation,token=lastStatsManualRead){
        if(!walkthrough.acceptsBase(observation))return false;
        if(observation.kind!=='manual')return true;
        const flow=walkthrough.snapshot(),generation=token?.captureGeneration;
        // A file has no trustworthy capture time. The host stamps completion,
        // so only an import explicitly begun in this same Base phase may fill it.
        return Boolean(token?.baseEligible&&token.epoch===walkthroughEpoch&&token.sessionId===flow.sessionId&&token.at>=flow.baseAfterAt&&token.baseAfterAt===flow.baseAfterAt&&Number.isSafeInteger(generation)&&generation>=0&&observation.input?.captureGeneration===generation+1&&[generation,generation+1].includes(captureState.generation)&&token.captureSourceId===(captureState.source?.id||null)&&token.captureSessionId===(captureState.sessionId||''));
    }
    function captureOptions(){return `<details class="walkthrough-options"><summary>Capture options</summary><div class="capture-actions"><button class="secondary-button" type="button" data-walkthrough-calibrate>Adjust OCR area</button><button class="secondary-button" type="button" data-character-import>Read an examine screenshot</button><button class="text-button" type="button" data-walkthrough-source>Change game window</button></div></details>`;}
    function renderWalkthrough(force=false){
        if(dragId){walkthroughSlotsPending=true;return;}
        const flow=walkthrough.snapshot(),snapshot=character.snapshot(),host=$('[data-walkthrough-stage]',characterRoot),key=JSON.stringify([flow.step,flow.active,flow.sessionId]);
        $('[data-walkthrough-steps]',characterRoot).innerHTML=CHARACTER_WALKTHROUGH_STEPS.filter(s=>s!=='complete').map(s=>`<li ${flow.step===s?'aria-current="step"':''} class="${CHARACTER_WALKTHROUGH_STEPS.indexOf(s)<CHARACTER_WALKTHROUGH_STEPS.indexOf(flow.step)?'is-complete':''}">${stepLabels[s]}</li>`).join('');
        if(force||key!==walkthroughStageKey){walkthroughStageKey=key;
            if(flow.step==='details')host.innerHTML=`<h3>Start with your character</h3><p>Build a fresh equipment layout and No Equipment baseline. Existing inventory cards stay available.</p><form class="character-metadata" data-character-metadata>${[['name','Character name','text'],['server','Server','text'],['classes','Class combination','text'],['level','Level','number'],['aaCount','AA count','number'],['race','Race (optional)','text']].map(([name,label,type])=>`<label>${label}<input name="${name}" type="${type}" ${['name','server','classes','level','aaCount'].includes(name)?'required':''} ${type==='number'?`min="${name==='level'?1:0}" step="1" max="${name==='level'?125:1000000}"`:'maxlength="100"'} value="${escape(Array.isArray(snapshot.metadata[name])?snapshot.metadata[name].join(' / '):snapshot.metadata[name]??'')}" ${name==='classes'?'placeholder="WAR / CLR / ENC"':''}></label>`).join('')}<button class="primary-button" type="submit" data-character-start>${flow.active?'Continue':'Start walkthrough'}</button></form>`;
            else if(flow.step==='source')host.innerHTML=`<h3>Choose the game window</h3><p>Screen reading is set up here. Keep Default Modern selected in the game. Starting this walkthrough pauses contribution capture until you finish.</p><label>Capture source<select data-walkthrough-source-select aria-label="Character capture source"></select></label><div class="capture-actions"><button class="primary-button" data-walkthrough-start-source>Start reading</button><button class="secondary-button" data-walkthrough-refresh-source>Refresh windows</button></div><p class="settings-helper">Only the selected source is read. Nothing starts automatically when the app opens.</p>`;
            else if(flow.step==='unequip'||flow.step==='reequip'){const off=flow.step==='unequip';host.innerHTML=`<h3>${off?'Unequip and read your items':'Re-equip and fill any gaps'}</h3><p>${off?'Unequip slowly, one item at a time. Take ANY-slot items off first, then remove the rest. Hover over each item or open its examine window, and wait with the complete tooltip visible until its card appears before removing the next item. Known items fill obvious slots in the snapshot.':'Put ordinary items back on first and ANY-slot items on last. Hover over anything missed during unequipping; previously read items update their existing cards.'}</p><p class="walkthrough-count" data-walkthrough-count></p><p class="settings-helper" data-walkthrough-reading role="status"></p><p class="settings-helper">Two physically identical items may look the same to OCR. Use “Second copy” on a card when you have two.</p><button class="primary-button" data-walkthrough-next>${off?'All items are unequipped':'Finished re-equipping'}</button>${captureOptions()}`;}
            else if(flow.step==='base')host.innerHTML=`<h3>Read your No Equipment baseline</h3><p>With every equipment slot empty, open Inventory/Stats and keep it visible. Review the values below, correct any unread numbers, then continue. The AC and attack components are labeled separately.</p><form data-walkthrough-base><label>Base statistics<textarea data-walkthrough-base-values rows="12" placeholder="Waiting for a fresh No Equipment reading…"></textarea></label><p data-walkthrough-base-age class="settings-helper"></p><button class="primary-button">Use these base stats and continue</button></form>${captureOptions()}`;
            else if(flow.step==='slots')host.innerHTML=`<h3>Confirm ANY and ambiguous slots</h3><p>Check your equipment layout below. Choose a slot for each remaining item, or leave it in inventory. ANY-slot placement stays your choice.</p><div data-walkthrough-slot-choices></div><button class="primary-button" data-walkthrough-next>Confirm slots and review snapshot</button>`;
            else if(flow.step==='review')host.innerHTML=`<h3>Your character is ready to review</h3><p>Equipped estimates now update from the base reading and your assigned gear. No second equipped-stat capture is needed. Check the layout and values below, then preview your snapshot.</p><button class="primary-button" data-character-preview>Preview and save snapshot</button><p class="settings-helper">Reading remains active until you copy or save the snapshot, or cancel the walkthrough. Unsupported server formulas are labeled rather than guessed.</p>`;
            else host.innerHTML='<h3>Snapshot saved</h3><p>Your Character capture is complete. The gear and base values stay saved locally.</p><button class="primary-button" data-walkthrough-new>Start another snapshot</button>';
        }
        if(flow.step==='source'){
            const select=$('[data-walkthrough-source-select]',characterRoot),previous=select.value||flow.sourceId;
            const html='<option value="">Choose a window or display</option>'+sources.map(s=>`<option value="${escape(s.id)}">${escape(s.name)} (${escape(s.type)})</option>`).join('');
            if(select.innerHTML!==html)select.innerHTML=html;
            select.value=sources.some(s=>s.id===previous)?previous:sources.find(s=>s.recommended===true)?.id||'';
        }
        if(flow.step==='base'){
            const area=$('[data-walkthrough-base-values]',characterRoot),proposal=lastStats&&acceptsBaseRead(lastStats)?lastStats:null;
            if(flow.baseDirty){if(area.value!==flow.baseDraft)area.value=flow.baseDraft;}
            else if(proposal&&proposal.id!==baseProposalId&&document.activeElement!==area){area.value=Object.entries(characterObservationInput(proposal).stats).map(([k,v])=>`${characterStatLabel(k)}: ${v??'?'}`).join('\n');baseProposalId=proposal.id;}
            else if(!proposal&&baseProposalId){area.value='';baseProposalId='';}
            $('[data-walkthrough-base-age]',characterRoot).textContent=flow.baseDirty?'Your edits are retained. New readings will not overwrite them.':proposal?'Fresh No Equipment reading. Edit a value if needed; ? keeps it unknown.':'Waiting for a reading taken after you confirmed every item is off. You can also enter the values yourself.';
        }
        if(['unequip','reequip'].includes(flow.step)){$('[data-walkthrough-count]',characterRoot).textContent=`${flow.items.length} item cards captured · ${character.totals().assignedCount} slots assigned`;const queued=Math.max(0,Number(captureState.queuedFrames)||0),running=captureState.owner==='character'&&captureState.sessionId===flow.sessionId&&captureState.phase==='running';$('[data-walkthrough-reading]',characterRoot).textContent=!running?'Screen reading is paused. Resume capture to read item tooltips.':captureState.reading?`Reading a captured frame${queued?` · ${queued} waiting`:''}. Wait for each item card before moving on.`:queued?`${queued} captured frames waiting to be read. Wait for each item card before moving on.`:captureState.lastReadAt&&captureState.lastReadItemCount===0?'The last frame had no readable item tooltip. Hover over an item and keep its complete tooltip visible.':'Waiting for a readable item tooltip. Keep it visible until its card appears.';}
        if(flow.step==='slots')renderWalkthroughSlots();else walkthroughSlotsPending=false;
        const ownerMatches=captureState.owner==='character'&&captureState.sessionId===flow.sessionId;
        const readingStatus=['slots','review'].includes(flow.step)?'Reading continues. You can still hover over missing items here. Keep each tooltip visible until its card appears; earlier queued reads can finish too.':'Reading continues';
        const status=!flow.active?'':ownerMatches?[captureState.phase==='running'?readingStatus:`Capture ${captureState.phase}`,captureState.readWarning||captureState.error||''].filter(Boolean).join(' · '):'Capture is not running for this walkthrough. Select the game window to resume.';
        const statusHost=$('[data-walkthrough-status]',characterRoot);statusHost.textContent=[walkthroughMessage,status].filter(Boolean).join(' · ');
        if(flow.active&&CHARACTER_ITEM_READ_STEPS.includes(flow.step)&&flow.ignored.length)statusHost.insertAdjacentHTML('beforeend',' <button class="text-button" data-character-rescan>Rescan removed items</button>');
        if(flow.active&&flow.step!=='details'&&flow.step!=='source'&&(!ownerMatches||captureState.phase!=='running'))statusHost.insertAdjacentHTML('beforeend',' <button class="secondary-button" data-walkthrough-resume>Resume capture</button> <button class="text-button" data-walkthrough-source>Choose game window</button>');
        $('[data-walkthrough-back]',characterRoot).hidden=!flow.active||flow.step==='details';
        $('[data-character-stop]',characterRoot).hidden=!flow.active;
        if(['unequip','reequip','slots','review'].includes(flow.step))$('[data-character-workbench]',characterRoot).open=true;
    }
    function renderWalkthroughSlots(){const flow=walkthrough.snapshot(),snapshot=character.snapshot(),host=$('[data-walkthrough-slot-choices]',characterRoot);if(!host)return;
        const cards=flow.items.map(item=>snapshot.candidates.find(c=>c.id===item.id)).filter(Boolean),pending=cards.filter(c=>c.slots.includes('ANY')||!Object.values(snapshot.equipment).includes(c.id));
        const html=pending.map(card=>{const assigned=Object.entries(snapshot.equipment).find(([,id])=>id===card.id)?.[0],known=characterEquipmentEligibility(card).canEquip,value=flow.slotChoices[card.id]||assigned||'';
            if(!known)return `<label class="character-slot-unmatched">${escape(characterItemLabel(card))}<span>Match needed before equipping</span><select data-walkthrough-slot="${escape(card.id)}"><option value="__skip__">Leave in inventory until matched</option></select><button class="text-button" data-edit-card="${escape(card.id)}">Choose wiki match</button></label>`;
            return `<label>${escape(characterItemLabel(card))}<select data-walkthrough-slot="${escape(card.id)}"><option value="">Choose a slot</option>${CHARACTER_SLOTS.filter(slot=>characterSlotCompatibility(card,slot.id).compatible).map(slot=>`<option value="${slot.id}" ${value===slot.id?'selected':''}>${escape(slot.label)}${snapshot.equipment[slot.id]&&snapshot.equipment[slot.id]!==card.id?' · occupied':''}</option>`).join('')}<option value="__skip__" ${value==='__skip__'?'selected':''}>Leave in inventory</option></select></label>`;
        }).join('')||'<p>Every captured item has an obvious slot. Review the equipment layout, then continue.</p>';
        if(host.innerHTML!==html){if(host.contains(document.activeElement)){walkthroughSlotsPending=true;return;}host.innerHTML=html;}walkthroughSlotsPending=false;
    }
    async function finishWalkthrough(flowAtSave,epochAtSave){const current=walkthrough.snapshot();if(!flowAtSave?.active||flowAtSave.step!=='review'||!current.active||current.sessionId!==flowAtSave.sessionId||walkthroughEpoch!==epochAtSave)return;await stopCapture('character');const after=walkthrough.snapshot();if(after.active&&after.step==='review'&&after.sessionId===flowAtSave.sessionId&&walkthroughEpoch===epochAtSave){walkthrough.complete();walkthroughEpoch++;sourceStart=null;walkthroughMessage='Snapshot saved. Character reading has ended.';renderWalkthrough(true);}}
    function seedProfile(){if(profileSeeded)return;const profile=getProfile();if(profile.character||profile.name){character.setMetadata({name:profile.character||profile.name,classes:profile.classes||[],level:profile.level||null});profileSeeded=true;}}
    function reconcileCharacterCatalog(){
        const pack=getPack(),version=pack.meta?.manifestVersion||pack.meta?.version||'';
        if(!Array.isArray(pack.items)||!pack.items.length||pack.meta?.sample===true||catalogPackItems===pack.items&&catalogVersion===version)return;
        catalogPackItems=pack.items;catalogVersion=version;
        const remembered=new Set(walkthrough.snapshot().items.map(item=>item.id));
        character.reconcileCatalog(card=>{const result=resolveCharacterCatalog(pack,card.name);return {...result,icon:result.item?pack.icons?.[result.item.iconId]:undefined};});
        for(const card of character.snapshot().candidates)if(remembered.has(card.id))walkthrough.rememberItem(card);
    }
    function renderCharacterSelect(){
        const select=$('[data-character-select]',characterRoot),options=profiles.list().sort((a,b)=>a.name.localeCompare(b.name)||a.server.localeCompare(b.server));
        const html=options.map(profile=>`<option value="${escape(profile.id)}">${escape(profile.name)} (${escape(profile.server)})</option>`).join('')+'<option value="__new__">New character…</option>';
        if(select.innerHTML!==html)select.innerHTML=html;select.value=profiles.activeId()||'__new__';select.disabled=publishing||busy;
    }
    async function selectCharacter(id){
        if((profiles.activeId()||'__new__')===id)return;
        const epoch=++walkthroughEpoch;sourceListEpoch++;sourceStart=null;manualItemRead=null;lastStats=null;lastStatsManualRead=null;offlineCharacterSessionId='';closeArea();
        if(capture&&captureState.owner==='character')await stopCapture('character');
        if(disposed||epoch!==walkthroughEpoch)return;
        const result=id==='__new__'?profiles.newCharacter():profiles.select(id);if(!result.ok)throw Error(result.error);
        character=createCharacterModel({storage:profiles.storage,onWarning:warning});walkthrough=createCharacterWalkthrough({storage:profiles.storage,onWarning:warning});
        profileSeeded=Boolean(character.snapshot().metadata.name);catalogPackItems=null;catalogVersion='';selectedCard='';matchResults=[];matchCardId='';baseProposalId='';walkthroughStageKey='';walkthroughMessage='';shareImage=null;uploadId=null;dragId='';paintDragTargets('');hideItemTooltip();
        renderCharacter();renderCapture();if(walkthrough.snapshot().active)walkthroughMessage='Character selected. Resume reading when you are ready.';renderWalkthrough(true);
    }
    function renderCharacter({preserveEditor=false,preserveSlots=false,preserveStats=false}={}){
        characterRefreshPending=preserveEditor||preserveSlots||preserveStats;renderCharacterSelect();seedProfile();reconcileCharacterCatalog();renderWalkthrough();
        const snapshot=character.snapshot(),form=$('[data-character-metadata]',characterRoot);
        if(form)for(const [key,value]of Object.entries(snapshot.metadata)){const input=form.elements.namedItem(key);if(input&&document.activeElement!==input)input.value=Array.isArray(value)?value.join(' / '):value??'';}
        $('[data-character-identity]',characterRoot).innerHTML=characterIdentityMarkup(snapshot.metadata);
        const totals=character.totals();$('[data-character-stat-summary]',characterRoot).innerHTML=characterStatSummaryMarkup(totals);
        if(!preserveSlots&&!dragId)$('[data-character-slots]',characterRoot).innerHTML=characterEquipmentMarkup(snapshot);
        const loose=characterLooseCandidates(snapshot);if(!dragId)$('[data-character-inventory]',characterRoot).innerHTML=characterLooseInventoryMarkup(loose,selectedCard);
        $('[data-character-inventory-count]',characterRoot).textContent=`${snapshot.candidates.length} saved · ${totals.assignedCount} equipped · ${loose.length} loose`;
        characterRoot.querySelectorAll('[data-edit-card]').forEach(button=>{
            button.onclick=()=>{selectedCard=button.dataset.editCard;renderCharacterEditor();};
            button.ondragstart=event=>{dragId=button.dataset.editCard;event.dataTransfer.setData('text/plain',dragId);event.dataTransfer.effectAllowed='move';hideItemTooltip();paintDragTargets(dragId);};
            button.ondragend=()=>{const active=Boolean(dragId);dragId='';paintDragTargets('');if(active)renderCharacter({preserveEditor:$('[data-character-editor]',characterRoot).contains(document.activeElement)});};
        });
        characterRoot.querySelectorAll('[data-slot-id]').forEach(slot=>{
            const empty=slot.querySelector('[data-equip-slot]');if(empty)empty.onclick=()=>openEquipmentPicker(slot.dataset.slotId);
            slot.ondragover=event=>{if(dragId&&slot.dataset.dropValid==='true'){event.preventDefault();event.dataTransfer.dropEffect='move';}else if(event.dataTransfer)event.dataTransfer.dropEffect='none';};
            slot.ondrop=event=>{event.preventDefault();const id=dragId;dragId='';paintDragTargets('');if(id)assign(id,slot.dataset.slotId,slot);};
        });
        characterRoot.querySelectorAll('[data-unequip-slot]').forEach(button=>{button.onclick=()=>{if(publishing)return;const id=character.snapshot().equipment[button.dataset.unequipSlot];if(id)unequipItem(id);};});
        if(!preserveStats)$('[data-character-stats]',characterRoot).innerHTML=`<form data-stat-form="base"><label>Base values<textarea name="stats" rows="10">${escape(statText(snapshot.statSnapshots.base?.stats))}</textarea></label><button class="secondary-button">Save base stats</button></form>`;
        const baseForm=$('[data-stat-form="base"]',characterRoot);baseForm.onsubmit=event=>{event.preventDefault();try{character.setStatSnapshot('base',{stats:parseEditedStats(baseForm.elements.stats.value),confirmed:true,at:Date.now()});shareImage=null;renderCharacter();notify('Base statistics saved.',{tone:'success'});}catch(error){warning(error.message);}};
        if(!preserveEditor)renderCharacterEditor();renderStatProposal();if(dragId)paintDragTargets(dragId);
    }
    function paintDragTargets(id){
        const card=character.snapshot().candidates.find(card=>card.id===id),eligible=card&&characterEquipmentEligibility(card).canEquip;
        characterRoot.querySelectorAll('[data-slot-id]').forEach(slot=>{const valid=Boolean(eligible&&characterSlotCompatibility(card,slot.dataset.slotId).compatible);slot.classList.toggle('is-valid-drop',Boolean(id)&&valid);slot.classList.toggle('is-invalid-drop',Boolean(id)&&!valid);if(id)slot.dataset.dropValid=String(valid);else delete slot.dataset.dropValid;});
        const equipped=Boolean(id)&&Object.values(character.snapshot().equipment).includes(id),bags=$('.character-bags',characterRoot);bags.classList.toggle('is-unequip-target',equipped);bags.dataset.dropUnequip=String(equipped);
        const status=$('[data-character-placement-status]',characterRoot);if(id){status.dataset.dragHint='true';status.textContent=equipped?'Drop into Inventory to unequip, or into a highlighted slot to move.':eligible?'Drop into a highlighted slot. Occupied slots ask before replacement.':'Choose a wiki match before equipping this item.';}else if(status.dataset.dragHint){status.replaceChildren();delete status.dataset.dragHint;}
    }
    function unequipItem(id){
        if(publishing||!Object.values(character.snapshot().equipment).includes(id))return;
        for(const [slot,assigned]of Object.entries(character.snapshot().equipment))if(assigned===id)character.unassign(slot);
        if(walkthrough.snapshot().active)walkthrough.chooseSlot(id,'__skip__');
        selectedCard=id;shareImage=null;hideItemTooltip();renderCharacter();
    }
    function assign(id,slotId,element,confirmed=false){
        if(!id){const prior=character.snapshot().equipment[slotId];if(prior)unequipItem(prior);return;}
        const result=character.assign(id,slotId,{replace:confirmed});
        const status=$('[data-character-placement-status]',characterRoot);status.replaceChildren();
        if(result.ok){if(walkthrough.snapshot().active)walkthrough.chooseSlot(id,slotId);shareImage=null;hideItemTooltip();renderCharacter();}
        else if(result.needsConfirmation){status.innerHTML=`<span class="capture-warning">${escape(result.error)}</span><button class="secondary-button" type="button">Confirm placement</button>`;status.querySelector('button').onclick=()=>assign(id,slotId,element,true);}
        else warning(result.error);
    }
    function hideItemTooltip(){clearTimeout(tooltipTimer);itemTooltip.hidden=true;}
    function deferHideItemTooltip(){clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{if(!itemTooltip.matches(':hover')&&!itemTooltip.contains(document.activeElement))hideItemTooltip();},220);}
    function showItemTooltip(button){
        clearTimeout(tooltipTimer);
        const card=character.snapshot().candidates.find(card=>card.id===button.dataset.editCard);if(!card)return hideItemTooltip();
        itemTooltip.innerHTML=characterItemTooltipMarkup(card);itemTooltip.hidden=false;
        const rect=button.getBoundingClientRect(),size=itemTooltip.getBoundingClientRect(),viewport=document.defaultView;
        itemTooltip.style.left=`${Math.max(8,Math.min(viewport.innerWidth-size.width-8,rect.right+12+size.width<viewport.innerWidth?rect.right+12:rect.left-size.width-12))}px`;
        itemTooltip.style.top=`${Math.max(8,Math.min(viewport.innerHeight-size.height-8,rect.top))}px`;
    }
    function commitSocketChange(result,id){
        if(!result.ok)return warning(result.error);
        if(walkthrough.snapshot().active)walkthrough.rememberItem(result.candidate);
        selectedCard=id;shareImage=null;hideItemTooltip();renderCharacter();
    }
    function openAugmentPicker(id,index=null){
        if(publishing)return;
        const card=character.snapshot().candidates.find(item=>item.id===id);if(!card)return;
        hideItemTooltip();augmentCatalog?.dispose();augmentCatalog=null;augmentDialog.onpaste=null;
        const epoch=walkthroughEpoch,activeId=profiles.activeId(),picker=++pickerEpoch;
        const current=()=>!disposed&&augmentDialog.open&&picker===pickerEpoch&&epoch===walkthroughEpoch&&activeId===profiles.activeId()&&character.snapshot().candidates.some(item=>item.id===id);
        augmentDialog.innerHTML=`<div class="panel-heading"><h2>${index===null?'Augment slots':`Augment slot ${index+1}`} · ${escape(characterItemLabel(card))}</h2><button type="button" class="text-button" data-augment-close>Close</button></div>${index===null?`<form data-augment-capacity-form><label>Number of augment slots<input name="capacity" type="number" min="0" max="8" step="1" value="${card.augmentSlots??''}" required></label><button class="primary-button">Save slots</button></form>`:'<section data-augment-catalog></section>'}`;
        augmentDialog.querySelector('[data-augment-close]').onclick=()=>augmentDialog.close();
        if(index===null){augmentDialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(!current())return augmentDialog.close();const result=character.setAugmentSlots(id,Number(event.target.elements.capacity.value));if(result.ok){augmentDialog.close();commitSocketChange(result,id);}else warning(result.error);};}
        else{
            augmentCatalog=mountCharacterCatalog({host:augmentDialog.querySelector('[data-augment-catalog]'),getPack,onAdd(input){
                if(!current()||publishing)return{ok:false,error:'The selected character or item changed. Open its augment slot again.'};
                const result=character.setAugment(id,index,input.item);
                if(result.ok){augmentDialog.close();commitSocketChange(result,id);}return result;
            },purpose:'augment'});
        }
        augmentDialog.showModal();(augmentDialog.querySelector('input[type=search]')||augmentDialog.querySelector('input'))?.focus();
    }
    function openEquipmentPicker(slotId){
        if(publishing)return;const slot=CHARACTER_SLOTS.find(slot=>slot.id===slotId);if(!slot)return;
        hideItemTooltip();augmentCatalog?.dispose();augmentCatalog=null;augmentDialog.onpaste=null;
        const epoch=walkthroughEpoch,activeId=profiles.activeId(),picker=++pickerEpoch,current=()=>!disposed&&augmentDialog.open&&picker===pickerEpoch&&epoch===walkthroughEpoch&&activeId===profiles.activeId();
        augmentDialog.innerHTML=`<div class="panel-heading"><h2>Add item · ${escape(slot.label)}</h2><button type="button" class="text-button" data-augment-close>Close</button></div><div class="capture-actions"><button type="button" class="secondary-button" data-equipment-paste>Paste screenshot</button><button type="button" class="text-button" data-equipment-file>Read screenshot file</button></div><p class="settings-helper">Search your wiki database and choose a tier, or copy an item tooltip screenshot and paste it here (Ctrl+V). Unmatched screen reads stay in Inventory until you choose their wiki match.</p><p data-equipment-read-status role="status"></p><section data-equipment-catalog></section>`;
        augmentDialog.querySelector('[data-augment-close]').onclick=()=>augmentDialog.close();
        const pack=getPack(),items=slot.universal?pack.items:(pack.items||[]).filter(item=>{try{return characterSlotCompatibility(characterCatalogCard(item),slotId).compatible;}catch{return false;}});
        augmentCatalog=mountCharacterCatalog({host:augmentDialog.querySelector('[data-equipment-catalog]'),getPack:()=>({...getPack(),items}),purpose:'equipment',onAdd(input){
            if(!current()||publishing)return{ok:false,error:'The selected character changed. Open the equipment slot again.'};
            const result=character.intake(input);if(!result.ok)return result;
            if(walkthrough.snapshot().active)walkthrough.rememberItem(result.candidate);
            const placement=character.assign(result.candidate.id,slotId);if(placement.ok&&walkthrough.snapshot().active)walkthrough.chooseSlot(result.candidate.id,slotId);
            augmentDialog.close();selectedCard=result.candidate.id;shareImage=null;renderCharacter();if(!placement.ok)warning(placement.error+' The new item is in Inventory.');return result;
        }});
        let reading=false;const read=async source=>{
            if(reading||!current()||!augmentDialog.open)return;reading=true;
            const status=augmentDialog.querySelector('[data-equipment-read-status]');status.textContent='Reading item screenshot…';
            try{const result=await importScreenshot('character',{source,equipSlotId:slotId,isCurrent:current});if(!current())return;if(result?.records?.some(record=>record.subject?.kind==='item'))augmentDialog.close();else status.textContent=result?.cancelled?'Choose a screenshot or paste an image to continue.':result?.message||'No item tooltip was found. Try a clear screenshot of the complete tooltip.';}
            catch(error){status.textContent=error.message;}finally{reading=false;}
        };
        augmentDialog.querySelector('[data-equipment-paste]').onclick=()=>void read('clipboard');augmentDialog.querySelector('[data-equipment-file]').onclick=()=>void read('file');
        augmentDialog.onpaste=event=>{if([...event.clipboardData?.items||[]].some(item=>item.type.startsWith('image/'))){event.preventDefault();void read('clipboard');}};
        augmentDialog.showModal();augmentDialog.querySelector('input[type=search]')?.focus();
    }
    function socketClick(event){
        const pick=event.target.closest('[data-augment-pick]'),remove=event.target.closest('[data-augment-remove]'),setup=event.target.closest('[data-augment-configure]');
        if(publishing)return;
        if(pick){event.preventDefault();openAugmentPicker(pick.dataset.augmentPick,Number(pick.dataset.augmentIndex));}
        else if(remove){event.preventDefault();commitSocketChange(character.removeAugment(remove.dataset.augmentRemove,Number(remove.dataset.augmentIndex)),remove.dataset.augmentRemove);}
        else if(setup){event.preventDefault();openAugmentPicker(setup.dataset.augmentConfigure);}
    }
    listen(itemTooltip,'mouseenter',()=>clearTimeout(tooltipTimer));listen(itemTooltip,'mouseleave',deferHideItemTooltip);listen(itemTooltip,'focusout',deferHideItemTooltip);
    listen(itemTooltip,'click',socketClick);listen(characterRoot,'click',socketClick);
    function renderItemMatches(card,query=''){
        const host=$('[data-item-match-results]',characterRoot);if(!host)return;
        const pack=getPack(),resolution=resolveCharacterCatalog(pack,card.observedName||card.name);
        const search=query.trim()?searchCharacterCatalog(pack,query,{limit:12}):null;
        const fuzzy=query.trim()?resolveCharacterCatalog(pack,query,{limit:12}):resolution;
        matchResults=search?.items.length?search.items:fuzzy.candidates.map(candidate=>candidate.item);matchCardId=card.id;
        const unique=new Set();matchResults=matchResults.filter(item=>{const key=item.wikiTitle||item.name;if(unique.has(key))return false;unique.add(key);return true;}).slice(0,12);
        host.innerHTML=matchResults.map((item,index)=>{const icon=safeCharacterIcon(getPack().icons?.[item.iconId]);return `<button type="button" class="character-match-result" data-item-match-select="${index}">${icon?`<img src="${escape(icon)}" alt="">`:''}<span>${escape(item.name||item.wikiTitle)}<small>${escape((Array.isArray(item.slots)?item.slots:[]).join(' / '))}</small></span><span>Use match</span></button>`;}).join('')||'<p class="settings-helper">No matches in the current cache. Try another spelling or search for the item by name.</p>';
        host.querySelectorAll('[data-item-match-select]').forEach(button=>button.onclick=()=>{
            if(matchCardId!==selectedCard)return;const item=matchResults[Number(button.dataset.itemMatchSelect)];if(!item)return;
            const result=character.resolveCatalog(card.id,item,{match:'manual',icon:getPack().icons?.[item.iconId]});
            if(!result.ok)return warning(result.error);
            if(walkthrough.snapshot().active)walkthrough.rememberItem(result.candidate);
            shareImage=null;renderCharacter();notify(`Matched ${characterItemLabel(result.candidate)}.`,{tone:'success'});
        });
    }
    function renderCharacterEditor(){
        const card=character.snapshot().candidates.find(item=>item.id===selectedCard),host=$('[data-character-editor]',characterRoot);if(!card){host.replaceChildren();return;}
        host.innerHTML=`<div data-selected-item-title>${characterItemTitleMarkup(card)}</div>${characterTierControlsMarkup(card)}<div data-selected-item-stats>${characterItemStatBodyMarkup(card)}</div><details data-item-match-picker="${escape(card.id)}" class="character-item-match-picker" ${characterEquipmentEligibility(card).known?'':'open'}><summary>${characterEquipmentEligibility(card).known?'Change wiki match':'Choose a wiki match'}</summary><p class="${characterEquipmentEligibility(card).known?'settings-helper':'character-match-warning'}">${characterEquipmentEligibility(card).known?'Known wiki item. Choose a different match if needed.':'Choose the matching wiki item before equipping. Your captured values stay intact.'}</p><label>Find item match<input type="search" data-item-match-query placeholder="Search cached items" autocomplete="off"></label><div data-item-match-results></div></details><div class="capture-actions character-item-actions">${Object.values(character.snapshot().equipment).includes(card.id)?'<button type="button" class="secondary-button" data-card-unequip>Unequip</button>':characterEquipmentEligibility(card).canEquip?`<label>Equip to<select data-card-equip-slot>${CHARACTER_SLOTS.filter(slot=>characterSlotCompatibility(card,slot.id).compatible).map(slot=>`<option value="${slot.id}">${escape(slot.label)}</option>`).join('')}</select></label><button type="button" class="primary-button" data-card-equip>Equip</button>`:''}<button class="text-button" type="button" data-duplicate-card>Second copy</button><button class="text-button" type="button" data-remove-card>Remove item</button></div><details class="character-advanced-editor"><summary>Edit captured values</summary><form class="character-card-editor"><h3>Review ${escape(characterItemLabel(card))}</h3><div class="capture-form-grid"><label>Item name<input name="name" value="${escape(card.name)}" maxlength="240"></label><label>Compatible slots<input name="slots" value="${escape(card.slots.join(', '))}"></label><label>Required level<input name="level" type="number" min="0" max="125" value="${card.level??''}"></label></div><label>Written item stat block<textarea name="rawStatBlock" maxlength="8192" rows="8">${escape(card.rawStatBlock||statText(card.observedStats))}</textarea></label><p class="settings-helper">All captured item text is kept here. Correct an explicit number, including Haste %, then save to re-read that text. Unread or conflicting numbers stay unknown.</p><details><summary>Parsed values and augments</summary><label>Observed numeric values<textarea name="stats" rows="7">${escape(statText(card.observedStats))}</textarea></label><label>Stat block coverage<select name="complete"><option value="partial" ${!card.observedStatsComplete?'selected':''}>Partial / unread values remain unknown</option><option value="complete" ${card.observedStatsComplete?'selected':''}>I reviewed every numeric stat</option></select></label></details><details><summary>Wiki match and optional base values</summary><label>Wiki item title<input name="wikiTitle" value="${escape(card.wikiTitle)}" maxlength="240"></label><label>Wiki match<select name="wikiMatch"><option value="suggested" ${card.wikiMatch!=='confirmed'?'selected':''}>Suggested / needs review</option><option value="confirmed" ${card.wikiMatch==='confirmed'?'selected':''}>I verified this item match</option></select></label><p class="settings-helper">Captured examine values are retained when changing tiers.</p><label>Base item stats<textarea name="baseStats" rows="5">${escape(statText(card.baseStats))}</textarea></label><label>Base stat coverage<select name="baseComplete"><option value="partial" ${!card.baseStatsComplete?'selected':''}>Partial / unknown</option><option value="complete" ${card.baseStatsComplete?'selected':''}>All base values reviewed</option></select></label></details><div class="capture-actions"><button class="primary-button">Save item</button></div></form></details>`;
        const updateTierView=result=>{
            if(!result.ok)return warning(result.error);
            if(walkthrough.snapshot().active)walkthrough.rememberItem(result.candidate);
            shareImage=null;hideItemTooltip();renderCharacter({preserveEditor:true});
            const current=result.candidate,range=host.querySelector('[data-card-tier]');
            host.querySelector('[data-selected-item-title]').innerHTML=characterItemTitleMarkup(current);
            host.querySelector('[data-selected-item-stats]').innerHTML=characterItemStatBodyMarkup(current);
            range.value=current.tier??0;host.querySelector('[data-card-tier-value]').textContent=current.tier===null?'Unknown':`+${current.tier}`;

        };
        host.querySelector('[data-card-tier]').oninput=event=>{if(!publishing)updateTierView(character.setTierPreview(card.id,{tier:Number(event.target.value),fraction:0}));};
        host.querySelector('[data-card-tier-unknown]').onclick=()=>{if(!publishing)updateTierView(character.updateCandidate(card.id,{tier:null,fraction:null,statBasis:'observed',previewWarning:'Tier is unknown; captured values remain unchanged.'}));};
        const observedButton=host.querySelector('[data-card-observed-basis]');if(observedButton)observedButton.onclick=()=>{if(!publishing)updateTierView(character.setObservedBasis(card.id));};
        renderItemMatches(card);host.querySelector('[data-item-match-query]').oninput=event=>renderItemMatches(card,event.target.value);
        const unequip=host.querySelector('[data-card-unequip]');if(unequip)unequip.onclick=()=>unequipItem(card.id);
        const equip=host.querySelector('[data-card-equip]');if(equip)equip.onclick=()=>assign(card.id,host.querySelector('[data-card-equip-slot]').value,host);
        host.querySelector('form').onsubmit=event=>{event.preventDefault();if(publishing)return;try{
            const f=event.target;
            const raw=f.elements.rawStatBlock.value,rawChanged=raw!==(card.rawStatBlock||statText(card.observedStats)),parsed=rawChanged?parseItemStatBlock(raw):null;
            if(parsed?.warnings.some(message=>message.startsWith('Item stat text')))throw Error(parsed.warnings.join(' '));
            const latest=character.snapshot().candidates.find(item=>item.id===card.id);if(!latest)throw Error('This item was removed while its editor was open.');
            const editedStats=parseEditedStats(f.elements.stats.value),observedStats={...latest.observedStats};
            for(const key of new Set([...Object.keys(card.observedStats),...Object.keys(editedStats)]))if(!Object.is(card.observedStats[key],editedStats[key])){if(Object.hasOwn(editedStats,key))observedStats[key]=editedStats[key];else delete observedStats[key];}
            if(parsed){const before=parseItemStatBlock(card.rawStatBlock||statText(card.observedStats)),toStats=result=>characterObservationInput({fields:[...result.fields,...result.conflicts.map(key=>({key,value:null}))]}).stats,oldValues=toStats(before),newValues=toStats(parsed);
                for(const key of new Set([...Object.keys(oldValues),...Object.keys(newValues)]))if(!Object.is(oldValues[key],newValues[key]))observedStats[key]=Object.hasOwn(newValues,key)?newValues[key]:null;
            }
            const patch={name:f.elements.name.value,slots:f.elements.slots.value.split(',').map(value=>value.trim()).filter(Boolean),level:f.elements.level.value===''?null:Number(f.elements.level.value),observedStatsComplete:f.elements.complete.value==='complete',wikiTitle:f.elements.wikiTitle.value,wikiMatch:f.elements.wikiMatch.value,baseStats:parseEditedStats(f.elements.baseStats.value),baseStatsComplete:f.elements.baseComplete.value==='complete'};
            for(const key of Object.keys(patch))if(JSON.stringify(patch[key])===JSON.stringify(card[key]))delete patch[key];
            if(rawChanged)patch.rawStatBlock=raw;
            if(JSON.stringify(observedStats)!==JSON.stringify(latest.observedStats))patch.observedStats=observedStats;
            const result=character.updateCandidate(card.id,patch);
            if(!result.ok)throw Error(result.error);if(walkthrough.snapshot().active)walkthrough.rememberItem(result.candidate);shareImage=null;renderCharacter();if(parsed?.warnings.length)warning(parsed.warnings.join(' '));
        }catch(error){warning(error.message);}};
        host.querySelector('[data-duplicate-card]').onclick=()=>{if(publishing)return;const result=character.duplicateCandidate(card.id);if(!result.ok)return warning(result.error);if(walkthrough.snapshot().active){walkthrough.rememberItem(result.candidate);character.autoAssign(result.candidate.id);}selectedCard=result.candidate.id;shareImage=null;renderCharacter();};
        host.querySelector('[data-remove-card]').onclick=()=>{if(publishing)return;walkthrough.removeItem(card);character.removeCandidate(card.id);selectedCard='';shareImage=null;renderCharacter();};
    }
    function renderStatProposal(){const host=$('[data-stat-proposal]',characterRoot);if(walkthrough.snapshot().active||!lastStats){host.replaceChildren();return;}host.innerHTML=`<div class="capture-proposal"><h3>Latest screen read</h3><pre>${escape(statText(characterObservationInput(lastStats).stats))}</pre><p>Only use this reading as a baseline if all equipment was removed.</p><button class="secondary-button" data-accept-stat-proposal>Use as No Equipment baseline</button></div>`;host.querySelector('button').onclick=()=>{character.setStatSnapshot('base',{stats:characterObservationInput(lastStats).stats,evidence:lastStats,confirmed:true,at:Date.now()});lastStats=null;shareImage=null;renderCharacter();};}
    function intake(observation,{replaying=false}={}){
        if(disposed||!observation)return;cursor=Math.max(cursor,Number(observation.sequence)||0);
        if(observation.owner==='character'&&observation.subject?.kind==='item'){
            const flow=walkthrough.snapshot(),rawAdapted=characterObservationInput(observation),pack=getPack(),resolution=resolveCharacterCatalog(pack,rawAdapted.name),item=resolution.item,adapted=item?{...rawAdapted,name:characterBaseItemName(item.name||item.wikiTitle)}:rawAdapted,currentFlow=flow.active&&flow.sessionId===observation.sessionId;
            if(replaying&&observation.sessionId!==flow.sessionId){const known=character.lookupObservation(observation,{wikiItem:item,catalogMatch:resolution.status==='exact'?'exact':'fuzzy'});if(known.reason!=='reference'||known.status!=='match')return;}
            const manualRead=observation.kind==='manual'&&manualItemRead?.epoch===walkthroughEpoch&&manualItemRead.sessionId===observation.sessionId?manualItemRead:null;
            if(replaying&&(!walkthrough.acceptsReplayItem(observation)||flow.active&&flow.sessionId===observation.sessionId&&(walkthrough.ignores(rawAdapted,observation,{manualRead})||walkthrough.ignores(adapted,observation,{manualRead}))))return;
            if(!replaying&&(flow.active?(!walkthrough.acceptsItem(observation,{manualRead})||(walkthrough.ignores(rawAdapted,observation,{manualRead})||walkthrough.ignores(adapted,observation,{manualRead}))):!(manualRead?.eligible&&manualRead.inactive)))return;
            const options={wikiItem:item,catalogMatch:resolution.status==='exact'?'exact':'fuzzy',icon:item?pack.icons?.[item.iconId]:null};
            const accept=result=>{
                if(result.ok&&result.candidate){
                    if(currentFlow){const prior=walkthrough.snapshot(),remembered=prior.items.some(item=>item.id===result.candidate.id);walkthrough.rememberItem(result.candidate);const assignment=prior.slotChoices[result.candidate.id]==='__skip__'||remembered&&result.deduplicated?{assigned:false,reason:'manual-selection'}:character.autoAssign(result.candidate.id);walkthroughMessage=`Read ${characterItemLabel(result.candidate)}${!characterEquipmentEligibility(result.candidate).known?' · match needed before equipping':assignment.assigned?` → ${CHARACTER_SLOTS.find(s=>s.id===assignment.slot)?.label||assignment.slot}`:assignment.reason==='already-assigned'?' · updated':' · review its slot if needed'}.`;}
                    shareImage=null;
                    const preserveEditor=Boolean(dragId)||$('[data-character-editor]',characterRoot).contains(document.activeElement);if(!preserveEditor&&!result.deduplicated)selectedCard=result.candidate.id;
                    renderCharacter({preserveEditor,preserveSlots:Boolean(dragId)||$('[data-character-slots]',characterRoot).contains(document.activeElement),preserveStats:$('[data-character-stats]',characterRoot).contains(document.activeElement)});
                    if(!replaying&&!result.deduplicated)notify(`Captured ${characterItemLabel(result.candidate)}.`,{tone:'success'});
                }else if(!result.ok&&result.error&&!replaying)warning(result.error);
            };
            const result=character.intake(observation,options);
            if(result.ambiguous){
                if(replaying)return;
                walkthroughMessage='More than one saved copy matches this read. Choose which copy to update; no extra item was added.';renderWalkthrough();
                const status=$('[data-character-placement-status]',characterRoot),snapshot=character.snapshot(),epoch=walkthroughEpoch;
                status.innerHTML='<span class="capture-warning">Choose the existing copy to update:</span>'+result.choices.map((id,index)=>{const card=snapshot.candidates.find(card=>card.id===id),slot=Object.entries(snapshot.equipment).find(([,value])=>value===id)?.[0];return `<button type="button" class="secondary-button" data-ocr-copy-choice="${escape(id)}">${escape(characterItemLabel(card))} · ${escape(CHARACTER_SLOTS.find(value=>value.id===slot)?.label||`Loose copy ${index+1}`)}</button>`;}).join('');
                status.querySelectorAll('[data-ocr-copy-choice]').forEach(button=>button.onclick=()=>{
                    if(disposed||publishing||epoch!==walkthroughEpoch)return;
                    if(walkthrough.snapshot().active?!walkthrough.acceptsItem(observation,{manualRead}):!(manualRead?.eligible&&manualRead.inactive))return warning('This reading belongs to an earlier capture pass. Show the item again.');
                    const current=character.lookupObservation(observation,options),id=button.dataset.ocrCopyChoice;
                    if(!(current.status==='match'&&current.candidateId===id||current.status==='ambiguous'&&current.choices.includes(id))){status.replaceChildren();return warning('Those item copies changed. Show the item again before choosing a copy.');}
                    if(walkthrough.snapshot().active&&(walkthrough.ignores(rawAdapted,observation,{manualRead})||walkthrough.ignores(adapted,observation,{manualRead}))){status.replaceChildren();return warning('That item was removed during this pass. Use Rescan removed items for a fresh reading.');}
                    const resolved=character.mergeObservation(id,observation,options);status.replaceChildren();accept(resolved);
                });
                return;
            }
            accept(result);
        }else if(observation.owner==='character'&&observation.subject?.kind==='character'){
            if(walkthrough.snapshot().active){const token=manualItemRead?.epoch===walkthroughEpoch&&manualItemRead.sessionId===observation.sessionId?manualItemRead:null;if(!replaying&&acceptsBaseRead(observation,token)){lastStats=observation;lastStatsManualRead=observation.kind==='manual'?token:null;renderWalkthrough();}}
            else if(!replaying&&observation.kind==='manual'){
                const token=manualItemRead,at=Date.parse(observation.capturedAt||''),generation=token?.captureGeneration;
                if(token?.inactive&&!token.equipSlotId&&token.eligible&&token.epoch===walkthroughEpoch&&token.sessionId===observation.sessionId&&Number.isFinite(at)&&at>=token.at&&at<=Date.now()&&Number.isSafeInteger(generation)&&generation>=0&&observation.input?.captureGeneration===generation+1&&[generation,generation+1].includes(captureState.generation)&&token.captureSourceId===(captureState.source?.id||null)&&token.captureSessionId===(captureState.sessionId||'')){lastStats=observation;renderStatProposal();}
            }
        }else{const candidate=queue.consume(observation);if(candidate){if(!selectedId)selectedId=candidate.id;renderQueue();if(!root.contains(document.activeElement))renderCandidate();}}
    }
    async function replay(){if(!capture)return;const epoch=walkthroughEpoch;let after=0;for(let page=0;page<30&&!disposed;page++){const result=await capture.read({afterSequence:after,limit:200});if(disposed||epoch!==walkthroughEpoch)return;for(const record of result.records||[])intake(record,{replaying:true});const last=result.records?.at(-1)?.sequence;if(!last||last<=after||last>=result.lastSequence)break;after=last;}}
    async function preview(){
        const snapshot=character.snapshot(),sheet=buildCharacterWikiSheet(snapshot);
        shareImage=await renderCharacterShare(snapshot,{document,appearance:getAppearance(),resolveIcon:id=>getPack().icons?.[id]});shareSheet=sheet;uploadId=null;
        dialog.querySelector('[data-share-inspect]').innerHTML=characterInspectMarkup(sheet,{icons:getPack().icons});
        dialog.querySelector('[data-share-image]').src=shareImage.dataUrl;dialog.querySelector('[data-share-caption]').value='';dialog.querySelector('[data-share-confirm]').checked=false;
        dialog.querySelector('[data-share-upload]').disabled=false;dialog.querySelector('[data-share-upload]').textContent='Share on my User_talk page';
        shareStatus('Review your equipment, augments and totals. Raw OCR text and loose inventory stay private.');dialog.showModal();
    }
    async function uploadSnapshot(){
        if(!dialog.querySelector('[data-share-confirm]').checked)throw Error('Review your character and check the share confirmation first.');
        if(!shareImage||!shareSheet)throw Error('Create a fresh character inspect preview first.');
        await refreshAccount();if(!account?.authenticated)throw Error('Log in to the wiki in Contribute to Wiki first. Your character preview remains local.');
        if(!wiki.shareCharacter)throw Error('Restart Eye of Zomm to load interactive character sharing.');
        shareStatus('Checking wiki support and updating this character on your talk page.');setPublishing(true);
        try{
            const result=await wiki.shareCharacter({sheet:shareSheet,caption:dialog.querySelector('[data-share-caption]').value,confirmed:true,shareId:uploadId});uploadId=result.shareId||uploadId;
            const complete=result.status==='applied';
            shareStatus(complete?(result.reused?'This character sheet is already up to date.':'Your interactive character sheet is shared on your wiki talk page.'):'The wiki has not confirmed the character update'+(result.error?.message?': '+result.error.message:'.')+' Retry checks the existing sheet before editing again.',!complete);
            const host=dialog.querySelector('[data-share-status]'),link=document.createElement('a');link.textContent='Open my talk page';link.href='https://eqlwiki.com/'+encodeURIComponent('User_talk:'+account.user.name);link.target='_blank';link.rel='noopener';host.append(document.createTextNode(' · '),link);
            const button=dialog.querySelector('[data-share-upload]');button.textContent=complete?'Character shared':'Retry character update';button.disabled=complete;
            if(complete)await finishWalkthrough(walkthrough.snapshot(),walkthroughEpoch);
        }finally{setPublishing(false);}
    }
    listen(root,'click',event=>{const row=event.target.closest('[data-candidate-id]');if(row&&!publishing){saveCandidate();selectedId=row.dataset.candidateId;invalidatePlan();matches=null;renderQueue();renderCandidate();}});
    listen($('[data-add-contribution]'),'submit',event=>{event.preventDefault();if(publishing)return;const data=new FormData(event.target),candidate=queue.add({kind:data.get('kind'),name:data.get('name')},true);if(candidate){selectedId=candidate.id;invalidatePlan();event.target.reset();renderQueue();renderCandidate();}});
    listen($('[data-wiki-login]'),'click',()=>void act(async()=>{if(account?.authenticated)await wiki.logout();else await wiki.login();await refreshAccount();}));listen($('[data-wiki-refresh]'),'click',()=>void act(refreshAccount));
    listen($('[data-capture-opt-in]',settingsRoot),'change',event=>{optIn=event.target.checked;$('.capture-settings-controls',settingsRoot).hidden=!optIn;if(!optIn)void stopCapture().catch(error=>warning(error.message));});
    listen($('[data-capture-sources]',settingsRoot),'click',refreshSources);listen($('[data-capture-start]',settingsRoot),'click',()=>void act(()=>start('contribution')));listen($('[data-capture-stop]',settingsRoot),'click',()=>void stopCapture().catch(error=>warning(error.message)));listen($('[data-capture-pause]',settingsRoot),'click',()=>void act(async()=>{captureState=await (captureState.phase==='paused'?capture.resume():capture.pause());renderCapture();}));listen($('[data-capture-import]',settingsRoot),'click',()=>void act(()=>importScreenshot('contribution')));
    listen($('[data-capture-calibrate]',settingsRoot),'click',()=>void openArea());
    // A close event is queued by Chromium. It can belong to the previous modal
    // after the user has already opened a new preview or a new modal.
    listen(areaDialog,'close',()=>{if(!areaDialog.open&&!areaOpening)closeArea();});
    listen(areaDialog,'cancel',event=>{event.preventDefault();if(!areaSaving)closeArea();});
    listen(areaDialog.querySelector('[data-area-cancel]'),'click',closeArea);
    listen(areaDialog.querySelector('[data-area-form]'),'submit',event=>{event.preventDefault();void saveArea();});
    listen(areaDialog.querySelector('[data-area-full]'),'click',()=>void saveArea(true));
    for(const input of areaDialog.querySelectorAll('[data-area-percent]'))listen(input,'input',()=>{try{areaDraft=areaFromInputs();paintArea(false);areaDialog.querySelector('[data-area-status]').textContent='';}catch(error){areaDialog.querySelector('[data-area-status]').textContent=error.message;}});
    const stage=areaDialog.querySelector('[data-area-stage]');
    listen(stage,'pointerdown',event=>{if(event.button!==0||!areaPreview||areaSaving)return;event.preventDefault();areaDrag={id:event.pointerId,start:areaPoint(event)};stage.setPointerCapture(event.pointerId);dragArea(event);});
    listen(stage,'pointermove',dragArea);
    listen(stage,'pointerup',event=>{if(!areaDrag||event.pointerId!==areaDrag.id)return;dragArea(event);areaDrag=null;stage.releasePointerCapture(event.pointerId);if(!normalizeOcrArea(areaDraft))areaDialog.querySelector('[data-area-status]').textContent='Drag a non-empty rectangle or enter percentages.';});
    listen(stage,'pointercancel',()=>{areaDrag=null;});
    listen($('[data-character-select]',characterRoot),'change',event=>{const id=event.target.value;if(publishing||busy){renderCharacterSelect();return;}void act(()=>selectCharacter(id)).finally(renderCharacterSelect);});
    listen($('.character-bags',characterRoot),'dragover',event=>{if(dragId&&Object.values(character.snapshot().equipment).includes(dragId)){event.preventDefault();event.dataTransfer.dropEffect='move';}else if(event.dataTransfer)event.dataTransfer.dropEffect='none';});
    listen($('.character-bags',characterRoot),'drop',event=>{event.preventDefault();const id=dragId;dragId='';paintDragTargets('');if(id)unequipItem(id);});
    listen($('[data-character-add]',characterRoot),'click',()=>{if(publishing)return;const host=$('[data-character-catalog]',characterRoot),query=$('[data-character-catalog-query]',host);$('[data-character-workbench]',characterRoot).open=true;host.closest('details').open=true;query.focus({preventScroll:true});query.select();query.scrollIntoView({block:'center'});});
    listen(characterRoot,'submit',event=>{
        if(event.target.matches('[data-character-metadata]')){event.preventDefault();void act(async()=>{const data=new FormData(event.target),patch={name:data.get('name'),server:data.get('server'),race:data.get('race'),level:Number(data.get('level')),aaCount:Number(data.get('aaCount')),classes:String(data.get('classes')).split(/\s*[/,]\s*/).filter(Boolean)};
            if(!patch.name?.trim()||!patch.server?.trim()||!patch.classes.length||!Number.isInteger(patch.level)||patch.level<1||patch.level>125||!Number.isInteger(patch.aaCount)||patch.aaCount<0||patch.aaCount>1000000)throw Error('Enter character name, server, classes, level and AA count.');
            const registered=profiles.register(patch);if(!registered.ok)throw Error(registered.error);
            if(!walkthrough.snapshot().active){character.beginSnapshot(patch);walkthrough.begin();walkthroughEpoch++;}else character.setMetadata(patch);
            profileSeeded=true;shareImage=null;walkthrough.advance();walkthroughMessage='';renderCharacter();refreshSources();});
        }else if(event.target.matches('[data-walkthrough-base]')){event.preventDefault();void act(async()=>{const stats=parseEditedStats(event.target.querySelector('[data-walkthrough-base-values]').value);if(!Object.values(stats).some(Number.isFinite))throw Error('Read or enter your No Equipment values before continuing.');character.setStatSnapshot('base',{stats,confirmed:true,evidence:lastStats,at:Date.now()});walkthrough.acceptBase();walkthrough.advance();lastStats=null;baseProposalId='';shareImage=null;walkthroughMessage='Base values saved. Reading continues while you re-equip.';renderCharacter();});}
    });
    listen(characterRoot,'mouseover',event=>{const button=event.target.closest('[data-edit-card]');if(button&&!button.contains(event.relatedTarget))showItemTooltip(button);});
    listen(characterRoot,'mouseout',event=>{const button=event.target.closest('[data-edit-card]');if(button&&!button.contains(event.relatedTarget))deferHideItemTooltip();});
    listen(characterRoot,'focusin',event=>{const button=event.target.closest('[data-edit-card]');if(button)showItemTooltip(button);});
    listen(characterRoot,'focusout',deferHideItemTooltip);listen(characterRoot,'scroll',hideItemTooltip);listen(document,'keydown',event=>{if(event.key==='Escape')hideItemTooltip();});
    listen(characterRoot,'input',event=>{if(event.target.matches('[data-walkthrough-base-values]'))walkthrough.editBase(event.target.value);});
    listen(characterRoot,'focusout',()=>queueMicrotask(()=>{if(disposed||!characterRefreshPending&&!walkthroughSlotsPending)return;const protectedFocus=['[data-character-editor]','[data-character-slots]','[data-character-stats]','[data-walkthrough-slot-choices]'].some(selector=>$(selector,characterRoot)?.contains(document.activeElement));if(!protectedFocus)renderCharacter();}));
    listen(characterRoot,'change',event=>{if(event.target.matches('[data-walkthrough-source-select]'))walkthrough.source(event.target.value);if(event.target.matches('[data-walkthrough-slot]'))walkthrough.chooseSlot(event.target.dataset.walkthroughSlot,event.target.value);});
    listen(characterRoot,'click',event=>{const button=event.target.closest('button');if(!button||publishing)return;
        if(button.matches('[data-character-stop]')){walkthroughEpoch++;sourceListEpoch++;sourceStart=null;walkthrough.cancel();walkthroughMessage='Walkthrough canceled. Your captured items remain saved.';void stopCapture('character').catch(error=>warning(error.message));renderWalkthrough(true);}
        else if(button.matches('[data-walkthrough-back]')){sourceStart=null;walkthrough.back({sequence:cursor});lastStats=null;baseProposalId='';walkthroughMessage='';renderWalkthrough(true);}
        else if(button.matches('[data-walkthrough-new]')){walkthrough.cancel();walkthroughMessage='';renderWalkthrough(true);}
        else if(button.matches('[data-character-rescan]')){walkthrough.rescanItems();walkthroughMessage='Fresh reads can recover removed items now. Hover each complete tooltip and wait for its card.';renderWalkthrough(true);}
        else if(button.matches('[data-walkthrough-refresh-source]'))refreshSources();
        else if(button.matches('[data-walkthrough-start-source]'))void act(async()=>{const flow=walkthrough.snapshot(),sourceId=$('[data-walkthrough-source-select]',characterRoot).value;if(!sourceId)throw Error('Choose the game window first.');walkthrough.source(sourceId);sourceStart={epoch:walkthroughEpoch,sessionId:flow.sessionId,sourceId,at:Date.now()};try{await start('character',{sourceId,sessionId:flow.sessionId});}catch(error){sourceStart=null;throw error;}});
        else if(button.matches('[data-walkthrough-resume]'))void act(async()=>{const flow=walkthrough.snapshot(),epoch=walkthroughEpoch;if(captureState.owner==='character'&&captureState.sessionId===flow.sessionId&&(captureState.resumable||captureState.phase==='paused')){const next=await capture.resume();if(epoch===walkthroughEpoch){captureState=next;renderCapture();}}else{sourceStart=null;walkthrough.selectSource();renderWalkthrough(true);refreshSources();}});
        else if(button.matches('[data-walkthrough-source]')){sourceStart=null;walkthrough.selectSource();renderWalkthrough(true);refreshSources();}
        else if(button.matches('[data-walkthrough-calibrate]'))void openArea();
        else if(button.matches('[data-character-import]'))void act(()=>importScreenshot('character'));
        else if(button.matches('[data-character-preview]'))void act(preview);
        else if(button.matches('[data-walkthrough-next]'))void act(async()=>{const flow=walkthrough.snapshot();if(flow.step==='slots'){const snapshot=character.snapshot(),host=$('[data-walkthrough-slot-choices]',characterRoot);for(const select of host.querySelectorAll('[data-walkthrough-slot]')){const id=select.dataset.walkthroughSlot;if(!select.value)throw Error('Choose a slot or Leave in inventory for each remaining item.');if(select.value==='__skip__'){for(const [slot,assigned] of Object.entries(character.snapshot().equipment))if(assigned===id)character.unassign(slot);}else{const result=character.assign(id,select.value);if(!result.ok)throw Error(result.error);}walkthrough.chooseSlot(id,select.value);}}
            if(flow.step==='unequip'){lastStats=null;baseProposalId='';}walkthrough.advance({sequence:cursor});walkthroughMessage='';renderCharacter();});
        else if(button.matches('[data-inventory-remove]')){const card=character.snapshot().candidates.find(c=>c.id===button.dataset.inventoryRemove);if(card){walkthrough.removeItem(card);character.removeCandidate(card.id);if(selectedCard===card.id)selectedCard='';shareImage=null;renderCharacter();}}
        else if(button.matches('[data-inventory-copy]')){const result=character.duplicateCandidate(button.dataset.inventoryCopy);if(result.ok){if(walkthrough.snapshot().active){walkthrough.rememberItem(result.candidate);character.autoAssign(result.candidate.id);}shareImage=null;renderCharacter();}else warning(result.error);}
    });
    listen(dialog.querySelector('[data-share-close]'),'click',()=>{if(!publishing)dialog.close();});listen(dialog,'cancel',event=>{if(publishing)event.preventDefault();});listen(dialog.querySelector('[data-share-copy]'),'click',()=>void act(async()=>{if(!shareImage)throw Error('Preview a character image first.');const flow=walkthrough.snapshot(),epoch=walkthroughEpoch;await share.copyPng(shareImage.dataUrl);await finishWalkthrough(flow,epoch);shareStatus('Character PNG copied to your clipboard.');}));listen(dialog.querySelector('[data-share-save]'),'click',()=>void act(async()=>{if(!shareImage)throw Error('Preview a character image first.');const flow=walkthrough.snapshot(),epoch=walkthroughEpoch,result=await share.savePng(shareImage.dataUrl);if(result.ok)await finishWalkthrough(flow,epoch);shareStatus(result.ok?'Character PNG saved.':'Save canceled. Capture remains active.');}));listen(dialog.querySelector('[data-share-upload]'),'click',()=>void act(uploadSnapshot));
    if(capture){let statusRevision=0;unsubscribers.push(capture.onStatus(next=>{statusRevision++;captureState=next;renderCapture();}),capture.onObservation(intake));const revision=statusRevision;void capture.status().then(async next=>{if(disposed)return;if(revision===statusRevision){captureState=next;renderCapture();}await replay();}).catch(error=>{if(!disposed)warning(error.message);});}
    function loadWiki(){if(wikiLoaded||!wiki)return;wikiLoaded=true;void wiki.blueprints().then(blueprints=>{if(Array.isArray(blueprints.eras)&&blueprints.eras.length){eras=blueprints.eras;const select=$('[name=era]');if(select){const value=select.value;select.innerHTML='<option value="">Confirm era</option>'+eras.map(era=>`<option>${escape(era)}</option>`).join('');select.value=value;}}}).catch(()=>{});unsubscribers.push(wiki.onStatus?.(next=>{account=next;void refreshAccount().catch(()=>{});})||(()=>{}));void refreshAccount().catch(()=>{$('[data-account-status]').textContent='Wiki unavailable; local review remains saved.';});}
    renderQueue();renderCandidate();renderCharacter();renderCapture();
    return{consumeLog(event,context){if(!capture||!event||!['loot','kill','consider','zone','profile'].includes(event.type)||context.live!==true)return;void capture.observeLog({event,context}).catch(()=>{});},refresh(){if(root.closest('.view.is-active')||characterRoot.closest('.view.is-active'))loadWiki();characterCatalog.refresh();const wasSeeded=profileSeeded;seedProfile();if(!wasSeeded&&profileSeeded)renderCharacter();},dispose(){disposed=true;closeArea();itemBaseUi?.dispose();characterCatalog.dispose();augmentCatalog?.dispose();clearTimeout(tooltipTimer);unsubscribers.forEach(remove=>remove?.());areaDialog.remove();dialog.remove();augmentDialog.remove();itemTooltip.remove();}};
}
