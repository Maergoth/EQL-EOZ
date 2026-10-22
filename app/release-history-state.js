import { RELEASE_HISTORY } from './release-history.js';

export const RELEASE_SEEN_STORAGE_KEY='eql-eye-of-zomm-release-seen-v1';
const valid=value=>typeof value==='string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value);
export function compareReleaseVersions(left,right) {
    if(!valid(left)||!valid(right)) return 0;
    const a=left.split('.').map(Number),b=right.split('.').map(Number);
    for(let index=0;index<3;index++) if(a[index]!==b[index]) return Math.sign(a[index]-b[index]);
    return 0;
}
export function releaseHistoryUpTo(version) {
    return RELEASE_HISTORY.filter(release=>!valid(version)||compareReleaseVersions(release.version,version)<=0);
}
export function createReleaseSeenStore({storage=globalThis.localStorage,onWarning=()=>{}}={}) {
    const seen=new Set();let warned=false;
    try {
        const raw=storage?.getItem(RELEASE_SEEN_STORAGE_KEY);
        if(raw && raw.length<65536) {
            const value=JSON.parse(raw);
            if(value.schemaVersion===1) for(const version of (Array.isArray(value.seen)?value.seen:[]).slice(-2000)) if(valid(version)) seen.add(version);
        }
    } catch { /* Damaged optional read markers must not block the release tour. */ }
    function save() {
        try {storage?.setItem(RELEASE_SEEN_STORAGE_KEY,JSON.stringify({schemaVersion:1,seen:[...seen].slice(-2000)}));return true;}
        catch {if(!warned){warned=true;try{onWarning('Viewed releases could not be saved on this device.');}catch{}}return false;}
    }
    return {
        isSeen:version=>seen.has(version),seenVersions:()=>[...seen],
        unread:version=>releaseHistoryUpTo(version).filter(release=>!seen.has(release.version)),
        markSeen(version) {if(!valid(version))return false;seen.add(version);return save();},
        markAllSeen(version) {for(const release of releaseHistoryUpTo(version))seen.add(release.version);return save();}
    };
}
