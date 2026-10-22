import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_HISTORY} from '../app/release-history.js';
import {compareReleaseVersions} from '../app/release-history-state.js';

export function verifyReleaseHistory({version,history=RELEASE_HISTORY,changelog,readBytes}) {
    if(history[0]?.version!==version) throw new Error(`Release history needs a current ${version} entry before packaging.`);
    const seen=new Set();
    for(const [index,release] of history.entries()) {
        if(!/^\d+\.\d+\.\d+$/.test(release.version)||seen.has(release.version)) throw new Error('Release history contains a duplicate or invalid version.');
        if(index && compareReleaseVersions(history[index-1].version,release.version)<=0) throw new Error('Release history must be newest first.');
        seen.add(release.version);
        if(!changelog.includes(`## ${release.version} - ${release.title}`)||!release.changes.length) throw new Error(`Release ${release.version} needs matching changelog notes.`);
        if(compareReleaseVersions(release.version,'0.8.4')>=0 && !release.steps.length) throw new Error(`Release ${release.version} needs its own captured screenshots and walkthrough before packaging.`);
        for(const step of release.steps) {
            if(![step.title,step.copy,step.alt,step.caption].every(value=>typeof value==='string'&&value.length>10)) throw new Error(`Release ${release.version} has incomplete walkthrough text.`);
            if(!new RegExp(`^${release.version.replaceAll('.','\\.')}\\/[a-z0-9-]+$`).test(step.image)) throw new Error(`Release ${release.version} must use a version-owned screenshot path.`);
            const path=`app/assets/whats-new/${step.image}.png`,bytes=readBytes(path);
            if(!bytes || bytes.length<24 || bytes.length>12000000 || !Buffer.from(bytes).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Release screenshot ${path} is not a bounded PNG.`);
            const png=Buffer.from(bytes),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
            if(!width||!height||width>8192||height>8192) throw new Error(`Release screenshot ${path} exceeds dimension bounds.`);
            if(createHash('sha256').update(bytes).digest('hex')!==step.imageSha256) throw new Error(`Archived screenshot ${path} differs from its reviewed SHA-256. Archive a new version instead of overwriting history.`);
        }
    }
    for(const match of changelog.matchAll(/^## (\d+\.\d+\.\d+) - /gm)) if(!seen.has(match[1])) throw new Error(`Release ${match[1]} is missing from the browsable history.`);
    return {versions:seen.size,screenshots:history.reduce((sum,release)=>sum+release.steps.length,0)};
}

export function checkReleaseHistory() {
    const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
    return verifyReleaseHistory({version:pkg.version,changelog:readFileSync(resolve(root,'CHANGELOG.md'),'utf8'),readBytes:path=>readFileSync(resolve(root,path))});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log('Release history verified:',checkReleaseHistory());
