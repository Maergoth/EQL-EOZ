// Entirely synthetic geometry/text. No game pixels, artwork, character data or
// UI files are loaded. Recreate with scripts/create-modern-ocr-fixture.mjs.
export function drawModernOcrFixture(document){
    const canvas=document.createElement('canvas');canvas.width=2560;canvas.height=1100;
    const ctx=canvas.getContext('2d');ctx.textBaseline='top';ctx.fillStyle='#080e18';ctx.fillRect(0,0,canvas.width,canvas.height);
    const text=(value,x,y,size=26,color='#f0f2f5')=>{ctx.font=`${size}px Arial,sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
    const panel=(x,y,width,height)=>{ctx.fillStyle='#111c2a';ctx.fillRect(x,y,width,height);ctx.strokeStyle='#8a96a5';ctx.strokeRect(x+.5,y+.5,width-1,height-1);};
    function examine(x,name,slot,tier,progress,rows){
        panel(x,24,600,720);text(name,x+24,45,27,'#c5ed9d');
        ctx.font='26px Arial,sans-serif';text('Description',x+300-ctx.measureText('Description').width/2,105);text('Lore',x+510,105);
        text(name,x+24,155,27,'#c5ed9d');text('No Trade',x+24,199);
        text('Class:',x+24,241);text('WAR / PAL',x+150,241);
        text('Race:',x+24,283);text('ALL',x+150,283);
        text(slot,x+24,325);text(`Tier ${tier} ${progress}/${2**tier}`,x+24,367);
        for(const [label,value,y,other,otherValue]of rows){text(label,x+24,y);text(value,x+210,y);if(other){text(other,x+355,y);text(otherValue,x+500,y);}}
        ctx.strokeStyle='#bec7d2';ctx.strokeRect(x+24,700,20,20);text('Modified',x+57,696);
    }
    examine(20,'Synthetic Ember Boots +3','Feet',3,5,[['Size','MEDIUM',415,'AC','31'],['HP','147',457,'Weight','1.7'],['Strength','27',499],['Haste','23%',541],['SV. Fire','19',583],['Required Level','22',625]]);
    examine(700,'Synthetic Quartz Blade +6','Primary',6,18,[['Size','MEDIUM',415,'AC','29'],['HP','83',457,'Weight','2.3'],['Base Dmg','13',499],['Dmg Bon','17',541],['Delay','31',583],['Attack Speed','18%',625]]);
    panel(1600,24,920,820);text('Inventory',1624,45,30);text('Character Vitals',1624,150,30);text('Stats',2050,150,30);text('and Resists',2140,150,30);
    for(const [index,label,value]of [[0,'HP','337/901'],[1,'Mana','225/703'],[2,'Endurance','119/509'],[3,'AC','61/43 | 127'],[4,'Attack','46 | 107'],[5,'HP Regen','11']]){text(label,1624,210+index*44);text(value,1840,210+index*44);}
    for(const [index,label]of ['STR','STA','AGI','DEX','WIS','INT','CHA'].entries()){text(label,2050,210+index*32);text(`${111+index}/${211+index}`,2250,210+index*32);}
    text('Resists',2050,449);
    for(const [index,label]of ['SV. Poison','SV. Magic','SV. Disease','SV. Fire','SV. Cold','SV. Void'].entries()){text(label,2050,490+index*32);text(`${31+index}/${131+index}`,2250,490+index*32);}
    return canvas;
}
