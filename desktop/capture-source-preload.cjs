'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eyeOfZommCaptureSource', {
    state:() => ipcRenderer.invoke('eye-of-zomm:capture-source', 'configuration'),
    frame:value => ipcRenderer.invoke('eye-of-zomm:capture-source', 'frame', value),
    signal:(action,value) => ipcRenderer.invoke('eye-of-zomm:capture-source', action, value)
});
