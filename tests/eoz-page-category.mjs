import assert from 'node:assert/strict';
import {ensureEoZPageCategory as tag,hasEoZPageCategory as has,EOZ_PAGE_CATEGORY_FOOTER as footer} from '../app/eoz-page-category.js';

for(const source of ['[[Category:EoZ]]','[[category:eoZ|Custom sort key]]','<noinclude>[[Category:EoZ|Keep]]</noinclude>','<onlyinclude>[[Category:EoZ]]</onlyinclude>']){
    assert(has(source));assert.equal(tag(source),source,'Keep existing page membership, sort key and source bytes');
}
for(const source of ['[[Category:EOZ]]','[[Category:Eoz]]','[[:Category:EoZ]]','<!-- [[Category:EoZ]] -->','<nowiki>[[Category:EoZ]]</nowiki>','<pre>[[Category:EoZ]]</pre>','<syntaxhighlight lang="wikitext">[[Category:EoZ]]</syntaxhighlight>','<includeonly>[[Category:EoZ]]</includeonly>','{{#if:|[[Category:EoZ]]}}','{{Example|[[Category:EoZ]]}}','<span title="[[Category:EoZ]]">Text</span>']){
    assert.equal(has(source),false,source);const result=tag(source);assert(result.startsWith(source));assert(result.endsWith(footer+'\n'));assert(has(result));assert.equal(tag(result),result);
}
assert.equal(tag('Human prose\r\n[[Category:Items|Manual]]\r\n'),'Human prose\r\n[[Category:Items|Manual]]\r\n'+footer+'\r\n');
assert.equal(tag('New topic',{context:'Human prose\n[[Category:EoZ|Owner]]'}),'New topic','Section-new uses existing whole-page membership');
assert.equal(tag('{{{value|{{Nested|[[Ordinary link]]}}}}}').split(footer).length,2);
for(const source of ['<!-- open','<nowiki>open','<pre>open','<includeonly>open','<noinclude>open','<onlyinclude>open','{{open','{{{open','[[open','<span title="open'])assert.throws(()=>tag(source),/manual review/,'Never append into an unknown parser scope');
assert.throws(()=>tag('<includeonly></noinclude>'),/manual review/);
for(const name of ['gallery','ref','references','imagemap','inputbox','templatedata','poem','eqlcharacterscreenshot','eqlplayers','zoneviewer','langconvert','categorytree','dynamicpagelist','section','ce']){const source=`<${name}>[[Category:EoZ]]</${name}>`;assert.equal(has(source),false,'Extension body grammar is not direct membership: '+name);assert.equal(tag(source),source+'\n'+footer+'\n');}
console.log('EoZ page category: active source, literal/conditional exclusion, first-letter title case, safe transclusion footer and byte-idempotence passed.');
