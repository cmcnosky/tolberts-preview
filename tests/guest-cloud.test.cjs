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
  cancelledEvents: [],
  hours: days.map(day => ({day, open: '11:00', close: '21:00', closed: false})),
  exceptions: [],
  settings: {phone: '(817) 421-4888', address: '423 South Main Street', announcement: '', content: {}, images: {}}
});

test('accepts a bounded public envelope and preserves its revision', () => {
  const result = context.normalizePublishedEnvelope(validPublic());
  assert.equal(result.revision, 4);
  assert.equal(result.menu[0].name, 'Bowl of Red');
  assert.equal(result.events[0].name, 'Texas Band');
  assert.deepEqual(Array.from(result.cancelledEvents), []);
});

test('accepts bounded public cancellation tombstones and distinguishes an old server without the field', () => {
  const withCancellation = validPublic();
  withCancellation.cancelledEvents = [{date: '2026-11-08', name: 'Cancelled Artist', status: 'Cancelled'}];
  const result = context.normalizePublishedEnvelope(withCancellation);
  assert.deepEqual(JSON.parse(JSON.stringify(result.cancelledEvents)), withCancellation.cancelledEvents);
  const oldServer = validPublic();
  delete oldServer.cancelledEvents;
  assert.equal(context.normalizePublishedEnvelope(oldServer).cancelledEvents, null);
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
  const malformedCancellation = validPublic();
  malformedCancellation.cancelledEvents = [{date: '2026-11-08', name: 'Cancelled Artist', status: 'Scheduled'}];
  const duplicateCancellation = validPublic();
  duplicateCancellation.cancelledEvents = [
    {date: '2026-11-08', name: 'Cancelled Artist', status: 'Cancelled'},
    {date: '2026-11-08', name: 'Cancelled Artist', status: 'Cancelled'}
  ];
  assert.equal(context.normalizePublishedEnvelope(missingDay), null);
  assert.equal(context.normalizePublishedEnvelope(duplicateDay), null);
  assert.equal(context.normalizePublishedEnvelope(invalidRevision), null);
  assert.equal(context.normalizePublishedEnvelope(invalidUpdatedAt), null);
  assert.equal(context.normalizePublishedEnvelope(partialSettings), null);
  assert.equal(context.normalizePublishedEnvelope(missingEventField), null);
  assert.equal(context.normalizePublishedEnvelope(extraEventField), null);
  assert.equal(context.normalizePublishedEnvelope(malformedCancellation), null);
  assert.equal(context.normalizePublishedEnvelope(duplicateCancellation), null);
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

test('data-rendering guest scripts wait for shared content while homepage controls bind immediately', () => {
  for (const file of ['menu.js', 'music.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(text, /await \(window\.OwnerPreview\?\.ready \|\| Promise\.resolve\(\)\)/, file);
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /await \(window\.OwnerPreview\?\.ready/);
  assert.match(app, /\(window\.OwnerPreview\?\.ready \|\| Promise\.resolve\(\)\)\.then\(updateHours\)/);
  for (const file of ['index.html', 'menu.html', 'music.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const api = html.indexOf('shared-api.js');
    const bridge = html.indexOf('owner-preview.js');
    const downstream = file === 'menu.html' ? html.indexOf('menu.js') : html.indexOf('music.js');
    assert.ok(api >= 0 && api < bridge && bridge < downstream, `${file} script order`);
  }
});

test('a current or intentionally empty shared lineup remains authoritative while an ended one refreshes safely', () => {
  const music = fs.readFileSync(path.join(root, 'music.js'), 'utf8');
  assert.match(music, /publishedFallbackMode = publishedMode && !ownerViewMode && cancelledEvents !== null &&[\s\S]*publishedLineupNeedsRefresh\(previewState\.events, savedEvents\)/);
  assert.match(music, /if \(sharedScheduleActive\)[\s\S]*Current lineup published by Tolbert’s[\s\S]*return;/);
  assert.match(music, /excludeCancelledEvents\(liveEvents, cancelledEvents\)/);
  assert.match(music, /loadSavedCalendar\(\)\.finally\(refreshCalendar\)/);
  assert.match(music, /When checked November 16, the calendar listed 2:30 pm and the promotional artwork showed 3:00 pm/);
  assert.match(music, /if \(!sharedScheduleActive && !document\.hidden/);
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

test('published phone numbers reach both the dial action and visible menu call prompts', () => {
  const functions = source.slice(source.indexOf('  function phoneHref'), source.indexOf('  function addAnnouncement'));
  const makeLink = textContent => ({
    textContent, children:[], href:'tel:+18174214888',
    matches:() => true, querySelectorAll:() => [],
    getAttribute(name) { return this[name]; },
    setAttribute(name, value) { this[name] = value; }
  });
  const value = '(214) 555-0123';
  const ctx = {api:{state:{settings:{phone:value, address:'Grapevine'}}}, document:{}, URL};
  vm.runInNewContext(functions, ctx);
  for (const [before, after] of [
    ['(817) 421-4888', value],
    ['Call (817) 421-4888', 'Call ' + value],
    ['call the team at (817) 421-4888', 'call the team at ' + value],
    ['Call for seating', 'Call for seating']
  ]) {
    const link = makeLink(before);
    link.matches = selector => selector.includes('tel:');
    ctx.updateSettings(link);
    assert.equal(link.textContent, after);
    assert.equal(link.href, 'tel:2145550123');
  }
});
