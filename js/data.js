/* Seed data + reference content for Command Center.
   Dates are computed relative to "today" so the demo always looks live.
   Everything here is fictional sample data — use "Reset demo" to restore it. */
(function () {
  const DAY = 86400000;
  const today = new Date();
  const iso = (offsetDays) => {
    const d = new Date(today.getTime() + offsetDays * DAY);
    return d.toISOString().slice(0, 10);
  };

  window.SEED = {
    clients: [
      { id: "c1", name: "Amara Osei",   company: "Northwind Logistics",     status: "active", mrr: 4500, since: iso(-420), email: "amara@northwind.co",     notes: "Anchor account. Quarterly business review due next month." },
      { id: "c2", name: "Daniel Reyes", company: "Reyes & Co. Legal",       status: "active", mrr: 2800, since: iso(-260), email: "d.reyes@reyeslegal.com", notes: "Expanding scope to include a second office." },
      { id: "c3", name: "Priya Nair",   company: "Lumen Health",            status: "active", mrr: 3600, since: iso(-150), email: "priya@lumenhealth.io",   notes: "Compliance-sensitive; keep all deliverables documented." },
      { id: "c4", name: "Tom Becker",   company: "Becker Fabrication",      status: "paused", mrr: 0,    since: iso(-540), email: "tom@beckerfab.com",     notes: "Paused for Q3 budget freeze. Revisit in September." },
      { id: "c5", name: "Grace Lin",    company: "Harbor Coffee Roasters",  status: "lead",   mrr: 0,    since: iso(-12),  email: "grace@harborroast.com", notes: "Warm intro from Amara. Proposal sent, awaiting sign-off." },
      { id: "c6", name: "Ike Adeyemi",  company: "Skyline Realty Group",    status: "active", mrr: 1900, since: iso(-95),  email: "ike@skylinerg.com",     notes: "Wants monthly reporting deck added to retainer." }
    ],

    projects: [
      { id: "p1", name: "Website relaunch",       clientId: "c1", status: "active",   progress: 70,  due: iso(9),   budget: 18000, notes: "Design approved. Dev sprint in progress." },
      { id: "p2", name: "Brand identity refresh", clientId: "c3", status: "active",   progress: 45,  due: iso(21),  budget: 12000, notes: "Logo concepts due for review Friday." },
      { id: "p3", name: "Q3 marketing campaign",  clientId: "c2", status: "blocked",  progress: 30,  due: iso(4),   budget: 9000,  notes: "Blocked on client-supplied ad copy." },
      { id: "p4", name: "CRM migration",          clientId: "c6", status: "planning", progress: 10,  due: iso(38),  budget: 7500,  notes: "Data audit scheduled next week." },
      { id: "p5", name: "Onboarding proposal",    clientId: "c5", status: "planning", progress: 20,  due: iso(6),   budget: 0,     notes: "Prospective — pending contract signature." },
      { id: "p6", name: "Annual report design",   clientId: "c1", status: "done",     progress: 100, due: iso(-14), budget: 6000,  notes: "Delivered and invoiced." }
    ],

    tasks: [
      { id: "t1",  title: "Send Q3 invoice to Northwind",    projectId: "p1",  priority: "high", status: "todo",  due: iso(-1) },
      { id: "t2",  title: "Review logo concepts with Priya", projectId: "p2",  priority: "high", status: "todo",  due: iso(2) },
      { id: "t3",  title: "Chase ad copy from Reyes & Co.",  projectId: "p3",  priority: "high", status: "doing", due: iso(0) },
      { id: "t4",  title: "Draft CRM data-audit checklist",  projectId: "p4",  priority: "med",  status: "todo",  due: iso(5) },
      { id: "t5",  title: "Follow up with Harbor Coffee",    projectId: "p5",  priority: "med",  status: "doing", due: iso(1) },
      { id: "t6",  title: "Prep monthly reporting deck",     projectId: null,  priority: "med",  status: "todo",  due: iso(3) },
      { id: "t7",  title: "Book quarterly review with Amara", projectId: "p1", priority: "low",  status: "todo",  due: iso(8) },
      { id: "t8",  title: "Update website copy — homepage",  projectId: "p1",  priority: "med",  status: "doing", due: iso(-2) },
      { id: "t9",  title: "Reconcile June expenses",         projectId: null,  priority: "low",  status: "done",  due: iso(-6) },
      { id: "t10", title: "Renew design software licenses",  projectId: null,  priority: "low",  status: "done",  due: iso(-4) }
    ],

    invoices: [
      { id: "i1", number: "INV-1042", clientId: "c1", amount: 6000, status: "paid",    issued: iso(-40), due: iso(-10) },
      { id: "i2", number: "INV-1048", clientId: "c1", amount: 4500, status: "sent",    issued: iso(-8),  due: iso(7) },
      { id: "i3", number: "INV-1049", clientId: "c2", amount: 2800, status: "overdue", issued: iso(-45), due: iso(-15) },
      { id: "i4", number: "INV-1051", clientId: "c3", amount: 3600, status: "sent",    issued: iso(-5),  due: iso(10) },
      { id: "i5", number: "INV-1052", clientId: "c6", amount: 1900, status: "paid",    issued: iso(-20), due: iso(-2) },
      { id: "i6", number: "INV-1055", clientId: "c3", amount: 5400, status: "draft",   issued: iso(0),   due: iso(30) }
    ],

    goals: [
      { id: "g1", title: "Monthly recurring revenue", current: 12800, target: 20000, unit: "$", due: iso(160) },
      { id: "g2", title: "Active clients",            current: 4,     target: 8,     unit: "",  due: iso(160) },
      { id: "g3", title: "New proposals sent (Q3)",   current: 3,     target: 10,    unit: "",  due: iso(60) },
      { id: "g4", title: "Cash reserve",              current: 24000, target: 40000, unit: "$", due: iso(240) }
    ]
  };

  // Light operating guidance shown on the "Playbook" view.
  window.PLAYBOOK = [
    { abbr: "CASH", title: "Watch cash, not just revenue",
      desc: "Revenue on paper isn't money in the bank. Track outstanding and overdue invoices weekly.",
      points: ["Invoice the day work is delivered, not at month-end.",
               "Chase anything overdue by 3+ days — a friendly nudge collects most of it.",
               "Keep a reserve of 3–6 months of operating costs."] },
    { abbr: "FOCUS", title: "Protect deep-work time",
      desc: "Client work compounds; admin doesn't. Batch admin, guard maker time.",
      points: ["Do the highest-leverage task first, before email.",
               "Batch invoicing, scheduling, and follow-ups into one block.",
               "Say no to scope that doesn't move a goal."] },
    { abbr: "PIPE", title: "Keep the pipeline warm",
      desc: "The best time to find the next client is before you need them.",
      points: ["Send at least a few proposals every month, even when busy.",
               "Ask happy clients for one intro each quarter.",
               "Follow up on leads within 24 hours."] },
    { abbr: "RENEW", title: "Never miss a renewal",
      desc: "Retainers, licenses, and contracts lapse quietly. Put every date on the board.",
      points: ["Add software and insurance renewals as low-priority tasks.",
               "Schedule quarterly reviews with anchor clients.",
               "Revisit paused accounts on their agreed restart date."] }
  ];
})();
