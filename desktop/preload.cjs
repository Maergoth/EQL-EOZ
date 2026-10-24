'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eyeOfZommCharacterStorage', {
    read:()=>ipcRenderer.invoke('eye-of-zomm:character-storage','read'),
    write:value=>ipcRenderer.invoke('eye-of-zomm:character-storage','write',value),
    flush:()=>ipcRenderer.invoke('eye-of-zomm:character-storage','flush')
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
    setRegion:value=>ipcRenderer.invoke('eye-of-zomm:capture','set-region',value),
    onStatus:callback=>subscribe('eye-of-zomm:capture-status',callback),
    onObservation:callback=>subscribe('eye-of-zomm:capture-observation',callback)
});
contextBridge.exposeInMainWorld('eyeOfZommWiki', {
    status:()=>ipcRenderer.invoke('eye-of-zomm:wiki','status'),
    login:()=>ipcRenderer.invoke('eye-of-zomm:wiki','login'),
    logout:()=>ipcRenderer.invoke('eye-of-zomm:wiki','logout'),
    matches:value=>ipcRenderer.invoke('eye-of-zomm:wiki','matches',value),
    blueprints:()=>ipcRenderer.invoke('eye-of-zomm:wiki','blueprints'),
    preparePlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','prepare-plan',value),
    submitPlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','submit-plan',value),
    getPlan:value=>ipcRenderer.invoke('eye-of-zomm:wiki','get-plan',value),
    uploadCharacter:value=>ipcRenderer.invoke('eye-of-zomm:wiki','upload-character',value),
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
