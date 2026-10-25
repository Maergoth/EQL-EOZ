import { itemExaltationBaseIdentity, normalizeWikiIdentity } from './wiki-identity.js';
import { contributionReaderTarget } from './contribution-reader.js';

export const discoveryItemIdentity = name => normalizeWikiIdentity(itemExaltationBaseIdentity(name));
const validRequest = value => value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 240 &&
    ['item-link','spawn-location'].includes(value.purpose) && /^capture-[1-9]\d{0,14}$/.test(value.captureRequest || '') &&
    (value.purpose === 'item-link' ? Boolean(discoveryItemIdentity(value.name)) : typeof value.candidateId === 'string' && Boolean(value.candidateId));

// Main-renderer coordinator. A notice completes only with evidence from the
// explicit request's reader session or freshly armed next-/loc target.
export function createDiscoveryContributionFlow({begin, cancel, status, dismiss = () => {}, now = Date.now} = {}) {
    const requests = new Map();
    let disposed = false;
    const current = record => !disposed && requests.get(record.request.id) === record;
    const cleanup = (request, extra = {}) => Promise.resolve().then(() => cancel({...request,...extra})).catch(() => {});
    async function fail(record, message) {
        if (!current(record)) return;
        requests.delete(record.request.id);
        await cleanup(record.request);
        try { await status({...record.request,status:'retry',message:String(message || 'Try Contribute again, or dismiss this notice.').slice(0,400)}); }
        catch { /* A dismissed or superseded host request cannot be completed. */ }
    }
    async function finish(record, evidence) {
        if (!current(record) || record.finishing) return;
        record.finishing = true;
        try {
            const result = await status({...record.request,...evidence,status:'captured'});
            if (result?.ok === false) throw Error(result.error || 'The discovery notice could not be completed.');
        } catch (error) {
            if (current(record)) {record.finishing = false; await fail(record,error.message);}
            return;
        }
        if (!current(record)) return;
        requests.delete(record.request.id);
        await cleanup(record.request,{completed:true});
    }
    function itemMatch(record, observation, match) {
        const proof = record.capture, at = Date.parse(observation?.capturedAt || '');
        const currentProof=proof && observation?.kind === 'ocr' && observation.owner === 'contribution' && observation.subject?.kind === 'item' &&
            observation.parser?.name === 'item-examine' && Number.isFinite(at) && at >= record.startedAt && at <= now() &&
            observation.sessionId === proof.sessionId && observation.input?.captureGeneration === proof.generation &&
            observation.input?.sourceId === proof.sourceId;
        if(!currentProof)return null;
        if(discoveryItemIdentity(observation.subject.name)===discoveryItemIdentity(record.request.name))return observation.subject.name;
        // A corrected name is a separate proposal, never a rewritten native
        // observation. Bind it to this ready draft and independently check the
        // same narrow typo against every pending linked request.
        if(!record.candidateId||match?.candidateId!==record.candidateId||match.observedName!==observation.subject.name||
            discoveryItemIdentity(match.name)!==discoveryItemIdentity(record.request.name))return null;
        const candidates=[...new Map([...requests.values()].filter(value=>value.request.purpose==='item-link').map(value=>{
            const id=value.candidateId||value.request.candidateId||value.request.id;
            return[id,{id,kind:'item',name:value.request.name,title:value.request.name,status:'needs-review'}];
        })).values()];
        const target=contributionReaderTarget(observation,candidates,{linkedIds:candidates.map(value=>value.id)});
        return target?.id===record.candidateId?record.request.name:null;
    }
    function recordItem(observation, match=null) {
        let handled = false;
        for (const record of requests.values()) {
            if (record.request.purpose !== 'item-link' || record.finishing) continue;
            const matchedName=itemMatch(record,observation,match);
            if (matchedName) {handled = true; void finish(record,{matchedName});}
            // The first frame can arrive while start's IPC reply is in flight.
            // Buffer a few originals, then validate against the returned proof.
            else if (!record.capture && observation?.kind === 'ocr' && observation.owner === 'contribution' && observation.parser?.name === 'item-examine' && Date.parse(observation.capturedAt) >= record.startedAt) {
                record.buffer.push({observation,match}); if (record.buffer.length > 4) record.buffer.shift();
            }
        }
        return handled;
    }
    function ready(request, result) {
        const record = requests.get(request?.id);
        if (!record || record.request.captureRequest !== request.captureRequest || !current(record)) return;
        if (!result?.ok || result.cancelled) {void fail(record,result?.error || 'Item reading was cancelled. Try Contribute again.'); return;}
        if (request.purpose !== 'item-link' || result.needsSource) return;
        if(typeof result.candidateId==='string'&&result.candidateId&&result.candidateId.length<=240){
            if(record.candidateId&&record.candidateId!==result.candidateId){void fail(record,'The linked item draft changed. Try Contribute again.');return;}
            record.candidateId=result.candidateId;
        }
        const capture = result.capture;
        if (capture?.owner !== 'contribution' || capture.phase !== 'running' || !capture.sessionId || !Number.isSafeInteger(capture.generation) || !capture.source?.id) return;
        record.capture = {sessionId:capture.sessionId,generation:capture.generation,sourceId:capture.source.id};
        for (const {observation,match} of record.buffer.splice(0)) {const matchedName=itemMatch(record,observation,match);if(matchedName){void finish(record,{matchedName});break;}}
    }
    async function request(value) {
        if (disposed || !validRequest(value)) return {ok:false,error:'Invalid discovery contribution request.'};
        const prior = requests.get(value.id);
        if (prior?.request.captureRequest === value.captureRequest) return {ok:true};
        if (requests.size >= 20 && !prior) return {ok:false,error:'Finish or dismiss another discovery request first.'};
        const record = {request:{...value},candidateId:value.candidateId||null,startedAt:now(),capture:null,buffer:[],finishing:false};
        requests.set(value.id,record);
        if (prior) await cleanup(prior.request);
        if (!current(record)) return {ok:false,cancelled:true};
        try {
            const result = await begin(record.request);
            ready(record.request,result);
            return result;
        } catch (error) {await fail(record,error.message); return {ok:false,error:error.message};}
    }
    function recordLocation(location) {
        // The workspace calls this only after its live log source, zone,
        // cursor and re-armed wall-clock boundary have all been accepted.
        for (const record of requests.values()) {
            if (record.request.purpose !== 'spawn-location' || record.request.candidateId !== location?.candidateId || record.finishing) continue;
            void finish(record,{candidateId:location.candidateId}); return true;
        }
        return false;
    }
    async function cancelRequest(value, {close = false} = {}) {
        const record = requests.get(value?.id);
        if (record && value.captureRequest && record.request.captureRequest !== value.captureRequest) return;
        const request = record?.request || value;
        if (!request?.id) return;
        if (record) requests.delete(request.id);
        await cleanup(request);
        if (close) try {await dismiss(request);} catch { /* The host may already have removed it. */ }
    }
    function cancelWhere(predicate, options) {
        return Promise.all([...requests.values()].filter(record => predicate(record.request)).map(record => cancelRequest(record.request,options)));
    }
    return {request,ready,recordItem,recordLocation,cancel:cancelRequest,cancelWhere,
        snapshot:() => [...requests.values()].map(record => ({...record.request})),
        async dispose() {disposed = true; await cancelWhere(() => true,{close:true});}};
}
