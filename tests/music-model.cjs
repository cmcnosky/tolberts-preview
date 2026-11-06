'use strict';

const assert = require('node:assert/strict');
const Music = require('../music-model.js');

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

const show = (overrides = {}) => ({
  name: 'Test Artist',
  genre: 'Texas Music',
  date: '2026-11-04',
  start: '8:00 pm',
  end: '10:00 pm',
  ...overrides
});

test('Chicago civil date is independent of the machine timezone', () => {
  assert.equal(Music.chicagoDate(new Date('2026-11-02T04:30:00Z')), '2026-11-01');
  assert.equal(Music.chicagoDate(new Date('2026-11-02T06:30:00Z')), '2026-11-02');
});

test('Gregorian date validation rejects impossible and normalized dates', () => {
  assert.equal(Music.validDate('2026-11-02'), true);
  assert.equal(Music.validDate('2028-02-29'), true);
  assert.equal(Music.validDate('2026-02-29'), false);
  assert.equal(Music.validDate('2026-02-30'), false);
  assert.equal(Music.validDate('2026-99-01'), false);
  assert.equal(Music.validDate('2026-2-03'), false);
  assert.equal(Music.validDate('not-a-date'), false);
  assert.equal(Music.dateFilterValue('2026-11-02'), '2026-11-02');
  assert.equal(Music.dateFilterValue('2026-02-30'), '');
  assert.equal(Music.dateFilterValue('2026-99-01'), '');
  assert.equal(Music.displayDate('2026-02-30'), 'Date unavailable');
  assert.throws(() => Music.addDays('2026-02-30', 1), /Invalid event date/);
  const future = show({date: '2026-11-04'});
  const now = new Date('2026-11-04T18:00:00Z');
  assert.deepEqual(Music.filterEvents([future], {date: '2026-02-30', now}), [future]);
});

test('date helpers and weekend range use the current or immediately upcoming Fri-Sun only', () => {
  assert.equal(Music.addDays('2026-11-04', 2), '2026-11-06');
  assert.deepEqual(Music.weekendRange('2026-11-04'), {start: '2026-11-06', end: '2026-11-08'});
  assert.deepEqual(Music.weekendRange('2026-11-07'), {start: '2026-11-06', end: '2026-11-08'});
  assert.deepEqual(Music.weekendRange('2026-11-08'), {start: '2026-11-06', end: '2026-11-08'});
  assert.deepEqual(Music.weekendRange('2026-11-09'), {start: '2026-11-13', end: '2026-11-15'});
  assert.equal(Music.isUpcomingWeekend('2026-11-07', '2026-11-04'), true);
  assert.equal(Music.isUpcomingWeekend('2026-11-13', '2026-11-04'), false);
});

test('pending events hide ended listings and preserve chronological order', () => {
  const now = new Date('2026-11-04T18:00:00Z');
  const events = [
    show({name: 'Later', date: '2026-11-05', start: '7:00 pm', end: '9:00 pm'}),
    show({name: 'Ended', date: '2026-11-03', start: '7:00 pm', end: '9:00 pm'}),
    show({name: 'Tonight'})
  ];
  assert.deepEqual(Music.pendingEvents(events, now).map(event => event.name), ['Tonight', 'Later']);
});

test('today events use the Chicago civil date, retain ended sets, and sort by start', () => {
  const now = new Date('2026-11-04T04:30:00Z'); // 10:30 pm Central on November 3.
  const events = [
    show({name: 'Tomorrow Artist', date: '2026-11-04', start: '7:00 pm', end: '9:00 pm'}),
    show({name: 'House Band', date: '2026-11-03', start: '10:45 pm', end: '11:45 pm'}),
    show({name: 'Two-Set Artist', date: '2026-11-03', start: '7:00 pm', end: '8:00 pm'}),
    show({name: 'Two-Set Artist', date: '2026-11-03', start: '5:00 pm', end: '6:00 pm'}),
    show({name: 'Yesterday Artist', date: '2026-11-02', start: '8:00 pm', end: '10:00 pm'})
  ];

  assert.deepEqual(
    Music.todayEvents(events, now).map(event => `${event.name}|${event.start}`),
    ['Two-Set Artist|5:00 pm', 'Two-Set Artist|7:00 pm', 'House Band|10:45 pm']
  );
  assert.equal(Music.isPending(Music.todayEvents(events, now)[0], now), false);
});

test('today events never substitute the next date when today has no listing', () => {
  const now = new Date('2026-11-03T18:00:00Z'); // Noon Central on November 3.
  const events = [
    show({name: 'Tomorrow Artist', date: '2026-11-04'}),
    show({name: 'Later This Week', date: '2026-11-06'})
  ];

  assert.deepEqual(Music.todayEvents(events, now), []);
});

test('today events omit a malformed same-day listing instead of breaking the daily panel', () => {
  const now = new Date('2026-11-06T18:00:00Z');
  const events = [
    show({name: 'Valid Artist', date: '2026-11-06', start: '9:00 pm', end: '11:59 pm'}),
    show({name: 'Bad Start', date: '2026-11-06', start: '25:00 pm'}),
    show({name: 'Bad End', date: '2026-11-06', end: 'later'}),
  ];
  assert.deepEqual(Music.todayEvents(events, now).map(event => event.name), ['Valid Artist']);
});

test('Tonight, exact upcoming-weekend, date, and tokenized text filters compose correctly', () => {
  const now = new Date('2026-11-04T18:00:00Z');
  const events = [
    show({name: 'Tonight Artist', genre: 'Classic Country'}),
    show({name: 'Tuff É Nuff', genre: 'Texas Blues', date: '2026-11-06', start: '9:00 pm', end: '11:59 pm'}),
    show({name: 'Sunday Band', genre: 'Rock', date: '2026-11-08', start: '3:00 pm', end: '6:00 pm'}),
    show({name: 'Next Weekend', genre: 'Texas Blues', date: '2026-11-13', start: '9:00 pm', end: '11:00 pm'})
  ];
  assert.deepEqual(Music.filterEvents(events, {filter: 'tonight', now}).map(event => event.name), ['Tonight Artist']);
  assert.deepEqual(Music.filterEvents(events, {filter: 'weekend', now}).map(event => event.name), ['Tuff É Nuff', 'Sunday Band']);
  assert.deepEqual(Music.filterEvents(events, {date: '2026-11-08', now}).map(event => event.name), ['Sunday Band']);
  assert.deepEqual(Music.filterEvents(events, {query: 'tuff texas', now}).map(event => event.name), ['Tuff É Nuff']);
  assert.deepEqual(Music.filterEvents(events, {filter: 'weekend', query: 'blues', now}).map(event => event.name), ['Tuff É Nuff']);
});

test('Tonight retains a still-running previous-date show after local midnight', () => {
  const now = new Date('2026-11-08T06:30:00Z'); // 12:30 am Central on Sunday.
  const events = [
    show({name: 'Late Saturday', date: '2026-11-07', start: '11:00 pm', end: '1:00 am'}),
    show({name: 'Sunday Night', date: '2026-11-08', start: '7:00 pm', end: '9:00 pm'})
  ];
  assert.deepEqual(Music.filterEvents(events, {filter: 'tonight', now}).map(event => event.name), ['Late Saturday', 'Sunday Night']);
});

test('event key and share URL round-trip the exact date-name-start identity', () => {
  const event = show({name: 'Alice & The Springs', start: '7:00 pm'});
  const key = '2026-11-04|Alice & The Springs|7:00 pm';
  assert.equal(Music.eventKey(event), key);
  const url = new URL(Music.shareUrl(event, 'https://example.com/tolberts-preview/'));
  assert.equal(url.pathname, '/tolberts-preview/music.html');
  assert.equal(url.searchParams.get('show'), key);
  assert.equal([...url.searchParams.keys()].join(','), 'show');
});

test('Central conversion distinguishes summer daylight time from winter standard time', () => {
  assert.equal(Music.zonedUtc('2026-07-04', '7:00 pm').toISOString(), '2026-07-05T00:00:00.000Z');
  assert.equal(Music.zonedUtc('2026-11-02', '7:00 pm').toISOString(), '2026-11-03T01:00:00.000Z');
});

test('inferred overnight end uses the next Central civil date across fall DST', () => {
  const event = show({date: '2026-10-31', start: '11:00 pm', end: '2:00 am'});
  assert.equal(Music.eventStart(event).toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(Music.eventEnd(event).toISOString(), '2026-11-01T08:00:00.000Z');
});

test('inferred overnight end uses the next Central civil date across spring DST', () => {
  const event = show({date: '2026-03-07', start: '11:00 pm', end: '3:00 am'});
  assert.equal(Music.eventStart(event).toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(Music.eventEnd(event).toISOString(), '2026-03-08T08:00:00.000Z');
});

test('explicit endDate remains authoritative across fall DST', () => {
  const event = show({date: '2026-10-31', endDate: '2026-11-01', start: '11:00 pm', end: '2:00 am'});
  assert.equal(Music.eventEnd(event).toISOString(), '2026-11-01T08:00:00.000Z');
});

test('invalid event clocks are rejected instead of producing a misleading time', () => {
  assert.throws(() => Music.hour24('13:00 pm'), /Invalid event time/);
  assert.throws(() => Music.hour24('9:75 pm'), /Invalid event time/);
  assert.throws(() => Music.hour24('n/a'), /Invalid event time/);
});

test('ICS TEXT escaping removes raw CR/LF and escapes punctuation and backslashes', () => {
  const escaped = Music.icsText('path\\name, semi; first\nsecond\r\nthird\rfourth');
  assert.equal(escaped, 'path\\\\name\\, semi\\; first\\nsecond\\nthird\\nfourth');
  assert.doesNotMatch(escaped, /[\r\n]/);
});

test('UTF-8 ICS folding stays within 75 octets and unfolds losslessly', () => {
  const original = `DESCRIPTION:${'jalapeño 🌶️ • '.repeat(20)}end`;
  const folded = Music.foldIcsLine(original);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  lines.forEach((line, index) => {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `physical line ${index + 1} exceeds 75 octets`);
    if (index) assert.ok(line.startsWith(' '));
  });
  assert.equal(folded.replace(/\r\n /g, ''), original);
});

test('calendar output preserves DST-safe times, escaping, folding, and source disclosure', () => {
  const event = show({
    id: 123,
    name: 'Artist, One; Two\\Three',
    genre: `Texas Blues ${'🌶️'.repeat(40)}`,
    date: '2026-11-02',
    start: '7:00 pm',
    end: '9:00 pm'
  });
  const text = Music.buildIcs(event, {live: true, now: new Date('2026-11-01T18:00:00Z')});
  assert.match(text, /\r\nDTSTART:20261103T010000Z\r\n/);
  assert.match(text, /\r\nDTEND:20261103T030000Z\r\n/);
  assert.match(text.replace(/\r\n /g, ''), /SUMMARY:Artist\\, One\\; Two\\\\Three at Tolbert’s/);
  assert.match(text.replace(/\r\n /g, ''), /From the restaurant’s live calendar\./);
  assert.ok(text.endsWith('\r\n'));
  for (const line of text.split('\r\n').slice(0, -1)) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});

test('calendar description does not add duplicate punctuation to an event genre', () => {
  const text = Music.buildIcs(show({genre: 'Variety hits!'}), {live: true});
  assert.match(text.replace(/\r\n /g, ''), /DESCRIPTION:Variety hits! From the restaurant’s live calendar\./);
  assert.doesNotMatch(text.replace(/\r\n /g, ''), /Variety hits!\./);
  const fallback = Music.buildIcs(show({genre: '   '}), {live: true});
  assert.match(fallback.replace(/\r\n /g, ''), /DESCRIPTION:Live music\. From the restaurant’s live calendar\./);
});

test('saved calendar output states its dated fallback rather than implying a live check', () => {
  const text = Music.buildIcs(show(), {live: false, now: new Date('2026-11-01T18:00:00Z')});
  assert.match(text.replace(/\r\n /g, ''), /Saved schedule checked November 6\\, 2026\./);
});

test('owner-preview calendar downloads have a demo title, distinct identity, and correctly escaped disclosure', () => {
  const event = show({genre: 'A long genre ' + 'music '.repeat(30)});
  const text = Music.buildIcs(event, {preview: true, live: true});
  const unfolded = text.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:DEMO: /);
  assert.match(unfolded, /UID:owner-demo-/);
  assert.match(unfolded, /Owner preview from this browser\\; not the official calendar\./);
  assert.doesNotMatch(unfolded, /Saved schedule checked|From the restaurant’s live calendar/);
  for (const line of text.split('\r\n').slice(0, -1)) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});

let passed = 0;
for (const {name, fn} of tests) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exitCode = 1;
