'use strict';
const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const closing = {Monday:'9 pm',Tuesday:'10 pm',Wednesday:'11 pm',Thursday:'11 pm',Friday:'midnight',Saturday:'midnight',Sunday:'9 pm'};
function inquiryEmail() {
  const configured = window.OwnerPreview?.active
    ? window.OwnerPreview.state?.settings?.content?.['links.contactEmail']
    : '';
  if (configured) {
    const source = String(configured).trim();
    const address = source.startsWith('mailto:') ? source.slice(7) : source;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return address;
  }
  return 'tolbertsrestaurant@gmail.com';
}
function updateHours() {
  const day = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'long'}).format(new Date());
  const ownerSchedule = window.OwnerPreview?.active ? window.OwnerPreview.getTodaySchedule?.() : null;
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
$('#inquiry-open').addEventListener('click', () => {$('input[name="date"]').min = chicagoDate(); openDialog($('#inquiry-dialog'));});
$('#inquiry-form').addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const name = data.name.trim(); if (!name) {$('input[name="name"]').setCustomValidity('Please enter your name.'); $('input[name="name"]').reportValidity(); return;}
  const topic = data.occasion === 'Private event' ? 'a private event' : data.occasion === 'Band booking' ? 'booking a band' : data.occasion.toLowerCase();
  const recipient = inquiryEmail();
  const message = `Hello Tolbert’s team,\n\nI’d like to ask about ${topic}.\n\nName: ${name}\nPreferred date: ${data.date || 'To be discussed'}\nApproximate group size: ${data.size || 'To be discussed'}\n\n${data.message.trim() || 'Please let me know about availability and next steps.'}\n\nThank you,\n${name}`;
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
