'use strict';

/** Account restoration can gate native collection without delaying first paint.
 * Start after creating the main window; failure releases local collection while
 * the uploader retains its normal authenticated-session checks and retries.
 */
function createObservationStartup(){
    let complete,task;
    const ready=new Promise(resolve=>{complete=resolve;});
    return{
        ready,
        start(publishStatus){
            if(!task)task=Promise.resolve().then(publishStatus).catch(()=>{}).finally(complete);
            return task;
        }
    };
}
module.exports={createObservationStartup};
