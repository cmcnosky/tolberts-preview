/* Interactive, browser-local owner demo. This is not production authentication. */
(() => {
  'use strict';
  const M = window.OwnerModel;
  const KEY = 'tolberts-owner-demo-v1';
  const AUTH = 'tolberts-owner-demo-password-v1';
  const SESSION = 'tolberts-owner-demo-session-v1';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash = v => M.money(Number(v) || 0);
  const dayKey = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric',timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : String(value || '');
  const timeLabel = v => /^\d{2}:\d{2}$/.test(v || '') ? new Intl.DateTimeFormat('en-US', {hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(`2000-01-01T${v}:00Z`)).toLowerCase() : v;
  const inputTime = v => { if (/^\d{2}:\d{2}$/.test(v || '')) return v; const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(v || ''); return m ? String(Number(m[1]) % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2,'0') + ':' + m[2] : '20:00'; };
  let state, baseline, view = 'overview', filter = '', activeOrder = null, editorSubmit = null, editorOpener = null, loggedIn = false, storageOK = true, toastTimer;
  const workspace = $('#workspace');
  const dialog = $('#editor-dialog');
  const form = $('#editor-form');
  function read(key) { try { return localStorage.getItem(key); } catch { storageOK = false; return null; } }
  function write(key,value) { try { localStorage.setItem(key,value); return true; } catch { storageOK = false; return false; } }
  function status(message) { const el = $('#owner-status'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'),6000); }
  function persist(message) { if (message) M.addActivity(state,message); const saved = write(KEY,JSON.stringify(state)); status(saved ? (message ? message + ' · saved in this browser.' : 'Demo saved in this browser.') : 'Browser storage is unavailable or full. These changes last only while this page stays open.'); }
  const button = (label,action,id='',kind='secondary') => `<button type="button" class="button ${kind}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}>${label}</button>`;
  const preview = (file='index.html',label='Preview guest website ↗') => `<a class="button secondary" href="${file}?owner-preview=1" target="_blank" rel="noopener">${label}</a>`;
  const empty = (title,text) => `<div class="empty-state"><h3>${title}</h3><p>${text}</p></div>`;
  const pill = (value,kind='') => `<span class="status-pill ${kind}">${esc(value)}</span>`;
  const heading = (title,description,actions='') => `<div class="page-heading"><div><p class="eyebrow">THE OWNER ROOM</p><h1>${title}</h1><p>${description}</p></div><div class="row-actions">${actions}</div></div>`;
  const panel = (title,body,action='') => `<section class="panel"><div class="panel-heading"><h2>${title}</h2>${action}</div>${body}</section>`;
  const field = (name,label,value='',type='text',extra='') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const area = (name,label,value='',extra='') => `<label class="field full">${label}<textarea name="${name}" rows="3" maxlength="1000" ${extra}>${esc(value)}</textarea></label>`;
  const select = (name,label,options,value='') => `<label class="field">${label}<select name="${name}">${options.map(x => {const [v,t] = Array.isArray(x) ? x : [x,x]; return `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`;}).join('')}</select></label>`;
  const check = (name,label,on) => `<label class="check-field"><input name="${name}" type="checkbox"${on ? ' checked' : ''}> ${label}</label>`;
  const listRow = (title,detail,actions='',tag='') => `<div class="list-row"><div class="row-main"><h3>${esc(title)}</h3><p>${detail}</p>${tag}</div><div class="row-actions">${actions}</div></div>`;
  function safeImage(src) { return /^(assets\/[a-zA-Z0-9._-]+|data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+)$/.test(src || '') ? src : 'assets/stage.webp'; }
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
    try { await editorSubmit(Object.fromEntries(new FormData(form))); dialog.close(); render(); }
    catch(error) { $('#editor-error').textContent = error.message || 'Please check the details and try again.'; $('#editor-error').scrollIntoView({block:'nearest'}); }
    finally { submit.disabled = false; }
  });
  function required(value,label) { const text = String(value || '').trim(); if(!text) throw new Error(`${label} is required.`); return text; }
  function numeric(value,label,min=0) { if(value === '' || !Number.isFinite(Number(value)) || Number(value) < min) throw new Error(`${label} must be a number of at least ${min}.`); return Number(value); }
  function navigate(next) { if(!loggedIn) return; view = next; filter = ''; activeOrder = null; history.replaceState(null,'','#'+next); render(); workspace.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
  function render() {
    if(!state || !loggedIn) return;
    $$('[data-view]').forEach(b => { if(b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    const screens = {overview:renderOverview,menu:renderMenu,music:renderMusic,hours:renderHours,inventory:renderInventory,purchases:renderPurchases,team:renderTeam,activity:renderActivity,settings:renderSettings};
    workspace.innerHTML = (screens[view] || renderOverview)();
    if(!storageOK) workspace.insertAdjacentHTML('afterbegin','<p class="notice">Browser storage is unavailable. Keep this page open to retain your demo edits.</p>');
    if($('#list-search')) applyFilter();
  }
  function renderOverview() {
    const low = M.lowStock(state); const future = state.events.filter(e => e.status !== 'Cancelled' && e.date >= dayKey()).sort((a,b)=>a.date.localeCompare(b.date));
    const pending = state.orders.filter(o => o.status === 'Draft' || o.status === 'Submitted (demo)');
    return heading('Good to see you, Steven.','A clear view of the parlor—and the things that need your attention.',preview()) +
      `<div class="stat-grid"><div class="stat"><span>Menu available</span><strong>${state.menu.filter(i=>i.available).length}<small> / ${state.menu.length}</small></strong><p>Items in your guest preview</p></div><div class="stat"><span>On the calendar</span><strong>${future.length}</strong><p>Upcoming demo shows</p></div><div class="stat"><span>Stock to review</span><strong>${low.length}</strong><p>Sample items at reorder level</p></div><div class="stat"><span>Orders in progress</span><strong>${pending.length}</strong><p>Draft or simulated submission</p></div></div>` +
      `<div class="split">${panel('Make yourself at home.',`<p>Try a complete task, then check the result. Your changes are saved as you go.</p><div class="row-list">${listRow('Update a dish','Change a price, description, or availability.',button('Edit menu →','nav-menu'))}${listRow('Plan the next show','Set the artist, photograph, date, and set times.',button('Manage music →','nav-music'))}${listRow('Restock the kitchen','Build a sample order and receive it into stock.',button('Start an order →','new-order'))}</div>`)}` +
      `${panel('Needs a look.',low.length ? `<p class="muted">Illustrative inventory, quantities, and supplier prices.</p><div class="row-list">${low.slice(0,3).map(i=>listRow(i.name,`${i.onHand} ${esc(i.unit)} on hand · target ${i.par}`,button('Review','edit-stock',i.id),pill('Low stock','warning'))).join('')}</div>` : empty('Stock is covered.','No sample items are at their reorder level.'),button('All inventory →','nav-inventory'))}</div>` +
      `<div class="split">${panel('Next on the stage.',future[0] ? `<div class="event-feature"><img src="${esc(safeImage(future[0].image))}" alt="${esc(future[0].name)}"><div><p class="eyebrow">${esc(dateLabel(future[0].date))}</p><h3>${esc(future[0].name)}</h3><p>${esc(timeLabel(future[0].start))}–${esc(timeLabel(future[0].end))} Central</p>${button('Edit show','edit-event',future[0].id)}</div></div>` : empty('The stage is yours.','Add a show to see it in the guest preview.'))}${panel('Recent changes.',activityRows(4),button('All activity →','nav-activity'))}</div>`;
  }
  function renderMenu() {
    return heading('The menu, in your hands.','Edit the menu guests see. Availability changes remove a dish from your guest preview.',button('Add a dish','new-menu','','') + preview('menu.html','Preview menu ↗')) +
    searchBar('Find a dish','Name, category, or ingredient') + `<div class="row-list panel">${state.menu.map(i=>`<article data-search="${esc([i.name,i.category,i.description].join(' ').toLowerCase())}" class="list-row"><div class="row-main"><p class="eyebrow">${esc(i.category)}</p><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p><strong>${esc(i.price || 'Ask for current pricing')}</strong></div><div class="row-actions">${pill(i.available ? 'Available' : 'Unavailable',i.available ? 'good':'warning')}${button('Edit','edit-menu',i.id)}<button class="button quiet" data-action="toggle-menu" data-id="${esc(i.id)}" aria-label="${i.available ? 'Mark unavailable' : 'Make available'}: ${esc(i.name)}">${i.available ? 'Mark unavailable' : 'Make available'}</button></div></article>`).join('')}</div><div id="search-empty" hidden>${empty('No dishes found.','Try another name or clear the search.')}</div>`;
  }
  function editMenu(id) {
    const item = state.menu.find(i=>i.id===id); const categories = [...new Set(state.menu.map(i=>i.category))];
    openEditor(item ? 'Edit menu item' : 'Add a dish',`<div class="field-grid">${field('name','Dish name',item?.name,'text','required maxlength="100"')}${select('category','Category',categories,item?.category || categories[0])}${field('price','Price / sizes',item?.price,'text','maxlength="180" placeholder="Bowl 11.99"')}${area('description','Description',item?.description)}${check('available','Available in the guest preview',item?.available ?? true)}</div>`,data=>{
      const values = {name:required(data.name,'Dish name'),category:data.category,price:data.price.trim(),description:data.description.trim(),available:!!data.available};
      if(item) Object.assign(item,values); else state.menu.push({id:M.id('menu'),...values}); persist(`${item ? 'Updated' : 'Added'} ${values.name}`);
    });
  }
  function renderMusic() {
    const events = [...state.events].sort((a,b)=>a.date.localeCompare(b.date));
    return heading('Keep the stage moving.','Manage the artist, photo, date, and set times. The saved lineup is a starting point for this demo.',button('Add a show','new-event','','') + preview('music.html','Preview calendar ↗')) +
      `<p class="notice">This is an editable copy of the saved lineup. It does not change Tolbert’s official calendar.</p><div class="card-grid">${events.map(e=>`<article class="item-card event-card"><div class="photo-tile"><img src="${esc(safeImage(e.image))}" alt="${esc(e.name)}" loading="lazy"></div><div class="item-body"><div class="item-meta"><time datetime="${esc(e.date)}">${esc(dateLabel(e.date))}</time>${pill(e.status,e.status === 'Cancelled' ? 'warning' : 'good')}</div><h2>${esc(e.name)}</h2><p>${esc(e.genre || 'Live music')}</p><strong>${esc(timeLabel(e.start))}–${esc(timeLabel(e.end))} Central</strong><div class="row-actions">${button('Edit show','edit-event',e.id)}${button(e.status === 'Cancelled' ? 'Restore show' : 'Cancel show',e.status === 'Cancelled' ? 'restore-event':'cancel-event',e.id,'quiet')}</div></div></article>`).join('')}</div>${!events.length ? empty('No shows yet.','Add the first show to your calendar.') : ''}`;
  }
  function editEvent(id) {
    const item = state.events.find(i=>i.id===id);
    const photos = [...new Map(baseline.events.map(e=>[e.image,[e.image,e.name]])).values()]; photos.unshift(['assets/stage.webp','Tolbert’s stage']);
    if(item?.image && !photos.some(p=>p[0]===item.image)) photos.unshift([item.image,'Current photo']);
    openEditor(item ? 'Edit the show' : 'Add a show',`<div class="field-grid">${field('name','Artist / band name',item?.name,'text','required maxlength="120"')}${field('genre','Genre / short description',item?.genre,'text','maxlength="140"')}${field('date','Show date',item?.date || dayKey(),'date','required')}${select('status','Status',['Scheduled','Cancelled'],item?.status || 'Scheduled')}${field('start','Set starts',inputTime(item?.start),'time','required')}${field('end','Set ends',inputTime(item?.end || '22:00'),'time','required')}${select('image','Artist photograph',photos,item?.image || 'assets/stage.webp')}${field('upload','Or upload a photograph','','file','accept="image/png,image/jpeg,image/webp"')}<p class="field full muted">Use a photo of the actual artist. Images are shown in full, with dates and names outside the photograph. Uploaded demo images must be under 600 KB.</p></div>`,async data=>{
      const name = required(data.name,'Artist name'); let image = data.image;
      const upload = $('input[name=upload]',form).files[0];
      if(upload) {
        if(!['image/png','image/jpeg','image/webp'].includes(upload.type) || upload.size > 600000) throw new Error('Choose a PNG, JPEG, or WebP image under 600 KB.');
        image = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The photo could not be read.'));reader.readAsDataURL(upload);});
      }
      if(data.start === data.end) throw new Error('Start and end times must be different. A set ending earlier than it starts is treated as ending the next day.');
      const values = {name,genre:data.genre.trim(),date:data.date,start:data.start,end:data.end,image,status:data.status};
      if(item) Object.assign(item,values); else state.events.push({id:M.id('show'),...values}); persist(`${item ? 'Updated' : 'Added'} show: ${name}`);
    });
  }
  function renderHours() {
    return heading('Open doors. Clear hours.','Keep regular hours and special dates in one place.',preview('index.html','Preview hours ↗')) +
      `<div class="split">${panel('Weekly hours.',`<form id="hours-form"><div class="row-list">${state.hours.map((h,i)=>`<div class="hours-editor"><strong>${esc(h.day)}</strong><div class="field-grid">${field('open-'+i,'Opens',h.open,'time','required')}${field('close-'+i,'Closes',h.close,'time','required')}${check('closed-'+i,'Closed',h.closed)}</div></div>`).join('')}</div><p class="muted">All times are Central. 12:00 AM means midnight at the end of the day.</p><button class="button" type="submit">Save weekly hours</button></form>`)}` +
      `${panel('Special dates.',`<p>A holiday or one-time closure overrides the weekly hours for that date.</p><div class="row-list">${state.exceptions.map(e=>listRow(dateLabel(e.date),`${esc(e.label)} · ${e.closed ? 'Closed' : `${esc(timeLabel(e.open))}–${esc(timeLabel(e.close))}`}`,button('Edit','edit-exception',e.id)+button('Remove','remove-exception',e.id,'quiet'))).join('') || empty('No exceptions yet.','Add holiday hours or a one-time closure.')}</div>`,button('Add special date','new-exception'))}</div>`;
  }
  function editException(id) {
    const item = state.exceptions.find(i=>i.id===id);
    openEditor('Special hours',`<div class="field-grid">${field('date','Date',item?.date || dayKey(),'date','required')}${field('label','Label',item?.label,'text','required maxlength="100" placeholder="Holiday hours"')}${field('open','Opens',item?.open || '11:00','time','required')}${field('close','Closes',item?.close || '21:00','time','required')}${check('closed','Closed all day',item?.closed ?? true)}</div>`,data=>{
      if(state.exceptions.some(e=>e.date===data.date && e.id!==id)) throw new Error('That date already has special hours. Edit the existing entry.');
      const values={date:data.date,label:required(data.label,'Label'),open:data.open,close:data.close,closed:!!data.closed};
      if(!values.closed && values.open===values.close) throw new Error('Opening and closing times must be different.');
      if(item) Object.assign(item,values); else state.exceptions.push({id:M.id('hours'),...values}); persist(`Saved special hours for ${dateLabel(data.date)}`);
    });
  }
  function renderInventory() {
    return heading('Know what’s on the shelf.','Sample stock and costs let you try counting, reorder levels, and receiving.',button('Add stock item','new-stock','','')+button('Create purchase order','new-order')) +
      `<p class="notice">Illustrative inventory and suppliers. These are not Tolbert’s actual stock counts, vendors, or purchase prices.</p>` +
      searchBar('Find stock','Item name or supplier',`<button class="button quiet" data-action="low-stock">Show low stock</button><button class="button quiet" data-action="clear-search">Show all</button>`) +
      `<div class="row-list panel">${state.inventory.map(i=>`<article class="list-row" data-search="${esc((i.name+' '+i.vendor+(i.onHand<=i.reorderAt?' low stock':'')).toLowerCase())}"><div class="row-main"><p class="eyebrow">${esc(i.vendor)}</p><h3>${esc(i.name)}</h3><p>${esc(i.unit)} · ${cash(i.cost)} per unit</p><p>Reorder at ${i.reorderAt} · target ${i.par}</p></div><div class="stock-count"><strong>${i.onHand}</strong><span>${esc(i.unit)} on hand</span></div><div class="row-actions">${pill(i.onHand<=i.reorderAt ? 'Low stock':'Stocked',i.onHand<=i.reorderAt ? 'warning':'good')}${button('Update stock','edit-stock',i.id)}</div></article>`).join('')}</div><div id="search-empty" hidden>${empty('No stock matches.','Clear the filter or search by item or supplier.')}</div>`;
  }
  function editStock(id) {
    const item = state.inventory.find(i=>i.id===id);
    openEditor(item ? 'Update stock item' : 'Add a stock item',`<p class="notice">Demo inventory only. Counts and costs are illustrative.</p><div class="field-grid">${field('name','Item name',item?.name,'text','required maxlength="100"')}${field('vendor','Sample supplier',item?.vendor || 'Demo food supplier','text','required maxlength="100"')}${field('unit','Unit',item?.unit || 'case','text','required maxlength="40"')}${field('cost','Cost per unit ($)',item?.cost ?? 0,'number','required min="0" step="0.01" max="100000"')}${field('onHand','On hand',item?.onHand ?? 0,'number','required min="0" step="0.01" max="100000"')}${field('reorderAt','Reorder at',item?.reorderAt ?? 2,'number','required min="0" step="0.01" max="100000"')}${field('par','Target stock',item?.par ?? 10,'number','required min="0" step="0.01" max="100000"')}</div>`,data=>{
      const values={name:required(data.name,'Item name'),vendor:required(data.vendor,'Supplier'),unit:required(data.unit,'Unit'),cost:numeric(data.cost,'Cost'),onHand:numeric(data.onHand,'On hand'),reorderAt:numeric(data.reorderAt,'Reorder level'),par:numeric(data.par,'Target stock')};
      if(values.par < values.reorderAt) throw new Error('Target stock must be at least the reorder level.');
      if(item) Object.assign(item,values); else state.inventory.push({id:M.id('stock'),...values}); persist(`Updated stock: ${values.name}`);
    });
  }
  function renderPurchases() {
    if(activeOrder) return renderOrder(state.orders.find(o=>o.id===activeOrder));
    return heading('From low stock to restocked.','Draft, review, simulate submission, then receive your sample order.',button('New purchase order','new-order','','')) +
      `<p class="notice">All purchase orders are simulated. No supplier is contacted, no payment is taken, and no restaurant stock is changed.</p>` +
      panel('Purchase orders.',state.orders.length ? `<div class="row-list">${[...state.orders].reverse().map(o=>listRow(o.number,`${esc(o.vendor)} · ${o.lines.length} line${o.lines.length===1?'':'s'} · ${cash(M.orderTotal(o))}`,button('Open order','open-order',o.id),pill(o.status,o.status==='Received'?'good':o.status==='Cancelled'?'':'warning'))).join('')}</div>` : empty('Your first order starts here.','Choose a sample supplier and the quantities you need. You will review the order before simulating submission.'));
  }
  function renderOrder(o) {
    if(!o){activeOrder=null;return renderPurchases();}
    let actions=button('All purchase orders','all-orders');
    if(o.status==='Draft') actions+=button('Simulate submission','submit-order',o.id,'');
    if(o.status==='Submitted (demo)') actions+=button('Receive stock','receive-order',o.id,'');
    if(['Draft','Submitted (demo)'].includes(o.status)) actions+=button('Cancel order','cancel-order',o.id,'quiet');
    actions+=button('Download CSV','export-order',o.id,'quiet');
    return heading(esc(o.number),esc(o.vendor),actions)+`<p class="notice">Demo purchase order · nothing is sent to a supplier and no payment is taken.</p>`+
      panel('Order details.',`<div class="item-meta">${pill(o.status,o.status==='Received'?'good':'warning')}<span>${new Date(o.createdAt).toLocaleDateString('en-US')}</span></div><div class="order-lines">${o.lines.map(l=>`<div class="order-line"><div><h3>${esc(l.name)}</h3><p>${l.quantity} × ${esc(l.unit)} at ${cash(l.unitCost)}</p></div><strong>${cash(l.quantity*l.unitCost)}</strong></div>`).join('')}</div><div class="totals"><span>Items subtotal</span><strong>${cash(M.orderTotal(o))}</strong></div><p class="muted">Sample prices. Taxes, freight, and supplier terms are not included.</p>${o.notes ? `<p><strong>Notes</strong><br>${esc(o.notes)}</p>`:''}<div class="progress-steps"><span>1 · Draft</span><span>2 · Simulated submission</span><span>3 · Stock received</span></div>${o.status==='Received'?'<p class="notice">This order has been received into the demo inventory. It cannot be received twice.</p>':''}`);
  }
  function newOrder() {
    const vendors=[...new Set(state.inventory.map(i=>i.vendor))];
    if(!vendors.length){status('Add a stock item and supplier first.');navigate('inventory');return;}
    openEditor('Build a purchase order',`<p class="notice">This is a demo order. No supplier will be contacted.</p>${select('vendor','Sample supplier',vendors,vendors[0])}<div id="purchase-items"></div>${area('notes','Order notes')}<div class="totals"><span>Items subtotal</span><strong id="draft-total">${cash(0)}</strong></div>`,data=>{
      const lines=state.inventory.filter(i=>i.vendor===data.vendor).map(i=>({itemId:i.id,quantity:Number(data['qty-'+i.id])})).filter(l=>l.quantity!==0);
      const order=M.createOrder(state,{vendor:data.vendor,lines,notes:data.notes.trim()}); activeOrder=order.id; view='purchases'; persist();
    },'Create draft order');
    function drawItems(){const vendor=$('select[name=vendor]',form).value; $('#purchase-items').innerHTML=`<div class="order-lines">${state.inventory.filter(i=>i.vendor===vendor).map(i=>`<div class="order-line"><div><h3>${esc(i.name)}</h3><p>${i.onHand} ${esc(i.unit)} on hand · target ${i.par}</p><span>${cash(i.cost)} / ${esc(i.unit)}</span></div>${field('qty-'+i.id,'Quantity',i.onHand<=i.reorderAt?Math.ceil(Math.max(0,i.par-i.onHand)):0,'number','min="0" step="1" max="10000" required')}</div>`).join('')}</div>`;total();}
    function total(){let amount=0;state.inventory.forEach(i=>{const el=$(`[name="qty-${i.id}"]`,form);if(el)amount+=Math.round(i.cost*100)*(Number(el.value)||0);});$('#draft-total').textContent=cash(amount/100);}
    $('select[name=vendor]',form).addEventListener('change',drawItems); $('#purchase-items').addEventListener('input',total);drawItems();
  }
  function renderTeam() {
    return heading('The right hands on deck.','Explore how owner, manager, and editor roles would be organized.',button('Add demo teammate','new-teammate','',''))+
      `<p class="notice">Team entries illustrate permissions. They do not invite people or create working accounts; Steven is the only demo login.</p>`+
      panel('People & roles.',`<div class="row-list">${state.team.map(t=>listRow(t.name,`${esc(t.role)} · ${t.role==='Owner'?'All demo controls':t.role==='Manager'?'Operations, stock, and purchase drafts':'Menu, music, and hours'}`,t.id==='steven'?pill('Your account','good'):button('Edit role','edit-teammate',t.id)+button('Remove','remove-teammate',t.id,'quiet'),pill(t.status))).join('')}</div>`)+
      `<div class="card-grid">${[['Owner','Website settings, team roles, all content, inventory, and purchase-order actions.'],['Manager','Menu, calendar, hours, stock counts, and purchase drafts.'],['Editor','Guest-facing content: menu, music, and hours.']].map(([title,copy])=>panel(title,`<p>${copy}</p>`)).join('')}</div>`;
  }
  function editTeammate(id) {
    const item=state.team.find(i=>i.id===id);
    if(item?.id==='steven')return;
    openEditor(item?'Edit demo teammate':'Add demo teammate',`<p class="notice">No invitation or account will be created.</p><div class="field-grid">${field('name','Name',item?.name,'text','required maxlength="100"')}${select('role','Role',['Manager','Editor'],item?.role || 'Editor')}${select('status','Status',['Active','Inactive'],item?.status || 'Active')}</div>`,data=>{const values={name:required(data.name,'Name'),role:data.role,status:data.status};if(item)Object.assign(item,values);else state.team.push({id:M.id('team'),...values});persist(`Updated demo teammate: ${values.name}`);});
  }
  function activityRows(limit=100) { return state.activity.length ? `<div class="row-list">${state.activity.slice(0,limit).map(a=>`<div class="activity-row"><span class="user-avatar" aria-hidden="true">S</span><div><strong>${esc(a.message)}</strong><p>Steven · ${new Date(a.at || a.timestamp || a.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p></div></div>`).join('')}</div>` : empty('A fresh start.','Saved edits and order actions will appear here.'); }
  function renderActivity() { return heading('A record of the changes.','Your latest 100 demo actions, saved in this browser.')+panel('Activity.',activityRows()); }
  function renderSettings() {
    return heading('Make it feel like your parlor.','Update contact details, a guest notice, and your demo sign-in.',preview())+
      `<div class="split">${panel('Guest-facing details.',`<form id="settings-form" class="field-grid">${field('phone','Phone number',state.settings.phone,'tel','required maxlength="40"')}${field('address','Address',state.settings.address,'text','required maxlength="200"')}${area('announcement','Homepage notice',state.settings.announcement,'placeholder="Optional: special hours, a private event, or an announcement."')}<p class="muted full">Leave the notice blank to hide it. Saved details appear in your guest preview.</p><button class="button" type="submit">Save details</button></form>`)}`+
      `${panel('Your demo login.',`<p><strong>Username: Steven</strong></p><p>You can change the demo password for this browser. Use a throwaway password; this public demonstration does not protect real information.</p>${button('Change demo password','change-password')}`)}${panel('Start fresh.',`<p>Reset menu edits, shows, stock, sample orders, team entries, and the demo password. This affects this browser only.</p>${button('Reset demo','reset-demo','','quiet')}`)}</div>`;
  }
  async function digest(value) { return M.hashDemoPassword(value); }
  async function matchesPassword(value) { return M.verifyDemoLogin('Steven',value,read(AUTH)); }
  function changePassword() {
    openEditor('Change demo password',`<p class="notice">This changes sign-in on this browser only. Do not use a password from another account.</p><div class="field-grid">${field('current','Current password','','password','required autocomplete="current-password"')}${field('next','New demo password','','password','required minlength="6" maxlength="100" autocomplete="new-password"')}${field('repeat','Repeat new password','','password','required minlength="6" maxlength="100" autocomplete="new-password"')}</div>`,async data=>{
      if(!await matchesPassword(data.current))throw new Error('The current password is incorrect.');
      if(data.next!==data.repeat)throw new Error('The new passwords do not match.');
      if(data.next===data.current)throw new Error('Choose a different demo password.');
      if(!write(AUTH,await digest(data.next)))throw new Error('The browser could not save the password. Check site storage settings.');
      persist('Changed the browser-local demo password');
    },'Change demo password');
  }
  function exportOrder(o){
    const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['DEMO ORDER - NOT SENT TO SUPPLIER'],[o.number,o.vendor,o.status],['Item','Quantity','Unit','Unit cost','Line total'],...o.lines.map(l=>[l.name,l.quantity,l.unit,l.unitCost,(Math.round(l.unitCost*100)*l.quantity/100).toFixed(2)]),['Items subtotal','','','',M.orderTotal(o).toFixed(2)],['Taxes and freight not included']];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=o.number+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Demo order CSV downloaded. No supplier was contacted.');
  }
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
    const control=event.target.closest('[data-action]');if(!control||!loggedIn)return;
    const action=control.dataset.action,id=control.dataset.id;
    if(action.startsWith('nav-')){navigate(action.slice(4));return;}
    const handlers={
      'new-menu':()=>editMenu(), 'edit-menu':()=>editMenu(id),
      'toggle-menu':()=>{const i=state.menu.find(i=>i.id===id);i.available=!i.available;persist(`${i.available?'Made available':'Marked unavailable'}: ${i.name}`);render();},
      'new-event':()=>editEvent(), 'edit-event':()=>editEvent(id),
      'cancel-event':()=>{const i=state.events.find(i=>i.id===id);confirmation('Cancel this show?',`<p><strong>${esc(i.name)}</strong> · ${esc(dateLabel(i.date))}</p><p>It will be removed from your guest preview. You can restore it later.</p>`,()=>{i.status='Cancelled';persist(`Cancelled demo show: ${i.name}`);},'Cancel show');},
      'restore-event':()=>{const i=state.events.find(i=>i.id===id);i.status='Scheduled';persist(`Restored show: ${i.name}`);render();},
      'new-exception':()=>editException(), 'edit-exception':()=>editException(id),
      'remove-exception':()=>confirmation('Remove special hours?','<p>The weekly schedule will apply to this date again.</p>',()=>{state.exceptions=state.exceptions.filter(e=>e.id!==id);persist('Removed special hours');},'Remove special hours'),
      'new-stock':()=>editStock(), 'edit-stock':()=>editStock(id),
      'low-stock':()=>{filter='low stock';$('#list-search').value=filter;applyFilter();},
      'clear-search':()=>{filter='';$('#list-search').value='';applyFilter();},
      'new-order':newOrder,
      'open-order':()=>{activeOrder=id;render();workspace.focus({preventScroll:true});},
      'all-orders':()=>{activeOrder=null;render();},
      'submit-order':()=>{const o=state.orders.find(o=>o.id===id);confirmation('Simulate this submission?',`<p><strong>${esc(o.number)}</strong> · ${esc(o.vendor)}</p><p>${o.lines.length} line items · <strong>${cash(M.orderTotal(o))}</strong> items subtotal</p><p class="notice">This only advances the demo order. No supplier receives it and no money is spent.</p>`,()=>{M.submitOrder(state,id);persist();},'Simulate submission');},
      'receive-order':()=>{const o=state.orders.find(o=>o.id===id);confirmation('Receive the sample stock?',`<p>Mark all items in <strong>${esc(o.number)}</strong> received and add their quantities to the demo inventory.</p><p>Real stock and supplier records are unaffected.</p>`,()=>{M.receiveOrder(state,id);persist();},'Receive sample stock');},
      'cancel-order':()=>confirmation('Cancel this demo order?','<p>No stock quantities will change. The cancelled order stays in your records.</p>',()=>{M.cancelOrder(state,id);persist();},'Cancel order'),
      'export-order':()=>exportOrder(state.orders.find(o=>o.id===id)),
      'new-teammate':()=>editTeammate(), 'edit-teammate':()=>editTeammate(id),
      'remove-teammate':()=>confirmation('Remove demo teammate?','<p>This removes only the sample entry in this browser.</p>',()=>{state.team=state.team.filter(t=>t.id!==id);persist('Removed demo teammate');},'Remove teammate'),
      'change-password':changePassword,
      'reset-demo':()=>confirmation('Reset this browser’s demo?',`<p>All demo edits, sample orders, stock changes, and team entries will be cleared. The password will return to <strong>Steven</strong>.</p>${field('confirm','Type RESET to confirm','','text','required autocomplete="off"')}`,data=>{if(data.confirm!=='RESET')throw new Error('Type RESET to start fresh.');state=structuredClone(baseline);try{localStorage.removeItem(AUTH);}catch{}persist('Reset the owner demo');activeOrder=null;},'Reset demo')
    };
    try{handlers[action]?.();}catch(error){status(error.message || 'That action could not be completed.');}
  });
  function applyFilter(){let count=0;$$('[data-search]',workspace).forEach(row=>{row.hidden=!filter.toLowerCase().trim().split(/\s+/).filter(Boolean).every(t=>row.dataset.search.includes(t));if(!row.hidden)count++;});$('#result-count').textContent=`${count} ${view==='menu'?'dishes':'stock items'} shown`;$('#search-empty').hidden=count>0;}
  workspace.addEventListener('input',event=>{if(event.target.id==='list-search'){filter=event.target.value;applyFilter();}});
  workspace.addEventListener('submit',event=>{
    if(!['hours-form','settings-form'].includes(event.target.id))return;event.preventDefault();
    const data=Object.fromEntries(new FormData(event.target));
    try{
      if(event.target.id==='hours-form'){
        const hours=state.hours.map((h,i)=>({...h,open:data['open-'+i],close:data['close-'+i],closed:!!data['closed-'+i]}));
        if(hours.some(h=>!h.closed && h.open===h.close))throw new Error('Opening and closing times must differ for each open day.');
        state.hours=hours;persist('Updated weekly hours');
      }else{state.settings={phone:required(data.phone,'Phone'),address:required(data.address,'Address'),announcement:data.announcement.trim()};persist('Updated guest-facing details');}
    }catch(error){status(error.message);}
  });
  function showOwner(){loggedIn=true;$('#login-view').hidden=true;$('#owner-shell').hidden=false;view=['overview','menu','music','hours','inventory','purchases','team','activity','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';render();workspace.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  $('#logout').addEventListener('click',()=>{try{sessionStorage.removeItem(SESSION);}catch{}loggedIn=false;$('#owner-shell').hidden=true;$('#login-view').hidden=false;$('#login-form').reset();$('#login-error').textContent='';syncDemoKey();$('#owner-username').focus();window.scrollTo({top:0,behavior:'instant'});});
  function syncDemoKey(){const ticket=$('.demo-ticket');if(read(AUTH)){ticket.innerHTML='<span>YOUR DEMO KEY</span><p>Username: <strong>Steven</strong><br>Use the demo password set in this browser.</p>';}else ticket.innerHTML='<span>YOUR DEMO KEY</span><dl><div><dt>Username</dt><dd>Steven</dd></div><div><dt>Password</dt><dd>Steven</dd></div></dl>';}
  $('#login-reset').addEventListener('click',()=>{
    if(!baseline){$('#login-error').textContent='Wait for the demo data to load, or refresh the page.';return;}
    confirmation('Start a fresh demo?',`<p>This clears demo edits and sample orders in this browser and restores the password <strong>Steven</strong>.</p>${field('confirm','Type RESET to confirm','','text','required autocomplete="off"')}`,data=>{
      if(data.confirm!=='RESET')throw new Error('Type RESET to start fresh.');
      state=structuredClone(baseline);try{localStorage.removeItem(AUTH);sessionStorage.removeItem(SESSION);}catch{}
      persist('Reset the owner demo');syncDemoKey();$('#login-error').textContent='Fresh demo ready. Sign in with Steven / Steven.';
    },'Reset demo');
  });
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(event.target));const b=$('button[type=submit]',event.target);b.disabled=true;
    try{if(data.username.trim()!=='Steven'||!await matchesPassword(data.password))throw new Error('That username or password does not match this demo.');if(!state)throw new Error('The demo data is still loading. Please try again.');try{sessionStorage.setItem(SESSION,'Steven');}catch{}$('#login-error').textContent='';event.target.reset();showOwner();}
    catch(error){$('#login-error').textContent=error.message;}finally{b.disabled=false;}
  });
  async function initialize(){
    syncDemoKey();
    try{
      if(!M)throw new Error('The owner demo could not load. Refresh this page.');
      const responses=await Promise.all([fetch('menu-data.json'),fetch('events.json')]);
      if(responses.some(r=>!r.ok))throw new Error('Demo data could not load. Check your connection and refresh this page.');
      const [menu,events]=await Promise.all(responses.map(r=>r.json())); baseline=M.createState(menu,events);
      let saved=null;try{saved=JSON.parse(read(KEY));}catch{}
      if(Array.isArray(saved?.hours))saved.hours.forEach(h=>{if(h && h.close==='24:00')h.close='00:00';});
      const valid=M.isUsableState(saved);
      state=valid?saved:structuredClone(baseline);
      if(!valid)write(KEY,JSON.stringify(state));
      try{if(sessionStorage.getItem(SESSION)==='Steven')showOwner();}catch{}
    }catch(error){$('#login-error').textContent=error.message;}
  }
  window.addEventListener('storage',event=>{if(event.key===KEY && loggedIn)status('Another tab changed this demo. Reload before making more edits.');});
  initialize();
})();
