import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {discoveryQueueStabilityScenario} from './discovery-queue-stability-scenario.js';
const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
const previous={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
try{console.log('Mounted discovery queue stability:',await discoveryQueueStabilityScenario({document:dom.window.document,mountCaptureWorkspace,assert:(condition,message)=>assert(condition,message)}));}
finally{Object.assign(globalThis,previous);dom.window.close();}
