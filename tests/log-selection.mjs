import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    inferEqRootPath,
    isEqLogName,
    isPathInside,
    newestEqLog,
    resolveConfiguredLog
} = require('../desktop/log-selection.cjs');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

assert(inferEqRootPath('C:\\EverQuest Legends\\Logs') === 'C:\\EverQuest Legends', 'Windows Logs folder infers game root');
assert(inferEqRootPath('C:\\EverQuest Legends\\Logs\\eqlog_Name_server.txt') === 'C:\\EverQuest Legends', 'Windows log infers game root');
assert(isEqLogName('eqlog_Name_server.2026.09.03.txt'), 'rotated log name accepted');
assert(!isEqLogName('debug.txt'), 'unrelated text file rejected');
assert(isPathInside('C:\\EverQuest Legends', 'C:\\EverQuest Legends\\Maps\\qeynos.txt'), 'Windows child path accepted');
assert(!isPathInside('C:\\EverQuest Legends', 'C:\\Windows\\win.ini'), 'Windows outside path rejected');

const root = await mkdtemp(join(tmpdir(), 'eye-of-zomm-log-selection-'));
try {
    const logs = join(root, 'Logs');
    await mkdir(logs);
    const oldLog = join(logs, 'eqlog_First_server.txt');
    const newLog = join(logs, 'eqlog_Second_server.txt');
    await writeFile(oldLog, 'old\n');
    await writeFile(newLog, 'new\n');
    await writeFile(join(logs, 'notes.txt'), 'ignore\n');
    await utimes(oldLog, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    await utimes(newLog, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));

    assert(await newestEqLog(root) === newLog, 'automatic mode chooses most recently modified eqlog');
    assert(await resolveConfiguredLog({ eqRootPath:root, logSelection:'automatic' }) === newLog, 'automatic configuration follows newest log');
    assert(await resolveConfiguredLog({ eqRootPath:root, logPath:oldLog, logSelection:'manual' }) === oldLog, 'manual configuration keeps chosen log');
} finally {
    await rm(root, { recursive:true, force:true });
}

console.log('Log selection tests passed.');
