/* ===== Command Center — application logic ===== */
(function () {
  "use strict";

  const STORE_KEY = "cmdcenter.v1";
  const DAY = 86400000;

  const CLIENT_STATUS = [
    { key: "lead",   label: "Lead",   pill: "blue" },
    { key: "active", label: "Active", pill: "green" },
    { key: "paused", label: "Paused", pill: "amber" },
    { key: "churned",label: "Churned",pill: "gray" }
  ];
  const PROJECT_STATUS = [
    { key: "planning", label: "Planning", pill: "blue" },
    { key: "active",   label: "Active",   pill: "teal" },
    { key: "blocked",  label: "Blocked",  pill: "red" },
    { key: "done",     label: "Done",     pill: "green" }
  ];
  const TASK_STAGES = [
    { key: "todo",  label: "To Do" },
    { key: "doing", label: "In Progress" },
    { key: "done",  label: "Done" }
  ];
  const PRIORITIES = [
    { key: "high", label: "High" },
    { key: "med",  label: "Medium" },
    { key: "low",  label: "Low" }
  ];
  const INVOICE_STATUS = [
    { key: "draft",   label: "Draft",   pill: "gray" },
    { key: "sent",    label: "Sent",    pill: "blue" },
    { key: "paid",    label: "Paid",    pill: "green" },
    { key: "overdue", label: "Overdue", pill: "red" }
  ];

  // ---------- State ----------
  let state = load();
  let currentView = "overview";
  let searchTerm = "";

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall through to seed */ }
    return clone(window.SEED);
  }
  function normalize(s) {
    s = s || {};
    ["clients", "projects", "tasks", "invoices", "goals"].forEach((k) => {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    return s;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save — storage unavailable"); }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- Helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtMoney(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + n.toLocaleString();
  }
  function fmtMoneyFull(n) { return "$" + (Number(n) || 0).toLocaleString(); }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + "T23:59:59");
    return Math.ceil((target - new Date()) / DAY);
  }
  function fmtDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US",
      { month: "short", day: "numeric", year: "numeric" });
  }
  function dueClass(days) {
    if (days == null) return "ok";
    if (days <= 2) return "urgent";
    if (days <= 7) return "soon";
    return "ok";
  }
  function dueLabel(days) {
    if (days == null) return "No date";
    if (days < 0) return Math.abs(days) + "d overdue";
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return "Due in " + days + "d";
  }
  const uid = () => "x" + Math.random().toString(36).slice(2, 9);
  const initials = (name) => String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

  // Lookups
  const clientById  = (id) => state.clients.find((c) => c.id === id);
  const projectById = (id) => state.projects.find((p) => p.id === id);
  const clientName  = (id) => { const c = clientById(id); return c ? (c.company || c.name) : "—"; };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function pill(key, defs) {
    const d = defs.find((x) => x.key === key);
    return d ? `<span class="status-pill ${d.pill}">${d.label}</span>` : `<span class="status-pill gray">${esc(key)}</span>`;
  }
  const labelOf = (key, defs) => (defs.find((x) => x.key === key) || {}).label || key;

  // ---------- Router ----------
  const VIEWS = {
    overview: { title: "Overview",  render: renderOverview },
    clients:  { title: "Clients",   render: renderClients },
    projects: { title: "Projects",  render: renderProjects },
    tasks:    { title: "Tasks",     render: renderTasks },
    finances: { title: "Finances",  render: renderFinances },
    goals:    { title: "Goals",     render: renderGoals },
    playbook: { title: "Playbook",  render: renderPlaybook }
  };

  function render() {
    const v = VIEWS[currentView] || VIEWS.overview;
    $("#viewTitle").textContent = v.title;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
    const root = $("#viewRoot");
    root.innerHTML = "";
    v.render(root);
  }

  function matchesSearch(text) {
    if (!searchTerm) return true;
    return String(text || "").toLowerCase().includes(searchTerm.toLowerCase());
  }

  // ---------- Derived metrics ----------
  function metrics() {
    const activeClients = state.clients.filter((c) => c.status === "active");
    const mrr = activeClients.reduce((s, c) => s + (Number(c.mrr) || 0), 0);
    const openProjects = state.projects.filter((p) => p.status !== "done");
    const outstanding = state.invoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const overdueAmt = state.invoices
      .filter((i) => i.status === "overdue")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const openTasks = state.tasks.filter((t) => t.status !== "done");
    const overdueTasks = openTasks.filter((t) => t.due && daysUntil(t.due) < 0);
    const dueTodayTasks = openTasks.filter((t) => t.due && daysUntil(t.due) === 0);
    const paidThis = state.invoices.filter((i) => i.status === "paid")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { activeClients, mrr, openProjects, outstanding, overdueAmt, openTasks, overdueTasks, dueTodayTasks, paidThis };
  }

  // ---------- Overview ----------
  function renderOverview(root) {
    const m = metrics();

    const kpis = el("div", "kpi-grid");
    kpis.append(
      kpi("Recurring Revenue", fmtMoney(m.mrr), "teal", `${m.activeClients.length} active client${m.activeClients.length === 1 ? "" : "s"} · /mo`),
      kpi("Outstanding", fmtMoney(m.outstanding), m.overdueAmt > 0 ? "red" : "amber",
        m.overdueAmt > 0 ? `${fmtMoney(m.overdueAmt)} overdue` : "all current"),
      kpi("Open Projects", m.openProjects.length, "blue",
        `${state.projects.filter((p) => p.status === "blocked").length} blocked`),
      kpi("Tasks Due", m.overdueTasks.length + m.dueTodayTasks.length,
        (m.overdueTasks.length ? "red" : m.dueTodayTasks.length ? "amber" : "green"),
        `${m.overdueTasks.length} overdue · ${m.dueTodayTasks.length} today`)
    );
    root.appendChild(kpis);

    const cols = el("div", "two-col");

    // Needs attention
    const alerts = el("div", "panel");
    alerts.appendChild(el("div", "panel-head", "<h2>Needs Attention</h2>"));
    const abody = el("div", "panel-body");
    const items = buildAttention();
    if (!items.length) {
      abody.appendChild(el("div", "empty", "🎉 Nothing urgent. You're all caught up."));
    } else {
      items.slice(0, 8).forEach((it) => {
        const row = el("div", "", `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;">
            <span class="status-pill ${it.pill}">${esc(it.badge)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${esc(it.title)}</div>
              <div style="font-size:11.5px;color:var(--muted)">${esc(it.sub)}</div>
            </div>
          </div>`);
        row.firstElementChild.addEventListener("click", it.onClick);
        abody.appendChild(row);
      });
    }
    alerts.appendChild(abody);
    cols.appendChild(alerts);

    // Today / this-week tasks
    const focus = el("div", "panel");
    focus.appendChild(el("div", "panel-head", "<h2>Focus — next 7 days</h2>"));
    const fbody = el("div", "panel-body");
    const soon = state.tasks
      .filter((t) => t.status !== "done" && t.due)
      .map((t) => ({ t, d: daysUntil(t.due) }))
      .filter((x) => x.d != null && x.d <= 7)
      .sort((a, b) => a.d - b.d);
    if (!soon.length) {
      fbody.appendChild(el("div", "empty", "No tasks due in the next week."));
    } else {
      soon.forEach(({ t, d }) => {
        const p = PRIORITIES.find((x) => x.key === t.priority);
        const row = el("div", "", `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;">
            <span class="tag prio-${esc(t.priority)}">${esc(p ? p.label : t.priority)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${esc(t.title)}</div>
              <div style="font-size:11.5px;color:var(--muted)">${t.projectId ? esc(projectName(t.projectId)) + " · " : ""}${esc(clientForTask(t))}</div>
            </div>
            <span class="due ${dueClass(d)}" style="margin:0">${esc(dueLabel(d))}</span>
          </div>`);
        row.firstElementChild.addEventListener("click", () => openTaskForm(t.id));
        fbody.appendChild(row);
      });
    }
    focus.appendChild(fbody);
    cols.appendChild(focus);

    root.appendChild(cols);

    // Project progress snapshot
    const snap = el("div", "panel");
    snap.appendChild(el("div", "panel-head", "<h2>Active Project Progress</h2>"));
    const sbody = el("div", "panel-body");
    const activeProjects = state.projects.filter((p) => p.status !== "done")
      .sort((a, b) => (daysUntil(a.due) ?? 1e9) - (daysUntil(b.due) ?? 1e9));
    if (!activeProjects.length) {
      sbody.appendChild(el("div", "empty", "No active projects."));
    } else {
      activeProjects.slice(0, 6).forEach((p) => {
        const d = daysUntil(p.due);
        const barCls = p.status === "blocked" ? "amber" : p.progress >= 100 ? "green" : "";
        const row = el("div", "", `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin:12px 0 5px;cursor:pointer;">
            <strong>${esc(p.name)}</strong>
            <span style="color:var(--muted)">${esc(clientName(p.clientId))} · ${p.progress}%${p.due ? " · " + dueLabel(d) : ""}</span>
          </div>
          <div class="bar ${barCls}"><span style="width:${Math.min(100, p.progress)}%"></span></div>`);
        row.firstElementChild.addEventListener("click", () => openProjectForm(p.id));
        sbody.appendChild(row);
      });
    }
    snap.appendChild(sbody);
    root.appendChild(snap);
  }

  function buildAttention() {
    const out = [];
    // Overdue invoices
    state.invoices.filter((i) => i.status === "overdue").forEach((i) => {
      out.push({ sort: -1000, pill: "red", badge: "Overdue",
        title: `${i.number} — ${fmtMoneyFull(i.amount)}`,
        sub: `${clientName(i.clientId)} · due ${fmtDate(i.due)}`,
        onClick: () => openInvoiceForm(i.id) });
    });
    // Sent invoices due soon
    state.invoices.filter((i) => i.status === "sent" && i.due).forEach((i) => {
      const d = daysUntil(i.due);
      if (d != null && d <= 5) out.push({ sort: d, pill: d < 0 ? "red" : "amber", badge: d < 0 ? "Overdue" : d + "d",
        title: `${i.number} — ${fmtMoneyFull(i.amount)}`,
        sub: `${clientName(i.clientId)} · awaiting payment`,
        onClick: () => openInvoiceForm(i.id) });
    });
    // Blocked projects
    state.projects.filter((p) => p.status === "blocked").forEach((p) => {
      out.push({ sort: -500, pill: "red", badge: "Blocked",
        title: p.name, sub: `${clientName(p.clientId)} · ${esc(p.notes || "needs unblocking")}`,
        onClick: () => openProjectForm(p.id) });
    });
    // Projects due soon
    state.projects.filter((p) => p.status !== "done" && p.due).forEach((p) => {
      const d = daysUntil(p.due);
      if (d != null && d <= 5) out.push({ sort: d, pill: d < 0 ? "red" : "amber", badge: dueLabel(d),
        title: p.name, sub: `${clientName(p.clientId)} · project deadline`,
        onClick: () => openProjectForm(p.id) });
    });
    // Overdue tasks
    state.tasks.filter((t) => t.status !== "done" && t.due).forEach((t) => {
      const d = daysUntil(t.due);
      if (d != null && d < 0) out.push({ sort: d, pill: "red", badge: Math.abs(d) + "d late",
        title: t.title, sub: `Task · ${clientForTask(t)}`,
        onClick: () => openTaskForm(t.id) });
    });
    return out.sort((a, b) => a.sort - b.sort);
  }

  function kpi(label, value, cls, sub) {
    return el("div", "kpi " + cls,
      `<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>`);
  }
  const projectName = (id) => { const p = projectById(id); return p ? p.name : "—"; };
  const clientForTask = (t) => {
    const p = t.projectId ? projectById(t.projectId) : null;
    return p ? clientName(p.clientId) : "Internal";
  };

  // ---------- Clients ----------
  function renderClients(root) {
    const panel = el("div", "panel");
    const head = el("div", "panel-head");
    head.innerHTML = "<h2>Clients &amp; Leads</h2>";
    const add = el("button", "pill-btn", "＋ New client");
    add.addEventListener("click", () => openClientForm());
    head.appendChild(add);
    panel.appendChild(head);

    const body = el("div", "panel-body");
    const rows = state.clients
      .filter((c) => matchesSearch([c.name, c.company, c.email, c.status, c.notes].join(" ")))
      .slice().sort((a, b) => (Number(b.mrr) || 0) - (Number(a.mrr) || 0));

    if (!rows.length) {
      body.appendChild(el("div", "empty", searchTerm ? "No clients match your search." : "No clients yet — add your first."));
    } else {
      const table = el("table", "data");
      table.innerHTML = `<thead><tr>
        <th>Client</th><th>Status</th><th class="right">Monthly</th><th>Since</th><th>Open work</th>
      </tr></thead>`;
      const tb = el("tbody");
      rows.forEach((c) => {
        const openWork = state.projects.filter((p) => p.clientId === c.id && p.status !== "done").length;
        const tr = el("tr", "clickable");
        tr.innerHTML = `
          <td><div style="display:flex;align-items:center;gap:11px">
            <span class="avatar">${esc(initials(c.name))}</span>
            <div><strong>${esc(c.company || c.name)}</strong>
            <div style="font-size:11.5px;color:var(--muted)">${esc(c.name)}${c.email ? " · " + esc(c.email) : ""}</div></div>
          </div></td>
          <td>${pill(c.status, CLIENT_STATUS)}</td>
          <td class="right num">${c.mrr ? fmtMoneyFull(c.mrr) : "—"}</td>
          <td>${fmtDate(c.since)}</td>
          <td>${openWork ? openWork + " project" + (openWork === 1 ? "" : "s") : "—"}</td>`;
        tr.addEventListener("click", () => openClientForm(c.id));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      body.appendChild(table);
    }
    panel.appendChild(body);
    root.appendChild(panel);
  }

  // ---------- Projects ----------
  function renderProjects(root) {
    const actions = el("div", "panel-head");
    actions.style.background = "transparent";
    actions.style.border = "0";
    actions.style.padding = "0 0 16px";
    actions.innerHTML = "<h2 style='font-size:15px;margin:0'>All Projects</h2>";
    const add = el("button", "pill-btn", "＋ New project");
    add.addEventListener("click", () => openProjectForm());
    actions.appendChild(add);
    root.appendChild(actions);

    const rows = state.projects
      .filter((p) => matchesSearch([p.name, clientName(p.clientId), p.status, p.notes].join(" ")))
      .slice().sort((a, b) => {
        const rank = { blocked: 0, active: 1, planning: 2, done: 3 };
        return (rank[a.status] - rank[b.status]) || ((daysUntil(a.due) ?? 1e9) - (daysUntil(b.due) ?? 1e9));
      });

    if (!rows.length) {
      root.appendChild(el("div", "empty", searchTerm ? "No projects match your search." : "No projects yet — add your first."));
      return;
    }
    const grid = el("div", "proj-grid");
    rows.forEach((p) => {
      const d = daysUntil(p.due);
      const barCls = p.status === "done" ? "green" : p.status === "blocked" ? "amber" : "";
      const card = el("div", "proj-card");
      card.innerHTML = `
        <div class="proj-top">
          <h3>${esc(p.name)}</h3>
          ${pill(p.status, PROJECT_STATUS)}
        </div>
        <div class="proj-client">${esc(clientName(p.clientId))}${p.budget ? " · " + fmtMoney(p.budget) + " budget" : ""}</div>
        <div class="proj-progress-row"><span>Progress</span><span>${p.progress}%</span></div>
        <div class="bar ${barCls}"><span style="width:${Math.min(100, p.progress)}%"></span></div>
        <div class="proj-foot">
          <span>${p.due ? "Due " + fmtDate(p.due) : "No deadline"}</span>
          ${p.due && p.status !== "done" ? `<span class="due ${dueClass(d)}" style="margin:0">${esc(dueLabel(d))}</span>` : ""}
        </div>`;
      card.addEventListener("click", () => openProjectForm(p.id));
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ---------- Tasks (Kanban) ----------
  function renderTasks(root) {
    const actions = el("div", "panel-head");
    actions.style.background = "transparent";
    actions.style.border = "0";
    actions.style.padding = "0 0 16px";
    actions.innerHTML = "<h2 style='font-size:15px;margin:0'>Task Board</h2>";
    const add = el("button", "pill-btn", "＋ New task");
    add.addEventListener("click", () => openTaskForm());
    actions.appendChild(add);
    root.appendChild(actions);

    const tasks = state.tasks.filter((t) =>
      matchesSearch([t.title, projectName(t.projectId), clientForTask(t)].join(" ")));

    const board = el("div", "board");
    TASK_STAGES.forEach((s) => {
      const list = tasks.filter((t) => t.status === s.key)
        .sort((a, b) => {
          const pr = { high: 0, med: 1, low: 2 };
          return (pr[a.priority] - pr[b.priority]) || ((daysUntil(a.due) ?? 1e9) - (daysUntil(b.due) ?? 1e9));
        });
      const col = el("div", "col");
      col.dataset.stage = s.key;
      col.appendChild(el("div", "col-head",
        `<span>${s.label}</span><span class="col-count">${list.length}</span>`));
      list.forEach((t) => col.appendChild(taskCard(t)));
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
      col.addEventListener("dragleave", () => col.classList.remove("dragover"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("dragover");
        const id = e.dataTransfer.getData("text/plain");
        const task = state.tasks.find((x) => x.id === id);
        if (task && task.status !== s.key) {
          task.status = s.key;
          save();
          render();
          toast(`Moved to ${s.label}`);
        }
      });
      board.appendChild(col);
    });
    root.appendChild(board);
    if (!tasks.length) root.appendChild(el("div", "empty",
      searchTerm ? "No tasks match your search." : "No tasks yet — add one to get started."));
  }

  function taskCard(t) {
    const d = daysUntil(t.due);
    const card = el("div", "card");
    card.draggable = true;
    card.dataset.id = t.id;
    const p = PRIORITIES.find((x) => x.key === t.priority);
    card.innerHTML = `
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-sub">${t.projectId ? esc(projectName(t.projectId)) : "Internal"}</div>
      <div class="card-meta"><span class="tag prio-${esc(t.priority)}">${esc(p ? p.label : t.priority)}</span></div>
      ${t.due && t.status !== "done" ? `<div class="due ${dueClass(d)}">⏱ ${dueLabel(d)}</div>` : ""}`;
    card.addEventListener("click", () => openTaskForm(t.id));
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    return card;
  }

  // ---------- Finances ----------
  function renderFinances(root) {
    const m = metrics();
    const kpis = el("div", "kpi-grid");
    kpis.append(
      kpi("Collected", fmtMoney(m.paidThis), "green", `${state.invoices.filter((i) => i.status === "paid").length} paid invoices`),
      kpi("Outstanding", fmtMoney(m.outstanding), "amber", "sent, awaiting payment"),
      kpi("Overdue", fmtMoney(m.overdueAmt), m.overdueAmt ? "red" : "green",
        `${state.invoices.filter((i) => i.status === "overdue").length} invoice(s)`),
      kpi("Recurring / mo", fmtMoney(m.mrr), "teal", "from active retainers")
    );
    root.appendChild(kpis);

    const panel = el("div", "panel");
    const head = el("div", "panel-head");
    head.innerHTML = "<h2>Invoices</h2>";
    const add = el("button", "pill-btn", "＋ New invoice");
    add.addEventListener("click", () => openInvoiceForm());
    head.appendChild(add);
    panel.appendChild(head);

    const body = el("div", "panel-body");
    const rows = state.invoices
      .filter((i) => matchesSearch([i.number, clientName(i.clientId), i.status].join(" ")))
      .slice().sort((a, b) => (b.issued || "").localeCompare(a.issued || ""));

    if (!rows.length) {
      body.appendChild(el("div", "empty", searchTerm ? "No invoices match your search." : "No invoices yet."));
    } else {
      const table = el("table", "data");
      table.innerHTML = `<thead><tr>
        <th>Invoice</th><th>Client</th><th class="right">Amount</th><th>Status</th><th>Issued</th><th>Due</th>
      </tr></thead>`;
      const tb = el("tbody");
      rows.forEach((i) => {
        const overdueVisual = i.status === "overdue";
        const tr = el("tr", "clickable");
        tr.innerHTML = `
          <td><strong>${esc(i.number || "—")}</strong></td>
          <td>${esc(clientName(i.clientId))}</td>
          <td class="right num">${fmtMoneyFull(i.amount)}</td>
          <td>${pill(i.status, INVOICE_STATUS)}</td>
          <td>${fmtDate(i.issued)}</td>
          <td style="${overdueVisual ? "color:var(--red);font-weight:600" : ""}">${fmtDate(i.due)}</td>`;
        tr.addEventListener("click", () => openInvoiceForm(i.id));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      body.appendChild(table);
    }
    panel.appendChild(body);
    root.appendChild(panel);
  }

  // ---------- Goals ----------
  function renderGoals(root) {
    const actions = el("div", "panel-head");
    actions.style.background = "transparent";
    actions.style.border = "0";
    actions.style.padding = "0 0 16px";
    actions.innerHTML = "<h2 style='font-size:15px;margin:0'>Business Goals</h2>";
    const add = el("button", "pill-btn", "＋ New goal");
    add.addEventListener("click", () => openGoalForm());
    actions.appendChild(add);
    root.appendChild(actions);

    if (!state.goals.length) {
      root.appendChild(el("div", "empty", "No goals set — add one to track progress."));
      return;
    }
    const grid = el("div", "goal-grid");
    state.goals.forEach((g) => {
      const cur = Number(g.current) || 0, tgt = Number(g.target) || 0;
      const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
      const fmt = (n) => g.unit === "$" ? fmtMoneyFull(n) : (Number(n) || 0).toLocaleString() + (g.unit && g.unit !== "$" ? " " + g.unit : "");
      const barCls = pct >= 100 ? "green" : pct >= 60 ? "teal" : "";
      const d = daysUntil(g.due);
      const card = el("div", "goal-card");
      card.innerHTML = `
        <h3>${esc(g.title)}</h3>
        <div class="goal-due">${g.due ? "Target by " + fmtDate(g.due) + (d != null && d >= 0 ? " · " + d + "d left" : "") : "No target date"}</div>
        <div class="goal-nums">
          <span class="goal-cur">${esc(fmt(cur))}</span>
          <span class="goal-tgt">/ ${esc(fmt(tgt))}</span>
          <span class="goal-pct">${pct}%</span>
        </div>
        <div class="bar ${barCls}"><span style="width:${pct}%"></span></div>`;
      card.addEventListener("click", () => openGoalForm(g.id));
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ---------- Playbook ----------
  function renderPlaybook(root) {
    const intro = el("div", "panel");
    intro.appendChild(el("div", "panel-head", "<h2>Operating Playbook</h2>"));
    intro.appendChild(el("div", "panel-body",
      `<p style="color:var(--muted);font-size:13.5px;line-height:1.6;margin:8px 0;">
        A short set of operating principles for running a healthy solo/small business. Adapt them to
        how you actually work — the dashboard tabs are built to support each one.</p>`));
    root.appendChild(intro);

    const grid = el("div", "ref-grid");
    (window.PLAYBOOK || []).forEach((r) => {
      const card = el("div", "ref-card");
      card.innerHTML = `
        <span class="abbr">${esc(r.abbr)}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.desc)}</p>
        <ul>${r.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ==========================================================================
  //  Generic entity form modal
  // ==========================================================================
  let activeForm = null; // { collection, onSave, deletable }

  function clientOptions(sel) {
    return state.clients.map((c) =>
      `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.company || c.name)}</option>`).join("");
  }
  function projectOptions(sel) {
    return `<option value="">— None (internal) —</option>` + state.projects.map((p) =>
      `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  }
  function selectOpts(defs, sel) {
    return defs.map((d) => `<option value="${d.key}" ${d.key === sel ? "selected" : ""}>${esc(d.label)}</option>`).join("");
  }

  // Field spec -> HTML
  function fieldHTML(f) {
    const span = f.span === 2 ? " span-2" : "";
    let control = "";
    const val = f.value == null ? "" : f.value;
    if (f.type === "textarea") {
      control = `<textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea>`;
    } else if (f.type === "select") {
      control = `<select name="${f.name}">${f.options}</select>`;
    } else if (f.type === "range") {
      control = `<input name="${f.name}" type="range" min="0" max="100" step="5" value="${esc(val || 0)}" />`;
    } else {
      const extra = f.type === "number" ? `min="0" step="${f.step || 1}"` : "";
      control = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(val)}" placeholder="${esc(f.placeholder || "")}" ${extra} ${f.required ? "required" : ""} />`;
    }
    return `<div class="field${span}"><label>${esc(f.label)}${f.required ? " *" : ""}</label>${control}</div>`;
  }

  function openForm(cfg) {
    // cfg: { title, fields, values, collection, deletable, coerce }
    activeForm = cfg;
    $("#modalTitle").textContent = cfg.title;
    $("#deleteBtn").hidden = !cfg.deletable;
    const form = $("#entityForm");
    form.reset();
    form.id.value = cfg.values.id || "";
    $("#modalFields").innerHTML = cfg.fields.map(fieldHTML).join("");
    showModal("#modal");
    const first = $("#modalFields input, #modalFields select, #modalFields textarea");
    if (first) first.focus();
  }

  function submitForm(e) {
    e.preventDefault();
    if (!activeForm) return;
    const form = e.target;
    const raw = {};
    activeForm.fields.forEach((f) => {
      const node = form.elements[f.name];
      if (!node) return;
      raw[f.name] = node.value;
    });
    const data = activeForm.coerce(raw, form.id.value || uid());
    // required check
    const missing = activeForm.fields.some((f) => f.required && !String(data[f.name] || "").trim());
    if (missing) { toast("Please fill in the required fields"); return; }

    const coll = state[activeForm.collection];
    const idx = coll.findIndex((x) => x.id === data.id);
    if (idx >= 0) coll[idx] = data; else coll.unshift(data);
    save();
    hideModal("#modal");
    render();
    toast(idx >= 0 ? "Saved changes" : "Created");
  }

  function deleteEntity() {
    if (!activeForm) return;
    const id = $("#entityForm").id.value;
    if (!id) return;
    if (!confirm("Delete this " + activeForm.noun + "? This cannot be undone.")) return;
    state[activeForm.collection] = state[activeForm.collection].filter((x) => x.id !== id);
    save();
    hideModal("#modal");
    render();
    toast("Deleted");
  }

  // ----- Entity-specific form openers -----
  function openClientForm(id) {
    const c = id ? clientById(id) : {};
    openForm({
      title: id ? "Edit Client" : "New Client", collection: "clients", noun: "client", deletable: !!id,
      values: c,
      fields: [
        { name: "name", label: "Contact name", value: c.name, required: true, placeholder: "e.g. Amara Osei", span: 2 },
        { name: "company", label: "Company", value: c.company, placeholder: "e.g. Northwind Logistics" },
        { name: "email", label: "Email", type: "email", value: c.email, placeholder: "name@company.com" },
        { name: "status", label: "Status", type: "select", options: selectOpts(CLIENT_STATUS, c.status || "lead") },
        { name: "mrr", label: "Monthly value (USD)", type: "number", value: c.mrr, placeholder: "0" },
        { name: "since", label: "Client since", type: "date", value: c.since },
        { name: "notes", label: "Notes", type: "textarea", value: c.notes, span: 2, placeholder: "Context, relationship, next steps…" }
      ],
      coerce: (r, newId) => ({
        id: newId, name: r.name.trim(), company: r.company.trim(), email: r.email.trim(),
        status: r.status, mrr: Number(r.mrr) || 0, since: r.since, notes: r.notes.trim()
      })
    });
  }

  function openProjectForm(id) {
    const p = id ? projectById(id) : {};
    if (!state.clients.length) { toast("Add a client first"); openClientForm(); return; }
    openForm({
      title: id ? "Edit Project" : "New Project", collection: "projects", noun: "project", deletable: !!id,
      values: p,
      fields: [
        { name: "name", label: "Project name", value: p.name, required: true, placeholder: "e.g. Website relaunch", span: 2 },
        { name: "clientId", label: "Client", type: "select", options: clientOptions(p.clientId) },
        { name: "status", label: "Status", type: "select", options: selectOpts(PROJECT_STATUS, p.status || "planning") },
        { name: "budget", label: "Budget (USD)", type: "number", value: p.budget, placeholder: "0" },
        { name: "due", label: "Due date", type: "date", value: p.due },
        { name: "progress", label: "Progress %", type: "number", step: 5, value: p.progress == null ? 0 : p.progress, placeholder: "0" },
        { name: "notes", label: "Notes", type: "textarea", value: p.notes, span: 2, placeholder: "Scope, blockers, next milestone…" }
      ],
      coerce: (r, newId) => ({
        id: newId, name: r.name.trim(), clientId: r.clientId, status: r.status,
        budget: Number(r.budget) || 0, due: r.due,
        progress: Math.max(0, Math.min(100, Number(r.progress) || 0)), notes: r.notes.trim()
      })
    });
  }

  function openTaskForm(id) {
    const t = id ? state.tasks.find((x) => x.id === id) : {};
    openForm({
      title: id ? "Edit Task" : "New Task", collection: "tasks", noun: "task", deletable: !!id,
      values: t,
      fields: [
        { name: "title", label: "Task", value: t.title, required: true, placeholder: "e.g. Send Q3 invoice", span: 2 },
        { name: "projectId", label: "Project", type: "select", options: projectOptions(t.projectId) },
        { name: "priority", label: "Priority", type: "select", options: selectOpts(PRIORITIES, t.priority || "med") },
        { name: "status", label: "Status", type: "select", options: selectOpts(TASK_STAGES, t.status || "todo") },
        { name: "due", label: "Due date", type: "date", value: t.due }
      ],
      coerce: (r, newId) => ({
        id: newId, title: r.title.trim(), projectId: r.projectId || null,
        priority: r.priority, status: r.status, due: r.due
      })
    });
  }

  function openInvoiceForm(id) {
    const i = id ? state.invoices.find((x) => x.id === id) : {};
    if (!state.clients.length) { toast("Add a client first"); openClientForm(); return; }
    const nextNum = "INV-" + (1000 + state.invoices.length + 1);
    openForm({
      title: id ? "Edit Invoice" : "New Invoice", collection: "invoices", noun: "invoice", deletable: !!id,
      values: i,
      fields: [
        { name: "number", label: "Invoice #", value: i.number || nextNum, required: true },
        { name: "clientId", label: "Client", type: "select", options: clientOptions(i.clientId) },
        { name: "amount", label: "Amount (USD)", type: "number", value: i.amount, required: true, placeholder: "0" },
        { name: "status", label: "Status", type: "select", options: selectOpts(INVOICE_STATUS, i.status || "draft") },
        { name: "issued", label: "Issued", type: "date", value: i.issued },
        { name: "due", label: "Due", type: "date", value: i.due }
      ],
      coerce: (r, newId) => ({
        id: newId, number: r.number.trim(), clientId: r.clientId, amount: Number(r.amount) || 0,
        status: r.status, issued: r.issued, due: r.due
      })
    });
  }

  function openGoalForm(id) {
    const g = id ? state.goals.find((x) => x.id === id) : {};
    openForm({
      title: id ? "Edit Goal" : "New Goal", collection: "goals", noun: "goal", deletable: !!id,
      values: g,
      fields: [
        { name: "title", label: "Goal", value: g.title, required: true, placeholder: "e.g. Monthly recurring revenue", span: 2 },
        { name: "current", label: "Current", type: "number", value: g.current, placeholder: "0" },
        { name: "target", label: "Target", type: "number", value: g.target, required: true, placeholder: "0" },
        { name: "unit", label: "Unit ($ or blank)", value: g.unit, placeholder: "$" },
        { name: "due", label: "Target date", type: "date", value: g.due }
      ],
      coerce: (r, newId) => ({
        id: newId, title: r.title.trim(), current: Number(r.current) || 0,
        target: Number(r.target) || 0, unit: r.unit.trim(), due: r.due
      })
    });
  }

  const NEW_HANDLERS = {
    client: openClientForm, project: openProjectForm, task: openTaskForm,
    invoice: openInvoiceForm, goal: openGoalForm
  };

  // ---------- Modal utils ----------
  function showModal(sel) { $(sel).hidden = false; }
  function hideModal(sel) { $(sel).hidden = true; }

  // ---------- Import / Export ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "command-center-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported backup");
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
        state = normalize(parsed);
        save();
        render();
        toast("Data imported");
      } catch (e) { toast("Import failed — invalid file"); }
    };
    reader.readAsText(file);
  }
  function resetDemo() {
    if (!confirm("Reset all data and reload the sample dataset?")) return;
    state = clone(window.SEED);
    save();
    render();
    toast("Demo data restored");
  }

  // ---------- Wire up ----------
  function init() {
    $$(".nav-item").forEach((b) =>
      b.addEventListener("click", () => { currentView = b.dataset.view; render(); }));

    // "New" chooser
    $("#newBtn").addEventListener("click", () => showModal("#chooser"));
    $$(".chooser-btn").forEach((b) => b.addEventListener("click", () => {
      hideModal("#chooser");
      (NEW_HANDLERS[b.dataset.new] || (() => {}))();
    }));

    $("#entityForm").addEventListener("submit", submitForm);
    $("#deleteBtn").addEventListener("click", deleteEntity);

    $$("[data-close-modal]").forEach((b) =>
      b.addEventListener("click", () => { hideModal("#modal"); hideModal("#chooser"); }));
    $$(".modal-overlay").forEach((ov) =>
      ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideModal("#modal"); hideModal("#chooser"); }
    });

    const searchInput = $("#globalSearch");
    searchInput.addEventListener("input", (e) => { searchTerm = e.target.value.trim(); render(); });

    $("#exportBtn").addEventListener("click", exportData);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); });
    $("#resetBtn").addEventListener("click", resetDemo);

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
