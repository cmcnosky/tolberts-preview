const test = require("node:test");
const assert = require("node:assert/strict");

const Model = require("../owner-model.js");
global.OwnerModel = Model;
const OwnerTools = require("../owner-tools.js");

function state() {
  const value = Model.createState(
    [{ category: "Chili", name: "Bowl of Red", description: "Demo", price: "11.99" }],
    [{ name: "Texas Flood", genre: "Texas blues", date: "2026-11-10", start: "20:00", end: "22:45", image: "assets/show-2.webp" }]
  );
  value.team.push({ id: "pat", name: "Pat Example", role: "Manager", status: "Inactive" });
  value.shifts.push({
    id: "shift-pat", memberId: "pat", date: "2026-11-10", start: "11:00", end: "17:00",
    role: "Manager", notes: "Historical assignment"
  });
  assert.equal(Model.isUsableState(value), true);
  return value;
}

function adapter(value) {
  const opened = [];
  const confirmations = [];
  const statuses = [];
  const navigated = [];
  const persistedMessages = [];
  return {
    opened,
    confirmations,
    statuses,
    navigated,
    persistedMessages,
    getState: () => value,
    replaceState: () => {},
    persist: async (message) => {
      persistedMessages.push(message);
      if (message) Model.addActivity(value, message);
      return true;
    },
    status: (message) => statuses.push(message),
    openEditor: (title, fields, callback, saveText) => opened.push({ title, fields, callback, saveText }),
    confirmation: (title, fields, callback, saveText) => confirmations.push({ title, fields, callback, saveText }),
    esc: (input) => String(input),
    button: () => "",
    field: (name, label, current = "") => `<label>${label}<input name="${name}" value="${current}"></label>`,
    area: (name, label, current = "") => `<label>${label}<textarea name="${name}">${current}</textarea></label>`,
    select: (name, label, options, current) => `<label>${label}<select name="${name}">${options.map((entry) => {
      const [optionValue, optionLabel] = Array.isArray(entry) ? entry : [entry, entry];
      return `<option value="${optionValue}"${optionValue === current ? " selected" : ""}>${optionLabel}</option>`;
    }).join("")}</select></label>`,
    check: () => "",
    heading: () => "",
    panel: () => "",
    empty: () => "",
    dateLabel: (date) => date,
    dayKey: () => "2026-11-10",
    requireCurrentState: (expected) => assert.equal(expected, value),
    render: () => {},
    navigate: (view) => navigated.push(view)
  };
}

test("new shifts exclude inactive teammates, preserve historical editing, and log each action once", async () => {
  const value = state();
  const stub = adapter(value);
  const tools = OwnerTools.create(stub);

  assert.equal(tools.handle("schedule-new"), true);
  assert.equal(stub.opened.length, 1);
  assert.match(stub.opened[0].fields, />Steven Ryan</);
  assert.doesNotMatch(stub.opened[0].fields, /Pat Example/);
  const beforeAdd = value.activity.length;
  await stub.opened[0].callback({
    memberId: "steven", date: "2026-11-10", start: "18:00", end: "20:00", role: "Owner", notes: "Dinner"
  });
  assert.equal(value.activity.length, beforeAdd + 1);
  assert.match(value.activity[0].message, /^Added shift for Steven Ryan/);
  assert.equal(stub.persistedMessages.at(-1), undefined);

  assert.equal(tools.handle("schedule-edit", "shift-pat"), true);
  assert.equal(stub.opened.length, 2);
  assert.match(stub.opened[1].fields, />Pat Example \(Inactive\)</);
  assert.match(stub.opened[1].fields, />Steven Ryan</);
  const beforeEdit = value.activity.length;
  await stub.opened[1].callback({
    memberId: "pat", date: "2026-11-10", start: "11:00", end: "17:00", role: "Manager", notes: "Updated history"
  });
  assert.equal(value.activity.length, beforeEdit + 1);
  assert.match(value.activity[0].message, /^Updated shift for Pat Example/);
  assert.equal(stub.persistedMessages.at(-1), undefined);

  assert.equal(tools.handle("schedule-remove", "shift-pat"), true);
  assert.equal(stub.confirmations.length, 1);
  const beforeRemove = value.activity.length;
  await stub.confirmations[0].callback();
  assert.equal(value.activity.length, beforeRemove + 1);
  assert.match(value.activity[0].message, /^Removed shift for Pat Example/);
  assert.equal(value.shifts.some((shift) => shift.id === "shift-pat"), false);
  assert.equal(stub.persistedMessages.at(-1), undefined);
});
