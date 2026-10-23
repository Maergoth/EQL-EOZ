// Pure contribution preparation. OCR observations are suggestions; only reviewed
// fields enter wikicode. No network, account state, or narrative generation.
import { validateItemBaseReview } from './item-base-review.js';
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const TYPES = new Set(['item', 'npc', 'zone']);
const CLASS_NAMES = { BER:'Berserker', BRD:'Bard', BST:'Beastlord', CLR:'Cleric', DRU:'Druid', ENC:'Enchanter', MAG:'Magician', MNK:'Monk', NEC:'Necromancer', PAL:'Paladin', RNG:'Ranger', ROG:'Rogue', SHM:'Shaman', SHD:'Shadow Knight', WAR:'Warrior', WIZ:'Wizard' };
const SLOT_CATEGORIES = { PRIMARY:'Primary', SECONDARY:'Secondary', RANGE:'Range', AMMO:'Ammo', ARMS:'Arms', BACK:'Back', CHEST:'Chest', EAR:'Ear', FACE:'Face', FEET:'Feet', FINGER:'Fingers', FINGERS:'Fingers', HANDS:'Hands', HEAD:'Head', LEGS:'Legs', NECK:'Neck', SHOULDERS:'Shoulders', WAIST:'Waist', WRIST:'Wrist' };
const clean = (value, max = 4000) => String(value ?? '').replace(CONTROL, ' ').trim().slice(0, max);
export const contributionNameKey = value => clean(value, 240).normalize('NFKC').replace(/_/g, ' ').replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').toLowerCase();
export function contributionTitle(value) {
    if (/[\r\n\t]/.test(String(value ?? ''))) throw new Error('Enter a single-line article title.');
    const title = clean(value, 240).replace(/_/g, ' ').replace(/\s+/g, ' ');
    if (!title || /[\[\]{}<>|#\r\n:]/.test(title) || title.startsWith('.') || title.length > 230) throw new Error('Enter an article title without wiki markup or a namespace.');
    return title;
}
export const literalWikiText = value => clean(value, 16000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
const link = title => `[[${contributionTitle(title)}]]`;
const category = title => `[[Category:${contributionTitle(title)}]]`;

export function normalizeContributionCandidate(input = {}) {
    if (!TYPES.has(input.kind)) throw new Error('Choose item, npc or zone.');
    const name = contributionTitle(input.name || input.observedName || input.title);
    const fields = {};
    for (const [key, raw] of Object.entries(input.fields || {}).slice(0, 80)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)) continue;
        const wrapped = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw, 'value');
        fields[key] = { value:wrapped ? raw.value : raw, confirmed:wrapped ? raw.confirmed === true : (input.confirmedFields || []).includes(key) };
    }
    const field = key => fields[key]?.confirmed ? fields[key].value : undefined;
    const rawRecovery=input.baseRecovery,baseRecovery=rawRecovery&&typeof rawRecovery==='object'?{schemaVersion:rawRecovery.schemaVersion,sourceFingerprint:clean(rawRecovery.sourceFingerprint,16000),tier:rawRecovery.tier,fraction:rawRecovery.fraction,modifiersExcluded:rawRecovery.modifiersExcluded===true,reviewed:rawRecovery.reviewed===true,choices:Object.fromEntries(Object.entries(rawRecovery.choices||{}).slice(0,40))}:null;
    return { id:clean(input.id || '', 100), kind:input.kind, name, title:contributionTitle(input.title || name), fields,baseRecovery,
        zone:clean(typeof input.zone === 'object' ? input.zone.title : input.zone || field('zone'), 230),
        instance:['normal','raid'].includes(input.instance || input.zone?.instance) ? input.instance || input.zone.instance : 'unknown',
        era:clean(input.era || field('era'), 70), playerText:clean(input.playerText || '', 12000),
        sources:(Array.isArray(input.sources) ? input.sources : []).slice(0, 30).map(source => ({ npc:clean(source.npc, 230), zone:clean(source.zone, 230), confirmed:source.confirmed === true, sourceEvidence:clean(source.sourceEvidence, 40) })), field };
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
        const key = /^Item Page Blueprint$/i.test(heading) ? 'item' : /^NPC Page Blueprint$/i.test(heading) ? 'npc' : /^Raid Encounter Blueprint$/i.test(heading) ? 'raid' : /^Zone Page Blueprint$/i.test(heading) ? 'zone' : /^City Page Blueprint$/i.test(heading) ? 'city' : null;
        if (key) result.entries[key] = { heading, text };
    }
    return result;
}

export function buildContributionDraft(input, blueprints) {
    const candidate = normalizeContributionCandidate(input), { field } = candidate;
    const type = candidate.kind === 'npc' && candidate.instance === 'raid' ? 'raid' : candidate.kind;
    const blueprint = blueprints?.entries?.[type];
    const warnings = [], blockers = [];
    if (!blueprint) blockers.push(`The current ${type} blueprint is unavailable.`);
    const expected = candidate.kind === 'item' ? /\{\{\s*Itempage\b/i : candidate.kind === 'npc' ? /\{\{\s*Namedmobpage\b/i : /zoneTopTable/;
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
    if (candidate.zone) categories.add(contributionTitle(candidate.zone));
    let text;
    if (candidate.kind === 'item') {
        const lines = Array.isArray(field('statLines')) ? field('statLines').map(value => literalWikiText(value)).filter(Boolean).slice(0, 60) :
            typeof field('statsblock') === 'string' ? field('statsblock').split(/\r?\n|<br\s*\/?>/i).map(value => literalWikiText(value)).filter(Boolean).slice(0, 60) : [];
        if (!lines.length) blockers.push('Confirm the base item examine statistics.');
        const recovery=validateItemBaseReview(candidate),upgraded=Number(candidate.fields.tier?.value)>0||candidate.fields.augmented?.value===true||candidate.fields.modified?.value===true||candidate.fields.augmentNames?.value?.length>0;
        if(upgraded&&!recovery.ok)blockers.push(candidate.baseRecovery?recovery.reason:'An upgraded or augmented examine cannot establish base wiki statistics. Confirm a base item separately, or review supported reverse-scaling proposals.');
        if(candidate.baseRecovery&&!recovery.ok&&!upgraded)blockers.push(recovery.reason);
        if(recovery.ok)warnings.push('Base statistics are reviewed reverse-scaling inferences, not a base-item capture.',...recovery.warnings);
        const icon = field('iconId');
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
        const drops = confirmedSources.map(source => `${link(source.zone)}\n* ${link(source.npc)}`).join('\n\n');
        text = `${era}<onlyinclude>{{Itempage\n|itemname = ${candidate.title}\n|lucy_img_ID = ${icon === undefined ? '' : Number(icon)}\n|statsblock =\n${lines.join('<br>\n')}\n|focus_effect = ${literalWikiText(field('focusEffect') || '')}\n|notes = ${[candidate.playerText,recovery.ok?literalWikiText(recovery.note):''].filter(Boolean).join('\n\n')}\n|dropsfrom =\n${drops}\n}}</onlyinclude>\n`;
    } else if (candidate.kind === 'npc') {
        if (!candidate.zone) blockers.push('Confirm the NPC zone.');
        if (!candidate.playerText) blockers.push('Write a factual NPC description in your own words.');
        const entries = [`name = ${candidate.title}`, `zone = ${candidate.zone ? link(candidate.zone) : ''}`, `description = ${candidate.playerText}`];
        const npcFields = { race:'race', class:'class', level:'level', location:'location', respawn_time:'respawnTime', AC:'AC', HP:'HP', special:'special' };
        for (const [parameter, key] of Object.entries(npcFields)) if (field(key) !== undefined) entries.push(`${parameter} = ${literalWikiText(field(key))}`);
        const loot = (Array.isArray(field('knownLoot')) ? field('knownLoot') : []).slice(0, 100).map(item => `<li>{{:${contributionTitle(item)}}}</li>`);
        entries.push(`known_loot = ${loot.length ? `<ul>\n${loot.join('\n')}\n</ul>` : 'Unknown'}`, 'factions = Unknown', 'opposing_factions = Unknown', 'related_quests = Unknown');
        if (candidate.instance === 'raid') categories.add('Raid Encounters');
        text = `${era}{{Namedmobpage\n\n| ${entries.join('\n\n| ')}\n\n}}\n`;
    } else {
        if (!candidate.playerText) blockers.push('Write the zone introduction in your own words.');
        categories.add('Zones');
        const whoName=field('whoName');
        if(!whoName)warnings.push('No verified /who zone name; that field remains Unknown.');
        text = `${era}${candidate.playerText}\n\n{| class="zoneTopTable"\n! Name in /who\n| ${literalWikiText(whoName || 'Unknown')}\n|}\n`;
        if (field('dynamicZoneSupported') === true) text += `\n== What's in this zone? ==\n{{Special:DynamicZoneList/${candidate.title}}}\n`;
        else warnings.push('A new zone may need a wiki DynamicZoneList allowlist update; no nonworking list was inserted.');
    }
    if (/\b(?:NPC_Name|ZONE_NAME|ZONE NAME|ITEM_NAME|Item Name|Describe the|Add a brief)\b/.test(text)) blockers.push('Replace all blueprint instructional placeholders.');
    if (/\{\{\s*(?:Special:|#|DISPLAYTITLE|DEFAULTSORT|subst:|safesubst:)|<\s*(?:script|iframe|object|embed)\b/i.test(candidate.playerText)) blockers.push('Remove unsupported executable or special-page markup from the contribution prose.');
    return { title:candidate.title, kind:candidate.kind, text:`${text}\n${[...categories].map(category).join('\n')}\n`, warnings, blockers, blueprintRevision:blueprints?.revision ?? null };
}

function distance(a, b) {
    let row = Array.from({ length:b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1] + 1, row[j] + 1, row[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); row = next; }
    return row[b.length];
}
export function findPotentialMatches(name, entries = [], limit = 12) {
    const key = contributionNameKey(name), tokens = new Set(key.split(/\W+/).filter(Boolean));
    if (!key) return [];
    return entries.slice(0, 60000).map(entry => {
        const title = typeof entry === 'string' ? entry : entry?.title || entry?.name || '';
        const other = contributionNameKey(title), otherTokens = new Set(other.split(/\W+/).filter(Boolean));
        const overlap = [...tokens].filter(token => otherTokens.has(token)).length / Math.max(1, tokens.size, otherTokens.size);
        const exact = key === other, near = Math.abs(key.length-other.length) <= 8 && (overlap > 0 || key.slice(0,3) === other.slice(0,3));
        const score = exact ? 1 : Math.max(overlap * .8, near ? 1-distance(key,other)/Math.max(key.length,other.length,1) : 0);
        return { ...(typeof entry === 'object' ? entry : {}), title, score, exact };
    }).filter(item => item.score >= .46).sort((a,b) => b.score-a.score || a.title.localeCompare(b.title)).slice(0, Math.max(1, Math.min(30, limit)));
}

function protectedRanges(source) { return [...source.matchAll(/<!--[\s\S]*?-->|<(nowiki|pre|source|syntaxhighlight)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map(match => [match.index, match.index+match[0].length]); }
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

export function patchContributionRelationship(source, { role, itemTitle, npcTitle, zoneTitle }) {
    if (typeof source !== 'string' || source.length > 512*1024) throw new Error('The existing page is too large or unavailable.');
    const name = role === 'npc-loot' ? 'Namedmobpage' : role === 'item-source' ? 'Itempage' : null;
    if (!name) throw new Error('Unsupported related-page change.');
    const templates=contributionTemplates(source,name);
    if (templates.length !== 1) throw new Error('Choose the correct existing normal/raid template in the wiki source editor.');
    const template=templates[0], parameter=role==='npc-loot'?'known_loot':'dropsfrom';
    const fields=template.fields.filter(field=>field.name.toLowerCase()===parameter);
    if (fields.length>1) throw new Error('The existing page has duplicate template fields; use the wiki source editor.');
    const targetTitle=contributionTitle(role==='npc-loot'?itemTitle:npcTitle), current=fields[0]?.value || '';
    const escaped=targetTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'[ _]');
    let scope=current,zoneBlock=null;
    if(role==='item-source'){
        let outline=current;for(const [start,end]of protectedRanges(current).reverse())outline=outline.slice(0,start)+outline.slice(start,end).replace(/[^\r\n]/g,' ')+outline.slice(end);
        if(/^={1,6}[ \t]*[^=\r\n]*\b(?:raid|normal)[ \t]+(?:instance|zone)\b[^=\r\n]*={1,6}[ \t]*$/im.test(outline))throw new Error('Choose the correct existing normal/raid source section in the wiki source editor.');
        const headings=[...outline.matchAll(/^[ \t]*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][ \t]*\r?$/gm)],zoneKey=contributionNameKey(zoneTitle),zone=headings.findIndex(heading=>contributionNameKey(heading[1])===zoneKey);
        if(headings.filter(heading=>contributionNameKey(heading[1])===zoneKey).length>1)throw new Error('The item has multiple source sections for this zone; choose the verified instance in the wiki source editor.');
        if(zone>=0){zoneBlock={start:headings[zone].index,end:headings[zone+1]?.index??current.length};scope=outline.slice(headings[zone].index+headings[zone][0].length,zoneBlock.end);}
        else scope='';
    }
    const already=role==='npc-loot'?new RegExp(`\\{\\{\\s*:\\s*${escaped}\\s*(?:[}|])`,'i').test(scope):new RegExp(`\\[\\[\\s*${escaped}\\s*(?:[\\]|])`,'i').test(scope);
    let text=source;
    if(!already){
        const addition=role==='npc-loot'?`<ul><li>{{:${targetTitle}}}</li></ul>`:`${link(zoneTitle)}\n* ${link(targetTitle)}`;
        const empty=/^\s*(?:(?:\*\s*)?None|<ul>\s*<li>\s*(?:\{\{:\s*)?None(?:\}\})?\s*<\/li>\s*<\/ul>)?\s*$/i.test(current);
        let value;
        if(zoneBlock){
            const block=current.slice(zoneBlock.start,zoneBlock.end),trailing=block.match(/[ \t\r\n]*$/)[0],position=zoneBlock.end-trailing.length,eol=block.includes('\r\n')?'\r\n':'\n';
            value=current.slice(0,position)+`${eol}* ${link(targetTitle)}`+(trailing||eol)+current.slice(zoneBlock.end);
        }else value=`\n${empty?'':current.trim()+'\n\n'}${addition}\n\n`;
        const field=fields[0];
        text=field?source.slice(0,field.valueStart)+value+source.slice(field.end):source.slice(0,template.end-2)+`| ${parameter} = ${value}`+source.slice(template.end-2);
    }
    if (zoneTitle) {
        const zone=contributionTitle(zoneTitle), key=contributionNameKey(zone);
        const present=[...text.matchAll(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].some(match=>contributionNameKey(match[1])===key);
        if (!present) text+=`\n${category(zone)}\n`;
    }
    return { text, changed:text!==source };
}
