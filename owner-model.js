/*
 * Tolbert's owner-workspace data model.
 *
 * This module deliberately has no network or storage access. It validates and
 * mutates the state object supplied by the browser UI; the authenticated UI is
 * responsible for revisioned persistence. "Submitted" purchase orders are
 * simulations and never reach a vendor, payment method, or restaurant system.
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
  // These match the bounds exposed by the demo's number inputs. Keeping the
  // model inside the same range prevents a corrupted saved value from turning
  // into Infinity and then serializing as null.
  const MAX_STOCK_VALUE = 100000;
  const MAX_UNIT_COST = 100000;
  const MAX_ORDER_QUANTITY = 10000;
  const MAX_SHIFTS = 1000;
  const MAX_CONTENT_FIELDS = 100;
  const MAX_CONTENT_VALUE_LENGTH = 5000;
  const MAX_CONTENT_TOTAL_LENGTH = 100000;
  const MAX_IMAGE_FIELDS = 30;
  const MAX_IMAGE_TOTAL_LENGTH = 2500000;
  const SAFE_FIELD_KEY = /^[a-z][a-z0-9._-]{0,119}$/i;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isPlainRecord(value) {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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

  function isNumberInRange(value, maximum) {
    return isNonNegativeNumber(value) && value <= maximum;
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

  function is24HourClock(value) {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function isIsoTimestamp(value) {
    if (typeof value !== "string") return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }

  function isStoredImage(value) {
    if (typeof value !== "string") return false;
    if (/^assets\/[a-zA-Z0-9._-]+$/.test(value)) return true;
    if (/^shared:[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(value)) return true;
    return value.length <= 850000 && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(value);
  }

  function isBoundedStringMap(value, maximumFields, maximumValueLength, maximumTotalLength, valueValidator = null) {
    if (!isPlainRecord(value)) return false;
    const entries = Object.entries(value);
    if (entries.length > maximumFields) return false;
    let totalLength = 0;
    return entries.every(([key, entry]) => {
      if (!SAFE_FIELD_KEY.test(key) || typeof entry !== "string" || entry.length > maximumValueLength) return false;
      totalLength += entry.length;
      return totalLength <= maximumTotalLength && (!valueValidator || valueValidator(entry));
    });
  }

  function clockMinutes(value) {
    if (!is24HourClock(value)) return null;
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }

  function shiftInterval(shift) {
    if (!isRecord(shift) || !isCivilDate(shift.date)) return null;
    const startMinutes = clockMinutes(shift.start);
    const endMinutes = clockMinutes(shift.end);
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return null;
    const day = Date.parse(`${shift.date}T00:00:00Z`) / 60000;
    const start = day + startMinutes;
    const end = day + endMinutes + (endMinutes < startMinutes ? 1440 : 0);
    return { start, end };
  }

  function shiftsAreValid(shifts, team) {
    if (!Array.isArray(shifts) || shifts.length > MAX_SHIFTS || !hasUniqueSafeIds(shifts)) return false;
    const memberIds = new Set(team.map((member) => member && member.id));
    const intervals = [];
    for (const shift of shifts) {
      if (!hasStrings(shift, ["id", "memberId", "date", "start", "end", "role", "notes"]) ||
          !SAFE_ID.test(shift.memberId) || !memberIds.has(shift.memberId) ||
          !shift.role.trim() || shift.role.length > 100 || shift.notes.length > 1000) return false;
      const interval = shiftInterval(shift);
      if (!interval) return false;
      intervals.push({ ...interval, id: shift.id, memberId: shift.memberId });
    }
    for (let left = 0; left < intervals.length; left += 1) {
      for (let right = left + 1; right < intervals.length; right += 1) {
        const first = intervals[left];
        const second = intervals[right];
        if (first.memberId === second.memberId && first.start < second.end && second.start < first.end) return false;
      }
    }
    return true;
  }

  function owns(value, field) {
    return Object.prototype.hasOwnProperty.call(value, field);
  }

  function hasValidOrderLifecycle(order) {
    const hasSubmittedAt = owns(order, "submittedAt");
    const hasReceivedAt = owns(order, "receivedAt");
    const hasCancelledAt = owns(order, "cancelledAt");
    if ((hasSubmittedAt && !isIsoTimestamp(order.submittedAt)) ||
        (hasReceivedAt && !isIsoTimestamp(order.receivedAt)) ||
        (hasCancelledAt && !isIsoTimestamp(order.cancelledAt))) return false;

    const createdAt = Date.parse(order.createdAt);
    const submittedAt = hasSubmittedAt ? Date.parse(order.submittedAt) : null;
    const receivedAt = hasReceivedAt ? Date.parse(order.receivedAt) : null;
    const cancelledAt = hasCancelledAt ? Date.parse(order.cancelledAt) : null;
    if (hasSubmittedAt && submittedAt < createdAt) return false;

    if (order.status === "Draft") return !hasSubmittedAt && !hasReceivedAt && !hasCancelledAt;
    if (order.status === "Submitted (demo)") return hasSubmittedAt && !hasReceivedAt && !hasCancelledAt;
    if (order.status === "Received") {
      return hasSubmittedAt && hasReceivedAt && !hasCancelledAt && receivedAt >= submittedAt;
    }
    if (order.status === "Cancelled") {
      return hasCancelledAt && !hasReceivedAt && cancelledAt >= createdAt &&
        (!hasSubmittedAt || cancelledAt >= submittedAt);
    }
    return false;
  }

  function isUsableState(value) {
    if (!isRecord(value) || value.version !== 1) return false;
    const arrayFields = ["menu", "events", "hours", "exceptions", "inventory", "orders", "team", "activity"];
    if (!arrayFields.every((field) => Array.isArray(value[field]))) return false;
    if (!hasStrings(value.settings, ["phone", "address", "announcement"]) ||
        !value.settings.phone.trim() || !value.settings.address.trim()) return false;
    if (owns(value.settings, "content") && !isBoundedStringMap(
      value.settings.content, MAX_CONTENT_FIELDS, MAX_CONTENT_VALUE_LENGTH, MAX_CONTENT_TOTAL_LENGTH
    )) return false;
    if (owns(value.settings, "images") && !isBoundedStringMap(
      value.settings.images, MAX_IMAGE_FIELDS, 850000, MAX_IMAGE_TOTAL_LENGTH, isStoredImage
    )) return false;
    const shifts = owns(value, "shifts") ? value.shifts : [];
    if (!Array.isArray(shifts)) return false;
    const idCollections = ["menu", "events", "exceptions", "inventory", "orders", "team", "activity"];
    if (!idCollections.every((field) => hasUniqueSafeIds(value[field]))) return false;

    const menuValid = value.menu.every((item) =>
      hasStrings(item, ["id", "category", "name", "description", "price"]) &&
      item.category.trim() && item.name.trim() && typeof item.available === "boolean" &&
      (!owns(item, "image") || (typeof item.image === "string" && (!item.image || isStoredImage(item.image)))) &&
      (!owns(item, "imageAlt") || (typeof item.imageAlt === "string" && item.imageAlt.length <= 240))
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
      [item.onHand, item.par, item.reorderAt].every((value) => isNumberInRange(value, MAX_STOCK_VALUE)) &&
      isNumberInRange(item.cost, MAX_UNIT_COST) &&
      (!owns(item, "archived") || typeof item.archived === "boolean") &&
      item.par >= item.reorderAt
    );
    const ordersValid = value.orders.every((order) =>
      hasStrings(order, ["id", "number", "vendor", "notes", "status", "createdAt"]) &&
      /^PO-DEMO-\d+$/.test(order.number) && order.vendor.trim() && order.notes.length <= 1000 && ORDER_STATUSES.has(order.status) &&
      isIsoTimestamp(order.createdAt) && order.sample === true && hasValidOrderLifecycle(order) &&
      Array.isArray(order.lines) && order.lines.length > 0 &&
      new Set(order.lines.map((line) => line && line.itemId)).size === order.lines.length &&
      order.lines.every((line) =>
        hasNonBlankStrings(line, ["itemId", "name", "unit"]) && SAFE_ID.test(line.itemId) &&
        value.inventory.some((item) => item && item.id === line.itemId && item.vendor === order.vendor) &&
        Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= MAX_ORDER_QUANTITY &&
        isNumberInRange(line.unitCost, MAX_UNIT_COST) && Number.isInteger(line.received) &&
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
    const shiftsValid = shiftsAreValid(shifts, value.team);
    return menuValid && eventsValid && hoursValid && exceptionsValid && inventoryValid && ordersValid && teamValid && activityValid && shiftsValid;
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
      shifts: [],
      activity: [],
      settings: {
        phone: "(817) 421-4888",
        address: "423 South Main Street, Grapevine, Texas 76051",
        announcement: "",
        content: {},
        images: {}
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
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ORDER_QUANTITY ||
          !Number.isFinite(cost) || cost < 0 || cost > MAX_UNIT_COST) {
        throw new Error("The order contains an invalid line total.");
      }
      const lineCents = quantity * Math.round(cost * 100);
      if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(sum + lineCents)) {
        throw new Error("The order total is outside the supported demo range.");
      }
      return sum + lineCents;
    }, 0);
    return cents / 100;
  }

  function lowStock(state) {
    const inventory = state && Array.isArray(state.inventory) ? state.inventory : [];
    return inventory.filter((item) => item && item.archived !== true && Number(item.onHand) <= Number(item.reorderAt));
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

  function shiftHours(shift) {
    const interval = shiftInterval(shift);
    if (!interval) throw new Error("A shift needs a real date and different start and end times in HH:MM format.");
    return (interval.end - interval.start) / 60;
  }

  function upsertShift(state, input) {
    if (!isUsableState(state)) throw new TypeError("A valid owner demo state is required.");
    const memberId = String(input && input.memberId || "").trim();
    const member = state.team.find((candidate) => candidate && candidate.id === memberId);
    if (!member) throw new Error("Choose a current demo teammate for this shift.");
    const requestedId = String(input && input.id || "").trim();
    const shifts = Array.isArray(state.shifts) ? state.shifts : [];
    const existingIndex = requestedId ? shifts.findIndex((shift) => shift.id === requestedId) : -1;
    if (requestedId && existingIndex < 0) throw new Error("Shift not found.");
    const shift = {
      id: requestedId || id("shift"),
      memberId,
      date: String(input && input.date || "").trim(),
      start: String(input && input.start || "").trim(),
      end: String(input && input.end || "").trim(),
      role: String(input && input.role !== undefined ? input.role : member.role).trim(),
      notes: String(input && input.notes || "").trim()
    };
    const candidateShifts = shifts.map((entry) => clone(entry));
    if (existingIndex >= 0) candidateShifts[existingIndex] = shift;
    else candidateShifts.push(shift);
    if (!shiftsAreValid(candidateShifts, state.team)) {
      throw new Error("Check the teammate, date, times, role, and overlapping shifts.");
    }
    if (!Array.isArray(state.shifts)) state.shifts = [];
    if (existingIndex >= 0) state.shifts[existingIndex] = shift;
    else state.shifts.push(shift);
    addActivity(state, `${existingIndex >= 0 ? "Updated" : "Added"} shift for ${member.name} on ${shift.date}.`);
    return state.shifts[existingIndex >= 0 ? existingIndex : state.shifts.length - 1];
  }

  function removeShift(state, shiftId) {
    if (!isUsableState(state)) throw new TypeError("A valid owner demo state is required.");
    const shifts = Array.isArray(state.shifts) ? state.shifts : [];
    const index = shifts.findIndex((shift) => shift.id === shiftId);
    if (index < 0) throw new Error("Shift not found.");
    const [removed] = shifts.splice(index, 1);
    const member = state.team.find((candidate) => candidate.id === removed.memberId);
    addActivity(state, `Removed shift for ${member ? member.name : "demo teammate"} on ${removed.date}.`);
    return clone(removed);
  }

  function createBackup(state) {
    if (!isUsableState(state)) throw new TypeError("Only valid owner demo data can be backed up.");
    return {
      format: "tolberts-workspace",
      version: 1,
      exportedAt: new Date().toISOString(),
      state: clone(state)
    };
  }

  function parseBackup(text) {
    if (typeof text !== "string" || !text.trim() || text.length > 12000000) {
      throw new Error("Choose a valid Tolbert's workspace backup file.");
    }
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new Error("The backup file is not valid JSON.");
    }
    if (!isPlainRecord(envelope) || envelope.format !== "tolberts-workspace" || envelope.version !== 1 ||
        !isIsoTimestamp(envelope.exportedAt) || !isUsableState(envelope.state)) {
      throw new Error("This is not a valid Tolbert's workspace backup.");
    }
    return clone(envelope.state);
  }

  function normalizeDraftOrderInput(state, input, allowedArchivedItemIds) {
    const vendor = String(input && input.vendor || "").trim();
    const requestedLines = input && Array.isArray(input.lines) ? input.lines : [];
    const notes = String(input && input.notes || "").trim();
    if (!vendor) throw new Error("Choose a vendor.");
    if (!requestedLines.length) throw new Error("Add at least one item to the purchase order.");
    if (notes.length > 1000) throw new Error("Order notes must be 1,000 characters or fewer.");

    const seen = new Set();
    const lines = requestedLines.map((requested) => {
      const itemId = String(requested && requested.itemId || "");
      const quantity = Number(requested && requested.quantity);
      if (!itemId) throw new Error("Each order line needs an inventory item.");
      if (seen.has(itemId)) throw new Error("Each inventory item may appear only once per order.");
      seen.add(itemId);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ORDER_QUANTITY) {
        throw new Error(`Order quantities must be whole numbers from 1 to ${MAX_ORDER_QUANTITY}.`);
      }
      const item = state.inventory.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("An order line references an unknown inventory item.");
      if (item.archived === true && !(allowedArchivedItemIds instanceof Set && allowedArchivedItemIds.has(item.id))) {
        throw new Error("Archived stock cannot be added to a new or edited draft order.");
      }
      if (item.vendor !== vendor) throw new Error("Every item must belong to the selected demo vendor.");
      if (!Number.isFinite(Number(item.cost)) || Number(item.cost) < 0 || Number(item.cost) > MAX_UNIT_COST) {
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
    return { vendor, lines, notes };
  }

  function createOrder(state, input) {
    requireState(state);
    const { vendor, lines, notes } = normalizeDraftOrderInput(state, input);

    const sequence = state.orders.reduce((highest, order) => {
      const match = String(order.number || "").match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
    const order = {
      id: id("order"),
      number: `PO-DEMO-${String(sequence).padStart(3, "0")}`,
      vendor,
      lines,
      notes,
      status: "Draft",
      createdAt: new Date().toISOString(),
      sample: true
    };
    state.orders.push(order);
    addActivity(state, `Created demo purchase order ${order.number}.`);
    return order;
  }

  function updateDraftOrder(state, orderId, input) {
    const order = findOrder(state, orderId);
    if (order.status !== "Draft") throw new Error("Only draft purchase orders can be edited.");
    const existingItemIds = new Set(order.lines.map((line) => line.itemId));
    const normalized = normalizeDraftOrderInput(state, input, existingItemIds);
    const candidateState = clone(state);
    const candidateOrder = candidateState.orders.find((entry) => entry.id === order.id);
    Object.assign(candidateOrder, normalized);
    if (!isUsableState(candidateState)) throw new Error("The draft order update is not valid.");
    Object.assign(order, normalized);
    addActivity(state, `Updated demo purchase order ${order.number}.`);
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
      if (item.vendor !== order.vendor) throw new Error("The order contains an item from a different demo vendor.");
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ORDER_QUANTITY) {
        throw new Error("The order contains an invalid receipt quantity.");
      }
      if (!Number.isFinite(Number(item.onHand)) || Number(item.onHand) < 0 || Number(item.onHand) > MAX_STOCK_VALUE) {
        throw new Error("The inventory item has an invalid on-hand count.");
      }
      if (Number(line.received) !== 0) {
        throw new Error("The order contains an item that was already marked received.");
      }
      if (!Number.isFinite(Number(item.onHand) + quantity) || Number(item.onHand) + quantity > MAX_STOCK_VALUE) {
        throw new Error("Receiving this order would exceed the supported demo stock limit.");
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
    isUsableState,
    money,
    orderTotal,
    lowStock,
    shiftHours,
    upsertShift,
    removeShift,
    createBackup,
    parseBackup,
    createOrder,
    updateDraftOrder,
    submitOrder,
    receiveOrder,
    cancelOrder,
    addActivity,
    id
  };
});
