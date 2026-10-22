// OCR proposals only: never scale an item, infer drop sources or publish a fact.
export const SCREEN_READ_PARSER_VERSION = 2;
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim();
const number = value => Number(String(value).replace(/,/g,''));
const statNames = {
    AC:'ac', HP:'hp', Mana:'mana', Endurance:'endurance', End:'endurance', Strength:'str', STR:'str',
    Stamina:'sta', STA:'sta', Agility:'agi', AGI:'agi', Dexterity:'dex', DEX:'dex', Wisdom:'wis', WIS:'wis',
    Intelligence:'int', INT:'int', Charisma:'cha', CHA:'cha', Weight:'weight', Damage:'damage', DMG:'damage', Delay:'delay',
    'SV Poison':'resistPoison', 'SV Magic':'resistMagic', 'SV Disease':'resistDisease', 'SV Fire':'resistFire',
    'SV Cold':'resistCold', 'SV Corruption':'resistCorruption', 'SV Void':'resistCorruption',
    'HP Regen':'hpRegen', 'Mana Regen':'manaRegen', 'End Regen':'enduranceRegen', 'Attack Speed':'attackSpeed',
    'Required Level':'requiredLevel', 'Recommended Level':'recommendedLevel'
};
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];}
const descriptionLabel=value=>distance(clean(value).toLowerCase(),'description')<=3;
function field(key, raw, value, confidence) { return { key, raw:clean(raw).slice(0,512), value, confidence }; }
function wordRows(words) {
    const rows = [];
    for (const word of words.filter(word => word?.bbox && clean(word.text)).sort((a,b) => a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0)) {
        const top = word.bbox.y0, height = Math.max(1,word.bbox.y1-word.bbox.y0);
        // Small glyphs/digits and oversized noisy words have different centers;
        // their aligned top edges are safer than joining the next numeric row.
        let row = rows.find(row => Math.abs(row.y-top) <= Math.max(3, Math.min(height,row.height)*0.45));
        if (!row) { row = { y:top,height,words:[] }; rows.push(row); }
        row.words.push(word);
    }
    return rows.sort((a,b) => a.y-b.y).map(row => ({...row,words:row.words.sort((a,b) => a.bbox.x0-b.bbox.x0)}));
}
const wordLines = words => wordRows(words).map(row=>row.words.map(word=>word.text).join(' ')).join('\n');
const label = value => clean(value).replace(/^[^a-z]+|[^a-z]+$/gi,'').toLowerCase();
const nameTokens = value => new Set(clean(value).toLowerCase().match(/[a-z]{4,}/g)||[]);
function fallbackItemRegion(words) {
    // Missing/mangled Description is common at small game font sizes. Require
    // aligned Class + Race labels and an independently repeated title/body name;
    // a stray stat, chat line or item link cannot establish an examine pane.
    for(const classWord of words.filter(word=>word.bbox && label(word.text)==='class')) {
        const height=Math.max(1,classWord.bbox.y1-classWord.bbox.y0);
        const race=words.find(word=>word.bbox && label(word.text)==='race' &&
            Math.abs(word.bbox.x0-classWord.bbox.x0)<=height && word.bbox.y0>classWord.bbox.y0 && word.bbox.y0-classWord.bbox.y0<=height*5);
        if(!race)continue;
        const left=classWord.bbox.x0-height, right=classWord.bbox.x0+height*32;
        const rows=wordRows(words.filter(word=>word.bbox && word.bbox.x0>=left && word.bbox.x1<=right &&
            word.bbox.y0<classWord.bbox.y0-height*0.4 && word.bbox.y0>=classWord.bbox.y0-height*10));
        for(const row of [...rows].reverse()) {
            const candidateWords=row.words.filter(word=>word.bbox.x0>=classWord.bbox.x0-height*0.4 && /[a-z0-9]/i.test(word.text));
            const candidate=candidateWords.map(word=>word.text).join(' '), tokens=nameTokens(candidate);
            if(tokens.size<2 || /\bNo (?:Trade|Trace|Drop)\b/i.test(candidate) || /^(?:Class|Race|Slot|Tier|Description|Lore|Modified)\b/i.test(candidate))continue;
            if(!rows.some(other=>other.y<row.y-height*0.5 && [...nameTokens(other.words.map(word=>word.text).join(' '))].filter(token=>tokens.has(token)).length>=2))continue;
            return {x:Math.max(0,left),y:Math.max(0,row.y-height*5),right,bottom:Infinity,name:candidate};
        }
    }
    return null;
}
function itemRegion(words) {
    const description = words.find(word => word.bbox && (/^description$/i.test(clean(word.text)) ||
        clean(word.text).length>=8 && descriptionLabel(word.text) && words.some(other=>other.bbox&&Number(other.confidence)>=50&&/^lore$/i.test(clean(other.text))&&
            Math.abs(other.bbox.y0-word.bbox.y0)<Math.max(16,word.bbox.y1-word.bbox.y0)&&other.bbox.x0>word.bbox.x0)));
    if (!description) return fallbackItemRegion(words);
    const lore = words.find(word => /^lore$/i.test(clean(word.text)) && word.bbox &&
        Math.abs(word.bbox.y0-description.bbox.y0) < 16 && word.bbox.x0 > description.bbox.x0);
    const margin=Math.max(24,(description.bbox.y1-description.bbox.y0)*6);
    return { x:Math.max(0,description.bbox.x0-margin), y:Math.max(0,description.bbox.y0-margin),
        right:lore ? lore.bbox.x1+margin : Infinity, bottom:Infinity };
}
function stats(text, confidence, { character = false } = {}) {
    const fields = [];
    // Long labels first avoid parsing an item's HP Regen as HP.
    for (const [label,key] of Object.entries(statNames).sort((a,b)=>b[0].length-a[0].length)) {
        const regex = new RegExp(`(?:^|[ \\t|])${escaped(label)}[ \\t]*[:=]?[ \\t]*([+-]?[\\d,]+(?:\\.\\d+)?)[ \\t]*(?:\\/[ \\t]*([\\d,]+))?(?=$|[ \\t%|])`,'im');
        const match = text.match(regex);
        if (!match || (label==='HP' && /HP\s+Regen/i.test(match[0])) || /^[-+]?0\d/.test(match[1])) continue;
        if (character && ['hp','mana','endurance'].includes(key) && match[2] !== undefined) {
            fields.push(field(`${key}Current`,match[0],number(match[1]),confidence));
            fields.push(field(`${key}Maximum`,match[0],number(match[2]),confidence));
        } else fields.push(field(key,match[0],number(match[1]),confidence));
    }
    const seen = new Set(); return fields.filter(entry => { if (seen.has(entry.key) || !Number.isFinite(entry.value)) return false; seen.add(entry.key); return true; });
}
function itemName(lines) {
    const labeled = lines.find(line => /^(?:Item(?: Name)?|Name)\s*:/i.test(line));
    if (labeled) return labeled.replace(/^(?:Item(?: Name)?|Name)\s*:\s*/i,'').replace(/\s*\((?:Augmented|Modified)[^)]*\)\s*$/i,'').trim();
    const descriptionIndex = lines.findIndex(line => descriptionLabel(line.replace(/\s+Lore$/i,'')));
    if (descriptionIndex >= 0) {
        const candidate = lines[descriptionIndex+1];
        if (candidate && !/^(?:No Trade|No Trace|No Drop|Lore|Class|Race|Slot|Tier)\b/i.test(candidate)) return candidate;
    }
    return '';
}
export function parseScreenRead(input = {}) {
    const raw = clean(input.text).slice(0,16384), words = Array.isArray(input.words) ? input.words.slice(0,2000) : [];
    const confidence = Math.max(0,Math.min(100,Number(input.confidence) || 0));
    if (!raw) return [];
    const metadata = { kind:input.kind === 'manual' ? 'manual':'ocr', owner:input.owner || 'contribution', sessionId:input.sessionId || '',
        capturedAt:input.capturedAt || new Date().toISOString(), input:input.input || {} };
    const region = itemRegion(words);
    const itemText = region ? wordLines(words.filter(word => word.bbox && word.bbox.x0>=region.x && word.bbox.x1<=region.right && word.bbox.y0>=region.y)) : raw;
    const lines = itemText.split(/\r?\n/).map(clean).filter(Boolean), name = (region?.name || itemName(lines)).slice(0,240);
    const observations = [];
    if (name && name.length > 2) {
        const fields = [field('name',name,name,confidence), ...stats(itemText,confidence)];
        const tier = itemText.match(/\bTier[ \t]*[:=]?[ \t]*(\d+)[ \t]*\/[ \t]*(\d+)/i) || name.match(/\+(\d+)\s*$/);
        if (tier && Number(tier[1])<=100) fields.push(field('tier',tier[0],Number(tier[1]),confidence));
        for (const [label,key] of [['Class','classes'],['Race','races'],['Slot','slots'],['Size','size']]) {
            const found = itemText.match(new RegExp(`^${label}[ \\t]*:[ \\t]*(.+)$`,'im'));
            if (found) fields.push(field(key,found[0],key==='size' ? found[1].trim() : found[1].split(/\s*[,/]\s*|\s+/).filter(Boolean),confidence));
        }
        const augmentNames = lines.filter(line=>/^(?:\w+ )?Exaltation\s*:/i.test(line) && !/:\s*empty\s*$/i.test(line)).map(line=>line.replace(/^[^:]+:\s*/,'')).slice(0,12);
        if (augmentNames.length) fields.push(field('augmentNames',augmentNames.join('; '),augmentNames,confidence));
        const effects = lines.filter(line=>/^(?:Click|Worn|Focus|Proc) Effect\s*:/i.test(line)).slice(0,12);
        if (effects.length) fields.push(field('effects',effects.join('; '),effects,confidence));
        if (/\bModified\b/i.test(itemText)) fields.push(field('modified','Modified',true,confidence));
        if (/\bNo Trade\b|\bNo Drop\b/i.test(itemText)) fields.push(field('noTrade','No Trade',true,confidence));
        observations.push({ ...metadata, parser:{name:'item-examine',version:SCREEN_READ_PARSER_VERSION},
            subject:{kind:'item',name}, fields, evidence:{text:fields.map(entry=>entry.raw).join('\n').slice(0,16384),imageId:null} });
    }
    // A visible inventory/stat heading is required; item-only panes cannot become
    // an authoritative character total. Geometry excludes the examine region.
    const characterText = region ? wordLines(words.filter(word=>word.bbox && word.bbox.x1<region.x)) : raw;
    if (/\bInventory\b|^Character Stats\b/im.test(characterText)) {
        const fields = stats(characterText,confidence,{character:true});
        if (fields.filter(entry=>['hpCurrent','hpMaximum','manaCurrent','manaMaximum','ac','str','sta','agi','dex','wis','int','cha'].includes(entry.key)).length>=3) {
            observations.push({ ...metadata, parser:{name:'character-stats',version:SCREEN_READ_PARSER_VERSION},
                subject:{kind:'character',name:clean(input.character).slice(0,80)},fields,
                evidence:{text:fields.map(entry=>entry.raw).join('\n').slice(0,16384),imageId:null} });
        }
    }
    return observations;
}
