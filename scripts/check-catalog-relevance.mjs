import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itemHasZoneSource, scoreItemForBrowse } from '../app/item-browse.js';

const packPath = fileURLToPath(new URL('../app/data/eye-of-zomm-pack.bootstrap.json', import.meta.url));
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
if (!Array.isArray(pack.items) || pack.items.length < 1000) {
    throw new Error('Catalog relevance check requires the production bootstrap pack.');
}

const items = pack.items
    .filter(item => {
        const classes = (item.classes || []).map(value => String(value).toUpperCase());
        return (!classes.length || classes.includes('ALL') || classes.includes('MNK')) &&
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
