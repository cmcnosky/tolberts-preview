const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ownerSource = fs.readFileSync(path.join(__dirname, '..', 'owner.js'), 'utf8');
const start = ownerSource.indexOf('function saveWorkspaceSnapshot');
const end = ownerSource.indexOf('\n  function persist', start);
assert.ok(start >= 0 && end > start, 'owner.js exposes the storage helper used by persist');
const persistStart = ownerSource.indexOf('function persist', end);
const persistEnd = ownerSource.indexOf('\n  const button', persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart, 'owner.js exposes the persist function under test');

const context = {};
vm.runInNewContext(`${ownerSource.slice(start, end)};this.saveWorkspaceSnapshot=saveWorkspaceSnapshot;`, context);
const saveWorkspaceSnapshot = context.saveWorkspaceSnapshot;
const usable = value => Boolean(value && value.version === 1 && typeof value.name === 'string');

function runPersist({observed, stored, active, saved, failRead = false, failWrite = false}) {
  const target = storage(stored, {failRead, failWrite});
  const harness = {target, structuredClone};
  vm.runInNewContext(`
    const KEY='workspace';
    const localStorage=target;
    const M={addActivity(){},isUsableState:value=>Boolean(value&&value.version===1&&typeof value.name==='string')};
    let observedRaw=${JSON.stringify(observed)};
    let state=${JSON.stringify(active)};
    let savedState=${JSON.stringify(saved)};
    let storageOK=true;
    let message='';
    function status(value){message=value;}
    ${ownerSource.slice(start, end)}
    ${ownerSource.slice(persistStart, persistEnd)}
    this.result=persist('Edited workspace');
    this.out={result,state,savedState,observedRaw,storageOK,message};
  `, harness);
  return {out: harness.out, target};
}

function storage(initialRaw = null, {failRead = false, failWrite = false} = {}) {
  let raw = initialRaw;
  let writes = 0;
  return {
    getItem() {
      if (failRead) throw new Error('read blocked');
      return raw;
    },
    setItem(_key, value) {
      if (failWrite) throw new Error('quota');
      raw = value;
      writes += 1;
    },
    inspect: () => ({raw, writes})
  };
}

test('saves a valid workspace when storage still matches the last observed snapshot', () => {
  const original = JSON.stringify({version: 1, name: 'Original'});
  const target = storage(original);
  const result = saveWorkspaceSnapshot(() => target, 'workspace', original, {version: 1, name: 'Edited'}, usable);

  assert.equal(result.ok, true);
  assert.equal(result.raw, JSON.stringify({version: 1, name: 'Edited'}));
  assert.deepEqual(target.inspect(), {raw: result.raw, writes: 1});
});

test('rejects a delayed storage-event overwrite and returns the valid newer workspace', () => {
  const observed = JSON.stringify({version: 1, name: 'Observed'});
  const newer = JSON.stringify({version: 1, name: 'Saved in another tab'});
  const target = storage(newer);
  const result = saveWorkspaceSnapshot(() => target, 'workspace', observed, {version: 1, name: 'Stale edit'}, usable);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(result.raw, newer);
  assert.equal(result.state.name, 'Saved in another tab');
  assert.deepEqual(target.inspect(), {raw: newer, writes: 0});
});

test('does not overwrite changed storage when the newer value is invalid', () => {
  const observed = JSON.stringify({version: 1, name: 'Observed'});
  const target = storage('{broken');
  const result = saveWorkspaceSnapshot(() => target, 'workspace', observed, {version: 1, name: 'Stale edit'}, usable);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale-invalid');
  assert.deepEqual(target.inspect(), {raw: '{broken', writes: 0});
});

test('reports blocked reads and writes without claiming a save', () => {
  const raw = JSON.stringify({version: 1, name: 'Original'});
  const readFailure = saveWorkspaceSnapshot(() => storage(raw, {failRead: true}), 'workspace', raw, {version: 1, name: 'Edit'}, usable);
  const writeTarget = storage(raw, {failWrite: true});
  const writeFailure = saveWorkspaceSnapshot(() => writeTarget, 'workspace', raw, {version: 1, name: 'Edit'}, usable);

  assert.equal(readFailure.ok, false);
  assert.equal(readFailure.reason, 'storage');
  assert.equal(writeFailure.ok, false);
  assert.equal(writeFailure.reason, 'storage');
  assert.deepEqual(writeTarget.inspect(), {raw, writes: 0});
});

test('reports an inaccessible localStorage getter without escaping the save guard', () => {
  const result = saveWorkspaceSnapshot(() => { throw new Error('storage getter blocked'); }, 'workspace', null, {version: 1, name: 'Edit'}, usable);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage');
});

test('an explicit reset may replace a changed snapshot after storage remains accessible', () => {
  const observed = JSON.stringify({version: 1, name: 'Observed'});
  const target = storage(JSON.stringify({version: 1, name: 'Newer'}));
  const result = saveWorkspaceSnapshot(() => target, 'workspace', observed, {version: 1, name: 'Fresh demo'}, usable, {allowOverwrite: true});

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(target.inspect().raw).name, 'Fresh demo');
  assert.equal(target.inspect().writes, 1);
});

test('actual persist restores its last saved state after a failed storage commit', () => {
  const raw = JSON.stringify({version: 1, name: 'Last saved'});
  const {out, target} = runPersist({
    observed: raw,
    stored: raw,
    active: {version: 1, name: 'Unsaved edit'},
    saved: {version: 1, name: 'Last saved'},
    failWrite: true
  });

  assert.equal(out.result, false);
  assert.equal(out.state.name, 'Last saved');
  assert.equal(out.savedState.name, 'Last saved');
  assert.equal(out.storageOK, false);
  assert.match(out.message, /not saved and has been undone/i);
  assert.deepEqual(target.inspect(), {raw, writes: 0});
});

test('actual persist loads a valid newer state instead of overwriting it', () => {
  const observed = JSON.stringify({version: 1, name: 'Observed'});
  const newer = JSON.stringify({version: 1, name: 'Saved elsewhere'});
  const {out, target} = runPersist({
    observed,
    stored: newer,
    active: {version: 1, name: 'Stale edit'},
    saved: {version: 1, name: 'Observed'}
  });

  assert.equal(out.result, false);
  assert.equal(out.state.name, 'Saved elsewhere');
  assert.equal(out.savedState.name, 'Saved elsewhere');
  assert.equal(out.observedRaw, newer);
  assert.match(out.message, /current saved version/i);
  assert.deepEqual(target.inspect(), {raw: newer, writes: 0});
});
