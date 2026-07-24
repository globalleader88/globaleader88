/* ===== GovBid Command — application logic ===== */
(function () {
  "use strict";

  const STORE_KEY = "govbid.v1";
  const DAY = 86400000;

  const STAGES = [
    { key: "identified", label: "Identified" },
    { key: "reviewing",  label: "Reviewing" },
    { key: "bidding",    label: "Bidding" },
    { key: "submitted",  label: "Submitted" },
    { key: "won",        label: "Won" },
    { key: "lost",       label: "Lost" }
  ];
  const ACTIVE_STAGES = ["identified", "reviewing", "bidding", "submitted"];

  // ---------- State ----------
  let state = load();
  let currentView = "dashboard";
  let searchTerm = "";

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to seed */ }
    return clone(window.SEED);
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
    if (days < 0) return "urgent";
    if (days <= 5) return "urgent";
    if (days <= 14) return "soon";
    return "ok";
  }
  function dueLabel(days) {
    if (days == null) return "No date";
    if (days < 0) return Math.abs(days) + "d overdue";
    if (days === 0) return "Due today";
    return "Due in " + days + "d";
  }
  const uid = () => "x" + Math.random().toString(36).slice(2, 9);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- Views ----------
  function render() {
    const titles = {
      dashboard: "Dashboard", pipeline: "Bid Pipeline",
      deadlines: "Deadlines", compliance: "Compliance", reference: "Set-Aside Guide"
    };
    $("#viewTitle").textContent = titles[currentView] || "";
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
    const root = $("#viewRoot");
    root.innerHTML = "";
    ({ dashboard: renderDashboard, pipeline: renderPipeline, deadlines: renderDeadlines,
       compliance: renderCompliance, reference: renderReference }[currentView] || renderDashboard)(root);
  }

  function filteredOpps() {
    if (!searchTerm) return state.opportunities;
    const q = searchTerm.toLowerCase();
    return state.opportunities.filter((o) =>
      [o.title, o.agency, o.solicitation, o.naics, o.setAside, o.notes]
        .some((v) => (v || "").toLowerCase().includes(q)));
  }

  // ----- Dashboard -----
  function renderDashboard(root) {
    const opps = state.opportunities;
    const active = opps.filter((o) => ACTIVE_STAGES.includes(o.stage));
    const won = opps.filter((o) => o.stage === "won");
    const lost = opps.filter((o) => o.stage === "lost");
    const decided = won.length + lost.length;
    const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
    const pipelineValue = active.reduce((s, o) => s + (Number(o.value) || 0), 0);
    const weighted = active.reduce((s, o) => s + (Number(o.value) || 0) * (Number(o.probability) || 0) / 100, 0);
    const wonValue = won.reduce((s, o) => s + (Number(o.value) || 0), 0);

    const upcoming = active
      .filter((o) => o.dueDate)
      .map((o) => ({ o, d: daysUntil(o.dueDate) }))
      .filter((x) => x.d != null && x.d <= 30)
      .sort((a, b) => a.d - b.d);
    const expiringCerts = (state.certifications || [])
      .map((c) => ({ c, d: daysUntil(c.expires) }))
      .filter((x) => x.d != null && x.d <= 45)
      .sort((a, b) => a.d - b.d);

    // KPIs
    const kpis = el("div", "kpi-grid");
    kpis.append(
      kpi("Active Pursuits", active.length, "blue", `${opps.length} total opportunities`),
      kpi("Pipeline Value", fmtMoney(pipelineValue), "blue", `${fmtMoney(weighted)} weighted by P(win)`),
      kpi("Win Rate", winRate + "%", winRate >= 50 ? "green" : "amber", `${won.length} won · ${lost.length} lost`),
      kpi("Awarded Value", fmtMoney(wonValue), "green", `${won.length} contract${won.length === 1 ? "" : "s"} won`)
    );
    root.appendChild(kpis);

    const cols = el("div", "two-col");

    // Stage funnel
    const funnel = el("div", "panel");
    funnel.appendChild(el("div", "panel-head", "<h2>Pipeline by Stage</h2>"));
    const fbody = el("div", "panel-body");
    const maxCount = Math.max(1, ...STAGES.map((s) => opps.filter((o) => o.stage === s.key).length));
    STAGES.forEach((s) => {
      const list = opps.filter((o) => o.stage === s.key);
      const val = list.reduce((sum, o) => sum + (Number(o.value) || 0), 0);
      const row = el("div", "", `
        <div style="display:flex;justify-content:space-between;font-size:13px;margin:12px 0 5px;">
          <strong>${s.label}</strong>
          <span style="color:var(--muted)">${list.length} · ${fmtMoney(val)}</span>
        </div>
        <div class="bar"><span style="width:${(list.length / maxCount) * 100}%"></span></div>`);
      fbody.appendChild(row);
    });
    funnel.appendChild(fbody);
    cols.appendChild(funnel);

    // Alerts panel
    const alerts = el("div", "panel");
    alerts.appendChild(el("div", "panel-head", "<h2>Needs Attention</h2>"));
    const abody = el("div", "panel-body");
    if (!upcoming.length && !expiringCerts.length) {
      abody.appendChild(el("div", "empty", "🎉 Nothing urgent. You're all caught up."));
    }
    expiringCerts.forEach(({ c, d }) => {
      const cls = d < 0 ? "red" : d <= 14 ? "amber" : "gray";
      const row = el("div", "", `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);">
          <span class="status-pill ${cls}">${d < 0 ? "LAPSED" : d + "d"}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${esc(c.name)}</div>
            <div style="font-size:11.5px;color:var(--muted)">Compliance · ${d < 0 ? "expired " + Math.abs(d) + "d ago" : "expires " + fmtDate(c.expires)}</div>
          </div>
        </div>`);
      abody.appendChild(row);
    });
    upcoming.slice(0, 6).forEach(({ o, d }) => {
      const cls = d < 0 ? "red" : d <= 5 ? "red" : d <= 14 ? "amber" : "gray";
      const row = el("div", "clickable-alert", `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer;">
          <span class="status-pill ${cls}">${dueLabel(d).replace(" ", " ")}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${esc(o.title)}</div>
            <div style="font-size:11.5px;color:var(--muted)">${esc(o.agency || "—")} · ${esc(labelForStage(o.stage))}</div>
          </div>
        </div>`);
      row.addEventListener("click", () => openOppModal(o.id));
      abody.appendChild(row);
    });
    alerts.appendChild(abody);
    cols.appendChild(alerts);

    root.appendChild(cols);
  }

  function kpi(label, value, cls, sub) {
    return el("div", "kpi " + cls,
      `<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>`);
  }
  function labelForStage(k) { return (STAGES.find((s) => s.key === k) || {}).label || k; }

  // ----- Pipeline (Kanban) -----
  function renderPipeline(root) {
    const opps = filteredOpps();
    const board = el("div", "board");
    STAGES.forEach((s) => {
      const list = opps.filter((o) => o.stage === s.key)
        .sort((a, b) => (daysUntil(a.dueDate) ?? 1e9) - (daysUntil(b.dueDate) ?? 1e9));
      const col = el("div", "col");
      col.dataset.stage = s.key;
      col.appendChild(el("div", "col-head",
        `<span>${s.label}</span><span class="col-count">${list.length}</span>`));
      list.forEach((o) => col.appendChild(oppCard(o)));
      // drag targets
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
      col.addEventListener("dragleave", () => col.classList.remove("dragover"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("dragover");
        const id = e.dataTransfer.getData("text/plain");
        const opp = state.opportunities.find((x) => x.id === id);
        if (opp && opp.stage !== s.key) {
          opp.stage = s.key;
          if (s.key === "won") opp.probability = 100;
          if (s.key === "lost") opp.probability = 0;
          save();
          render();
          toast(`Moved to ${s.label}`);
        }
      });
      board.appendChild(col);
    });
    root.appendChild(board);
    if (!opps.length) root.appendChild(el("div", "empty",
      searchTerm ? "No opportunities match your search." : "No opportunities yet — add one to get started."));
  }

  function oppCard(o) {
    const d = daysUntil(o.dueDate);
    const card = el("div", "card");
    card.draggable = true;
    card.dataset.id = o.id;
    const tags = [];
    if (o.setAside) tags.push(`<span class="tag">${esc(o.setAside)}</span>`);
    if (o.value) tags.push(`<span class="tag value">${fmtMoney(o.value)}</span>`);
    if (o.naics) tags.push(`<span class="tag">NAICS ${esc(o.naics)}</span>`);
    card.innerHTML = `
      <div class="card-title">${esc(o.title)}</div>
      <div class="card-agency">${esc(o.agency || "—")}</div>
      <div class="card-meta">${tags.join("")}</div>
      ${o.dueDate ? `<div class="due ${dueClass(d)}">⏱ ${dueLabel(d)} · ${fmtDate(o.dueDate)}</div>` : ""}`;
    card.addEventListener("click", () => openOppModal(o.id));
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", o.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    return card;
  }

  // ----- Deadlines -----
  function renderDeadlines(root) {
    const rows = filteredOpps()
      .filter((o) => o.dueDate && ACTIVE_STAGES.includes(o.stage))
      .map((o) => ({ o, d: daysUntil(o.dueDate) }))
      .sort((a, b) => a.d - b.d);

    const panel = el("div", "panel");
    panel.appendChild(el("div", "panel-head",
      "<h2>Upcoming Response Deadlines</h2><span style='font-size:12px;color:var(--muted)'>Active pursuits with a due date</span>"));
    const body = el("div", "panel-body");
    if (!rows.length) {
      body.appendChild(el("div", "empty", "No upcoming deadlines on active pursuits."));
    } else {
      const table = el("table", "data");
      table.innerHTML = `<thead><tr>
        <th>Countdown</th><th>Opportunity</th><th>Agency</th><th>Stage</th><th>Value</th><th>Due Date</th>
      </tr></thead>`;
      const tb = el("tbody");
      rows.forEach(({ o, d }) => {
        const cls = d < 0 ? "red" : d <= 5 ? "red" : d <= 14 ? "amber" : "green";
        const tr = el("tr", "clickable");
        tr.innerHTML = `
          <td><span class="status-pill ${cls}">${dueLabel(d)}</span></td>
          <td><strong>${esc(o.title)}</strong>${o.solicitation ? `<div style="font-size:11.5px;color:var(--muted)">${esc(o.solicitation)}</div>` : ""}</td>
          <td>${esc(o.agency || "—")}</td>
          <td>${esc(labelForStage(o.stage))}</td>
          <td>${o.value ? fmtMoneyFull(o.value) : "—"}</td>
          <td>${fmtDate(o.dueDate)}</td>`;
        tr.addEventListener("click", () => openOppModal(o.id));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      body.appendChild(table);
    }
    panel.appendChild(body);
    root.appendChild(panel);
  }

  // ----- Compliance -----
  function renderCompliance(root) {
    const head = el("div", "panel");
    const h = el("div", "panel-head");
    h.innerHTML = "<h2>Registrations &amp; Certifications</h2>";
    const addBtn = el("button", "primary-btn", "＋ Add");
    addBtn.addEventListener("click", () => openCertModal());
    h.appendChild(addBtn);
    head.appendChild(h);

    const body = el("div", "panel-body");
    const certs = (state.certifications || [])
      .map((c) => ({ c, d: daysUntil(c.expires) }))
      .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

    if (!certs.length) {
      body.appendChild(el("div", "empty", "No certifications tracked. Add SAM.gov, set-aside certs, insurance, etc."));
    } else {
      const table = el("table", "data");
      table.innerHTML = `<thead><tr>
        <th>Status</th><th>Name</th><th>Type</th><th>Identifier / Notes</th><th>Expires</th>
      </tr></thead>`;
      const tb = el("tbody");
      certs.forEach(({ c, d }) => {
        let cls = "green", label = "Current";
        if (d == null) { cls = "gray"; label = "No date"; }
        else if (d < 0) { cls = "red"; label = "Expired"; }
        else if (d <= 30) { cls = "red"; label = d + "d left"; }
        else if (d <= 60) { cls = "amber"; label = d + "d left"; }
        const tr = el("tr", "clickable");
        tr.innerHTML = `
          <td><span class="status-pill ${cls}">${label}</span></td>
          <td><strong>${esc(c.name)}</strong></td>
          <td>${esc(c.type || "—")}</td>
          <td style="color:var(--muted)">${esc(c.identifier || "—")}</td>
          <td>${fmtDate(c.expires)}</td>`;
        tr.addEventListener("click", () => openCertModal(c.id));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      body.appendChild(table);
    }
    head.appendChild(body);
    root.appendChild(head);

    root.appendChild(el("div", "empty",
      "💡 Tip: SAM.gov registration must be renewed every 12 months to remain eligible for federal awards."));
  }

  // ----- Reference -----
  function renderReference(root) {
    const intro = el("div", "panel");
    intro.appendChild(el("div", "panel-head", "<h2>Small Business Set-Aside Programs</h2>"));
    intro.appendChild(el("div", "panel-body",
      `<p style="color:var(--muted);font-size:13.5px;line-height:1.6;margin:8px 0;">
        A quick reference to the federal small-business set-aside programs. Eligibility and thresholds
        are governed by the SBA and the FAR — always confirm current rules on SAM.gov and SBA.gov before bidding.</p>`));
    root.appendChild(intro);

    const grid = el("div", "ref-grid");
    (window.SETASIDE_REFERENCE || []).forEach((r) => {
      const card = el("div", "ref-card");
      card.innerHTML = `
        <span class="abbr">${esc(r.abbr)}</span>
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.desc)}</p>
        <ul>${r.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ---------- Opportunity modal ----------
  function openOppModal(id) {
    const form = $("#oppForm");
    form.reset();
    const opp = id ? state.opportunities.find((o) => o.id === id) : null;
    $("#oppModalTitle").textContent = opp ? "Edit Opportunity" : "New Opportunity";
    $("#deleteOppBtn").hidden = !opp;
    form.id.value = opp ? opp.id : "";
    if (opp) {
      form.title.value = opp.title || "";
      form.agency.value = opp.agency || "";
      form.solicitation.value = opp.solicitation || "";
      form.naics.value = opp.naics || "";
      form.setAside.value = opp.setAside || "";
      form.value.value = opp.value || "";
      form.stage.value = opp.stage || "identified";
      form.dueDate.value = opp.dueDate || "";
      form.probability.value = opp.probability ?? 50;
      form.notes.value = opp.notes || "";
    }
    $("#probOut").textContent = form.probability.value;
    showModal("#oppModal");
    form.title.focus();
  }

  function saveOpp(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      id: form.id.value || uid(),
      title: form.title.value.trim(),
      agency: form.agency.value.trim(),
      solicitation: form.solicitation.value.trim(),
      naics: form.naics.value.trim(),
      setAside: form.setAside.value,
      value: Number(form.value.value) || 0,
      stage: form.stage.value,
      dueDate: form.dueDate.value,
      probability: Number(form.probability.value),
      notes: form.notes.value.trim()
    };
    if (!data.title) return;
    const idx = state.opportunities.findIndex((o) => o.id === data.id);
    if (idx >= 0) state.opportunities[idx] = data;
    else state.opportunities.unshift(data);
    save();
    hideModal("#oppModal");
    render();
    toast(idx >= 0 ? "Opportunity updated" : "Opportunity added");
  }

  function deleteOpp() {
    const id = $("#oppForm").id.value;
    if (!id) return;
    if (!confirm("Delete this opportunity? This cannot be undone.")) return;
    state.opportunities = state.opportunities.filter((o) => o.id !== id);
    save();
    hideModal("#oppModal");
    render();
    toast("Opportunity deleted");
  }

  // ---------- Cert modal ----------
  function openCertModal(id) {
    const form = $("#certForm");
    form.reset();
    const cert = id ? state.certifications.find((c) => c.id === id) : null;
    $("#certModalTitle").textContent = cert ? "Edit Registration / Certification" : "Add Registration / Certification";
    $("#deleteCertBtn").hidden = !cert;
    form.id.value = cert ? cert.id : "";
    if (cert) {
      form.name.value = cert.name || "";
      form.type.value = cert.type || "Registration";
      form.expires.value = cert.expires || "";
      form.identifier.value = cert.identifier || "";
    }
    showModal("#certModal");
    form.name.focus();
  }

  function saveCert(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      id: form.id.value || uid(),
      name: form.name.value.trim(),
      type: form.type.value,
      expires: form.expires.value,
      identifier: form.identifier.value.trim()
    };
    if (!data.name) return;
    state.certifications = state.certifications || [];
    const idx = state.certifications.findIndex((c) => c.id === data.id);
    if (idx >= 0) state.certifications[idx] = data;
    else state.certifications.push(data);
    save();
    hideModal("#certModal");
    render();
    toast(idx >= 0 ? "Compliance item updated" : "Compliance item added");
  }

  function deleteCert() {
    const id = $("#certForm").id.value;
    if (!id) return;
    if (!confirm("Delete this compliance item?")) return;
    state.certifications = state.certifications.filter((c) => c.id !== id);
    save();
    hideModal("#certModal");
    render();
    toast("Compliance item deleted");
  }

  // ---------- Modal utils ----------
  function showModal(sel) { $(sel).hidden = false; }
  function hideModal(sel) { $(sel).hidden = true; }

  // ---------- Import / Export ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "govbid-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported backup");
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.opportunities)) throw new Error("bad shape");
        state = { opportunities: parsed.opportunities, certifications: parsed.certifications || [] };
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

    $("#newOppBtn").addEventListener("click", () => openOppModal());
    $("#oppForm").addEventListener("submit", saveOpp);
    $("#deleteOppBtn").addEventListener("click", deleteOpp);
    $("#certForm").addEventListener("submit", saveCert);
    $("#deleteCertBtn").addEventListener("click", deleteCert);

    document.addEventListener("input", (e) => {
      if (e.target.name === "probability") $("#probOut").textContent = e.target.value;
    });

    $$("[data-close-modal]").forEach((b) =>
      b.addEventListener("click", () => { hideModal("#oppModal"); hideModal("#certModal"); }));
    $$(".modal-overlay").forEach((ov) =>
      ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideModal("#oppModal"); hideModal("#certModal"); }
    });

    const searchInput = $("#globalSearch");
    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      if (currentView !== "pipeline" && currentView !== "deadlines" && searchTerm) currentView = "pipeline";
      render();
    });

    $("#exportBtn").addEventListener("click", exportData);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); });
    $("#resetBtn").addEventListener("click", resetDemo);

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
