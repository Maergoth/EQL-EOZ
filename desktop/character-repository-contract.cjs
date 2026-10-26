'use strict';
const CHANNEL='eye-of-zomm:character-repository';
const PROGRESS_CHANNEL=CHANNEL+':progress';
const LIMITS=Object.freeze({recordBytes:8*1024*1024,pageBytes:1024*1024,pageSize:50,coreBytes:8*1024*1024,flowBytes:8*1024*1024,batchBytes:1024*1024,chunkBytes:64*1024,recordChunkBytes:512*1024,queryCharacters:160});
const ACTIONS=Object.freeze(['bootstrap','listProfiles','createProfile','selectProfile','getCore','transaction','list','get','getChunk','importFiles','cancelImport','beginLegacySeed','appendLegacySeed','commitLegacySeed','cancelLegacySeed','flush']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function failure(code,message){const error=new Error(message);error.code=code;return error;}
function id(value,label='ID'){if(typeof value!=='string'||!value||value.length>240||/[\u0000-\u001f\u007f]/u.test(value))throw failure('invalid-request',`Invalid ${label}.`);return value;}
function json(value,max,label){let text;try{text=JSON.stringify(value);}catch{throw failure('invalid-request',`${label} must be JSON.`);}if(typeof text!=='string'||Buffer.byteLength(text)>max)throw failure('record-too-large',`${label} exceeds its per-record limit. Existing data was kept.`);return text;}
function revision(value){if(!Number.isSafeInteger(value)||value<0)throw failure('invalid-request','A current profile revision is required.');return value;}
module.exports={CHANNEL,PROGRESS_CHANNEL,LIMITS,ACTIONS,object,failure,id,json,revision};
