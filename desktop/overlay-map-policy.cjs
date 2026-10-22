'use strict';

function safeMapFile(value){
    const relative=String(value||'').replace(/\\/g,'/');
    if(!relative||/[\x00-\x1f\x7f:]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^logs$/i.test(part)))return false;
    // The bundled loader hydrates mp3index for every S3D/EQG and reads the
    // zone's EQG dependency list before parsing. Other root text (including
    // player INI exports and unrelated zone-prefixed text) is not map input.
    if(/\.txt$/i.test(relative))return /^maps\//i.test(relative)||/^(?:mp3index|[a-z0-9][a-z0-9_-]*_assets)\.txt$/i.test(relative);
    return /\.(?:s3d|eqg|eff|xmi|emt|zon)$/i.test(relative);
}

// Only the Map partition opts into this read-only bridge. Its frame can load
// selected game archives/maps, but never player logs, settings or mutation APIs.
function allowMapRequest(details,origin){
    try{
        const target=new URL(details.url),method=String(details.method||'GET').toUpperCase();
        if(/^data:image\/(?:png|jpeg|gif|webp|bmp|x-ms-bmp);/i.test(details.url))return details.resourceType==='image';
        if(target.protocol==='blob:')return target.origin===origin&&['image','worker','script'].includes(details.resourceType);
        if(target.origin!==origin||!['GET','HEAD'].includes(method)||target.username||target.password)return false;
        if(details.resourceType==='mainFrame')return target.pathname==='/overlay-map.html'&&target.search==='?panel=map';
        if(details.resourceType==='subFrame')return target.pathname==='/zoneviewer/viewer.html'&&target.search==='?overlay=1';
        if(target.pathname==='/api/eq-files')return method==='GET'&&!target.search;
        if(target.pathname==='/api/eq-file')return method==='GET'&&[...target.searchParams.keys()].length===2&&target.searchParams.has('path')&&target.searchParams.get('surface')==='overlay-map'&&safeMapFile(target.searchParams.get('path'));
        if(target.pathname.startsWith('/api/')||target.pathname.startsWith('/data/'))return false;
        if(target.pathname==='/appearance-presets.json')return !target.search;
        return /^\/[a-z0-9_.-]+\.(?:js|css)$/i.test(target.pathname)||/^\/zoneviewer\/[a-z0-9_./-]+\.(?:js|css|wasm|json|png|gif|jpg|jpeg|webp|svg|woff2?)$/i.test(target.pathname);
    }catch{return false;}
}
module.exports={safeMapFile,allowMapRequest};
