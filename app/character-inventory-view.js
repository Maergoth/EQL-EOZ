import { CHARACTER_SLOTS, characterBaseItemName, characterEquipmentEligibility, characterItemStats, characterStatLabel, safeCharacterIcon } from './character-model.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null||value===undefined?'?':Number.isInteger(value)?String(value):String(Math.round(value*100)/100);
export const CHARACTER_EQUIPMENT_ROWS=Object.freeze([
    ['ear1','neck','face','head','ear2'],
    ['finger1','wrist1','arms','hands','wrist2','finger2'],
    ['shoulders','chest','back','waist','legs','feet'],
    ['primary','secondary','range','ammo','charm','power']
]);
const SHORT_SLOT={ear1:'L ear',ear2:'R ear',finger1:'L finger',finger2:'R finger',wrist1:'L wrist',wrist2:'R wrist',shoulders:'Shoulder',primary:'Primary',secondary:'Second.',power:'Power'};
const SLOT_MARK={ear1:'LE',ear2:'RE',head:'HD',face:'FC',neck:'NK',shoulders:'SH',arms:'AR',back:'BK',wrist1:'LW',wrist2:'RW',range:'RG',hands:'HN',primary:'1H',secondary:'2H',finger1:'LF',finger2:'RF',chest:'CH',legs:'LG',feet:'FT',waist:'WT',ammo:'AM',charm:'CM',power:'PS'};
export function characterItemLabel(card){
    const name=characterBaseItemName(card?.name)||'Unknown item';
    return `${name}${card?.tier===null||card?.tier===undefined?' · tier unknown':card.tier>0?` +${card.tier}`:''}`;
}
const tierBadge=card=>`<span class="character-tier" data-item-tier>${card.tier===null?'?':card.tier>0?`+${card.tier}`:'0'}</span>`;
function itemIcon(card){return safeCharacterIcon(card?.icon)?`<img src="${escape(card.icon)}" alt="" draggable="false">`:'<span class="character-item-glyph" aria-hidden="true">◇</span>';}

export function characterEquipmentMarkup(snapshot){
    const byId=new Map(snapshot.candidates.map(card=>[card.id,card])),slots=new Map(CHARACTER_SLOTS.map(slot=>[slot.id,slot]));
    return CHARACTER_EQUIPMENT_ROWS.flatMap((row,r)=>row.map((id,c)=>{
        const slot=slots.get(id),card=byId.get(snapshot.equipment[id]);
        return `<div class="character-slot" data-slot-id="${id}" style="--slot-row:${r+1};--slot-column:${c+1}"><span class="character-slot-label">${escape(SHORT_SLOT[id]||slot.label)}</span><button type="button" class="character-slot-icon ${card?'is-equipped':''}" ${card?`data-equipped-card="${id}" data-edit-card="${escape(card.id)}" draggable="true"`:`data-equip-slot="${id}"`} aria-label="${escape(`${slot.label}: ${card?characterItemLabel(card):'empty'}`)}">${card?itemIcon(card)+tierBadge(card):`<span aria-hidden="true">${SLOT_MARK[id]}</span>`}</button></div>`;
    })).join('');
}

export function characterLooseInventoryMarkup(cards,selectedId){
    return cards.map(card=>{const known=characterEquipmentEligibility(card).known;
        return `<article class="character-item-wrap ${known?'':'is-unmatched'}" data-character-card="${escape(card.id)}"><button type="button" class="character-item-remove" data-inventory-remove="${escape(card.id)}" aria-label="Remove ${escape(characterItemLabel(card))}">×</button><button type="button" draggable="true" class="character-item-card ${card.id===selectedId?'is-active':''}" data-edit-card="${escape(card.id)}" aria-label="${escape(characterItemLabel(card))}${known?'':' · match needed'}">${itemIcon(card)}${tierBadge(card)}${known?'':'<span class="character-unmatched-mark" data-item-unmatched aria-label="Match needed">!</span>'}<span class="character-sr-only">${escape(characterItemLabel(card))}</span></button></article>`;
    }).join('')||'<p class="empty-state">No loose items. Equipped gear appears in the slots above.</p>';
}

export function characterIdentityMarkup(metadata){
    const classes=metadata.classes?.length?metadata.classes:[],initials=classes.map(value=>String(value).slice(0,3).toUpperCase());
    return `<div class="character-identity-heading"><div class="character-class-crest" aria-label="${escape(classes.join(' / ')||'Class not set')}">${initials.length?initials.map(value=>`<span>${escape(value)}</span>`).join(''):'<span>?</span>'}</div><div class="character-identity-copy"><h3>${escape(metadata.name||'Your character')}</h3><p>${escape([metadata.level===null?'Level unknown':`Level ${metadata.level}`,classes.join(' / ')||'Class not set'].join(' · '))}</p><p>${escape([metadata.server,metadata.race].filter(Boolean).join(' · ')||'Server not set')}<span class="character-aa-count">${metadata.aaCount===null?'AA count unknown':`${escape(metadata.aaCount)} AAs`}</span></p></div></div>`;
}

export function characterStatSummaryMarkup(totals){
    const base=totals.base?.stats||{},hasAc=['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION'].some(key=>Object.hasOwn(base,key)),hasAtk=['ATK_OFFENSE','ATK_ACCURACY'].some(key=>Object.hasOwn(base,key));
    const resourceKeys=['HP','MP','END'].map(key=>Object.hasOwn(base,`${key}_MAXIMUM`)?`${key}_MAXIMUM`:key);
    const groups=[['Resources',resourceKeys],['Combat',['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','AC','ATK_OFFENSE','ATK_ACCURACY','ATK','HASTE']],['Attributes',['STR','STA','AGI','DEX','WIS','INT','CHA']],['Resists',['SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE','SV_CORRUPTION']]];
    return groups.map(([name,keys])=>`<section class="character-mini-stat-group"><h4>${name}</h4><dl>${keys.filter(key=>!(key==='AC'&&hasAc)&&!(key==='ATK'&&hasAtk)).map(key=>{
        const value=totals.computed[key],label=characterStatLabel(key.endsWith('_MAXIMUM')?key.slice(0,-8):key),title=value?.caveats?.join(' ')||'No Equipment baseline has not been captured.';
        return `<div data-summary-stat="${key}" title="${escape(title)}"><dt>${escape(label)}</dt><dd class="${value?.value===null||!value?'is-unknown':''}">${number(value?.value)}${value?.value!==null&&value?.value!==undefined&&!value.complete?'*':''}</dd></div>`;
    }).join('')}</dl></section>`).join('');
}

export function characterItemTooltipMarkup(card){
    const read=characterItemStats(card),known=characterEquipmentEligibility(card).known;
    const raw=String(card.observedName||'').trim(),tierMatch=raw.match(/\+(\d+)\s*$/),tierConflict=tierMatch&&card.tier!==null&&Number(tierMatch[1])!==card.tier;
    return `<div class="character-item-detail-title">${itemIcon(card)}<div><strong>${escape(characterItemLabel(card))}</strong><small>${escape(card.slots.join(' / ')||'Slots unknown')}${card.level!==null?` · Level ${escape(card.level)}`:''}</small></div></div>${known?'':'<p class="character-match-warning">! Match this item to the cached wiki catalog before equipping.</p>'}<dl class="character-item-stat-block">${Object.entries(read.stats).map(([key,value])=>`<div><dt>${escape(characterStatLabel(key))}</dt><dd>${number(value)}</dd></div>`).join('')||'<div><dt>Statistics</dt><dd>Not read</dd></div>'}</dl>${raw&&characterBaseItemName(raw)!==characterBaseItemName(card.name)?`<p class="settings-helper">Screen read: ${escape(raw)}</p>`:''}${tierConflict?'<p class="character-match-warning">The screen-read tier differs from this card. Review its tier.</p>':''}<p class="settings-helper">${read.basis==='observed-examine'?'Observed item values':'Catalog values at this tier'}${read.complete?'':' · partial / review unknown values'}</p>`;
}
