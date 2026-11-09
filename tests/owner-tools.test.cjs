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
  const statuses = [];
  const navigated = [];
  return {
    opened,
    statuses,
    navigated,
    getState: () => value,
    replaceState: () => {},
    persist: async () => true,
    status: (message) => statuses.push(message),
    openEditor: (title, fields, callback, saveText) => opened.push({ title, fields, callback, saveText }),
    confirmation: () => {},
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

test("new shifts exclude inactive teammates while their historical shifts remain editable", () => {
  const value = state();
  const stub = adapter(value);
  const tools = OwnerTools.create(stub);

  assert.equal(tools.handle("schedule-new"), true);
  assert.equal(stub.opened.length, 1);
  assert.match(stub.opened[0].fields, />Steven Ryan</);
  assert.doesNotMatch(stub.opened[0].fields, /Pat Example/);

  assert.equal(tools.handle("schedule-edit", "shift-pat"), true);
  assert.equal(stub.opened.length, 2);
  assert.match(stub.opened[1].fields, />Pat Example \(Inactive\)</);
  assert.match(stub.opened[1].fields, />Steven Ryan</);
});
