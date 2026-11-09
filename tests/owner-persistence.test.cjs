const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const owner = fs.readFileSync(path.join(__dirname, '..', 'owner.js'), 'utf8');
const tools = fs.readFileSync(path.join(__dirname, '..', 'owner-tools.js'), 'utf8');
const access = fs.readFileSync(path.join(__dirname, '..', 'owner-access.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');

function persistenceHarness(saveWorkspace, getWorkspace = async () => { throw new Error('unexpected refresh'); }) {
  const start = owner.indexOf('function setSaving(active)');
  const end = owner.indexOf('const button =', start);
  const statuses = [];
  const sandbox = {
    state: {version: 1, marker: 'unsaved edit'},
    savedState: {version: 1, marker: 'saved state'},
    revision: 7,
    updatedAt: '',
    saving: false,
    refreshing: false,
    needsRefresh: false,
    editorPending: true,
    editorInvalidated: false,
    editorFailureMessage: '',
    deferredLoginMessage: '',
    dialog: {open: true},
    M: {isUsableState: () => true, addActivity() {}},
    API: {saveWorkspace, getWorkspace},
    structuredClone,
    setBusy() {},
    status(message) { statuses.push(message); },
    showLogin() {},
    render() {}
  };
  vm.runInNewContext(owner.slice(start, end), sandbox);
  return {sandbox, statuses};
}

test('owner page loads the shared API before the owner controller', () => {
  const api = html.indexOf('shared-api.js');
  const controller = html.indexOf('owner.js');
  assert.ok(api >= 0, 'shared-api.js is loaded');
  assert.ok(controller > api, 'shared-api.js loads before owner.js');
});

test('the owner controller uses awaited revisioned persistence and server state', () => {
  assert.match(owner, /async function persist\(/);
  assert.match(owner, /await API\.saveWorkspace\(revision, candidate\)/);
  assert.match(owner, /applyWorkspace\(response\)/);
  assert.match(owner, /error\.payload\?\.error\?\.details \|\| error\.payload/);
  assert.match(owner, /await API\.getWorkspace\(\)/);
  assert.match(owner, /setSaving\(true\)/);
  assert.match(owner, /setSaving\(false\)/);
  assert.match(owner, /payload\.revision < 1/);
  assert.doesNotMatch(owner, /localStorage/);
  assert.doesNotMatch(owner, /saveWorkspaceSnapshot/);
});

test('background refresh cannot discard a dirty inline form or overlap a save', () => {
  assert.match(owner, /function hasDirtyInlineForm\(\)/);
  assert.match(owner, /if\(hasDirtyInlineForm\(\)&&!discardDirty\)/);
  assert.match(owner, /if\(quiet\)return false/);
  assert.match(owner, /Discard entries and reload/);
  assert.match(owner, /if \(refreshing\)/);
  assert.match(owner, /setBusy\(true\)/);
  assert.match(owner, /setBusy\(false\)/);
  assert.match(owner, /window\.addEventListener\('focus'/);
});

test('a failed confirmed refresh rejects instead of rendering over dirty inline entries', async () => {
  const start = owner.indexOf('async function discardDirtyAndRefresh()');
  const end = owner.indexOf('async function refreshWorkspace(', start);
  assert.ok(start >= 0 && end > start, 'the dirty refresh guard is present');
  const failed = {refreshWorkspace: async () => false};
  vm.runInNewContext(owner.slice(start, end), failed);
  await assert.rejects(failed.discardDirtyAndRefresh(), /unsaved entries are still in place/i);

  let calls = 0;
  const succeeded = {refreshWorkspace: async options => {
    calls += 1;
    assert.deepEqual({...options}, {quiet: false, discardDirty: true});
    return true;
  }};
  vm.runInNewContext(owner.slice(start, end), succeeded);
  await succeeded.discardDirtyAndRefresh();
  assert.equal(calls, 1);
  assert.match(owner, /confirmation\('Reload the shared workspace\?'[\s\S]*discardDirtyAndRefresh,'Discard entries and reload'/);
});

test('the editor freezes every modal control until an asynchronous submission settles', async () => {
  const persistStart = owner.indexOf('function setSaving(active)');
  const persistEnd = owner.indexOf('const button =', persistStart);
  const pendingStart = owner.indexOf('function setEditorPending(active)');
  const pendingEnd = owner.indexOf('function openEditor(', pendingStart);
  const submitStart = owner.indexOf("form.addEventListener('submit'");
  const submitEnd = owner.indexOf('function required(', submitStart);
  assert.ok(persistStart >= 0 && persistEnd > persistStart, 'the real persistence implementation is present');
  assert.ok(pendingStart >= 0 && pendingEnd > pendingStart, 'editor pending helper is present');
  assert.ok(submitStart >= 0 && submitEnd > submitStart, 'editor submit handler is present');

  const controls = [
    {disabled: false, dataset: {}, textContent: 'Save changes'},
    {disabled: false, dataset: {}, textContent: 'Name field'},
    {disabled: true, dataset: {}, textContent: 'Unavailable choice'}
  ];
  const listeners = {};
  const dialog = {
    open: true,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    close() { this.open = false; }
  };
  const form = {addEventListener(type, listener) { listeners[type] = listener; }};
  const alert = {textContent: '', scrollIntoView() {}};
  const sandbox = {
    dialog,
    form,
    editorPending: false,
    editorDirty: false,
    editorInvalidated: false,
    editorFailureMessage: '',
    deferredLoginMessage: '',
    editorSubmit: null,
    state: {version: 1, marker: 'draft'},
    savedState: {version: 1, marker: 'saved'},
    revision: 7,
    updatedAt: '',
    saving: false,
    refreshing: false,
    needsRefresh: false,
    M: {isUsableState: () => true, addActivity() {}},
    API: {saveWorkspace: async () => ({revision: 8, updatedAt: '', state: {version: 1, marker: 'saved'}})},
    structuredClone,
    setBusy() {},
    status(message) { this.lastStatus = message; },
    showLogin() {},
    render() {},
    FormData: class { *[Symbol.iterator]() { yield ['name', 'Test']; } },
    Object,
    $: selector => selector === '#editor-save' ? controls[0] : alert,
    $$: selector => selector.startsWith('[data-editor') ? controls.filter(control => control.dataset.editorSubmitDisabled === 'true') : controls
  };
  vm.runInNewContext(`${owner.slice(persistStart, persistEnd)}\n${owner.slice(pendingStart, pendingEnd)}\n${owner.slice(submitStart, submitEnd)}`, sandbox);

  let release;
  sandbox.editorSubmit = () => new Promise(resolve => { release = resolve; });
  const submission = listeners.submit({preventDefault() {}});
  assert.equal(dialog.attributes['aria-busy'], 'true');
  assert.deepEqual(controls.map(control => control.disabled), [true, true, true]);
  assert.equal(controls[0].textContent, 'Working…');
  assert.equal(controls[2].dataset.editorSubmitDisabled, undefined, 'a previously disabled control stays outside the restore set');
  release();
  await submission;
  assert.equal(dialog.open, false);
  assert.equal(dialog.attributes['aria-busy'], 'false');
  assert.equal(controls[0].textContent, 'Save changes');
  assert.deepEqual(controls.map(control => control.disabled), [false, false, true]);

  dialog.open = true;
  sandbox.editorSubmit = async () => { throw new Error('Save rejected'); };
  const rejected = listeners.submit({preventDefault() {}});
  assert.deepEqual(controls.map(control => control.disabled), [true, true, true]);
  await rejected;
  assert.equal(dialog.open, true, 'a validation or save error keeps the editor open');
  assert.equal(alert.textContent, 'Save rejected');
  assert.equal(dialog.attributes['aria-busy'], 'false');
  assert.deepEqual(controls.map(control => control.disabled), [false, false, true]);

  dialog.open = true;
  sandbox.state = {version: 1, marker: 'unsaved form edit'};
  sandbox.savedState = {version: 1, marker: 'saved server state'};
  sandbox.API.saveWorkspace = async () => {
    const error = new Error('The server rejected this value.');
    error.status = 422;
    throw error;
  };
  sandbox.editorSubmit = async () => { await sandbox.persist(); };
  await listeners.submit({preventDefault() {}});
  assert.equal(dialog.open, true, 'a rejected real persistence call leaves the form open');
  assert.equal(sandbox.state.marker, 'saved server state', 'the rejected local mutation is rolled back');
  assert.equal(sandbox.editorInvalidated, true, 'the editor is marked stale after the saved state replaces its mutation');
  assert.match(alert.textContent, /save could not be confirmed/i);
  assert.match(alert.textContent, /copy anything you need/i);
  assert.equal(controls[0].disabled, true, 'the stale form cannot be submitted again');
  assert.equal(controls[0].textContent, 'Review required');
  assert.equal(controls[1].disabled, false, 'form values remain available for copying');
  assert.equal(dialog.attributes['aria-busy'], 'false');
});

test('beforeunload protects changed modal fields without warning for an untouched dialog', () => {
  assert.match(owner, /function openEditor\([\s\S]*editorDirty = false;/);
  assert.match(owner, /dialog\.addEventListener\('close'[\s\S]*editorDirty = false;/);

  const dirtyStart = owner.indexOf("form.addEventListener('input'");
  const dirtyEnd = owner.indexOf("form.addEventListener('submit'", dirtyStart);
  const listeners = {};
  const dirtySandbox = {
    editorDirty: false,
    dialog: {open: true},
    form: {addEventListener(type, listener) { listeners[type] = listener; }}
  };
  vm.runInNewContext(owner.slice(dirtyStart, dirtyEnd), dirtySandbox);
  assert.equal(dirtySandbox.editorDirty, false, 'opening an editor does not itself create unsaved work');
  listeners.input();
  assert.equal(dirtySandbox.editorDirty, true);
  dirtySandbox.editorDirty = false;
  listeners.change();
  assert.equal(dirtySandbox.editorDirty, true);
  dirtySandbox.editorDirty = false;
  dirtySandbox.dialog.open = false;
  listeners.input();
  assert.equal(dirtySandbox.editorDirty, false, 'events outside an open editor do not create a warning');

  const warnStart = owner.indexOf('function shouldWarnBeforeUnload()');
  const warnEnd = owner.indexOf("window.addEventListener('beforeunload'", warnStart);
  const warning = {
    allowPageLeave: false,
    editorDirty: false,
    editorPending: false,
    saving: false,
    hasDirtyInlineForm: () => false
  };
  vm.runInNewContext(owner.slice(warnStart, warnEnd), warning);
  assert.equal(warning.shouldWarnBeforeUnload(), false, 'an untouched dialog does not warn');
  warning.editorDirty = true;
  assert.equal(warning.shouldWarnBeforeUnload(), true, 'typed modal changes do warn');
  warning.editorDirty = false;
  warning.editorPending = true;
  assert.equal(warning.shouldWarnBeforeUnload(), true, 'an in-flight editor action still warns');
  warning.allowPageLeave = true;
  assert.equal(warning.shouldWarnBeforeUnload(), false, 'a confirmed page leave bypasses the warning');
  assert.match(owner, /beforeunload'[\s\S]*shouldWarnBeforeUnload\(\)/);
});

test('real persistence invalidates stale editors for rejection, conflict, and ambiguous outcomes without retrying', async () => {
  let rejectCalls = 0;
  const rejected = persistenceHarness(async () => {
    rejectCalls += 1;
    const error = new Error('Rejected by the shared workspace.');
    error.status = 422;
    throw error;
  });
  assert.equal(await rejected.sandbox.persist(), false);
  assert.equal(rejectCalls, 1);
  assert.equal(rejected.sandbox.state.marker, 'saved state');
  assert.equal(rejected.sandbox.editorInvalidated, true);
  assert.match(rejected.statuses.at(-1), /rejected by the shared workspace.*local change was undone/i);

  let conflictCalls = 0;
  const conflict = persistenceHarness(async () => {
    conflictCalls += 1;
    const error = new Error('Changed elsewhere');
    error.status = 409;
    error.payload = {error: {details: {revision: 8, updatedAt: '2026-11-09T18:00:00Z', state: {version: 1, marker: 'latest shared state'}}}};
    throw error;
  });
  assert.equal(await conflict.sandbox.persist(), false);
  assert.equal(conflictCalls, 1);
  assert.equal(conflict.sandbox.state.marker, 'latest shared state');
  assert.equal(conflict.sandbox.revision, 8);
  assert.equal(conflict.sandbox.editorInvalidated, true);
  assert.match(conflict.statuses.at(-1), /another device saved first.*change was not saved/i);

  let ambiguousSaveCalls = 0;
  let refreshCalls = 0;
  const ambiguous = persistenceHarness(async () => {
    ambiguousSaveCalls += 1;
    throw new TypeError('Network response was interrupted');
  }, async () => {
    refreshCalls += 1;
    return {revision: 9, updatedAt: '2026-11-09T18:01:00Z', state: {version: 1, marker: 'reloaded shared state'}};
  });
  assert.equal(await ambiguous.sandbox.persist(), false);
  assert.equal(ambiguousSaveCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(ambiguous.sandbox.state.marker, 'reloaded shared state');
  assert.equal(ambiguous.sandbox.revision, 9);
  assert.equal(ambiguous.sandbox.editorInvalidated, true);
  assert.match(ambiguous.statuses.at(-1), /save response could not be confirmed.*latest shared workspace has been reloaded/i);
});

test('an expired session preserves modal values until close and distinguishes known rejection from an ambiguous save', async () => {
  assert.match(owner, /dialog\.addEventListener\('close',[\s\S]*if \(showDeferredLogin\(\)\) return;/);
  const rejectedLogins = [];
  const rejected = persistenceHarness(async () => {
    const error = new Error('Session expired');
    error.status = 401;
    throw error;
  });
  rejected.sandbox.showLogin = message => rejectedLogins.push(message);
  assert.equal(await rejected.sandbox.persist(), false);
  assert.equal(rejectedLogins.length, 0, 'the editor is not closed while its values may need to be copied');
  assert.equal(rejected.sandbox.dialog.open, true);
  assert.equal(rejected.sandbox.editorInvalidated, true);
  assert.match(rejected.sandbox.editorFailureMessage, /session expired.*edit was not saved/i);
  assert.doesNotMatch(rejected.sandbox.editorFailureMessage, /could not be confirmed/i);
  rejected.sandbox.dialog.open = false;
  assert.equal(rejected.sandbox.showDeferredLogin(), true);
  assert.equal(rejectedLogins.length, 1);
  assert.match(rejectedLogins[0], /sign in again.*unsaved change was undone/i);

  const ambiguousLogins = [];
  const ambiguous = persistenceHarness(async () => {
    throw new TypeError('Network response was interrupted');
  }, async () => {
    const error = new Error('Session expired during reconciliation');
    error.status = 401;
    throw error;
  });
  ambiguous.sandbox.showLogin = message => ambiguousLogins.push(message);
  assert.equal(await ambiguous.sandbox.persist(), false);
  assert.equal(ambiguousLogins.length, 0);
  assert.equal(ambiguous.sandbox.dialog.open, true);
  assert.equal(ambiguous.sandbox.editorInvalidated, true);
  assert.equal(ambiguous.sandbox.needsRefresh, true);
  assert.match(ambiguous.sandbox.editorFailureMessage, /session expired.*save result could not be confirmed/i);
  assert.doesNotMatch(ambiguous.sandbox.editorFailureMessage, /edit was not saved/i);
  ambiguous.sandbox.dialog.open = false;
  assert.equal(ambiguous.sandbox.showDeferredLogin(), true);
  assert.equal(ambiguousLogins.length, 1);
  assert.match(ambiguousLogins[0], /sign in again.*last save could not be confirmed/i);
});

test('dirty inline entries are guarded across sections, links, hashes, logout, and page exit', () => {
  assert.match(owner, /if \(hasDirtyInlineForm\(\)\) \{[\s\S]*Leave without saving\?/);
  assert.match(owner, /link&&loggedIn&&hasDirtyInlineForm\(\)/);
  assert.match(owner, /!isSameDocumentAnchor\(link\)/);
  assert.match(owner, /Boolean\(target\.hash\)[\s\S]*target\.pathname === current\.pathname/);
  assert.match(owner, /Log out without saving\?/);
  assert.match(owner, /window\.addEventListener\('hashchange'/);
  assert.match(owner, /window\.addEventListener\('beforeunload'/);
  assert.match(owner, /editorPending\|\|saving\|\|hasDirtyInlineForm\(\)/);
  assert.match(owner, /if\(!loggedIn\|\|saving\|\|refreshing\|\|editorPending\) return false/);
  assert.match(owner, /Discard entries and continue/);
});

test('the compact owner navigation synchronizes its current section and Escape behavior', () => {
  assert.match(owner, /ownerSidebar\.classList\.add\('navigation-ready'\)/);
  assert.match(owner, /classList\.toggle\('navigation-open'/);
  assert.match(owner, /ownerNavCurrent\.textContent = label/);
  assert.match(owner, /ownerNavToggle\.setAttribute\('aria-expanded'/);
  assert.match(owner, /event\.key === 'Escape'[\s\S]*setOwnerNavigationOpen\(false, true\)/);
});

test('all direct persistence callers await the asynchronous save', () => {
  const ownerCalls = [...owner.matchAll(/(?<!function )(?<!\.)\bpersist\(/g)];
  assert.ok(ownerCalls.length >= 10, 'owner controller has meaningful save coverage');
  ownerCalls.forEach((match) => {
    const prefix = owner.slice(Math.max(0, match.index - 16), match.index);
    assert.match(prefix, /await\s+$/, `persist call at offset ${match.index} is awaited`);
  });

  const toolCalls = [...tools.matchAll(/adapter\.persist\(/g)];
  assert.ok(toolCalls.length >= 3, 'schedule and restore tools save through the adapter');
  toolCalls.forEach((match) => {
    const prefix = tools.slice(Math.max(0, match.index - 16), match.index);
    assert.match(prefix, /await\s+$/, `tool persist call at offset ${match.index} is awaited`);
  });
});

test('public navigation contains no credential dialog, default password, or reset route', () => {
  assert.match(access, /owner\.html#overview/);
  assert.doesNotMatch(access, /verifyDemoLogin|owner-login-dialog|localStorage|sessionStorage|password/i);
  assert.doesNotMatch(html, /YOUR DEMO KEY|Password<\/dt>|Start a fresh demo|login-reset/);
  assert.doesNotMatch(owner, /reset-demo|tolberts-owner-demo-password|matchesPassword|hashDemoPassword/);
});

test('password changes use the private server endpoint contract with a 12-character minimum', () => {
  assert.match(owner, /await API\.changePassword\(data\.current,data\.next\)/);
  assert.match(owner, /minlength="12"/);
  assert.doesNotMatch(owner, /write\(AUTH|removeLocal\(AUTH/);
});

test('owner copy keeps operational simulations distinct from shared website publishing', () => {
  assert.match(html, /Successful saves sync across devices/);
  assert.match(html, /Purchase orders, payments, payroll, supplier connections, and staff notifications remain simulated/);
  assert.match(owner, /No supplier receives it and no money is spent/);
  assert.match(tools, /It does not notify anyone/);
});
