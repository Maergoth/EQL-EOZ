import {normalizeAppearance,normalizeLocalFontFamily} from './appearance.js';
export function installedFontFamilies(records){
    const families=new Map();
    for(const record of Array.isArray(records)?records.slice(0,20000):[]){
        const family=normalizeLocalFontFamily(record?.family);if(!family)continue;
        const key=family.toLocaleLowerCase();if(!families.has(key))families.set(key,family);
        if(families.size>=5000)break;
    }
    return [...families.values()].sort((a,b)=>a.localeCompare(b));
}
export function mountSystemFontSettings({document=globalThis.document,getAppearance,saveAppearance,
    queryFonts=typeof globalThis.queryLocalFonts==='function'?()=>globalThis.queryLocalFonts():null}={}){
    const input=document.getElementById('settings-local-font'),refresh=document.getElementById('refresh-system-fonts'),
        apply=document.getElementById('apply-system-font'),list=document.getElementById('installed-font-families'),
        status=document.getElementById('settings-system-font-status'),select=document.getElementById('settings-font-family');
    let disposed=false,loading=false;
    const listeners=[];function listen(element,event,callback){element.addEventListener(event,callback);listeners.push(()=>element.removeEventListener(event,callback));}
    function render(value){const appearance=normalizeAppearance(value);if(appearance.fontFamily==='local'&&document.activeElement!==input)input.value=appearance.localFontFamily;}
    async function useFont(){
        const name=normalizeLocalFontFamily(input.value);
        if(!name){status.textContent='Enter an installed font family, up to 120 characters.';return;}
        await saveAppearance({...getAppearance(),fontFamily:'local',localFontFamily:name});
        status.textContent=`Using ${name}. If it is unavailable on this computer, system fonts provide the fallback.`;
    }
    listen(select,'change',()=>{if(select.value==='local'){input.focus();status.textContent='Search the installed list or enter a font family, then choose Apply installed font.';}});
    listen(apply,'click',()=>{void useFont().catch(()=>{status.textContent='This font could not be applied. Try again.';});});
    listen(input,'keydown',event=>{if(event.key==='Enter'){event.preventDefault();void useFont();}});
    listen(refresh,'click',()=>{
        if(loading)return;
        if(!queryFonts){status.textContent='Installed font listing is unavailable here. Enter an installed font family manually, then choose Apply installed font.';input.focus();return;}
        loading=true;refresh.disabled=true;status.textContent='Reading installed font family names…';
        // Invoke immediately in the click gesture. Do not request blobs or bytes.
        let request;try{request=queryFonts();}catch(error){request=Promise.reject(error);}
        void Promise.resolve(request).then(records=>{
            if(disposed)return;const families=installedFontFamilies(records);list.replaceChildren();
            for(const family of families){const option=document.createElement('option');option.value=family;list.append(option);}
            status.textContent=families.length?`${families.length} installed font families loaded. Type a name to search, then apply it.`:'No font families were returned. You can still enter an installed font family manually.';
            input.focus();
        }).catch(()=>{if(!disposed)status.textContent='Installed font access was unavailable or denied. Enter an installed font family manually, or refresh to try again.';})
            .finally(()=>{loading=false;if(!disposed)refresh.disabled=false;});
    });
    if(!queryFonts)status.textContent='Installed font listing is unavailable here. You can enter an installed font family manually.';
    render(getAppearance());
    return {render,dispose(){disposed=true;listeners.forEach(remove=>remove());}};
}
