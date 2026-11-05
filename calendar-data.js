'use strict';

const CalendarData = (() => {
  const eventEndpoint = 'https://tolbertscms.com/wp-json/wp/v2/';
  const imageEndpoint = 'https://tolbertscms.com/graphql';
  const imageQuery = `query TolbertsCalendarImages {
    events(first: 100) {
      nodes {
        databaseId
        postTypeEvent { image { sourceUrl } }
      }
    }
  }`;

  function dateValue(value) {
    if (!/^\d{8}$/.test(value || '')) return null;
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    const date = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
  }

  function clockValue(value) {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    if (!match || +match[1] > 23 || +match[2] > 59 || +(match[3] || 0) > 59) return null;
    return `${+match[1] % 12 || 12}:${match[2]} ${+match[1] < 12 ? 'am' : 'pm'}`;
  }

  function normalizeEvent(post) {
    if (!post || typeof post !== 'object') return null;
    const fields = post.acf || {};
    const id = Number(post.id);
    const date = dateValue(fields.date);
    const start = clockValue(fields.start_time);
    const end = clockValue(fields.end_time);
    const name = typeof fields.primary_header === 'string' ? fields.primary_header.trim() : '';
    const genre = typeof fields.secondary_header === 'string' && fields.secondary_header.trim()
      ? fields.secondary_header.trim()
      : 'Live music';
    const endDate = fields.end_date ? dateValue(fields.end_date) : null;
    const imageId = Number(fields.image);
    if (
      !Number.isInteger(id) || id <= 0 || !date || !start || !end || !name ||
      (fields.end_date && !endDate) || (endDate && endDate < date)
    ) return null;
    return {
      id,
      name,
      genre,
      date,
      start,
      end,
      endDate,
      imageId: Number.isInteger(imageId) && imageId > 0 ? imageId : 0
    };
  }

  function officialImage(value) {
    try {
      const url = new URL(value);
      return url.origin === 'https://tolbertscms.com' ? url.href : null;
    } catch {
      return null;
    }
  }

  function imageMap(payload) {
    const nodes = payload?.data?.events?.nodes;
    if (!Array.isArray(nodes)) throw new Error('Invalid calendar image response');
    const images = new Map();
    for (const node of nodes) {
      const id = Number(node?.databaseId);
      const image = officialImage(node?.postTypeEvent?.image?.sourceUrl);
      if (Number.isInteger(id) && id > 0 && image) images.set(id, image);
    }
    return images;
  }

  function minutes(time) {
    const [, hour, minute, period] = /^(\d+):(\d+) (am|pm)$/.exec(time);
    return (+hour % 12 + (period === 'pm' ? 12 : 0)) * 60 + +minute;
  }

  async function fetchEvents(fallback = [], fetcher = fetch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    async function request(url, options = {}) {
      const response = await fetcher(url, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        ...options
      });
      if (!response.ok) throw new Error('Public calendar unavailable');
      return response;
    }
    async function get(path) {
      return request(eventEndpoint + path);
    }

    try {
      const first = await get('event?per_page=100&_fields=id,acf');
      let posts = await first.json();
      if (!Array.isArray(posts)) throw new Error('Invalid calendar response');
      const pages = Number(first.headers.get('X-WP-TotalPages')) || 1;
      if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
        throw new Error('Calendar exceeds supported page limit');
      }
      for (let page = 2; page <= pages; page++) {
        const response = await get(`event?per_page=100&_fields=id,acf&page=${page}`);
        const more = await response.json();
        if (!Array.isArray(more)) throw new Error('Invalid calendar page');
        posts.push(...more);
      }

      const events = posts.map(normalizeEvent).filter(Boolean);
      if (posts.length && events.length !== posts.length) {
        throw new Error('Calendar contains incomplete listings');
      }
      if (!events.length) return [];

      let images = new Map();
      try {
        const response = await request(imageEndpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({query: imageQuery})
        });
        images = imageMap(await response.json());
      } catch {
        // Event names and times remain useful when the separate image lookup fails.
      }

      return events.map(event => {
        const saved = fallback.find(item => item.date === event.date && item.name === event.name);
        const image = images.get(event.id) || saved?.image || 'assets/stage.webp';
        return {
          ...event,
          image,
          imageAlt: image === 'assets/stage.webp'
            ? 'Live music at Tolbert’s'
            : `${event.name} — promotional image`
        };
      }).sort((left, right) => left.date.localeCompare(right.date) || minutes(left.start) - minutes(right.start));
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    clockValue,
    dateValue,
    fetchEvents,
    imageMap,
    normalizeEvent,
    officialImage
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CalendarData;
