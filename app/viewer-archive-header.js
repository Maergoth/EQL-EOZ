// Validate the small PFS filename directory before the pinned worker reads it.
// Never trust declared expansion sizes, even inside a locally selected folder.
const MAX_ARCHIVE=128*1024*1024,MAX_DIRECTORY=4*1024*1024,MAX_ENTRIES=65536,MAX_BLOCK=1024*1024;
const uint=(bytes,offset)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset,true);
async function bytes(file,start,end){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>file.size)throw Error('Local archive directory is outside the file.');
    const result=new Uint8Array(await file.slice(start,end).arrayBuffer());
    if(result.length!==end-start)throw Error('Local archive directory is truncated.');
    return result;
}
async function inflateBounded(compressed,expected){
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')),reader=stream.getReader(),chunks=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>expected)throw Error('Local archive directory exceeds its declared block size.');chunks.push(part.value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}
    if(size!==expected)throw Error('Local archive directory block size does not match.');
    const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function viewerArchiveNames(file,{inflate=inflateBounded,deadline=Date.now()+15000}={}){
    if(!Number.isSafeInteger(file?.size)||file.size<12||file.size>MAX_ARCHIVE||typeof file.slice!=='function')throw Error('Local archive has an unsupported size or file handle.');
    const header=await bytes(file,0,12);if(String.fromCharCode(...header.subarray(4,8))!=='PFS ')throw Error('Local archive does not have a PFS header.');
    const directory=uint(header,0),count=uint(await bytes(file,directory,directory+4),0);
    if(!count||count>MAX_ENTRIES)throw Error('Local archive has too many directory entries.');
    const entries=await bytes(file,directory+4,directory+4+count*12);let entry;
    for(let offset=0;offset<entries.length;offset+=12)if(uint(entries,offset)===1633159881){if(entry)throw Error('Local archive has conflicting filename directories.');entry={offset:uint(entries,offset+4),size:uint(entries,offset+8)};}
    if(!entry||entry.size<4||entry.size>MAX_DIRECTORY)throw Error('Local archive filename directory exceeds the supported limit.');
    const chunks=[];let offset=entry.offset,size=0,compressedTotal=0,blocks=0;
    while(size<entry.size){
        if(++blocks>512)throw Error('Local archive filename directory has too many compressed blocks.');
        if(Date.now()>=deadline)throw Error('Local archive identification timed out. Retry this zone.');
        const block=await bytes(file,offset,offset+8),compressed=uint(block,0),expanded=uint(block,4);offset+=8;
        if(!compressed||compressed>MAX_BLOCK||!expanded||expanded>MAX_BLOCK||size+expanded>entry.size||(compressedTotal+=compressed)>MAX_DIRECTORY)throw Error('Local archive directory block exceeds the supported limit.');
        const chunk=await inflate(await bytes(file,offset,offset+compressed),expanded);
        if(chunk.length!==expanded)throw Error('Local archive directory block size does not match.');
        chunks.push(chunk);size+=expanded;offset+=compressed;
    }
    const names=new Uint8Array(size);offset=0;for(const chunk of chunks){names.set(chunk,offset);offset+=chunk.length;}
    const total=uint(names,0);if(total>MAX_ENTRIES||total>count)throw Error('Local archive filename count is invalid.');
    const result=[];offset=4;
    for(let index=0;index<total;index++){
        if(offset+4>names.length)throw Error('Local archive filename list is truncated.');const length=uint(names,offset);offset+=4;
        if(!length||length>512||offset+length>names.length||names[offset+length-1]!==0)throw Error('Local archive filename is invalid.');
        result.push(new TextDecoder('windows-1252').decode(names.subarray(offset,offset+length-1)).toLowerCase());offset+=length;
    }
    return result;
}
export async function viewerLooseZoneHeader(file,id,archiveNames){
    if(String(file?.name||'').toLowerCase()!==id+'.zon'||file.size<28||file.size>MAX_ARCHIVE)return false;
    const header=await bytes(file,0,28),magic=String.fromCharCode(...header.subarray(0,4));
    const version=uint(header,4),stringsSize=uint(header,8),models=uint(header,12),placements=uint(header,16),regions=uint(header,20),lights=uint(header,24);
    if(magic!=='EQGZ'||version<1||version>3||stringsSize>MAX_DIRECTORY||[models,placements,regions,lights].some(count=>count>MAX_ENTRIES))return false;
    const content=await bytes(file,0,file.size),strings=content.subarray(28,28+stringsSize);let offset=28+stringsSize,terrain=false;
    const available=size=>size>=0&&offset+size<=content.length;
    function stringAt(index){if(index>=strings.length)return null;const value=strings.subarray(index,index+513),end=value.indexOf(0);if(end<0)return null;return new TextDecoder('windows-1252').decode(value.subarray(0,end)).toLowerCase();}
    if(strings.length!==stringsSize||!available(models*4))return false;
    for(let index=0;index<models;index++){const name=stringAt(uint(content,offset));if(name===null)return false;if(name.endsWith('.ter')&&(!archiveNames||archiveNames.includes(name)))terrain=true;offset+=4;}
    for(let index=0;index<placements;index++){
        if(!available(version>1?40:36)||stringAt(uint(content,offset+4))===null)return false;offset+=36;
        if(version>1){const lit=uint(content,offset);offset+=4;if(lit>MAX_DIRECTORY/4||!available(lit*4))return false;offset+=lit*4;}
    }
    if(!available(regions*40+lights*32))return false;
    for(let index=0;index<regions;index++){if(stringAt(uint(content,offset))===null)return false;offset+=40;}
    for(let index=0;index<lights;index++){if(stringAt(uint(content,offset))===null)return false;offset+=32;}
    return terrain;
}
