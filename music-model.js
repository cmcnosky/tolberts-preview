'use strict';

const MusicModel = (() => {
  const CHICAGO = 'America/Chicago';
  const VALID_FILTERS = new Set(['all', 'tonight', 'weekend']);

  function dateParts(date) {
    return String(date || '').split('-').map(Number);
  }

  function validDate(value) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [year, month, day] = dateParts(text);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }

  function dateFilterValue(value) {
    return validDate(value) ? String(value) : '';
  }

  function chicagoDate(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(date, amount) {
    if (!validDate(date)) throw new TypeError(`Invalid event date: ${date}`);
    const [year, month, day] = dateParts(date);
    const value = new Date(Date.UTC(year, month - 1, day + amount, 12));
    return value.toISOString().slice(0, 10);
  }

  function weekday(date) {
    if (!validDate(date)) throw new TypeError(`Invalid event date: ${date}`);
    const [year, month, day] = dateParts(date);
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  }

  function weekendRange(today) {
    const day = weekday(today);
    let start;
    if (day === 5) start = today;
    else if (day === 6) start = addDays(today, -1);
    else if (day === 0) start = addDays(today, -2);
    else start = addDays(today, 5 - day);
    return {start, end: addDays(start, 2)};
  }

  function isUpcomingWeekend(date, today) {
    const range = weekendRange(today);
    return date >= range.start && date <= range.end;
  }

  function hour24(time) {
    const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(String(time || '').trim());
    if (!match || +match[1] < 1 || +match[1] > 12 || +match[2] > 59) {
      throw new TypeError(`Invalid event time: ${time}`);
    }
    return [Number(match[1]) % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0), Number(match[2])];
  }

  function zonedUtc(date, time) {
    if (!validDate(date)) throw new TypeError(`Invalid event date: ${date}`);
    const [hour, minute] = hour24(time);
    const [year, month, day] = dateParts(date);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = desired;
    for (let attempt = 0; attempt < 3; attempt++) {
      const representedParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: CHICAGO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
      const represented = Date.UTC(
        +representedParts.year,
        +representedParts.month - 1,
        +representedParts.day,
        +representedParts.hour,
        +representedParts.minute,
        +representedParts.second
      );
      timestamp += desired - represented;
    }
    return new Date(timestamp);
  }

  function eventStart(event) {
    return zonedUtc(event.date, event.start);
  }

  function eventEnd(event) {
    let endDate = event.endDate || event.date;
    let end = zonedUtc(endDate, event.end);
    if (end <= eventStart(event)) {
      endDate = addDays(endDate, 1);
      end = zonedUtc(endDate, event.end);
    }
    return end;
  }

  function eventKey(event) {
    return `${event.date}|${event.name}|${event.start}`;
  }

  function isPending(event, now = Date.now()) {
    try {
      return eventEnd(event).getTime() > new Date(now).getTime();
    } catch {
      return false;
    }
  }

  function sortEvents(events) {
    return [...events].sort((left, right) => {
      const dateOrder = String(left.date).localeCompare(String(right.date));
      if (dateOrder) return dateOrder;
      try { return eventStart(left) - eventStart(right); }
      catch { return String(left.start).localeCompare(String(right.start)); }
    });
  }

  function pendingEvents(events, now = Date.now()) {
    return sortEvents((Array.isArray(events) ? events : []).filter(event => isPending(event, now)));
  }

  function todayEvents(events, now = Date.now()) {
    const today = chicagoDate(now);
    return sortEvents((Array.isArray(events) ? events : []).filter(event => event && event.date === today));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’‘]/g, "'")
      .toLowerCase()
      .trim();
  }

  function filterEvents(events, options = {}) {
    const now = options.now ?? Date.now();
    const nowTime = new Date(now).getTime();
    const today = options.today || chicagoDate(now);
    const filter = VALID_FILTERS.has(options.filter) ? options.filter : 'all';
    const selectedDate = dateFilterValue(options.date);
    const terms = normalizeText(options.query).split(/\s+/).filter(Boolean);
    return pendingEvents(events, now).filter(event => {
      if (selectedDate && event.date !== selectedDate) return false;
      const happeningNow = eventStart(event).getTime() <= nowTime && eventEnd(event).getTime() > nowTime;
      if (filter === 'tonight' && event.date !== today && !happeningNow) return false;
      if (filter === 'weekend' && !isUpcomingWeekend(event.date, today)) return false;
      if (!terms.length) return true;
      const haystack = normalizeText(`${event.name} ${event.genre || ''} ${event.date} ${event.start} ${event.end}`);
      return terms.every(term => haystack.includes(term));
    });
  }

  function displayDate(date, options = {}) {
    if (!validDate(date)) return 'Date unavailable';
    const [year, month, day] = dateParts(date);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: options.long ? 'long' : 'short',
      month: options.long ? 'long' : 'short',
      day: 'numeric',
      ...(options.year ? {year: 'numeric'} : {})
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  function shareUrl(event, baseUrl) {
    const url = new URL('music.html', baseUrl);
    url.search = '';
    url.hash = '';
    url.searchParams.set('show', eventKey(event));
    return url.href;
  }

  function stamp(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function icsText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function foldIcsLine(line) {
    const encoder = new TextEncoder();
    let output = '';
    let bytes = 0;
    for (const character of line) {
      const size = encoder.encode(character).length;
      if (bytes + size > 75) {
        output += '\r\n ';
        bytes = 1;
      }
      output += character;
      bytes += size;
    }
    return output;
  }

  function buildIcs(event, options = {}) {
    const start = eventStart(event);
    const end = eventEnd(event);
    const checked = options.live
      ? 'From the restaurant’s live calendar.'
      : 'Saved schedule checked November 1, 2026.';
    const uidPart = String(event.id || eventKey(event))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'show';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tolberts Website Preview//Live Music//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uidPart}@tolberts-preview`,
      `DTSTAMP:${stamp(options.now ? new Date(options.now) : new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(`${event.name} at Tolbert’s`)}`,
      `LOCATION:${icsText('Tolbert’s Restaurant, 423 S Main St, Grapevine, TX 76051')}`,
      `DESCRIPTION:${icsText(`${event.genre || 'Live music'}. ${checked} Confirm details with Tolbert’s: (817) 421-4888. https://tolbertsrestaurant.com/calendar/`)}`,
      'URL:https://tolbertsrestaurant.com/calendar/',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lines.map(foldIcsLine).join('\r\n') + '\r\n';
  }

  return {
    CHICAGO,
    VALID_FILTERS,
    addDays,
    buildIcs,
    chicagoDate,
    dateFilterValue,
    displayDate,
    eventEnd,
    eventKey,
    eventStart,
    filterEvents,
    foldIcsLine,
    hour24,
    icsText,
    isPending,
    isUpcomingWeekend,
    normalizeText,
    pendingEvents,
    shareUrl,
    sortEvents,
    stamp,
    todayEvents,
    validDate,
    weekendRange,
    weekday,
    zonedUtc
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MusicModel;
