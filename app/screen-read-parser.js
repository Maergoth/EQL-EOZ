// OCR proposals only: never scale an item, infer drop sources or publish a fact.
export const SCREEN_READ_PARSER_VERSION = 4;
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim();
const number = value => Number(String(value).replace(/,/g,''));
const statNames = {
    AC:'ac', HP:'hp', Mana:'mana', Endurance:'endurance', End:'endurance', Strength:'str', STR:'str',
    Stamina:'sta', STA:'sta', Agility:'agi', AGI:'agi', Dexterity:'dex', DEX:'dex', Wisdom:'wis', WIS:'wis',
    Intelligence:'int', INT:'int', Charisma:'cha', CHA:'cha', Weight:'weight', Damage:'damage', DMG:'damage', Delay:'delay',
    'SV Poison':'resistPoison', 'SV Magic':'resistMagic', 'SV Disease':'resistDisease', 'SV Fire':'resistFire',
    'SV Cold':'resistCold', 'SV Corruption':'resistCorruption', 'SV Void':'resistCorruption',
    'HP Regen':'hpRegen', 'Mana Regen':'manaRegen', 'End Regen':'enduranceRegen', 'Attack Speed':'attackSpeed',
    'Required Level':'requiredLevel', 'Recommended Level':'recommendedLevel', 'Base Dmg':'damage','Dmg Bon':'damageBonus',Attack:'attack',
    'SV. Poison':'resistPoison','SV. Magic':'resistMagic','SV. Disease':'resistDisease','SV. Fire':'resistFire','SV. Cold':'resistCold','SV. Void':'resistCorruption'
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
    if (!descriptions.length){const fallback=fallbackItemRegion(words);return fallback?[{...fallback,font:20}]:[];}
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
    return regions;
}
function wordsInPane(words,pane){return words.filter(word=>word.bbox&&word.bbox.x0>=pane.x&&word.bbox.x1<=pane.right&&word.bbox.y0>=pane.y&&word.bbox.y0<pane.bottom&&word.bbox.y1-word.bbox.y0<=pane.font*2.2);}
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
function stats(text, confidence, { character = false, modern = false } = {}) {
    text=text.replace(/\bSV\.(?=[a-z])/gi,'SV. ');
    const fields = [];
    // Long labels first avoid parsing an item's HP Regen as HP.
    for (const [label,key] of Object.entries(statNames).sort((a,b)=>b[0].length-a[0].length)) {
        const regex = new RegExp(`(?:^|[ \\t|])${escaped(label)}[ \\t]*[:=;]?[ \\t]*${key==='attackSpeed'?'(?:%[ \\t]*)?':''}([+-]?[\\d,]+(?:\\.\\d+)?)[ \\t]*(?:\\/[ \\t]*([\\d,]+))?(?=$|[ \\t%|+])`,'im');
        const match = text.match(regex);
        if (!match || (label==='HP' && /HP\s+Regen/i.test(match[0])) || /^[-+]?0\d/.test(match[1]) || key!=='attackSpeed'&&text.slice(match.index+match[0].length).startsWith('%')) continue;
        // Modern attributes/resources are displayed as explicit pairs. A lone
        // "1510" may be a lost slash/current value, not a four-digit attribute.
        if(character&&modern&&(['str','sta','int','wis','agi','dex','cha','hp','mana','endurance','resistPoison','resistMagic','resistDisease','resistFire','resistCold','resistCorruption'].includes(key)&&match[2]===undefined||key==='attack'))continue;
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
export function screenReadRefinementRegions(input={}) {
    const words=Array.isArray(input.words)?input.words.slice(0,2000):[],panes=itemRegions(words),regions=[],tables=[];
    for(const pane of panes){const rows=wordRows(wordsInPane(words,pane)),identity=paneName(words,pane),nameRow=rows.find(row=>nameWithoutChrome(row.words.map(word=>word.text).join(' '))===identity.name&&row.y>(pane.description?.bbox.y1??-Infinity));
        if(panes.length===1&&nameRow){const bounds=nameRow.words.map(word=>word.bbox),height=Math.max(...bounds.map(box=>box.y1))-Math.min(...bounds.map(box=>box.y0));
            regions.push({role:'item-name',x:Math.min(...bounds.map(box=>box.x0))-height*.3,y:Math.min(...bounds.map(box=>box.y0))-height*.3,
                width:Math.max(...bounds.map(box=>box.x1))-Math.min(...bounds.map(box=>box.x0))+height*.6,height:height*1.6,preprocessing:'green',layout:'line'});}
        const first=rows.find(row=>row.words.some(word=>/^(?:AC|HP|Weight|Size)[:.]?$/i.test(clean(word.text)))),last=rows.find(row=>row.y>(first?.y??Infinity)&&row.words.some(word=>/^Modified$/i.test(clean(word.text))));
        if(first){const selected=rows.filter(row=>row.y>=first.y&&row.y<(last?.y??first.y+pane.font*22)).flatMap(row=>row.words),bounds=selected.map(word=>word.bbox);
            const attribute=selected.find(word=>/^(?:Strength|Stamina|Intelligence|Wisdom|Agility|Dexterity|Charisma):?$/i.test(clean(word.text)));
            const start=attribute?attribute.bbox.y0:first.y;
            if(bounds.length)tables.push({x:Math.min(...bounds.map(box=>box.x0))-pane.font*.5,y:start-pane.font*.4,width:Math.max(...bounds.map(box=>box.x1))-Math.min(...bounds.map(box=>box.x0))+pane.font,height:Math.max(...bounds.map(box=>box.y1))-start+pane.font*.8,preprocessing:attribute?'source-threshold':'inverted'});}
    }
    if(tables.length)regions.push({role:'item-stats',...(tables.length===1?tables[0]:{tiles:tables,preprocessing:'source-threshold'}),layout:'block',scale:4});
    const character=characterRegion(words,panes);
    if(character){if(regions.length===2)regions.shift();regions.push({role:'character-stats',x:character.x,y:character.y,width:character.right-character.x,height:character.bottom-character.y,preprocessing:'inverted',layout:'block',scale:3});}
    return regions.slice(0,2);
}
function characterRegion(words,panes){
    const available=words.filter(word=>word.bbox&&!panes.some(pane=>word.bbox.x0>=pane.x&&word.bbox.x1<=pane.right&&word.bbox.y0>=pane.y&&word.bbox.y0<pane.bottom));
    const inventory=available.find(word=>/^Inventory$/i.test(clean(word.text))),vitals=available.find(word=>/^Character$/i.test(clean(word.text))&&available.some(other=>/^Vitals$/i.test(clean(other.text))&&other.bbox.x0>word.bbox.x0&&Math.abs(other.bbox.y0-word.bbox.y0)<20));
    if(!inventory||!vitals)return null;
    const font=Math.max(3,vitals.bbox.y1-vitals.bbox.y0),heading=available.find(word=>/^Stats$/i.test(clean(word.text))&&word.bbox.x0>vitals.bbox.x0&&Math.abs(word.bbox.y0-vitals.bbox.y0)<font);
    if(!heading)return null;
    return {x:Math.max(0,vitals.bbox.x0-font*.5),y:Math.max(0,vitals.bbox.y0-font*.5),right:heading.bbox.x0+font*24,bottom:vitals.bbox.y0+font*25,font};
}
function refinedWords(input,baseWords){
    const words=baseWords.map(word=>({...word}));
    for(const pass of (Array.isArray(input.refinements)?input.refinements:[]).slice(0,2)){
        if(pass.role!=='item-name')continue;
        for(const candidate of (Array.isArray(pass.words)?pass.words:[]).slice(0,200)){
            if(!candidate.bbox||Number(candidate.confidence)<50)continue;
            const box=candidate.bbox,height=Math.max(1,box.y1-box.y0),center=(box.x0+box.x1)/2;
            const matches=words.map((word,index)=>({word,index})).filter(({word})=>word.bbox&&Math.abs(word.bbox.y0-box.y0)<Math.max(3,height*.55)&&center>=word.bbox.x0-height*.3&&center<=word.bbox.x1+height*.3);
            matches.sort((a,b)=>Math.abs((a.word.bbox.x0+a.word.bbox.x1)/2-center)-Math.abs((b.word.bbox.x0+b.word.bbox.x1)/2-center));
            const match=matches[0]?.index??-1;
            if(match>=0&&Number(candidate.confidence)>=Number(words[match].confidence)+10)words[match]=candidate;
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
    const conflicts=new Set(),numeric=value=>clean(value).match(/^([+-]?[\d,]+(?:\.\d+)?)(?:\/(\d+))?(?:%|\+)?$/);
    // Compare the same observed numeric box even when the second pass cannot
    // read its label ("HP Regen 1" versus "HP R ... 11"). Do not reconstruct a
    // label or pick the larger/confident value: both remain evidence, unknown.
    for(const row of wordRows(base)){const text=row.words.map(word=>word.text).join(' ');
        for(const entry of stats(text,0,options)){const start=text.indexOf(entry.raw);if(start<0)continue;let offset=0;
            for(const word of row.words){const at=offset;offset+=String(word.text).length+1;const parts=numeric(word.text),component=entry.key.endsWith('Maximum')?2:1;
                if(!parts||at<start||at>=start+entry.raw.length||parts[component]===undefined||number(parts[component])!==entry.value)continue;
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
    const raw = clean(input.text).slice(0,16384),baseWords=Array.isArray(input.words)?input.words.slice(0,2000):[],words = refinedWords(input,baseWords);
    const confidence = Math.max(0,Math.min(100,Number(input.confidence) || 0));
    if (!raw) return [];
    const metadata = { kind:input.kind === 'manual' ? 'manual':'ocr', owner:input.owner || 'contribution', sessionId:input.sessionId || '',
        capturedAt:input.capturedAt || new Date().toISOString(), input:input.input || {} };
    const panes=itemRegions(words),observations=[],initialPanes=itemRegions(baseWords);
    // Word geometry is always used when available, including an Inventory pane
    // to the right of any number of item panes. Sparse OCR text order is not row
    // order and must never join a label with a different item's numeric value.
    for(const [paneIndex,region] of (panes.length?panes:[null]).entries()){
    const itemText=region?wordLines(wordsInPane(words,region)):raw,identity=region?paneName(words,region):{name:itemName(raw.split(/\r?\n/).map(clean)),title:''};
    const lines=itemText.split(/\r?\n/).map(clean).filter(Boolean),name=identity.name.slice(0,240);
    if (name && name.length > 2) {
        const fields = [field('name',name,name,confidence), ...stats(itemText,confidence)];
        // Region OCR sees a compact two-column examine stat table more clearly
        // than a whole scene. Punctuation after a label is OCR evidence, not a
        // decimal repair in the value; missing numeric punctuation stays absent.
        const relevantPasses=(Array.isArray(input.refinements)?input.refinements:[]).slice(0,2).filter(pass=>['item-name','item-stats'].includes(pass.role)).map(pass=>{
            const selected=region?(pass.words||[]).filter(word=>wordsInPane([word],region).length):[];
            const aligned=alignedTableWords(region?wordsInPane(baseWords,region):baseWords,selected);
            return {...pass,words:aligned,rawText:wordLines(selected)||String(pass.text||''),text:aligned.length?wordLines(aligned):panes.length<=1&&!pass.tiles?.length?String(pass.text||''):''};
        }).filter(pass=>pass.text);
        const statPasses=relevantPasses.filter(pass=>pass.role==='item-stats'),conflicts=new Set();
        for(const pass of statPasses)for(const key of numericDisagreements(region?wordsInPane(baseWords,region):baseWords,pass.words||[])){conflicts.add(key);const index=fields.findIndex(entry=>entry.key===key);if(index>=0)fields.splice(index,1);}
        for(const pass of statPasses)for(const entry of tableStats(pass.text.replace(/\b(AC|HP|Weight)\.(?=[ \t])/g,'$1'),pass.words||[],Math.min(confidence,Number(pass.confidence)||0))){
            const existing=fields.findIndex(value=>value.key===entry.key);if(existing<0&&!conflicts.has(entry.key))fields.push(entry);else if(existing>=0&&fields[existing].value!==entry.value){conflicts.add(entry.key);fields.splice(existing,1);}
        }
        const tier = itemText.match(/\bTier[ \t]*[:=]?[ \t]*(\d+)(?:[ \t]+(\d+)[ \t]*\/[ \t]*(\d+)|[ \t]*\/[ \t]*(\d+))?/i) || name.match(/\+(\d+)\s*$/);
        if (tier && Number(tier[1])<=100) fields.push(field('tier',tier[0],Number(tier[1]),confidence));
        if(tier?.[2]!==undefined&&Number(tier[3])===2**Number(tier[1])&&Number(tier[2])>=0&&Number(tier[2])<Number(tier[3]))fields.push(field('fraction',tier[0],Number(tier[2]),confidence),field('fractionMaximum',tier[0],Number(tier[3]),confidence));
        for (const [label,key] of [['Class','classes'],['Race','races'],['Slot','slots'],['Size','size']]) {
            const found = (key==='size'?[itemText,...statPasses.map(pass=>pass.text)].join('\n'):itemText).match(new RegExp(`^${label}[ \\t]*:[ \\t]*(.+)$`,'im'));
            if (found) fields.push(field(key,found[0],key==='size' ? found[1].trim().split(/\s+/)[0] : key==='slots'?slotNames(found[1]):found[1].split(/\s*[,/]\s*|\s+/).filter(Boolean),confidence));
        }
        if(!fields.some(entry=>entry.key==='slots')){const slot=lines.find(line=>/^(?:Charm|Power[ \t]?Source|Feet|Primary|Secondary|Fingers?|Head|Face|Neck|Shoulders?|Arms|Hands|Wrists?|Back|Chest|Waist|Legs|Ears?|Ranged?|Ammo)(?:[ \/]+(?:Primary|Secondary|Fingers?))?$/i.test(line));if(slot)fields.push(field('slots',slot,slotNames(slot),confidence));}
        const augmentNames = lines.map(line=>line.replace(/^[^a-z]+/i,'')).filter(line=>/^(?:\w+ )?Exaltation\s*:/i.test(line)).map(line=>line.replace(/^[^:]+:\s*/,'')).filter(value=>distance(value.toLowerCase(),'empty')>1).slice(0,12);
        if (augmentNames.length) fields.push(field('augmentNames',augmentNames.join('; '),augmentNames,confidence));
        const effects = lines.filter(line=>/^(?:Click|Worn|Focus|Proc) Effect\s*:/i.test(line)).slice(0,12);
        if (effects.length) fields.push(field('effects',effects.join('; '),effects,confidence));
        // Modern always renders an unchecked "Modified" checkbox label. Only
        // an explicit title/state is evidence; the label by itself is unknown.
        if(/\((?:Augmented|Modified)\)/i.test(identity.title)||/^Modified\s*:\s*(?:yes|true|checked)$/im.test(itemText))fields.push(field('modified',identity.title||'Modified: yes',true,confidence));
        if (/\bNo Trade\b|\bNo Drop\b/i.test(itemText)) fields.push(field('noTrade','No Trade',true,confidence));
        const initialPane=initialPanes[paneIndex],initialName=initialPane?paneName(baseWords,initialPane).name:itemName(raw.split(/\r?\n/).map(clean));
        observations.push({ ...metadata, parser:{name:'item-examine',version:SCREEN_READ_PARSER_VERSION},
            subject:{kind:'item',name}, fields, evidence:{text:[...fields.map(entry=>entry.raw),...(initialName&&initialName!==name?[`Initial item name OCR: ${initialName}`]:[]),...relevantPasses.map(pass=>`${pass.role} region OCR:\n${clean(pass.rawText).slice(0,3000)}`),...(conflicts.size?[`Conflicting OCR values left unknown: ${[...conflicts].join(', ')}`]:[])].join('\n').slice(0,16384),imageId:null} });
    }
    }
    // A visible inventory/stat heading is required; item-only panes cannot become
    // an authoritative character total. Geometry excludes the examine region.
    const character=characterRegion(words,panes),characterWords=character?words.filter(word=>word.bbox&&word.bbox.x0>=character.x&&word.bbox.x1<=character.right&&word.bbox.y0>=character.y&&word.bbox.y1<=character.bottom):[],characterText=character?wordLines(characterWords):words.length?wordLines(words.filter(word=>!panes.some(pane=>wordsInPane([word],pane).length))):raw;
    if (character||/\bInventory\b|^Character Stats\b/im.test(characterText)) {
        const fields = stats(characterText,confidence,{character:true,modern:!!character}),conflicts=new Set(),evidence=[characterText];
        for(const pass of (Array.isArray(input.refinements)?input.refinements:[]).slice(0,2).filter(pass=>pass.role==='character-stats')){const mapped=alignedTableWords(characterWords,pass.words||[]),text=wordLines(mapped)||String(pass.text||'');evidence.push(wordLines(pass.words||[])||String(pass.text||''));
            for(const key of numericDisagreements(characterWords,pass.words||[],{character:true,modern:!!character})){conflicts.add(key);const index=fields.findIndex(entry=>entry.key===key);if(index>=0)fields.splice(index,1);}
            for(const entry of stats(text,Math.min(confidence,Number(pass.confidence)||0),{character:true,modern:!!character})){
                if(entry.key.startsWith('resist')&&(pass.words||[]).some(word=>String(word.text).includes(`${entry.value}/`)&&Number(word.confidence)<95))continue;
                const existing=fields.findIndex(value=>value.key===entry.key);if(existing<0&&!conflicts.has(entry.key))fields.push(entry);else if(existing>=0&&fields[existing].value!==entry.value){conflicts.add(entry.key);fields.splice(existing,1);}}
        }
        if (fields.filter(entry=>['hpCurrent','hpMaximum','manaCurrent','manaMaximum','ac','str','sta','agi','dex','wis','int','cha'].includes(entry.key)).length>=3) {
            observations.push({ ...metadata, parser:{name:'character-stats',version:SCREEN_READ_PARSER_VERSION},
                subject:{kind:'character',name:clean(input.character).slice(0,80)},fields,
                evidence:{text:[...fields.map(entry=>entry.raw),...evidence,...(conflicts.size?[`Conflicting OCR values left unknown: ${[...conflicts].join(', ')}`]:[])].join('\n').slice(0,16384),imageId:null} });
        }
    }
    return observations;
}
