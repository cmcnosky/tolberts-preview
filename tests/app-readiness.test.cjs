const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.classList = {add() {}, remove() {}, toggle() {}};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.href = '';
    this.open = false;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, values = {}) {
    const event = {
      currentTarget: this,
      target: this,
      preventDefault() {},
      ...values
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus() {}
  select() {}
  setCustomValidity() {}
  reportValidity() {}
}

test('group inquiry binds before shared content resolves and refreshes authoritative hours afterward', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const selectors = new Map([
    ['#today-hours', new FakeElement()],
    ['#inquiry-open', new FakeElement()],
    ['input[name="date"]', new FakeElement()],
    ['#inquiry-dialog', new FakeElement()],
    ['#inquiry-form', new FakeElement()],
    ['input[name="name"]', new FakeElement()],
    ['#inquiry-message', new FakeElement()],
    ['#inquiry-send', new FakeElement()],
    ['#inquiry-result', new FakeElement()],
    ['#copy-status', new FakeElement()],
    ['#inquiry-edit', new FakeElement()],
    ['#inquiry-copy', new FakeElement()],
    ['#toast', new FakeElement()]
  ]);
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const OwnerPreview = {
    ready,
    state: null,
    displayTime: value => value
  };
  const context = {
    Intl,
    Date,
    Promise,
    URLSearchParams,
    window: {OwnerPreview},
    navigator: {clipboard: {writeText: async () => {}}},
    FormData: class {},
    setInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    $: (selector, root) => root?.lookup?.[selector] || selectors.get(selector),
    $$: () => [],
    openDialog: dialog => { dialog.open = true; }
  };
  vm.runInNewContext(source, context, {filename: 'app.js'});

  const open = selectors.get('#inquiry-open');
  const dialog = selectors.get('#inquiry-dialog');
  assert.equal(open.listeners.get('click')?.length, 1);
  open.dispatch('click');
  assert.equal(dialog.open, true, 'the first click opens the inquiry before the public state request finishes');

  OwnerPreview.state = {settings: {content: {}}};
  OwnerPreview.getTodaySchedule = () => ({open: '11:00', close: '21:30', closed: false, exception: false});
  resolveReady();
  await ready;
  await Promise.resolve();
  assert.equal(selectors.get('#today-hours').textContent, '11:00–21:30');
});

test('visit date uses Chicago hours, owner exceptions, regular-hours fallback and the matching calendar date', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const selectors = new Map();
  function select(selector, root) {
    if (root) return {textContent: selector === 'dt' ? 'Sunday' : '11 am – 9 pm'};
    if (!selectors.has(selector)) selectors.set(selector, new FakeElement());
    return selectors.get(selector);
  }
  const field = select('#visit-date');
  field.validity = {valid:true};
  field.closest = () => select('details');
  const output = select('#visit-date-hours');
  const link = select('#visit-date-music');
  const owner = {ready: Promise.resolve(), state: null};
  vm.runInNewContext(source, {
    window:{OwnerPreview:owner}, Date, Intl, setInterval() {},
    $:select, $$:selector => selector === '.hours > div' ? [{}] : []
  });
  await owner.ready;

  field.value = '2030-03-10'; // Sunday when Central daylight time starts.
  field.dispatch('input');
  assert.match(output.textContent, /Sunday, March 10, 2030 · Regular hours: 11 am – 9 pm/);
  assert.match(output.textContent, /confirm special hours/);
  assert.equal(link.href, 'music.html?date=2030-03-10');

  owner.guestUrl = value => value + '&owner-preview=1';
  owner.getTodaySchedule = date => {
    assert.equal(date.toISOString(), '2030-03-10T12:00:00.000Z');
    return {closed:true, exception:true, label:'Private event'};
  };
  field.dispatch('input');
  assert.match(output.textContent, /Closed · Private event/);
  assert.doesNotMatch(output.textContent, /Regular hours/);
  assert.equal(link.href, 'music.html?date=2030-03-10&owner-preview=1');
  owner.getTodaySchedule = () => ({open:'12:00', close:'18:00', exception:true, label:'Special opening'});
  owner.displayTime = time => time === '12:00' ? 'noon' : '6 pm';
  field.dispatch('input');
  assert.match(output.textContent, /noon–6 pm · Special opening/);
  field.validity.valid = false;
  field.dispatch('input');
  assert.equal(link.hidden, true);
  assert.match(output.textContent, /Choose/);
  field.value = '';
  field.dispatch('input');
  assert.equal(output.textContent, '');
});
