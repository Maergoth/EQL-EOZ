// Native APIs own eligibility, live duplicate checks and create-only writes.
// This controller keeps renderer cancellation between the two native phases.
export function createAutomaticItemContribution({prepare,submit,cancel,onBusy=()=>{},onPlan=()=>{},onResult=()=>{},onDeferred=()=>{},onError=()=>{}}={}){
    const attempted=new Set();let active=null;
    const current=record=>active===record&&!record.cancelled&&record.request.isCurrent(record.planId);
    async function revoke(record){if(record.planId)try{await cancel({planId:record.planId});}catch{/* A failed cancellation never permits renderer submission. */}}
    return{
        async attempt(request){
            const id=request.candidate.id;if(active||attempted.has(id)||!request.isCurrent(null))return false;
            attempted.add(id);const record={request,planId:null,cancelled:false};active=record;onBusy(true);
            try{
                const prepared=await prepare({candidate:request.candidate,captureEvidence:request.observation.input.captureEvidence});
                record.planId=prepared?.plan?.id||null;
                if(!current(record)){await revoke(record);return false;}
                if(!prepared?.ok){if(!prepared?.skipped)onDeferred(request.candidate,prepared?.reason||'This item needs review before publishing.',prepared?.plan);return false;}
                if(!record.planId||!prepared.plan.reviewDigest)throw Error('The automatic item review was incomplete. Use Preview wiki changes.');
                onPlan(request.candidate,prepared.plan);
                if(!current(record)){await revoke(record);return false;}
                const result=await submit({planId:record.planId,reviewDigest:prepared.plan.reviewDigest});
                // Always retain a confirmed publication receipt even if the user
                // navigated while the final native request was completing.
                if(result?.ok)onResult(request.candidate,result.plan);
                else if(!record.cancelled&&!result?.skipped&&!result?.plan?.automaticOptOut)onDeferred(request.candidate,result?.reason||'This item needs review before publishing.',result?.plan||prepared.plan);
                return result?.ok===true;
            }catch(error){if(!record.cancelled)onError(request.candidate,error);return false;}
            finally{if(active===record)active=null;onBusy(false);}
        },
        cancel(){if(!active)return;active.cancelled=true;void revoke(active);},
        get busy(){return Boolean(active);}
    };
}
