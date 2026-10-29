// Entirely fictional word geometry for pure admission/mapping tests. No OCR
// output, player pixels, names or values from a private capture are retained.
export const adaptiveWord=(text,x,y,width=45,height=12,confidence=97)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+width,y1:y+height}});
export function modernAdaptiveWords(){
    const w=adaptiveWord,left=100,right=281,top=60,pitch=16;
    const attributes=[['Strength','str',145],['Stamina','sta',187],['Intelligence','int',193],['Wisdom','wis',211],['Agility','agi',229],['Dexterity','dex',241],['Charisma','cha',257]],resists=[['Magic','resistMagic',41],['Fire','resistFire',53],['Cold','resistCold',67],['Disease','resistDisease',79],['Poison','resistPoison',83],['Void','resistCorruption',97]];
    const headings=[w('Inventory',230,20,80),w('Character',left,top,58),w('Vitals',left+65,top,36),w('Stats',right,top,35),w('and',right+40,top,20),w('Resists',right+65,top,45)];
    const rows=[...attributes.map(([name,key,value],index)=>({name,key,value,y:top+(index+1)*pitch,words:[w(name,right,top+(index+1)*pitch,65),w(value+'/389',right+84,top+(index+1)*pitch,56)]})),...resists.map(([name,key,value],index)=>({name:'SV.'+name,key,value,y:top+(index+8)*pitch,words:[w('SV.'+name,right,top+(index+8)*pitch,75),w(value+'/197',right+111,top+(index+8)*pitch,57)]}))];
    const leftRows=[['HP','471823',1],['Mana','163/947',2],['End','271/689',3],['AC','117/89 |307',4],['Attack','3181647',5],['Attack Speed','137',6],['Velocity','0',7],['HP Regen','19',8],['Mana Regen','23',9],['End Regen','29',10],['Primary DPS',null,11],['Secondary DPS',null,12],['Ranged DPS',null,13]];
    const body=leftRows.flatMap(([name,value,ordinal])=>[w(name,left,top+ordinal*pitch,name.length*5),...(value===null?[]:[w(value,left+(ordinal===4?67:ordinal===5?92:68),top+ordinal*pitch,ordinal===4?100:90)])]);
    const modifiers=[w('Additional',left,top+234,60),w('Modifiers',left+65,top+234,65),w('Damage',right,top+266,42),w('Shield',right+47,top+266,35),w('Mitigal',right+87,top+266,45),w('0/61',right+140,top+266,35)];
    const all=[...headings,...body,...rows.flatMap(row=>row.words),...modifiers],scene={text:'Synthetic native Modern resource-context scene',confidence:97,words:all.filter(word=>word.text!=='Attack'&&word.text!=='Stamina'&&word.text!=='Wisdom')};
    const context=all.filter(word=>word.text!=='Inventory').flatMap(word=>word.text==='3181647'?[w('318',left+92,140,23),w('|647',left+120,140,36)]:word.text==='117/89 |307'?[w('117/89',left+67,124,48),w('|307',left+123,124,32)]:[word]);
    return {scene,context,rows,left,right,top,pitch,resources:{hpCurrent:47,hpMaximum:823,manaCurrent:163,manaMaximum:947,enduranceCurrent:271,enduranceMaximum:689}};
}
