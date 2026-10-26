// Catalog-only item details. Numeric values use the existing tier-stat path;
// these bounded facts never become recorded character statistics or raw HTML.
export const CHARACTER_ITEM_DETAIL_LIMITS=Object.freeze({entries:32,label:60,value:400,bytes:8000});
const LABELS=new Set(['Flags','Slot','Class','Race','Skill','Attack delay','Size','Weight','Charges','Required level','Recommended level','Effect','Combat effect','Proc effect','Click effect','Worn effect','Focus effect','Focus Exaltation','Proc Exaltation','Rune Exaltation','Notes','Details']);
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/gu,' ').trim().slice(0,max);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeCharacterDetailTitle(value){
    if(typeof value!=='string'||value.length>230||/[\u0000-\u001f\u007f]/.test(value))return '';
    const text=clean(value,230);return text&&!/[\[\]{}<>|#:\r\n]/.test(text)&&!text.startsWith('.')?text:'';
}
export function normalizeCharacterItemDetails(input,{strict=false}={}){
    if(input===undefined)return [];
    if(!Array.isArray(input)||strict&&input.length>CHARACTER_ITEM_DETAIL_LIMITS.entries){if(strict)throw Error('Review the item card details.');return [];}
    const result=[],seen=new Set();let bytes=0;
    for(const entry of input.slice(0,CHARACTER_ITEM_DETAIL_LIMITS.entries)){
        if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.label!=='string'||typeof entry.value!=='string'||!LABELS.has(entry.label)||entry.label.length>60||entry.value.length>400||/[\u0000-\u001f\u007f]/.test(entry.label+entry.value)){if(strict)throw Error('Review the item card details.');continue;}
        const value=clean(entry.value,400),linkTitle=entry.linkTitle===undefined?'':safeCharacterDetailTitle(entry.linkTitle);
        if(!value||entry.linkTitle!==undefined&&(typeof entry.linkTitle!=='string'||!linkTitle||entry.linkTitle.length>230)){if(strict)throw Error('Review the item card effect link.');continue;}
        const detail={label:entry.label,value,...(linkTitle?{linkTitle}:{})},key=JSON.stringify(detail);if(seen.has(key))continue;
        bytes+=new TextEncoder().encode(key).length;if(bytes>CHARACTER_ITEM_DETAIL_LIMITS.bytes){if(strict)throw Error('The item card details exceed their size limit.');break;}
        seen.add(key);result.push(detail);
    }
    return result;
}
const EFFECT=/^(Effect|Combat Effect|Proc Effect|Click Effect|Worn Effect|Focus Effect|Focus Exaltation|Proc Exaltation|Rune Exaltation)\s*:\s*(.+)$/i;
const labels={'effect':'Effect','combat effect':'Combat effect','proc effect':'Proc effect','click effect':'Click effect','worn effect':'Worn effect','focus effect':'Focus effect','focus exaltation':'Focus Exaltation','proc exaltation':'Proc Exaltation','rune exaltation':'Rune Exaltation'};
const EFFECT_LABELS=new Set(['Effect','Combat effect','Proc effect','Click effect','Worn effect','Focus effect']);
export function characterEffectDetails(input){return normalizeCharacterItemDetails(input).filter(detail=>EFFECT_LABELS.has(detail.label));}
export function characterCatalogDetails(item={}){
    // Typed exporter facts retain their canonical targets. Display-text and
    // legacy focus fallbacks may repeat that fact with a guessed link target.
    const details=normalizeCharacterItemDetails(item.details||item.cardDetails),typed=new Set(details.map(detail=>JSON.stringify([detail.label,detail.value]))),add=(label,value,linkTitle)=>{const text=clean(value,400);if(text&&!typed.has(JSON.stringify([label,text])))details.push({label,value:text,...(linkTitle?{linkTitle}:{})});};
    for(const raw of (Array.isArray(item.displayLines)?item.displayLines:[]).slice(0,32)){
        const line=clean(raw,400);if(!line)continue;
        const effect=line.match(EFFECT);
        if(effect){const name=effect[2].replace(/\s*\((?:Combat|Worn|Must Equip|Can Equip|Casting Time|Click|Proc)\b.*$/i,'').replace(/\s+(?:at|Req(?:uired)?\.?)\s+Level\s+\d+.*$/i,'').trim();add(labels[effect[1].toLowerCase()],effect[2],safeCharacterDetailTitle(name));continue;}
        const simple=line.match(/^(Slot|Class|Race|Charges|Required Level|Recommended Level)\s*:\s*(.+)$/i);
        if(simple){const label=simple[1].toLowerCase();add({'slot':'Slot','class':'Class','race':'Race','charges':'Charges','required level':'Required level','recommended level':'Recommended level'}[label],simple[2]);continue;}
        const skill=line.match(/^Skill:\s*(.*?)(?:\s+(?:Atk\s+)?Delay:\s*([\d.]+))?$/i);
        if(skill){add('Skill',skill[1]);add('Attack delay',skill[2]);continue;}
        const size=line.match(/\bSize:\s*(\S+)/i);if(size)add('Size',size[1]);
        const weight=line.match(/^(?:WT|Weight):\s*([\d.]+)/i);if(weight&&!Object.hasOwn(item.stats||{},'WT'))add('Weight',weight[1]+' (base)');
        if(size||weight)continue;
        if(/\b(?:MAGIC ITEM|LORE(?: EQUIPPED| ITEM)?|NO DROP|NO TRADE|PLACEABLE|AUGMENTATION|ATTUNEABLE|HEIRLOOM)\b/i.test(line)&&!/:/.test(line)){add('Flags',line);continue;}
        // Base numeric lines are already represented by scaled stats. Unknown
        // prose is retained only when it contains no stat-like numeric pair.
        if(!/\b[A-Za-z][A-Za-z .%]*:\s*[+\-]?\d/.test(line)&&!/^Tier\b/i.test(line))add('Details',line);
    }
    if(!details.some(value=>value.label==='Slot')&&Array.isArray(item.slots)&&item.slots.length)add('Slot',item.slots.join(' '));
    if(!details.some(value=>value.label==='Class')&&Array.isArray(item.classes)&&item.classes.length)add('Class',item.classes.join(' '));
    if(!details.some(value=>value.label==='Race')&&Array.isArray(item.races)&&item.races.length)add('Race',item.races.join(' '));
    if(item.requiredLevel!==undefined&&item.requiredLevel!==null)add('Required level',String(item.requiredLevel));
    const focus=item.focus_effect||item.focusEffect;if(typeof focus==='string'&&focus.trim())add('Focus effect',focus,safeCharacterDetailTitle(focus));
    if(typeof item.notes==='string')add('Notes',item.notes);
    return normalizeCharacterItemDetails(details);
}
export function characterItemDetailsMarkup(details){
    const values=normalizeCharacterItemDetails(details);return values.length?'<dl class="character-item-details">'+values.map(detail=>`<div data-item-detail="${escape(detail.label)}"><dt>${escape(detail.label)}</dt><dd>${detail.linkTitle?`<a href="https://eqlwiki.com/${encodeURIComponent(detail.linkTitle)}" target="_blank" rel="noopener">${escape(detail.value)}</a>`:escape(detail.value)}</dd></div>`).join('')+'</dl>':'';
}

export const catalogItemDetailsMarkup=item=>characterItemDetailsMarkup(characterCatalogDetails(item));
