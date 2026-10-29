'use strict';
const CHANNEL='eye-of-zomm:features';
class FeatureControls {
    constructor({registry,initial={},persist=async()=>{},prepare=async()=>{},apply=async()=>{},onChanged=()=>{},allowed=()=>true}={}){
        this.registry=registry;this.features=registry.normalizeFeatures(initial);this.persist=persist;this.prepare=prepare;this.apply=apply;this.onChanged=onChanged;this.allowed=allowed;this.revision=0;this.epochs=new Map();this.chain=Promise.resolve();
    }
    enabled(id){return this.registry.featureEnabled(this.features,id);}
    snapshot(){return {schemaVersion:1,revision:this.revision,features:{...this.features}};}
    lease(id){const epoch=this.epochs.get(id)||0;return()=>this.enabled(id)&&(this.epochs.get(id)||0)===epoch;}
    assert(id){if(!this.enabled(id))throw Error('This feature is disabled in Settings.');}
    async handle(event,action,value){if(!this.allowed(event))throw Error('Feature settings are available only in the main app.');if(action==='get-state')return this.snapshot();if(action==='set')return this.set(value);throw Error('Unknown feature setting action.');}
    set(value){
        const patch=this.registry.validateFeaturePatch(value);
        const task=this.chain.catch(()=>{}).then(async()=>{
            const before=this.snapshot(),next={...this.features,...patch},changed=this.registry.FEATURE_IDS.filter(id=>next[id]!==this.features[id]);
            if(!changed.length)return this.snapshot();
            // Save already accepted renderer work while the old policy remains
            // enabled. A failed preparation leaves flags and leases untouched.
            const release=await this.prepare({schemaVersion:1,revision:this.revision+1,features:{...next}},before,[...changed]);
            try{
            // Revoke immediately, before persistence or any asynchronous stop.
            // A disable/re-enable cycle cannot revive an old in-flight intent.
            for(const id of changed)this.epochs.set(id,(this.epochs.get(id)||0)+1);
            this.features=next;this.revision++;
            try{await this.apply(this.snapshot(),before,changed);await this.persist({...next});}
            catch(error){
                // A failed save must not claim a durable setting. Disabled work
                // remains stopped; restoration never starts background work.
                this.features=before.features;this.revision++;this.onChanged(this.snapshot());throw error;
            }
            const result=this.snapshot();this.onChanged(result);return result;
            }finally{if(typeof release==='function')await release();}
        });this.chain=task;return task;
    }
}
module.exports={FeatureControls,CHANNEL};
