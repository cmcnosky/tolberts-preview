/* Browser-local bridge from the interactive owner demo to the guest preview. */
(() => {
  'use strict';

  const STORE_KEY = 'tolberts-owner-demo-v1';
  const PREVIEW_PARAM = 'owner-preview';
  const GUEST_PAGES = new Set(['index.html', 'menu.html', 'music.html']);
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const active = new URL(location.href).searchParams.get(PREVIEW_PARAM) === '1';

  const text = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);
  const validDate = value => {
    const source = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return false;
    const date = new Date(`${source}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === source;
  };
  const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ||
    /^(?:1[0-2]|[1-9]):[0-5]\d\s*(?:am|pm)$/i.test(String(value || '').trim());
  const safeImage = value => {
    const source = String(value || '');
    if (/^assets\/[a-zA-Z0-9._-]+$/.test(source)) return source;
    if (source.length <= 850000 && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(source)) return source;
    return 'assets/stage.webp';
  };

  function normalizeState(value) {
    if (!value || typeof value !== 'object' ||
        !Array.isArray(value.menu) || !Array.isArray(value.events) ||
        !Array.isArray(value.hours) || !Array.isArray(value.exceptions) ||
        !value.settings || typeof value.settings !== 'object') return null;

    const menu = value.menu.map((item, index) => ({
      id: text(item?.id || `menu-preview-${index + 1}`, 120),
      category: text(item?.category || 'Uncategorized', 100),
      name: text(item?.name || 'Untitled item', 150),
      description: text(item?.description, 1200),
      price: text(item?.price, 240),
      available: item?.available !== false
    }));
    const events = value.events.map((event, index) => ({
      id: text(event?.id || `show-preview-${index + 1}`, 120),
      name: text(event?.name || 'Untitled show', 160),
      genre: text(event?.genre, 180),
      date: text(event?.date, 10),
      start: text(event?.start, 20),
      end: text(event?.end, 20),
      image: safeImage(event?.image),
      imageAlt: text(event?.imageAlt || (event?.name ? `Promotional image for ${event.name}` : 'Live music at Tolbert’s'), 240),
      status: text(event?.status || 'Scheduled', 40)
    })).filter(event => event.name && validDate(event.date) && validTime(event.start) && validTime(event.end));
    const hours = value.hours.map(hour => ({
      day: text(hour?.day, 20),
      open: text(hour?.open, 10),
      close: text(hour?.close, 10),
      closed: Boolean(hour?.closed)
    })).filter(hour => DAYS.includes(hour.day) && (hour.closed || (validTime(hour.open) && validTime(hour.close))));
    const exceptions = value.exceptions.map(exception => ({
      id: text(exception?.id, 120),
      date: text(exception?.date, 10),
      label: text(exception?.label || 'Special hours', 120),
      open: text(exception?.open, 10),
      close: text(exception?.close, 10),
      closed: Boolean(exception?.closed)
    })).filter(exception => validDate(exception.date) && (exception.closed || (validTime(exception.open) && validTime(exception.close))));

    return {
      version: Number(value.version) || 1,
      menu,
      events,
      hours,
      exceptions,
      settings: {
        phone: text(value.settings.phone || '(817) 421-4888', 40),
        address: text(value.settings.address || '423 South Main Street, Grapevine, Texas 76051', 220),
        announcement: text(value.settings.announcement, 1200)
      }
    };
  }

  function readState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch {
      return null;
    }
  }

  function eventTime(value) {
    const source = text(value, 20);
    const existing = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(source);
    if (existing) return `${Number(existing[1])}:${existing[2]} ${existing[3].toLowerCase()}`;
    const time = /^(\d{2}):(\d{2})$/.exec(source);
    if (!time) return '';
    const hour = Number(time[1]);
    return `${hour % 12 || 12}:${time[2]} ${hour < 12 ? 'am' : 'pm'}`;
  }

  function displayTime(value) {
    const normalized = eventTime(value);
    if (!normalized) return 'Time unavailable';
    if (normalized === '12:00 am') return 'midnight';
    return normalized.replace(':00 ', ' ');
  }

  function guestUrl(value) {
    if (!active) return String(value || '');
    let url;
    try { url = new URL(value, location.href); } catch { return String(value || ''); }
    if (url.origin !== location.origin) return url.href;
    const finalSegment = url.pathname.split('/').filter(Boolean).pop() || 'index.html';
    const page = finalSegment.includes('.') ? finalSegment : 'index.html';
    if (!GUEST_PAGES.has(page)) return url.href;
    url.searchParams.set(PREVIEW_PARAM, '1');
    return url.href;
  }

  const api = {
    active,
    state: active ? readState() : null,
    eventTime,
    displayTime,
    guestUrl,
    safeImage
  };
  window.OwnerPreview = api;
  if (!active) return;

  document.body.classList.add('owner-preview-active');

  function addStyles() {
    const style = document.createElement('style');
    style.id = 'owner-preview-styles';
    style.textContent = `
      :root{--owner-preview-banner-height:46px}
      .owner-preview-banner{position:sticky;top:0;z-index:2000;display:flex;align-items:center;justify-content:center;gap:10px 18px;min-height:46px;padding:9px 18px;border-bottom:2px solid #e9b852;color:#f3e9d2;background:#173c32;font:700 13px/1.35 'DM Sans',Arial,sans-serif;letter-spacing:.01em;text-align:center}
      .owner-preview-banner strong{color:#e9b852;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:18px;letter-spacing:.06em;text-transform:uppercase}
      .owner-preview-banner a{min-height:30px;display:inline-flex;align-items:center;border-bottom:1px solid #e9b852;color:#f3e9d2;text-decoration:none}
      .owner-preview-banner a:hover{text-decoration:none;border-bottom-width:2px}
      .owner-preview-active .header{top:var(--owner-preview-banner-height)!important}
      .owner-preview-active .skip:focus{top:calc(var(--owner-preview-banner-height) + 10px);z-index:2100}
      .owner-preview-active .food-pick .price{max-width:min(42vw,180px);white-space:normal;overflow-wrap:anywhere;text-align:right}
      .owner-preview-announcement{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 18px;align-items:center;padding:14px max(20px,6%);border-bottom:1px solid #6f2118;color:#f3e9d2;background:#922e20;font:600 15px/1.5 'DM Sans',Arial,sans-serif}
      .owner-preview-announcement strong{color:#e9b852;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
      .owner-preview-exception{margin:14px 0 0;padding:12px 14px;border-left:4px solid #922e20;background:#e8dbbc;font-weight:700}
      @media(max-width:620px){.owner-preview-banner{justify-content:space-between;flex-wrap:wrap;padding-inline:14px;text-align:left}.owner-preview-banner>span{display:none}.owner-preview-banner strong{font-size:16px}.owner-preview-banner a{font-size:12px}.owner-preview-announcement{grid-template-columns:1fr;gap:3px;padding-inline:20px}}
    `;
    document.head.append(style);
  }

  function addBanner() {
    const banner = document.createElement('div');
    banner.className = 'owner-preview-banner';
    banner.setAttribute('role', 'note');
    const title = document.createElement('strong');
    title.textContent = 'Owner preview';
    const detail = document.createElement('span');
    detail.textContent = api.state
      ? 'Changes from this browser'
      : 'No saved owner changes found · showing the published preview';
    const back = document.createElement('a');
    back.href = 'owner.html';
    back.textContent = 'Return to owner room →';
    banner.append(title, detail, back);
    document.body.prepend(banner);
    const syncHeight = () => document.documentElement.style.setProperty('--owner-preview-banner-height', `${Math.ceil(banner.getBoundingClientRect().height)}px`);
    syncHeight();
    if ('ResizeObserver' in window) new ResizeObserver(syncHeight).observe(banner);
    else window.addEventListener('resize', syncHeight);
  }

  function makeMenuUrl(category = '') {
    const url = new URL(guestUrl('menu.html'));
    if (category && category !== 'All dishes') url.searchParams.set('category', category);
    return url.href;
  }

  function renderMenuPage() {
    const container = document.querySelector('#all-dishes');
    if (!container || !api.state) return;
    const items = api.state.menu.filter(item => item.available);
    const categoryMap = new Map();
    for (const item of items) {
      if (!categoryMap.has(item.category)) categoryMap.set(item.category, []);
      categoryMap.get(item.category).push(item);
    }

    container.replaceChildren();
    [...categoryMap].forEach(([category, categoryItems], index) => {
      const section = document.createElement('section');
      section.className = 'menu-group';
      section.dataset.group = category;
      const heading = document.createElement('h2');
      heading.id = `owner-preview-category-${index}`;
      heading.textContent = category;
      section.setAttribute('aria-labelledby', heading.id);
      const grid = document.createElement('div');
      grid.className = 'dish-grid';
      for (const item of categoryItems) {
        const article = document.createElement('article');
        article.className = 'menu-item';
        article.dataset.category = category;
        const name = document.createElement('h3');
        name.textContent = item.name;
        article.append(name);
        if (item.description) {
          const description = document.createElement('p');
          description.textContent = item.description;
          article.append(description);
        }
        const price = document.createElement('div');
        price.className = 'item-price';
        price.textContent = item.price || 'Ask for current pricing';
        article.append(price);
        grid.append(article);
      }
      section.append(heading, grid);
      container.append(section);
    });

    const categories = [...categoryMap];
    const sidebar = document.querySelector('.menu-sidebar nav');
    if (sidebar) {
      sidebar.replaceChildren();
      const rows = [['All dishes', items.length], ...categories.map(([name, values]) => [name, values.length])];
      rows.forEach(([name, count], index) => {
        const link = document.createElement('a');
        link.href = makeMenuUrl(name);
        link.dataset.category = name;
        if (index === 0) link.setAttribute('aria-current', 'true');
        link.append(document.createTextNode(`${name} `));
        const total = document.createElement('span');
        total.textContent = String(count);
        link.append(total);
        sidebar.append(link);
      });
    }

    const select = document.querySelector('#category-select');
    if (select) {
      select.replaceChildren();
      [['All dishes', items.length], ...categories.map(([name, values]) => [name, values.length])].forEach(([name, count]) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${count})`;
        select.append(option);
      });
    }
    const dateNote = document.querySelector('.menu-date');
    if (dateNote) dateNote.textContent = 'Owner preview · available dishes and prices from this browser · Prices in USD.';
  }

  function renderHomeMenu() {
    const slots = [...document.querySelectorAll('.food-pick')];
    if (!slots.length || !api.state) return;
    const available = api.state.menu.filter(item => item.available);
    const preferredIds = ['menu-1', 'menu-7', 'menu-26', 'menu-2'];
    const featured = [];
    preferredIds.forEach(id => {
      const item = available.find(candidate => candidate.id === id);
      if (item && !featured.includes(item)) featured.push(item);
    });
    available.forEach(item => {
      if (featured.length < slots.length && !featured.includes(item)) featured.push(item);
    });
    slots.forEach((slot, index) => {
      const item = featured[index];
      slot.hidden = !item;
      if (!item) return;
      slot.href = guestUrl(`menu.html?q=${encodeURIComponent(item.name)}`);
      const name = slot.querySelector('h3');
      const description = slot.querySelector('p');
      const price = slot.querySelector('.price');
      if (name) name.textContent = item.name;
      if (description) description.textContent = item.description || 'Available on the owner-preview menu.';
      if (price) price.textContent = item.price || 'Ask for price';
    });
    const range = document.querySelector('.pick-heading span:last-child');
    if (range) range.textContent = featured.length ? `01—${String(Math.min(featured.length, slots.length)).padStart(2, '0')}` : 'NO ITEMS';
    const footnote = document.querySelector('.menu-footnote span');
    if (footnote) footnote.textContent = 'Availability and prices from this browser’s owner preview.';
  }

  function chicagoParts(now = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long'
    }).formatToParts(now).map(part => [part.type, part.value]));
  }

  api.getTodaySchedule = function getTodaySchedule(now = new Date()) {
    if (!api.state) return null;
    const parts = chicagoParts(now);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const exception = api.state.exceptions.find(item => item.date === date);
    const weekly = api.state.hours.find(item => item.day === parts.weekday);
    return exception ? {...exception, day: parts.weekday, date, exception: true} : weekly ? {...weekly, date, exception: false} : null;
  };

  function renderHours() {
    const list = document.querySelector('.hours');
    if (!list || !api.state) return;
    list.replaceChildren();
    DAYS.forEach(day => {
      const schedule = api.state.hours.find(item => item.day === day);
      if (!schedule) return;
      const row = document.createElement('div');
      const label = document.createElement('dt');
      label.textContent = day;
      const value = document.createElement('dd');
      value.textContent = schedule.closed ? 'Closed' : `${displayTime(schedule.open)} – ${displayTime(schedule.close)}`;
      row.append(label, value);
      list.append(row);
    });
    const title = document.querySelector('.hours-title span');
    if (title) {
      const openDays = api.state.hours.filter(item => !item.closed);
      const oneOpening = new Set(openDays.map(item => item.open));
      title.textContent = openDays.length === 7 && oneOpening.size === 1
        ? `OPEN AT ${displayTime(openDays[0].open).toUpperCase()}, EVERY DAY`
        : 'OWNER PREVIEW WEEKLY HOURS';
    }
    const today = api.getTodaySchedule();
    document.querySelector('.owner-preview-exception')?.remove();
    if (today?.exception) {
      const note = document.createElement('p');
      note.className = 'owner-preview-exception';
      note.textContent = today.closed
        ? `Today: ${today.label} · Closed`
        : `Today: ${today.label} · ${displayTime(today.open)} – ${displayTime(today.close)}`;
      list.after(note);
    }
  }

  function phoneHref(phone) {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    return cleaned ? `tel:${cleaned}` : 'tel:+18174214888';
  }

  function updateSettings(root = document) {
    if (!api.state) return;
    const {phone, address} = api.state.settings;
    const phoneLinks = [
      ...(root.matches?.('a[href^="tel:"]') ? [root] : []),
      ...(root.querySelectorAll?.('a[href^="tel:"]') || [])
    ];
    phoneLinks.forEach(link => {
      const destination = phoneHref(phone);
      if (link.getAttribute('href') !== destination) link.setAttribute('href', destination);
      if (!link.children.length && /\d{3}[^\d]*\d{3}[^\d]*\d{4}/.test(link.textContent) && !/^call\b/i.test(link.textContent.trim()) && link.textContent !== phone) {
        link.textContent = phone;
      }
    });
    const directionLinks = [
      ...(root.matches?.('a[href*="google.com/maps/dir/"]') ? [root] : []),
      ...(root.querySelectorAll?.('a[href*="google.com/maps/dir/"]') || [])
    ];
    directionLinks.forEach(link => {
      try {
        const url = new URL(link.href);
        url.searchParams.set('destination', address);
        if (link.href !== url.href) link.href = url.href;
      } catch {}
    });
    if (root !== document) return;
    const quickVisit = document.querySelector('.visit-summary a:nth-child(2)');
    if (quickVisit) {
      const pieces = address.split(',').map(piece => piece.trim()).filter(Boolean);
      const label = quickVisit.querySelector('span');
      const value = quickVisit.querySelector('strong');
      const locationLabel = pieces[1]?.toUpperCase();
      const locationValue = pieces[0] || address;
      if (label && locationLabel && label.textContent !== locationLabel) label.textContent = locationLabel;
      if (value && value.textContent !== locationValue) value.textContent = locationValue;
    }
    const quickPhone = document.querySelector('.visit-summary a[href^="tel:"] strong');
    if (quickPhone && quickPhone.textContent !== phone) quickPhone.textContent = phone;
    const visitAddress = document.querySelector('.visit-copy .address');
    if (visitAddress && visitAddress.textContent !== address) visitAddress.textContent = address;
    const compactFooterAddress = document.querySelector('.footer-main > div:first-child p');
    if (compactFooterAddress && compactFooterAddress.textContent !== address) compactFooterAddress.textContent = address;
    const homeFooterAddress = document.querySelector('.footer-top > div:first-child p');
    const homeFooterText = `${address}. Chili, music, and Texas history.`;
    if (homeFooterAddress && homeFooterAddress.textContent !== homeFooterText) homeFooterAddress.textContent = homeFooterText;
  }

  function addAnnouncement() {
    if (!api.state?.settings.announcement || !document.body.classList.contains('parlor-skin')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const notice = document.createElement('section');
    notice.className = 'owner-preview-announcement';
    notice.setAttribute('role', 'status');
    const label = document.createElement('strong');
    label.textContent = 'From the parlor';
    const message = document.createElement('span');
    message.textContent = api.state.settings.announcement;
    notice.append(label, message);
    main.prepend(notice);
  }

  function decorateLink(link) {
    if (!(link instanceof HTMLAnchorElement) || !link.hasAttribute('href')) return;
    const decorated = guestUrl(link.getAttribute('href'));
    if (decorated && decorated !== link.href) link.href = decorated;
  }

  function decorateLinks(root = document) {
    if (root instanceof HTMLAnchorElement) decorateLink(root);
    root.querySelectorAll?.('a[href]').forEach(decorateLink);
  }

  addStyles();
  addBanner();
  renderMenuPage();
  renderHomeMenu();
  renderHours();
  updateSettings();
  addAnnouncement();
  decorateLinks();

  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      decorateLinks(node);
      updateSettings(node);
    }));
  }).observe(document.body, {childList: true, subtree: true});

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (link) decorateLink(link);
  }, true);

  window.addEventListener('storage', event => {
    if (event.key === STORE_KEY) location.reload();
  });
})();
