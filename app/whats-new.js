import { RELEASE_HISTORY } from './release-history.js';
import { createReleaseSeenStore, releaseHistoryUpTo } from './release-history-state.js';

// Historical screenshots belong to their captured version. Opening this manual
// viewer marks that release viewed; skipped releases keep individual New labels.
export const WHATS_NEW_STEPS=RELEASE_HISTORY[0].steps;
export function whatsNewStep(index,version=RELEASE_HISTORY[0].version) {
    const release=RELEASE_HISTORY.find(release=>release.version===version)||RELEASE_HISTORY[0];
    const steps=release.steps.length ? release.steps : [{title:release.title,image:null,view:'settings',action:'Open Settings',
        copy:'These historical release notes are preserved from the project changelog. Screenshots were not archived for this version.',alt:'',caption:'No historical screenshot is available; newer screenshots are not substituted.'}];
    const position=Number.isFinite(index)?Math.max(0,Math.min(steps.length-1,Math.trunc(index))):0;
    return {...steps[position],index:position,count:steps.length,version:release.version};
}

export function mountWhatsNew({document=globalThis.document,button,navigate=()=>{},target=document?.body,
    getVersion=()=>RELEASE_HISTORY[0].version,storage=globalThis.localStorage,onUnreadChange=()=>{},onWarning=()=>{}}={}) {
    if(!target)return {open(){},close(){},refresh(){},dispose(){}};
    const seen=createReleaseSeenStore({storage,onWarning});
    const dialog=document.createElement('dialog');
    dialog.className='whats-new-dialog';
    dialog.setAttribute('aria-labelledby','whats-new-title');dialog.setAttribute('aria-describedby','whats-new-copy');
    dialog.innerHTML=`<div class="whats-new-heading"><span class="eyebrow">Release history</span><button type="button" class="text-button" data-tour-close aria-label="Close walkthrough">Close ×</button></div><div class="whats-new-release-picker"><label for="whats-new-version">Release</label><select id="whats-new-version" data-tour-version></select><span data-tour-new-count role="status" aria-live="polite"></span><button type="button" class="text-button" data-tour-mark-all>Mark all viewed</button></div><p class="whats-new-release-title" data-tour-release-title></p><details class="whats-new-changes" data-tour-details><summary>Changes in this release</summary><ul data-tour-changes></ul></details><h2 id="whats-new-title"></h2><p id="whats-new-copy"></p><figure class="whats-new-figure"><img data-tour-image width="1280" height="800"><figcaption data-tour-caption></figcaption></figure><footer class="whats-new-footer"><span data-tour-count role="status" aria-live="polite"></span><div class="whats-new-actions"><button type="button" class="secondary-button" data-tour-previous>Previous</button><button type="button" class="secondary-button" data-tour-feature></button><button type="button" class="primary-button" data-tour-next>Next</button></div></footer>`;
    target.appendChild(dialog);
    const $=selector=>dialog.querySelector(selector),listeners=[];
    let index=0,version=RELEASE_HISTORY[0].version,disposed=false,viewingNew=false;
    const listen=(element,event,handler)=>{element?.addEventListener(event,handler);listeners.push(()=>element?.removeEventListener(event,handler));};
    const available=()=>releaseHistoryUpTo(getVersion());
    function refresh() {
        if(disposed)return;
        const unread=seen.unread(getVersion());
        if(button){button.textContent=unread.length ? "What's new · New" : "What's new";button.setAttribute('aria-label',`What's new${unread.length ? `; ${unread.length} releases not viewed` : ''}`);}
        try {onUnreadChange({count:unread.length,versions:unread.map(release=>release.version)});}catch{/* Indicator callbacks cannot block history. */}
        $('[data-tour-new-count]').textContent=unread.length ? `${unread.length} not viewed` : 'All viewed';
        $('[data-tour-mark-all]').disabled=!unread.length;
        const select=$('[data-tour-version]');select.replaceChildren();
        for(const release of available()) {
            const option=document.createElement('option');option.value=release.version;
            option.textContent=`v${release.version}${!seen.isSeen(release.version) ? ' · New' : ''} · ${release.title}`;
            select.appendChild(option);
        }
        select.value=version;
    }
    function render(){
        const release=RELEASE_HISTORY.find(release=>release.version===version)||RELEASE_HISTORY[0],step=whatsNewStep(index,release.version);index=step.index;
        $('[data-tour-release-title]').textContent=`v${release.version} · ${release.title}${viewingNew ? ' · New' : ''}`;
        const changes=$('[data-tour-changes]');changes.replaceChildren();
        for(const change of release.changes){const item=document.createElement('li');item.textContent=change;changes.appendChild(item);}
        $('[data-tour-details]').open=!release.steps.length;
        $('#whats-new-title').textContent=step.title;$('#whats-new-copy').textContent=step.copy;
        const image=$('[data-tour-image]');image.hidden=!step.image;
        if(step.image) image.src=`./assets/whats-new/${step.image}.png`;else image.removeAttribute('src');
        image.alt=step.alt;
        $('[data-tour-caption]').textContent=step.image ? `v${release.version} archive · ${step.caption}` : step.caption;
        $('[data-tour-count]').textContent=`${index+1} of ${step.count}`;
        $('[data-tour-previous]').disabled=index===0;
        $('[data-tour-next]').textContent=index===step.count-1?'Done':'Next';
        $('[data-tour-feature]').textContent=step.action;
    }
    function selectRelease(requested){
        const releases=available();
        if(!releases.length)return false;
        version=releases.find(release=>release.version===requested)?.version || releases[0].version;
        index=0;viewingNew=!seen.isSeen(version);seen.markSeen(version);refresh();render();return true;
    }
    function close(){if(disposed)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');button?.focus?.();}
    function open(requested){if(disposed)return;if(!selectRelease(typeof requested==='string' ? requested : getVersion()))return;
        if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}$('[data-tour-next]').focus();}
    listen(button,'click',open);listen($('[data-tour-close]'),'click',close);
    listen(dialog,'cancel',event=>{event.preventDefault();close();});
    listen($('[data-tour-version]'),'change',()=>selectRelease($('[data-tour-version]').value));
    listen($('[data-tour-mark-all]'),'click',()=>{seen.markAllSeen(getVersion());viewingNew=false;refresh();render();});
    listen($('[data-tour-next]'),'click',()=>{if(index===whatsNewStep(index,version).count-1)close();else{index++;render();}});
    listen($('[data-tour-previous]'),'click',()=>{index--;render();if(index===0)$('[data-tour-next]').focus();});
    listen($('[data-tour-feature]'),'click',()=>{const view=whatsNewStep(index,version).view;close();navigate(view);});
    listen($('[data-tour-image]'),'error',()=>{$('[data-tour-image]').hidden=true;$('[data-tour-caption]').textContent=`Screenshot unavailable for v${version} in this build. Its release notes remain available.`;});
    refresh();
    return {open,close,refresh,dispose(){if(disposed)return;close();disposed=true;listeners.forEach(remove=>remove());dialog.remove();}};
}
