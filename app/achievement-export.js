// Pure parser for /outputfile achievements. Character/profile ownership and
// file access are caller responsibilities; the export contains no identity.
export const ACHIEVEMENT_LIMITS=Object.freeze({characters:2*1024*1024,rows:20000,line:4096,categories:200,achievements:3000,objectives:15000,name:240,objectiveText:2048,progress:1000000000});
const KIND='eql-achievement-export',own=(value,key)=>Object.hasOwn(value,key);
const fail=(line,reason)=>{throw Error(`Achievement export${line?` at line ${line}`:''}: ${reason}`);};
const textValue=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value);
const progressValue=value=>Number.isSafeInteger(value)&&value>=0&&value<=ACHIEVEMENT_LIMITS.progress;

/** Validate and clone an export for durable Character storage. All counters
 * are recomputed; parent completion is independent of objective completion.
 * A category can contain the same achievement name as a different category.
 */
export function normalizeAchievementExport(value){
    if(!value||typeof value!=='object'||value.kind!==KIND||value.schemaVersion!==1||!Array.isArray(value.categories)||!value.categories.length||value.categories.length>ACHIEVEMENT_LIMITS.categories)return null;
    const categories=[],categoryNames=new Set();let achievementCount=0,completedCount=0,objectiveCount=0,completedObjectiveCount=0;
    for(const category of value.categories){
        if(!category||!textValue(category.name,ACHIEVEMENT_LIMITS.name)||categoryNames.has(category.name)||!Array.isArray(category.achievements)||!category.achievements.length)return null;
        categoryNames.add(category.name);const achievements=[],names=new Set();
        for(const achievement of category.achievements){
            if(!achievement||!textValue(achievement.name,ACHIEVEMENT_LIMITS.name)||names.has(achievement.name)||typeof achievement.completed!=='boolean'||!Array.isArray(achievement.objectives)||++achievementCount>ACHIEVEMENT_LIMITS.achievements)return null;
            names.add(achievement.name);if(achievement.completed)completedCount++;const objectives=[];
            for(const objective of achievement.objectives){
                if(!objective||!textValue(objective.text,ACHIEVEMENT_LIMITS.objectiveText)||typeof objective.completed!=='boolean'||++objectiveCount>ACHIEVEMENT_LIMITS.objectives)return null;
                const result={text:objective.text,completed:objective.completed};if(objective.completed)completedObjectiveCount++;
                if(own(objective,'current')||own(objective,'required')){
                    if(!progressValue(objective.current)||!progressValue(objective.required)||objective.required<1)return null;
                    result.current=objective.current;result.required=objective.required;
                }
                objectives.push(result);
            }
            achievements.push({name:achievement.name,completed:achievement.completed,objectives});
        }
        categories.push({name:category.name,achievements});
    }
    const rowCount=categories.length+achievementCount+objectiveCount;
    if(rowCount>ACHIEVEMENT_LIMITS.rows)return null;
    const result={kind:KIND,schemaVersion:1,categories,categoryCount:categories.length,achievementCount,completedCount,objectiveCount,completedObjectiveCount,rowCount};
    if(JSON.stringify(result).length>ACHIEVEMENT_LIMITS.characters)return null;
    return result;
}

/** The game writes category headings, C/I achievements and indented C/I
 * objectives, optionally followed by current/required progress. There is no
 * header, character identity or EOF sentinel; syntax cannot prove completeness.
 */
export function parseAchievementExport(text){
    if(typeof text!=='string'||!text.length||text.length>ACHIEVEMENT_LIMITS.characters)fail(0,'expected a bounded nonempty text export.');
    const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    while(lines.at(-1)==='')lines.pop();
    if(lines.length>ACHIEVEMENT_LIMITS.rows)fail(0,'too many rows.');
    const categories=[],categoryNames=new Set();let category=null,achievement=null,achievementNames=null,achievementCount=0,objectiveCount=0;
    for(let offset=0;offset<lines.length;offset++){
        const line=lines[offset],index=offset+1;
        if(line.length>ACHIEVEMENT_LIMITS.line||/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(line))fail(index,'invalid characters or oversized line.');
        if(!line.trim())continue;
        const fields=line.split('\t');
        if(fields.length===1){
            if(!textValue(line,ACHIEVEMENT_LIMITS.name)||/^[CI]$/.test(line))fail(index,'invalid category name.');
            if(category&&!category.achievements.length)fail(index,'a category has no achievements.');
            if(categoryNames.has(line))fail(index,'duplicate category name.');
            if(categories.length>=ACHIEVEMENT_LIMITS.categories)fail(index,'too many categories.');
            category={name:line,achievements:[]};categories.push(category);categoryNames.add(line);achievement=null;achievementNames=new Set();continue;
        }
        if(!/^[CI]$/.test(fields[0]))fail(index,'expected a C or I completion marker.');
        if(fields.length===2){
            if(!category)fail(index,'an achievement has no preceding category.');
            if(!textValue(fields[1],ACHIEVEMENT_LIMITS.name))fail(index,'invalid achievement name.');
            if(achievementNames.has(fields[1]))fail(index,'duplicate achievement in a category.');
            if(++achievementCount>ACHIEVEMENT_LIMITS.achievements)fail(index,'too many achievements.');
            achievement={name:fields[1],completed:fields[0]==='C',objectives:[]};category.achievements.push(achievement);achievementNames.add(fields[1]);continue;
        }
        if((fields.length!==3&&fields.length!==4)||fields[1]!=='')fail(index,'expected an indented objective with optional progress.');
        if(!achievement)fail(index,'an objective has no preceding achievement.');
        if(!textValue(fields[2],ACHIEVEMENT_LIMITS.objectiveText))fail(index,'invalid objective text.');
        if(++objectiveCount>ACHIEVEMENT_LIMITS.objectives)fail(index,'too many objectives.');
        const objective={text:fields[2],completed:fields[0]==='C'};
        if(fields.length===4){
            const progress=/^(\d+)\/(\d+)$/.exec(fields[3]);
            if(!progress||!progressValue(Number(progress[1]))||!progressValue(Number(progress[2]))||Number(progress[2])<1)fail(index,'invalid objective progress.');
            objective.current=Number(progress[1]);objective.required=Number(progress[2]);
        }
        achievement.objectives.push(objective);
    }
    const result=normalizeAchievementExport({kind:KIND,schemaVersion:1,categories});
    if(!result)fail(0,'expected categories containing achievements.');
    return result;
}

export default parseAchievementExport;
