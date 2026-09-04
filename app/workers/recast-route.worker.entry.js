import { runRecastRoute } from '../recast-route-engine.js';

self.addEventListener('message', async event => {
    const { id, action, request } = event.data || {};
    if (action !== 'route' || !id) return;
    const result = await runRecastRoute(request);
    self.postMessage({ id, result });
});

