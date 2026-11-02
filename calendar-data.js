'use strict';
const CalendarData = (() => {
  const endpoint = 'https://tolbertscms.com/wp-json/wp/v2/';
  function dateValue(value) {
    if (!/^\d{8}$/.test(value || '')) return null;
    const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
    const date = new Date(iso + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso ? iso : null;
  }
  function clockValue(value) {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    if (!match || +match[1] > 23 || +match[2] > 59 || +(match[3] || 0) > 59) return null;
    return `${+match[1] % 12 || 12}:${match[2]} ${+match[1] < 12 ? 'am' : 'pm'}`;
  }
  function normalizeEvent(post) {
    const fields = post.acf || {};
    const date = dateValue(fields.date), start = clockValue(fields.start_time), end = clockValue(fields.end_time);
    const name = typeof fields.primary_header === 'string' ? fields.primary_header.trim() : '';
    const endDate = fields.end_date ? dateValue(fields.end_date) : null;
    if (!date || !start || !end || !name || (fields.end_date && !endDate) || (endDate && endDate < date)) return null;
    return {id:post.id,name,genre:typeof fields.secondary_header === 'string' ? fields.secondary_header : 'Live music',date,start,end,endDate,imageId:Number(fields.image)||0};
  }
  async function fetchEvents(fallback = [], fetcher = fetch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    async function get(path) {
      const response = await fetcher(endpoint + path,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if (!response.ok) throw new Error('Public calendar unavailable');
      return response;
    }
    try {
      const first = await get('event?per_page=100&_fields=id,acf');
      let posts = await first.json(); if (!Array.isArray(posts)) throw new Error('Invalid calendar response');
      const pages = Number(first.headers.get('X-WP-TotalPages')) || 1;
      if (pages > 10) throw new Error('Calendar exceeds supported page limit');
      for (let page=2; page<=pages; page++) {const response = await get(`event?per_page=100&_fields=id,acf&page=${page}`);const more=await response.json();if(!Array.isArray(more))throw new Error('Invalid calendar page');posts.push(...more);}
      const events = posts.map(normalizeEvent).filter(Boolean);
      if (posts.length && events.length !== posts.length) throw new Error('Calendar contains incomplete listings');
      const mediaIds = [...new Set(events.map(event => event.imageId).filter(Boolean))];
      const images = new Map();
      try {
        for(let i=0;i<mediaIds.length;i+=100){const response=await get(`media?include=${mediaIds.slice(i,i+100).join(',')}&per_page=100&_fields=id,source_url`);const media=await response.json();for(const item of media){const url=new URL(item.source_url);if(url.protocol==='https:'&&url.hostname==='tolbertscms.com')images.set(item.id,url.href);}}
      } catch { /* Text and times remain useful if promotional images cannot load. */ }
      return events.map(event => {
        const saved = fallback.find(item => item.date===event.date&&item.name===event.name);
        return {...event,image:images.get(event.imageId)||saved?.image||'assets/stage.webp',imageAlt:images.has(event.imageId)||saved?`${event.name} — promotional image`:'Live music at Tolbert’s'};
      }).sort((a,b) => a.date.localeCompare(b.date) || minutes(a.start)-minutes(b.start));
    } finally {clearTimeout(timeout);}
  }
  function minutes(time) {const [,hour,minute,period]=/^(\d+):(\d+) (am|pm)$/.exec(time);return (+hour%12+(period==='pm'?12:0))*60+ +minute;}
  return {fetchEvents,normalizeEvent,dateValue,clockValue};
})();
if(typeof module !== 'undefined' && module.exports) module.exports=CalendarData;
