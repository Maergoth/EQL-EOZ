import {normalizeWikiIdentity} from './wiki-identity.js';

// Suggestions are separate from the native proof required for admission and
// publication. A cached suggestion never authorizes creating or editing a page.
export function createContributionMatchLookup({lookup,now=Date.now,maxEntries=200}={}){
    const cache=new Map(),pending=new Map();let disposed=false;
    return {
        check({name,kind}){
            if(disposed||typeof lookup!=='function')return Promise.reject(Error('Live matching unavailable.'));
            name=String(name||'').trim().slice(0,230);
            if(!name||!['item','npc','zone','spell'].includes(kind))return Promise.reject(Error('Enter a destination page.'));
            const key=kind+':'+normalizeWikiIdentity(name),saved=cache.get(key);
            if(saved&&saved.until>now())return saved.error?Promise.reject(saved.error):Promise.resolve(saved.result);
            if(pending.has(key))return pending.get(key);
            if(pending.size>=4)return Promise.reject(Error('Live matching is busy.'));
            const task=Promise.resolve().then(()=>lookup({name,kind})).then(result=>{
                if(!result||!Array.isArray(result.matches))throw Error('Live matching returned no result.');
                if(!disposed)cache.set(key,{result,until:now()+300000});
                return result;
            }).catch(error=>{
                if(!disposed)cache.set(key,{error,until:now()+15000});
                throw error;
            }).finally(()=>{
                pending.delete(key);
                while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
            });
            pending.set(key,task);return task;
        },
        dispose(){disposed=true;cache.clear();pending.clear();}
    };
}

export function mountContributionLiveMatches({form,candidate,lookup,isActive=()=>true,onResult=()=>{},delayMs=350}={}){
    let disposed=false,timer=null,version=0,checkedKey='';
    const status=form.querySelector('[data-live-matches-status]');
    const query=()=>({kind:candidate.kind,name:String(form.elements.title?.value??form.elements.name?.value??'').trim()});
    const key=request=>request.kind+':'+normalizeWikiIdentity(request.name);
    const current=(request,epoch)=>!disposed&&form.isConnected&&isActive()&&epoch===version&&key(query())===key(request);
    function refresh(){
        if(disposed||!form.isConnected||!isActive())return;
        const request=query(),identity=key(request);
        if(!request.name){status.textContent='Enter a destination page to check automatically.';return;}
        if(checkedKey===identity)return;
        checkedKey=identity;const epoch=++version;
        status.textContent='Checking live wiki automatically…';
        void lookup.check(request).then(result=>{
            if(!current(request,epoch)){if(!disposed&&epoch===version)checkedKey='';return;}
            onResult(result,request);status.textContent='Live wiki checked. Preview verifies the page again before publishing.';
        }).catch(()=>{
            if(current(request,epoch))status.textContent='Live wiki matching is unavailable. Preview will retry the live checks.';
        });
    }
    const input=event=>{
        if(!['name','title'].includes(event.target.name))return;
        ++version;checkedKey='';clearTimeout(timer);
        status.textContent='The destination will be checked automatically.';
        timer=setTimeout(refresh,delayMs);
    };
    form.addEventListener('input',input);refresh();
    return {refresh,dispose(){disposed=true;++version;clearTimeout(timer);form.removeEventListener('input',input);}};
}
