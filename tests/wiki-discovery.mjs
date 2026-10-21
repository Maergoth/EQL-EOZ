import assert from 'node:assert/strict';
import { buildWikiEntityCatalog, createWikiDiscovery, wikiEntityKey } from '../app/wiki-discovery.js';

let clock = Date.parse('2026-10-21T12:00:00Z');
let pack = { meta:{ wikiEntitiesComplete:true, version:'full-1' }, wikiEntities:{
    npcs:['a synthetic rat', 'The King’s Guard'], items:['Synthetic Sword'], titles:['A Redirect Target', 'Plain Article', 'Statless Item']
}, npcs:[{ name:'Fallback Rat', aliases:['Fallback alias'] }], items:[{ name:'Fallback Ring' }] };
const values = new Map(), prompts = [], warnings = [];
const storage = { getItem:key => values.get(key), setItem:(key, value) => values.set(key, value) };
const options = { getPack:() => pack, storage, now:() => clock, onMissing:prompt => prompts.push(prompt), onWarning:message => warnings.push(message) };
let discovery = createWikiDiscovery(options);
const consume = (event, context = {}) => discovery.consume({ at:clock, ...event }, { live:true, logId:'log-a', zone:'Test Zone', ...context });
assert.equal(wikiEntityKey(' The_King&#39;s  Guard!'), "king's guard");
assert.equal(wikiEntityKey('an&nbsp;Ancient   Rat.'), 'ancient rat');
assert.equal(buildWikiEntityCatalog(pack).has('monster', 'THE king’s GUARD'), true);
for (const name of ['A SYNTHETIC RAT', 'the synthetic rat', 'King\'s Guard', 'Fallback alias', 'Plain Article', 'Redirect Target']) {
    assert.equal(consume({ type:'consider', target:{ name } }), null, `known NPC/title variant ${name}`);
}
for (const name of ['a Synthetic Sword', 'Statless Item', 'Fallback Ring']) assert.equal(consume({ type:'loot', item:name }), null);
assert.equal(consume({ type:'consider', target:{ name:'Unknown' } }, { live:false }), null, 'initial log tail is never a discovery');
assert.equal(consume({ type:'kill', victim:'Old Rat', at:clock - 10001 }), null, 'stale appended lines are never discoveries');
assert.equal(consume({ type:'loot', item:'Future Item', at:clock + 3000 }), null);
assert.equal(discovery.consume({ type:'kill', victim:'No time' }, { live:true }), null);
let prompt = consume({ type:'consider', target:{ name:'a new synthetic rat' } });
assert.deepEqual({ kind:prompt.kind, name:prompt.name, zone:prompt.zone }, { kind:'monster', name:'a new synthetic rat', zone:'Test Zone' });
assert.ok(!JSON.stringify(prompt).includes('log-a'));
assert.equal(consume({ type:'kill', victim:'The New Synthetic Rat' }), null, 'consider then kill and article/case variants dedupe');
assert.equal(discovery.dismiss(prompt.id), true);
assert.equal(consume({ type:'consider', target:{ name:'new synthetic rat' } }), null, 'dismissed entity stays suppressed for the app session');
assert.equal(consume({ type:'kill', victim:'new synthetic rat' }, { logId:'log-b' }), null, 'entity suppression spans character/log switches');
const ignoredPrompt = consume({ type:'loot', item:'a missing synthetic ring' });
assert.equal(discovery.ignore(ignoredPrompt.id), true);
assert.equal(discovery.ignore('unknown-id'), false);
discovery = createWikiDiscovery(options);
assert.equal(consume({ type:'loot', item:'MISSING SYNTHETIC RING' }), null, 'Ignore persists across restart');
assert.equal(discovery.snapshot().ignoredCount, 1);
prompt = consume({ type:'kill', victim:'Different new rat' });
assert.equal(discovery.dismiss(prompt.id), true);
clock += 5000;
assert.equal(consume({ type:'kill', victim:'Out of order', at:clock - 6000 }), null, 'each log rejects an older replay');
assert.ok(consume({ type:'kill', victim:'Other log encounter', at:clock - 6000 }, { logId:'log-b' }), 'another log has an independent replay watermark');

// Catalog completeness is essential: old/sample/limited exports establish
// positive presence only and never establish absence.
for (const meta of [{}, { wikiEntitiesComplete:false }, { wikiEntitiesComplete:true, sample:true }]) {
    pack = { ...pack, meta };
    assert.equal(consume({ type:'kill', victim:`Not reported ${JSON.stringify(meta)}` }), null);
    assert.equal(discovery.snapshot().complete, false);
}
pack = { meta:{ wikiEntitiesComplete:true }, wikiEntities:{ items:[], npcs:[] }, items:[], npcs:[] };
assert.equal(consume({ type:'loot', item:'Missing titles array' }), null);
pack = { meta:{ wikiEntitiesComplete:true, version:'full-2' }, wikiEntities:{ npcs:[], items:[], titles:[] }, items:[], npcs:[] };
assert.ok(consume({ type:'loot', item:'Now verifiable catalog absence' }));
pack = { ...pack, wikiEntities:{ ...pack.wikiEntities, titles:['Now present after update'] } };
assert.equal(consume({ type:'loot', item:'Now present after update' }), null, 'dataset refresh invalidates membership cache');

// Pending IDs track the native host's bounded queue; filled queues must not
// permanently suppress entities that were never delivered.
discovery = createWikiDiscovery(options);
for (let i = 0; i < 20; i++) assert.ok(consume({ type:'kill', victim:`Queue rat ${i}` }));
assert.equal(discovery.snapshot().pending.length, 20);
assert.equal(consume({ type:'kill', victim:'Overflow rat' }), null);
discovery.dismiss(discovery.snapshot().pending[0].id);
assert.ok(consume({ type:'kill', victim:'Overflow rat' }));
const failed = createWikiDiscovery({ ...options, storage:{ getItem:() => '{bad json', setItem() { throw new Error('full'); } } });
prompt = failed.consume({ type:'loot', item:'Locally ignored', at:clock }, { live:true });
assert.ok(prompt);
assert.equal(failed.ignore(prompt.id), true);
assert.equal(warnings.length, 1);
assert.equal(failed.consume({ type:'loot', item:'Locally ignored', at:clock }, { live:true }), null, 'save failure still ignores for current session');
const rejected = createWikiDiscovery({ ...options, onMissing() { throw new Error('native host closed'); } });
assert.equal(rejected.consume({ type:'kill', victim:'Recoverable prompt', at:clock }, { live:true }), null);
assert.equal(rejected.snapshot().pending.length, 0);
const warningBefore = warnings.length;
const asynchronous = createWikiDiscovery({ ...options, onMissing:async () => { throw new Error('native host closed asynchronously'); } });
assert.ok(asynchronous.consume({ type:'kill', victim:'Async retry target', at:clock }, { live:true }));
await new Promise(resolve => setImmediate(resolve));
assert.equal(asynchronous.snapshot().pending.length, 0, 'rejected native prompt promises roll back pending/suppression');
assert.equal(warnings.length, warningBefore + 1);
assert.match(warnings.at(-1), /could not open/);
const hostileWarning = createWikiDiscovery({ ...options, onMissing() { throw new Error('closed'); }, onWarning() { throw new Error('notice closed'); } });
assert.equal(hostileWarning.consume({ type:'kill', victim:'Safe failure', at:clock }, { live:true }), null, 'an unavailable warning surface cannot interrupt log parsing');
console.log('Wiki discovery: complete public catalog membership, normalization, live freshness, bounded queue, replay/log identity and persistent Ignore passed.');
