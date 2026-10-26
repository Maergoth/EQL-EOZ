// Synthetic Default-style stat/examine geometry, standard Arial text and simple
// colored rectangles only. No game UI XML, pixels, artwork or player data.
// The self-contained renderer is used at native 96-DPI size and a scaled size.
export function drawDefaultOcrFixture(document,{scale=1,items=true,character=true}={}){
    const canvas=document.createElement('canvas');canvas.width=Math.round(2120*scale);canvas.height=Math.round(1000*scale);
    const c=canvas.getContext('2d');c.scale(scale,scale);c.textBaseline='top';c.fillStyle='#25313a';c.fillRect(0,0,2120,1000);
    const text=(value,x,y,color='#e0e0e0',size=17)=>{c.font=`${size}px Arial,sans-serif`;c.fillStyle=color;c.fillText(value,x,y);};
    const panel=(x,y,w,h)=>{c.fillStyle='#191919';c.fillRect(x,y,w,h);c.strokeStyle='#929292';c.lineWidth=1;c.strokeRect(x+.5,y+.5,w-1,h-1);};
    if(character){
        panel(12,16,738,894);
        for(const [index,label]of ['Inventory','Pet','Stats','Loadouts','Storage'].entries()){
            c.strokeStyle='#777';c.strokeRect(22+index*141,22,135,26);text(label,36+index*141,26,label==='Stats'?'#dfdc24':'#ddd',18);
        }
        panel(33,64,696,817);
        const row=(label,value,y,{green=false,cap='',heroic=''}={})=>{
            text(label,59,y);const valueX=cap?293-c.measureText(value).width:green?260:176;text(value,valueX,y,green?'#32e522':'#ddd');
            if(cap)text(cap,295,y);if(heroic)text(heroic,351,y,'#d4b729');
        };
        row('HP','337/901',92);row('Mana','225/703',116);row('Endurance','119/509',140);
        row('AC','407/374 /500',164);row('Attack','379/691',188);row('Attack Speed','150%',212,{green:true});row('Velocity','0',236,{green:true});
        text('Regen',59,273,'#8195dc');
        for(const [index,label,value]of [[0,'Combat HP Regen','11'],[1,'Combat Mana Regen','13'],[2,'Combat End Regen','17']])row(label,value,299+index*24,{green:true});
        text('Stats',59,390,'#8195dc');
        for(const [index,label]of ['Strength','Stamina','Intelligence','Wisdom','Agility','Dexterity','Charisma'].entries())row(label,String(111+index),417+index*24,{green:true,cap:'/510',heroic:'+0'});
        text('Resists',59,607,'#8195dc');
        for(const [index,label]of ['Magic','Fire','Cold','Disease','Poison','Void'].entries())row(label,String(31+index),634+index*24,{green:true,cap:'/1000'});
        text('Heroic Mods',383,92,'#8195dc');
        for(const [index,label,value]of [[0,'Accuracy','4/150'],[1,'Avoidance','6/100'],[2,'Combat Effects','8/100'],[3,'Damage Shielding','2/35'],[4,'Damage Shield Mitiga','5/25'],[5,'DoT Shielding','3/35'],[6,'Melee Shielding','4/35'],[7,'Spell Shielding','6/35'],[8,'Strike Through','7/35'],[9,'Stun Resist','9/35']]){text(label,383,118+index*24);text(value,650,118+index*24);}
        text('Spell Mods',383,383,'#8195dc');
        for(const [index,label,value]of [[0,'Heal Amount','21'],[1,'Spell Damage','22'],[2,'Clairvoyance','23'],[3,'Luck','24']]){text(label,383,409+index*24);text(value,677,409+index*24);}
        text('Skill Damage Mod',383,525,'#8195dc');
        for(const [index,label,value]of [[0,'Bash','25/100'],[1,'Backstab','26/125'],[2,'Dragon Punch','27/100'],[3,'Eagle Strike','28/100'],[4,'Flying Kick','29/100'],[5,'Frenzy','30/125'],[6,'Kick','32/100'],[7,'Round Kick','33/100'],[8,'Tiger Claw','34/100']]){text(label,383,552+index*24);text(value,650,552+index*24);}
    }
    function examine(x,name,slot,tier,progress,weapon){
        panel(x,16,625,890);text(name,x+150,25,'#ddd',18);text('Description',x+215,58,'#dfdc24',18);text('Lore',x+532,58);
        text(name,x+95,99,'#24de22',18);text('Lore Equipped, No Trade',x+95,125);text(weapon?'Class: ROG':'Class: WAR CLR PAL SHD ROG NEC WIZ MAG ENC',x+95,149);text('Race: ALL',x+95,173);text(slot,x+95,197);
        text('Merge',x+20,231);text('Place',x+98,231);text('Item',x+29,251);text('Item',x+104,251);text(`Tier ${tier}   ${progress}/${2**tier}`,x+177,231);text('This item can be upgraded.',x+177,266);
        text('Size:',x+24,313);text(weapon?'SMALL':'TINY',x+109,313);text('Weight',x+24,337);text('0.8',x+109,337);
        text(weapon?'HP:':'AC:',x+216,313);text(weapon?'83':'28',x+334,313);
        if(weapon){
            for(const [index,label,value]of [[0,'Base Dmg:','19'],[1,'Backstab Dmg:','15'],[2,'Delay:','19'],[3,'Dmg Bon:','9']]){text(label,x+393,313+index*24);text(value,x+558,313+index*24);}
            text('Accuracy:',x+216,337);text('+15.1%',x+306,337);text('Skill: 1H Piercing',x+24,361);
        }else for(const [index,label,value]of [[0,'HP:','9'],[1,'Mana:','28'],[2,'End:','28']]){text(label,x+216,337+index*24);text(value,x+334,337+index*24);}
        for(const [index,label]of (weapon?['Strength','Agility','Dexterity']:['Strength','Stamina','Intelligence','Wisdom','Agility','Dexterity','Charisma']).entries()){text(label+':',x+24,445+index*24);text(weapon?'11':'9',x+157,445+index*24);}
        text('SV. Void:',x+216,445);text(String(tier),x+334,445);
        c.strokeStyle='#aaa';c.strokeRect(x+24,647,16,16);text('Modified',x+52,645);
        for(const [index,label]of ['Ornamentation: empty','Focus Exaltation: empty','Click Exaltation: empty','Worn Exaltation: empty','Proc Exaltation: empty'].entries())text(label,x+50,692+index*26);
        text('Done',x+290,866);
    }
    if(items){examine(782,'Synthetic Basalt Needle +6','Primary Secondary',6,2,true);examine(1434,'Synthetic Cloud Band +4','Fingers',4,1,false);}
    text('Synthetic unrelated chat: HP 9999 STR 888 AC 777',40,954,'#eee',18);
    return canvas;
}
