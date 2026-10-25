import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {probeWin32HitTest,PROCESS_TIMEOUT_MS,QUERY_TIMEOUT_MS}=createRequire(import.meta.url)('../scripts/win32-hit-test-probe.cjs');
const input={handle:'1234',scope:'synthetic/edges',includeStyle:true,points:[{edge:'n',x:-10,y:25},{edge:'se',x:30,y:40}]};
let calls=0;
const result=await probeWin32HitTest(input,{execute:async(command,args,options)=>{
    calls++;assert.equal(command,'powershell.exe');assert.equal(options.windowsHide,true);assert.equal(options.timeout,PROCESS_TIMEOUT_MS);assert.equal(PROCESS_TIMEOUT_MS,30000);assert.equal(QUERY_TIMEOUT_MS,500);
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    assert.match(script,/SendMessageTimeoutW/);assert.match(script,/SMTO_ABORTIFHUNG \| SMTO_ERRORONEXIT/);assert.doesNotMatch(script,/SMTO_NOTIMEOUTIFNOTHUNG/);
    return{stdout:JSON.stringify({ok:true,thickFrame:false,hits:[{edge:'n',success:true,hit:-1},{edge:'se',success:true,hit:1}]}),stderr:''};
}});
assert.equal(calls,1);assert.equal(result.hits[0].hit,-1,'The actual signed native result is retained, never replaced by the completion status');
const timeout=Object.assign(Error('Synthetic process failure'),{code:'ETIMEDOUT',killed:true,signal:'SIGTERM',stdout:'partial JSON',stderr:'EOZ_WIN32_PROBE stage=compile-start'});
let failedCalls=0;
await assert.rejects(probeWin32HitTest(input,{now:()=>42,execute:async()=>{failedCalls++;throw timeout;}}),error=>{
    assert.equal(error.cause,timeout);for(const field of ['"code":"ETIMEDOUT"','"killed":true','"signal":"SIGTERM"','"stdout":"partial JSON"','stage=compile-start','"elapsedMs":0'])assert(error.message.includes(field));return true;
});
assert.equal(failedCalls,1,'A failed native process is not retried');
for(const invalid of [{ok:false,hits:[]},{ok:true,thickFrame:false,hits:[{edge:'n',success:true,hit:1}]},{ok:true,thickFrame:false,hits:[{edge:'se',success:true,hit:1},{edge:'n',success:true,hit:1}]},{ok:true,thickFrame:false,hits:[{edge:'n',success:false,hit:1},{edge:'se',success:true,hit:1}]}])await assert.rejects(probeWin32HitTest(input,{execute:async()=>({stdout:JSON.stringify(invalid),stderr:'EOZ_WIN32_PROBE stage=query-failed/n/win32=0'})}),/incomplete native result/);
await assert.rejects(probeWin32HitTest(input,{execute:async()=>({stdout:'{',stderr:'x'.repeat(50000)})}),error=>{assert.match(error.message,/invalid JSON/);assert(error.message.length<7000,'Process diagnostics are bounded');return true;});
console.log('Win32 fixture probe: bounded query/process budgets, signed native results, complete edge coverage, original failure metadata and bounded diagnostics passed.');
