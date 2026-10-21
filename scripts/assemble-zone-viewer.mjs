import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const expectedSha256 = 'dee6e2d5882d24ede3823da4b5eb12bbbe84aec0c980ea94f68eda9e662a3a0d';
const parts = [
  new URL('../vendor/zoneviewer/ZoneViewerApp.part01', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part02', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part03', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part04', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part05', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part06', import.meta.url),
  new URL('../vendor/zoneviewer/ZoneViewerApp.part07', import.meta.url),
];
const output = new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url);
const buffers = await Promise.all(parts.map((part) => readFile(part)));
const bundle = Buffer.concat(buffers);
const actualSha256 = createHash('sha256').update(bundle).digest('hex');

if (actualSha256 !== expectedSha256) {
  throw new Error(`Zone Viewer bundle integrity mismatch: expected ${expectedSha256}, received ${actualSha256}`);
}

await writeFile(output, bundle);
console.log(`Zone Viewer assembled and verified (${bundle.length.toLocaleString()} bytes).`);
