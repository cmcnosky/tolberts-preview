const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'menu.js'), 'utf8');

function element(properties = {}) {
  const listeners = new Map();
  return {
    value: '', textContent: '', hidden: false, dataset: {}, options: [], attributes: {},
    ...properties,
    addEventListener(type, listener) { const list = listeners.get(type) || []; list.push(listener); listeners.set(type, list); },
    dispatch(type, init = {}) {
      const event = {target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init};
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    scrollIntoView() {}, focus() {}
  };
}

function menuHarness(url) {
  let currentUrl = new URL(url);
  let releaseReady;
  const ready = new Promise(resolve => { releaseReady = resolve; });
  const windowListeners = {};
  const search = element();
  const category = element({value: 'All dishes', options: [{value: 'All dishes'}, {value: 'Chili'}, {value: 'Starters'}]});
  const form = element();
  const menuCount = element();
  const dietary = element();
  const empty = element({hidden: true});
  const clear = element({hidden: true});
  const reset = element();
  const dishes = [
    element({dataset: {category: 'Chili'}, name: 'Bowl of Red', description: 'Family chili', price: '11.99'}),
    element({dataset: {category: 'Starters'}, name: 'Donkey Tails', description: 'Beef franks and cheese', price: '11.99'})
  ];
  const groups = [element({dishes: [dishes[0]]}), element({dishes: [dishes[1]]})];
  const sidebar = element();
  const links = ['All dishes', 'Chili', 'Starters'].map(value => element({dataset: {category: value}}));
  const globals = new Map([
    ['#dish-search', search], ['#category-select', category], ['.menu-search-form', form],
    ['#dietary-guidance', dietary], ['#menu-count', menuCount], ['#empty-menu', empty],
    ['#clear-menu', clear], ['#reset-menu', reset], ['.menu-sidebar', sidebar]
  ]);
  const $ = (selector, root) => {
    if (root?.name) {
      if (selector === 'h3') return element({textContent: root.name});
      if (selector === 'p') return element({textContent: root.description});
      if (selector === '.item-price') return element({textContent: root.price});
    }
    return globals.get(selector) || null;
  };
  const $$ = (selector, root) => {
    if (selector === '.menu-item' && root?.dishes) return root.dishes;
    if (selector === '.menu-item') return dishes;
    if (selector === '.menu-group') return groups;
    if (selector === '.menu-sidebar [data-category]' || selector === '[data-category]') return links;
    return [];
  };
  const location = {get href() { return currentUrl.href; }, get search() { return currentUrl.search; }};
  const history = {
    pushState(_state, _title, next) { currentUrl = new URL(String(next)); },
    replaceState(_state, _title, next) { currentUrl = new URL(String(next)); }
  };
  const context = {
    window: {OwnerPreview: {ready}, addEventListener(type, listener) { windowListeners[type] = listener; }},
    document: {addEventListener() {}}, location, history, URL, URLSearchParams, Promise, Object, Set, Map,
    MenuSearch: {normalize: value => String(value || '').trim().toLowerCase(), textFor: item => Object.values(item).join(' ').toLowerCase()},
    $, $$
  };
  const execution = vm.runInNewContext(source, context, {filename: 'menu.js'});
  return {search, category, form, dishes, menuCount, location, windowListeners, releaseReady, execution, setUrl(next) { currentUrl = new URL(next); }};
}

test('menu keeps input and category choices made while shared content is loading', async () => {
  const page = menuHarness('https://example.test/menu.html?q=chili');
  assert.equal(page.search.value, 'chili', 'the URL query is available before shared content finishes');
  page.search.value = 'Donkey';
  page.search.dispatch('input');
  page.category.value = 'Starters';
  page.category.dispatch('change');
  assert.equal(page.form.dispatch('submit').defaultPrevented, true, 'the unbound search form cannot navigate during readiness');
  page.releaseReady();
  await page.execution;
  assert.equal(page.search.value, 'Donkey');
  assert.equal(page.category.value, 'Starters');
  assert.deepEqual(page.dishes.map(dish => dish.hidden), [true, false]);
  assert.equal(page.menuCount.textContent, '1 entry · Starters');
  assert.equal(new URL(page.location.href).searchParams.get('q'), 'Donkey');
  assert.equal(new URL(page.location.href).searchParams.get('category'), 'Starters');
});

test('menu still initializes from the URL and popstate after shared content loads', async () => {
  const page = menuHarness('https://example.test/menu.html?q=Bowl&category=Chili');
  page.releaseReady();
  await page.execution;
  assert.equal(page.search.value, 'Bowl');
  assert.equal(page.category.value, 'Chili');
  assert.deepEqual(page.dishes.map(dish => dish.hidden), [false, true]);
  page.setUrl('https://example.test/menu.html?q=Donkey&category=Starters');
  page.windowListeners.popstate();
  assert.equal(page.search.value, 'Donkey');
  assert.equal(page.category.value, 'Starters');
  assert.deepEqual(page.dishes.map(dish => dish.hidden), [true, false]);
});
