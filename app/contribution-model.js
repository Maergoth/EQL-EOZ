// Pure contribution preparation. OCR observations are suggestions; only reviewed
// fields enter wikicode. No network, account state, or narrative generation.
import { validateItemBaseReview, proposeItemBaseReview, applyItemBaseReview } from './item-base-review.js';
import { validateTierZeroVerification, requiresTierZeroVerification, tierZeroRecoveryNoteMatches, TIER_ZERO_VERIFICATION_CATEGORY, TIER_ZERO_CATEGORY_MARKER } from './contribution-tier-zero.js';
import { normalizeContributionChoices } from './contribution-choice-picker.js';
import { isOwnedPetName } from './generated-pets.js';
import { lootSetCoverage } from './loot-set-coverage.js';
import { fillZoneCreationBlueprint, ZONE_OVERVIEW_TOKEN_FIELDS } from './zone-blueprint.js';
import { itemContributionWikiStatLines } from './item-contribution-stats.js';
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const TYPES = new Set(['item', 'npc', 'zone', 'spell']);
const CLASS_NAMES = { BER:'Berserker', BRD:'Bard', BST:'Beastlord', CLR:'Cleric', DRU:'Druid', ENC:'Enchanter', MAG:'Magician', MNK:'Monk', NEC:'Necromancer', PAL:'Paladin', RNG:'Ranger', ROG:'Rogue', SHM:'Shaman', SHD:'Shadow Knight', WAR:'Warrior', WIZ:'Wizard' };
const SLOT_CATEGORIES = { PRIMARY:'Primary', SECONDARY:'Secondary', RANGE:'Range', AMMO:'Ammo', ARMS:'Arms', BACK:'Back', CHEST:'Chest', EAR:'Ear', FACE:'Face', FEET:'Feet', FINGER:'Fingers', FINGERS:'Fingers', HANDS:'Hands', HEAD:'Head', LEGS:'Legs', NECK:'Neck', SHOULDERS:'Shoulders', WAIST:'Waist', WRIST:'Wrist' };
const clean = (value, max = 4000) => String(value ?? '').replace(CONTROL, ' ').trim().slice(0, max);
export const contributionNameKey = value => clean(value, 240).normalize('NFKC').replace(/_/g, ' ').replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const CONTRIBUTION_NAMESPACE=/^(?:media|special|talk|user(?: talk)?|project(?: talk)?|eql ?wiki(?: talk)?|file(?: talk)?|image(?: talk)?|mediawiki(?: talk)?|template(?: talk)?|help(?: talk)?|category(?: talk)?|module(?: talk)?|widget(?: talk)?|portal(?: talk)?|property(?: talk)?|concept(?: talk)?|form(?: talk)?|timedtext(?: talk)?|gadget(?: definition)?(?: talk)?|topic|thread|summary|https?|ftp|javascript|data)\s*:/i;
export function contributionTitle(value) {
    if (/[\r\n\t]/.test(String(value ?? ''))) throw new Error('Enter a single-line article title.');
    const title = clean(value, 240).replace(/_/g, ' ').replace(/\s+/g, ' ');
    if (!title || /[\[\]{}<>|#~\r\n]/.test(title) || title.startsWith('.') || title.startsWith(':') || CONTRIBUTION_NAMESPACE.test(title) || title.length > 230) throw new Error('Enter an article title without wiki markup or a namespace.');
    return title;
}
export const literalWikiText = value => clean(value, 16000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/~/g, '&#126;').replace(/_/g, '&#95;');
const link = title => `[[${contributionTitle(title)}]]`;
const itemTransclusion = title => `{{:${contributionTitle(title)}}}`;
const category = title => `[[Category:${contributionTitle(title)}]]`;
export function safeContributionFilename(value){
    const filename=contributionTitle(value);
    if(!/\.(?:png|jpe?g|webp)$/i.test(filename)||filename.length>230)throw Error('Choose a valid wiki image filename.');
    return filename;
}
export function safeZoneMapFilename(value){
    const filename=String(value??'').trim();
    if(filename.length>230||/[\u0000-\u001f\u007f]/.test(filename))throw Error('Choose a valid wiki image filename.');
    safeContributionFilename(filename);
    return filename;
}
export function contributionItemEffects(input){
    const fields=input.fields||{},get=key=>fields[key]?.confirmed?fields[key].value:null,result=[];
    const selected=itemOptionalText(get('effectName'));
    if(selected)result.push({name:contributionTitle(selected),type:itemOptionalText(get('effectType'),40),castTime:itemOptionalText(get('effectCastTime'),80),level:itemOptionalText(get('effectLevel'),20)});
    let firstRaw=true;
    for(const line of Array.isArray(get('effects'))?get('effects'):[]){
        const match=String(line).match(/^(?:(Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:\s*(.+)$/i);if(!match)continue;
        const name=match[2].replace(/\s*\((?:Req(?:uired)?\s*Level|Combat|Click|Worn|Focus|Proc|Must Equip|Can Equip|Casting Time)\b.*$/i,'').replace(/\s+(?:at|Req(?:uired)?)\s+Level\s+\d+.*$/i,'').trim();
        if(!itemOptionalText(name))continue;
        // The form edits the first effect. Untouched auto-filled fields never
        // discard additional Click/Worn/Focus effects from the observed item.
        if(firstRaw&&(selected&&fields.effectName?.edited||itemEffectWasCleared(input))){firstRaw=false;continue;}firstRaw=false;
        try{const title=contributionTitle(name);if(!result.some(item=>contributionNameKey(item.name)===contributionNameKey(title)))result.push({name:title,type:match[1]||match[2].match(/\((Combat|Click|Worn|Focus|Proc|Must Equip|Can Equip)\b/i)?.[1]||'',castTime:itemOptionalText(match[2].match(/Casting Time:\s*([^),]+)/i)?.[1],80),level:match[2].match(/(?:Req(?:uired)?\s+Level|at Level)\s*(\d+)/i)?.[1]||''});}catch{/* Keep unsupported names in raw evidence rather than create malformed links. */}
    }
    return result.slice(0,8);
}
function itemOptionalText(value,max=4000){const text=clean(value,max);return text==='?'?'':text;}
function itemEffectWasCleared(candidate){const field=candidate.fields?.effectName;return field?.edited===true&&!itemOptionalText(field.value);}
const itemEffectLine=value=>/^\s*(?:(?:Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:/i.test(value);
function itemEffectLineWikicode(effect){const metadata=[literalWikiText(effect.type),effect.castTime?'Casting Time: '+literalWikiText(effect.castTime):''].filter(Boolean);return `Effect: ${link(effect.name)}${metadata.length?' ('+metadata.join(', ')+')':''}${effect.level?' at Level '+literalWikiText(effect.level):''}`;}
function itemLineHasEffect(line,effect){const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&#124;':'|','&#123;':'{','&#125;':'}','&#91;':'[','&#93;':']','&#126;':'~','&#95;':'_'},name=String(line).replace(/&(?:amp|lt|gt|#(?:124|123|125|91|93|126|95));/g,token=>entities[token]).replace(/^\s*(?:(?:Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:\s*/i,'').replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/,'$1').replace(/\s*\((?:Req(?:uired)?\s*Level|Combat|Click|Worn|Focus|Proc|Must Equip|Can Equip|Casting Time)\b.*$/i,'').replace(/\s+(?:at|Req(?:uired)?)\s+Level\s+\d+.*$/i,'').trim();return contributionNameKey(name)===contributionNameKey(effect.name);}
function itemChoiceStatLine(candidate,key){
    const field=candidate.fields[key];if(!field)return null;
    const clear=field.edited===true&&(Array.isArray(field.value)?!field.value.length:!itemOptionalText(field.value));if(!field.confirmed&&!clear)return null;
    const parsed=normalizeContributionChoices(key,field.value);if(parsed.unrecognized.length&&!field.edited)return null;
    return parsed.value.length?`${key==='classes'?'Class':'Slot'}: ${parsed.value.join(' ')}`:'';
}
const itemChoiceLine=(key,value)=>new RegExp('^\\s*'+(key==='classes'?'Class(?:es)?':'Slots?')+'\\s*:','i').test(value);
function lootSectionRows(candidate,titles){
    const kinds=candidate.fields.lootKinds?.confirmed&&candidate.fields.lootKinds.value&&typeof candidate.fields.lootKinds.value==='object'?candidate.fields.lootKinds.value:{};
    return ['unique','common'].flatMap(kind=>{const items=titles.filter(title=>(kinds[title]||kinds[contributionNameKey(title)])===kind);return items.length?[`! ${kind==='common'?'Common Loot':'Unique Items'}\n| ${items.map(itemTransclusion).join('<br>\n')}`]:[];});
}
export function contributionLootKind(candidate,title){
    const field=candidate.fields?.lootKinds,value=field?.confirmed===true?field.value?.[title]||field.value?.[contributionNameKey(title)]:null;
    return ['common','unique'].includes(value)?value:null;
}
function fillContributionBlueprint(source,values){
    const templates=contributionTemplates(source,'Spellpage');
    if(templates.length!==1)throw Error('The spell blueprint structure changed. Open it on the wiki.');
    const template=templates[0];
    return '{{Spellpage\n'+template.fields.map(field=>`| ${field.name} = ${values[field.name]===undefined||values[field.name]===''?'?':values[field.name]}`).join('\n')+'\n}}\n';
}

function reviewedTitles(candidate, key, label, warnings, blockers) {
    const field = candidate.fields[key];
    if (!field?.confirmed) {
        if (Array.isArray(field?.value) && field.value.length) warnings.push(`Unconfirmed ${label} relationships are excluded.`);
        return [];
    }
    if (!Array.isArray(field.value)) {
        blockers.push(`Review ${label} as one article title per line.`);
        return [];
    }
    const titles = new Set();
    for (const value of field.value.slice(0, 100)) {
        try {
            if (typeof value !== 'string') throw new Error();
            titles.add(contributionTitle(value));
        } catch { blockers.push(`Review the ${label} article titles; unsupported wiki markup was excluded.`); }
    }
    if (field.value.length > 100) warnings.push(`Only the first 100 ${label} relationships are included. Review the remaining entries separately.`);
    return [...titles];
}

export function normalizeContributionCandidate(input = {}) {
    if (!TYPES.has(input.kind)) throw new Error('Choose item, monster, zone or spell.');
    const name = contributionTitle(input.name || input.observedName || input.title);
    const fields = {};
    for (const [key, raw] of Object.entries(input.fields || {}).slice(0, 80)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)) continue;
        const wrapped = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw, 'value');
        fields[key] = { value:wrapped ? raw.value : raw, confirmed:wrapped ? raw.confirmed === true : (input.confirmedFields || []).includes(key), edited:wrapped && raw.edited === true };
        if(key==='notable')fields[key]={value:typeof fields[key].value==='boolean'?fields[key].value:null,confirmed:fields[key].confirmed&&typeof fields[key].value==='boolean',edited:fields[key].edited,source:'player'};
    }
    const field = key => fields[key]?.confirmed ? fields[key].value : undefined;
    const rawRecovery=input.baseRecovery,baseRecovery=rawRecovery&&typeof rawRecovery==='object'?{schemaVersion:rawRecovery.schemaVersion,sourceFingerprint:clean(rawRecovery.sourceFingerprint,16000),tier:rawRecovery.tier,fraction:rawRecovery.fraction,modifiersExcluded:rawRecovery.modifiersExcluded===null?null:rawRecovery.modifiersExcluded===true,reviewed:rawRecovery.reviewed===true,reviewMode:rawRecovery.reviewMode,choices:Object.fromEntries(Object.entries(rawRecovery.choices||{}).slice(0,40))}:null;
    const proof=input.baseVerification,baseVerification=proof&&typeof proof==='object'?{schemaVersion:proof.schemaVersion,evidenceId:clean(proof.evidenceId,240),capturedAt:clean(proof.capturedAt,50),reviewedAt:clean(proof.reviewedAt,50),modifiersExcluded:proof.modifiersExcluded===true,sourceFingerprint:clean(proof.sourceFingerprint,24000),observed:Object.fromEntries(Object.entries(proof.observed||{}).slice(0,80).filter(([key,value])=>/^[A-Z][A-Z0-9_]{0,50}$/.test(key)&&typeof value==='number'&&Number.isFinite(value))),numericFields:Object.fromEntries(Object.entries(proof.numericFields||{}).slice(0,80).filter(([key,value])=>/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)&&typeof value==='number'&&Number.isFinite(value)))}:null;
    return { id:clean(input.id || '', 100), kind:input.kind, name, title:contributionTitle(input.title || name), fields,baseRecovery,baseVerification,
        zone:clean(typeof input.zone === 'object' ? input.zone.title : input.zone || field('zone'), 230),
        instance:['normal','raid'].includes(input.instance || input.zone?.instance) ? input.instance || input.zone.instance : 'unknown',
        era:clean(input.era || field('era') || 'Classic Era', 70), playerText:clean(input.playerText || '', 12000),
        intent:input.intent === 'update' ? 'update' : 'create', reasons:(Array.isArray(input.reasons)?input.reasons:[]).filter(value=>typeof value==='string').slice(0,10),
        attachmentFilename:clean(input.attachmentFilename,230),
        sources:(Array.isArray(input.sources) ? input.sources : []).slice(0, 30).map(source => ({ npc:clean(source.npc, 230), zone:clean(source.zone, 230), instance:['normal','raid'].includes(source.instance)?source.instance:'unknown',confirmed:source.confirmed === true, edited:source.edited === true, sourceEvidence:clean(source.sourceEvidence, 40) })), field };
}

export function extractContributionBlueprints(source, revision = null) {
    if (typeof source !== 'string' || source.length > 512 * 1024) throw new Error('The wiki blueprint source is too large or unavailable.');
    const result = { revision, entries:{} };
    // Blueprint pre blocks themselves contain wiki headings (Map, Dangers,
    // etc.). Only headings outside literal/code/comment regions delimit help.
    let outline = source;
    for (const [start,end] of protectedRanges(source).reverse()) outline = outline.slice(0,start)+outline.slice(start,end).replace(/[^\r\n]/g,' ')+outline.slice(end);
    const headings = [...outline.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*\r?$/gm)];
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i][2].trim();
        if (!/\bBlueprints?$/i.test(heading)) continue;
        const start = headings[i].index + headings[i][0].length;
        const end = headings.slice(i + 1).find(item => item[1].length <= headings[i][1].length)?.index ?? source.length;
        const pre = source.slice(start, end).match(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/i);
        if (!pre) continue;
        const text = pre[1].replace(/^\s*<nowiki>([\s\S]*?)<\/nowiki>\s*$/i, '$1').trim() + '\n';
        const key = /^Item Page Blueprint$/i.test(heading) ? 'item' : /^NPC Page Blueprint$/i.test(heading) ? 'npc' : /^Raid Encounter Blueprint$/i.test(heading) ? 'raid' : /^Zone Page Blueprint$/i.test(heading) ? 'zone' : /^City Page Blueprint$/i.test(heading) ? 'city' : /^Spell(?: Page)? Blueprints?$/i.test(heading) ? 'spell' : null;
        if (key) result.entries[key] = { heading, text };
    }
    return result;
}

export function buildContributionDraft(input, blueprints) {
    let candidate = normalizeContributionCandidate(input),proposalError='';
    if(candidate.kind==='item'){
        try{const proposals=proposeItemBaseReview(candidate);if(proposals)candidate=normalizeContributionCandidate({...candidate,...proposals});}
        catch(error){proposalError=error.message;}
    }
    const { field } = candidate;
    const type = candidate.kind === 'npc' && candidate.instance === 'raid' ? 'raid' : candidate.kind;
    const blueprint = blueprints?.entries?.[type];
    const warnings = [], blockers = proposalError?[proposalError]:[];
    if(candidate.kind==='npc'&&(isOwnedPetName(candidate.name)||isOwnedPetName(candidate.title))||candidate.sources.some(source=>source.confirmed&&isOwnedPetName(source.npc))||
        ['knownNPCs','notableNPCs','raidNotableNPCs'].some(key=>(Array.isArray(field(key))?field(key):[]).some(isOwnedPetName)))blockers.push('Player and monster pets cannot be contributed as monsters or drop sources.');
    if (!blueprint) blockers.push(`The current ${type} blueprint is unavailable.`);
    const expected = candidate.kind === 'item' ? /\{\{\s*Itempage\b/i : candidate.kind === 'npc' ? /\{\{\s*Namedmobpage\b/i : candidate.kind === 'spell' ? /\{\{\s*Spell(?:page|pagesmart)\b/i : /zoneTopTable/;
    if (blueprint && !expected.test(blueprint.text)) blockers.push('The live blueprint structure changed. Review it in the wiki before submitting.');
    let era = '';
    if (candidate.era) {
        if (!/^[A-Za-z][A-Za-z0-9 '&()-]{0,60}(?:Era)?$/.test(candidate.era)) blockers.push('Review the era template name.');
        else era = `{{${candidate.era}}}\n`;
    } else blockers.push('Select and confirm the applicable era template.');
    if (candidate.instance === 'unknown' && candidate.kind === 'npc') warnings.push('Normal or raid instance has not been confirmed.');
    const confirmedSources = candidate.sources.filter(source => source.confirmed && source.npc && source.zone);
    if (candidate.sources.some(source => !source.confirmed)) warnings.push('Unconfirmed drop-source relationships are excluded.');
    const categories = new Set();
    if (candidate.zone&&candidate.kind!=='zone') categories.add(contributionTitle(candidate.zone));
    let text;
    if (candidate.kind === 'item') {
        if(requiresTierZeroVerification(candidate))categories.add(TIER_ZERO_VERIFICATION_CATEGORY);
        let lines = Array.isArray(field('statLines')) ? field('statLines').map(value => literalWikiText(value)).filter(Boolean).slice(0, 60) :
            typeof field('statsblock') === 'string' ? field('statsblock').split(/\r?\n|<br\s*\/?>/i).map(value => literalWikiText(value)).filter(Boolean).slice(0, 60) : [];
        const recovery=validateItemBaseReview(candidate),upgraded=Number(candidate.fields.tier?.value)>0||candidate.fields.augmented?.value===true||candidate.fields.modified?.value===true||candidate.fields.augmentNames?.value?.length>0;
        if(upgraded&&!recovery.ok){lines=lines.filter(line=>!/^\s*(?:AC|HP|Mana|MP|END|Endurance|STR|STA|AGI|DEX|WIS|INT|CHA|Strength|Stamina|Agility|Dexterity|Wisdom|Intelligence|Charisma|SV\s+\w+|Weight|WT|DMG|Damage|Delay|Haste|Attack(?: Speed)?|\w+ Regen)\s*[:=]/i.test(line));warnings.push('Tiered numeric observations are omitted until base proposals are selected. Unknown item fields stay empty.');}
        if(candidate.baseRecovery&&!recovery.ok)blockers.push(recovery.reason);
        if(recovery.ok){
            lines=applyItemBaseReview(candidate,recovery.review).fields.statLines.value.map(literalWikiText);
            warnings.push('Base statistics are reviewed reverse-scaling inferences, not a base-item capture.',...recovery.warnings);
        }
        const icon = itemOptionalText(field('iconId'))===''?undefined:field('iconId');
        if (icon !== undefined && (!Number.isInteger(Number(icon)) || Number(icon) < 0 || Number(icon) > 1000000)) blockers.push('Confirm a valid existing icon ID.');
        if (icon === undefined) warnings.push('No verified wiki icon ID; the icon field stays empty.');
        for (const slot of Array.isArray(field('slots')) ? field('slots') : []) if (SLOT_CATEGORIES[String(slot).toUpperCase()]) categories.add(SLOT_CATEGORIES[String(slot).toUpperCase()]);
        const skills = { '1h blunt':'1H Blunt', '2h blunt':'2H Blunt', '1h slashing':'1H Slashing', '2h slashing':'2H Slashing', '1h piercing':'Piercing', piercing:'Piercing', '2h piercing':'2H Piercing', archery:'Archery', 'hand to hand':'Hand to Hand', 'bard instrument':'Bard Instrument' };
        for (const skill of Array.isArray(field('skills')) ? field('skills') : []) if (skills[String(skill).toLowerCase()]) categories.add(skills[String(skill).toLowerCase()]);
        for (const className of Array.isArray(field('classes')) ? field('classes') : []) {
            if (String(className).toUpperCase() === 'ALL') for (const value of Object.values(CLASS_NAMES)) categories.add(`${value} Equipment`);
            else if (CLASS_NAMES[String(className).toUpperCase()]) categories.add(`${CLASS_NAMES[String(className).toUpperCase()]} Equipment`);
            else if (Object.values(CLASS_NAMES).includes(className)) categories.add(`${className} Equipment`);
        }
        for (const source of confirmedSources) categories.add(contributionTitle(source.zone));
        const sourceRows=instance=>confirmedSources.filter(source=>(source.instance==='unknown'?candidate.instance:source.instance)==='raid'?instance==='raid':instance==='normal').map(source=>`${link(source.zone)}\n* ${link(source.npc)}`).join('\n\n');
        const normalDrops=sourceRows('normal'),raidDrops=sourceRows('raid'),drops=[normalDrops,raidDrops?`=== Raid Instance ===\n${raidDrops}`:''].filter(Boolean).join('\n\n');
        const effects=contributionItemEffects(candidate);
        const firstEffect=lines.findIndex(itemEffectLine);
        if(itemEffectWasCleared(candidate)){if(firstEffect>=0)lines.splice(firstEffect,1);}
        else if(effects.length&&itemOptionalText(field('effectName'))&&['effectName','effectType','effectCastTime','effectLevel'].some(key=>candidate.fields[key]?.edited)&&firstEffect>=0)lines[firstEffect]=itemEffectLineWikicode(effects[0]);
        lines=lines.filter(line=>itemOptionalText(line)&&!/^\s*[^:\r\n<>]{1,80}:\s*\?\s*$/.test(line));
        for(const effect of effects)if(!lines.some(line=>itemEffectLine(line)&&itemLineHasEffect(line,effect)))lines.push(itemEffectLineWikicode(effect));
        for(const key of ['classes','slots']){const value=itemChoiceStatLine(candidate,key);if(value===null)continue;const index=lines.findIndex(line=>itemChoiceLine(key,line));if(index>=0){if(value)lines[index]=value;else lines.splice(index,1);}else if(value)lines.push(value);}
        const tier=recovery.ok?recovery.review?.tier:Number(candidate.fields.tier?.value),recoveryNote=Number.isInteger(tier)&&tier>0&&tier<=10?`These stats are reverse calculated from a tier ${tier} item. Please confirm with a tier 0 item and remove this message`:'';
        lines=itemContributionWikiStatLines(lines);
        text = `${era}<onlyinclude>{{Itempage\n|itemname = ${candidate.title}\n|lucy_img_ID = ${icon === undefined ? '' : Number(icon)}\n|statsblock =\n${lines.join('<br>\n')}${lines.length?'<br>':''}\n|focus_effect = ${literalWikiText(itemOptionalText(field('focusEffect')))}\n|notes = ${[itemOptionalText(candidate.playerText),recoveryNote].filter(Boolean).join('\n\n')}\n|dropsfrom =\n${drops}\n}}</onlyinclude>\n`;
    } else if (candidate.kind === 'npc') {
        if (!field('location') || !/^\s*\(?\s*[-+]?\d+(?:\.\d+)?\s*[, ]+\s*[-+]?\d+(?:\.\d+)?\s*[, ]+\s*[-+]?\d+(?:\.\d+)?\s*\)?\s*$/.test(String(field('location')))) blockers.push('Enter the monster spawn location as Y, X, Z.');
        if (!candidate.playerText) warnings.push('The NPC description is empty; add player-written details when known.');
        const entries = [`imagefilename = ${candidate.attachmentFilename?literalWikiText(candidate.attachmentFilename):'?'}`, `name = ${candidate.title}`, `zone = ${candidate.zone ? link(candidate.zone) : '?'}`, `description = ${candidate.playerText||'?'}`];
        const npcFields = { race:'race', class:'class', level:'level', location:'location', respawn_time:'respawnTime', AC:'AC', HP:'HP', special:'special' };
        for (const [parameter, key] of Object.entries(npcFields)) entries.push(`${parameter} = ${literalWikiText(field(key)??'?')||'?'}`);
        const loot = reviewedTitles(candidate, 'knownLoot', 'NPC loot', warnings, blockers),lootList=kind=>loot.filter(title=>contributionLootKind(candidate,title)===kind).map(item=>`<li>${itemTransclusion(item)}</li>`),unique=lootList('unique'),common=lootList('common');
        if(loot.some(title=>!contributionLootKind(candidate,title)))blockers.push('Loot classification needs a complete cached wiki source count. Preview again before publishing.');
        entries.push(`known_loot = ${unique.length ? `<ul>\n${unique.join('\n')}\n</ul>` : '?'}`,`common_loot = ${common.length?`<ul>\n${common.join('\n')}\n</ul>`:'?'}`, 'factions = ?', 'opposing_factions = ?', 'related_quests = ?');
        if (candidate.instance === 'raid') categories.add('Raid Encounters');
        text = `${era}{{Namedmobpage\n\n| ${entries.join('\n\n| ')}\n\n}}\n`;
    } else if(candidate.kind==='spell') {
        const textValue=key=>literalWikiText(field(key)??'?'),values={spellname:candidate.title,spellicon:textValue('iconId'),description:literalWikiText(candidate.playerText)||'?',classes:Array.isArray(field('classes'))?field('classes').map(name=>`* ${link(name)} - Level ?`).join('\n'):textValue('classes'),items_with_effect:Array.isArray(field('itemsWithEffect'))?field('itemsWithEffect').map(name=>`* ${link(name)}`).join('\n'):'?',slots:textValue('effect'),skill:textValue('skill'),mana:textValue('mana'),range:textValue('range'),casting_time:textValue('castTime'),fizzle_time:textValue('fizzleTime'),recast_time:textValue('recastTime'),duration:textValue('duration'),target_type:textValue('targetType'),spell_type:textValue('spellType'),resist:textValue('resist'),other:textValue('other'),msg_cast_on_you:textValue('castOnYou'),msg_cast_on_other:textValue('castOnOther'),msg_wears_off:textValue('wearsOff'),where_to_obtain:textValue('whereToObtain')};
        text=fillContributionBlueprint(blueprint?.text||'{{Spellpage\n| name = ?\n| description = ?\n}}\n',values,'Spellpage');
        text=text.replace(/^\s*\{\{[^\n{}]*Era[^\n{}]*\}\}\s*\n?/i,'');
        text=era+text;categories.add('Spells');
    } else {
        categories.add('Zones');
        const whoName=field('whoName');
        if(!whoName)warnings.push('No verified /who zone name; that field remains Unknown.');
        const npcs = reviewedTitles(candidate, 'knownNPCs', 'zone population', warnings, blockers);
        const loot = reviewedTitles(candidate, 'knownLoot', 'zone loot', warnings, blockers);
        if(npcs.length&&field('notable')!==true)warnings.push('Ordinary zone population is not a Notable NPC list; review each monster’s Notable choice separately.');
        if(loot.some(title=>contributionLootKind(candidate,title)!=='common'))warnings.push('A new zone has no pre-existing Unique Items row; automatic Unique Items population was skipped.');
        if (!candidate.playerText) {
            if (npcs.length || loot.length) warnings.push('The zone introduction is empty; add player-written details when known.');
            else warnings.push('Unknown zone details are left as ?.');
        }
        if(candidate.intent==='update'){
            // Existing zone updates use the narrow patcher below. They do not
            // migrate an established article to the current creation layout.
            text=`${era}${candidate.playerText}\n\n{| class="zoneTopTable"\n! Name in /who\n| ${literalWikiText(whoName||'Unknown')}\n|}\n`;
        }else{
            const availability=field('raidAvailability');
            if(!['yes','no','unknown'].includes(availability))blockers.push('Answer whether this zone has a raid instance, or explicitly choose Unknown.');
            if(availability==='unknown')warnings.push('Raid-instance availability is explicitly Unknown; no raid section or raid-only facts are asserted.');
            const scalar=value=>typeof value==='string'||typeof value==='number'?literalWikiText(value).replace(/\r?\n/g,'<br>')||'?':'?';
            const prose=value=>typeof value==='string'&&value.trim()?literalWikiText(value).replace(/(^|\n)(=+)/g,(_match,line,marks)=>line+marks.replace(/=/g,'&#61;')):'?';
            const titles=(key,label)=>reviewedTitles(candidate,key,label,warnings,blockers).map(link).join('<br>\n')||'?';
            const values={ERA:era.trim(),ZONE_NAME:literalWikiText(candidate.title),OVERVIEW:prose(candidate.playerText),RAID_AVAILABILITY:{yes:'Yes',no:'No',unknown:'Unknown'}[availability]||'Unknown',DYNAMIC_ZONE_LIST:`{{Special:DynamicZoneList/${candidate.title}}}`};
            for(const [prefix,fieldPrefix]of [['',''],['RAID_','raid']]){
                for(const [token,key]of Object.entries(ZONE_OVERVIEW_TOKEN_FIELDS)){
                    const fieldKey=fieldPrefix?fieldPrefix+key[0].toUpperCase()+key.slice(1):key;
                    if(prefix&&availability!=='yes'){values[prefix+token]='?';continue;}
                    if(token==='NOTABLE_NPCS')values[prefix+token]=titles(fieldKey,prefix?'raid Notable NPCs':'Notable NPCs');
                    else if(['RELATED_QUESTS','ADJACENT_ZONES'].includes(token))values[prefix+token]=titles(fieldKey,token==='RELATED_QUESTS'?'related quests':'adjacent zones');
                    else if(token==='COMMON_LOOT')values[prefix+token]=prefix?'?':loot.filter(title=>contributionLootKind(candidate,title)==='common').map(itemTransclusion).join('<br>\n')||'?';
                    // Initial creation establishes the standard summary row,
                    // but does not turn observed loot into automatic Unique.
                    else if(token==='UNIQUE_ITEMS')values[prefix+token]='?';
                    else if(token==='MAP_IMAGE'){
                        const filename=field(fieldKey);
                        try{values[prefix+token]=typeof filename==='string'&&filename.trim()?`[[File:${safeZoneMapFilename(filename)}|thumb|right|600px|${literalWikiText(candidate.title+(prefix?' raid instance':'')+' map')}]]`:"''Map needed.''";}
                        catch(error){blockers.push(error.message);values[prefix+token]="''Map needed.''";}
                    }else values[prefix+token]=token==='MAP_NOTES'?prose(field(fieldKey)):scalar(field(fieldKey));
                }
            }
            values.RAID_OVERVIEW=availability==='yes'?prose(field('raidOverview')):'?';
            if(field('notable')===true&&npcs.length&&values.NOTABLE_NPCS==='?')values.NOTABLE_NPCS=npcs.map(link).join('<br>\n');
            try{text=fillZoneCreationBlueprint(blueprint?.text,{raidAvailability:availability,values});assertZoneCreationLayout(text,{raidAvailability:availability});}
            catch(error){blockers.push(error.message);text='';}
        }
        if (npcs.length || loot.length) warnings.push('Zone references do not add the zone category to those NPC or item pages; review their page membership separately.');
    }
    if(candidate.attachmentFilename&&candidate.kind!=='npc')text+=`\n[[File:${safeContributionFilename(candidate.attachmentFilename)}|thumb|${literalWikiText(input.attachment?.caption||candidate.title)}]]\n`;
    if (/\b(?:NPC_Name|ZONE_NAME|ZONE NAME|ITEM_NAME|Item Name|Describe the|Add a brief)\b/.test(text)) blockers.push('Replace all blueprint instructional placeholders.');
    if (/\{\{\s*(?:Special:|#|DISPLAYTITLE|DEFAULTSORT|subst:|safesubst:)|<\s*(?:script|iframe|object|embed)\b/i.test(candidate.playerText)) blockers.push('Remove unsupported executable or special-page markup from the contribution prose.');
    for(const match of activeContributionText(text).matchAll(/\[\[\s*Category\s*:\s*([^\]|]+)(?:\|[^\]]*)?\]\]/gi))for(const title of categories)if(contributionNameKey(match[1])===contributionNameKey(title))categories.delete(title);
    return { title:candidate.title, kind:candidate.kind, text:`${text}\n${[...categories].map(title=>title===TIER_ZERO_VERIFICATION_CATEGORY?TIER_ZERO_CATEGORY_MARKER+'\n'+category(title):category(title)).join('\n')}\n`, warnings, blockers, blueprintRevision:blueprints?.revision ?? null };
}

function distance(a, b) {
    let row = Array.from({ length:b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1] + 1, row[j] + 1, row[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); row = next; }
    return row[b.length];
}
export function findPotentialMatches(name, entries = [], limit = 12) {
    const key=contributionNameKey(name),ignore=new Set(['a','an','the','of','in','on','and']),tokens=new Set(key.split(/\W+/).filter(token=>token&&!ignore.has(token)));
    if(!key)return [];
    const candidates=new Map(),records=entries.slice(0,60000).filter(Boolean);
    const authoritative=new Set(records.filter(entry=>typeof entry==='object'&&Number.isInteger(entry.pageId)&&entry.pageId>0).map(entry=>contributionNameKey(entry.wikiTitle||entry.title||entry.name)));
    for(const entry of records){
        const title=typeof entry==='string'?entry:entry.wikiTitle||entry.title||entry.name||'',other=contributionNameKey(title);
        if(!other)continue;
        const pageId=typeof entry==='object'&&Number.isInteger(entry.pageId)&&entry.pageId>0?entry.pageId:null;
        if(!pageId&&authoritative.has(other))continue;
        const otherTokens=new Set(other.split(/\W+/).filter(token=>token&&!ignore.has(token))),overlap=[...tokens].filter(token=>otherTokens.has(token)).length/Math.max(1,tokens.size,otherTokens.size);
        const exact=key===other,near=Math.abs(key.length-other.length)<=Math.max(3,key.length*.25)&&(overlap>0||key.slice(0,3)===other.slice(0,3));
        const score=exact?1:Math.max(overlap*.8,near?1-distance(key,other)/Math.max(key.length,other.length,1):0);
        const identity=pageId?'page:'+pageId:'title:'+other,prior=candidates.get(identity),candidate={...(typeof entry==='object'?entry:{}),title,score,exact};
        if(!prior||candidate.score>prior.score||candidate.score===prior.score&&candidate.title===name)candidates.set(identity,candidate);
    }
    const matches=[...candidates.values()],hasExact=matches.some(match=>match.exact);
    return matches.filter(item=>hasExact?item.exact:item.score>=.62).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,Math.max(1,Math.min(30,limit)));
}

function protectedRanges(source) { return [...source.matchAll(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi)].map(match => [match.index, match.index+match[0].length]); }
export function contributionTemplates(source, name) {
    const ranges = protectedRanges(source), matches = [], regex = /\{\{\s*(?:Template\s*:\s*)?([A-Za-z][A-Za-z0-9_ ]*)\b/g;
    for (const match of source.matchAll(regex)) {
        if (match[1].trim().toLowerCase() !== name.toLowerCase() || ranges.some(([start,end]) => match.index >= start && match.index < end)) continue;
        let depth = 2, links = 0, index = match.index+2, end = -1, separators = [];
        for (; index < source.length; index++) {
            const range = ranges.find(([start]) => start === index); if (range) { index = range[1]-1; continue; }
            const char = source[index];
            if (char === '{') depth++;
            else if (char === '}') { depth--; if (depth === 0) { end=index+1; break; } }
            else if (source.slice(index,index+2) === '[[') { links++; index++; }
            else if (source.slice(index,index+2) === ']]') { links=Math.max(0,links-1); index++; }
            else if (char === '|' && depth === 2 && links === 0) separators.push(index);
        }
        if (end < 0) throw new Error('The existing wiki template is unbalanced; open the source editor.');
        const fields = separators.map((start,i) => { const finish=separators[i+1] ?? end-2, raw=source.slice(start+1,finish), equal=raw.indexOf('='); return equal < 0 ? null : { name:raw.slice(0,equal).trim(), start, end:finish, valueStart:start+1+equal+1, value:raw.slice(equal+1) }; }).filter(Boolean);
        matches.push({ start:match.index, end, fields });
    }
    return matches;
}

function activeContributionText(source){let outline=source;for(const [start,end]of protectedRanges(source).reverse())outline=outline.slice(0,start)+outline.slice(start,end).replace(/[^\r\n]/g,' ')+outline.slice(end);return outline;}
function removeTierZeroRecoveryNotes(source){
    let result=source;
    for(const match of tierZeroRecoveryNoteMatches(activeContributionText(source)).reverse())result=result.slice(0,match.index)+result.slice(match.index+match[0].length);
    return result;
}
function syncTierZeroVerificationCategory(source,{required=false,verified=false}={}){
    const key=contributionNameKey(TIER_ZERO_VERIFICATION_CATEGORY),active=activeContributionText(source);
    const escaped=TIER_ZERO_CATEGORY_MARKER.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const categoryName=TIER_ZERO_VERIFICATION_CATEGORY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const expression=new RegExp(escaped+'[ \\t]*(?:\\r?\\n)?[ \\t]*(\\[\\[Category:'+categoryName+'\\]\\])','gi');
    if(verified){
        // Preserve manually assigned categories and protected examples. Only
        // remove a membership emitted with this exact application marker.
        let text=source;
        for(const match of [...source.matchAll(expression)].reverse()){
            const categoryAt=match.index+match[0].indexOf(match[1]);
            if(active.slice(categoryAt,categoryAt+match[1].length)!==match[1])continue;
            text=text.slice(0,match.index)+text.slice(match.index+match[0].length);
        }
        return text;
    }
    // Older app versions emitted a differently capitalized category title.
    // Canonicalize only their marked membership, retaining manual/protected text.
    for(const match of [...source.matchAll(expression)].reverse()){
        const categoryAt=match.index+match[0].indexOf(match[1]);
        if(active.slice(categoryAt,categoryAt+match[1].length)!==match[1])continue;
        source=source.slice(0,categoryAt)+category(TIER_ZERO_VERIFICATION_CATEGORY)+source.slice(categoryAt+match[1].length);
    }
    const noted=contributionTemplates(source,'Itempage').some(template=>template.fields.some(field=>field.name.toLowerCase()==='notes'&&tierZeroRecoveryNoteMatches(activeContributionText(field.value)).length>0));
    if(!required&&!noted)return source;
    const present=[...active.matchAll(/\[\[\s*Category\s*:\s*([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].some(match=>contributionNameKey(match[1])===key);
    if(present)return source;
    const eol=source.includes('\r\n')?'\r\n':'\n';
    return source+eol+TIER_ZERO_CATEGORY_MARKER+eol+category(TIER_ZERO_VERIFICATION_CATEGORY)+eol;
}
function moveNpcLootFromOpposite(source,itemTitle,instance,lootKind){
    const template=contributionScopedTemplate(source,'Namedmobpage',instance),opposite=lootKind==='common'?'known_loot':'common_loot',fields=template.fields.filter(field=>field.name.toLowerCase()===opposite);
    if(fields.length>1)throw Error('The existing page has duplicate loot fields; reclassify this item in the wiki source editor.');
    const field=fields[0];if(!field)return source;
    const title=contributionTitle(itemTitle),escaped=title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'[ _]'),active=activeContributionText(field.value);
    const starts=[...active.matchAll(new RegExp(`(?:\\{\\{\\s*:\\s*${escaped}\\s*(?=[}|])|\\[\\[\\s*${escaped}\\s*(?=[\\]|]))`,'gi'))];
    if(!starts.length)return source;
    if(starts.length!==1)throw Error('This item has multiple entries in the opposite loot section. Reclassify them in the wiki source editor.');
    const reference=`(?:\\{\\{\\s*:\\s*${escaped}\\s*\\}\\}|\\[\\[\\s*${escaped}\\s*(?:\\|[^\\]\\r\\n{}<>]*)?\\]\\])`,annotation=`(?:\\s*(?:\\((?:rare|common|uncommon|very rare|always)\\)|<span(?:\\s+class\\s*=\\s*(?:"[A-Za-z0-9_ -]+"|'[A-Za-z0-9_ -]+'))?\\s*>\\s*\\((?:rare|common|uncommon|very rare|always)\\)\\s*</span>))?`,simple=new RegExp(`^\\s*${reference}${annotation}\\s*$`,'i');
    let start,end;const offset=starts[0].index,li=[...active.matchAll(/<li\b[^>]*>[\s\S]*?<\/li\s*>/gi)].find(match=>offset>=match.index&&offset<match.index+match[0].length);
    if(li){const body=li[0].replace(/^<li\b[^>]*>/i,'').replace(/<\/li\s*>$/i,'');if(/<li\b/i.test(body)||!simple.test(body))throw Error('This loot entry contains extra markup or prose. Reclassify it in the wiki source editor.');start=li.index;end=start+li[0].length;}
    else{start=active.lastIndexOf('\n',offset-1)+1;end=active.indexOf('\n',offset);if(end<0)end=active.length;else end++;const line=active.slice(start,end).replace(/^\s*[*#]\s*/,'');if(!simple.test(line))throw Error('This loot entry is not a standalone item. Reclassify it in the wiki source editor.');}
    // Masked comments are never deleted with their surrounding row. A human
    // must decide how to move an annotated/protected entry instead.
    if(protectedRanges(field.value).some(([a,b])=>a<end&&b>start))throw Error('This loot entry contains protected comments or text. Reclassify it in the wiki source editor.');
    const value=field.value.slice(0,start)+field.value.slice(end);
    return source.slice(0,field.valueStart)+value+source.slice(field.end);
}
export function contributionNpcLootKind(source,itemTitle,instance='normal'){
    const {template,scope}=contributionScopedTemplateInfo(source,'Namedmobpage',instance),title=contributionNameKey(contributionTitle(itemTitle)),occupied=[];
    for(const [parameter,kind]of [['known_loot','unique'],['common_loot','common']]){
        const fields=template.fields.filter(field=>field.name.toLowerCase()===parameter);if(fields.length>1)throw Error('The existing page has duplicate loot fields; use the wiki source editor.');
        if(fields.some(field=>contributionLootReferences(contributionLootScopeText(field.value,instance,scope||'normal')).some(name=>contributionNameKey(name)===title)))occupied.push(kind);
    }
    if(occupied.length>1)throw Error('The item is already in both NPC loot sections. Resolve its classification on the wiki.');
    return occupied[0]||null;
}
export function contributionNpcLootEntries(source){
    const entries=[];
    for(const [card,{template,scope}]of contributionTemplateScopes(source,'Namedmobpage').entries())for(const field of template.fields){
        const kind=field.name.toLowerCase()==='known_loot'?'unique':field.name.toLowerCase()==='common_loot'?'common':null;if(!kind)continue;
        // Existing unrelated loot may contain legitimate colon punctuation.
        // New references still pass contributionTitle at native preparation.
        for(const instance of ['normal','raid'])for(const title of contributionLootReferences(contributionLootScopeText(field.value,instance,scope||'normal'))){const itemTitle=clean(title,230).replace(/_/g,' ');if(itemTitle)entries.push({itemTitle,kind,card,instance});}
    }
    return entries;
}
export function contributionLootScopeText(value,instance,outer='normal'){
    const text=String(value).replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,' '),headings=[...text.matchAll(/^(={1,6})\s*([^\n]+?)\s*\1\s*$/gm)];
    let selected=outer,position=0,output='';const stack=[];
    for(const heading of headings){
        if(selected===instance)output+=text.slice(position,heading.index);
        while(stack.length&&stack.at(-1).level>=heading[1].length)stack.pop();
        stack.push({level:heading[1].length,label:heading[2].replace(/_/g,' ')});selected=outer;
        for(const section of stack){if(/\braid\s+(?:instance|zone)\b/i.test(section.label))selected='raid';else if(/\bnormal\s+(?:instance|zone)\b/i.test(section.label))selected='normal';}
        position=heading.index+heading[0].length;
    }
    if(selected===instance)output+=text.slice(position);return output;
}
// Source-only literal loot rows, shared by live coverage and manual/retry guards.
export function contributionLootReferences(value){
    let text=String(value).replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,' '),depth=0,start=0;const masks=[];
    for(let index=0;index<text.length-1;index++){
        const pair=text.slice(index,index+2);
        if(pair==='{{'){if(depth===0)start=index;depth++;index++;}
        else if(pair==='}}'&&depth){depth--;index++;if(!depth&&!/^\{\{\s*:\s*[^{}|\r\n]+\s*\}\}$/.test(text.slice(start,index+1)))masks.push([start,index+1]);}
    }
    if(depth)masks.push([start,text.length]);
    for(const [a,b]of masks.reverse())text=text.slice(0,a)+text.slice(a,b).replace(/[^\r\n]/g,' ')+text.slice(b);
    const names=[],lines=text.replace(/<li\b[^>]*>/gi,'\n* ').replace(/<\/(?:li|ul|ol)\s*>|<(?:ul|ol)\b[^>]*>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').split(/\r?\n/);
    for(let line of lines){
        line=line.replace(/^[\s*#']+/,'').replace(/^(?:always\s+)?drops?\s+(?:(?:one|two|three|four|five|six|[0-9]+)\s+)?(?:pieces?\s+of\s+)?(?=\[\[|\{\{)/i,'');
        let match;
        while((match=line.match(/^(?:\{\{\s*:\s*([^{}|\r\n]+)\s*\}\}|\[\[\s*([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\])/))){
            const title=(match[1]||match[2]).trim().replace(/^:\s*/,'').split('#')[0].trim();if(title&&!names.includes(title))names.push(title);
            if(names.length>=2000)return names;
            line=line.slice(match[0].length).replace(/^[\s']+/,'').replace(/^(?:[,;/&]|and\b|or\b)\s*/i,'').trimStart();
        }
    }
    return names;
}
function authoredLootSetTitles(value){return contributionLootReferences(value);}
export function contributionNpcLootSetCoverage(source,itemTitle,instance='normal',options={}){
    if(!options.pack)return null;
    const selected=options.card===undefined?contributionScopedTemplateInfo(source,'Namedmobpage',instance):contributionTemplateScopes(source,'Namedmobpage')[options.card],template=selected?.template;
    if(!template)return null;
    for(const [parameter,kind]of [['known_loot','unique'],['common_loot','common']]){
        const fields=template.fields.filter(field=>field.name.toLowerCase()===parameter);
        if(fields.length>1)throw Error('The existing page has duplicate loot fields; use the wiki source editor.');
        const text=contributionLootScopeText(fields[0]?.value||'',instance,selected.scope||'normal');
        const covered=lootSetCoverage(options.pack,itemTitle,authoredLootSetTitles(text),options);
        if(covered)return{...covered,kind};
    }
    return null;
}
export function contributionZoneLootSetCoverage(source,itemTitle,instance='normal',options={}){
    if(!options.pack||typeof source!=='string'||source.length>512*1024)return null;
    let scope=source;
    if(options.card===undefined){const range=zoneContributionRange(source,instance);scope=source.slice(range.start,range.end);}
    const tables=zoneContributionTables(scope),selected=options.card===undefined?(tables.length===1?tables[0]:null):tables[Number(String(options.card).replace(/^zone:/,''))];
    if(!selected)return null;
    const text=activeContributionText(scope.slice(selected.start,selected.end)),rows=[...text.matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)];
    for(const [index,row]of rows.entries()){
        const label=zoneRowLabel(row[1]),kind=label==='unique items'?'unique':label==='common loot'?'common':null;if(!kind)continue;
        const body=text.slice(row.index+row[0].length,rows[index+1]?.index??text.length),separator=body.search(/^[ \t]*\|(?:-|\})/m),cell=separator<0?body:body.slice(0,separator);
        const coverage=lootSetCoverage(options.pack,itemTitle,authoredLootSetTitles(cell),options);if(coverage)return{...coverage,kind};
    }
    return null;
}
export function contributionZoneLootEntries(source){
    if(typeof source!=='string'||source.length>512*1024)throw Error('The zone page is unavailable or too large.');
    const entries=[],active=activeContributionText(source);
    const zoneScopes=['normal','raid'].flatMap(instance=>{try{return [{instance,...zoneContributionRange(source,instance)}];}catch{return [];}});
    for(const [card,table]of zoneContributionTables(source).entries()){
        const scopes=zoneScopes.filter(range=>table.start>=range.start&&table.end<=range.end),instance=scopes.length===1?scopes[0].instance:'unknown';
        const text=active.slice(table.start,table.end),rows=[...text.matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)];
        for(const [index,row]of rows.entries()){
            const label=zoneRowLabel(row[1]),kind=label==='unique items'?'unique':label==='common loot'?'common':null;if(!kind)continue;
            const start=row.index+row[0].length,body=text.slice(start,rows[index+1]?.index??text.length),separator=body.search(/^[ \t]*\|(?:-|\})/m),cell=separator<0?body:body.slice(0,separator);
            for(const reference of [...cell.matchAll(/\{\{\s*:\s*([^{}|\r\n]+)(?:\|[^{}]*)?\}\}/g),...cell.matchAll(/\[\[\s*([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/g)]){
                const itemTitle=clean(reference[1],230).replace(/_/g,' ');if(itemTitle)entries.push({itemTitle,kind,card:'zone:'+card,sourceKind:'zone',instance});
            }
        }
    }
    return entries;
}
export function contributionNpcReferences(source){
    const result=[],active=activeContributionText(source);
    const rowLinks=value=>{
        let text=activeContributionText(value).replace(/<(ref|code)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ');
        const rows=[...text.matchAll(/^[ \t]*[*#]+[ \t]*\[\[([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/gm)];
        for(const row of text.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)){const reference=row[1].match(/^\s*\[\[([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/);if(reference)rows.push(reference);}
        return rows.map(row=>clean(row[1],230).replace(/_/g,' '));
    };
    for(const template of contributionTemplates(source,'Namedmobpage'))for(const field of template.fields)if(field.name.toLowerCase()==='name')result.push({kind:'npc-card',npcTitle:clean(field.value,230)});
    for(const template of contributionTemplates(source,'Itempage')){
        const itemTitle=clean(template.fields.find(field=>field.name.toLowerCase()==='itemname')?.value,230);
        for(const field of template.fields)if(field.name.toLowerCase()==='dropsfrom'){
            for(const npcTitle of rowLinks(field.value))result.push({kind:'drop-source',itemTitle,npcTitle});
            for(const row of contributionTemplates(field.value,'ItemWhereRow'))for(const value of row.fields)if(/^(?:npc|mob|monster)$/i.test(value.name))result.push({kind:'drop-source',itemTitle,npcTitle:clean(value.value,230).replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/,'$1')});
        }
    }
    const zoneScopes=['normal','raid'].flatMap(instance=>{try{return [{instance,...zoneContributionRange(source,instance)}];}catch{return [];}});
    for(const [card,table]of zoneContributionTables(source).entries()){
        const scopes=zoneScopes.filter(range=>table.start>=range.start&&table.end<=range.end),instance=scopes.length===1?scopes[0].instance:'unknown';
        const text=active.slice(table.start,table.end),rows=[...text.matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)];
        for(const [index,row]of rows.entries())if(zoneRowLabel(row[1])==='notable npcs'){
            const body=text.slice(row.index+row[0].length,rows[index+1]?.index??text.length),separator=body.search(/^[ \t]*\|(?:-|\})/m),cell=separator<0?body:body.slice(0,separator);
            for(const reference of cell.matchAll(/\[\[\s*([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/g))result.push({kind:'zone-population',npcTitle:clean(reference[1],230).replace(/_/g,' '),card:'zone:'+card,instance});
        }
    }
    return result;
}
export function patchContributionRelationship(source, { role, itemTitle, npcTitle, zoneTitle, instance, lootKind, notable, preserveExisting=false }, options={}) {
    if(['zone-population','zone-loot'].includes(role))return patchContributionZone(source,{role,itemTitle,npcTitle,zoneTitle,instance,lootKind,notable},options);
    if(role==='npc-zone')return patchContributionNpcZone(source,{zoneTitle,instance});
    if (typeof source !== 'string' || source.length > 512*1024) throw new Error('The existing page is too large or unavailable.');
    const originalSource=source;
    const name = role === 'npc-loot' ? 'Namedmobpage' : role === 'item-source' ? 'Itempage' : null;
    if (!name) throw new Error('Unsupported related-page change.');
    let preservedNpcLoot=false;
    if(role==='npc-loot'){
        const covered=contributionNpcLootSetCoverage(source,itemTitle,instance,options);
        if(covered)return{text:source,changed:false,warnings:[itemTitle+' is already covered by the listed '+covered.setTitle+' set; its authored loot section is preserved. No individual NPC loot entry was added.'],coveredBySet:covered.setTitle};
        if(lootKind===undefined||preserveExisting){
            // Adding the reciprocal source is not a request to reclassify an
            // established drop. Preserve either existing section byte-for-byte;
            // new associations require the trusted cached global-source count.
            const existing=contributionNpcLootKind(source,itemTitle,instance);
            preservedNpcLoot=Boolean(existing);if(existing)lootKind=existing;
        }
        if(!preservedNpcLoot){
            if(!['common','unique'].includes(lootKind))throw Error('Loot classification needs a complete cached wiki source count.');
            if(!preserveExisting)source=moveNpcLootFromOpposite(source,itemTitle,instance,lootKind);
        }
    }
    const template=contributionScopedTemplate(source,name,instance), parameter=role==='npc-loot'?lootKind==='common'?'common_loot':'known_loot':'dropsfrom';
    const fields=template.fields.filter(field=>field.name.toLowerCase()===parameter);
    if (fields.length>1) throw new Error('The existing page has duplicate template fields; use the wiki source editor.');
    const targetTitle=contributionTitle(role==='npc-loot'?itemTitle:npcTitle),fullCurrent=fields[0]?.value || '';let current=fullCurrent,instanceBlock=null;
    if(role==='item-source'){
        let active=current;for(const [start,end]of protectedRanges(current).reverse())active=active.slice(0,start)+active.slice(start,end).replace(/[^\r\n]/g,' ')+active.slice(end);
        const headings=[...active.matchAll(/^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*\r?$/gm)],raid=headings.filter(heading=>/\bRaid[ _]+(?:Instance|Zone)\b/i.test(heading[2]));
        if(raid.length){
            if(!['normal','raid'].includes(instance))throw Error('Choose the correct existing normal/raid source section in the wiki source editor.');
            if(instance==='raid'){
                if(raid.length!==1)throw Error('Choose the correct existing raid source section in the wiki source editor.');
                const heading=raid[0],end=headings.find(next=>next.index>heading.index&&next[1].length<=heading[1].length)?.index??current.length;
                instanceBlock={start:heading.index+heading[0].length,end};
            }else{
                const normals=headings.filter(heading=>/\bNormal[ _]+(?:Instance|Zone)\b/i.test(heading[2]));
                if(normals.length>1)throw Error('Choose the correct existing normal source section in the wiki source editor.');
                const heading=normals[0];instanceBlock=heading?{start:heading.index+heading[0].length,end:headings.find(next=>next.index>heading.index&&next[1].length<=heading[1].length)?.index??current.length}:{start:0,end:raid[0].index};
            }
            current=current.slice(instanceBlock.start,instanceBlock.end);
        }else if(instance==='raid'){instanceBlock={start:fullCurrent.length,end:fullCurrent.length,prefix:'\n=== Raid Instance ===\n'};current='';}
    }
    const escaped=targetTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'[ _]');
    let scope=activeContributionText(current),zoneBlock=null;
    if(role==='item-source'){
        let outline=current;for(const [start,end]of protectedRanges(current).reverse())outline=outline.slice(0,start)+outline.slice(start,end).replace(/[^\r\n]/g,' ')+outline.slice(end);
        if(/^={1,6}[ \t]*[^=\r\n]*\b(?:raid|normal)[ \t]+(?:instance|zone)\b[^=\r\n]*={1,6}[ \t]*$/im.test(outline))throw new Error('Choose the correct existing normal/raid source section in the wiki source editor.');
        const headings=[...outline.matchAll(/^[ \t]*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][ \t]*\r?$/gm)],zoneKey=contributionNameKey(zoneTitle),zone=headings.findIndex(heading=>contributionNameKey(heading[1])===zoneKey);
        if(headings.filter(heading=>contributionNameKey(heading[1])===zoneKey).length>1)throw new Error('The item has multiple source sections for this zone; choose the verified instance in the wiki source editor.');
        if(zone>=0){zoneBlock={start:headings[zone].index,end:headings[zone+1]?.index??current.length};scope=outline.slice(headings[zone].index+headings[zone][0].length,zoneBlock.end);}
        else scope='';
    }
    const already=preservedNpcLoot|| (role==='npc-loot'?new RegExp(`\\{\\{\\s*:\\s*${escaped}\\s*(?:[}|])`,'i').test(scope):new RegExp(`\\[\\[\\s*${escaped}\\s*(?:[\\]|])`,'i').test(scope));
    let text=source;
    if(!already){
        const addition=role==='npc-loot'?`<ul><li>{{:${targetTitle}}}</li></ul>`:`${link(zoneTitle)}\n* ${link(targetTitle)}`;
        const empty=/^\s*(?:\?|(?:\*\s*)?None|<ul>\s*<li>\s*(?:\{\{:\s*)?None(?:\}\})?\s*<\/li>\s*<\/ul>)?\s*$/i.test(current);
        let value;
        if(zoneBlock){
            const block=current.slice(zoneBlock.start,zoneBlock.end),trailing=block.match(/[ \t\r\n]*$/)[0],position=zoneBlock.end-trailing.length,eol=block.includes('\r\n')?'\r\n':'\n';
            value=current.slice(0,position)+`${eol}* ${link(targetTitle)}`+(trailing||eol)+current.slice(zoneBlock.end);
        }else value=`\n${empty?'':current.trim()+'\n\n'}${addition}\n\n`;
        if(instanceBlock)value=fullCurrent.slice(0,instanceBlock.start)+(instanceBlock.prefix||'')+value+fullCurrent.slice(instanceBlock.end);
        const field=fields[0];
        text=field?source.slice(0,field.valueStart)+value+source.slice(field.end):source.slice(0,template.end-2)+`| ${parameter} = ${value}`+source.slice(template.end-2);
    }
    if (zoneTitle) {
        const zone=contributionTitle(zoneTitle), key=contributionNameKey(zone);
        const present=[...activeContributionText(text).matchAll(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].some(match=>contributionNameKey(match[1])===key);
        if (!present) text+=`\n${category(zone)}\n`;
    }
    if(role==='item-source')text=syncTierZeroVerificationCategory(text);
    return { text, changed:text!==originalSource };
}

function contributionScopedTemplate(source,name,instance){
    return contributionScopedTemplateInfo(source,name,instance).template;
}
function contributionTemplateScopes(source,name){
    const all=contributionTemplates(source,name);let outline=source;
    // Headings inside protected source or a previous template argument do not
    // select an enclosing article section for another template.
    const ranges=[...protectedRanges(source),...all.map(template=>[template.start,template.end])];
    for(const [start,end]of ranges.sort((a,b)=>b[0]-a[0]))outline=outline.slice(0,start)+outline.slice(start,end).replace(/[^\r\n]/g,' ')+outline.slice(end);
    return all.map(template=>{
        const stack=[];for(const heading of outline.slice(0,template.start).matchAll(/^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*\r?$/gm)){while(stack.length&&stack.at(-1)[1].length>=heading[1].length)stack.pop();stack.push(heading);}
        const labels=new Set(stack.flatMap(heading=>/\bRaid[ _]+(?:Instance|Zone)\b/i.test(heading[2])?['raid']:/\bNormal[ _]+(?:Instance|Zone)\b/i.test(heading[2])?['normal']:[]));
        if(labels.size>1)throw Error('Choose the correct existing normal/raid template in the wiki source editor.');
        return {template,scope:[...labels][0]||null};
    });
}
export function contributionScopedTemplateInfo(source,name,instance){
    const scopes=contributionTemplateScopes(source,name);
    if(scopes.length===1&&!scopes[0].scope)return scopes[0];
    if(!['normal','raid'].includes(instance))throw Error('Choose the correct existing normal/raid template in the wiki source editor.');
    const scoped=scopes.filter(({scope})=>instance==='raid'?scope==='raid':scope!=='raid');
    if(scoped.length!==1)throw Error('Choose the correct existing normal/raid template in the wiki source editor.');return scoped[0];
}

// Read-only proof for reciprocal recovery. A backlink, prose mention or a
// reference in another zone/instance is insufficient to establish a drop.
// Unsupported or ambiguous layouts fail closed without blocking other pages.
export function contributionItemSourceMatches(source,{npcTitle,zoneTitle,instance}={}){
    if(typeof source!=='string'||source.length>512*1024||!['normal','raid'].includes(instance))return false;
    try{
        if(new TextEncoder().encode(source).byteLength>512*1024)return false;
        const npcKey=contributionNameKey(contributionTitle(npcTitle)),zoneKey=contributionNameKey(contributionTitle(zoneTitle));
        const {template,scope}=contributionScopedTemplateInfo(source,'Itempage',instance),fields=template.fields.filter(field=>field.name.toLowerCase()==='dropsfrom');
        if(fields.length!==1)return false;
        let current=activeContributionText(fields[0].value);
        // Nested examples and citations do not become direct source rows.
        const nested=[];let depth=0,start=0;
        for(let i=0;i<current.length-1;i++){
            const pair=current.slice(i,i+2);
            if(pair==='{{'){if(depth===0)start=i;depth++;i++;}
            else if(pair==='}}'&&depth){depth--;i++;if(depth===0)nested.push([start,i+1]);}
        }
        if(depth)return false;
        for(const [a,b]of nested.reverse())current=current.slice(0,a)+current.slice(a,b).replace(/[^\r\n]/g,' ')+current.slice(b);
        current=current.replace(/<(ref|code)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,value=>value.replace(/[^\r\n]/g,' '));
        const hasRaid=/^(={1,6})[ \t]*[^\r\n]*\bRaid[ _]+(?:Instance|Zone)\b[^\r\n]*\1[ \t]*\r?$/im.test(current);
        if(hasRaid){const range=zoneContributionRange(current,instance);current=current.slice(range.start,range.end);}
        else if(instance==='raid'){if(scope!=='raid')return false;}
        else {const range=zoneContributionRange(current,'normal');current=current.slice(range.start,range.end);}
        if(/^={1,6}[ \t]*[^=\r\n]*\b(?:raid|normal)[ \t]+(?:instance|zone)\b[^=\r\n]*={1,6}[ \t]*$/im.test(current))return false;
        const headings=[...current.matchAll(/^[ \t]*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][ \t]*\r?$/gm)],matching=headings.filter(heading=>contributionNameKey(heading[1])===zoneKey);
        if(matching.length!==1)return false;
        const heading=matching[0],index=headings.indexOf(heading),body=current.slice(heading.index+heading[0].length,headings[index+1]?.index??current.length);
        const references=[...body.matchAll(/^[ \t]*[*#]+[ \t]*\[\[([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/gm)];
        for(const row of body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)){
            if(/<li\b/i.test(row[1]))continue;
            const reference=row[1].match(/^\s*\[\[([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/);if(reference)references.push(reference);
        }
        return references.some(reference=>contributionNameKey(reference[1])===npcKey);
    }catch{return false;}
}
function patchTemplateFields(source,name,updates,instance='normal'){
    const template=contributionScopedTemplate(source,name,instance),edits=[],additions=[];
    for(const [parameter,value]of Object.entries(updates)){
        const fields=template.fields.filter(field=>field.name.toLowerCase()===parameter.toLowerCase());
        if(fields.length>1)throw Error('The existing page has duplicate template fields; use the wiki source editor.');
        if(fields.length)edits.push({start:fields[0].valueStart,end:fields[0].end,text:' '+value+'\n'});
        else additions.push(`| ${parameter} = ${value}\n`);
    }
    if(additions.length)edits.push({start:template.end-2,end:template.end-2,text:additions.join('')});
    for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
    return source;
}
function patchItemEffectBlock(source,candidate){
    const cleared=itemEffectWasCleared(candidate),effect=contributionItemEffects(candidate)[0];if(!cleared&&!effect)return source;
    if(cleared){const previous=contributionItemEffects({fields:{effects:candidate.fields.effects}})[0];return patchItemStatLine(source,line=>itemEffectLine(line)&&(/^\s*(?:(?:Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:\s*\?\s*$/i.test(line)||previous&&itemLineHasEffect(line,previous)),'');}
    return patchItemStatLine(source,itemEffectLine,itemEffectLineWikicode(effect));
}
function patchItemStatLine(source,matches,text){
    const parts=source.split(/(<br\s*\/?>|\r?\n)/i);
    for(let index=0;index<parts.length;index+=2)if(matches(activeContributionText(parts[index]))){
        if(protectedRanges(parts[index]).length)throw Error('The existing item line contains protected text. Update this field in the wiki source editor.');
        parts[index]=parts[index].match(/^\s*/)[0]+text+parts[index].match(/\s*$/)[0];return parts.join('');
    }
    if(!text)return source;
    const eol=source.includes('\r\n')?'\r\n':'\n',body=/^\s*\?\s*$/.test(source)?'':source.trimEnd();
    return body+(body?'<br>'+eol:'')+text+eol;
}
function zoneContributionRange(source,instance){
    const active=activeContributionText(source),headings=[...active.matchAll(/^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*\r?$/gm)],raids=headings.filter(heading=>/\bRaid[ _]+(?:Instance|Zone)\b/i.test(heading[2])),normals=headings.filter(heading=>/\bNormal[ _]+(?:Zone|Instance)\b/i.test(heading[2]));
    if(raids.length>1||normals.length>1)throw Error('Choose the correct existing normal/raid zone section in the wiki source editor.');
    if(instance==='raid'){
        if(!raids.length)throw Error('The zone has no Raid Instance section. Add its reviewed raid section in the wiki source editor first.');
        const heading=raids[0];return {start:heading.index+heading[0].length,end:headings.find(next=>next.index>heading.index&&next[1].length<=heading[1].length)?.index??source.length};
    }
    if(!['normal','raid'].includes(instance)&&raids.length)throw Error('Choose the correct existing normal/raid zone section in the wiki source editor.');
    const heading=normals[0];return heading?{start:heading.index+heading[0].length,end:headings.find(next=>next.index>heading.index&&next[1].length<=heading[1].length)?.index??source.length}:{start:0,end:raids[0]?.index??source.length};
}
function zoneContributionTables(source){
    const active=activeContributionText(source),markers=[...active.matchAll(/^[ \t]*(\{\|[^\r\n]*|\|\})[^\r\n]*\r?$/gm)],tables=[],stack=[];
    for(const marker of markers){if(marker[1].startsWith('{|'))stack.push(marker);else if(stack.length){const start=stack.pop();if(/\bzoneTopTable\b/.test(start[0]))tables.push({start:start.index,end:marker.index+marker[0].length,close:marker.index});}}
    if(stack.length)throw Error('The zone table is unbalanced. Use the wiki source editor.');
    return tables.sort((a,b)=>a.start-b.start);
}
const zoneRowLabel=value=>contributionNameKey(String(value).replace(/'{2,}/g,'').replace(/:[ \t]*$/,'').trim());
export function assertZoneCreationLayout(source,{raidAvailability,mapFiles}={}){
    if(typeof source!=='string'||source.length>512*1024||!['yes','no','unknown'].includes(raidAvailability))throw Error('Prepare this new zone again with the unified blueprint and an explicit raid-instance answer.');
    const active=activeContributionText(source),headings=[...active.matchAll(/^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*\r?$/gm)],raids=headings.filter(row=>/\bRaid[ _]+(?:Instance|Zone)\b/i.test(row[2]));
    if(raidAvailability==='yes'?(raids.length!==1||raids[0][1]!=='='||raids[0][2]!=='Raid Instance'):raids.length!==0)throw Error('Keep exactly the confirmed Raid Instance section, separate from the normal overview.');
    if(/@@[A-Z][A-Z0-9_]*@@/.test(source))throw Error('Replace all unresolved zone blueprint tokens.');
    const required=['level of monsters','minimum player level','types of monsters','notable npcs','common loot','unique items','related quests','adjacent zones','name in /who','zone spawn timer','succor/evacuate','zem value'];
    for(const instance of raidAvailability==='yes'?['normal','raid']:['normal']){
        const range=zoneContributionRange(source,instance),scope=source.slice(range.start,range.end),tables=zoneContributionTables(scope);
        if(tables.length!==1)throw Error('Keep one complete zone overview table for each included instance.');
        const tableText=activeContributionText(scope.slice(tables[0].start,tables[0].end)),rows=[...tableText.matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)],labelFor=row=>zoneRowLabel(row[1].replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_match,target,label)=>label||target)),labels=rows.map(labelFor);
        if(required.some(label=>labels.filter(value=>value===label).length!==1)||instance==='normal'&&labels.filter(value=>value==='raid instance').length!==1)throw Error('Keep the standard zone overview rows, including Notable NPCs, Unique Items and raid availability.');
        if(instance==='normal'){const row=rows.find(row=>labelFor(row)==='raid instance'),value=tableText.slice(row.index+row[0].length).split(/\r?\n/)[0].trim();if(value!=={yes:'Yes',no:'No',unknown:'Unknown'}[raidAvailability])throw Error('The zone overview must retain the reviewed raid-instance answer.');}
        const maps=[...activeContributionText(scope).matchAll(/^==[ \t]*(Map|Raid Map)[ \t]*==[ \t]*\r?$/gm)];
        if(maps.length!==1||maps[0][1]!== (instance==='raid'?'Raid Map':'Map'))throw Error('Keep the Map section for each included instance, even when the map is a placeholder.');
        if(tables[0].end>maps[0].index)throw Error('Keep each zone overview before its Map section.');
        if(mapFiles){
            const start=maps[0].index+maps[0][0].length,rest=activeContributionText(scope).slice(start),end=rest.search(/^={1,2}[^=].*?={1,2}[ \t]*\r?$/m),mapText=rest.slice(0,end<0?rest.length:end),images=[...mapText.matchAll(/\[\[\s*(?:File|Image)\s*:\s*([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].map(row=>safeZoneMapFilename(row[1].trim()));
            if(mapFiles[instance]?images.length!==1||images[0]!==mapFiles[instance]:images.length!==0)throw Error('Map images must match the reviewed map fields. Change those fields and prepare a fresh Preview.');
        }
    }
    if([...active.matchAll(/\[\[\s*Category\s*:\s*Zones\s*\]\]/gi)].length!==1)throw Error('Keep the Zones category so the new zone can populate its normal dynamic list.');
    return true;
}
export function contributionZoneHasLootRow(source,kind='unique',options={}){
    let scope=source;if(options.card===undefined){const range=zoneContributionRange(source,options.instance||'normal');scope=source.slice(range.start,range.end);}
    const tables=zoneContributionTables(scope),table=options.card===undefined?(tables.length===1?tables[0]:null):tables[Number(String(options.card).replace(/^zone:/,''))];
    if(!table)return false;const label=kind==='common'?'common loot':'unique items';
    return [...activeContributionText(scope.slice(table.start,table.end)).matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)].filter(row=>zoneRowLabel(row[1])===label).length===1;
}
export function contributionZoneLootScopeInfo(source,kind='unique',{instance='normal'}={}){
    const range=zoneContributionRange(source,instance),scope=source.slice(range.start,range.end),tables=zoneContributionTables(scope);
    if(tables.length!==1)return null;
    const table=tables[0],text=scope.slice(table.start,table.end),label=kind==='common'?'common loot':'unique items',rows=[...activeContributionText(text).matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)].filter(row=>zoneRowLabel(row[1])===label);
    if(rows.length!==1)return null;
    const start=rows[0].index+rows[0][0].length,offset=activeContributionText(text.slice(start)).search(/^[ \t]*\|(?:-|\})[^\r\n]*\r?$/m);
    return offset<0?null:{instance,kind,value:text.slice(start,start+offset)};
}
export function contributionZoneUsesDynamicList(source,zoneTitle,instance='normal',options={}){
    if(instance!=='normal')return false;const range=zoneContributionRange(source,instance),scope=activeContributionText(source.slice(range.start,range.end));
    const identity=title=>{const resolved=options.resolver?.resolve('zone',title);return contributionNameKey(resolved?.canonicalTitle||title);};
    return [...scope.matchAll(/\{\{[ \t]*Special[ \t]*:[ \t]*DynamicZoneList\/([^{}|\r\n]+)[ \t]*\}\}/gi)].some(match=>identity(match[1])===identity(zoneTitle));
}
const ITEM_STAT_KEYS=new Set(['AC','HP','MANA','MP','END','ENDURANCE','STR','STA','AGI','DEX','INT','WIS','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_DISEASE','SV_POISON','SV_CORRUPTION','HASTE','ATK','ATTACK','DMG','DAMAGE','BACKSTAB','BACKSTAB_DMG','HP_REGEN','MANA_REGEN','END_REGEN']);
export function contributionItemHasStats(pack,title,source=''){
    const key=contributionNameKey(title),records=(Array.isArray(pack?.items)?pack.items:[]).filter(item=>[item.wikiTitle,item.title,item.name,...(Array.isArray(item.aliases)?item.aliases:[])].some(name=>contributionNameKey(name)===key));
    if(records.some(record=>Object.entries(record.stats||{}).some(([name,value])=>ITEM_STAT_KEYS.has(name.toUpperCase())&&typeof value==='number'&&Number.isFinite(value)&&value!==0)))return true;
    if(typeof source!=='string'||source.length>512*1024)return false;
    const stats=contributionTemplates(source,'Itempage').flatMap(template=>template.fields.filter(field=>field.name.toLowerCase()==='statsblock').map(field=>activeContributionText(field.value))).join('\n');
    // Weight, size, class restrictions, delay and range alone are not gear stats.
    return /(?:^|<br\s*\/?>|\r?\n|\s)(?:AC|HP|Mana|MP|End(?:urance)?|STR|STA|AGI|DEX|INT|WIS|CHA|SV\s*(?:Magic|Fire|Cold|Disease|Poison|Corruption|Void)|Haste|ATK|Attack|(?:Base\s*)?DMG|Damage|Backstab(?:\s*DMG)?|(?:HP|Mana|End)\s*Regen)\s*:\s*[+-]?(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9])/i.test(stats);
}
export function patchContributionNpcZone(source,{zoneTitle,instance='normal'}={}){
    const zone=contributionTitle(zoneTitle),template=contributionScopedTemplate(source,'Namedmobpage',instance),fields=template.fields.filter(field=>field.name.toLowerCase()==='zone');
    if(fields.length>1)throw Error('The monster has duplicate zone fields. Use the wiki source editor.');
    const categorized=[...activeContributionText(source).matchAll(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].some(match=>contributionNameKey(match[1])===contributionNameKey(zone));
    if(instance==='normal'&&categorized)return{text:source,changed:false,warnings:[]};
    const field=fields[0],current=field?.value||'',active=activeContributionText(current),known=/^\s*Various\s*$/i.test(active)||contributionReferencePresent(current,zone,'npc')||contributionNameKey(active)===contributionNameKey(zone);let text=source;
    if(!known){const eol=text.includes('\r\n')?'\r\n':'\n',empty=/^\s*(?:\?|None|Unknown)?\s*$/i.test(active);let preserved=current;if(empty)for(const match of [...active.matchAll(/\?|\b(?:None|Unknown)\b/gi)].reverse())preserved=preserved.slice(0,match.index)+preserved.slice(match.index+match[0].length);const value=empty?preserved.trimEnd()+' '+link(zone)+eol:current.trimEnd()+'<br>'+eol+link(zone)+eol;text=field?text.slice(0,field.valueStart)+value+text.slice(field.end):text.slice(0,template.end-2)+'| zone = '+value+text.slice(template.end-2);}
    const present=[...activeContributionText(text).matchAll(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].some(match=>contributionNameKey(match[1])===contributionNameKey(zone));if(!present)text+='\n'+category(zone)+'\n';
    return{text,changed:text!==source,warnings:[]};
}
function contributionReferencePresent(source,title,kind){
    const key=contributionNameKey(title),expression=kind==='npc'?/\[\[\s*([^\]|]+)(?:\|[^\]]*)?\]\]/g:/\{\{\s*:\s*([^}|]+)(?:\|[^}]*)?\}\}/g;
    return [...activeContributionText(source).matchAll(expression)].some(match=>contributionNameKey(match[1])===key);
}
export function patchContributionZone(source,{role,itemTitle,npcTitle,zoneTitle,instance='normal',lootKind,notable}={},options={}){
    if(typeof source!=='string'||source.length>512*1024)throw Error('The existing zone page is unavailable or too large.');
    if(!['zone-population','zone-loot'].includes(role))throw Error('Choose zone population or zone loot.');
    const title=contributionTitle(role==='zone-population'?npcTitle:itemTitle),range=zoneContributionRange(source,instance),scope=source.slice(range.start,range.end),kind=role==='zone-population'?'npc':'item';
    if(role==='zone-loot'){
        const covered=contributionZoneLootSetCoverage(source,title,instance,options);
        if(covered)return{text:source,changed:false,warnings:[title+' is already covered by the listed '+covered.setTitle+' set in this zone instance; its authored loot row is preserved.'],coveredBySet:covered.setTitle};
    }
    if(role==='zone-loot'&&contributionZoneLootEntries(scope).some(entry=>contributionNameKey(entry.itemTitle)===contributionNameKey(title)))return {text:source,changed:false};
    if(role==='zone-population'&&notable!==true)return {text:source,changed:false,warnings:['Normal monsters use the NPC page’s zone category for DynamicZoneList. Only a reviewed Notable choice adds this summary entry.']};
    if(role==='zone-loot'&&!['common','unique'].includes(lootKind))throw Error('Loot classification needs a complete cached wiki source count.');
    if(role==='zone-loot'&&lootKind==='unique'&&!contributionZoneHasLootRow(source,'unique',{instance}))return {text:source,changed:false,warnings:['This zone instance has no unambiguous Unique Items row; automatic population was skipped.']};
    const label=kind==='npc'?'Notable NPCs':lootKind==='common'?'Common Loot':'Unique Items',token=kind==='npc'?link(title):itemTransclusion(title),tables=zoneContributionTables(scope),eol=source.includes('\r\n')?'\r\n':'\n';
    if(tables.length!==1)throw Error('Select the zone’s existing '+(instance==='raid'?'raid':'normal')+' summary table in the wiki source editor; no new layout was appended.');
    const table=tables[0],tableText=scope.slice(table.start,table.end),outline=activeContributionText(tableText),rows=[...outline.matchAll(/^![ \t]*([^\r\n]+)\r?\n\|[ \t]*/gm)],matching=rows.filter(row=>zoneRowLabel(row[1])===zoneRowLabel(label));
    if(matching.length>1)throw Error('The zone has duplicate '+label+' rows. Use the wiki source editor.');
    if(role==='zone-loot'&&lootKind==='unique'){
        if(!matching.length)return {text:source,changed:false,warnings:['This zone instance has no Unique Items row; automatic population was skipped.']};
        if(options.itemStats?.[title]!==true&&!contributionItemHasStats(options.pack,title))return {text:source,changed:false,warnings:[title+' has no verified item statistics; its zone Unique Items entry was skipped.']};
    }
    let changed;
    if(matching.length){
        const row=matching[0],start=table.start+row.index+row[0].length,after=scope.slice(start,table.end),end=start+(activeContributionText(after).search(/^[ \t]*\|(?:-|\})[^\r\n]*\r?$/m));
        if(end<start)throw Error('The zone summary row is not a standalone table cell. Use the wiki source editor.');
        if(contributionReferencePresent(scope.slice(start,end),title,kind))return {text:source,changed:false};
        const current=scope.slice(start,end),active=activeContributionText(current),placeholder=/^\s*(?:\?|None|Unknown|n\/?a)?\s*$/i.test(active),trailing=current.match(/[ \t\r\n]*$/)[0],position=end-trailing.length;
        if(placeholder){let cleaned=current;for(const match of [...active.matchAll(/\?|\b(?:None|Unknown|n\/?a)\b/gi)].reverse())cleaned=cleaned.slice(0,match.index)+cleaned.slice(match.index+match[0].length);changed=scope.slice(0,start)+cleaned.trimEnd()+token+eol+scope.slice(end);}
        else if(/<\/ul\s*>\s*$/i.test(active)&&!protectedRanges(current).some(([a,b])=>a<=active.toLowerCase().lastIndexOf('</ul')&&b>active.toLowerCase().lastIndexOf('</ul'))){const match=[...active.matchAll(/<\/ul\s*>/gi)].at(-1),at=start+match.index;changed=scope.slice(0,at)+'<li>'+token+'</li>'+scope.slice(at);}
        else {const separator=/^\s*[*#]/m.test(active)?eol+'* ':'<br>'+eol;changed=scope.slice(0,position)+separator+token+(trailing||eol)+scope.slice(end);}
    }else{changed=scope.slice(0,table.close)+(scope.slice(0,table.close).endsWith(eol)?'':eol)+'|-'+eol+'! '+label+eol+'| '+token+eol+scope.slice(table.close);}
    const text=source.slice(0,range.start)+changed+source.slice(range.end);return {text,changed:text!==source};
}

export function patchContributionPrimary(source,input,options={}){
    if(typeof source!=='string'||source.length>512*1024)throw Error('The existing page is unavailable or too large.');
    const candidate=normalizeContributionCandidate(input),warnings=[],targeted=candidate.reasons.some(reason=>['missing-source','missing-population','tier0-verification'].includes(reason));let text=source;
    if(candidate.kind==='npc'&&(isOwnedPetName(candidate.name)||isOwnedPetName(candidate.title))||candidate.sources.some(source=>source.confirmed&&isOwnedPetName(source.npc))||(Array.isArray(candidate.field('knownNPCs'))?candidate.field('knownNPCs'):[]).some(isOwnedPetName))throw Error('Player and monster pets cannot be contributed as monsters or drop sources.');
    if(candidate.kind==='item'){
        for(const entry of candidate.sources.filter(source=>source.confirmed&&source.npc&&source.zone&&(!targeted||candidate.reasons.includes('missing-source')||source.edited)))text=patchContributionRelationship(text,{role:'item-source',itemTitle:candidate.title,npcTitle:entry.npc,zoneTitle:entry.zone,instance:entry.instance==='unknown'?candidate.instance:entry.instance}).text;
        const updates={},accepted=validateTierZeroVerification(candidate),verification=candidate.reasons.includes('tier0-verification')||accepted.ok;
        if(verification){
            if(!accepted.ok)throw Error(accepted.reason);
            const stats=candidate.field('statLines');if(!Array.isArray(stats)||!stats.length)throw Error('Provide the tier 0 item statistics to confirm this page.');
            const lines=itemContributionWikiStatLines(stats.slice(0,60).map(literalWikiText));
            updates.statsblock=lines.join('<br>\n')+(lines.length?'<br>':'');
            const templates=contributionTemplates(text,'Itempage');if(templates.length!==1)throw Error('Select the existing item template on the wiki.');
            const notes=templates[0].fields.filter(field=>field.name.toLowerCase()==='notes');if(notes.length>1)throw Error('The item has duplicate notes fields.');
            if(notes.length)updates.notes=removeTierZeroRecoveryNotes(notes[0].value).trim();
        }
        const updateStats=transform=>{const template=contributionScopedTemplate(text,'Itempage',candidate.instance),fields=template.fields.filter(field=>field.name.toLowerCase()==='statsblock');if(fields.length>1)throw Error('The item has duplicate statistic fields. Update this field in the wiki source editor.');updates.statsblock=transform(updates.statsblock??fields[0]?.value??'').trim();};
        if(itemEffectWasCleared(candidate)||itemOptionalText(candidate.field('effectName'))&&['effectName','effectType','effectCastTime','effectLevel'].some(key=>candidate.fields[key]?.edited)){
            updateStats(value=>patchItemEffectBlock(value,candidate));
        }
        for(const key of ['classes','slots'])if(candidate.fields[key]?.edited){const line=itemChoiceStatLine(candidate,key);if(line!==null)updateStats(value=>patchItemStatLine(value,line=>itemChoiceLine(key,line),line));}
        if(candidate.fields.focusEffect?.edited&&(candidate.field('focusEffect')!==undefined||!itemOptionalText(candidate.fields.focusEffect.value)))updates.focus_effect=literalWikiText(itemOptionalText(candidate.field('focusEffect')));
        if(candidate.fields.iconId?.edited&&(candidate.field('iconId')!==undefined||!itemOptionalText(candidate.fields.iconId.value))){if(!itemOptionalText(candidate.fields.iconId.value))updates.lucy_img_ID='';else{const icon=Number(candidate.field('iconId'));if(!Number.isInteger(icon)||icon<0||icon>1000000)throw Error('Choose a valid wiki icon.');updates.lucy_img_ID=String(icon);}}
        if(Object.keys(updates).length)text=patchTemplateFields(text,'Itempage',updates,candidate.instance);
        text=syncTierZeroVerificationCategory(text,{required:Boolean(candidate.baseRecovery)&&requiresTierZeroVerification(candidate),verified:accepted.ok});
    }else if(candidate.kind==='npc'){
        const updates={},mapping={location:'location',level:'level',race:'race',class:'class',respawnTime:'respawn_time',AC:'AC',HP:'HP',special:'special'};
        for(const [key,parameter]of Object.entries(mapping))if(candidate.fields[key]?.edited&&candidate.field(key)!==undefined)updates[parameter]=literalWikiText(candidate.field(key))||'?';
        if(candidate.attachmentFilename)updates.imagefilename=safeContributionFilename(candidate.attachmentFilename);
        if(Object.keys(updates).length)text=patchTemplateFields(text,'Namedmobpage',updates,candidate.instance);
        if(candidate.reasons.includes('missing-population')&&candidate.zone)text=patchContributionNpcZone(text,{zoneTitle:candidate.zone,instance:candidate.instance}).text;
        if(!targeted||candidate.reasons.includes('missing-source')||candidate.fields.knownLoot?.edited)for(const title of Array.isArray(candidate.field('knownLoot'))?candidate.field('knownLoot'):[]){const patch=patchContributionRelationship(text,{role:'npc-loot',itemTitle:title,npcTitle:candidate.title,zoneTitle:candidate.zone,instance:candidate.instance,lootKind:contributionLootKind(candidate,title),preserveExisting:true},options);text=patch.text;warnings.push(...patch.warnings||[]);}
    }else if(candidate.kind==='zone'){
        if(!targeted||candidate.reasons.includes('missing-population')||candidate.fields.knownNPCs?.edited)for(const title of Array.isArray(candidate.field('knownNPCs'))?candidate.field('knownNPCs'):[])text=patchContributionZone(text,{role:'zone-population',npcTitle:title,instance:candidate.instance}).text;
        if(!targeted||candidate.reasons.includes('missing-source')||candidate.fields.knownLoot?.edited)for(const title of Array.isArray(candidate.field('knownLoot'))?candidate.field('knownLoot'):[]){const patch=patchContributionZone(text,{role:'zone-loot',itemTitle:title,instance:candidate.instance,lootKind:contributionLootKind(candidate,title)},options);text=patch.text;warnings.push(...patch.warnings||[]);}
    }else throw Error('Existing spell pages must be edited in the wiki source editor.');
    if(candidate.attachmentFilename&&candidate.kind!=='npc'){
        const filename=safeContributionFilename(candidate.attachmentFilename);if(!text.includes(`[[File:${filename}`))text+=`\n[[File:${filename}|thumb|${literalWikiText(input.attachment?.caption||candidate.title)}]]\n`;
    }
    return {text,changed:text!==source,warnings,blockers:[],title:candidate.title,kind:candidate.kind};
}
