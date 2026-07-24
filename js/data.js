/* Seed data + reference content for GovBid Command.
   Dates are computed relative to "today" so the demo always looks live. */
(function () {
  const DAY = 86400000;
  const today = new Date();
  const iso = (offsetDays) => {
    const d = new Date(today.getTime() + offsetDays * DAY);
    return d.toISOString().slice(0, 10);
  };

  window.SEED = {
    opportunities: [
      { id: "op1", title: "IT Help Desk Support Services", agency: "Dept. of Veterans Affairs",
        solicitation: "36C10X25Q0148", naics: "541519", setAside: "SDVOSB", value: 1850000,
        stage: "bidding", dueDate: iso(4), probability: 65,
        notes: "Incumbent contract expiring. Strong past performance at VISN 8. Need CMMC L2 attestation." },
      { id: "op2", title: "Grounds Maintenance — Fort Liberty", agency: "Dept. of the Army",
        solicitation: "W91247-25-R-0031", naics: "561730", setAside: "Small Business", value: 640000,
        stage: "reviewing", dueDate: iso(12), probability: 40,
        notes: "Site visit scheduled. Wage determination attached to solicitation." },
      { id: "op3", title: "Cybersecurity Assessment & A&A Support", agency: "Dept. of Homeland Security",
        solicitation: "70RCSA25R00000021", naics: "541512", setAside: "8(a)", value: 3200000,
        stage: "submitted", dueDate: iso(-2), probability: 55,
        notes: "Proposal submitted 6/2. Oral presentations expected next week." },
      { id: "op4", title: "Medical Courier Services", agency: "Dept. of Veterans Affairs",
        solicitation: "36C24825Q0410", naics: "492110", setAside: "SDVOSB", value: 420000,
        stage: "identified", dueDate: iso(21), probability: 30,
        notes: "New requirement. Confirm vehicle & driver certification requirements." },
      { id: "op5", title: "Cloud Migration — Legacy Financial Systems", agency: "Dept. of the Treasury",
        solicitation: "2032H825R00019", naics: "541511", setAside: "WOSB", value: 5400000,
        stage: "bidding", dueDate: iso(2), probability: 50,
        notes: "Teaming with a large business as sub. FedRAMP Moderate required." },
      { id: "op6", title: "Janitorial Services — Federal Courthouse", agency: "General Services Administration",
        solicitation: "47PA0525R0007", naics: "561720", setAside: "HUBZone", value: 280000,
        stage: "won", dueDate: iso(-25), probability: 100,
        notes: "Awarded 6/28. Transition-in begins first week of the period of performance." },
      { id: "op7", title: "Language Translation Services", agency: "Dept. of State",
        solicitation: "19AQMM25Q0233", naics: "541930", setAside: "Small Business", value: 960000,
        stage: "lost", dueDate: iso(-40), probability: 0,
        notes: "Lost on price. Requested debrief; awardee bid ~14% lower." },
      { id: "op8", title: "UAS Sensor Integration R&D", agency: "Dept. of the Air Force",
        solicitation: "FA8750-25-S-7012", naics: "541715", setAside: "", value: 2100000,
        stage: "reviewing", dueDate: iso(9), probability: 35,
        notes: "SBIR Phase II follow-on potential. Full & open — will need strong differentiators." }
    ],

    certifications: [
      { id: "c1", name: "SAM.gov Registration", type: "Registration", expires: iso(38),
        identifier: "UEI: X1Y2Z3ABC456 · CAGE: 8K9L2" },
      { id: "c2", name: "SDVOSB Certification (VA CVE / SBA)", type: "Certification", expires: iso(210),
        identifier: "Verified small business — VetCert" },
      { id: "c3", name: "8(a) Business Development Program", type: "Certification", expires: iso(540),
        identifier: "9-year program term" },
      { id: "c4", name: "HUBZone Certification", type: "Certification", expires: iso(15),
        identifier: "Recertification due — confirm principal office & 35% residency" },
      { id: "c5", name: "CMMC Level 2 Assessment", type: "Certification", expires: iso(95),
        identifier: "C3PAO assessment on file" },
      { id: "c6", name: "General Liability Insurance", type: "Insurance", expires: iso(-5),
        identifier: "Policy GLB-88213 — LAPSED, renew immediately" },
      { id: "c7", name: "Facility Security Clearance (FCL)", type: "Clearance", expires: iso(300),
        identifier: "Secret — DCSA sponsored" }
    ]
  };

  window.SETASIDE_REFERENCE = [
    { abbr: "SB", name: "Small Business Set-Aside",
      desc: "Competition restricted to firms that meet the SBA size standard for the solicitation's NAICS code.",
      points: ["Rule of Two: reserved when 2+ capable small businesses are expected to bid.",
               "Size standard is set per NAICS (employees or annual receipts).",
               "Foundation for most other set-aside programs."] },
    { abbr: "8(a)", name: "8(a) Business Development",
      desc: "Program for small firms owned by socially & economically disadvantaged individuals.",
      points: ["Nine-year program term, non-renewable.",
               "Eligible for sole-source awards up to threshold limits.",
               "Requires ongoing SBA annual review."] },
    { abbr: "WOSB", name: "Women-Owned Small Business",
      desc: "For firms at least 51% owned and controlled by women, in eligible NAICS industries.",
      points: ["EDWOSB variant adds an economic-disadvantage test.",
               "Self-certify or use an SBA-approved third-party certifier.",
               "Applies only in designated underrepresented industries."] },
    { abbr: "HUBZone", name: "Historically Underutilized Business Zone",
      desc: "Encourages economic development in designated HUBZone areas.",
      points: ["Principal office must be in a HUBZone.",
               "≥35% of employees must reside in a HUBZone.",
               "Provides a 10% price evaluation preference in full & open bids."] },
    { abbr: "SDVOSB", name: "Service-Disabled Veteran-Owned SB",
      desc: "For firms at least 51% owned by one or more service-disabled veterans.",
      points: ["Certified through SBA VetCert.",
               "VA gives priority under the 'Vets First' contracting program.",
               "Sole-source and set-aside authority available."] },
    { abbr: "VOSB", name: "Veteran-Owned Small Business",
      desc: "For veteran-owned firms; strongest advantage on VA acquisitions.",
      points: ["Registered/verified via SBA VetCert.",
               "VA 'Vets First' priority ahead of other set-asides.",
               "Often paired with SDVOSB eligibility."] }
  ];
})();
