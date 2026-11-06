const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const owner = fs.readFileSync(path.join(__dirname, '..', 'owner.js'), 'utf8');
const tools = fs.readFileSync(path.join(__dirname, '..', 'owner-tools.js'), 'utf8');
const access = fs.readFileSync(path.join(__dirname, '..', 'owner-access.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');

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
