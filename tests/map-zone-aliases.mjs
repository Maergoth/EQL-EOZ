import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolveZoneRecord,viewerZoneTarget,viewerArchiveIds} from '../app/zone-identity.js';
import {selectViewerZoneOption} from '../app/viewer-zone-selection.js';
import {selectMapFamily} from '../app/map-overlay-data.js';
import {installZoneLoadGuard} from '../app/zone-load-guard.js';
import {EQLogParser} from '../app/parser.js';
const catalog=JSON.parse(readFileSync(new URL('../server/zone-catalog.json',import.meta.url),'utf8')),source=readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js',import.meta.url),'utf8');
// Evaluate only the pinned bundle's literal name registry, without importing
// the renderer, requesting game files or constructing a GPU context.
const marker='=Object.freeze({akanon:',at=source.indexOf(marker),start=at+'=Object.freeze('.length;assert(at>=0,'The actual bundled viewer zone registry must be locatable');
let end=start,depth=0,quote='',escape=false;
for(;end<source.length;end++){const ch=source[end];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}'&&!--depth){end++;break;}}
const registry=vm.runInNewContext('('+source.slice(start,end)+')',{}, {timeout:1000}),options=Object.entries(registry).map(([id,name])=>({value:'S3D:'+id,textContent:name+' — '+id+' (S3D)'})),identity=value=>String(value||'').trim().toLowerCase(),owners=new Map();
const aliasLiteral=source.match(/ex=Object\.freeze\((\{[^{}]+\})\)/);assert(aliasLiteral,'The actual bundled client-file aliases must be locatable');const clientAliases=vm.runInNewContext('('+aliasLiteral[1]+')',{}, {timeout:1000});
for(const[id,alias]of Object.entries(clientAliases)){assert(viewerArchiveIds(id).includes(alias));assert(viewerArchiveIds(alias).includes(id));}
const alternateIds=[...new Set(Object.keys(registry).map(id=>clientAliases[id]||id))],archiveOption=id=>({value:'S3D:'+id,textContent:(registry[id]||id[0].toUpperCase()+id.slice(1))+' — '+id+' (S3D)'}),alternateOptions=alternateIds.map(archiveOption),allArchiveOptions=[...new Set([...Object.keys(registry),...Object.values(clientAliases)])].map(archiveOption);
const wrapper=readFileSync(new URL('../app/zoneviewer/viewer.html',import.meta.url),'utf8'),from=wrapper.indexOf('    async loadZone(zoneName) {'),to=wrapper.indexOf('    syncLocation(',from);assert(from>=0&&to>from);
const select={value:'S3D:freporte',disabled:false,options,dispatchEvent(){}},app={source:{},currentZoneRecord:{id:'freporte',format:'S3D'},els:{zoneSelect:select,statusText:{textContent:'Synthetic previous zone'}},selectedZoneRecord(){const[format,id]=select.value.split(':');return{format,id};},clearNavigationGuide(){},resetLoadedZone(){},setStatus(){},async loadSelectedZone(){this.currentZoneRecord=this.selectedZoneRecord();}};
const context=vm.createContext({app,selectViewerZoneOption,overlayMode:false,Event:class{},clearRareMobs(){},collisionGeometryPromise:Promise.resolve(),loadedZoneIdentity:'',startCollisionGeometryExport(){},root:{},waitForZoneSelect:async()=>select,zoneLoadGuard:installZoneLoadGuard(app)}),api=vm.runInContext('({'+wrapper.slice(from,to)+'})',context);
let aliases=0,shortNames=0;
for(const zone of catalog){
 const ids=zone.aliases.filter(id=>Object.hasOwn(registry,id));assert(ids.length,'Every supported catalog zone has a real bundled viewer archive identity: '+zone.name);
 if(ids.length>1)assert(ids.includes(zone.viewerId),'Ambiguous display labels require an explicit reviewed primary ID: '+zone.name);
 const primary=zone.viewerId||ids[0];
 for(const alias of new Set([zone.name,zone.viewerName,zone.wikiTitle,...zone.aliases].filter(Boolean))){
  const key=identity(alias),prior=owners.get(key);assert(!prior||prior===zone.name,'No supported alias may select two distinct zones: '+alias);owners.set(key,zone.name);
  assert.equal(resolveZoneRecord(catalog,alias)?.name,zone.name);assert.equal(resolveZoneRecord(catalog,alias.toUpperCase())?.name,zone.name);
  const expected=ids.includes(identity(alias))?identity(alias):primary,target=viewerZoneTarget(catalog,alias);
  assert.equal(selectViewerZoneOption(options,target)?.value,'S3D:'+expected,alias+' must resolve through its catalog into the actual archive');
  assert.equal((await api.loadZone(target)).ok,true);assert.equal(app.currentZoneRecord.id,expected,'Actual cross-zone load wrapper must accept the new archive, not retain prior readiness');aliases++;
 }
 for(const id of ids){
  assert.equal(viewerZoneTarget(catalog,zone.name,id.toUpperCase()),id,'An exact supported /who short name takes precedence over the display preference');
  const parser=new EQLogParser();parser.setCharacterFromFilename('C:/Synthetic/eqlog_Syntheticplayer_server.txt');const event=parser.parse('[Sun Oct 25 02:00:00 2026] [55 WAR] Syntheticplayer (Human) ZONE: '+zone.viewerName+' 123 ('+id+')');
  assert.equal(event?.zoneShortName,id);const target=viewerZoneTarget(catalog,event.zone,event.zoneShortName);assert.equal(target,id);assert.equal((await api.loadZone(target)).ok,true);assert.equal(app.currentZoneRecord.id,id);
  const family=selectMapFamily(ids.map(other=>({path:(other===id?'Maps/Verified/':'Maps/')+other+'.txt',size:12})),zone,id);assert.equal(family?.layers[0].path,'Maps/Verified/'+id+'.txt','2D maps retain the same exact archive identity before folder preference');shortNames++;
 }
 assert.equal(viewerZoneTarget(catalog,zone.name,'unknown_zone_id'),'','A stale or unknown short name cannot silently choose another historical map');
}
assert.equal(viewerZoneTarget(catalog,'West Freeport','freporte'),'','Another known zone ID cannot override West Freeport');
assert.equal(viewerZoneTarget(catalog,'West Freeport','freportw'),'freportw');assert.equal((await api.loadZone('unknown_zone_id')).ok,false,'An unavailable archive never returns inherited success');
for(const inventory of [alternateOptions,allArchiveOptions]){
 select.options=inventory;
 for(const zone of catalog)for(const alias of new Set([zone.name,zone.viewerName,zone.wikiTitle,...zone.aliases].filter(Boolean))){const target=viewerZoneTarget(catalog,alias),expected=selectViewerZoneOption(inventory,target);assert(expected,'A documented client filename alias remains selectable even when both names are installed: '+alias);assert.equal((await api.loadZone(target)).ok,true);assert.equal(app.currentZoneRecord.id,expected.value.split(':')[1]);}
}
for(const[zoneName,loggedId,fileId]of [['Kerra Island','kerraridge','kerraridge'],['Ocean of Tears','oceanoftears','oceanoftears'],['New Sebilis Expedition','newsebexp','newsebexp']]){
 const zone=resolveZoneRecord(catalog,zoneName),target=viewerZoneTarget(catalog,zoneName,loggedId);assert.equal(target,loggedId);assert.equal(selectViewerZoneOption(alternateOptions,target)?.value,'S3D:'+fileId);
 assert.equal(selectMapFamily([{path:'Maps/'+fileId+'.txt',size:12}],zone,loggedId)?.layers[0].path,'Maps/'+fileId+'.txt');
}
console.log('Map aliases: '+catalog.length+' canonical zones, '+aliases+' aliases and '+shortNames+' exact logged IDs verified against the bundled '+Object.keys(registry).length+'-zone registry and actual cross-zone load wrapper; 2D identity, ambiguity preferences and unknown rejection passed.');
