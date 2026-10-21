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
