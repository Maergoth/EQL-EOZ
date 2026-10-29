// Synthetic small Default Modern panels: standard Arial text and geometric
// rectangles only. No game pixels, artwork, player names, files or UI XML.
// Goldens are independent literals, not values recovered from an OCR result.
export const COMPACT_MODERN_EXPECTED=Object.freeze({
    hpCurrent:47,hpMaximum:823,manaCurrent:163,manaMaximum:947,enduranceCurrent:271,enduranceMaximum:689,
    acMitigation:367,acMitigationSoftcap:284,acEvasion:593,attackOffense:318,attackAccuracy:647,
    str:145,sta:187,agi:193,dex:209,wis:217,int:229,cha:241,
    resistMagic:41,resistFire:53,resistCold:67,resistDisease:71,resistPoison:83,resistCorruption:97,attackSpeed:137,
    hpRegen:19,manaRegen:23,enduranceRegen:29,velocity:0
});
export const COMPACT_MODERN_MODIFIERS=Object.freeze({accuracy:0,avoidance:0,combatEffects:0,damageShield:0,damageShieldMitigation:0,
    dotShielding:0,meleeShielding:0,spellShielding:0,strikeThrough:0,stunResist:0});

// Keep this renderer self-contained so the offline Electron fixture can call it
// in a sandboxed canvas page without exposing Node or importing browser code.
export function drawCompactModernOcrFixture(document,{gearVisible=true,geometryScale=1}={}){
    if(![1,1.5].includes(geometryScale))throw new Error('Only the two predeclared whole-layout sizes are synthetic fixtures');
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(503*geometryScale);canvas.height=Math.ceil(500*geometryScale);
    // Arial12 has9px native numeral ink and29px after the normal3x resize,
    // matching the independently measured9.67px source ink in14px widgets.
    const c=canvas.getContext('2d'),font=12;c.scale(geometryScale,geometryScale);
    c.textBaseline='top';c.fillStyle='#090b09';c.fillRect(0,0,503,500);
    c.strokeStyle='#646a64';c.strokeRect(.5,.5,502,499);
    const text=(value,x,y,{green=false,size=font}={})=>{c.font=`${size}px Arial,sans-serif`;c.fillStyle=green?'#68ef51':'#ededed';c.fillText(value,x,y);};
    const label=(value,x,y)=>{c.save();c.beginPath();c.rect(x,y,120,14);c.clip();text(value,x,y);c.restore();};
    const numeric=(value,right,y,{green=true,size=font}={})=>{c.font=`${size}px Arial,sans-serif`;text(value,right-c.measureText(value).width,y,{green,size});};
    const leftNumeric=(value,left,width,y)=>{c.font=`${font}px Arial,sans-serif`;const metrics=c.measureText(value);if(metrics.actualBoundingBoxLeft>0||metrics.width>width||metrics.actualBoundingBoxRight>width)throw new Error('Synthetic number exceeds its native left-aligned widget');text(value,left,y,{green:true});};
    text('Inventory',12,10,{size:12});
    if(gearVisible){
        text('Equipment',12,35,{size:11});
        for(let row=0;row<4;row++)for(let column=0;column<6;column++){
            const x=12+column*35,y=54+row*26;c.strokeStyle='#586158';c.strokeRect(x+.5,y+.5,26,21);
        }
    }
    const headingY=gearVisible?236:49,rowHeight=16,bodyY=headingY+rowHeight;
    // Draw the same native content in both views. The gear view's lower stats
    // are outside the visible465px viewport; no modifier rows are fabricated
    // as absent conditionally. Fourteen-pixel widgets have two-pixel spacing.
    c.save();c.beginPath();c.rect(10,headingY-2,392,465-(headingY-2));c.clip();
    // The two 175px Modern columns have a six-pixel gap. Current, divider and
    // cap/component cells follow their separate native positions, not a single
    // convenient inline number string. Distinct caps exercise real cell binding.
    text('Character Vitals',18,headingY);text('Stats and Resists',199,headingY);
    for(const [index,[label,current,maximum]]of [['HP','47','823'],['Mana','163','947'],['End','271','689']].entries()){
        const y=bodyY+index*rowHeight;text(label,18,y);numeric(current,131,y);text('/',133,y);leftNumeric(maximum,138,55,y);
    }
    const acY=bodyY+3*rowHeight,attackY=bodyY+4*rowHeight;
    // Native softcap (X92/30px), evasion and accuracy (X127/55px) are
    // left-aligned relative to the Character column's X18 origin.
    text('AC',18,acY);numeric('367',103,acY);text('/',105,acY);leftNumeric('284',110,30,acY);text('|',140,acY);leftNumeric('593',145,55,acY);
    text('Attack',18,attackY);numeric('318',138,attackY);text('|',140,attackY);leftNumeric('647',145,55,attackY);
    label('Attack Speed %',18,bodyY+5*rowHeight);numeric('137',178,bodyY+5*rowHeight);
    label('Velocity',18,bodyY+6*rowHeight);numeric('0',178,bodyY+6*rowHeight);
    for(const [index,[caption,value]]of [['HP Regen','19'],['Mana Regen','23'],['End Regen','29']].entries()){const y=bodyY+(7+index)*rowHeight;label(caption,18,y);numeric(value,178,y);}
    for(const [index,caption]of ['Primary DPS','Secondary DPS','Ranged DPS'].entries())label(caption,18,bodyY+(10+index)*rowHeight);
    const attributes=[['Strength','145','321'],['Stamina','187','422'],['Intelligence','229','466'],['Wisdom','217','355'],['Agility','193','388'],['Dexterity','209','444'],['Charisma','241','399']];
    for(const [index,[label,current,cap]]of attributes.entries()){const y=bodyY+index*rowHeight;text(label,199,y);numeric(current,301,y);text('/',302,y);leftNumeric(cap,307,35,y);}
    const resistsY=bodyY+7*rowHeight;
    const resists=[['SV. Magic','41','173'],['SV. Fire','53','197'],['SV. Cold','67','211'],['SV. Disease','71','223'],['SV. Poison','83','239'],['SV. Void','97','251']];
    for(const [index,[caption,current,cap]]of resists.entries()){const y=resistsY+index*rowHeight;text(caption,199,y);numeric(current,330,y);text('/',331,y);leftNumeric(cap,336,35,y);}
    const modifiersY=headingY+234;
    text('Additional Modifiers',18,modifiersY);
    const modifierColumns=[{x:18,rows:[['Accuracy','139',true],['Avoidance','163',true],['Combat Effects','181',true],['Strike Through','71',false],['Stun Resist','79',false]]},
        {x:199,rows:[['Damage Shielding','47',false],['Damage Shield Mitigation','61',false],['DoT Shielding','53',false],['Melee Shielding','59',false],['Spell Shielding','67',false]]}];
    for(const column of modifierColumns)for(const [index,[caption,cap,narrow]]of column.rows.entries()){
        const y=modifiersY+(index+1)*rowHeight;label(caption,column.x,y);numeric('0',column.x+(narrow?139:145),y);text('/',column.x+(narrow?140:146),y);leftNumeric(cap,column.x+(narrow?145:152),35,y);
    }
    c.restore();
    return canvas;
}
