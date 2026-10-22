import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Native overlay CSP forbids connect requests, including JSON-module fetches.
// Keep one data source for desktop/browser and ship a static script import.
export function appearanceModuleSource(source) {
    JSON.parse(source);
    return '// Generated from appearance-presets.json by scripts/build-appearance.mjs. Do not edit.\nexport default '+source.trim().replace(/\r\n?/g,'\n')+';\n';
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const source = await readFile(new URL('../app/appearance-presets.json',import.meta.url),'utf8');
    await writeFile(new URL('../app/appearance-presets.generated.js',import.meta.url),appearanceModuleSource(source));
}
