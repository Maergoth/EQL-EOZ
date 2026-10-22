import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itemHasZoneSource, itemMatchesClasses, scoreItemForBrowse } from '../app/item-browse.js';

const packPath = fileURLToPath(new URL('../app/data/eye-of-zomm-pack.bootstrap.json', import.meta.url));
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
if (!Array.isArray(pack.items) || pack.items.length < 1000) {
    throw new Error('Catalog relevance check requires the production bootstrap pack.');
}
if (pack.meta?.wikiEntitiesComplete !== true || !['npcs','items','titles'].every(key => pack.wikiEntities?.[key]?.length > 0) ||
    !pack.npcs?.some(npc => npc.raidInstance === true)) throw new Error('The production catalog requires the refreshed raid and public wiki presence export.');
// Item sources also become Intel rows. Reject stale/incorrect exports before
// packaging, even when their stat records and aggregate counts look healthy.
const markup = /\{\{|\}\}|\[\[|\]\]/;
const malformed = [];
for (const npc of pack.npcs) if (markup.test(String(npc.name || ''))) malformed.push(`NPC: ${npc.name}`);
let sourceCount = 0;
for (const item of pack.items) for (const source of item.dropSources || []) {
    sourceCount++;
    if (markup.test(String(source.name || ''))) malformed.push(`${item.name}: ${source.name}`);
}
if (malformed.length) throw new Error(`Production catalog has ${malformed.length} unresolved wiki identities; rebuild with the reviewed producer. ${malformed.slice(0,3).join('; ')}`);
console.log(`Catalog source identities passed: ${pack.npcs.length} NPCs, ${sourceCount} drop sources, no raw wiki markup.`);
if (pack.meta?.npcLootSourcesIncluded !== true || !Number.isSafeInteger(pack.meta?.npcLootSourceCounts?.sourcesAdded)) {
    throw new Error('Production bootstrap requires the NPC known_loot reconciliation; rebuild and publish the reviewed exporter.');
}
const sourceName = value => String(value || '').normalize('NFKC').replace(/[`’]/g,"'").replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const hateItems = npcName => pack.items.filter(item => (item.dropSources || []).some(source =>
    sourceName(source.zone) === 'plane of hate' && sourceName(source.name) === sourceName(npcName)));
const vicarItems = hateItems('Vicar M`Kari'), loathingItems = hateItems('Lord of Loathing');
if (new Set(vicarItems.map(item => item.wikiTitle || item.name)).size < 11) {
    throw new Error('The refreshed catalog must retain Vicar M`Kari’s 11 documented known-loot items.');
}
for (const name of ['Diamond Rod','Wand of Conflagration']) if (!loathingItems.some(item => sourceName(item.wikiTitle || item.name) === sourceName(name))) {
    throw new Error(`The refreshed Lord of Loathing loot is missing ${name}.`);
}
console.log(`NPC loot reconciliation passed: ${vicarItems.length} Vicar items, ${loathingItems.length} Lord of Loathing items; ${pack.meta.npcLootSourceCounts.sourcesAdded} source variants added.`);
const npcKey = npc => JSON.stringify([String(npc.zone).toLowerCase(),String(npc.name).toLowerCase()]);
const legacyNpcs = new Map(pack.npcs.map(npc => [npcKey(npc),npc]));
if (pack.npcs.some(npc => !npc.raidInstance && legacyNpcs.get(npcKey(npc))?.raidInstance)) {
    throw new Error('The production catalog must preserve normal NPC records in legacy last-wins projections.');
}

const items = pack.items
    .filter(item => {
        return itemMatchesClasses(item, ['MNK']) &&
            itemHasZoneSource(item, 'Befallen');
    });
const scores = new Map(items.map(item => [item, scoreItemForBrowse(item, { zone:'Befallen' })]));
items.sort((left, right) => scores.get(right) - scores.get(left) || left.name.localeCompare(right.name));

if (items.length < 20) throw new Error('Current-zone/class defaults returned too few Befallen monk items.');
const firstTen = items.slice(0, 10);
const useful = firstTen.filter(item =>
    (item.slots || []).length || Object.keys(item.stats || {}).some(stat => String(stat).toUpperCase() !== 'WT')
);
if (useful.length < 8) throw new Error('Generic catalog entries outrank useful current-zone equipment.');
if (firstTen.some(item => /\b(?:dose|potion|elixir|distillate)\b/i.test(item.name || ''))) {
    throw new Error('Consumables still dominate the first page of contextual item results.');
}

console.log(`Catalog relevance passed: ${items.length} Befallen/MNK items; first result is ${firstTen[0].name}.`);
