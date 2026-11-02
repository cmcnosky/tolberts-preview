'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const menuToggle = $('.nav-toggle');
const navigation = $('#mobile-nav');
function closeNavigation(returnFocus = false) {
  if (!menuToggle || !navigation) return;
  navigation.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  if (returnFocus) menuToggle.focus();
}
menuToggle?.addEventListener('click', () => {
  const open = navigation.hidden;
  navigation.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  navigation.style.top = `${$('.header').getBoundingClientRect().bottom}px`;
});
$$('#mobile-nav a').forEach(a => a.addEventListener('click', () => {
  closeNavigation();
  const destination = new URL(a.href, location.href);
  if (destination.pathname === location.pathname && destination.hash) {
    const target = document.getElementById(destination.hash.slice(1));
    if (target) {target.setAttribute('tabindex', '-1'); target.focus({preventScroll:true});}
  }
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation && !navigation.hidden) closeNavigation(true);
});
document.addEventListener('click', event => {
  if (navigation && !navigation.hidden && !navigation.contains(event.target) && !menuToggle.contains(event.target)) closeNavigation();
});
window.addEventListener('resize', () => closeNavigation());
const returnFocus = new WeakMap();
function openDialog(dialog, opener = document.activeElement) {
  returnFocus.set(dialog, opener);
  dialog.showModal();
}
$$('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const opener = returnFocus.get(dialog);
    if (opener?.isConnected) opener.focus();
    else if (opener?.dataset.event) ($$('[data-event]').find(button => button.dataset.event === opener.dataset.event) || $('[data-filter].active'))?.focus();
  });
});
