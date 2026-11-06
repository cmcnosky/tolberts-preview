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
  subject.events[0].image = "data:image/png;base64,AA==";
  const item = firstVendorItem(subject);
  Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
  assert.equal(Model.isUsableState(subject), true);
});

test("accepts every state produced by the simulated purchase lifecycle", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
  assert.equal(Model.isUsableState(subject), true);
  Model.submitOrder(subject, order.id);
  assert.equal(Model.isUsableState(subject), true);
  Model.receiveOrder(subject, order.id);
  assert.equal(Model.isUsableState(subject), true);

  const cancelled = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
  Model.cancelOrder(subject, cancelled.id);
  assert.equal(Model.isUsableState(subject), true);

  const cancelledAfterSubmission = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
  Model.submitOrder(subject, cancelledAfterSubmission.id);
  Model.cancelOrder(subject, cancelledAfterSubmission.id);
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
    (subject) => { subject.menu[0].id = "unsafe id"; },
    (subject) => { subject.menu.push({ ...subject.menu[0] }); },
    (subject) => { subject.events[0].status = "Maybe"; },
    (subject) => { subject.events[0].end = subject.events[0].start; },
    (subject) => { subject.events[0].image = "javascript:alert(1)"; },
    (subject) => { subject.hours[0] = null; },
    (subject) => { subject.hours.reverse(); },
    (subject) => { subject.hours[0].close = subject.hours[0].open; },
    (subject) => { subject.inventory[0].onHand = null; },
    (subject) => { subject.inventory[0].par = subject.inventory[0].reorderAt - 1; },
    (subject) => { subject.team = []; },
    (subject) => { subject.team.push(null); },
    (subject) => { subject.team[0].role = "Editor"; },
    (subject) => { subject.team.push({ id: "team-2", name: "Demo", role: "Administrator", status: "Active" }); },
    (subject) => { subject.settings.phone = 8174214888; },
    (subject) => { subject.settings.phone = "   "; },
    (subject) => { subject.activity.push({ id: "bad", message: "Bad date", createdAt: "not-a-date" }); },
    (subject) => { subject.orders.push({ id: "bad-order", lines: null }); },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.lines[0] = null;
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.createdAt = "not-a-date";
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.status = "Sent";
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.lines.push({ ...order.lines[0] });
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.lines[0].itemId = "stock-missing";
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.lines[0].received = 1;
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.vendor = "Corrupted vendor";
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      order.submittedAt = new Date().toISOString();
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      Model.submitOrder(subject, order.id);
      order.submittedAt = "not-a-date";
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      Model.submitOrder(subject, order.id);
      delete order.submittedAt;
    },
    (subject) => {
      const item = firstVendorItem(subject);
      const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] });
      Model.cancelOrder(subject, order.id);
      delete order.cancelledAt;
    },
    (subject) => { subject.exceptions.push({ id: "bad-date", date: "2026-02-30", label: "Bad", open: "11:00", close: "18:00", closed: false }); },
    (subject) => {
      subject.exceptions.push({ id: "hours-1", date: "2026-12-24", label: "One", open: "11:00", close: "18:00", closed: false });
      subject.exceptions.push({ id: "hours-2", date: "2026-12-24", label: "Two", open: "11:00", close: "17:00", closed: false });
    }
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

test("rejects saved and newly captured values outside the interface limits", () => {
  const subject = state();
  const item = firstVendorItem(subject);

  item.cost = Number.MAX_VALUE;
  assert.equal(Model.isUsableState(subject), false);
  assert.throws(
    () => Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] }),
    /invalid unit cost/i
  );
  assert.equal(subject.orders.length, 0);

  item.cost = 10;
  assert.throws(
    () => Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 10001 }] }),
    /1 to 10000/i
  );
  assert.throws(
    () => Model.orderTotal({ lines: [{ quantity: 2, unitCost: Number.POSITIVE_INFINITY }] }),
    /invalid line total/i
  );
});

test("refuses an over-limit receipt before changing any inventory", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  item.onHand = 99999;
  item.par = 100000;
  const order = Model.createOrder(subject, {
    vendor: item.vendor,
    lines: [{ itemId: item.id, quantity: 2 }]
  });
  Model.submitOrder(subject, order.id);

  assert.throws(() => Model.receiveOrder(subject, order.id), /stock limit/i);
  assert.equal(item.onHand, 99999);
  assert.equal(order.lines[0].received, 0);
  assert.equal(order.status, "Submitted (demo)");

  item.onHand = 99998;
  Model.receiveOrder(subject, order.id);
  assert.equal(item.onHand, 100000);
  assert.equal(order.status, "Received");
  assert.equal(Model.isUsableState(subject), true);
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
  for (const invalidQuantity of [Number.NaN, 10001]) {
    const subject = state();
    const items = subject.inventory.filter((item) => item.vendor === "Demo food supplier").slice(0, 2);
    const before = items.map((item) => item.onHand);
    const order = Model.createOrder(subject, {
      vendor: "Demo food supplier",
      lines: items.map((item) => ({ itemId: item.id, quantity: 2 }))
    });
    Model.submitOrder(subject, order.id);
    order.lines[1].quantity = invalidQuantity;
    assert.throws(() => Model.receiveOrder(subject, order.id), /invalid receipt quantity/i);
    assert.deepEqual(items.map((item) => item.onHand), before);
    assert.equal(order.status, "Submitted (demo)");
    assert.deepEqual(order.lines.map((line) => line.received), [0, 0]);
  }
});

test("receipt validation rejects duplicate or previously received lines atomically", () => {
  for (const corrupt of [
    (order) => order.lines.push({ ...order.lines[0] }),
    (order) => { order.lines[0].received = 1; },
    (order) => { order.lines[0] = null; }
  ]) {
    const subject = state();
    const item = firstVendorItem(subject);
    const before = item.onHand;
    const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
    Model.submitOrder(subject, order.id);
    corrupt(order);
    assert.throws(() => Model.receiveOrder(subject, order.id), /same inventory item|already marked received|invalid line item/i);
    assert.equal(item.onHand, before);
    assert.equal(order.status, "Submitted (demo)");
  }
});

test("receipt validation rejects a mismatched demo vendor before changing inventory", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  const before = item.onHand;
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
  Model.submitOrder(subject, order.id);
  order.vendor = "Corrupted vendor";

  assert.throws(() => Model.receiveOrder(subject, order.id), /different demo vendor/i);
  assert.equal(item.onHand, before);
  assert.equal(order.status, "Submitted (demo)");
  assert.equal(order.lines[0].received, 0);
});

test("keeps only the newest 100 activity records", () => {
  const subject = state();
  for (let index = 0; index < 105; index += 1) Model.addActivity(subject, `Action ${index}`);
  assert.equal(subject.activity.length, 100);
  assert.equal(subject.activity[0].message, "Action 104");
  assert.equal(subject.activity.at(-1).message, "Action 5");
});

test("accepts legacy version-one state without newly optional workspace fields", () => {
  const subject = state();
  delete subject.shifts;
  delete subject.settings.content;
  delete subject.settings.images;
  subject.inventory.forEach((item) => delete item.archived);
  subject.menu.forEach((item) => {
    delete item.image;
    delete item.imageAlt;
  });
  assert.equal(Model.isUsableState(subject), true);
});

test("validates optional content, image, and menu-photo fields with bounded safe values", () => {
  const subject = state();
  subject.settings.content = {
    "home.hero.heading": "Hot chili. Cold beer. Live music.",
    visit_heading: "Come see us on Main Street"
  };
  subject.settings.images = { "home.hero": "assets/stage.webp" };
  subject.menu[0].image = "";
  assert.equal(Model.isUsableState(subject), true);
  subject.menu[0].image = "data:image/webp;base64,AA==";
  subject.menu[0].imageAlt = "A bowl of Tolbert's red chili";
  assert.equal(Model.isUsableState(subject), true);

  subject.settings.content.bad = 42;
  assert.equal(Model.isUsableState(subject), false);
  subject.settings.content.bad = "fixed";
  subject.settings.images["home.hero"] = "https://example.com/unsafe.jpg";
  assert.equal(Model.isUsableState(subject), false);
  subject.settings.images["home.hero"] = "assets/stage.webp";
  subject.menu[0].image = "javascript:alert(1)";
  assert.equal(Model.isUsableState(subject), false);
});

test("creates, updates, removes, and measures same-day and overnight shifts", () => {
  const subject = state();
  subject.team.push({ id: "team-manager", name: "Demo Manager", role: "Manager", status: "Active" });
  const created = Model.upsertShift(subject, {
    memberId: "steven", date: "2026-11-06", start: "22:00", end: "02:00", role: "Owner", notes: "Close"
  });
  assert.equal(Model.shiftHours(created), 4);
  assert.equal(subject.shifts.length, 1);
  const originalId = created.id;

  const updated = Model.upsertShift(subject, {
    id: originalId, memberId: "steven", date: "2026-11-06", start: "21:00", end: "02:00", role: "Owner", notes: "Dinner and close"
  });
  assert.equal(updated.id, originalId);
  assert.equal(Model.shiftHours(updated), 5);
  assert.equal(subject.shifts.length, 1);

  Model.upsertShift(subject, {
    memberId: "team-manager", date: "2026-11-06", start: "21:00", end: "02:00", role: "Manager", notes: ""
  });
  assert.equal(subject.shifts.length, 2);
  assert.equal(Model.isUsableState(subject), true);

  const removed = Model.removeShift(subject, originalId);
  assert.equal(removed.id, originalId);
  removed.notes = "Changed outside state";
  assert.equal(subject.shifts.length, 1);
  assert.equal(subject.shifts[0].notes, "");
});

test("rejects missing teammates, malformed shifts, and same-member overnight overlaps atomically", () => {
  const subject = state();
  Model.upsertShift(subject, {
    memberId: "steven", date: "2026-11-06", start: "22:00", end: "02:00", role: "Owner", notes: "Close"
  });
  const before = JSON.stringify(subject);
  assert.throws(() => Model.upsertShift(subject, {
    memberId: "steven", date: "2026-11-07", start: "01:30", end: "04:00", role: "Owner", notes: "Overlap"
  }), /overlapping shifts/i);
  assert.equal(JSON.stringify(subject), before);
  assert.throws(() => Model.upsertShift(subject, {
    memberId: "missing", date: "2026-11-07", start: "04:00", end: "08:00", role: "Manager", notes: ""
  }), /current demo teammate/i);
  assert.throws(() => Model.shiftHours({ date: "2026-11-07", start: "04:00", end: "04:00" }), /different start and end/i);

  subject.shifts.push({ id: "bad-shift", memberId: "steven", date: "2026-02-30", start: "04:00", end: "08:00", role: "Owner", notes: "" });
  assert.equal(Model.isUsableState(subject), false);
});

test("allows back-to-back shifts for one teammate", () => {
  const subject = state();
  Model.upsertShift(subject, { memberId: "steven", date: "2026-11-06", start: "22:00", end: "02:00", role: "Owner", notes: "" });
  Model.upsertShift(subject, { memberId: "steven", date: "2026-11-07", start: "02:00", end: "05:00", role: "Owner", notes: "" });
  assert.equal(subject.shifts.length, 2);
  assert.equal(Model.isUsableState(subject), true);
});

test("exports and parses a validated backup without sharing mutable state", () => {
  const subject = state();
  subject.settings.content = { "home.hero.heading": "Tolbert's" };
  const backup = Model.createBackup(subject);
  assert.equal(backup.format, "tolberts-workspace");
  assert.equal(backup.version, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  backup.state.menu[0].name = "Changed in backup";
  assert.equal(subject.menu[0].name, "Bowl of Red");

  const parsed = Model.parseBackup(JSON.stringify(Model.createBackup(subject)));
  assert.equal(parsed.menu[0].name, "Bowl of Red");
  parsed.menu[0].name = "Changed after import";
  assert.equal(subject.menu[0].name, "Bowl of Red");
  assert.throws(() => Model.parseBackup("not json"), /not valid JSON/i);
  assert.throws(() => Model.parseBackup(JSON.stringify({ ...backup, format: "another-app" })), /not a valid Tolbert's workspace backup/i);
  const invalid = Model.createBackup(subject);
  invalid.state.team = [];
  assert.throws(() => Model.parseBackup(JSON.stringify(invalid)), /not a valid Tolbert's workspace backup/i);
});

test("updates only draft order details atomically while preserving order identity", () => {
  const subject = state();
  const items = subject.inventory.filter((item) => item.vendor === "Demo food supplier").slice(0, 2);
  const order = Model.createOrder(subject, { vendor: items[0].vendor, lines: [{ itemId: items[0].id, quantity: 1 }], notes: "First" });
  const identity = { id: order.id, number: order.number, createdAt: order.createdAt };
  const updated = Model.updateDraftOrder(subject, order.id, {
    vendor: items[0].vendor,
    lines: [{ itemId: items[1].id, quantity: 4 }],
    notes: "Revised"
  });
  assert.deepEqual({ id: updated.id, number: updated.number, createdAt: updated.createdAt }, identity);
  assert.equal(updated.lines[0].itemId, items[1].id);
  assert.equal(updated.lines[0].quantity, 4);
  assert.equal(updated.notes, "Revised");

  const beforeInvalid = JSON.stringify(subject.orders);
  assert.throws(() => Model.updateDraftOrder(subject, order.id, {
    vendor: items[0].vendor,
    lines: [{ itemId: items[1].id, quantity: 1.5 }],
    notes: "Invalid"
  }), /whole numbers/i);
  assert.equal(JSON.stringify(subject.orders), beforeInvalid);

  Model.submitOrder(subject, order.id);
  assert.throws(() => Model.updateDraftOrder(subject, order.id, {
    vendor: items[0].vendor,
    lines: [{ itemId: items[0].id, quantity: 1 }],
    notes: "Too late"
  }), /only draft/i);
});

test("archives stock without breaking existing orders or low-stock reporting", () => {
  const subject = state();
  const item = firstVendorItem(subject);
  item.onHand = item.reorderAt;
  const order = Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 2 }] });
  assert.ok(Model.lowStock(subject).some((candidate) => candidate.id === item.id));

  item.archived = true;
  assert.equal(Model.isUsableState(subject), true);
  assert.equal(Model.lowStock(subject).some((candidate) => candidate.id === item.id), false);
  assert.throws(() => Model.createOrder(subject, { vendor: item.vendor, lines: [{ itemId: item.id, quantity: 1 }] }), /archived stock/i);
  Model.submitOrder(subject, order.id);
  Model.receiveOrder(subject, order.id);
  assert.equal(order.status, "Received");
  assert.equal(item.onHand, item.reorderAt + 2);
  assert.equal(Model.isUsableState(subject), true);
});

test("lets an existing draft retain archived lines without allowing archived stock to be introduced", () => {
  const subject = state();
  const items = subject.inventory.filter((item) => item.vendor === "Demo food supplier").slice(0, 2);
  const order = Model.createOrder(subject, {
    vendor: items[0].vendor,
    lines: [{ itemId: items[0].id, quantity: 2 }],
    notes: "Before archive"
  });
  items[0].archived = true;

  const updated = Model.updateDraftOrder(subject, order.id, {
    vendor: items[0].vendor,
    lines: [{ itemId: items[0].id, quantity: 3 }],
    notes: "Changed after archive"
  });
  assert.equal(updated.lines[0].itemId, items[0].id);
  assert.equal(updated.lines[0].quantity, 3);
  assert.equal(updated.notes, "Changed after archive");

  items[1].archived = true;
  const beforeInvalid = JSON.stringify(subject.orders);
  assert.throws(() => Model.updateDraftOrder(subject, order.id, {
    vendor: items[0].vendor,
    lines: [
      { itemId: items[0].id, quantity: 3 },
      { itemId: items[1].id, quantity: 1 }
    ],
    notes: "Should not save"
  }), /archived stock/i);
  assert.equal(JSON.stringify(subject.orders), beforeInvalid);
});
