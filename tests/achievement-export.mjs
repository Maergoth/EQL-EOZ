import assert from 'node:assert/strict';
import {parseAchievementExport,normalizeAchievementExport,ACHIEVEMENT_LIMITS} from '../app/achievement-export.js';

// Entirely synthetic. Character identity and a player's real export stay private.
const source=['Synthetic: Unlocks','C\tAn alternate route','C\t\tFinish either route.','I\t\tOptional token route.','I\tShared title','I\t\tCollect tokens.\t3/10','Synthetic: Journeys','C\tShared title','C\t\tVisit the tower.','I\tAn ongoing journey','I\t\tTravel farther.\t12/10'].join('\r\n')+'\r\n';
const parsed=parseAchievementExport(source);
assert.equal(parsed.kind,'eql-achievement-export');assert.equal(parsed.schemaVersion,1);
assert.deepEqual([parsed.categoryCount,parsed.achievementCount,parsed.completedCount,parsed.objectiveCount,parsed.completedObjectiveCount,parsed.rowCount],[2,4,2,5,2,11]);
assert.equal(parsed.categories[0].achievements[0].completed,true,'A completed achievement may retain incomplete alternate objectives');
assert.equal(parsed.categories[0].achievements[0].objectives[1].completed,false);
assert.deepEqual(parsed.categories[0].achievements[1].objectives[0],{text:'Collect tokens.',completed:false,current:3,required:10});
assert.equal(parsed.categories[1].achievements[1].objectives[0].current,12,'Progress above its goal remains an observation, not a completion inference');
assert.deepEqual(parseAchievementExport('\uFEFF'+source),parsed);assert.deepEqual(parseAchievementExport(source.replace(/\r\n/g,'\n')),parsed);
assert.deepEqual(normalizeAchievementExport({...parsed,achievementCount:999,completedCount:999}),parsed,'Durable counters are recomputed');
const cloned=normalizeAchievementExport(parsed);assert.notEqual(cloned,parsed);cloned.categories[0].achievements[0].objectives[0].text='Changed';assert.equal(parsed.categories[0].achievements[0].objectives[0].text,'Finish either route.');
const noObjectives=parseAchievementExport('Synthetic\nC\tAutomatic completion');assert.deepEqual(noObjectives.categories[0].achievements[0].objectives,[],'There is no sentinel or objective-count declaration to infer missing objectives');
for(const text of [
    null,{},'','   ','C\tOrphan','Synthetic\nI\t\tOrphan objective','Synthetic\nAnother category',
    'Synthetic\nX\tInvalid status','Synthetic\nI\t','Synthetic\nI\tName\nI\t\t',
    'Synthetic\nI\tName\nI\t\tObjective\t3/x','Synthetic\nI\tName\nI\t\tObjective\t3/0',
    'Synthetic\nI\tName\nI\t\tObjective\t-1/10','Synthetic\nI\tName\nI\t\tObjective\t1.5/10',
    'Synthetic\nI\tName\nI\t\tObjective\t1000000001/10','Synthetic\nI\tName\nI\t\tObjective\t1/10\textra',
    'Synthetic\nI\tName\nC\tName','Synthetic\nI\tName\nSynthetic\nI\tOther',
    'Synthetic\nI\tName\nI\tWrong indentation\tObjective','Synthetic\nI\tName\nI\t\tBad\0text',
    'Synthetic\nI\t'+ 'x'.repeat(ACHIEVEMENT_LIMITS.name+1),'x'.repeat(ACHIEVEMENT_LIMITS.characters+1),
    'Synthetic\nI\tName\nI\t\t'+'x'.repeat(ACHIEVEMENT_LIMITS.line+1)
])assert.throws(()=>parseAchievementExport(text),/Achievement export/);
assert.throws(()=>parseAchievementExport(Array.from({length:ACHIEVEMENT_LIMITS.categories+1},(_,i)=>`Category ${i}\nI\tEntry`).join('\n')),/too many categories/);
assert.throws(()=>parseAchievementExport('Category\n'+Array.from({length:ACHIEVEMENT_LIMITS.achievements+1},(_,i)=>`I\tEntry ${i}`).join('\n')),/too many achievements/);
assert.throws(()=>parseAchievementExport('Category\nI\tEntry\n'+Array.from({length:ACHIEVEMENT_LIMITS.objectives+1},()=>`I\t\tObjective`).join('\n')),/too many objectives/);
assert.throws(()=>parseAchievementExport('Category\n'+'\n'.repeat(ACHIEVEMENT_LIMITS.rows)+'I\tEntry'),/too many rows/);
for(const mutate of [
    value=>{value.kind='other';},value=>{value.schemaVersion=2;},value=>{value.categories=[];},
    value=>{value.categories[0].achievements[0].completed='C';},
    value=>{value.categories[0].achievements[0].objectives[0].completed=1;},
    value=>{value.categories[0].achievements[0].objectives[0].text='bad\ttext';},
    value=>{value.categories[0].achievements[0].objectives[0].current=3;},
    value=>{value.categories[0].achievements[1].objectives[0].required=NaN;}
]){const invalid=structuredClone(parsed);mutate(invalid);assert.equal(normalizeAchievementExport(invalid),null);}
console.log('Achievement exports: hierarchy, independent completion, optional progress, cross-category names, cloned/recomputed durable records and bounded malformed-input rejection passed.');
