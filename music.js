'use strict';

(async () => {
  await (window.OwnerPreview?.ready || Promise.resolve());
  const grid = $('#show-grid');
  if (!grid || typeof MusicModel === 'undefined') return;

  const count = $('#show-count');
  const source = $('#lineup-source');
  const showMore = $('#show-more');
  const search = $('#show-search');
  const dateSelect = $('#show-date');
  const resetButton = $('#reset-shows');
  const dialog = $('#show-dialog');
  const details = $('#show-details');
  const fullPage = document.body.dataset.musicPage === 'full';
  const savedChecked = 'November 16, 2026';
  const officialCalendar = 'https://tolbertsrestaurant.com/calendar/';
  const previewState = window.OwnerPreview?.state || null;
  const stateMode = Boolean(previewState && Array.isArray(previewState.events));
  const ownerViewMode = Boolean(stateMode && window.OwnerPreview?.active);
  const publishedMode = Boolean(stateMode && window.OwnerPreview?.published);
  const cancelledEvents = Array.isArray(previewState?.cancelledEvents) ? previewState.cancelledEvents : null;
  const previewLink = value => ownerViewMode ? window.OwnerPreview.guestUrl(value) : value;
  const previewPhone = previewState?.settings?.phone || '(817) 421-4888';
  const previewPhoneHref = `tel:${previewPhone.replace(/[^\d+]/g, '') || '+18174214888'}`;
  const previewAddress = previewState?.settings?.address || '423 S. Main Street, Grapevine, Texas 76051';
  const detailAddress = stateMode ? previewAddress : '423 S. Main Street · Grapevine, Texas';
  const directions = stateMode
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(previewAddress)}`
    : 'https://www.google.com/maps/dir/?api=1&destination=Tolbert%27s+Restaurant+423+S+Main+St+Grapevine+TX+76051';

  let savedEvents = [];
  let savedLoaded = false;
  let packagedFallbackLoaded = false;
  let events = [];
  let sharedScheduleActive = stateMode;
  let publishedFallbackMode = false;
  let filter = 'all';
  let query = '';
  let selectedDate = '';
  let expanded = fullPage;
  let liveChecked = null;
  let liveResolved = false;
  let lastFetch = 0;
  let fetching = false;
  let lastOpenedKey = '';
  let dialogWasPushed = false;
  let suppressNextClose = false;
  let pendingFocusKey = '';
  let lastDialogSignature = '';
  let lastTodaySignature = '';

  function ownerPreviewEvents() {
    if (!stateMode) return [];
    return previewState.events
      .filter(event => String(event.status || '').toLowerCase() !== 'cancelled')
      .map(event => ({
        ...event,
        start: window.OwnerPreview.eventTime(event.start),
        end: window.OwnerPreview.eventTime(event.end),
        image: window.OwnerPreview.safeImage(event.image)
      }))
      .filter(event => event.name && MusicModel.validDate(event.date) && event.start && event.end);
  }

  function setSource(message) {
    if (source) source.textContent = message;
  }

  async function loadSavedCalendar() {
    try {
      const response = await fetch('events.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('Saved calendar unavailable');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid saved calendar');
      packagedFallbackLoaded = true;
      savedLoaded = true;
      savedEvents = publishedFallbackMode
        ? MusicModel.excludeCancelledEvents(data, cancelledEvents)
        : data;
      events = savedEvents;
      setSource(`Showing shows saved ${savedChecked} while we check for updates…`);
      renderShows();
    } catch {
      setSource(publishedFallbackMode
        ? 'The current list has ended. Checking Tolbert’s calendar…'
        : 'Checking Tolbert’s calendar…');
    }
  }

  function linkStatusNode() {
    let node = $('#show-query-status') || $('#show-link-status');
    if (!node) {
      node = document.createElement('p');
      node.id = 'show-query-status';
      node.className = 'show-link-status';
      node.setAttribute('role', 'status');
      grid.before(node);
    }
    return node;
  }

  function setLinkStatus(message = '') {
    const node = linkStatusNode();
    node.textContent = message;
    node.hidden = !message;
  }

  function readUrlState() {
    const params = new URL(location.href).searchParams;
    const requestedFilter = params.get('when') || params.get('filter') || 'all';
    filter = MusicModel.VALID_FILTERS.has(requestedFilter) ? requestedFilter : 'all';
    query = (params.get('q') || '').slice(0, 200);
    const requestedDate = params.get('date') || '';
    selectedDate = MusicModel.dateFilterValue(requestedDate);
    if (search) search.value = query;
    if (dateSelect) dateSelect.value = selectedDate;
  }

  function writeBrowseState(mode = 'replaceState') {
    const url = new URL(location.href);
    url.searchParams.delete('filter');
    filter === 'all' ? url.searchParams.delete('when') : url.searchParams.set('when', filter);
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    selectedDate ? url.searchParams.set('date', selectedDate) : url.searchParams.delete('date');
    history[mode]({}, '', url);
  }

  function setImageFallback(image, event) {
    image.addEventListener('error', () => {
      event.image = 'assets/stage.webp';
      event.imageAlt = 'Live music at Tolbert’s';
      image.src = event.image;
      const fullImageLink = image.closest('.detail-image-link');
      if (fullImageLink) fullImageLink.href = event.image;
      image.alt = event.imageAlt;
    }, {once: true});
  }

  function hasArtworkTimeConflict(event) {
    return !sharedScheduleActive && event?.date === '2026-11-22' && event?.start === '2:30 pm' &&
      MusicModel.normalizeText(event?.name) === 'the country dead';
  }

  function monthLabel(date) {
    return new Intl.DateTimeFormat('en-US', {month: 'short', timeZone: 'UTC'})
      .format(new Date(`${date}T12:00:00Z`))
      .toUpperCase();
  }

  function renderDateOptions(now = Date.now()) {
    if (!dateSelect) return;
    const dates = [...new Set(MusicModel.pendingEvents(events, now).map(event => event.date).filter(MusicModel.validDate))];
    if (selectedDate && !dates.includes(selectedDate)) dates.push(selectedDate);
    dates.sort();
    dateSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All upcoming dates';
    dateSelect.append(all);
    for (const date of dates) {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = MusicModel.displayDate(date, {long: true, year: true});
      dateSelect.append(option);
    }
    dateSelect.value = selectedDate;
  }

  function updateHero(now = Date.now()) {
    const heroLink = $('#next-show');
    if (!heroLink) return;
    const label = $('#next-show-label');
    const name = $('#next-show-name');
    const time = $('#next-show-time');
    const next = MusicModel.pendingEvents(events, now)[0];
    if (!next) {
      if (label) label.textContent = 'LATEST LINEUP';
      if (name) name.textContent = 'See the official concert calendar';
      else heroLink.textContent = 'See the official concert calendar →';
      heroLink.href = officialCalendar;
      if (time) time.textContent = '';
      return;
    }
    const happening = MusicModel.eventPhase(next, now) === 'live';
    if (label) label.textContent = happening ? 'SCHEDULED NOW' : 'NEXT ON STAGE';
    if (name) name.textContent = next.name;
    else heroLink.textContent = time ? `${next.name} →` : `${MusicModel.displayDate(next.date)} · ${next.name} · ${next.start} →`;
    heroLink.href = previewLink(MusicModel.shareUrl(next, location.href));
    if (time) time.textContent = `${MusicModel.displayDate(next.date, {long: true})} · ${next.start}–${next.end} Central`;
  }

  function renderTodayStage(now = new Date()) {
    const list = $('#today-stage-list');
    if (!list) return;
    const today = MusicModel.chicagoDate(now);
    const artists = MusicModel.todayEvents(events, now);
    const dateLabel = $('#today-stage-date');
    const status = $('#today-stage-source');
    if (dateLabel) dateLabel.textContent = MusicModel.displayDate(today, {long: true});
    const sourceText = source?.textContent || 'Times are Central. Call to confirm.';
    if (status) {
      if (status.textContent !== sourceText) status.textContent = sourceText;
      status.hidden = (sharedScheduleActive || Boolean(liveChecked)) && !/unavailable/i.test(sourceText);
    }
    if (!artists.length) {
      lastTodaySignature = '';
      const message = sharedScheduleActive
        ? 'No show is listed for today. See the full calendar for another date.'
        : !liveResolved
        ? 'Checking today’s artists and set times…'
        : liveChecked
          ? 'No show is listed for today. See another date.'
          : 'Today’s schedule could not be confirmed. Check the official calendar.';
      list.innerHTML = `<p class="today-empty">${esc(message)} <a href="${officialCalendar}" target="_blank" rel="noopener">Official calendar ↗</a></p>`;
      return;
    }
    const signature = JSON.stringify(artists.map(event => [event, MusicModel.eventPhase(event, now)]));
    if (signature === lastTodaySignature) return;
    lastTodaySignature = signature;
    list.innerHTML = artists.map(event => {
      const phase = MusicModel.eventPhase(event, now);
      const ended = phase === 'ended';
      const state = ended ? 'Scheduled set ended' : phase === 'live' ? 'Scheduled now' : 'Later today · View details ↗';
      const href = ended ? previewLink('music.html') : previewLink(MusicModel.shareUrl(event, location.href));
      const image = event.image || 'assets/stage.webp';
      const alt = event.image ? (event.imageAlt || `Promotional image for ${event.name}`) : 'The Tolbert’s stage';
      return `<a class="today-artist" href="${esc(href)}" aria-label="${esc(event.name)}, ${esc(event.start)} to ${esc(event.end)} Central. ${ended ? 'Scheduled set ended. View upcoming shows.' : 'View show details.'}"><img class="today-artist-photo" src="${esc(image)}" alt="${esc(alt)}" width="80" height="80"><span class="today-artist-copy"><span class="today-card-label">Playing today</span><strong class="today-artist-name">${esc(event.name)}</strong><span class="today-artist-time">${esc(event.start)}–${esc(event.end)} <span>Central</span></span><span class="today-artist-state">${esc(state)}</span></span></a>`;
    }).join('');
    $$('.today-artist-photo', list).forEach((image, index) => setImageFallback(image, artists[index]));
  }

  function renderShows() {
    const now = new Date();
    const today = MusicModel.chicagoDate(now);
    const focusedEventKey = grid.contains(document.activeElement)
      ? document.activeElement.closest('[data-event]')?.dataset.event
      : null;
    renderDateOptions(now);
    const matching = MusicModel.filterEvents(events, {
      filter,
      query,
      date: selectedDate,
      now
    });
    const visible = fullPage || expanded ? matching : matching.slice(0, 3);
    const available = MusicModel.pendingEvents(events, now);
    const hasFilters = filter !== 'all' || Boolean(query) || Boolean(selectedDate);
    if (resetButton) resetButton.hidden = !hasFilters;

    if (count) {
      count.textContent = matching.length
        ? `${visible.length} of ${matching.length} upcoming ${matching.length === 1 ? 'show' : 'shows'}`
        : 'No shows match these filters';
    }

    grid.innerHTML = visible.length ? visible.map(event => {
      const key = MusicModel.eventKey(event);
      const link = previewLink(MusicModel.shareUrl(event, location.href));
      const image = event.image || 'assets/stage.webp';
      const imageAlt = event.imageAlt || `${event.name} — promotional image`;
      const phase = MusicModel.eventPhase(event, now);
      const timing = phase === 'live'
        ? '<span class="show-state show-state-live">Scheduled now</span>'
        : event.date === today
          ? '<span class="show-state">Later today</span>'
          : '';
      return `<article class="show-card"><div class="show-image"><img src="${esc(image)}" width="900" height="560" alt="${esc(imageAlt)}" loading="lazy"></div><time class="show-date" datetime="${esc(event.date)}"><span>${monthLabel(event.date)}</span><strong>${Number(event.date.slice(8))}</strong><span class="show-weekday">${new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone: 'UTC'}).format(new Date(`${event.date}T12:00:00Z`))}</span></time><div class="show-copy">${timing}<p class="genre">${esc(event.genre || 'Live music')}</p><h3>${esc(event.name)}</h3><p class="show-time">${esc(event.start)}–${esc(event.end)} Central</p></div><a class="show-detail" data-event="${esc(key)}" href="${esc(link)}" aria-label="Show details for ${esc(event.name)}">Details <span aria-hidden="true">↗</span></a></article>`;
    }).join('') : `<div class="no-results"><p>${available.length ? 'No shows match these filters.' : 'No upcoming shows are listed.'}</p>${hasFilters ? '<button type="button" class="reset-shows" data-reset-shows>Clear filters</button>' : ''}<a class="text-link light" href="${officialCalendar}" target="_blank" rel="noopener">Official calendar ↗</a></div>`;

    if (showMore) {
      showMore.hidden = fullPage || matching.length <= 3;
      showMore.setAttribute('aria-expanded', String(expanded));
      showMore.innerHTML = expanded
        ? 'Show fewer <span aria-hidden="true">↑</span>'
        : `View all ${matching.length} shows <span aria-hidden="true">↓</span>`;
    }

    $$('[data-filter]').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    $$('.show-card', grid).forEach((card, index) => setImageFallback($('img', card), visible[index]));
    if (fullPage) {
      $$('.show-detail', grid).forEach(link => link.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        const show = events.find(item => MusicModel.eventKey(item) === link.dataset.event);
        if (show && MusicModel.isPending(show)) openShowFromPage(show, link);
      }));
    }

    $('[data-reset-shows]', grid)?.addEventListener('click', resetFilters);
    if (focusedEventKey) {
      const replacement = $$('.show-detail', grid).find(link => link.dataset.event === focusedEventKey);
      if (replacement) replacement.focus({preventScroll: true});
      else if (count) {
        count.setAttribute('tabindex', '-1');
        count.focus({preventScroll: true});
      }
    }

    updateHero(now);
    renderTodayStage(now);
    resolveRequestedShow();
  }

  function resetFilters() {
    filter = 'all';
    query = '';
    selectedDate = '';
    expanded = fullPage;
    if (search) search.value = '';
    if (dateSelect) dateSelect.value = '';
    writeBrowseState();
    renderShows();
    (search || $('[data-filter="all"]'))?.focus({preventScroll: true});
  }

  resetButton?.addEventListener('click', resetFilters);

  function actionStatus(message) {
    const node = $('#show-action-status');
    if (node) node.textContent = message;
  }

  function dialogSignature(event) {
    return JSON.stringify([
      MusicModel.eventKey(event),
      event.endDate || '',
      event.end,
      event.genre || '',
      event.image || '',
      event.imageAlt || '',
      MusicModel.eventPhase(event),
      sharedScheduleActive ? 'published' : liveChecked ? 'live' : 'saved'
    ]);
  }

  function downloadCalendar(event) {
    const calendarText = MusicModel.buildIcs(event, {live: Boolean(liveChecked) && !sharedScheduleActive, published: sharedScheduleActive && publishedMode, savedChecked, ...(stateMode ? {address: previewAddress, phone: previewPhone, url: MusicModel.shareUrl(event, location.href)} : {})});
    const blob = new Blob([calendarText], {type: 'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const filename = event.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show';
    anchor.href = url;
    anchor.download = `tolberts-${event.date}-${filename}.ics`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    actionStatus('Calendar download requested. Confirm the schedule before you go.');
  }

  async function copyShowLink(input) {
    try {
      await navigator.clipboard.writeText(input.value);
      actionStatus('Show link copied.');
    } catch {
      input.closest('.show-share-fallback').hidden = false;
      input.focus();
      input.select();
      actionStatus('Copy the selected show link.');
    }
  }

  function showDialogFor(event, opener = document.activeElement) {
    if (!dialog || !details) return;
    const focusedControl = dialog.open && details.contains(document.activeElement)
      ? document.activeElement.id
      : '';
    const share = previewLink(MusicModel.shareUrl(event, location.href));
    const image = event.image || 'assets/stage.webp';
    const imageAlt = event.imageAlt || `${event.name} — promotional image`;
    const savedScheduleNote = sharedScheduleActive || liveChecked
      ? ''
      : `<p class="detail-source">Last checked ${esc(savedChecked)}. Call to confirm the set time.</p>`;
    const artworkAdvisory = hasArtworkTimeConflict(event)
      ? '<p class="detail-note"><strong>Schedule note:</strong> When checked November 16, the calendar listed 2:30 pm and the promotional artwork showed 3:00 pm. Call Tolbert’s to confirm before you go.</p>'
      : '';
    const now = new Date();
    const phase = MusicModel.eventPhase(event, now);
    const timing = phase === 'live'
      ? '<p class="detail-state detail-state-live">Scheduled now</p>'
      : phase === 'upcoming' && event.date === MusicModel.chicagoDate(now)
        ? '<p class="detail-state">Later today</p>'
        : '';
    details.innerHTML = `<div class="detail-layout">
        <figure class="detail-art"><a class="detail-image-link" href="${esc(image)}" target="_blank" rel="noopener" aria-label="Open full-size image for ${esc(event.name)}"><img class="detail-image" src="${esc(image)}" alt="${esc(imageAlt)}"><span>Full image ↗</span></a></figure>
        <div class="detail-heading">${timing}<p class="detail-genre">${esc(event.genre || 'Live music')}</p><h2 id="show-title">${esc(event.name)}</h2>
          <div class="detail-meta"><strong>${esc(MusicModel.displayDate(event.date, {long: true, year: true}))}</strong><span>${esc(event.start)}–${esc(event.end)} <small>Central</small></span></div>
        </div>
        <div class="detail-information">
          <p class="detail-place"><strong>Tolbert’s Restaurant &amp; Chili Parlor</strong><span>${esc(detailAddress)}</span></p>
          <div class="detail-actions"><a class="detail-call" href="${esc(previewPhoneHref)}">Call for seating <span aria-hidden="true">↗</span></a><a href="${esc(previewLink('menu.html'))}">View menu</a><a href="${esc(directions)}" target="_blank" rel="noopener">Directions ↗</a></div>
          <p class="detail-note">For reservations and any cover charge, call the restaurant.</p>${artworkAdvisory}
          <div class="detail-utilities"><button id="save-show" type="button"><span aria-hidden="true">↓</span> Add to calendar</button><button id="copy-show-link" type="button"><span aria-hidden="true">↗</span> Copy show link</button></div>
          <div class="show-share-fallback" hidden><label for="show-share-url">Select and copy this show link</label><input id="show-share-url" type="text" readonly value="${esc(share)}"></div>
          <p id="show-action-status" role="status"></p>${savedScheduleNote}
        </div>
      </div>`;
    setImageFallback($('.detail-image', details), event);
    $('#save-show', details).addEventListener('click', () => downloadCalendar(event));
    $('#copy-show-link', details).addEventListener('click', () => copyShowLink($('#show-share-url', details)));
    lastDialogSignature = dialogSignature(event);
    if (!dialog.open) openDialog(dialog, opener);
    else if (focusedControl) document.getElementById(focusedControl)?.focus();
  }

  function openShowFromPage(event, opener) {
    const url = new URL(location.href);
    const key = MusicModel.eventKey(event);
    url.searchParams.set('show', key);
    history.pushState({tolbertsShow: true}, '', url);
    lastOpenedKey = key;
    dialogWasPushed = true;
    setLinkStatus('');
    showDialogFor(event, opener);
  }

  function replaceWithoutShow() {
    const url = new URL(location.href);
    url.searchParams.delete('show');
    history.replaceState({}, '', url);
  }

  function resolveRequestedShow() {
    const requested = new URL(location.href).searchParams.get('show') || '';
    if (!requested) {
      lastOpenedKey = '';
      lastDialogSignature = '';
      setLinkStatus('');
      return;
    }
    const matching = events.find(event => MusicModel.eventKey(event) === requested);
    if (matching && MusicModel.isPending(matching)) {
      setLinkStatus('');
      const signature = dialogSignature(matching);
      if (lastOpenedKey === requested && dialog?.open && lastDialogSignature === signature) return;
      lastOpenedKey = requested;
      dialogWasPushed = Boolean(history.state?.tolbertsShow);
      const linkedOpener = $$('.show-detail', grid).find(link => link.dataset.event === requested);
      showDialogFor(matching, linkedOpener || document.activeElement);
      return;
    }
    if (!liveResolved) {
      setLinkStatus('Checking that show…');
      return;
    }
    if (dialog?.open) {
      suppressNextClose = true;
      dialog.close();
    }
    lastOpenedKey = requested;
    if (matching) {
      setLinkStatus('That show has ended. Upcoming shows appear below.');
    } else if (sharedScheduleActive) {
      setLinkStatus('That show is not in the upcoming schedule.');
    } else if (liveChecked) {
      setLinkStatus('That show was not found. Upcoming shows appear below.');
    } else {
      setLinkStatus('That show could not be confirmed. Check the official calendar.');
    }
  }

  async function refreshCalendar() {
    if (fetching) return;
    fetching = true;
    lastFetch = Date.now();
    try {
      const liveEvents = await CalendarData.fetchEvents(savedEvents);
      events = publishedFallbackMode
        ? MusicModel.excludeCancelledEvents(liveEvents, cancelledEvents)
        : liveEvents;
      liveChecked = new Date();
      const checked = new Intl.DateTimeFormat('en-US', {
        timeZone: MusicModel.CHICAGO,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(liveChecked);
      setSource(`Checked ${checked} Central. Call to confirm before you go.`);
    } catch {
      if (!liveChecked) events = savedEvents;
      if (liveChecked) {
        setSource('Could not refresh. Showing the last check from this visit.');
      } else if (publishedFallbackMode && packagedFallbackLoaded) {
        setSource(`Showing shows saved ${savedChecked}. Check the official calendar for changes.`);
      } else if (publishedFallbackMode) {
        setSource('No current shows are available here. Check the official calendar.');
      } else if (savedLoaded) {
        setSource(`Showing shows saved ${savedChecked}. Check the official calendar for changes.`);
      } else {
        setSource('Show times are unavailable here. Check the official calendar.');
      }
    } finally {
      liveResolved = true;
      fetching = false;
      renderShows();
    }
  }

  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = MusicModel.VALID_FILTERS.has(button.dataset.filter) ? button.dataset.filter : 'all';
    selectedDate = '';
    expanded = fullPage;
    writeBrowseState();
    renderShows();
  }));

  search?.addEventListener('input', () => {
    query = search.value.trim().slice(0, 200);
    expanded = fullPage;
    writeBrowseState();
    renderShows();
  });

  dateSelect?.addEventListener('change', () => {
    selectedDate = dateSelect.value;
    filter = 'all';
    expanded = fullPage;
    writeBrowseState();
    renderShows();
  });

  showMore?.addEventListener('click', () => {
    expanded = !expanded;
    renderShows();
  });

  dialog?.addEventListener('close', () => {
    if (suppressNextClose) {
      suppressNextClose = false;
      dialogWasPushed = false;
      return;
    }
    const closingKey = new URL(location.href).searchParams.get('show') || lastOpenedKey;
    lastOpenedKey = '';
    if (!new URL(location.href).searchParams.has('show')) return;
    if (dialogWasPushed) {
      pendingFocusKey = closingKey;
      dialogWasPushed = false;
      history.back();
    } else {
      replaceWithoutShow();
    }
  });

  window.addEventListener('popstate', () => {
    const closingKey = lastOpenedKey;
    readUrlState();
    const requested = new URL(location.href).searchParams.get('show');
    if (!requested && dialog?.open) {
      pendingFocusKey = closingKey;
      suppressNextClose = true;
      dialog.close();
    }
    renderShows();
    if (pendingFocusKey && !requested) {
      const replacement = $$('.show-detail', grid).find(link => link.dataset.event === pendingFocusKey);
      replacement?.focus();
      pendingFocusKey = '';
    }
  });

  function refreshTimeSensitiveContent() {
    if (publishedMode && !ownerViewMode && cancelledEvents !== null && sharedScheduleActive &&
        MusicModel.publishedLineupNeedsRefresh(previewState.events, ownerPreviewEvents())) {
      sharedScheduleActive = false;
      publishedFallbackMode = true;
      liveResolved = false;
      setSource('The current list has ended. Checking Tolbert’s calendar…');
      renderShows();
      loadSavedCalendar().finally(refreshCalendar);
      return;
    }
    renderShows();
    if (!sharedScheduleActive && !document.hidden && Date.now() - lastFetch > 300000) refreshCalendar();
  }

  setInterval(refreshTimeSensitiveContent, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTimeSensitiveContent();
  });

  readUrlState();
  if (stateMode) {
    savedLoaded = true;
    savedEvents = ownerPreviewEvents();
    events = savedEvents;
    publishedFallbackMode = publishedMode && !ownerViewMode && cancelledEvents !== null &&
      MusicModel.publishedLineupNeedsRefresh(previewState.events, savedEvents);
    sharedScheduleActive = !publishedFallbackMode;
    if (sharedScheduleActive) {
      liveResolved = true;
      setSource('Times are Central. Call to confirm before you go.');
      renderShows();
      return;
    }
    setSource('The current list has ended. Checking Tolbert’s calendar…');
    renderShows();
    loadSavedCalendar().finally(refreshCalendar);
    return;
  }
  setSource(`Loading shows saved ${savedChecked} and checking Tolbert’s calendar…`);
  loadSavedCalendar().finally(refreshCalendar);
})();
