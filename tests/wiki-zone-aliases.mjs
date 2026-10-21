import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../server/BuildEyeOfZommPack.php', import.meta.url), 'utf8');
const catalogPath = fileURLToPath(new URL('../server/zone-catalog.json', import.meta.url));
const extract = (name, next) => {
    const method = source.match(new RegExp(`    private function ${name}[\\s\\S]*?(?=\\n    private function ${next})`))?.[0];
    assert.ok(method, `Exporter method ${name} is available`);
    return method;
};
const methods = [
    extract('loadZoneCatalog', 'listPagesInCategory').replace("__DIR__ . '/zone-catalog.json'", "getenv('EOZ_CATALOG_PATH')"),
    extract('buildNpcRecords', 'buildItemRecord'),
    extract('detectZonesFromCategories', 'detectZonesFromField'),
    extract('detectZonesFromField', 'detectZonesFromTitle'),
    extract('detectZonesFromTitle', 'detectEra'),
    extract('detectEra', 'parseClasses'),
    extract('parseLevelRange', 'maybePause')
].join('\n');

// Public wiki category/field names differ from the viewer's display labels.
// Preserve the viewer names and test exact aliases through the real exporter.
const fixtures = [
    ['Kael Drakkel', 'Kael Drakkal'],
    ['Neriak Foreign Quarter', 'Neriak - Foreign Quarter'],
    ['Neriak Commons', 'Neriak - Commons'],
    ['Neriak Third Gate', 'Neriak - Third Gate'],
    ['Northern Karana', 'North Karana'],
    ['Northern Plains of Karana', 'North Karana'],
    ['Southern Karana', 'South Karana'],
    ['Southern Plains of Karana', 'South Karana'],
    ['Burning Woods', 'Burning Wood'],
    ['Crypt of Dalnir', 'Dalnir'],
    ["Beholder's Maze", 'Gorge of King Xorbb'],
    ['Clan Runnyeye', 'Runnyeye Citadel'],
    ['Kerra Isle', 'Kerra Island'],
    ['Qeynos Catacombs', 'Qeynos Aqueducts'],
    ['Southern Ro', 'South Ro'],
    ['North Felwithe', 'Northern Felwithe'],
    ['The Lair of the Splitpaw', 'Splitpaw Lair'],
    ['Infected Paw', 'Splitpaw Lair']
];
const npcFixtures = [
    ['Synthetic guardian', '[[East Commonlands]]', ['Northern Karana'], ['East Commonlands']],
    ['Synthetic traveler', '[[Northern Karana]], [[Qeynos Hills]]', ['Northern Karana'], ['North Karana', 'Qeynos Hills']],
    ['Synthetic pet', '[[Gorge of King Xorbb]], [[Runnyeye]]', ["Beholder's Maze"], ['Gorge of King Xorbb', 'Runnyeye Citadel']],
    ['Synthetic merchant', '[[Grobb|Grobb]]', ['Neriak Foreign Quarter'], ['Grobb']],
    ['Synthetic guard', '[[Northern Karana]], [[Northern Plains of Karana]]', ['Qeynos Hills'], ['North Karana']],
    ['Synthetic explorer', 'Unknown place, [[East Commonlands]]', ['Northern Karana'], ['East Commonlands']],
    ['Synthetic missing field', '', ['Kael Drakkel'], ['Kael Drakkal']],
    ['Synthetic unknown field', 'Various', ['Neriak Commons'], ['Neriak - Commons']],
    ['Synthetic suffix (Southern Ro)', 'Various', ['Named Mobs'], ['South Ro']],
    ['Synthetic unknown', 'Various', ['Named Mobs'], ['']]
];
const php = `<?php
class Title {
    private string $text;
    public function __construct(string $text) { $this->text = str_replace('_', ' ', $text); }
    public static function makeTitle($namespace, string $text) { return new self($text); }
    public function getText() { return $this->text; }
}
class ZoneAliasHarness {
    private array $zoneCatalog = [];
    private array $zoneAliasMap = [];
${methods}
    public function fatalError(string $message) { throw new Exception($message); }
    public function run(array $fixtures) {
        $this->loadZoneCatalog();
        $out = [];
        foreach ($fixtures as [$alias, $expected]) {
            $out[] = [
                $this->detectZonesFromCategories([$alias]),
                $this->detectZonesFromField('[[' . $alias . ']]'),
                $this->detectZonesFromTitle('Synthetic guardian (' . $alias . ')')
            ];
        }
        $out[] = $this->detectZonesFromField('[[Neriak|Neriak Commons]], [[Neriak|Neriak Third Gate]]');
        $out[] = $this->detectZonesFromField('Various');
        $out[] = $this->detectZonesFromTitle('Synthetic guardian (Unmapped place)');
        return $out;
    }
    public function runNpc(array $fixtures) {
        $this->loadZoneCatalog();
        $out = [];
        foreach ($fixtures as [$title, $zoneField, $categories]) {
            $text = "{{Namedmobpage\\n| zone = " . $zoneField . "\\n| level = 12\\n| location = (10, 20, 30)\\n}}";
            $page = new class($text) {
                private string $text;
                public function __construct(string $text) { $this->text = $text; }
                public function getContent() {
                    return new class($this->text) {
                        private string $text;
                        public function __construct(string $text) { $this->text = $text; }
                        public function getText() { return $this->text; }
                    };
                }
                public function getRevisionRecord() {
                    return new class { public function getId() { return 123; } };
                }
            };
            $factory = new class($page) {
                private $page;
                public function __construct($page) { $this->page = $page; }
                public function newFromTitle($title) { return $this->page; }
            };
            $out[] = $this->buildNpcRecords($factory, (object)[
                'page_namespace' => 0, 'page_title' => str_replace(' ', '_', $title)
            ], $categories);
        }
        return $out;
    }
}
$harness = new ZoneAliasHarness();
echo json_encode([
    'aliases' => $harness->run(json_decode(getenv('EOZ_ZONE_FIXTURES'), true)),
    'npcs' => $harness->runNpc(json_decode(getenv('EOZ_NPC_ZONE_FIXTURES'), true))
]);
`;
const result = spawnSync('php', [], {
    input:php,
    encoding:'utf8',
    env:{ ...process.env, EOZ_CATALOG_PATH:catalogPath, EOZ_ZONE_FIXTURES:JSON.stringify(fixtures), EOZ_NPC_ZONE_FIXTURES:JSON.stringify(npcFixtures) }
});
if (result.error?.code === 'ENOENT') {
    console.log('Wiki zone-alias behavioral checks skipped: PHP runtime unavailable.');
    process.exit(0);
}
assert.equal(result.status, 0, result.stderr || 'Exporter alias harness completes');
const expected = fixtures.map(([, canonical]) => [[canonical], [canonical], [canonical]]);
expected.push(['Neriak - Commons', 'Neriak - Third Gate'], [], []);
const actual = JSON.parse(result.stdout);
assert.deepEqual(actual.aliases, expected, 'Wiki categories, fields, and title suffixes resolve conservatively');
for (const [index, [title, , , zones]] of npcFixtures.entries()) {
    assert.deepEqual(actual.npcs[index].map(record => record.zone), zones, `${title}: explicit zones precede categories, with category/title/unknown fallbacks`);
    for (const record of actual.npcs[index]) {
        assert.equal(record.name, title);
        assert.equal(record.wikiTitle, title);
        assert.equal(record.revisionId, 123);
        assert.equal(record.avgLevel, 12);
        assert.deepEqual(record.loc, [10, 20, 30]);
    }
}
console.log(`Wiki zone-alias fixtures passed: ${fixtures.length} public aliases and ${npcFixtures.length} actual NPC export precedence/fallback cases.`);
