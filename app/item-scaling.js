const PRIMARY = new Set([
    'AC','HP','MP','END','STR','STA','AGI','DEX','WIS','INT','CHA',
    'SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE'
]);
const FLAT = new Set(['HP_REGEN','MANA_REGEN','END_REGEN','HASTE']);

function excelRound(value) {
    if (!Number.isFinite(value)) return value;
    return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

export function itemEffectiveLevel(fullLevel, fraction = 0) {
    const full = Math.max(0, Math.min(10, Math.floor(Number(fullLevel) || 0)));
    const denom = Math.pow(2, full);
    const frac = Math.max(0, Math.min(Math.max(0, denom - 1), Math.floor(Number(fraction) || 0)));
    return full + (denom ? frac / denom : 0);
}

export function scaleItemStat(key, value, fullLevel, options = {}) {
    const stat = String(key || '').toUpperCase();
    const base = Number(value);
    const full = Math.max(0, Math.min(10, Math.floor(Number(fullLevel) || 0)));
    const effective = itemEffectiveLevel(full, options.fraction || 0);
    if (!Number.isFinite(base) || full <= 0) return base;

    if (PRIMARY.has(stat)) {
        if (base === 0) return 0;
        if (base > 0 && base <= 10) return base + full;
        if (base > 10) return Math.trunc(base + excelRound(base * effective / 10));
        if (base < 0 && Math.abs(base) <= 10) return Math.min(0, base + full);
        if (base < -10) return Math.min(0, base + excelRound(Math.abs(base) * effective / 10));
    }

    if (stat === 'DMG') {
        return base > 0 ? base + Math.trunc(base * effective / 10) : base;
    }

    // Elemental/Bane/Backstab damage intentionally does not match DMG.
    if (stat === 'RANGE' && options.isAmmo) {
        return base + (10 * full);
    }

    if (FLAT.has(stat)) {
        return base > 0 ? base + full : base;
    }

    if (stat === 'WT' && base > 0.1) {
        const totalProgression = Math.pow(2, full) + (options.fraction || 0);
        const scaled = base * (1 - 0.09 * (Math.log(totalProgression) / Math.log(2)));
        return Math.ceil(scaled * 10 - 1e-9) / 10;
    }

    return base;
}

export function scaledItemStats(item, fullLevel) {
    const stats = item && item.stats ? item.stats : {};
    const isAmmo = Array.isArray(item?.slots) && item.slots.some(slot => String(slot).toUpperCase() === 'AMMO');
    const result = {};
    for (const [key, value] of Object.entries(stats)) {
        result[key] = scaleItemStat(key, value, fullLevel, { isAmmo });
    }
    return result;
}
