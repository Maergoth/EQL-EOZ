const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function ignoredEntitiesMarkup(entries=[],{query='',kind='all',busy=null,blocked=false}={}){
    const search=String(query).toLocaleLowerCase();
    return entries.filter(entry=>entry&&['npc','item'].includes(entry.kind)&&(kind==='all'||entry.kind===kind)&&`${entry.name} ${entry.canonicalTitle||''}`.toLocaleLowerCase().includes(search))
        .map(entry=>`<li data-ignore-entry="${escape(entry.id)}"><div><strong>${escape(entry.canonicalTitle||entry.name)}</strong><span>${entry.kind==='npc'?'NPC':'Item'}${entry.canonicalTitle&&entry.canonicalTitle!==entry.name?` · observed as ${escape(entry.name)}`:''}</span></div><button class="secondary-button" type="button" data-ignore-restore="${escape(entry.id)}" ${blocked||busy===entry.id?'disabled':''}>${busy===entry.id?'Restoring…':'Restore'}</button></li>`).join('');
}
export function mountIgnoredEntities({host,wiki}={}){
    if(!host)return{setActive(){},refresh:async()=>{},dispose(){}};
    let entries=[],active=false,disposed=false,loading=false,blocked=false,busy=null,query='',kind='all',error='',epoch=0;
    host.innerHTML='<div class="contribution-history-heading"><div><h3>Ignored entities</h3><p class="settings-helper">On this device. These NPCs and items stay ignored until you restore them. Contribution receipts are kept separately for your wiki account.</p></div><button class="secondary-button" type="button" data-ignore-refresh>Refresh ignored list</button></div><div class="contribution-ignores-tools"><label>Find<input type="search" data-ignore-query placeholder="NPC or item name" aria-label="Find ignored NPCs or items"></label><label>Type<select data-ignore-kind><option value="all">All</option><option value="npc">NPCs</option><option value="item">Items</option></select></label></div><p data-ignore-status role="status"></p><ul class="contribution-ignores-list" data-ignore-list></ul>';
    const find=selector=>host.querySelector(selector);
    function render(){
        if(disposed)return;find('[data-ignore-refresh]').disabled=loading||Boolean(busy)||!wiki?.contributionIgnores;
        find('[data-ignore-list]').innerHTML=ignoredEntitiesMarkup(entries,{query,kind,busy,blocked:blocked||loading});
        find('[data-ignore-status]').classList.toggle('capture-warning',Boolean(error));
        find('[data-ignore-status]').textContent=error||(loading?'Loading ignored entities…':!wiki?.contributionIgnores?'Permanent ignores require the updated desktop app.':!entries.length?'No NPCs or items are permanently ignored on this device.':`${entries.length} ignored on this device.`);
    }
    function accept(snapshot){
        if(!snapshot||snapshot.schemaVersion!==1||!Array.isArray(snapshot.entries)||snapshot.entries.length>2000)throw Error('The device ignore list could not be read.');
        entries=snapshot.entries;blocked=snapshot.blocked===true;error=typeof snapshot.warning==='string'?snapshot.warning:'';
    }
    async function refresh(){
        if(disposed||!active||busy||!wiki?.contributionIgnores)return;
        const request=++epoch;loading=true;error='';render();
        try{const result=await wiki.contributionIgnores();if(disposed||request!==epoch)return;accept(result);}
        catch(failure){if(!disposed&&request===epoch)error=failure?.message||'The device ignore list is unavailable.';}
        finally{if(!disposed&&request===epoch){loading=false;render();}}
    }
    async function restore(id){
        if(disposed||blocked||loading||busy||!wiki?.restoreContributionEntity||!entries.some(entry=>entry.id===id))return;
        const request=++epoch;busy=id;error='';render();
        try{const result=await wiki.restoreContributionEntity({id});if(disposed||request!==epoch)return;accept(result);}
        catch(failure){if(!disposed&&request===epoch)error=failure?.message||'This entity could not be restored.';}
        finally{if(!disposed&&request===epoch){busy=null;render();}}
    }
    const onRefresh=()=>void refresh(),onQuery=()=>{query=find('[data-ignore-query]').value;render();},onKind=()=>{kind=find('[data-ignore-kind]').value;render();};
    const onClick=event=>{const button=event.target.closest?.('[data-ignore-restore]');if(button&&host.contains(button))void restore(button.dataset.ignoreRestore);};
    find('[data-ignore-refresh]').addEventListener('click',onRefresh);find('[data-ignore-query]').addEventListener('input',onQuery);find('[data-ignore-kind]').addEventListener('change',onKind);host.addEventListener('click',onClick);
    const unsubscribe=wiki?.onContributionIgnoresChanged?.(snapshot=>{if(disposed)return;try{epoch++;loading=false;busy=null;accept(snapshot);render();}catch{error='The device ignore list could not be read.';render();}});
    render();return{
        setActive(value){const opening=value===true&&!active;active=value===true;if(opening)void refresh();},refresh,
        dispose(){disposed=true;epoch++;unsubscribe?.();find('[data-ignore-refresh]').removeEventListener('click',onRefresh);find('[data-ignore-query]').removeEventListener('input',onQuery);find('[data-ignore-kind]').removeEventListener('change',onKind);host.removeEventListener('click',onClick);}
    };
}
