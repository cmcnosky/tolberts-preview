const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'shared-api.js'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); }
  };
}

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return payload == null ? '' : JSON.stringify(payload); }
  };
}

function loadClient(fetchImpl, initialSession = {}) {
  const sessionStorage = storage(initialSession);
  const localStorage = storage();
  const window = {
    sessionStorage,
    localStorage,
    setTimeout,
    clearTimeout
  };
  const context = {
    window,
    fetch: fetchImpl,
    AbortController,
    Date,
    JSON,
    Object,
    Error,
    URL,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context, {filename: 'shared-api.js'});
  return {api: window.TolbertsAPI, sessionStorage, localStorage};
}

const sessionPayload = {
  token: 'opaque-token-value',
  user: {username: 'Steven', name: 'Steven'},
  expiresAt: '2099-01-01T00:00:00.000Z'
};

test('login stores the opaque token only in sessionStorage and authenticated calls use a Bearer header', async () => {
  const calls = [];
  const {api, sessionStorage, localStorage} = loadClient(async (url, options) => {
    calls.push({url, options});
    if (url.endsWith('/api/v1/session')) return jsonResponse(200, sessionPayload);
    return jsonResponse(200, {revision: 4, state: {version: 1}, updatedAt: '2026-11-06T12:00:00.000Z'});
  });

  await api.login(' Steven ', 'private-password');
  await api.getWorkspace();

  assert.deepEqual(JSON.parse(sessionStorage.snapshot()[api.SESSION_KEY]), sessionPayload);
  assert.deepEqual(localStorage.snapshot(), {});
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {username: 'Steven', password: 'private-password'});
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer opaque-token-value');
  assert.ok(calls.every((call) => !call.url.includes('opaque-token-value')));
  assert.ok(calls.every((call) => call.options.credentials === 'omit'));
});

test('a 401 response clears the browser session', async () => {
  let call = 0;
  const {api, sessionStorage} = loadClient(async (url) => {
    call += 1;
    return call === 1 && url.endsWith('/api/v1/session')
      ? jsonResponse(200, sessionPayload)
      : jsonResponse(401, {error: {message: 'Expired'}});
  });

  await api.login('Steven', 'private-password');
  await assert.rejects(api.getWorkspace(), (error) => error.status === 401 && error.message === 'Expired');
  assert.equal(sessionStorage.snapshot()[api.SESSION_KEY], undefined);
});

test('revision conflicts preserve the server latest-state payload for owner reconciliation', async () => {
  const latest = {revision: 9, state: {version: 1, marker: 'latest'}, updatedAt: '2026-11-06T13:00:00.000Z'};
  let call = 0;
  const {api} = loadClient(async (url, options) => {
    call += 1;
    if (call === 1) return jsonResponse(200, sessionPayload);
    assert.equal(url.endsWith('/api/v1/workspace'), true);
    assert.deepEqual(JSON.parse(options.body), {expectedRevision: 8, state: {version: 1, marker: 'edit'}});
    return jsonResponse(409, {error: {code: 'revision_conflict', message: 'Changed elsewhere', details: latest}});
  });

  await api.login('Steven', 'private-password');
  await assert.rejects(
    api.saveWorkspace(8, {version: 1, marker: 'edit'}),
    (error) => error.status === 409 && error.payload.error.details.revision === 9 && error.payload.error.details.state.marker === 'latest'
  );
});

test('password rotation replaces the stored token without putting either password in storage', async () => {
  const rotated = {...sessionPayload, token: 'rotated-token'};
  const calls = [];
  const {api, sessionStorage} = loadClient(async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? jsonResponse(200, sessionPayload) : jsonResponse(200, rotated);
  });

  await api.login('Steven', 'old-private-password');
  await api.changePassword('old-private-password', 'new-private-password');

  const stored = sessionStorage.snapshot()[api.SESSION_KEY];
  assert.equal(JSON.parse(stored).token, 'rotated-token');
  assert.equal(stored.includes('old-private-password'), false);
  assert.equal(stored.includes('new-private-password'), false);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer opaque-token-value');
  assert.deepEqual(JSON.parse(calls[1].options.body), {currentPassword: 'old-private-password', newPassword: 'new-private-password'});
});

test('public reads are unauthenticated and do not create a session', async () => {
  const calls = [];
  const {api, sessionStorage} = loadClient(async (url, options) => {
    calls.push({url, options});
    return jsonResponse(200, {revision: 3, content: {menu: []}, updatedAt: '2026-11-06T13:00:00.000Z'});
  });

  const result = await api.getPublic();
  assert.equal(result.revision, 3);
  assert.equal(calls[0].url, `${api.base}/api/v1/public`);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(sessionStorage.snapshot(), {});
});

test('shared image tokens resolve only when they match the backend contract exactly', () => {
  const {api} = loadClient(async () => jsonResponse(200, {}));
  const hash = 'a'.repeat(64);
  assert.equal(api.assetUrl(`shared:${hash}.webp`), `${api.base}/api/v1/images/${hash}.webp`);
  assert.equal(api.assetUrl(`shared:${hash}.png`), `${api.base}/api/v1/images/${hash}.png`);
  assert.equal(api.assetUrl(`shared:${hash}.jpg`), `${api.base}/api/v1/images/${hash}.jpg`);
  assert.equal(api.assetUrl(`shared:${hash}.jpeg`, 'fallback.webp'), 'fallback.webp');
  assert.equal(api.assetUrl(`shared:${'A'.repeat(64)}.webp`, 'fallback.webp'), 'fallback.webp');
  assert.equal(api.assetUrl('shared:../secret.webp', 'fallback.webp'), 'fallback.webp');
  assert.equal(api.assetUrl('assets/stage.webp'), 'assets/stage.webp');
});

test('expired stored sessions are removed before an authenticated fetch begins', async () => {
  let fetched = false;
  const expired = JSON.stringify({...sessionPayload, expiresAt: '2000-01-01T00:00:00.000Z'});
  const {api, sessionStorage} = loadClient(async () => { fetched = true; return jsonResponse(200, {}); }, {
    'tolberts-owner-cloud-session-v1': expired
  });

  assert.equal(api.session(), null);
  await assert.rejects(api.getWorkspace(), (error) => error.status === 401);
  assert.equal(fetched, false);
  assert.deepEqual(sessionStorage.snapshot(), {});
});
