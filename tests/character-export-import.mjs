import assert from 'node:assert/strict';
import {readCharacterExports} from '../app/character-export-import.js';

const metadata={name:'Synthetic',server:'Realm'},success=kind=>({ok:true,text:`Synthetic ${kind} export`,file:{name:`Synthetic_Realm-${kind}.txt`,bytes:40,modifiedAt:1000,sha256:'a'.repeat(64)}});
function fixture({inventoryResults=[success('Inventory')],achievementResults=[success('Achievements')],isCurrent=()=>true}={}){
    const calls=[];
    const host=(kind,results)=>({async read(request){calls.push({kind,...request});const value=results.shift();if(value instanceof Error)throw value;return typeof value==='function'?value(request):value;}});
    return {calls,options:{metadata,isCurrent,inventory:host('inventory',inventoryResults),achievements:host('achievements',achievementResults)}};
}
{
    const f=fixture(),result=await readCharacterExports(f.options);assert.equal(result.ok,true);assert.equal(result.inventory.text,success('Inventory').text);assert.equal(result.achievements.text,success('Achievements').text);
    assert.deepEqual(f.calls,[{kind:'inventory',...metadata},{kind:'achievements',...metadata}],'One action reads both current character exports in sequence');
}
{
    const f=fixture({inventoryResults:[{ok:false,notFound:true},success('Inventory')],achievementResults:[{ok:false,notFound:true},success('Achievements')]});assert.equal((await readCharacterExports(f.options)).ok,true);
    assert.deepEqual(f.calls,[{kind:'inventory',...metadata},{kind:'inventory',...metadata,chooseFile:true},{kind:'achievements',...metadata},{kind:'achievements',...metadata,chooseFile:true}],'Only missing exports open their own protected picker');
}
for(const [kind,result,expectedCalls]of [
    ['inventory',{ok:false,cancelled:true},1],['inventory',{ok:false,error:'A linked file was rejected.'},1],
    ['achievements',{ok:false,cancelled:true},2],['achievements',{ok:false,error:'Malformed file encoding.'},2]
]){
    const f=fixture({[kind==='inventory'?'inventoryResults':'achievementResults']:[result]}),failed=await readCharacterExports(f.options);
    assert.equal(failed.ok,false);assert.equal(failed.exportType,kind);assert.equal(f.calls.length,expectedCalls);assert.equal('inventory'in failed,false);assert.equal('achievements'in failed,false,'A failed pair never exposes a partially successful import');
}
{
    const f=fixture({inventoryResults:[{ok:false,notFound:true},{ok:false,cancelled:true}]});assert.equal((await readCharacterExports(f.options)).cancelled,true);assert.equal(f.calls.length,2,'Cancelling the first picker never reads the second export');
}
{
    let active=true;const f=fixture({inventoryResults:[()=>{active=false;return {ok:false,notFound:true};}],isCurrent:()=>active});assert.equal((await readCharacterExports(f.options)).stale,true);assert.equal(f.calls.length,1,'Profile changes prevent even a fallback picker');
}
{
    let active=true;const f=fixture({achievementResults:[()=>{active=false;return success('Achievements');}],isCurrent:()=>active});assert.equal((await readCharacterExports(f.options)).stale,true);assert.equal(f.calls.length,2,'A stale completed pair cannot be applied');
}
{
    let active=true;const f=fixture({inventoryResults:[{ok:false,notFound:true},()=>{active=false;return success('Inventory');}],isCurrent:()=>active});assert.equal((await readCharacterExports(f.options)).stale,true);assert.equal(f.calls.length,2,'A stale picker result cannot start the second read');
}
{
    const f=fixture({isCurrent:()=>false});assert.equal((await readCharacterExports(f.options)).stale,true);assert.equal(f.calls.length,0);
}
{
    const mutable={...metadata},f=fixture({inventoryResults:[()=>{mutable.name='Another';return success('Inventory');}]});f.options.metadata=mutable;assert.equal((await readCharacterExports(f.options)).ok,true);assert.equal(f.calls[1].name,'Synthetic','All requests retain the starting metadata, while the caller epoch decides currentness');
}
for(const result of [new Error('private filesystem path'),null,{ok:true,text:'',file:{}},{ok:true,text:'text'}]){
    const f=fixture({inventoryResults:[result]}),failed=await readCharacterExports(f.options);assert.equal(failed.ok,false);assert.equal(f.calls.length,1);assert.equal(failed.error.includes('private filesystem path'),false);
}
assert.equal((await readCharacterExports()).ok,false);assert.equal((await readCharacterExports({...fixture().options,isCurrent:null})).ok,false);
console.log('Character export action: paired sequential reads, missing-only picker fallback, cancellation/errors and stale-profile guards without partial result application passed.');
