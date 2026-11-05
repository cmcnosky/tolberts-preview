const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../owner-model.js");

function state() {
  return Model.createState(
    [{ category: "Chili", name: "Bowl of Red", description: "Demo", price: "11.99" }],
    [{ name: "Texas Flood", genre: "Texas blues", date: "2026-11-04", start: "8:00 pm", end: "10:45 pm", image: "assets/show-2.webp" }]
  );
}

function firstVendorItem(subject, vendor = "Demo food supplier") {
  return subject.inventory.find((item) => item.vendor === vendor);
}

test("accepts the public default demo login with exact case", async () => {
  assert.equal(await Model.verifyDemoLogin("Steven", "Steven"), true);
  assert.equal(await Model.verifyDemoLogin(" Steven ", "Steven"), true);
  assert.equal(await Model.verifyDemoLogin("steven", "Steven"), false);
  assert.equal(await Model.verifyDemoLogin("Steven", "steven"), false);
  assert.equal(await Model.verifyDemoLogin("Steven", "Steven "), false);
});

test("hashes a changed demo password and verifies only the changed value", async () => {
  const next = "A throwaway demo passphrase";
  const hash = await Model.hashDemoPassword(next);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes(next), false);
  assert.equal(hash.includes("Steven"), false);
  assert.equal(await Model.verifyDemoLogin("Steven", next, hash), true);
  assert.equal(await Model.verifyDemoLogin("Steven", "Steven", hash), false);
  assert.equal(await Model.verifyDemoLogin("Steven", next.toUpperCase(), hash), false);
  assert.equal(await Model.verifyDemoLogin("Steven", next, "not-a-sha256-hash"), false);
});

test("creates independent state using supplied menu and event records", () => {
  const left = state();
  const right = state();
  assert.equal(left.menu[0].id, "menu-1");
  assert.equal(left.events[0].status, "Scheduled");
  assert.equal(left.team[0].name, "Steven Ryan");
  assert.equal(left.orders.length, 0);
  left.inventory[0].onHand = 999;
  assert.notEqual(right.inventory[0].onHand, 999);
});

test("accepts seeded and legitimately mutated demo state", () => {
  const subject = state();
  assert.equal(Model.isUsableState(subject), true);
  subject.exceptions.push({ id: "hours-special", date: "2026-12-24", label: "Christmas Eve", open: "11:00", close: "18:00", closed: false });
  subject.team.push({ id: "team-2", name: "Demo manager", role: "Manager", status: "Active" });
  const item = firstVendorItem(subject);
  Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
  assert.equal(Model.isUsableState(subject), true);
});

test("rejects malformed browser state before the owner interface uses it", () => {
  assert.equal(Model.isUsableState(null), false);
  assert.equal(Model.isUsableState({ version: 1 }), false);
  const cases = [
    (subject) => { subject.hours[0].open = "24:00"; },
    (subject) => { subject.events[0].date = "2026-99-99"; },
    (subject) => { subject.events[0].date = "2026-02-30"; },
    (subject) => { subject.events[0].start = "25:00"; },
    (subject) => { subject.events[0].end = "13:00 pm"; },
    (subject) => { subject.menu[0].available = "yes"; },
    (subject) => { subject.inventory[0].onHand = null; },
    (subject) => { subject.team = []; },
    (subject) => { subject.team.push(null); },
    (subject) => { subject.settings.phone = 8174214888; },
    (subject) => { subject.activity.push({ id: "bad", message: "Bad date", createdAt: "not-a-date" }); },
    (subject) => { subject.orders.push({ id: "bad-order", lines: null }); },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.createdAt = "not-a-date";
    },
    (subject) => { subject.exceptions.push({ id: "bad-date", date: "2026-02-30", label: "Bad", open: "11:00", close: "18:00", closed: false }); }
  ];
  cases.forEach((corrupt) => {
    const subject = state();
    corrupt(subject);
    assert.equal(Model.isUsableState(subject), false);
  });
});

test("seeds HTML-compatible hours and represents a midnight close as 00:00", () => {
  const subject = state();
  const validClock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  subject.hours.forEach((entry) => {
    assert.match(entry.open, validClock);
    assert.match(entry.close, validClock);
  });
  assert.equal(subject.hours.find((entry) => entry.day === "Friday").close, "00:00");
  assert.equal(subject.hours.find((entry) => entry.day === "Saturday").close, "00:00");
});

test("calculates purchase totals in cents and formats money", () => {
  assert.equal(Model.orderTotal({ lines: [
    { quantity: 3, unitCost: 0.1 },
    { quantity: 2, unitCost: 19.995 }
  ] }), 40.3);
  assert.equal(Model.money(40.3), "$40.30");
});

test("rounds captured unit costs to cents before multiplying", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  item.cost = 19.995;
  const order = Model.createOrder(subject, {
    vendor: item.vendor,
    lines: [{ itemId: item.id, quantity: 2 }]
  });
  assert.equal(order.lines[0].unitCost, 20);
  assert.equal(Model.orderTotal(order), 40);
});

test("identifies inventory at or below its reorder threshold", () => {
  const subject = state();
  const expected = subject.inventory
    .filter((item) => item.onHand <= item.reorderAt)
    .map((item) => item.id);
  assert.deepEqual(Model.lowStock(subject).map((item) => item.id), expected);
  assert.ok(expected.length >= 1);
});

test("creates a draft order with a captured price and sample marker", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const order = Model.createOrder(subject, {
    vendor: item.vendor,
    lines: [{ itemId: item.id, quantity: 2 }],
    notes: "Demo order"
  });
  assert.equal(order.status, "Draft");
  assert.equal(order.sample, true);
  assert.equal(order.lines[0].unitCost, item.cost);
  assert.equal(Model.orderTotal(order), item.cost * 2);
  item.cost = 999;
  assert.notEqual(order.lines[0].unitCost, item.cost);
});

test("rejects empty, fractional, duplicate, unknown, and wrong-vendor lines", () => {
  const subject = state();
  const food = firstVendorItem(subject);
  const produce = firstVendorItem(subject, "Demo produce supplier");
  assert.throws(() => Model.createOrder(subject, { vendor: food.vendor, lines: [] }), /at least one/i);
  assert.throws(() => Model.createOrder(subject, { vendor: food.vendor, lines: [{ itemId: food.id, quantity: 1.5 }] }), /whole numbers/i);
  assert.throws(() => Model.createOrder(subject, { vendor: food.vendor, lines: [{ itemId: food.id, quantity: 1 }, { itemId: food.id, quantity: 2 }] }), /only once/i);
  assert.throws(() => Model.createOrder(subject, { vendor: food.vendor, lines: [{ itemId: "missing", quantity: 1 }] }), /unknown/i);
  assert.throws(() => Model.createOrder(subject, { vendor: food.vendor, lines: [{ itemId: produce.id, quantity: 1 }] }), /selected demo vendor/i);
  assert.equal(subject.orders.length, 0);
});

test("draft and cancelled orders never change inventory", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const before = item.onHand;
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 4 }] });
  assert.equal(item.onHand, before);
  Model.cancelOrder(subject, order.id);
  assert.equal(order.status, "Cancelled");
  assert.equal(item.onHand, before);
  assert.throws(() => Model.submitOrder(subject, order.id), /Only draft/i);
});

test("submitted orders remain simulated until one successful receipt", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const before = item.onHand;
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 3 }] });
  Model.submitOrder(subject, order.id);
  assert.equal(order.status, "Submitted (demo)");
  assert.equal(item.onHand, before);
  assert.throws(() => Model.submitOrder(subject, order.id), /Only draft/i);
  Model.receiveOrder(subject, order.id);
  assert.equal(order.status, "Received");
  assert.equal(item.onHand, before + 3);
  assert.equal(order.lines[0].received, 3);
  assert.throws(() => Model.receiveOrder(subject, order.id), /Only submitted/i);
  assert.equal(item.onHand, before + 3);
  assert.throws(() => Model.cancelOrder(subject, order.id), /Only draft or submitted/i);
});

test("can cancel a submitted simulation without adding inventory", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const before = item.onHand;
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 3 }] });
  Model.submitOrder(subject, order.id);
  Model.cancelOrder(subject, order.id);
  assert.equal(order.status, "Cancelled");
  assert.equal(item.onHand, before);
  assert.throws(() => Model.receiveOrder(subject, order.id), /Only submitted/i);
});

test("receipt validation is atomic when an inventory record is missing", () => {
  const subject = state();
  const items = subject.inventory.filter((item) => item.vendor === "Demo food supplier").slice(0, 2);
  const before = items[0].onHand;
  const order = Model.createOrder(subject, {
    vendor: "Demo food supplier",
    lines: items.map((item) => ({ itemId: item.id, quantity: 2 }))
  });
  Model.submitOrder(subject, order.id);
  subject.inventory = subject.inventory.filter((item) => item.id !== items[1].id);
  assert.throws(() => Model.receiveOrder(subject, order.id), /no longer exists/i);
  assert.equal(items[0].onHand, before);
  assert.equal(order.status, "Submitted (demo)");
});

test("receipt validation rejects corrupted quantities before any inventory mutation", () => {
  const subject = state();
  const items = subject.inventory.filter((item) => item.vendor === "Demo food supplier").slice(0, 2);
  const before = items.map((item) => item.onHand);
  const order = Model.createOrder(subject, {
    vendor: "Demo food supplier",
    lines: items.map((item) => ({ itemId: item.id, quantity: 2 }))
  });
  Model.submitOrder(subject, order.id);
  order.lines[1].quantity = Number.NaN;
  assert.throws(() => Model.receiveOrder(subject, order.id), /invalid receipt quantity/i);
  assert.deepEqual(items.map((item) => item.onHand), before);
  assert.equal(order.status, "Submitted (demo)");
  assert.deepEqual(order.lines.map((line) => line.received), [0, 0]);
});

test("keeps only the newest 100 activity records", () => {
  const subject = state();
  for (let index = 0; index < 105; index += 1) Model.addActivity(subject, `Action ${index}`);
  assert.equal(subject.activity.length, 100);
  assert.equal(subject.activity[0].message, "Action 104");
  assert.equal(subject.activity.at(-1).message, "Action 5");
});
