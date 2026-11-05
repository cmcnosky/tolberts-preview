/*
 * Tolbert's owner-workspace demo model.
 *
 * This module deliberately has no network or storage access. It mutates the
 * state object supplied by the browser UI; the UI may persist that sample state
 * in localStorage. "Submitted" purchase orders are simulations and never reach
 * a vendor, payment method, or restaurant system.
 */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.OwnerModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SAMPLE_INVENTORY = [
    { id: "stock-chili-beef", name: "Chili beef", unit: "10 lb case", onHand: 3, par: 8, reorderAt: 3, cost: 54.0, vendor: "Demo food supplier" },
    { id: "stock-pinto-beans", name: "Pinto beans", unit: "25 lb bag", onHand: 6, par: 8, reorderAt: 2, cost: 24.5, vendor: "Demo food supplier" },
    { id: "stock-tortillas", name: "Flour tortillas", unit: "case", onHand: 2, par: 7, reorderAt: 2, cost: 31.25, vendor: "Demo food supplier" },
    { id: "stock-cheddar", name: "Cheddar cheese", unit: "5 lb case", onHand: 5, par: 7, reorderAt: 2, cost: 29.75, vendor: "Demo food supplier" },
    { id: "stock-onions", name: "Yellow onions", unit: "50 lb bag", onHand: 4, par: 5, reorderAt: 1, cost: 22.0, vendor: "Demo produce supplier" },
    { id: "stock-jalapenos", name: "Fresh jalapeños", unit: "10 lb case", onHand: 1, par: 4, reorderAt: 1, cost: 18.5, vendor: "Demo produce supplier" },
    { id: "stock-tomatoes", name: "Roma tomatoes", unit: "25 lb case", onHand: 3, par: 5, reorderAt: 2, cost: 27.0, vendor: "Demo produce supplier" },
    { id: "stock-amber-ale", name: "Texas amber ale", unit: "24-count case", onHand: 7, par: 10, reorderAt: 3, cost: 38.4, vendor: "Demo beverage supplier" },
    { id: "stock-light-beer", name: "Domestic light beer", unit: "24-count case", onHand: 3, par: 12, reorderAt: 4, cost: 29.2, vendor: "Demo beverage supplier" },
    { id: "stock-soda-syrup", name: "Cola syrup", unit: "5 gal box", onHand: 4, par: 6, reorderAt: 2, cost: 78.0, vendor: "Demo beverage supplier" }
  ];

  const HOURS = [
    { day: "Monday", open: "11:00", close: "21:00", closed: false },
    { day: "Tuesday", open: "11:00", close: "22:00", closed: false },
    { day: "Wednesday", open: "11:00", close: "23:00", closed: false },
    { day: "Thursday", open: "11:00", close: "23:00", closed: false },
    // A 00:00 close represents midnight at the end of Friday/Saturday.
    { day: "Friday", open: "11:00", close: "00:00", closed: false },
    { day: "Saturday", open: "11:00", close: "00:00", closed: false },
    { day: "Sunday", open: "11:00", close: "21:00", closed: false }
  ];
  const DAYS = HOURS.map((entry) => entry.day);
  const EVENT_STATUSES = new Set(["Scheduled", "Cancelled"]);
  const ORDER_STATUSES = new Set(["Draft", "Submitted (demo)", "Received", "Cancelled"]);
  const TEAM_ROLES = new Set(["Owner", "Manager", "Editor"]);
  const TEAM_STATUSES = new Set(["Active", "Inactive"]);
  const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,119}$/i;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /*
   * This SHA-256 value only keeps a changed demo password out of plaintext
   * localStorage. The page and its default credentials are public, so this is
   * not a production password store or an authentication security boundary.
   */
  async function hashDemoPassword(value, cryptoProvider = (typeof globalThis !== "undefined" ? globalThis.crypto : null)) {
    if (!cryptoProvider || !cryptoProvider.subtle || typeof cryptoProvider.subtle.digest !== "function") {
      throw new Error("Demo password changes require Web Crypto.");
    }
    const bytes = new TextEncoder().encode(String(value));
    const digest = await cryptoProvider.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function verifyDemoLogin(username, password, storedHash = null, cryptoProvider = (typeof globalThis !== "undefined" ? globalThis.crypto : null)) {
    if (String(username || "").trim() !== "Steven") return false;
    if (storedHash === null || storedHash === undefined) return String(password) === "Steven";
    if (!/^[a-f0-9]{64}$/.test(String(storedHash))) return false;
    return await hashDemoPassword(password, cryptoProvider) === storedHash;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasStrings(value, fields) {
    return isRecord(value) && fields.every((field) => typeof value[field] === "string");
  }

  function hasNonBlankStrings(value, fields) {
    return hasStrings(value, fields) && fields.every((field) => value[field].trim().length > 0);
  }

  function hasUniqueSafeIds(values) {
    const ids = values.map((value) => value && value.id);
    return ids.every((value) => typeof value === "string" && SAFE_ID.test(value)) && new Set(ids).size === ids.length;
  }

  function isNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function isCivilDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function isClock(value) {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ||
      /^(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)$/i.test(value);
  }

  function isIsoTimestamp(value) {
    if (typeof value !== "string") return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }

  function isStoredImage(value) {
    if (typeof value !== "string") return false;
    if (/^assets\/[a-zA-Z0-9._-]+$/.test(value)) return true;
    return value.length <= 850000 && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(value);
  }

  function isUsableState(value) {
    if (!isRecord(value) || value.version !== 1) return false;
    const arrayFields = ["menu", "events", "hours", "exceptions", "inventory", "orders", "team", "activity"];
    if (!arrayFields.every((field) => Array.isArray(value[field]))) return false;
    if (!hasStrings(value.settings, ["phone", "address", "announcement"]) ||
        !value.settings.phone.trim() || !value.settings.address.trim()) return false;
    const idCollections = ["menu", "events", "exceptions", "inventory", "orders", "team", "activity"];
    if (!idCollections.every((field) => hasUniqueSafeIds(value[field]))) return false;

    const menuValid = value.menu.every((item) =>
      hasStrings(item, ["id", "category", "name", "description", "price"]) &&
      item.category.trim() && item.name.trim() && typeof item.available === "boolean"
    );
    const eventsValid = value.events.every((event) =>
      hasStrings(event, ["id", "name", "genre", "date", "start", "end", "image", "status"]) &&
      event.name.trim() && isCivilDate(event.date) && isClock(event.start) && isClock(event.end) &&
      event.start !== event.end && isStoredImage(event.image) && EVENT_STATUSES.has(event.status)
    );
    const validClock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const hoursValid = value.hours.length === DAYS.length &&
      value.hours.every((entry, index) => isRecord(entry) && entry.day === DAYS[index]) &&
      value.hours.every((hours) =>
      hasStrings(hours, ["day", "open", "close"]) &&
      typeof hours.closed === "boolean" && validClock.test(hours.open) && validClock.test(hours.close) &&
      (hours.closed || hours.open !== hours.close)
    );
    const exceptionsValid = value.exceptions.every((exception) =>
      hasStrings(exception, ["id", "date", "label", "open", "close"]) &&
      exception.label.trim() && typeof exception.closed === "boolean" && isCivilDate(exception.date) &&
      validClock.test(exception.open) && validClock.test(exception.close) &&
      (exception.closed || exception.open !== exception.close)
    ) && new Set(value.exceptions.map((entry) => entry.date)).size === value.exceptions.length;
    const inventoryValid = value.inventory.every((item) =>
      hasStrings(item, ["id", "name", "unit", "vendor"]) &&
      item.name.trim() && item.unit.trim() && item.vendor.trim() &&
      [item.onHand, item.par, item.reorderAt, item.cost].every(isNonNegativeNumber) &&
      item.par >= item.reorderAt
    );
    const ordersValid = value.orders.every((order) =>
      hasStrings(order, ["id", "number", "vendor", "notes", "status", "createdAt"]) &&
      /^PO-DEMO-\d+$/.test(order.number) && order.vendor.trim() && ORDER_STATUSES.has(order.status) &&
      isIsoTimestamp(order.createdAt) && order.sample === true &&
      Array.isArray(order.lines) && order.lines.length > 0 &&
      new Set(order.lines.map((line) => line && line.itemId)).size === order.lines.length &&
      order.lines.every((line) =>
        hasNonBlankStrings(line, ["itemId", "name", "unit"]) && SAFE_ID.test(line.itemId) &&
        value.inventory.some((item) => item.id === line.itemId) &&
        Number.isInteger(line.quantity) && line.quantity > 0 &&
        isNonNegativeNumber(line.unitCost) && Number.isInteger(line.received) &&
        line.received >= 0 && line.received <= line.quantity &&
        (order.status === "Received" ? line.received === line.quantity : line.received === 0)
      )
    ) && new Set(value.orders.map((order) => order.number)).size === value.orders.length;
    const teamValid = value.team.some((member) => member && member.id === "steven" && member.role === "Owner" && member.status === "Active") && value.team.every((member) =>
      hasNonBlankStrings(member, ["id", "name", "role", "status"]) &&
      TEAM_ROLES.has(member.role) && TEAM_STATUSES.has(member.status)
    );
    const activityValid = value.activity.length <= 100 && value.activity.every((entry) =>
      hasNonBlankStrings(entry, ["id", "message", "createdAt"]) && isIsoTimestamp(entry.createdAt)
    );
    return menuValid && eventsValid && hoursValid && exceptionsValid && inventoryValid && ordersValid && teamValid && activityValid;
  }

  function id(prefix) {
    const safePrefix = String(prefix || "item").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const cryptoObject = typeof globalThis !== "undefined" ? globalThis.crypto : null;
    if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
      return `${safePrefix}-${cryptoObject.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `${safePrefix}-${Date.now().toString(36)}-${random}`;
  }

  function createState(menuArray, eventArray) {
    const menu = Array.isArray(menuArray) ? menuArray : [];
    const events = Array.isArray(eventArray) ? eventArray : [];
    return {
      version: 1,
      menu: menu.map((item, index) => ({
        id: `menu-${index + 1}`,
        category: String(item && item.category || "Uncategorized"),
        name: String(item && item.name || "Untitled item"),
        description: String(item && item.description || ""),
        price: String(item && item.price || ""),
        available: item && typeof item.available === "boolean" ? item.available : true
      })),
      events: events.map((event, index) => ({
        id: `show-${index + 1}`,
        name: String(event && event.name || "Untitled show"),
        genre: String(event && event.genre || ""),
        date: String(event && event.date || ""),
        start: String(event && event.start || ""),
        end: String(event && event.end || ""),
        image: String(event && event.image || ""),
        status: String(event && event.status || "Scheduled")
      })),
      hours: clone(HOURS),
      exceptions: [],
      inventory: clone(SAMPLE_INVENTORY),
      orders: [],
      team: [{ id: "steven", name: "Steven Ryan", role: "Owner", status: "Active" }],
      activity: [],
      settings: {
        phone: "(817) 421-4888",
        address: "423 South Main Street, Grapevine, Texas 76051",
        announcement: ""
      }
    };
  }

  function money(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) throw new TypeError("Money amount must be finite.");
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }

  function orderTotal(order) {
    const lines = order && Array.isArray(order.lines) ? order.lines : [];
    const cents = lines.reduce((sum, line) => {
      const quantity = Number(line.quantity);
      const cost = Number(line.unitCost);
      if (!Number.isFinite(quantity) || !Number.isFinite(cost)) return sum;
      return sum + quantity * Math.round(cost * 100);
    }, 0);
    return cents / 100;
  }

  function lowStock(state) {
    const inventory = state && Array.isArray(state.inventory) ? state.inventory : [];
    return inventory.filter((item) => Number(item.onHand) <= Number(item.reorderAt));
  }

  function requireState(state) {
    if (!state || !Array.isArray(state.inventory) || !Array.isArray(state.orders)) {
      throw new TypeError("A valid owner demo state is required.");
    }
  }

  function findOrder(state, orderId) {
    requireState(state);
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error("Purchase order not found.");
    return order;
  }

  function addActivity(state, message) {
    if (!state || !Array.isArray(state.activity)) throw new TypeError("A valid activity list is required.");
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) throw new Error("Activity message is required.");
    const entry = { id: id("activity"), message: cleanMessage, createdAt: new Date().toISOString() };
    state.activity.unshift(entry);
    if (state.activity.length > 100) state.activity.length = 100;
    return entry;
  }

  function createOrder(state, input) {
    requireState(state);
    const vendor = String(input && input.vendor || "").trim();
    const requestedLines = input && Array.isArray(input.lines) ? input.lines : [];
    if (!vendor) throw new Error("Choose a vendor.");
    if (!requestedLines.length) throw new Error("Add at least one item to the purchase order.");

    const seen = new Set();
    const lines = requestedLines.map((requested) => {
      const itemId = String(requested && requested.itemId || "");
      const quantity = Number(requested && requested.quantity);
      if (!itemId) throw new Error("Each order line needs an inventory item.");
      if (seen.has(itemId)) throw new Error("Each inventory item may appear only once per order.");
      seen.add(itemId);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Order quantities must be positive whole numbers.");
      }
      const item = state.inventory.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("An order line references an unknown inventory item.");
      if (item.vendor !== vendor) throw new Error("Every item must belong to the selected demo vendor.");
      if (!Number.isFinite(Number(item.cost)) || Number(item.cost) < 0) {
        throw new Error("The inventory item has an invalid unit cost.");
      }
      return {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        quantity,
        unitCost: Math.round(Number(item.cost) * 100) / 100,
        received: 0
      };
    });

    const sequence = state.orders.reduce((highest, order) => {
      const match = String(order.number || "").match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
    const order = {
      id: id("order"),
      number: `PO-DEMO-${String(sequence).padStart(3, "0")}`,
      vendor,
      lines,
      notes: String(input && input.notes || "").trim(),
      status: "Draft",
      createdAt: new Date().toISOString(),
      sample: true
    };
    state.orders.push(order);
    addActivity(state, `Created demo purchase order ${order.number}.`);
    return order;
  }

  function submitOrder(state, orderId) {
    const order = findOrder(state, orderId);
    if (order.status !== "Draft") throw new Error("Only draft purchase orders can be submitted.");
    order.status = "Submitted (demo)";
    order.submittedAt = new Date().toISOString();
    addActivity(state, `Submitted ${order.number} in the demo. No vendor was contacted.`);
    return order;
  }

  function receiveOrder(state, orderId) {
    const order = findOrder(state, orderId);
    if (order.status !== "Submitted (demo)") {
      throw new Error("Only submitted demo purchase orders can be received.");
    }
    const seen = new Set();
    const receipt = order.lines.map((line) => {
      if (!isRecord(line)) throw new Error("The order contains an invalid line item.");
      if (seen.has(line.itemId)) throw new Error("The order contains the same inventory item more than once.");
      seen.add(line.itemId);
      const item = state.inventory.find((candidate) => candidate && candidate.id === line.itemId);
      if (!item) throw new Error("The order contains an inventory item that no longer exists.");
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("The order contains an invalid receipt quantity.");
      }
      if (!Number.isFinite(Number(item.onHand))) {
        throw new Error("The inventory item has an invalid on-hand count.");
      }
      if (Number(line.received) !== 0) {
        throw new Error("The order contains an item that was already marked received.");
      }
      if (!Number.isFinite(Number(item.onHand) + quantity)) {
        throw new Error("Receiving this order would create an invalid on-hand count.");
      }
      return { item, line, quantity };
    });
    receipt.forEach(({ item, line, quantity }) => {
      item.onHand = Number(item.onHand) + quantity;
      line.received = quantity;
    });
    order.status = "Received";
    order.receivedAt = new Date().toISOString();
    addActivity(state, `Received ${order.number}; sample inventory counts were updated.`);
    return order;
  }

  function cancelOrder(state, orderId) {
    const order = findOrder(state, orderId);
    if (order.status !== "Draft" && order.status !== "Submitted (demo)") {
      throw new Error("Only draft or submitted demo purchase orders can be cancelled.");
    }
    order.status = "Cancelled";
    order.cancelledAt = new Date().toISOString();
    addActivity(state, `Cancelled demo purchase order ${order.number}.`);
    return order;
  }

  return {
    createState,
    hashDemoPassword,
    verifyDemoLogin,
    isUsableState,
    money,
    orderTotal,
    lowStock,
    createOrder,
    submitOrder,
    receiveOrder,
    cancelOrder,
    addActivity,
    id
  };
});
