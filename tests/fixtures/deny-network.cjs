'use strict';
const deny=()=>{throw new Error('Network access is forbidden during offline OCR verification.');};
globalThis.fetch=deny;
for(const name of ['node:http','node:https']){const api=require(name);api.request=deny;api.get=deny;}
const net=require('node:net');net.connect=deny;net.createConnection=deny;
