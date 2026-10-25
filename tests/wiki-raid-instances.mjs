import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../server/BuildEyeOfZommPack.php', import.meta.url));
const catalogPath = fileURLToPath(new URL('../server/zone-catalog.json', import.meta.url));
const zone = "Nagafen's Lair";
const npc = (level = 10, location = '(10, 20, 30)', description = '') => `{{Namedmobpage\n|zone=[[${zone}]]\n|level=${level}\n|location=${location}\n|description=${description}\n}}`;
const item = (name, drops) => `{{Itempage\n|itemname=${name}\n|statsblock=Slot: HEAD<br>HP: +5<br>Class: WAR<br>Race: ALL\n|dropsfrom=\n${drops}\n}}`;
const zoneText = `[[King Tranix]] (Raid Instance Only) and [[Synthetic neighbour]] is public.
! '''Types of Monsters'''
|[[Synthetic normal guard]]
= Raid Instance =
Entrance is by hailing [[Voidling]] in [[Lavastorm Mountains]].
{|class="zoneTopTable"
! '''Types of Monsters:'''
|[[Fire Giant Warrior]]
|-
! '''Raid Boss NPCs:'''
|[[King Tranix]], [[Synthetic raid boss]]
|-
| '''Boss Drops'''
|{{:Synthetic shared item}}
|}
== Strategy ==
A comparison with [[Synthetic comparison NPC]] does not establish membership.
= Other Content =
! '''Types of Monsters:'''
|[[Synthetic after-header NPC]]
<!-- = Raid Instance = -->`;
const fixtures = {
    [zone]:{ text:zoneText, revision:501 },
    'Synthetic future zone':{ text:'[[Synthetic future raid NPC]] (Raid Instance Only)\n= Adventure =\n== Raid Instance ==\n=== Bosses ===\n! Raid Boss NPCs\n|[[Synthetic future raid NPC]]\n|-\n== Normal Instance ==\n! Types of Monsters\n|[[Synthetic future public NPC]]', zoneCandidate:true, revision:502 },
    'Synthetic future raid NPC':{ text:'{{Namedmobpage\n|zone=[[Synthetic future zone]]\n|level=55\n}}', revision:113 },
    'Synthetic future public NPC':{ text:'{{Namedmobpage\n|zone=[[Synthetic future zone]]\n|level=15\n}}', revision:114 },
    'King Tranix':{ text:npc(52), revision:101 },
    'Fire Giant Warrior':{ text:npc(49), revision:102 },
    'Synthetic raid boss':{ text:npc(55), categories:['Raid Encounters'], revision:103 },
    'Synthetic normal guard':{ text:npc(), revision:104 },
    'Synthetic neighbour':{ text:npc(), revision:105 },
    'Synthetic comparison NPC':{ text:npc(), revision:106 },
    'Synthetic after-header NPC':{ text:npc(), revision:107 },
    'Voidling':{ text:npc(), revision:108 },
    'Synthetic section NPC':{ text:npc(12) + '\n= Raid Instance =\n' + npc(50, '(90, 80, 70)'), revision:109 },
    'Synthetic description NPC':{ text:npc(10, '(10, 20, 30)', '\n= Raid Instance =\nAn explanation inside a shared template.'), revision:110 },
    'Synthetic alias NPC':{ text:npc().replace('|level=', '|name=Synthetic alternate monster\n|level='), revision:111 },
    'Synthetic skipped NPC':{ text:'A categorized public NPC page without a recognized stat template.', npcCandidate:true, revision:112 },
    'Synthetic raid crown':{ text:item('Synthetic raid crown', `[[${zone}]]\n* [[King Tranix]]`), revision:201 },
    'Synthetic shared item':{ text:item('Synthetic shared item', `[[${zone}]]\n* [[Fire Giant Warrior]]`), revision:202 },
    'Synthetic section item':{ text:item('Synthetic section item', `[[${zone}]]\n* [[Synthetic normal guard]]`) + '\n= Raid Instance =\n' + item('Synthetic section item', `[[${zone}]]\n* [[Synthetic normal guard]]`) + '\n= Comparison =\n' + item('Different comparison item', `[[${zone}]]\n* [[Synthetic comparison NPC]]`), revision:203 },
    'Synthetic source item':{ text:item('Synthetic source item', `[[${zone}]]\n* [[Synthetic normal guard]]\n== Raid Instance ==\n[[${zone}]]\n* [[Synthetic normal guard]]\n=== Bosses ===\n* [[Synthetic raid boss]]\n== Other Sources ==\n[[Kithicor Forest]]\n* [[Synthetic traveller]]`), revision:204 },
    'Synthetic anchor item':{ text:item('Synthetic anchor item', `[[${zone}]]\n* [[Synthetic normal guard]]\n[[${zone}#Raid_Instance|${zone}]]\n* [[Synthetic normal guard]]`), revision:205 },
    'Synthetic statless item':{ text:'{{Itempage\n|itemname=Synthetic alternate item\n|dropsfrom=\n}}', revision:206 },
    'Synthetic skipped item':{ text:'A categorized public item page without its template.', itemCandidate:true, revision:207 }
};
// Hate-shaped markup, synthetic entities: presentation wrappers/notes must not
// become source identities or carry a preceding zone into the next mob list.
const hateNpc = 'Synthetic Grandmaster R`Tal';
Object.assign(fixtures, {
    'Plane of Hate':{text:'= Raid Instance =\n! Raid Boss NPCs\n|[['+hateNpc+']]\n|-',revision:503},
    [hateNpc]:{text:'{{Namedmobpage\n|zone=[[Plane of Hate]]\n|level=54\n|location=(-12,34,56)\n}}',revision:301},
    'Synthetic styled Hate gem':{text:item('Synthetic styled Hate gem','[[Plane of Hate]]\n* {{VeliousGray| [['+hateNpc+'|Unrelated display label]] (Hate 2.0)}}\n** {{Loc|Plane of Hate|-12,+34,56|(-12,+34,56)}}\n== Raid Instance ==\n[[Plane of Hate]]\n* {{VeliousGray| [['+hateNpc+']] (Hate 2.0)}}'),revision:302},
    'Synthetic ground book':{text:item('Synthetic ground book','[[Plane of Hate]]\n* Ground Spawn\n** {{Loc|Plane of Hate|-12,+34,56|(-12,+34,56)}}'),revision:303},
    'Synthetic wrapped zones':{text:item('Synthetic wrapped zones',"[[West Karana]]\n* [[Synthetic western NPC]]\n{{VeliousGray| [[The Warrens]] }}\n* {{VeliousGray| [[Synthetic warrens NPC]] }}\n[[Timorous Deep]] {{Era|Kunark}}\n* [[Synthetic ocean NPC|Display name]] {{Era|Kunark}} (see [[Synthetic false note]])\n** [[Synthetic nested NPC]]\n** {{UnknownSource|[[Synthetic false NPC]]}}\n** [[File:Map Icon.png]]"),revision:304}
});
const structuredNpc = 'Synthetic mischievous batling';
Object.assign(fixtures, {
    'The Warrens':{text:'= Raid Instance =\n! Types of Monsters\n|[['+structuredNpc+']]\n|-',revision:504},
    [structuredNpc]:{text:'{{Namedmobpage\n|zone=[[The Warrens]]\n|level=12\n}}',revision:305},
    'Synthetic anchored shuriken':{text:item('Synthetic anchored shuriken','{{ItemWhereRow|[[The Warrens#Raid_Instance|The Warrens]]|[['+structuredNpc+']]|Behind Muglwump|()}}\n= Raid Instance =\n{{ItemWhereRow|[[The Warrens#Normal_Instance|The Warrens]]|[['+structuredNpc+']]|Behind Muglwump|()}}'),revision:307},
    'Synthetic structured shuriken':{text:item('Synthetic structured shuriken','= Normal Instance =\n[[West Karana]]\n* [[Synthetic western NPC]]\n{{ItemWhereTable|\n{{ItemWhereRow\n | [[The Warrens|Displayed zone]]\n | [['+structuredNpc+'|Displayed merchant]]\n | Behind [[Synthetic false area]]\n | {{Loc|The Warrens|-15,40|location label}}\n}}\n}}\n* [[Synthetic trailing western NPC]]\n{{ItemWhereRow|Unmapped place|[[Synthetic false NPC]]|Area|()}}\n= Raid Instance =\n{{ItemWhereTable|{{ItemWhereRow|1=[[The Warrens]]|2=[['+structuredNpc+']]|3=Behind Muglwump|4=()}}}}'),revision:306}
});
const withLoot = (text,loot) => text.replace(/\n}}$/,`\n|known_loot=\n${loot}\n}}`);
fixtures['Fire Giant Warrior'].text = withLoot(fixtures['Fire Giant Warrior'].text,'<ul><li>{{:Synthetic shared item}}</li><li>{{:Synthetic NPC-only wand}}</li></ul>');
Object.assign(fixtures, {
    'Synthetic loot priest':{text:withLoot(npc(60),'<ul><li>{{:Synthetic canonical helm}}</li><li>[[Synthetic linked shield|Displayed shield]] (rare; see [[Synthetic note item]])</li><li>{{VeliousGray|{{:Synthetic wand alias}}}}</li><li>{{Unknown|{{:Synthetic note item}}}}</li><li>{{:File:Synthetic note item}}</li><li>{{:Synthetic no-stat drop}}</li></ul>\nText mentioning [[Synthetic prose item]] is not loot.\n<!-- <li>{{:Synthetic note item}}</li> -->\n<nowiki>{{:Synthetic note item}}</nowiki>'),revision:401},
    'Synthetic canonical helm':{text:item('Synthetic displayed helm',''),revision:402},
    'Synthetic linked shield':{text:item('Synthetic linked shield',`[[${zone}]]\n* [[Synthetic loot priest]]`),revision:403},
    'Synthetic NPC-only wand':{text:item('Synthetic NPC-only wand',''),revision:404},
    'Synthetic wand alias':{text:'#REDIRECT [[Synthetic NPC-only wand]]',redirect:'Synthetic NPC-only wand',revision:405},
    'Synthetic no-stat drop':{text:'{{Itempage\n|itemname=Synthetic no-stat drop\n}}',revision:406},
    'Synthetic note item':{text:item('Synthetic note item',''),revision:407},
    'Synthetic prose item':{text:item('Synthetic prose item',''),revision:408},
    'Synthetic display collision':{text:item('Synthetic canonical helm',''),revision:409},
    'Synthetic scoped looter':{text:withLoot(npc(10),'* {{:Synthetic normal-only loot}}')+'\n= Raid Instance =\n'+withLoot(npc(60),'* {{:Synthetic raid-only loot}}'),revision:410},
    'Synthetic normal-only loot':{text:item('Synthetic normal-only loot',''),revision:411},
    'Synthetic raid-only loot':{text:item('Synthetic raid-only loot',''),revision:412},
    'Synthetic nested looter':{text:withLoot(npc(50),'* {{:Synthetic normal-only loot}}\n== Raid Instance ==\n* {{:Synthetic raid-only loot}}\n== Other drops ==\n* {{:Synthetic NPC-only wand}}')+'\n= Raid Instance =\n'+npc(60),revision:413},
    'Synthetic case looter':{text:withLoot(npc(40),'* {{:synthetic_case_charm}}'),revision:414},
    'Synthetic case charm':{text:item('Synthetic case charm',''),revision:415},
    'Synthetic Case charm':{text:item('Synthetic Case charm',''),revision:416},
    'Synthetic loot-only raid looter':{text:withLoot(npc(50),'* {{:Synthetic normal-only loot}}\n== Raid Instance ==\n* {{:Synthetic raid-only loot}}\n== Other drops ==\n* {{:Synthetic NPC-only wand}}'),revision:417},
    'Synthetic outer raid looter':{text:'= Raid Instance =\n'+withLoot(npc(60),'* {{:Synthetic raid-only loot}}\n== Normal Instance ==\n* {{:Synthetic normal-only loot}}\n== Other drops ==\n* {{:Synthetic NPC-only wand}}'),revision:418}
});
const php = `<?php
class Maintenance {}
class Title {
    private string $text;
    public function __construct(string $value) { $this->text = ucfirst(str_replace('_', ' ', $value)); }
    public static function makeTitle($namespace, string $value) { return new self($value); }
    public static function newFromText(string $value, $namespace = 0) { return new self($value); }
    public function getText() { return $this->text; }
    public function getNamespace() { return preg_match('/^(?:File|Template|User|Talk|Category):/i', $this->text) ? 1 : 0; }
    public function isExternal() { return false; }
    public function getFragment() { return ''; }
    public function exists() { return isset($GLOBALS['fixtures'][$this->text]); }
}
define('NS_MAIN', 0);
$fixtures = json_decode(getenv('EOZ_RAID_FIXTURES'), true);
$source = file_get_contents(getenv('EOZ_EXPORTER_SOURCE'));
$source = str_replace("require_once __DIR__ . '/Maintenance.php';", '', $source);
// This harness isolates the pre-existing raid/source methods; the separate
// exporter check exercises the mirrored global-count modules themselves.
$source = str_replace("require_once __DIR__ . '/ItemLootSourceCounts.php';", '', $source);
$source = preg_replace('/^use [^;]+;\\r?$/m', '', $source);
$source = str_replace("__DIR__ . '/zone-catalog.json'", "getenv('EOZ_CATALOG_PATH')", $source);
$source = preg_replace('/\\$maintClass = BuildEyeOfZommPack::class;[\\s\\S]*$/', '', $source);
eval(substr($source, 5));
$builder = (new ReflectionClass('BuildEyeOfZommPack'))->newInstanceWithoutConstructor();
$call = function ($name, ...$args) use ($builder) { return (new ReflectionMethod($builder, $name))->invoke($builder, ...$args); };
$factory = new class {
    public function newFromTitle($title) {
        return new class($GLOBALS['fixtures'][$title->getText()] ?? null) {
            private $fixture;
            public function __construct($fixture) { $this->fixture = $fixture; }
            public function getContent() {
                if (!$this->fixture) return null;
                return new class($this->fixture['text']) {
                    private string $text;
                    public function __construct(string $text) { $this->text = $text; }
                    public function getText() { return $this->text; }
                };
            }
            public function getRevisionRecord() {
                return new class($this->fixture['revision'] ?? 0) {
                    private int $id;
                    public function __construct(int $id) { $this->id = $id; }
                    public function getId() { return $this->id; }
                };
            }
            public function getRedirectTarget() { return empty($this->fixture['redirect']) ? null : Title::newFromText($this->fixture['redirect']); }
        };
    }
};
$call('loadZoneCatalog');
$dynamicZones = [];
foreach ($fixtures as $name => $fixture) if ($fixture['zoneCandidate'] ?? false) $dynamicZones[] = (object)['page_title'=>str_replace(' ','_',$name)];
$call('loadRaidInstanceIndex', $factory, $dynamicZones);
$npcCandidates = []; $itemCandidates = []; $publicTitles = [];
foreach ($fixtures as $name => $fixture) {
    $row = (object)['page_title'=>str_replace(' ','_',$name)];
    if (strpos($fixture['text'], '{{Namedmobpage') !== false || ($fixture['npcCandidate'] ?? false)) $npcCandidates[] = $row;
    if (strpos($fixture['text'], '{{Itempage') !== false || ($fixture['itemCandidate'] ?? false)) $itemCandidates[] = $row;
    $publicTitles[] = $row;
}
$publicTitles[] = (object)['page_title'=>'Synthetic_public_redirect'];
$call('indexWikiEntityCandidates', $npcCandidates, $itemCandidates, $publicTitles);
$npcs = [];
$items = [];
foreach ($fixtures as $name => $fixture) {
    if (strpos($fixture['text'], '{{Namedmobpage') === false) continue;
    $npcs = array_merge($npcs, $call('buildNpcRecords', $factory, (object)['page_namespace'=>0,'page_title'=>str_replace(' ','_',$name)], $fixture['categories'] ?? []));
}
$npcs = $call('applyNpcInstanceVariants', $npcs);
$npcs = $call('sortNpcRecords', $npcs);
foreach ($fixtures as $name => $fixture) {
    if (strpos($fixture['text'], '{{Itempage') === false) continue;
    $item = $call('buildItemRecord', $factory, (object)['page_namespace'=>0,'page_title'=>str_replace(' ','_',$name)], []);
    if ($item) $items[] = $item;
}
$items = $call('mergeNpcLootSources', $items, $factory);
$firstLootCounts = (new ReflectionProperty($builder,'npcLootSourceCounts'))->getValue($builder);
$items = $call('mergeNpcLootSources', $items, $factory);
$repeatLootCounts = (new ReflectionProperty($builder,'npcLootSourceCounts'))->getValue($builder);
$many = '[[' . ${JSON.stringify(zone)} . "]]\\n";
for ($index=0;$index<30;$index++) $many .= '* [[Synthetic normal ' . $index . "]]\\n";
$many .= "= Raid Instance =\\n[[" . ${JSON.stringify(zone)} . "]]\\n";
for ($index=0;$index<30;$index++) $many .= '* [[Synthetic raid ' . $index . "]]\\n";
$commentRows = $call('parseDropSourceLines', "<!-- Hidden structured row\\n{{ItemWhereRow|[[The Warrens]]|[[Synthetic comment ghost]]|Area|()}}\\n-->", false, false);
echo json_encode(['npcs'=>$npcs,'items'=>$items,'bounded'=>$call('parseDropSources', $many),'wikiEntities'=>$call('wikiEntityIndex'),'commentRows'=>$commentRows,'lootCounts'=>$firstLootCounts,'repeatLootCounts'=>$repeatLootCounts]);
`;
const result = spawnSync('php', [], { input:php, encoding:'utf8', env:{ ...process.env,
    EOZ_EXPORTER_SOURCE:sourcePath, EOZ_CATALOG_PATH:catalogPath, EOZ_RAID_FIXTURES:JSON.stringify(fixtures) } });
if (result.error?.code === 'ENOENT') throw new Error('Raid exporter checks require PHP.');
assert.equal(result.status, 0, result.stderr || 'Actual exporter raid fixture harness must complete.');
const actual = JSON.parse(result.stdout);
assert.deepEqual(actual.commentRows,[],'Multiline HTML comments are removed before structured-row tokenization, even when the line parser is called directly');
const records = name => actual.npcs.filter(record => record.name === name);
const sources = name => actual.items.find(record => record.name === name).dropSources;
const raid = name => records(name).filter(record => record.raidInstance);
const byTitle = title => actual.items.find(record => record.wikiTitle === title);
assert(byTitle('Synthetic canonical helm').dropSources.some(source=>source.name==='Synthetic loot priest'),'NPC known_loot joins the canonical item page even when its display name differs');
assert.equal(byTitle('Synthetic display collision').dropSources.length,0,'A display-name collision must not redirect another page’s loot');
assert.equal(byTitle('Synthetic case charm').dropSources[0].name,'Synthetic case looter','First-letter and underscore normalization resolves the exact canonical item title');
assert.equal(byTitle('Synthetic Case charm').dropSources.length,0,'Internal title case distinguishes two real item pages');
assert.equal(sources('Synthetic linked shield').filter(source=>source.name==='Synthetic loot priest').length,1,'Two documented directions deduplicate the same NPC/zone/instance source');
assert.equal(sources('Synthetic linked shield').find(source=>source.name==='Synthetic loot priest').lootSources[0].revisionId,401,'NPC source evidence retains its public revision and field');
assert.deepEqual(sources('Synthetic NPC-only wand').filter(source=>source.name==='Fire Giant Warrior').map(source=>source.raidInstance),[false,true],'NPC-only loot follows established shared normal/raid variants');
assert(sources('Synthetic NPC-only wand').some(source=>source.name==='Synthetic loot priest'),'An item redirect in known_loot resolves locally to the canonical item');
assert.deepEqual(sources('Synthetic normal-only loot').filter(source=>source.name==='Synthetic scoped looter').map(source=>source.raidInstance),[false],'Explicit public NPC template loot stays public');
assert.equal(sources('Synthetic normal-only loot').find(source=>source.name==='Synthetic scoped looter').lootSources[0].section,'','Unlabeled public template scope does not invent an explicit Normal Instance header');
assert.deepEqual(sources('Synthetic raid-only loot').filter(source=>source.name==='Synthetic scoped looter').map(source=>source.raidInstance),[true],'Explicit raid NPC template loot stays raid');
assert.deepEqual(sources('Synthetic raid-only loot').filter(source=>source.name==='Synthetic nested looter').map(source=>source.raidInstance),[true],'A Raid Instance heading inside known_loot scopes its item sources');
assert.deepEqual(sources('Synthetic NPC-only wand').filter(source=>source.name==='Synthetic nested looter').map(source=>source.raidInstance),[false],'A sibling section ends nested known_loot raid scope');
assert.deepEqual(records('Synthetic loot-only raid looter').map(npc=>npc.raidInstance),[false],'Loot sections do not invent missing raid stat blocks');
assert.deepEqual(sources('Synthetic raid-only loot').filter(source=>source.name==='Synthetic loot-only raid looter').map(source=>source.raidInstance),[true],'An explicit raid loot section remains a valid source without raid stats');
assert.equal(sources('Synthetic raid-only loot').find(source=>source.name==='Synthetic loot-only raid looter').lootSources[0].section,'Raid Instance','A source without same-instance stats retains explicit loot-section evidence');
assert.deepEqual(sources('Synthetic normal-only loot').filter(source=>source.name==='Synthetic loot-only raid looter').map(source=>source.raidInstance),[false],'Unlabeled normal loot stays normal beside a nested raid loot section');
assert.deepEqual(sources('Synthetic NPC-only wand').filter(source=>source.name==='Synthetic loot-only raid looter').map(source=>source.raidInstance),[false],'Sibling loot returns to its enclosing normal template');
assert.deepEqual(sources('Synthetic NPC-only wand').filter(source=>source.name==='Synthetic outer raid looter').map(source=>source.raidInstance),[true],'Sibling loot returns to its enclosing explicit raid template after an inner normal section');
assert.equal(sources('Synthetic note item').length,0,'Comments, nowiki, unknown wrappers, namespace links and rarity-note links cannot invent loot');
assert.equal(sources('Synthetic prose item').length,0,'Non-list prose does not establish item loot');
assert.equal(actual.items.some(record=>record.wikiTitle==='Synthetic no-stat drop'),false,'NPC lists cannot synthesize missing item stat records');
assert(actual.lootCounts.sourcesAdded > 0 && actual.lootCounts.itemsEnriched > 0,'Reconciliation reports newly added distinct sources and items');
assert(actual.lootCounts.unresolvedItems > 0,'Unresolved/statless references are counted without creating records');
assert.equal(actual.repeatLootCounts.sourcesAdded,0,'Existing source identities never count as newly added known_loot sources');
assert.equal(actual.repeatLootCounts.itemsEnriched,0,'Reconciliation with no new source identities reports zero newly enriched items');
for (const item of actual.items) for (const source of item.dropSources.filter(source=>source.lootSources)) {
    const siblings = actual.npcs.filter(npc=>npc.zone===source.zone&&npc.name===source.name);
    const exact = siblings.filter(npc=>npc.raidInstance===source.raidInstance);
    const explicitLootWithoutStats = exact.length===0 && siblings.length>0 && source.lootSources.some(entry=>entry.section===(source.raidInstance?'Raid Instance':'Normal Instance'));
    assert(exact.length===1 || explicitLootWithoutStats,'NPC-derived sources join one exact variant or retain explicit instance loot evidence alongside the other documented stat variant');
}
assert.deepEqual(sources('Synthetic styled Hate gem').map(source=>[source.zone,source.name,source.raidInstance]),[['Plane of Hate',hateNpc,false],['Plane of Hate',hateNpc,true]],'Styled link destinations retain exact normal/raid NPC identity, without labels or revamp annotations');
for (const source of sources('Synthetic styled Hate gem')) assert(records(source.name).some(record=>record.zone===source.zone&&record.raidInstance===source.raidInstance),'Every styled Hate drop joins its actual exported NPC variant');
assert.deepEqual(sources('Synthetic ground book').map(source=>[source.zone,source.name]),[['Plane of Hate','Ground Spawn']],'A nested Loc annotation is not a second monster or a drop source');
assert.deepEqual(sources('Synthetic wrapped zones').map(source=>[source.zone,source.name]),[['West Karana','Synthetic western NPC'],['The Warrens','Synthetic warrens NPC'],['Timorous Deep','Synthetic ocean NPC'],['Timorous Deep','Synthetic nested NPC']],'Styled/era headings reset the source zone; real nested NPC links remain; unknown templates and file links do not invent sources');
assert(actual.items.flatMap(item=>item.dropSources).every(source=>!/[{}\[\]|]/.test(source.name)),'Exported source names contain resolved identities, not raw wikitext');
assert.deepEqual(sources('Synthetic structured shuriken').map(source=>[source.zone,source.name,source.raidInstance]),[['West Karana','Synthetic western NPC',false],['The Warrens',structuredNpc,false],['West Karana','Synthetic trailing western NPC',false],['The Warrens',structuredNpc,true]],'Balanced ItemWhereRow supports multiline/piped/numeric positional fields, ignores area/Loc and unknown zones, and does not leak its zone into surrounding lists');
for (const drop of sources('Synthetic structured shuriken').filter(source=>source.name===structuredNpc)) assert.equal(records(drop.name).filter(record=>record.zone===drop.zone&&record.raidInstance===drop.raidInstance).length,1,'Structured normal/raid source joins exactly one NPC variant');
assert.deepEqual(sources('Synthetic anchored shuriken').map(source=>[source.zone,source.name,source.raidInstance]),[['The Warrens',structuredNpc,true],['The Warrens',structuredNpc,false]],'Explicit row zone anchors preserve their normal/raid identity even inside an opposite section');
assert.deepEqual(records('King Tranix').map(record => record.raidInstance), [true], 'An explicit zone Raid Instance Only reference makes the boss raid-only.');
assert.deepEqual(records('Synthetic future raid NPC').map(record => [record.zone,record.raidInstance]), [['Synthetic future zone',true]], 'A newly categorized zone and nested Raid Instance heading require no hardcoded zone list.');
assert.deepEqual(records('Synthetic future public NPC').map(record => [record.zone,record.raidInstance]), [['Synthetic future zone',false]], 'A same-level normal sibling ends the nested raid scope.');
assert.deepEqual(records('Fire Giant Warrior').map(record => record.raidInstance), [true, false], 'A shared NPC keeps distinct raid and normal identities in backward-compatible order.');
assert.deepEqual(records('Fire Giant Warrior')[1].loc, [10, 20, 30]);
assert.equal(raid('Fire Giant Warrior')[0].loc, undefined, 'A public spawn location must not be copied into a separate raid instance.');
assert.equal(raid('Fire Giant Warrior')[0].instanceSources[0].revisionId, 501);
assert.deepEqual(records('Synthetic raid boss').map(record => record.raidInstance), [true], 'Raid category evidence must not create a duplicate public boss.');
for (const name of ['Voidling', 'Synthetic normal guard', 'Synthetic neighbour', 'Synthetic comparison NPC', 'Synthetic after-header NPC', 'Synthetic description NPC']) {
    assert.deepEqual(records(name).map(record => record.raidInstance), [false], `${name}: entrances, prose, neighbouring links, sibling sections and nested descriptions are not raid NPC lists.`);
}
assert.deepEqual(records('Synthetic section NPC').map(record => record.raidInstance), [true, false]);
assert.deepEqual(raid('Synthetic section NPC')[0].loc, [90, 80, 70], 'An explicit raid-template spawn location remains authoritative.');
assert.equal(raid('Synthetic section NPC')[0].avgLevel, 50);
const legacyNpcs = new Map(actual.npcs.map(record => [`${record.zone.toLowerCase()}|${record.name.toLowerCase()}`,record]));
const legacyRecord = name => legacyNpcs.get(`${records(name)[0].zone.toLowerCase()}|${name.toLowerCase()}`);
assert.deepEqual(legacyRecord('Fire Giant Warrior').loc,[10,20,30],'Legacy zone/name last-wins clients retain the normal coordinate instead of a coordinate-free raid clone.');
assert.equal(legacyRecord('Fire Giant Warrior').raidInstance,false);
assert.equal(legacyRecord('Synthetic section NPC').avgLevel,12,'Legacy clients retain normal stats even when an explicit raid template has different stats and a coordinate.');
assert.deepEqual(legacyRecord('Synthetic section NPC').loc,[10,20,30]);
assert.equal(legacyRecord('King Tranix').raidInstance,true,'Raid-only NPCs remain present in legacy projections.');
assert.deepEqual(sources('Synthetic raid crown').map(source => source.raidInstance), [true]);
assert.deepEqual(sources('Synthetic shared item').map(source => source.raidInstance), [false, true]);
for (const name of ['Synthetic section item', 'Synthetic anchor item']) assert.deepEqual(sources(name).map(source => source.raidInstance), [false, true], `${name}: source sections/anchors preserve both same-name variants.`);
const sectionSources = sources('Synthetic source item');
assert.deepEqual(sectionSources.map(source => [source.name, source.raidInstance]), [
    ['Synthetic normal guard', false], ['Synthetic normal guard', true], ['Synthetic raid boss', true], ['Synthetic traveller', false]
]);
assert.equal(sectionSources[1].instanceSources[0].wikiTitle, 'Synthetic source item');
assert.equal(sectionSources[1].instanceSources[0].revisionId, 204);
assert.equal(actual.bounded.filter(source => !source.raidInstance).length, 24);
assert.equal(actual.bounded.filter(source => source.raidInstance).length, 24, 'The normal-source limit must not discard the raid group.');
for (const record of [...actual.npcs, ...actual.items.flatMap(item => item.dropSources)]) {
    assert.equal(record.instanceType, record.raidInstance ? 'raid' : 'normal');
    assert.equal(Object.keys(record).some(key => key.startsWith('_')), false, 'Internal parsing state must not enter the public dataset.');
}
assert(actual.wikiEntities.npcs.includes('Synthetic skipped NPC'), 'A statless/skipped monster page remains known to the catalog.');
assert(actual.wikiEntities.npcs.includes('Synthetic alternate monster'), 'A recognized NPC template contributes its in-game name alias.');
for (const name of ['Synthetic statless item', 'Synthetic alternate item', 'Synthetic skipped item']) assert(actual.wikiEntities.items.includes(name), `${name} remains known even without item stats.`);
assert(actual.wikiEntities.titles.includes('Synthetic public redirect'), 'Public redirect titles prevent false missing-page prompts.');
assert(actual.wikiEntities.titles.includes(zone), 'Uncategorized public main-namespace pages remain known.');
const source = readFileSync(sourcePath, 'utf8');
assert(source.includes('$npcs = $this->sortNpcRecords( $npcs );'),'Production export uses the same ordering exercised by the legacy projection fixture.');
assert(source.includes("'wikiEntitiesComplete' => $limit === 0"), 'Limited test exports cannot authorize absence prompts.');
assert(source.includes("'npcLootSourcesIncluded' => true"),'A fresh reconciled production pack exposes its additive capability marker');
assert(source.includes('$items = $this->mergeNpcLootSources( $items, $wikiPageFactory );'),'Production export uses the tested NPC loot reconciliation');
assert(source.includes("[ 'page_namespace' => NS_MAIN ]"), 'The presence index excludes private/user namespaces.');
console.log('Wiki raid instances: section-scoped variants, shared/exclusive bosses, source provenance, locations, bounds and legacy last-wins projection passed.');
console.log('Wiki presence index: skipped entity pages, template name aliases, public title/redirect fallback and limited-export completeness passed.');
