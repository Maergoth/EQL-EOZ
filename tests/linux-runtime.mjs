import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {configureLinuxRuntime}=createRequire(import.meta.url)('../desktop/linux-runtime.cjs');
function configure(platform,env={},existing={}) {
    const switches=new Map(Object.entries(existing)),changes=[],desktopNames=[];
    configureLinuxRuntime({setDesktopName:name=>desktopNames.push(name),commandLine:{
        hasSwitch:name=>switches.has(name),appendSwitch:(name,value)=>{changes.push([name,value]);switches.set(name,value);}
    }},{platform,env});
    return {switches,changes,desktopNames};
}
for(const platform of ['win32','darwin']) {
    const result=configure(platform,{DISPLAY:':99'});assert.deepEqual(result.changes,[]);assert.deepEqual(result.desktopNames,[]);
}
const x11=configure('linux',{DISPLAY:':99'});
assert.deepEqual(x11.changes,[['ozone-platform','x11']]);
assert.deepEqual(x11.desktopNames,['com.eqlwiki.eyeofzomm.desktop']);
const xwayland=configure('linux',{DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0',XDG_SESSION_TYPE:'wayland'});
assert.equal(xwayland.switches.get('ozone-platform'),'x11','Desktop placement prefers XWayland when its display exists');
for(const existing of [{'ozone-platform':'wayland'},{'ozone-platform':'x11'},{'ozone-platform-hint':'auto'}]) {
    const result=configure('linux',{DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0'},existing);
    assert.deepEqual(result.changes,[],'Explicit backend choices remain intact');
    assert.deepEqual(Object.fromEntries(result.switches),existing);
}
assert.deepEqual(configure('linux',{WAYLAND_DISPLAY:'wayland-0'}).changes,[],'Pure Wayland never invents an X11 display');
assert(!x11.switches.has('no-sandbox'));assert(!x11.switches.has('disable-setuid-sandbox'));
console.log('Linux runtime: desktop identity, X11/XWayland overlay placement preference, explicit Wayland override and sandbox preservation passed.');
