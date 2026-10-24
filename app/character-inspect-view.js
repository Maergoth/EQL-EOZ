import {characterItemDetailsMarkup} from './character-item-card.js';
import { CHARACTER_SLOTS, characterStatLabel, safeCharacterIcon } from './character-model.js';
import { CHARACTER_EQUIPMENT_ROWS, characterIdentityMarkup, characterStatSummaryMarkup } from './character-inventory-view.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null?'?':String(value);
const url=title=>'https://eqlwiki.com/'+encodeURIComponent(title);
const itemName=item=>item.title+(item.tier>0?' +'+item.tier:'');
/** Read-only review of the exact structured sheet sent to the wiki host. */
export function characterInspectMarkup(sheet,{icons={}}={}){
    const items=new Map(sheet.equipment.map(item=>[item.slot,item])),slots=new Map(CHARACTER_SLOTS.map(slot=>[slot.id,slot]));
    const icon=item=>{const source=safeCharacterIcon(icons[item.iconId]);return source?`<img src="${escape(source)}" alt="">`:'<span aria-hidden="true">◇</span>';};
    const stats=values=>`<dl class="character-item-stat-block">${Object.entries(values).map(([key,value])=>`<div><dt>${escape(characterStatLabel(key))}</dt><dd>${escape(number(value))}</dd></div>`).join('')}</dl>`;
    const gear=CHARACTER_EQUIPMENT_ROWS.map(row=>`<div class="character-inspect-row">${row.map(id=>{
        const item=items.get(id),slot=slots.get(id);
        return `<div class="character-inspect-slot"><span class="character-slot-label">${escape(slot.label)}</span>${item?`<a class="character-inspect-icon" href="${escape(url(item.title))}" target="_blank" rel="noopener" aria-label="${escape(itemName(item))}">${icon(item)}<small>${item.tier>0?'+'+item.tier:''}</small></a><div class="character-inspect-item"><strong><a href="${escape(url(item.title))}" target="_blank" rel="noopener">${escape(itemName(item))}</a></strong>${stats(item.stats)}${characterItemDetailsMarkup(item.details)}${item.augments?.length?`<div class="character-inspect-augments"><strong>Exaltations</strong>${item.augments.map(augment=>`<div><a href="${escape(url(augment.title))}" target="_blank" rel="noopener">${icon(augment)}${escape(itemName(augment))}</a>${stats(augment.stats)}${characterItemDetailsMarkup(augment.details)}</div>`).join('')}</div>`:''}</div>`:'<span class="character-inspect-empty">·</span>'}</div>`;
    }).join('')}</div>`).join('');
    const computed=Object.fromEntries(Object.entries(sheet.totals).map(([key,record])=>[key,{...record,caveats:[]}])) ,current={stats:Object.fromEntries(Object.keys(sheet.totals).map(key=>[key,null]))};
    return `<div class="character-inspect"><div class="character-inspect-top"><div class="character-profile-panel">${characterIdentityMarkup(sheet.metadata)}</div><div class="character-inspect-gear">${gear}</div></div><div class="character-totals-panel"><div class="character-mini-stats">${characterStatSummaryMarkup({current,observed:current,computed})}</div></div></div>`;
}
