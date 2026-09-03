import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../server/BuildEyeOfZommPack.php', import.meta.url), 'utf8');
if (!source.includes("'schemaVersion' => 3")) throw new Error('Exporter must emit schemaVersion 3.');

const parseMethod = source.match(/    private function parseLocation[\s\S]*?(?=\n    private function extractBalancedTemplate)/)?.[0];
const normalizeMethod = source.match(/    private function intIfWhole[\s\S]*?(?=\n    private function maybePause)/)?.[0];
if (!parseMethod || !normalizeMethod) throw new Error('Unable to isolate exporter location parser.');

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
echo json_encode($out);
`;
const result = spawnSync('php', [], {
    input:php,
    encoding:'utf8',
    env:{ ...process.env, EOZ_EXPORTER_FIXTURES:JSON.stringify(fixtures) }
});
if (result.error?.code === 'ENOENT') {
    console.log('Exporter source checks passed (PHP runtime unavailable for fixtures).');
    process.exit(0);
}
if (result.status !== 0) throw new Error(result.stderr || 'Exporter location fixture runner failed.');
const actual = JSON.parse(result.stdout || '[]');
if (JSON.stringify(actual) !== JSON.stringify(fixtures.map(([, expected]) => expected))) {
    throw new Error(`Exporter location fixtures failed: ${JSON.stringify(actual)}`);
}
console.log('Exporter schema and location fixtures passed.');
