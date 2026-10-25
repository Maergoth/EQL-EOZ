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
assert(parser.includes('static function contributionCoverage'), 'Producer and parser share affected-field coverage.');
assert(parser.includes('static function authoredPageKind'), 'Actual entity identity is independent from field capability.');
assert(parser.includes('static function itemContributionCard'), 'Quiet-card completeness has a shared pure authored-source proof.');
assert(source.includes("'contributionCard' => $contributionCard"), 'Every rich item carries source proof, including incomplete cards.');
assert(source.includes("'lootSourceCountsVersion' => 2"), 'The producer marks verified real-NPC count metadata.');
assert(source.includes("'lootSourceCounts' => (object)$lootSourceCounts"), 'The catalog includes statless item counts, preserving an empty JSON object.');
assert(source.includes("'lootSetsVersion' => 1"), 'The producer versions explicit set membership.');
assert(source.includes("'lootSets' => (object)$this->lootSets"), 'Set membership preserves an empty JSON object.');
const schema = JSON.parse(readFileSync(new URL('../server/eye-of-zomm-pack.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.properties.meta.properties.lootSourceCountsVersion.const, 2);
assert.equal(schema.properties.lootSourceCounts.additionalProperties.$ref, '#/$defs/lootSourceCount');
assert.deepEqual(schema.$defs.lootSourceCount.required, ['lootSourceCount', 'lootSourceCountComplete', 'lootSourceNpcs']);
assert.equal(schema.properties.npcs.items.properties.aliases.type, 'array');
assert.equal(schema.properties.npcs.items.properties.zoneScope.const, 'various');
assert.equal(schema.properties.npcs.items.properties.categoryZones.type, 'array');
assert.equal(schema.properties.zones.items.properties.viewerId.pattern,'^[a-z0-9][a-z0-9_]*$');
assert(source.includes("$record['zoneScope'] = 'various';"), 'Literal Various scope survives the source projection.');
assert.equal(schema.properties.meta.properties.lootSetsVersion.const, 1);
assert.equal(schema.properties.meta.properties.wikiRelationshipCoverageVersion.const, 1);
assert.equal(schema.properties.wikiRelationshipCoverage.additionalProperties.$ref, '#/$defs/relationshipCoverage');
assert(source.includes("'wikiRelationshipCoverage' => (object)$this->wikiRelationshipCoverage"), 'Statless affected-field facts remain in the top-level map.');
assert(!source.includes('automaticContributionPolicies'),'Whole-page lexical prototypes are absent from the final producer.');
assert.equal(schema.properties.lootSets.additionalProperties.$ref, '#/$defs/lootSet');
assert.equal(schema.properties.items.items.properties.contributionCard.$ref, '#/$defs/contributionCard');
assert.deepEqual(schema.$defs.contributionCard.required, ['schemaVersion', 'complete', 'questContext']);
assert.equal(schema.$defs.contributionCard.properties.schemaVersion.const, 1);
assert.equal(schema.$defs.contributionCard.additionalProperties, false);
assert.deepEqual(schema.$defs.lootSet.required, ['items', 'complete']);
assert.equal(schema.$defs.lootSet.properties.items.maxItems, 1000);
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
    private array $lootSourceKinds = [];
    private array $wikiRelationshipCoverage = [];
    private array $lootSets = [];
    private array $lootCollectionMemo = [];
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
    $counts->npc('Guardian ' . $i, '{{Namedmobpage|items_sold=Earlier stock|items_sold=Final stock|zone=[[Another zone]]|' . $field . '={{:Synthetic relic}}}}');
}
$counts->npc('Ground Spawn', '{{Namedmobpage|common_loot={{:Synthetic relic}}}}');
$five = $counts->catalog($resolve)['Synthetic relic'];
$counts->npc('Guardian 6', '{{MerchantPage|items_sold=Earlier stock|items_sold=Final stock|commonloot={{:Synthetic relic}}}}');
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
$duplicateSource = '{{Namedmobpage|items_sold=Earlier stock|items_sold=Final stock|known_loot={{:Synthetic relic}}}}';
$defaultDuplicateStrict = EqlNpcLootWikitext::analyseNpcPage($duplicateSource) === null;
$duplicateLoot = new EqlItemLootSourceCounts();
$duplicateLoot->item('Synthetic relic', '{{Itempage|itemname=Synthetic relic|dropsfrom=}}');
$duplicateLoot->npc('Guardian 1', '{{Namedmobpage|known_loot={{:Synthetic relic}}|known_loot=None}}');
$caseComplete = true;
$caseRows = EqlNpcLootWikitext::npcLootSources('{{Namedmobpage|known_loot={{Legacy Relic}}{{Legacy relic}}}}', $caseComplete, true, true, ['Legacy Relic'=>'Synthetic relic']);
$badgeComplete = true;
$badgeRows = EqlNpcLootWikitext::npcLootSources('{{Namedmobpage|known_loot={{Item Lore|A static description}}{{lootcheck}}{{:Synthetic relic}}}}', $badgeComplete, true, true);
$setComplete = true;
$setMembers = EqlNpcLootWikitext::globalGearSetItems('{{Gear Set|Synthetic relic|[[Set-only relic]]|Synthetic_relic}}', $setComplete);
$sets = new EqlItemLootSourceCounts();
$sets->item('Synthetic relic', '{{Itempage|itemname=Synthetic relic|dropsfrom=}}');
$sets->sets(['Synthetic gear'=>['items'=>$setMembers, 'complete'=>$setComplete]]);
for ($i = 1; $i <= 5; $i++) { $sets->npc('Guardian ' . $i, '{{Namedmobpage|known_loot={{:Synthetic relic}}}}'); }
$sets->npc('Guardian 6', '{{Namedmobpage|known_loot={{:Synthetic gear}}{{:Synthetic relic}}}}');
$setCatalog = $sets->catalog($resolve);
$incompleteSets = new EqlItemLootSourceCounts();
$incompleteSets->sets(['Synthetic gear'=>['items'=>['Synthetic relic'], 'complete'=>false]]);
$incompleteSets->npc('Guardian 1', '{{Namedmobpage|known_loot={{:Synthetic gear}}}}');
$legacyHover = '<onlyinclude><div class="hbdiv">[[Synthetic relic]]<span class="hb">{{Itembox|itemname=Synthetic relic|statsblock=AC: 2}}</span></div></onlyinclude>{{Itempage|itemname=Synthetic relic}}';
echo json_encode(['locations'=>$out, 'five'=>$five, 'six'=>$six, 'incomplete'=>$incomplete,
    'pets'=>$pets->catalog($resolve)['Synthetic material'],
    'ground'=>$ground->catalog($resolve)['Synthetic material'],
    'overflow'=>$overflow->catalog($resolve)['Synthetic material'],
    'missing'=>$missing->catalog($resolve)['Synthetic missing material'],
    'defaultDuplicateStrict'=>$defaultDuplicateStrict,
    'duplicateLoot'=>$duplicateLoot->catalog($resolve)['Synthetic relic'],
    'templateKey'=>EqlNpcLootWikitext::templateInvocationKey('Template:legacy_Relic'),
    'caseTemplates'=>EqlNpcLootWikitext::globalNpcLootTemplateNames('{{Namedmobpage|known_loot={{Legacy Relic}}{{Legacy relic}}}}'),
    'caseComplete'=>$caseComplete, 'caseItems'=>array_column($caseRows, 'item'),
    'badgeComplete'=>$badgeComplete, 'badgeItems'=>array_column($badgeRows, 'item'),
    'setMembers'=>$setMembers, 'setComplete'=>$setComplete,
    'setCatalog'=>$setCatalog,
    'incompleteSet'=>$incompleteSets->catalog($resolve)['Synthetic relic'],
    'legacyTarget'=>EqlNpcLootWikitext::globalItemTemplateTarget($legacyHover),
    'legacyTrailing'=>EqlNpcLootWikitext::globalItemTemplateTarget(str_replace('</onlyinclude>', '{{Unknown}}</onlyinclude>', $legacyHover)),
    'legacyDynamic'=>EqlNpcLootWikitext::globalItemTemplateTarget(str_replace('AC: 2', '{{{value|AC: 2}}}', $legacyHover)),
    'candidateMemo'=>$candidateIdentity->memo(),
    'literalCard'=>EqlNpcLootWikitext::itemContributionCard('{{Itempage|itemname=Basic card|statsblock=AC: 2<br>WT: 0.1|relatedquests=* [[Synthetic quest]]|foraged=* [[Synthetic Vale]]|soldby={{ItemWhereTable|{{ItemWhereRow|[[Synthetic Vale]]|[[Merchant]]}}}}}}'),
    'unknownCard'=>EqlNpcLootWikitext::itemContributionCard('{{Itempage|itemname=Basic card|statsblock=AC: 2|custom_modifier=Hidden}}'),
    'truncatedCard'=>EqlNpcLootWikitext::itemContributionCard('{{Itempage|itemname=Basic card|statsblock='.implode('<br>',array_fill(0,16,'WT: 0.1')).'<br>Effect: Hidden}}')]);
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
assert.equal(actual.defaultDuplicateStrict,true,'Ordinary renderer/helper calls retain strict duplicate-parameter recognition.');
assert.deepEqual(actual.duplicateLoot,countRecord([]),'The final exact static loot parameter wins, while ordinary renderer calls remain strict.');
assert.equal(actual.templateKey, 'Legacy Relic');
assert.deepEqual(actual.caseTemplates, ['Legacy Relic', 'Legacy relic']);
assert.equal(actual.caseComplete, false, 'Case-distinct template titles require independent public proofs.');
assert.deepEqual(actual.caseItems, ['Synthetic relic']);
assert.equal(actual.badgeComplete, true, 'Reviewed static badges do not conceal authored items.');
assert.deepEqual(actual.badgeItems, ['Synthetic relic']);
assert.equal(actual.setComplete, true);
assert.deepEqual(actual.setMembers, ['Synthetic relic', 'Set-only relic']);
assert.deepEqual(actual.setCatalog['Synthetic relic'], countRecord([...fiveNames, 'Guardian 6']), 'A sixth set source reaches Common and overlaps direct references once.');
assert.deepEqual(actual.setCatalog['Set-only relic'], countRecord(['Guardian 6']));
assert.equal(Object.hasOwn(actual.setCatalog, 'Synthetic gear'), false, 'A set title never becomes a fictitious item.');
assert.deepEqual(actual.incompleteSet, countRecord(['Guardian 1'], false), 'Incomplete membership retains only a proved lower bound.');
assert.equal(actual.legacyTarget, 'Synthetic relic', 'Public proof accepts one unconditional static matching item hover.');
assert.equal(actual.legacyTrailing, null, 'Additional template output cannot prove a single item.');
assert.equal(actual.legacyDynamic, null, 'Dynamic item hover output remains unverified.');
assert.deepEqual(actual.incomplete, countRecord([...fiveNames, 'Guardian 6'], false), 'An incomplete scan retains only its proven lower bound.');
assert.deepEqual(actual.pets, countRecord(['a carpet']), 'Explicit pet labels are excluded without substring filtering.');
assert.deepEqual(actual.ground, countRecord(['Ground Spawn Keeper']), 'Canonical Ground Spawns aliases are excluded while longer monster names are retained.');
assert.deepEqual(actual.overflow, countRecord(['Guardian 1'], false), 'Result budgets cannot prove a small complete count.');
assert.deepEqual(actual.missing, countRecord(['Guardian 1']), 'NPC-authored statless and missing materials receive catalog counts.');
assert.deepEqual(actual.candidateMemo, {'Guardian 1':{title:'Guardian 1',pageId:1,public:true,complete:true}}, 'A categorized redirect never memoizes its own page ID; the public canonical candidate does.');
assert.deepEqual(actual.literalCard, {schemaVersion:1, complete:true, questContext:true}, 'Known acquisition and quest-link context is represented without inventing importance.');
assert.equal(actual.unknownCard.complete, false, 'Omitted auxiliary modifiers cannot authorize quiet decisions.');
assert.equal(actual.truncatedCard.complete, false, 'Effects beyond the sixteen-line rich bound cannot hide behind complete proof.');
console.log('Exporter schema, location and mirrored global loot-count fixtures passed.');
