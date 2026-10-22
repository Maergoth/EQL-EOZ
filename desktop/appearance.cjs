const presets = require('../app/appearance-presets.json');
const families = new Set(presets.fonts.map(font => font.id));
function normalizeAppearance(value) {
    return {
        fontFamily:families.has(value?.fontFamily) ? value.fontFamily : presets.default.fontFamily,
        fontSize:typeof value?.fontSize === 'number' && Number.isFinite(value.fontSize)
            ? Math.max(presets.minimumSize,Math.min(presets.maximumSize,Math.round(value.fontSize))) : presets.default.fontSize
    };
}
module.exports = {normalizeAppearance};
