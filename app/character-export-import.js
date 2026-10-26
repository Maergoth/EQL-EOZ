// One Character action reads both ordinary game exports. The caller validates
// both parsed records and commits them together; this helper never changes a
// model, starts capture, or obtains filesystem paths from the renderer.
export async function readCharacterExports({inventory,achievements,metadata,isCurrent}={}){
    if(typeof inventory?.read!=='function'||typeof achievements?.read!=='function')return {ok:false,error:'Character export imports require the desktop app.'};
    if(typeof metadata?.name!=='string'||typeof metadata?.server!=='string'||typeof isCurrent!=='function')return {ok:false,error:'Choose a character and server before importing character exports.'};
    const request={name:metadata.name,server:metadata.server};
    const current=()=>{try{return isCurrent()===true;}catch{return false;}};
    const results={};
    for(const [exportType,host]of [['inventory',inventory],['achievements',achievements]]){
        if(!current())return {ok:false,stale:true,exportType};
        let result;
        try{
            result=await host.read({...request});
            if(!current())return {ok:false,stale:true,exportType};
            if(result?.ok!==true&&result?.notFound===true){
                result=await host.read({...request,chooseFile:true});
                if(!current())return {ok:false,stale:true,exportType};
            }
        }catch{
            if(!current())return {ok:false,stale:true,exportType};
            return {ok:false,exportType,error:`The ${exportType} export could not be read. Try again.`};
        }
        if(result?.ok!==true){
            if(result?.cancelled===true)return {ok:false,exportType,cancelled:true};
            return {ok:false,exportType,error:typeof result?.error==='string'&&result.error?result.error.slice(0,1200):`The ${exportType} export could not be read. Choose its text file and try again.`};
        }
        if(typeof result.text!=='string'||!result.text||!result.file||typeof result.file!=='object')return {ok:false,exportType,error:`The ${exportType} export returned an invalid file reading. Try again.`};
        results[exportType]=result;
    }
    return {ok:true,...results};
}

export default readCharacterExports;
