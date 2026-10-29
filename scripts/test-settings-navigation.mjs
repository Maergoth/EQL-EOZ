import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountSettingsNavigation } from '../app/settings-navigation.js';
import { mountFeatureVisibility } from '../app/feature-visibility.js';

const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html);
const { document, MutationObserver, Event, MouseEvent } = dom.window;
const root = document.querySelector('[data-view-panel="settings"]');
const search = document.querySelector('#settings-search');
const navigation = mountSettingsNavigation({ root, MutationObserver });
const visibility = mountFeatureVisibility({ root, MutationObserver });
const filtered = id => document.getElementById(id).hasAttribute('data-settings-filtered');
function find(text) { search.value = text;search.dispatchEvent(new Event('input')); }

assert.equal(root.querySelectorAll('[data-settings-group]').length, 7);
for (const anchor of root.querySelectorAll('[data-settings-topic]')) assert(document.querySelector(anchor.getAttribute('href')), 'Every topic has a destination');
assert.equal(filtered('game-settings'), false);
visibility.setFeatures({map:false,combat:false,screenReading:false});
await new Promise(resolve => setTimeout(resolve, 0));
for (const name of ['tools','reading']) {
    const group = [...root.querySelectorAll('[data-settings-group]')].find(node => node.dataset.settingsGroup === name);
    assert(group, 'The expected feature topic exists');
    assert(group.hasAttribute('data-settings-empty'), 'Groups with no available settings are hidden');
    assert(root.querySelector(`[data-settings-topic="${name}"]`).hasAttribute('data-settings-empty'), 'Empty topic shortcuts are hidden');
}
find('source selection');
assert.match(document.getElementById('settings-search-status').textContent, /No settings match/, 'Disabled feature settings are not search matches');
assert.equal(filtered('capture-settings'), true);
visibility.setFeatures({});
await new Promise(resolve => setTimeout(resolve, 0));
find('');
assert.equal(document.getElementById('settings-topic-reading').hasAttribute('data-settings-empty'), false, 'Re-enabled feature restores its topic');
assert.equal(root.querySelector('[data-settings-topic="reading"]').hasAttribute('data-settings-empty'), false);
assert.equal(document.getElementById('feature-settings').hasAttribute('data-feature-ui-hidden'), false, 'Re-enable switches always remain available');
find(' FONT ');
assert.equal(filtered('appearance-settings'), false);
assert.equal(filtered('game-settings'), true);
assert.match(document.getElementById('settings-search-status').textContent, /matching settings/);
find('newest log');
assert.equal(filtered('game-settings'), false, 'Multiple search words match the same setting');
assert.equal(filtered('appearance-settings'), true);
find('no setting has this phrase');
assert.match(document.getElementById('settings-search-status').textContent, /No settings match/);

const panel = document.getElementById('feature-settings');
find('screen reader');
panel.innerHTML = '<label><input type="checkbox">Screen reader availability</label>';
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(filtered('feature-settings'), false, 'Async feature content is searchable');
const checkbox = panel.querySelector('input');
checkbox.checked = true;checkbox.disabled = true;
panel.hidden = true;
find('nothing here');find('');
assert.equal(checkbox.checked, true, 'Filtering preserves draft values');
assert.equal(checkbox.disabled, true, 'Filtering cannot enable an unavailable control');
assert.equal(panel.hidden, true, 'Filtering cannot unhide a component-owned hidden panel');
assert.equal(document.getElementById('settings-search-status').textContent, '');

let scrolled = false;
const topic = document.querySelector('[data-settings-topic="game"]');
document.querySelector('#settings-topic-game').scrollIntoView = () => { scrolled = true; };
find('font');
topic.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, ctrlKey:true }));
assert.equal(search.value, 'font', 'Modified links retain normal browser behavior');
topic.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));
assert.equal(search.value, '');
assert(scrolled);
assert.equal(document.activeElement.id, 'settings-topic-game-title', 'Topic selection moves keyboard focus to the selected heading');
assert.equal(filtered('game-settings'), false);
navigation.dispose();
visibility.dispose();
find('font');
assert.equal(filtered('game-settings'), false, 'Disposed discovery no longer changes visibility');
dom.window.close();
console.log('Settings topics, dynamic search, keyboard focus and component state preservation passed.');
