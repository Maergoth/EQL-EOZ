import { loggedLocationToWorld } from './coordinate-system.js';
import { isOwnedPetName } from './generated-pets.js';
import {LogContext} from './log-context.js';
import { createCombatants, accumulateCombatants, combatantSnapshot, combatantRecipient } from './combatants.js';
import { rankedChatItemMentions } from './chat-item-mentions.js';
import { DotCastOrder } from './dot-cast-order.js';

const LINE_RE = /^\[([^\]]+)\]\s*(.*)$/;
const AUTO_ATTACK_VERBS = new Set(['hit', 'slash', 'crush', 'pierce', 'punch', 'claw', 'bite', 'maul']);
// A one-token target fixes the attacker/verb boundary even for multiword NPC
// names. Exact own-target validation follows; combat verbs such as cleaves,
// slices, stings and smashes need no outgoing swing-eligibility whitelist.
const INCOMING_MELEE_RE = /^(.+) ([a-z]{3,24}) (?:on )?(\S+) for ([\d,]+) points? of damage\.?(?:\s*\([^)]+\))?$/i;
// Explicit verbs fix the boundary between two potentially multiword names.
const NEARBY_MELEE_RE = /^(.+?) (hits?|slashes?|crush(?:es)?|pierces?|punch(?:es)?|claws?|bites?|mauls?|kicks?|bashes?|backstabs?|strikes?|smashes?|cleaves?|slices?|stings?|shoots?|reaves?|smites?|frenz(?:y|ies)) (?:on )?(.+?) for ([\d,]+) points? of damage\.?(?:\s*\([^)]+\))?$/i;
const NEARBY_MELEE_LAST_RE = new RegExp(NEARBY_MELEE_RE.source.replace('^(.+?)','^(.+)'),'i');
const NEARBY_SPELL_RE = /^(.+?) hits? (.+?) for ([\d,]+) points? of ([\w-]+) damage by (.+?)\.(?:\s*\([^)]+\))?$/i;
const NEARBY_SPELL_LAST_RE = new RegExp(NEARBY_SPELL_RE.source.replace('^(.+?)','^(.+)'),'i');
// "over time" describes this logged tick, not part of the recipient's name.
// Observed critical heals omit the period and end with (Critical).
const NEARBY_HEAL_RE = /^(.+?) healed (.+?)( over time)? for ([\d,]+)(?: \([\d,]+\))? hit points? by (.+?)(?:\.(?:\s*\(Critical\))?|\s+\(Critical\))$/i;
const NEARBY_HEAL_LAST_RE = new RegExp(NEARBY_HEAL_RE.source.replace('^(.+?)','^(.+)'),'i');
const BARE_HEAL_RE = /^(.+?) healed (.+?) for ([\d,]+) hit points?\.$/i;
const BARE_HEAL_LAST_RE = new RegExp(BARE_HEAL_RE.source.replace('^(.+?)','^(.+)'),'i');
const combatName = value => {
    const name = normalizeName(value);
    return name.length <= 180 && /^[\p{L}\p{N}][\p{L}\p{N}\s'’`_.-]*$/u.test(name) ? name : '';
};

function parseNumber(text) {
    return Number(String(text || '').replace(/,/g, ''));
}

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function stripLogLinks(text) {
    return String(text || '')
        .replace(/\x12([0-9a-f]{56})([^\x12\r\n]{1,240})\x12/gi, (_match,body,label)=>nativeItemLinkName(body,label)||label)
        .replace(/\\a(?:ITEM|PC)\s+[^:]*:([^\\]*?)\\\/a/gi, '$1')
        .replace(/\\a(?:ITEM|PC)[^\\]*?\\\/a/gi, match => match.replace(/^.*?:/, '').replace(/\\\/a$/i, ''));
}

const safeItemLinkName=value=>{const name=normalizeName(value);return name.length>0&&name.length<=230&&!/[\u0000-\u001f\u007f\\<>\[\]{}|]/.test(name)&&/[\p{L}\p{N}]/u.test(name)?name:null;};
function nativeItemLinkName(body,label){
    // Current EQEmu/RoF2: a 56-character hex body inside 0x12 delimiters.
    // https://github.com/EQEmu/EQEmu/blob/master/common/say_link.cpp
    // Reserved proxy IDs represent quest/say links rather than real items.
    const itemId=parseInt(body.slice(1,6),16);
    return body[0]==='0'&&itemId>0&&itemId<0xfffff&&itemId!==999999?safeItemLinkName(label):null;
}
export function extractItemLinks(text){
    const input=String(text||'').slice(0,16384),found=[],seen=new Set();
    const add=(name,index)=>{if(name)found.push({name,index});};
    for(const match of input.matchAll(/\\aITEM\s+(-?\d{1,10})(?:\s+-?\d{1,10}){1,8}:([^\\\r\n]{1,240})\\\/a/gi))if(Number(match[1])!==0)add(safeItemLinkName(match[2]),match.index);
    for(const match of input.matchAll(/\x12([0-9a-f]{56})([^\x12\r\n]{1,240})\x12/gi))add(nativeItemLinkName(match[1],match[2]),match.index);
    return found.sort((a,b)=>a.index-b.index).filter(link=>{const key=link.name.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8).map(link=>link.name);
}

function trimSentence(text) {
    return normalizeName(text).replace(/[.!]+$/, '').trim();
}

function parseLootItem(text) {
    let item = trimSentence(text);
    let quantity = 1;
    const quantityMatch = item.match(/^(\d+)\s+(.+)$/);
    if (quantityMatch) {
        quantity = Math.max(1, Number(quantityMatch[1]) || 1);
        item = quantityMatch[2];
    } else {
        // Loot messages supply a grammatical article before the actual name.
        item = item.replace(/^(?:a|an)\s+/i, '');
    }
    return { item: normalizeName(item), quantity };
}

function isCurrencyLoot(item) {
    return /^(?:\d+\s+)?(?:platinum|gold|silver|copper)\b/i.test(item) &&
        !/\b(?:robe|ring|belt|sword|staff|shield|boots|gloves|key|rune)\b/i.test(item);
}

export class EQLogParser {
    constructor(options={}) {
        this.logContext=new LogContext(options);
        this.character = '';
        this.sourceIdentity='';
        // Only /who identity rows establish other player names. A nearby spell
        // cast alone cannot identify an actor as either a player or a monster.
        this.knownPlayerNames = new Set();
        this.level = 0;
        this.classes = [];
        this.zone = '';
        this.zoneShortName = '';
        this.location = null;
        this.observed = new Map();
        this.totalDamage = 0;
        this.totalHealing = 0;
        this.totalRuneCapacity = 0;
        this.totalTaken = 0;
        this.totalTakenHits = 0;
        this.takenStartedAt = null;
        this.lastTakenAt = null;
        this.totalLoot = 0;
        this.totalOwnKills = 0;
        this.totalAaGained = 0;
        this.combatants = createCombatants();
        this.sessionStartedAt = null;
        this.sessionNumber = 1;
        this.lastCombatAt = null;
        this.currentFight = null;
        this.encounterGapSeconds = 15;
        this.dotCasts = new DotCastOrder();
        this.combatEvents = [];
        this.combatEventsDropped = false;
        this.encounterHistoryLimited = false;
        this.encounters = [];
        this.activeEncounters = new Set();
        this.nextEncounterId = 1;
        this.sourceEncounters = new WeakSet();
        this.currentSourceEvents = new WeakSet();
        this.eventZones = new WeakMap();
        this.eventSources = new WeakMap();
        this.eventVisits = new WeakMap();
        this.sourceContextId = 1;
        this.killCounts = new Map();
        this.lootCounts = new Map();
        this.lootLog = [];
        this.lastKill = null;
        this.recentEvents = [];
        this.currentLineAt = null;
    }

    resetSourceContext() {
        this.dotCasts.reset();
        this.zone = '';this.zoneShortName = '';this.location = null;
        this.knownPlayerNames.clear();
        this.lastKill = null;this.currentFight = null;this.currentLineAt = null;
        this.sourceEncounters = new WeakSet();this.currentSourceEvents = new WeakSet();
        this.sourceContextId++; this.activeEncounters.clear();
        this.logContext.reset();
    }

    setLogIdentityPack(pack){this.logContext.getPack=()=>pack||{};}
    logContextSnapshot(){return this.logContext.snapshot();}
    seedLogContext(seed){if(!this.logContext.restore(seed))return false;this.zone=this.logContext.zone;this.zoneShortName=this.logContext.shortName;this.location=null;this.lastKill=null;return true;}

    startNewSession(at = Date.now()) {
        this.dotCasts.reset();
        this.sessionNumber++;
        this.totalDamage = 0;
        this.totalHealing = 0;
        this.totalRuneCapacity = 0;
        this.totalTaken = 0;
        this.totalTakenHits = 0;
        this.takenStartedAt = null;
        this.lastTakenAt = null;
        this.totalLoot = 0;
        this.totalOwnKills = 0;
        this.totalAaGained = 0;
        this.combatants = createCombatants();
        this.sessionStartedAt = Number.isFinite(at) ? at : Date.now();
        this.lastCombatAt = null;
        this.currentFight = null;
        this.combatEvents = [];
        this.combatEventsDropped = false;
        this.encounterHistoryLimited = false;
        this.encounters = [];
        this.activeEncounters.clear();
        this.killCounts.clear();
        this.lootCounts.clear();
        this.lootLog = [];
        this.lastKill = null;
        this.recentEvents = [];
        this.currentLineAt = null;
        // Retain discovered identities/levels for Intel, but their activity is
        // part of the parse session that just ended.
        for (const npc of this.observed.values()) {
            npc.damageDone = 0;
            delete npc.killed;
        }
        return this.sessionNumber;
    }

    suspendCombat(){this.activeEncounters.clear();this.dotCasts.reset();}

    setEncounterGapSeconds(value) {
        const seconds = Math.max(3, Math.min(300, Math.round(Number(value) || 15)));
        if (seconds === this.encounterGapSeconds) return;
        this.encounterGapSeconds = seconds;
        this.dotCasts.reset();
        this.rebuildEncounters();
    }

    setCharacterFromFilename(path) {
        const source=String(path||'');if(this.sourceIdentity&&this.sourceIdentity!==source){this.resetSourceContext();this.character='';this.level=0;this.classes=[];}this.sourceIdentity=source;
        const name = String(path || '').split(/[\\/]/).pop() || '';
        const match = name.match(/^eqlog_([^_]+)_/i);
        if (match) { this.character = match[1]; this.knownPlayerNames.add(this.character.toLowerCase()); }
    }

    rememberEvent(event) {
        event.at = event.at || this.currentLineAt || Date.now();
        this.recentEvents.unshift(event);
        if (this.recentEvents.length > 80) this.recentEvents.length = 80;
        return event;
    }

    encounterTarget(event) {
        return normalizeName(event.encounterTarget || event.victim || event.target || '');
    }

    appendEncounterEvent(event) {
        const gapMs = this.encounterGapSeconds * 1000, currentSource = this.currentSourceEvents.has(event), eventZone = this.eventZones.get(event) ?? this.zone;
        const sourceContextId = this.eventSources.get(event) ?? this.sourceContextId, zoneVisit = this.eventVisits.get(event) ?? this.logContext.visit;
        const names = this.combatantNames(event).map(name => name.toLowerCase());
        // Concurrent nearby fights belong to their own connected group. Own
        // damage/taken/heals remain connected through the selected character.
        let encounter;
        for (const candidate of this.activeEncounters) {
            if (event.at - candidate.lastAt > gapMs || candidate.sourceContextId !== sourceContextId || candidate.zoneVisit !== zoneVisit) { this.activeEncounters.delete(candidate); continue; }
            if (candidate.zone === eventZone && names.some(name => candidate.actorNames.has(name)) && (!encounter || candidate.lastAt >= encounter.lastAt)) encounter = candidate;
        }
        if (!encounter || this.sourceEncounters.has(encounter) !== currentSource || encounter.zone !== eventZone || event.at - encounter.lastAt > gapMs) {
            encounter = {
                id: `session-${this.sessionNumber}-encounter-${this.nextEncounterId++}`,
                zone: eventZone,
                sourceContextId,
                zoneVisit,
                startAt: event.at,
                lastAt: event.at,
                firstTarget: '',
                damage: 0,
                healing: 0,
                taken: 0,
                takenHits: 0,
                events: [],
                actorNames:new Set(),
                combatantState:createCombatants()
            };
            this.encounters.push(encounter);
            this.activeEncounters.add(encounter);
            if(currentSource)this.sourceEncounters.add(encounter);
        }

        const target = this.encounterTarget(event);
        if (!encounter.firstTarget && target && ['damage', 'taken', 'kill', 'combatant-damage'].includes(event.type)) {
            encounter.firstTarget = target;
        }
        encounter.lastAt = Math.max(encounter.lastAt, event.at);
        encounter.damage += event.type === 'damage' ? Number(event.amount || 0) : 0;
        encounter.healing += event.type === 'heal' ? Number(event.amount || 0) : 0;
        encounter.taken += event.type === 'taken' ? Number(event.amount || 0) : 0;
        encounter.takenHits += event.type === 'taken' ? 1 : 0;
        encounter.events.push(event);
        for (const name of names) encounter.actorNames.add(name);
        accumulateCombatants(encounter.combatantState, event, event.character || this.character);
    }

    combatantNames(event) {
        const self = event.character || this.character || 'You';
        const resolve = name => this.isPlayerTarget(name) ? self : normalizeName(name);
        if (event.type === 'damage') return [self,resolve(event.victim)];
        if (event.type === 'taken') return event.attackerKnown === false ? [self] : [self,resolve(event.attacker)];
        if (event.type === 'heal') return [self,combatantRecipient(self,event.target,self)];
        if (event.type === 'combatant-damage' || event.type === 'combatant-heal') return [...(event.actorKnown === false ? [] : [resolve(event.actor)]),combatantRecipient(resolve(event.actor),event.target,self)];
        return [self,resolve(event.victim || event.target)];
    }

    rememberCombatEvent(event) {
        event.character = this.character || 'You';
        if(event.kind==='dot'&&!event.actorAttribution){
            if(event.type==='damage')this.dotCasts.named(event.character,event.victim,event.source,this.dotContext());
            else if(event.type==='taken'&&event.attackerKnown!==false)this.dotCasts.named(event.attacker,event.target,event.source,this.dotContext());
            else if(event.type==='combatant-damage'&&event.actorKnown!==false)this.dotCasts.named(event.actor,event.target,event.source,this.dotContext());
        }
        const saved = this.rememberEvent(event);
        this.currentSourceEvents.add(saved);this.eventZones.set(saved,this.zone);
        this.eventSources.set(saved,this.sourceContextId);this.eventVisits.set(saved,this.logContext.visit);
        this.combatEvents.push(saved);
        if (this.combatEvents.length > 5000) { this.combatEvents.shift(); this.combatEventsDropped = true; }
        this.appendEncounterEvent(saved);
        accumulateCombatants(this.combatants, saved, saved.character);
        return saved;
    }

    rebuildEncounters() {
        this.encounterHistoryLimited ||= this.combatEventsDropped;
        this.encounters = [];
        this.activeEncounters.clear();
        this.nextEncounterId = 1;
        for (const event of this.combatEvents) this.appendEncounterEvent(event);
    }

    observationKey(zone, name) {
        return `${normalizeName(zone).toLowerCase()}|${normalizeName(name).toLowerCase()}`;
    }

    noteKill(victim, { addToEncounter = true } = {}) {
        victim = normalizeName(victim);
        this.dotCasts.targetDeath(this.isPlayerTarget(victim)?this.character||'You':victim,this.dotContext());
        const at = this.currentLineAt || Date.now();
        const key = this.observationKey(this.zone, victim);
        this.killCounts.set(key, (this.killCounts.get(key) || 0) + 1);
        if (addToEncounter) this.totalOwnKills += 1;
        this.lastKill = { name: victim, zone: this.zone, at };
        this.rememberNpc(victim, { killed: true });
        const targetEvidence={...(this.isPlayerTarget(victim)||this.knownPlayerNames.has(victim.toLowerCase())?{victimIsPlayer:true}:{}),...(isOwnedPetName(victim)?{isPet:true}:{})};
        const considerLevel=this.logContext.levelFor(victim,at);if(considerLevel){targetEvidence.considerLevel=considerLevel;targetEvidence.zoneVisit=this.logContext.visit;}
        if (addToEncounter) {
            return this.rememberCombatEvent({ type: 'kill', victim, encounterTarget: victim, ...targetEvidence });
        }
        return this.rememberEvent({ type: 'kill', victim, ...targetEvidence });
    }

    noteLoot(itemName, sourceName = '') {
        const at = this.currentLineAt || Date.now();
        const parsedItem = parseLootItem(itemName);
        const item = parsedItem.item;
        let source = trimSentence(sourceName)
            .replace(/^(?:the\s+)?corpse of\s+/i, '')
            .replace(/'s corpse(?:\s+(?:and|to)\b.*)?$/i, '')
            .replace(/\s+(?:and|to)\b.*$/i, '')
            .trim();
        const corpseSource = /^(?:the\s+)?corpse of\s+/i.test(normalizeName(sourceName)) || /'s corpse(?:\s|$)/i.test(normalizeName(sourceName));
        let sourceEvidence = { kind:source ? corpseSource ? 'explicit-corpse':'explicit-source':'unknown' };

        if (!source && this.lastKill && this.lastKill.zone === this.zone && at >= this.lastKill.at && at - this.lastKill.at <= Math.max(60, this.encounterGapSeconds * 2) * 1000) {
            source = this.lastKill.name;
            sourceEvidence = { kind:'recent-kill', timeGapMs:at-this.lastKill.at, sourceAt:this.lastKill.at };
        }
        if (!source) {
            const encounter = this.encounters[this.encounters.length - 1];
            if (encounter && this.sourceEncounters.has(encounter) && encounter.zone === this.zone && at >= encounter.lastAt && at - encounter.lastAt <= this.encounterGapSeconds * 1000) {
                source = encounter.firstTarget;
                sourceEvidence = { kind:'encounter-target', timeGapMs:at-encounter.lastAt, sourceAt:encounter.lastAt };
            }
        }
        if (!item || isCurrencyLoot(item)) return null;
        if(this.recordDrops===false)return {type:'loot',item,quantity:parsedItem.quantity,source:source||'Unknown',sourceEvidence,zone:this.zone,...(isOwnedPetName(source)?{sourceIsPet:true}:{})};
        this.totalLoot += parsedItem.quantity;

        const sourceKey = this.observationKey(this.zone, source || 'Unknown');
        const lootKey = `${sourceKey}|${item.toLowerCase()}`;
        this.lootCounts.set(lootKey, (this.lootCounts.get(lootKey) || 0) + 1);
        const event = this.rememberEvent({
            type: 'loot',
            item,
            quantity: parsedItem.quantity,
            source: source || 'Unknown',
            ...(isOwnedPetName(source)?{sourceIsPet:true}:{}),
            sourceEvidence,
            sourceConfidence:sourceEvidence.kind === 'explicit-corpse' ? 1 : sourceEvidence.kind === 'unknown' ? 0 : sourceEvidence.kind === 'explicit-source' ? 0.5 : 0.25,
            zone: this.zone,
            sourceKey,
            lootKey
        });
        this.lootLog.unshift(event);
        if (this.lootLog.length > 1000) this.lootLog.length = 1000;
        return event;
    }

    rememberNpc(name, fields = {}) {
        name = normalizeName(name);
        if (!name || isOwnedPetName(name)) return;
        const key = `${this.zone.toLowerCase()}|${name.toLowerCase()}`;
        const previous = this.observed.get(key) || {
            name,
            zone: this.zone,
            level: 0,
            firstSeen: this.currentLineAt || Date.now(),
            lastSeen: this.currentLineAt || Date.now(),
            damageDone: 0
        };
        Object.assign(previous, fields);
        previous.lastSeen = this.currentLineAt || Date.now();
        this.observed.set(key, previous);
    }

    noteDamage(victim, amount, source, kind, {observeNpc=true,attribution=null}={}) {
        const n = parseNumber(amount);
        if (!Number.isFinite(n) || n < 0) return null;
        const now = this.currentLineAt || Date.now();
        if (!this.sessionStartedAt) this.sessionStartedAt = now;
        this.lastCombatAt = now;
        this.totalDamage += n;
        victim = normalizeName(victim);
        if(observeNpc)this.rememberNpc(victim, {
            damageDone: (this.observed.get(`${this.zone.toLowerCase()}|${victim.toLowerCase()}`)?.damageDone || 0) + n
        });
        if (!this.currentFight || this.currentFight.victim !== victim || now - this.currentFight.lastAt > 15000) {
            this.currentFight = { victim, damage: 0, startedAt: now, lastAt: now };
        }
        this.currentFight.damage += n;
        this.currentFight.lastAt = now;
        const event = { type: 'damage', victim, encounterTarget: victim, amount: n, source: source || kind, kind,...attribution };
        if (kind === 'melee') {
            event.skill = normalizeName(source).toLowerCase();
            event.swingEligible = AUTO_ATTACK_VERBS.has(event.skill);
        }
        return this.rememberCombatEvent(event);
    }

    isPlayerTarget(name) {
        const target = normalizeName(name).toLowerCase();
        return target === 'you' || Boolean(this.character && target === this.character.toLowerCase());
    }

    noteOtherCombat(actor, target, amount, source, kind, healing = false, { actorKnown = true, attribution = null } = {}) {
        actor = combatName(actor); target = combatName(target);
        const n = parseNumber(amount);
        if (!actor || !target || !Number.isFinite(n) || n < 0) return null;
        target = combatantRecipient(actorKnown ? this.isPlayerTarget(actor) ? this.character || 'You' : actor : '',target,this.character || 'You');
        if (!target) return null;
        if (this.isPlayerTarget(actor)) {
            if (!healing) return this.noteDamage(target, n, source, kind,{observeNpc:!attribution,attribution});
            this.totalHealing += n;
            return this.rememberCombatEvent({type:'heal', target, amount:n, source, kind});
        }
        if (!healing && this.isPlayerTarget(target)) return this.noteTaken(actorKnown ? actor : '',n,source,kind,target,{attribution});
        return this.rememberCombatEvent({type:healing ? 'combatant-heal' : 'combatant-damage', actor,
            target:this.isPlayerTarget(target) ? this.character || 'You' : target, amount:n, source, kind,
            ...(!actorKnown ? {actorKnown:false} : {}),...attribution,
            encounterTarget:healing ? '' : actorKnown ? `${actor} → ${target}` : target});
    }

    namedCombatMatch(first, last, targetIndex) {
        if (!first || !last || first[1] === last[1] && first[targetIndex] === last[targetIndex]) return first;
        // Names can themselves contain "hit" or another combat verb. Prefer
        // a split supported by an already established exact name, otherwise
        // retain uncertainty instead of inventing two new actor names.
        const known = value => this.isPlayerTarget(value) || this.knownPlayerNames.has(normalizeName(value).toLowerCase()) ||
            this.combatants.rows.some(row => row.name.toLowerCase() === normalizeName(value).toLowerCase());
        const score = match => Number(known(match[1])) + Number(known(match[targetIndex]));
        return score(first) > score(last) ? first : score(last) > score(first) ? last : null;
    }

    dotContext(){return{context:JSON.stringify([this.sourceContextId,this.logContext.visit,this.zone]),at:this.currentLineAt||Date.now(),gapMs:this.encounterGapSeconds*1000};}

    noteUnnamedDot(target,amount,ability){
        target=combatName(target);if(!target)return null;
        if(this.isPlayerTarget(target))target=this.character||'You';
        const inferred=this.dotCasts.resolve(target,ability,this.dotContext());
        const attribution=inferred?Object.fromEntries(Object.entries(inferred).filter(([name])=>name!=='actor')):null;
        return this.noteOtherCombat(inferred?.actor||'Unknown attacker',target,amount,ability,'dot',false,{actorKnown:Boolean(inferred),attribution});
    }

    noteTaken(attacker, amount, source, kind, target = 'You', {attribution=null}={}) {
        const n = parseNumber(amount);
        if (!this.isPlayerTarget(target) || !Number.isFinite(n) || n < 0) return null;
        const at = this.currentLineAt || Date.now();
        if (!this.takenStartedAt) this.takenStartedAt = at;
        this.lastTakenAt = at;
        this.totalTaken += n;
        this.totalTakenHits += 1;
        const attackerKnown = Boolean(normalizeName(attacker));
        attacker = normalizeName(attacker) || 'Unknown attacker';
        // Incoming activity joins the encounter, but never touches outgoing
        // damage/currentFight/session-DPS clocks or NPC damageDone observations.
        return this.rememberCombatEvent({ type:'taken', attacker, target:this.character || 'You',
            encounterTarget:attacker, amount:n, source:normalizeName(source) || 'Unknown ability', kind,
            ...(!attackerKnown ? {attackerKnown:false} : {}),...attribution });
    }

    parse(rawLine, { recordSession = true, recordCombat = true, recordDrops = true } = {}) {
        this.recordDrops=recordDrops;
        const raw = String(rawLine || '').replace(/\r$/, '');
        const m = raw.match(LINE_RE);
        const parsedAt = m ? Date.parse(m[1]) : NaN;
        this.currentLineAt = Number.isFinite(parsedAt) ? parsedAt : Date.now();
        const body=(m ? m[2] : raw).trim(),itemLinks=extractItemLinks(body);
        const text = stripLogLinks(body).replace(/^--(.*?)--$/, '$1');
        if (!text) return null;

        let x;

        x = text.match(/^You have entered (.+?)\.?$/i);
        if (x) {
            this.logContext.anchor(normalizeName(x[1]),{at:this.currentLineAt,entered:true});
            this.zone = this.logContext.zone;
            this.zoneShortName = '';
            this.location=null;this.lastKill=null;
            return this.rememberEvent({ type: 'zone', zone: this.zone });
        }

        // Legends /who self line:
        // [26 MNK/SHM/BER] Maergoth (Iksar) <Guild> ZONE: The Castle of Mistmoore 1595 (mistmoore)
        // The parenthesized short name is stable while the display name may
        // contain an instance number. Only the current character's row is an
        // authoritative zone signal when /who returns multiple players.
        x = text.match(/^\[(\d+)\s+([A-Z]{3}(?:\/[A-Z]{3})*)\]\s+([^\s]+)\s+\([^)]+\).*?\bZONE:\s*(.*?)\s+\(([^()]+)\)\s*$/i);
        if (x) {
            this.knownPlayerNames.add(normalizeName(x[3]).toLowerCase());
            if (this.knownPlayerNames.size>200) this.knownPlayerNames.delete(this.knownPlayerNames.values().next().value);
        }
        if (x && this.character && x[3].toLowerCase() === this.character.toLowerCase()) {
            this.level = Number(x[1]);
            this.classes = x[2].toUpperCase().split('/');
            const displayZone = normalizeName(x[4]).replace(/\s+\d+$/, '').trim();
            const zoneShortName = normalizeName(x[5]).toLowerCase();
            const instanceId=normalizeName(x[4]).match(/\s+(\d+)$/)?.[1]||'',previousShort=this.zoneShortName;
            const changed=this.logContext.anchor(displayZone,{shortName:zoneShortName,instanceId,at:this.currentLineAt});
            if (displayZone && (changed||zoneShortName !== previousShort)) {
                this.zone = this.logContext.zone;
                this.zoneShortName = zoneShortName;
                if(changed){this.location=null;this.lastKill=null;}
                return this.rememberEvent({
                    type:'zone',
                    zone:this.zone,
                    zoneShortName,
                    source:'who',
                    level:this.level,
                    classes:this.classes.slice(),
                    character:this.character
                });
            }
            return this.rememberEvent({ type: 'profile', level: this.level, classes: this.classes.slice(), character: this.character });
        }

        // Common level-up wording. Kept permissive because Legends wording can vary.
        x = text.match(/(?:welcome to|you (?:have )?reached)\s+level\s+(\d+)/i);
        if (x) {
            this.level = Number(x[1]);
            return this.rememberEvent({ type: 'profile', level: this.level, classes: this.classes.slice(), character: this.character });
        }

        // Common EQ /location output variants. We intentionally do not send /loc;
        // this only consumes a line the game already wrote.
        const locationPatterns = [
            /^(?:Your Location is|Your location is)\s*[: ]\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,?\s*(?:Heading|H)\s*[:=]?\s*(-?\d+(?:\.\d+)?))?/i,
            /^(?:LOC|Location)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*[, ]+\s*(-?\d+(?:\.\d+)?)\s*[, ]+\s*(-?\d+(?:\.\d+)?)(?:\s*[, ]+\s*(?:Heading|H)\s*[:=]?\s*(-?\d+(?:\.\d+)?))?/i,
            /^You are at\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i
        ];
        for (const pattern of locationPatterns) {
            x = text.match(pattern);
            if (x) {
                // The client log writes /loc as Y, X, Z. Normalize only to
                // world X, Y, Z here. Client map files use a different,
                // signed coordinate basis and are converted by the viewer.
                const logY = Number(x[1]);
                const logX = Number(x[2]);
                this.location = loggedLocationToWorld(logY, logX, x[3], x[4]);
                this.location.at = this.currentLineAt || Date.now();
                return this.rememberEvent({ type: 'location', location: { ...this.location } });
            }
        }

        // Consider lines from Legends. Named variants may insert a descriptor:
        // "Soldier of V Zher - a rare creature - scowls at you ... (Lvl: 26)"
        x = text.match(/^(.+?)(?:\s+-\s+[^-]+?\s+-)?\s+(?:regards you|judges you|glares at you|scowls at you)\b.*?\(Lvl:\s*(\d+)\)\s*$/i);
        if (x) {
            const name = normalizeName(x[1]);
            const level = Number(x[2]);
            this.rememberNpc(name, { level });
            this.logContext.consider(name,level,this.currentLineAt);
            return this.rememberEvent({ type: 'consider', target: { name, level, at: this.currentLineAt || Date.now() } });
        }

        // A manually split session follows the existing live cursor. An initial
        // tail or a replaced/truncated log may restore profile/map context, but
        // must never repopulate the new parse with historical combat or loot.
        if (!recordSession) return null;

        if(recordCombat){
        // Count earned points, never AA experience, bank balances or spends.
        // EQ's GAIN_ABILITY_POINT string has an optional bank-balance suffix.
        x = text.match(/^You have gained an ability point!(?:\s*You now have [\d,]+ ability point(?:s|\(s\))?\.)?$/i);
        if (x) { this.totalAaGained++; return this.rememberEvent({type:'aa-gain', amount:1}); }

        // Incoming Legends direct spells, DoTs and melee. Only YOU or the
        // currently selected character is an authoritative player target;
        // nearby players, pets, grants of rune capacity and misses are excluded.
        x = text.match(/^(.+) hits? (\S+) for ([\d,]+) points? of ([\w-]+) damage by (.+?)\.(?:\s*\([^)]+\))?$/i);
        if (x && this.isPlayerTarget(x[2])) return this.noteTaken(x[1], x[3], x[5], 'spell', x[2]);

        x = text.match(/^(\S+) ha(?:s|ve) taken ([\d,]+) damage from (.+?) by (.+?)\.(?:\s*\([^)]+\))?$/i);
        if (x && this.isPlayerTarget(x[1])) return this.noteTaken(x[4], x[2], x[3], 'dot', x[1]);

        x = text.match(INCOMING_MELEE_RE);
        if (x && this.isPlayerTarget(x[3])) {
            return this.noteTaken(x[1], x[4], x[2].toLowerCase(), 'melee', x[3]);
        }

        // Classic non-melee output identifies the player, but supplies neither
        // a caster nor a spell. Retain that uncertainty rather than infer one.
        x = text.match(/^You were hit by non-melee for ([\d,]+) damage\.(?:\s*\([^)]+\))?$/i);
        if (x) return this.noteTaken('', x[1], 'Unknown non-melee', 'spell');

        // Outgoing spell direct damage.
        x = text.match(/^You hit (.+?) for ([\d,]+) points? of (\w+) damage by (.+?)\.(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[1], x[2], x[4], 'spell');

        // DoT tick.
        x = text.match(/^(.+?) has taken ([\d,]+) damage from your (.+?)\.(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[1], x[2], x[3], 'dot');

        // Outgoing melee / combat art.
        x = text.match(/^You (\w+) (?:on )?(.+?) for ([\d,]+) points? of damage\.?(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[2], x[3], x[1], 'melee');

        // Misses inform the observed swing estimate without changing historical
        // damage totals, combat-event grouping or observed NPC damage.
        x = text.match(/^You try to (\w+) (.+?), but miss[.!]*$/i);
        if (x) return this.rememberEvent({ type:'melee-miss', victim:normalizeName(x[2]), skill:x[1].toLowerCase(), swingEligible:AUTO_ATTACK_VERBS.has(x[1].toLowerCase()) });

        // Other failed abilities still contribute no damage or combat events.
        if (/^You try to /i.test(text)) {
            return null;
        }

        x = text.match(/^You begin casting (.+?)[.!]*$/i);
        if (x) {const spell=trimSentence(x[1]);this.dotCasts.start(this.character||'You',spell,this.dotContext());return this.rememberEvent({ type:'cast-begin', spell });}

        x=text.match(/^(.+?) begins casting (.+?)\.$/i);
        if(x&&combatName(x[1])){const actor=this.isPlayerTarget(x[1])?this.character||'You':combatName(x[1]),spell=trimSentence(x[2]);this.dotCasts.start(actor,spell,this.dotContext());return this.rememberEvent({type:'combatant-cast-begin',actor,spell});}

        if (/^Your (?:casting|spell) (?:is|was|has been) interrupted[.!]*$/i.test(text)) {
            this.dotCasts.fail(this.character||'You','',this.dotContext());
            return this.rememberEvent({ type:'cast-interrupt' });
        }

        x=text.match(/^(.+?) spell is interrupted\.$/i)||text.match(/^(.+?) can't cast spells while stunned!$/i);
        if(x&&combatName(x[1])){const actor=this.isPlayerTarget(x[1])?this.character||'You':combatName(x[1]);this.dotCasts.fail(actor,'',this.dotContext());return this.rememberEvent({type:this.isPlayerTarget(actor)?'cast-interrupt':'combatant-cast-failed',actor});}
        x=text.match(/^(.+?) tries to cast a spell on (.+?), but (.+?) are protected\.$/i);
        if(x&&combatName(x[1])&&combatName(x[2])&&normalizeName(x[2]).toLowerCase()===normalizeName(x[3]).toLowerCase()){const actor=this.isPlayerTarget(x[1])?this.character||'You':combatName(x[1]);this.dotCasts.fail(actor,'',this.dotContext());return this.rememberEvent({type:this.isPlayerTarget(actor)?'cast-interrupt':'combatant-cast-failed',actor});}
        x=text.match(/^(.+?) resisted your (.+?)\.$/i);
        if(x&&combatName(x[1])){this.dotCasts.fail(this.character||'You',trimSentence(x[2]),this.dotContext());return this.rememberEvent({type:'cast-interrupt'});}
        if(/^Your target is (?:too far away|out of range), get closer!$|^You cannot see your target\.$/i.test(text)){this.dotCasts.fail(this.character||'You','',this.dotContext());return this.rememberEvent({type:'cast-interrupt'});}
        x=text.match(/^Your (.+?) spell has worn off of (.+?)\.$/i);
        if(x&&combatName(x[2])){const target=this.isPlayerTarget(x[2])?this.character||'You':combatName(x[2]);this.dotCasts.ended(this.character||'You',target,trimSentence(x[1]),this.dotContext());return this.rememberEvent({type:'dot-wearoff'});}
        if(/^You have been slain by .+?!$|^You died\.$/i.test(text)){this.dotCasts.targetDeath(this.character||'You',this.dotContext());return null;}

        // Nearby actions retain their logged actors and recipients. The own
        // paths above run first, so a single line never earns damage twice.
        x = this.namedCombatMatch(text.match(NEARBY_SPELL_RE),text.match(NEARBY_SPELL_LAST_RE),2);
        if (x) return this.noteOtherCombat(x[1],x[2],x[3],x[5],'spell');
        x = text.match(/^(.+?) ha(?:s|ve) taken ([\d,]+) damage from (.+?) by (.+?)\.(?:\s*\([^)]+\))?$/i);
        if (x) return this.noteOtherCombat(x[4],x[1],x[2],x[3],'dot');
        // Caster-omitting DoTs may use the user-selected cast-order assumption.
        // Without an unambiguous bounded pairing, Unknown cannot join fights.
        x = text.match(/^You have taken ([\d,]+) damage from (.+?)\.$/i);
        if (x) return this.noteUnnamedDot('You',x[1],x[2]);
        x = text.match(/^(.+?) has taken ([\d,]+) damage by (.+?)\.$/i);
        if (x) return this.noteUnnamedDot(x[1],x[2],x[3]);
        // The possessive names the shield wearer. It does not name the
        // original buff caster or authorize merging a pet with its owner.
        x = text.match(/^(.+?) (?:is|are) (burned|pierced|tormented) by (.+)['’]s (flames|thorns|frost) for ([\d,]+) points? of non-melee damage[.!]$/i);
        if (x && ({burned:'flames',pierced:'thorns',tormented:'frost'})[x[2].toLowerCase()] === x[4].toLowerCase()) return this.noteOtherCombat(x[3],x[1],x[5],`Damage shield: ${x[4].toLowerCase()}`,'damage-shield');
        x = this.namedCombatMatch(text.match(NEARBY_MELEE_RE),text.match(NEARBY_MELEE_LAST_RE),3);
        if (x) return this.noteOtherCombat(x[1],x[3],x[4],x[2].toLowerCase(),'melee');
        x = this.namedCombatMatch(text.match(NEARBY_HEAL_RE),text.match(NEARBY_HEAL_LAST_RE),2);
        if (x) return this.noteOtherCombat(x[1],x[2],x[4],x[5],x[3] ? 'hot' : 'spell',true);
        x = this.namedCombatMatch(text.match(BARE_HEAL_RE),text.match(BARE_HEAL_LAST_RE),2);
        if (x && !/ over time$/i.test(x[2])) return this.noteOtherCombat(x[1],x[2],x[3],'Unknown ability','heal',true);

        x = text.match(/^You gain a rune for ([\d,]+) points? of absorption\.$/i);
        if (x) {
            const n = parseNumber(x[1]);
            this.totalRuneCapacity += n;
            return this.rememberCombatEvent({ type: 'rune', amount: n, source:'Rune capacity granted' });
        }

        }
        x = text.match(/^You have slain (.+?)!/i);
        if (x) return this.noteKill(x[1],{addToEncounter:recordCombat});

        x = text.match(/^(.+?) has been slain by (.+?)!/i);
        if (x) {
            const killedByPlayer = this.character && x[2].toLowerCase() === this.character.toLowerCase();
            // Count nearby group/raid kills for observed drop-rate denominators,
            // but do not create a player combat encounter from someone else's kill.
            return this.noteKill(x[1], { addToEncounter: recordCombat&&Boolean(killedByPlayer) });
        }

        // Legends/EQ clients have emitted several loot wordings over time.
        // Explicit corpse/source text wins; otherwise associate the loot with
        // the most recent kill in the same log window.
        x = text.match(/^You (?:have )?(?:loot|looted|receive|received|acquire|acquired)\s+(.+?)\s+from\s+(.+?)[.!]*$/i);
        if (x) return this.noteLoot(x[1], x[2]);

        x = text.match(/^You (?:have )?(?:loot|looted|receive|received|acquire|acquired)\s+(.+?)[.!]*$/i);
        if (x) return this.noteLoot(x[1]);

        x = text.match(/^(.+?) (?:has )?(?:looted|loots)\s+(.+?)(?:\s+from\s+(.+?))?[.!]*$/i);
        if (x && this.character && normalizeName(x[1]).toLowerCase() === this.character.toLowerCase()) {
            return this.noteLoot(x[2], x[3] || '');
        }

        if(itemLinks.length)return this.rememberEvent({type:'item-links',items:itemLinks,evidence:{text:raw.slice(0,6000)}});
        const itemMentions=rankedChatItemMentions(body,this.logContext.getPack());
        if(itemMentions.length)return this.rememberEvent({type:'item-links',items:itemMentions,itemLinkFormat:'plain-tiered-chat',evidence:{text:raw.slice(0,6000),interpretation:'possible-tiered-item-mention'}});
        return null;
    }

    snapshot({includeCombat=true,includeDrops=true,includeNpcIntel=true}={}) {
        const now = Date.now();
        const sessionSeconds = this.sessionStartedAt && this.lastCombatAt
            ? Math.max(1, (this.lastCombatAt - this.sessionStartedAt) / 1000)
            : 0;
        const takenSeconds = this.takenStartedAt && this.lastTakenAt
            ? Math.max(1, (this.lastTakenAt - this.takenStartedAt) / 1000)
            : 0;
        const combatants = includeCombat?combatantSnapshot(this.combatants, {character:this.character, selfSeconds:sessionSeconds}):{rows:[],seconds:0};
        const encounters = (includeCombat?this.encounters:[]).slice().reverse().map(encounter => {
            const duration = Math.max(1, (encounter.lastAt - encounter.startAt) / 1000);
            return {
                ...Object.fromEntries(Object.entries(encounter).filter(([key]) => !['actorNames','combatantState','sourceContextId','zoneVisit'].includes(key))),
                name: encounter.firstTarget || 'Encounter',
                duration,
                dps: encounter.damage / duration,
                takenPerSecond: encounter.taken / duration,
                active: now - encounter.lastAt <= this.encounterGapSeconds * 1000,
                events: encounter.events.slice(),
                combatants:combatantSnapshot(encounter.combatantState, {seconds:duration}).rows
            };
        });
        const fight = encounters[0] || null;
        const lootLog = (includeDrops?this.lootLog:[]).map(entry => {
            const dropsObserved = this.lootCounts.get(entry.lootKey) || 0;
            const killsObserved = this.killCounts.get(entry.sourceKey) || 0;
            return {
                ...entry,
                dropsObserved,
                killsObserved,
                // This is presented as an observed chance, so multiple copies
                // from one corpse must never produce a nonsensical >100% value.
                estimatedRate: killsObserved ? Math.min(100, (dropsObserved / killsObserved) * 100) : null
            };
        });
        return {
            character: this.character,
            level: this.level,
            classes: this.classes.slice(),
            zone: this.zone,
            zoneShortName: this.zoneShortName,
            location: this.location ? { ...this.location } : null,
            totalDamage: this.totalDamage,
            totalHealing: this.totalHealing,
            totalRuneCapacity: this.totalRuneCapacity,
            totalTaken: this.totalTaken,
            totalTakenHits: this.totalTakenHits,
            takenSeconds,
            sessionTakenPerSecond: takenSeconds ? this.totalTaken / takenSeconds : 0,
            totalKills: Array.from(this.killCounts.values()).reduce((sum, count) => sum + count, 0),
            totalOwnKills: this.totalOwnKills,
            totalAaGained:this.totalAaGained,
            combatants:combatants.rows,
            combatantSeconds:combatants.seconds,
            totalLoot: this.totalLoot,
            encounterCount: this.encounters.length,
            encounterHistoryLimited:this.encounterHistoryLimited,
            sessionSeconds,
            sessionNumber: this.sessionNumber,
            sessionStartedAt: this.sessionStartedAt,
            sessionDps: sessionSeconds ? this.totalDamage / sessionSeconds : 0,
            fight,
            encounters,
            encounterGapSeconds: this.encounterGapSeconds,
            lootLog,
            killCounts: Object.fromEntries(this.killCounts),
            observed: (includeNpcIntel?Array.from(this.observed.values()):[]).sort((a,b) => b.lastSeen - a.lastSeen),
            recentEvents: this.recentEvents.slice()
        };
    }
}
