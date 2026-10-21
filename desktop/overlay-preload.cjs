'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Overlays receive ephemeral session views and a fixed command surface. They
// have no installer, filesystem, log-reader, clipboard, or generic IPC bridge.
contextBridge.exposeInMainWorld('eyeOfZommOverlay', {
    getState:() => ipcRenderer.invoke('eye-of-zomm:overlay', 'get-state'),
    onState:callback => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('eye-of-zomm:overlay-state', listener);
        return () => ipcRenderer.removeListener('eye-of-zomm:overlay-state', listener);
    },
    action:(action, payload) => ipcRenderer.invoke('eye-of-zomm:overlay', action, payload)
});
