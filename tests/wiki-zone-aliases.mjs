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
    extract('detectZonesFromCategories', 'detectZonesFromField'),
    extract('detectZonesFromField', 'detectZonesFromTitle'),
    extract('detectZonesFromTitle', 'detectEra'),
    extract('cleanWikiText', 'normalizeZone'),
    extract('normalizeZone', 'intIfWhole')
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
const php = `<?php
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
}
echo json_encode((new ZoneAliasHarness())->run(json_decode(getenv('EOZ_ZONE_FIXTURES'), true)));
`;
const result = spawnSync('php', [], {
    input:php,
    encoding:'utf8',
    env:{ ...process.env, EOZ_CATALOG_PATH:catalogPath, EOZ_ZONE_FIXTURES:JSON.stringify(fixtures) }
});
if (result.error?.code === 'ENOENT') {
    console.log('Wiki zone-alias behavioral checks skipped: PHP runtime unavailable.');
    process.exit(0);
}
assert.equal(result.status, 0, result.stderr || 'Exporter alias harness completes');
const expected = fixtures.map(([, canonical]) => [[canonical], [canonical], [canonical]]);
expected.push(['Neriak - Commons', 'Neriak - Third Gate'], [], []);
assert.deepEqual(JSON.parse(result.stdout), expected, 'Wiki categories, fields, and title suffixes resolve conservatively');
console.log(`Wiki zone-alias fixtures passed: ${fixtures.length} public aliases across categories, fields, and title suffixes.`);
