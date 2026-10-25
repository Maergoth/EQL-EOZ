'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Fixed informational window: no arbitrary IPC, filesystem or wiki API bridge.
contextBridge.exposeInMainWorld('eyeOfZommDiscoveryNotices',{
    getState:()=>ipcRenderer.invoke('eye-of-zomm:discovery','get-state'),
    action:(action,value)=>ipcRenderer.invoke('eye-of-zomm:discovery',action,value),
    resize:height=>ipcRenderer.invoke('eye-of-zomm:discovery','notice-height',height),
    onState:callback=>{if(typeof callback!=='function')return()=>{};const listener=(_event,state)=>callback(state);ipcRenderer.on('eye-of-zomm:discovery-notices-state',listener);return()=>ipcRenderer.removeListener('eye-of-zomm:discovery-notices-state',listener);}
});
