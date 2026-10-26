import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCharacterInventoryPager,validateInventoryPage} from '../app/character-inventory-pager.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async check=>{for(let index=0;index<50;index++){if(check())return;await tick();}assert.fail('Inventory navigation did not settle.');};
const rows=prefix=>Array.from({length:50},(_,index)=>({id:prefix+index,name:'Synthetic '+index}));
const result=(prefix='a',extra={})=>({ok:true,items:rows(prefix),nextCursor:'next-'+prefix,counts:{loose:2000000},filteredTotal:2000000,...extra});
function fixture(query){
    const dom=new JSDOM('<main><section class="character-bags"><div data-character-inventory><span>Initial items</span></div></section></main>'),root=dom.window.document.querySelector('main'),calls=[],applied=[],errors=[];let context='first';
    const options={root,autoLoad:false,debounceMs:0,getContextKey:()=>context,query:params=>{calls.push(params);return query(params,calls.length);},onPage:value=>{applied.push(value);root.querySelector('[data-character-inventory]').textContent=value.items.map(item=>item.name).join(', ');},onError:error=>errors.push(error)};
    const api=mountCharacterInventoryPager(options),button=name=>root.querySelector('[data-inventory-page="'+name+'"]');
    return{dom,root,calls,applied,errors,api,button,options,context:value=>{context=value;},close(){api.dispose();dom.window.close();}};
}
{
    const f=fixture(params=>result(params.cursor?'b':'a'));
    assert.equal(mountCharacterInventoryPager(f.options),f.api);assert.equal(f.root.querySelectorAll('nav').length,1);
    assert.equal(await f.api.refresh(),true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].limit,50);assert.equal(f.calls[0].scope,'loose');assert.equal(f.calls[0].cursor,null);
    assert.equal(f.applied[0].items.length,50,'Only the returned page reaches the renderer, independent of the two-million-item count.');
    assert.match(f.root.querySelector('[role=status]').textContent,/2,000,000 matching/);
    f.button('next').click();await until(()=>f.applied.length===2);assert.equal(f.calls[1].cursor,'next-a');
    f.button('previous').click();await until(()=>f.applied.length===3);assert.equal(f.calls[2].cursor,null);
    const scope=f.root.querySelector('[data-inventory-scope]');scope.value='personal-depot';scope.dispatchEvent(new f.dom.window.Event('change'));
    await until(()=>f.applied.length===4);assert.equal(f.calls[3].scope,'personal-depot');assert.equal(f.calls[3].cursor,null);
    for(const value of ['keyring','rejected']){const before=f.applied.length;scope.value=value;scope.dispatchEvent(new f.dom.window.Event('change'));await until(()=>f.applied.length===before+1);assert.equal(f.calls.at(-1).scope,value);assert.equal(f.calls.at(-1).cursor,null);}
    f.close();assert.equal(f.root.querySelector('nav'),null);
}
{
    let finishOld;const f=fixture((params,index)=>index===1?new Promise(resolve=>finishOld=resolve):result('new',{contextKey:'second',filteredTotal:null}));
    const pending=f.api.refresh();f.context('second');await f.api.refresh();finishOld(result('old',{contextKey:'first'}));await pending;
    assert.equal(f.applied.length,1);assert.equal(f.applied[0].items[0].id,'new0','An earlier Character response never replaces the selected profile.');
    assert.equal(f.calls[0].signal.aborted,true);assert.doesNotMatch(f.root.querySelector('[role=status]').textContent,/matching/,'Unknown filtered counts never claim the whole inventory matches.');f.close();
}
{
    let fail=false;const f=fixture(()=>fail?Promise.reject(Error('Synthetic read failure')):result());await f.api.refresh();
    const grid=f.root.querySelector('[data-character-inventory]'),previous=grid.textContent;fail=true;assert.equal(await f.api.refresh(),false);
    assert.equal(grid.textContent,previous);assert.equal(f.button('retry').hidden,false);assert.equal(f.button('next').disabled,true);assert.equal(grid.inert,false);
    fail=false;f.button('retry').click();await until(()=>f.applied.length===2);assert.equal(f.button('retry').hidden,true);f.close();
}
{
    let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));const pending=f.api.refresh();f.api.dispose();finish(result());await pending;
    assert.equal(f.applied.length,0,'Disposed views ignore late native replies.');f.close();
}
{
    const f=fixture(params=>result('query',{filteredTotal:null,total:2000000}));const search=f.root.querySelector('[data-inventory-search]');search.value='  <synthetic & item>  ';
    await f.api.refresh();assert.equal(f.calls[0].search,'<synthetic & item>');assert.equal(f.calls[0].query,f.calls[0].search);
    assert.doesNotMatch(f.root.querySelector('[role=status]').textContent,/matching/);assert.equal(f.root.querySelector('synthetic'),null);f.close();
}
assert.throws(()=>validateInventoryPage(result('bad',{items:Array(51).fill({})})),/page/);
assert.throws(()=>validateInventoryPage(result('bad',{nextCursor:'x'.repeat(8193)})),/page/);
assert.throws(()=>validateInventoryPage(result('bad',{total:-1})),/count/);
console.log('Paged Character inventory: bounded visible rows, scopes/cursors, stale-profile cancellation, unknown counts, failed-read preservation/retry, disposal and native-page validation passed.');
