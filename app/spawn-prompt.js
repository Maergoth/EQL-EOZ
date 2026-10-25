import {createDiscoveryNoticeQueue} from './wiki-discovery-ui.js';
const api=window.eyeOfZommSpawnPrompt,queue=createDiscoveryNoticeQueue({maxVisible:1}),$=id=>document.getElementById(id);
let current=null,disposed=false,busy=false,choiceError='';
function paint(){
    current=queue.visible()[0]||null;const prompt=current?.prompt,complete=current?.captureState==='captured';
    $('name').textContent=prompt?.name||'';$('zone').textContent=prompt?.zone||'';$('remaining').textContent=current?complete?'Saved':current.captureState?'Waiting for /loc':`${Math.ceil(current.remainingMs/1000)}s`:'';
    $('prompt').classList.toggle('is-complete',complete);$('status').textContent=current?.message||'';$('contribute').textContent=current?.captureState?'Retry /loc':'Contribute';$('contribute').hidden=complete;$('ignore').hidden=complete;
    $('notable-question').textContent=prompt?`Is ${prompt.name} notable?`:'';
    for(const [id,value]of [['notable-yes',true],['notable-no',false]]){$(id).setAttribute('aria-pressed',String(prompt?.notable===value));$(id).disabled=complete;$(id).setAttribute('aria-disabled',String(busy||complete||prompt?.notablePending===true));}
    $('notable-status').textContent=choiceError||prompt?.notableMessage||(prompt?.notablePending?'Saving choice…':typeof prompt?.notable==='boolean'?'Saved for review':'Optional · unanswered');
    for(const id of ['contribute','ignore','dismiss'])$(id).disabled=busy;
}
function render(state){if(disposed)return;const prior=current?.id;queue.reconcile(Array.isArray(state)?state.filter(prompt=>prompt.purpose==='spawn-location'):[]);const changed=prior!==queue.visible()[0]?.id;if(changed)choiceError='';paint();if(changed){if(document.scrollingElement)document.scrollingElement.scrollTop=0;$('prompt').scrollTop=0;}if(current){queue.hold(current.id,'hover',$('prompt').matches(':hover'));queue.hold(current.id,'focus',document.activeElement!==document.body);}}
async function act(action){if(!current||busy||disposed)return;const id=current.id;busy=true;paint();try{const result=await api.action(action,id);if(disposed||current?.id!==id)return;if(action==='contribute'&&result?.pendingCapture)queue.captureStatus(id,'waiting',result.captureMessage,result.captureRequest);else queue.remove(id);}catch(error){if(current?.id===id)queue.captureStatus(id,'retry',error.message||'This prompt could not be updated.');}finally{busy=false;paint();}}
async function chooseNotable(notable){
    if(!current||busy||disposed||current.prompt.notablePending||current.captureState==='captured')return;
    const {id,prompt}=current;busy=true;choiceError='';queue.hold(id,'notable',true);paint();
    try{await api.setNotable({id,candidateId:prompt.candidateId,notable});}
    catch(error){if(current?.id===id)choiceError=error.message||'The notable choice could not be saved.';}
    finally{busy=false;queue.hold(id,'notable',false);paint();}
}
for(const action of ['contribute','ignore','dismiss'])$(action).addEventListener('click',()=>void act(action));
$('notable-yes').addEventListener('click',()=>void chooseNotable(true));$('notable-no').addEventListener('click',()=>void chooseNotable(false));
$('prompt').addEventListener('mouseenter',()=>{if(current)queue.hold(current.id,'hover',true);});
$('prompt').addEventListener('mouseleave',()=>{if(current)queue.hold(current.id,'hover',false);});
document.addEventListener('focusin',()=>{if(current)queue.hold(current.id,'focus',true);});
document.addEventListener('focusout',()=>queueMicrotask(()=>{if(current)queue.hold(current.id,'focus',document.activeElement!==document.body);}));
let receivedState=false;const unsubscribe=api.onState(state=>{receivedState=true;render(state);}),timer=setInterval(()=>{if(disposed)return;const expired=queue.tick();paint();for(const id of expired)void api.action('dismiss',id).catch(()=>{});},200);
void api.getState().then(state=>{if(!receivedState)render(state);}).catch(()=>{if(!receivedState&&!disposed)$('status').textContent='The spawn prompt is unavailable.';});
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);unsubscribe();},{once:true});
