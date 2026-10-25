import {readFile,writeFile} from 'node:fs/promises';
import {viewerTerrainIndices} from '../app/viewer-terrain-indices.js';
const file=new URL('../app/zoneviewer/zone-parser.worker.js',import.meta.url),source=await readFile(file,'utf8');
const old='let w=new Uint16Array(y);for(let I=0;I<y.length;I+=3)w[I]=y[I],w[I+1]=y[I+2],w[I+2]=y[I+1];';
const start='let w=(/*EOZ_TERRAIN_INDICES_V1*/',end=')(y);',replacement=start+viewerTerrainIndices.toString().replace(/\r\n/g,'\n')+end;
let result;
if(source.includes(start)){
    const at=source.indexOf(start),to=source.indexOf(end,at);
    if(to<0||source.indexOf(start,at+start.length)>=0)throw Error('Conflicting terrain-index patch markers.');
    result=source.slice(0,at)+replacement+source.slice(to+end.length);
}else{
    if(source.split(old).length!==2)throw Error('The pinned classic EQG terrain-index seam changed.');
    result=source.replace(old,replacement);
}
if(result!==source)await writeFile(file,result);
console.log('Classic EQG terrain indices: exact winding, Uint32 only when required.');
