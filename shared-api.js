/* Shared API client for Tolbert's public preview and authenticated owner workspace. */
(() => {
  'use strict';

  const base = 'https://tolberts-main-street-reimagined.cmcnosky.chatgpt.site';
  const SESSION_KEY = 'tolberts-owner-cloud-session-v1';
  const IMAGE_PATTERN = /^shared:([a-f0-9]{64})\.(webp|png|jpg)$/;

  class APIError extends Error {
    constructor(message, status = 0, payload = null) {
      super(message);
      this.name = 'TolbertsAPIError';
      this.status = status;
      this.payload = payload;
    }
  }

  function storage() {
    try { return window.sessionStorage; }
    catch { return null; }
  }

  function clearSession() {
    try { storage()?.removeItem(SESSION_KEY); }
    catch { /* A blocked store is equivalent to an empty session. */ }
  }

  function normalizeSession(value) {
    if (!value || typeof value !== 'object') return null;
    const token = typeof value.token === 'string' ? value.token.trim() : '';
    const expiresAt = typeof value.expiresAt === 'string' ? value.expiresAt : '';
    const expires = Date.parse(expiresAt);
    const user = value.user && typeof value.user === 'object' ? {
      username: String(value.user.username || ''),
      name: String(value.user.name || value.user.username || '')
    } : null;
    if (!token || !user?.username || !Number.isFinite(expires) || expires <= Date.now()) return null;
    return {token, user, expiresAt};
  }

  function session() {
    let parsed = null;
    try {
      const raw = storage()?.getItem(SESSION_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      clearSession();
      return null;
    }
    const current = normalizeSession(parsed);
    if (!current) clearSession();
    return current;
  }

  function storeSession(value) {
    const current = normalizeSession(value);
    if (!current) throw new APIError('The server returned an invalid sign-in session.');
    try {
      const target = storage();
      if (!target) throw new Error('session storage unavailable');
      target.setItem(SESSION_KEY, JSON.stringify(current));
    } catch {
      throw new APIError('This browser cannot keep the owner session. Allow session storage and try again.');
    }
    return current;
  }

  function messageFor(payload, response) {
    const candidate = payload?.error?.message || payload?.message || payload?.error;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (response.status === 401) return 'Your owner session has expired. Sign in again.';
    if (response.status === 409) return 'The workspace changed on another device.';
    return `The Tolbert's service could not complete this request (${response.status}).`;
  }

  async function request(path, {method = 'GET', body, auth = false, signal, timeoutMs = 30000} = {}) {
    const headers = {Accept: 'application/json'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const current = session();
      if (!current) throw new APIError('Sign in to continue.', 401);
      headers.Authorization = `Bearer ${current.token}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const relayAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) relayAbort();
    else signal?.addEventListener('abort', relayAbort, {once: true});
    let response;
    let payload = null;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
      if (response.status !== 204) {
        const text = await response.text();
        if (text) {
          try { payload = JSON.parse(text); }
          catch { throw new APIError('The Tolbert\'s service returned an unreadable response.', response.status); }
        }
      }
    } catch (error) {
      if (error instanceof APIError) throw error;
      if (error?.name === 'AbortError' && signal?.aborted && !timedOut) throw error;
      if (error?.name === 'AbortError' && timedOut) throw new APIError('The Tolbert\'s service timed out. Check your connection and try again.');
      throw new APIError('The Tolbert\'s service could not be reached. Check your connection and try again.');
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener?.('abort', relayAbort);
    }
    if (!response.ok) {
      if (response.status === 401) clearSession();
      throw new APIError(messageFor(payload, response), response.status, payload);
    }
    return payload;
  }

  async function login(username, password) {
    const payload = await request('/api/v1/session', {
      method: 'POST',
      body: {username: String(username || '').trim(), password: String(password || '')}
    });
    return storeSession(payload);
  }

  async function logout() {
    try {
      if (session()) await request('/api/v1/session', {method: 'DELETE', auth: true});
    } finally {
      clearSession();
    }
  }

  async function changePassword(currentPassword, newPassword) {
    const payload = await request('/api/v1/password', {
      method: 'POST',
      auth: true,
      body: {currentPassword: String(currentPassword || ''), newPassword: String(newPassword || '')}
    });
    return storeSession(payload);
  }

  function getWorkspace(options = {}) {
    return request('/api/v1/workspace', {auth: true, signal: options.signal});
  }

  function saveWorkspace(expectedRevision, state, options = {}) {
    return request('/api/v1/workspace', {
      method: 'PUT',
      auth: true,
      body: {expectedRevision, state},
      signal: options.signal
    });
  }

  function getPublic(options = {}) {
    return request('/api/v1/public', {signal: options.signal});
  }

  function assetUrl(value, fallback = '') {
    const text = typeof value === 'string' ? value : '';
    const match = IMAGE_PATTERN.exec(text);
    if (match) {
      return `${base}/api/v1/images/${match[1]}.${match[2]}`;
    }
    return text.startsWith('shared:') ? fallback : (text || fallback);
  }

  window.TolbertsAPI = Object.freeze({
    base,
    SESSION_KEY,
    IMAGE_PATTERN,
    APIError,
    session,
    clearSession,
    login,
    logout,
    changePassword,
    password: changePassword,
    getWorkspace,
    saveWorkspace,
    getPublic,
    assetUrl
  });
})();
