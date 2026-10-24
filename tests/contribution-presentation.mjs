import assert from 'node:assert/strict';
import {CONTRIBUTION_FILTERS,contributionQueueInfo,visibleContributionQueue,contributionQueueCounts} from '../app/contribution-presentation.js';
const rows=[
 {id:'tier',kind:'item',membership:'present',reasons:['tier0-verification']},
 {id:'source',kind:'item',membership:'present',reasons:['missing-source','tier0-verification']},
 {id:'newitem',kind:'item',membership:'missing',intent:'create'},
 {id:'newmob',kind:'npc',membership:'missing',intent:'create'},
 {id:'population',kind:'zone',membership:'present',reasons:['missing-population']},
 {id:'ambiguous',kind:'npc',membership:'ambiguous',intent:'review',reasons:['identity-review']}
];
assert.deepEqual(visibleContributionQueue(rows).map(row=>row.id),['newmob','newitem','source','population','tier','ambiguous']);
assert.deepEqual(visibleContributionQueue(rows,['tier0-verification']).map(row=>row.id),['source','tier']);
assert.deepEqual(visibleContributionQueue(rows,[]),[]);
assert.deepEqual(contributionQueueInfo(rows[1]).labels,['Drop source','Tier 0 verification']);
assert.equal(contributionQueueInfo(rows[3]).kind,'Monster');
assert.equal(contributionQueueInfo(rows[3]).pageType,'New Page');
assert.equal(contributionQueueInfo(rows[1]).pageType,'Update Page');
assert.equal(contributionQueueInfo({kind:'item',membership:'present',intent:'create'}).isNew,false,'Known pages are displayed as updates even when a stale draft requested creation');
assert.equal(contributionQueueCounts(rows)['tier0-verification'],2);
assert.equal(CONTRIBUTION_FILTERS.length,7);
console.log('Contribution queue presentation: plain tags, highest-impact discovery ordering and independent gap filters passed.');
