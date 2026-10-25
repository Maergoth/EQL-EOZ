// User-selected assumption: matching cast starts reach their first unnamed
// DoT ticks in log order. This is correlation, not a confirmed application.
const clean=value=>{const text=String(value||'').trim().replace(/\s+/g,' ');return text.length<=180?text:'';};
const key=value=>clean(value).toLowerCase();
export class DotCastOrder {
    constructor({pendingWindowMs=30000,maxPending=128,maxEffects=256,maxOwners=8}={}) {
        this.pendingWindowMs=pendingWindowMs;this.maxPending=maxPending;this.maxEffects=maxEffects;this.maxOwners=maxOwners;this.reset();
    }
    reset(){this.context='';this.lastAt=null;this.order=0;this.pending=[];this.effects=new Map();this.suppressedUntil=0;}
    prepare({context,at,gapMs}) {
        if(context!==this.context||this.lastAt!==null&&at<this.lastAt){this.reset();this.context=context;}
        this.lastAt=at;
        this.pending=this.pending.filter(cast=>at-cast.at<=this.pendingWindowMs);
        const live=new Set(this.pending.map(cast=>cast.id));
        for(const [id,effect] of this.effects){
            if(at-effect.lastAt>gapMs){this.effects.delete(id);continue;}
            // Expiry is not proof that a competing cast failed. Keep that
            // uncertainty, while discarding historical IDs from the cache.
            for(const blocker of effect.blockers)if(!live.has(blocker)){effect.ambiguous=true;effect.blockers.delete(blocker);}
        }
        if(this.suppressedUntil&&at>this.suppressedUntil){this.pending=[];this.effects.clear();this.suppressedUntil=0;}
        return !this.suppressedUntil;
    }
    suppress(at,gapMs){this.pending=[];this.effects.clear();this.suppressedUntil=at+Math.max(this.pendingWindowMs,gapMs);}
    start(actor,ability,options) {
        if(!this.prepare(options))return;
        actor=clean(actor);ability=key(ability);if(!actor||!ability)return;
        if(this.pending.length>=this.maxPending){this.suppress(options.at,options.gapMs);return;}
        this.pending.push({id:++this.order,actor,ability,at:options.at});
    }
    remove(cast) {
        this.pending=this.pending.filter(value=>value!==cast);
        for(const effect of this.effects.values())effect.blockers.delete(cast.id);
    }
    fail(actor,ability,options) {
        this.prepare(options);const suppliedAbility=ability;actor=key(actor);ability=key(ability);
        if(!actor||suppliedAbility&&!ability)return;
        const cast=this.pending.findLast(value=>key(value.actor)===actor&&(!ability||value.ability===ability));
        if(cast)this.remove(cast);
    }
    effect(target,ability,options) {
        const id=JSON.stringify([key(target),key(ability)]);
        let effect=this.effects.get(id);
        if(!effect){
            if(this.effects.size>=this.maxEffects){this.suppress(options.at,options.gapMs);return null;}
            effect={target:key(target),ability:key(ability),lastAt:options.at,owners:new Map(),blockers:new Set(),ambiguous:false};this.effects.set(id,effect);
        }
        effect.lastAt=options.at;return effect;
    }
    owner(actor,cast,at) {
        return {actor:clean(actor),actorAttribution:cast?'cast-order':'prior-explicit-tick',attributionEvidenceAt:at,
            ...(cast?{attributionCastAt:cast.at,attributionCastOrder:cast.id}:{})};
    }
    named(actor,target,ability,options) {
        if(!this.prepare(options))return;
        if(!key(actor)||!key(target)||!key(ability))return;
        const cast=this.pending.find(value=>key(value.actor)===key(actor)&&value.ability===key(ability));
        if(cast)this.remove(cast);
        const effect=this.effect(target,ability,options);if(!effect)return;
        if(effect.owners.has(key(actor))||effect.owners.size<this.maxOwners)effect.owners.set(key(actor),this.owner(actor,cast,options.at));
        else effect.ambiguous=true;
    }
    resolve(target,ability,options) {
        if(!this.prepare(options))return null;
        if(!key(target)||!key(ability))return null;
        const id=JSON.stringify([key(target),key(ability)]),existing=this.effects.get(id);
        const candidates=this.pending.filter(value=>value.ability===key(ability));
        if(existing){
            existing.lastAt=options.at;
            for(const cast of candidates)if(!existing.owners.has(key(cast.actor)))existing.blockers.add(cast.id);
            if(existing.ambiguous||existing.owners.size!==1||existing.blockers.size)return null;
            let owner=existing.owners.values().next().value;
            const refresh=candidates.find(cast=>key(cast.actor)===key(owner.actor));
            if(refresh){this.remove(refresh);owner=this.owner(refresh.actor,refresh,options.at);existing.owners.set(key(owner.actor),owner);}
            return {...owner};
        }
        const cast=candidates[0];if(!cast)return null;
        this.remove(cast);
        const effect=this.effect(target,ability,options);if(!effect)return null;
        const owner=this.owner(cast.actor,cast,options.at);effect.owners.set(key(cast.actor),owner);return {...owner};
    }
    ended(actor,target,ability,options) {
        this.prepare(options);
        if(!key(actor)||!key(target)||!key(ability))return;
        const id=JSON.stringify([key(target),key(ability)]),effect=this.effects.get(id);
        if(effect){effect.owners.delete(key(actor));if(!effect.owners.size&&!effect.ambiguous&&!effect.blockers.size)this.effects.delete(id);}
    }
    targetDeath(target,options) {
        this.prepare(options);
        if(!key(target))return;
        // Pending starts have no target yet. Do not carry one across a death
        // and bind it to a replacement NPC that happens to share the name.
        this.pending=[];
        for(const [id,effect] of this.effects){
            if(effect.target===key(target)){this.effects.delete(id);continue;}
            if(effect.blockers.size){effect.ambiguous=true;effect.blockers.clear();}
        }
    }
}
