import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {viewerTerrainIndices,installViewerTerrainCacheVersion} from '../app/viewer-terrain-indices.js';
const worker=readFileSync(new URL('../app/zoneviewer/zone-parser.worker.js',import.meta.url),'utf8'),start='let w=(/*EOZ_TERRAIN_INDICES_V1*/',from=worker.indexOf(start),to=worker.indexOf(')(y);',from);
assert(from>=0&&to>from);assert.equal(worker.indexOf(start,from+1),-1,'Only the classic EQG terrain path is patched');
const actual=vm.runInNewContext('('+worker.slice(from+start.length,to)+')',{Uint16Array,Uint32Array,Number,Math,Error});
for(const indices of [[0,1,2],[65533,65534,65535],[65534,65535,65536],Array.from({length:70002},(_,index)=>index)]){
    const result=actual(indices),reference=viewerTerrainIndices(indices),maximum=Math.max(...indices);
    assert.equal(result.constructor,maximum>65535?Uint32Array:Uint16Array);assert.deepEqual(result,reference);
    for(let offset=0;offset<indices.length;offset+=3)assert.deepEqual([...result.slice(offset,offset+3)],[indices[offset],indices[offset+2],indices[offset+1]],'All vertices retain the existing winding without wrapping');
    assert.equal(Math.max(...result),maximum);
}
assert.deepEqual([...actual([0,1,2])],[0,2,1]);assert.throws(()=>actual([0,-1,2]),/invalid vertex index/);
const calls=[],app={cache:{get(key){calls.push(['get',key]);return null;},set(key,value){calls.push(['set',key,value]);}}};
installViewerTerrainCacheVersion(app);installViewerTerrainCacheVersion(app);app.cache.get('zone:old-fingerprint');app.cache.set('zone:new-fingerprint',{cacheVersion:'v18'});app.cache.get('other:key');
assert.deepEqual(calls,[['get','zone:terrain-indices-v1:old-fingerprint'],['set','zone:terrain-indices-v1:new-fingerprint',{cacheVersion:'v18'}],['get','other:key']],'Decoded zone cache cannot reuse old wrapped GLBs; other entries and prefix cleanup remain compatible');
console.log('Actual patched EQG terrain path retains winding and small-index bytes, uses Uint32 across65535/65536 and70kvertices, rejects invalid indices and isolates old decoded cache.');
