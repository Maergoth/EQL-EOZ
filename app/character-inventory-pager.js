// Inventory navigation owns only one bounded page; full records live in the
// private repository. No inventory copy or browser persistence belongs here.
const mounts=new WeakMap();
const PAGE_SIZE=50,HISTORY_LIMIT=100;
const SCOPES=[['loose','All unequipped items'],['inventory','Carried items'],['bank','Bank'],['shared-bank','Shared bank'],['personal-depot','Personal depot'],['held','Held'],['manual','Manual items'],['retained','Earlier imports'],['keyring','Keyring'],['rejected','Unmatched exports']];
const validCursor=value=>value===null||typeof value==='string'&&value.length>0&&value.length<=8192;
export function validateInventoryPage(value){
    if(!value||value.ok===false||!Array.isArray(value.items)||value.items.length>PAGE_SIZE||!validCursor(value.nextCursor??null)||!validCursor(value.prevCursor??null))throw Error('The inventory page could not be verified.');
    if(value.total!==undefined&&value.total!==null&&(!Number.isSafeInteger(value.total)||value.total<0))throw Error('The inventory count could not be verified.');
    return value;
}
export function mountCharacterInventoryPager({root,query,onPage=()=>{},onError=()=>{},getContextKey=()=>'',autoLoad=true,debounceMs=250}={}){
    if(!root?.querySelector||typeof query!=='function')throw Error('An inventory page host and query are required.');
    if(mounts.has(root))return mounts.get(root);
    const document=root.ownerDocument,host=root.querySelector('.character-bags')||root,grid=host.querySelector('[data-character-inventory]');
    if(!grid)throw Error('The inventory page grid is missing.');
    const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
    const form=node('form',undefined,'character-inventory-filters'),search=node('input'),scope=node('select');
    const searchLabel=node('label','Search inventory'),scopeLabel=node('label','Location');
    search.type='search';search.maxLength=120;search.placeholder='Item name';search.autocomplete='off';search.dataset.inventorySearch='';
    scope.dataset.inventoryScope='';for(const [key,label]of SCOPES){const option=node('option',label);option.value=key;scope.append(option);}
    searchLabel.append(search);scopeLabel.append(scope);form.append(searchLabel,scopeLabel);grid.before(form);
    const navigation=node('nav',undefined,'character-inventory-pagination');navigation.setAttribute('aria-label','Inventory pages');
    const makeButton=(text,key)=>{const button=node('button',text,'secondary-button');button.type='button';button.dataset.inventoryPage=key;return button;};
    const first=makeButton('First page','first'),previous=makeButton('Previous','previous'),next=makeButton('Next','next'),retry=makeButton('Try again','retry'),status=node('span',undefined,'character-inventory-page-status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry.hidden=true;navigation.append(first,previous,status,next,retry);grid.after(navigation);
    const Abort=document.defaultView?.AbortController||globalThis.AbortController;
    let disposed=false,serial=0,controller=null,timer=null,busy=false,failed=false,current=null,currentCursor=null,history=[],pageNumber=1,lastRequest={cursor:null,history:[],page:1};
    const context=()=>String(getContextKey());
    function controls(){first.disabled=busy||!current||currentCursor===null;previous.disabled=busy||failed||!current||!(current.prevCursor||history.length);next.disabled=busy||failed||!current?.nextCursor;retry.disabled=busy;grid.inert=busy;grid.setAttribute('aria-busy',String(busy));}
    const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
    function failure(error){failed=true;status.textContent=current?'The inventory page could not be loaded. Previous items are still shown.':'The inventory page could not be loaded. Try again.';retry.hidden=false;try{onError(error);}catch{/* Keep retry available even if the warning view fails. */}}
    async function load(request={cursor:null,history:[],page:1}){
        if(disposed)return false;clearTimer();controller?.abort();controller=new Abort();
        const owner=++serial,key=context(),signal=controller.signal;
        lastRequest={cursor:request.cursor??null,history:[...request.history],page:request.page};
        busy=true;failed=false;retry.hidden=true;status.textContent='Loading inventory…';controls();
        try{
            const needle=search.value.trim().slice(0,120),result=validateInventoryPage(await query({scope:scope.value,search:needle,query:needle,cursor:lastRequest.cursor,limit:PAGE_SIZE,signal}));
            if(disposed||owner!==serial||signal.aborted||context()!==key||!root.isConnected)return false;
            if(result.contextKey!==undefined&&String(result.contextKey)!==key)throw Error('The inventory page belongs to an earlier Character selection.');
            await onPage(result,{contextKey:key,signal});
            if(disposed||owner!==serial||signal.aborted||context()!==key)return false;
            current=result;currentCursor=lastRequest.cursor;history=lastRequest.history.slice(-HISTORY_LIMIT);pageNumber=lastRequest.page;
            const count=result.items.length,total=Object.hasOwn(result,'filteredTotal')?result.filteredTotal:needle?null:result.total;
            status.textContent=`Page ${pageNumber.toLocaleString()} · ${count.toLocaleString()} ${count===1?'item':'items'} on this page${Number.isSafeInteger(total)&&total>=0?' · '+total.toLocaleString()+' matching':''}`;
            return true;
        }catch(error){if(!disposed&&owner===serial&&!signal.aborted&&context()===key)failure(error);return false;}
        finally{if(!disposed&&owner===serial){busy=false;controls();}}
    }
    function refresh({reset=true}={}){return load(reset?{cursor:null,history:[],page:1}:{cursor:currentCursor,history,page:pageNumber});}
    function scheduled(){clearTimer();serial++;controller?.abort();busy=true;controls();status.textContent='Updating inventory…';timer=setTimeout(()=>refresh(),Math.max(0,debounceMs));}
    const submit=event=>{event.preventDefault();refresh();},scopeChanged=()=>refresh(),firstPage=()=>refresh();
    const nextPage=()=>{if(!busy&&current?.nextCursor)load({cursor:current.nextCursor,history:[...history,currentCursor].slice(-HISTORY_LIMIT),page:pageNumber+1});};
    const previousPage=()=>{if(!busy&&(current?.prevCursor||history.length))load({cursor:current.prevCursor||history[history.length-1],history:history.slice(0,-1),page:Math.max(1,pageNumber-1)});};
    const retryPage=()=>load(lastRequest);
    search.addEventListener('input',scheduled);form.addEventListener('submit',submit);scope.addEventListener('change',scopeChanged);first.addEventListener('click',firstPage);previous.addEventListener('click',previousPage);next.addEventListener('click',nextPage);retry.addEventListener('click',retryPage);
    const api={refresh,dispose(){if(disposed)return;disposed=true;serial++;clearTimer();controller?.abort();search.removeEventListener('input',scheduled);form.removeEventListener('submit',submit);scope.removeEventListener('change',scopeChanged);first.removeEventListener('click',firstPage);previous.removeEventListener('click',previousPage);next.removeEventListener('click',nextPage);retry.removeEventListener('click',retryPage);form.remove();navigation.remove();grid.inert=false;grid.removeAttribute('aria-busy');mounts.delete(root);}};
    mounts.set(root,api);controls();if(autoLoad)refresh();return api;
}
