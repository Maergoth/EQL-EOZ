import {characterItemboxTitleMarkup,characterItemboxBodyMarkup,characterItemboxExaltationMarkup} from './character-itembox.js';
import {isItemStatModified} from './item-stat-presentation.js';
import { CHARACTER_SLOTS, safeCharacterIcon } from './character-model.js';
import { CHARACTER_EQUIPMENT_ROWS, characterIdentityMarkup, characterStatSummaryMarkup } from './character-inventory-view.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=title=>'https://eqlwiki.com/'+encodeURIComponent(title);
const itemName=item=>item.title+(item.tier>0?' +'+item.tier:'');
/** Read-only review of the exact structured sheet sent to the wiki host. */
export function characterInspectMarkup(sheet,{icons={},items:catalogItems=[]}={}){
    const items=new Map(sheet.equipment.map(item=>[item.slot,item])),slots=new Map(CHARACTER_SLOTS.map(slot=>[slot.id,slot]));
    const icon=item=>{const source=safeCharacterIcon(icons[item.iconId]);return source?`<img src="${escape(source)}" alt="">`:'<span aria-hidden="true">◇</span>';};
    const identity=value=>String(value||'').normalize('NFKC').replace(/_/g,' ').toLowerCase(),catalog=new Map(catalogItems.map(item=>[identity(item.wikiTitle||item.name),item]));
    const hover=item=>{
        const baseStats=catalog.get(identity(item.title))?.stats||{},modifiedKeys=Object.keys(item.stats).filter(key=>isItemStatModified(baseStats[key],item.stats[key],item.tier));
        return characterItemboxTitleMarkup(itemName(item),{title:item.title})+'<div class="character-itembox-body">'+characterItemboxBodyMarkup({stats:item.stats,baseStats,details:item.details,icon:icons[item.iconId],modifiedKeys})+(item.augments?.length?'<div class="character-inspect-augments">'+item.augments.map(characterItemboxExaltationMarkup).join('')+'</div>':'')+'</div>';
    };
    const gear=CHARACTER_EQUIPMENT_ROWS.map(row=>`<div class="character-inspect-row">${row.map(id=>{
        const item=items.get(id),slot=slots.get(id);
        return `<div class="character-inspect-slot"><span class="character-slot-label">${escape(slot.label)}</span>${item?`<a class="character-inspect-icon" href="${escape(url(item.title))}" target="_blank" rel="noopener" aria-label="${escape(itemName(item))}">${icon(item)}<small>${item.tier>0?'+'+item.tier:''}</small></a><div class="character-inspect-item wiki-itembox">${hover(item)}</div>`:'<span class="character-inspect-empty">·</span>'}</div>`;
    }).join('')}</div>`).join('');
    const computed=Object.fromEntries(Object.entries(sheet.totals).map(([key,record])=>[key,{...record,caveats:[]}])) ,current={stats:Object.fromEntries(Object.keys(sheet.totals).map(key=>[key,null]))};
    return `<div class="character-inspect"><div class="character-inspect-top"><div class="character-profile-panel">${characterIdentityMarkup(sheet.metadata)}</div><div class="character-inspect-gear">${gear}</div></div><div class="character-totals-panel"><div class="character-mini-stats">${characterStatSummaryMarkup({current,observed:current,computed})}</div></div></div>`;
}
