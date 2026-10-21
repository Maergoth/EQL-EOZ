import { matchTrigger } from '../trigger-match-core.js';

self.onmessage = event => {
    const { id, input, batch } = event.data || {};
    if (!Number.isSafeInteger(id)) return;
    if (batch) {
        const results = [];
        for (const definition of batch.definitions || []) {
            self.postMessage({ id, matchingId:definition.id });
            for (const line of batch.lines || []) {
                const result = matchTrigger({ pattern:definition.trigger, mode:'regex', line:line.text });
                if (result.matched || result.error) results.push({ lineId:line.id, definitionId:definition.id, result });
            }
        }
        self.postMessage({ id, result:{ results } });
    } else self.postMessage({ id, result:matchTrigger(input) });
};
self.postMessage({ ready:true });
