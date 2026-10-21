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
