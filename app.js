'use strict';
const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const closing = {Monday:'9 pm',Tuesday:'10 pm',Wednesday:'11 pm',Thursday:'11 pm',Friday:'midnight',Saturday:'midnight',Sunday:'9 pm'};
function updateHours() {
  const day = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'long'}).format(new Date());
  $('#today-hours').textContent = `${day} · 11 am–${closing[day]}`;
  $$('.hours>div').forEach(row => row.classList.toggle('current-day', $('dt', row).textContent === day));
}
updateHours();
$('#preview-open').addEventListener('click', () => openDialog($('#preview-dialog')));
let events = [], showFilter = 'all', expanded = false, lineupReady = false, lastAvailable = '';
const eventDay = event => new Date(event.date + 'T12:00:00Z');
const shortDay = event => new Intl.DateTimeFormat('en-US', {weekday:'short',timeZone:'UTC'}).format(eventDay(event));
const eventKey = event => `${event.date}|${event.name}|${event.start}`;
function setImageFallback(img, event) {
  img.addEventListener('error', () => {
    event.image = 'assets/stage.webp'; event.imageAlt = 'Live music at Tolbert’s';
    img.src = event.image; img.alt = event.imageAlt;
  }, {once:true});
}
function pendingEvents(now = Date.now()) {
  return events.filter(event => {
    const end = eventEnd(event);
    return end.getTime() > now;
  });
}
function updateNextShow() {
  const event = pendingEvents()[0];
  $('#next-show-label').textContent = event && zonedUtc(event.date,event.start).getTime() <= Date.now() ? 'ON STAGE NOW' : 'NEXT ON STAGE';
  $('#next-show').textContent = event ? `${shortDay(event)} ${Number(event.date.slice(8))} · ${event.name} · ${event.start} →` : 'See the latest official calendar →';
  $('#next-show').href = event ? '#music' : 'https://tolbertsrestaurant.com/calendar/';
}
function renderShows() {
  const available = pendingEvents();
  const matching = available.filter(event => showFilter === 'all' || (showFilter === 'weekend' && ['Fri','Sat','Sun'].includes(shortDay(event))) || (showFilter === 'blues' && /blues|srv/i.test(event.genre)) || (showFilter === 'country' && /country/i.test(event.genre)));
  const visible = expanded ? matching : matching.slice(0,3);
  $('#show-count').textContent = matching.length ? `Showing ${visible.length} of ${matching.length} upcoming ${matching.length === 1 ? 'show' : 'shows'}` : 'No upcoming shows in this selection';
  $('#show-grid').innerHTML = visible.length ? visible.map(event => {
    return `<article class="show-card"><div class="show-image"><img src="${esc(event.image)}" width="900" height="560" alt="${esc(event.imageAlt || event.name + " — promotional image")}" loading="lazy"><div class="show-date"><span>${eventDay(event).toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()}</span><strong>${Number(event.date.slice(8))}</strong></div></div><p class="genre">${esc(event.genre)}</p><h3>${esc(event.name)}</h3><p class="show-time">${shortDay(event)} · ${esc(event.start)}–${esc(event.end)}</p><button class="show-detail" data-event="${esc(eventKey(event))}" aria-label="Show details for ${esc(event.name)}">Show details <span aria-hidden="true">↗</span></button></article>`;
  }).join('') : `<div class="no-results">${available.length ? 'No upcoming shows match this filter. <button id="clear-show-filter" class="text-link light">View all shows</button>' : 'No upcoming listings are available here. <a class="text-link light" href="https://tolbertsrestaurant.com/calendar/" target="_blank" rel="noopener">See the latest official calendar ↗</a>'}</div>`;
  $('#show-more').hidden = matching.length <= 3;
  $('#show-more').setAttribute('aria-expanded', String(expanded));
  $('#show-more').innerHTML = expanded ? 'Show fewer <span>↑</span>' : `View all ${matching.length} shows <span>↓</span>`;
  $$('.show-card').forEach((card, index) => setImageFallback($('img', card), visible[index]));
  $$('.show-detail').forEach(button => button.addEventListener('click', () => openShow(button.dataset.event, button)));
  $('#clear-show-filter')?.addEventListener('click', () => {showFilter = 'all'; expanded = false; renderShows();});
  $$('[data-filter]').forEach(button => {button.classList.toggle('active', button.dataset.filter === showFilter); button.setAttribute('aria-pressed', String(button.dataset.filter === showFilter));});
}
let savedEvents = [], liveChecked = null, lastFetch = 0, fetching = false;
async function refreshCalendar() {
  if (fetching) return; fetching = true; lastFetch = Date.now();
  try {
    events = await CalendarData.fetchEvents(savedEvents);
    liveChecked = new Date(); lineupReady = true;
    const checked = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(liveChecked);
    $('#lineup-source').textContent = `Restaurant’s live calendar · checked ${checked} Central. Confirm details before heading over.`;
  } catch {
    if (!liveChecked) events = savedEvents;
    lineupReady = true;
    $('#lineup-source').textContent = liveChecked ? 'Live refresh unavailable. Showing the last successful check from this visit; confirm with the official calendar.' : 'Live calendar unavailable. Showing saved listings checked November 1, 2026; confirm with the official calendar.';
  } finally {
    fetching = false; lastAvailable = pendingEvents().map(event => event.date+event.name).join('|');
    renderShows(); updateNextShow();
  }
}
fetch('events.json',{cache:'no-store'}).then(response => {if(!response.ok)throw new Error('Saved calendar unavailable');return response.json();}).then(data => {
  savedEvents=data;events=data;lineupReady=true;renderShows();updateNextShow();
}).catch(() => {}).finally(refreshCalendar);
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {showFilter = button.dataset.filter; expanded = false; renderShows();}));
$('#show-more').addEventListener('click', () => {expanded = !expanded; renderShows();});
function refreshTimeSensitiveContent() {
  updateHours(); if (!lineupReady) return;
  const current = pendingEvents().map(event => event.date + event.name).join('|');
  if (current !== lastAvailable) {lastAvailable = current; renderShows();}
  updateNextShow();
  if (!document.hidden && Date.now()-lastFetch > 300000) refreshCalendar();
}
setInterval(refreshTimeSensitiveContent, 60000);
document.addEventListener('visibilitychange', () => {if (!document.hidden) refreshTimeSensitiveContent();});
function openShow(key, opener) {
  const event = events.find(item => eventKey(item) === key);
  if (!event) return;
  const date = eventDay(event).toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
  $('#show-details').innerHTML = `<img class="detail-image" src="${esc(event.image)}" alt="${esc(event.imageAlt || event.name + " — promotional image")}"><div class="eyebrow">${esc(event.genre)}</div><h2 id="show-title">${esc(event.name)}</h2><div class="detail-meta"><strong>${date}</strong><span>${esc(event.start)}–${esc(event.end)} · Central time</span><span>Tolbert’s · 423 S. Main Street, Grapevine</span></div><p>Call the restaurant to ask about seating, reservations, and any cover charge.</p><div class="detail-actions"><a class="button" href="tel:+18174214888">Call for a table ↗</a><button class="button secondary" id="save-show">Add to calendar ↓</button></div><p class="fine" style="margin-top:18px">${liveChecked ? "From the restaurant’s live calendar." : "From saved listings checked November 1, 2026."} Confirm details before heading over.</p>`;
  setImageFallback($('.detail-image'), event);
  $('#save-show').addEventListener('click', () => saveCalendar(event)); openDialog($('#show-dialog'), opener);
}
function foldIcsLine(line) {
  const encoder = new TextEncoder(); let output = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {output += '\r\n '; bytes = 1;}
    output += character; bytes += size;
  }
  return output;
}
function hour24(time){const m=time.match(/(\d+):(\d+)\s*(am|pm)/i);return [Number(m[1])%12+(m[3].toLowerCase()==='pm'?12:0),Number(m[2])];}
function zonedUtc(date,time){const [h,m]=hour24(time);const [y,mo,d]=date.split('-').map(Number);const desired=Date.UTC(y,mo-1,d,h,m);let t=desired;for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(p=>[p.type,p.value]));const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);t+=desired-represented;}return new Date(t);}
function eventEnd(event){let date=event.endDate||event.date;let end=zonedUtc(date,event.end);if(end<=zonedUtc(event.date,event.start)){const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);end=zonedUtc(next.toISOString().slice(0,10),event.end);}return end;}
function stamp(d){return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';}
function icsText(s){return String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function saveCalendar(e){const start=zonedUtc(e.date,e.start),end=eventEnd(e);const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tolberts Redesign Preview//Live Music//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${e.date}-${e.name.toLowerCase().replace(/[^a-z0-9]/g,'')}@tolberts-preview`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${icsText(e.name+' at Tolbert’s')}`,`LOCATION:${icsText('Tolbert’s Restaurant, 423 S Main St, Grapevine, TX 76051')}`,`DESCRIPTION:${icsText(e.genre+(liveChecked?'. From the restaurant’s live calendar.':'. Saved schedule checked November 1, 2026.')+' Confirm details with Tolbert’s: (817) 421-4888. https://tolbertsrestaurant.com/calendar/')}`,'URL:https://tolbertsrestaurant.com/calendar/','END:VEVENT','END:VCALENDAR'].map(foldIcsLine).join('\r\n')+'\r\n';const blob=new Blob([text],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`tolberts-${e.date}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendar download requested. Confirm the schedule before you go.');}
$('#inquiry-open').addEventListener('click', () => {$('input[name="date"]').min = chicagoDate(); openDialog($('#inquiry-dialog'));});
$('#inquiry-form').addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const name = data.name.trim(); if (!name) {$('input[name="name"]').setCustomValidity('Please enter your name.'); $('input[name="name"]').reportValidity(); return;}
  const message = `Hello Tolbert’s team,\n\nI’d like to ask about ${data.occasion.toLowerCase()}.\n\nName: ${name}\nPreferred date: ${data.date || 'To be discussed'}\nApproximate group size: ${data.size || 'To be discussed'}\n\n${data.message.trim() || 'Please let me know about availability and next steps.'}\n\nThank you,\n${name}`;
  $('#inquiry-message').textContent = message;
  $('#inquiry-send').href = `mailto:tolbertsrestaurant@gmail.com?subject=${encodeURIComponent(data.occasion + ' inquiry' + (data.date ? ' — ' + data.date : ''))}&body=${encodeURIComponent(message)}`;
  $('#inquiry-form').hidden = true; $('#inquiry-result').hidden = false; $('#inquiry-result').focus();
});
$('input[name="name"]').addEventListener('input', event => event.target.setCustomValidity(''));
$('#inquiry-edit').addEventListener('click', () => {$('#inquiry-result').hidden = true; $('#inquiry-form').hidden = false; $('#copy-status').textContent = ''; $('input[name="name"]').focus();});
$('#inquiry-copy').addEventListener('click', async () => {
  try {await navigator.clipboard.writeText($('#inquiry-message').textContent); $('#copy-status').textContent = 'Copied. Paste your message into an email to tolbertsrestaurant@gmail.com.';}
  catch {$('#copy-status').textContent = 'Select and copy the message above, then email tolbertsrestaurant@gmail.com.';}
});
let toastTimer;
function toast(message) {$('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('#toast').classList.remove('visible');$('#toast').textContent='';}, 4500);}
