import { appearanceFont, normalizeAppearance } from './appearance.js';
import { CHARACTER_SLOTS, characterBaseItemName, characterShareSummary, characterStatLabel, safeCharacterIcon } from './character-model.js';

export const CHARACTER_SHARE_LIMITS = Object.freeze({width:1800,minHeight:2400,maxHeight:8192,maxPixels:15000000,maxBytes:12000000,maxIconDimension:256});
const COLORS = Object.freeze({background:'#070b12',panel:'#0e141e',line:'#66582d',gold:'#d8b75c',heading:'#f0d77f',text:'#e9edf3',muted:'#9ba8b8',warning:'#e6c84c'});
const label = characterStatLabel;
const format = value => value === null || value === undefined ? '?' : Number.isInteger(value) ? String(value) : String(Math.round(value*1000)/1000);
const entries = stats => Object.entries(stats || {});
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ');

/** Plan uses fixed readable width and content-dependent rows. Text is wrapped,
 * never silently cropped. Oversized inputs fail before canvas allocation. */
export function characterShareLayout(snapshot,{appearance}={}) {
    const summary=characterShareSummary(snapshot), normalized=normalizeAppearance(appearance);
    const size=18*Math.max(1,Math.min(1.3,normalized.fontSize/13)), line=Math.ceil(size*1.45);
    const statKeys=Object.keys(summary.stats.derived), statRows=Math.ceil(statKeys.length/2);
    const headerHeight=196, statsHeight=98+statRows*line, gearTop=headerHeight+statsHeight+80;
    // Four stat columns per card. Labels are drawn separately from values.
    const rowHeights=[];
    for(let index=0;index<CHARACTER_SLOTS.length;index+=2) {
        let rows=0;
        for(const entry of summary.equipment.slice(index,index+2)) rows=Math.max(rows,Math.ceil(entries(entry.item?.stats).length/4));
        rowHeights.push(200+Math.max(1,rows)*line);
    }
    const contentHeight=gearTop+rowHeights.reduce((sum,height)=>sum+height+14,0)+124;
    const height=Math.max(CHARACTER_SHARE_LIMITS.minHeight,Math.ceil(contentHeight/64)*64);
    if(height>CHARACTER_SHARE_LIMITS.maxHeight || height*CHARACTER_SHARE_LIMITS.width>CHARACTER_SHARE_LIMITS.maxPixels) throw new Error('This character has too many detailed fields for one bounded share image. Reduce custom item fields before exporting.');
    return {summary,width:CHARACTER_SHARE_LIMITS.width,height,size,line,headerHeight,statsHeight,gearTop,rowHeights,appearance:normalized};
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

/** Render a reviewed local snapshot, without fetching resources or creating HTML
 * from item text. resolveIcon(iconId) may return a cached raster data URL only.
 * Same snapshot, appearance and installed fonts yield the same layout/PNG.
 * Returns {canvas,dataUrl,blob,summary,width,height}; PNG is bounded to 12MB.
 */
export async function renderCharacterShare(snapshot,{document=globalThis.document,appearance,resolveIcon}={}) {
    if(!document?.createElement) throw new Error('Character sharing needs a browser canvas.');
    const plan=characterShareLayout(snapshot,{appearance}),{summary,width,height,size,line}=plan;
    const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false}); if(!ctx) throw new Error('A canvas renderer is unavailable.');
    const font=appearanceFont(plan.appearance), stack=font.stack, heading=font.heading || stack;
    const text=(value,x,y,{color=COLORS.text,bold=false,scale=1,family=stack}={})=>{
        ctx.font=`${bold ? '700 ' : ''}${size*scale}px ${family}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(clean(value),x,y);
    };
    // Each bounded field is wrapped by codepoint, including a single long OCR
    // token. Return line count so no item text can overdraw another field.
    const wrap=(value,maxWidth,options={})=>{
        ctx.font=`${options.bold ? '700 ' : ''}${size*(options.scale || 1)}px ${options.family || stack}`;
        const rows=[];let row='';
        for(const char of clean(value)) {
            if(row && ctx.measureText(row+char).width>maxWidth) {
                const boundary=row.lastIndexOf(' ');
                if(boundary>0) {rows.push(row.slice(0,boundary).trim());row=row.slice(boundary+1);}
                else {rows.push(row.trim());row='';}
            }
            row+=char;
        }
        if(row) rows.push(row.trim()); return rows.length ? rows : [''];
    };
    const lines=(rows,x,y,options={})=>rows.forEach((row,index)=>text(row,x,y+index*line,options));
    const panel=(x,y,w,h)=>{ctx.fillStyle=COLORS.panel;ctx.fillRect(x,y,w,h);ctx.strokeStyle=COLORS.line;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);};
    ctx.fillStyle=COLORS.background;ctx.fillRect(0,0,width,height);
    text('EQLWIKI  /  EYE OF ZOMM',48,34,{color:COLORS.gold,bold:true,scale:.85});
    const identity=summary.metadata;
    const title=identity.name || 'Character snapshot';
    const titleRows=wrap(title,1704,{scale:1.9,bold:true,family:heading});
    if(titleRows.length>1) throw new Error('The character name is too long for the share header. Review it before exporting.');
    lines(titleRows,48,70,{color:COLORS.heading,bold:true,scale:1.9,family:heading});
    const meta=[identity.server,identity.level===null ? '' : `Level ${identity.level}`,identity.race,...identity.classes,identity.aaCount===null?'':`${identity.aaCount} AAs`].filter(Boolean).join('  ·  ');
    text(meta || 'Character details not recorded',48,134,{color:COLORS.muted});
    text(identity.sessionName || 'Equipment estimates from an observed No Equipment baseline',48,164,{color:COLORS.muted,scale:.85});

    const columnWidth=558, gap=15, statY=plan.headerHeight;
    const columns=[{title:'No Equipment · observed',data:summary.stats.base?.stats,confirmed:summary.stats.base?.confirmed},
        {title:'Gear sums · calculated',data:summary.stats.derived,derived:true},
        {title:'Equipped · additive estimate',data:summary.stats.computed,derived:true,computed:true}];
    columns.forEach((column,index)=>{
        const x=48+index*(columnWidth+gap);panel(x,statY,columnWidth,plan.statsHeight);
        text(column.title,x+18,statY+17,{color:COLORS.heading,bold:true});
        text(column.computed ? '* = partial; ? = formula or baseline unknown' : column.derived ? '* = partial; empty slots omitted' : column.data ? column.confirmed ? 'Reviewed capture' : 'Unconfirmed capture' : 'Not captured · unknown values',x+18,statY+48,{color:COLORS.muted,scale:.8});
        Object.keys(summary.stats.derived).forEach((key,statIndex)=>{
            const col=statIndex%2,row=Math.floor(statIndex/2),sx=x+18+col*270,sy=statY+79+row*line;
            const record=column.data?.[key],gearUnknown=column.derived&&!column.computed&&summary.stats.computed[key]?.gearKey===null;
            const value=column.derived ? `${format(gearUnknown?null:record.value)}${!gearUnknown&&record.value!==null&&!record.complete?'*':''}` : format(record);
            // Character stat keys are bounded at 32 chars; wrap very long keys
            // at a smaller readable font inside their own column.
            const name=label(key), fontScale=ctx.measureText(name).width>165 ? .72 : .86;
            text(name,sx,sy,{color:COLORS.muted,scale:fontScale});
            ctx.font=`700 ${size}px ${stack}`; const valueWidth=ctx.measureText(value).width;
            text(value,sx+250-valueWidth,sy,{bold:true});
        });
    });
    text('EQUIPMENT  /  25 NAMED SLOTS',48,plan.gearTop-48,{color:COLORS.gold,bold:true});

    const byId=new Map((snapshot.candidates || []).map(item=>[item.id,item]));
    const iconCache=new Map();
    let y=plan.gearTop;
    for(let row=0;row<plan.rowHeights.length;row++) {
        const rowHeight=plan.rowHeights[row];
        for(let col=0;col<2;col++) {
            const entry=summary.equipment[row*2+col]; if(!entry) continue;
            const x=48+col*859,w=844;panel(x,y,w,rowHeight);
            text(entry.label.toUpperCase(),x+18,y+12,{color:COLORS.gold,bold:true,scale:.75});
            const item=entry.item;
            if(!item) {text('Empty · no item assigned',x+20,y+53,{color:COLORS.muted});continue;}
            const original=byId.get(snapshot.equipment?.[entry.slot]);
            let iconSource=safeCharacterIcon(original?.icon);
            if(!iconSource && resolveIcon && item.iconId) {
                try { iconSource=safeCharacterIcon(await resolveIcon(item.iconId)); } catch { /* Missing cached artwork uses a placeholder. */ }
            }
            if(iconSource && !iconCache.has(iconSource)) iconCache.set(iconSource,await localIcon(document,iconSource));
            const image=iconCache.get(iconSource);
            if(image) ctx.drawImage(image,x+18,y+43,48,48);
            else {ctx.strokeStyle=COLORS.line;ctx.strokeRect(x+18,y+43,48,48);text('?',x+35,y+55,{color:COLORS.muted});}
            const nameRows=wrap(characterBaseItemName(item.name),w-111,{bold:true});
            // A bounded 240-character title could exceed the normal card title
            // region. Refuse instead of producing a clipped/overlapping image.
            if(nameRows.length>2) throw new Error('An item title is too long for the share card. Review the extracted name before exporting.');
            lines(nameRows,x+81,y+41,{color:COLORS.heading,bold:true});
            const details=[item.tier===null ? 'Tier ?' : `Tier ${item.tier}${item.fraction===null ? ' · progress ?' : item.fraction ? ` +${item.fraction}/${2**item.tier}` : ''}`,item.level===null ? '' : `Req. level ${item.level}`,
                item.basis==='catalog-tier-preview'?'Catalog tier preview':item.basis==='observed-examine'?'Captured values':'Scaled catalog'];
            text(details.filter(Boolean).join('  ·  '),x+81,y+99,{color:COLORS.muted,scale:.8});
            const augments=item.augments.length ? `Augments: ${item.augments.map(augment=>augment.name || '?').join(', ')} (${item.augmentStatus})` : `Augments: ${item.augmentStatus==='none' ? 'none confirmed' : item.augmentStatus}`;
            const augRows=wrap(augments,w-36,{scale:.75});
            if(augRows.length>1) throw new Error('Augment text is too long for one bounded share card. Review the augment names before exporting.');
            text(augments,x+18,y+127,{color:COLORS.muted,scale:.75});
            entries(item.stats).forEach(([key,value],index)=>{
                const sx=x+18+(index%4)*203,sy=y+158+Math.floor(index/4)*line;
                const content=`${label(key)} ${format(value)}`;
                ctx.font=`${size*.83}px ${stack}`;
                if(ctx.measureText(content).width>196) throw new Error(`Item stat ${key} is too long for a share card.`);
                text(content,sx,sy,{scale:.83});
            });
            if(!entries(item.stats).length) text('Stats unknown',x+18,y+158,{color:COLORS.warning,scale:.8});
            if(!item.complete || item.slotWarning) text(item.slotWarning || 'Partial item stats · review tier / augments',x+18,y+rowHeight-27,{color:COLORS.warning,scale:.75});
        }
        y+=rowHeight+14;
    }
    const caveat=wrap(summary.caveat,width-96,{scale:.84});lines(caveat,48,height-124,{color:COLORS.muted,scale:.84});
    text('Unknown is shown as ?  ·  Share preview contains assigned gear only',48,height-38,{color:COLORS.gold,scale:.75});
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value ? resolve(value) : reject(new Error('PNG encoding failed.')),'image/png'));
    if(blob.size>CHARACTER_SHARE_LIMITS.maxBytes) throw new Error('The share image exceeds the 12 MB export limit.');
    const dataUrl=canvas.toDataURL('image/png');
    if(!dataUrl.startsWith('data:image/png;base64,')) throw new Error('PNG encoding returned an unsupported image.');
    return {canvas,dataUrl,blob,summary,width,height};
}
