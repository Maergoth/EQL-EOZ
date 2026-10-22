import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {normalizeAppearance,normalizeLocalFontFamily,appearanceFont,applyAppearance,inheritViewerAppearance} from '../app/appearance.js';
import {installedFontFamilies} from '../app/system-font-settings.js';
const require=createRequire(import.meta.url),desktop=require('../desktop/appearance.cjs'),{installLocalFontPermissions}=require('../desktop/font-permissions.cjs');
for(const name of ['Arial','  Noto   Sans CJK JP  ','游ゴシック','Familie Écriture',`A "quoted" \\ family`,'x; color: red; } <style>','e\u0301criture']){
    const value={fontFamily:'local',localFontFamily:name,fontSize:17};assert.deepEqual(normalizeAppearance(value),desktop.normalizeAppearance(value));
    assert.equal(normalizeAppearance(value).fontFamily,'local');
    assert.equal(normalizeLocalFontFamily(name),desktop.normalizeLocalFontFamily(name));
}
for(const name of ['',null,{},'x'.repeat(121),'font\nname','font\u2028name','font\u0000name','font\ud800name']){
    assert.equal(normalizeLocalFontFamily(name),'');assert.equal(normalizeAppearance({fontFamily:'local',localFontFamily:name}).fontFamily,'theme');
}
assert.deepEqual(installedFontFamilies([{family:'Arial'},{family:'Arial'},{family:'arial'},{family:'游ゴシック'},{family:'bad\nname'},{}]),['Arial','游ゴシック']);
const values=new Map(),document={documentElement:{dataset:{},style:{setProperty:(key,value)=>values.set(key,value)}},getElementById:()=>({})};
applyAppearance(document,{fontFamily:'local',localFontFamily:`Name "quoted" \\ font`,fontSize:20});
assert.match(values.get('--ui-font-family'),/^"Name \\"quoted\\" \\\\ font", system-ui/);
const viewerValues=new Map(),viewer={...document,documentElement:{dataset:{},style:{setProperty:(key,value)=>viewerValues.set(key,value)}}};
inheritViewerAppearance(document,viewer);assert.equal(viewer.documentElement.dataset.localFontFamily,document.documentElement.dataset.localFontFamily);
assert.equal(viewerValues.get('--ui-font-family'),values.get('--ui-font-family'));
let request,check;const origin='http://127.0.0.1:53147',contents={mainFrame:{url:`${origin}/`}},main={webContents:contents,isDestroyed:()=>false};
installLocalFontPermissions({session:{setPermissionRequestHandler:value=>request=value,setPermissionCheckHandler:value=>check=value},origin,getMainWindow:()=>main});
const details={isMainFrame:true,requestingUrl:`${origin}/`};let allowed;
request(contents,'local-fonts',value=>allowed=value,details);assert.equal(allowed,true);assert.equal(check(contents,'local-fonts',`${origin}/`,details),true);
for(const [sender,permission,frame] of [[{},'local-fonts',details],[contents,'media',details],[contents,'local-fonts',{...details,isMainFrame:false}],[contents,'local-fonts',{...details,requestingUrl:`${origin}/zoneviewer/viewer.html`}],[contents,'local-fonts',{...details,requestingUrl:'https://eqlwiki.com/'}]]){
    request(sender,permission,value=>allowed=value,frame);assert.equal(allowed,false);assert.equal(check(sender,permission,origin,frame),false);
}
for(const permission of ['pointerLock','fullscreen']){
    const viewerFrame={isMainFrame:false,requestingUrl:`${origin}/zoneviewer/viewer.html`};
    request(contents,permission,value=>allowed=value,viewerFrame);assert.equal(allowed,true,'The trusted viewer retains its existing map navigation capabilities.');
    assert.equal(check(contents,permission,origin,viewerFrame),true);
    for(const frame of [details,{...viewerFrame,requestingUrl:'https://eqlwiki.com/'},{...viewerFrame,requestingUrl:`${origin}/overlay.html?panel=intel`}]){
        request(contents,permission,value=>allowed=value,frame);assert.equal(allowed,false);
    }
}
console.log('Installed fonts: Unicode normalization, safe CSS strings, shared native/viewer persistence, deduplicated family list and exact-main permissions passed.');
