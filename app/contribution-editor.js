import { contributionChoicePickerMarkup } from './contribution-choice-picker.js';
import { normalizeWikiIdentity, createWikiResolver } from './wiki-identity.js';
import { contributionDestinations, contributionLootEntryInfo, contributionQueueInfo } from './contribution-presentation.js';
// Shared, escaped editor markup. Publication still uses an account-bound,
// revision-guarded complete diff; there are no per-field verification gates.
export const editorEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=editorEscape;
const labels={statLines:'Item stat block',knownNPCs:'Monsters in this zone',whoName:'Zone name in /who',level:'Level',race:'Race',class:'Class',classes:'Classes',races:'Races',slots:'Equipment slots',location:'Spawn location (Y, X, Z)',respawnTime:'Respawn time',iconId:'Icon ID',focusEffect:'Focus effect',effectName:'Effect / proc spell',effectType:'Effect type',effectCastTime:'Effect cast time',effectLevel:'Effect required level',exaltationSlots:'Exaltation slots',augmentSlots:'Exaltation slots',special:'Special abilities',AC:'AC',HP:'HP'};
const examples={statLines:'AC: 10\nHP: 50\nSTR: 5',knownNPCs:'A loathing lich\nLord of Loathing',whoName:'The Plane of Hate',location:'-60, 325, 120',respawnTime:'3h',level:'45',race:'Undead Iksar',class:'Warrior',classes:'WAR, CLR, PAL',races:'ALL',slots:'PRIMARY, SECONDARY',iconId:'5667',focusEffect:'Improved Healing I',effectName:'Rampage',effectType:'Combat',effectCastTime:'Instant',effectLevel:'45',exaltationSlots:'5',augmentSlots:'5',special:'Summons, Rampages',AC:'100',HP:'12000'};
const internal=new Set(['name','tier','fraction','fractionMaximum','exaltationSlots','augmentSlots','augmentSlotCount','emptyAugmentSlots','modified','augmented','augmentNames','effects','lootKinds','quantity','dynamicZoneSupported']);
const numeric=new Set(['ac','hp','mana','endurance','str','sta','agi','dex','wis','int','cha','resistPoison','resistMagic','resistDisease','resistFire','resistCold','resistCorruption','hpRegen','manaRegen','enduranceRegen','attackSpeed','weight','damage','damageBonus','delay','attack','haste']);
export function contributionFieldMarkup(key,field,{kind,requireLocation=true}={}){
    if(internal.has(key)||key==='knownLoot'||kind==='item'&&numeric.has(key))return '';
    const array=Array.isArray(field.value),text=array?field.value.join(['statLines','knownNPCs'].includes(key)?'\n':', '):field.value??'',multiline=['statLines','knownNPCs'].includes(key),original=e(JSON.stringify({value:field.value,confirmed:field.confirmed===true}));
    if(kind==='item'&&['classes','slots'].includes(key))return `<div class="contribution-field contribution-choice-field" data-field-key="${e(key)}" data-original-field="${original}"><span>${e(labels[key])}</span>${contributionChoicePickerMarkup(key,field.value)}</div>`;
    if(kind==='item'&&key==='iconId')return `<div class="contribution-field contribution-icon-field" data-field-key="iconId" data-original-field="${original}"><label>Icon ID<input data-field-value data-type="${typeof field.value}" type="number" min="0" max="9999999" step="1" value="${e(text)}" placeholder="ex. 5667"></label><div data-contribution-icons></div></div>`;
    return `<label class="contribution-field" data-field-key="${e(key)}" data-original-field="${original}"><span>${e(labels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2'))}</span>${multiline?`<textarea data-field-value data-array="${array}" rows="${key==='statLines'?7:3}" placeholder="${e('ex. '+(examples[key]||'?'))}">${e(text)}</textarea>`:`<input data-field-value data-type="${typeof field.value}" ${array?'data-array="true"':''} value="${e(text)}" placeholder="${e('ex. '+(examples[key]||'?'))}" ${kind==='npc'&&key==='location'&&requireLocation?'required':''}>`}</label>`;
}
export function contributionLootMarkup(candidate,{pack}={}){
    const field=candidate.fields.knownLoot||{value:[],confirmed:false},titles=Array.isArray(field.value)?field.value:[],kinds=candidate.fields.lootKinds?.value||{};
    const resolver=pack?createWikiResolver(pack):null;
    return `<section class="contribution-loot"><h3>Observed loot</h3><label hidden data-field-key="knownLoot" data-original-field="${e(JSON.stringify({value:titles,confirmed:field.confirmed===true}))}"><textarea data-field-value data-array="true">${e(titles.join('\n'))}</textarea></label>${titles.map((title,index)=>{const info=contributionLootEntryInfo(candidate,title,{resolver});return `<div class="contribution-loot-row" data-loot-status="${info.status}"><a href="https://eqlwiki.com/${encodeURIComponent(title)}" target="_blank" rel="noopener">${e(title)}</a>${contributionDestinationLinkMarkup(candidate.title||candidate.name,{description:info.description})}<span class="contribution-loot-choice">${['common','unique'].map(kind=>`<button type="button" data-loot-index="${index}" data-loot-kind="${kind}" aria-pressed="${(kinds[title]||'unique')===kind}">${kind==='common'?'Common Loot':'Unique Loot'}</button>`).join('')}</span></div>`;}).join('')||'<p class="settings-helper">Loot from this monster will appear here as it is logged.</p>'}<div class="capture-actions"><input data-add-loot-name aria-label="Add observed loot" placeholder="ex. Thornstinger"><button type="button" class="secondary-button" data-add-loot>Add loot</button></div></section>`;
}
export function contributionDestinationLinkMarkup(title,{description='',operation=''}={}){
    if(!String(title||'').trim())return '';
    return `<small class="contribution-destination-hint">${description?`<span>${e(description)}</span> `:''}<span aria-hidden="true">›</span> To <a href="https://eqlwiki.com/${encodeURIComponent(title)}" target="_blank" rel="noopener">${e(title)}</a>${operation?` <span>· ${e(operation)}</span>`:''}</small>`;
}
export function contributionDestinationHintsMarkup(candidate,{compact=false,pack}={}){
    if(compact)return contributionDestinationLinkMarkup(candidate.title||candidate.name,{operation:contributionQueueInfo(candidate).pageType});
    const shown=contributionDestinations(candidate,{pack});
    return `<section class="contribution-destinations"><h3>Proposed additions by page</h3>${shown.map(destination=>`<div class="contribution-destination-page">${destination.changes.map(change=>contributionDestinationLinkMarkup(destination.title,{description:change.description,operation:destination.operation})).join('')}</div>`).join('')}<p class="settings-helper">The preview checks the live pages and shows the exact changes before publication. Related pages are updated only when they exist.</p></section>`;
}
function uniqueMatches(matches=[]){
    const records=matches.filter(match=>String(match?.title||'').trim()).map(match=>({...match,title:String(match.title).trim(),pageId:Number.isSafeInteger(match.pageId)&&match.pageId>0?match.pageId:null}));
    const authoritative=new Set(records.filter(match=>match.pageId).map(match=>normalizeWikiIdentity(match.title))),unique=new Map();
    for(const match of records){
        const key=normalizeWikiIdentity(match.title);if(!match.pageId&&authoritative.has(key))continue;
        const identity=match.pageId?'page:'+match.pageId:'title:'+key;
        if(!unique.has(identity))unique.set(identity,match);
    }
    return [...unique.values()];
}
export function contributionMatchState(candidate={},matches=[]){
    const unique=uniqueMatches(matches),key=normalizeWikiIdentity(candidate.title||candidate.name),exact=key?unique.filter(match=>normalizeWikiIdentity(match.title)===key):[];
    const canonical=String(candidate.canonicalTitle||'').trim();
    const direct=exact.length===1&&candidate.membership!=='ambiguous'?exact[0]:!exact.length&&candidate.membership==='present'&&canonical&&normalizeWikiIdentity(canonical)===key?{title:canonical,pageId:null}:null;
    return {direct,ambiguous:exact.length>1||candidate.membership==='ambiguous',matches:direct?[direct,...unique.filter(match=>match!==direct&&normalizeWikiIdentity(match.title)!==normalizeWikiIdentity(direct.title))]:unique};
}
export function contributionPotentialMatchesMarkup(matches=[],{direct=null}={}){
    return uniqueMatches(matches).map(match=>`<div class="contribution-match-row" ${direct&&normalizeWikiIdentity(match.title)===normalizeWikiIdentity(direct.title)?'data-direct-match="true"':''}><a href="https://eqlwiki.com/${encodeURIComponent(match.title)}" target="_blank" rel="noopener">${e(match.title)}</a><button type="button" class="secondary-button" data-use-existing="${e(match.title)}">Use this page</button></div>`).join('')||'<p>No close pages found. Check the live wiki before creating a page.</p>';
}
export function contributionMatchesMarkup(candidate,matches=[]){
    const state=contributionMatchState(candidate,matches);
    return `<h4 data-match-heading>${state.direct?'Matched existing page':state.ambiguous?'Multiple matching pages':'Potential existing pages'}</h4>${state.direct?'<p class="settings-helper">The page name matches. Confirm this is the correct destination; the preview checks its current content.</p>':state.ambiguous?'<p class="settings-helper">Choose the correct page before continuing. The name alone does not identify one destination.</p>':''}<div data-potential-matches>${contributionPotentialMatchesMarkup(state.matches,{direct:state.direct})}</div>`;
}
export function contributionMatchMarkup(candidate,matches=[]){
    const update=candidate.intent==='update'||!['create','update'].includes(candidate.intent)&&candidate.membership==='present',reviewed=candidate.matchesReviewed===true,info=contributionQueueInfo(candidate);
    return `<section class="contribution-match-first"><h3>Choose the destination page</h3><p class="contribution-page-type">${e(info.kind)} <span aria-hidden="true">›</span> ${update?'Update Page':'New Page'}</p><div data-match-results>${contributionMatchesMarkup(candidate,matches)}</div><button class="secondary-button" type="button" data-check-matches>Check live wiki</button><p class="settings-helper" data-live-matches-status role="status"></p><label>Page action<select name="intent"><option value="create" ${!update?'selected':''}>New Page</option><option value="update" ${update?'selected':''}>Update Page</option></select></label></section>`;
}
export function contributionScreenshotMarkup(candidate){
    const attachment=candidate.attachment;
    return `<section class="contribution-image"><h3>Screenshot</h3><button type="button" class="contribution-image-drop" data-contribution-dropzone data-contribution-file aria-label="Select a screenshot or paste with Ctrl+V">${attachment?.thumbnail?`<img src="${e(attachment.thumbnail)}" alt="Selected contribution screenshot">`:'<span class="contribution-image-plus" aria-hidden="true">+</span><span>Select a screenshot or paste here</span>'}</button><div class="capture-actions"><button type="button" class="text-button" data-contribution-paste>Paste screenshot</button>${attachment?'<button type="button" class="text-button" data-remove-attachment>Remove screenshot</button>':''}</div><label>Image caption<input name="attachmentCaption" maxlength="1000" value="${e(attachment?.caption||'')}" placeholder="ex. A loathing lich at its spawn in Plane of Hate"></label><label>Image rights<select name="attachmentLicense"><option value="own-screenshot" ${!attachment?.license||attachment.license==='own-screenshot'?'selected':''}>My EverQuest screenshot</option><option value="permission" ${attachment?.license==='permission'?'selected':''}>I have permission to upload this image</option></select></label></section>`;
}

// Link only confirmed saved titles at the fixed wiki origin. Pending/error
// results and result-provided URLs must never look like successful publication.
export function contributionPublishReceiptMarkup(plan={}){
    const links=(Array.isArray(plan.pages)?plan.pages:[]).flatMap(page=>{
        if(page?.status!=='applied'||typeof page.title!=='string'||!page.title.trim())return [];
        let titlePath;try{titlePath=encodeURIComponent(page.title);}catch{return [];}
        return [`<a href="https://eqlwiki.com/${e(titlePath)}" target="_blank" rel="noopener noreferrer">View ${e(page.title)}</a>`];
    });
    const message=plan.status==='submitted'?'Contribution published. Thank you!':'Review the per-page results. Completed edits will not be repeated.';
    return `${message}${links.length?' '+links.join(' · '):''}`;
}
// A successful page result belongs to its reviewed canonical title. Never use
// a result-provided URL, or present an unsuccessful page as already saved.
export function contributionPublishedPagesMarkup(plan){
    const rows=(Array.isArray(plan?.pages)?plan.pages:[]).flatMap(page=>{
        if(page?.status!=='applied'||typeof page.title!=='string'||!page.title.trim())return [];
        let titlePath;try{titlePath=encodeURIComponent(page.title);}catch{return [];}
        const outcome=page.operation==='create'?'Created':['update','replace-reviewed'].includes(page.operation)?'Updated':'Saved';
        return [`<li data-published-page="${e(page.title)}"><span><strong>${e(page.title)}</strong> <small>${outcome}</small></span> <a href="https://eqlwiki.com/${e(titlePath)}" target="_blank" rel="noopener noreferrer" aria-label="View page: ${e(page.title)}">View page</a></li>`];
    });
    return rows.length?`<section class="contribution-published-pages"><h3>Saved pages</h3><ul>${rows.join('')}</ul></section>`:'';
}
