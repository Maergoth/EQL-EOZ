import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{allowMapRequest,safeMapFile}=require('../desktop/overlay-map-policy.cjs');
const origin='http://127.0.0.1:53147';
const request=(path,method='GET',resourceType='xhr')=>allowMapRequest({url:origin+path,method,resourceType},origin);
assert(request('/overlay-map.html?panel=map','GET','mainFrame'));
assert(request('/zoneviewer/viewer.html?overlay=1','GET','subFrame'));
for(const path of ['/map-overlay-3d.js','/zoneviewer/overlay-mode.js','/zoneviewer/zone-parser.worker.js','/zoneviewer/ext.eqlZoneViewer.css'])assert(request(path));
assert(request('/api/eq-files'));
for(const path of ['mistmoore.s3d','resources/synthetic.eqg','Maps/mistmoore.txt','Maps/Brewall/mistmoore_1.txt'])assert(request('/api/eq-file?path='+encodeURIComponent(path)+'&surface=overlay-map'));
for(const path of ['Logs/eqlog_Fixture_Test.txt','Maps/../Logs/eqlog_Fixture_Test.txt','Maps/.. /Logs./eqlog_Fixture_Test.txt','Maps/../Logs./fixture.txt','Maps/a:stream.txt','Maps/a\x00.txt','Maps//a.txt','C:/Maps/a.txt','/Maps/a.txt','settings.txt','Maps/file.txt.','Maps/file.txt ']){
    assert.equal(safeMapFile(path),false,path);
    assert.equal(request('/api/eq-file?path='+encodeURIComponent(path)+'&surface=overlay-map'),false,path);
}
for(const path of ['/api/log','/api/info','/api/select-eq-root','/api/update-pack','/api/window/always-on-top','/data/eye-of-zomm-pack.json','/'])assert.equal(request(path),false,path);
assert.equal(request('/api/eq-files','POST'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt'),false,'A Map request cannot omit canonical path restrictions');
assert.equal(request('/api/eq-file?path=Maps/x.txt&surface=other'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt&other=1'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt&surface=overlay-map&other=1'),false);
assert.equal(request('/zoneviewer/viewer.html','GET','subFrame'),false);
assert.equal(request('/overlay.html?panel=parse','GET','mainFrame'),false);
assert.equal(allowMapRequest({url:'https://example.invalid/zoneviewer/file.js',method:'GET',resourceType:'script'},origin),false);
assert(allowMapRequest({url:'blob:'+origin+'/synthetic-texture',method:'GET',resourceType:'image'},origin));
assert.equal(allowMapRequest({url:'blob:https://example.invalid/image',resourceType:'image'},origin),false);
console.log('Native Map policy: exact document/frame, local static assets, readonly selected game files, Win32 path hardening, no logs/settings/mutations/external network passed.');
