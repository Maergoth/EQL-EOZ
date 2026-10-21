import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as browse from '../app/item-browse.js';

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

console.log('Wiki class filtering passed: exporter complements, legacy exclusions, mixed profiles, explicit includes, and unknown classes.');
