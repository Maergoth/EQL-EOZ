import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workerPath = fileURLToPath(new URL('../app/workers/recast-route.worker.js', import.meta.url));
const [details, source] = await Promise.all([stat(workerPath), readFile(workerPath, 'utf8')]);
if (details.size < 200_000 || details.size > 1_800_000) throw new Error(`Unexpected navigation worker size: ${details.size} bytes.`);
for (const marker of ['generation-failed', 'goal-unreachable', 'addEventListener']) {
    if (!source.includes(marker)) throw new Error(`Navigation worker is missing the ${marker} protocol marker.`);
}
if (/node:fs|\/workspace\/|[A-Z]:\\/.test(source)) throw new Error('Navigation worker contains a build-machine or Node filesystem reference.');
console.log(`Navigation worker packaging check passed (${Math.round(details.size / 1024)} KiB).`);

