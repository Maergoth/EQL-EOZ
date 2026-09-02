const LINE_RE = /^\[([^\]]+)\]\s*(.*)$/;

function parseNumber(text) {
    return Number(String(text || '').replace(/,/g, ''));
}

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

export class EQLogParser {
    constructor() {
        this.character = '';
        this.level = 0;
        this.classes = [];
        this.zone = '';
        this.location = null;
        this.target = null;
        this.observed = new Map();
        this.totalDamage = 0;
        this.totalHealing = 0;
        this.sessionStartedAt = null;
        this.lastCombatAt = null;
        this.currentFight = null;
        this.recentEvents = [];
        this.currentLineAt = null;
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
        return this.rememberEvent({ type: 'damage', victim, amount: n, source: source || kind, kind });
    }

    parse(rawLine) {
        const raw = String(rawLine || '').replace(/\r$/, '');
        const m = raw.match(LINE_RE);
        const parsedAt = m ? Date.parse(m[1]) : NaN;
        this.currentLineAt = Number.isFinite(parsedAt) ? parsedAt : Date.now();
        const text = (m ? m[2] : raw).trim();
        if (!text) return null;

        let x;

        x = text.match(/^You have entered (.+?)\.?$/i);
        if (x) {
            this.zone = normalizeName(x[1]);
            this.target = null;
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

        x = text.match(/^Targeted \((?:NPC|Player)\):\s*(.+)$/i);
        if (x) {
            this.target = { name: normalizeName(x[1]), level: 0, at: this.currentLineAt || Date.now() };
            return this.rememberEvent({ type: 'target', target: { ...this.target } });
        }

        // Consider lines from the supplied Legends log:
        // "Master Xalg judges you amiably -- ... (Lvl: 70)"
        x = text.match(/^(.+?)\s+(?:regards you|judges you|glares at you)\b.*?\(Lvl:\s*(\d+)\)\s*$/i);
        if (x) {
            const name = normalizeName(x[1]);
            const level = Number(x[2]);
            this.target = { name, level, at: this.currentLineAt || Date.now() };
            this.rememberNpc(name, { level });
            return this.rememberEvent({ type: 'consider', target: { ...this.target } });
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
            return this.rememberEvent({ type: 'heal', target: normalizeName(x[1]), amount: n, source: x[3] });
        }

        x = text.match(/^You gain a rune for ([\d,]+) points? of absorption\.$/i);
        if (x) {
            const n = parseNumber(x[1]);
            return this.rememberEvent({ type: 'rune', amount: n });
        }

        x = text.match(/^You have slain (.+?)!/i);
        if (x) {
            const victim = normalizeName(x[1]);
            this.rememberNpc(victim, { killed: true });
            return this.rememberEvent({ type: 'kill', victim });
        }

        x = text.match(/^(.+?) has been slain by (.+?)!/i);
        if (x && this.character && x[2].toLowerCase() === this.character.toLowerCase()) {
            const victim = normalizeName(x[1]);
            this.rememberNpc(victim, { killed: true });
            return this.rememberEvent({ type: 'kill', victim });
        }

        return null;
    }

    snapshot() {
        const now = Date.now();
        const sessionSeconds = this.sessionStartedAt && this.lastCombatAt
            ? Math.max(1, (this.lastCombatAt - this.sessionStartedAt) / 1000)
            : 0;
        let fight = null;
        if (this.currentFight) {
            const duration = Math.max(1, (Math.min(now, this.currentFight.lastAt + 15000) - this.currentFight.startedAt) / 1000);
            fight = {
                ...this.currentFight,
                dps: this.currentFight.damage / duration,
                active: now - this.currentFight.lastAt <= 15000
            };
        }
        return {
            character: this.character,
            level: this.level,
            classes: this.classes.slice(),
            zone: this.zone,
            location: this.location ? { ...this.location } : null,
            target: this.target ? { ...this.target } : null,
            totalDamage: this.totalDamage,
            totalHealing: this.totalHealing,
            sessionDps: sessionSeconds ? this.totalDamage / sessionSeconds : 0,
            fight,
            observed: Array.from(this.observed.values()).sort((a,b) => b.lastSeen - a.lastSeen),
            recentEvents: this.recentEvents.slice()
        };
    }
}
