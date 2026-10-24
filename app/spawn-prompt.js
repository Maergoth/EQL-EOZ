import {createDiscoveryNoticeQueue} from './wiki-discovery-ui.js';
const api=window.eyeOfZommSpawnPrompt,queue=createDiscoveryNoticeQueue({maxVisible:1}),$=id=>document.getElementById(id);
let current=null,disposed=false,busy=false;
function paint(){current=queue.visible()[0]||null;const prompt=current?.prompt;$('name').textContent=prompt?.name||'';$('zone').textContent=prompt?.zone||'';$('remaining').textContent=current?`${Math.ceil(current.remainingMs/1000)}s`:'';}
function render(state){if(disposed)return;queue.reconcile(Array.isArray(state)?state.filter(prompt=>prompt.purpose==='spawn-location'):[]);paint();if(current){queue.hold(current.id,'hover',$('prompt').matches(':hover'));queue.hold(current.id,'focus',document.activeElement!==document.body);}}
async function act(action){if(!current||busy||disposed)return;const id=current.id;busy=true;for(const button of document.querySelectorAll('button'))button.disabled=true;try{await api.action(action,id);queue.remove(id);$('status').textContent='';}catch(error){$('status').textContent=error.message||'This prompt could not be updated.';}finally{busy=false;for(const button of document.querySelectorAll('button'))button.disabled=false;paint();}}
for(const action of ['contribute','ignore','dismiss'])$(action).addEventListener('click',()=>void act(action));
$('prompt').addEventListener('mouseenter',()=>{if(current)queue.hold(current.id,'hover',true);});
$('prompt').addEventListener('mouseleave',()=>{if(current)queue.hold(current.id,'hover',false);});
document.addEventListener('focusin',()=>{if(current)queue.hold(current.id,'focus',true);});
document.addEventListener('focusout',()=>queueMicrotask(()=>{if(current)queue.hold(current.id,'focus',document.activeElement!==document.body);}));
let receivedState=false;const unsubscribe=api.onState(state=>{receivedState=true;render(state);}),timer=setInterval(()=>{if(disposed)return;const expired=queue.tick();paint();for(const id of expired)void api.action('dismiss',id).catch(()=>{});},200);
void api.getState().then(state=>{if(!receivedState)render(state);}).catch(()=>{if(!receivedState&&!disposed)$('status').textContent='The spawn prompt is unavailable.';});
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);unsubscribe();},{once:true});
