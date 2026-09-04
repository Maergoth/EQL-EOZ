import { build } from 'esbuild';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../app/workers/recast-route.worker.entry.js', import.meta.url));
const outfile = fileURLToPath(new URL('../app/workers/recast-route.worker.js', import.meta.url));

await build({
    entryPoints:[entry],
    outfile,
    bundle:true,
    format:'esm',
    platform:'browser',
    target:['es2022'],
    minify:true,
    legalComments:'eof',
    sourcemap:false,
    logLevel:'warning'
});

const output = await stat(outfile);
if (output.size > 1_800_000) throw new Error(`Navigation worker is unexpectedly large (${output.size} bytes).`);
console.log(`Navigation worker built (${Math.round(output.size / 1024)} KiB).`);

