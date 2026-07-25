/* ===== Federal Contracting Readiness Assessment — app logic ===== */
(function () {
  "use strict";

  const CFG = window.CONFIG;
  const A = window.ASSESSMENT;
  const LEADS_KEY = "govcon.leads.v1";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Session state (answers + computed result)
  const session = { answers: {}, index: 0, result: null };

  function tpl(id) { return $("#tpl-" + id).content.cloneNode(true); }
  function mount(node) { const app = $("#app"); app.innerHTML = ""; app.appendChild(node); window.scrollTo(0, 0); }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- Branding ----------
  function applyBranding() {
    $("#brandMark").textContent = CFG.brandMark || "🎯";
    $("#brandName").textContent = CFG.brandName || "";
    $("#brandTag").textContent = CFG.tagline || "";
    $("#footerBrand").textContent = [CFG.brandName, CFG.tagline].filter(Boolean).join(" — ");
    document.title = "Federal Contracting Readiness Assessment · " + (CFG.brandName || "");
  }

  // ---------- Router ----------
  function router() {
    const hash = location.hash || "#/";
    const route = hash.replace(/^#/, "");
    if (route === "/" || route === "") return renderLanding();
    if (route === "/assessment") return startAssessment();
    if (route === "/results") return session.result ? renderResults() : startAssessment();
    if (route === "/plan") return session.result ? renderLead() : startAssessment();
    if (route === "/thankyou") return session.lastLead ? renderThankYou() : renderLanding();
    if (route === "/leads") return renderLeads();
    return renderLanding();
  }

  // ---------- Landing ----------
  function renderLanding() {
    const node = tpl("landing");
    $(".lede", node) && ($("#heroSub", node).textContent = CFG.subhead || "");
    $("#heroHeadline", node).textContent = CFG.headline || "Are you ready to win federal contracts?";
    mount(node);
  }

  // ---------- Assessment wizard ----------
  function startAssessment() {
    if (!location.hash.startsWith("#/assessment")) { location.hash = "#/assessment"; return; }
    session.index = Math.min(session.index, A.questions.length - 1);
    mount(tpl("assessment"));
    renderQuestion();
  }

  function renderQuestion() {
    const total = A.questions.length;
    const i = session.index;
    const q = A.questions[i];
    $("#progressBar").style.width = ((i) / total * 100) + "%";
    $("#qCount").textContent = `Question ${i + 1} of ${total}`;
    const back = $("#backBtn");
    back.hidden = i === 0;

    const box = $("#questionBox");
    box.innerHTML = `
      <h2 class="q-text">${esc(q.text)}</h2>
      ${q.help ? `<p class="q-help">${esc(q.help)}</p>` : ""}
      <div class="options"></div>`;
    const opts = $(".options", box);
    q.options.forEach((opt, idx) => {
      const selected = session.answers[q.id] && session.answers[q.id].idx === idx;
      const b = document.createElement("button");
      b.className = "option" + (selected ? " selected" : "");
      b.innerHTML = `<span class="dot"></span><span>${esc(opt.label)}</span>`;
      b.addEventListener("click", () => choose(q, idx));
      opts.appendChild(b);
    });
  }

  function choose(q, idx) {
    session.answers[q.id] = { idx, score: q.options[idx].score };
    // brief visual confirm then advance
    const buttons = $$(".option");
    buttons.forEach((b, n) => b.classList.toggle("selected", n === idx));
    setTimeout(() => {
      if (session.index < A.questions.length - 1) { session.index++; renderQuestion(); }
      else finishAssessment();
    }, 200);
  }

  function bindAssessmentNav() {
    document.addEventListener("click", (e) => {
      if (e.target && e.target.id === "backBtn") {
        if (session.index > 0) { session.index--; renderQuestion(); }
      }
    });
  }

  // ---------- Scoring ----------
  function computeResult() {
    const cats = A.categories;
    const catScores = {};
    Object.keys(cats).forEach((k) => (catScores[k] = { sum: 0, n: 0 }));
    A.questions.forEach((q) => {
      const ans = session.answers[q.id];
      if (!ans) return;
      catScores[q.category].sum += ans.score;
      catScores[q.category].n += 1;
    });
    const categoryResults = Object.keys(cats).map((k) => {
      const cs = catScores[k];
      const avg = cs.n ? Math.round(cs.sum / cs.n) : 0;
      return { key: k, label: cats[k].label, weight: cats[k].weight, score: avg };
    });
    const overall = Math.round(
      categoryResults.reduce((s, c) => s + c.score * c.weight, 0) /
      categoryResults.reduce((s, c) => s + c.weight, 0)
    );
    const tier = A.tiers.find((t) => overall >= t.min) || A.tiers[A.tiers.length - 1];

    // Recommendations that fire, in configured priority order
    const recos = A.recommendations.filter((r) => {
      const ans = session.answers[r.q];
      return ans && ans.idx >= r.atOrBelow;
    }).map((r) => r.text);

    return { overall, categoryResults, tier, recos };
  }

  function finishAssessment() {
    $("#progressBar").style.width = "100%";
    session.result = computeResult();
    location.hash = "#/results";
  }

  // ---------- Results ----------
  function band(score) { return score >= 70 ? "hi" : score >= 40 ? "mid" : "lo"; }

  function renderResults() {
    const r = session.result;
    const node = tpl("results");
    mount(node);

    $("#scoreNum").textContent = r.overall;
    const ring = $("#scoreRing");
    ring.style.setProperty("--v", 0);
    requestAnimationFrame(() => setTimeout(() => ring.style.setProperty("--v", r.overall), 60));
    $("#tierPill").textContent = r.tier.name;
    $("#tierName").textContent = `You're ${aOrAn(r.tier.name)} ${r.tier.name}`;
    $("#tierBlurb").textContent = r.tier.blurb;

    const cb = $("#catBreakdown");
    r.categoryResults.forEach((c) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      row.innerHTML = `
        <div class="cat-top"><strong>${esc(c.label)}</strong><span>${c.score}/100</span></div>
        <div class="cat-bar"><i class="${band(c.score)}" style="width:0%"></i></div>`;
      cb.appendChild(row);
      requestAnimationFrame(() => setTimeout(() => { $("i", row).style.width = c.score + "%"; }, 120));
    });

    const rl = $("#recoList");
    const top = r.recos.slice(0, 5);
    if (!top.length) {
      rl.innerHTML = `<li>You're in strong shape across the board — the priority now is opportunity targeting and win strategy. Let's talk about your pipeline.</li>`;
    } else {
      top.forEach((t) => { const li = document.createElement("li"); li.textContent = t; rl.appendChild(li); });
    }

    if (CFG.consultCta) $("#ctaBandBtn").textContent = "Get my action plan →";
  }
  function aOrAn(w) { return /^[aeiou]/i.test(w) ? "an" : "a"; }

  // ---------- Lead capture ----------
  function renderLead() {
    mount(tpl("lead"));
    $("#leadForm").addEventListener("submit", submitLead);
  }

  // Read a query param from the landing URL (tracked links put UTMs before the
  // hash, e.g. ".../?utm_source=prospecting&utm_campaign=govcon#/").
  function utmParam(key) {
    try { return new URLSearchParams(window.location.search).get(key) || ""; }
    catch (e) { return ""; }
  }

  async function submitLead(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $("#leadSubmit");
    const r = session.result;
    const lead = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      company: form.company.value.trim(),
      phone: form.phone.value.trim(),
      goal: form.goal.value.trim(),
      score: r ? r.overall : null,
      tier: r ? r.tier.name : "",
      categories: r ? r.categoryResults.map((c) => ({ label: c.label, score: c.score })) : [],
      recommendations: r ? r.recos.slice(0, 5) : [],
      answers: session.answers,
      submittedAt: new Date().toISOString(),
      // Attribution: if the visitor arrived via a tracked link (utm_source /
      // utm_campaign), record it so the Lead Engine shows which campaign
      // produced this lead; otherwise fall back to the generic source.
      source: utmParam("utm_source") || "Readiness Assessment",
      campaign: utmParam("utm_campaign") || ""
    };
    if (!lead.name || !lead.email || !lead.company) return;

    btn.disabled = true; btn.textContent = "Sending…";
    let delivered = false;
    if (CFG.leadEndpoint) {
      try {
        const res = await fetch(CFG.leadEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(lead)
        });
        delivered = res.ok;
      } catch (err) { delivered = false; }
    }
    // Always keep a local copy so nothing is ever lost (and demo mode works).
    saveLeadLocally(lead);

    session.lastLead = lead;
    if (CFG.leadEndpoint && !delivered) {
      toast("Saved locally — endpoint didn't accept it. Check your leadEndpoint URL.");
    }
    location.hash = "#/thankyou";
  }

  function renderThankYou() {
    const node = tpl("thankyou");
    mount(node);
    const lead = session.lastLead || {};
    $("#tyName").textContent = (lead.name || "there").split(" ")[0];
    $("#tyEmail").textContent = lead.email || "";
    if (CFG.calendlyUrl) {
      $("#tyCalendar").innerHTML =
        `<a class="btn primary lg" href="${esc(CFG.calendlyUrl)}" target="_blank" rel="noopener">${esc(CFG.consultCta || "Book your strategy call")}</a>`;
    }
    const contactBits = [];
    if (CFG.contactEmail) contactBits.push(`✉ <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a>`);
    if (CFG.contactPhone) contactBits.push(`☎ ${esc(CFG.contactPhone)}`);
    if (contactBits.length) $("#tyContact").innerHTML = "Questions now? Reach us at " + contactBits.join(" &nbsp;·&nbsp; ");
  }

  // ---------- Lead storage / admin ----------
  function getLeads() {
    try { return JSON.parse(localStorage.getItem(LEADS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveLeadLocally(lead) {
    const all = getLeads();
    all.unshift(lead);
    try { localStorage.setItem(LEADS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  function renderLeads() {
    const node = tpl("leads");
    mount(node);
    const mode = CFG.leadEndpoint
      ? `Live delivery is ON — leads also POST to your endpoint. This list is the local backup copy in this browser.`
      : `Demo mode — no endpoint configured, so leads are stored in this browser only. Set CONFIG.leadEndpoint in js/assessment.js to deliver them to you.`;
    $("#leadsMode").textContent = mode;

    const leads = getLeads();
    const wrap = $("#leadsTable");
    if (!leads.length) {
      wrap.innerHTML = `<div class="empty">No leads captured yet. Complete the assessment and submit the form to see one here.</div>`;
    } else {
      const rows = leads.map((l) => {
        const b = l.score >= 70 ? "hi" : l.score >= 40 ? "mid" : "lo";
        const when = new Date(l.submittedAt).toLocaleString();
        return `<tr>
          <td>${l.score != null ? `<span class="score-chip ${b}">${l.score}</span>` : "—"}<div class="muted">${esc(l.tier || "")}</div></td>
          <td><strong>${esc(l.name)}</strong><div class="muted">${esc(l.company)}</div></td>
          <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? `<div class="muted">${esc(l.phone)}</div>` : ""}</td>
          <td>${esc(l.goal || "—")}</td>
          <td class="muted">${esc(when)}</td>
        </tr>`;
      }).join("");
      wrap.innerHTML = `<table class="leads">
        <thead><tr><th>Score</th><th>Contact</th><th>Email / Phone</th><th>Goal</th><th>Submitted</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }

    $("#exportLeads").addEventListener("click", () => exportCsv(leads));
    $("#clearLeads").addEventListener("click", () => {
      if (!leads.length) return;
      if (confirm("Clear all locally-stored leads in this browser?")) {
        localStorage.removeItem(LEADS_KEY); renderLeads(); toast("Local leads cleared");
      }
    });
  }

  function exportCsv(leads) {
    if (!leads.length) { toast("No leads to export"); return; }
    const cols = ["submittedAt", "name", "email", "company", "phone", "score", "tier", "goal"];
    const escCsv = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(
      leads.map((l) => cols.map((c) => escCsv(l[c])).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "govcon-leads.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Exported CSV");
  }

  // ---------- Init ----------
  function init() {
    applyBranding();
    bindAssessmentNav();
    // "data-start" links always reset the wizard to question 1
    document.addEventListener("click", (e) => {
      const s = e.target.closest && e.target.closest("[data-start]");
      if (s) { session.index = 0; session.answers = {}; session.result = null; }
    });
    window.addEventListener("hashchange", router);
    router();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
