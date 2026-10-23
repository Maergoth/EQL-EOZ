'use strict';

// Pure Electron-DIP geometry. The host owns trusted gesture intent, live window
// bounds, persistence and propagation; this helper never moves a native window.
const EDGES=Object.freeze(['above','below','left','right']);
const idValid=id=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(id);
const number=value=>typeof value==='number'&&Number.isFinite(value);
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const sameDisplay=(left,right)=>left!==undefined&&left!==null&&right!==undefined&&right!==null&&left===right;
function rectangle(value) {
    if(!value||!['x','y','width','height'].every(key=>number(value[key]))||value.width<=0||value.height<=0)return null;
    return {x:Math.round(value.x),y:Math.round(value.y),width:Math.round(value.width),height:Math.round(value.height)};
}
const equalBounds=(left,right)=>['x','y','width','height'].every(key=>left[key]===right[key]);
function limits(options) {
    const supplied=options.limits||options;
    return {minWidth:number(supplied.minWidth)?Math.max(1,supplied.minWidth):260,
        minHeight:number(supplied.minHeight)?Math.max(1,supplied.minHeight):options.id==='timers'?36:160,
        maxWidth:number(supplied.maxWidth)?supplied.maxWidth:1200,maxHeight:number(supplied.maxHeight)?supplied.maxHeight:1200};
}
function fits(bounds,area,range) {
    return area&&bounds.width>=range.minWidth&&bounds.height>=range.minHeight&&bounds.width<=range.maxWidth&&bounds.height<=range.maxHeight&&
        bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+bounds.width<=area.x+area.width&&bounds.y+bounds.height<=area.y+area.height;
}
const overlap=(start,length,otherStart,otherLength)=>Math.min(start+length,otherStart+otherLength)-Math.max(start,otherStart);
function intersects(left,right) {return overlap(left.x,left.width,right.x,right.width)>0&&overlap(left.y,left.height,right.y,right.height)>0;}
function collision(bounds,{id,displayId,targets=[]},targetId) {
    return (Array.isArray(targets)?targets:[]).some(target=>target?.visible===true&&target.id!==id&&target.id!==targetId&&sameDisplay(displayId,target.displayId)&&
        rectangle(target.bounds)&&intersects(bounds,rectangle(target.bounds)));
}
function wouldCycle(id,targetId,relations={}) {
    const visited=new Set([id]);let current=targetId;
    while(idValid(current)) {
        if(visited.has(current))return true;
        visited.add(current);
        if(!has(relations,current))return false;
        current=relations[current]?.targetId;
    }
    return false;
}

/** Apply an established touching relation to current target bounds. Above/below
 * share x+width; left/right share y+height. Returns null instead of clamping,
 * crossing a work area, violating owner limits, overlapping another panel or
 * accepting a cycle. targets must describe other currently visible windows. */
function applyOverlayDock(options={}) {
    const {id,relation,targetBounds,workArea,relations={}}=options,bounds=rectangle(options.bounds),target=rectangle(targetBounds),area=rectangle(workArea);
    if(!idValid(id)||!idValid(relation?.targetId)||id===relation.targetId||!EDGES.includes(relation.edge)||!bounds||!target||wouldCycle(id,relation.targetId,relations))return null;
    if(Array.isArray(options.targets)) {
        const liveTarget=options.targets.find(panel=>panel?.id===relation.targetId);
        if(liveTarget?.visible!==true||!sameDisplay(options.displayId,liveTarget.displayId))return null;
    }
    const next={...bounds};
    if(relation.edge==='above'||relation.edge==='below') {
        next.x=target.x;next.width=target.width;
        next.y=relation.edge==='above'?target.y-bounds.height:target.y+target.height;
    } else {
        next.y=target.y;next.height=target.height;
        next.x=relation.edge==='left'?target.x-bounds.width:target.x+target.width;
    }
    return fits(next,area,limits(options))&&!collision(next,options,relation.targetId)?next:null;
}

/** Find the nearest plausible touching edge on the same display. Defaults:
 * threshold12 DIPs, zero gap, width260..1200, height36(timers)/160..1200.
 * Edge distance ranks first, alignment movement second, target ID/edge last.
 * The perpendicular start must be within half the smaller panel dimension and
 * overlap by at least a third (capped48); a distant corner cannot teleport.
 * No valid snap returns a copied original rectangle and null relation. */
function snapOverlayBounds(options={}) {
    const bounds=rectangle(options.bounds),original={bounds,relation:null,changed:false};
    if(!bounds||!idValid(options.id))return original;
    const threshold=number(options.threshold)?Math.max(0,Math.min(64,options.threshold)):12,matches=[];
    for(const target of Array.isArray(options.targets)?options.targets:[]) {
        if(!idValid(target?.id)||target.id===options.id||target.visible!==true||!sameDisplay(options.displayId,target.displayId))continue;
        const targetBounds=rectangle(target.bounds);if(!targetBounds)continue;
        for(const edge of EDGES) {
            const vertical=edge==='above'||edge==='below',axis=vertical?'x':'y',size=vertical?'width':'height';
            const alignment=Math.abs(bounds[axis]-targetBounds[axis]),smaller=Math.min(bounds[size],targetBounds[size]);
            if(alignment>Math.max(threshold,smaller/2)||overlap(bounds[axis],bounds[size],targetBounds[axis],targetBounds[size])<Math.min(48,smaller/3))continue;
            const distance=Math.abs(edge==='above'?bounds.y+bounds.height-targetBounds.y:edge==='below'?bounds.y-targetBounds.y-targetBounds.height:
                edge==='left'?bounds.x+bounds.width-targetBounds.x:bounds.x-targetBounds.x-targetBounds.width);
            if(distance>threshold)continue;
            const relation={targetId:target.id,edge},next=applyOverlayDock({...options,relation,targetBounds});
            if(next)matches.push({bounds:next,relation,distance,alignment});
        }
    }
    matches.sort((left,right)=>left.distance-right.distance||left.alignment-right.alignment||left.relation.targetId.localeCompare(right.relation.targetId,'en')||EDGES.indexOf(left.relation.edge)-EDGES.indexOf(right.relation.edge));
    const selected=matches[0];
    return selected?{bounds:selected.bounds,relation:selected.relation,changed:!equalBounds(bounds,selected.bounds)}:original;
}

/** Normalize a persisted child->target map against current visible panels.
 * Hidden/missing/cross-display/self targets and invalid edges are removed.
 * Every member of a cycle is removed, independent of object insertion order.
 * A valid chain pointing at a former cycle member remains a valid rooted chain.
 */
function normalizeOverlayDocks(panels=[],relations={}) {
    const byId=new Map((Array.isArray(panels)?panels:[]).filter(panel=>idValid(panel?.id)&&panel.visible===true&&rectangle(panel.bounds)).map(panel=>[panel.id,panel])),result={};
    for(const id of Object.keys(relations||{}).sort()) {
        const relation=relations[id],owner=byId.get(id),target=byId.get(relation?.targetId);
        if(owner&&target&&owner.id!==target.id&&sameDisplay(owner.displayId,target.displayId)&&EDGES.includes(relation.edge))result[id]={targetId:target.id,edge:relation.edge};
    }
    const cyclic=new Set();
    for(const id of Object.keys(result)) {
        const path=[],index=new Map();let current=id;
        while(has(result,current)) {
            if(index.has(current)) {for(const member of path.slice(index.get(current)))cyclic.add(member);break;}
            index.set(current,path.length);path.push(current);current=result[current].targetId;
        }
    }
    for(const id of cyclic)delete result[id];
    return result;
}

module.exports={snapOverlayBounds,applyOverlayDock,normalizeOverlayDocks};
