// Synthetic Modern-style hover surface. No game assets, pixels or player data.
// The self-contained function can be injected into an isolated native fixture.
export function drawHoverFixture(canvas,{name='Copperleaf Coat +4',weapon=false,examine=false,footer=true,x=850,y=180,width=1920,height=1080}={}){
    canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d');c.fillStyle='#23343d';c.fillRect(0,0,width,height);
    c.fillStyle='#15232c';c.fillRect(20,30,470,650);c.fillStyle='#9ca9af';c.font='20px sans-serif';c.fillText('Inventory',45,65);c.fillText('Synthetic player equipment',45,105);
    for(let row=0;row<4;row++)for(let col=0;col<5;col++){c.strokeStyle='#55616a';c.strokeRect(45+col*75,150+row*90,60,65);}
    c.fillStyle='#0f1b25';c.fillRect(25,height-165,700,140);c.fillStyle='#c6d2d9';c.font='18px sans-serif';c.fillText('Synthetic chat: HP 9999 STR 888 AC 777',45,height-125);c.fillText('Class: WAR Race: ALL are unrelated chat words.',45,height-90);
    if(examine){c.fillStyle='#111';c.fillRect(25,40,560,700);c.fillStyle='#ddd';c.font='20px Arial, sans-serif';for(const [line,top]of [['Synthetic River Shoes +2',70],['Description',110],['Synthetic River Shoes +2',155],['Class: ALL',190],['Race: ALL',220],['Feet',250],['Tier 2 1/4',280],['Size: SMALL AC: 15',330],['HP: 61',360],['Strength: 6',400],['Done',710]])c.fillText(line,line==='Description'?220:110,top);}
    const h=weapon?630:500;c.fillStyle='#111';c.fillRect(x,y,560,h);c.strokeStyle='#070707';c.lineWidth=3;c.strokeRect(x,y,560,h);
    c.fillStyle='#68727b';c.fillRect(x+20,y+20,48,56);c.strokeStyle='#b5bbc0';c.strokeRect(x+20,y+20,48,56);
    const text=(value,left,top,color='#ddd',font=20)=>{c.font=`${font}px Arial, sans-serif`;c.fillStyle=color;c.fillText(value,x+left,y+top);};
    text(name,90,35,'#21e925');text('Lore Equipped, No Trade',90,59);text(weapon?'Class: ROG':'Class: WAR CLR PAL',90,83);text('Race: ALL',90,107);text(weapon?'Primary Secondary':'Chest',90,131);
    text('Size:',20,180);text(weapon?'SMALL':'LARGE',130,180);text(weapon?'HP:':'AC:',215,180);text(weapon?'73':'27',350,180);
    text('Weight',20,204);text('1.4',165,204);
    if(weapon){text('Base Dmg:',390,180);text('18',525,180);text('Accuracy:',215,204);text('+8.5%',315,204);text('Backstab Dmg:',390,204);text('9',535,204);text('Skill: 1H Piercing',20,228);text('Delay:',390,228);text('29',525,228);text('Dmg Bon:',390,252);text('7',535,252);}
    const top=weapon?320:270;text('Strength:',20,top);text('21',140,top);text('SV. Void:',215,top);text('4',350,top);text('Stamina:',20,top+24);text('13',140,top+24);text('Dexterity:',20,top+48);text('17',140,top+48);text('Haste:',215,top+24);text('16%',320,top+24);
    if(weapon)text('Worn Effect: Swift Study 88%',20,top+110,'#ce53d9',18);
    text('4 empty slots',60,h-85);if(footer)text('Hold RMB or ALT+LMB to inspect or upgrade item.',20,h-20,'#dda022',17);
    return {name,weapon,tooltip:{x,y,width:560,height:h}};
}
export function hoverFixtureHtml(options={}){return `<!doctype html><meta charset="utf-8"><title>EverQuest Synthetic Hover Fixture</title><style>html,body{margin:0;overflow:hidden;background:#23343d}canvas{display:block}</style><canvas id="fixture"></canvas><script>window.drawFixture=options=>(${drawHoverFixture.toString()})(document.querySelector('canvas'),options);window.drawFixture(${JSON.stringify(options).replace(/</g,'\\u003c')});</script>`;}
