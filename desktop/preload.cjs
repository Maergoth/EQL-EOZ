'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eyeOfZommWindow', {
    minimize: () => ipcRenderer.invoke('eye-of-zomm:window', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('eye-of-zomm:window', 'toggle-maximize'),
    close: () => ipcRenderer.invoke('eye-of-zomm:window', 'close'),
    isMaximized: () => ipcRenderer.invoke('eye-of-zomm:window', 'is-maximized'),
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
