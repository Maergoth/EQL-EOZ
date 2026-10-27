/** Tracking belongs to the edited page, not pages which transclude it. This is
 * deliberately a conservative source scanner, not a MediaWiki renderer. Only
 * an unambiguous direct category link proves membership. */
export const EOZ_PAGE_CATEGORY_POLICY = 1;
export const EOZ_PAGE_CATEGORY_FOOTER = '<noinclude>[[Category:EoZ]]</noinclude>';
// Extension bodies use their own grammar or deferred rendering; their text is
// not evidence of this page's direct category membership (notably gallery).
const literalTags = new Set(['nowiki', 'pre', 'source', 'syntaxhighlight', 'code', 'math', 'chem', 'ce', 'script', 'style', 'gallery', 'ref', 'references', 'imagemap', 'inputbox', 'templatedata', 'timeline', 'graph', 'score', 'poem', 'indicator', 'charinsert', 'templatestyles', 'eqlcharacterscreenshot', 'eqlplayers', 'zoneviewer', 'langconvert', 'categorytree', 'dynamicpagelist', 'section', 'createbox', 'citation']);
const scopeTags = new Set(['includeonly', 'noinclude', 'onlyinclude']);
const fail = () => { throw Error('Unbalanced wiki source needs manual review before adding the EoZ tracking category.'); };

export function hasEoZPageCategory(source) {
    if (typeof source !== 'string') throw Error('Wiki page source must be text.');
    const braces = [], scopes = []; let links = 0, found = false;
    for (let at = 0; at < source.length;) {
        if (source.startsWith('<!--', at)) {
            const end = source.indexOf('-->', at + 4); if (end < 0) fail(); at = end + 3; continue;
        }
        if (source[at] === '<') {
            const tag = source.slice(at).match(/^<\s*(\/?)\s*([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i);
            if (tag) {
                const name = tag[2].toLowerCase(), closing = Boolean(tag[1]), self = /\/\s*>$/.test(tag[0]);
                if (literalTags.has(name) && !closing && !self) {
                    const close = new RegExp(`</\\s*${name}\\s*>`, 'gi'); close.lastIndex = at + tag[0].length;
                    if (!close.exec(source)) fail(); at = close.lastIndex; continue;
                }
                if (scopeTags.has(name) && !self) {
                    if (closing) { if (scopes.pop() !== name) fail(); } else scopes.push(name);
                }
                at += tag[0].length; continue;
            }
            // An unterminated tag/attribute could swallow an appended footer.
            if (/^<\s*\/?\s*[a-z]/i.test(source.slice(at))) fail();
        }
        if (source.startsWith('{{{', at)) { braces.push(3); at += 3; continue; }
        if (source.startsWith('{{', at)) { braces.push(2); at += 2; continue; }
        const width = braces.at(-1);
        if (width && source.startsWith('}'.repeat(width), at)) { braces.pop(); at += width; continue; }
        if (source.startsWith('[[', at)) {
            if (!braces.length && !links && !scopes.includes('includeonly')) {
                const end = source.indexOf(']]', at + 2);
                if (end >= 0) {
                    const target = source.slice(at + 2, end).split('|', 1)[0].replace(/_/g, ' ').trim();
                    // Namespace names ignore case; only the first title letter
                    // is case-insensitive. EOZ and Eoz are different pages.
                    const parts = target.match(/^([^:]+):([^:]*)$/);
                    if (parts && parts[1].trim().toLowerCase() === 'category' && /^[Ee]oZ$/.test(parts[2].trim())) found = true;
                }
            }
            links++; at += 2; continue;
        }
        if (source.startsWith(']]', at) && links) { links--; at += 2; continue; }
        at++;
    }
    if (braces.length || scopes.length || links) fail();
    return found;
}

export function ensureEoZPageCategory(source, { context = null } = {}) {
    if (hasEoZPageCategory(source) || context !== null && hasEoZPageCategory(context)) return source;
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    return source + (source && !source.endsWith('\n') ? newline : '') + EOZ_PAGE_CATEGORY_FOOTER + newline;
}
