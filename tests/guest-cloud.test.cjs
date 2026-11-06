const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'owner-preview.js'), 'utf8');
const start = source.indexOf('const text =');
const end = source.indexOf('\n  async function readPublishedState', start);
assert.ok(start >= 0 && end > start, 'public-state normalizers remain inspectable');

const context = {URL};
vm.runInNewContext(`
  const API_BASE='https://tolberts-main-street-reimagined.cmcnosky.chatgpt.site';
  const active=false;
  const contentContract={
    fieldKeys:['home.heroHeadline'],
    imageKeys:['home.stagePhoto'],
    normalizeContent:value => value,
    normalizeImages:value => value
  };
  const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  ${source.slice(start, end)}
  this.normalizeState=normalizeState;
  this.normalizePublishedEnvelope=normalizePublishedEnvelope;
  this.safeImage=safeImage;
`, context);

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const validPublic = () => ({
  version: 1,
  revision: 4,
  updatedAt: '2026-11-06T19:00:00.000Z',
  menu: [{id: 'dish-1', category: 'Chili', name: 'Bowl of Red', description: 'Family recipe.', price: '11.99', image: '', imageAlt: '', available: true}],
  events: [{id: 'show-1', name: 'Texas Band', genre: 'Country', date: '2026-11-07', start: '21:00', end: '23:00', image: 'assets/stage.webp', status: 'Scheduled'}],
  hours: days.map(day => ({day, open: '11:00', close: '21:00', closed: false})),
  exceptions: [],
  settings: {phone: '(817) 421-4888', address: '423 South Main Street', announcement: '', content: {}, images: {}}
});

test('accepts a bounded public envelope and preserves its revision', () => {
  const result = context.normalizePublishedEnvelope(validPublic());
  assert.equal(result.revision, 4);
  assert.equal(result.menu[0].name, 'Bowl of Red');
  assert.equal(result.events[0].name, 'Texas Band');
});

test('accepts an intentionally empty published menu without restoring stale fallback dishes', () => {
  const emptyMenu = validPublic();
  emptyMenu.menu = [];
  const result = context.normalizePublishedEnvelope(emptyMenu);
  assert.ok(result);
  assert.deepEqual(Array.from(result.menu), []);
  assert.match(source, /No menu items are currently marked available\./);
});

test('rejects malformed public data instead of partially applying it', () => {
  const missingDay = validPublic();
  missingDay.hours.pop();
  const duplicateDay = validPublic();
  duplicateDay.hours[6] = {...duplicateDay.hours[0]};
  const invalidRevision = validPublic();
  invalidRevision.revision = 0;
  const invalidUpdatedAt = validPublic();
  invalidUpdatedAt.updatedAt = 'not-a-date';
  const partialSettings = validPublic();
  delete partialSettings.settings.images;
  const missingEventField = validPublic();
  delete missingEventField.events[0].status;
  const extraEventField = validPublic();
  extraEventField.events[0].imageAlt = 'Not in the public event contract';
  assert.equal(context.normalizePublishedEnvelope(missingDay), null);
  assert.equal(context.normalizePublishedEnvelope(duplicateDay), null);
  assert.equal(context.normalizePublishedEnvelope(invalidRevision), null);
  assert.equal(context.normalizePublishedEnvelope(invalidUpdatedAt), null);
  assert.equal(context.normalizePublishedEnvelope(partialSettings), null);
  assert.equal(context.normalizePublishedEnvelope(missingEventField), null);
  assert.equal(context.normalizePublishedEnvelope(extraEventField), null);
});

test('rejects public responses containing private workspace fields', () => {
  for (const key of ['inventory', 'orders', 'team', 'shifts', 'activity', 'auth']) {
    const data = validPublic();
    data[key] = [];
    assert.equal(context.normalizePublishedEnvelope(data), null, key);
  }
  const nested = validPublic();
  nested.settings.passwordHash = 'private';
  assert.equal(context.normalizePublishedEnvelope(nested), null);
  const itemLeak = validPublic();
  itemLeak.menu[0].cost = 54;
  assert.equal(context.normalizePublishedEnvelope(itemLeak), null);
  const contentLeak = validPublic();
  contentLeak.settings.content.passwordHash = 'private';
  assert.equal(context.normalizePublishedEnvelope(contentLeak), null);
  const imageLeak = validPublic();
  imageLeak.settings.images.internalReceipt = 'assets/stage.webp';
  assert.equal(context.normalizePublishedEnvelope(imageLeak), null);
});

test('resolves only exact shared image tokens on public pages', () => {
  const token = `shared:${'a'.repeat(64)}.webp`;
  assert.equal(context.safeImage(token), `https://tolberts-main-street-reimagined.cmcnosky.chatgpt.site/api/v1/images/${'a'.repeat(64)}.webp`);
  assert.equal(context.safeImage('shared:../../secret.webp'), 'assets/stage.webp');
  assert.equal(context.safeImage(`shared:${'A'.repeat(64)}.webp`), 'assets/stage.webp');
  assert.equal(context.safeImage(`shared:${'a'.repeat(64)}.jpeg`), 'assets/stage.webp');
  assert.equal(context.safeImage('data:image/webp;base64,AAAA'), 'assets/stage.webp');
  const embedded = validPublic();
  embedded.menu[0].image = 'data:image/webp;base64,AAAA';
  assert.equal(context.normalizePublishedEnvelope(embedded), null);
});

test('guest scripts wait until shared content has rendered', () => {
  for (const file of ['app.js', 'menu.js', 'music.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(text, /await \(window\.OwnerPreview\?\.ready \|\| Promise\.resolve\(\)\)/, file);
  }
  for (const file of ['index.html', 'menu.html', 'music.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const api = html.indexOf('shared-api.js');
    const bridge = html.indexOf('owner-preview.js');
    const downstream = file === 'menu.html' ? html.indexOf('menu.js') : html.indexOf('music.js');
    assert.ok(api >= 0 && api < bridge && bridge < downstream, `${file} script order`);
  }
});

test('shared lineup is authoritative and does not trigger the official feed refresh', () => {
  const music = fs.readFileSync(path.join(root, 'music.js'), 'utf8');
  assert.match(music, /if \(stateMode\)[\s\S]*savedEvents = ownerPreviewEvents\(\);[\s\S]*renderShows\(\);[\s\S]*return;/);
  assert.match(music, /if \(!stateMode && !document\.hidden/);
});

test('normal and owner-view guest URLs use the same public state and never read a private local workspace', () => {
  assert.match(source, /api\.state = await readPublishedState\(\)/);
  assert.doesNotMatch(source, /localStorage|readState|STORE_KEY/);
  assert.match(source, /api\.published = Boolean\(api\.state\)/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 4500\)/);
  assert.match(source, /if \(!api\.state\) return;[\s\S]*renderMenuPage\(\)/);
  assert.match(source, /setInterval\(checkForPublishedChange, 30000\)/);
  assert.match(source, /if \(document\.hidden \|\| pageIsBusy\(\)\) return;/);
  assert.match(source, /new URL\(guestUrl\('menu\.html'\), location\.href\)/);
  assert.match(source, /if \(api\.state\) document\.body\.classList\.add\('owner-shared-content'\)/);
  assert.match(source, /\.owner-shared-content h1[^`]+overflow-wrap:anywhere/);
});
