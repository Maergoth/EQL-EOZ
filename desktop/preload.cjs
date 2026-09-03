'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eyeOfZommWindow', {
    minimize: () => ipcRenderer.invoke('eye-of-zomm:window', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('eye-of-zomm:window', 'toggle-maximize'),
    close: () => ipcRenderer.invoke('eye-of-zomm:window', 'close'),
    isMaximized: () => ipcRenderer.invoke('eye-of-zomm:window', 'is-maximized')
});
