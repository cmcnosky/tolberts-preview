/* Authenticated owner workspace backed by Tolbert's shared preview service. */
(() => {
  'use strict';
  const M = window.OwnerModel;
  const API = window.TolbertsAPI;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash = v => M.money(Number(v) || 0);
  const dayKey = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric',timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : String(value || '');
  const timeLabel = v => /^\d{2}:\d{2}$/.test(v || '') ? new Intl.DateTimeFormat('en-US', {hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(`2000-01-01T${v}:00Z`)).toLowerCase() : v;
  const inputTime = v => { if (/^\d{2}:\d{2}$/.test(v || '')) return v; const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(v || ''); return m ? String(Number(m[1]) % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2,'0') + ':' + m[2] : '20:00'; };
  let state, baseline = {events: []}, savedState, revision = null, updatedAt = '', view = 'overview', filter = '', activeOrder = null, editorSubmit = null, editorOpener = null, loggedIn = false, saving = false, refreshing = false, needsRefresh = false, toastTimer;
  const workspace = $('#workspace');
  const dialog = $('#editor-dialog');
  const form = $('#editor-form');
  let extra;
  function syncSkipLink(ownerVisible) { const skip=$('#owner-skip-link'); if(!skip)return; skip.href=ownerVisible?'#workspace':'#login-title'; skip.textContent=ownerVisible?'Skip to owner workspace':'Skip to sign-in'; }
  function status(message) { const el = $('#owner-status'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'),6000); }
  function setBusy(active) {
    $('#owner-shell')?.setAttribute('aria-busy', active ? 'true' : 'false');
    if (active) {
      $$('button, input, select, textarea', $('#owner-shell')).forEach(control => {
        if (!control.disabled) {
          control.disabled = true;
          control.dataset.cloudSaveDisabled = 'true';
        }
      });
    } else {
      $$('[data-cloud-save-disabled="true"]', $('#owner-shell')).forEach(control => {
        control.disabled = false;
        delete control.dataset.cloudSaveDisabled;
      });
    }
  }
  function setSaving(active) { saving = active; setBusy(active); }
  function workspacePayload(payload) {
    if (!payload || !Number.isInteger(payload.revision) || payload.revision < 1 || !M.isUsableState(payload.state)) {
      throw new Error('The shared workspace returned incomplete data. Refresh and try again.');
    }
    return payload;
  }
  function applyWorkspace(payload) {
    const next = workspacePayload(payload);
    state = structuredClone(next.state);
    savedState = structuredClone(next.state);
    revision = next.revision;
    updatedAt = typeof next.updatedAt === 'string' ? next.updatedAt : '';
    needsRefresh = false;
  }
  async function persist(message = '') {
    if (saving) {
      status('A save is already in progress. Wait for it to finish, then try again.');
      return false;
    }
    if (refreshing) {
      if (savedState) state = structuredClone(savedState);
      status('The shared workspace is refreshing. Wait for it to finish, then make the change again.');
      render();
      return false;
    }
    if (needsRefresh) {
      if (savedState) state = structuredClone(savedState);
      status('Reload the shared workspace before making another change.');
      render();
      return false;
    }
    const previous = savedState ? structuredClone(savedState) : null;
    const candidate = structuredClone(state);
    if (message) M.addActivity(candidate, message);
    if (!M.isUsableState(candidate)) {
      if (previous) state = previous;
      status('That change would leave the workspace in an invalid state, so it was undone.');
      render();
      return false;
    }
    setSaving(true);
    try {
      const response = await API.saveWorkspace(revision, candidate);
      applyWorkspace(response);
      status(message ? `${message} · saved for everyone.` : 'Workspace saved for everyone.');
      render();
      return true;
    } catch (error) {
      if (error?.status === 409) {
        try {
          applyWorkspace(error.payload?.error?.details || error.payload);
          status('Another device saved first. Your change was not saved; the latest shared version is now loaded.');
        } catch {
          if (previous) state = previous;
          needsRefresh = true;
          status('Another device saved first, but its latest version could not be loaded. Refresh before editing again.');
        }
      } else if (!error?.status || error.status >= 500) {
        try {
          applyWorkspace(await API.getWorkspace());
          status('The save response could not be confirmed. The latest shared workspace has been reloaded; review it before continuing.');
        } catch (refreshError) {
          if (previous) state = previous;
          needsRefresh = true;
          if (refreshError?.status === 401) showLogin('Your owner session expired. Sign in again; the last save could not be confirmed.');
          else status('Could not confirm whether the save reached the server. Reload the shared workspace before editing again.');
        }
      } else {
        if (previous) state = previous;
        if (error?.status === 401) {
          showLogin('Your owner session expired. Sign in again; the unsaved change was undone.');
        } else {
          status(`${error?.message || 'The shared workspace rejected that change.'} The local change was undone.`);
        }
      }
      render();
      return false;
    } finally {
      setSaving(false);
    }
  }
  const button = (label,action,id='',kind='secondary',ariaLabel='') => `<button type="button" class="button ${kind}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ''}>${label}</button>`;
  const preview = (file='index.html',label='Preview guest website ↗') => `<a class="button secondary" href="${file}?owner-preview=1">${label}</a>`;
  const empty = (title,text) => `<div class="empty-state"><h3>${title}</h3><p>${text}</p></div>`;
  const pill = (value,kind='') => `<span class="status-pill ${kind}">${esc(value)}</span>`;
  const heading = (title,description,actions='') => `<div class="page-heading"><div><p class="eyebrow">THE OWNER ROOM</p><h1>${title}</h1><p>${description}</p></div><div class="row-actions">${actions}</div></div>`;
  const panel = (title,body,action='') => `<section class="panel"><div class="panel-heading"><h2>${title}</h2>${action}</div>${body}</section>`;
  const field = (name,label,value='',type='text',extra='') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const area = (name,label,value='',extra='') => `<label class="field full">${label}<textarea name="${name}" rows="3" maxlength="1000" ${extra}>${esc(value)}</textarea></label>`;
  const select = (name,label,options,value='') => `<label class="field">${label}<select name="${name}">${options.map(x => {const [v,t] = Array.isArray(x) ? x : [x,x]; return `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`;}).join('')}</select></label>`;
  const check = (name,label,on,ariaLabel='') => `<label class="check-field"><input name="${name}" type="checkbox"${on ? ' checked' : ''}${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ''}> ${label}</label>`;
  const listRow = (title,detail,actions='',tag='') => `<div class="list-row"><div class="row-main"><h3>${esc(title)}</h3><p>${detail}</p>${tag}</div><div class="row-actions">${actions}</div></div>`;
  function safeImage(src) {
    const resolved = API?.assetUrl(src, '') || '';
    const imagePrefix = `${API.base}/api/v1/images/`;
    const allowed = /^(assets\/[a-zA-Z0-9._-]+|data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+)$/.test(resolved) ||
      (resolved.startsWith(imagePrefix) && /^[a-f0-9]{64}\.(webp|png|jpg)$/.test(resolved.slice(imagePrefix.length)));
    return allowed ? resolved : 'assets/stage.webp';
  }
  function searchBar(label,placeholder,extra='') { return `<div class="toolbar"><label class="field">${label}<input id="list-search" type="search" value="${esc(filter)}" placeholder="${placeholder}" autocomplete="off"></label>${extra}</div><p id="result-count" class="result-count" role="status"></p>`; }
  function openEditor(title,fields,callback,saveText='Save changes') {
    editorOpener = document.activeElement; editorSubmit = callback;
    $('#editor-title').textContent = title; $('#editor-fields').innerHTML = `<p id="editor-error" role="alert" class="login-error"></p>${fields}`;
    $('#editor-save').textContent = saveText; $('#editor-save').disabled = false;
    dialog.showModal(); document.body.classList.add('dialog-open');
  }
  function confirmation(title,body,callback,label) { openEditor(title,body,callback,label); }
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    const replacement = editorOpener?.dataset.action ? $$('[data-action]').find(el=>el.dataset.action===editorOpener.dataset.action && el.dataset.id===editorOpener.dataset.id) : null;
    if(editorOpener?.isConnected) editorOpener.focus({preventScroll:true});
    else if(replacement) replacement.focus({preventScroll:true});
    else if(loggedIn) workspace.focus({preventScroll:true});
    else $('#owner-username').focus({preventScroll:true});
  });
  $$('[data-close-dialog]').forEach(b => b.addEventListener('click', () => dialog.close()));
  form.addEventListener('submit',async event => {
    event.preventDefault(); const submit = $('#editor-save'); if(submit.disabled) return;
    submit.disabled = true;
    try { await editorSubmit(Object.fromEntries(new FormData(form))); if(dialog.open)dialog.close(); render(); }
    catch(error) { $('#editor-error').textContent = error.message || 'Please check the details and try again.'; $('#editor-error').scrollIntoView({block:'nearest'}); }
    finally { submit.disabled = false; }
  });
  function required(value,label) { const text = String(value || '').trim(); if(!text) throw new Error(`${label} is required.`); return text; }
  function numeric(value,label,min=0) { if(value === '' || !Number.isFinite(Number(value)) || Number(value) < min) throw new Error(`${label} must be a number of at least ${min}.`); return Number(value); }
  function requireCurrentState(expected) { if(state!==expected) throw new Error('The shared workspace changed while this editor was open. Reopen it and try again.'); }
  async function readPhoto(file) {
    if(!file || !file.size)return null;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>15000000)throw new Error('Choose a PNG, JPEG, or WebP photograph up to 15 MB.');
    const objectUrl=URL.createObjectURL(file);
    try {
      const photo=new Image();photo.src=objectUrl;await photo.decode();
      const ratio=Math.min(1,1600/Math.max(photo.naturalWidth,photo.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(photo.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(photo.naturalHeight*ratio));
      const context=canvas.getContext('2d');if(!context)throw new Error('The browser cannot prepare this photograph.');
      context.drawImage(photo,0,0,canvas.width,canvas.height);
      let value=canvas.toDataURL('image/webp',.86);
      if(value.length>820000)value=canvas.toDataURL('image/webp',.65);
      if(value.length>820000)throw new Error('This photograph is too detailed to store here. Choose a smaller image.');
      return value;
    } catch(error) { throw new Error(error.message || 'The photograph could not be read.'); }
    finally { URL.revokeObjectURL(objectUrl); }
  }
  function navigate(next) { if(!loggedIn||saving||refreshing) return; view = next; filter = ''; activeOrder = null; history.replaceState(null,'','#'+next); render(); workspace.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
  function render() {
    if(!state || !loggedIn) return;
    $$('[data-view]').forEach(b => { if(b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    const screens = {overview:renderOverview,menu:renderMenu,music:renderMusic,hours:renderHours,inventory:renderInventory,purchases:renderPurchases,team:renderTeam,activity:renderActivity,settings:renderSettings,website:renderWebsite,schedule:()=>extra.renderSchedule(),backups:()=>extra.renderBackups()};
    workspace.innerHTML = (screens[view] || renderOverview)();
    if(needsRefresh) workspace.insertAdjacentHTML('afterbegin',`<p class="notice"><strong>Shared state needs to be reloaded.</strong> The last save response could not be confirmed. ${button('Reload workspace','refresh-workspace','','secondary')}</p>`);
    if($('#list-search')) applyFilter();
    extra?.afterRender?.(view);
  }
  function renderOverview() {
    const low = M.lowStock(state); const future = state.events.filter(e => e.status !== 'Cancelled' && e.date >= dayKey()).sort((a,b)=>a.date.localeCompare(b.date));
    const pending = state.orders.filter(o => o.status === 'Draft' || o.status === 'Submitted (demo)');
    return heading('Good to see you, Steven.','A clear view of the parlor—and the things that need your attention.',preview()) +
      `<div class="stat-grid"><div class="stat"><span>Menu available</span><strong>${state.menu.filter(i=>i.available).length}<small> / ${state.menu.length}</small></strong><p>Items in your guest preview</p></div><div class="stat"><span>On the calendar</span><strong>${future.length}</strong><p>Upcoming published shows</p></div><div class="stat"><span>Stock to review</span><strong>${low.length}</strong><p>Sample items at reorder level</p></div><div class="stat"><span>Orders in progress</span><strong>${pending.length}</strong><p>Draft or simulated submission</p></div></div>` +
      `<div class="split">${panel('Make yourself at home.',`<p>Try a complete task, then check the result. Your changes are saved as you go.</p><div class="row-list">${listRow('Update a dish','Change a price, description, or availability.',button('Edit menu →','nav-menu'))}${listRow('Plan the next show','Set the artist, photograph, date, and set times.',button('Manage music →','nav-music'))}${listRow('Restock the kitchen','Build a sample order and receive it into stock.',button('Start an order →','new-order'))}</div>`)}` +
      `${panel('Needs a look.',low.length ? `<p class="muted">Illustrative inventory, quantities, and supplier prices.</p><div class="row-list">${low.slice(0,3).map(i=>listRow(i.name,`${i.onHand} ${esc(i.unit)} on hand · target ${i.par}`,button('Review','edit-stock',i.id,'secondary',`Review ${i.name}`),pill('Low stock','warning'))).join('')}</div>` : empty('Stock is covered.','No sample items are at their reorder level.'),button('All inventory →','nav-inventory'))}</div>` +
      `<div class="split">${panel('Next on the stage.',future[0] ? `<div class="event-feature"><img src="${esc(safeImage(future[0].image))}" alt="${esc(future[0].name)}"><div><p class="eyebrow">${esc(dateLabel(future[0].date))}</p><h3>${esc(future[0].name)}</h3><p>${esc(timeLabel(future[0].start))}–${esc(timeLabel(future[0].end))} Central</p>${button('Edit show','edit-event',future[0].id)}</div></div>` : empty('The stage is yours.','Add a show to see it in the guest preview.'))}${panel('Recent changes.',activityRows(4),button('All activity →','nav-activity'))}</div>`;
  }
  function renderMenu() {
    return heading('The menu, in your hands.','Edit the menu guests see. Availability changes remove a dish from your guest preview.',button('Add a dish','new-menu','','') + preview('menu.html','Preview menu ↗')) +
    searchBar('Find a dish','Name, category, or ingredient') + `<div class="row-list panel">${state.menu.map(i=>`<article data-search="${esc([i.name,i.category,i.description].join(' ').toLowerCase())}" class="list-row"><div class="row-main"><p class="eyebrow">${esc(i.category)}</p><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p><strong>${esc(i.price || 'Ask for current pricing')}</strong></div><div class="row-actions">${pill(i.available ? 'Available' : 'Unavailable',i.available ? 'good':'warning')}${button('Edit','edit-menu',i.id,'secondary',`Edit ${i.name}`)}<button class="button quiet" data-action="toggle-menu" data-id="${esc(i.id)}" aria-label="${i.available ? 'Mark unavailable' : 'Make available'}: ${esc(i.name)}">${i.available ? 'Mark unavailable' : 'Make available'}</button></div></article>`).join('')}</div><div id="search-empty" hidden>${empty('No dishes found.','Try another name or clear the search.')}</div>`;
  }
  function editMenu(id) {
    const editState=state;
    const item = state.menu.find(i=>i.id===id); const categories = [...new Set(state.menu.map(i=>i.category))];
    openEditor(item ? 'Edit menu item' : 'Add a dish',`<div class="field-grid">${field('name','Dish name',item?.name,'text','required maxlength="100"')}${field('category','Category',item?.category || categories[0] || 'Specials','text','required maxlength="100" list="menu-categories"')}<datalist id="menu-categories">${categories.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>${field('price','Price / sizes',item?.price,'text','maxlength="180" placeholder="Bowl 11.99"')}${area('description','Description',item?.description)}${field('upload','Dish photograph','','file','accept="image/png,image/jpeg,image/webp"')}${field('imageAlt','Describe the photograph',item?.imageAlt,'text','maxlength="240"')}${item?.image?`<div class="field full"><img class="editor-photo" src="${esc(safeImage(item.image))}" alt="${esc(item.imageAlt || item.name)}">${check('removeImage','Remove this photograph',false)}</div>`:''}${check('available','Available in the guest preview',item?.available ?? true)}<p class="muted full">Choose an existing category or type a new one. Unavailable dishes stay here for later use. Photos are resized automatically and displayed without cropping.</p></div>`,async data=>{
      const upload=$('input[name=upload]',form).files[0];
      const image=upload?await readPhoto(upload):(data.removeImage?'':item?.image || '');
      requireCurrentState(editState);
      const values = {name:required(data.name,'Dish name'),category:required(data.category,'Category'),price:data.price.trim(),description:data.description.trim(),available:!!data.available,image,imageAlt:data.imageAlt.trim()};
      if(item) Object.assign(item,values); else state.menu.push({id:M.id('menu'),...values}); await persist(`${item ? 'Updated' : 'Added'} ${values.name}`);
    });
  }
  function renderMusic() {
    const events = [...state.events].sort((a,b)=>a.date.localeCompare(b.date));
    return heading('Keep the stage moving.','Manage the artist, photo, date, and set times. The saved lineup is a starting point for this demo.',button('Add a show','new-event','','') + preview('music.html','Preview calendar ↗')) +
      `<p class="notice">This is an editable copy of the saved lineup. It does not change Tolbert’s official calendar.</p><div class="card-grid">${events.map(e=>`<article class="item-card event-card"><div class="photo-tile"><img src="${esc(safeImage(e.image))}" alt="${esc(e.name)}" loading="lazy"></div><div class="item-body"><div class="item-meta"><time datetime="${esc(e.date)}">${esc(dateLabel(e.date))}</time>${pill(e.status,e.status === 'Cancelled' ? 'warning' : 'good')}</div><h2>${esc(e.name)}</h2><p>${esc(e.genre || 'Live music')}</p><strong>${esc(timeLabel(e.start))}–${esc(timeLabel(e.end))} Central</strong><div class="row-actions">${button('Edit show','edit-event',e.id,'secondary',`Edit ${e.name}`)}${button(e.status === 'Cancelled' ? 'Restore show' : 'Cancel show',e.status === 'Cancelled' ? 'restore-event':'cancel-event',e.id,'quiet',`${e.status === 'Cancelled' ? 'Restore' : 'Cancel'} ${e.name}`)}</div></div></article>`).join('')}</div>${!events.length ? empty('No shows yet.','Add the first show to your calendar.') : ''}`;
  }
  function editEvent(id) {
    const editState = state;
    const item = state.events.find(i=>i.id===id);
    const photos = [...new Map([...(baseline?.events || []),...state.events].map(e=>[e.image,[e.image,e.name]])).values()]; photos.unshift(['assets/stage.webp','Tolbert’s stage']);
    if(item?.image && !photos.some(p=>p[0]===item.image)) photos.unshift([item.image,'Current photo']);
    openEditor(item ? 'Edit the show' : 'Add a show',`<div class="field-grid">${field('name','Artist / band name',item?.name,'text','required maxlength="120"')}${field('genre','Genre / short description',item?.genre,'text','maxlength="140"')}${field('date','Show date',item?.date || dayKey(),'date','required')}${select('status','Status',['Scheduled','Cancelled'],item?.status || 'Scheduled')}${field('start','Set starts',inputTime(item?.start),'time','required')}${field('end','Set ends',inputTime(item?.end || '22:00'),'time','required')}${select('image','Artist photograph',photos,item?.image || 'assets/stage.webp')}${field('upload','Or upload a photograph','','file','accept="image/png,image/jpeg,image/webp"')}<p class="field full muted">Use a photo of the actual artist. Images are shown in full, with dates and names outside the photograph. Choose a PNG, JPEG, or WebP up to 15 MB; the workspace resizes it automatically.</p></div>`,async data=>{
      const name = required(data.name,'Artist name'); let image = data.image;
      const upload = $('input[name=upload]',form).files[0];
      if(upload) image=await readPhoto(upload);
      requireCurrentState(editState);
      if(data.start === data.end) throw new Error('Start and end times must be different. A set ending earlier than it starts is treated as ending the next day.');
      const values = {name,genre:data.genre.trim(),date:data.date,start:data.start,end:data.end,image,status:data.status};
      if(item) Object.assign(item,values); else state.events.push({id:M.id('show'),...values}); await persist(`${item ? 'Updated' : 'Added'} show: ${name}`);
    });
  }
  function renderHours() {
    return heading('Open doors. Clear hours.','Keep regular hours and special dates in one place.',preview('index.html','Preview hours ↗')) +
      `<div class="split">${panel('Weekly hours.',`<form id="hours-form"><div class="row-list">${state.hours.map((h,i)=>`<div class="hours-editor"><strong>${esc(h.day)}</strong><div class="field-grid">${field('open-'+i,'Opens',h.open,'time',`required aria-label="${esc(h.day)} opens"`)}${field('close-'+i,'Closes',h.close,'time',`required aria-label="${esc(h.day)} closes"`)}${check('closed-'+i,'Closed',h.closed,`${h.day} closed`)}</div></div>`).join('')}</div><p class="muted">All times are Central. 12:00 AM means midnight at the end of the day.</p><button class="button" type="submit">Save weekly hours</button></form>`)}` +
      `${panel('Special dates.',`<p>A holiday or one-time closure overrides the weekly hours for that date.</p><div class="row-list">${state.exceptions.map(e=>listRow(dateLabel(e.date),`${esc(e.label)} · ${e.closed ? 'Closed' : `${esc(timeLabel(e.open))}–${esc(timeLabel(e.close))}`}`,button('Edit','edit-exception',e.id,'secondary',`Edit special hours for ${dateLabel(e.date)}`)+button('Remove','remove-exception',e.id,'quiet',`Remove special hours for ${dateLabel(e.date)}`))).join('') || empty('No exceptions yet.','Add holiday hours or a one-time closure.')}</div>`,button('Add special date','new-exception'))}</div>`;
  }
  function editException(id) {
    const item = state.exceptions.find(i=>i.id===id);
    openEditor('Special hours',`<div class="field-grid">${field('date','Date',item?.date || dayKey(),'date','required')}${field('label','Label',item?.label,'text','required maxlength="100" placeholder="Holiday hours"')}${field('open','Opens',item?.open || '11:00','time','required')}${field('close','Closes',item?.close || '21:00','time','required')}${check('closed','Closed all day',item?.closed ?? true)}</div>`,async data=>{
      if(state.exceptions.some(e=>e.date===data.date && e.id!==id)) throw new Error('That date already has special hours. Edit the existing entry.');
      const values={date:data.date,label:required(data.label,'Label'),open:data.open,close:data.close,closed:!!data.closed};
      if(!values.closed && values.open===values.close) throw new Error('Opening and closing times must be different.');
      if(item) Object.assign(item,values); else state.exceptions.push({id:M.id('hours'),...values}); await persist(`Saved special hours for ${dateLabel(data.date)}`);
    });
  }
  function renderInventory() {
    return heading('Know what’s on the shelf.','Sample stock and costs let you try counting, reorder levels, and receiving.',button('Add stock item','new-stock','','')+button('Create purchase order','new-order')) +
      `<p class="notice">Illustrative inventory and suppliers. These are not Tolbert’s actual stock counts, vendors, or purchase prices.</p>` +
      searchBar('Find stock','Item name or supplier',`<button class="button quiet" data-action="low-stock">Show low stock</button><button class="button quiet" data-action="clear-search">Show all</button>`) +
      `<div class="row-list panel">${state.inventory.map(i=>`<article class="list-row" data-search="${esc((i.name+' '+i.vendor+(!i.archived && i.onHand<=i.reorderAt?' low stock':'')).toLowerCase())}"><div class="row-main"><p class="eyebrow">${esc(i.vendor)}</p><h3>${esc(i.name)}</h3><p>${esc(i.unit)} · ${cash(i.cost)} per unit</p><p>Reorder at ${i.reorderAt} · target ${i.par}</p></div><div class="stock-count"><strong>${i.onHand}</strong><span>${esc(i.unit)} on hand</span></div><div class="row-actions">${pill(i.archived?'Archived':i.onHand<=i.reorderAt ? 'Low stock':'Stocked',i.archived?'':i.onHand<=i.reorderAt ? 'warning':'good')}${button('Update stock','edit-stock',i.id,'secondary',`Update ${i.name} stock`)}${button(i.archived?'Restore':'Archive','toggle-stock',i.id,'quiet',`${i.archived?'Restore':'Archive'} ${i.name}`)}</div></article>`).join('')}</div><div id="search-empty" hidden>${empty('No stock matches.','Clear the filter or search by item or supplier.')}</div>`;
  }
  function editStock(id) {
    const item = state.inventory.find(i=>i.id===id);
    openEditor(item ? 'Update stock item' : 'Add a stock item',`<p class="notice">Demo inventory only. Counts and costs are illustrative.</p><div class="field-grid">${field('name','Item name',item?.name,'text','required maxlength="100"')}${field('vendor','Sample supplier',item?.vendor || 'Demo food supplier','text','required maxlength="100"')}${field('unit','Unit',item?.unit || 'case','text','required maxlength="40"')}${field('cost','Cost per unit ($)',item?.cost ?? 0,'number','required min="0" step="0.01" max="100000"')}${field('onHand','On hand',item?.onHand ?? 0,'number','required min="0" step="0.01" max="100000"')}${field('reorderAt','Reorder at',item?.reorderAt ?? 2,'number','required min="0" step="0.01" max="100000"')}${field('par','Target stock',item?.par ?? 10,'number','required min="0" step="0.01" max="100000"')}</div>`,async data=>{
      const values={name:required(data.name,'Item name'),vendor:required(data.vendor,'Supplier'),unit:required(data.unit,'Unit'),cost:numeric(data.cost,'Cost'),onHand:numeric(data.onHand,'On hand'),reorderAt:numeric(data.reorderAt,'Reorder level'),par:numeric(data.par,'Target stock')};
      if(values.par < values.reorderAt) throw new Error('Target stock must be at least the reorder level.');
      if(item && values.vendor !== item.vendor && state.orders.some(order=>order.lines.some(line=>line.itemId===item.id))) throw new Error('The supplier cannot be changed after this item has been used in a demo order.');
      if(item) Object.assign(item,values); else state.inventory.push({id:M.id('stock'),...values}); await persist(`Updated stock: ${values.name}`);
    });
  }
  function renderPurchases() {
    if(activeOrder) return renderOrder(state.orders.find(o=>o.id===activeOrder));
    return heading('From low stock to restocked.','Draft, review, simulate submission, then receive your sample order.',button('New purchase order','new-order','','')) +
      `<p class="notice">All purchase orders are simulated. No supplier is contacted, no payment is taken, and no restaurant stock is changed.</p>` +
      panel('Purchase orders.',state.orders.length ? `<div class="row-list">${[...state.orders].reverse().map(o=>listRow(o.number,`${esc(o.vendor)} · ${o.lines.length} line${o.lines.length===1?'':'s'} · ${cash(M.orderTotal(o))}`,button('Open order','open-order',o.id,'secondary',`Open ${o.number}`),pill(o.status,o.status==='Received'?'good':o.status==='Cancelled'?'':'warning'))).join('')}</div>` : empty('Your first order starts here.','Choose a sample supplier and the quantities you need. You will review the order before simulating submission.'));
  }
  function renderOrder(o) {
    if(!o){activeOrder=null;return renderPurchases();}
    let actions=button('All purchase orders','all-orders');
    if(o.status==='Draft') actions+=button('Edit draft','edit-order',o.id)+button('Simulate submission','submit-order',o.id,'');
    if(o.status==='Submitted (demo)') actions+=button('Receive stock','receive-order',o.id,'');
    if(['Draft','Submitted (demo)'].includes(o.status)) actions+=button('Cancel order','cancel-order',o.id,'quiet');
    actions+=button('Download CSV','export-order',o.id,'quiet');
    return heading(esc(o.number),esc(o.vendor),actions)+`<p class="notice">Demo purchase order · nothing is sent to a supplier and no payment is taken.</p>`+
      panel('Order details.',`<div class="item-meta">${pill(o.status,o.status==='Received'?'good':'warning')}<span>${new Date(o.createdAt).toLocaleDateString('en-US')}</span></div><div class="order-lines">${o.lines.map(l=>`<div class="order-line"><div><h3>${esc(l.name)}</h3><p>${l.quantity} × ${esc(l.unit)} at ${cash(l.unitCost)}</p></div><strong>${cash(l.quantity*l.unitCost)}</strong></div>`).join('')}</div><div class="totals"><span>Items subtotal</span><strong>${cash(M.orderTotal(o))}</strong></div><p class="muted">Sample prices. Taxes, freight, and supplier terms are not included.</p>${o.notes ? `<p><strong>Notes</strong><br>${esc(o.notes)}</p>`:''}<div class="progress-steps"><span>1 · Draft</span><span>2 · Simulated submission</span><span>3 · Stock received</span></div>${o.status==='Received'?'<p class="notice">This order has been received into the demo inventory. It cannot be received twice.</p>':''}`);
  }
  function newOrder(orderId) {
    const existing=typeof orderId==='string'?state.orders.find(o=>o.id===orderId):null;
    if(existing && existing.status!=='Draft')throw new Error('Only draft orders can be edited. Completed orders retain their original record.');
    const stock=state.inventory.filter(i=>!i.archived || existing?.lines.some(l=>l.itemId===i.id));
    const vendors=[...new Set(stock.map(i=>i.vendor))];
    if(!vendors.length){status('Add a stock item and supplier first.');navigate('inventory');return;}
    openEditor(existing?'Edit purchase draft':'Build a purchase order',`<p class="notice">Nothing is sent to a supplier. Saving uses the current inventory unit costs shown below.</p>${select('vendor','Supplier',vendors,existing?.vendor || vendors[0])}<div id="purchase-items"></div>${area('notes','Order notes',existing?.notes)}<div class="totals"><span>Items subtotal</span><strong id="draft-total">${cash(0)}</strong></div>`,async data=>{
      const lines=stock.filter(i=>i.vendor===data.vendor).map(i=>({itemId:i.id,quantity:Number(data['qty-'+i.id])})).filter(l=>l.quantity!==0);
      const input={vendor:data.vendor,lines,notes:data.notes.trim()};
      const order=existing?M.updateDraftOrder(state,existing.id,input):M.createOrder(state,input); activeOrder=order.id; view='purchases'; await persist();
    },existing?'Save draft':'Create draft order');
    function drawItems(){const vendor=$('select[name=vendor]',form).value; $('#purchase-items').innerHTML=`<div class="order-lines">${stock.filter(i=>i.vendor===vendor).map(i=>`<div class="order-line"><div><h3>${esc(i.name)}</h3><p>${i.onHand} ${esc(i.unit)} on hand · target ${i.par}</p><span>${cash(i.cost)} / ${esc(i.unit)}</span></div>${field('qty-'+i.id,'Quantity',existing?(existing.lines.find(l=>l.itemId===i.id)?.quantity || 0):(i.onHand<=i.reorderAt?Math.ceil(Math.max(0,i.par-i.onHand)):0),'number',`min="0" step="1" max="10000" required aria-label="Quantity of ${esc(i.name)}"`)}</div>`).join('')}</div>`;total();}
    function total(){let amount=0;state.inventory.forEach(i=>{const el=$(`[name="qty-${i.id}"]`,form);if(el)amount+=Math.round(i.cost*100)*(Number(el.value)||0);});$('#draft-total').textContent=cash(amount/100);}
    $('select[name=vendor]',form).addEventListener('change',drawItems); $('#purchase-items').addEventListener('input',total);drawItems();
  }
  function renderTeam() {
    return heading('The right hands on deck.','Explore how owner, manager, and editor roles would be organized.',button('Add demo teammate','new-teammate','',''))+
      `<p class="notice">Team entries illustrate permissions. They do not invite people or create working accounts; Steven is the only demo login.</p>`+
      panel('People & roles.',`<div class="row-list">${state.team.map(t=>listRow(t.name,`${esc(t.role)} · ${t.role==='Owner'?'All demo controls':t.role==='Manager'?'Operations, stock, and purchase drafts':'Menu, music, and hours'}`,button(t.id==='steven'?'Edit profile':'Edit role','edit-teammate',t.id)+(t.id==='steven'?pill('Your account','good'):button('Remove','remove-teammate',t.id,'quiet')),pill(t.status))).join('')}</div>`)+
      `<div class="card-grid">${[['Owner','Website settings, team roles, all content, inventory, and purchase-order actions.'],['Manager','Menu, calendar, hours, stock counts, and purchase drafts.'],['Editor','Guest-facing content: menu, music, and hours.']].map(([title,copy])=>panel(title,`<p>${copy}</p>`)).join('')}</div>`;
  }
  function editTeammate(id) {
    const item=state.team.find(i=>i.id===id);
    openEditor(item?'Edit demo teammate':'Add demo teammate',`<p class="notice">No invitation or account will be created.</p><div class="field-grid">${field('name','Name',item?.name,'text','required maxlength="100"')}${item?.id==='steven'?'<p class="muted full">Steven keeps full owner access. This changes the display name; the login remains Steven.</p>':select('role','Role',['Owner','Manager','Editor'],item?.role || 'Editor')+select('status','Status',['Active','Inactive'],item?.status || 'Active')}</div>`,async data=>{const values={name:required(data.name,'Name'),role:item?.id==='steven'?'Owner':data.role,status:item?.id==='steven'?'Active':data.status};if(item)Object.assign(item,values);else state.team.push({id:M.id('team'),...values});await persist(`Updated demo teammate: ${values.name}`);});
  }
  function activityRows(limit=100) { return state.activity.length ? `<div class="row-list">${state.activity.slice(0,limit).map(a=>`<div class="activity-row"><span class="user-avatar" aria-hidden="true">S</span><div><strong>${esc(a.message)}</strong><p>Steven · ${new Date(a.at || a.timestamp || a.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p></div></div>`).join('')}</div>` : empty('A fresh start.','Saved edits and order actions will appear here.'); }
  function renderActivity() { return heading('A record of the changes.','Your latest 100 workspace actions, shared across signed-in devices.')+panel('Activity.',activityRows()); }
  function renderSettings() {
    return heading('Make it feel like your parlor.','Update contact details, a guest notice, and your sign-in.',preview())+
      `<div class="split">${panel('Guest-facing details.',`<form id="settings-form" class="field-grid">${field('phone','Phone number',state.settings.phone,'tel','required maxlength="40"')}${field('address','Address',state.settings.address,'text','required maxlength="200"')}${area('announcement','Homepage notice',state.settings.announcement,'placeholder="Optional: special hours, a private event, or an announcement."')}<p class="muted full">Leave the notice blank to hide it. Saved details appear in your guest preview.</p><button class="button" type="submit">Save details</button></form>`)}`+
      `${panel('Your login.',`<p><strong>Username: Steven</strong></p><p>Use a unique password of at least 12 characters. A password change signs future requests with a new private session token.</p>${button('Change password','change-password')}`)}</div>`;
  }
  function renderWebsite() {
    const catalog=window.OwnerContent;
    if(!catalog)return heading('Website content.','The content editor could not load. Refresh this page.');
    const groups=[...new Set(catalog.fields.map(f=>f.group || 'Website text'))];
    return heading('Your words. Your photographs.','Edit the website here, then open the guest preview to see your saved version.',preview())+
      `<p class="notice">Edit the website copy, links, and photographs below. Successful saves update this shared preview for visitors on every device.</p>`+
      `<div class="card-grid">${groups.map(group=>panel(esc(group),`<p>${catalog.fields.filter(f=>(f.group || 'Website text')===group).map(f=>esc(f.label)).join(' · ')}</p>${button('Edit text','edit-content',group)}`)).join('')}</div>`+
      `<section class="website-photo-section"><h2>Website photographs</h2><div class="card-grid">${catalog.images.map(image=>`<article class="item-card"><img class="editor-photo" src="${esc(safeImage(state.settings.images?.[image.key] || image.defaultValue))}" alt="${esc(image.label)}"><h3>${esc(image.label)}</h3>${button('Change photograph','edit-photo',image.key)}</article>`).join('')}</div></section>`;
  }
  function editContent(group) {
    const fields=window.OwnerContent.fields.filter(f=>(f.group || 'Website text')===group);
    openEditor(group,`<div class="field-grid">${fields.map(f=>{
      const value=state.settings.content?.[f.key] ?? f.defaultValue ?? '';
      return f.type==='textarea'?area(f.key,esc(f.label),value):field(f.key,esc(f.label),value,['url','email'].includes(f.type)?f.type:'text',`maxlength="${f.maxLength || 500}"`);
    }).join('')}</div>`,async data=>{
      const content={...state.settings.content};
      fields.forEach(f=>{
        const value=String(data[f.key] || '').trim();
        if(value.length>(f.maxLength || (f.type==='textarea'?1000:500)))throw new Error(`${f.label} is too long.`);
        if(f.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error('Enter a valid email address.');
        if(f.type==='url') {
          let url;try{url=new URL(value);}catch{throw new Error(`Enter a complete ${f.label.toLowerCase()}.`);}
          if(!(f.allowedProtocols || ['https:']).includes(url.protocol))throw new Error(`${f.label} must start with ${(f.allowedProtocols || ['https:']).join(' or ')}.`);
          if(url.protocol==='mailto:' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decodeURIComponent(url.pathname)))throw new Error('Enter a valid contact email after mailto:.');
        }
        if(f.maxLines && value.split(/\n/).length>f.maxLines)throw new Error(`${f.label} supports ${f.maxLines} lines to preserve the layout.`);
        content[f.key]=value;
      });
      state.settings.content=content;await persist(`Updated website text: ${group}`);
    });
  }
  function editPhoto(key) {
    const item=window.OwnerContent.images.find(image=>image.key===key);if(!item)return;
    const editState=state;
    const alt=window.OwnerContent.fields.find(f=>f.key===item.altKey);
    openEditor(item.label,`<img class="editor-photo" src="${esc(safeImage(state.settings.images?.[key] || item.defaultValue))}" alt="${esc(item.label)}"><div class="field-grid">${field('upload','Choose a photograph','','file','accept="image/png,image/jpeg,image/webp"')}${alt?field('alt','Describe the photograph',state.settings.content?.[alt.key] ?? alt.defaultValue,'text','maxlength="240"'):''}${check('restore','Restore the original photograph',false)}<p class="muted full">PNG, JPEG, or WebP up to 15 MB. The image is resized for storage. Check its presentation in the guest preview.</p></div>`,async data=>{
      const upload=$('input[name=upload]',form).files[0];
      const photo=upload?await readPhoto(upload):null;requireCurrentState(editState);
      const images={...state.settings.images};
      if(photo)images[key]=photo;else if(data.restore)delete images[key];
      state.settings.images=images;
      if(alt)state.settings.content={...state.settings.content,[alt.key]:String(data.alt || '').trim()};
      await persist(`Updated website photograph: ${item.label}`);
    });
  }
  function changePassword() {
    openEditor('Change password',`<p class="notice">Use a unique password you do not use for another account. Changing it updates the private owner sign-in.</p><div class="field-grid">${field('current','Current password','','password','required autocomplete="current-password"')}${field('next','New password','','password','required minlength="12" maxlength="100" autocomplete="new-password"')}${field('repeat','Repeat new password','','password','required minlength="12" maxlength="100" autocomplete="new-password"')}</div>`,async data=>{
      if(data.next!==data.repeat)throw new Error('The new passwords do not match.');
      if(String(data.next || '').length<12)throw new Error('The new password must be at least 12 characters.');
      if(data.next===data.current)throw new Error('Choose a different password.');
      try {
        await API.changePassword(data.current,data.next);
        status('Password changed. This browser is still signed in with the new private session.');
      } catch(error) {
        if(error?.status===401)showLogin('Your owner session expired. Sign in again to change the password.');
        throw error;
      }
    },'Change password');
  }
  function exportOrder(o){
    const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['DEMO ORDER - NOT SENT TO SUPPLIER'],[o.number,o.vendor,o.status],['Item','Quantity','Unit','Unit cost','Line total'],...o.lines.map(l=>[l.name,l.quantity,l.unit,l.unitCost,(Math.round(l.unitCost*100)*l.quantity/100).toFixed(2)]),['Items subtotal','','','',M.orderTotal(o).toFixed(2)],['Taxes and freight not included']];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=o.number+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Demo order CSV downloaded. No supplier was contacted.');
  }
  document.addEventListener('click',async event=>{
    const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
    const control=event.target.closest('[data-action]');if(!control||!loggedIn)return;
    const action=control.dataset.action,id=control.dataset.id;
    if(action.startsWith('nav-')){navigate(action.slice(4));return;}
    const handlers={
      'new-menu':()=>editMenu(), 'edit-menu':()=>editMenu(id),
      'toggle-menu':async()=>{const i=state.menu.find(i=>i.id===id);i.available=!i.available;await persist(`${i.available?'Made available':'Marked unavailable'}: ${i.name}`);},
      'new-event':()=>editEvent(), 'edit-event':()=>editEvent(id),
      'cancel-event':()=>{const i=state.events.find(i=>i.id===id);confirmation('Cancel this show?',`<p><strong>${esc(i.name)}</strong> · ${esc(dateLabel(i.date))}</p><p>It will be removed from your guest preview. You can restore it later.</p>`,async()=>{i.status='Cancelled';await persist(`Cancelled demo show: ${i.name}`);},'Cancel show');},
      'restore-event':async()=>{const i=state.events.find(i=>i.id===id);i.status='Scheduled';await persist(`Restored show: ${i.name}`);},
      'new-exception':()=>editException(), 'edit-exception':()=>editException(id),
      'remove-exception':()=>confirmation('Remove special hours?','<p>The weekly schedule will apply to this date again.</p>',async()=>{state.exceptions=state.exceptions.filter(e=>e.id!==id);await persist('Removed special hours');},'Remove special hours'),
      'new-stock':()=>editStock(), 'edit-stock':()=>editStock(id),
      'toggle-stock':async()=>{const item=state.inventory.find(i=>i.id===id);item.archived=!item.archived;await persist(`${item.archived?'Archived':'Restored'} stock item: ${item.name}`);},
      'low-stock':()=>{filter='low stock';$('#list-search').value=filter;applyFilter();},
      'clear-search':()=>{filter='';$('#list-search').value='';applyFilter();},
      'new-order':()=>newOrder(), 'edit-order':()=>newOrder(id),
      'open-order':()=>{activeOrder=id;render();workspace.focus({preventScroll:true});},
      'all-orders':()=>{activeOrder=null;render();},
      'submit-order':()=>{const o=state.orders.find(o=>o.id===id);confirmation('Simulate this submission?',`<p><strong>${esc(o.number)}</strong> · ${esc(o.vendor)}</p><p>${o.lines.length} line items · <strong>${cash(M.orderTotal(o))}</strong> items subtotal</p><p class="notice">This only advances the demo order. No supplier receives it and no money is spent.</p>`,async()=>{M.submitOrder(state,id);await persist();},'Simulate submission');},
      'receive-order':()=>{const o=state.orders.find(o=>o.id===id);confirmation('Receive the sample stock?',`<p>Mark all items in <strong>${esc(o.number)}</strong> received and add their quantities to the demo inventory.</p><p>Real stock and supplier records are unaffected.</p>`,async()=>{M.receiveOrder(state,id);await persist();},'Receive sample stock');},
      'cancel-order':()=>confirmation('Cancel this demo order?','<p>No stock quantities will change. The cancelled order stays in your records.</p>',async()=>{M.cancelOrder(state,id);await persist();},'Cancel order'),
      'export-order':()=>exportOrder(state.orders.find(o=>o.id===id)),
      'new-teammate':()=>editTeammate(), 'edit-teammate':()=>editTeammate(id),
      'remove-teammate':()=>confirmation('Remove demo teammate?','<p>This removes only the sample workspace entry; it does not revoke a real staff account.</p>',async()=>{if((state.shifts || []).some(shift=>shift.memberId===id))throw new Error('This person has saved shifts. Mark them inactive to keep the schedule history, or remove their shifts first.');state.team=state.team.filter(t=>t.id!==id);await persist('Removed demo teammate');},'Remove teammate'),
      'change-password':changePassword,
      'edit-content':()=>editContent(id), 'edit-photo':()=>editPhoto(id),
      'refresh-workspace':()=>refreshWorkspace({quiet:false})
    };
    try{if(!handlers[action] && extra?.handle(action,id))return;await handlers[action]?.();}catch(error){status(error.message || 'That action could not be completed.');}
  });
  function applyFilter(){let count=0;$$('[data-search]',workspace).forEach(row=>{row.hidden=!filter.toLowerCase().trim().split(/\s+/).filter(Boolean).every(t=>row.dataset.search.includes(t));if(!row.hidden)count++;});$('#result-count').textContent=`${count} ${view==='menu'?'dishes':'stock items'} shown`;$('#search-empty').hidden=count>0;}
  function markInlineFormDirty(target){const inline=target.closest?.('#hours-form, #settings-form');if(inline)inline.dataset.dirty='true';}
  function hasDirtyInlineForm(){return Boolean($('#hours-form[data-dirty="true"], #settings-form[data-dirty="true"]',workspace));}
  workspace.addEventListener('input',event=>{if(event.target.id==='list-search'){filter=event.target.value;applyFilter();}markInlineFormDirty(event.target);});
  workspace.addEventListener('change',event=>markInlineFormDirty(event.target));
  workspace.addEventListener('submit',async event=>{
    if(!['hours-form','settings-form'].includes(event.target.id))return;event.preventDefault();
    const data=Object.fromEntries(new FormData(event.target));
    try{
      if(event.target.id==='hours-form'){
        const hours=state.hours.map((h,i)=>({...h,open:data['open-'+i],close:data['close-'+i],closed:!!data['closed-'+i]}));
        if(hours.some(h=>!h.closed && h.open===h.close))throw new Error('Opening and closing times must differ for each open day.');
        state.hours=hours;await persist('Updated weekly hours');
      }else{state.settings={...state.settings,phone:required(data.phone,'Phone'),address:required(data.address,'Address'),announcement:data.announcement.trim()};await persist('Updated guest-facing details');}
    }catch(error){status(error.message);}
  });
  function showOwner(){loggedIn=true;$('#login-view').hidden=true;$('#owner-shell').hidden=false;syncSkipLink(true);view=['overview','menu','music','hours','inventory','purchases','team','activity','settings','website','schedule','backups'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';render();workspace.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  function showLogin(message=''){loggedIn=false;$('#owner-shell').hidden=true;$('#login-view').hidden=false;syncSkipLink(false);if(dialog.open)dialog.close();$('#login-form').reset();$('#login-error').textContent=message;$('#owner-username').focus();window.scrollTo({top:0,behavior:'instant'});}
  $('#logout').addEventListener('click',async event=>{const control=event.currentTarget;control.disabled=true;try{await API.logout();}finally{window.location.assign('index.html?logged-out=1');}});
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(event.target));const b=$('button[type=submit]',event.target);b.disabled=true;
    try{await API.login(data.username,data.password);applyWorkspace(await API.getWorkspace());$('#login-error').textContent='';event.target.reset();showOwner();}
    catch(error){$('#login-error').textContent=error.message;}finally{b.disabled=false;}
  });
  async function refreshWorkspace({quiet=true,discardDirty=false}={}) {
    if(!loggedIn||saving||refreshing||(dialog.open&&!discardDirty))return false;
    if(hasDirtyInlineForm()&&!discardDirty){
      if(quiet)return false;
      confirmation('Reload the shared workspace?','<p>You have entries in this form that have not been saved. Reloading will discard those entries and load the latest confirmed workspace.</p>',async()=>{await refreshWorkspace({quiet:false,discardDirty:true});},'Discard entries and reload');
      return false;
    }
    refreshing=true;
    setBusy(true);
    try{
      const previousRevision=revision;
      const refreshWasRequired=needsRefresh;
      applyWorkspace(await API.getWorkspace());
      if(revision!==previousRevision||refreshWasRequired){activeOrder=null;render();if(!quiet)status('Latest shared workspace loaded.');}
      else if(!quiet)status('This device already has the latest shared workspace.');
      return true;
    }catch(error){
      if(error?.status===401)showLogin('Your owner session expired. Sign in again.');
      else if(!quiet)status(error?.message || 'The shared workspace could not be refreshed.');
      return false;
    }finally{refreshing=false;setBusy(false);}
  }
  async function initialize(){
    syncSkipLink(false);
    try{
      if(!M||!API)throw new Error('The owner workspace could not load. Refresh this page.');
      const packagedPhotos = (async()=>{try {
        const responses=await Promise.all([fetch('menu-data.json', {cache:'no-store'}),fetch('events.json', {cache:'no-store'})]);
        if(responses.every(r=>r.ok)){const [menu,events]=await Promise.all(responses.map(r=>r.json()));baseline=M.createState(menu,events);}
      } catch { /* Shared state remains editable without the optional packaged-photo list. */ }})();
      if(API.session()){applyWorkspace(await API.getWorkspace());showOwner();}
      await packagedPhotos;
    }catch(error){if(error?.status===401)API.clearSession();showLogin(error.message);}
  }
  window.addEventListener('focus',()=>{if(loggedIn&&!dialog.open&&!saving)refreshWorkspace({quiet:true});});
  window.addEventListener('pageshow',()=>{if(loggedIn&&!dialog.open&&!saving)refreshWorkspace({quiet:true});});
  extra=window.OwnerTools?.create({getState:()=>state,replaceState:next=>{state=next;},persist,status,openEditor,confirmation,esc,button,field,area,select,check,heading,panel,empty,dateLabel,dayKey,requireCurrentState,render,navigate});
  initialize();
})();
