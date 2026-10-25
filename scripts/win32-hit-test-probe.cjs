'use strict';

const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const executeFile=promisify(execFile);
const PROCESS_TIMEOUT_MS=30000,QUERY_TIMEOUT_MS=500;
const bounded=value=>String(value??'').slice(-6000);
const literal=value=>"'"+String(value).replace(/'/g,"''")+"'";

// Fixture-only inspection: query ordinary native client hit regions without
// sending gameplay input. Startup/compilation and each window query have
// separate diagnostics; no failed query or process is retried.
async function probeWin32HitTest({handle,points,scope,includeStyle=false},{execute=executeFile,now=Date.now}={}){
    if(!/^\d+$/.test(String(handle))||!Array.isArray(points)||!points.length||points.length>8||points.some(point=>!/^[-a-z]+$/.test(point.edge)||![point.x,point.y].every(Number.isSafeInteger)))throw Error('Invalid native hit-test fixture input');
    scope=String(scope??'').slice(0,80);
    const ps=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $clock=[Diagnostics.Stopwatch]::StartNew(); $scope=${literal(scope)};
function Mark([string]$stage) { [Console]::Error.WriteLine(('EOZ_WIN32_PROBE scope={0} stage={1} elapsedMs={2}' -f $scope,$stage,$clock.ElapsedMilliseconds)); }
Mark 'powershell-ready';
try {
    Mark 'compile-start';
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class EozBoundedHit { [DllImport("kernel32.dll",EntryPoint="SetLastError",ExactSpelling=true)] public static extern void ClearError(uint error); [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",ExactSpelling=true,SetLastError=true)] public static extern IntPtr Query(IntPtr hwnd,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result); [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW",ExactSpelling=true,SetLastError=true)] public static extern IntPtr Style(IntPtr hwnd,int index); }';
    Mark 'compile-ready';
    $window=[IntPtr]::new([long]${handle}); $points=${literal(JSON.stringify(points))} | ConvertFrom-Json;
    # SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT. Never disable the timeout.
    $flags=0x0002 -bor 0x0020;
    $hits=@($points | ForEach-Object {
        $edge=$_.edge; Mark ('query-start/'+$edge);
        $packed=(([int]$_.y -shl 16) -bor ([int]$_.x -band 65535)); $hit=[IntPtr]::Zero;
        [EozBoundedHit]::ClearError(0);
        $success=[EozBoundedHit]::Query($window,132,[IntPtr]::Zero,[IntPtr]::new($packed),$flags,${QUERY_TIMEOUT_MS},[ref]$hit);
        if($success -eq [IntPtr]::Zero) {
            $nativeError=[Runtime.InteropServices.Marshal]::GetLastWin32Error(); Mark ('query-failed/'+$edge+'/win32='+$nativeError);
            throw ('SendMessageTimeoutW failed: edge={0}, win32={1}, queryTimeoutMs=${QUERY_TIMEOUT_MS}' -f $edge,$nativeError);
        }
        Mark ('query-ready/'+$edge); [ordered]@{edge=$edge;success=$true;hit=$hit.ToInt64()}
    });
    $result=[ordered]@{ok=$true;hits=$hits};
    ${includeStyle?"Mark 'style-start'; $result['thickFrame']=(([EozBoundedHit]::Style($window,-16).ToInt64() -band 262144) -ne 0); Mark 'style-ready';":''}
    Mark 'complete'; $result | ConvertTo-Json -Depth 4 -Compress;
} catch { Mark 'failed'; [Console]::Error.WriteLine($_.Exception.Message); exit 1; }`;
    const started=now();let output;
    try{
        output=await execute('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:PROCESS_TIMEOUT_MS,maxBuffer:64*1024});
    }catch(error){
        const failure=new Error('Win32 fixture probe process failed: '+JSON.stringify({scope,elapsedMs:now()-started,processTimeoutMs:PROCESS_TIMEOUT_MS,queryTimeoutMs:QUERY_TIMEOUT_MS,code:error.code??null,killed:error.killed??null,signal:error.signal??null,stdout:bounded(error.stdout),stderr:bounded(error.stderr)}),{cause:error});
        throw failure;
    }
    let result;
    try{result=JSON.parse(output.stdout);}catch(error){throw new Error('Win32 fixture probe returned invalid JSON: '+JSON.stringify({scope,elapsedMs:now()-started,stdout:bounded(output.stdout),stderr:bounded(output.stderr)}),{cause:error});}
    if(result?.ok!==true||!Array.isArray(result.hits)||result.hits.length!==points.length||result.hits.some((hit,index)=>hit.edge!==points[index].edge||hit.success!==true||!Number.isSafeInteger(hit.hit))||includeStyle&&typeof result.thickFrame!=='boolean')throw Error('Win32 fixture probe returned an incomplete native result: '+JSON.stringify({scope,stdout:bounded(output.stdout),stderr:bounded(output.stderr)}));
    return result;
}

module.exports={probeWin32HitTest,PROCESS_TIMEOUT_MS,QUERY_TIMEOUT_MS};
