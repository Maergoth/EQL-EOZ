import {itemExaltationBaseIdentity, normalizeWikiIdentity} from './wiki-identity.js';

// An open editor is not proof that an old journal frame belongs to its item.
// Match the current native reader and the item before applying live proposals.
export function contributionReaderMatches(observation,{capture,candidate,startedAt,now=Date.now(),resolveName=value=>value}={}){
    const at=Date.parse(observation?.capturedAt||'');
    if(candidate?.kind!=='item'||candidate.planId||['submitted','partial','needs-attention'].includes(candidate.status)||
        observation?.kind!=='ocr'||observation.owner!=='contribution'||observation.parser?.name!=='item-examine'||observation.subject?.kind!=='item'||
        capture?.owner!=='contribution'||capture.phase!=='running'||!capture.sessionId||!capture.source?.id||!Number.isSafeInteger(capture.generation)||
        observation.sessionId!==capture.sessionId||observation.input?.captureGeneration!==capture.generation||observation.input?.sourceId!==capture.source.id||
        !Number.isFinite(at)||at<startedAt||at>now||now-at>30000)return false;
    const identity=value=>normalizeWikiIdentity(resolveName(itemExaltationBaseIdentity(value)));
    const name=identity(observation.subject.name);
    return Boolean(name)&&[candidate.name,candidate.title].some(value=>identity(value)===name);
}
