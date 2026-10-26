'use strict';

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eyeOfZommInventory',{
    read:value=>ipcRenderer.invoke('eye-of-zomm:inventory-file','read',value)
});
contextBridge.exposeInMainWorld('eyeOfZommAchievements',{
    read:value=>ipcRenderer.invoke('eye-of-zomm:achievement-file','read',value)
});

contextBridge.exposeInMainWorld('eyeOfZommCharacterStorage', {
    read:value=>ipcRenderer.invoke('eye-of-zomm:character-storage','read',value),
    write:value=>ipcRenderer.invoke('eye-of-zomm:character-storage','write',value),
    flush:()=>ipcRenderer.invoke('eye-of-zomm:character-storage','flush')
});

// Narrow paged inventory operations; no renderer-provided SQL or disk paths.
contextBridge.exposeInMainWorld('eyeOfZommCharacterRepository', {
    bootstrap:()=>ipcRenderer.invoke('eye-of-zomm:character-repository','bootstrap',{}),
    listProfiles:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','listProfiles',value||{}),
    createProfile:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','createProfile',value),
    selectProfile:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','selectProfile',value),
    getCore:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','getCore',value),
    transaction:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','transaction',value),
    list:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','list',value),
    get:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','get',value),
    getChunk:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','getChunk',value),
    beginLegacySeed:()=>ipcRenderer.invoke('eye-of-zomm:character-repository','beginLegacySeed',{}),
    appendLegacySeed:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','appendLegacySeed',value),
    commitLegacySeed:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','commitLegacySeed',value),
    cancelLegacySeed:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','cancelLegacySeed',value||{}),
    importFiles:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','importFiles',value),
    cancelImport:value=>ipcRenderer.invoke('eye-of-zomm:character-repository','cancelImport',value||{}),
    flush:()=>ipcRenderer.invoke('eye-of-zomm:character-repository','flush',{}),
    onProgress:callback=>{if(typeof callback!=='function')return()=>{};const listener=(_event,value)=>callback(value);ipcRenderer.on('eye-of-zomm:character-repository:progress',listener);return()=>ipcRenderer.removeListener('eye-of-zomm:character-repository:progress',listener);}
});

contextBridge.exposeInMainWorld('eyeOfZommWindow', {
    minimize: () => ipcRenderer.invoke('eye-of-zomm:window', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('eye-of-zomm:window', 'toggle-maximize'),
    close: () => ipcRenderer.invoke('eye-of-zomm:window', 'close'),
    isMaximized: () => ipcRenderer.invoke('eye-of-zomm:window', 'is-maximized'),
    getSettings: () => ipcRenderer.invoke('eye-of-zomm:window', 'get-settings'),
    setSettings: value => ipcRenderer.invoke('eye-of-zomm:window', 'set-settings', value),
    copyText: text => ipcRenderer.invoke('eye-of-zomm:clipboard', text)
});

contextBridge.exposeInMainWorld('eyeOfZommUpdates', {
    getStatus:() => ipcRenderer.invoke('eye-of-zomm:app-update', 'get-status'),
    check:() => ipcRenderer.invoke('eye-of-zomm:app-update', 'check'),
    download:() => ipcRenderer.invoke('eye-of-zomm:app-update', 'download'),
    cancel:() => ipcRenderer.invoke('eye-of-zomm:app-update', 'cancel'),
    setStartupDownload:enabled => ipcRenderer.invoke('eye-of-zomm:app-update', 'startup-download', enabled),
    install:() => ipcRenderer.invoke('eye-of-zomm:app-update', 'install')
});

const subscribe = (channel, callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('eyeOfZommCapture', {
    setReadingEnabled:value=>ipcRenderer.invoke('eye-of-zomm:capture','set-reading-enabled',value),
    status:()=>ipcRenderer.invoke('eye-of-zomm:capture','status'),
    sources:()=>ipcRenderer.invoke('eye-of-zomm:capture','sources'),
    start:value=>ipcRenderer.invoke('eye-of-zomm:capture','start',value),
    stop:value=>ipcRenderer.invoke('eye-of-zomm:capture','stop',value),
    pause:()=>ipcRenderer.invoke('eye-of-zomm:capture','pause'),
    resume:()=>ipcRenderer.invoke('eye-of-zomm:capture','resume'),
    read:value=>ipcRenderer.invoke('eye-of-zomm:capture','read',value),
    observeLog:value=>ipcRenderer.invoke('eye-of-zomm:capture','observe-log',value),
    importImage:value=>ipcRenderer.invoke('eye-of-zomm:capture','import-image',value),
    preview:()=>ipcRenderer.invoke('eye-of-zomm:capture','preview'),
    itemEvidence:value=>ipcRenderer.invoke('eye-of-zomm:capture','item-evidence',value),
    setRegion:value=>ipcRenderer.invoke('eye-of-zomm:capture','set-region',value),
    onStatus:callback=>subscribe('eye-of-zomm:capture-status',callback),
    onObservation:callback=>subscribe('eye-of-zomm:capture-observation',callback)
});
contextBridge.exposeInMainWorld('eyeOfZommLifecycle',{
    onDrain:(drain,resume)=>{
        if(typeof drain!=='function')return()=>{};
        const remove=subscribe('eye-of-zomm:renderer-drain',value=>{
            if(value?.resume){resume?.();return;}
            if(typeof value?.id!=='string')return;
            Promise.resolve().then(drain).then(ok=>ipcRenderer.invoke('eye-of-zomm:renderer-drain','complete',{id:value.id,ok:ok===true}),()=>ipcRenderer.invoke('eye-of-zomm:renderer-drain','complete',{id:value.id,ok:false})).catch(()=>{});
        });
        void ipcRenderer.invoke('eye-of-zomm:renderer-drain','ready').catch(()=>{});return remove;
    }
});
contextBridge.exposeInMainWorld('eyeOfZommObservations',{
    status:()=>ipcRenderer.invoke('eye-of-zomm:observations','status'),
    collect:events=>ipcRenderer.invoke('eye-of-zomm:observations','collect',{events}),
    configure:value=>ipcRenderer.invoke('eye-of-zomm:observations','configure',value)
});
contextBridge.exposeInMainWorld('eyeOfZommWiki', {
    characterScreenshot:value=>ipcRenderer.invoke('eye-of-zomm:wiki','character-screenshot',value),
    prepareCharacterScreenshot:value=>ipcRenderer.invoke('eye-of-zomm:wiki','prepare-character-screenshot',value),
    removeCharacterScreenshot:value=>ipcRenderer.invoke('eye-of-zomm:wiki','remove-character-screenshot',value),
    reviewCharacterScreenshot:value=>ipcRenderer.invoke('eye-of-zomm:wiki','review-character-screenshot',value),
    prepareAttachment:value=>ipcRenderer.invoke('eye-of-zomm:wiki','prepare-attachment',value),
    prepareCapturedItem:value=>ipcRenderer.invoke('eye-of-zomm:wiki','prepare-captured-item',value),
    submitCapturedItem:value=>ipcRenderer.invoke('eye-of-zomm:wiki','submit-captured-item',value),
    cancelCapturedItem:value=>ipcRenderer.invoke('eye-of-zomm:wiki','cancel-captured-item',value),
    discardAttachment:value=>ipcRenderer.invoke('eye-of-zomm:wiki','discard-attachment',value),
    iconCatalog:value=>ipcRenderer.invoke('eye-of-zomm:wiki','icon-catalog',value),
    iconMatch:value=>ipcRenderer.invoke('eye-of-zomm:wiki','icon-match',value),
    observationStatus:()=>ipcRenderer.invoke('eye-of-zomm:wiki','observation-status'),
    submitObservations:value=>ipcRenderer.invoke('eye-of-zomm:wiki','submit-observations',value),
    status:()=>ipcRenderer.invoke('eye-of-zomm:wiki','status'),
    login:()=>ipcRenderer.invoke('eye-of-zomm:wiki','login'),
    logout:()=>ipcRenderer.invoke('eye-of-zomm:wiki','logout'),
    matches:value=>ipcRenderer.invoke('eye-of-zomm:wiki','matches',value),
    blueprints:()=>ipcRenderer.invoke('eye-of-zomm:wiki','blueprints'),
    preparePlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','prepare-plan',value),
    submitPlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','submit-plan',value),
    getPlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','get-plan',value),
    liveEntries:()=>ipcRenderer.invoke('eye-of-zomm:wiki','live-entries'),
    onLiveEntriesChanged:callback=>subscribe('eye-of-zomm:live-wiki-entries-changed',callback),
    verifyDiscovery:value=>ipcRenderer.invoke('eye-of-zomm:wiki','verify-discovery',value),
    contributionHistory:value=>ipcRenderer.invoke('eye-of-zomm:wiki','contribution-history',value),
    contributionIgnores:()=>ipcRenderer.invoke('eye-of-zomm:contribution-ignores','list'),
    ignoreContributionEntity:value=>ipcRenderer.invoke('eye-of-zomm:contribution-ignores','ignore',value),
    restoreContributionEntity:value=>ipcRenderer.invoke('eye-of-zomm:contribution-ignores','restore',value),
    onContributionIgnoresChanged:callback=>subscribe('eye-of-zomm:contribution-ignores-changed',callback),
    uploadCharacter:value=>ipcRenderer.invoke('eye-of-zomm:wiki','upload-character',value),
    characterSheetCapability:()=>ipcRenderer.invoke('eye-of-zomm:wiki','character-sheet-capability'),
    shareCharacter:value=>ipcRenderer.invoke('eye-of-zomm:wiki','share-character',value),
    onAutomaticSourceResult:callback=>subscribe('eye-of-zomm:automatic-source-result',callback),
    onStatus:callback=>subscribe('eye-of-zomm:wiki-state',callback)
});
contextBridge.exposeInMainWorld('eyeOfZommShare', {
    copyText:value=>ipcRenderer.invoke('eye-of-zomm:share','copy-text',value),
    copyPng:value=>ipcRenderer.invoke('eye-of-zomm:share','copy-png',value),
    savePng:value=>ipcRenderer.invoke('eye-of-zomm:share','save-png',value)
});
contextBridge.exposeInMainWorld('eyeOfZommDiscovery',{
    show:value=>ipcRenderer.invoke('eye-of-zomm:discovery','show',value),
    action:(action,value)=>ipcRenderer.invoke('eye-of-zomm:discovery',action,value),
    onAction:callback=>subscribe('eye-of-zomm:discovery-action',callback)
});
contextBridge.exposeInMainWorld('eyeOfZommOverlays', {
    getState:() => ipcRenderer.invoke('eye-of-zomm:overlays', 'get-state'),
    control:(action, panel, value) => ipcRenderer.invoke('eye-of-zomm:overlays', 'control', { action, panel, value }),
    publish:snapshot => ipcRenderer.invoke('eye-of-zomm:overlays', 'publish', snapshot),
    reply:(requestId, result, error) => ipcRenderer.invoke('eye-of-zomm:overlays', 'reply', { requestId, result, error }),
    onAction:callback => subscribe('eye-of-zomm:overlay-command', callback),
    onState:callback => subscribe('eye-of-zomm:overlays-state', callback)
});
