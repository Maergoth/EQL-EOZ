import { appearanceFont, normalizeAppearance } from './appearance.js';
import { CHARACTER_SLOTS, characterShareSummary, safeCharacterIcon } from './character-model.js';
import { CHARACTER_EQUIPMENT_ROWS, characterItemLabel } from './character-inventory-view.js';
import { characterTotalGroups } from './character-totals.js';

export const CHARACTER_SHARE_LIMITS = Object.freeze({width:1800,minHeight:1600,maxHeight:8192,maxPixels:15000000,maxBytes:12000000,maxIconDimension:256});
const COLORS={background:'#070b12',panel:'#0e141e',line:'#66582d',gold:'#d8b75c',heading:'#f0d77f',text:'#e9edf3',muted:'#9ba8b8'};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ');
const format=value=>value===null||value===undefined?'?':Number.isInteger(value)?String(value):String(Math.round(value*100)/100);

/** Compact inspect: equipped icons and a single observed totals panel.
 * Current resources and private observation/export data are not rendered. */
export function characterShareLayout(snapshot,{appearance}={}) {
    const summary=characterShareSummary(snapshot),normalized=normalizeAppearance(appearance),groups=characterTotalGroups(summary.stats);
    const size=22*Math.max(1,Math.min(1.3,normalized.fontSize/13)),line=Math.ceil(size*1.55);
    const headerHeight=180,gearTop=headerHeight,gearHeight=CHARACTER_EQUIPMENT_ROWS.length*154;
    const statsTop=gearTop+gearHeight+28,statsHeight=80+Math.max(...groups.map(group=>group.rows.length))*line;
    const height=Math.max(CHARACTER_SHARE_LIMITS.minHeight,Math.ceil((statsTop+statsHeight+140)/64)*64);
    if(height>CHARACTER_SHARE_LIMITS.maxHeight||height*CHARACTER_SHARE_LIMITS.width>CHARACTER_SHARE_LIMITS.maxPixels)throw Error('The character inspect image exceeds its size limit.');
    return {summary,width:CHARACTER_SHARE_LIMITS.width,height,size,line,headerHeight,gearTop,gearHeight,statsTop,statsHeight,groups,appearance:normalized};
}

function iconDimensions(source,decodeBase64) {
    const bytes=decodeBase64(source.slice(source.indexOf(',')+1));
    const byte=index=>bytes.charCodeAt(index), u32be=index=>((byte(index)*0x1000000)+(byte(index+1)<<16)+(byte(index+2)<<8)+byte(index+3))>>>0;
    if(source.startsWith('data:image/png;') && bytes.length>=24 && bytes.slice(1,4)==='PNG') return [u32be(16),u32be(20)];
    if(source.startsWith('data:image/webp;') && bytes.length>=30 && bytes.slice(0,4)==='RIFF' && bytes.slice(8,12)==='WEBP') {
        if(bytes.slice(12,16)==='VP8X') return [1+byte(24)+(byte(25)<<8)+(byte(26)<<16),1+byte(27)+(byte(28)<<8)+(byte(29)<<16)];
        if(bytes.slice(12,16)==='VP8 ' && bytes.slice(23,26)==='\u009d\u0001\u002a') return [(byte(26)+(byte(27)<<8))&0x3fff,(byte(28)+(byte(29)<<8))&0x3fff];
        if(bytes.slice(12,16)==='VP8L' && byte(20)===0x2f) return [1+byte(21)+((byte(22)&0x3f)<<8),1+(byte(22)>>6)+(byte(23)<<2)+((byte(24)&0xf)<<10)];
    }
    if(source.startsWith('data:image/jpeg;') && byte(0)===255 && byte(1)===216) {
        for(let offset=2;offset+9<bytes.length;) {
            if(byte(offset)!==255) break;
            const marker=byte(offset+1), length=(byte(offset+2)<<8)+byte(offset+3);
            if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return [(byte(offset+7)<<8)+byte(offset+8),(byte(offset+5)<<8)+byte(offset+6)];
            if(length<2) break; offset+=length+2;
        }
    }
    return null;
}

async function localIcon(document,source) {
    const safe=safeCharacterIcon(source); if(!safe) return null;
    try {
        const decode=document.defaultView?.atob?.bind(document.defaultView) || globalThis.atob;
        const dimensions=iconDimensions(safe,decode);
        if(!dimensions || dimensions.some(value=>!value || value>CHARACTER_SHARE_LIMITS.maxIconDimension)) return null;
        const image=document.createElement('img');
        image.src=safe; await image.decode();
        return image.naturalWidth<=CHARACTER_SHARE_LIMITS.maxIconDimension && image.naturalHeight<=CHARACTER_SHARE_LIMITS.maxIconDimension ? image : null;
    } catch {return null;}
}


export async function renderCharacterShare(snapshot,{document=globalThis.document,appearance,resolveIcon}={}) {
    if(!document?.createElement)throw Error('Character sharing needs a browser canvas.');
    const plan=characterShareLayout(snapshot,{appearance}),{summary,width,height,size,line}=plan;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('A canvas renderer is unavailable.');
    const fonts=appearanceFont(plan.appearance),stack=fonts.stack,heading=fonts.heading||stack;
    const text=(value,x,y,{color=COLORS.text,bold=false,scale=1,family=stack}={})=>{ctx.font=(bold?'700 ':'')+size*scale+'px '+family;ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(clean(value),x,y);};
    const wrap=(value,maxWidth,scale=1)=>{
        ctx.font=size*scale+'px '+stack;const rows=[];let row='';
        for(const char of clean(value)){if(row&&ctx.measureText(row+char).width>maxWidth){const cut=row.lastIndexOf(' ');if(cut>0){rows.push(row.slice(0,cut));row=row.slice(cut+1);}else{rows.push(row);row='';}}row+=char;}if(row)rows.push(row);return rows;
    };
    const panel=(x,y,w,h)=>{ctx.fillStyle=COLORS.panel;ctx.fillRect(x,y,w,h);ctx.strokeStyle=COLORS.line;ctx.strokeRect(x+.5,y+.5,w-1,h-1);};
    ctx.fillStyle=COLORS.background;ctx.fillRect(0,0,width,height);
    text('EQLWIKI  /  EYE OF ZOMM',48,28,{color:COLORS.gold,scale:.8,bold:true});
    const identity=summary.metadata,title=identity.name||'Your character';
    if(wrap(title,width-96,1.65).length>1)throw Error('The character name is too long for the share header.');
    text(title,48,67,{color:COLORS.heading,bold:true,scale:1.65,family:heading});
    text([identity.level===null?'':'Level '+identity.level,identity.classes.join('/'),identity.server,identity.race,identity.aaCount===null?'':identity.aaCount+' AAs'].filter(Boolean).join('  ·  '),48,122,{color:COLORS.muted});
    const bySlot=new Map(summary.equipment.map(entry=>[entry.slot,entry])),byId=new Map((snapshot.candidates||[]).map(item=>[item.id,item])),icons=new Map();
    for(let r=0;r<CHARACTER_EQUIPMENT_ROWS.length;r++){
        const row=CHARACTER_EQUIPMENT_ROWS[r],offset=(6-row.length)/2;
        for(let c=0;c<row.length;c++){
            const entry=bySlot.get(row[c]),item=entry?.item,x=48+(c+offset)*286,y=plan.gearTop+r*154,w=272;
            panel(x,y,w,140);text(entry.label,x+12,y+9,{color:COLORS.gold,scale:.65});
            if(!item){text('Empty',x+14,y+62,{color:COLORS.muted,scale:.8});continue;}
            const original=byId.get(snapshot.equipment?.[entry.slot]);let icon=safeCharacterIcon(original?.icon);
            if(!icon&&resolveIcon&&item.iconId){try{icon=safeCharacterIcon(await resolveIcon(item.iconId));}catch{/* Optional cached icon. */}}
            if(icon&&!icons.has(icon))icons.set(icon,await localIcon(document,icon));const image=icons.get(icon);
            if(image)ctx.drawImage(image,x+12,y+38,48,48);else{ctx.strokeStyle=COLORS.line;ctx.strokeRect(x+12,y+38,48,48);text('?',x+27,y+48,{color:COLORS.muted});}
            const name=characterItemLabel(item),rows=wrap(name,w-88,.72);
            if(rows.length>3)throw Error('An item name is too long for the compact share card. Review it before exporting.');
            rows.forEach((value,index)=>text(value,x+74,y+39+index*22,{color:COLORS.heading,scale:.72}));
            const augments=item.augments?.length||0;if(augments)text(augments+' Exaltation'+(augments===1?'':'s'),x+12,y+112,{color:COLORS.muted,scale:.65});
        }
    }
    const gap=24,columnWidth=(width-96-gap)/2;
    plan.groups.forEach((group,index)=>{
        const x=48+index*(columnWidth+gap),y=plan.statsTop;panel(x,y,columnWidth,plan.statsHeight);
        text(group.label,x+20,y+18,{color:COLORS.gold,bold:true});
        group.rows.forEach((row,i)=>{const sy=y+66+i*line; text(row.label,x+20,sy,{color:COLORS.muted,scale:.85});const value=format(row.value)+(row.value!==null&&!row.complete?'*':'');ctx.font='700 '+size+'px '+stack;text(value,x+columnWidth-22-ctx.measureText(value).width,sy,{bold:true});});
    });
    text('Captured equipped statistics · ? unavailable',48,height-91,{color:COLORS.gold,scale:.8});
    text('Read from the character stat panel; changing gear here does not recalculate these values.',48,height-53,{color:COLORS.muted,scale:.72});
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG encoding failed.')),'image/png'));
    if(blob.size>CHARACTER_SHARE_LIMITS.maxBytes)throw Error('The share image exceeds the 12 MB limit.');
    const dataUrl=canvas.toDataURL('image/png');if(!dataUrl.startsWith('data:image/png;base64,'))throw Error('PNG encoding returned an unsupported image.');
    return {canvas,dataUrl,blob,summary,width,height};
}
