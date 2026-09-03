const LINE_RE = /^\[([^\]]+)\]\s*(.*)$/;

function parseNumber(text) {
    return Number(String(text || '').replace(/,/g, ''));
}

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

function stripLogLinks(text) {
    return String(text || '')
        .replace(/\\a(?:ITEM|PC)\s+[^:]*:([^\\]*?)\\\/a/gi, '$1')
        .replace(/\\a(?:ITEM|PC)[^\\]*?\\\/a/gi, match => match.replace(/^.*?:/, '').replace(/\\\/a$/i, ''));
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
    constructor() {
        this.character = '';
        this.level = 0;
        this.classes = [];
        this.zone = '';
        this.location = null;
        this.observed = new Map();
        this.totalDamage = 0;
        this.totalHealing = 0;
        this.sessionStartedAt = null;
        this.lastCombatAt = null;
        this.currentFight = null;
        this.encounterGapSeconds = 15;
        this.combatEvents = [];
        this.encounters = [];
        this.nextEncounterId = 1;
        this.killCounts = new Map();
        this.lootCounts = new Map();
        this.lootLog = [];
        this.lastKill = null;
        this.recentEvents = [];
        this.currentLineAt = null;
    }

    setEncounterGapSeconds(value) {
        const seconds = Math.max(3, Math.min(300, Math.round(Number(value) || 15)));
        if (seconds === this.encounterGapSeconds) return;
        this.encounterGapSeconds = seconds;
        this.rebuildEncounters();
    }

    setCharacterFromFilename(path) {
        const name = String(path || '').split(/[\\/]/).pop() || '';
        const match = name.match(/^eqlog_([^_]+)_/i);
        if (match) this.character = match[1];
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
        const gapMs = this.encounterGapSeconds * 1000;
        let encounter = this.encounters[this.encounters.length - 1];
        if (!encounter || event.at - encounter.lastAt > gapMs) {
            encounter = {
                id: `encounter-${this.nextEncounterId++}`,
                startAt: event.at,
                lastAt: event.at,
                firstTarget: '',
                damage: 0,
                healing: 0,
                events: []
            };
            this.encounters.push(encounter);
        }

        const target = this.encounterTarget(event);
        if (!encounter.firstTarget && target && ['damage', 'kill'].includes(event.type)) {
            encounter.firstTarget = target;
        }
        encounter.lastAt = Math.max(encounter.lastAt, event.at);
        encounter.damage += event.type === 'damage' ? Number(event.amount || 0) : 0;
        encounter.healing += event.type === 'heal' ? Number(event.amount || 0) : 0;
        encounter.events.push(event);
    }

    rememberCombatEvent(event) {
        const saved = this.rememberEvent(event);
        this.combatEvents.push(saved);
        if (this.combatEvents.length > 5000) this.combatEvents.shift();
        this.appendEncounterEvent(saved);
        return saved;
    }

    rebuildEncounters() {
        this.encounters = [];
        this.nextEncounterId = 1;
        for (const event of this.combatEvents) this.appendEncounterEvent(event);
    }

    observationKey(zone, name) {
        return `${normalizeName(zone).toLowerCase()}|${normalizeName(name).toLowerCase()}`;
    }

    noteKill(victim, { addToEncounter = true } = {}) {
        victim = normalizeName(victim);
        const at = this.currentLineAt || Date.now();
        const key = this.observationKey(this.zone, victim);
        this.killCounts.set(key, (this.killCounts.get(key) || 0) + 1);
        this.lastKill = { name: victim, zone: this.zone, at };
        this.rememberNpc(victim, { killed: true });
        if (addToEncounter) {
            return this.rememberCombatEvent({ type: 'kill', victim, encounterTarget: victim });
        }
        return this.rememberEvent({ type: 'kill', victim });
    }

    noteLoot(itemName, sourceName = '') {
        const at = this.currentLineAt || Date.now();
        const parsedItem = parseLootItem(itemName);
        const item = parsedItem.item;
        let source = trimSentence(sourceName)
            .replace(/^the corpse of\s+/i, '')
            .replace(/'s corpse(?:\s+(?:and|to)\b.*)?$/i, '')
            .replace(/\s+(?:and|to)\b.*$/i, '')
            .trim();

        if (!source && this.lastKill && at - this.lastKill.at <= Math.max(60, this.encounterGapSeconds * 2) * 1000) {
            source = this.lastKill.name;
        }
        if (!source) {
            const encounter = this.encounters[this.encounters.length - 1];
            if (encounter && at - encounter.lastAt <= this.encounterGapSeconds * 1000) {
                source = encounter.firstTarget;
            }
        }
        if (!item || isCurrencyLoot(item)) return null;

        const sourceKey = this.observationKey(this.zone, source || 'Unknown');
        const lootKey = `${sourceKey}|${item.toLowerCase()}`;
        this.lootCounts.set(lootKey, (this.lootCounts.get(lootKey) || 0) + 1);
        const event = this.rememberEvent({
            type: 'loot',
            item,
            quantity: parsedItem.quantity,
            source: source || 'Unknown',
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
        if (!name) return;
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

    noteDamage(victim, amount, source, kind) {
        const n = parseNumber(amount);
        if (!Number.isFinite(n) || n < 0) return null;
        const now = this.currentLineAt || Date.now();
        if (!this.sessionStartedAt) this.sessionStartedAt = now;
        this.lastCombatAt = now;
        this.totalDamage += n;
        victim = normalizeName(victim);
        this.rememberNpc(victim, {
            damageDone: (this.observed.get(`${this.zone.toLowerCase()}|${victim.toLowerCase()}`)?.damageDone || 0) + n
        });
        if (!this.currentFight || this.currentFight.victim !== victim || now - this.currentFight.lastAt > 15000) {
            this.currentFight = { victim, damage: 0, startedAt: now, lastAt: now };
        }
        this.currentFight.damage += n;
        this.currentFight.lastAt = now;
        return this.rememberCombatEvent({ type: 'damage', victim, encounterTarget: victim, amount: n, source: source || kind, kind });
    }

    parse(rawLine) {
        const raw = String(rawLine || '').replace(/\r$/, '');
        const m = raw.match(LINE_RE);
        const parsedAt = m ? Date.parse(m[1]) : NaN;
        this.currentLineAt = Number.isFinite(parsedAt) ? parsedAt : Date.now();
        const text = stripLogLinks((m ? m[2] : raw).trim()).replace(/^--(.*?)--$/, '$1');
        if (!text) return null;

        let x;

        x = text.match(/^You have entered (.+?)\.?$/i);
        if (x) {
            this.zone = normalizeName(x[1]);
            return this.rememberEvent({ type: 'zone', zone: this.zone });
        }

        // /who self line: [50 MNK/ROG/BER] Maergoth (Iksar) <Guild> ZONE: ...
        x = text.match(/^\[(\d+)\s+([A-Z]{3}(?:\/[A-Z]{3})*)\]\s+([^\s]+)\s+\([^)]+\).*?\bZONE:/);
        if (x && (!this.character || x[3].toLowerCase() === this.character.toLowerCase())) {
            this.level = Number(x[1]);
            this.classes = x[2].split('/');
            if (!this.character) this.character = x[3];
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
                this.location = {
                    x: Number(x[1]), y: Number(x[2]), z: Number(x[3]),
                    heading: x[4] === undefined ? null : Number(x[4]),
                    at: this.currentLineAt || Date.now()
                };
                return this.rememberEvent({ type: 'location', location: { ...this.location } });
            }
        }

        // Consider lines from the supplied Legends log:
        // "Master Xalg judges you amiably -- ... (Lvl: 70)"
        x = text.match(/^(.+?)\s+(?:regards you|judges you|glares at you)\b.*?\(Lvl:\s*(\d+)\)\s*$/i);
        if (x) {
            const name = normalizeName(x[1]);
            const level = Number(x[2]);
            this.rememberNpc(name, { level });
            return this.rememberEvent({ type: 'consider', target: { name, level, at: this.currentLineAt || Date.now() } });
        }

        // Outgoing spell direct damage.
        x = text.match(/^You hit (.+?) for ([\d,]+) points? of (\w+) damage by (.+?)\.(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[1], x[2], x[4], 'spell');

        // DoT tick.
        x = text.match(/^(.+?) has taken ([\d,]+) damage from your (.+?)\.(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[1], x[2], x[3], 'dot');

        // Outgoing melee / combat art.
        x = text.match(/^You (\w+) (?:on )?(.+?) for ([\d,]+) points? of damage\.?(?:\s*\(([^)]+)\))?$/i);
        if (x) return this.noteDamage(x[2], x[3], x[1], 'melee');

        // Some abilities say "strike ...", "backstab ...", etc. The prior rule covers
        // the supplied log. Failed attacks are intentionally excluded.
        if (/^You try to /i.test(text)) {
            return null;
        }

        // Healing performed by the player.
        x = text.match(/^You healed (.+?) for ([\d,]+)(?: \([\d,]+\))? hit points? by (.+?)\.$/i);
        if (x) {
            const n = parseNumber(x[2]);
            this.totalHealing += n;
            return this.rememberCombatEvent({ type: 'heal', target: normalizeName(x[1]), amount: n, source: x[3] });
        }

        x = text.match(/^You gain a rune for ([\d,]+) points? of absorption\.$/i);
        if (x) {
            const n = parseNumber(x[1]);
            return this.rememberCombatEvent({ type: 'rune', amount: n });
        }

        x = text.match(/^You have slain (.+?)!/i);
        if (x) return this.noteKill(x[1]);

        x = text.match(/^(.+?) has been slain by (.+?)!/i);
        if (x) {
            const killedByPlayer = this.character && x[2].toLowerCase() === this.character.toLowerCase();
            // Count nearby group/raid kills for observed drop-rate denominators,
            // but do not create a player combat encounter from someone else's kill.
            return this.noteKill(x[1], { addToEncounter: Boolean(killedByPlayer) });
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

        return null;
    }

    snapshot() {
        const now = Date.now();
        const sessionSeconds = this.sessionStartedAt && this.lastCombatAt
            ? Math.max(1, (this.lastCombatAt - this.sessionStartedAt) / 1000)
            : 0;
        const encounters = this.encounters.slice().reverse().map(encounter => {
            const duration = Math.max(1, (encounter.lastAt - encounter.startAt) / 1000);
            return {
                ...encounter,
                name: encounter.firstTarget || 'Encounter',
                duration,
                dps: encounter.damage / duration,
                active: now - encounter.lastAt <= this.encounterGapSeconds * 1000,
                events: encounter.events.slice()
            };
        });
        const fight = encounters[0] || null;
        const lootLog = this.lootLog.map(entry => {
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
            location: this.location ? { ...this.location } : null,
            totalDamage: this.totalDamage,
            totalHealing: this.totalHealing,
            sessionDps: sessionSeconds ? this.totalDamage / sessionSeconds : 0,
            fight,
            encounters,
            encounterGapSeconds: this.encounterGapSeconds,
            lootLog,
            killCounts: Object.fromEntries(this.killCounts),
            observed: Array.from(this.observed.values()).sort((a,b) => b.lastSeen - a.lastSeen),
            recentEvents: this.recentEvents.slice()
        };
    }
}
