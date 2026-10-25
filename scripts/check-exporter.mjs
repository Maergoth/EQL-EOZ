import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../server/BuildEyeOfZommPack.php', import.meta.url), 'utf8');
if (!source.includes("'schemaVersion' => 3")) throw new Error('Exporter must emit schemaVersion 3.');
const collectorPath = fileURLToPath(new URL('../server/ItemLootSourceCounts.php', import.meta.url));
const parserPath = fileURLToPath(new URL('../server/NpcLootWikitext.php', import.meta.url));
const collector = readFileSync(collectorPath, 'utf8');
const parser = readFileSync(parserPath, 'utf8');
assert(source.includes("require_once __DIR__ . '/ItemLootSourceCounts.php';"), 'Producer requires its global-count collector.');
assert(collector.includes("require_once __DIR__ . '/../extensions/DynamicZoneList/NpcLootWikitext.php';"), 'Collector retains its deployed wiki parser path.');
assert(parser.includes('final class EqlNpcLootWikitext'), 'The matching source parser is mirrored.');
assert(source.includes("'lootSourceCountsVersion' => 1"), 'The producer marks cached count metadata.');
assert(source.includes("'lootSourceCounts' => (object)$lootSourceCounts"), 'The catalog includes statless item counts, preserving an empty JSON object.');
const schema = JSON.parse(readFileSync(new URL('../server/eye-of-zomm-pack.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.properties.meta.properties.lootSourceCountsVersion.const, 1);
assert.equal(schema.properties.lootSourceCounts.additionalProperties.$ref, '#/$defs/lootSourceCount');
assert.deepEqual(schema.$defs.lootSourceCount.required, ['lootSourceCount', 'lootSourceCountComplete', 'lootSourceNpcs']);
assert.equal(schema.properties.npcs.items.properties.aliases.type, 'array');
for (const field of schema.$defs.lootSourceCount.required) {
    assert.deepEqual(schema.properties.items.items.properties[field], schema.$defs.lootSourceCount.properties[field], `Rich item ${field} matches catalog metadata.`);
}

const parseMethod = source.match(/    private function parseLocation[\s\S]*?(?=\n    private function extractBalancedTemplate)/)?.[0];
const normalizeMethod = source.match(/    private function intIfWhole[\s\S]*?(?=\n    private function maybePause)/)?.[0];
if (!parseMethod || !normalizeMethod) throw new Error('Unable to isolate exporter location parser.');
const candidateMethod = source.match(/    private function rememberPublicLootSource[\s\S]*?(?=\n    private function resolveLootTitle)/)?.[0];
if (!candidateMethod) throw new Error('Unable to isolate exporter candidate identity boundary.');

const fixtures = [
    ['{{loc|1208|-714|12}}', [1208, -714, 12]],
    ['(1208, -714), (1228, -706)', [1208, -714]],
    ['1208, -714', [1208, -714]],
    ['X 1208, Y -714, Z 12.5', [1208, -714, 12.5]],
    ['', null]
];
const php = `<?php
class LocationParserHarness {
${parseMethod}
${normalizeMethod}
    public function parse(string $value) { return $this->parseLocation($value); }
}
$parser = new LocationParserHarness();
$fixtures = json_decode(getenv('EOZ_EXPORTER_FIXTURES'), true);
$out = [];
foreach ($fixtures as $fixture) { $out[] = $parser->parse($fixture[0]); }
// Keep the mirrors byte-identical to the wiki layout. Only this isolated
// harness substitutes the parser dependency; no MediaWiki service is loaded.
eval(substr(file_get_contents(getenv('EOZ_LOOT_PARSER')), 5));
$collector = file_get_contents(getenv('EOZ_LOOT_COLLECTOR'));
$collector = str_replace("require_once __DIR__ . '/../extensions/DynamicZoneList/NpcLootWikitext.php';", '', $collector);
eval(substr($collector, 5));
class Title {
    public function __construct(private string $name) {}
    public function getText() { return $this->name; }
    public function getArticleID() { return $this->name === 'Guardian alias' ? 99 : 1; }
}
class MediaWikiServices {
    public static function getInstance() { return new self(); }
    public function getRedirectLookup() { return $this; }
    public function getRedirectTarget($title) { return $title->getText() === 'Guardian alias' ? new Title('Guardian 1') : null; }
}
class CandidateIdentityHarness {
    private EqlItemLootSourceCounts $lootCounts;
    private array $lootTitleMemo = [];
    public function __construct() { $this->lootCounts = new EqlItemLootSourceCounts(); }
    private function publicLootText($title, $page) { return '{{Namedmobpage}}'; }
${candidateMethod}
    public function remember($name) { $this->rememberPublicLootSource('npc', new Title($name), null); }
    public function memo() { return $this->lootTitleMemo; }
}
$candidateIdentity = new CandidateIdentityHarness();
$candidateIdentity->remember('Guardian alias');
$candidateIdentity->remember('Guardian 1');
$resolve = static function (string $title): array {
    $title = $title === 'Guardian alias' ? 'Guardian 1' : $title;
    $title = $title === 'Synthetic ground alias' ? 'Ground Spawns' : $title;
    return ['title'=>$title, 'pageId'=>preg_match('/^Guardian ([1-6])$/', $title, $match) ? (int)$match[1] : null, 'public'=>true, 'complete'=>true];
};
$counts = new EqlItemLootSourceCounts();
$counts->item('Synthetic relic', "{{Itempage|itemname=Synthetic relic|dropsfrom=[[Zone One]]\n* [[Guardian 1]]\n* [[Guardian alias]]\n* [[Ground_Spawn]]\n* [[GROUND SPAWNS]]\n== Raid Instance ==\n[[Zone Two]]\n* [[Guardian 1]]}}");
for ($i = 2; $i <= 5; $i++) {
    $field = $i % 2 ? 'known_loot' : 'common_loot';
    $counts->npc('Guardian ' . $i, '{{Namedmobpage|zone=[[Another zone]]|' . $field . '={{:Synthetic relic}}}}');
}
$counts->npc('Ground Spawn', '{{Namedmobpage|common_loot={{:Synthetic relic}}}}');
$five = $counts->catalog($resolve)['Synthetic relic'];
$counts->npc('Guardian 6', '{{Namedmobpage|common_loot={{:Synthetic relic}}}}');
$six = $counts->catalog($resolve)['Synthetic relic'];
$counts->incomplete();
$incomplete = $counts->catalog($resolve)['Synthetic relic'];
$pets = new EqlItemLootSourceCounts();
$pets->item('Synthetic material', "{{Itempage|itemname=Synthetic material|dropsfrom=* [[A loathling lich pet]]\n* [[a carpet]]}}");
$ground = new EqlItemLootSourceCounts();
$ground->item('Synthetic material', "{{Itempage|itemname=Synthetic material|dropsfrom=* [[Synthetic ground alias]]\n* [[Ground Spawn Keeper]]}}");
$overflow = new EqlItemLootSourceCounts(100, 1);
$overflow->item('Synthetic material', "{{Itempage|itemname=Synthetic material|dropsfrom=* [[Guardian 1]]\n* [[Guardian 2]]}}");
$missing = new EqlItemLootSourceCounts();
$missing->npc('Guardian 1', '{{Namedmobpage|known_loot={{:Synthetic missing material}}}}');
echo json_encode(['locations'=>$out, 'five'=>$five, 'six'=>$six, 'incomplete'=>$incomplete,
    'pets'=>$pets->catalog($resolve)['Synthetic material'],
    'ground'=>$ground->catalog($resolve)['Synthetic material'],
    'overflow'=>$overflow->catalog($resolve)['Synthetic material'],
    'missing'=>$missing->catalog($resolve)['Synthetic missing material'],
    'candidateMemo'=>$candidateIdentity->memo()]);
`;
const result = spawnSync('php', [], {
    input:php,
    encoding:'utf8',
    env:{ ...process.env, EOZ_EXPORTER_FIXTURES:JSON.stringify(fixtures), EOZ_LOOT_PARSER:parserPath, EOZ_LOOT_COLLECTOR:collectorPath }
});
if (result.error?.code === 'ENOENT') {
    console.log('Exporter source checks passed (PHP runtime unavailable for fixtures).');
    process.exit(0);
}
if (result.status !== 0) throw new Error(result.stderr || 'Exporter location fixture runner failed.');
const actual = JSON.parse(result.stdout || '[]');
assert.deepEqual(actual.locations, fixtures.map(([, expected]) => expected));
const countRecord = (names, complete = true) => ({lootSourceNpcs:names, lootSourceCount:names.length, lootSourceCountComplete:complete});
const fiveNames = Array.from({length:5}, (_, index) => `Guardian ${index + 1}`);
assert.deepEqual(actual.five, countRecord(fiveNames), 'Cross-zone, instance and redirect sources count once; exact Ground Spawn/Spawns labels cannot turn five monsters into six.');
assert.deepEqual(actual.six, countRecord([...fiveNames, 'Guardian 6']), 'Authored NPC Common and Unique loot both reach the global six-monster boundary.');
assert.deepEqual(actual.incomplete, countRecord([...fiveNames, 'Guardian 6'], false), 'An incomplete scan retains only its proven lower bound.');
assert.deepEqual(actual.pets, countRecord(['a carpet']), 'Explicit pet labels are excluded without substring filtering.');
assert.deepEqual(actual.ground, countRecord(['Ground Spawn Keeper']), 'Canonical Ground Spawns aliases are excluded while longer monster names are retained.');
assert.deepEqual(actual.overflow, countRecord(['Guardian 1'], false), 'Result budgets cannot prove a small complete count.');
assert.deepEqual(actual.missing, countRecord(['Guardian 1']), 'NPC-authored statless and missing materials receive catalog counts.');
assert.deepEqual(actual.candidateMemo, {'Guardian 1':{title:'Guardian 1',pageId:1,public:true,complete:true}}, 'A categorized redirect never memoizes its own page ID; the public canonical candidate does.');
console.log('Exporter schema, location and mirrored global loot-count fixtures passed.');
