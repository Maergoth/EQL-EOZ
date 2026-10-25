'use strict';
const {WikiClient,WikiError,PRODUCTION_ORIGIN,validatePNG}=require('./wiki-client.cjs');
const {readBoundedFile}=require('./wiki-attachments.cjs');
const {ContributionGapVerifier}=require('./contribution-gap-verifier.cjs');
const {LiveWikiCache}=require('./live-wiki-cache.cjs');
const CHANNEL='eye-of-zomm:wiki';

class WikiHost {
    constructor({electron,origin,getMainWindow,stateDir,version,devWikiOrigin=null,allowLoopbackDevelopment=false,client=null,onStatus=null,onAttachmentPrepared=null,onIconRequest=null,onCaptureEvidence=null,onItemCatalog=null,isContributionIgnored=null,discoveryVerifier=null,liveCache=null}) {
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.disposed=false;this.loginWindow=null;this.onStatus=onStatus;
        this.onAttachmentPrepared=onAttachmentPrepared;this.onIconRequest=onIconRequest;
        this.onCaptureEvidence=onCaptureEvidence;
        this.onBaseCatalog=onItemCatalog||(()=>Promise.resolve({}));
        this.liveCache=liveCache||new LiveWikiCache({stateDir,onChange:()=>this.scheduleLiveEntriesChanged()});
        this.onItemCatalog=async()=>{const base=await this.onBaseCatalog()||{},snapshot=await this.liveCache.snapshot(base),{applyLiveWikiOverlay}=await import('../app/live-wiki-overlay.js');return applyLiveWikiOverlay(base,snapshot);};
        this.capturedItemPlans=new Map();this.preparingCapturedItem=false;
        this.statusRevision=0;this.isContributionIgnored=isContributionIgnored;
        this.discoveryVerifier=discoveryVerifier||new ContributionGapVerifier({getPack:this.onBaseCatalog,liveCache:this.liveCache,fetchImpl:globalThis.fetch});
        this.session=electron.session.fromPartition(devWikiOrigin?'eye-of-zomm-wiki-development':'persist:eye-of-zomm-wiki');
        this.client=client||new WikiClient({session:this.session,version,stateDir,origin:devWikiOrigin||PRODUCTION_ORIGIN,allowLoopbackDevelopment,getItemCatalog:this.onItemCatalog,isContributionIgnored,onWikiPageChanged:async title=>{this.discoveryVerifier.clear();await this.liveCache.invalidate(title);}});
        this.session.setPermissionRequestHandler?.((_contents,_permission,callback)=>callback(false));
        this.session.setPermissionCheckHandler?.(()=>false);
        this.session.setDevicePermissionHandler?.(()=>false);
        this.downloadHandler=event=>event.preventDefault();this.session.on?.('will-download',this.downloadHandler);
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    allowed(event){const window=this.getMainWindow();return !this.disposed&&Boolean(window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    async handle(event,action,value){
        if(!this.allowed(event))throw new WikiError('sender','Wiki contribution actions are available only in the main app.');
        if(typeof action!=='string')throw new WikiError('action','Invalid wiki action.');
        try{
            switch(action){
            case 'status':{await this.client.load();return await this.freshStatus();}
            case 'live-entries':return await this.liveEntries();
            case 'verify-discovery':return await this.verifyDiscovery(value);
            case 'contribution-history':return await this.client.contributionHistory(value);
            case 'observation-status':return await this.client.observationStatus();
            case 'submit-observations':return await this.client.submitObservations(value?.batch,{expectedUser:value?.expectedUser});
            case 'prepare-attachment':return await this.prepareAttachment(value);
            case 'discard-attachment':return await this.client.attachments.discard(String(value?.attachmentId||''));
            case 'icon-catalog':case 'icon-match':if(typeof this.onIconRequest!=='function')throw new WikiError('icon','The wiki icon service is unavailable.');return await this.onIconRequest(action,value);
            case 'login':return this.login();
            case 'logout':return await this.logout();
            case 'matches':return await this.client.findMatches(value);
            case 'blueprints':return await this.client.blueprints({force:value?.force===true});
            case 'prepare-plan':return await this.client.preparePlan(value);
            case 'prepare-captured-item':return await this.prepareCapturedItem(value);
            case 'submit-captured-item':return await this.submitCapturedItem(value);
            case 'cancel-captured-item':this.capturedItemPlans.delete(String(value?.planId||''));return {ok:true};
            case 'get-plan':return await this.client.getPlan(String(value?.planId||''));
            case 'submit-plan':return await this.client.submitPlan(value);
            case 'character-sheet-capability':return await this.client.characterSheetCapability();
            case 'share-character':return await this.client.shareCharacter(value);
            case 'upload-character':{
                if(!value||typeof value!=='object')throw new WikiError('png','Invalid character snapshot.');
                const bytes=validatePNG(value.png);
                const image=this.electron.nativeImage.createFromBuffer(bytes);
                if(image.isEmpty())throw new WikiError('png','The snapshot could not be decoded as an image.');
                return await this.client.uploadCharacter(value);
            }
            default:throw new WikiError('action','Unknown wiki action.');
            }
        }catch(error){if(['prepare-attachment','discard-attachment'].includes(action)&&typeof error.code==='string'&&/^E[A-Z]+$/.test(error.code))throw new Error('[attachment] The screenshot could not be read or saved. Select it again.');throw new Error(`${error.code?`[${error.code}] `:''}${String(error.message||'The wiki action failed.').slice(0,600)}`);}
    }
    async liveEntries(){return this.liveCache.snapshot(await this.onBaseCatalog()||{});}
    scheduleLiveEntriesChanged(){
        if(this.disposed||this.liveEntriesTimer)return;
        this.liveEntriesTimer=setTimeout(()=>{this.liveEntriesTimer=null;void this.liveEntries().then(snapshot=>{const window=this.getMainWindow();if(!this.disposed&&window&&!window.isDestroyed())window.webContents.send('eye-of-zomm:live-wiki-entries-changed',snapshot);}).catch(()=>{});},100);
        this.liveEntriesTimer.unref?.();
    }
    async verifyDiscovery(value){
        try{if(this.disposed)return{state:'unknown',reasons:[],confirmedRelations:[],checkedAt:new Date().toISOString()};if(['npc','item'].includes(value?.kind)&&typeof this.isContributionIgnored==='function'&&await this.isContributionIgnored({kind:value.kind,name:value.name}))return{state:'covered',reasons:[],confirmedRelations:[],checkedAt:new Date().toISOString()};return await this.discoveryVerifier.check(value);}catch{return{state:'unknown',reasons:[],confirmedRelations:[],checkedAt:new Date().toISOString()};}
    }
    async prepareAttachment({candidateId,kind,source,captureEvidence}={}){
        if(typeof candidateId!=='string'||candidateId.length>160||!/^[A-Za-z0-9_-]+$/.test(candidateId)||!['item','npc','zone','spell'].includes(kind)||!['clipboard','file','capture'].includes(source)||source==='capture'&&(kind!=='item'||typeof this.onCaptureEvidence!=='function'))throw new WikiError('attachment','Choose a candidate and paste/select a PNG or read its current item examine.');
        let bytes;
        if(source==='capture')bytes=(await this.onCaptureEvidence(captureEvidence)).png;
        else if(source==='clipboard'){const image=this.electron.clipboard.readImage();if(image.isEmpty())throw new WikiError('attachment','The clipboard does not contain an image.');const size=image.getSize();if(size.width>8192||size.height>8192||size.width*size.height>15000000)throw new WikiError('png','The screenshot exceeds the image size limit.');bytes=image.toPNG();}
        else{const selected=await this.electron.dialog.showOpenDialog(this.getMainWindow(),{title:'Select contribution screenshot',properties:['openFile'],filters:[{name:'PNG screenshot',extensions:['png']}]});if(selected.canceled||!selected.filePaths?.[0])return {cancelled:true};bytes=await readBoundedFile(selected.filePaths[0]);}
        if(this.disposed)throw new WikiError('closed','The wiki service closed.');
        bytes=validatePNG(bytes);const image=this.electron.nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new WikiError('png','The screenshot could not be decoded.');
        const descriptor=await this.client.attachments.add(bytes,{candidateId,kind}),size=image.getSize();
        if(source==='capture')try{await this.onCaptureEvidence(captureEvidence);}catch(error){await this.client.attachments.discard(descriptor.id);throw error;}
        try{if(source!=='capture'&&kind==='item'&&typeof this.onAttachmentPrepared==='function')await this.onAttachmentPrepared({png:bytes,candidateId,kind});}
        catch(error){descriptor.warning='The screenshot was saved, but its item text could not be read. Review the entry manually.';}
        return {id:descriptor.id,attachmentId:descriptor.id,thumbnail:image.resize({width:240,height:240,quality:'good'}).toDataURL(),width:size.width,height:size.height,bytes:descriptor.bytes,...(descriptor.warning?{warning:descriptor.warning}:{})};
    }
    async capturedCandidate(candidate,entry){
        const {itemExaltationBaseIdentity,normalizeWikiIdentity}=await import('../app/wiki-identity.js'),{ITEM_RECOVERY_FIELDS,itemRecoveryLabel,proposeItemBaseReview,validateItemBaseReview}=await import('../app/item-base-review.js'),{normalizeContributionChoices}=await import('../app/contribution-choice-picker.js');
        const observation=entry.observation,identity=value=>normalizeWikiIdentity(itemExaltationBaseIdentity(value)),name=itemExaltationBaseIdentity(observation?.subject?.name);
        if(candidate?.kind!=='item'||typeof candidate.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(candidate.id)||candidate.intent==='update'||candidate.planId||['submitted','partial','needs-attention'].includes(candidate.status)||!name||identity(candidate.name)!==identity(name)||candidate.title&&identity(candidate.title)!==identity(name))throw new WikiError('automatic-review','The current item does not exactly match its native examine reading.');
        if(observation?.kind!=='ocr'||observation.owner!=='contribution'||observation.parser?.name!=='item-examine'||observation.subject?.kind!=='item'||/Conflicting OCR values left unknown/i.test(observation.evidence?.text||''))throw new WikiError('automatic-review','The examine reading has unresolved values. Review it manually.');
        const fields={},labels={...Object.fromEntries(Object.entries(ITEM_RECOVERY_FIELDS).map(([field,key])=>[field,itemRecoveryLabel(key)])),requiredLevel:'Required Level',recommendedLevel:'Recommended Level',backstabDamage:'Backstab Damage',accuracy:'Accuracy',avoidance:'Avoidance',combatEffects:'Combat Effects',strikeThrough:'Strike Through',stunResist:'Stun Resist',damageShield:'Damage Shield',damageShieldMitigation:'Damage Shield Mitigation',dotShielding:'DoT Shielding',meleeShielding:'Melee Shielding',spellShielding:'Spell Shielding'};
        if(!Array.isArray(observation.fields)||observation.fields.length>80)throw new WikiError('automatic-review','Incomplete item fields need review.');
        for(const field of observation.fields){if(!field||typeof field.key!=='string'||Object.hasOwn(fields,field.key))throw new WikiError('automatic-review','Ambiguous item fields need review.');fields[field.key]={value:field.value,confirmed:true};if(field.key!=='rawStatBlock'&&(!Number.isFinite(field.confidence)||field.confidence<70))throw new WikiError('automatic-review','The item reading needs a clearer name or stat capture.');}
        if(!fields.name||identity(fields.name.value)!==identity(name))throw new WikiError('automatic-review','The item name is not consistent across this examine reading.');
        if(fields.modified?.value===true||fields.augmented?.value===true||fields.augments?.value?.length||fields.augmentNames?.value?.length||Number(fields.augmentSlotCount?.value)>Number(fields.emptyAugmentSlots?.value)&&fields.emptyAugmentSlots?.value!==undefined)throw new WikiError('automatic-review','An item with occupied Exaltations or modifiers needs manual review.');
        const lines=[];let useful=0;
        for(const [key,label]of Object.entries(labels))if(fields[key]){const number=fields[key].value;if(typeof number!=='number'||!Number.isFinite(number)||Math.abs(number)>1e7)throw new WikiError('automatic-review','Invalid item numbers need review.');lines.push(`${label}: ${number}`);if(!['weight','requiredLevel','recommendedLevel','resistCorruption'].includes(key))useful++;}
        for(const key of ['classes','slots'])if(fields[key]){const choices=normalizeContributionChoices(key,fields[key].value);if(choices.unrecognized.length)throw new WikiError('automatic-review','Unrecognized classes or slots need review.');fields[key]={value:choices.value,confirmed:true};if(choices.value.length)lines.push(`${key==='classes'?'Class':'Slot'}: ${choices.value.join(' ')}`);}
        if(!useful||!fields.slots?.value?.length&&!fields.classes?.value?.length)throw new WikiError('automatic-review','A useful item stat and class or slot details are required for automatic creation.');
        for(const [key,label]of [['races','Race'],['size','Size']])if(fields[key])lines.push(`${label}: ${Array.isArray(fields[key].value)?fields[key].value.join(' '):fields[key].value}`);
        const effects=fields.effects?.value;if(effects!==undefined&&(!Array.isArray(effects)||effects.length>8||effects.some(line=>typeof line!=='string'||!/^(?:(?:Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:/i.test(line))))throw new WikiError('automatic-review','The item effect needs manual review.');
        if(fields.noTrade?.value===true)lines.push('NO TRADE');
        for(const key of ['augmentSlotCount','emptyAugmentSlots'])if(fields[key]&&(!Number.isInteger(fields[key].value)||fields[key].value<0||fields[key].value>20))throw new WikiError('automatic-review','The Exaltation slot count needs review.');
        const safeFields=Object.fromEntries(Object.entries(fields).filter(([key])=>Object.hasOwn(labels,key)||['classes','slots','races','size','effects','tier','fraction','fractionMaximum','modified','augmented','augmentNames','augmentSlotCount','emptyAugmentSlots'].includes(key)));
        if(!safeFields.tier)safeFields.tier={value:0,confirmed:true};
        if(!Number.isInteger(safeFields.tier.value)||safeFields.tier.value<0||safeFields.tier.value>10)throw new WikiError('automatic-review','The observed item tier needs review.');
        const icon=candidate.fields?.iconId;if(icon?.confirmed===true&&Number.isInteger(Number(icon.value))&&Number(icon.value)>=0&&Number(icon.value)<=1e6)safeFields.iconId={value:Number(icon.value),confirmed:true};
        safeFields.statLines={value:lines,confirmed:true};let rebuilt={id:candidate.id,kind:'item',name,title:name,era:'Classic Era',intent:'create',fields:safeFields,sources:[],relations:[],captureObservationId:entry.proof.observationId,captureFrameId:entry.proof.frameId};
        if(safeFields.tier.value>0){const proposal=proposeItemBaseReview(rebuilt);if(!proposal)throw new WikiError('automatic-review','Tiered base recovery needs manual review.');rebuilt={...rebuilt,...proposal};if(!validateItemBaseReview(rebuilt).ok)throw new WikiError('automatic-review','Tiered base recovery is unresolved.');}
        return rebuilt;
    }
    async prepareCapturedItem({candidate,captureEvidence}={}){
        if(this.preparingCapturedItem)return {ok:false,deferred:true,reason:'Another captured item is being prepared.'};
        this.preparingCapturedItem=true;let plan;
        try{
            if(typeof this.onCaptureEvidence!=='function')throw new WikiError('automatic-review','Fresh native item evidence is required.');
            const entry=await this.onCaptureEvidence(captureEvidence),rebuilt=await this.capturedCandidate(candidate,entry),guard=()=>{if(this.disposed)throw new WikiError('closed','Contribute has closed.');return this.onCaptureEvidence(captureEvidence);};
            if(this.onItemCatalog){const catalog=await this.onItemCatalog();if(!catalog||catalog.meta?.sample===true||catalog.meta?.wikiEntitiesComplete!==true||!Array.isArray(catalog.wikiEntities?.items))throw new WikiError('automatic-review','The local item catalog is incomplete. Review this item manually.');await this.client.assertCapturedCatalog(rebuilt.name,catalog.wikiEntities.items);}
            await this.client.load();const prior=[...this.client.plans.values()].find(value=>value.automaticItem?.candidateId===rebuilt.id||value.automaticItem?.title===rebuilt.title);if(prior)throw new WikiError('automatic-review','This item already has an automatic attempt. Review its saved result before retrying.');
            const attachmentId=candidate.attachment?.attachmentId||candidate.attachment?.id;
            if(attachmentId){const attachment=await this.client.attachments.get(attachmentId,candidate.id);if(!attachment.bytes.equals(entry.png))throw new WikiError('automatic-review','The selected screenshot differs from the fresh item capture.');rebuilt.attachment={id:attachmentId,caption:'',license:'own-screenshot'};}
            else{const attachment=await this.prepareAttachment({candidateId:rebuilt.id,kind:'item',source:'capture',captureEvidence});rebuilt.attachment={id:attachment.attachmentId,caption:'',license:'own-screenshot'};}
            plan=await this.client.prepareCapturedItem(rebuilt,{guard});await guard();this.capturedItemPlans.set(plan.id,{proof:{...captureEvidence},reviewDigest:plan.reviewDigest,title:plan.pages[0].title});if(this.capturedItemPlans.size>20)this.capturedItemPlans.delete(this.capturedItemPlans.keys().next().value);
            return {ok:true,plan};
        }catch(error){plan=plan||error.plan;return {ok:false,deferred:true,reason:String(error.message||'This item needs review.'),...(plan?{plan}:{})};}
        finally{this.preparingCapturedItem=false;}
    }
    async submitCapturedItem({planId,reviewDigest}={}){
        const binding=this.capturedItemPlans.get(planId);if(!binding||binding.reviewDigest!==reviewDigest)return {ok:false,deferred:true,reason:'The automatic item capture is no longer current.'};
        try{
            const guard=async()=>{const current=()=>{if(this.disposed||this.capturedItemPlans.get(planId)!==binding)throw new WikiError('automatic-cancelled','Automatic item creation was cancelled.');};current();await this.onCaptureEvidence(binding.proof);current();};
            const beforeWrite=async(_stage,plan)=>{await guard();if(plan.pages.length!==1||plan.pages[0].role!=='primary'||plan.pages[0].operation!=='create'||!plan.automaticItem)throw new WikiError('automatic-review','Only one new item page may be created automatically.');await this.client.assertNewCapturedItem(binding.title);await guard();};
            await guard();const plan=await this.client.submitPlan({planId,reviewDigest},{beforeWrite});
            if(plan.automaticOptOut)return{ok:false,skipped:true,plan};
            return {ok:plan.status==='submitted',deferred:plan.status!=='submitted',plan,pageUrl:plan.status==='submitted'?`${this.client.origin}/${encodeURIComponent(plan.pages[0].title.replace(/ /g,'_'))}`:null,...(plan.status!=='submitted'?{reason:'The saved item result needs manual review before retry.'}:{})};
        }catch(error){return {ok:false,deferred:true,reason:String(error.message||'Automatic item creation stopped.'),plan:await this.client.getPlan(planId).catch(()=>null)};}
        finally{if(this.capturedItemPlans.get(planId)===binding)this.capturedItemPlans.delete(planId);}
    }
    async forwardStatus(status){
        if(this.disposed)return;
        if(typeof this.onStatus==='function')await this.onStatus(status);
        else{const main=this.getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('eye-of-zomm:wiki-state',status);}
    }
    async freshStatus(){const revision=++this.statusRevision,status=await this.client.status();if(revision===this.statusRevision)await this.forwardStatus(status);return status;}
    publishStatus(){
        if(this.disposed)return Promise.resolve();
        return this.freshStatus().catch(()=>{});
    }
    login(){
        if(this.disposed)throw new WikiError('closed','Wiki login has closed.');
        if(this.loginWindow&&!this.loginWindow.isDestroyed()){this.loginWindow.show();this.loginWindow.focus();void this.publishStatus();return {opening:true};}
        const window=new this.electron.BrowserWindow({width:1000,height:760,minWidth:640,minHeight:480,title:'Log in to EQL Wiki',autoHideMenuBar:true,backgroundColor:'#0b1420',parent:this.getMainWindow(),webPreferences:{session:this.session,nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false}});
        this.loginWindow=window;
        const trusted=url=>{try{const parsed=new URL(url);return parsed.origin===this.client.origin&&!parsed.username&&!parsed.password;}catch{return false;}};
        const guard=(event,url)=>{if(!trusted(url))event.preventDefault();};
        window.webContents.on('will-navigate',guard);window.webContents.on('will-redirect',guard);
        window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        window.webContents.on('did-finish-load',()=>this.publishStatus());
        window.on('closed',()=>{if(this.loginWindow===window)this.loginWindow=null;this.publishStatus();});
        window.loadURL(`${this.client.origin}/index.php?title=Special:UserLogin&returnto=Help%3AContents`).catch(()=>this.publishStatus());
        return {opening:true};
    }
    async logout(){
        if(this.client.busy)throw new WikiError('busy','Wait for the current wiki submission before logging out.');
        this.statusRevision++;
        if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();
        await this.session.clearStorageData();await this.session.clearCache();await this.client.clearAccountState();this.statusRevision++;const status={origin:this.client.origin,authenticated:false,user:null,canEdit:false,canCreate:false,canUpload:false,blocked:false};await this.forwardStatus(status);void this.publishStatus();return status;
    }
    dispose(){this.disposed=true;clearTimeout(this.liveEntriesTimer);this.liveCache.dispose();this.discoveryVerifier.dispose();this.electron.ipcMain.removeHandler(CHANNEL);this.session.removeListener?.('will-download',this.downloadHandler);if(this.loginWindow&&!this.loginWindow.isDestroyed())this.loginWindow.close();this.loginWindow=null;}
}
module.exports={WikiHost,CHANNEL};
