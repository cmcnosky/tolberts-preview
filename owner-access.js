/* Shared public-site entry to the browser-local Tolbert's owner demo. */
(() => {
  'use strict';

  const AUTH = 'tolberts-owner-demo-password-v1';
  const SESSION = 'tolberts-owner-demo-session-v1';
  const OWNER_URL = 'owner.html#overview';
  const entries = [...document.querySelectorAll('[data-owner-entry]')];
  let dialog;
  let form;
  let username;
  let password;
  let submit;
  let error;
  let fallback;
  let opener = null;
  let loginAttempt = 0;

  function readStorage(storageName, key) {
    try {
      return { ok: true, value: window[storageName].getItem(key) };
    } catch {
      return { ok: false, value: null };
    }
  }

  function writeStorage(storageName, key, value) {
    try {
      window[storageName].setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(storageName, key) {
    try {
      window[storageName].removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function ownerSessionIsActive() {
    const session = readStorage('sessionStorage', SESSION);
    return session.ok && session.value === 'Steven';
  }

  function labelTarget(entry) {
    return entry.querySelector('[data-owner-label]') || (entry.hasAttribute('data-owner-label') ? entry : null);
  }

  function syncEntryState() {
    const signedIn = ownerSessionIsActive();
    entries.forEach((entry) => {
      const text = 'Login';
      const target = labelTarget(entry);
      if (target) target.textContent = text;
      else if (entry.childElementCount === 0) entry.textContent = text;
      entry.classList.toggle('is-signed-in', signedIn);
      entry.dataset.ownerSession = signedIn ? 'active' : 'inactive';
      entry.setAttribute('aria-label', text);
    });
    return signedIn;
  }

  function createDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'owner-login-dialog';
    dialog.className = 'owner-login-dialog';
    dialog.setAttribute('aria-labelledby', 'owner-login-title');
    dialog.setAttribute('aria-describedby', 'owner-login-intro owner-login-disclosure');
    dialog.innerHTML = `
      <div class="owner-login-frame">
        <div class="owner-login-heading">
          <div>
            <p class="eyebrow">TOLBERT’S</p>
            <h2 id="owner-login-title">Log in</h2>
          </div>
          <button class="owner-login-close" type="button" data-owner-login-close aria-label="Close login">×</button>
        </div>
        <p id="owner-login-intro" class="owner-login-intro">Sign in to your account.</p>
        <form id="owner-login-form" class="owner-login-form">
          <label for="owner-access-username">Username</label>
          <input id="owner-access-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
          <label for="owner-access-password">Password</label>
          <input id="owner-access-password" name="password" type="password" autocomplete="current-password" required>
          <p id="owner-login-error" class="owner-login-error" role="alert" aria-live="assertive"></p>
          <button class="button owner-login-submit" type="submit">Log in <span aria-hidden="true">↗</span></button>
        </form>
        <p id="owner-login-disclosure" class="owner-login-disclosure">Interactive demo. Changes stay in this browser; purchases are simulated.</p>
        <p class="owner-login-fallback" hidden>Having trouble with browser storage? <a href="owner.html">Use the sign-in page.</a></p>
      </div>`;
    document.body.append(dialog);

    form = dialog.querySelector('#owner-login-form');
    username = dialog.querySelector('#owner-access-username');
    password = dialog.querySelector('#owner-access-password');
    submit = dialog.querySelector('.owner-login-submit');
    error = dialog.querySelector('#owner-login-error');
    fallback = dialog.querySelector('.owner-login-fallback');

    dialog.querySelector('[data-owner-login-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      loginAttempt += 1;
      document.body.classList.remove('owner-login-open');
      form.reset();
      error.textContent = '';
      fallback.hidden = true;
      submit.disabled = false;
      const returnTarget = opener;
      opener = null;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    });
    form.addEventListener('submit', signIn);

    return dialog;
  }

  function showError(message, showFallback = false) {
    error.textContent = message;
    fallback.hidden = !showFallback;
    error.scrollIntoView({ block: 'nearest' });
  }

  function openOwnerLogin(source = null) {
    createDialog();
    if (dialog.open) return;
    const mobileNav = source instanceof HTMLElement ? source.closest('#mobile-nav') : null;
    opener = mobileNav?.hidden ? document.querySelector('.nav-toggle') : (source instanceof HTMLElement ? source : null);

    error.textContent = '';
    fallback.hidden = true;
    document.body.classList.add('owner-login-open');
    try {
      dialog.showModal();
      window.requestAnimationFrame(() => {
        if (dialog.open) username.focus();
      });
    } catch {
      document.body.classList.remove('owner-login-open');
      window.location.assign('owner.html');
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (submit.disabled) return;
    const attempt = ++loginAttempt;
    submit.disabled = true;
    error.textContent = '';
    fallback.hidden = true;

    try {
      const model = window.OwnerModel;
      if (!model || typeof model.verifyDemoLogin !== 'function') {
        showError('Sign-in did not finish loading. Refresh this page or use the sign-in page.', true);
        return;
      }

      const auth = readStorage('localStorage', AUTH);
      if (!auth.ok) {
        showError('This browser is blocking the saved demo password. Use the sign-in page to continue on one page.', true);
        return;
      }

      const valid = await model.verifyDemoLogin(username.value, password.value, auth.value);
      if (attempt !== loginAttempt || !dialog.open) return;
      if (!valid) {
        showError('That username or password does not match this demo.');
        password.select();
        return;
      }

      if (!writeStorage('sessionStorage', SESSION, 'Steven')) {
        showError('This browser cannot keep you signed in between pages. Use the sign-in page instead.', true);
        return;
      }

      form.reset();
      syncEntryState();
      window.location.assign(OWNER_URL);
    } catch {
      if (attempt === loginAttempt && dialog.open) {
        showError('The demo password could not be checked in this browser. Refresh this page or use the sign-in page.', true);
      }
    } finally {
      if (attempt === loginAttempt) submit.disabled = false;
    }
  }

  function plainPrimaryClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  entries.forEach((entry) => {
    entry.addEventListener('click', (event) => {
      if (!plainPrimaryClick(event) || ownerSessionIsActive()) return;
      event.preventDefault();
      openOwnerLogin(entry);
    });
  });

  function consumeEntryRequest() {
    const url = new URL(window.location.href);
    const loginRequested = url.searchParams.get('login') === '1';
    const loggedOut = url.searchParams.get('logged-out') === '1';
    if (loginRequested) url.searchParams.delete('login');
    if (loggedOut) url.searchParams.delete('logged-out');
    if (loginRequested || loggedOut) {
      try {
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Query cleanup is cosmetic; the requested journey still works if history is restricted.
      }
    }
    return { loginRequested, loggedOut };
  }

  function announceSignedOut() {
    let status = document.querySelector('#toast');
    if (!status) {
      status = document.createElement('div');
      status.id = 'owner-access-status';
      status.className = 'owner-access-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      document.body.append(status);
    }
    const message = 'You’re signed out.';
    status.textContent = message;
    status.classList.add('visible');
    window.setTimeout(() => {
      if (status.textContent !== message) return;
      status.classList.remove('visible');
      status.textContent = '';
    }, 4500);
  }

  const entryRequest = consumeEntryRequest();
  if (entryRequest.loggedOut) removeStorage('sessionStorage', SESSION);
  const signedIn = syncEntryState();
  if (entryRequest.loggedOut) announceSignedOut();
  if (entryRequest.loginRequested && !entryRequest.loggedOut && !signedIn) openOwnerLogin();

  window.addEventListener('pageshow', syncEntryState);
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH) return;
    removeStorage('sessionStorage', SESSION);
    syncEntryState();

    if (dialog?.open) {
      loginAttempt += 1;
      submit.disabled = false;
      password.value = '';
      showError('The demo password changed in another tab. Enter the current demo password.');
      password.focus();
    }
  });
})();
