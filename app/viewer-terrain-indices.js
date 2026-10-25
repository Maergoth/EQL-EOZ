// Preserve the classic EQG terrain winding without truncating large buckets.
export function viewerTerrainIndices(indices){
    let maximum=0;
    for(const index of indices){if(!Number.isInteger(index)||index<0||index>0xffffffff)throw Error('Terrain contains an invalid vertex index.');maximum=Math.max(maximum,index);}
    const result=maximum>65535?new Uint32Array(indices):new Uint16Array(indices);
    for(let offset=0;offset<indices.length;offset+=3){result[offset]=indices[offset];result[offset+1]=indices[offset+2];result[offset+2]=indices[offset+1];}
    return result;
}
// A decoder correction must not reuse old GLBs with already-wrapped indices.
export function installViewerTerrainCacheVersion(app){
    const cache=app.cache;if(!cache||cache.eyeOfZommTerrainRevision)return;
    const key=value=>typeof value==='string'&&value.startsWith('zone:')?'zone:terrain-indices-v1:'+value.slice(5):value;
    for(const method of ['get','set']){const original=cache[method];if(typeof original==='function')cache[method]=function(value,...args){return original.call(this,key(value),...args);};}
    cache.eyeOfZommTerrainRevision=1;
}
