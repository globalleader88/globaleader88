/* Seed data + reference content for Global Connects Services — Command Center.
   Dates are computed relative to "today" so the demo always looks live.
   Everything here is fictional sample data — use "Reset demo" to restore it.

   Modeled for a federal facility-services contractor (janitorial, grounds,
   building maintenance): "clients" are contracting agencies / prime partners,
   "projects" are contracts & task orders, "invoices" bill through WAWF/IPP. */
(function () {
  const DAY = 86400000;
  const today = new Date();
  const iso = (offsetDays) => {
    const d = new Date(today.getTime() + offsetDays * DAY);
    return d.toISOString().slice(0, 10);
  };

  window.SEED = {
    // Agencies & prime partners we hold work with (mrr = current monthly contract value)
    clients: [
      { id: "c1", name: "Denise Carter (CO)",  company: "GSA — Region 4",              status: "active", mrr: 42000, since: iso(-560), email: "denise.carter@gsa.gov",     notes: "Custodial IDIQ, base year of five. CO responsive; QC scores strong." },
      { id: "c2", name: "James Whitfield (COR)", company: "VA — Atlanta VA Medical Ctr", status: "active", mrr: 28500, since: iso(-410), email: "james.whitfield@va.gov",     notes: "Grounds maintenance. Storm-cleanup change orders common in summer." },
      { id: "c3", name: "Angela Ruiz (Fac. Lead)", company: "CDC — Roybal Campus",      status: "active", mrr: 51000, since: iso(-215), email: "aruiz@cdc.gov",             notes: "HVAC & building maintenance. Badge access for techs is the bottleneck." },
      { id: "c4", name: "Robert Hayes (KO)",   company: "USACE — Savannah District",    status: "paused", mrr: 0,     since: iso(-720), email: "robert.hayes@usace.army.mil", notes: "Seasonal snow/ice contract. Awaiting option-year exercise." },
      { id: "c5", name: "Maria Lopez (SB Spec.)", company: "DHS — CBP",                 status: "lead",   mrr: 0,     since: iso(-14),  email: "maria.lopez@cbp.dhs.gov",   notes: "Janitorial RFQ under SDVOSB set-aside. Quote submitted, awaiting award." },
      { id: "c6", name: "David Cole (SubK Mgr)", company: "Turner Facility Partners",   status: "active", mrr: 15500, since: iso(-150), email: "dcole@turnerfp.com",        notes: "We sub custodial under their prime. Reliable, net-15 payer." }
    ],

    // Contracts & task orders (budget = annual/period value, due = next milestone)
    projects: [
      { id: "p1", name: "Custodial — R.B. Russell Fed. Building", clientId: "c1", status: "active",   progress: 65,  due: iso(24), budget: 504000, notes: "Base year of five. Next: option-exercise review with CO." },
      { id: "p2", name: "Grounds maintenance — Atlanta VAMC",     clientId: "c2", status: "active",   progress: 80,  due: iso(12), budget: 342000, notes: "Peak growing season. May need a second crew for storm cleanup." },
      { id: "p3", name: "HVAC & building maintenance — CDC",      clientId: "c3", status: "blocked",  progress: 40,  due: iso(5),  budget: 612000, notes: "Blocked on government-furnished badge access for 2 techs." },
      { id: "p4", name: "Recompete — GSA R4 custodial IDIQ",      clientId: "c1", status: "planning", progress: 25,  due: iso(34), budget: 0,      notes: "RFP expected ~next month. Build the past-performance volume now." },
      { id: "p5", name: "Phase-in — DHS CBP janitorial",         clientId: "c5", status: "planning", progress: 10,  due: iso(9),  budget: 0,      notes: "Contingent on award. 30-day phase-in & staffing plan drafted." },
      { id: "p6", name: "Snow & ice removal — USACE Savannah",   clientId: "c4", status: "done",     progress: 100, due: iso(-20), budget: 96000, notes: "Season complete. Final invoice submitted and paid." }
    ],

    tasks: [
      { id: "t1",  title: "Submit monthly QC report to COR (VAMC)", projectId: "p2",  priority: "high", status: "todo",  due: iso(-1) },
      { id: "t2",  title: "Renew SAM.gov registration",             projectId: null,  priority: "high", status: "todo",  due: iso(12) },
      { id: "t3",  title: "Escalate badge access with CDC facilities", projectId: "p3", priority: "high", status: "doing", due: iso(0) },
      { id: "t4",  title: "Onboard 3 custodians — background checks", projectId: "p1", priority: "med",  status: "todo",  due: iso(5) },
      { id: "t5",  title: "Draft past-performance volume (recompete)", projectId: "p4", priority: "high", status: "doing", due: iso(3) },
      { id: "t6",  title: "Submit monthly invoice via WAWF",        projectId: null,  priority: "med",  status: "todo",  due: iso(2) },
      { id: "t7",  title: "Schedule quarterly floor strip & wax",   projectId: "p1",  priority: "low",  status: "todo",  due: iso(8) },
      { id: "t8",  title: "Update SDS binder & safety compliance",  projectId: null,  priority: "med",  status: "doing", due: iso(-2) },
      { id: "t9",  title: "Restock consumables (paper, liners)",    projectId: "p1",  priority: "low",  status: "done",  due: iso(-6) },
      { id: "t10", title: "Verify SCA wage determination on new TO", projectId: "p5", priority: "low",  status: "done",  due: iso(-4) }
    ],

    // Invoices billed through WAWF / IPP
    invoices: [
      { id: "i1", number: "INV-2041", clientId: "c1", amount: 42000, status: "paid",    issued: iso(-40), due: iso(-10) },
      { id: "i2", number: "INV-2048", clientId: "c1", amount: 42000, status: "sent",    issued: iso(-8),  due: iso(22) },
      { id: "i3", number: "INV-2049", clientId: "c2", amount: 28500, status: "overdue", issued: iso(-45), due: iso(-15) },
      { id: "i4", number: "INV-2051", clientId: "c3", amount: 51000, status: "sent",    issued: iso(-5),  due: iso(25) },
      { id: "i5", number: "INV-2052", clientId: "c6", amount: 15500, status: "paid",    issued: iso(-20), due: iso(-5) },
      { id: "i6", number: "INV-2055", clientId: "c2", amount: 9500,  status: "draft",   issued: iso(0),   due: iso(30) }
    ],

    goals: [
      { id: "g1", title: "Funded contract backlog", current: 1450000, target: 2500000, unit: "$", due: iso(180) },
      { id: "g2", title: "Active task orders",      current: 4,       target: 7,       unit: "",  due: iso(180) },
      { id: "g3", title: "On-time QC reports",      current: 92,      target: 100,     unit: "%", due: iso(90) },
      { id: "g4", title: "Cash reserve",            current: 68000,   target: 120000,  unit: "$", due: iso(240) }
    ]
  };

  // Operating principles tuned to federal facility-services contracting.
  window.PLAYBOOK = [
    { abbr: "CASH", title: "Bill the day the period closes",
      desc: "On government work, cash is a paperwork game. File in WAWF/IPP promptly and watch your DSO.",
      points: ["Submit each invoice in WAWF the day the billing period ends.",
               "Track Prompt Payment Act net-30 dates; follow up the moment one slips.",
               "Keep a reserve — option years and phase-ins can delay payment."] },
    { abbr: "COMPLY", title: "Never let a registration lapse",
      desc: "SAM.gov, wage determinations, insurance and safety are pass/fail — one lapse can stop payment.",
      points: ["Renew SAM.gov every 12 months; set a task 45 days out.",
               "Apply the current SCA wage determination to every task order.",
               "Keep SDS binders and safety records inspection-ready."] },
    { abbr: "PERFORM", title: "Protect your past performance",
      desc: "QC scores and CPARS ratings are the currency that wins the recompete.",
      points: ["Deliver monthly QC reports to the COR on time, every time.",
               "Fix findings fast and document the corrective action.",
               "Start the recompete past-performance volume months early."] },
    { abbr: "PIPELINE", title: "Line up the next award",
      desc: "The best time to win the next contract is before the current one options out.",
      points: ["Watch SAM.gov for set-aside opportunities in your NAICS.",
               "Team with primes to reach work you can't prime yet.",
               "Calendar every option-year and recompete date on the board."] }
  ];
})();
