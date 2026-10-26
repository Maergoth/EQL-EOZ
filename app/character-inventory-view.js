import {characterItemboxTitleMarkup,characterItemboxBodyMarkup} from './character-itembox.js';
import { CHARACTER_SLOTS, characterBaseItemName, characterEquipmentEligibility, characterItemStats, characterStatLabel, safeCharacterIcon } from './character-model.js';
import { isItemStatModified } from './item-stat-presentation.js';
import { characterTotalGroups } from './character-totals.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null||value===undefined?'?':Number.isInteger(value)?String(value):String(Math.round(value*100)/100);
export const CHARACTER_EQUIPMENT_ROWS=Object.freeze([
    ['ear1','neck','face','head','ear2'],
    ['finger1','wrist1','arms','hands','wrist2','finger2'],
    ['shoulders','chest','back','waist','legs','feet'],
    ['primary','secondary','range','ammo','charm'],
    ['any1','any2']
]);
const SHORT_SLOT={ear1:'L ear',ear2:'R ear',finger1:'L finger',finger2:'R finger',wrist1:'L wrist',wrist2:'R wrist',shoulders:'Shoulder',primary:'Primary',secondary:'Second.',any1:'Any 1',any2:'Any 2'};
const SLOT_MARK={ear1:'LE',ear2:'RE',head:'HD',face:'FC',neck:'NK',shoulders:'SH',arms:'AR',back:'BK',wrist1:'LW',wrist2:'RW',range:'RG',hands:'HN',primary:'1H',secondary:'2H',finger1:'LF',finger2:'RF',chest:'CH',legs:'LG',feet:'FT',waist:'WT',ammo:'AM',charm:'CM'};
export function characterItemLabel(card){
    let name=characterBaseItemName(card?.name)||'Unknown item';
    if(card?.itemRole==='exaltation'&&!/\(Exaltation\)$/i.test(name))name+=' (Exaltation)';
    return `${name}${card?.tier===null||card?.tier===undefined?' · tier unknown':card.tier>0?` +${card.tier}`:''}`;
}
const tierBadge=card=>`<span class="character-tier" data-item-tier>${card.tier===null?'?':card.tier>0?`+${card.tier}`:'0'}</span>`;
/** Refresh existing icons without replacing the hovered card or focused tier slider. */
export function updateCharacterItemTierMarkup(root,card){
    if(!root?.querySelectorAll||!card?.id)return 0;
    let changed=0;
    for(const button of root.querySelectorAll('[data-edit-card]')){
        if(button.dataset.editCard!==card.id)continue;
        const label=characterItemLabel(card),badge=button.querySelector('[data-item-tier]'),hiddenName=button.querySelector('.character-sr-only');
        if(badge)badge.textContent=card.tier===null||card.tier===undefined?'?':card.tier>0?'+'+card.tier:'0';
        if(hiddenName)hiddenName.textContent=label;
        const slot=CHARACTER_SLOTS.find(value=>value.id===button.dataset.equippedCard);
        button.setAttribute('aria-label',slot?slot.label+': '+label:label+(characterEquipmentEligibility(card).known?'':' · match needed'));
        const remove=slot&&button.closest('[data-slot-id]')?.querySelector('[data-unequip-slot]');
        if(remove){const description='Unequip '+label+' from '+slot.label;remove.setAttribute('aria-label',description);remove.setAttribute('title',description);}
        changed++;
    }
    return changed;
}
function itemIcon(card){return safeCharacterIcon(card?.icon)?`<img src="${escape(card.icon)}" alt="" draggable="false">`:'<span class="character-item-glyph" aria-hidden="true">◇</span>';}

export function characterEquipmentMarkup(snapshot){
    const byId=new Map(snapshot.candidates.map(card=>[card.id,card])),slots=new Map(CHARACTER_SLOTS.map(slot=>[slot.id,slot]));
    return CHARACTER_EQUIPMENT_ROWS.flatMap((row,r)=>row.map((id,c)=>{
        const slot=slots.get(id),card=byId.get(snapshot.equipment[id]);
        const unequipLabel=card?escape(`Unequip ${characterItemLabel(card)} from ${slot.label}`):'';
        return `<div class="character-slot ${slot.universal?'is-universal':''}" data-slot-id="${id}" style="--slot-row:${r+1};--slot-column:${c+1+(r===4?2:0)}"><span class="character-slot-label">${escape(SHORT_SLOT[id]||slot.label)}</span>${card?`<button type="button" class="character-item-remove character-equipped-remove" data-unequip-slot="${id}" aria-label="${unequipLabel}" title="${unequipLabel}" draggable="false">×</button>`:''}<button type="button" class="character-slot-icon ${card?'is-equipped':''}" ${card?`data-equipped-card="${id}" data-edit-card="${escape(card.id)}" draggable="true"`:`data-equip-slot="${id}"`} aria-label="${escape(`${slot.label}: ${card?characterItemLabel(card):'empty'}`)}">${card?itemIcon(card)+tierBadge(card):`<span aria-hidden="true">${slot.universal?'ANY':SLOT_MARK[id]}</span>`}</button></div>`;
    })).join('');
}

export function characterLooseInventoryMarkup(cards,selectedId){
    return cards.map(card=>{const known=characterEquipmentEligibility(card).known;
        return `<article class="character-item-wrap ${known?'':'is-unmatched'}" data-character-card="${escape(card.id)}"><button type="button" class="character-item-remove" data-inventory-remove="${escape(card.id)}" aria-label="Remove ${escape(characterItemLabel(card))}">×</button><button type="button" draggable="true" class="character-item-card ${card.id===selectedId?'is-active':''}" data-edit-card="${escape(card.id)}" aria-label="${escape(characterItemLabel(card))}${known?'':' · match needed'}">${itemIcon(card)}${tierBadge(card)}${known?'':'<span class="character-unmatched-mark" data-item-unmatched aria-label="Match needed">!</span>'}<span class="character-sr-only">${escape(characterItemLabel(card))}</span></button></article>`;
    }).join('')||'<p class="empty-state">No loose items. Equipped gear appears in the slots above.</p>';
}

/** Raw keyring/unmatched records are deliberately not equipment candidates. */
export function characterExportRowsMarkup(rows,kinds={}){
    return rows.filter(row=>kinds[row.id]&&kinds[row.id]!=='card').map(row=>{
        const entry=row.entry||row,name=entry.name||entry.baseName||'Unnamed export row',location=entry.location||entry.inventoryOrigin?.location||'Export location not recorded';
        return `<article class="character-export-row" data-export-row="${escape(row.id)}"><strong>${escape(name)}</strong><span>${escape(location)}${Number.isSafeInteger(entry.count)?` · ${escape(entry.count)} recorded`:''}</span><small>${kinds[row.id]==='keyring'?'Keyring entry':'Unmatched export · stored privately'}</small></article>`;
    }).join('');
}
export function characterLargeRowsMarkup(rows,kinds={}){
    return rows.filter(row=>row.repositoryLarge&&(!kinds[row.id]||kinds[row.id]==='card')).map(row=>`<article class="character-export-row"><button type="button" class="text-button" data-load-character-item="${escape(row.id)}">${escape(row.name||'Saved item')}</button><small>Open saved item details</small></article>`).join('');
}

export function characterIdentityMarkup(metadata){
    const classes=metadata.classes?.length?metadata.classes:[],initials=classes.map(value=>String(value).slice(0,3).toUpperCase());
    return `<div class="character-identity-heading"><div class="character-class-crest" aria-label="${escape(classes.join(' / ')||'Class not set')}">${initials.length?initials.map(value=>`<span>${escape(value)}</span>`).join(''):'<span>?</span>'}</div><div class="character-identity-copy"><h3>${escape(metadata.name||'Your character')}</h3><p>${escape([metadata.level===null?'Level unknown':`Level ${metadata.level}`,classes.join(' / ')||'Class not set'].join(' · '))}</p><p>${escape([metadata.server,metadata.race].filter(Boolean).join(' · ')||'Server not set')}<span class="character-aa-count">${metadata.aaCount===null?'AA count unknown':`${escape(metadata.aaCount)} AAs`}</span></p></div></div>`;
}

export function characterStatSummaryMarkup(totals){
    return characterTotalGroups(totals).map(group=>`<section class="character-mini-stat-group"><h4>${group.label}</h4><dl>${group.rows.map(row=>`<div data-summary-stat="${row.key}" title="${escape(row.caveats.join(' '))}"><dt>${escape(row.label)}</dt><dd class="${row.value===null?'is-unknown':''}">${number(row.value)}${row.value!==null&&!row.complete?'*':''}</dd></div>`).join('')}</dl></section>`).join('');
}

export function characterItemTitleMarkup(card){
    return characterItemboxTitleMarkup(characterItemLabel(card),{title:characterEquipmentEligibility(card).known?card.wikiTitle:''});
}
export function characterTierControlsMarkup(card){
    return `<div class="character-tier-controls"><label><span>Item tier</span> <output data-card-tier-value>+${card.tier??0}</output><input data-card-tier type="range" min="0" max="10" step="1" value="${card.tier??0}" aria-label="Selected item tier"></label>${Object.keys(card.observedStats).length?'<div class="capture-actions"><button class="text-button" type="button" data-card-observed-basis>Use captured stats</button></div>':''}</div>`;
}
export function characterItemStatBodyMarkup(card){
    const read=characterItemStats(card),known=characterEquipmentEligibility(card).known;
    const raw=String(card.observedName||'').trim(),tierMatch=raw.match(/\+(\d+)\s*$/),tierConflict=tierMatch&&card.tier!==null&&Number(tierMatch[1])!==card.tier;
    const modifiedKeys=read.basis==='observed-examine'?[]:Object.keys(read.stats).filter(key=>isItemStatModified(card.baseStats[key],read.stats[key],card.tier));
    const facts=characterItemboxBodyMarkup({stats:read.stats,baseStats:card.baseStats,details:card.details,icon:card.icon,slots:card.slots,modifiedKeys,accuracyPercent:read.accuracyPercent});
    return `<div class="character-itembox-body">${known?'':'<p class="character-match-warning">! Match this item to the cached wiki catalog before equipping.</p>'}${facts}${characterAugmentSlotsMarkup(card)}${raw&&characterBaseItemName(raw)!==characterBaseItemName(card.name)?`<p class="settings-helper">Screen read: ${escape(raw)}</p>`:''}${tierConflict&&read.basis!=='catalog-tier-preview'?'<p class="character-match-warning">The screen-read tier differs from this card. Review its tier.</p>':''}<p class="settings-helper wiki-itembox-basis">${read.basis==='observed-examine'?'Captured values':read.basis==='catalog-tier-preview'?'Preview from wiki base stats':'Catalog values at this tier'}</p>${[card.previewWarning,card.slotReadWarning].filter(Boolean).map(message=>`<p class="character-match-warning">${escape(message)}</p>`).join('')}</div>`;
}
export function characterAugmentSlotsMarkup(card){
    const count=card.augmentSlots;
    if(!Number.isInteger(count))return `<button type="button" class="text-button" data-augment-configure="${escape(card.id)}">Set Exaltation slots</button>`;
    if(!count)return `<button type="button" class="text-button" data-augment-configure="${escape(card.id)}">Exaltation slots: 0 · Change</button>`;
    return `<div class="character-augment-section"><span>Exaltations</span> <button type="button" class="text-button" data-augment-configure="${escape(card.id)}">Change slots</button><div class="character-augment-slots">${Array.from({length:count},(_,index)=>{
        const augment=card.augments?.find(item=>item.index===index),name=augment?characterItemLabel(augment):'Empty Exaltation slot '+(index+1);
        return `<div class="character-augment-slot"><button type="button" data-augment-pick="${escape(card.id)}" data-augment-index="${index}" aria-label="${escape((augment?'Replace Exaltation: ':'Choose item for ')+name)}" title="${escape(augment?'Exaltation: '+name:name)}">${augment?itemIcon(augment):'<span aria-hidden="true">+</span>'}</button>${augment?`<button type="button" class="character-augment-remove" data-augment-remove="${escape(card.id)}" data-augment-index="${index}" aria-label="Remove ${escape(name)}">×</button>`:''}</div>`;
    }).join('')}</div></div>`;
}
export function characterItemTooltipMarkup(card){return '<section class="wiki-itembox">'+characterItemTitleMarkup(card)+`<div data-tooltip-tier data-tooltip-card="${escape(card.id)}">${characterTierControlsMarkup(card)}</div>`+`<div data-tooltip-item-stats>${characterItemStatBodyMarkup(card)}</div>`+'</section>';}
