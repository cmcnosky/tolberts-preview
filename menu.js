(async () => {
'use strict';
const earlySearch = $('#dish-search'), earlyCategory = $('#category-select'), earlyForm = $('.menu-search-form');
const initialParams = new URLSearchParams(location.search);
const pendingChoice = {
  query: initialParams.get('q') || earlySearch.value || '',
  category: initialParams.get('category') || earlyCategory.value || 'All dishes',
  queryTouched: false,
  categoryTouched: false,
  ready: false
};
earlySearch.value = pendingChoice.query;
if ([...earlyCategory.options].some(option => option.value === pendingChoice.category)) earlyCategory.value = pendingChoice.category;
earlySearch.addEventListener('input', () => {
  if (pendingChoice.ready) return;
  pendingChoice.query = earlySearch.value;
  pendingChoice.queryTouched = true;
});
earlyCategory.addEventListener('change', () => {
  if (pendingChoice.ready) return;
  pendingChoice.category = earlyCategory.value;
  pendingChoice.categoryTouched = true;
});
earlyForm.addEventListener('submit', event => {
  if (pendingChoice.ready) return;
  event.preventDefault();
  pendingChoice.query = earlySearch.value;
  pendingChoice.queryTouched = true;
});
document.addEventListener('click', event => {
  if (pendingChoice.ready) return;
  const link = event.target.closest?.('.menu-sidebar [data-category]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  pendingChoice.category = link.dataset.category;
  pendingChoice.categoryTouched = true;
  if ([...earlyCategory.options].some(option => option.value === pendingChoice.category)) earlyCategory.value = pendingChoice.category;
});
await (window.OwnerPreview?.ready || Promise.resolve());
const search = $('#dish-search'), categorySelect = $('#category-select');
const dishes = $$('.menu-item'), groups = $$('.menu-group');
const categories = new Set(['All dishes', ...dishes.map(dish => dish.dataset.category)]);
const normalize = MenuSearch.normalize;
const searchable = new Map(dishes.map(dish => [dish, MenuSearch.textFor({
  name:$('h3',dish).textContent,
  description:$('p',dish)?.textContent || '',
  price:$('.item-price',dish).textContent,
  category:dish.dataset.category
})]));
let category = 'All dishes';
function readLocation() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  category = categories.has(params.get('category')) ? params.get('category') : 'All dishes';
  renderMenu(false);
}
function updateLocation(push = false) {
  const url = new URL(location.href);
  const query = search.value.trim();
  query ? url.searchParams.set('q',query) : url.searchParams.delete('q');
  category === 'All dishes' ? url.searchParams.delete('category') : url.searchParams.set('category',category);
  if (url.href !== location.href) history[push ? 'pushState' : 'replaceState']({}, '', url);
}
function renderMenu(update = true, push = false) {
  const query = normalize(search.value), terms = query.split(/\s+/).filter(Boolean); let count = 0;
  dishes.forEach(dish => {const match = (category === 'All dishes' || dish.dataset.category === category) && terms.every(term => searchable.get(dish).includes(term)); dish.hidden = !match; if (match) count++;});
  $('#dietary-guidance').hidden = !/gluten|allerg|vegetarian|vegan|dairy|nut.?free/.test(query);
  groups.forEach(group => group.hidden = $$('.menu-item',group).every(dish => dish.hidden));
  $('#menu-count').textContent = `${count} ${count === 1 ? 'entry' : 'entries'}${category === 'All dishes' ? '' : ' · ' + category}`;
  $('#empty-menu').hidden = count > 0;
  $('#clear-menu').hidden = !query && category === 'All dishes';
  categorySelect.value = category;
  $$('[data-category]', $('.menu-sidebar')).forEach(link => {if (link.dataset.category === category) link.setAttribute('aria-current','true'); else link.removeAttribute('aria-current');});
  if (update) updateLocation(push);
}
search.addEventListener('input', () => renderMenu());
$('.menu-search-form').addEventListener('submit', event => {event.preventDefault(); renderMenu(); $('#menu-count').scrollIntoView({block:'center',behavior:'auto'});});
categorySelect.addEventListener('change', () => {category = categorySelect.value; renderMenu(true,true);});
$$('.menu-sidebar [data-category]').forEach(link => link.addEventListener('click', event => {if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); category = link.dataset.category; renderMenu(true,true); $('#menu-count').scrollIntoView({block:'center',behavior:'auto'});}));
function resetMenu() {search.value = ''; category = 'All dishes'; renderMenu(true,true); search.focus();}
$('#clear-menu').addEventListener('click',resetMenu); $('#reset-menu').addEventListener('click',resetMenu);
window.addEventListener('popstate',readLocation);
const interactedBeforeReady = pendingChoice.queryTouched || pendingChoice.categoryTouched;
search.value = pendingChoice.queryTouched ? pendingChoice.query : (initialParams.get('q') || '');
const initialCategory = pendingChoice.categoryTouched ? pendingChoice.category : initialParams.get('category');
category = categories.has(initialCategory) ? initialCategory : 'All dishes';
pendingChoice.ready = true;
renderMenu(interactedBeforeReady);
})();
