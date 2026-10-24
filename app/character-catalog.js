import {characterCatalogDetails,characterItemDetailsMarkup} from './character-item-card.js';
import { characterBaseItemName, characterSlotKinds, normalizeCharacterStats, safeCharacterIcon } from './character-model.js';
import { scaleItemStat } from './item-scaling.js';
import { isItemStatModified } from './item-stat-presentation.js';

// Character-local catalog access. No capture, remote request or global item-tier
// setting is used. Selecting a catalog record never fabricates examine evidence.
export const CHARACTER_CATALOG_LIMITS=Object.freeze({results:24,maximumResults:60,records:100000,query:160,matches:8});
const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const folded=value=>text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const itemName=value=>folded(characterBaseItemName(value));
const statsLabel=key=>({MP:'Mana',END:'Endurance',WT:'Weight',DMG:'Damage',DMG_BONUS:'Damage bonus',SV_CORRUPTION:'Void resist',ATTACK_SPEED:'Attack speed %'}[key]||key.replace(/_/g,' '));
const number=value=>value===null?'?':Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
function tierOptions(options={}){
    const tier=Object.hasOwn(options,'tier')?options.tier:0;
    if(!Number.isInteger(tier)||tier<0||tier>10)throw Error('Choose tier 0–10.');
    return{tier,fraction:0};
}

/** Bounded AND-token name/wiki-title search. Results retain catalog identity and
 * contain original read-only item references; this function never edits a pack.
 * An incomplete/sample pack is not evidence that a missing item does not exist.
 */
export function searchCharacterCatalog(pack,query='',{limit=CHARACTER_CATALOG_LIMITS.results}={}){
    const source=Array.isArray(pack?.items)?pack.items:[],normalized=folded(String(query).slice(0,CHARACTER_CATALOG_LIMITS.query)),tokens=normalized.split(' ').filter(Boolean);
    const incomplete=!Array.isArray(pack?.items)||pack?.meta?.sample===true||pack?.meta?.wikiEntitiesComplete!==true||source.length>CHARACTER_CATALOG_LIMITS.records;
    const bounded=Math.max(1,Math.min(CHARACTER_CATALOG_LIMITS.maximumResults,Math.floor(Number(limit)||CHARACTER_CATALOG_LIMITS.results)));
    if(!source.length)return{items:[],total:0,incomplete,query:normalized,status:'empty'};
    if(!tokens.length)return{items:[],total:0,incomplete,query:normalized,status:'prompt'};
    const matches=[];
    for(const item of source.slice(0,CHARACTER_CATALOG_LIMITS.records)){
        if(!item||typeof item!=='object')continue;
        const name=folded(item.name),title=folded(item.wikiTitle),search=`${name} ${title}`;
        if((name||title)&&tokens.every(token=>search.includes(token)))matches.push({item,score:name===normalized||title===normalized?0:name.startsWith(normalized)||title.startsWith(normalized)?1:2});
    }
    matches.sort((a,b)=>a.score-b.score||text(a.item.name||a.item.wikiTitle).localeCompare(text(b.item.name||b.item.wikiTitle)));
    return{items:matches.slice(0,bounded).map(match=>match.item),total:matches.length,incomplete,query:normalized,status:matches.length?'ready':'no-match'};
}

function oneEdit(a,b) {
    if(a===b)return 'exact';
    // A glyph confusion is one bounded operation, not a global replacement.
    for(const [from,to]of [['rn','m'],['m','rn']])for(let at=a.indexOf(from);at>=0;at=a.indexOf(from,at+1))if(a.slice(0,at)+to+a.slice(at+from.length)===b)return 'ocr-glyph';
    if(Math.abs(a.length-b.length)>1)return null;
    let left=0,right=0,edits=0;
    while(left<a.length&&right<b.length){if(a[left]===b[right]){left++;right++;continue;}if(++edits>1)return null;if(a.length>=b.length)left++;if(b.length>=a.length)right++;}
    return edits+(left<a.length||right<b.length?1:0)===1?'one-edit':null;
}
const catalogIndexes=new WeakMap();
function catalogIndex(source,version) {
    let index=catalogIndexes.get(source);if(index?.length===source.length&&index.version===version)return index;
    const records=[],exact=new Map();
    for(const item of source.slice(0,CHARACTER_CATALOG_LIMITS.records)) {
        if(!item||typeof item!=='object')continue;
        const aliases=[...new Set([itemName(item.name),itemName(item.wikiTitle)].filter(Boolean))],identity=text(item.wikiTitle||item.name).normalize('NFKC').replace(/_/g,' ').toLowerCase();
        if(!identity)continue;
        records.push({item,aliases,identity});
        for(const alias of aliases){let matches=exact.get(alias);if(!matches){matches=new Map();exact.set(alias,matches);}matches.set(identity,{item,distance:0,reason:'exact'});}
    }
    index={length:source.length,version,records,exact};catalogIndexes.set(source,index);return index;
}
/** Full-name identity matching, independent of tier. Exact matches outrank
 * bounded one-edit/rn↔m proposals. Ties never choose a catalog page. Short names
 * require an exact match; a partial cache does not establish item absence. */
export function resolveCharacterCatalog(pack,observedName,{limit=CHARACTER_CATALOG_LIMITS.matches}={}) {
    const source=Array.isArray(pack?.items)?pack.items:[],query=itemName(String(observedName??'').slice(0,CHARACTER_CATALOG_LIMITS.query)),incomplete=!Array.isArray(pack?.items)||pack?.meta?.sample===true||pack?.meta?.wikiEntitiesComplete!==true||source.length>CHARACTER_CATALOG_LIMITS.records;
    const index=catalogIndex(source,pack?.meta?.manifestVersion||pack?.meta?.version),exact=index.exact.get(query)||new Map(),fuzzy=new Map(),maximum=Math.max(1,Math.min(CHARACTER_CATALOG_LIMITS.matches,Math.floor(Number(limit)||CHARACTER_CATALOG_LIMITS.matches)));
    if(query&&!exact.size&&query.replace(/ /g,'').length>=6)for(const {item,aliases,identity}of index.records) {
        const reason=aliases.map(alias=>Math.abs(alias.length-query.length)<=1&&alias.replace(/ /g,'').length>=6?oneEdit(query,alias):null).find(Boolean);
        if(reason)fuzzy.set(identity,{item,distance:1,reason});
    }
    const matches=[...(exact.size?exact:fuzzy).values()].sort((a,b)=>text(a.item.name||a.item.wikiTitle).localeCompare(text(b.item.name||b.item.wikiTitle))||text(a.item.wikiTitle).localeCompare(text(b.item.wikiTitle)));
    const unique=matches.length===1,status=!matches.length?'unmatched':!unique?'ambiguous':exact.size?'exact':'fuzzy';
    return {status,item:unique?matches[0].item:null,candidates:matches.slice(0,maximum),total:matches.length,autoResolved:unique,incomplete,query};
}

/** Inventory import establishes exact article presence even without rich stats.
 * Fuzzy proposals stay manual. Presence never supplies invented equipment stats. */
export function resolveInventoryCatalog(pack,name,{socket=false}={}){
    const lookup=value=>{
        const match=resolveCharacterCatalog(pack,value);
        if(match.status==='exact')return {item:match.item,icon:pack?.icons?.[match.item.iconId]};
        const key=value=>text(value).normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').toLowerCase(),query=key(characterBaseItemName(value));
        for(const record of [...(pack?.wikiEntities?.items||[]),...(pack?.wikiEntities?.titles||[])]){
            const title=typeof record==='string'?record:record?.wikiTitle||record?.title||record?.name;
            if(title&&[title,record?.name].some(name=>name&&key(name)===query))return {item:{name:characterBaseItemName(value),wikiTitle:title,slots:[],stats:{}}};
        }
        return {};
    };
    const direct=lookup(name);if(direct.item)return direct;
    const base=socket&&characterBaseItemName(name).replace(/\s*\(Exaltation\)$/i,'').trim();
    if(base&&base!==characterBaseItemName(name)){const resolved=lookup(base);if(resolved.item)return {...resolved,exaltationAlias:true};}
    return {};
}

/** A manual physical card from an explicitly selected catalog identity. The
 * selected tier is known; observedStats and capture evidence are empty.
 * Catalog stats remain base values. Augment state needs review unless explicit.
 */
export function characterCatalogCard(item,options={}){
    if(!item||typeof item!=='object'||!text(item.name||item.wikiTitle))throw Error('Choose a cached item first.');
    const {tier,fraction}=tierOptions(options),baseStats=normalizeCharacterStats(item.stats),name=characterBaseItemName(item.name||item.wikiTitle),wikiTitle=text(item.wikiTitle||item.name);
    return{name,observedName:'',wikiTitle,wikiMatch:'confirmed',catalogIdentity:{name,wikiTitle,match:'manual'},iconId:text(item.iconId),icon:safeCharacterIcon(options.icon),
        slots:characterSlotKinds(item.slots),details:characterCatalogDetails(item),augmentSlots:Number.isInteger(item.augmentSlots)&&item.augmentSlots>=0&&item.augmentSlots<=8?item.augmentSlots:5,tier,fraction,baseStats,baseStatsComplete:Object.keys(baseStats).length>0&&item.statsComplete!==false,
        unscaledStatKeys:Object.hasOwn(baseStats,'SV_CORRUPTION')?['SV_CORRUPTION']:[],
        observedStats:{},observedStatsComplete:false,augments:[],augmentStatus:item.augmentStatus==='none'?'none':'unknown',
        level:item.requiredLevel??null,notes:'Added from the local wiki catalog. Verify tier, compatible slots and Exaltations against the item you own.'};
}

/** Preview rows use the same forward scaling and modified-stat predicate as the
 * existing item browser. Unsupported conditional Void scaling stays unknown.
 */
export function characterCatalogPreview(item,options={}){
    const card=characterCatalogCard(item,options);
    return{card,rows:Object.entries(card.baseStats).map(([key,base])=>{
        const unsupported=card.tier>0&&card.unscaledStatKeys.includes(key),value=base===null||unsupported?null:scaleItemStat(key,base,card.tier,{fraction:card.fraction});
        return{key,label:statsLabel(key),base,value,modified:isItemStatModified(base,value,card.tier),unsupported};
    })};
}

/** Mount one independent search UI. onAdd receives {item:card}; it must use the
 * ordinary model intake operation, which creates a new physical copy each time.
 * refresh notices pack replacement; dispose removes all owned event listeners.
 */
export function mountCharacterCatalog({host,getPack=()=>({}),purpose='inventory',onAdd=()=>({ok:false,error:'Character inventory is unavailable.'})}={}){
    if(!host)return{refresh(){},dispose(){}};
    const document=host.ownerDocument,removers=[];let selected=null,result={items:[]},pack=null,packItems=null,packVersion=null,disposed=false;
    host.innerHTML=`<h3>Search cached items</h3><p class="settings-helper">${purpose==='augment'?'Choose an item and tier for this Exaltation slot. Weapons and armor can both be used as Exaltations.':purpose==='equipment'?'Choose a matching item and its tier to equip it into this slot.':'Find a wiki item, choose its tier and add it to Inventory.'}</p><label>Item name<input type="search" data-character-catalog-query maxlength="160" placeholder="Search item names or wiki titles" autocomplete="off"></label><div class="character-catalog-controls"><label>Item Level Slider <output data-character-catalog-tier-label>Tier 0</output><input data-character-catalog-tier type="range" min="0" max="10" step="1" value="0" aria-label="Character catalog item tier"></label></div><p data-character-catalog-status role="status"></p><div class="character-catalog-layout"><div class="character-catalog-results" data-character-catalog-results aria-label="Cached item results"></div><article class="character-catalog-preview" data-character-catalog-preview aria-label="Selected catalog item preview"></article></div>`;
    const $=selector=>host.querySelector(selector),query=$('[data-character-catalog-query]'),tier=$('[data-character-catalog-tier]'),results=$('[data-character-catalog-results]'),preview=$('[data-character-catalog-preview]'),status=$('[data-character-catalog-status]');
    const listen=(element,event,callback)=>{element.addEventListener(event,callback);removers.push(()=>element.removeEventListener(event,callback));};
    const options=()=>tierOptions({tier:Number(tier.value)});
    const icon=item=>safeCharacterIcon(pack?.icons?.[item?.iconId]);
    function paintPreview(){
        results.querySelectorAll('[data-character-catalog-select]').forEach(button=>{const active=result.items[Number(button.dataset.characterCatalogSelect)]===selected;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
        if(!selected){preview.innerHTML='<p class="empty-state">Hover, focus or select a result to preview its item stats.</p>';return;}
        try{const {card,rows}=characterCatalogPreview(selected,{...options(),icon:icon(selected)});
            preview.innerHTML=`<div class="character-catalog-title">${card.icon?`<img src="${escape(card.icon)}" alt="">`:'<span class="character-catalog-icon" aria-hidden="true">◇</span>'}<div><h4>${escape(card.name)}</h4><small>${escape(card.wikiTitle)}</small></div></div><p>Tier ${card.tier}${card.tier===10?' (maximum)':''} · ${escape(card.slots.join(' / ')||'Slots unknown')}</p><dl class="character-catalog-stats">${rows.map(row=>`<div class="${row.modified?'is-scaled':''}"><dt>${escape(row.label)}</dt><dd>${row.value===null?'?':escape(number(row.value))}${row.modified?` <small>(${escape(number(row.base))} base)</small>`:''}${row.unsupported?` <small>(${escape(number(row.base))} base; tier adjustment unverified)</small>`:''}</dd></div>`).join('')}</dl>${characterItemDetailsMarkup(card.details)}${rows.length?'':'<p class="settings-helper">No numeric base stats are available for this cached record.</p>'}<p class="settings-helper">Green values reflect the selected tier; base comparisons stay muted.</p><button type="button" class="primary-button" data-character-catalog-add>${purpose==='augment'?'Put in Exaltation slot':purpose==='equipment'?'Equip item':'Add to inventory'}</button><p data-character-catalog-added role="status"></p>`;
        }catch(error){preview.innerHTML=`<p class="capture-warning" role="status">${escape(error.message)}</p>`;}
    }
    function paintResults(){
        try{pack=getPack()||{};packItems=pack.items;packVersion=pack.meta?.version;result=searchCharacterCatalog(pack,query.value);
            if(!result.items.includes(selected))selected=result.items[0]||null;
            const caution=result.incomplete?' The cached catalog is incomplete; missing results do not establish that an item is absent.':'';
            status.textContent=({empty:'No cached items are available. Refresh wiki data in Settings, or add an item manually.',prompt:'Search cached item names or wiki titles.', 'no-match':'No matching cached items. Try fewer words or add the item manually.',ready:`${result.total} match${result.total===1?'':'es'}${result.total>result.items.length?`; showing the first ${result.items.length}. Refine your search for more.`:'.'}`}[result.status]||'')+caution;
            results.innerHTML=result.items.map((item,index)=>`<button type="button" class="character-catalog-result" data-character-catalog-select="${index}" aria-controls="character-catalog-selected-preview" aria-pressed="false">${icon(item)?`<img src="${escape(icon(item))}" alt="">`:'<span class="character-catalog-icon" aria-hidden="true">◇</span>'}<span><strong>${escape(text(item.name||item.wikiTitle))}</strong><small>${escape(text(item.wikiTitle||item.name))}</small></span></button>`).join('');preview.id='character-catalog-selected-preview';paintPreview();
        }catch{selected=null;result={items:[]};results.replaceChildren();preview.replaceChildren();status.textContent='The local catalog could not be read. Retry after refreshing wiki data, or add an item manually.';packItems=null;}
    }
    function select(event){const button=event.target.closest('[data-character-catalog-select]');if(button&&results.contains(button)){const item=result.items[Number(button.dataset.characterCatalogSelect)];if(item&&item!==selected){selected=item;paintPreview();}}}
    listen(query,'input',paintResults);listen(query,'keydown',event=>{if(event.key==='ArrowDown'){const button=results.querySelector('button');if(button){event.preventDefault();button.focus();}}});
    for(const event of ['mouseover','focusin','click'])listen(results,event,select);
    listen(results,'keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=buttons[index+(event.key==='ArrowDown'?1:-1)];if(next){event.preventDefault();next.focus();}});
    listen(tier,'input',()=>{$('[data-character-catalog-tier-label]').textContent=`Tier ${tier.value}${Number(tier.value)===10?' (maximum)':''}`;paintPreview();});
    listen(preview,'click',event=>{if(!event.target.closest('[data-character-catalog-add]')||!selected)return;const added=$('[data-character-catalog-added]');try{const card=characterCatalogCard(selected,{...options(),icon:icon(selected)}),outcome=onAdd({item:card});if(outcome?.ok===false)throw Error(outcome.error||'This item could not be added.');if(added)added.textContent=`Added ${card.name}. Review its card and place this copy in a slot.`;}catch(error){if(added)added.textContent=error.message||'This item could not be added.';}});
    paintResults();
    return{refresh(){if(disposed)return;try{const next=getPack()||{};if(next!==pack||next.items!==packItems||next.meta?.version!==packVersion)paintResults();}catch{paintResults();}},dispose(){disposed=true;removers.forEach(remove=>remove());host.replaceChildren();}};
}
