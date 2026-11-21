import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createObservationStartup}=createRequire(import.meta.url)('../desktop/drop-observation-startup.cjs');

const startup=createObservationStartup();
let restored=false,calls=0,finishStatus,firstPaint=false;
const pendingCollection=startup.ready.then(()=>{restored=true;});
await Promise.resolve();
assert.equal(restored,false,'Native collection waits for initial account binding');

// Main creates the window before starting this background account restore.
firstPaint=true;
const restore=startup.start(()=>{
    calls++;
    assert(firstPaint,'Remote account work starts after the window can paint');
    return new Promise(resolve=>{finishStatus=resolve;});
});
assert(restore instanceof Promise);
assert.equal(calls,0,'Scheduling account restoration returns without running network work synchronously');
await Promise.resolve();
assert.equal(calls,1);
assert.equal(restored,false,'An unresolved wiki request holds collection but cannot hold first paint');
assert.equal(startup.start(()=>{throw Error('Duplicate restore');}),restore,'Overlapping starts share one request');
finishStatus();
await Promise.all([restore,pendingCollection]);
assert.equal(restored,true,'Collection resumes after the status callback has bound the account');

for(const result of [()=>Promise.reject(Error('Synthetic network timeout')),()=>{throw Error('Synthetic status failure');}]){
    const failed=createObservationStartup();
    await failed.start(result);
    await failed.ready;
}
console.log('Observation startup: background account restoration, initial collection binding, shared start and caught timeout/failure passed.');
