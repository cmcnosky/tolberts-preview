/* Public navigation entry for the private owner sign-in page. */
(() => {
  'use strict';

  const OWNER_URL = 'owner.html#overview';

  function syncEntries() {
    document.querySelectorAll('[data-owner-entry]').forEach((entry) => {
      const label = entry.querySelector('[data-owner-label]') || (entry.hasAttribute('data-owner-label') ? entry : null);
      if (label) label.textContent = 'Login';
      else if (entry.childElementCount === 0) entry.textContent = 'Login';
      if (entry instanceof HTMLAnchorElement) entry.href = OWNER_URL;
      entry.setAttribute('aria-label', 'Login');
      entry.classList.remove('is-signed-in');
      delete entry.dataset.ownerSession;
    });
  }

  function consumeSignedOutNotice() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('logged-out') !== '1') return false;
    url.searchParams.delete('logged-out');
    try {
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Query cleanup is cosmetic; the signed-out navigation still succeeded.
    }
    return true;
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
    status.textContent = 'You’re signed out.';
    status.classList.add('visible');
    window.setTimeout(() => status.classList.remove('visible'), 4500);
  }

  syncEntries();
  if (consumeSignedOutNotice()) announceSignedOut();
  window.addEventListener('pageshow', syncEntries);
})();
