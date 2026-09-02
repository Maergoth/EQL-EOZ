import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const modules = [...html.matchAll(/<script\s+type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];

if (!modules.length) {
    throw new Error('No inline Zone Viewer module was found to validate.');
}

for (const [index, match] of modules.entries()) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: match[1],
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || `Inline Zone Viewer module ${index + 1} is invalid.\n`);
        process.exit(result.status || 1);
    }
}

console.log(`Validated ${modules.length} inline Zone Viewer module${modules.length === 1 ? '' : 's'}.`);
