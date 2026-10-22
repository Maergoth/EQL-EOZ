import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseAssetNames(version, platform) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must match the package version contract.');
    if (platform === 'win32') return [`EQLWiki-Eye-of-Zomm-Setup-${version}-x64.exe`];
    if (platform === 'linux') return [`EQLWiki-Eye-of-Zomm-${version}-x64.AppImage`, `EQLWiki-Eye-of-Zomm-${version}-x64.deb`];
    throw new Error(`Unsupported release platform ${platform}.`);
}

export function checksumFileName(platform) {
    if (!['win32','linux'].includes(platform)) throw new Error(`Unsupported release platform ${platform}.`);
    return `SHA256SUMS-${platform === 'win32' ? 'Windows' : 'Linux'}-x64.txt`;
}

async function checksumText(directory, version, platform) {
    const lines = [];
    for (const name of releaseAssetNames(version, platform)) {
        const bytes = await readFile(join(directory, name));
        if (!bytes.length) throw new Error(`Release asset ${name} is empty.`);
        lines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
    }
    return `${lines.join('\n')}\n`;
}

export async function writeReleaseChecksums(directory, version, platform) {
    await writeFile(join(directory, checksumFileName(platform)), await checksumText(directory, version, platform));
}

export async function verifyReleaseChecksums(directory, version, platform) {
    const expected = await checksumText(directory, version, platform);
    const recorded = await readFile(join(directory, checksumFileName(platform)), 'utf8');
    if (recorded !== expected) throw new Error(`Release ${platform} assets do not match their SHA-256 checksum file.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const platform = process.argv[2];
    const root = fileURLToPath(new URL('../', import.meta.url));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const operation = process.argv.includes('--verify') ? verifyReleaseChecksums : writeReleaseChecksums;
    const directoryIndex = process.argv.indexOf('--directory');
    const directory = directoryIndex < 0 ? join(root, 'dist') : resolve(process.argv[directoryIndex + 1]);
    await operation(directory, pkg.version, platform);
    console.log(`${platform} release assets ${process.argv.includes('--verify') ? 'verified' : 'hashed'} for v${pkg.version}.`);
}
