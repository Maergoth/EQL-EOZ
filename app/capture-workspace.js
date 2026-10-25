import { mountContributionChoicePickers, readContributionChoicePicker } from './contribution-choice-picker.js';
import { createContributionQueue } from './contribution-queue.js';
import { createContributionIgnoreMatcher } from './contribution-ignore-identity.js';
import { contributionQueueControls } from './contribution-queue-controls.js';
import { createContributionDiscoveryGate } from './contribution-discovery-gate.js';
import { CHARACTER_SLOTS, createCharacterModel, characterObservationInput, characterSlotCompatibility, characterStatLabel, characterEquipmentEligibility, characterLooseCandidates, characterBaseItemName, safeCharacterIcon } from './character-model.js';
import { createCharacterProfiles } from './character-profiles.js';
import { createCharacterWalkthrough, CHARACTER_WALKTHROUGH_STEPS, CHARACTER_ITEM_READ_STEPS } from './character-walkthrough.js';
import { parseItemStatBlock } from './screen-read-parser.js';
import { renderCharacterShare } from './character-share.js';
import { buildCharacterWikiSheet } from './character-wiki-sheet.js';
import { characterInspectMarkup } from './character-inspect-view.js';
import { mountCharacterCatalog, resolveCharacterCatalog, resolveInventoryCatalog, searchCharacterCatalog, characterCatalogCard } from './character-catalog.js';
import { characterItemLabel, characterEquipmentMarkup, characterLooseInventoryMarkup, characterIdentityMarkup, characterStatSummaryMarkup, characterItemTooltipMarkup, characterItemTitleMarkup, characterItemStatBodyMarkup, characterTierControlsMarkup, updateCharacterItemTierMarkup } from './character-inventory-view.js';
import { applyItemBaseReview, isItemNumericStatLine } from './item-base-review.js';
import { mountItemBaseReview } from './item-base-review-ui.js';
import { parseInventoryExport } from './inventory-export.js';
import { buildWikiEntityCatalog } from './wiki-discovery.js';
import { contributionItemEffects } from './contribution-model.js';
import { contributionFieldMarkup, contributionLootMarkup, contributionMatchMarkup, contributionScreenshotMarkup, contributionMatchesMarkup, contributionDestinationHintsMarkup, contributionPublishReceiptMarkup, contributionPublishedPagesMarkup } from './contribution-editor.js';
import { contributionEvidenceMarkup, contributionRelationsMarkup } from './contribution-review-view.js';
import { CONTRIBUTION_FILTERS, contributionQueueInfo, visibleContributionQueue, contributionQueueCounts } from './contribution-presentation.js';
import { normalizeWikiIdentity, itemExaltationBaseIdentity, createWikiResolver } from './wiki-identity.js';
import { contributionUpdateSummary, contributionSourceIncluded } from './contribution-update.js';
import { mountWikiIconFinder } from './icon-finder.js';
import { contributionReaderMatches } from './contribution-reader.js';
import { createAutomaticItemContribution } from './automatic-item-contribution.js';
import { automaticSourceReceiptKey,automaticSourceDraftKeys,automaticSourceDraftComplete } from './automatic-source-results.js';
import { mountContributionHistory } from './contribution-history.js';
import { TOOLTIP_HOVER_DELAY_MS } from './tooltip-delay.js';
import {zoneCreationFields,zoneCreationMarkup,updateZoneCreationVisibility,ZONE_CREATION_FIELD_KEYS} from './zone-creation-view.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let eras=['Classic Era','Kunark Era','Velious Era'];
const statText=stats=>Object.entries(stats||{}).map(([key,value])=>`${characterStatLabel(key)}: ${value??'?'}`).join('\n');
const ITEM_CONTRIBUTION_STAT_LABELS={ac:'AC',hp:'HP',mana:'Mana',endurance:'Endurance',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',
    resistPoison:'SV Poison',resistMagic:'SV Magic',resistDisease:'SV Disease',resistFire:'SV Fire',resistCold:'SV Cold',resistCorruption:'SV Void',
    hpRegen:'HP Regen',manaRegen:'Mana Regen',enduranceRegen:'Endurance Regen',attackSpeed:'Attack Speed',requiredLevel:'Required Level',recommendedLevel:'Recommended Level',
    weight:'Weight',damage:'Damage',damageBonus:'Damage Bonus',delay:'Delay',attack:'Attack',haste:'Haste'};
export function withDefaultItemStatLines(fields={}){
    // SV Void's editable zero default is form text, not a manufactured OCR stat.
    // Explicit contributor text and confirmed values always take priority.
    const voidValue=fields.resistCorruption?.value,voidLine=`SV Void: ${typeof voidValue==='number'&&Number.isFinite(voidValue)?voidValue:0}`;
    if(Object.hasOwn(fields,'statLines')){
        const saved=fields.statLines;
        if(!saved||typeof saved!=='object'||saved.edited===true||saved.confirmed===true)return {...fields};
        const lines=Array.isArray(saved.value)?saved.value:typeof saved.value==='string'?saved.value.split(/\r?\n/):null;
        if(!lines||lines.some(line=>/^\s*(?:SV[._ ]*(?:Void|Corruption)|(?:Void|Corruption)[ _]*resist)\s*:/i.test(String(line))))return {...fields};
        const value=[...lines,voidLine];
        return {...fields,statLines:{...saved,value:Array.isArray(saved.value)?value:value.join('\n')}};
    }
    const value=Object.entries(ITEM_CONTRIBUTION_STAT_LABELS).flatMap(([key,label])=>{
        const number=fields[key]?.value;
        return typeof number==='number'&&Number.isFinite(number)?[`${label}: ${number}`]:[];
    });
    if(!value.some(line=>line.startsWith('SV Void:')))value.push(voidLine);
    return {...fields,statLines:{value,confirmed:false}};
}
export function contributionItemEvidenceMarkup(candidate,fields=candidate?.fields||{}){
    if(candidate?.kind!=='item')return '';
    return `<section class="contribution-item-evidence" aria-label="Item screenshot and icon">${contributionScreenshotMarkup(candidate)}${contributionFieldMarkup('iconId',fields.iconId||{value:'',confirmed:false},{kind:'item'})}</section>`;
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
    const result={},aliases={MANA:'MP',ENDURANCE:'END',ATTACK:'ATK',STRENGTH:'STR',STAMINA:'STA',AGILITY:'AGI',DEXTERITY:'DEX',WISDOM:'WIS',INTELLIGENCE:'INT',CHARISMA:'CHA',MITIGATION_AC:'AC_MITIGATION',AC_SOFTCAP:'AC_MITIGATION_SOFTCAP',EVASION_AC:'AC_EVASION',OFFENSE:'ATK_OFFENSE',ACCURACY:'ATK_ACCURACY',ACCURACY_BONUS:'ACCURACY',DAMAGE_BONUS:'DMG_BONUS'};
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
    capture=globalThis.eyeOfZommCapture,wiki=globalThis.eyeOfZommWiki,share=globalThis.eyeOfZommShare,inventory=globalThis.eyeOfZommInventory,navigate=()=>{},contributionStorage=storage,
    getPack=()=>({}),getProfile=()=>({}),getAppearance=()=>({}),notify=()=>{},onDiscoveryItem=()=>false,onDiscoveryLocation=()=>false,onDiscoveryCapture=()=>{}}={}){
    const root=document.getElementById('contribution-workspace'),characterRoot=document.getElementById('character-workspace'),settingsRoot=document.getElementById('capture-settings');
    if(!root||!characterRoot||!settingsRoot)return{consumeLog(){},refresh(){},dispose(){},beginDiscoveryContribution:async()=>({ok:false,error:'Contribute is unavailable.'}),cancelDiscoveryContribution:async()=>({ok:true})};
    let ignoreEntries=[],ignoreMatcher=null,ignoreMatcherPack=null,ignoreRevision=0,ignoreMatcherRevision=-1;
    function entityIgnored(target){const pack=getPack();if(!ignoreMatcher||ignoreMatcherPack!==pack||ignoreMatcherRevision!==ignoreRevision){ignoreMatcher=createContributionIgnoreMatcher(ignoreEntries,pack);ignoreMatcherPack=pack;ignoreMatcherRevision=ignoreRevision;}return ignoreMatcher(target);}
    const warning=message=>notify(message,{tone:'warning'}),queue=createContributionQueue({storage:contributionStorage,getPack,onWarning:warning,isIgnored:entityIgnored}),profiles=createCharacterProfiles({storage:characterStorage,onWarning:warning});
    let contributionResolverCache=null;
    function contributionResolver(){
        const pack=getPack(),key=[pack,pack.items,pack.npcs,pack.zones,pack.wikiEntities,pack.meta?.manifestVersion||pack.meta?.version,pack.meta?.wikiEntitiesComplete,pack.meta?.sample];
        if(!contributionResolverCache||key.some((value,index)=>value!==contributionResolverCache.key[index]))contributionResolverCache={key,value:createWikiResolver(pack)};
        return contributionResolverCache.value;
    }
    const manuallyEditedContributions=new Set(queue.snapshot().filter(candidate=>candidate.playerText||candidate.attachment||candidate.baseRecovery||Object.values(candidate.fields||{}).some(field=>field?.edited===true||field?.confirmed===true)||(candidate.sources||[]).some(source=>source.edited===true||source.confirmed===true)).map(candidate=>candidate.id));
    let character=createCharacterModel({storage:profiles.storage,onWarning:warning}),walkthrough=createCharacterWalkthrough({storage:profiles.storage,onWarning:warning});
    const $=(selector,base=root)=>base.querySelector(selector),unsubscribers=[];
    let itemBaseUi=null,contributionIcons=null,contributionChoices=null;
    let disposed=false,busy=false,publishing=false,selectedId=queue.snapshot()[0]?.id||'',selectedCard='',captureState={phase:'disabled'},sources=[],optIn=false,account=null,plan=null,matches=null,lastStats=null,shareImage=null,shareSheet=null,uploadId=null,dragId='',cursor=0;
    let walkthroughStageKey='',walkthroughEpoch=0,baseProposalId='',walkthroughMessage='',sourceStart=null,characterRefreshPending=false,walkthroughSlotsPending=false,sourceListEpoch=0,manualItemRead=null,lastStatsManualRead=null;
    let catalogPackItems=null,catalogVersion='',matchResults=[],matchCardId='';
    let profileSeeded=Boolean(character.snapshot().metadata.name),wikiLoaded=false,reviewEpoch=0,offlineCharacterSessionId='';
    let areaProfiles=[],areaPreview=null,areaDraft=null,areaEpoch=0,areaOpening=false,areaSaving=false,areaDrag=null;
    const filterKey='eql-eye-of-zomm-contribution-filters-v1';
    let enabledGaps=CONTRIBUTION_FILTERS.map(value=>value.key);
    try{const saved=JSON.parse(storage?.getItem(filterKey)||'null');if(Array.isArray(saved))enabledGaps=saved.filter(key=>CONTRIBUTION_FILTERS.some(filter=>filter.key===key));}catch{/* Optional browsing preferences never block drafts. */}
    let discoveryUiReady=false,spawnPromptEpoch=0;
    const discoveryChecksActive=()=>Boolean(characterRoot.closest('.view.is-active')||root.closest('.view.is-active')&&root.querySelector('#contribution-discoveries-panel')?.hidden!==true);
    const discoveryGate=createContributionDiscoveryGate({verify:typeof wiki?.verifyDiscovery==='function'?request=>wiki.verifyDiscovery(request):null,getPack,onChange(){
        if(disposed||!discoveryUiReady||publishing)return;
        const previous=selectedId,rows=queueRows();if(!rows.some(candidate=>candidate.id===selectedId)){selectedId=rows[0]?.id||'';matches=null;invalidatePlan();}
        renderQueue();if(previous!==selectedId||!root.contains(document.activeElement))renderCandidate();if(characterVisible())renderInventoryGaps();
    }});
    const visibleQueueCandidates=()=>{const candidates=queue.snapshot().filter(candidate=>candidate.status!=='submitted'&&!entityIgnored({kind:candidate.kind,name:candidate.title||candidate.name})),decisions=queue.sourceDecisionKeys(),resolver=contributionResolver();return candidates.filter(candidate=>!decisions.length||manuallyEditedContributions.has(candidate.id)||!automaticSourceDraftComplete(candidate,decisions,{pack:getPack(),resolver})).map(candidate=>discoveryGate.project(candidate,{request:discoveryChecksActive()})).filter(Boolean);};
    const queueRows=()=>visibleContributionQueue(visibleQueueCandidates(),enabledGaps);
    selectedId=queueRows()[0]?.id||'';
    let inventoryTimer=null,inventoryPolling=false,inventoryWatchEpoch=0,inventoryMessage='',statsStarting=false,spawnArmedId='',iconPage=0;
    const discoveryRequests=new Map();let discoveryCapture=null,discoveryStarting=null,discoverySourceId='',discoveryMessage='',captureStatusRevision=0;
    let contributionVisible=false,contributionReaderSuppressed=false,contributionEnteredAt=0,contributionEvidencePending=false,contributionIconCrop=null,contributionEvidenceEpoch=0,contributionTab='discoveries';
    const dismissedCaptureImages=new Set();
    let automaticContributions=null;
    function cancelAutomaticContribution(){contributionEvidenceEpoch++;automaticContributions?.cancel();}
    function markContributionEdited(){if(selectedId)manuallyEditedContributions.add(selectedId);cancelAutomaticContribution();}
    try{const raw=storage?.getItem(OCR_AREA_STORAGE_KEY);if(raw&&raw.length<=24000){const parsed=JSON.parse(raw);if(Array.isArray(parsed))areaProfiles=parsed.slice(-MAX_OCR_AREAS).filter(value=>typeof value?.key==='string'&&value.key.length<=1000&&validAreaProfile(value)).map(value=>({key:value.key,region:normalizeOcrArea(value.region),referenceSize:frameSize(value.referenceSize)}));}}catch{/* A damaged optional calibration must not block ordinary capture. */}
    root.innerHTML=`<header class="capture-toolbar contribution-heading"><div><h2>Contribute</h2><p>Review discoveries or view your saved wiki submissions.</p></div><div class="capture-actions contribution-account"><span data-account-status role="status">Not connected</span><button class="secondary-button" data-wiki-login>Log in to wiki</button><button class="text-button" data-wiki-refresh>Refresh account</button></div></header>
        <div class="contribution-layout"><aside class="panel contribution-sidebar"><h3>Discovery queue</h3><fieldset class="contribution-filters"><legend>Show gaps</legend><div data-contribution-filters></div></fieldset><p class="settings-helper" data-contribution-count role="status"></p><details class="contribution-manual"><summary>Add a page manually</summary><form data-add-contribution><label>Type<select name="kind"><option value="item">Item</option><option value="npc">Monster</option><option value="zone">Zone</option></select></label><label>Name<input name="name" required maxlength="230" placeholder="ex. Thornstinger"></label><button class="secondary-button">Add for review</button></form></details><div data-contribution-list></div></aside><article class="panel contribution-editor" data-contribution-editor></article></div><div class="panel wiki-review" data-wiki-review hidden></div>`;
    settingsRoot.innerHTML=`<h2>Screen reading</h2><label class="check-control"><input type="checkbox" data-capture-opt-in> Enable optional screen reading</label><p class="settings-helper">Screen reading currently requires the Default Modern (default_modern) game UI skin. Other skins are not yet calibrated. Logs supply kills, loot and zones. Screen reading supplies item tooltips, examine windows and visible character stats. It runs locally, without audio or video recording. Contribute reads about once per second when a configured or unique EverQuest window is available; otherwise choose its source there. Use Pause automatic reading to pause it.</p><div class="capture-settings-controls" hidden><label>Source<select data-capture-source aria-label="Capture source"><option value="">Choose a window or display</option></select></label><div class="capture-actions"><button class="secondary-button" data-capture-sources>Choose source</button><button class="primary-button" data-capture-start>Start contribution capture</button><button class="secondary-button" data-capture-pause>Pause</button><button class="secondary-button" data-capture-stop>Stop all capture</button><button class="secondary-button" data-capture-calibrate disabled>Calibrate OCR area</button><button class="text-button" data-capture-import>Read a screenshot</button></div></div><p data-capture-status class="settings-helper" role="status">Screen reading disabled.</p>`;
    characterRoot.innerHTML=`<div class="capture-toolbar panel"><div><label class="character-profile-select">Character Select<select data-character-select aria-label="Character Select"></select></label><p>Import your equipped items, read your displayed stats and share your character. Keep all your gear equipped.</p></div></div>
        <section class="panel character-walkthrough" aria-label="Character capture walkthrough"><ol data-walkthrough-steps></ol><div data-walkthrough-stage></div><p data-walkthrough-status role="status"></p><div class="capture-actions"><button class="text-button" data-walkthrough-back>Back</button><button class="text-button" data-character-stop>Cancel walkthrough</button></div></section><p data-character-status role="status"></p>
        <details class="character-workbench" data-character-workbench open><summary>Character inventory</summary><div class="character-sheet"><aside class="character-profile-panel"><div data-character-identity></div></aside><section class="character-equipment-panel"><div class="panel-heading"><h3>Equipment</h3><button class="text-button" data-character-reimport>Import inventory</button></div><p class="settings-helper">Equipment comes from your inventory export. You can still adjust your saved layout here.</p><div class="character-slots" data-character-slots aria-label="Equipment slots"></div><div class="capture-actions" data-character-placement-status role="status"></div></section><section class="character-totals-panel"><div class="character-mini-stats" data-character-stat-summary></div><p class="character-estimate-note">Recorded game stats · ? unread. Changing saved items does not recalculate these values.</p></section></div><section class="character-bags"><div class="panel-heading"><h3>Inventory <small data-character-inventory-count></small></h3><div class="capture-actions"><button class="text-button" data-character-add>Add item</button><button class="character-clear-inventory" data-character-clear>Clear inventory</button></div></div><p class="settings-helper">Items from your export stay saved. Missing wiki entries can be submitted through Contribute; their exported slots stay empty.</p><div class="character-inventory" data-character-inventory data-loose-inventory aria-label="Loose inventory"></div></section><section class="character-selection" data-character-editor aria-label="Selected item"></section>
        <details class="panel"><summary>Search the wiki item catalog</summary><section class="character-catalog" data-character-catalog aria-label="Character item catalog"></section></details>
        <section class="panel" data-character-wiki-gaps></section><details class="panel character-stats"><summary>Review recorded game stats</summary><div data-stat-proposal></div><div data-character-stats></div></details><button class="secondary-button" data-character-preview>Preview current snapshot</button></details>`;
    const dialog=document.createElement('dialog');dialog.className='character-share-dialog';dialog.setAttribute('aria-label','Review character snapshot');dialog.innerHTML='<div class="panel-heading"><h2>Review character inspect</h2><button class="text-button" data-share-close>Close</button></div><p>Your wiki sheet opens collapsed under Character (Server). Sharing again replaces that character’s previous sheet. Hover or focus gear to inspect it; click an item to open its wiki page.</p><section data-share-inspect></section><details><summary>PNG export preview</summary><img data-share-image alt="Character equipment and total statistics"></details><div class="capture-actions"><button class="primary-button" data-share-copy>Copy PNG</button><button class="secondary-button" data-share-save>Save PNG</button></div><label>Caption<textarea data-share-caption maxlength="1000" rows="2"></textarea></label><button class="secondary-button" data-share-upload>Share on my User page</button><p data-share-status role="status"></p>';document.body.append(dialog);
    const areaDialog=document.createElement('dialog');areaDialog.className='ocr-area-dialog';areaDialog.setAttribute('aria-labelledby','ocr-area-title');areaDialog.innerHTML=`<h2 id="ocr-area-title">Calibrate OCR area</h2><p data-area-source></p><p>Select the complete item tooltip, examine window or Inventory/stat pane, including its item name or heading, metadata and footer. Keep it visible until an editable proposal appears. Drag over the pane, or enter its percentages below. Only this area will be read. The preview is the last frame from your selected source; it is never saved.</p><div class="ocr-area-stage" data-area-stage><img data-area-image alt="Last frame from the current capture source" draggable="false"><div class="ocr-area-selection" data-area-selection></div></div><form data-area-form><fieldset><legend>Area as a percentage of the full frame</legend><div class="ocr-area-fields">${[['x','Left'],['y','Top'],['width','Width'],['height','Height']].map(([key,label])=>`<label>${label} (%)<input data-area-percent="${key}" name="${key}" type="number" min="${key==='width'||key==='height'?'0.1':'0'}" max="100" step="0.1" required></label>`).join('')}</div></fieldset><p data-area-status role="status"></p><div class="capture-actions"><button class="primary-button" type="submit" data-area-save>Save area</button><button class="secondary-button" type="button" data-area-full>Full frame</button><button class="text-button" type="button" data-area-cancel>Cancel</button></div></form>`;document.body.append(areaDialog);
    const itemTooltip=document.createElement('aside');itemTooltip.className='character-item-tooltip';itemTooltip.hidden=true;itemTooltip.setAttribute('role','dialog');itemTooltip.setAttribute('aria-label','Item inspect');document.body.append(itemTooltip);
    const augmentDialog=document.createElement('dialog');augmentDialog.className='character-augment-picker';augmentDialog.setAttribute('aria-label','Choose Exaltation');document.body.append(augmentDialog);
    let augmentCatalog=null,tooltipTimer=null,tooltipShowTimer=null,pendingTooltipButton=null,pickerEpoch=0,tooltipCardId='';
    listen(augmentDialog,'close',()=>{if(!augmentDialog.open){pickerEpoch++;augmentDialog.onpaste=null;}});
    const characterCatalog=mountCharacterCatalog({host:$('[data-character-catalog]',characterRoot),getPack,onAdd(input){if(publishing)return{ok:false,error:'Wait until the reviewed wiki action completes.'};const result=character.intake(input);if(result.ok){if(walkthrough.snapshot().active){walkthrough.rememberItem?.(result.candidate);character.autoAssign(result.candidate.id);}selectedCard=result.candidate.id;shareImage=null;renderCharacter();}return result;}});
    function listen(element,event,callback,options){element?.addEventListener(event,callback,options);unsubscribers.push(()=>element?.removeEventListener(event,callback,options));}
    const discoveryPanel=document.createElement('section');
    discoveryPanel.id='contribution-discoveries-panel';discoveryPanel.dataset.contributionDiscoveries='';discoveryPanel.setAttribute('role','tabpanel');discoveryPanel.setAttribute('aria-labelledby','contribution-discoveries-tab');
    const discoveryLayout=$('.contribution-layout'),reviewPanel=$('[data-wiki-review]');
    discoveryLayout.before(discoveryPanel);discoveryPanel.append(discoveryLayout,reviewPanel);
    const contributionTabs=document.createElement('div');contributionTabs.className='contribution-tabs';contributionTabs.setAttribute('role','tablist');contributionTabs.setAttribute('aria-label','Contribute to Wiki');
    contributionTabs.innerHTML='<button type="button" id="contribution-discoveries-tab" role="tab" aria-selected="true" aria-controls="contribution-discoveries-panel" data-contribution-tab="discoveries">Discoveries</button><button type="button" id="contribution-history-tab" role="tab" aria-selected="false" aria-controls="contribution-history-panel" tabindex="-1" data-contribution-tab="history">Contribution History</button>';
    discoveryPanel.before(contributionTabs);
    const historyPanel=document.createElement('section');historyPanel.id='contribution-history-panel';historyPanel.className='contribution-history';historyPanel.hidden=true;historyPanel.setAttribute('role','tabpanel');historyPanel.setAttribute('aria-labelledby','contribution-history-tab');
    const contributionSection=document.createElement('section');contributionSection.className='panel contribution-section';contributionSection.dataset.contributionSection='';
    const heading=$('.contribution-heading');root.prepend(contributionSection);contributionSection.append(heading,contributionTabs,discoveryPanel,historyPanel);
    const contributionHistory=mountContributionHistory({host:historyPanel,wiki});
    unsubscribers.push(()=>contributionHistory.dispose());
    function setContributionTab(next,{focus=false}={}){
        if(publishing||!['discoveries','history'].includes(next))return;
        if(next!==contributionTab){saveCandidate();cancelAutomaticContribution();}
        contributionTab=next;discoveryPanel.hidden=next!=='discoveries';historyPanel.hidden=next!=='history';
        for(const button of contributionTabs.querySelectorAll('[role="tab"]')){const selected=button.dataset.contributionTab===next;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected&&focus)button.focus();}
        contributionHistory.setActive(next==='history'&&Boolean(root.closest('.view.is-active')));refreshContributionReader();
    }
    listen(contributionTabs,'click',event=>{const button=event.target.closest('[data-contribution-tab]');if(button)setContributionTab(button.dataset.contributionTab);});
    listen(discoveryPanel,'click',event=>{if(event.target.closest('[data-open-contribution-history]'))setContributionTab('history',{focus:true});});
    listen(contributionTabs,'keydown',event=>{if(!event.target.closest('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setContributionTab(event.key==='Home'?'discoveries':event.key==='End'?'history':contributionTab==='history'?'discoveries':'history',{focus:true});});
    function shareStatus(message,error=false){const host=dialog.querySelector('[data-share-status]');host.textContent=message;host.classList.toggle('capture-warning',error);}
    async function act(callback){if(disposed||busy)return;busy=true;contributionEvidenceEpoch++;renderCharacterSelect();try{return await callback();}catch(error){const message=error.message||'This action could not complete.';if(dialog.open)shareStatus(message,true);else warning(message);}finally{busy=false;if(!disposed)renderCharacterSelect();}}
    function invalidatePlan(){reviewEpoch++;plan=null;$('[data-wiki-review]').hidden=true;}
    function reviewIsCurrent(candidate,epoch){return !disposed&&epoch===reviewEpoch&&selectedId===candidate?.id&&JSON.stringify(selected())===JSON.stringify(candidate);}
    function setPublishing(value){publishing=value;root.inert=value;characterRoot.inert=value;dialog.inert=value;root.setAttribute('aria-busy',String(value));characterRoot.setAttribute('aria-busy',String(value));updatePublishAvailability();if(!value)contributionHistory.markChanged();}
    function selected(){const candidate=queue.snapshot().find(c=>c.id===selectedId);return candidate&&!entityIgnored({kind:candidate.kind,name:candidate.title||candidate.name})?discoveryGate.project(candidate,{request:discoveryChecksActive()}):null;}
    function saveCandidate({reviewFields=false}={}){
        const candidate=selected(),form=$('[data-candidate-form]');if(!candidate||!form||publishing)return candidate;
        const data=new FormData(form),fields={...candidate.fields},originalCandidate=JSON.parse(form.dataset.originalCandidate||'{}');
        for(const row of form.querySelectorAll('[data-field-key]')){
            const key=row.dataset.fieldKey,input=row.querySelector('[data-field-value]');if(!input)continue;const picker=row.querySelector('[data-choice-picker]');let value=picker?readContributionChoicePicker(picker):input.value;
            if(!picker&&input.dataset.array==='true')value=value.split(input.dataset.lines==='true'||['statLines','knownLoot','knownNPCs'].includes(key)?/\n/:/[,\n]/).map(s=>s.trim()).filter(Boolean);
            else if(input.dataset.type==='boolean')value=value===''?'':value==='true';
            else if(input.dataset.type==='number'&&value.trim()!==''&&Number.isFinite(Number(value)))value=Number(value);
            if(!picker&&value==='?')value='';
            const original=row.dataset.originalField?JSON.parse(row.dataset.originalField):null,unchanged=original&&JSON.stringify(value)===JSON.stringify(original.value);
            if(unchanged&&(!reviewFields||row.closest('[data-additional-contribution]')?.open===false))continue;
            const previous=candidate.fields[key],nonblank=Array.isArray(value)?value.length>0:value!==''&&value!==null;
            fields[key]={value,confirmed:key==='notable'?typeof value==='boolean':reviewFields?nonblank:previous?.confirmed===true,edited:previous?.edited===true||!unchanged,...(key==='notable'&&typeof value==='boolean'?{source:'player'}:{})};
        }
        const sources=candidate.sources.map((source,index)=>{const button=form.querySelector(`[data-source-toggle="${index}"]`);return {...source,confirmed:button?button.getAttribute('aria-pressed')==='true':source.confirmed,...(button&&button.getAttribute('aria-pressed')!==String(contributionSourceIncluded(source))?{edited:true}:{})};});
        const patch={...Object.fromEntries(['name','title','zone','era','playerText'].map(key=>[key,data.get(key)===String(originalCandidate[key]??'')?candidate[key]:data.get(key)])),intent:data.get('intent')||candidate.intent||'create',instance:form.dataset.newZone==='true'?'normal':form.elements.raid.checked?'raid':'normal',matchesReviewed:reviewFields||candidate.matchesReviewed===true,fields,sources};
        if(candidate.attachment)patch.attachment={...candidate.attachment,caption:String(data.get('attachmentCaption')||'').slice(0,1000),license:data.get('attachmentLicense')||'own-screenshot'};
        if(reviewFields&&patch.fields.lootKinds)patch.fields.lootKinds={...patch.fields.lootKinds,confirmed:true};
        const changed=Object.keys(patch).some(key=>JSON.stringify(patch[key])!==JSON.stringify(candidate[key]));
        if(changed){if(!reviewFields)patch.matchesReviewed=false;patch.planId=null;patch.status='needs-review';invalidatePlan();}
        // A live receipt may expose only a subset of a captured source list.
        // Saving that view must not erase the other observations from storage.
        const raw=queue.snapshot().find(value=>value.id===candidate.id);
        if(raw&&raw.manual!==true){
            const sourceKey=source=>JSON.stringify([source.npc,source.zone,source.instance]);
            const shownSources=new Set(candidate.sources.map(sourceKey));
            patch.sources=[...sources,...raw.sources.filter(source=>!shownSources.has(sourceKey(source)))];
            for(const key of ['knownLoot','knownNPCs'])if(patch.fields[key]?.edited!==true&&Array.isArray(raw.fields[key]?.value))patch.fields[key]={...patch.fields[key],value:[...new Set([...(patch.fields[key]?.value||[]),...raw.fields[key].value])]};
        }
        const updated=queue.update(candidate.id,patch);return discoveryGate.project(updated);
    }
    function selectContribution(id){if(!id||publishing||!queueRows().some(candidate=>candidate.id===id))return false;setContributionTab('discoveries');cancelAutomaticContribution();saveCandidate();selectedId=id;iconPage=0;invalidatePlan();renderQueue();renderCandidate();return true;}
    function contributionContextMarkup(candidate,{showSpawn=true}={}){
        let text=contributionRelationsMarkup(candidate);
        if(candidate.kind==='npc'&&showSpawn){
            const armed=queue.spawnStatus?.();spawnArmedId=armed?.candidateId||'';
            text+='<section class="contribution-capture"><h3>Spawn location</h3><p>'+(spawnArmedId===candidate.id?'Waiting for your next /loc. Stand at this monster’s spawn point, then type /loc in EverQuest.':candidate.spawnRequest?.status==='captured'?'Spawn location saved below. Correct it if needed.':'Stand at the spawn point, choose Record next /loc, then type /loc in EverQuest.')+'</p><button type="button" class="secondary-button" data-record-spawn>Record next /loc</button></section>';
        }
        return text;
    }
    function renderContributionIcons(candidate,host){
        contributionIcons?.dispose();contributionIcons=mountWikiIconFinder({host,wiki,compact:true,onSelect(icon){if(publishing||selectedId!==candidate.id)return;markContributionEdited();const current=saveCandidate();contributionIconCrop=null;queue.update(candidate.id,{fields:{...current.fields,iconId:{value:icon.iconId,confirmed:true,edited:true}},planId:null,status:'needs-review'});invalidatePlan();renderCandidate();}});
        if(contributionIconCrop?.candidateId===candidate.id&&!candidate.fields.iconId?.edited&&!candidate.fields.iconId?.confirmed)void contributionIcons.readDataUrl(contributionIconCrop.dataUrl);
    }
    function renderQueue(){
        const all=visibleQueueCandidates(),candidates=queueRows(),counts=contributionQueueCounts(all),filters=$('[data-contribution-filters]');
        const attention=root.querySelector('.contribution-latest-result[data-automatic-review-key]');
        if(attention&&!all.some(candidate=>automaticSourceDraftKeys(candidate,{resolver:contributionResolver()})?.includes(attention.dataset.automaticReviewKey))){attention.hidden=true;attention.innerHTML='';}
        filters.innerHTML=CONTRIBUTION_FILTERS.map(filter=>`<label class="check-control"><input type="checkbox" data-gap-filter="${filter.key}" ${enabledGaps.includes(filter.key)?'checked':''}>${escape(filter.label)} <span class="contribution-filter-count">${counts[filter.key]}</span></label>`).join('');
        $('[data-contribution-count]').textContent=`${candidates.length} of ${all.length} entries shown`;
        $('[data-contribution-list]').innerHTML=candidates.map(c=>{const info=contributionQueueInfo(c);return `<article class="contribution-row ${c.id===selectedId?'is-active':''}">${contributionQueueControls(c,{canIgnore:typeof wiki?.ignoreContributionEntity==='function',disabled:publishing})}<button type="button" class="contribution-row-select" data-candidate-id="${escape(c.id)}"><strong>${escape(c.name)}</strong><small class="contribution-queue-type">${escape(info.kind)} <span aria-hidden="true">›</span> ${info.pageType}</small>${info.labels.length?`<span class="contribution-gap-tags">${info.labels.map(label=>`<span>${escape(label)}</span>`).join('')}</span>`:''}${['submitted','partial','needs-attention'].includes(c.status)?`<small>${escape(c.status==='submitted'?'Submitted':c.status==='partial'?'Partly submitted':'Needs attention')}</small>`:''}</button>${contributionDestinationHintsMarkup(c,{compact:true,pack:getPack()})}</article>`;}).join('')||`<p class="empty-state">${all.length?'No entries match these filters. Check a gap type above to show it.':'New discoveries from logs and screen reads appear here.'}</p>`;
    }
    function dismissDiscovery(id){
        if(publishing)return;cancelAutomaticContribution();if(selectedId!==id)saveCandidate();queue.remove(id);manuallyEditedContributions.delete(id);
        if(selectedId===id)selectedId=queueRows()[0]?.id||'';matches=null;invalidatePlan();renderQueue();renderCandidate();
    }
    function applyIgnoreSnapshot(snapshot){
        if(disposed||!snapshot||snapshot.schemaVersion!==1||!Array.isArray(snapshot.entries))return;
        ignoreEntries=snapshot.entries;ignoreRevision++;cancelAutomaticContribution();
        if(selectedId&&!queueRows().some(candidate=>candidate.id===selectedId)){selectedId=queueRows()[0]?.id||'';matches=null;invalidatePlan();renderCandidate();}
        renderQueue();
    }
    async function ignoreForever(id){
        if(publishing)return;const candidate=queue.snapshot().find(entry=>entry.id===id);if(!candidate||!['npc','item'].includes(candidate.kind))return;
        if(typeof wiki?.ignoreContributionEntity!=='function')throw Error('Permanent ignores require the updated desktop app.');
        cancelAutomaticContribution();saveCandidate();
        const snapshot=await wiki.ignoreContributionEntity({kind:candidate.kind,name:candidate.title||candidate.name});
        // Keep saved drafts intact so restoring the entity can reveal them.
        applyIgnoreSnapshot(snapshot);notify(candidate.name+' will be ignored. Restore it in Contribution History.');
    }
    function renderCandidate(){
        renderDiscoveryCapture();
        itemBaseUi?.dispose();itemBaseUi=null;contributionIcons?.dispose();contributionIcons=null;contributionChoices?.dispose();contributionChoices=null;const candidate=selected(),host=$('[data-contribution-editor]');
        if(!candidate){host.innerHTML='<p class="empty-state">Choose a discovery or add a page to review.</p>';return;}
        const summary=contributionUpdateSummary(candidate),isNewZone=candidate.kind==='zone'&&!summary.updating;
        const fields=isNewZone?zoneCreationFields(candidate.fields):candidate.kind==='item'?withDefaultItemStatLines(candidate.fields):{...candidate.fields};
        const keys=candidate.kind==='npc'?['notable','level','race','class','location','respawnTime','AC','HP','special','knownLoot']:candidate.kind==='zone'?['whoName','knownNPCs','knownLoot']:candidate.kind==='spell'?['castTime','duration','effect','mana']:['classes','slots','races','iconId','effectName','effectType','effectCastTime','effectLevel'];
        const effects=contributionItemEffects({fields:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{...value,confirmed:true}]))}),effect=effects[0];
        for(const key of keys)if(!fields[key])fields[key]={value:key==='effectName'?effect?.name||'':key==='effectType'?effect?.type||'':key==='effectCastTime'?effect?.castTime||'':key==='effectLevel'?effect?.level||'':['knownLoot','knownNPCs','classes','slots','races'].includes(key)?[]:'',confirmed:false};
        const displayCandidate={...candidate,fields},localMatches=matches?.candidateId===candidate.id?matches.matches:queue.matches(candidate);
        const fieldEntries=Object.entries(fields).filter(([key])=>candidate.kind!=='item'||key!=='iconId'),isUpdate=summary.updating,mainFields=isUpdate?fieldEntries.filter(([key])=>summary.fields.includes(key)):fieldEntries,extraFields=isUpdate?fieldEntries.filter(([key])=>!summary.fields.includes(key)):[];
        const gapSummary=isUpdate?`<section class="contribution-change-summary"><h3>What will be added</h3>${summary.gaps.map(gap=>`<p><strong>${escape(gap.label)}</strong> · ${escape(gap.description)}</p>`).join('')}<div data-contribution-destination-host>${contributionDestinationHintsMarkup(candidate,{pack:getPack()})}</div><p class="settings-helper">Preview shows each page change. Existing content stays in place.</p></section>`:'';
        const fieldMarkup=entries=>entries.filter(([key])=>!isNewZone||!ZONE_CREATION_FIELD_KEYS.includes(key)).map(([key,field])=>contributionFieldMarkup(key,field,{kind:candidate.kind,requireLocation:!isUpdate})).join(''),mainFieldMarkup=fieldMarkup(mainFields);
        const optionalFields=isUpdate?`<details data-additional-contribution><summary>Other optional changes</summary><div class="contribution-fields">${fieldMarkup(extraFields)}</div><label>Description / notes<textarea name="playerText" rows="3" maxlength="12000" placeholder="ex. Summons nearby players.">${escape(candidate.playerText)}</textarea></label>${candidate.kind==='item'?'':contributionScreenshotMarkup(candidate)}</details>`:'';
        host.innerHTML=`<div class="capture-actions contribution-iterate"><button type="button" class="text-button" data-candidate-previous>← Previous</button><span data-queue-position></span><button type="button" class="text-button" data-candidate-next>Next →</button></div><form data-candidate-form ${isNewZone?'data-new-zone="true"':''}><h2>${escape(candidate.name)}</h2>${contributionItemEvidenceMarkup(candidate,fields)}${contributionMatchMarkup(candidate,localMatches)}<div class="capture-form-grid">${isUpdate?`<input type="hidden" name="name" value="${escape(candidate.name)}">`:`<label>${isNewZone?'Zone name':'Observed name'}<input name="name" value="${escape(candidate.name)}" maxlength="230" required placeholder="${isNewZone?'ex. Forgotten Vale':'ex. A loathing lich'}"></label>`}<label>Destination page<input name="title" value="${escape(candidate.title)}" maxlength="230" required placeholder="${isNewZone?'ex. Forgotten Vale':'ex. A loathing lich'}"></label>${isNewZone?`<input type="hidden" name="zone" value="${escape(candidate.zone)}"><input type="checkbox" name="raid" hidden>`:`<div class="contribution-zone-field" ${isUpdate&&!summary.fields.includes('zone')&&!summary.sections.sources&&!summary.sections.loot?'hidden':''}><label>Zone<input name="zone" value="${escape(candidate.zone)}" maxlength="230" placeholder="ex. Plane of Hate"></label><label class="check-control"><input type="checkbox" name="raid" ${candidate.instance==='raid'?'checked':''}> Raid Instance</label></div>`}${isUpdate?`<input type="hidden" name="era" value="${escape(candidate.era||'Classic Era')}">`:`<label>Era<select name="era">${eras.map(value=>`<option ${((candidate.era||'Classic Era')===value)?'selected':''}>${escape(value)}</option>`).join('')}</select></label>`}</div>${gapSummary}${!isUpdate?`<div data-contribution-destination-host>${contributionDestinationHintsMarkup(candidate,{pack:getPack()})}</div>`:''}${contributionContextMarkup(candidate,{showSpawn:!isUpdate||summary.fields.includes('location')})}${isNewZone?zoneCreationMarkup(candidate,fields):''}${candidate.kind==='item'&&(!isUpdate||summary.sections.stats)?'<section data-item-base-review></section>':''}${mainFieldMarkup?`<section class="contribution-fields"><h3>${isUpdate?'Gap details':'Page details'}</h3>${mainFieldMarkup}</section>`:''}${['npc','zone'].includes(candidate.kind)&&(!isUpdate||summary.sections.loot)?contributionLootMarkup(displayCandidate,{pack:getPack()}):''}${candidate.kind==='item'&&(!isUpdate||summary.sections.sources)?`<section class="contribution-source-editor"><h3>Drop sources</h3>${candidate.sources.map((source,index)=>`<div class="contribution-source-row"><span>${escape(source.npc)} · ${escape(source.zone)} <small> · ${source.instance==='raid'?'Raid Zone':'Normal Zone'}</small></span><button type="button" class="secondary-button" data-source-toggle="${index}" aria-pressed="${contributionSourceIncluded(source)}">${contributionSourceIncluded(source)?'Included':'Include source'}</button></div>`).join('')}<div class="capture-form-grid"><label>Monster<input data-add-source-npc placeholder="ex. A loathing lich" maxlength="230"></label></div><button type="button" class="secondary-button" data-add-source>Add source</button></section>`:''}${isUpdate?optionalFields:isNewZone?contributionScreenshotMarkup(candidate):`<label>Description / notes<textarea name="playerText" rows="4" maxlength="12000" placeholder="ex. Summons nearby players.">${escape(candidate.playerText)}</textarea></label>${candidate.kind==='item'?'':contributionScreenshotMarkup(candidate)}`}${contributionEvidenceMarkup(candidate)}<div class="capture-actions"><button class="primary-button" type="submit" data-prepare-contribution>Preview wiki changes</button>${candidate.planId?'<button class="secondary-button" type="button" data-resume-plan>Resume saved review</button>':''}<button class="text-button" type="button" data-ignore-candidate>Ignore entry</button><a href="https://eqlwiki.com/API_Documentation" target="_blank" rel="noopener">API documentation</a></div></form>`;
        const form=$('[data-candidate-form]');contributionChoices=mountContributionChoicePickers({root:form});form.dataset.originalCandidate=JSON.stringify(Object.fromEntries(['name','title','zone','era','playerText'].map(key=>[key,candidate[key]])));
        const availability=()=>{$('[data-prepare-contribution]').disabled=publishing;};
        const bindMatches=()=>form.querySelectorAll('[data-use-existing]').forEach(button=>button.onclick=()=>{const current=saveCandidate();matches=null;queue.update(current.id,{title:button.dataset.useExisting,intent:'update',matchesReviewed:false,planId:null});invalidatePlan();renderQueue();renderCandidate();});bindMatches();
        form.oninput=event=>{markContributionEdited();if(['name','title'].includes(event.target.name))matches=null;const saved=saveCandidate();if(!saved)return;updateZoneCreationVisibility(form);invalidatePlan();availability();if(['name','title','zone','raid','intent'].includes(event.target.name)){form.querySelector('[data-contribution-destination-host]').innerHTML=contributionDestinationHintsMarkup(saved,{pack:getPack()});renderQueue();}if(['name','title'].includes(event.target.name)){$('[data-live-matches-status]').textContent='';$('[data-match-results]').innerHTML=contributionMatchesMarkup(saved,queue.matches(saved));bindMatches();}if(event.target.name==='intent'){matches=null;renderQueue();renderCandidate();}};
        form.addEventListener('click',event=>{if(event.target.closest('[data-source-toggle],[data-add-source],[data-loot-kind],[data-add-loot],[data-remove-attachment],[data-contribution-file],[data-contribution-paste]'))markContributionEdited();},true);
        form.onsubmit=event=>{event.preventDefault();void act(preparePlan);};
        $('[data-check-matches]').onclick=()=>void act(async()=>{const current=saveCandidate(),epoch=reviewEpoch;if(!wiki)throw Error('Live wiki matching requires the desktop app.');const result=await wiki.matches({name:current.title,kind:current.kind});if(!reviewIsCurrent(current,epoch))return;matches={...result,candidateId:current.id};$('[data-match-results]').innerHTML=contributionMatchesMarkup(current,result.matches||[]);$('[data-live-matches-status]').textContent='Checked live wiki.';bindMatches();});
        if(candidate.kind==='item'&&$('[data-item-base-review]'))itemBaseUi=mountItemBaseReview({host:$('[data-item-base-review]'),getCandidate:()=>saveCandidate()||selected(),onInvalidate(settings){
            if(publishing)return;const current=selected(),fields={...current.fields,tier:{...current.fields.tier,value:settings.tier,edited:true}};
            const tierInput=form.querySelector('[data-field-key="tier"] [data-field-value]');if(tierInput)tierInput.value=String(settings.tier);
            if(settings.tier===0){
                const retained=(Array.isArray(fields.statLines?.value)?fields.statLines.value:[]).filter(line=>!isItemNumericStatLine(line));
                fields.statLines={value:[...Object.entries(ITEM_CONTRIBUTION_STAT_LABELS).flatMap(([key,label])=>typeof fields[key]?.value==='number'&&Number.isFinite(fields[key].value)?[`${label}: ${fields[key].value}`]:[]),...retained],confirmed:true,edited:true};
                const input=form.querySelector('[data-field-key="statLines"] [data-field-value]');if(input)input.value=fields.statLines.value.join('\n');
            }
            // Invalid typed choices must block preview instead of silently
            // falling back to the original automatically selected proposal.
            queue.update(candidate.id,{fields,baseRecovery:settings.tier===0?null:{schemaVersion:2,reviewMode:'provisional',tier:settings.tier,fraction:null,sourceFingerprint:'',choices:{},reviewed:true,modifiersExcluded:null},planId:null,status:'needs-review'});invalidatePlan();
        },onApply(current,review){
            if(publishing)return;const patch=applyItemBaseReview(current,review);
            const input=form.querySelector('[data-field-key="statLines"] [data-field-value]');if(input)input.value=patch.fields.statLines.value.join('\n');
            if(JSON.stringify(current.baseRecovery)===JSON.stringify(patch.baseRecovery)&&JSON.stringify(current.fields.statLines)===JSON.stringify(patch.fields.statLines))return;
            queue.update(current.id,{...patch,planId:null,status:'needs-review'});invalidatePlan();
        }});
        const tierReview=queue.tierZeroReview?.(candidate.id);if(tierReview?.evidence){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='Confirm this unmodified tier 0 reading';button.disabled=!tierReview.ok;button.title=tierReview.reason;button.onclick=()=>{saveCandidate();const result=queue.confirmTierZero(candidate.id,{evidenceId:tierReview.evidence.id,modifiersExcluded:true,reviewed:true});if(result?.ok===false)return warning(result.error);invalidatePlan();renderCandidate();};$('[data-item-base-review]')?.prepend(button);}
        const ordered=queueRows(),position=ordered.findIndex(entry=>entry.id===candidate.id);$('[data-queue-position]').textContent=(position>=0?position+1:0)+' / '+ordered.length;
        $('[data-candidate-previous]').onclick=()=>selectContribution(ordered[(position-1+ordered.length)%ordered.length]?.id);$('[data-candidate-next]').onclick=()=>selectContribution(ordered[(position+1)%ordered.length]?.id);
        $('[data-record-spawn]')?.addEventListener('click',()=>{saveCandidate();const result=queue.armSpawnLocation(candidate.id);if(!result.ok)return warning(result.error);renderCandidate();notify('Stand at '+candidate.name+'’s spawn and type /loc.',{duration:15000});});
        async function attach(source){const current=saveCandidate(),epoch=reviewEpoch;if(!wiki?.prepareAttachment)throw Error('Screenshot attachments require the updated desktop app.');const result=await wiki.prepareAttachment({candidateId:current.id,kind:current.kind,source});if(disposed||selectedId!==current.id||result.cancelled)return;const latest=selected();queue.update(current.id,{attachment:{...result,caption:latest?.attachment?.caption||'',license:'own-screenshot'},planId:null});invalidatePlan();renderCandidate();}
        $('[data-contribution-file]')?.addEventListener('click',()=>void act(()=>attach('file')));$('[data-contribution-paste]')?.addEventListener('click',()=>void act(()=>attach('clipboard')));
        const drop=$('[data-contribution-dropzone]');drop?.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-dragging');});drop?.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));drop?.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-dragging');warning('Use Select screenshot or paste the image with Ctrl+V.');});
        $('[data-remove-attachment]')?.addEventListener('click',()=>void act(async()=>{const current=saveCandidate();dismissedCaptureImages.add(current.id);if(current.attachment?.attachmentId)await wiki.discardAttachment?.({attachmentId:current.attachment.attachmentId});queue.update(current.id,{attachment:null,planId:null});invalidatePlan();renderCandidate();}));
        form.querySelectorAll('[data-source-toggle]').forEach(button=>button.onclick=()=>{const include=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(include));button.textContent=include?'Included':'Include source';saveCandidate();renderCandidate();});
        $('[data-add-loot]')?.addEventListener('click',()=>{const current=saveCandidate(),name=$('[data-add-loot-name]').value.trim();if(!name)return;queue.update(current.id,{fields:{...current.fields,knownLoot:{value:[...new Set([...(current.fields.knownLoot?.value||[]),name])],confirmed:true,edited:true}},planId:null});invalidatePlan();renderCandidate();});
        $('[data-add-source]')?.addEventListener('click',()=>{
            const current=saveCandidate(),npc=form.querySelector('[data-add-source-npc]').value.trim(),zone=String(current.zone||'').trim(),instance=form.elements.raid.checked?'raid':'normal';
            if(!npc)return warning('Enter the monster that dropped this item.');if(!zone){warning('Enter the Zone above before adding a drop source.');form.elements.zone.focus();return;}
            const sources=[...current.sources],existing=sources.find(source=>normalizeWikiIdentity(source.npc)===normalizeWikiIdentity(npc)&&normalizeWikiIdentity(source.zone)===normalizeWikiIdentity(zone)&&source.instance===instance);
            if(existing){existing.confirmed=true;existing.edited=true;}else sources.push({npc,zone,instance,confirmed:true,edited:true,sourceEvidence:'manual'});
            queue.update(current.id,{sources,planId:null});invalidatePlan();renderCandidate();
        });
        const iconHost=$('[data-contribution-icons]');if(iconHost)renderContributionIcons(candidate,iconHost);
        $('[data-resume-plan]')?.addEventListener('click',()=>void act(async()=>{const current=saveCandidate(),epoch=reviewEpoch,restored=await wiki.getPlan({planId:current.planId});if(!reviewIsCurrent(current,epoch))return;plan=restored;renderPlan();}));
        $('[data-ignore-candidate]').textContent='Dismiss discovery';$('[data-ignore-candidate]').onclick=()=>dismissDiscovery(candidate.id);
    }
    function applyAccountStatus(next){account=next;contributionHistory.setAccount(next);$('[data-account-status]').textContent=account?.authenticated?`Logged in as ${account.user.name}${account.canEdit?'':' · editing unavailable'}`:'Not logged in';$('[data-wiki-login]').textContent=account?.authenticated?'Log out of wiki':'Log in to wiki';}
    async function refreshAccount(){if(!wiki)return;applyAccountStatus(await wiki.status());}
    async function preparePlan(){if(!wiki)throw Error('Wiki submission requires the desktop app.');const candidate=saveCandidate({reviewFields:true}),epoch=reviewEpoch,relatedPages=[];if(!candidate)throw Error('Wait for the live wiki to confirm this discovery before reviewing changes.');if(candidate.kind==='item')for(const source of candidate.sources.filter(s=>s.confirmed&&(!contributionUpdateSummary(candidate).updating||candidate.reasons?.includes('missing-source')||!candidate.reasons?.length||s.edited===true)))relatedPages.push({title:source.npc,role:'npc-loot',itemTitle:candidate.title,npcTitle:source.npc,zoneTitle:source.zone,instance:source.instance||'normal'});const prepared=await wiki.preparePlan({candidate,relatedPages,sourceItemHints:queue.sourceItemHints?.(candidate)||[],matchesReviewed:candidate.matchesReviewed===true});if(!reviewIsCurrent(candidate,epoch))throw Error('This draft changed while its review was loading. Prepare the updated review again.');plan=prepared;queue.update(candidate.id,{planId:plan.id});renderPlan();renderCandidate();}
    function updatePublishAvailability(){const host=$('[data-wiki-review]'),button=host.querySelector('[data-publish-plan]');if(!button)return;button.disabled=publishing||!plan||!plan.reviewDigest||!plan.pages?.length||plan.status==='submitted'||(plan.blockers||[]).length>0||!host.querySelector('[data-reviewed-plan]')?.checked;}
    function renderPlan(){
        const host=$('[data-wiki-review]');if(!plan){host.hidden=true;return;}host.hidden=false;
        const live=plan.matches||{},link=title=>`<a target="_blank" rel="noopener" href="https://eqlwiki.com/${encodeURIComponent(title)}">${escape(title)}</a>`;
        host.innerHTML=`<h2>Review all wiki changes</h2><p>Blueprint revision ${escape(plan.blueprintRevision)} · account ${escape(plan.expectedUser?.name||'not logged in')}</p>${[...(plan.blockers||[]),...(plan.warnings||[])].map(message=>`<p class="capture-warning">${escape(message)}</p>`).join('')}<section class="capture-proposal"><h3>Fresh live matches and redirects</h3><p>${(live.matches||[]).map(match=>link(match.title)).join(' · ')||'No close live titles were returned.'}</p>${(live.redirects||[]).map(redirect=>`<p>${link(redirect.from)} → ${link(redirect.to)}</p>`).join('')}<p class="settings-helper">Checked ${escape(live.checkedAt||'when this review was prepared')}. Creating an alternate spelling can duplicate an existing page.</p></section>${plan.recoveredLoot?.length?`<section class="capture-proposal" data-recovered-loot><h3>Previously recorded drops</h3><p>These published item pages already list this monster as a source in the selected zone and instance. Their loot entries are included in the changes below.</p><ul>${plan.recoveredLoot.map(item=>`<li>${link(item.title)}${item.revision?` <small>· source revision ${escape(item.revision)}</small>`:''}</li>`).join('')}</ul></section>`:''}${plan.attachment?`<section class="capture-proposal"><h3>Screenshot upload</h3><p>${escape(plan.attachment.filename)} · ${escape(plan.attachment.status||'pending')}</p><p>${escape(plan.attachment.caption||'No caption')} · ${escape(plan.attachment.license||'own-screenshot')}</p><p class="settings-helper">The image uploads first; the reviewed pages below link to this file. Uploads and edits are attributed to this wiki account.</p>${plan.attachment.error?`<p class="capture-warning">${escape(plan.attachment.error)}</p>`:''}</section>`:''}<div>${plan.pages.map(page=>`<details open><summary>${escape(page.title)} · ${escape(page.operation)} · ${escape(page.status)}</summary><div class="wiki-diff"><label>Before<textarea readonly rows="10">${escape(page.beforeText)}</textarea></label><label>After<textarea readonly rows="10">${escape(page.afterText)}</textarea></label></div><button class="text-button" data-copy-page="${escape(page.id)}">Copy proposed wikicode</button>${page.result?`<p>${escape(page.result.message||`Revision ${page.result.revision||''}`)}</p>`:''}</details>`).join('')}</div><label class="check-control"><input type="checkbox" data-reviewed-plan> I reviewed these page changes.</label><button class="primary-button" data-publish-plan disabled>${plan.status==='partial'||plan.status==='needs-attention'?'Retry unfinished pages':plan.status==='submitted'?'Contribution published':'Publish wiki changes'}</button><p data-publish-status role="status">${plan.status==='submitted'?contributionPublishReceiptMarkup(plan):''}</p>${contributionPublishedPagesMarkup(plan)}`;
        host.querySelector('[data-reviewed-plan]').onchange=updatePublishAvailability;
        host.querySelectorAll('[data-copy-page]').forEach(button=>button.onclick=()=>void act(()=>share.copyText(plan.pages.find(page=>page.id===button.dataset.copyPage).afterText)));
        $('[data-publish-plan]').onclick=()=>void act(async()=>{if(publishing||$('[data-publish-plan]').disabled)return;const pending=plan;setPublishing(true);try{$('[data-publish-status]').textContent='Publishing the reviewed pages. Please wait for the wiki result.';const result=await wiki.submitPlan({planId:pending.id,reviewDigest:pending.reviewDigest});plan=result;queue.update(selectedId,{status:result.status,planId:result.id});renderPlan();renderQueue();$('[data-publish-status]').innerHTML=contributionPublishReceiptMarkup(result);host.querySelector('.contribution-published-pages')?.scrollIntoView({block:'nearest',behavior:'smooth'});}finally{setPublishing(false);}});
        updatePublishAvailability();host.scrollIntoView({block:'start',behavior:'smooth'});
    }
    function renderCapture(){if(captureState.enabled)optIn=true;$('[data-capture-opt-in]',settingsRoot).checked=optIn;$('.capture-settings-controls',settingsRoot).hidden=!optIn;const label=captureState.error||`${captureState.phase||'disabled'}${captureState.owner?` · ${captureState.owner}`:''}${captureState.source?` · ${captureState.source.label}`:''}`;$('[data-capture-status]',settingsRoot).textContent=[label,captureState.readWarning,captureState.calibrationWarning,captureState.region?'Calibrated OCR area active.':''].filter(Boolean).join(' · ');$('[data-character-status]',characterRoot).textContent=captureState.owner==='character'?`Character reading ${captureState.phase}. ${captureState.contributionPaused?'Contribution reading is paused.':''}`:'';$('[data-capture-pause]',settingsRoot).textContent=captureState.phase==='paused'?'Resume':'Pause';$('[data-character-stop]',characterRoot).disabled=false;$('[data-capture-calibrate]',settingsRoot).disabled=!captureState.hasPreview||!capture?.preview||!capture?.setRegion||areaOpening;
        walkthrough.syncCapture(captureState,{startedAt:sourceStart?.at});
        renderWalkthrough();
        if(areaPreview&&(!captureState.hasPreview||captureState.source?.id!==areaPreview.sourceId||captureState.sessionId!==areaPreview.sessionId||captureState.owner!==areaPreview.owner||captureState.sourceSize&&JSON.stringify(frameSize(captureState.sourceSize))!==JSON.stringify(areaPreview.sourceSize))){closeArea();warning('The capture source changed. Open calibration again for its current frame.');}
        if(captureState.calibrationWarning){const key=areaKey(captureState.source,captureState.owner);if(areaProfiles.some(profile=>profile.key===key)){areaProfiles=areaProfiles.filter(profile=>profile.key!==key);persistAreas();}}
        renderDiscoveryCapture();
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
    async function chooseSources({recommend=true}={}){if(!capture)throw Error('Screen reading requires the desktop app.');const epoch=++sourceListEpoch;let listed;try{listed=await capture.sources();}catch(error){if(disposed||epoch!==sourceListEpoch)return;throw error;}if(disposed||epoch!==sourceListEpoch)return;const previous=selectedSource();sources=listed;$('[data-capture-source]',settingsRoot).innerHTML='<option value="">Choose a window or display</option>'+sources.map(source=>`<option value="${escape(source.id)}">${escape(source.name)} (${escape(source.type)})</option>`).join('');if(sources.some(s=>s.id===previous))$('[data-capture-source]',settingsRoot).value=previous;else $('[data-capture-source]',settingsRoot).value=recommend?sources.find(s=>s.recommended===true)?.id||'':'';renderWalkthrough();}
    function refreshSources(){void chooseSources().catch(error=>warning(error.message));}
    async function start(mode,{sourceId=selectedSource(),sessionId}={}){if(!capture)throw Error('Screen reading requires the desktop app.');if(mode!=='character'&&!optIn)throw Error('Enable Screen reading in Settings, then choose a source.');if(!sourceId)throw Error('Choose the game window first.');if(mode==='character')optIn=true;closeArea();const epoch=walkthroughEpoch,source=sources.find(source=>source.id===sourceId),profile=areaProfiles.find(profile=>profile.key===areaKey(source,mode)),next=await capture.start({mode,sourceId,...(sessionId?{sessionId}:{}),...(profile?{region:profile.region,referenceSize:profile.referenceSize}:{})});if(disposed||mode==='character'&&epoch!==walkthroughEpoch)return next;captureState=next;renderCapture();return next;}
    async function stopCapture(mode){if(!capture)throw Error('Screen reading requires the desktop app.');if(!publishing)invalidatePlan();captureState=await capture.stop(mode?{mode}:undefined);renderCapture();}
    const discoveryPicker=document.createElement('section');discoveryPicker.className='contribution-discovery-capture';discoveryPicker.dataset.discoveryCapture='';discoveryPicker.hidden=true;
    discoveryPicker.innerHTML='<div class="contribution-reader-heading"><h3>Item reader</h3><p data-discovery-capture-message role="status"></p></div><div class="contribution-reader-controls"><label data-discovery-source-label>Game window or display<select data-discovery-capture-source aria-label="Discovery capture source"><option value="">Choose a source</option></select></label><div class="capture-actions"><button type="button" class="primary-button" data-discovery-capture-start>Start item reading</button><button type="button" class="secondary-button" data-contribution-reader-pause>Pause reading</button></div></div><p data-contribution-examine-prompt class="settings-helper"></p>';
    root.querySelector('.contribution-layout').before(discoveryPicker);
    const itemDiscoveryRequests=()=>[...discoveryRequests.values()].filter(request=>request.purpose==='item-link');
    const wantsContributionReader=()=>!disposed&&!contributionReaderSuppressed&&contributionTab==='discoveries'&&(itemDiscoveryRequests().length>0||contributionVisible);
    const gameSource=source=>source?.type==='window'&&/everquest|eqgame(?:\.exe)?/i.test(source.name||source.label||'');
    function renderDiscoveryCapture(){
        const pending=itemDiscoveryRequests(),select=discoveryPicker.querySelector('[data-discovery-capture-source]');
        const running=captureState.owner==='contribution'&&captureState.phase==='running',candidate=selected();
        discoveryPicker.hidden=contributionTab==='history'||!pending.length&&!contributionVisible;
        discoveryPicker.querySelector('[data-discovery-capture-message]').textContent=discoveryMessage||(captureState.owner==='character'?'Character reading is active. Finish or stop it before reading contribution items.':contributionReaderSuppressed?'Automatic reading is paused. Choose Start item reading when ready.':running?'Reading your selected game window about once per second. New values are proposals for review.':'Choose the game window below. The reader uses the Default Modern game UI.');
        discoveryPicker.querySelector('[data-contribution-examine-prompt]').textContent=candidate?.kind==='item'?`Open ${candidate.name}’s full examine window. Text, screenshot and icon suggestions fill this entry.`:'Open an item’s full examine window to propose its text, screenshot and icon.';
        discoveryPicker.querySelector('[data-discovery-source-label]').hidden=running;
        discoveryPicker.querySelector('[data-discovery-capture-start]').hidden=running&&!contributionReaderSuppressed;
        discoveryPicker.querySelector('[data-contribution-reader-pause]').hidden=contributionReaderSuppressed||!contributionVisible;
        select.innerHTML='<option value="">Choose a source</option>'+sources.map(source=>`<option value="${escape(source.id)}">${escape(source.name||source.label)} (${escape(source.type)})</option>`).join('');
        if(sources.some(source=>source.id===discoverySourceId))select.value=discoverySourceId;
        discoveryPicker.querySelector('[data-discovery-capture-start]').disabled=Boolean(discoveryStarting||sources.length&&!select.value);
    }
    function discoveryResult(request,extra={}){return{ok:true,requestId:request.id,candidateId:request.candidateId,purpose:request.purpose,captureRequest:request.captureRequest,capture:structuredClone(captureState),...extra};}
    function discoveryCaptureReady(request,result){try{onDiscoveryCapture({...request},result);}catch(error){warning(error.message||'The discovery capture status could not be updated.');}}
    async function stopOwnedDiscoveryCapture(){
        if(wantsContributionReader()||!discoveryCapture||!capture)return;
        const owned=discoveryCapture,current=await capture.status(),retained=discoveryCapture;
        if(wantsContributionReader()||!retained||retained.sessionId!==owned.sessionId||retained.sourceId!==owned.sourceId)return;
        discoveryCapture=null;captureState=current;
        if(current.owner==='contribution'&&current.sessionId===owned.sessionId&&current.source?.id===owned.sourceId||current.owner==='character'&&current.contributionPaused===true)
            captureState=await capture.stop({mode:'contribution',expectedSessionId:owned.sessionId,expectedSourceId:owned.sourceId});
        if(!disposed){renderCapture();renderDiscoveryCapture();}
    }
    async function prepareDiscoveryCapture(sourceId='',{explicit=false}={}){
        if(discoveryStarting)return discoveryStarting;
        discoveryStarting=(async()=>{
            if(!capture)throw Error('Screen reading requires the desktop app.');
            captureState=await capture.status();if(!wantsContributionReader())return{cancelled:true};
            if(captureState.owner==='character')throw Error('Finish or stop Character capture, then choose Contribute again.');
            if(captureState.owner==='contribution'&&['running','selecting'].includes(captureState.phase)){renderCapture();return{};}
            if(captureState.phase==='error'&&!explicit&&!itemDiscoveryRequests().length){contributionReaderSuppressed=true;discoveryMessage=captureState.error||'The reader stopped after an error. Choose Start item reading to retry.';return{needsSource:true};}
            if(captureState.owner==='contribution'&&captureState.phase==='paused'){
                if(!explicit&&!itemDiscoveryRequests().length){contributionReaderSuppressed=true;discoveryMessage='Screen reading is paused. Choose Start item reading to resume.';return{needsSource:true};}
                const previous=captureState,owned=discoveryCapture;
                captureState=await capture.resume();if(captureState.owner!=='contribution')throw Error('Finish or stop Character capture, then choose Contribute again.');
                if(owned&&owned.sessionId===previous.sessionId&&owned.sourceId===previous.source?.id&&owned.generation===previous.generation)discoveryCapture={sessionId:captureState.sessionId,sourceId:captureState.source?.id,generation:captureState.generation};
                renderCapture();return{};
            }
            const configuredId=selectedSource()||captureState.source?.id||'';
            await chooseSources({recommend:false});if(!wantsContributionReader())return{cancelled:true};
            const configured=sources.find(source=>source.id===configuredId&&gameSource(source)),recommended=sources.filter(source=>source.recommended===true&&gameSource(source));
            const choice=sourceId?sources.find(source=>source.id===sourceId):configured||(recommended.length===1?recommended[0]:null);
            if(!choice){discoveryMessage='Choose the game window or an explicit display below. Open the complete item examine window and leave it visible.';renderDiscoveryCapture();return{needsSource:true};}
            // A Character session may have started while source enumeration was
            // awaiting native IPC. Never queue a contribution takeover behind it.
            captureState=await capture.status();if(!wantsContributionReader())return{cancelled:true};
            if(captureState.owner==='character')throw Error('Finish or stop Character capture, then choose Contribute again.');
            if(captureState.owner==='contribution'&&['running','selecting'].includes(captureState.phase)){renderCapture();return{};}
            discoverySourceId=choice.id;optIn=true;const requestedSessionId=globalThis.crypto.randomUUID(),next=await start('contribution',{sourceId:choice.id,sessionId:requestedSessionId});if(next)captureState=next;
            if(captureState.owner!=='contribution'){
                // Character may win while native start IPC is in flight. Only
                // our requested contribution resume slot may be cancelled.
                if(captureState.owner==='character')captureState=await capture.stop({mode:'contribution',expectedSessionId:requestedSessionId,expectedSourceId:choice.id});
                throw Error('The item reader did not start. Stop Character capture and choose Contribute again.');
            }
            if(captureState.sessionId!==requestedSessionId||captureState.source?.id!==choice.id)throw Error('The reader changed while starting. Choose Start item reading again.');
            discoveryCapture={sessionId:captureState.sessionId,sourceId:captureState.source?.id,generation:captureState.generation};
            if(!wantsContributionReader()){await stopOwnedDiscoveryCapture();return{cancelled:true};}
            discoveryMessage='Reading the game window about once per second. Keep the complete item examine window visible.';renderDiscoveryCapture();return{};
        })();
        try{return await discoveryStarting;}finally{discoveryStarting=null;if(!disposed)renderDiscoveryCapture();}
    }
    async function beginDiscoveryContribution(request={}){
        if(disposed||publishing)return{ok:false,error:disposed?'Contribute has closed.':'Finish the current wiki submission first.'};
        if(typeof request.id!=='string'||!request.id||request.id.length>240||!['item-link','spawn-location'].includes(request.purpose)||request.captureRequest!==undefined&&!/^capture-\d+$/.test(request.captureRequest))return{ok:false,error:'This discovery request is invalid.'};
        if(discoveryRequests.size>=64&&!discoveryRequests.has(request.id))return{ok:false,error:'Finish or dismiss an existing discovery request first.'};
        const name=String(request.name||'').trim().slice(0,230),record={id:request.id,purpose:request.purpose,captureRequest:request.captureRequest,candidateId:request.candidateId||'',name};
        if(request.purpose==='spawn-location'){
            let candidate=queue.snapshot().find(candidate=>candidate.id===request.candidateId&&candidate.kind==='npc');
            if(!candidate||name&&normalizeWikiIdentity(candidate.name)!==normalizeWikiIdentity(name))return{ok:false,error:'This monster contribution is no longer available.'};
            const signature=discoveryGate.signature(candidate);await discoveryGate.check(candidate);
            candidate=queue.snapshot().find(value=>value.id===candidate.id);
            if(disposed||!candidate||signature!==discoveryGate.signature(candidate)||!discoveryGate.project(candidate,{request:false})||entityIgnored({kind:'npc',name:candidate.name}))return{ok:false,error:'This monster no longer has a confirmed wiki gap.'};
            // Contribute is an explicit request to keep working on this draft,
            // even after its automatic visibility receipt expires.
            candidate=queue.add({kind:'npc',name:candidate.name,zone:candidate.zone,instance:candidate.instance},true);
            if(!candidate)return{ok:false,error:'This monster contribution is no longer available.'};
            const armed=queue.armSpawnLocation(candidate.id,{persistent:true});if(!armed.ok)return armed;
            record.candidateId=candidate.id;discoveryRequests.set(record.id,record);spawnArmedId=candidate.id;selectContribution(candidate.id);navigate('contribute');loadWiki();return discoveryResult(record,{spawn:armed});
        }
        const resolver=createWikiResolver(getPack()),identity=value=>normalizeWikiIdentity(resolver.resolve('item',itemExaltationBaseIdentity(value)).canonicalTitle||itemExaltationBaseIdentity(value));
        if(!name)return{ok:false,error:'The linked item has no name.'};
        const matching=queue.snapshot().filter(candidate=>candidate.kind==='item'&&[candidate.name,candidate.title].some(value=>identity(value)===identity(name)));
        let candidate=request.candidateId?matching.find(candidate=>candidate.id===request.candidateId):matching[0];
        if(request.candidateId&&!candidate)return{ok:false,error:'This linked item contribution no longer matches.'};
        if(!candidate)candidate=queue.add({kind:'item',name:itemExaltationBaseIdentity(name)},true);
        if(!candidate)return{ok:false,error:'This linked item could not be opened for review.'};
        const signature=discoveryGate.signature(candidate);await discoveryGate.check(candidate);
        candidate=queue.snapshot().find(value=>value.id===candidate.id);
        if(disposed||!candidate||signature!==discoveryGate.signature(candidate)||!discoveryGate.project(candidate,{request:false})||entityIgnored({kind:'item',name:candidate.name}))return{ok:false,error:'This item no longer has a confirmed wiki gap.'};
        candidate=queue.add({kind:'item',name:candidate.name,zone:candidate.zone,instance:candidate.instance},true);
        if(!candidate)return{ok:false,error:'This item contribution is no longer available.'};
        contributionReaderSuppressed=false;discoveryMessage='';
        record.candidateId=candidate.id;discoveryRequests.set(record.id,record);selectContribution(candidate.id);navigate('contribute');loadWiki();
        try{const prepared=await prepareDiscoveryCapture('',{explicit:true});if(disposed||discoveryRequests.get(record.id)!==record)return discoveryResult(record,{cancelled:true});const result=discoveryResult(record,prepared);if(!prepared.needsSource&&!prepared.cancelled)discoveryCaptureReady(record,result);return result;}
        catch(error){discoveryMessage=error.message||'Item reading could not start.';renderDiscoveryCapture();return discoveryResult(record,{ok:false,error:discoveryMessage});}
    }
    function setDiscoveryNotable(request={}){
        if(disposed||publishing)return{ok:false,error:disposed?'Contribute has closed.':'Finish the current wiki submission first.'};
        const candidate=queue.snapshot().find(value=>value.id===request.candidateId);
        if(!candidate||!discoveryGate.project(candidate)||entityIgnored({kind:'npc',name:candidate.name}))return{ok:false,error:'This monster no longer has a confirmed wiki gap.'};
        const result=queue.setNpcNotable(request);if(!result.ok)return result;
        if(selectedId===request.candidateId){invalidatePlan();renderCandidate();}renderQueue();return{ok:true,notable:result.notable};
    }
    async function cancelDiscoveryContribution(request={}){
        const record=discoveryRequests.get(request.id);
        if(record&&request.captureRequest!==undefined&&request.captureRequest!==record.captureRequest)return{ok:true,ignored:true};
        if(record)discoveryRequests.delete(record.id);
        const candidateId=record?.candidateId||request.candidateId,purpose=record?.purpose||request.purpose;
        if(purpose==='spawn-location'&&candidateId&&queue.spawnStatus?.()?.candidateId===candidateId){queue.cancelSpawnLocation?.();if(spawnArmedId===candidateId)spawnArmedId='';if(selectedId===candidateId)renderCandidate();}
        await stopOwnedDiscoveryCapture();if(!disposed)renderDiscoveryCapture();return{ok:true};
    }
    listen(discoveryPicker.querySelector('[data-discovery-capture-source]'),'change',event=>{discoverySourceId=event.target.value;renderDiscoveryCapture();});
    listen(discoveryPicker.querySelector('[data-discovery-capture-start]'),'click',()=>void act(async()=>{
        contributionReaderSuppressed=false;discoveryMessage='';
        try{const result=await prepareDiscoveryCapture(discoverySourceId,{explicit:true});for(const request of itemDiscoveryRequests())discoveryCaptureReady(request,discoveryResult(request,result));}
        catch(error){discoveryMessage=error.message;renderDiscoveryCapture();for(const request of itemDiscoveryRequests())discoveryCaptureReady(request,discoveryResult(request,{ok:false,error:discoveryMessage}));}
    }));
    listen(discoveryPicker.querySelector('[data-contribution-reader-pause]'),'click',()=>{
        cancelAutomaticContribution();
        contributionReaderSuppressed=true;discoveryMessage='Automatic reading is paused. Choose Start item reading to resume.';
        void stopOwnedDiscoveryCapture().catch(error=>warning(error.message));renderDiscoveryCapture();
    });
    function refreshContributionReader(){
        const active=contributionTab==='discoveries'&&Boolean(root.closest('.view.is-active'));
        contributionHistory.setActive(contributionTab==='history'&&Boolean(root.closest('.view.is-active')));
        if(active===contributionVisible)return;
        cancelAutomaticContribution();
        contributionVisible=active;contributionEnteredAt=Date.now();contributionIconCrop=null;discoveryMessage='';renderDiscoveryCapture();
        if(active&&!contributionReaderSuppressed)void prepareDiscoveryCapture().catch(error=>{if(!disposed){contributionReaderSuppressed=true;discoveryMessage=error.message;renderDiscoveryCapture();}});
        else void stopOwnedDiscoveryCapture().catch(error=>warning(error.message));
    }
    async function importScreenshot(mode,{source='file',equipSlotId=null,isCurrent=()=>true}={}){
        if(!capture)throw Error('Screenshot reading requires the desktop app.');
        const epoch=walkthroughEpoch,profileId=profiles.activeId(),current=()=>!disposed&&isCurrent()&&(!equipSlotId||augmentDialog.open)&&(mode!=='character'||epoch===walkthroughEpoch&&profileId===profiles.activeId());
        if(!current())return;
        if(!Number.isSafeInteger(captureState.generation)){const next=await capture.status();if(!current())return;captureState=next;renderCapture();}
        if(!current())return;
        const flow=walkthrough.snapshot(),sessionId=mode==='character'?(flow.active?flow.sessionId:captureState.characterSessionId||(captureState.owner==='character'&&captureState.sessionId)||(offlineCharacterSessionId||=globalThis.crypto.randomUUID())):undefined;
        const token=mode==='character'?{sessionId,equipSlotId,at:Date.now(),epoch:walkthroughEpoch,eligible:!flow.active||CHARACTER_ITEM_READ_STEPS.includes(flow.step),inactive:!flow.active,statsEligible:!equipSlotId&&flow.active&&flow.step==='stats',statsAfterAt:flow.statsAfterAt,captureGeneration:captureState.generation,captureSourceId:captureState.source?.id||null,captureSessionId:captureState.sessionId||''}:null;if(token)manualItemRead=token;
        try{const result=await capture.importImage({mode,source,...(sessionId?{sessionId}:{})});if(!current()||result.cancelled)return;
            if(mode==='character'&&!$('[data-character-editor]',characterRoot).contains(document.activeElement))renderCharacter();
            if(result.message)notify(result.message,{tone:result.records?.length?'success':'warning'});
            return result;
        }finally{if(manualItemRead===token)manualItemRead=null;}
    }
    const stepLabels={details:'Character details',inventory:'Inventory export',stats:'Stats and wiki gaps',review:'Save snapshot',complete:'Saved'};
    let inventoryGaps=[],gapCacheKey='';
    const flowCurrent=(epoch,sessionId,step)=>!disposed&&epoch===walkthroughEpoch&&walkthrough.snapshot().active&&walkthrough.snapshot().sessionId===sessionId&&walkthrough.snapshot().step===step;
    function stopInventoryWatch(){clearTimeout(inventoryTimer);inventoryTimer=null;inventoryWatchEpoch++;}
    function characterVisible(){const panel=characterRoot.closest('.view');return !panel||panel.classList.contains('is-active');}
    function watchInventory(){
        const flow=walkthrough.snapshot();if(disposed||!characterVisible()||!flow.active||flow.step!=='inventory'||!inventory||inventoryTimer||inventoryPolling)return;
        const revision=inventoryWatchEpoch;inventoryTimer=setTimeout(async()=>{inventoryTimer=null;inventoryPolling=true;
            try{await readInventoryFile(false,true,revision);}catch(error){if(!disposed&&revision===inventoryWatchEpoch){inventoryMessage=error.message;renderWalkthrough();}}
            finally{inventoryPolling=false;watchInventory();}
        },1200);
    }
    async function readInventoryFile(chooseFile=false,automatic=false,revision=inventoryWatchEpoch){
        if(!inventory)throw Error('Inventory file import requires the desktop app.');
        const flow=walkthrough.snapshot(),epoch=walkthroughEpoch,metadata=character.snapshot().metadata;
        if(!characterVisible()||revision!==inventoryWatchEpoch||!flow.active||flow.step!=='inventory')return;
        const current=()=>characterVisible()&&flowCurrent(epoch,flow.sessionId,'inventory')&&revision===inventoryWatchEpoch;
        const result=await inventory.read({name:metadata.name,server:metadata.server,...(chooseFile?{chooseFile:true}:{})});if(!current()||result?.cancelled)return;
        if(!result?.ok){inventoryMessage=result?.notFound?'Waiting for the game to create your inventory file. Type /outputfile inventory, or choose the file below.':result?.error||'The inventory file could not be read.';renderWalkthrough();return;}
        if(automatic&&result.file.modifiedAt<(flow.inventoryAfterAt||flow.startedAt)){inventoryMessage='An older export is present. Keep all gear equipped and type /outputfile inventory to create a fresh copy.';renderWalkthrough();return;}
        const parsed=parseInventoryExport(result.text),pack=getPack();
        const imported=character.applyInventoryExport(parsed,{file:result.file,resolveItem(entry){return resolveInventoryCatalog(pack,entry.baseName||entry.name,{socket:entry.group==='augment'});}});
        if(!imported.ok)throw Error(imported.error||'The inventory could not be imported. Your saved items are unchanged.');
        stopInventoryWatch();inventoryMessage='';gapCacheKey='';shareImage=null;lastStats=null;lastStatsManualRead=null;baseProposalId='';
        walkthrough.inventoryImported({sequence:cursor});walkthroughMessage='Inventory imported. Keep your gear equipped and open the full stat panel.';renderCharacter();
        await chooseSources();if(!flowCurrent(epoch,flow.sessionId,'stats'))return;walkthroughMessage='Follow the preparation steps, then start the stat reader.';renderWalkthrough();
    }
    async function startStatsReading(sourceId){
        const flow=walkthrough.snapshot();if(!flow.active||flow.step!=='stats'||!capture)return;
        const epoch=++walkthroughEpoch;manualItemRead=null;lastStats=null;lastStatsManualRead=null;baseProposalId='';sourceStart=null;
        walkthrough.restartStats({sequence:cursor});statsStarting=true;renderWalkthrough(true);
        try{await chooseSources();if(!flowCurrent(epoch,flow.sessionId,'stats'))return;
            sourceId=sourceId||flow.sourceId||sources.find(source=>source.recommended===true)?.id;
            if(!sourceId||!sources.some(source=>source.id===sourceId)){walkthroughMessage='Choose your game window below, then start the stat reader.';return;}
            walkthrough.source(sourceId);optIn=true;closeArea();
            const next=await capture.start({mode:'character',sourceId,sessionId:flow.sessionId,region:null,referenceSize:null});
            if(!flowCurrent(epoch,flow.sessionId,'stats')){if(captureState.owner==='character'&&captureState.sessionId===flow.sessionId)await stopCapture('character');return;}
            captureState=next;walkthroughMessage='Reading displayed stats. Keep the complete panel visible.';renderCapture();
        }finally{statsStarting=false;if(!disposed)renderWalkthrough();}
    }
    function refreshInventoryGaps(){
        const snapshot=character.snapshot(),pack=getPack(),key=JSON.stringify([snapshot.inventoryExport?.file?.sha256||'',snapshot.inventoryExport?.importedAt||0,pack.meta?.manifestVersion||'',pack.meta?.wikiEntitiesComplete]);
        if(key===gapCacheKey)return;gapCacheKey=key;
        const catalog=buildWikiEntityCatalog(pack),names=new Map();
        for(const entry of snapshot.inventoryExport?.rejectedItems||[])if(entry.reason==='wiki-item-missing'){const name=entry.baseName||entry.name;names.set(name.toLocaleLowerCase(),{name,tier:entry.tier});}
        inventoryGaps=[...names.values()].filter(entry=>!catalog.has('item',entry.name)).map(entry=>{const candidate=queue.add({kind:'item',name:entry.name,fields:{...(Number.isInteger(entry.tier)?{tier:entry.tier}:{})}});return {...entry,id:candidate?.id||''};});
        renderInventoryGaps();renderQueue();
    }
    function renderInventoryGaps(){
        const candidates=queue.snapshot(),visible=inventoryGaps.map((entry,index)=>({...entry,index})).filter(entry=>{
            const candidate=candidates.find(value=>value.id===entry.id);
            return candidate&&!entityIgnored({kind:'item',name:candidate.name})&&discoveryGate.project(candidate,{request:discoveryChecksActive()})?.reasons.includes('missing-page');
        });
        const host=$('[data-character-wiki-gaps]',characterRoot);host.hidden=!character.snapshot().inventoryExport||!visible.length;
        host.innerHTML=visible.length?'<h3>Wiki gaps</h3><p>These exported items were not found on the live wiki. Submit them through Contribute, then add them after the wiki updates and re-export.</p>'+visible.map(entry=>'<div class="character-wiki-gap"><strong>'+escape(entry.name)+'</strong><button type="button" class="secondary-button" data-inventory-contribute="'+entry.index+'">Open in Contribute</button></div>').join(''):'';
    }

    async function contributeInventoryItem(index){
        const entry=inventoryGaps[index];if(!entry)return;
        const current=queue.snapshot().find(candidate=>candidate.id===entry.id);if(!current)return;
        const signature=discoveryGate.signature(current);await discoveryGate.check(current);
        const latest=queue.snapshot().find(candidate=>candidate.id===entry.id);
        if(disposed||!latest||signature!==discoveryGate.signature(latest)||!discoveryGate.project(latest,{request:false})?.reasons.includes('missing-page'))return;
        const candidate=queue.add({kind:'item',name:entry.name},true);if(candidate)selectedId=candidate.id;
        renderQueue();renderCandidate();navigate('contribute');loadWiki();
        notify('Submit '+entry.name+' through Contribute. Once it is on the wiki, add it and re-export your character.',{tone:'success'});
    }
    function acceptsStatsRead(observation,token=lastStatsManualRead){
        if(!walkthrough.acceptsStats(observation))return false;if(observation.kind!=='manual')return true;
        const flow=walkthrough.snapshot(),generation=token?.captureGeneration;
        return Boolean(token?.statsEligible&&token.epoch===walkthroughEpoch&&token.sessionId===flow.sessionId&&token.at>=flow.statsAfterAt&&token.statsAfterAt===flow.statsAfterAt&&Number.isSafeInteger(generation)&&observation.input?.captureGeneration===generation+1&&[generation,generation+1].includes(captureState.generation)&&token.captureSourceId===(captureState.source?.id||null)&&token.captureSessionId===(captureState.sessionId||''));
    }
    function captureOptions(){return '<details class="walkthrough-options"><summary>Capture options</summary><div class="capture-actions"><button class="secondary-button" type="button" data-walkthrough-calibrate>Adjust OCR area</button><button class="secondary-button" type="button" data-character-import>Read a stats screenshot</button><button class="text-button" type="button" data-walkthrough-refresh-source>Refresh windows</button></div></details>';}
    function renderWalkthrough(force=false){
        const flow=walkthrough.snapshot(),snapshot=character.snapshot(),host=$('[data-walkthrough-stage]',characterRoot),key=JSON.stringify([flow.step,flow.active,flow.sessionId]);
        $('[data-walkthrough-steps]',characterRoot).innerHTML=CHARACTER_WALKTHROUGH_STEPS.filter(step=>step!=='complete').map(step=>'<li '+(step===flow.step?'aria-current="step"':'')+'>'+stepLabels[step]+'</li>').join('');
        if(force||key!==walkthroughStageKey){walkthroughStageKey=key;
            if(flow.step==='details')host.innerHTML='<h3>Choose your character</h3><p>Keep all your gear equipped throughout this walkthrough.</p><form class="character-metadata" data-character-metadata>'+[['name','Character name','text'],['server','Server','text'],['race','Race','text'],['classes','Class combination','text'],['level','Level','number'],['aaCount','AA count','number']].map(([name,label,type])=>'<label>'+label+'<input name="'+name+'" type="'+type+'" '+(['name','server','classes','level','aaCount'].includes(name)?'required':'')+' '+(type==='number'?'min="'+(name==='level'?1:0)+'" step="1" max="'+(name==='level'?125:1000000)+'"':'maxlength="100"')+' value="'+escape(Array.isArray(snapshot.metadata[name])?snapshot.metadata[name].join(' / '):snapshot.metadata[name]??'')+'"></label>').join('')+'<button class="primary-button" type="submit">Continue to inventory export</button></form>';
            else if(flow.step==='inventory')host.innerHTML='<h3>Export your equipped inventory</h3><p>Keep all your gear equipped. In EverQuest, type:</p><pre>/outputfile inventory</pre><p>Eye of Zomm automatically looks for <strong>'+escape((snapshot.metadata.name||'Name')+'_'+(snapshot.metadata.server||'server')+'-Inventory.txt')+'</strong> in your game folder.</p><p data-inventory-import-status role="status"></p><div class="capture-actions"><button class="secondary-button" data-inventory-read>Check now</button><button class="text-button" data-inventory-choose>Choose inventory file…</button></div>';
            else if(flow.step==='stats')host.innerHTML='<h3>Prepare your character sheet</h3><ol class="character-preparation"><li><strong>Open your Inventory.</strong></li><li><strong>Scroll down.</strong><span>Fit the whole stat panel, including Additional Modifiers. Keep the Inventory heading visible.</span></li><li><strong>Click off your buffs.</strong></li></ol><p>Keep all gear equipped. Use the Default Modern (default_modern) UI.</p><label>Game window<select data-walkthrough-source-select aria-label="Character stat capture source"></select></label><div class="capture-actions"><button class="secondary-button" data-walkthrough-read-stats>Read character stats</button></div><form data-walkthrough-stats><label>Displayed character stats<textarea data-walkthrough-stats-values rows="7" placeholder="Waiting for your displayed equipped stats…"></textarea></label><p data-walkthrough-stats-age class="settings-helper" role="status"></p><button class="primary-button">Use these stats and review</button></form>'+captureOptions();
            else if(flow.step==='review')host.innerHTML='<h3>Review your character</h3><p>Your gear came from the inventory export. These totals are the stats recorded from your game window; item values are never added together. You can fill wiki gaps below or save your character.</p><button class="primary-button" data-character-preview>Preview and save snapshot</button>';
            else host.innerHTML='<h3>Character saved</h3><p>Your inventory and recorded game stats stay saved for this character.</p><button class="primary-button" data-walkthrough-new>Update this character</button>';
        }
        if(flow.active&&flow.step==='inventory'){$('[data-inventory-import-status]',characterRoot).textContent=inventoryMessage||'Waiting for a fresh inventory export…';watchInventory();}else if(inventoryTimer||inventoryPolling)stopInventoryWatch();
        if(flow.step==='stats'){
            const select=$('[data-walkthrough-source-select]',characterRoot),previous=select.value||flow.sourceId,options='<option value="">Choose the game window</option>'+sources.map(source=>'<option value="'+escape(source.id)+'">'+escape(source.name)+'</option>').join('');if(select.innerHTML!==options)select.innerHTML=options;select.value=sources.some(source=>source.id===previous)?previous:sources.find(source=>source.recommended)?.id||'';
            const area=$('[data-walkthrough-stats-values]',characterRoot),proposal=lastStats&&acceptsStatsRead(lastStats)?lastStats:null;
            if(flow.statsDirty){if(area.value!==flow.statsDraft)area.value=flow.statsDraft;}else if(proposal&&proposal.id!==baseProposalId){area.value=Object.entries(characterObservationInput(proposal).stats).filter(([key])=>!/_CURRENT$/.test(key)).map(([key,value])=>characterStatLabel(key)+': '+(value??'?')).join('\n');baseProposalId=proposal.id;}else if(!proposal&&baseProposalId){area.value='';baseProposalId='';}
            $('[data-walkthrough-read-stats]',characterRoot).disabled=statsStarting;
            $('[data-walkthrough-stats-age]',characterRoot).textContent=flow.statsDirty?'Your reviewed edits are retained. Read stats again replaces this draft.':proposal?'Displayed stats captured. Review unread values, then continue.':statsStarting?'Starting the stat reader…':'Waiting for the full stat panel. Scroll Inventory down and hold it still, or read stats again.';
        }
        const statusHost=$('[data-walkthrough-status]',characterRoot),matches=captureState.owner==='character'&&captureState.sessionId===flow.sessionId;
        statusHost.textContent=[walkthroughMessage,flow.active&&flow.step==='stats'?(matches?(captureState.error||captureState.readWarning||(captureState.reconfiguring?'Updating capture area':captureState.phase==='running'?'Reading game stats at low frequency':'Reader '+captureState.phase)):'Choose the game window to read stats'):''].filter(Boolean).join(' · ');
        $('[data-walkthrough-back]',characterRoot).hidden=!flow.active||flow.step==='details';$('[data-character-stop]',characterRoot).hidden=!flow.active;refreshInventoryGaps();
    }


    async function finishWalkthrough(flowAtSave,epochAtSave){const current=walkthrough.snapshot();if(!flowAtSave?.active||flowAtSave.step!=='review'||!current.active||current.sessionId!==flowAtSave.sessionId||walkthroughEpoch!==epochAtSave)return;await stopCapture('character');const after=walkthrough.snapshot();if(after.active&&after.step==='review'&&after.sessionId===flowAtSave.sessionId&&walkthroughEpoch===epochAtSave){walkthrough.complete();walkthroughEpoch++;sourceStart=null;walkthroughMessage='Snapshot saved. Character reading has ended.';renderWalkthrough(true);}}
    function seedProfile(){if(profileSeeded)return;const profile=getProfile();if(profile.character||profile.name){character.setMetadata({name:profile.character||profile.name,classes:profile.classes||[],level:profile.level||null});profileSeeded=true;}}
    function reconcileCharacterCatalog(){
        const pack=getPack(),version=pack.meta?.manifestVersion||pack.meta?.version||'';
        if(!Array.isArray(pack.items)||!pack.items.length||pack.meta?.sample===true||catalogPackItems===pack.items&&catalogVersion===version)return;
        catalogPackItems=pack.items;catalogVersion=version;
        character.reconcileCatalog(card=>{const exact=resolveInventoryCatalog(pack,card.name);return exact.item?{status:'exact',...exact}:resolveCharacterCatalog(pack,card.name);});
    }
    function renderCharacterSelect(){
        const select=$('[data-character-select]',characterRoot),options=profiles.list().sort((a,b)=>a.name.localeCompare(b.name)||a.server.localeCompare(b.server));
        const html=options.map(profile=>`<option value="${escape(profile.id)}">${escape(profile.name)} (${escape(profile.server)})</option>`).join('')+'<option value="__new__">New character…</option>';
        if(select.innerHTML!==html)select.innerHTML=html;select.value=profiles.activeId()||'__new__';select.disabled=publishing||busy;
    }
    async function selectCharacter(id){
        if((profiles.activeId()||'__new__')===id)return;
        const epoch=++walkthroughEpoch;stopInventoryWatch();gapCacheKey='';inventoryMessage='';sourceListEpoch++;sourceStart=null;manualItemRead=null;lastStats=null;lastStatsManualRead=null;offlineCharacterSessionId='';closeArea();
        if(capture&&captureState.owner==='character')await stopCapture('character');
        if(disposed||epoch!==walkthroughEpoch)return;
        const result=id==='__new__'?profiles.newCharacter():profiles.select(id);if(!result.ok)throw Error(result.error);
        character=createCharacterModel({storage:profiles.storage,onWarning:warning});walkthrough=createCharacterWalkthrough({storage:profiles.storage,onWarning:warning});
        profileSeeded=Boolean(character.snapshot().metadata.name);gapCacheKey='';catalogPackItems=null;catalogVersion='';selectedCard='';matchResults=[];matchCardId='';baseProposalId='';walkthroughStageKey='';walkthroughMessage='';shareImage=null;uploadId=null;dragId='';paintDragTargets('');hideItemTooltip();
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
        if(!preserveStats)$('[data-character-stats]',characterRoot).innerHTML=`<form data-stat-form="current"><label>Recorded game values<textarea name="stats" rows="10">${escape(statText(snapshot.statSnapshots.current?.stats))}</textarea></label><button class="secondary-button">Save recorded stats</button></form>`;
        const baseForm=$('[data-stat-form="current"]',characterRoot);baseForm.onsubmit=event=>{event.preventDefault();try{character.setStatSnapshot('current',{stats:parseEditedStats(baseForm.elements.stats.value),confirmed:true,at:Date.now()});shareImage=null;renderCharacter();notify('Recorded character statistics saved.',{tone:'success'});}catch(error){warning(error.message);}};
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
        if(walkthrough.snapshot().active)walkthrough.chooseSlot?.(id,'__skip__');
        selectedCard=id;shareImage=null;hideItemTooltip();renderCharacter();
    }
    function assign(id,slotId,element,confirmed=false){
        if(!id){const prior=character.snapshot().equipment[slotId];if(prior)unequipItem(prior);return;}
        const result=character.assign(id,slotId,{replace:confirmed});
        const status=$('[data-character-placement-status]',characterRoot);status.replaceChildren();
        if(result.ok){if(walkthrough.snapshot().active)walkthrough.chooseSlot?.(id,slotId);shareImage=null;hideItemTooltip();renderCharacter();}
        else if(result.needsConfirmation){status.innerHTML=`<span class="capture-warning">${escape(result.error)}</span><button class="secondary-button" type="button">Confirm placement</button>`;status.querySelector('button').onclick=()=>assign(id,slotId,element,true);}
        else warning(result.error);
    }
    function cancelPendingItemTooltip(){clearTimeout(tooltipShowTimer);tooltipShowTimer=null;pendingTooltipButton=null;}
    function hideItemTooltip(){cancelPendingItemTooltip();clearTimeout(tooltipTimer);itemTooltip.hidden=true;}
    function scheduleItemTooltip(button){
        if(publishing||dragId)return;cancelPendingItemTooltip();clearTimeout(tooltipTimer);
        if(!itemTooltip.hidden&&tooltipCardId===button.dataset.editCard){clearTimeout(tooltipTimer);return;}
        itemTooltip.hidden=true;pendingTooltipButton=button;
        tooltipShowTimer=setTimeout(()=>{const target=pendingTooltipButton;cancelPendingItemTooltip();if(!disposed&&!publishing&&target?.isConnected&&target.matches(':hover')&&!dragId)showItemTooltip(target);},TOOLTIP_HOVER_DELAY_MS);
    }
    function deferHideItemTooltip(){cancelPendingItemTooltip();clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{if(!itemTooltip.matches(':hover')&&!itemTooltip.contains(document.activeElement))hideItemTooltip();},220);}
    function showItemTooltip(button){
        cancelPendingItemTooltip();clearTimeout(tooltipTimer);
        const card=character.snapshot().candidates.find(card=>card.id===button.dataset.editCard);if(!card)return hideItemTooltip();
        tooltipCardId=card.id;itemTooltip.innerHTML=characterItemTooltipMarkup(card);itemTooltip.hidden=false;
        const rect=button.getBoundingClientRect(),size=itemTooltip.getBoundingClientRect(),viewport=document.defaultView;
        itemTooltip.style.left=`${Math.max(8,Math.min(viewport.innerWidth-size.width-8,rect.right+12+size.width<viewport.innerWidth?rect.right+12:rect.left-size.width-12))}px`;
        itemTooltip.style.top=`${Math.max(8,Math.min(viewport.innerHeight-size.height-8,rect.top))}px`;
    }
    function updateTooltipTier(value){
        if(publishing||!tooltipCardId)return;const result=character.setTierPreview(tooltipCardId,{tier:value,fraction:0});if(!result.ok)return warning(result.error);
        shareImage=null;if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);
        const card=result.candidate,title=itemTooltip.querySelector('.character-item-detail-title'),stats=itemTooltip.querySelector('[data-tooltip-item-stats]');
        if(title)title.outerHTML=characterItemTitleMarkup(card);if(stats)stats.innerHTML=characterItemStatBodyMarkup(card);
        const output=itemTooltip.querySelector('[data-card-tier-value]');if(output)output.textContent='+'+card.tier;
        if(selectedCard===card.id){const editor=$('[data-character-editor]',characterRoot);editor.querySelector('[data-selected-item-title]').innerHTML=characterItemTitleMarkup(card);editor.querySelector('[data-selected-item-stats]').innerHTML=characterItemStatBodyMarkup(card);editor.querySelector('[data-card-tier]').value=card.tier;editor.querySelector('[data-card-tier-value]').textContent='+'+card.tier;}
        updateCharacterItemTierMarkup(characterRoot,card);
    }
    listen(itemTooltip,'input',event=>{if(event.target.matches('[data-card-tier]'))updateTooltipTier(Number(event.target.value));});
    listen(itemTooltip,'click',event=>{const card=character.snapshot().candidates.find(item=>item.id===tooltipCardId);if(!card||publishing)return;if(event.target.closest('[data-card-observed-basis]')){const result=character.setObservedBasis(card.id);if(result.ok)itemTooltip.querySelector('[data-tooltip-item-stats]').innerHTML=characterItemStatBodyMarkup(result.candidate);}});
    function commitSocketChange(result,id){
        if(!result.ok)return warning(result.error);
        if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);
        selectedCard=id;shareImage=null;hideItemTooltip();renderCharacter();
    }
    function openAugmentPicker(id,index=null){
        if(publishing)return;
        const card=character.snapshot().candidates.find(item=>item.id===id);if(!card)return;
        hideItemTooltip();augmentCatalog?.dispose();augmentCatalog=null;augmentDialog.onpaste=null;
        const epoch=walkthroughEpoch,activeId=profiles.activeId(),picker=++pickerEpoch;
        const current=()=>!disposed&&augmentDialog.open&&picker===pickerEpoch&&epoch===walkthroughEpoch&&activeId===profiles.activeId()&&character.snapshot().candidates.some(item=>item.id===id);
        augmentDialog.innerHTML=`<div class="panel-heading"><h2>${index===null?'Exaltation slots':`Exaltation slot ${index+1}`} · ${escape(characterItemLabel(card))}</h2><button type="button" class="text-button" data-augment-close>Close</button></div>${index===null?`<form data-augment-capacity-form><label>Number of Exaltation slots<input name="capacity" type="number" min="0" max="8" step="1" value="${card.augmentSlots??''}" required></label><button class="primary-button">Save slots</button></form>`:'<section data-augment-catalog></section>'}`;
        augmentDialog.querySelector('[data-augment-close]').onclick=()=>augmentDialog.close();
        if(index===null){augmentDialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(!current())return augmentDialog.close();const result=character.setAugmentSlots(id,Number(event.target.elements.capacity.value));if(result.ok){augmentDialog.close();commitSocketChange(result,id);}else warning(result.error);};}
        else{
            augmentCatalog=mountCharacterCatalog({host:augmentDialog.querySelector('[data-augment-catalog]'),getPack,onAdd(input){
                if(!current()||publishing)return{ok:false,error:'The selected character or item changed. Open its Exaltation slot again.'};
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
        augmentDialog.innerHTML='<div class="panel-heading"><h2>Add item · '+escape(slot.label)+'</h2><button type="button" class="text-button" data-augment-close>Close</button></div><p class="settings-helper">Search known wiki items and choose a tier. Submit missing items through Contribute, then add them after the wiki is updated.</p><section data-equipment-catalog></section>';
        augmentDialog.querySelector('[data-augment-close]').onclick=()=>augmentDialog.close();
        const pack=getPack(),items=slot.universal?pack.items:(pack.items||[]).filter(item=>{try{return characterSlotCompatibility(characterCatalogCard(item),slotId).compatible;}catch{return false;}});
        augmentCatalog=mountCharacterCatalog({host:augmentDialog.querySelector('[data-equipment-catalog]'),getPack:()=>({...getPack(),items}),purpose:'equipment',onAdd(input){
            if(!current()||publishing)return{ok:false,error:'The selected character changed. Open the equipment slot again.'};
            const result=character.intake(input);if(!result.ok)return result;
            if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);
            const placement=character.assign(result.candidate.id,slotId);if(placement.ok&&walkthrough.snapshot().active)walkthrough.chooseSlot?.(result.candidate.id,slotId);
            augmentDialog.close();selectedCard=result.candidate.id;shareImage=null;renderCharacter();if(!placement.ok)warning(placement.error+' The new item is in Inventory.');return result;
        }});
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
            if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);
            shareImage=null;renderCharacter();notify(`Matched ${characterItemLabel(result.candidate)}.`,{tone:'success'});
        });
    }
    function renderCharacterEditor(){
        const card=character.snapshot().candidates.find(item=>item.id===selectedCard),host=$('[data-character-editor]',characterRoot);if(!card){host.replaceChildren();return;}
        host.innerHTML=`<section class="wiki-itembox"><div data-selected-item-title>${characterItemTitleMarkup(card)}</div>${characterTierControlsMarkup(card)}<div data-selected-item-stats>${characterItemStatBodyMarkup(card)}</div></section><details data-item-match-picker="${escape(card.id)}" class="character-item-match-picker" ${characterEquipmentEligibility(card).known?'':'open'}><summary>${characterEquipmentEligibility(card).known?'Change wiki match':'Choose a wiki match'}</summary><p class="${characterEquipmentEligibility(card).known?'settings-helper':'character-match-warning'}">${characterEquipmentEligibility(card).known?'Known wiki item. Choose a different match if needed.':'Choose the matching wiki item before equipping. Your captured values stay intact.'}</p><label>Find item match<input type="search" data-item-match-query placeholder="Search cached items" autocomplete="off"></label><div data-item-match-results></div></details><div class="capture-actions character-item-actions">${Object.values(character.snapshot().equipment).includes(card.id)?'<button type="button" class="secondary-button" data-card-unequip>Unequip</button>':characterEquipmentEligibility(card).canEquip?`<label>Equip to<select data-card-equip-slot>${CHARACTER_SLOTS.filter(slot=>characterSlotCompatibility(card,slot.id).compatible).map(slot=>`<option value="${slot.id}">${escape(slot.label)}</option>`).join('')}</select></label><button type="button" class="primary-button" data-card-equip>Equip</button>`:''}<button class="text-button" type="button" data-duplicate-card>Second copy</button><button class="text-button" type="button" data-remove-card>Remove item</button></div><details class="character-advanced-editor"><summary>Edit captured values</summary><form class="character-card-editor"><h3>Review ${escape(characterItemLabel(card))}</h3><div class="capture-form-grid"><label>Item name<input name="name" value="${escape(card.name)}" maxlength="240"></label><label>Compatible slots<input name="slots" value="${escape(card.slots.join(', '))}"></label><label>Required level<input name="level" type="number" min="0" max="125" value="${card.level??''}"></label></div><label>Written item stat block<textarea name="rawStatBlock" maxlength="8192" rows="8">${escape(card.rawStatBlock||statText(card.observedStats))}</textarea></label><p class="settings-helper">All captured item text is kept here. Correct an explicit number, including Haste %, then save to re-read that text. Unread or conflicting numbers stay unknown.</p><details><summary>Parsed values and Exaltations</summary><label>Observed numeric values<textarea name="stats" rows="7">${escape(statText(card.observedStats))}</textarea></label><label>Stat block coverage<select name="complete"><option value="partial" ${!card.observedStatsComplete?'selected':''}>Partial / unread values remain unknown</option><option value="complete" ${card.observedStatsComplete?'selected':''}>I reviewed every numeric stat</option></select></label></details><details><summary>Wiki match and optional base values</summary><label>Wiki item title<input name="wikiTitle" value="${escape(card.wikiTitle)}" maxlength="240"></label><label>Wiki match<select name="wikiMatch"><option value="suggested" ${card.wikiMatch!=='confirmed'?'selected':''}>Suggested / needs review</option><option value="confirmed" ${card.wikiMatch==='confirmed'?'selected':''}>I verified this item match</option></select></label><p class="settings-helper">Captured examine values are retained when changing tiers.</p><label>Base item stats<textarea name="baseStats" rows="5">${escape(statText(card.baseStats))}</textarea></label><label>Base stat coverage<select name="baseComplete"><option value="partial" ${!card.baseStatsComplete?'selected':''}>Partial / unknown</option><option value="complete" ${card.baseStatsComplete?'selected':''}>All base values reviewed</option></select></label></details><div class="capture-actions"><button class="primary-button">Save item</button></div></form></details>`;
        const updateTierView=result=>{
            if(!result.ok)return warning(result.error);
            if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);
            shareImage=null;hideItemTooltip();renderCharacter({preserveEditor:true});
            const current=result.candidate,range=host.querySelector('[data-card-tier]');
            host.querySelector('[data-selected-item-title]').innerHTML=characterItemTitleMarkup(current);
            host.querySelector('[data-selected-item-stats]').innerHTML=characterItemStatBodyMarkup(current);
            range.value=current.tier??0;host.querySelector('[data-card-tier-value]').textContent=`+${current.tier??0}`;

        };
        host.querySelector('[data-card-tier]').oninput=event=>{if(!publishing)updateTierView(character.setTierPreview(card.id,{tier:Number(event.target.value),fraction:0}));};
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
            if(!result.ok)throw Error(result.error);if(walkthrough.snapshot().active)walkthrough.rememberItem?.(result.candidate);shareImage=null;renderCharacter();if(parsed?.warnings.length)warning(parsed.warnings.join(' '));
        }catch(error){warning(error.message);}};
        host.querySelector('[data-duplicate-card]').onclick=()=>{if(publishing)return;const result=character.duplicateCandidate(card.id);if(!result.ok)return warning(result.error);if(walkthrough.snapshot().active){walkthrough.rememberItem?.(result.candidate);character.autoAssign(result.candidate.id);}selectedCard=result.candidate.id;shareImage=null;renderCharacter();};
        host.querySelector('[data-remove-card]').onclick=()=>{if(publishing)return;walkthrough.removeItem?.(card);character.removeCandidate(card.id);selectedCard='';shareImage=null;renderCharacter();};
    }
    function renderStatProposal(){$('[data-stat-proposal]',characterRoot).replaceChildren();}
    function readerMatches(observation,candidate=selected()){
        const resolver=contributionResolver();
        return contributionReaderMatches(observation,{capture:captureState,candidate,startedAt:contributionEnteredAt,resolveName:name=>resolver.resolve('item',name).canonicalTitle||name});
    }
    function renderReaderCandidate(){
        const active=document.activeElement,field=active?.closest?.('[data-field-key]')?.dataset.fieldKey,name=active?.name;
        const selection=typeof active?.selectionStart==='number'?{start:active.selectionStart,end:active.selectionEnd}:null;
        renderCandidate();
        const target=field?$(`[data-field-key="${CSS.escape(field)}"] [data-field-value]`):name?$(`[name="${CSS.escape(name)}"]`):null;
        if(target&&root.contains(active)===false){target.focus({preventScroll:true});if(selection&&target.setSelectionRange)try{target.setSelectionRange(selection.start,selection.end);}catch{/* Numeric/select inputs have no text selection. */}}
    }
    async function stageReaderEvidence(observation,candidate){
        const descriptor=observation.input?.captureEvidence;
        if(busy||publishing||contributionEvidencePending||!descriptor||!capture?.itemEvidence||!readerMatches(observation,candidate))return;
        const id=candidate.id,epoch=contributionEvidenceEpoch,review=reviewEpoch,current=()=>!disposed&&!busy&&!publishing&&epoch===contributionEvidenceEpoch&&review===reviewEpoch&&contributionVisible&&!contributionReaderSuppressed&&selectedId===id&&readerMatches(observation);
        contributionEvidencePending=true;
        try{
            const evidence=await capture.itemEvidence(descriptor);if(!current())return;
            const latest=selected();
            if(evidence?.iconDataUrl&&!latest.fields.iconId?.edited&&!latest.fields.iconId?.confirmed&&!latest.fields.iconId?.value){
                contributionIconCrop={candidateId:id,dataUrl:evidence.iconDataUrl};
                void contributionIcons?.readDataUrl(evidence.iconDataUrl);
            }
            if(!latest.attachment&&!dismissedCaptureImages.has(id)&&wiki?.prepareAttachment){
                const result=await wiki.prepareAttachment({candidateId:id,kind:'item',source:'capture',captureEvidence:descriptor});
                if(result?.cancelled)return;
                const destination=selected();
                if(!current()||destination?.attachment||dismissedCaptureImages.has(id)){
                    if(result?.attachmentId)await wiki.discardAttachment?.({attachmentId:result.attachmentId});return;
                }
                queue.update(id,{attachment:{...result,caption:'',license:'own-screenshot'},planId:null});invalidatePlan();renderReaderCandidate();
            }
        }catch{/* Missing/stale crops keep the ordinary Select/Paste options available. */}
        finally{contributionEvidencePending=false;}
    }
    async function publishFreshItem(observation){
        const candidate=selected();
        if(!automaticContributions||busy||publishing||!contributionVisible||contributionReaderSuppressed||
            manuallyEditedContributions.has(candidate?.id)||candidate?.kind!=='item'||candidate.intent!=='create'||candidate.membership!=='missing'||
            candidate.planId||!['needs-review',''].includes(candidate.status||'')||!observation.input?.captureEvidence||!readerMatches(observation,candidate))return;
        const epoch=contributionEvidenceEpoch,review=reviewEpoch,id=candidate.id;
        await automaticContributions.attempt({candidate,observation,isCurrent:planId=>{
            const latest=selected();return !disposed&&contributionVisible&&!contributionReaderSuppressed&&selectedId===id&&
                !manuallyEditedContributions.has(id)&&epoch===contributionEvidenceEpoch&&review===reviewEpoch&&
                (!latest?.planId||latest.planId===planId)&&readerMatches(observation,{...latest,planId:null});
        }});
    }
    function intake(observation,{replaying=false}={}){
        if(disposed||!observation)return;cursor=Math.max(cursor,Number(observation.sequence)||0);
        if(observation.owner==='character'&&observation.subject?.kind==='item')return;
        if(observation.owner==='character'&&observation.subject?.kind==='character'){
            if(walkthrough.snapshot().active){const token=manualItemRead?.epoch===walkthroughEpoch&&manualItemRead.sessionId===observation.sessionId?manualItemRead:null;if(!replaying&&acceptsStatsRead(observation,token)){lastStats=observation;lastStatsManualRead=observation.kind==='manual'?token:null;renderWalkthrough();}}
            else if(!replaying&&observation.kind==='manual'){
                const token=manualItemRead,at=Date.parse(observation.capturedAt||''),generation=token?.captureGeneration;
                if(token?.inactive&&!token.equipSlotId&&token.eligible&&token.epoch===walkthroughEpoch&&token.sessionId===observation.sessionId&&Number.isFinite(at)&&at>=token.at&&at<=Date.now()&&Number.isSafeInteger(generation)&&generation>=0&&observation.input?.captureGeneration===generation+1&&[generation,generation+1].includes(captureState.generation)&&token.captureSourceId===(captureState.source?.id||null)&&token.captureSessionId===(captureState.sessionId||'')){lastStats=observation;renderStatProposal();}
            }
        }else{
            const liveItem=!replaying&&observation.owner==='contribution'&&observation.kind==='ocr'&&observation.subject?.kind==='item'&&observation.parser?.name==='item-examine';
            if(liveItem&&(busy||publishing)){
                // Preparing/publishing a review freezes its draft. Actual live
                // evidence can still finish an explicit discovery notice.
                try{onDiscoveryItem(observation);}catch(error){warning(error.message||'The discovery item could not be updated.');}return;
            }
            const matching=liveItem&&contributionVisible&&!contributionReaderSuppressed&&readerMatches(observation);
            // The automatic editor reader fills only the selected matching item.
            // Explicit linked-item requests retain their separate evidence flow.
            if(liveItem&&contributionVisible&&!matching&&!itemDiscoveryRequests().length)return;
            const current=matching?saveCandidate():null;
            const candidate=queue.consume(current?{...observation,subject:{...observation.subject,name:current.name}}:observation);
            if(candidate){if(!replaying)void discoveryGate.check(candidate);if(!selectedId)selectedId=candidate.id;renderQueue();if(matching){
                const known=getPack().items?.find(item=>normalizeWikiIdentity(itemExaltationBaseIdentity(item.wikiTitle||item.name))===normalizeWikiIdentity(itemExaltationBaseIdentity(current.name)));
                if(/^\d{1,7}$/.test(String(known?.iconId))&&!candidate.fields.iconId?.edited&&!candidate.fields.iconId?.confirmed&&!candidate.fields.iconId?.value)queue.update(candidate.id,{fields:{...candidate.fields,iconId:{value:Number(known.iconId),confirmed:false}}});
                invalidatePlan();renderReaderCandidate();
            }else if(!selected()||!root.contains(document.activeElement))renderCandidate();}
            const completed=()=>{if(liveItem)try{onDiscoveryItem(observation);}catch(error){warning(error.message||'The discovery item could not be updated.');}};
            if(matching&&candidate)void stageReaderEvidence(observation,candidate).then(()=>publishFreshItem(observation)).finally(completed);else completed();
        }
    }
    async function replay(){if(!capture)return;const epoch=walkthroughEpoch;let after=0;for(let page=0;page<30&&!disposed;page++){const result=await capture.read({afterSequence:after,limit:200});if(disposed||epoch!==walkthroughEpoch)return;for(const record of result.records||[])intake(record,{replaying:true});const last=result.records?.at(-1)?.sequence;if(!last||last<=after||last>=result.lastSequence)break;after=last;}}
    async function preview(){
        const snapshot=character.snapshot(),sheet=buildCharacterWikiSheet(snapshot);
        shareImage=await renderCharacterShare(snapshot,{document,appearance:getAppearance(),resolveIcon:id=>getPack().icons?.[id]});shareSheet=sheet;uploadId=null;
        dialog.querySelector('[data-share-inspect]').innerHTML=characterInspectMarkup(sheet,{icons:getPack().icons,items:getPack().items});
        dialog.querySelector('[data-share-image]').src=shareImage.dataUrl;dialog.querySelector('[data-share-caption]').value='';
        dialog.querySelector('[data-share-upload]').disabled=false;dialog.querySelector('[data-share-upload]').textContent='Share on my User page';
        shareStatus('Review your equipment, augments and totals. Raw OCR text and loose inventory stay private.');dialog.showModal();
    }
    async function uploadSnapshot(){
        // Clicking Share authorizes this reviewed sheet; PNG export stays local.
        if(!shareImage||!shareSheet)throw Error('Create a fresh character inspect preview first.');
        await refreshAccount();if(!account?.authenticated)throw Error('Log in to the wiki in Contribute to Wiki first. Your character preview remains local.');
        if(!wiki.shareCharacter)throw Error('Restart Eye of Zomm to load interactive character sharing.');
        shareStatus('Checking wiki support and updating this character on your User page.');setPublishing(true);
        try{
            const result=await wiki.shareCharacter({sheet:shareSheet,caption:dialog.querySelector('[data-share-caption]').value,confirmed:true,shareId:uploadId});uploadId=result.shareId||uploadId;
            const complete=result.status==='applied';
            shareStatus(complete?(result.reused?'This character sheet is already up to date.':'Your interactive character sheet is shared on your wiki User page.'):'The wiki has not confirmed the character update'+(result.error?.message?': '+result.error.message:'.')+' Retry checks the existing sheet before editing again.',!complete);
            const host=dialog.querySelector('[data-share-status]'),link=document.createElement('a');link.textContent='Open my User page';link.href='https://eqlwiki.com/'+encodeURIComponent('User:'+account.user.name);link.target='_blank';link.rel='noopener';host.append(document.createTextNode(' · '),link);
            const button=dialog.querySelector('[data-share-upload]');button.textContent=complete?'Character shared':'Retry character update';button.disabled=complete;
            if(complete)await finishWalkthrough(walkthrough.snapshot(),walkthroughEpoch);
        }finally{setPublishing(false);}
    }
    listen($('[data-contribution-filters]'),'change',event=>{const input=event.target.closest('[data-gap-filter]');if(!input||publishing)return;saveCandidate();enabledGaps=input.checked?[...new Set([...enabledGaps,input.dataset.gapFilter])]:enabledGaps.filter(key=>key!==input.dataset.gapFilter);try{storage?.setItem(filterKey,JSON.stringify(enabledGaps));}catch{}const visible=queueRows();if(!visible.some(candidate=>candidate.id===selectedId))selectedId=visible[0]?.id||'';matches=null;invalidatePlan();renderQueue();renderCandidate();});
    listen(root,'click',event=>{const dismiss=event.target.closest('[data-dismiss-discovery]'),forever=event.target.closest('[data-ignore-forever]');if(dismiss||forever){event.preventDefault();event.stopPropagation();if(forever)void act(()=>ignoreForever(forever.dataset.ignoreForever));else dismissDiscovery(dismiss.dataset.dismissDiscovery);return;}const row=event.target.closest('[data-candidate-id]');if(row&&!publishing){matches=null;selectContribution(row.dataset.candidateId);}});
    listen($('[data-add-contribution]'),'submit',event=>{event.preventDefault();if(publishing)return;const data=new FormData(event.target),candidate=queue.add({kind:data.get('kind'),name:data.get('name')},true);if(candidate){selectedId=candidate.id;invalidatePlan();event.target.reset();renderQueue();renderCandidate();}});
    listen($('[data-wiki-login]'),'click',()=>void act(async()=>{if(account?.authenticated)await wiki.logout();else await wiki.login();await refreshAccount();}));listen($('[data-wiki-refresh]'),'click',()=>void act(refreshAccount));
    listen($('[data-capture-opt-in]',settingsRoot),'change',event=>{optIn=event.target.checked;$('.capture-settings-controls',settingsRoot).hidden=!optIn;if(!optIn){contributionReaderSuppressed=true;void stopCapture().catch(error=>warning(error.message));}});
    listen($('[data-capture-sources]',settingsRoot),'click',refreshSources);listen($('[data-capture-start]',settingsRoot),'click',()=>void act(()=>{contributionReaderSuppressed=false;contributionEnteredAt=Date.now();discoveryMessage='';return start('contribution');}));listen($('[data-capture-stop]',settingsRoot),'click',()=>{contributionReaderSuppressed=true;void stopCapture().catch(error=>warning(error.message));});listen($('[data-capture-pause]',settingsRoot),'click',()=>void act(async()=>{const resuming=captureState.phase==='paused';contributionReaderSuppressed=!resuming;if(!resuming)cancelAutomaticContribution();captureState=await (resuming?capture.resume():capture.pause());if(resuming){contributionEnteredAt=Date.now();discoveryMessage='';}renderCapture();renderDiscoveryCapture();}));listen($('[data-capture-import]',settingsRoot),'click',()=>void act(()=>importScreenshot('contribution')));
    listen(root,'paste',event=>{if(event.defaultPrevented||event.target.closest('.wiki-icon-finder')||!event.clipboardData?.types?.includes('Files')||!selected()||publishing)return;event.preventDefault();$('[data-contribution-paste]')?.click();});
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
        if(event.target.matches('[data-character-metadata]')){event.preventDefault();void act(async()=>{
            const data=new FormData(event.target),patch={name:data.get('name'),server:data.get('server'),race:data.get('race'),level:Number(data.get('level')),aaCount:Number(data.get('aaCount')),classes:String(data.get('classes')).split(/\s*[/,]\s*/).filter(Boolean)};
            if(!patch.name?.trim()||!patch.server?.trim()||!patch.classes.length||!Number.isInteger(patch.level)||patch.level<1||patch.level>125||!Number.isInteger(patch.aaCount)||patch.aaCount<0||patch.aaCount>1000000)throw Error('Enter character name, server, classes, level and AA count.');
            const registered=profiles.register(patch);if(!registered.ok)throw Error(registered.error);
            character.setMetadata(patch);if(!walkthrough.snapshot().active){walkthrough.begin();walkthroughEpoch++;}
            profileSeeded=true;shareImage=null;inventoryMessage='';walkthrough.advance();walkthroughMessage='Keep your gear equipped and create a fresh inventory export.';renderCharacter();
        });}else if(event.target.matches('[data-walkthrough-stats]')){event.preventDefault();void act(async()=>{
            const stats=parseEditedStats(event.target.querySelector('[data-walkthrough-stats-values]').value);
            if(!Object.values(stats).some(Number.isFinite))throw Error('Read or enter the displayed character statistics before continuing.');
            character.setStatSnapshot('current',{stats,confirmed:true,evidence:lastStats,at:Date.now()});walkthrough.acceptStats();walkthrough.advance();lastStats=null;baseProposalId='';shareImage=null;
            if(captureState.owner==='character')await stopCapture('character');walkthroughMessage='Recorded game stats saved. Item stats are not added to these totals.';renderCharacter();
        });}
    });
    listen(characterRoot,'mouseover',event=>{const button=event.target.closest('[data-edit-card]');if(button&&!button.contains(event.relatedTarget))scheduleItemTooltip(button);});
    listen(characterRoot,'mouseout',event=>{const button=event.target.closest('[data-edit-card]');if(button&&!button.contains(event.relatedTarget))deferHideItemTooltip();});
    listen(characterRoot,'focusin',event=>{const button=event.target.closest('[data-edit-card]');if(button)showItemTooltip(button);});
    listen(characterRoot,'focusout',deferHideItemTooltip);listen(document,'scroll',event=>{if(!itemTooltip.contains(event.target))hideItemTooltip();},true);listen(document,'keydown',event=>{if(event.key==='Escape')hideItemTooltip();});
    listen(characterRoot,'input',event=>{if(event.target.matches('[data-walkthrough-stats-values]'))walkthrough.editStats(event.target.value);});
    listen(characterRoot,'focusout',()=>queueMicrotask(()=>{if(disposed||!characterRefreshPending&&!walkthroughSlotsPending)return;const protectedFocus=['[data-character-editor]','[data-character-slots]','[data-character-stats]','[data-walkthrough-slot-choices]'].some(selector=>$(selector,characterRoot)?.contains(document.activeElement));if(!protectedFocus)renderCharacter();}));
    listen(characterRoot,'change',event=>{if(event.target.matches('[data-walkthrough-source-select]'))walkthrough.source(event.target.value);});
    listen(characterRoot,'click',event=>{const button=event.target.closest('button');if(!button||publishing)return;
        if(button.matches('[data-character-stop]')){walkthroughEpoch++;sourceListEpoch++;stopInventoryWatch();walkthrough.cancel();walkthroughMessage='Walkthrough canceled. Your imported items remain saved.';if(captureState.owner==='character')void stopCapture('character').catch(error=>warning(error.message));renderWalkthrough(true);}
        else if(button.matches('[data-walkthrough-back]')){walkthroughEpoch++;stopInventoryWatch();walkthrough.back();lastStats=null;baseProposalId='';inventoryMessage='';walkthroughMessage='';renderWalkthrough(true);}
        else if(button.matches('[data-walkthrough-new],[data-character-reimport]'))void act(async()=>{walkthroughEpoch++;stopInventoryWatch();if(captureState.owner==='character')await stopCapture('character');walkthrough.begin();walkthrough.advance();inventoryMessage='';lastStats=null;baseProposalId='';renderCharacter();});
        else if(button.matches('[data-inventory-read]'))void act(()=>readInventoryFile());
        else if(button.matches('[data-inventory-choose]'))void act(()=>readInventoryFile(true));
        else if(button.matches('[data-walkthrough-refresh-source]'))refreshSources();
        else if(button.matches('[data-walkthrough-read-stats]'))void act(()=>startStatsReading($('[data-walkthrough-source-select]',characterRoot)?.value));
        else if(button.matches('[data-walkthrough-calibrate]'))void openArea();
        else if(button.matches('[data-character-import]'))void act(()=>importScreenshot('character'));
        else if(button.matches('[data-character-preview]'))void act(preview);
        else if(button.matches('[data-inventory-contribute]'))void act(()=>contributeInventoryItem(Number(button.dataset.inventoryContribute)));
        else if(button.matches('[data-character-clear]'))void act(async()=>{
            if(!globalThis.confirm('Clear all inventory and equipment for this character? Other characters and contribution drafts will stay saved.'))return;
            walkthroughEpoch++;stopInventoryWatch();if(captureState.owner==='character')await stopCapture('character');character.clearInventory();walkthrough.cancel();selectedCard='';lastStats=null;lastStatsManualRead=null;baseProposalId='';gapCacheKey='';inventoryMessage='';shareImage=null;hideItemTooltip();renderCharacter();notify('This character’s inventory was cleared.',{tone:'success'});
        });
        else if(button.matches('[data-inventory-remove]')){const card=character.snapshot().candidates.find(c=>c.id===button.dataset.inventoryRemove);if(card){walkthrough.removeItem?.(card);character.removeCandidate(card.id);if(selectedCard===card.id)selectedCard='';shareImage=null;renderCharacter();}}
        else if(button.matches('[data-inventory-copy]')){const result=character.duplicateCandidate(button.dataset.inventoryCopy);if(result.ok){if(walkthrough.snapshot().active){walkthrough.rememberItem?.(result.candidate);character.autoAssign(result.candidate.id);}shareImage=null;renderCharacter();}else warning(result.error);}
    });
    listen(dialog.querySelector('[data-share-close]'),'click',()=>{if(!publishing)dialog.close();});listen(dialog,'cancel',event=>{if(publishing)event.preventDefault();});listen(dialog.querySelector('[data-share-copy]'),'click',()=>void act(async()=>{if(!shareImage)throw Error('Preview a character image first.');const flow=walkthrough.snapshot(),epoch=walkthroughEpoch;await share.copyPng(shareImage.dataUrl);await finishWalkthrough(flow,epoch);shareStatus('Character PNG copied to your clipboard.');}));listen(dialog.querySelector('[data-share-save]'),'click',()=>void act(async()=>{if(!shareImage)throw Error('Preview a character image first.');const flow=walkthrough.snapshot(),epoch=walkthroughEpoch,result=await share.savePng(shareImage.dataUrl);if(result.ok)await finishWalkthrough(flow,epoch);shareStatus(result.ok?'Character PNG saved.':'Save canceled. Capture remains active.');}));listen(dialog.querySelector('[data-share-upload]'),'click',()=>void act(uploadSnapshot));
    if(wiki?.onAutomaticSourceResult){
        const receipt=document.createElement('div');receipt.className='contribution-latest-result';receipt.hidden=true;receipt.setAttribute('aria-live','polite');discoveryPicker.after(receipt);
        unsubscribers.push(wiki.onAutomaticSourceResult(result=>{
            if(!disposed&&result?.status==='quiet'){
                if(queue.recordAutomaticSourceDecision(result)){renderQueue();if(!busy&&!publishing&&selectedId&&!queueRows().some(candidate=>candidate.id===selectedId)){selectedId=queueRows()[0]?.id||'';renderCandidate();}}
                return;
            }
            if(disposed||!['submitted','deferred','needs-attention'].includes(result?.status))return;
            const hasAttempt=result.status==='submitted'||result.plan?.pages?.some(page=>['applied','unknown','failed'].includes(page.status));
            if(hasAttempt)contributionHistory.markChanged();
            const source={...result,itemTitle:result.itemTitle||result.item,npcTitle:result.npcTitle||result.npc,zoneTitle:result.zoneTitle||result.zone};
            if([source.itemTitle,source.npcTitle,source.zoneTitle].some(value=>typeof value!=='string'||!value.trim()||value.length>240))return;
            const key=automaticSourceReceiptKey(source,{resolver:contributionResolver()});
            if(result.status==='submitted')queue.recordAutomaticSourceReceipt(source);
            else if(key)for(const candidate of queue.snapshot()){
                // Reopen only a previously finished source-only task. Other
                // review work, manual fields and pending plans remain intact.
                if(candidate.status!=='submitted'||manuallyEditedContributions.has(candidate.id))continue;
                const keys=automaticSourceDraftKeys({...candidate,status:'needs-review',planId:null},{resolver:contributionResolver()});
                if(keys?.includes(key)&&!queue.sourceReceiptKeys().includes(key))queue.update(candidate.id,{status:'needs-review',planId:null});
            }
            const link=title=>`<a href="https://eqlwiki.com/${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`;
            const label=result.status==='submitted'?'Drop source recorded':'Drop source needs review';
            const summary=`<strong>${label}</strong> · ${link(source.itemTitle)} → ${link(source.npcTitle)}`;
            if(!hasAttempt&&(!key||!visibleQueueCandidates().some(candidate=>automaticSourceDraftKeys(candidate,{resolver:contributionResolver()})?.includes(key)))){receipt.hidden=true;receipt.innerHTML='';delete receipt.dataset.automaticReviewKey;renderQueue();return;}
            if(!hasAttempt)receipt.dataset.automaticReviewKey=key;else delete receipt.dataset.automaticReviewKey;
            receipt.hidden=result.status==='submitted';receipt.classList.toggle('capture-warning',result.status!=='submitted');
            receipt.innerHTML=`<div><p>${summary}</p>${result.reason?`<p class="settings-helper">${escape(String(result.reason).slice(0,600))}</p>`:''}</div>${hasAttempt?'<button type="button" class="text-button" data-open-contribution-history>View history</button>':'<span class="settings-helper">Review this item in Discoveries.</span>'}`;renderQueue();
            if(!busy&&!publishing&&selectedId&&!queueRows().some(candidate=>candidate.id===selectedId)){selectedId=queueRows()[0]?.id||'';renderCandidate();}
            notify(`${label}: ${source.itemTitle} → ${source.npcTitle} (${source.zoneTitle}).`,{tone:result.status==='submitted'?'success':'warning'});
        })||(()=>{}));
    }
    if(wiki?.prepareCapturedItem&&wiki?.submitCapturedItem&&wiki?.cancelCapturedItem)automaticContributions=createAutomaticItemContribution({
        prepare:input=>wiki.prepareCapturedItem(input),submit:input=>wiki.submitCapturedItem(input),cancel:input=>wiki.cancelCapturedItem(input),
        onBusy(value){busy=value;renderCharacterSelect();if(value){discoveryMessage='Checking the live wiki before publishing this new item…';renderDiscoveryCapture();}},
        onPlan(candidate,prepared){plan=prepared;queue.update(candidate.id,{planId:prepared.id});discoveryMessage='Publishing the new item after its live duplicate check…';renderDiscoveryCapture();},
        onResult(candidate,result){
            contributionHistory.markChanged();
            if(!result)return;queue.update(candidate.id,{planId:result.id,status:result.status||'needs-attention'});renderQueue();
            if(selectedId===candidate.id){if(result.status==='submitted'){selectedId=queueRows()[0]?.id||'';plan=null;}else plan=result;renderPlan();renderCandidate();}
            if(result.status==='submitted'){discoveryMessage='Contribution published. Thank you!';notify('Contribution published. Thank you!',{tone:'success'});}
            else{discoveryMessage='The wiki has not confirmed this item. Review the saved result before retrying.';warning(discoveryMessage);}renderDiscoveryCapture();
        },
        onDeferred(candidate,reason,prepared){
            discoveryMessage=reason+' Review this entry and use Preview wiki changes when ready.';
            if(prepared?.id){queue.update(candidate.id,{planId:prepared.id});if(selectedId===candidate.id){plan=prepared;renderPlan();}}
            renderDiscoveryCapture();
        },
        onError(_candidate,error){contributionHistory.markChanged();discoveryMessage=error.message||'Automatic item publishing could not complete. Review this entry manually.';renderDiscoveryCapture();}
    });
    if(capture){
        unsubscribers.push(capture.onStatus(next=>{
            captureStatusRevision++;
            const owned=discoveryCapture;
            if(owned){
                if(next.owner==='contribution'&&next.sessionId===owned.sessionId&&next.source?.id===owned.sourceId)
                    discoveryCapture={sessionId:owned.sessionId,sourceId:owned.sourceId,generation:next.generation};
            }
            captureState=next;renderCapture();
            if(contributionVisible&&!discoveryStarting&&(next.owner==='character'||['paused','disabled','stopped','error'].includes(next.phase))){
                cancelAutomaticContribution();
                contributionReaderSuppressed=true;
                discoveryMessage=next.owner==='character'?'Character reading is active. Finish or stop it, then choose Start item reading.':next.error||'Screen reading is paused. Choose Start item reading to retry.';
                void stopOwnedDiscoveryCapture().catch(error=>warning(error.message));
            }
            renderDiscoveryCapture();
            if(next.owner==='contribution'&&next.phase==='running'){
                // Resize, calibration and resume advance the generation without
                // replacing the reader session. Refresh every pending proof so
                // old frames cannot complete a request and new frames still can.
                for(const request of itemDiscoveryRequests())discoveryCaptureReady(request,discoveryResult(request));
            }else if(next.owner==='character'||['disabled','stopped','error'].includes(next.phase)){
                const error=next.owner==='character'?'Character capture took over. Finish or stop it, then choose Contribute again.':next.phase==='error'?String(next.error||'Item reading failed. Choose Contribute again.'):'Item reading stopped. Choose Contribute again.';
                for(const request of itemDiscoveryRequests())discoveryCaptureReady(request,discoveryResult(request,{ok:false,error}));
            }
        }),capture.onObservation(intake));
        const revision=captureStatusRevision;void capture.status().then(async next=>{if(disposed)return;if(revision===captureStatusRevision){captureState=next;renderCapture();}await replay();}).catch(error=>{if(!disposed)warning(error.message);});
    }
    function loadWiki(){if(wikiLoaded||!wiki)return;wikiLoaded=true;void wiki.blueprints().then(blueprints=>{if(Array.isArray(blueprints.eras)&&blueprints.eras.length){eras=blueprints.eras;const select=$('[name=era]');if(select){const value=select.value;select.innerHTML='<option value="">Confirm era</option>'+eras.map(era=>`<option>${escape(era)}</option>`).join('');select.value=value;}}}).catch(()=>{});unsubscribers.push(wiki.onStatus?.(applyAccountStatus)||(()=>{}));void refreshAccount().catch(()=>{$('[data-account-status]').textContent='Wiki unavailable; local review remains saved.';contributionHistory.setAccount(null);});}
    if(wiki?.onContributionIgnoresChanged)unsubscribers.push(wiki.onContributionIgnoresChanged(applyIgnoreSnapshot));
    if(wiki?.contributionIgnores)void wiki.contributionIgnores().then(applyIgnoreSnapshot).catch(()=>warning('Ignored entities could not be loaded. Automatic contributions will wait for the device ignore list.'));
    let discoveryLogSource='';
    function resetDiscoveryChecks(){
        spawnPromptEpoch++;discoveryGate.clear();queue.cancelSpawnLocation?.();
        if(spawnArmedId)void globalThis.eyeOfZommDiscovery?.action('dismiss',{id:'spawn-'+spawnArmedId}).catch(()=>{});
        spawnArmedId='';if(discoveryUiReady){renderQueue();renderCandidate();}
    }
    async function showVerifiedSpawnPrompt(prompt){
        const epoch=++spawnPromptEpoch,candidate=queue.snapshot().find(value=>value.id===prompt.candidateId);
        queue.cancelSpawnLocation?.();if(!candidate)return;
        const signature=discoveryGate.signature(candidate);await discoveryGate.check(candidate);
        const latest=queue.snapshot().find(value=>value.id===prompt.candidateId);
        if(disposed||publishing||epoch!==spawnPromptEpoch||Date.now()>prompt.expiresAt||!latest||signature!==discoveryGate.signature(latest)||entityIgnored({kind:'npc',name:latest.name})||!discoveryGate.project(latest,{request:false})?.reasons.includes('missing-page'))return;
        const armed=queue.armSpawnLocation(latest.id);if(!armed.ok)return;
        spawnArmedId=latest.id;
        const shown=await globalThis.eyeOfZommDiscovery?.show({id:'spawn-'+prompt.candidateId,candidateId:prompt.candidateId,kind:'monster',name:prompt.name,zone:prompt.zone,purpose:'spawn-location',spawnEvidenceId:prompt.spawnEvidenceId,...(typeof prompt.notable==='boolean'?{notable:prompt.notable}:{}),hint:'Stand at its spawn point and type /loc now. The next location will be saved automatically.'}).catch(()=>null);
        if(disposed||epoch!==spawnPromptEpoch||!shown||shown.error||shown.suppressed){if(spawnArmedId===latest.id){queue.cancelSpawnLocation?.();spawnArmedId='';}return;}
        notify('Stand at '+prompt.name+'’s spawn and type /loc. Recording is armed.',{duration:15000,actionLabel:'Contribute',onAction:()=>void Promise.resolve().then(()=>{if(!globalThis.eyeOfZommDiscovery?.action)throw Error('Discovery contribution controls are unavailable. Restart Eye of Zomm and try again.');return globalThis.eyeOfZommDiscovery.action('contribute',{id:'spawn-'+prompt.candidateId});}).catch(error=>warning(error.message||'The discovery request could not be opened.'))});
    }
    async function notifySavedLocation(captured){
        const candidate=queue.snapshot().find(value=>value.id===captured.candidateId);if(!candidate)return;
        const epoch=spawnPromptEpoch,signature=discoveryGate.signature(candidate);await discoveryGate.check(candidate);
        const latest=queue.snapshot().find(value=>value.id===captured.candidateId);
        if(disposed||epoch!==spawnPromptEpoch||!latest||signature!==discoveryGate.signature(latest)||entityIgnored({kind:'npc',name:latest.name})||!discoveryGate.project(latest,{request:false}))return;
        notify('Spawn location saved for '+captured.name+'. Review it in Contribute.',{tone:'success'});
    }
    function openContribution(id){
        const show=()=>{if(selectContribution(id)){navigate('contribute');loadWiki();return true;}return false;};
        if(show())return;
        const candidate=queue.snapshot().find(value=>value.id===id);if(!candidate||entityIgnored({kind:candidate.kind,name:candidate.title||candidate.name}))return;
        const signature=discoveryGate.signature(candidate);
        void discoveryGate.check(candidate).then(()=>{
            const latest=queue.snapshot().find(value=>value.id===id);
            if(disposed||!latest||signature!==discoveryGate.signature(latest)||!discoveryGate.project(latest,{request:false}))return;
            show();
        }).catch(()=>{});
    }
    discoveryUiReady=true;renderQueue();renderCandidate();renderCharacter();renderCapture();
    return{beginDiscoveryContribution,cancelDiscoveryContribution,setDiscoveryNotable,consumeLog(event,context){
        if(disposed||!event||context?.live!==true)return;
        const source=String(context.logId||'current');
        if(discoveryLogSource&&discoveryLogSource!==source||['zone','profile'].includes(event.type))resetDiscoveryChecks();
        discoveryLogSource=source;
        // Only an actual fresh observation or an open discovery view starts a
        // check. Background renders can hide expired receipts without polling.
        const result=queue.consumeLog(event,context);if(result.candidate){if(!selectedId)selectedId=result.candidate.id;renderQueue();if(!selected()||!root.contains(document.activeElement))renderCandidate();}
        for(const candidate of result.candidates||[result.candidate])if(candidate)void discoveryGate.check(candidate);
        if(result.prompt)void showVerifiedSpawnPrompt(result.prompt).catch(()=>{});
        if(result.locationCaptured){let handled=false;try{handled=onDiscoveryLocation(result.locationCaptured,{...context,at:event.at||context?.at})===true;}catch(error){warning(error.message||'The discovery location could not be updated.');}if(!handled)void globalThis.eyeOfZommDiscovery?.action('dismiss',{id:'spawn-'+result.locationCaptured.candidateId}).catch(()=>{});spawnArmedId='';if(selectedId===result.locationCaptured.candidateId)renderCandidate();void notifySavedLocation(result.locationCaptured).catch(()=>{});}
        if(capture&&['loot','kill','zone','profile'].includes(event.type))void capture.observeLog({event,context}).catch(()=>{});
        return result;
    },cancelSource(){cancelAutomaticContribution();resetDiscoveryChecks();discoveryLogSource='';contributionReaderSuppressed=true;discoveryRequests.clear();void stopOwnedDiscoveryCapture().catch(()=>{});renderDiscoveryCapture();},openContribution,ignoreContribution(id){cancelAutomaticContribution();queue.remove(id);if(selectedId===id)selectedId=queueRows()[0]?.id||'';invalidatePlan();renderQueue();renderCandidate();},suppression:(kind,name,options)=>entityIgnored({kind,name})?{suppressed:true,reason:'permanent-ignore'}:queue.suppression?.(kind,name,options)||{suppressed:false},suppress:(kind,name,options)=>queue.suppress?.(kind,name,options),reconcile:options=>queue.reconcile?.(options),refresh(){renderQueue();if(!selected())renderCandidate();refreshContributionReader();if(characterVisible())watchInventory();else stopInventoryWatch();if(root.closest('.view.is-active')||characterRoot.closest('.view.is-active'))loadWiki();characterCatalog.refresh();const wasSeeded=profileSeeded;seedProfile();if(!wasSeeded&&profileSeeded)renderCharacter();},dispose(){cancelAutomaticContribution();disposed=true;discoveryGate.dispose();spawnPromptEpoch++;contributionIconCrop=null;discoveryRequests.clear();void stopOwnedDiscoveryCapture().catch(()=>{});discoveryPicker.remove();stopInventoryWatch();closeArea();itemBaseUi?.dispose();contributionIcons?.dispose();contributionChoices?.dispose();characterCatalog.dispose();augmentCatalog?.dispose();cancelPendingItemTooltip();clearTimeout(tooltipTimer);unsubscribers.forEach(remove=>remove?.());areaDialog.remove();dialog.remove();augmentDialog.remove();itemTooltip.remove();}};
}
