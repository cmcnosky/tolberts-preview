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
