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
const php = `<?php
class Maintenance {}
class Title {
    private string $text;
    public function __construct(string $value) { $this->text = str_replace('_', ' ', $value); }
    public static function makeTitle($namespace, string $value) { return new self($value); }
    public static function newFromText(string $value, $namespace = 0) { return new self($value); }
    public function getText() { return $this->text; }
    public function exists() { return isset($GLOBALS['fixtures'][$this->text]); }
}
define('NS_MAIN', 0);
$fixtures = json_decode(getenv('EOZ_RAID_FIXTURES'), true);
$source = file_get_contents(getenv('EOZ_EXPORTER_SOURCE'));
$source = str_replace("require_once __DIR__ . '/Maintenance.php';", '', $source);
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
            public function getRedirectTarget() { return null; }
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
$many = '[[' . ${JSON.stringify(zone)} . "]]\\n";
for ($index=0;$index<30;$index++) $many .= '* [[Synthetic normal ' . $index . "]]\\n";
$many .= "= Raid Instance =\\n[[" . ${JSON.stringify(zone)} . "]]\\n";
for ($index=0;$index<30;$index++) $many .= '* [[Synthetic raid ' . $index . "]]\\n";
echo json_encode(['npcs'=>$npcs,'items'=>$items,'bounded'=>$call('parseDropSources', $many),'wikiEntities'=>$call('wikiEntityIndex')]);
`;
const result = spawnSync('php', [], { input:php, encoding:'utf8', env:{ ...process.env,
    EOZ_EXPORTER_SOURCE:sourcePath, EOZ_CATALOG_PATH:catalogPath, EOZ_RAID_FIXTURES:JSON.stringify(fixtures) } });
if (result.error?.code === 'ENOENT') throw new Error('Raid exporter checks require PHP.');
assert.equal(result.status, 0, result.stderr || 'Actual exporter raid fixture harness must complete.');
const actual = JSON.parse(result.stdout);
const records = name => actual.npcs.filter(record => record.name === name);
const sources = name => actual.items.find(record => record.name === name).dropSources;
const raid = name => records(name).filter(record => record.raidInstance);
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
assert(source.includes("[ 'page_namespace' => NS_MAIN ]"), 'The presence index excludes private/user namespaces.');
console.log('Wiki raid instances: section-scoped variants, shared/exclusive bosses, source provenance, locations, bounds and legacy last-wins projection passed.');
console.log('Wiki presence index: skipped entity pages, template name aliases, public title/redirect fallback and limited-export completeness passed.');
