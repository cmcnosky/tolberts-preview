'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const CalendarData = require(path.join(__dirname, '../calendar-data.js'));

const tests = [];
function test(name, fn) {
  tests.push({name, fn});
}

function response(body, {ok = true, headers = {}} = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok,
    headers: {get: name => normalized.get(String(name).toLowerCase()) ?? null},
    json: async () => body,
  };
}

function post({
  id,
  name,
  genre = 'Live music',
  date,
  start = '19:00:00',
  end = '21:00:00',
  endDate = null,
  image = 0,
}) {
  return {
    id,
    acf: {
      primary_header: name,
      secondary_header: genre,
      date,
      start_time: start,
      end_time: end,
      end_date: endDate,
      image,
    },
  };
}

test('dateValue accepts real calendar dates and rejects malformed/impossible values', () => {
  assert.equal(CalendarData.dateValue('20240229'), '2024-02-29');
  assert.equal(CalendarData.dateValue('20261101'), '2026-11-01');
  for (const value of ['20230229', '20261301', '20260001', '20260132', '2026111', '2026-11-01', '', null, undefined]) {
    assert.equal(CalendarData.dateValue(value), null, `expected ${String(value)} to be rejected`);
  }
});

test('clockValue converts valid 24-hour ACF values and rejects invalid formats', () => {
  assert.equal(CalendarData.clockValue('00:00:00'), '12:00 am');
  assert.equal(CalendarData.clockValue('09:05'), '9:05 am');
  assert.equal(CalendarData.clockValue('12:00:00'), '12:00 pm');
  assert.equal(CalendarData.clockValue('23:59:59'), '11:59 pm');
  for (const value of ['24:00:00', '23:60:00', '12:00:60', '09:05:99', '9:05:00', '09:5:00', '09:05 pm', '', null, undefined]) {
    assert.equal(CalendarData.clockValue(value), null, `expected ${String(value)} to be rejected`);
  }
});

test('normalizeEvent trims names, converts fields, and preserves valid end dates', () => {
  assert.deepEqual(
    CalendarData.normalizeEvent(post({id: 44, name: '  Night Band  ', genre: 'Texas Blues', date: '20261107', start: '21:00:00', end: '01:15:00', endDate: '20261108', image: '1766'})),
    {
      id: 44,
      name: 'Night Band',
      genre: 'Texas Blues',
      date: '2026-11-07',
      start: '9:00 pm',
      end: '1:15 am',
      endDate: '2026-11-08',
      imageId: 1766,
    },
  );
  assert.equal(
    CalendarData.normalizeEvent(post({id: 45, name: 'No Genre', genre: undefined, date: '20261108'})).genre,
    'Live music',
  );
});

test('normalizeEvent rejects incomplete events, impossible clocks/dates, and backwards end dates', () => {
  const invalid = [
    post({id: 1, name: ' ', date: '20261101'}),
    post({id: 2, name: 'Bad Date', date: '20260229'}),
    post({id: 3, name: 'Bad Start', date: '20261101', start: '25:00:00'}),
    post({id: 4, name: 'Bad End', date: '20261101', end: '20:99:00'}),
    post({id: 5, name: 'Bad End Date', date: '20261101', endDate: '20261031'}),
    post({id: 6, name: 'Malformed End Date', date: '20261101', endDate: '2026-11-02'}),
    {id: 7, acf: {}},
  ];
  for (const item of invalid) assert.equal(CalendarData.normalizeEvent(item), null);
});

test('fetchEvents paginates, sorts, sends bounded request options, and restricts media origins', async () => {
  const calls = [];
  const pageOne = [
    post({id: 3, name: 'Later Date', date: '20261103', start: '19:30:00', image: 102}),
    post({id: 2, name: 'Fallback Photo', date: '20261102', start: '19:00:00', image: 101}),
  ];
  const pageTwo = [
    post({id: 1, name: 'Earlier Time', date: '20261102', start: '18:00:00', image: 103}),
    post({id: 4, name: 'Wrong Host', date: '20261104', start: '18:00:00', image: 104}),
  ];
  const fetcher = async (url, options) => {
    calls.push({url, options});
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    if (url.includes('/event?') && !url.includes('&page=')) return response(pageOne, {headers: {'X-WP-TotalPages': 2}});
    if (url.includes('&page=2')) return response(pageTwo);
    if (url.includes('/media?')) {
      return response([
        {id: 102, source_url: 'https://tolbertscms.com/uploads/later.jpg'},
        {id: 101, source_url: 'https://evil.example/fallback.jpg'},
        {id: 103, source_url: 'http://tolbertscms.com/uploads/insecure.jpg'},
        {id: 104, source_url: 'https://cdn.tolbertscms.com/uploads/subdomain.jpg'},
      ]);
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const fallback = [{date: '2026-11-02', name: 'Fallback Photo', image: 'assets/saved.webp'}];
  const events = await CalendarData.fetchEvents(fallback, fetcher);

  assert.deepEqual(events.map(event => event.name), ['Earlier Time', 'Fallback Photo', 'Later Date', 'Wrong Host']);
  assert.equal(events[0].image, 'assets/stage.webp');
  assert.equal(events[0].imageAlt, 'Live music at Tolbert’s');
  assert.equal(events[1].image, 'assets/saved.webp');
  assert.equal(events[1].imageAlt, 'Fallback Photo — promotional image');
  assert.equal(events[2].image, 'https://tolbertscms.com/uploads/later.jpg');
  assert.equal(events[2].imageAlt, 'Later Date — promotional image');
  assert.equal(events[3].image, 'assets/stage.webp');
  assert.equal(events[3].imageAlt, 'Live music at Tolbert’s');
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /event\?per_page=100&_fields=id,acf$/);
  assert.match(calls[1].url, /event\?per_page=100&_fields=id,acf&page=2$/);
  assert.match(calls[2].url, /media\?include=102,101,103,104&per_page=100&_fields=id,source_url$/);
});

test('fetchEvents rejects a non-OK event response', async () => {
  await assert.rejects(
    CalendarData.fetchEvents([], async () => response({}, {ok: false})),
    /Public calendar unavailable/,
  );
});

test('fetchEvents rejects non-array first-page and paginated payloads', async () => {
  await assert.rejects(
    CalendarData.fetchEvents([], async () => response({events: []})),
    /Invalid calendar response/,
  );
  let call = 0;
  await assert.rejects(
    CalendarData.fetchEvents([], async () => ++call === 1
      ? response([post({id: 1, name: 'Good', date: '20261101'})], {headers: {'X-WP-TotalPages': 2}})
      : response({events: []})),
    /Invalid calendar page/,
  );
});

test('fetchEvents rejects excessive pagination and any incomplete listing', async () => {
  await assert.rejects(
    CalendarData.fetchEvents([], async () => response([], {headers: {'X-WP-TotalPages': 11}})),
    /Calendar exceeds supported page limit/,
  );
  await assert.rejects(
    CalendarData.fetchEvents([], async () => response([
      post({id: 1, name: 'Good', date: '20261101'}),
      post({id: 2, name: 'Bad', date: '20260229'}),
    ])),
    /Calendar contains incomplete listings/,
  );
});

test('fetchEvents degrades media failures to saved or stage imagery without losing valid event text', async () => {
  let call = 0;
  const source = [
    post({id: 1, name: 'Saved Image', date: '20261101', image: 201}),
    post({id: 2, name: 'Stage Image', date: '20261102', image: 202}),
  ];
  const fetcher = async () => ++call === 1 ? response(source) : response({}, {ok: false});
  const events = await CalendarData.fetchEvents([{date: '2026-11-01', name: 'Saved Image', image: 'assets/saved.jpg'}], fetcher);
  assert.deepEqual(events.map(event => event.image), ['assets/saved.jpg', 'assets/stage.webp']);
  assert.deepEqual(events.map(event => event.name), ['Saved Image', 'Stage Image']);
});

test('fetchEvents accepts an empty authoritative event list and skips media lookup', async () => {
  let calls = 0;
  const events = await CalendarData.fetchEvents([], async () => {calls++; return response([]);});
  assert.deepEqual(events, []);
  assert.equal(calls, 1);
});

test('fetchEvents propagates transport/abort failures for the caller to apply its dated fallback', async () => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  await assert.rejects(CalendarData.fetchEvents([], async () => {throw error;}), candidate => candidate === error);
});

(async () => {
  let passed = 0;
  for (const {name, fn} of tests) {
    try {
      await fn();
      passed++;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
  if (passed !== tests.length) process.exitCode = 1;
})();
