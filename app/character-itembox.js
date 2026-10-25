import {normalizeCharacterItemDetails,safeCharacterDetailTitle} from './character-item-card.js';
import {safeCharacterIcon,characterStatLabel} from './character-model.js';

// Presentation only. Values are supplied by the existing item-tier model;
// wiki template defaults below never enter the saved card or character totals.
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const own=(value,key)=>Object.hasOwn(value||{},key),finite=value=>typeof value==='number'&&Number.isFinite(value);
const number=value=>!finite(value)?'?':Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
const labels={MP:'MANA',END:'END',ATK:'ATK',ACCURACY:'Accuracy',DMG_BONUS:'DMG Bonus',BACKSTAB_DMG:'BACKSTAB',SV_MAGIC:'SV MAGIC',SV_FIRE:'SV FIRE',SV_COLD:'SV COLD',SV_POISON:'SV POISON',SV_DISEASE:'SV DISEASE',SV_CORRUPTION:'SV VOID',HP_REGEN:'HP Regen',MANA_REGEN:'Mana Regen',END_REGEN:'End Regen',ATTACK_SPEED:'Attack Speed %'};
export const characterItemboxStatLabel=key=>labels[key]||characterStatLabel(key);
const attributeOrder=['STR','DEX','STA','AGI','WIS','INT','CHA','AC','HP','MP','END','ATK','HP_REGEN','MANA_REGEN','END_REGEN','HASTE','ATTACK_SPEED'];
const resistOrder=['SV_FIRE','SV_COLD','SV_MAGIC','SV_DISEASE','SV_POISON'];
const handModifiers={'1H BLUNT':.8,'1H SLASHING':.8,'PIERCING':.8,'1H PIERCING':.8,'HAND TO HAND':.8,'2H BLUNT':1.1,'2H SLASHING':1.1,'2H PIERCING':1.1};
export function characterItemboxTitleMarkup(label,{title=''}={}){
    const safe=safeCharacterDetailTitle(title),text=e(label);
    return `<div class="character-item-detail-title wiki-itembox-title"><strong>${safe?`<a href="https://eqlwiki.com/${encodeURIComponent(safe)}" target="_blank" rel="noopener">${text}</a>`:text}</strong></div>`;
}
export function characterItemboxBodyMarkup({stats={},baseStats={},details=[],icon='',slots=[],modifiedKeys=[],accuracyPercent=!own(baseStats,'ACCURACY')&&own(stats,'ACCURACY')}={}){
    const facts=normalizeCharacterItemDetails(details),first=label=>facts.find(fact=>fact.label===label)?.value||'',used=new Set(),modified=new Set(modifiedKeys);
    const metaValue=detail=>{if(!detail.linkTitle)return e(detail.value);const link=`<a href="https://eqlwiki.com/${encodeURIComponent(detail.linkTitle)}" target="_blank" rel="noopener">${e(detail.linkTitle)}</a>`;return detail.value.startsWith(detail.linkTitle)?link+e(detail.value.slice(detail.linkTitle.length)):`<a href="https://eqlwiki.com/${encodeURIComponent(detail.linkTitle)}" target="_blank" rel="noopener">${e(detail.value)}</a>`;};
    const line=(section,body)=>body?`<div class="wiki-itembox-line" data-itembox-section="${section}">${body}</div>`:'';
    const stat=(key,{value=stats[key],signed=false,derived=false,suffix=''}={})=>{used.add(key);return `<span class="wiki-itembox-stat${key==='SV_CORRUPTION'?' is-void':''}" data-item-stat="${e(key)}"${derived?' data-itembox-derived="true"':''}>${e(characterItemboxStatLabel(key))}: <span class="wiki-itembox-value${modified.has(key)&&!derived?' is-scaled':''}">${signed&&finite(value)&&value>0?'+':''}${e(number(value))}</span>${e(suffix)}</span>`;};
    const metadata=(label,prefix=label)=>facts.filter(fact=>fact.label===label).map(fact=>`<span data-item-detail="${e(label)}">${prefix?e(prefix)+': ':''}${metaValue(fact)}</span>`).join(' ');
    const flags=line('flags',metadata('Flags',''));
    const slotText=first('Slot')||(Array.isArray(slots)?slots.join(' '):'');
    const slot=line('slot',slotText?`<span data-item-detail="Slot">Slot: ${e(slotText)}</span>`:'');
    const skillName=first('Skill'),delay=own(stats,'DELAY')?stats.DELAY:Number(first('Attack delay')),hasDelay=own(stats,'DELAY')||first('Attack delay')!=='';
    const skill=line('skill',(skillName?`<span data-item-detail="Skill">Skill: ${e(skillName)}</span> `:'')+(hasDelay?`<span data-item-detail="Attack delay" data-item-stat="DELAY">Atk Delay: <span class="wiki-itembox-value${modified.has('DELAY')?' is-scaled':''}">${e(number(delay))}</span></span>`:''));if(own(stats,'DELAY'))used.add('DELAY');
    const weapon=[];if(own(stats,'DMG'))weapon.push(stat('DMG'));
    const baseDamage=baseStats.DMG,baseDelay=own(baseStats,'DELAY')?baseStats.DELAY:Number(first('Attack delay')),hand=handModifiers[skillName.toUpperCase().replace(/\s+/g,' ').trim()],primary=/\bPRIMARY\b/.test(slotText.toUpperCase());
    if(own(stats,'DMG_BONUS'))weapon.push(stat('DMG_BONUS'));
    else if(!own(baseStats,'DMG_BONUS')&&primary&&hand&&finite(baseDamage)&&baseDamage>0&&finite(baseDelay)&&baseDelay>0)weapon.push(stat('DMG_BONUS',{value:Math.floor(hand*Math.max(baseDamage,50)*Math.min(baseDelay,50)/40*.5),derived:true,suffix:' @ lvl 50'}));
    if(finite(stats.DMG)&&stats.DMG>0&&finite(delay)&&delay>0)weapon.push(`<span class="wiki-itembox-ratio">Ratio: <span class="wiki-itembox-value${modified.has('DMG')||modified.has('DELAY')?' is-scaled':''}">(${(stats.DMG/delay).toFixed(2)})</span></span>`);
    const backstab=own(stats,'BACKSTAB_DMG')?stat('BACKSTAB_DMG'):!own(baseStats,'BACKSTAB_DMG')&&/\b(?:ROG|ALL)\b/i.test(first('Class'))&&/^Piercing$/i.test(skillName)&&finite(baseDamage)&&baseDamage>0?stat('BACKSTAB_DMG',{value:baseDamage,derived:true}):'';
    const accuracy=own(stats,'ACCURACY')?stat('ACCURACY',{signed:accuracyPercent,suffix:accuracyPercent?'%':''}):'';
    const attributes=attributeOrder.filter(key=>own(stats,key)).map(key=>stat(key,{signed:!['AC','ATK'].includes(key)})).join(' ');
    const resists=resistOrder.filter(key=>own(stats,key)).map(key=>stat(key,{signed:true})).join(' ');
    const effects=facts.filter(fact=>/^(?:Effect|Combat effect|Proc effect|Click effect|Worn effect|Focus effect|Focus Exaltation|Proc Exaltation|Rune Exaltation)$/.test(fact.label)).map(fact=>line('effect',`<span data-item-detail="${e(fact.label)}">${e(fact.label==='Effect'?'Effect':fact.label)}: ${metaValue(fact)}</span>`)).join('');
    const weight=own(stats,'WT')?stat('WT'):metadata('Weight','WT'),size=metadata('Size'),weightSize=line('weight-size',[weight,size].filter(Boolean).join(' '));
    const classRace=line('class',metadata('Class'))+line('race',metadata('Race'));
    const voidStat=line('void',own(stats,'SV_CORRUPTION')?stat('SV_CORRUPTION',{signed:true}):'');
    const extraStats=Object.keys(stats).filter(key=>!used.has(key)).map(key=>stat(key)).join(' ');
    const extras=facts.filter(fact=>['Charges','Required level','Recommended level','Notes','Details'].includes(fact.label)).map(fact=>line('detail',`<span data-item-detail="${e(fact.label)}">${fact.label==='Details'?'':e(fact.label)+': '}${metaValue(fact)}</span>`)).join('');
    const source=safeCharacterIcon(icon),image=source?`<img class="wiki-itembox-icon" src="${e(source)}" alt="" draggable="false">`:'';
    return `<div class="wiki-itembox-data">${image}${flags}${slot}${skill}${line('weapon',weapon.join(' '))}${line('backstab',backstab)}${line('accuracy',accuracy)}${line('attributes',attributes)}${line('resists',resists)}${effects}${weightSize}${classRace}${voidStat}${line('other-stats',extraStats)}${extras}${!Object.keys(stats).length?'<div class="wiki-itembox-line wiki-itembox-unread">Statistics not read</div>':''}</div>`;
}

/** Socket children are identities/effects only, never nested full Itemboxes. */
export function characterItemboxExaltationMarkup({title='',details=[]}={}){
    const canonical=safeCharacterDetailTitle(title);if(!canonical)return '';
    const effects=normalizeCharacterItemDetails(details).filter(detail=>/^(?:Effect|Combat effect|Proc effect|Click effect|Worn effect|Focus effect|Focus Exaltation|Proc Exaltation|Rune Exaltation)$/.test(detail.label));
    const values=effects.map(detail=>{const linked=detail.linkTitle?`<a href="https://eqlwiki.com/${encodeURIComponent(detail.linkTitle)}" target="_blank" rel="noopener">${e(detail.value)}</a>`:e(detail.value);return `<div class="wiki-itembox-exaltation-effect">Effect: ${linked}</div>`;}).join('');
    return `<div data-character-exaltation><span class="character-exaltation-label">Exaltation</span> <a href="https://eqlwiki.com/${encodeURIComponent(canonical)}" target="_blank" rel="noopener">${e(canonical)}</a>${values}</div>`;
}
