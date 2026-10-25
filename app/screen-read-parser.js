// OCR proposals only: never scale an item, infer drop sources or publish a fact.
export const SCREEN_READ_PARSER_VERSION = 9;
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim();
const number = value => Number(String(value).replace(/,/g,''));
const statNames = {
    AC:'ac', HP:'hp', Mana:'mana', Endurance:'endurance', End:'endurance', Strength:'str', STR:'str',
    Stamina:'sta', STA:'sta', Agility:'agi', AGI:'agi', Dexterity:'dex', DEX:'dex', Wisdom:'wis', WIS:'wis',
    Intelligence:'int', INT:'int', Charisma:'cha', CHA:'cha', Weight:'weight', WT:'weight', Damage:'damage', DMG:'damage', Delay:'delay',
    'SV Poison':'resistPoison', 'SV Magic':'resistMagic', 'SV Disease':'resistDisease', 'SV Fire':'resistFire',
    'SV Cold':'resistCold', 'SV Corruption':'resistCorruption', 'SV Void':'resistCorruption',
    'HP Regen':'hpRegen', 'Mana Regen':'manaRegen', 'End Regen':'enduranceRegen', 'Endurance Regen':'enduranceRegen', 'Attack Speed':'attackSpeed', Haste:'haste', Range:'range',
    'Required Level':'requiredLevel', 'Recommended Level':'recommendedLevel', 'Base Dmg':'damage','Backstab Dmg':'backstabDamage','Dmg Bon':'damageBonus','Damage Bonus':'damageBonus',Attack:'attack',
    'SV. Poison':'resistPoison','SV. Magic':'resistMagic','SV. Disease':'resistDisease','SV. Fire':'resistFire','SV. Cold':'resistCold','SV. Void':'resistCorruption',
    Velocity:'velocity','Primary DPS':'primaryDps','Secondary DPS':'secondaryDps','Ranged DPS':'rangedDps',
    Accuracy:'accuracy',Avoidance:'avoidance','Combat Effects':'combatEffects','Strike Through':'strikeThrough',Strikethrough:'strikeThrough','Stun Resist':'stunResist',
    'Damage Shielding':'damageShield','Damage Shield':'damageShield','Damage Shield Mitigation':'damageShieldMitigation','Damage Shield Mitiga':'damageShieldMitigation',
    'DoT Shielding':'dotShielding','Melee Shielding':'meleeShielding','Spell Shielding':'spellShielding'
};
const modernPairedStats=new Set(['str','sta','int','wis','agi','dex','cha','hp','mana','endurance','resistPoison','resistMagic','resistDisease','resistFire','resistCold','resistCorruption',
    'accuracy','avoidance','combatEffects','strikeThrough','stunResist','damageShield','damageShieldMitigation','dotShielding','meleeShielding','spellShielding']);
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
        let row = rows.find(row => Math.abs(row.y-top) <= Math.max(3, Math.min(height,row.height)*0.5));
        if (!row) { row = { y:top,height,words:[] }; rows.push(row); }
        row.words.push(word);
    }
    return rows.sort((a,b) => a.y-b.y).map(row => ({...row,words:row.words.sort((a,b) => a.bbox.x0-b.bbox.x0)}));
}
const wordLines = words => wordRows(words).map(row=>row.words.map(word=>word.text).join(' ')).join('\n');
const label = value => clean(value).replace(/^[^a-z]+|[^a-z]+$/gi,'').toLowerCase();
const nameTokens = value => new Set(clean(value).toLowerCase().match(/[a-z]{4,}/g)||[]);
const slotNames=value=>clean(value).replace(/\bPower\s+Source\b/gi,'PowerSource').split(/\s*[,/]\s*|\s+/).filter(Boolean).map(slot=>/^powersource$/i.test(slot)?'Power Source':/^shoulder$/i.test(slot)?'Shoulders':slot);
const bareSlot=/^(?:ANY|Charm|Power[ \t]?Source|Feet|Primary|Secondary|Fingers?|Head|Face|Neck|Shoulders?|Arms|Hands|Wrists?|Back|Chest|Waist|Legs|Ears?|Ranged?|Ammo)(?:[ \/]+(?:Primary|Secondary|Fingers?))?$/i;
function hoverItemRegions(words){
    const regions=[];
    for(const classWord of words.filter(word=>word.bbox&&label(word.text)==='class')){
        const font=Math.max(3,classWord.bbox.y1-classWord.bbox.y0),left=Math.max(0,classWord.bbox.x0-font*6),right=classWord.bbox.x0+font*34;
        const boundary=words.filter(word=>word.bbox&&label(word.text)==='class'&&word.bbox.x0>classWord.bbox.x0+font*8&&Math.abs(word.bbox.y0-classWord.bbox.y0)<font*8).reduce((end,word)=>Math.min(end,word.bbox.x0-font*6),right);
        const nearby=words.filter(word=>word.bbox&&word.bbox.x0>=left&&word.bbox.x1<=boundary&&word.bbox.y0>=classWord.bbox.y0-font*5&&word.bbox.y1-word.bbox.y0<=font*2.2),rows=wordRows(nearby);
        if(nearby.some(word=>descriptionLabel(word.text)&&word.bbox.y0<classWord.bbox.y0&&word.bbox.y0>classWord.bbox.y0-font*10))continue;
        const race=nearby.find(word=>label(word.text)==='race'&&Math.abs(word.bbox.x0-classWord.bbox.x0)<font&&word.bbox.y0>classWord.bbox.y0&&word.bbox.y0<classWord.bbox.y0+font*4);
        if(!race)continue;
        const slot=rows.find(row=>row.y>race.bbox.y0&&row.y<race.bbox.y0+font*4&&bareSlot.test(row.words.map(word=>word.text).join(' ')));
        // The Modern hover footer distinguishes an item tooltip from character
        // metadata, chat links and discipline/spell descriptions. A repeated
        // title/Description tab is absent in these actual hover surfaces.
        const footer=rows.find(row=>row.y>race.bbox.y0&&row.y<race.bbox.y0+font*45&&/^Hold\b.*\b(?:RMB|ALT\+LMB)\b.*\b(?:inspect|upgrade)\b.*\bitem\b/i.test(row.words.map(word=>word.text).join(' ')));
        if(!slot||!footer||!nearby.some(word=>/^Weight[:.]?$/i.test(clean(word.text)))||!nearby.some(word=>/^Size[:.]?$/i.test(clean(word.text))))continue;
        const candidates=rows.filter(row=>row.y<classWord.bbox.y0-font*.5&&row.y>classWord.bbox.y0-font*5).map(row=>{const selected=row.words.filter(word=>word.bbox.x0>=classWord.bbox.x0-font*.5);return {row,words:selected,text:selected.map(word=>word.text).join(' ')};});
        const name=candidates.find(candidate=>/[a-z]{3}/i.test(candidate.text)&&! /^(?:Lore(?:[ \t]+(?:Equipped|No)|$)|No (?:Trade|Drop)|Class\b|Race\b|Tier\b)/i.test(candidate.text));
        const step=race.bbox.y0-classWord.bbox.y0,nameTop=name?Math.min(...name.words.map(word=>word.bbox.y0)):classWord.bbox.y0-step*2,
            nameBottom=name?Math.max(...name.words.map(word=>word.bbox.y1)):classWord.bbox.y0-step,
            metadata=candidates.find(candidate=>candidate.row.y>nameTop&&/^(?:Lore(?:[ \t]+(?:Equipped|No)|$)|No (?:Trade|Drop))/i.test(candidate.text)),
            bandTop=Math.max(0,nameTop-font*.4),bandBottom=Math.max(name?nameBottom:bandTop+4,Math.min(nameBottom+font*.4,metadata?metadata.row.y-Math.max(1,font*.1):classWord.bbox.y0-step-font*.1)),
            nameBand={x:Math.max(left,classWord.bbox.x0-font*.4),y:bandTop,width:boundary-classWord.bbox.x0+font*.4,height:Math.max(4,bandBottom-bandTop)};
        // Class/Race ink heights vary with the platform font and sparse OCR.
        // An observed title row must fit completely; when green text was missed,
        // its independently observed Lore/No Trade row bounds the reread below.
        regions.push({x:left,y:Math.max(0,name?.row.y??nameBand.y),right:boundary,bottom:footer.y,font,name:name?nameWithoutChrome(name.text):'',hover:true,classWord,nameBand});
        if(regions.length===4)break;
    }
    return regions;
}
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
function itemRegions(words) {
    const descriptions = words.filter(word => word.bbox && (/^description$/i.test(clean(word.text)) ||
        clean(word.text).length>=8 && descriptionLabel(word.text) && words.some(other=>other.bbox&&Number(other.confidence)>=50&&/^lore$/i.test(clean(other.text))&&
            Math.abs(other.bbox.y0-word.bbox.y0)<Math.max(16,word.bbox.y1-word.bbox.y0)&&other.bbox.x0>word.bbox.x0)));
    if (!descriptions.length){const hover=hoverItemRegions(words);if(hover.length)return hover;const fallback=fallbackItemRegion(words);return fallback?[{...fallback,font:20}]:[];}
    const regions=descriptions.slice(0,4).map(description=>{
        const font=Math.max(3,description.bbox.y1-description.bbox.y0),candidates=words.filter(word=>word.bbox&&label(word.text)==='class'&&word.bbox.y0>description.bbox.y1&&word.bbox.y0<description.bbox.y0+font*12&&Math.abs(word.bbox.x0-description.bbox.x0)<font*16);
        candidates.sort((a,b)=>a.bbox.y0-b.bbox.y0||Math.abs(a.bbox.x0-description.bbox.x0)-Math.abs(b.bbox.x0-description.bbox.x0));
        const classWord=candidates.find(candidate=>words.some(word=>word.bbox&&label(word.text)==='race'&&Math.abs(word.bbox.x0-candidate.bbox.x0)<font*2&&word.bbox.y0>candidate.bbox.y0&&word.bbox.y0<candidate.bbox.y0+font*5));
        const lore=words.find(word=>word.bbox&&label(word.text)==='lore'&&Math.abs(word.bbox.y0-description.bbox.y0)<font&&word.bbox.x0>description.bbox.x0);
        return {x:Math.max(0,(classWord?.bbox.x0??description.bbox.x0)-font*6),y:Math.max(0,description.bbox.y0-font*6),
            right:classWord?classWord.bbox.x0+font*32:lore?lore.bbox.x1+font*6:Infinity,bottom:Infinity,font,description,classWord};
    });
    for(const pane of regions){
        for(const other of regions)if(other!==pane&&other.description.bbox.y0>pane.description.bbox.y0+pane.font*6&&other.x<pane.right&&other.right>pane.x)pane.bottom=Math.min(pane.bottom,other.y);
        // Side-by-side panes must never contribute each other's columns.
        for(const other of regions)if(other!==pane&&Math.abs(other.description.bbox.y0-pane.description.bbox.y0)<pane.font*6&&other.x>pane.x)pane.right=Math.min(pane.right,other.x);
    }
    const combined=[...regions,...hoverItemRegions(words)].slice(0,4);
    for(const pane of combined)for(const other of combined)if(other!==pane){
        if(other.x>pane.x&&Math.abs(other.y-pane.y)<pane.font*8)pane.right=Math.min(pane.right,other.x);
        if(other.y>pane.y+pane.font*8&&other.x<pane.right&&other.right>pane.x)pane.bottom=Math.min(pane.bottom,other.y);
    }
    return combined;
}
function wordsInPane(words,pane){return words.filter(word=>word.bbox&&word.bbox.x0>=pane.x&&word.bbox.x1<=pane.right&&word.bbox.y0>=pane.y&&word.bbox.y0<pane.bottom&&word.bbox.y1-word.bbox.y0<=pane.font*2.2);}
function itemStatBlock(text,name=''){
    const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean),start=lines.findIndex(line=>nameWithoutChrome(line)!==name&&(/^(?:Lore (?:Equipped|No)|No (?:Trade|Drop)|Class\s*:|Race\s*:|Slot\s*:|Tier\s*\d|Size\s*:|AC\b|HP\b)/i.test(line)||Object.keys(statNames).some(label=>new RegExp(`(?:^|[ \\t|])${escaped(label)}[ \\t]*[:=;]?[ \\t]*(?:%[ \\t]*)?[+-]?[\\d,]+`,'i').test(line))));
    if(start<0)return '';
    const content=lines.slice(start),done=content.findIndex(line=>/^Done$/i.test(line)),stop=content.findIndex(line=>/^\[|^(?:You (?:say|tell|have (?:slain|entered)|hit|slash)|Your Location|OOC\b|Auction\b)/i.test(line));
    const end=Math.min(done<0?content.length:done,stop<0?content.length:stop),bounded=content.slice(0,end);
    // Without an observed closing button, stop at the last recognizable item
    // row. Unknown intervening lines remain editable evidence; below-pane chat
    // and world labels never become part of a supposedly complete stat block.
    let last=bounded.length-1;
    if(done<0){last=bounded.findLastIndex(line=>/^(?:No (?:Trade|Drop)|Class\s*:|Race\s*:|Slot\s*:|Tier\b|Size\b|Modified\b|(?:Click|Worn|Focus|Proc|Combat) Effects?\b|(?:\w+ )?Exaltation\s*:|Cast Time\s*:|Cooldown\s*:|Required Level\b|Recommended Level\b)/i.test(line)||Object.keys(statNames).some(name=>new RegExp(`(?:^|[ \\t|])${escaped(name)}[ \\t]*[:=;]?[ \\t]*(?:%[ \\t]*)?[+-]?[\\d,]+`,'i').test(line)));}
    const result=[];let length=0;
    for(const line of bounded.slice(0,last+1).slice(0,60)){const value=line.slice(0,512);if(length+value.length+1>8192)break;result.push(value);length+=value.length+1;}
    return result.join('\n');
}
function nameWithoutChrome(text){let name=clean(text).replace(/^(?:Item(?: Name)?|Name)\s*:\s*/i,'').replace(/\s*\((?:Augmented|Modified)[^)]*\).*$/i,'');const tier=name.match(/^(.+?\+\d+)\b/);return tier?tier[1]:name;}
function paneName(words,pane){
    if(pane.name)return {name:pane.name,title:''};
    const rows=wordRows(wordsInPane(words,pane)),description=pane.description;
    if(!description)return {name:itemName(rows.map(row=>row.words.map(word=>word.text).join(' '))),title:''};
    const titles=rows.filter(row=>row.y<description.bbox.y0-pane.font*.3&&row.y>description.bbox.y0-pane.font*6).map(row=>row.words.map(word=>word.text).join(' '));
    const title=titles.reverse().find(value=>/[a-z]{3}/i.test(value)&&!descriptionLabel(value))||'';
    const bodyRows=rows.filter(row=>row.y>description.bbox.y1+pane.font*.3&&row.y<(pane.classWord?.bbox.y0??description.bbox.y1+pane.font*6));
    for(const row of bodyRows){const value=row.words.filter(word=>!pane.classWord||word.bbox.x0>=pane.classWord.bbox.x0-pane.font).map(word=>word.text).join(' ');
        if(/[a-z]{3}/i.test(value)&&! /^(?:Lore|No Trade|No Trace|No Drop|Class|Race|Tier|Description)\b/i.test(value))return {name:nameWithoutChrome(value),title};}
    return {name:title?nameWithoutChrome(title):'',title};
}
function modernCharacterComponents(text,confidence){
    const entries=[],integer='([+-]?[\\d,]+)',valid=value=>value!==undefined&&!/^[-+]?0\d/.test(value)&&Number.isSafeInteger(number(value));
    // Default Modern XML: AC = Mitigation / Mitigation Softcap | Evasion;
    // Attack = Offense | Accuracy. OCR may read a vertical divider as a slash.
    // These are independent components, never resource maxima or melee/ranged.
    const ac=text.match(new RegExp(`^AC[ \\t]*[:=;]?[ \\t]*${integer}(?:[ \\t]*/[ \\t]*${integer})?(?:[ \\t]*[|/][ \\t]*${integer})?(?=$|[ \\t])`,'im'));
    if(ac&&/[\/|]/.test(ac[0]))for(const [index,key]of [[1,'acMitigation'],[2,'acMitigationSoftcap'],[3,'acEvasion']])if(valid(ac[index]))entries.push(field(key,ac[0],number(ac[index]),confidence));
    const attack=text.match(new RegExp(`^(?:Attack|ATK)[ \\t]*[:=;]?[ \\t]*${integer}(?:[ \\t]*[|/][ \\t]*${integer})?(?=$|[ \\t])`,'im'));
    if(attack&&/[\/|]/.test(attack[0]))for(const [index,key]of [[1,'attackOffense'],[2,'attackAccuracy']])if(valid(attack[index]))entries.push(field(key,attack[0],number(attack[index]),confidence));
    return entries;
}
function stats(text, confidence, { character = false, modern = false } = {}) {
    text=text.replace(/\bSV\.(?=[a-z])/gi,'SV. ').replace(/\b(Base|Backstab)Dmg\b/gi,'$1 Dmg');
    // OCR can separate a visible decimal mark into its own word, or read it
    // as a comma. Weight is a decimal quantity, never a thousands grouping.
    text=text.replace(/\b(Weight|WT)([ \t]*[:=;]?[ \t]*)(\d+)[ \t]*[.,][ \t]*(\d+)/gi,'$1$2$3.$4');
    const fields = character&&modern?modernCharacterComponents(text,confidence):[];
    // Long labels first avoid parsing an item's HP Regen as HP.
    for (const [label,key] of Object.entries(statNames).sort((a,b)=>b[0].length-a[0].length)) {
        const percent=key==='attackSpeed'||key==='haste';
        const regex = new RegExp(`(?:^|[ \\t|])${escaped(label)}[ \\t]*[:=;]?[ \\t]*${percent?'(?:%[ \\t]*)?':''}([+-]?[\\d,]+(?:\\.\\d+)?)[ \\t]*(?:\\/[ \\t]*([\\d,]+))?(?=$|[ \\t%|+])`,'im');
        const match = text.match(regex);
        if (!match || (label==='HP' && /HP\s+Regen/i.test(match[0])) || /^[-+]?0\d/.test(match[1]) || !percent&&text.slice(match.index+match[0].length).startsWith('%')) continue;
        if(key==='damage'&&/^DMG$/i.test(label)&&/\bBackstab[ \t]*$/i.test(text.slice(0,match.index)))continue;
        if(key==='haste'&&/^(?:(?:Click|Worn|Focus|Proc|Combat)\s+)?Effect\s*:/i.test(text.slice(0,match.index).split('\n').at(-1).trim()))continue;
        // Modern attributes/resources are displayed as explicit pairs. A lone
        // "1510" may be a lost slash/current value, not a four-digit attribute.
        if(character&&modern&&(modernPairedStats.has(key)&&match[2]===undefined||['attack','ac'].includes(key)))continue;
        if (character && ['hp','mana','endurance'].includes(key) && match[2] !== undefined) {
            fields.push(field(`${key}Current`,match[0],number(match[1]),confidence));
            fields.push(field(`${key}Maximum`,match[0],number(match[2]),confidence));
        } else fields.push(field(key,match[0],number(match[1]),confidence));
    }
    const seen = new Set(); return fields.filter(entry => { if (seen.has(entry.key) || !Number.isFinite(entry.value)) return false; seen.add(entry.key); return true; });
}
// An explicit editor/reparse entry point. This reads observed written numbers
// only, never a catalog, item tier multiplier, effect rank or guessed digit.
export function parseItemStatBlock(text){
    const rawText=typeof text==='string'?text:'',lines=rawText.split(/\r?\n/),warnings=[];
    if(typeof text!=='string'||rawText.length>8192||lines.length>60)return {fields:[],conflicts:[],warnings:['Item stat text must contain at most 8,192 characters and 60 lines.']};
    const values=new Map(),boundary=new RegExp(`\\b(?:${Object.keys(statNames).sort((a,b)=>b.length-a.length).map(escaped).join('|')})[ \\t]*[:=;]?[ \\t]*(?:%[ \\t]*)?(?=[+-]?[\\d,]+)`,'gi');
    for(const line of lines){
        if(/^(?:Click|Worn|Focus|Proc|Combat) Effects?\s*:?|^(?:\w+ )?Exaltation\s*:|^Item(?: Name)?\s*:|^(?:Augment(?:ation)?(?: Slot)?|Socket)\s*#?\s*\d+\s*:/i.test(clean(line)))continue;
        const starts=[...line.matchAll(boundary)].map(match=>match.index),parts=starts.length?starts.map((start,index)=>line.slice(start,starts[index+1])):[line];
        for(const part of parts)for(const entry of stats(part,0)){
            const previous=values.get(entry.key)||[];previous.push(entry);values.set(entry.key,previous);
        }
    }
    const fields=[],conflicts=[];
    for(const [key,entries]of values){if(new Set(entries.map(entry=>entry.value)).size>1)conflicts.push(key);else fields.push(entries[0]);}
    if(conflicts.length)warnings.push(`Conflicting written values remain unknown: ${conflicts.join(', ')}.`);
    return {fields,conflicts,warnings};
}
/** Explicit socket text only. Exaltations are intrinsic effects, never items.
 * Numbered game labels are converted once to zero-based model indices. */
export function parseItemAugmentSlots(text){
    const lines=String(text??'').slice(0,8192).split(/\r?\n/).slice(0,60).map(clean),emptyCounts=[],totalCounts=[],occupied=new Map(),conflicts=new Set();
    for(const line of lines){
        const empty=line.match(/^(\d+)\s+empty\s+(?:augment(?:ation)?\s+)?slots?\s*[.!]?$/i),total=line.match(/^(?:Augment(?:ation)?|Socket)\s+slots?\s*:\s*(\d+)\s*$/i);
        if(empty)emptyCounts.push(Number(empty[1]));if(total)totalCounts.push(Number(total[1]));
        const slot=line.match(/^(?:Augment(?:ation)?(?: Slot)?|Socket)\s*#?\s*([1-8])\s*:\s*(.+)$/i);
        if(!slot||/^empty$/i.test(slot[2]))continue;
        const index=Number(slot[1])-1,name=slot[2].trim().slice(0,240);
        if(occupied.has(index)&&occupied.get(index)!==name){conflicts.add(index);continue;}occupied.set(index,name);
    }
    const count=values=>values.length&&new Set(values).size===1&&Number.isInteger(values[0])&&values[0]>=0&&values[0]<=8?values[0]:null;
    const emptyAugmentSlots=count(emptyCounts),explicitTotal=count(totalCounts),augments=[...occupied].filter(([index])=>!conflicts.has(index)).sort(([a],[b])=>a-b).map(([index,name])=>({index,name}));
    let augmentSlotCount=explicitTotal??(emptyAugmentSlots===null?null:emptyAugmentSlots+augments.length);
    if(augmentSlotCount!==null&&(augmentSlotCount>8||augments.some(entry=>entry.index>=augmentSlotCount)||explicitTotal!==null&&emptyAugmentSlots!==null&&explicitTotal!==emptyAugmentSlots+augments.length)||conflicts.size||emptyCounts.length&&emptyAugmentSlots===null||totalCounts.length&&explicitTotal===null)augmentSlotCount=null;
    return {augmentSlotCount,emptyAugmentSlots,augments};
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
export function screenReadRefinementRegions(input={}) {
    const words=Array.isArray(input.words)?input.words.slice(0,2000):[],panes=itemRegions(words),regions=[],tables=[];
    const characterOnly=input.characterOnly===true||input.owner==='character';
    if(characterOnly){const region=characterRefinement(words,panes);return region?[region]:[];}
    for(const pane of panes){const rows=wordRows(wordsInPane(words,pane)),identity=paneName(words,pane),nameRow=rows.find(row=>nameWithoutChrome(row.words.map(word=>word.text).join(' '))===identity.name&&row.y>(pane.description?.bbox.y1??-Infinity));
        if(pane.hover&&pane.nameBand){regions.push({role:'item-name',...pane.nameBand,preprocessing:'color',layout:'line'});}
        else if(panes.length===1&&nameRow){const bounds=nameRow.words.map(word=>word.bbox),height=Math.max(...bounds.map(box=>box.y1))-Math.min(...bounds.map(box=>box.y0));
            regions.push({role:'item-name',x:Math.min(...bounds.map(box=>box.x0))-height*.3,y:Math.min(...bounds.map(box=>box.y0))-height*.3,
                width:Math.max(...bounds.map(box=>box.x1))-Math.min(...bounds.map(box=>box.x0))+height*.6,height:height*1.6,preprocessing:'green',layout:'line'});}
        const first=rows.find(row=>row.words.some(word=>/^(?:AC|HP|Weight|Size)[:.]?$/i.test(clean(word.text)))),last=rows.find(row=>row.y>(first?.y??Infinity)&&row.words.some(word=>/^Modified$/i.test(clean(word.text))));
        if(first){const selected=rows.filter(row=>row.y>=first.y&&row.y<(last?.y??first.y+pane.font*22)).flatMap(row=>row.words),bounds=selected.map(word=>word.bbox);
            const attribute=selected.find(word=>/^(?:Strength|Stamina|Intelligence|Wisdom|Agility|Dexterity|Charisma):?$/i.test(clean(word.text)));
            const start=attribute&&!pane.hover?attribute.bbox.y0:first.y;
            if(bounds.length)tables.push({x:Math.min(...bounds.map(box=>box.x0))-pane.font*.5,y:start-pane.font*.4,width:Math.max(...bounds.map(box=>box.x1))-Math.min(...bounds.map(box=>box.x0))+pane.font,height:Math.max(...bounds.map(box=>box.y1))-start+pane.font*.8,preprocessing:attribute&&!pane.hover?'source-threshold':'inverted'});}
    }
    if(tables.length)regions.push({role:'item-stats',...(tables.length===1?tables[0]:{tiles:tables,preprocessing:'source-threshold'}),layout:'block',scale:4});
    const character=characterRegion(words,panes);
    // A compact tooltip's green title can be absent from sparse scene OCR.
    // Keep its anchored identity reread when Inventory is also visible; replacing
    // it with another character pass makes an otherwise valid item disappear.
    // An Inventory-only baseline still receives its ordinary refinement.
    const hoverIdentity=panes.some(pane=>pane.hover)&&regions.some(region=>region.role==='item-name');
    if(character&&(!hoverIdentity||regions.length<2)){if(regions.length===2)regions.shift();regions.push(characterRefinement(words,panes,character));}
    return regions.slice(0,2);
}
function characterRefinement(words,panes,character=characterRegion(words,panes)){
    if(!character)return null;
    const base={x:character.x,y:character.y,width:character.right-character.x,height:character.bottom-character.y},available=words.filter(word=>!panes.some(pane=>wordsInPane([word],pane).length)),components=modernComponentRegions(available,character);
    return {role:'character-stats',...(components.length?{tiles:[base,...components]}:base),preprocessing:'inverted',layout:components.length?'sparse':'block',scale:3};
}
function characterRegion(words,panes){
    const available=words.filter(word=>word.bbox&&!panes.some(pane=>word.bbox.x0>=pane.x&&word.bbox.x1<=pane.right&&word.bbox.y0>=pane.y&&word.bbox.y0<pane.bottom));
    const inventory=available.find(word=>/^Inventory$/i.test(clean(word.text))),vitals=available.find(word=>/^Character$/i.test(clean(word.text))&&available.some(other=>/^Vitals$/i.test(clean(other.text))&&other.bbox.x0>word.bbox.x0&&Math.abs(other.bbox.y0-word.bbox.y0)<20));
    if(!inventory||!vitals){
        const heading=wordRows(available).find(row=>/^Character Stats$/i.test(row.words.map(word=>word.text).join(' ')));
        if(!heading||!inventory)return null;
        const font=Math.max(3,heading.height),left=heading.words[0].bbox.x0;
        if(inventory.bbox.y0<=heading.y||inventory.bbox.y0>heading.y+font*5||Math.abs(inventory.bbox.x0-left)>font*2)return null;
        return {x:Math.max(0,left-font*.5),y:Math.max(0,heading.y-font*.5),right:left+font*24,bottom:heading.y+font*30,font,modern:false};
    }
    const font=Math.max(3,vitals.bbox.y1-vitals.bbox.y0),heading=available.find(word=>/^Stats$/i.test(clean(word.text))&&word.bbox.x0>vitals.bbox.x0&&Math.abs(word.bbox.y0-vitals.bbox.y0)<font);
    if(!heading)return null;
    const x=Math.max(0,vitals.bbox.x0-font*.5),y=Math.max(0,vitals.bbox.y0-font*.5),
        // Both observed headings locate the two equal-width Modern columns.
        // This avoids extending the crop into the adjacent bag/Weight pane.
        right=Math.min(heading.bbox.x0+font*24,heading.bbox.x0+(heading.bbox.x0-vitals.bbox.x0)+font*1.5),
        rows=wordRows(available.filter(word=>word.bbox.x0>=x&&word.bbox.x1<=right&&word.bbox.y0>=y&&word.bbox.y0<=vitals.bbox.y0+font*48));
    let bottom=vitals.bbox.y0+font*25;
    for(const row of rows){
        const text=row.words.map(word=>clean(word.text)).join(' '),left=row.words[0]?.bbox.x0;
        // Lower sections are anchored by their visible headings/known numeric
        // rows. Missing or unread values remain absent; geometry adds no stats.
        if(Math.abs(left-vitals.bbox.x0)<=font*2&&/^Additional\s+Information$/i.test(text))bottom=Math.max(bottom,row.y+row.height+font*5);
        else if(/^Additional\s+Modifiers$/i.test(text)||/^(?:Accuracy|Avoidance|Combat Effects|Strike ?Through|Stun Resist|Damage Shield(?:ing| Mitiga(?:tion)?)?|DoT Shielding|Melee Shielding|Spell Shielding)\b/i.test(text))bottom=Math.max(bottom,row.y+row.height+font*.6);
    }
    return {x,y,right,bottom:Math.min(bottom,vitals.bbox.y0+font*48),font};
}
function modernComponentRegions(words,character){
    const rows=wordRows(words.filter(word=>word.bbox&&word.bbox.x0>=character.x&&word.bbox.x1<=character.right&&word.bbox.y0>=character.y&&word.bbox.y1<=character.bottom&&word.bbox.y1-word.bbox.y0<=character.font*1.8));
    const ac=rows.find(row=>/^AC\b/i.test(row.words.map(word=>word.text).join(' '))),fraction=ac?.words.find(word=>/^\d+\/\d+$/.test(clean(word.text)));
    const divider=ac?.words.find(word=>/^[|\[\]Il](?:\d|$)/.test(clean(word.text)))||ac?.words.find(word=>fraction&&word.bbox.x0>fraction.bbox.x1&&/^1\d+$/.test(clean(word.text))&&Number(word.confidence)<50);
    const attack=rows.find(row=>distance(label(row.words[0]?.text),'attack')<=1&&!row.words.some(word=>/^Speed$/i.test(clean(word.text))));
    if(!divider||!attack)return [];
    const after=attack.words.slice(1),nextLabel=after.findIndex(word=>/[a-z]/i.test(clean(word.text)));
    const numeric=after.slice(0,nextLabel<0?after.length:nextLabel).filter(word=>/^[\d,\/|]+$/.test(clean(word.text))),font=Math.max(3,attack.words[0].bbox.y1-attack.words[0].bbox.y0),cut=divider.bbox.x0;
    if(!numeric.length||numeric.some(word=>/[\/|]/.test(clean(word.text)))||cut-numeric[0].bbox.x0<font*1.2||Math.max(...numeric.map(word=>word.bbox.x1))-cut<font*1.2)return [];
    const y=Math.min(...numeric.map(word=>word.bbox.y0))-font*.3,height=Math.max(...numeric.map(word=>word.bbox.y1))-y+font*.3,left=numeric[0].bbox.x0-font*.3,right=Math.max(...numeric.map(word=>word.bbox.x1))+font*.3;
    // The same observed AC/Attack divider column is fixed by Default Modern's
    // XML. Crop pixels on either side; never split the digits in OCR text.
    return [{component:'attackOffense',x:left,y,width:cut-font*.15-left,height},
        {component:'attackAccuracy',x:cut+font*.35,y,width:right-cut-font*.35,height},
        ...(/^1\d+$/.test(clean(divider.text))?[{component:'acEvasion',x:cut+font*.35,y:divider.bbox.y0-font*.3,width:divider.bbox.x1-cut,height:divider.bbox.y1-divider.bbox.y0+font*.6}]:[])].filter(tile=>tile.width>=4&&tile.height>=4);
}
function refinedCharacterComponents(words,confidence){
    const fields=[];
    for(const key of ['attackOffense','attackAccuracy','acEvasion']){const selected=words.filter(word=>word.component===key&&clean(word.text));
        if(selected.length!==1||!/^\d[\d,]*$/.test(clean(selected[0].text))||/^0\d/.test(clean(selected[0].text))||Number(selected[0].confidence)<85)continue;
        fields.push(field(key,`Observed ${key} column OCR: ${selected[0].text}`,number(selected[0].text),Math.min(confidence,Number(selected[0].confidence))));}
    return fields;
}
function refinedWords(input,baseWords){
    const words=baseWords.map(word=>({...word})),hoverNames=hoverItemRegions(baseWords).map(pane=>pane.nameBand);
    for(const pass of (Array.isArray(input.refinements)?input.refinements:[]).slice(0,2)){
        if(pass.role!=='item-name')continue;
        for(const candidate of (Array.isArray(pass.words)?pass.words:[]).slice(0,200)){
            if(!candidate.bbox)continue;
            const box=candidate.bbox,height=Math.max(1,box.y1-box.y0),center=(box.x0+box.x1)/2;
            const matches=words.map((word,index)=>({word,index})).filter(({word})=>word.bbox&&Math.abs(word.bbox.y0-box.y0)<Math.max(3,height*.55)&&center>=word.bbox.x0-height*.3&&center<=word.bbox.x1+height*.3);
            matches.sort((a,b)=>Math.abs((a.word.bbox.x0+a.word.bbox.x1)/2-center)-Math.abs((b.word.bbox.x0+b.word.bbox.x1)/2-center));
            const match=matches[0]?.index??-1;
            if(match>=0&&Number(candidate.confidence)>=50&&Number(candidate.confidence)>=Number(words[match].confidence)+10)words[match]=candidate;
            // Keep a whole observed name row, including uncertain words; losing
            // its low-confidence prefix would falsely turn it into another
            // item. Such proposals retain that word's conservative confidence.
            else if(match<0&&words.length<2000&&Number(pass.confidence)>=50&&/[a-z0-9]/i.test(candidate.text)&&hoverNames.some(region=>box.x0>=region.x&&box.x1<=region.x+region.width&&box.y0>=region.y&&box.y1<=region.y+region.height))words.push(candidate);
        }
    }
    return words;
}
function alignedTableWords(base,read){
    // Retain independently recognized labels when thresholding damaged their
    // glyphs; values remain the actual refinement OCR on the observed row.
    return read.map(word=>{if(!word?.bbox||/\d/.test(word.text))return word;const box=word.bbox,height=Math.max(1,box.y1-box.y0),known=base.find(original=>original.bbox&&/^[a-z.]+:?$/i.test(original.text)&&
        (Object.keys(statNames).some(name=>name.toLowerCase().split(' ').includes(label(original.text)))||/^(?:size|weight)$/i.test(label(original.text)))&&
        distance(label(original.text),label(word.text))<=2&&Math.abs(original.bbox.y0-box.y0)<height*.55&&Math.abs(original.bbox.x0-box.x0)<height);
        return known?{...word,text:known.text}:word;});
}
function tableStats(text,words,confidence,options={}){
    const entries=stats(text,confidence,options);
    if(!words.length)return entries;
    const rows=wordRows(words);
    // Single glyphs in the Modern stat font are easy to confuse. Low-confidence
    // digits remain in raw evidence instead of silently becoming a known stat.
    return entries.filter(entry=>!rows.some(row=>row.words.some(word=>/^[+-]?\d(?:\.\d+)?$/.test(clean(word.text))&&Number(word.confidence)<85&&number(word.text)===entry.value)&&stats(row.words.map(value=>value.text).join(' '),confidence,options).some(value=>value.key===entry.key)));
}
function numericDisagreements(base,read,options={}){
    const conflicts=new Set(),numeric=value=>{const text=clean(value);return /^[+-]?[\d,]+(?:\.\d+)?(?:[\/|][+-]?[\d,]+(?:\.\d+)?)*(?:%|\+)?$/.test(text)?text.replace(/[%+]$/,'').split(/[\/|]/):null;};
    // Compare the same observed numeric box even when the second pass cannot
    // read its label ("HP Regen 1" versus "HP R ... 11"). Do not reconstruct a
    // label or pick the larger/confident value: both remain evidence, unknown.
    for(const row of wordRows(base)){const text=row.words.map(word=>word.text).join(' ');
        for(const entry of stats(text,0,options)){const start=text.indexOf(entry.raw);if(start<0)continue;let offset=0,numericOffset=0;
            const wanted=entry.key.endsWith('Maximum')||['acMitigationSoftcap','attackAccuracy'].includes(entry.key)?1:entry.key==='acEvasion'?(/\/[ \t]*[\d,]+[ \t]*[|/]/.test(entry.raw)?2:1):0;
            for(const word of row.words){const at=offset;offset+=String(word.text).length+1;const parts=numeric(word.text);
                if(!parts||at<start||at>=start+entry.raw.length)continue;
                const component=wanted-numericOffset;numericOffset+=parts.length;
                if(parts[component]===undefined||number(parts[component])!==entry.value)continue;
                const box=word.bbox,height=Math.max(1,box.y1-box.y0),center=(box.x0+box.x1)/2;
                const candidate=read.find(other=>other?.bbox&&Number(other.confidence)>=50&&numeric(other.text)&&
                    Math.abs(other.bbox.y0-box.y0)<Math.max(3,height*.55)&&center>=other.bbox.x0-height*.4&&center<=other.bbox.x1+height*.4);
                const observed=candidate&&numeric(candidate.text);if(observed?.[component]!==undefined&&number(observed[component])!==entry.value)conflicts.add(entry.key);
            }
        }
    }
    return conflicts;
}
export function parseScreenRead(input = {}) {
    const characterOnly=input.characterOnly===true||input.owner==='character',raw = clean(input.text).slice(0,16384),baseWords=Array.isArray(input.words)?input.words.slice(0,2000):[],words = characterOnly?baseWords:refinedWords(input,baseWords);
    const confidence = Math.max(0,Math.min(100,Number(input.confidence) || 0));
    if (!raw) return [];
    const metadata = { kind:input.kind === 'manual' ? 'manual':'ocr', owner:input.owner || 'contribution', sessionId:input.sessionId || '',
        capturedAt:input.capturedAt || new Date().toISOString(), input:input.input || {} };
    const panes=itemRegions(words),observations=[],initialPanes=itemRegions(baseWords);
    // Word geometry is always used when available, including an Inventory pane
    // to the right of any number of item panes. Sparse OCR text order is not row
    // order and must never join a label with a different item's numeric value.
    for(const [paneIndex,region] of (characterOnly?[]:panes.length?panes:[null]).entries()){
    const itemText=region?wordLines(wordsInPane(words,region)):raw,identity=region?paneName(words,region):{name:itemName(raw.split(/\r?\n/).map(clean)),title:''};
    const lines=itemText.split(/\r?\n/).map(clean).filter(Boolean),name=identity.name.slice(0,240);
    if (name && name.length > 2) {
        const rawStatBlock=itemStatBlock(itemText,name);
        const parsedStats=parseItemStatBlock(rawStatBlock);
        const nameConfidence=region?.hover?Math.min(confidence,...wordsInPane(words,region).filter(word=>word.bbox.y0>=region.nameBand.y&&word.bbox.y1<=region.nameBand.y+region.nameBand.height).map(word=>Number(word.confidence)||0)):confidence;
        const fields = [field('name',name,name,nameConfidence), ...parsedStats.fields.map(entry=>({...entry,confidence}))];
        // Region OCR sees a compact two-column examine stat table more clearly
        // than a whole scene. Punctuation after a label is OCR evidence, not a
        // decimal repair in the value; missing numeric punctuation stays absent.
        const relevantPasses=(Array.isArray(input.refinements)?input.refinements:[]).slice(0,2).filter(pass=>['item-name','item-stats'].includes(pass.role)).map(pass=>{
            const selected=region?(pass.words||[]).filter(word=>wordsInPane([word],region).length):[];
            const aligned=alignedTableWords(region?wordsInPane(baseWords,region):baseWords,selected);
            return {...pass,words:aligned,rawText:wordLines(selected)||String(pass.text||''),text:aligned.length?wordLines(aligned):panes.length<=1&&!pass.tiles?.length?String(pass.text||''):''};
        }).filter(pass=>pass.text);
        const statPasses=relevantPasses.filter(pass=>pass.role==='item-stats'),conflicts=new Set(parsedStats.conflicts);
        // Keep baseline and independently read refinements as written evidence,
        // not outgoing wiki stats. A later explicit reparse can surface conflicts.
        const rawBlocks=[rawStatBlock,...statPasses.map(pass=>clean(pass.rawText))].filter(Boolean),retainedText=rawBlocks.join('\n\nAdditional observed stat OCR:\n').split('\n').slice(0,60).join('\n').slice(0,8192);
        if(retainedText)fields.push(field('rawStatBlock',retainedText,retainedText,confidence));
        for(const pass of statPasses)for(const key of numericDisagreements(region?wordsInPane(baseWords,region):baseWords,pass.words||[])){conflicts.add(key);const index=fields.findIndex(entry=>entry.key===key);if(index>=0)fields.splice(index,1);}
        for(const pass of statPasses)for(const entry of tableStats(pass.text.replace(/\b(AC|HP|Weight)\.(?=[ \t])/g,'$1'),pass.words||[],Math.min(confidence,Number(pass.confidence)||0))){
            const existing=fields.findIndex(value=>value.key===entry.key);if(existing<0&&!conflicts.has(entry.key))fields.push(entry);else if(existing>=0&&fields[existing].value!==entry.value){conflicts.add(entry.key);fields.splice(existing,1);}
        }
        const tier = itemText.match(/\bTier[ \t]*[:=]?[ \t]*(\d+)(?:[ \t]+(\d+)[ \t]*\/[ \t]*(\d+)|[ \t]*\/[ \t]*(\d+))?/i) || name.match(/\+(\d+)\s*$/);
        if (tier && Number(tier[1])<=100) fields.push(field('tier',tier[0],Number(tier[1]),confidence));
        if(tier?.[2]!==undefined&&Number(tier[3])===2**Number(tier[1])&&Number(tier[2])>=0&&Number(tier[2])<Number(tier[3]))fields.push(field('fraction',tier[0],Number(tier[2]),confidence),field('fractionMaximum',tier[0],Number(tier[3]),confidence));
        // Every item OCR surface can lose a decimal, including full examine
        // windows. Keep an unpunctuated weight in the evidence for correction;
        // never promote an ambiguous "32" to the submitted item stat block.
        if(metadata.kind==='ocr'){const weight=fields.findIndex(entry=>entry.key==='weight');if(weight>=0&&!/[.,][ \t]*\d/.test(fields[weight].raw)){conflicts.add('weight');fields.splice(weight,1);}}
        for (const [label,key] of [['Class','classes'],['Race','races'],['Slot','slots'],['Size','size']]) {
            const found = (key==='size'?[itemText,...statPasses.map(pass=>pass.text)].join('\n'):itemText).match(new RegExp(`^${label}[ \\t]*${key==='size'?'[:=]?[ \\t]+':':[ \\t]*'}(.+)$`,'im'));
            if (found) fields.push(field(key,found[0],key==='size' ? found[1].trim().split(/\s+/)[0] : key==='slots'?slotNames(found[1]):found[1].split(/\s*[,/]\s*|\s+/).filter(Boolean),confidence));
        }
        if(!fields.some(entry=>entry.key==='slots')){const slot=lines.find(line=>bareSlot.test(line));if(slot)fields.push(field('slots',slot,slotNames(slot),confidence));}
        const sockets=parseItemAugmentSlots(itemText);
        if(sockets.augmentSlotCount!==null)fields.push(field('augmentSlotCount',itemText,sockets.augmentSlotCount,confidence));
        if(sockets.emptyAugmentSlots!==null)fields.push(field('emptyAugmentSlots',itemText,sockets.emptyAugmentSlots,confidence));
        if(sockets.augments.length)fields.push(field('augments',itemText,sockets.augments,confidence));
        const effects = lines.filter(line=>/^(?:(?:Click|Worn|Focus|Proc|Combat)\s+)?Effect\s*:/i.test(line)||/^(?:\w+ )?Exaltation\s*:/i.test(line)&&distance(line.replace(/^[^:]+:\s*/,'').toLowerCase(),'empty')>1).slice(0,12);
        if (effects.length) fields.push(field('effects',effects.join('; '),effects,confidence));
        // Modern always renders an unchecked "Modified" checkbox label. Only
        // an explicit title/state is evidence; the label by itself is unknown.
        if(/\((?:Augmented|Modified)\)/i.test(identity.title)||/^Modified\s*:\s*(?:yes|true|checked)$/im.test(itemText))fields.push(field('modified',identity.title||'Modified: yes',true,confidence));
        if (/\bNo Trade\b|\bNo Drop\b/i.test(itemText)) fields.push(field('noTrade','No Trade',true,confidence));
        const initialPane=initialPanes[paneIndex],initialName=initialPane?paneName(baseWords,initialPane).name:itemName(raw.split(/\r?\n/).map(clean));
        observations.push({ ...metadata, parser:{name:'item-examine',version:SCREEN_READ_PARSER_VERSION},
            subject:{kind:'item',name}, fields, evidence:{text:[...(retainedText?[`Observed item stat block:\n${retainedText}`]:[]),...fields.filter(entry=>entry.key!=='rawStatBlock').map(entry=>entry.raw),...(initialName&&initialName!==name?[`Initial item name OCR: ${initialName}`]:[]),...relevantPasses.map(pass=>`${pass.role} region OCR:\n${clean(pass.rawText).slice(0,3000)}`),...(conflicts.size?[`Conflicting OCR values left unknown: ${[...conflicts].join(', ')}`]:[])].join('\n').slice(0,16384),imageId:null} });
    }
    }
    // A visible inventory/stat heading is required; item-only panes cannot become
    // an authoritative character total. Geometry excludes the examine region.
    const character=characterRegion(words,panes),withinCharacter=word=>Boolean(word.bbox&&word.bbox.x0>=character.x&&word.bbox.x1<=character.right&&word.bbox.y0>=character.y&&word.bbox.y1<=character.bottom&&word.bbox.y1-word.bbox.y0<=character.font*1.8&&!panes.some(pane=>wordsInPane([word],pane).length)),characterWords=character?words.filter(withinCharacter):[],characterText=character?wordLines(characterWords):words.length?wordLines(words.filter(word=>!panes.some(pane=>wordsInPane([word],pane).length))):raw;
    const textModern=!words.length&&/\bCharacter[ \t]+Vitals\b/i.test(characterText)&&/\bStats[ \t]+and[ \t]+Resists\b/i.test(characterText),textCharacter=!words.length&&(characterOnly?textModern||/^Character Stats\b/im.test(characterText):/\bInventory\b|^Character Stats\b/im.test(characterText));
    if (character||textCharacter) {
        const modern=!!character&&character.modern!==false||characterOnly&&textModern,fields = stats(characterText,confidence,{character:true,modern}),conflicts=new Set(),evidence=[characterText];
        for(const pass of (Array.isArray(input.refinements)?input.refinements:[]).slice(0,2).filter(pass=>pass.role==='character-stats')){const selected=(pass.words||[]).filter(word=>!character||withinCharacter(word)),ordinary=selected.filter(word=>!word.component),mapped=alignedTableWords(characterWords,ordinary),text=wordLines(mapped)||(!character?String(pass.text||''):'');evidence.push(wordLines(selected)||(!character?String(pass.text||''):''));
            for(const key of numericDisagreements(characterWords,ordinary,{character:true,modern})){conflicts.add(key);const index=fields.findIndex(entry=>entry.key===key);if(index>=0)fields.splice(index,1);}
            for(const entry of [...stats(text,Math.min(confidence,Number(pass.confidence)||0),{character:true,modern}),...refinedCharacterComponents(selected,confidence)]){
                if(entry.key.startsWith('resist')&&(pass.words||[]).some(word=>String(word.text).includes(`${entry.value}/`)&&Number(word.confidence)<95))continue;
                const existing=fields.findIndex(value=>value.key===entry.key);if(existing<0&&!conflicts.has(entry.key))fields.push(entry);else if(existing>=0&&fields[existing].value!==entry.value){conflicts.add(entry.key);fields.splice(existing,1);}}
        }
        if (fields.filter(entry=>['hpCurrent','hpMaximum','manaCurrent','manaMaximum','ac','acMitigation','acMitigationSoftcap','acEvasion','attackOffense','attackAccuracy','str','sta','agi','dex','wis','int','cha'].includes(entry.key)).length>=3) {
            observations.push({ ...metadata, parser:{name:'character-stats',version:SCREEN_READ_PARSER_VERSION},
                subject:{kind:'character',name:clean(input.character).slice(0,80)},fields,
                evidence:{text:[...fields.map(entry=>entry.raw),...evidence,...(conflicts.size?[`Conflicting OCR values left unknown: ${[...conflicts].join(', ')}`]:[])].join('\n').slice(0,16384),imageId:null} });
        }
    }
    return observations;
}
