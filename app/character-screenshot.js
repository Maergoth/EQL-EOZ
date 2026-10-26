/** Local wiki File identities only; no URL, pixels or local paths. MediaWiki
 * supplies final canonical spelling through the native authenticated client. */
export function normalizeCharacterScreenshotFile(value){
    if(typeof value!=='string')throw Error('Choose a valid wiki image filename.');
    const filename=value.startsWith('File:')?value.slice(5):value;
    if(!filename||filename!==filename.trim()||new TextEncoder().encode(filename).length>240||/[\u0000-\u001f\u007f|{}\[\]<>#\\]/u.test(filename)||/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/|\.\.?\/)/.test(filename)||! /\.(?:png|jpe?g|gif|webp)$/i.test(filename))throw Error('Choose a local wiki PNG, JPEG, GIF or WebP filename under 240 bytes.');
    return `File:${filename}`;
}
export function defaultCharacterScreenshotFile(userPage,metadata){
    if(typeof userPage!=='string'||!userPage.startsWith('User:')||!userPage.slice(5))throw Error('A canonical wiki User page is required for the character image.');
    return normalizeCharacterScreenshotFile(`Character ${userPage.slice(5)} - ${metadata.name} (${metadata.server}).png`);
}
