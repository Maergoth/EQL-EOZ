'use strict';
function installLocalFontPermissions({session,origin,getMainWindow}){
    function trusted(contents,details){
        const main=getMainWindow();
        return Boolean(main&&!main.isDestroyed()&&contents===main.webContents&&
            main.webContents.mainFrame?.url===`${origin}/`&&details?.isMainFrame===true&&details.requestingUrl===`${origin}/`);
    }
    function allowed(contents,permission,details){
        if(permission==='local-fonts')return trusted(contents,details);
        // Preserve the embedded map's existing first-person/fullscreen controls.
        // This child frame never receives local-font enumeration permission.
        const main=getMainWindow();
        return ['pointerLock','fullscreen'].includes(permission)&&Boolean(main&&!main.isDestroyed()&&contents===main.webContents&&
            main.webContents.mainFrame?.url===`${origin}/`&&details?.isMainFrame===false&&details.requestingUrl===`${origin}/zoneviewer/viewer.html`);
    }
    session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(
        allowed(contents,permission,details)));
    session.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>{
        let matches=false;try{matches=new URL(requestingOrigin).origin===origin;}catch{}
        return matches&&allowed(contents,permission,details);
    });
    return {trusted};
}
module.exports={installLocalFontPermissions};
