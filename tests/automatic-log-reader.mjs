import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {AutomaticLogReader}=createRequire(import.meta.url)('../desktop/automatic-log-reader.cjs');
let now=Date.UTC(2026,9,25,12),offset=0;const records=[],resets=[];
const stamp=()=>`[${new Date(now).toISOString()}] `;
const reader=new AutomaticLogReader({now:()=>now,onObservation:value=>records.push(value),onReset:()=>resets.push(true),getPack:()=>({zones:[{name:'Synthetic Vale'}]})});
async function feed(text,{reset=false,start=offset,logPath='C:/Private/eqlog_Example_server.txt'}={}){
    const next=start+Buffer.byteLength(text);await reader.ingest({logExists:true,logPath,text,startOffset:start,newOffset:next,reset});offset=next;
}
await feed(stamp()+'You have entered Synthetic Vale.\n'+stamp()+'You have looted a Synthetic Blade from the corpse of a synthetic rat!\n',{reset:true});
assert.equal(records.length,0,'Initial tail only seeds context and never edits historical loot');
const start=offset,text=stamp()+'You have looted a Synthetic Blade from the corpse of a synthetic rat!\n';await feed(text);
assert.equal(records.length,1);assert.equal(records[0].input.zone,'Synthetic Vale');assert.equal(records[0].parser.name,'native-eq-log');assert.equal(records[0].relations.find(value=>value.type==='drop-source').evidence,'explicit-corpse');assert(records[0].evidence.logLine.includes('You have looted'));assert(!JSON.stringify(records).includes('C:/Private'),'Only hashed source identity reaches the engine');
await reader.ingest({logExists:true,logPath:'C:/Private/eqlog_Example_server.txt',text,startOffset:start,newOffset:offset,reset:false});assert.equal(records.length,1,'Repeated HTTP windows cannot replay source edits');
await feed(stamp()+'You have looted a Second Blade from the corpse of a second rat!');assert.equal(records.length,1);await feed('\n');assert.equal(records.length,2,'Split log lines are combined before parsing');
await feed(stamp()+"Someone tells General:1, 'Synthetic Blade +5'\n");assert.equal(records.length,2,'Ordinary item chat never authorizes a drop source');
const stale=now;now+=20000;await feed(`[${new Date(stale).toISOString()}] You have looted a Stale Blade from the corpse of a stale rat!\n`);assert.equal(records.length,2,'Stale replay is rejected even through a forward byte window');
await feed(stamp()+'You have looted a Gap Blade from the corpse of a gap rat!\n',{start:offset+100});assert.equal(records.length,2,'A discontinuity reseeds without fabricating an inherited zone');
await feed(stamp()+'You have entered Synthetic Vale.\n'+stamp()+'You have looted a Fresh Blade from the corpse of a fresh rat!\n');assert.equal(records.at(-1).subject.name,'Fresh Blade');
await feed(stamp()+'You have entered Synthetic Vale.\n',{reset:true,start:0,logPath:'C:/Other/eqlog_Other_server.txt'});assert.equal(resets.length,3,'Source changes reset inference context');
await reader.ingest({logExists:false});assert.equal(resets.length,4,'A missing/disabled source cancels pending source updates immediately');assert.equal(reader.parser,null);
let releasePack;const racingRecords=[],racing=new AutomaticLogReader({now:()=>now,getPack:()=>new Promise(done=>{releasePack=done;}),onObservation:record=>racingRecords.push(record)});
const pending=racing.ingest({logExists:true,logPath:'C:/Private/eqlog_Example_server.txt',startOffset:0,newOffset:100,reset:true,text:stamp()+'You have entered Synthetic Vale.\n'});while(!releasePack)await new Promise(done=>setTimeout(done,0));racing.reset();releasePack({});await pending;assert.equal(racing.parser,null);assert.equal(racingRecords.length,0,'A source reset while catalog lookup waits cannot restore the retired parser');racing.dispose();
reader.dispose();const count=records.length;await feed(stamp()+'You have looted a Closed Blade from the corpse of a closed rat!\n');assert.equal(records.length,count);
console.log('Native log witness: actual-byte continuity, initial/stale replay exclusion, private source hashing, partial lines, source resets and disposal passed.');
