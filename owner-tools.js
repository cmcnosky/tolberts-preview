/* Scheduling and backup tools for the shared Tolbert's owner workspace. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OwnerTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const REQUIRED_ADAPTER_METHODS = [
    "getState", "replaceState", "persist", "status", "openEditor", "confirmation",
    "esc", "button", "field", "area", "select", "check", "heading", "panel",
    "empty", "dateLabel", "dayKey", "requireCurrentState", "render", "navigate"
  ];

  function create(adapter) {
    const missing = REQUIRED_ADAPTER_METHODS.filter((name) => typeof adapter?.[name] !== "function");
    if (missing.length) throw new Error(`OwnerTools adapter is missing: ${missing.join(", ")}.`);

    let memberFilter = "all";
    let importSequence = 0;

    function model() {
      const value = root && root.OwnerModel;
      if (!value) throw new Error("The owner demo model is unavailable.");
      return value;
    }

    function requireModelMethods(names) {
      const value = model();
      const missingMethods = names.filter((name) => typeof value[name] !== "function");
      if (missingMethods.length) throw new Error(`The owner demo needs an update before this tool can run: ${missingMethods.join(", ")}.`);
      return value;
    }

    function shiftsFor(state) {
      return Array.isArray(state?.shifts) ? state.shifts : [];
    }

    function teamFor(state) {
      return Array.isArray(state?.team) ? state.team : [];
    }

    function sortedShifts(state) {
      return [...shiftsFor(state)].sort((left, right) =>
        String(left.date).localeCompare(String(right.date)) ||
        String(left.start).localeCompare(String(right.start)) ||
        String(left.end).localeCompare(String(right.end)) ||
        String(left.memberId).localeCompare(String(right.memberId))
      );
    }

    function memberName(state, memberId) {
      return teamFor(state).find((member) => member.id === memberId)?.name || "Former team member";
    }

    function hoursLabel(value) {
      const hours = Number(value);
      if (!Number.isFinite(hours)) return "—";
      const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
      return `${text} ${hours === 1 ? "hour" : "hours"}`;
    }

    function csvCell(value) {
      let text = String(value ?? "");
      if (/^[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    }

    function downloadText(filename, text, type) {
      if (!root?.document || !root.URL || typeof root.Blob !== "function") {
        throw new Error("Downloads are unavailable in this browser.");
      }
      const url = root.URL.createObjectURL(new root.Blob([text], {type}));
      try {
        const anchor = root.document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        root.document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
      }
    }

    function renderSchedule() {
      const state = adapter.getState();
      const M = requireModelMethods(["upsertShift", "removeShift", "shiftHours"]);
      const team = teamFor(state);
      if (memberFilter !== "all" && !team.some((member) => member.id === memberFilter)) memberFilter = "all";
      const allShifts = sortedShifts(state);
      const visible = memberFilter === "all"
        ? allShifts
        : allShifts.filter((shift) => shift.memberId === memberFilter);
      const totalHours = visible.reduce((sum, shift) => sum + M.shiftHours(shift), 0);
      const memberOptions = [
        ["all", "All team members"],
        ...team.map((member) => [member.id, `${member.name}${member.status === "Inactive" ? " (Inactive)" : ""}`])
      ];
      const rows = visible.map((shift) => {
        const name = memberName(state, shift.memberId);
        const details = [
          `${adapter.esc(adapter.dateLabel(shift.date))} · ${adapter.esc(shift.start)}–${adapter.esc(shift.end)}`,
          adapter.esc(shift.role),
          shift.notes ? adapter.esc(shift.notes) : ""
        ].filter(Boolean).join("<br>");
        const actions = adapter.button("Edit", "schedule-edit", shift.id, "secondary", `Edit ${name}'s shift`) +
          adapter.button("Remove", "schedule-remove", shift.id, "quiet", `Remove ${name}'s shift`);
        return `<article class="list-row schedule-row"><div class="row-main"><h3>${adapter.esc(name)}</h3><p>${details}</p><span class="status-pill neutral">${adapter.esc(hoursLabel(M.shiftHours(shift)))}</span></div><div class="row-actions">${actions}</div></article>`;
      }).join("");

      const heading = adapter.heading(
        "Staff schedule.",
        "Create and revise shifts, check conflicts, and export the schedule.",
        adapter.button("Add a shift", "schedule-new", "", "")
      );
      const toolbar = `<div class="toolbar schedule-toolbar"><div>${adapter.select("schedule-member-filter", "Team member", memberOptions, memberFilter)}</div><div class="schedule-total"><span>${visible.length} ${visible.length === 1 ? "shift" : "shifts"}</span><strong>${adapter.esc(hoursLabel(totalHours))}</strong>${adapter.button("Export schedule CSV", "schedule-export", "", "secondary")}</div></div>`;
      const body = visible.length
        ? `<div class="row-list schedule-list">${rows}</div>`
        : adapter.empty(
            allShifts.length ? "No shifts for this person." : "No shifts scheduled.",
            team.length ? "Add a shift to build the shared sample schedule." : "Add a team member before creating a shift."
          );
      const disclosure = `<p class="notice owner-tools-disclosure"><strong>Shared sample schedule.</strong> Times are Central; an earlier end time means the following day. Hours are planned clock hours. Staff notifications, time clocks, and payroll require connected services.</p>`;
      return `<div class="owner-tools schedule-tools">${heading}${disclosure}${toolbar}${adapter.panel("Scheduled shifts.", body)}</div>`;
    }

    function editShift(id) {
      const expected = adapter.getState();
      const M = requireModelMethods(["upsertShift"]);
      const existing = shiftsFor(expected).find((shift) => shift.id === id);
      if (id && !existing) throw new Error("That shift is no longer available.");
      const team = teamFor(expected);
      if (!team.length) {
        adapter.status("Add a team member before creating a shift.");
        adapter.navigate("team");
        return;
      }
      const memberOptions = team.map((member) => [
        member.id,
        `${member.name}${member.status === "Inactive" ? " (Inactive)" : ""}`
      ]);
      const defaultMember = existing?.memberId || team.find((member) => member.status === "Active")?.id || team[0].id;
      const fields = `<div class="field-grid">${
        adapter.select("memberId", "Team member", memberOptions, defaultMember)
      }${adapter.field("date", "Shift date", existing?.date || adapter.dayKey(), "date", "required")}${
        adapter.field("start", "Starts", existing?.start || "11:00", "time", "required")
      }${adapter.field("end", "Ends", existing?.end || "17:00", "time", "required")}${
        adapter.field("role", "Shift role", existing?.role || team.find((member) => member.id === defaultMember)?.role || "Floor", "text", 'required maxlength="100"')
      }${adapter.area("notes", "Notes", existing?.notes || "", 'maxlength="1000" placeholder="Optional handoff or station note"')}</div><p class="field full muted">Overnight shifts are supported. A team member cannot have overlapping shifts; back-to-back shifts are allowed.</p>`;

      adapter.openEditor(existing ? "Edit shift" : "Add a shift", fields, async (data) => {
        adapter.requireCurrentState(expected);
        const current = adapter.getState();
        const input = {
          memberId: String(data.memberId || ""),
          date: String(data.date || ""),
          start: String(data.start || ""),
          end: String(data.end || ""),
          role: String(data.role || "").trim(),
          notes: String(data.notes || "").trim()
        };
        if (existing) input.id = existing.id;
        M.upsertShift(current, input);
        if (await adapter.persist(`${existing ? "Updated" : "Added"} sample shift for ${memberName(current, input.memberId)}`)) {
          adapter.status(`${existing ? "Updated" : "Added"} shift for ${memberName(adapter.getState(), input.memberId)} · saved to the shared workspace.`);
        }
      }, existing ? "Save shift" : "Add shift");
    }

    function removeShift(id) {
      const expected = adapter.getState();
      const shift = shiftsFor(expected).find((entry) => entry.id === id);
      if (!shift) throw new Error("That shift is no longer available.");
      const M = requireModelMethods(["removeShift"]);
      const name = memberName(expected, shift.memberId);
      adapter.confirmation(
        "Remove this shift?",
        `<p><strong>${adapter.esc(name)}</strong><br>${adapter.esc(adapter.dateLabel(shift.date))} · ${adapter.esc(shift.start)}–${adapter.esc(shift.end)}</p><p>This removes the sample schedule entry. It does not notify anyone.</p>`,
        async () => {
          adapter.requireCurrentState(expected);
          M.removeShift(adapter.getState(), shift.id);
          if (await adapter.persist(`Removed sample shift for ${name}`)) adapter.status(`Removed shift for ${name} · saved to the shared workspace.`);
        },
        "Remove shift"
      );
    }

    function exportSchedule() {
      const state = adapter.getState();
      const shifts = sortedShifts(state);
      if (!shifts.length) {
        adapter.status("There are no shifts to export.");
        return;
      }
      const M = requireModelMethods(["shiftHours"]);
      const rows = [
        ["Date", "Starts", "Ends", "Hours", "Team member", "Role", "Notes"],
        ...shifts.map((shift) => [
          shift.date,
          shift.start,
          shift.end,
          M.shiftHours(shift),
          memberName(state, shift.memberId),
          shift.role,
          shift.notes
        ])
      ];
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      downloadText(`tolberts-demo-schedule-${adapter.dayKey()}.csv`, csv, "text/csv;charset=utf-8");
      adapter.status(`Downloaded ${shifts.length} sample ${shifts.length === 1 ? "shift" : "shifts"} as CSV. No staff member was notified.`);
    }

    function stateSummary(state) {
      return [
        ["Menu items", Array.isArray(state?.menu) ? state.menu.length : 0],
        ["Shows", Array.isArray(state?.events) ? state.events.length : 0],
        ["Special dates", Array.isArray(state?.exceptions) ? state.exceptions.length : 0],
        ["Inventory items", Array.isArray(state?.inventory) ? state.inventory.length : 0],
        ["Sample orders", Array.isArray(state?.orders) ? state.orders.length : 0],
        ["Team members", teamFor(state).length],
        ["Scheduled shifts", shiftsFor(state).length]
      ];
    }

    function summaryGrid(state) {
      return `<dl class="backup-summary">${stateSummary(state).map(([label, count]) => `<div><dt>${adapter.esc(label)}</dt><dd>${count}</dd></div>`).join("")}</dl>`;
    }

    function renderBackups() {
      const state = adapter.getState();
      requireModelMethods(["createBackup", "parseBackup"]);
      const heading = adapter.heading(
        "Backup and restore.",
        "Download a private recovery copy or review a backup before replacing the shared workspace.",
        adapter.button("Download backup", "backup-export", "", "")
      );
      const current = adapter.panel(
        "What this copy contains.",
        `${summaryGrid(state)}<p class="muted">The JSON file contains this preview workspace: menu edits, shows, hours, special dates, sample inventory and orders, team entries, activity, settings, and schedules. It does not contain the owner password or session token.</p>`,
        adapter.button("Choose backup file", "backup-import", "", "secondary")
      );
      const boundary = adapter.panel(
        "What remains outside this demo.",
        `<ul class="backup-boundaries"><li>Tolbert’s official domain, CMS, analytics, and live publishing</li><li>SpotOn orders and customer transactions</li><li>Supplier, POS, payment, and real inventory systems</li><li>Staff invitations and role-enforced accounts</li><li>Time clocks, payroll, messaging, and notifications</li></ul><p class="muted">A backup restores only this preview workspace’s data. It does not connect or update any system listed above.</p>`
      );
      const importControl = `<input id="owner-backup-file" class="owner-tools-file" type="file" accept="application/json,.json" hidden><p class="notice owner-tools-disclosure"><strong>Shared preview workspace.</strong> Successful saves sync across devices. Downloaded backups stay on the device where you save them; treat those files as private if they contain business-style notes.</p>`;
      return `<div class="owner-tools backup-tools">${heading}${importControl}<div class="split">${current}${boundary}</div></div>`;
    }

    function backupText(state) {
      const M = requireModelMethods(["createBackup"]);
      return JSON.stringify(M.createBackup(state), null, 2) + "\n";
    }

    function exportBackup(state = adapter.getState(), prefix = "tolberts-owner-demo-backup") {
      downloadText(`${prefix}-${adapter.dayKey()}.json`, backupText(state), "application/json;charset=utf-8");
    }

    function formatExportedAt(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Unknown export time";
      return new Intl.DateTimeFormat("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
        timeZone: "America/Chicago", timeZoneName: "short"
      }).format(date);
    }

    function readFile(file) {
      if (!file) return Promise.reject(new Error("Choose a JSON backup file."));
      if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error("Choose a backup file smaller than 20 MB."));
      if (!root || typeof root.FileReader !== "function") return Promise.reject(new Error("File import is unavailable in this browser."));
      return new Promise((resolve, reject) => {
        const reader = new root.FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("The backup file could not be read."));
        reader.readAsText(file);
      });
    }

    async function reviewBackupFile(file) {
      const request = ++importSequence;
      const expected = adapter.getState();
      try {
        const text = await readFile(file);
        if (request !== importSequence) return;
        adapter.requireCurrentState(expected);
        const M = requireModelMethods(["createBackup", "parseBackup"]);
        const next = M.parseBackup(text);
        const envelope = JSON.parse(text);
        const exported = formatExportedAt(envelope.exportedAt);
        const confirmField = adapter.field("confirm", "Type RESTORE to replace the shared preview workspace", "", "text", 'required autocomplete="off"');
        adapter.confirmation(
          "Review backup before restore",
          `<p><strong>Exported ${adapter.esc(exported)}</strong></p>${summaryGrid(next)}<p class="notice">Restoring replaces the shared preview workspace for every device. Before replacement, the current workspace will download as a separate recovery backup. Your password will not change.</p>${confirmField}`,
          async (data) => {
            if (String(data.confirm || "") !== "RESTORE") throw new Error("Type RESTORE to confirm the replacement.");
            adapter.requireCurrentState(expected);
            const current = adapter.getState();
            exportBackup(current, "tolberts-before-restore");
            adapter.replaceState(next);
            if (await adapter.persist("Restored a shared workspace backup")) {
              adapter.status("Backup restored to the shared workspace. A recovery copy of the previous workspace was downloaded first. The password was not changed.");
            }
          },
          "Download current copy and restore"
        );
      } catch (error) {
        adapter.status(error?.message || "That backup could not be reviewed.");
      }
    }

    function chooseBackupFile() {
      const input = root?.document?.getElementById("owner-backup-file");
      if (!input) throw new Error("Open Backup and restore, then try again.");
      input.value = "";
      input.click();
    }

    function handle(action, id = "") {
      const handlers = {
        "schedule-new": () => editShift(),
        "schedule-edit": () => editShift(id),
        "schedule-remove": () => removeShift(id),
        "schedule-export": exportSchedule,
        "backup-export": () => {
          exportBackup();
          adapter.status("Workspace backup downloaded to this device. It does not contain the owner password.");
        },
        "backup-import": chooseBackupFile
      };
      if (!Object.prototype.hasOwnProperty.call(handlers, action)) return false;
      try {
        handlers[action]();
      } catch (error) {
        adapter.status(error?.message || "That action could not be completed.");
      }
      return true;
    }

    function afterRender(view) {
      if (view === "schedule") {
        const select = root?.document?.querySelector('[name="schedule-member-filter"]');
        if (select && !select.dataset.ownerToolsBound) {
          select.dataset.ownerToolsBound = "true";
          select.addEventListener("change", () => {
            memberFilter = select.value || "all";
            adapter.render();
          });
        }
      }
      if (view === "backups") {
        const input = root?.document?.getElementById("owner-backup-file");
        if (input && !input.dataset.ownerToolsBound) {
          input.dataset.ownerToolsBound = "true";
          input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            input.value = "";
            if (file) reviewBackupFile(file);
          });
        }
      }
    }

    return {renderSchedule, renderBackups, handle, afterRender};
  }

  return {create};
});
