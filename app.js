(() => {
'use strict';
const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const closing = {Monday:'9 pm',Tuesday:'10 pm',Wednesday:'11 pm',Thursday:'11 pm',Friday:'midnight',Saturday:'midnight',Sunday:'9 pm'};
function inquiryEmail() {
  const configured = window.OwnerPreview?.state?.settings?.content?.['links.contactEmail'] || '';
  if (configured) {
    const source = String(configured).trim();
    const address = source.startsWith('mailto:') ? source.slice(7) : source;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return address;
  }
  return 'tolbertsrestaurant@gmail.com';
}
function updateHours() {
  const day = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'long'}).format(new Date());
  const ownerSchedule = window.OwnerPreview?.state ? window.OwnerPreview.getTodaySchedule?.() : null;
  if (ownerSchedule) {
    const label = ownerSchedule.exception && ownerSchedule.label ? ` · ${ownerSchedule.label}` : '';
    $('#today-hours').textContent = ownerSchedule.closed
      ? `Closed today${label}`
      : `${window.OwnerPreview.displayTime(ownerSchedule.open)}–${window.OwnerPreview.displayTime(ownerSchedule.close)}${label}`;
  } else {
    $('#today-hours').textContent = `11\u00a0am–${closing[day].replace(' ', '\u00a0')}`;
  }
  $$('.hours>div').forEach(row => row.classList.toggle('current-day', $('dt', row).textContent === day));
}
updateHours();
(window.OwnerPreview?.ready || Promise.resolve()).then(updateHours);

const visitDate = $('#visit-date');
if (visitDate) {
  const result = $('#visit-date-hours');
  const musicLink = $('#visit-date-music');
  const formatDate = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
  function showVisitDate() {
    visitDate.min = chicagoDate();
    musicLink.hidden = true;
    if (!visitDate.value || !visitDate.validity.valid) {
      result.textContent = visitDate.value ? 'Choose today or a future date.' : '';
      return;
    }
    // Noon UTC stays on the selected calendar day throughout Central daylight and standard time.
    const date = new Date(visitDate.value + 'T12:00:00Z');
    const owner = window.OwnerPreview;
    const schedule = owner?.getTodaySchedule?.(date);
    const day = formatDate.format(date);
    if (schedule) {
      const hours = schedule.closed ? 'Closed' : owner.displayTime(schedule.open) + '–' + owner.displayTime(schedule.close);
      result.textContent = day + ' · ' + hours + (schedule.exception ? ' · ' + schedule.label : '') + '.';
    } else {
      const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'long', timeZone: 'America/Chicago'}).format(date);
      const row = $$('.hours > div').find(row => $('dt', row).textContent === weekday);
      result.textContent = day + (row ? ' · Regular hours: ' + $('dd', row).textContent + '. ' : '. ') + 'Call to confirm special hours.';
    }
    const calendar = 'music.html?date=' + visitDate.value;
    musicLink.href = owner?.guestUrl?.(calendar) || calendar;
    musicLink.hidden = false;
  }
  visitDate.value = chicagoDate();
  visitDate.addEventListener('input', showVisitDate);
  visitDate.closest('details').addEventListener('toggle', showVisitDate);
  showVisitDate();
  visitDate.closest('details').hidden = false;
  (window.OwnerPreview?.ready || Promise.resolve()).then(showVisitDate);
}
const photoDialog = $('#stage-photo-dialog');
const enlargePhoto = $('#enlarge-stage-photo');
if (photoDialog && enlargePhoto && typeof photoDialog.showModal === 'function') {
  const stagePhoto = $('.stage-portrait img');
  const expanded = $('img', photoDialog);
  const viewport = $('.stage-photo-viewport', photoDialog);
  const zoom = $('#stage-photo-zoom');
  const syncPhoto = () => {
    enlargePhoto.href = stagePhoto.src;
    expanded.src = enlargePhoto.href;
    expanded.alt = stagePhoto.alt;
  };
  enlargePhoto.setAttribute('aria-haspopup', 'dialog');
  (window.OwnerPreview?.ready || Promise.resolve()).then(syncPhoto);
  enlargePhoto.addEventListener('click', event => {
    syncPhoto();
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openDialog(photoDialog, enlargePhoto);
  });
  const fitPhoto = () => {
    viewport.classList.remove('zoomed');
    viewport.removeAttribute('tabindex');
    zoom.textContent = 'Zoom in';
    viewport.scrollTo(0, 0);
  };
  zoom.addEventListener('click', () => {
    if (viewport.classList.contains('zoomed')) return fitPhoto();
    viewport.style.setProperty('--detail-width', expanded.getBoundingClientRect().width * 2 + 'px');
    viewport.classList.add('zoomed');
    viewport.tabIndex = 0;
    zoom.textContent = 'Fit photo';
    viewport.scrollTo((viewport.scrollWidth - viewport.clientWidth) / 2, (viewport.scrollHeight - viewport.clientHeight) / 2);
  });
  photoDialog.addEventListener('close', fitPhoto);
}
const stageFilm = $('#stage-film');
const filmLinks = $$('#watch-texas-flood, [data-watch-stage]');
if (stageFilm && filmLinks.length && typeof stageFilm.showModal === 'function') {
  const mount = $('.stage-player', stageFilm);
  const template = $('#stage-film-template');
  const soundButton = $('#stage-sound');
  const soundHint = $('#stage-sound-hint');
  let apiReady;
  let player;
  let soundTimer;
  function loadVideoAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!apiReady) apiReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { apiReady = null; script.remove(); reject(new Error('Video controls unavailable')); };
      document.head.append(script);
    });
    return apiReady;
  }
  function reflectVolume() {
    const label = player.isMuted() || player.getVolume() === 0 ? 'Turn sound on' : 'Mute sound';
    if (soundButton.textContent !== label) soundButton.textContent = label;
  }
  soundButton.addEventListener('click', () => {
    if (!player) return;
    if (player.isMuted() || player.getVolume() === 0) {
      if (player.getVolume() === 0) player.setVolume(65);
      player.unMute();
    } else {
      player.mute();
    }
  });
  filmLinks.forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openDialog(stageFilm, link);
      const frame = template.content.querySelector('iframe').cloneNode(true);
      const source = new URL(frame.src);
      source.searchParams.set('origin', location.origin);
      frame.src = source.href;
      mount.replaceChildren(frame);
      loadVideoAPI().then(YT => {
        if (!frame.isConnected || !stageFilm.open) return;
        new YT.Player(frame, {events: {onReady(event) {
          if (!frame.isConnected || !stageFilm.open) return;
          player = event.target;
          reflectVolume();
          soundButton.hidden = false;
          soundHint.hidden = true;
          soundTimer = window.setInterval(reflectVolume, 350);
        }}});
      }).catch(() => { /* The embedded player's own volume control stays available. */ });
    });
  });
  stageFilm.addEventListener('close', () => {
    window.clearInterval(soundTimer);
    player?.destroy();
    player = null;
    mount.replaceChildren();
    soundButton.hidden = true;
    soundHint.hidden = false;
  });
}
$('#inquiry-open').addEventListener('click', () => {$('input[name="date"]').min = chicagoDate(); openDialog($('#inquiry-dialog'));});
$('#inquiry-form').addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const name = data.name.trim(); if (!name) {$('input[name="name"]').setCustomValidity('Please enter your name.'); $('input[name="name"]').reportValidity(); return;}
  const topic = data.occasion === 'Private event' ? 'a private event' : data.occasion === 'Band booking' ? 'booking a band' : data.occasion.toLowerCase();
  const recipient = inquiryEmail();
  const message = `Hi Tolbert’s,\n\nI’d like to ask about ${topic}.\n\nName: ${name}\nPreferred date: ${data.date || 'Not sure yet'}\nApproximate group size: ${data.size || 'Not sure yet'}\n\n${data.message.trim() || 'Please let me know what’s available.'}\n\nThank you,\n${name}`;
  $('#inquiry-message').textContent = message;
  $('#inquiry-send').href = `mailto:${recipient}?subject=${encodeURIComponent(data.occasion + ' inquiry' + (data.date ? ' — ' + data.date : ''))}&body=${encodeURIComponent(message)}`;
  $('#inquiry-form').hidden = true; $('#inquiry-result').hidden = false; $('#inquiry-result').focus();
});
$('input[name="name"]').addEventListener('input', event => event.target.setCustomValidity(''));
$('#inquiry-edit').addEventListener('click', () => {$('#inquiry-result').hidden = true; $('#inquiry-form').hidden = false; $('#copy-status').textContent = ''; $('input[name="name"]').focus();});
$('#inquiry-copy').addEventListener('click', async () => {
  const recipient = inquiryEmail();
  try {await navigator.clipboard.writeText($('#inquiry-message').textContent); $('#copy-status').textContent = `Copied. Paste your message into an email to ${recipient}.`;}
  catch {$('#copy-status').textContent = `Select and copy the message above, then email ${recipient}.`;}
});
let toastTimer;
function toast(message) {$('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('#toast').classList.remove('visible');$('#toast').textContent='';}, 4500);}

setInterval(updateHours,60000);
})();
