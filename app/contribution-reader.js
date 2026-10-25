import {itemExaltationBaseIdentity, normalizeWikiIdentity} from './wiki-identity.js';

const identity=(name,resolveName)=>normalizeWikiIdentity(resolveName(itemExaltationBaseIdentity(name)));
const editable=candidate=>candidate?.kind==='item'&&!candidate.planId&&!['submitted','partial','needs-attention'].includes(candidate.status);
const names=(candidate,resolveName)=>[...new Set([candidate.name,candidate.title].map(name=>identity(name,resolveName)).filter(Boolean))];
// OCR can confuse rn with m. Other corrections are limited to one character in
// a multiword name, and must identify exactly one existing log-backed draft.
function closeName(left,right){
    if(Math.min(left.length,right.length)<10||!left.includes(' ')||!right.includes(' '))return false;
    if(left.replace(/rn/g,'m')===right.replace(/rn/g,'m'))return true;
    if(Math.abs(left.length-right.length)>1)return false;
    let previous=Array.from({length:right.length+1},(_,index)=>index);
    for(let row=1;row<=left.length;row++){
        const next=[row];for(let column=1;column<=right.length;column++)next[column]=Math.min(next[column-1]+1,previous[column]+1,previous[column-1]+(left[row-1]===right[column-1]?0:1));
        previous=next;
    }
    return previous[right.length]===1;
}
export function contributionReaderTarget(observation,candidates,{resolveName=value=>value,isKnownName=()=>false,linkedIds=[]}={}){
    if(observation?.subject?.kind!=='item'||!['ocr','manual'].includes(observation.kind))return null;
    const read=identity(observation.subject.name,resolveName);if(!read)return null;
    const existing=(Array.isArray(candidates)?candidates:[]).filter(candidate=>editable(candidate)&&
        (linkedIds.includes(candidate.id)||(candidate.evidence||[]).some(evidence=>evidence.kind==='game-log')));
    const exact=existing.filter(candidate=>names(candidate,resolveName).includes(read));
    if(exact.length)return exact.length===1?exact[0]:null;
    if(isKnownName(itemExaltationBaseIdentity(observation.subject.name)))return null;
    const close=existing.filter(candidate=>names(candidate,resolveName).some(name=>closeName(read,name)));
    return close.length===1?close[0]:null;
}

// An open editor is not proof that an old journal frame belongs to its item.
// Match the current native reader and the item before applying live proposals.
export function contributionReaderMatches(observation,{capture,candidate,candidates=null,linkedIds=[],startedAt,now=Date.now(),resolveName=value=>value,isKnownName=()=>false}={}){
    const at=Date.parse(observation?.capturedAt||'');
    if(candidate?.kind!=='item'||candidate.planId||['submitted','partial','needs-attention'].includes(candidate.status)||
        observation?.kind!=='ocr'||observation.owner!=='contribution'||observation.parser?.name!=='item-examine'||observation.subject?.kind!=='item'||
        capture?.owner!=='contribution'||capture.phase!=='running'||!capture.sessionId||!capture.source?.id||!Number.isSafeInteger(capture.generation)||
        observation.sessionId!==capture.sessionId||observation.input?.captureGeneration!==capture.generation||observation.input?.sourceId!==capture.source.id||
        !Number.isFinite(at)||at<startedAt||at>now||now-at>30000)return false;
    if(candidates)return contributionReaderTarget(observation,candidates,{resolveName,isKnownName,linkedIds})?.id===candidate.id;
    const name=identity(observation.subject.name,resolveName);
    return Boolean(name)&&names(candidate,resolveName).includes(name);
}
