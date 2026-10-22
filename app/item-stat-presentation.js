// Mark values changed by the item-level slider, including reduced weight and
// improved negative penalties. Unchanged/unknown values keep their normal color.
export function isItemStatModified(base,adjusted,tier) {
    const numeric=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value));
    return Number(tier)>0&&numeric(base)&&numeric(adjusted)&&Number(base)!==Number(adjusted);
}
