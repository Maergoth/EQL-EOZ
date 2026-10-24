'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// This transient surface can only read/act on its own current spawn request.
// No generic IPC, file access, capture, clipboard, installer or wiki API.
contextBridge.exposeInMainWorld('eyeOfZommSpawnPrompt',{
    getState:()=>ipcRenderer.invoke('eye-of-zomm:spawn-prompt','get-state'),
    action:(action,id)=>ipcRenderer.invoke('eye-of-zomm:spawn-prompt',action,{id}),
    onState:callback=>{if(typeof callback!=='function')return()=>{};const listener=(_event,state)=>callback(state);ipcRenderer.on('eye-of-zomm:spawn-state',listener);return()=>ipcRenderer.removeListener('eye-of-zomm:spawn-state',listener);}
});
