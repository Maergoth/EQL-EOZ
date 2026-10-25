// Mark values changed by the item-level slider, including reduced weight and
// improved negative penalties. Unchanged/unknown values keep their normal color.
export function isItemStatModified(base,adjusted,tier) {
    const numeric=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value));
    return Number(tier)>0&&numeric(adjusted)&&(base===undefined?Number(adjusted)!==0:numeric(base)&&Number(base)!==Number(adjusted));
}

// Explicit unitless Accuracy stays unitless; rank-derived weapon Accuracy is a
// percentage. Compact cards and the shared Itembox use the same distinction.
export function itemAccuracyIsPercent(item={},baseStats=item.baseStats??item.stats??{},stats=item.stats??{}) {
    return item.accuracyPercent===true||/\bAccuracy\s*:\s*[+\-]?\d+(?:\.\d+)?\s*%/i.test((Array.isArray(item.displayLines)?item.displayLines:[]).join('\n'))||!Object.hasOwn(baseStats,'ACCURACY')&&Object.hasOwn(stats,'ACCURACY');
}
