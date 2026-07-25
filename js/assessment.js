/* ============================================================
   Federal Contracting Readiness Assessment — content & scoring
   ------------------------------------------------------------
   EDIT THIS BLOCK to make the app yours. Nothing else required
   to go live except pasting a leadEndpoint (see below).
   ============================================================ */
window.CONFIG = {
  brandName: "The Global Connects",
  brandMark: "🎯",
  tagline: "GovCon Advisory",
  headline: "Are you ready to win federal contracts?",
  subhead: "Take the free 2-minute readiness assessment. Get your Federal Contracting Readiness Score, a category-by-category breakdown, and a tailored action plan — instantly.",
  consultCta: "Book my free 30-minute strategy call",

  // Your contact details (shown on the results / thank-you screen)
  contactEmail: "hamza@theglobalconnects.com",
  contactPhone: "",            // optional, e.g. "(555) 123-4567"
  calendlyUrl: "",             // optional: paste your Calendly/booking link to turn the CTA into a button

  // ---- LEAD DELIVERY --------------------------------------------------
  // Where completed leads are POSTed as JSON.
  //
  // RECOMMENDED: our own Lead Engine backend (see backend/). It scores,
  // de-dupes, and stores every lead and shows them on an admin dashboard.
  // Point this at its webhook route, including the shared secret:
  //
  //   leadEndpoint: "https://YOUR-HOST/webhook/lead?secret=YOUR_WEBHOOK_SECRET"
  //
  // (Or use an API key instead of the secret — see backend/README.md.)
  //
  // Any other form/webhook endpoint also works (Formspree, Netlify Forms,
  // Zapier/Make, a Google Apps Script URL, your CRM, etc.).
  //
  // Leave "" to run in demo mode: leads are saved in the browser and viewable
  // via the "View captured leads" link in the footer.
  leadEndpoint: ""
};

/* Each question scores 0–100 on a category. Category scores are averaged,
   then combined by weight into the overall readiness score. */
window.ASSESSMENT = {
  categories: {
    eligibility:  { label: "Registration & Eligibility", weight: 0.25 },
    certs:        { label: "Certifications & Set-Asides", weight: 0.20 },
    past:         { label: "Past Performance & Capability", weight: 0.20 },
    pipeline:     { label: "Pipeline & Market Positioning", weight: 0.20 },
    proposal:     { label: "Proposal Readiness", weight: 0.15 }
  },

  questions: [
    {
      id: "sam",
      category: "eligibility",
      text: "Is your business actively registered in SAM.gov?",
      help: "An active SAM.gov registration (with a UEI) is the baseline requirement to receive any federal award.",
      options: [
        { label: "Yes — active, with a UEI", score: 100 },
        { label: "Registered, but it's expired or lapsed", score: 45 },
        { label: "In progress", score: 25 },
        { label: "Not yet / not sure what that is", score: 0 }
      ]
    },
    {
      id: "naics",
      category: "eligibility",
      text: "Have you identified the NAICS codes that match what you sell?",
      help: "NAICS codes define your industry and the small-business size standards you're measured against.",
      options: [
        { label: "Yes — primary and secondary codes selected", score: 100 },
        { label: "I have a rough idea", score: 55 },
        { label: "No, not yet", score: 10 }
      ]
    },
    {
      id: "smallbiz",
      category: "eligibility",
      text: "Do you qualify as a small business under your primary NAICS size standard?",
      help: "Most set-aside opportunities require you to be under the SBA size standard (by revenue or headcount).",
      options: [
        { label: "Yes, comfortably", score: 100 },
        { label: "Yes, but close to the threshold", score: 80 },
        { label: "No / we're other-than-small", score: 50 },
        { label: "Not sure", score: 30 }
      ]
    },
    {
      id: "setaside",
      category: "certs",
      text: "Do you hold — or could you qualify for — a socioeconomic set-aside?",
      help: "8(a), WOSB/EDWOSB, HUBZone, SDVOSB/VOSB certifications open up reserved competition with far less competition.",
      options: [
        { label: "Yes — already certified in one or more", score: 100 },
        { label: "Likely eligible but not yet certified", score: 60 },
        { label: "Not eligible, but pursuing full & open work", score: 45 },
        { label: "Not sure what I qualify for", score: 20 }
      ]
    },
    {
      id: "capstatement",
      category: "certs",
      text: "Do you have a professional capability statement?",
      help: "A one-page capability statement is the calling card contracting officers expect before they'll engage.",
      options: [
        { label: "Yes — polished and current", score: 100 },
        { label: "Have one, but it needs work", score: 55 },
        { label: "No", score: 0 }
      ]
    },
    {
      id: "govpast",
      category: "past",
      text: "Have you performed government work (federal, state, or local) before?",
      help: "Past performance is one of the most heavily weighted evaluation factors in federal source selection.",
      options: [
        { label: "Yes — multiple federal contracts", score: 100 },
        { label: "Yes — state/local or subcontracts", score: 70 },
        { label: "No, but strong commercial past performance", score: 45 },
        { label: "Limited past performance overall", score: 20 }
      ]
    },
    {
      id: "revenue",
      category: "past",
      text: "What is your current annual revenue?",
      help: "Agencies assess whether your size and financial footing match the contracts you pursue.",
      options: [
        { label: "$5M+", score: 100 },
        { label: "$1M – $5M", score: 85 },
        { label: "$250K – $1M", score: 60 },
        { label: "Under $250K / pre-revenue", score: 30 }
      ]
    },
    {
      id: "targets",
      category: "pipeline",
      text: "Have you identified specific agencies or buying offices to target?",
      help: "Winners focus. Knowing which agencies buy what you sell — and their incumbents — is half the battle.",
      options: [
        { label: "Yes — a defined target list", score: 100 },
        { label: "A general idea of the market", score: 55 },
        { label: "No — casting a wide net", score: 15 }
      ]
    },
    {
      id: "tracking",
      category: "pipeline",
      text: "Are you actively tracking open opportunities (SAM.gov, GSA eBuy, forecasts)?",
      help: "A managed pipeline of solicitations and agency forecasts is how you bid early instead of scrambling.",
      options: [
        { label: "Yes — a managed pipeline with deadlines", score: 100 },
        { label: "I check occasionally", score: 50 },
        { label: "Not at all", score: 10 }
      ]
    },
    {
      id: "teaming",
      category: "pipeline",
      text: "Do you have teaming partners or subcontracting relationships?",
      help: "Teaming lets you bid larger work and borrow past performance you don't yet have on your own.",
      options: [
        { label: "Yes — established partners", score: 100 },
        { label: "A few informal contacts", score: 55 },
        { label: "None yet", score: 20 }
      ]
    },
    {
      id: "bidhistory",
      category: "proposal",
      text: "Have you submitted a federal proposal before?",
      help: "Proposal experience — and understanding compliance, evaluation factors, and pricing — sharply raises win rates.",
      options: [
        { label: "Yes — and won at least one", score: 100 },
        { label: "Yes — submitted, still working on wins", score: 70 },
        { label: "No, never bid", score: 20 }
      ]
    },
    {
      id: "process",
      category: "proposal",
      text: "Do you have a repeatable process for pricing and writing proposals?",
      help: "A compliant, repeatable proposal and pricing process is what turns one-off luck into a win rate.",
      options: [
        { label: "Yes — defined and repeatable", score: 100 },
        { label: "Somewhat ad hoc", score: 50 },
        { label: "No process yet", score: 10 }
      ]
    }
  ],

  // Score tiers → headline + framing on the results screen
  tiers: [
    { min: 80, name: "Contract-Ready", blurb: "You have the foundations in place. The focus now is targeting the right opportunities and sharpening win strategy to convert your readiness into awards." },
    { min: 55, name: "Emerging Contender", blurb: "You've made real progress. A few strategic gaps are standing between you and a repeatable pipeline of winnable opportunities." },
    { min: 30, name: "Developing", blurb: "You have momentum but key building blocks are missing. Closing them in the right order will dramatically improve your odds." },
    { min: 0,  name: "Getting Started", blurb: "You're early — which is the perfect time to build on the right foundation and avoid the costly mistakes that stall most new contractors." }
  ],

  /* Recommendation rules. Each fires when the answer to `q` is at/below
     `atOrBelow` (by option index; higher index = weaker answer). Ordered by
     priority; the results screen shows the top few that fire. */
  recommendations: [
    { q: "sam", atOrBelow: 1, text: "Get your SAM.gov registration active and current — nothing else can proceed until this is done. We can walk you through UEI and CAGE setup." },
    { q: "naics", atOrBelow: 1, text: "Lock in your primary and secondary NAICS codes so you're bidding in the right lanes and measured against the right size standards." },
    { q: "setaside", atOrBelow: 1, text: "Run a set-aside eligibility review (8(a), WOSB, HUBZone, SDVOSB). Certifying into a reserved category is often the single biggest win-rate lever." },
    { q: "capstatement", atOrBelow: 1, text: "Build (or refresh) a one-page capability statement — the document contracting officers expect before they'll take a meeting." },
    { q: "targets", atOrBelow: 1, text: "Develop a focused target list of agencies and buying offices that actually purchase what you sell, with their incumbents mapped." },
    { q: "tracking", atOrBelow: 1, text: "Stand up a managed opportunity pipeline (SAM.gov, GSA eBuy, agency forecasts) so you bid early instead of reacting to deadlines." },
    { q: "teaming", atOrBelow: 1, text: "Start building teaming and subcontracting relationships to bid larger work and strengthen your past-performance story." },
    { q: "bidhistory", atOrBelow: 1, text: "Pursue an initial, winnable bid (or subcontract) to establish federal past performance and learn the proposal process on lower stakes." },
    { q: "process", atOrBelow: 1, text: "Put a repeatable pricing and proposal process in place so your win rate stops depending on luck." },
    { q: "govpast", atOrBelow: 2, text: "Package your commercial past performance into a federal-relevant format, and consider subcontracting to build a federal track record." }
  ]
};
