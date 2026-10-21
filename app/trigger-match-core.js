export const MAX_TRIGGER_PATTERN = 2048;
export const MAX_TRIGGER_LINE = 8192;
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ');

// This function is invoked for user regex only inside trigger-match.worker.js.
// Main-renderer callers use TriggerMatcher, whose worker has a hard deadline.
export function matchTrigger({ pattern, mode = 'contains', line = '', ignorePunctuation = false } = {}) {
    pattern = String(pattern ?? ''); line = String(line ?? '').replace(/^\[[^\]]+\]\s*/, '');
    if (!pattern.trim()) return { matched:false, error:'Enter the text or expression to match.' };
    if (pattern.length > MAX_TRIGGER_PATTERN) return { matched:false, error:'Expressions are limited to 2048 characters.' };
    if (line.length > MAX_TRIGGER_LINE) return { matched:false, error:'Test/log lines are limited to 8192 characters.' };
    if (mode === 'regex') {
        try {
            // PNUT's common Python named-capture spelling is accepted alongside
            // JavaScript's (?<name>...). Other regex syntax follows JavaScript.
            const expression = new RegExp(pattern.replace(/\(\?P<([A-Za-z_]\w*)>/g, '(?<$1>'), 'i');
            const found = expression.exec(line);
            if (!found) return { matched:false, line, match:'', groups:{} };
            const groups = Object.fromEntries(Object.entries(found.groups || {}).filter(([, value]) => value !== undefined));
            for (let i = 1; i < found.length; i++) if (found[i] !== undefined) groups[i] = found[i];
            return { matched:true, line, match:found[0], groups };
        } catch { return { matched:false, error:'Invalid regular expression. Check its groups, brackets and syntax.' }; }
    }
    const clean = value => normalize(ignorePunctuation ? value.replace(/[^\p{L}\p{N}]+/gu, ' ') : value);
    const text = clean(line), needle = clean(pattern);
    const haystack = text.toLowerCase(), lower = needle.toLowerCase();
    const index = haystack.indexOf(lower);
    const matched = mode === 'equals' || mode === 'exact' ? haystack === lower : mode === 'starts' ? index === 0 : index !== -1;
    return { matched, line, match:matched ? text.slice(index, index + needle.length) : '', groups:{} };
}

export function fillTriggerTemplate(template, values = {}) {
    return String(template ?? '').replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token).slice(0, 240);
}
