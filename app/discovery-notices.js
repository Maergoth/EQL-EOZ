import {mountWikiDiscoveryNotices} from './wiki-discovery-ui.js';

export function mountDiscoveryNoticeWindow({document=globalThis.document,api=globalThis.eyeOfZommDiscoveryNotices,ResizeObserver=globalThis.ResizeObserver,...clock}={}){
    const root=document.getElementById('wiki-discovery-notices');let disposed=false,received=false,lastHeight=0;
    const measure=()=>{if(disposed)return;const height=Math.ceil(root.scrollHeight+4);if(height!==lastHeight){lastHeight=height;void api.resize(height).catch(()=>{});}};
    const notices=mountWikiDiscoveryNotices({root,action:(name,value)=>api.action(name,value),...clock,onSizeChange:measure});
    const render=state=>{if(disposed)return;notices.render(Array.isArray(state)?state:[]);measure();};
    const unsubscribe=api.onState(state=>{received=true;render(state);});
    const observer=ResizeObserver?new ResizeObserver(measure):null;observer?.observe(root);
    void api.getState().then(state=>{if(!received)render(state);}).catch(()=>{});
    return {dispose(){disposed=true;unsubscribe();observer?.disconnect();notices.dispose();}};
}
if(globalThis.eyeOfZommDiscoveryNotices&&globalThis.document){const view=mountDiscoveryNoticeWindow();globalThis.addEventListener('pagehide',()=>view.dispose(),{once:true});}
