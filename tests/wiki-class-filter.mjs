import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as browse from '../app/item-browse.js';
import { catalogBaseStats } from '../app/item-scaling.js';
import { JSDOM } from 'jsdom';

const playable = ['WAR','CLR','PAL','RNG','SHD','DRU','MNK','BRD','ROG','SHM','NEC','WIZ','MAG','ENC','BST','BER'];
const excluded = ['CLR','PAL','DRU','MNK','SHM'];
const allowed = playable.filter(code => !excluded.includes(code));
const source = readFileSync(new URL('../server/BuildEyeOfZommPack.php', import.meta.url), 'utf8');
const classesMethod = source.match(/    private function parseClasses[\s\S]*?(?=\n    private function parseSlots)/)?.[0];
const cleanMethod = source.match(/    private function cleanWikiText[\s\S]*?(?=\n    private function normalizeZone)/)?.[0];
const constant = source.match(/    private const CLASS_CODES = \[[\s\S]*?\];/)?.[0];
assert.ok(classesMethod && cleanMethod && constant, 'Actual exporter class parser is available');
const fixtures = [
    ['Class: ALL except CLR PAL DRU MNK SHM<br>Race: ALL', allowed],
    ['Class: all except clr pal dru mnk shm', allowed],
    ['Class: ALL except XYZ MNK', playable.filter(code => code !== 'MNK')],
    ['Class: ALL', ['ALL']],
    ['Class: WAR MNK XYZ', ['WAR','MNK']],
    ['Class: None', ['NONE']],
    [`Class: ALL except ${playable.join(' ')}`, ['NONE']],
    ['Class: XYZ', []],
    ['No class field', []]
];
const php = `<?php
class ClassParserHarness {
${constant}
${classesMethod}
${cleanMethod}
    public function parse(string $value) { return $this->parseClasses($value); }
}
$parser = new ClassParserHarness();
$out = [];
foreach (json_decode(getenv('EOZ_CLASS_FIXTURES'), true) as $fixture) { $out[] = $parser->parse($fixture[0]); }
echo json_encode($out);
`;
const result = spawnSync('php', [], {
    input:php,
    encoding:'utf8',
    env:{ ...process.env, EOZ_CLASS_FIXTURES:JSON.stringify(fixtures) }
});
if (result.error?.code === 'ENOENT') {
    console.log('Exporter class-parser behavioral checks skipped: PHP runtime unavailable.');
} else {
    assert.equal(result.status, 0, result.stderr || 'Exporter class harness completes');
    assert.deepEqual(JSON.parse(result.stdout), fixtures.map(([, expected]) => expected), 'Exporter expands ALL except into allowed playable classes');
}

assert.equal(typeof browse.itemMatchesClasses, 'function', 'Catalog exposes the class-matching helper');
const matches = browse.itemMatchesClasses;
const legacy = { classes:['ALL', ...excluded], displayLines:['Class: ALL except CLR PAL DRU MNK SHM'] };
assert.equal(matches(legacy, ['MNK']), false, 'Legacy ALL except excludes a monk');
assert.equal(matches(legacy, ['WAR']), true, 'Legacy ALL except permits a warrior');
assert.equal(matches(legacy, ['MNK','WAR']), true, 'A multi-class player may use any permitted class');
assert.equal(matches(legacy, ['MNK','CLR']), false, 'All excluded player classes stay excluded');
assert.equal(matches({ classes:['all','mnk'], displayLines:['class: all except mnk xyz'] }, ['mnk']), false, 'Legacy matching ignores case and unknown exclusions');
assert.equal(matches({ classes:['ALL'], displayLines:[`Class: ALL except ${playable.join(' ')}`] }, ['WAR']), false, 'Excluding every playable class permits none');
assert.equal(matches({ classes:['ALL'] }, ['WAR']), true, 'Unrestricted ALL stays unrestricted');
assert.equal(matches({ classes:['NONE'] }, ['WAR']), false, 'Explicit no classes stay excluded');
assert.equal(matches({ classes:[] }, ['WAR']), true, 'Missing class metadata stays unfiltered');
assert.equal(matches({ classes:['XYZ'] }, ['WAR']), true, 'Unknown item class codes do not become restrictions');
assert.equal(matches(legacy, []), true, 'No selected class leaves the catalog unfiltered');
assert.equal(matches(legacy, ['XYZ']), true, 'Unknown selected class codes do not invent a profile');
assert.equal(matches({ classes:['mnk'] }, ['MNK']), true, 'Explicit class lists ignore case');
assert.equal(matches({ classes:['WAR'], displayLines:['Class: ALL except WAR'] }, ['WAR']), true, 'Explicit exported includes remain authoritative');
assert.equal(matches({ classes:['WAR'], displayLines:['Class: ALL except WAR'] }, ['MNK']), false, 'Compatibility fallback cannot broaden an explicit class list');

const chargedWand = { name:'Synthetic charged wand', classes:['WIZ'], slots:['PRIMARY','SECONDARY'], stats:{WT:1}, displayLines:['Charges: 3','Effect: Synthetic Conflagration (Any Slot/Can Equip, Casting Time: Instant) at Level 45'] };
assert.equal(browse.itemHasClassStats(chargedWand),true,'Equippable charged effects remain useful class gear even without numeric stats');
assert.equal(matches(chargedWand,['WIZ']),true,'Effect equipment still respects eligible classes');
assert.equal(matches(chargedWand,['CLR']),false,'Effect equipment does not broaden class eligibility');
assert.equal(browse.itemHasClassStats({...chargedWand,displayLines:['Effect: Synthetic regeneration (Worn)']}),true,'Passive worn equipment remains useful');
assert.equal(browse.itemHasClassStats({...chargedWand,displayLines:['Focus Effect: Synthetic focus']}),true,'Equipped focus effects remain useful');
assert.equal(browse.itemHasClassStats({...chargedWand,slots:[]}),false,'A potion-like effect without an equipment slot is excluded');
assert.equal(browse.itemHasClassStats({...chargedWand,slots:['FOOD'],displayLines:['Effect: Synthetic nourishment (Can Equip)']}),false,'Food is not an equipment slot');
assert.equal(browse.itemHasClassStats({...chargedWand,displayLines:['WT 0.1','Quest item']}),false,'Weight-only quest items are still excluded by My Class');
assert.equal(browse.itemHasClassStats({stats:{HP:1}}),true,'Existing numeric-stat gear remains included');

// Exercise the actual Items controls and renderer together: Any must bypass
// inferred classes without changing the character/profile or another filter.
const appSource=readFileSync(new URL('../app/app.js',import.meta.url),'utf8');
const extract=(start,end)=>{const at=appSource.indexOf(start),until=appSource.indexOf(end,at+start.length);assert(at>=0&&until>at);return appSource.slice(at,until);};
const dom=new JSDOM('<div id="class-chips"></div><div id="settings-class-chips"></div><input id="item-search"><select id="item-slot"><option value=""></option><option value="HEAD">Head</option></select><select id="item-sort"><option value="name">Name</option></select><input type="checkbox" id="item-current-zone"><div id="item-context"></div><div id="item-list"></div>',{runScripts:'outside-only'});
const {window}=dom;
let saved;
Object.assign(window,{
    CLASSES:playable,settings:{manualClasses:[],itemAnyClass:false,era:'Classic',itemTier:0},
    pack:{items:[{name:'Synthetic Monk Hat',classes:['MNK'],slots:['HEAD']},{name:'Synthetic Cleric Hat',classes:['CLR'],slots:['HEAD']},{name:'Synthetic No-class Token',classes:['NONE'],slots:[]}]},
    $:selector=>window.document.querySelector(selector),$$:selector=>[...window.document.querySelectorAll(selector)],
    state:()=>({classes:['MNK'],level:50,zone:''}),prefs:{save(value){saved=JSON.parse(JSON.stringify(value));}},
    eraAllowed:()=>true,itemMatchesProfile:(item,profile)=>matches(item,profile.classes),itemDropsInZone:()=>true,itemBrowsePriority:()=>0,
    scaledItemStats:()=>({}),catalogBaseStats,esc:String,formatNum:String,itemIconHtml:()=>'',itemHoverAttrs:()=>'',wikiUrl:()=> '#',isItemStatModified:()=>false,
    bindPathButtons(){},refreshItemTooltip(){},replaceItemList(host,markup){host.innerHTML=markup;return true;}
});
window.renderAll=()=>window.renderItems(window.state(),window.effectiveProfile(window.state()));
window.eval(extract('function effectiveProfile(','function conClass(')+extract('function renderItems(','function buildEraSelect('));
window.buildClassChips();window.renderAll();
const host=window.document.querySelector('#class-chips'),any=()=>host.querySelector('[data-class-any]'),auto=()=>host.querySelector('[data-class-auto]');
const names=()=>[...window.document.querySelectorAll('#item-list h3')].map(node=>node.textContent);
assert.equal(host.firstElementChild.textContent,'Any');assert.equal(host.children[1].textContent,'Auto','Any is directly left of Auto');
assert.deepEqual(names(),['Synthetic Monk Hat'],'Auto uses the detected character class');
any().click();assert.equal(names().length,3,'Any includes otherwise excluded classes and non-equippable items');
assert.equal(any().getAttribute('aria-pressed'),'true');assert.equal(auto().getAttribute('aria-pressed'),'false');
assert.deepEqual([...window.effectiveProfile(window.state()).classes],['MNK'],'Any never changes the character profile');
assert.equal(saved.itemAnyClass,true,'Any mode persists');assert.match(window.document.querySelector('#item-context').textContent,/any class/);
window.document.querySelector('#item-slot').value='HEAD';window.renderAll();assert.equal(names().length,2,'Any preserves the slot filter');
window.document.querySelector('#item-search').value='Cleric';window.renderAll();assert.deepEqual(names(),['Synthetic Cleric Hat'],'Any preserves text search');
window.document.querySelector('#item-search').value='';window.document.querySelector('#item-slot').value='';auto().click();assert.deepEqual(names(),['Synthetic Monk Hat'],'Auto restores detected-class filtering');
any().click();host.querySelector('[data-class="CLR"]').click();assert.equal(window.settings.itemAnyClass,false);assert.deepEqual(names(),['Synthetic Cleric Hat'],'An explicit class leaves Any and filters normally');
any().click();window.buildClassChips();window.renderAll();assert.equal(any().getAttribute('aria-pressed'),'true','Restored controls preserve Any selection');
assert.equal(window.document.querySelector('#settings-class-chips [data-class-any]'),null,'Any is an Items browsing option');
dom.window.close();
console.log('Wiki class filtering passed: exporter complements, legacy exclusions, mixed profiles, Any/Auto class controls, persistence and independent search/slot filters.');
