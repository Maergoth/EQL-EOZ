import {dropObservationCharacterName} from './drop-observations.js';

export function dropObservationNameDisclosure(status,configuredCharacter,detectedCharacter){
    const name=dropObservationCharacterName({includeCharacterName:true,characterNameSupported:true,configuredCharacter,detectedCharacter});
    const selected=typeof configuredCharacter?.name==='string'?configuredCharacter.name:'';
    const identity=name?`Public character name: ${name}.`:selected?`Selected character: ${selected}. Its name is omitted unless it matches the current detected character.`:'No registered character selected. Save character details in Character Select before including a name.';
    const capability=status?.characterNameSupported?'':' Public names require a logged-in wiki session that supports them.';
    return `${identity}${capability} This option starts off. It applies to new observations; names already queued can still be published when this is turned off.`;
}

export function mountDropObservationSettings({root,api,login=()=>Promise.resolve(),isFeatureEnabled=()=>true,getConfiguredCharacter=()=>null,getDetectedCharacter=()=>'',onStatus=()=>{},notify=()=>{},setIntervalImpl=setInterval,clearIntervalImpl=clearInterval}={}){
    root.innerHTML='<h2>Drop observations</h2><label class="check-control"><input type="checkbox" data-observation-enabled disabled> Collect and sync drop observations</label><p class="settings-helper">Keeps minimal kill and loot observations locally and uploads pending records in the background after startup or login. Log in to the wiki here in Eye of Zomm; a browser login is separate. Chat, screenshots and file paths are excluded. Wiki percentages describe reported loot, not drop chance.</p><button type="button" class="secondary-button" data-observation-login>Log in to wiki</button><label class="check-control"><input type="checkbox" data-observation-character-name disabled> Include character name publicly with drop observations</label><p class="settings-helper" data-observation-name-disclosure></p><p data-observation-status role="status"></p><a href="https://eqlwiki.com/API_Documentation" target="_blank" rel="noopener">Wiki API documentation</a>';
    const enabled=root.querySelector('[data-observation-enabled]'),include=root.querySelector('[data-observation-character-name]'),signIn=root.querySelector('[data-observation-login]'),disclosure=root.querySelector('[data-observation-name-disclosure]'),message=root.querySelector('[data-observation-status]');
    let status=null,disposed=false,revision=0;
    function refreshIdentity(){
        const configured=getConfiguredCharacter(),detected=getDetectedCharacter();
        disclosure.textContent=dropObservationNameDisclosure(status,configured,detected);
        const name=dropObservationCharacterName({includeCharacterName:true,characterNameSupported:status?.characterNameSupported,configuredCharacter:configured,detectedCharacter:detected});
        include.disabled=!isFeatureEnabled()||!status||!status.includeCharacterName&&(!status.enabled||!name);
    }
    function apply(next){
        if(disposed)return;if(!next){root.hidden=true;return;}root.hidden=false;status=next;
        enabled.checked=next.enabled===true;enabled.disabled=!isFeatureEnabled();include.checked=next.includeCharacterName===true;signIn.hidden=next.authenticated===true;signIn.disabled=!isFeatureEnabled();
        message.textContent=!isFeatureEnabled()?'Drop observations are disabled in Features. Saved observations and your collection preference are kept.':`${next.pending} pending · ${next.acknowledged} delivered${next.uploading?' · Uploading in the background':next.pending&&!next.authenticated?' · Log in here to upload pending observations automatically.':next.error?' · '+next.error:''}`;
        const issues=(Number(next.conflicts)||0)+(Number(next.rejected)||0);if(issues)message.textContent+=` · ${issues} retained for review`;
        onStatus(next);refreshIdentity();
    }
    async function refresh(){const current=++revision;try{const next=await api?.status();if(current===revision)apply(next);}catch{if(!disposed&&current===revision)message.textContent='Observation storage unavailable.';}}
    async function configure(patch){const current=++revision;try{const next=await api.configure(patch);if(current===revision)apply(next);}catch(error){notify(error.message,{tone:'warning'});await refresh();}}
    enabled.onchange=()=>void configure({enabled:enabled.checked});
    include.onchange=()=>void configure({includeCharacterName:include.checked});
    signIn.onclick=()=>void Promise.resolve().then(login).then(refresh).catch(error=>notify(error.message,{tone:'warning'}));
    const unsubscribe=api?.onStatus?.(next=>{revision++;apply(next);});
    const timer=setIntervalImpl(()=>void refresh(),60000);
    void refresh();refreshIdentity();
    return{refresh,refreshIdentity,dispose(){disposed=true;revision++;clearIntervalImpl(timer);unsubscribe?.();enabled.onchange=null;include.onchange=null;signIn.onclick=null;}};
}
