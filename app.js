'use strict';
const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const closing = {Monday:'9 pm',Tuesday:'10 pm',Wednesday:'11 pm',Thursday:'11 pm',Friday:'midnight',Saturday:'midnight',Sunday:'9 pm'};
function updateHours() {
  const day = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'long'}).format(new Date());
  $('#today-hours').textContent = `11 am–${closing[day]}`;
  $$('.hours>div').forEach(row => row.classList.toggle('current-day', $('dt', row).textContent === day));
}
updateHours();
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

setInterval(updateHours,60000);
