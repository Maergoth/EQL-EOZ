const presets = require('../app/appearance-presets.json');
const families = new Set(presets.fonts.map(font => font.id));
function normalizeLocalFontFamily(value) {
    if(typeof value!=='string'||value.length>120||/[\u0000-\u001f\u007f-\u009f\u2028\u2029\uD800-\uDFFF]/u.test(value))return '';
    return value.normalize('NFC').trim().replace(/\s+/gu,' ');
}
function normalizeAppearance(value) {
    const local=value?.fontFamily==='local'?normalizeLocalFontFamily(value.localFontFamily):'';
    const result={
        fontFamily:families.has(value?.fontFamily) ? value.fontFamily : presets.default.fontFamily,
        fontSize:typeof value?.fontSize === 'number' && Number.isFinite(value.fontSize)
            ? Math.max(presets.minimumSize,Math.min(presets.maximumSize,Math.round(value.fontSize))) : presets.default.fontSize
    };
    if(local){result.fontFamily='local';result.localFontFamily=local;}
    return result;
}
module.exports = {normalizeAppearance,normalizeLocalFontFamily};
