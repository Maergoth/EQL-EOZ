import {normalizeCharacterItemDetails,characterEffectDetails} from './character-item-card.js';
import { CHARACTER_SLOTS, CHARACTER_STAT_KEYS, characterEquipmentEligibility, characterItemStats, characterExaltationStats, characterTotals, characterStatLabel } from './character-model.js';
import { characterTotalGroups } from './character-totals.js';
import { normalizeAchievementExport } from './achievement-export.js';
import { normalizeCharacterScreenshotFile } from './character-screenshot.js';
import { ensureEoZPageCategory } from './eoz-page-category.js';

export const CHARACTER_WIKI_SHEET_SCHEMA=1;
export const CHARACTER_WIKI_SHEET_CAPABILITY=Object.freeze({template:'Template:Character_sheet',templateMarker:'EQL_CHARACTER_SHEET_V1',itemTemplate:'Template:Character_sheet_item',itemMarker:'EQL_CHARACTER_SHEET_ITEM_V1',achievementMarker:'EQL_CHARACTER_ACHIEVEMENTS_V1',screenshotMarker:'EQL_CHARACTER_SCREENSHOT_V1',module:'skins.EQLImmersive.characterSheet'});
export const CHARACTER_WIKI_SHEET_LIMITS=Object.freeze({bytes:512*1024,templateBytes:1024*1024,pageBytes:2*1024*1024,items:24,stats:48});
export const CHARACTER_WIKI_SHEET_SLOTS=Object.freeze(CHARACTER_SLOTS.filter(slot=>slot.id!=='power').map(slot=>slot.id));
const SLOTS=new Set(CHARACTER_WIKI_SHEET_SLOTS);
const ITEM_STATS=new Set([...CHARACTER_STAT_KEYS,'SV_CORRUPTION','WT','DMG','DELAY','DMG_BONUS','BACKSTAB_DMG','ATTACK_SPEED'].filter(key=>!/_CURRENT$|_MAXIMUM$/.test(key)));
const TOTAL_STATS=new Set([...CHARACTER_STAT_KEYS,'SV_CORRUPTION','ATTACK_SPEED','VELOCITY','PRIMARY_DPS','SECONDARY_DPS','RANGED_DPS'].filter(key=>!/_CURRENT$|_MAXIMUM$/.test(key)));
const BASES=new Set(['observed-examine','scaled-catalog','catalog-tier-preview','inventory-export']);
const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9;
const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function text(value,max,{required=false}={}){
    if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('Review the character sheet text fields.');
    const result=value.trim().replace(/\s+/gu,' ');if(required&&!result)throw Error('Enter the character name and server before sharing.');return result;
}
function number(value,{integer=false,min=-1e9,max=1e9}={}){
    if(value===null)return null;
    if(!finite(value)||integer&&!Number.isInteger(value)||value<min||value>max)throw Error('Review the character sheet numeric values.');return Object.is(value,-0)?0:value;
}
function stats(value,allowed){
    if(!object(value)||Object.keys(value).length>CHARACTER_WIKI_SHEET_LIMITS.stats)throw Error('Review the character sheet statistics.');
    const result={};for(const key of [...Object.keys(value)].sort()){if(!allowed.has(key))throw Error('An unsupported character sheet statistic was supplied.');result[key]=number(value[key]);}return result;
}
export function characterWikiIdentity(metadata){
    return [text(metadata?.name,120,{required:true}),text(metadata?.server,100,{required:true})].map(value=>value.normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').toLowerCase()).join('\n');
}
export function normalizeCharacterWikiSheet(input){
    if(!object(input)||input.schemaVersion!==CHARACTER_WIKI_SHEET_SCHEMA||!object(input.metadata)||!Array.isArray(input.equipment)||input.equipment.length>CHARACTER_WIKI_SHEET_LIMITS.items||!object(input.totals))throw Error('The interactive character sheet format is unsupported.');
    if(size(input)>CHARACTER_WIKI_SHEET_LIMITS.bytes)throw Error('The interactive character sheet exceeds its size limit.');
    const source=input.metadata;
    if(!Array.isArray(source.classes)||source.classes.length>3)throw Error('Review the character classes.');
    const metadata={name:text(source.name,120,{required:true}),server:text(source.server,100,{required:true}),level:number(source.level,{integer:true,min:1,max:125}),race:text(source.race,80),classes:[...new Set(source.classes.map(value=>text(value,40,{required:true})))],aaCount:number(source.aaCount,{integer:true,min:0,max:1000000})};
    const totals={};if(Object.keys(input.totals).length>CHARACTER_WIKI_SHEET_LIMITS.stats)throw Error('Too many character sheet totals.');
    for(const key of [...Object.keys(input.totals)].sort()){
        const record=input.totals[key];if(!TOTAL_STATS.has(key)||!object(record)||typeof record.complete!=='boolean')throw Error('Review the character sheet totals.');
        totals[key]={value:number(record.value),complete:record.complete&&record.value!==null};
    }
    const bySlot=new Map();
    for(const item of input.equipment){
        if(!object(item)||!SLOTS.has(item.slot)||bySlot.has(item.slot)||!BASES.has(item.basis)||typeof item.complete!=='boolean')throw Error('Review the character sheet equipment slots.');
        const title=text(item.title,230,{required:true});if(/[\[\]{}<>|#:\r\n]/.test(title)||title.startsWith('.'))throw Error('A canonical main-namespace item title is required.');
        const tier=number(item.tier,{integer:true,min:0,max:10}),augmentSlots=number(item.augmentSlots,{integer:true,min:0,max:8});
        if(!Array.isArray(item.augments)||item.augments.length>8)throw Error('Review the character sheet augment sockets.');
        const occupied=new Set(),augments=item.augments.map(augment=>{
            if(!object(augment)||typeof augment.complete!=='boolean')throw Error('Review the character sheet augments.');
            const index=number(augment.index,{integer:true,min:0,max:7});if(index===null||occupied.has(index)||augmentSlots!==null&&index>=augmentSlots)throw Error('Review the character sheet augment socket positions.');occupied.add(index);
            const augmentTitle=text(augment.title,230,{required:true});if(/[\[\]{}<>|#:\r\n]/.test(augmentTitle)||augmentTitle.startsWith('.'))throw Error('A canonical main-namespace augment title is required.');
            return {index,title:augmentTitle,tier:number(augment.tier,{integer:true,min:0,max:10}),iconId:number(augment.iconId,{integer:true,min:0,max:1000000}),complete:augment.complete,stats:stats(augment.stats,ITEM_STATS),details:normalizeCharacterItemDetails(augment.details,{strict:true})};
        }).sort((a,b)=>a.index-b.index);
        bySlot.set(item.slot,{slot:item.slot,title,tier,iconId:number(item.iconId,{integer:true,min:0,max:1000000}),level:number(item.level,{integer:true,min:0,max:125}),basis:item.basis,complete:item.complete,stats:stats(item.stats,ITEM_STATS),details:normalizeCharacterItemDetails(item.details,{strict:true}),augmentSlots,augments});
    }
    const result={schemaVersion:CHARACTER_WIKI_SHEET_SCHEMA,metadata,totals,equipment:CHARACTER_WIKI_SHEET_SLOTS.filter(slot=>bySlot.has(slot)).map(slot=>bySlot.get(slot))};
    if(input.screenshotFile!==undefined)result.screenshotFile=normalizeCharacterScreenshotFile(input.screenshotFile);
    if(input.achievements!==undefined&&input.achievements!==null){const achievements=normalizeAchievementExport(input.achievements);if(!achievements)throw Error('Review the character achievement export.');result.achievements=achievements;}
    if(size(result)>CHARACTER_WIKI_SHEET_LIMITS.bytes)throw Error('The interactive character sheet exceeds its size limit.');return result;
}

/** Share reviewed equipped items and the observed character totals. Raw OCR,
 * source/session IDs, export paths, private inventory and current resources
 * never leave here. Catalog item previews never change the character totals. */
export function buildCharacterWikiSheet(snapshot){
    const byId=new Map((snapshot?.candidates||[]).map(item=>[item.id,item])),equipment=[];
    for(const slot of CHARACTER_WIKI_SHEET_SLOTS){
        const item=byId.get(snapshot?.equipment?.[slot]);if(!item)continue;
        const eligibility=characterEquipmentEligibility(item),imported=Boolean(item.inventoryOrigin);
        if(!eligibility.known)continue;
        // Missing wiki items are intentionally left empty in public snapshots.
        // Import provenance does not establish an item article or its stats.
        const read=characterItemStats(item),iconId=/^\d{1,7}$/.test(String(item.iconId))?Number(item.iconId):null;
        const occupied=(item.augments||[]).map((augment,index)=>({...augment,index:Number.isInteger(augment.index)?augment.index:index})),publicAugments=occupied.filter(augment=>characterEquipmentEligibility(augment).known);
        const augments=publicAugments.map(augment=>{const read=characterExaltationStats(augment);return {index:augment.index,title:augment.catalogIdentity.wikiTitle,tier:augment.tier??null,iconId:/^\d{1,7}$/.test(String(augment.iconId))?Number(augment.iconId):null,stats:Object.fromEntries(Object.entries(read.stats).filter(([key])=>ITEM_STATS.has(key))),complete:read.complete,details:normalizeCharacterItemDetails(augment.details)};});
        equipment.push({slot,title:item.catalogIdentity.wikiTitle,tier:item.tier??null,iconId,level:item.level??null,basis:imported?'inventory-export':read.basis,complete:read.complete,stats:Object.fromEntries(Object.entries(read.stats).filter(([key])=>ITEM_STATS.has(key))),details:normalizeCharacterItemDetails(item.details),augmentSlots:item.augmentSlots??null,augments});
    }
    const totals={};for(const group of characterTotalGroups(characterTotals(snapshot)))for(const row of group.rows){const key=row.key.replace(/_MAXIMUM$/,'');if(TOTAL_STATS.has(key))totals[key]={value:row.value??null,complete:row.complete===true};}
    const metadata=snapshot.metadata||{};
    return normalizeCharacterWikiSheet({schemaVersion:CHARACTER_WIKI_SHEET_SCHEMA,metadata:{name:metadata.name||'',server:metadata.server||'',level:metadata.level??null,race:metadata.race||'',classes:metadata.classes||[],aaCount:metadata.aaCount??null},totals,equipment,...(snapshot?.achievements?{achievements:snapshot.achievements}:{})});
}

const literal=value=>String(value).replace(/[&<>"'{}|\[\]~_]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','{':'&#123;','}':'&#125;','|':'&#124;','[':'&#91;',']':'&#93;','~':'&#126;','_':'&#95;'}[character]));
const numericText=(value,complete=true)=>value===null?'?':`${value}${complete?'':' *'}`;
const detailLines=value=>normalizeCharacterItemDetails(value,{strict:true}).map(detail=>`${literal(detail.label)}: ${detail.linkTitle?`[[${literal(detail.linkTitle)}|${literal(detail.value)}]]`:literal(detail.value)}`).join('<br>');
const statLines=(value,complete)=>Object.entries(value).map(([key,value])=>`${literal(characterStatLabel(key))}: ${numericText(value,complete)}`).join('<br>');
/** Generated fixed HTML only. Export text cannot introduce templates, links,
 * parameters, headings, attributes or parser switches. Completion of a parent
 * achievement is taken from its own export marker, never its objectives. */
export function characterAchievementsWikiMarkup(input){
    const data=normalizeAchievementExport(input);if(!data)throw Error('Review the character achievement export.');
    const status=value=>`<span class="eql-character-achievement-status">${value?'Complete':'Incomplete'}</span>`;
    return `<p class="eql-character-achievements-summary">${data.completedCount} / ${data.achievementCount} achievements complete</p>`+data.categories.map(category=>
        `<div class="eql-character-achievement-category"><div class="eql-character-achievement-category-heading">${literal(category.name)} (${category.achievements.filter(value=>value.completed).length} / ${category.achievements.length})</div><ul class="eql-character-achievement-list">`+category.achievements.map(achievement=>
            `<li class="eql-character-achievement${achievement.completed?' is-complete':''}"><div class="eql-character-achievement-heading"><strong>${literal(achievement.name)}</strong> ${status(achievement.completed)}</div>`+(achievement.objectives.length?'<ul class="eql-character-achievement-objectives">'+achievement.objectives.map(objective=>
                `<li class="${objective.completed?'is-complete':'is-incomplete'}">${status(objective.completed)} ${literal(objective.text)}${Object.hasOwn(objective,'current')?` <span class="eql-character-achievement-progress">${objective.current} / ${objective.required}</span>`:''}</li>`).join('')+'</ul>':'')+'</li>').join('')+'</ul></div>').join('');
}
/** Only fixed parameter names and generated numeric/stat markup enter source.
 * User text is entity-escaped before MediaWiki parameter/template parsing. */
export function normalizeCharacterWikiCaption(value=''){
    if(typeof value!=='string'||value.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error('Keep the character sheet caption under 2,000 characters, without control characters.');
    return value.replace(/\r\n?/g,'\n').replace(/\t/g,' ').trim();
}
export function serializeCharacterWikiSheet(input,{caption=''}={}){
    const sheet=normalizeCharacterWikiSheet(input),meta=sheet.metadata,parameters=[['name',literal(meta.name)],['server',literal(meta.server)],['level',numericText(meta.level)],['race',literal(meta.race)],['classes',literal(meta.classes.join(' / '))],['aa',numericText(meta.aaCount)]];
    const note=normalizeCharacterWikiCaption(caption);if(note)parameters.push(['caption',note.split('\n').map(literal).join('<br>')]);
    if(sheet.screenshotFile)parameters.push(['screenshot',literal(sheet.screenshotFile.slice(5))]);
    for(const [key,record]of Object.entries(sheet.totals))parameters.push([`total_${key.toLowerCase()}`,numericText(record.value,record.complete)]);
    for(const item of sheet.equipment){
        const prefix=item.slot;parameters.push([`${prefix}_item`,literal(item.title)],[`${prefix}_tier`,numericText(item.tier)],[`${prefix}_icon`,item.iconId===null?'':String(item.iconId)],[`${prefix}_stats`,statLines(item.stats,item.complete)],[`${prefix}_details`,detailLines(item.details)],[`${prefix}_augment_slots`,item.augmentSlots===null?'':String(item.augmentSlots)]);
        // Schema-1 rich socket values remain private/validated for compatibility;
        // public socket cards contain only their identity and direct effects.
        for(const augment of item.augments){const key=`${prefix}_augment_${augment.index+1}`;parameters.push([`${key}_item`,literal(augment.title)],[`${key}_details`,detailLines(characterEffectDetails(augment.details))]);}
    }
    if(sheet.achievements)parameters.push(['achievements',characterAchievementsWikiMarkup(sheet.achievements)]);
    const source=`{{Character_sheet\n${parameters.map(([key,value])=>`|${key}=${value}`).join('\n')}\n}}`;
    if(new TextEncoder().encode(source).length>CHARACTER_WIKI_SHEET_LIMITS.templateBytes)throw Error('The interactive character sheet exceeds its wiki text size limit.');return source;
}

/** Managed marker boundaries are the only source this app may replace. Literal
 * examples/comments stay untouched; malformed or nested markers need review. */
export function patchCharacterWikiSheet(source,key,template,{metadata=null}={}){
    if(typeof source!=='string'||new TextEncoder().encode(source).length>CHARACTER_WIKI_SHEET_LIMITS.pageBytes||!/^[a-f0-9]{64}$/.test(key)||typeof template!=='string'||new TextEncoder().encode(template).length>CHARACTER_WIKI_SHEET_LIMITS.templateBytes)throw Error('Invalid character sheet replacement input.');
    const protectedRanges=[],comments=[],regions=/<!--|<(nowiki|pre|source|syntaxhighlight|code)\b[^>]*>/gi;
    for(let match;(match=regions.exec(source));){
        if(match[0]==='<!--'){const end=source.indexOf('-->',regions.lastIndex);if(end<0)throw Error('An unclosed wiki comment needs manual review before sharing.');comments.push({0:source.slice(match.index,end+3),index:match.index});regions.lastIndex=end+3;}
        else if(!/\/\s*>$/.test(match[0])){const closing=new RegExp(`</${match[1]}\\s*>`,'gi');closing.lastIndex=regions.lastIndex;const end=closing.exec(source);if(!end)throw Error('An unclosed wiki literal region needs manual review before sharing.');protectedRanges.push([match.index,closing.lastIndex]);regions.lastIndex=closing.lastIndex;}
        if(protectedRanges.length>256||comments.length>4096)throw Error('This talk page needs manual wiki review before sharing.');
    }
    const marker=/^<!-- EQL-EOZ-CHARACTER-SHEET:([a-f0-9]{64}):(BEGIN|END) -->$/;
    const tokens=comments.flatMap(match=>{const fields=match[0].match(marker);return fields?[{key:fields[1],type:fields[2],start:match.index,end:match.index+match[0].length}]:[];});
    if(comments.length>4096||tokens.length>256)throw Error('This talk page needs manual wiki review before sharing.');
    const managed=[];let open=null,target=null;for(const token of tokens){if(token.type==='BEGIN'){if(open)throw Error('Nested character sheet markers need manual wiki review.');open=token;}else{if(!open||open.key!==token.key)throw Error('Unmatched character sheet markers need manual wiki review.');const range={start:open.start,end:token.end,contentStart:open.end,contentEnd:token.start};managed.push(range);if(token.key===key){if(target)throw Error('Duplicate character sheets need manual wiki review.');target=range;}open=null;}}if(open)throw Error('Unmatched character sheet markers need manual wiki review.');
    if(metadata){
        const expected=characterWikiIdentity(metadata),decode=value=>value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity.toLowerCase()])return named[entity.toLowerCase()];const hex=/^&#x/i.test(entity),code=Number.parseInt(entity.slice(hex?3:2,-1),hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):entity;});
        const identityOf=raw=>{const body=raw.trim().match(/^\{\{\s*(?:Template\s*:\s*)?Character[ _]sheet(?=\s*[|}])\s*([\s\S]*)\}\}$/i);if(!body)return null;const fields={};for(const part of body[1].split('|')){const field=part.match(/^\s*(name|server)\s*=([\s\S]*)$/i);if(field){const label=field[1].toLowerCase();if(Object.hasOwn(fields,label)||/[{}\[\]<>]/.test(field[2]))return null;fields[label]=decode(field[2]).trim();}}try{return characterWikiIdentity(fields);}catch{return null;}};
        if(target&&identityOf(source.slice(target.contentStart,target.contentEnd))!==expected)throw Error('The marked character sheet identity changed. Review that block on the wiki before replacing it.');
        const hidden=[...protectedRanges,...comments.map(match=>[match.index,match.index+match[0].length]),...managed.map(range=>[range.start,range.end])];
        const invocations=[...source.matchAll(/\{\{\s*(?:Template\s*:\s*)?Character[ _]sheet\s*(?=[|}])/gi)];if(invocations.length>128)throw Error('This talk page needs manual wiki review before sharing.');
        for(const match of invocations){
            if(hidden.some(([a,b])=>match.index>=a&&match.index<b))continue;
            const braces=/\{\{|\}\}/g;braces.lastIndex=match.index;let depth=0,end=null;for(let token;(token=braces.exec(source));){if(hidden.some(([a,b])=>token.index>=a&&token.index<b))continue;depth+=token[0]==='{{'?1:-1;if(depth===0){end=braces.lastIndex;break;}}
            const found=end===null?null:identityOf(source.slice(match.index,end));if(found===null||found===expected)throw Error('An unmarked matching or ambiguous character sheet needs manual wiki review before sharing.');
        }
    }
    // A new image explicitly replaces this parameter. Equipment-only shares
    // retain a manually selected image from this exact managed block.
    if(target&&!/\n\|screenshot\s*=/.test(template)){
        const body=source.slice(target.contentStart,target.contentEnd),fields=[],literalRanges=[...protectedRanges,...comments.map(match=>[match.index,match.index+match[0].length])];let depth=0,links=0,start=0;
        for(let at=0;at<body.length;at++){const hidden=literalRanges.find(([begin,end])=>at+target.contentStart>=begin&&at+target.contentStart<end);if(hidden){at=hidden[1]-target.contentStart-1;continue;}const pair=body.slice(at,at+2);if(pair==='{{'){depth++;at++;}else if(pair==='}}'){depth--;at++;}else if(pair==='[['){links++;at++;}else if(pair===']]'){links--;at++;}else if(body[at]==='|'&&depth===1&&links===0){fields.push(body.slice(start,at));start=at+1;}}
        fields.push(body.slice(start,body.lastIndexOf('}}')));const screenshots=fields.map(field=>field.match(/^\s*screenshot\s*=([\s\S]*)$/i)).filter(Boolean);
        if(screenshots.length>1)throw Error('Duplicate character image parameters need manual wiki review.');
        if(screenshots.length&&screenshots[0][1].trim()){
            const decoded=screenshots[0][1].trim().replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity.toLowerCase()])return named[entity.toLowerCase()];const hex=/^&#x/i.test(entity),code=Number.parseInt(entity.slice(hex?3:2,-1),hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):entity;});
            const filename=normalizeCharacterScreenshotFile(decoded).slice(5);template=template.replace(/\n\}\}$/,'\n|screenshot='+literal(filename)+'\n}}');
        }
    }
    const block=`<!-- EQL-EOZ-CHARACTER-SHEET:${key}:BEGIN -->\n${template}\n<!-- EQL-EOZ-CHARACTER-SHEET:${key}:END -->`,beforeBlock=target?source.slice(target.start,target.end):null;
    const updated=ensureEoZPageCategory(target?source.slice(0,target.start)+block+source.slice(target.end):source+(source.endsWith('\n\n')||!source?'':source.endsWith('\n')?'\n':'\n\n')+block);
    if(new TextEncoder().encode(updated).length>CHARACTER_WIKI_SHEET_LIMITS.pageBytes)throw Error('The updated User page exceeds the character sheet size limit.');
    return {text:updated,block,beforeBlock,changed:updated!==source};
}
