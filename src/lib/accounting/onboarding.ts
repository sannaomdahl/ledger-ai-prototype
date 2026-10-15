// Onboarding: how a company becomes a customer. One record from the first
// meeting to the hand-over to operations, moving through four phases, each
// approved by a person:
//
//   Assessment → Offer → Setup → Takeover → (in operation)
//
// Assessment decides whether to take them on (register check, SAF-T, the
// agent's read of both, then a yes from the accountant and from sales). The
// offer is the contract: sending it opens a link the company follows to sign,
// and the same link carries the setup and takeover tasks that need them. Setup
// sorts out access, agreements and systems; Takeover checks the books close to
// the takeover date, since that evidence goes stale if checked early. Approving
// the takeover hands the company to operations, where it becomes a client like
// any other. Nothing moves a phase on by itself: tasks and dates can only block
// the approval.

import { ACCOUNTANT_BY_ID, addDays, hash, monthLabel, nextMonth, OPEN_MONTH, TEAM_BY_ID } from "./data"
import { TODAY } from "./deadlines"
import { cadenceLabel, defaultRoutines, invoicingLines, ordinal, type Cadence } from "./routines"
import type { BankAccount, Client, IndustryKey, Person, Stamp } from "./types"

// ── Phases ──

export type Phase = "assessment" | "offer" | "setup" | "takeover"

export const PHASES: { id: Phase; label: string }[] = [
  { id: "assessment", label: "Assessment" },
  { id: "offer", label: "Offer" },
  { id: "setup", label: "Setup" },
  { id: "takeover", label: "Takeover" },
]

export const PHASE_LABEL = Object.fromEntries(
  PHASES.map((p) => [p.id, p.label])
) as Record<Phase, string>

export function phaseIndex(phase: Phase) {
  return PHASES.findIndex((p) => p.id === phase)
}

/** The firm's own registration, for the Altinn task. */
export const FIRM = { name: "Sanna AS", orgNo: "912 345 678" }

/** Who signs off the commercial side of an assessment. */
export const SALES_ID = "emma"

// ── The register (Brønnøysund, mocked) ──

export type Light = "green" | "yellow" | "red" | "grey"

export type Finding = {
  area: string
  light: Light
  text: string
}

/** A company as the register knows it, plus what its SAF-T files would show
    once they arrive. Every company that can be onboarded is listed here, so
    each case page can be pre-rendered for the static build. */
export type RegisterCompany = {
  id: string
  name: string
  orgNo: string
  legalForm: "AS" | "ENK" | "ANS"
  status: "Active" | "Bankrupt" | "In liquidation"
  industry: string
  /** NACE code and text, as registered. */
  nace: string
  /** Primary industries, finance, insurance and gambling are not taken on. */
  excludedIndustry?: boolean
  employees: number
  city: string
  revenue: number
  equity: number
  auditor?: string
  currentAccountant?: string
  /** Their VAT term in the VAT register. Bi-monthly unless said. */
  vatTerm?: "Bi-monthly" | "Annual"
  contact: Person
  /** The register of beneficial owners. Left out: the contact owns it all. */
  owners?: { name: string; share: number }[]
  saft: {
    /** What the agent reads from the files. */
    findings: Finding[]
    sourceSystem: string
    vouchersPerYear: number
    /** What they pay for accounting today, per month. */
    currentFee: number
    /** The agent's internal price estimate, per month. */
    monthlyPrice: number
    /** Recurring hours per month. */
    workload: number
    summary: string
  }
  /** The agent's read before SAF-T arrives: register, web and the meeting. */
  preliminary: string
}

function person(name: string, role: string, domain: string): Person {
  const [first, last] = name.split(" ")
  const h = hash(name)
  return {
    id: first.toLowerCase(),
    name,
    role,
    initials: `${first[0]}${last?.[0] ?? ""}`,
    email: `${first.toLowerCase()}@${domain}`,
    phone: `+47 ${900 + (h % 90)} ${String(10 + (h % 89)).padStart(2, "0")} ${String(100 + (h % 899)).slice(0, 3)}`,
  }
}

const GREEN_BOOKS: Finding[] = [
  { area: "Transactions", light: "green", text: "Steady volume, no gaps in voucher numbers." },
  { area: "Going concern", light: "green", text: "Positive equity and liquidity covers three months of costs." },
  { area: "Tax payments", light: "green", text: "Withholding tax and VAT paid on time all year." },
]

export const REGISTER: RegisterCompany[] = [
  {
    id: "vestfjord-sykkel",
    name: "Vestfjord Sykkelverksted AS",
    orgNo: "931 204 557",
    legalForm: "AS",
    status: "Active",
    industry: "Bike repair & shop",
    nace: "95.290 Repair of other personal goods",
    employees: 4,
    city: "Bodø",
    revenue: 6_400_000,
    equity: 820_000,
    currentAccountant: "Self-managed (Fiken)",
    contact: person("Eirik Strand", "Owner", "vestfjordsykkel.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Inventory", light: "yellow", text: "Spare-parts stock counted once a year; 1 400 lines on 1460." },
        { area: "Cash", light: "yellow", text: "Card terminal and Vipps, some cash sales in summer." },
      ],
      sourceSystem: "Fiken",
      vouchersPerYear: 2_100,
      currentFee: 0,
      monthlyPrice: 4_900,
      workload: 6,
      summary:
        "Small, tidy retail and repair business. Stock and seasonal cash sales are the only things to agree on routines for.",
    },
    preliminary:
      "Register and web look fine: active AS, 4 employees, a shop in Bodø with good reviews. Books do it themselves in Fiken, and we only work in Tripletex for now: they'd have to move first. Without SAF-T the price is a rough estimate.",
  },
  {
    id: "gronn-hage",
    name: "Grønn Hage Kafé AS",
    orgNo: "927 880 132",
    legalForm: "AS",
    status: "Active",
    industry: "Café",
    nace: "56.101 Restaurants",
    employees: 7,
    city: "Stavanger",
    revenue: 9_800_000,
    equity: 410_000,
    currentAccountant: "Sola Regnskap AS",
    contact: person("Maja Eide", "Daily manager", "gronnhage.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Cash", light: "yellow", text: "Cash is 18 % of sales. Needs a daily Z-report routine." },
        { area: "Payroll", light: "green", text: "7 on payroll, hourly staff, stable over the year." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 3_600,
      currentFee: 9_500,
      monthlyPrice: 8_400,
      workload: 11,
      summary:
        "Healthy café on Tripletex already. Cash share is high for the segment: agree a Z-report routine at setup.",
    },
    preliminary: "Café in Stavanger, on Tripletex with Sola Regnskap today.",
  },
  {
    id: "nordkyst-havbruk",
    name: "Nordkyst Havbruk AS",
    orgNo: "915 664 018",
    legalForm: "AS",
    status: "Active",
    industry: "Fish farming",
    nace: "03.211 Marine aquaculture",
    excludedIndustry: true,
    employees: 22,
    city: "Hammerfest",
    revenue: 74_000_000,
    equity: 12_500_000,
    auditor: "BDO AS",
    currentAccountant: "Finnmark Økonomi AS",
    contact: person("Trond Isaksen", "CFO", "nordkysthavbruk.no"),
    saft: {
      findings: GREEN_BOOKS,
      sourceSystem: "Visma",
      vouchersPerYear: 9_000,
      currentFee: 32_000,
      monthlyPrice: 29_000,
      workload: 38,
      summary: "Large aquaculture business with biological assets.",
    },
    preliminary:
      "Aquaculture is a primary industry, which we don't take on: biological asset valuation and fish-farming licences are outside what the team covers.",
  },
  {
    id: "kollen-fysio",
    name: "Kollen Fysioterapi AS",
    orgNo: "924 117 360",
    legalForm: "AS",
    status: "Active",
    industry: "Physiotherapy clinic",
    nace: "86.950 Physiotherapy",
    employees: 5,
    city: "Oslo",
    revenue: 5_200_000,
    equity: 690_000,
    currentAccountant: "Holmenkollen Regnskap",
    // Treatment is exempt; only the retail shelf carries VAT, well under
    // 1 MNOK a year, so they report once a year.
    vatTerm: "Annual",
    contact: person("Nora Brekke", "Owner", "kollenfysio.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "VAT", light: "green", text: "Treatment is VAT exempt; no mixed activity." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 1_400,
      currentFee: 6_200,
      monthlyPrice: 5_400,
      workload: 6,
      summary: "Simple, VAT-exempt clinic with municipal grants. A good fit.",
    },
    preliminary: "Physio clinic, VAT exempt.",
  },
  {
    id: "brattli-elektro",
    name: "Brattli Elektro AS",
    orgNo: "919 402 885",
    legalForm: "AS",
    status: "Active",
    industry: "Electrician",
    nace: "43.210 Electrical installation",
    employees: 14,
    city: "Trondheim",
    revenue: 21_000_000,
    equity: 2_300_000,
    auditor: "Revisorgruppen Midt AS",
    currentAccountant: "Trøndelag Regnskap AS",
    contact: person("Henrik Brattli", "Managing director", "brattlielektro.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Revenue recognition", light: "yellow", text: "Project billing on account; work in progress not accrued at year end." },
        { area: "Payroll", light: "green", text: "14 on payroll with travel allowances; tidy." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 6_800,
      currentFee: 18_000,
      monthlyPrice: 15_900,
      workload: 21,
      summary: "Project business; work in progress needs a month-end routine.",
    },
    preliminary: "Electrical contractor in Trondheim.",
  },
  {
    id: "lunde-transport",
    name: "Lunde Transport AS",
    orgNo: "922 715 409",
    legalForm: "AS",
    status: "Active",
    industry: "Logistics",
    nace: "49.410 Freight transport by road",
    employees: 9,
    city: "Drammen",
    revenue: 16_500_000,
    equity: 1_150_000,
    currentAccountant: "Drammen Regnskapskontor",
    contact: person("Ola Lunde", "Owner", "lundetransport.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Fuel and toll", light: "green", text: "Fuel cards and AutoPASS invoiced monthly." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 4_500,
      currentFee: 12_000,
      monthlyPrice: 10_900,
      workload: 14,
      summary: "Road freight with leased trucks and fuel cards.",
    },
    preliminary: "Freight company, 9 drivers.",
  },
  {
    id: "sentrum-optikk",
    name: "Sentrum Optikk AS",
    orgNo: "926 330 271",
    legalForm: "AS",
    status: "Active",
    industry: "Optician",
    nace: "47.782 Optician",
    employees: 3,
    city: "Bergen",
    revenue: 4_100_000,
    equity: 530_000,
    currentAccountant: "Bergen Regnskap AS",
    contact: person("Ingvild Rasmussen", "Owner", "sentrumoptikk.no"),
    saft: {
      findings: GREEN_BOOKS,
      sourceSystem: "Tripletex",
      vouchersPerYear: 1_900,
      currentFee: 5_900,
      monthlyPrice: 4_900,
      workload: 6,
      summary: "Small retail shop with stock of frames.",
    },
    preliminary: "Optician in Bergen.",
  },
  {
    id: "molla-bakeri",
    name: "Mølla Bakeri AS",
    orgNo: "921 058 846",
    legalForm: "AS",
    status: "Active",
    industry: "Bakery",
    nace: "10.710 Bread and fresh pastry",
    employees: 11,
    city: "Oslo",
    revenue: 12_700_000,
    equity: 960_000,
    currentAccountant: "Grünerløkka Regnskap",
    contact: person("Sindre Moe", "Daily manager", "mollabakeri.no"),
    owners: [
      { name: "Sindre Moe", share: 50 },
      { name: "Hanne Moe", share: 50 },
    ],
    saft: {
      findings: GREEN_BOOKS,
      sourceSystem: "Tripletex",
      vouchersPerYear: 5_200,
      currentFee: 13_500,
      monthlyPrice: 11_900,
      workload: 15,
      summary: "Bakery with two shops and wholesale to cafés.",
    },
    preliminary: "Bakery, two shops.",
  },
  // Not onboarding yet: what "New customer" finds in the register.
  {
    id: "havly-yoga",
    name: "Havly Yoga AS",
    orgNo: "932 118 640",
    legalForm: "AS",
    status: "Active",
    industry: "Yoga studio",
    nace: "93.130 Fitness facilities",
    employees: 3,
    city: "Tromsø",
    revenue: 2_900_000,
    equity: 240_000,
    currentAccountant: "Self-managed (Tripletex)",
    contact: person("Selma Nygaard", "Owner", "havlyyoga.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Revenue recognition", light: "yellow", text: "Memberships paid a year ahead are booked as income on payment." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 900,
      currentFee: 0,
      monthlyPrice: 3_900,
      workload: 4,
      summary: "Small studio; prepaid memberships need accruing.",
    },
    preliminary:
      "Active AS, 3 employees, a studio in Tromsø. Bookkeeping done by the owner in Tripletex. The price is a rough estimate until SAF-T arrives.",
  },
  {
    id: "polar-kaffe",
    name: "Polar Kaffebrenneri AS",
    orgNo: "929 554 017",
    legalForm: "AS",
    status: "Active",
    industry: "Coffee roastery",
    nace: "10.830 Tea and coffee processing",
    employees: 6,
    city: "Tromsø",
    revenue: 8_200_000,
    equity: -180_000,
    currentAccountant: "Nord Regnskap AS",
    contact: person("Jonas Aune", "Founder", "polarkaffe.no"),
    saft: {
      findings: [
        { area: "Going concern", light: "red", text: "Negative equity of 180 000 kr and overdue VAT for two terms." },
        { area: "Tax payments", light: "yellow", text: "Payment plan with the tax office since March." },
        { area: "Transactions", light: "green", text: "Steady volume, no gaps in voucher numbers." },
      ],
      sourceSystem: "Visma eAccounting",
      vouchersPerYear: 2_800,
      currentFee: 7_000,
      monthlyPrice: 6_400,
      workload: 9,
      summary: "Growing roastery with a tight cash position. Talk going concern through before taking them on.",
    },
    preliminary:
      "Roastery in Tromsø. The register shows negative equity in last year's accounts, so the books need a close look.",
  },
  {
    id: "nordnes-snekker",
    name: "Nordnes Snekkerverksted AS",
    orgNo: "918 776 302",
    legalForm: "AS",
    status: "Active",
    industry: "Carpentry",
    nace: "16.230 Joinery",
    employees: 8,
    city: "Bergen",
    revenue: 11_300_000,
    equity: 1_400_000,
    currentAccountant: "Vest Regnskap AS",
    contact: person("Kristian Lie", "Owner", "nordnessnekker.no"),
    saft: {
      findings: [
        ...GREEN_BOOKS,
        { area: "Revenue recognition", light: "yellow", text: "Larger jobs invoiced on completion; work in progress to accrue." },
      ],
      sourceSystem: "Tripletex",
      vouchersPerYear: 3_300,
      currentFee: 10_500,
      monthlyPrice: 8_900,
      workload: 11,
      summary: "Workshop with project work; otherwise straightforward.",
    },
    preliminary: "Carpentry workshop in Bergen with 8 employees.",
  },
]

export const REGISTER_BY_ID = new Map(REGISTER.map((c) => [c.id, c]))

// ── Assessment ──

export type RegisterCheck = { label: string; value: string; light: Light; note?: string }

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

export function formatKr(value: number) {
  return `${nok.format(value)} kr`
}

/** The register's facts, each with its light. Auditor and accountant are
    shown, never scored. */
export function registerChecks(company: RegisterCompany): RegisterCheck[] {
  return [
    {
      label: "Legal form",
      value: company.legalForm,
      light: company.legalForm === "AS" ? "green" : "red",
      note: company.legalForm === "AS" ? undefined : "We only take on limited companies (AS).",
    },
    {
      label: "Register status",
      value: company.status,
      light: company.status === "Active" ? "green" : "red",
    },
    {
      label: "Industry",
      value: company.nace,
      light: company.excludedIndustry ? "red" : "green",
      note: company.excludedIndustry
        ? "Primary industries, finance, insurance and gambling are outside what we take on."
        : undefined,
    },
    {
      label: "Employees",
      value: String(company.employees),
      light: company.employees <= 30 ? "green" : "red",
      note: company.employees > 30 ? "At most 30 employees." : undefined,
    },
    { label: "Revenue last year", value: formatKr(company.revenue), light: "grey" },
    {
      label: "Equity",
      value: formatKr(company.equity),
      light: company.equity < 0 ? "yellow" : "green",
      note: company.equity < 0 ? "Negative equity: look at going concern." : undefined,
    },
    { label: "Auditor", value: company.auditor ?? "None", light: "grey" },
    {
      label: "Accountant today",
      value: company.currentAccountant ?? "None registered",
      light: "grey",
    },
  ]
}

/** We only work in Tripletex for now. */
export const OUR_SYSTEM = "Tripletex"

/** What the SAF-T shows, with the system the books are kept in first: the
    file's header says which, and anything but Tripletex is a no for now. */
export function bookFindings(company: RegisterCompany): Finding[] {
  const system = company.saft.sourceSystem
  const ours = system === OUR_SYSTEM
  return [
    {
      area: "Accounting system",
      light: ours ? "green" : "red",
      text: ours
        ? `Books kept in ${system}, which is what we work in.`
        : `Books kept in ${system}. We only take on companies in ${OUR_SYSTEM} for now.`,
    },
    ...company.saft.findings,
  ]
}

/** Who the register of beneficial owners lists. */
export function registeredOwners(company: RegisterCompany) {
  return company.owners ?? [{ name: company.contact.name, share: 100 }]
}

export function overallLight(lights: Light[]): Light {
  if (lights.includes("red")) return "red"
  if (lights.includes("yellow")) return "yellow"
  return "green"
}

export type Recommendation = "take_on" | "clarify" | "decline" | "not_assessed"

export const RECOMMENDATION: Record<Recommendation, { label: string; light: Light }> = {
  take_on: { label: "Take on", light: "green" },
  clarify: { label: "Needs clarifying", light: "yellow" },
  decline: { label: "Don't take on", light: "red" },
  not_assessed: { label: "Not assessed yet", light: "grey" },
}

/** A red register check decides it. Otherwise the books decide; a yellow
    register result is shown on its own line and never drags this down. */
export function recommendation(c: OnboardingCase): Recommendation {
  const company = REGISTER_BY_ID.get(c.id)!
  if (registerChecks(company).some((r) => r.light === "red")) return "decline"
  if (!c.saftFiles.length) return "not_assessed"
  const books = overallLight(bookFindings(company).map((f) => f.light))
  return books === "red" ? "decline" : books === "yellow" ? "clarify" : "take_on"
}

// ── Offer ──

export type OfferTerms = {
  monthly: number
  includedEmployees: number
  /** Rounded up in steps of 500. */
  includedVouchers: number
  payroll: boolean
  invoicing: boolean
  /** The day we take over the books (ISO). */
  takeoverDate: string
  /** What the previous accountant still does after it. */
  previousAccountant: string
  handoverNote: string
}

export type Offer = OfferTerms & {
  /** Who does what, as sent with this version: part of what they sign.
      Left out by earlier builds; the case's own list stands in. */
  routines?: Routine[]
  version: number
  sentAt: string
  validUntil: string
  status: "sent" | "questioned" | "answered" | "accepted" | "superseded"
  acceptedAt?: string
  /** Drawn or typed on the link (a preview); without it, the click was the
      signature. */
  signature?: Signature
}

/** One pen stroke, as ReUI's signature pad gives it: each point is x, y in
    CSS pixels from the pad's corner and the ink's width there. */
export type SignatureStroke = { points: [x: number, y: number, size: number][]; color?: string }
export type Signature = { drawn: SignatureStroke[] } | { typed: string }

export const EXTRA_EMPLOYEE = 6_000
export const EXTRA_VOUCHERS = 1_200

/** One thread across every version of the offer. Shared messages are
    between the company and us; internal ones stay between sales and the
    accountant. */
export type OfferMessage = {
  id: string
  from: "customer" | "firm"
  /** Team member id, or the contact's name. */
  author: string
  internal?: boolean
  text: string
  at: string
}

export function defaultTerms(company: RegisterCompany): OfferTerms {
  // The first of the month after the next 30 days: time for setup.
  const ahead = addDays(TODAY, 30)
  const takeoverDate = `${addDays(`${ahead.slice(0, 7)}-01`, 32).slice(0, 7)}-01`
  return {
    monthly: company.saft.monthlyPrice,
    includedEmployees: company.employees,
    includedVouchers: Math.max(500, Math.ceil(company.saft.vouchersPerYear / 500) * 500),
    payroll: company.employees > 0,
    invoicing: false,
    takeoverDate,
    // Self-managed: nobody hands over, they keep their own books until then.
    previousAccountant: company.currentAccountant?.startsWith("Self") ? "" : company.currentAccountant ?? "",
    handoverNote: company.currentAccountant?.startsWith("Self")
      ? "You keep your books until the takeover date."
      : "They close the books up to the takeover date and file that VAT term.",
  }
}

/** Why a takeover date is awkward, if it is: a VAT term split between two
    accountants, or a month split in two. Bi-monthly terms start in odd
    months (Jan–Feb, Mar–Apr …); an annual term is the calendar year. */
export function takeoverDateWarning(company: RegisterCompany, iso: string, previous: string) {
  const [, m, d] = iso.split("-").map(Number)
  const who = previous.trim() && !previous.startsWith("Self") ? previous : "them"
  if (iso <= TODAY) return `${formatDay(iso)} has passed: pick a date ahead, so there's time for setup.`
  const term = vatTermOf(company)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  if (term === "Bi-monthly" && (m % 2 === 0 || d !== 1)) {
    const start = m % 2 === 0 ? m - 1 : m
    // The next term starts two months after this one did.
    const next = months[(start + 1) % 12]
    return `Mid VAT term (${months[start - 1]}–${months[start]}): the return would be split between ${who} and us. Starting 1 ${next} avoids that.`
  }
  if (term === "Annual" && (m !== 1 || d !== 1))
    return `They report VAT once a year: taking over on ${formatDay(iso)} splits the year's return between ${who} and us.`
  if (d !== 1) return `Not the 1st: ${months[m - 1]} would be split between ${who} and us.`
  return undefined
}

// ── Tasks ──

/** How a task is answered on the company's onboarding page. */
export type AskKind = "confirm" | "text" | "file" | "choice" | "kyc" | "token" | "routines"

/** open: ours to do. with_customer: sent, waiting. answered: back from the
    customer, ours to review. done / na: settled by a person. */
export type TaskStatus = "open" | "with_customer" | "answered" | "done" | "na"

export type OnboardingTask = {
  id: string
  phase: Phase
  group: string
  title: string
  /** What the agent found: internal, never shown to the company. */
  finding: string
  /** Where the finding comes from, so "Mark done" rests on something. */
  source?: string
  /** The finding is read from their Tripletex: until the connection is in,
      there is nothing to check it against. */
  needs?: "tripletex"
  required: boolean
  status: TaskStatus
  /** The question for the company, drafted by the agent until it is sent.
      A choice carries its options. */
  ask?: { kind: AskKind; message: string; sentAt?: string; options?: string[] }
  answer?: { text: string; file?: string; at: string }
  settled?: Stamp
  /** Added by a person rather than the template; only these can be removed. */
  manual?: Stamp
  /** We check it ourselves rather than take their word for it: the bank feed
      in Tripletex, our role in the Brønnøysund register. */
  verify?: "bank_feed" | "altinn_role"
  /** The last time we checked, and what we saw. */
  check?: { at: string; ok: boolean; text: string }
  /** When it really has to be done by, if not before the phase is approved. */
  neededBy?: "first_close" | "first_filing"
  /** Left for after the hand-over: it no longer holds up the approval and
      carries over to the client in operation. */
  later?: Stamp
  /** Carried over as a task in the customer's app (the request id). */
  movedTo?: string
}

/** Customer asks a person can write by hand; KYC, token and routines are
    template-only. */
export type ManualAskKind = Extract<AskKind, "confirm" | "text" | "file" | "choice">

export function isSettled(task: OnboardingTask) {
  return task.status === "done" || task.status === "na"
}

export const KYC_QUESTIONS = [
  "Does anyone own more than 25 % of the company?",
  "Does the company do business outside Norway?",
  "Does the company take or make cash payments above 40 000 kr?",
  "Is an owner or board member a politically exposed person?",
] as const

/** What a "yes" asks for, question by question. */
export const KYC_FOLLOW_UP = [
  "Who, and how much do they own?",
  "Which countries, and what kind of business?",
  "What kind of payments, and how often?",
  "Who, and which position?",
] as const

const KYC_SHORT = ["Owners above 25 %", "Business abroad", "Cash above 40 000 kr", "PEP"]

/** The answers they gave before signing. A "yes" carries a comment. */
export type Kyc = { answers: boolean[]; comments?: string[]; note: string }

/** Every question answered, and every "yes" explained. */
export function kycComplete(kyc: { answers: (boolean | null)[]; comments: string[] }) {
  return kyc.answers.every((a, i) => a === false || (a === true && Boolean(kyc.comments[i]?.trim())))
}

export function kycSummary(kyc: Kyc) {
  const lines = KYC_SHORT.map((label, i) => {
    const comment = kyc.comments?.[i]?.trim()
    return `${label}: ${kyc.answers[i] ? "Yes" : "No"}${kyc.answers[i] && comment ? ` (${comment})` : ""}`
  })
  return `${lines.join(" · ")}${kyc.note ? `. ${kyc.note}` : ""}`
}

/** What a signature in the demo answers when nobody filled the questions in:
    the owners as the register lists them, nothing else. */
export function defaultKyc(company: RegisterCompany): Kyc {
  const owners = registeredOwners(company)
  return {
    answers: [true, false, false, false],
    comments: [owners.map((o) => `${o.name} ${o.share} %`).join(", "), "", "", ""],
    note: "",
  }
}

type Template = Omit<OnboardingTask, "id" | "status" | "phase"> & { key: string }

/** The company's DNB accounts, as the bank feed tasks and the client in
    operation both know them. */
export function bankAccounts(company: RegisterCompany): BankAccount[] {
  const n = hash(company.orgNo)
  const number = (i: number) =>
    `${1200 + ((n >>> i) % 700)}.${String(10 + ((n >>> (i + 3)) % 89)).padStart(2, "0")}.${String(10000 + ((n >>> (i + 5)) % 89999)).slice(0, 5)}`
  return [
    { ledger: "1920", name: "Operating account", number: number(1) },
    { ledger: "1921", name: "Card account", number: number(2) },
    ...(company.employees > 0
      ? [{ ledger: "1950" as const, name: "Tax withholding", number: number(4) }]
      : []),
  ]
}

export function vatTermOf(company: RegisterCompany) {
  return company.vatTerm ?? "Bi-monthly"
}

/** The pay day the demo's Tripletex shows for every company. */
const TRIPLETEX_PAY_DAY = 25

/** They keep their own books: no accountant hands over to us. */
export function selfManaged(c: OnboardingCase) {
  const previous = c.offer?.previousAccountant ?? company(c).currentAccountant ?? ""
  return !previous.trim() || previous.startsWith("Self")
}

/** Setup, one task per thing that really needs doing, Tripletex access
    first: most of the rest is read from it. Checks that follow from another
    (the connection's company, tax account access through the Altinn role,
    one bank feed approval per account) are part of that task. Who does what
    isn't here: it went out with the offer and they signed it. */
function setupTemplates(company: RegisterCompany): Template[] {
  const first = company.contact.name.split(" ")[0]
  const accounts = bankAccounts(company)
  const term = vatTermOf(company)
  return [
    {
      key: "tripletex",
      group: "Access",
      title: "Tripletex access",
      finding: `${company.name} connects us to their own Tripletex company, read-only until the takeover. The connection is checked against org. no. ${company.orgNo} as it comes in. Most of the checks below are read from it.`,
      source: "Tripletex",
      required: true,
      ask: {
        kind: "token",
        message:
          "Connect Sanna to your Tripletex company: you log in to Tripletex and approve our access. It takes a minute.",
      },
    },
    {
      key: "kyc",
      group: "Agreement",
      title: "Know-your-customer questions",
      finding:
        "The anti-money-laundering act asks us to know who owns and controls every customer before we start, so they answered before signing. We check the owners against the register of beneficial owners.",
      source: "Their answers · register of beneficial owners",
      required: true,
      ask: {
        kind: "kyc",
        message: "Four short questions we ask every new customer, as the law requires.",
      },
    },
    {
      key: "business",
      group: "How we work together",
      title: "Business context",
      finding: `Registered activity (${company.nace}) matches what the books show. Customers, revenue model and invoicing basis agree with the meeting notes.`,
      source: "Brønnøysund register · Tripletex ledger",
      needs: "tripletex",
      required: true,
    },
    ...(company.employees > 0
      ? [
          {
            key: "payroll",
            group: "How we work together",
            title: "Pay day",
            finding: `${company.employees} on payroll. The last six pay runs in Tripletex went out on the ${ordinal(TRIPLETEX_PAY_DAY)}. Who sends hours and absence is in who does what.`,
            source: "Tripletex · pay runs and the a-melding",
            needs: "tripletex" as const,
            required: true,
            ask: {
              kind: "text" as const,
              message: `Your last pay runs in Tripletex went out on the ${ordinal(TRIPLETEX_PAY_DAY)}. Is that your pay day, or should it move?`,
            },
          },
        ]
      : []),
    {
      key: "vat",
      group: "VAT",
      title: "VAT registration and term",
      finding:
        term === "Annual"
          ? "In the VAT register with an annual term: VAT-able sales are under 1 MNOK a year. Last year's return was filed on time."
          : "In the VAT register with a bi-monthly term. The last return (Jul–Aug) was filed on time.",
      source: "VAT register · VAT returns in Tripletex",
      needs: "tripletex",
      required: true,
    },
    {
      key: "ehf",
      group: "Systems",
      title: "EHF invoice reception",
      finding:
        "Not registered for EHF in ELMA. We register their Tripletex inbox ourselves so supplier invoices arrive by themselves.",
      source: "ELMA register",
      needs: "tripletex",
      required: false,
    },
    {
      key: "bank",
      group: "Bank & payments",
      title: `Bank feeds for ${accounts.length === 1 ? "the account" : `${accounts.length} accounts`}`,
      finding: `Connect the feed for ${accounts.map((a) => `${a.ledger} ${a.name.toLowerCase()}`).join(", ")} so every transaction reaches Tripletex the next morning. We see in Tripletex when it runs; no need to take their word for it.`,
      source: "Tripletex · bank",
      required: true,
      verify: "bank_feed",
      neededBy: "first_close",
      ask: {
        kind: "confirm" as const,
        message: `In DNB's online bank, find the agreement for an accounting system, choose Tripletex and approve the feed for ${accounts.map((a) => `${a.name.toLowerCase()} ${a.number}`).join(", ")}.`,
      },
    },
    {
      key: "altinn",
      group: "Authority access",
      title: "Register us as your accountant",
      finding: `We filed the registration of ${FIRM.name} as accountant ourselves when they signed; it only needs ${first}'s signature in Altinn. Until it's in the Brønnøysund register we can't file the a-melding or VAT returns. Access to the tax account follows the same role.`,
      source: "Brønnøysund register",
      required: true,
      verify: "altinn_role",
      neededBy: "first_filing",
      ask: {
        kind: "confirm",
        message: `We've sent the registration of ${FIRM.name} (org. ${FIRM.orgNo}) as your accountant to Altinn. Log in to Altinn and sign it; it's in your inbox there.`,
      },
    },
  ]
}

/** The setup task that says whether the bank feed runs. */
function feedTask(c: OnboardingCase) {
  return c.tasks.find((t) => t.id === `${c.id}:bank`)
}

/** The checks that matter before we take over, close to the date: the bank
    agrees, the ledger is complete, the authorities are up to date, and the
    previous accountant (or the company itself) has handed over. */
function takeoverTemplates(company: RegisterCompany, c: OnboardingCase): Template[] {
  const date = c.offer ? formatDay(c.offer.takeoverDate) : "the takeover date"
  const previous = c.offer?.previousAccountant || company.currentAccountant || "your previous accountant"
  const accounts = bankAccounts(company)
  const ledgers = accounts.map((a) => a.ledger).join(", ")
  const feed = feedTask(c)?.check
  return [
    feed?.ok
      ? {
          key: "statement",
          group: "Bank",
          title: "Bank balances at the takeover",
          finding: `The bank feed has run since ${formatDay(feed.at)}, so the balances on ${date} come straight from it. Check that ${ledgers} in the ledger agree with them, and that larger payments have a voucher.`,
          source: "Tripletex · bank feed",
          required: true,
        }
      : {
          key: "statement",
          group: "Bank",
          title: "Bank balances at the takeover",
          finding: `The bank feed isn't running yet, so we can't see the balances on ${date}. A statement from their bank shows them; ${ledgers} in the ledger have to agree with it.`,
          source: "Bank statement",
          required: true,
          ask: {
            kind: "file",
            message: `Download the statement for every account up to ${date} from your online bank and upload it here.`,
          },
        },
    // What the assessment flagged comes back where it bites: at the
    // opening balance.
    ...company.saft.findings
      .filter((f) => f.light !== "green")
      .map((f, i) => ({
        key: `flag-${i + 1}`,
        group: "From the assessment",
        title: f.area,
        finding: `Flagged in the assessment: ${f.text} Check how it stands on ${date}, and that the routine for it is in who does what.`,
        source: `SAF-T · ${c.saftFiles[0] ?? "assessment"}`,
        required: true,
      })),
    {
      key: "history",
      group: "Ledger",
      title: "Opening balance and history",
      finding: `All periods up to ${date} present; ledger and trial balance reconcile; voucher number gaps explained.`,
      source: "Tripletex ledger",
      required: true,
    },
    {
      key: "ledgers",
      group: "Ledger",
      title: "Customer and supplier ledgers",
      finding: "Open items on 1500 and 2400 reconcile at the takeover date; payments, credits and due dates matched.",
      source: "Tripletex ledger",
      required: true,
    },
    {
      key: "filings",
      group: "Authorities",
      title: company.employees > 0 ? "VAT and a-melding up to date" : "VAT up to date",
      finding:
        company.employees > 0
          ? "Every due VAT term and a-melding filed and accepted; employer's contribution, withholding tax and holiday pay agree with the ledger."
          : "Every due VAT term filed and reconciled to the ledger; payments and refunds settled.",
      source: "Altinn filings · Tripletex",
      required: true,
    },
    selfManaged(c)
      ? {
          key: "handover",
          group: "Documents",
          title: "What's open at the takeover",
          finding:
            "They kept the books themselves, so there is no handover letter: the owner tells us what's still open and where the vouchers are kept.",
          source: "Their answer",
          required: true,
          ask: {
            kind: "text",
            message: `You've kept the books yourself, so there's no handover letter. Tell us what's still open on ${date} (agreements, loans, disputes, invoices you're waiting for) and where the vouchers are kept.`,
          },
        }
      : {
          key: "handover",
          group: "Documents",
          title: "Handover from the previous accountant",
          finding: "Open items, anything they still do after the takeover, and where the archive is.",
          source: previous,
          required: true,
          ask: {
            kind: "file",
            message: `Ask ${previous} for their handover letter (open items and what they still do after ${date}) and upload it here.`,
          },
        },
  ]
}

function build(c: OnboardingCase, phase: "setup" | "takeover"): OnboardingTask[] {
  const company = REGISTER_BY_ID.get(c.id)!
  const templates = phase === "setup" ? setupTemplates(company) : takeoverTemplates(company, c)
  return templates.map(({ key, ...t }) => ({
    ...t,
    id: `${c.id}:${key}`,
    phase,
    status: "open",
  }))
}

// ── The case ──

export type PhaseEvent = {
  id: string
  phase: Phase
  action: "created" | "approved" | "signed" | "reopened" | "declined" | "restored" | "sent" | "amended"
  /** Team member id, or the contact's name. */
  by: string
  at: string
  note?: string
}

/** A supplier read from the SAF-T in Setup. Pre-approved ones go straight
    onto the client's approved suppliers at hand-over (see approvals.ts). */
export type OnboardingSupplier = {
  name: string
  /** The cost account they are usually booked to, "6300 Rent". */
  account: string
  /** What they were paid last year, NOK. */
  yearly: number
  /** How often an invoice comes: "Monthly", "Quarterly", "A few a year". */
  cadence: string
  preApproved: boolean
}

/** An employee read from the SAF-T / Tripletex in Setup. Pre-approved ones
    start as confirmed in the client's employee list (see people.ts). */
export type OnboardingEmployee = {
  name: string
  role: string
  pay: "fixed" | "hourly" | "commission"
  /** Monthly salary, hourly rate or base, NOK. */
  amount: number
  preApproved: boolean
}

/** One line of the division of work agreed with the customer (GRFS asks
    for it in the engagement agreement): who does what, and by when. */
export type Routine = {
  id: string
  area: "bookkeeping" | "payroll" | "reporting" | "general"
  task: string
  who: "customer" | "firm"
  /** When it comes round; `when` is its label. Left out by earlier builds. */
  cadence?: Cadence
  /** "Every Monday", "Monthly, by the 10th", "Before each pay run". */
  when?: string
}

export type OnboardingCase = {
  /** The register company's id. */
  id: string
  accountantId: string
  phase: Phase
  createdAt: string
  /** What sales heard in the first meeting. */
  meetingNote: string
  saftFiles: string[]
  signoffs: { accountant?: Stamp; sales?: Stamp }
  offer?: Offer
  thread: OfferMessage[]
  tasks: OnboardingTask[]
  /** The takeover checks can't start before this, unless started early. */
  takeoverStartedEarly?: Stamp
  kyc?: Kyc
  declined?: Stamp & { reason: string }
  /** The takeover was approved: the company is a client in operation now and
      leaves the onboarding list. The phase stays at takeover. */
  handedOver?: Stamp
  history: PhaseEvent[]
  /** Read from the SAF-T in Setup; the customer pre-approves them. */
  suppliers?: OnboardingSupplier[]
  employees?: OnboardingEmployee[]
  /** Who does what, agreed in Setup and kept after hand-over. */
  routines?: Routine[]
  /** The division of work as they last confirmed a change to it. */
  confirmedRoutines?: Routine[]
}

export function company(c: OnboardingCase) {
  return REGISTER_BY_ID.get(c.id)!
}

// ── What the SAF-T shows: suppliers and employees ──

/** [name, account, cadence, share of revenue a year]. */
type SupplierSeed = [string, string, string, number]

/** Suppliers almost every company has. */
const COMMON_SUPPLIERS: SupplierSeed[] = [
  ["Telenor Norge AS", "6900 Phone & internet", "Monthly", 0.004],
  ["Tripletex AS", "6420 Software subscriptions", "Monthly", 0.002],
  ["Gjensidige Forsikring ASA", "7500 Insurance", "Yearly", 0.006],
  ["DNB Bank ASA", "7770 Bank fees", "Monthly", 0.001],
  ["Microsoft Ireland", "6420 Software subscriptions", "Monthly", 0.0015],
]

/** What each kind of business buys. The first one is their landlord. */
const INDUSTRY_SUPPLIERS: Record<string, SupplierSeed[]> = {
  bikes: [
    ["Bodø Næringsbygg AS", "6300 Rent premises", "Monthly", 0.05],
    ["Shimano Nordic Cycle AB", "4300 Goods for resale", "Monthly", 0.16],
    ["Sport Nordic Distribusjon AS", "4300 Goods for resale", "A few a year", 0.07],
    ["Nordlandsnett AS", "6340 Electricity & heating", "Monthly", 0.008],
    ["Posten Norge AS", "6860 Freight & postage", "Monthly", 0.004],
    ["Jula Norge AS", "6540 Equipment & fixtures", "A few a year", 0.003],
    ["Zettle by PayPal", "7770 Bank fees", "Monthly", 0.004],
    ["Bodø Renovasjon", "6390 Other premises costs", "Quarterly", 0.0015],
  ],
  cafe: [
    ["Gårdeier Sentrum AS", "6300 Rent premises", "Monthly", 0.06],
    ["Asko Rogaland AS", "4300 Goods for resale", "Weekly", 0.14],
    ["Tine SA", "4300 Goods for resale", "Weekly", 0.06],
    ["Joh. Johannson Kaffe AS", "4300 Goods for resale", "Monthly", 0.03],
    ["Bama Storkjøkken AS", "4300 Goods for resale", "Weekly", 0.04],
    ["Lyse Energi AS", "6340 Electricity & heating", "Monthly", 0.012],
    ["Planday A/S", "6420 Software subscriptions", "Monthly", 0.001],
    ["Zettle by PayPal", "7770 Bank fees", "Monthly", 0.005],
  ],
  seafood: [
    ["Skretting AS", "4300 Feed", "Monthly", 0.3],
    ["Akvagroup ASA", "6540 Equipment & fixtures", "Quarterly", 0.04],
    ["Hammerfest Havn KF", "6300 Rent premises", "Monthly", 0.01],
  ],
  physio: [
    ["Kollen Senter AS", "6300 Rent premises", "Monthly", 0.07],
    ["Fysiopartner Utstyr AS", "6540 Equipment & fixtures", "A few a year", 0.01],
    ["Fagforbundet Fysioterapeutene", "7420 Memberships", "Yearly", 0.002],
    ["Elvia AS", "6340 Electricity & heating", "Monthly", 0.004],
    ["Pasientsky AS", "6420 Software subscriptions", "Monthly", 0.004],
    ["Mediq Norge AS", "4300 Goods for resale", "Monthly", 0.015],
    ["Lindorff Inkasso", "7790 Other costs", "A few a year", 0.0008],
  ],
  electrician: [
    ["Trondheim Næringseiendom AS", "6300 Rent premises", "Monthly", 0.02],
    ["Onninen AS", "4300 Materials", "Weekly", 0.16],
    ["Elektroskandia Norge AS", "4300 Materials", "Weekly", 0.09],
    ["Ahlsell Norge AS", "4300 Materials", "Monthly", 0.04],
    ["Hertz Bilpartner (leasing)", "6720 Vehicle leasing", "Monthly", 0.02],
    ["Circle K Norge AS", "7000 Fuel", "Monthly", 0.012],
    ["Nelfo", "7420 Memberships", "Yearly", 0.001],
    ["Tensio TN AS", "6340 Electricity & heating", "Monthly", 0.002],
  ],
  logistics: [
    ["Drammen Havn Eiendom AS", "6300 Rent premises", "Monthly", 0.015],
    ["Scania Finans AS (leasing)", "6720 Vehicle leasing", "Monthly", 0.09],
    ["Circle K Norge AS", "7000 Fuel", "Weekly", 0.14],
    ["Fjellinjen (AutoPASS)", "7140 Tolls", "Monthly", 0.03],
    ["Dekkmann AS", "7020 Vehicle maintenance", "A few a year", 0.012],
    ["Truck Service Drammen AS", "7020 Vehicle maintenance", "Quarterly", 0.018],
    ["Webfleet Solutions", "6420 Software subscriptions", "Monthly", 0.002],
  ],
  optician: [
    ["Galleriet Eiendom AS", "6300 Rent premises", "Monthly", 0.07],
    ["Essilor Norge AS", "4300 Goods for resale", "Monthly", 0.14],
    ["Safilo Nordic AS", "4300 Goods for resale", "Quarterly", 0.06],
    ["Specsavers Lab Services", "4300 Goods for resale", "Monthly", 0.04],
    ["BKK AS", "6340 Electricity & heating", "Monthly", 0.004],
    ["Optikerforbundet", "7420 Memberships", "Yearly", 0.002],
    ["Synsam Data AS", "6420 Software subscriptions", "Monthly", 0.003],
  ],
  bakery: [
    ["Grünerløkka Eiendom AS", "6300 Rent premises", "Monthly", 0.05],
    ["Norgesmøllene AS", "4300 Raw materials", "Weekly", 0.11],
    ["Tine SA", "4300 Raw materials", "Weekly", 0.05],
    ["Asko Øst AS", "4300 Raw materials", "Weekly", 0.06],
    ["Fjordland Emballasje AS", "4300 Packaging", "Monthly", 0.015],
    ["Hafslund Strøm AS", "6340 Electricity & heating", "Monthly", 0.02],
    ["Planday A/S", "6420 Software subscriptions", "Monthly", 0.001],
    ["Elektro Storkjøkken AS", "6600 Repairs & maintenance", "A few a year", 0.006],
  ],
  yoga: [
    ["Tromsø Sentrumsgårder AS", "6300 Rent premises", "Monthly", 0.12],
    ["Mindbody Inc.", "6420 Software subscriptions", "Monthly", 0.006],
    ["Manduka Europe", "4300 Goods for resale", "A few a year", 0.01],
    ["Arva AS", "6340 Electricity & heating", "Monthly", 0.008],
    ["Meta Platforms Ireland", "7320 Advertising", "Monthly", 0.01],
  ],
  coffee: [
    ["Tromsø Havn Eiendom AS", "6300 Rent premises", "Monthly", 0.04],
    ["Nordic Approach AS", "4300 Green coffee", "Monthly", 0.22],
    ["Probat Nordic", "6600 Repairs & maintenance", "A few a year", 0.008],
    ["Emballasjegrossisten AS", "4300 Packaging", "Monthly", 0.03],
    ["Bring Norge AS", "6860 Freight & postage", "Weekly", 0.025],
    ["Arva AS", "6340 Electricity & heating", "Monthly", 0.012],
  ],
  carpentry: [
    ["Nordnes Eiendom AS", "6300 Rent premises", "Monthly", 0.025],
    ["Byggmakker Bergen AS", "4300 Materials", "Weekly", 0.14],
    ["Moelven Wood AS", "4300 Materials", "Monthly", 0.08],
    ["Festool Norge AS", "6540 Equipment & fixtures", "A few a year", 0.01],
    ["Toyota Finans (leasing)", "6720 Vehicle leasing", "Monthly", 0.015],
    ["Circle K Norge AS", "7000 Fuel", "Monthly", 0.008],
    ["BKK AS", "6340 Electricity & heating", "Monthly", 0.004],
  ],
}

const FLAVOUR: Record<string, string> = {
  "vestfjord-sykkel": "bikes",
  "gronn-hage": "cafe",
  "nordkyst-havbruk": "seafood",
  "kollen-fysio": "physio",
  "brattli-elektro": "electrician",
  "lunde-transport": "logistics",
  "sentrum-optikk": "optician",
  "molla-bakeri": "bakery",
  "havly-yoga": "yoga",
  "polar-kaffe": "coffee",
  "nordnes-snekker": "carpentry",
}

/** The suppliers the SAF-T shows for last year, biggest first: what they
    are booked to, what they were paid and how often an invoice comes.
    None approved until the customer says so. */
export function saftSuppliers(company: RegisterCompany): OnboardingSupplier[] {
  const own = INDUSTRY_SUPPLIERS[FLAVOUR[company.id] ?? "cafe"] ?? []
  const seen = new Set(own.map(([name]) => name))
  const common = COMMON_SUPPLIERS.filter(([name]) => !seen.has(name))
  return [...own, ...common]
    .map(([name, account, cadence, share]) => ({
      name,
      account,
      cadence,
      // Rounded the way a ledger summary reads, and never below a few
      // hundred kroner.
      yearly: Math.max(1_200, Math.round((company.revenue * share * (0.9 + (hash(name) % 20) / 100)) / 100) * 100),
      preApproved: false,
    }))
    .sort((a, b) => b.yearly - a.yearly)
}

const FIRST_NAMES = ["Ida", "Jonas", "Sara", "Magnus", "Thea", "Elias", "Nora", "Henrik", "Emilie", "Sander", "Maja", "Tobias", "Ingrid", "Even"]
const LAST_NAMES = ["Johansen", "Berg", "Hagen", "Bakke", "Larsen", "Solheim", "Lie", "Moen", "Aas", "Strand", "Dahl", "Eide", "Vik", "Holm"]

/** Roles per kind of business: [role, how they are paid, amount]. The
    first is whoever runs the place day to day. */
const ROLES: Record<string, [string, OnboardingEmployee["pay"], number][]> = {
  bikes: [["Workshop manager", "fixed", 46_000], ["Bike mechanic", "hourly", 205], ["Shop assistant", "hourly", 182]],
  cafe: [["Café manager", "fixed", 44_000], ["Barista", "hourly", 178], ["Kitchen assistant", "hourly", 172]],
  seafood: [["Site manager", "fixed", 62_000], ["Fish farm operator", "fixed", 47_000]],
  physio: [["Physiotherapist", "commission", 32_000], ["Receptionist", "hourly", 196]],
  electrician: [["Project manager", "fixed", 61_000], ["Electrician", "hourly", 268], ["Apprentice", "fixed", 24_500]],
  logistics: [["Traffic manager", "fixed", 52_000], ["Truck driver", "hourly", 232]],
  optician: [["Optometrist", "fixed", 54_000], ["Sales, glasses and lenses", "commission", 29_000]],
  bakery: [["Head baker", "fixed", 48_000], ["Baker", "hourly", 204], ["Shop assistant", "hourly", 176]],
  yoga: [["Studio manager", "fixed", 41_000], ["Yoga instructor", "hourly", 320]],
  coffee: [["Head roaster", "fixed", 47_000], ["Roastery assistant", "hourly", 190]],
  carpentry: [["Foreman", "fixed", 55_000], ["Carpenter", "hourly", 255], ["Apprentice", "fixed", 23_500]],
}

/** The employees on the last a-melding, with what their agreement says.
    The owner is on payroll too when the company has staff. */
export function saftEmployees(company: RegisterCompany): OnboardingEmployee[] {
  if (!company.employees) return []
  const roles = ROLES[FLAVOUR[company.id] ?? "cafe"] ?? ROLES.cafe
  const h = hash(company.id)
  return Array.from({ length: Math.min(company.employees, 12) }, (_, i) => {
    const [role, pay, amount] = i === 0 ? roles[0] : roles[1 + ((i - 1) % (roles.length - 1 || 1))] ?? roles[0]
    const name =
      i === 0
        ? company.contact.name
        : `${FIRST_NAMES[(h + i * 5) % FIRST_NAMES.length]} ${LAST_NAMES[(h + i * 3) % LAST_NAMES.length]}`
    // Pay varies a little person to person; hourly rates by a few kroner.
    const step = pay === "hourly" ? 4 : 500
    return {
      name,
      role: i === 0 ? `${company.contact.role} · ${role.toLowerCase()}` : role,
      pay,
      amount: amount + ((hash(name) % 5) - 2) * step,
      preApproved: false,
    }
  })
}

/** What Setup holds for the case, or what the SAF-T suggests before anyone
    has touched it. */
export function caseSuppliers(c: OnboardingCase) {
  return c.suppliers ?? saftSuppliers(company(c))
}

export function caseEmployees(c: OnboardingCase) {
  return c.employees ?? saftEmployees(company(c))
}

export function caseRoutines(c: OnboardingCase) {
  return (
    c.routines ??
    defaultRoutines({
      payroll: c.offer ? c.offer.payroll : company(c).employees > 0,
      invoicing: c.offer?.invoicing,
      vatTerm: vatTermOf(company(c)),
      payDay: payDay(c),
      variant: hash(c.id),
    })
  )
}

/** The case's division of work for the scope in an offer: with or without
    payroll, with or without invoicing their customers. */
function fitScope(c: OnboardingCase, terms: Pick<OfferTerms, "payroll" | "invoicing">): Routine[] {
  const template = caseRoutines({ ...c, routines: undefined, offer: terms as Offer })
  let routines = c.routines ?? template
  const invoicing = new Set(invoicingLines().map((r) => r.id))
  if (!terms.invoicing) routines = routines.filter((r) => !invoicing.has(r.id))
  else if (!routines.some((r) => invoicing.has(r.id))) {
    const at = routines.findLastIndex((r) => r.area === "bookkeeping") + 1
    routines = [...routines.slice(0, at), ...template.filter((r) => invoicing.has(r.id)), ...routines.slice(at)]
  }
  if (!terms.payroll) return routines.filter((r) => r.area !== "payroll")
  if (routines.some((r) => r.area === "payroll")) return routines
  // In the template's place: after the bookkeeping lines.
  const at = routines.findLastIndex((r) => r.area === "bookkeeping") + 1
  return [...routines.slice(0, at), ...template.filter((r) => r.area === "payroll"), ...routines.slice(at)]
}

/** What looks off in a division of work, for whoever edits it: a promise
    with no price on it, or lines that don't fit together. */
export function routineWarnings(c: OnboardingCase): string[] {
  const routines = caseRoutines(c)
  const out: string[] = []
  const byId = new Map(routines.map((r) => [r.id, r]))
  if (byId.get("pay-invoices")?.who === "firm")
    out.push("Paying their invoices from their bank needs payment authority in the bank, and isn't in the price.")
  const bank = byId.get("reconcile")?.cadence
  const report = byId.get("report")?.cadence
  if (bank?.every === "month" && (bank.months ?? 1) > 1 && report?.every === "month" && (report.months ?? 1) === 1)
    out.push("The monthly report goes out in months when the bank isn't reconciled.")
  const scopeInvoicing = c.offer?.invoicing
  if (scopeInvoicing && !routines.some((r) => r.id === "send-sales-invoices"))
    out.push("Invoicing is in the offer, but nobody sends their invoices here.")
  if (company(c).employees > 0 && (c.offer?.payroll ?? true) && !routines.some((r) => r.area === "payroll"))
    out.push("Payroll is in scope, but there are no pay lines.")
  return out
}

/** Checks are only meaningful close to the takeover: 14 days before. */
export const WINDOW_DAYS = 14

export function windowOpens(c: OnboardingCase) {
  return c.offer ? addDays(c.offer.takeoverDate, -WINDOW_DAYS) : undefined
}

export function takeoverWindowOpen(c: OnboardingCase) {
  const opens = windowOpens(c)
  return Boolean(c.takeoverStartedEarly) || (opens !== undefined && opens <= TODAY)
}

// ── Dates ──

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

/** "2026-10-01" as "1 Oct". */
export function formatDay(iso: string) {
  return DAY_MONTH.format(new Date(`${iso}T12:00:00Z`))
}

/** "2026-10-01" as "October 2026". */
export function formatMonth(iso: string) {
  return monthLabel(iso.slice(0, 7))
}

// ── Seed ──

function stamp(at: string, by: string): Stamp {
  return { at, by }
}

function sentOffer(company: RegisterCompany, sentAt: string, patch: Partial<Offer> = {}): Offer {
  return {
    ...defaultTerms(company),
    version: 1,
    sentAt,
    validUntil: addDays(sentAt, 20),
    status: "sent",
    ...patch,
  }
}

/** Sets statuses on built tasks: key → status, with the customer's answer
    where one came back. */
function seedTasks(
  c: OnboardingCase,
  phase: "setup" | "takeover",
  statuses: Record<string, TaskStatus>,
  answers: Record<string, string> = {},
  sentAt = "2026-10-20",
  /** When answers came back and tasks were settled. */
  dates: { answered?: string; settled?: string } = {}
) {
  return build(c, phase).map((task) => {
    const key = task.id.split(":")[1]
    const status = statuses[key] ?? "open"
    const asked = status !== "open" && task.ask
    return {
      ...task,
      status,
      ask: asked ? { ...task.ask!, sentAt } : task.ask,
      answer:
        answers[key] !== undefined
          ? { text: answers[key], at: dates.answered ?? "2026-10-24", file: key === "statement" ? "dnb-kontoutskrift-oct.pdf" : undefined }
          : undefined,
      settled: status === "done" || status === "na" ? stamp(dates.settled ?? "2026-10-22", personName(c.accountantId)) : undefined,
    } satisfies OnboardingTask
  })
}

function base(id: string, accountantId: string, createdAt: string, meetingNote: string): OnboardingCase {
  return {
    id,
    accountantId,
    phase: "assessment",
    createdAt,
    meetingNote,
    saftFiles: [],
    signoffs: {},
    thread: [],
    tasks: [],
    history: [{ id: `${id}-h1`, phase: "assessment", action: "created", by: "emma", at: createdAt }],
  }
}

/** What was agreed in a seeded case's first meeting: the suppliers the
    customer pre-approved, every fixed salary confirmed, and the template's
    division of work with the case's own touches. */
function agreed(c: OnboardingCase, approved: string[], touch: (r: Routine) => Routine = (r) => r) {
  c.suppliers = saftSuppliers(company(c)).map((s) => ({ ...s, preApproved: approved.includes(s.name) }))
  c.employees = saftEmployees(company(c)).map((e) => ({ ...e, preApproved: e.pay === "fixed" }))
  c.routines = caseRoutines(c).map(touch)
  // Signed with the offer: what they agreed to is what the case holds.
  if (c.offer) c.offer.routines = c.routines
}

export function seedOnboarding(): OnboardingCase[] {
  const R = (id: string) => REGISTER_BY_ID.get(id)!

  const vestfjord: OnboardingCase = base(
    "vestfjord-sykkel",
    "ingrid",
    "2026-10-23",
    "Met Eirik at Bodø næringsforum. Tired of doing the books himself in the evenings; wants payroll handled too."
  )

  const gronn: OnboardingCase = {
    ...base("gronn-hage", "ingrid", "2026-10-16", "Maja is unhappy with response times at Sola Regnskap. Wants a monthly report she can show the board."),
    saftFiles: ["SAF-T_2025_927880132.xml", "SAF-T_2026H1_927880132.xml"],
    signoffs: { sales: stamp("2026-10-22", "Emma Lie") },
  }

  const havbruk: OnboardingCase = base(
    "nordkyst-havbruk",
    "marius",
    "2026-10-24",
    "Inbound from the website. Large fish farm looking to switch from Finnmark Økonomi."
  )

  const kollen: OnboardingCase = {
    ...base("kollen-fysio", "ingrid", "2026-10-08", "Referred by Thea at Nordlys Design."),
    phase: "offer",
    saftFiles: ["SAF-T_2025_924117360.xml"],
    signoffs: { accountant: stamp("2026-10-20", "Ingrid Hansen"), sales: stamp("2026-10-21", "Emma Lie") },
    offer: sentOffer(R("kollen-fysio"), "2026-10-22"),
  }
  kollen.history.push(
    { id: "kollen-fysio-h2", phase: "assessment", action: "approved", by: "ingrid", at: "2026-10-22", note: "Both confirmed" },
    { id: "kollen-fysio-h3", phase: "offer", action: "sent", by: "emma", at: "2026-10-22", note: "Offer v1 sent to Nora Brekke" }
  )

  const brattli: OnboardingCase = {
    ...base("brattli-elektro", "marius", "2026-10-06", "Henrik wants one firm for books, payroll and invoicing. Project work."),
    phase: "offer",
    saftFiles: ["SAF-T_2025_919402885.xml", "SAF-T_2026H1_919402885.xml"],
    signoffs: { accountant: stamp("2026-10-16", "Marius Berg"), sales: stamp("2026-10-17", "Emma Lie") },
    offer: sentOffer(R("brattli-elektro"), "2026-10-19", { status: "questioned", invoicing: true }),
    thread: [
      {
        id: "brattli-elektro-m1",
        from: "customer",
        author: "Henrik Brattli",
        text: "Thanks for the offer. Is payroll for all 14 included in the monthly price, or is it 6 000 kr on top per person? We may hire two more apprentices in January.",
        at: "2026-10-24",
      },
      {
        id: "brattli-elektro-m2",
        from: "firm",
        author: "emma",
        internal: true,
        text: "All 14 are included. If they hire two more, I'd rather raise the included count to 16 now than charge per head. Marius, OK with you?",
        at: "2026-10-24",
      },
    ],
  }
  brattli.history.push(
    { id: "brattli-elektro-h2", phase: "assessment", action: "approved", by: "marius", at: "2026-10-19", note: "Both confirmed" },
    { id: "brattli-elektro-h3", phase: "offer", action: "sent", by: "emma", at: "2026-10-19", note: "Offer v1 sent to Henrik Brattli" }
  )

  const lunde: OnboardingCase = {
    ...base("lunde-transport", "ingrid", "2026-09-25", "Ola runs 9 trucks. Previous accountant is retiring."),
    phase: "setup",
    saftFiles: ["SAF-T_2025_922715409.xml"],
    signoffs: { accountant: stamp("2026-10-03", "Ingrid Hansen"), sales: stamp("2026-10-03", "Emma Lie") },
    offer: sentOffer(R("lunde-transport"), "2026-10-06", { status: "accepted", acceptedAt: "2026-10-13" }),
    kyc: { answers: [true, false, false, false], note: "Ola Lunde owns 100 %." },
  }
  lunde.tasks = seedTasks(
    lunde,
    "setup",
    {
      kyc: "done",
      tripletex: "done",
      business: "done",
      routines: "with_customer",
      payroll: "answered",
      ehf: "done",
      bank: "with_customer",
      altinn: "with_customer",
    },
    {
      kyc: "Owners above 25 %: Yes · Business abroad: No · Cash above 40 000 kr: No · PEP: No. Ola Lunde owns 100 %.",
      tripletex: "Token connected · verified",
      payroll:
        "We pay on the 20th. Drivers' hours come from the tachograph export; my wife Kari sends it on the 3rd.",
    }
  )
  agreed(lunde, ["Scania Finans AS (leasing)", "Fjellinjen (AutoPASS)", "Drammen Havn Eiendom AS", "Telenor Norge AS", "Tripletex AS"], (r) =>
    r.id === "checkin"
      ? {
          ...r,
          task: "Kari sends the tachograph export and answers the pay check-in",
          cadence: { every: "month", day: 3 },
          when: cadenceLabel({ every: "month", day: 3 }),
        }
      : r
  )
  lunde.history.push(
    { id: "lunde-transport-h2", phase: "assessment", action: "approved", by: "ingrid", at: "2026-10-06", note: "Both confirmed" },
    { id: "lunde-transport-h3", phase: "offer", action: "sent", by: "emma", at: "2026-10-06", note: "Offer v1 sent to Ola Lunde" },
    { id: "lunde-transport-h4", phase: "offer", action: "signed", by: "Ola Lunde", at: "2026-10-13" }
  )

  const sentrum: OnboardingCase = {
    ...base("sentrum-optikk", "ingrid", "2026-09-17", "Ingvild's accountant is closing the office at year end."),
    phase: "setup",
    saftFiles: ["SAF-T_2025_926330271.xml"],
    signoffs: { accountant: stamp("2026-09-24", "Ingrid Hansen"), sales: stamp("2026-09-24", "Emma Lie") },
    offer: sentOffer(R("sentrum-optikk"), "2026-09-25", {
      status: "accepted",
      acceptedAt: "2026-09-30",
      takeoverDate: "2026-11-15",
      payroll: true,
    }),
    kyc: { answers: [true, false, false, false], note: "Ingvild Rasmussen owns 100 %." },
  }
  sentrum.tasks = seedTasks(
    sentrum,
    "setup",
    {
      kyc: "done",
      tripletex: "done",
      business: "done",
      routines: "done",
      payroll: "done",
      vat: "done",
      ehf: "na",
      bank: "done",
      altinn: "done",
    },
    {
      kyc: "Owners above 25 %: Yes · Business abroad: No · Cash above 40 000 kr: No · PEP: No.",
      tripletex: "Token connected · verified",
      routines: "Looks right. Invoices go to post@sentrumoptikk.no and I forward them; the report to me as well.",
      payroll: "On the 25th. I send hours myself.",
      bank: "Done, all three.",
      altinn: "Done, registered you today.",
    },
    "2026-10-01"
  )
  // The feed and the registration were checked, not taken on her word.
  sentrum.tasks = sentrum.tasks.map((t) =>
    t.verify ? checked({ ...t, status: "with_customer", settled: undefined }, sentrum) : t
  )
  agreed(sentrum, ["Galleriet Eiendom AS", "Essilor Norge AS", "Safilo Nordic AS", "BKK AS", "Telenor Norge AS", "Tripletex AS", "Gjensidige Forsikring ASA", "DNB Bank ASA"], (r) =>
    r.id === "send-invoices"
      ? { ...r, task: "Ingvild forwards invoices from post@sentrumoptikk.no to the Tripletex inbox" }
      : r
  )
  sentrum.history.push(
    { id: "sentrum-optikk-h2", phase: "assessment", action: "approved", by: "ingrid", at: "2026-09-25", note: "Both confirmed" },
    { id: "sentrum-optikk-h3", phase: "offer", action: "sent", by: "emma", at: "2026-09-25", note: "Offer v1 sent to Ingvild Rasmussen" },
    { id: "sentrum-optikk-h4", phase: "offer", action: "signed", by: "Ingvild Rasmussen", at: "2026-09-30" }
  )

  const molla: OnboardingCase = {
    ...base("molla-bakeri", "marius", "2026-08-27", "Two shops and wholesale. Wants weekly numbers in the busy season."),
    phase: "takeover",
    saftFiles: ["SAF-T_2025_921058846.xml"],
    signoffs: { accountant: stamp("2026-09-03", "Marius Berg"), sales: stamp("2026-09-03", "Emma Lie") },
    offer: sentOffer(R("molla-bakeri"), "2026-09-04", {
      status: "accepted",
      acceptedAt: "2026-09-09",
      takeoverDate: "2026-11-01",
    }),
    kyc: { answers: [true, false, false, false], note: "Sindre Moe and his sister own 50 % each." },
  }
  molla.tasks = [
    // Setup was approved with the bank feed left for after the hand-over:
    // the bank's agreement form was stuck with them. So the takeover
    // balances come from a statement.
    ...seedTasks(
      molla,
      "setup",
      Object.fromEntries(
        build(molla, "setup").map((t) => [t.id.split(":")[1], (t.verify === "bank_feed" ? "with_customer" : "done") as TaskStatus])
      ),
      {},
      "2026-09-10"
    ).map((t) => (t.verify === "bank_feed" ? { ...t, later: stamp("2026-10-14", "Marius Berg") } : t)),
    ...seedTasks(
      molla,
      "takeover",
      {
        statement: "answered",
        history: "done",
        handover: "with_customer",
      },
      { statement: "Here's the statement up to Friday 30 Oct. I'll send Saturday's lines tomorrow, when the bank has them." },
      "2026-10-20",
      { answered: TODAY, settled: TODAY }
    ),
  ]
  agreed(
    molla,
    ["Grünerløkka Eiendom AS", "Norgesmøllene AS", "Tine SA", "Asko Øst AS", "Hafslund Strøm AS", "Telenor Norge AS", "Tripletex AS", "Planday A/S", "DNB Bank ASA"],
    (r) => (r.id === "checkin" ? { ...r, task: "Hanne answers the pay check-in: hires, leavers, holidays and sick leave" } : r)
  )
  molla.history.push(
    { id: "molla-bakeri-h2", phase: "assessment", action: "approved", by: "marius", at: "2026-09-04", note: "Both confirmed" },
    { id: "molla-bakeri-h3", phase: "offer", action: "sent", by: "emma", at: "2026-09-04", note: "Offer v1 sent to Sindre Moe" },
    { id: "molla-bakeri-h4", phase: "offer", action: "signed", by: "Sindre Moe", at: "2026-09-09" },
    { id: "molla-bakeri-h5", phase: "setup", action: "approved", by: "marius", at: "2026-10-14" }
  )

  for (const c of [kollen, brattli]) c.offer!.routines = caseRoutines(c)

  return [vestfjord, gronn, havbruk, kollen, brattli, lunde, sentrum, molla]
}

// ── Status ──

/** Who holds the case now. */
export type Ball = "us" | "customer" | "ready" | "waiting" | "done" | "declined"

export type CaseStatus = { ball: Ball; label: string }

export function phaseTasks(c: OnboardingCase, phase: Phase) {
  return c.tasks.filter((t) => t.phase === phase)
}

/** Still on its way in: not declined, not handed over to operations. */
export function isOnboarding(c: OnboardingCase) {
  return !c.declined && !c.handedOver
}

/** Required, not settled and not left for after the hand-over. */
export function holdsUp(task: OnboardingTask) {
  return task.required && !isSettled(task) && !task.later
}

/** Still to do once the company is in operation: left for later, optional
    or added by hand, and neither settled nor carried into their app. */
export function carriedOver(c: OnboardingCase) {
  return c.tasks.filter((t) => !isSettled(t) && !t.movedTo && (t.later || !t.required || t.manual))
}

/** "Before October is closed", "Before the first a-melding, 5 Dec". */
export function neededByLabel(c: OnboardingCase, task: OnboardingTask) {
  if (!task.neededBy) return undefined
  const takeover = c.offer?.takeoverDate ?? TODAY
  if (task.neededBy === "first_close") return `Before ${formatMonth(takeover)} is closed`
  // The first a-melding we file is for the takeover month, due the 5th after.
  return `Before the first a-melding, ${formatDay(`${nextMonth(takeover.slice(0, 7))}-05`)}`
}

/** The date behind `neededByLabel`: the first month's close (the 10th
    after it) or the first a-melding (the 5th after the takeover month). */
export function neededByDate(c: OnboardingCase, task: OnboardingTask) {
  if (!task.neededBy) return undefined
  const after = nextMonth((c.offer?.takeoverDate ?? TODAY).slice(0, 7))
  return `${after}-${task.neededBy === "first_close" ? "10" : "05"}`
}

/** Their Tripletex is connected, so findings read from it stand. */
export function tripletexConnected(c: OnboardingCase) {
  return c.tasks.some((t) => t.id === `${c.id}:tripletex` && t.status === "done")
}

/** What still stands between this phase and its approval. */
export function blockers(c: OnboardingCase): string[] {
  if (c.phase === "assessment") {
    const out: string[] = []
    if (!c.signoffs.accountant) out.push("The accountant hasn't confirmed")
    if (!c.signoffs.sales) out.push("Sales hasn't confirmed")
    const system = company(c).saft.sourceSystem
    if (c.saftFiles.length && system !== OUR_SYSTEM)
      out.unshift(`Their books are in ${system}, and we only take on ${OUR_SYSTEM} companies for now`)
    const open = phaseTasks(c, "assessment").filter(holdsUp)
    if (open.length) out.push(`${open.length} required ${open.length === 1 ? "task" : "tasks"} still open`)
    return out
  }
  if (c.phase === "setup" || c.phase === "takeover") {
    const open = phaseTasks(c, c.phase).filter(holdsUp)
    const out = open.length ? [`${open.length} required ${open.length === 1 ? "item" : "items"} still open`] : []
    if (c.phase === "takeover" && !takeoverWindowOpen(c))
      out.unshift(`The takeover checks open ${formatDay(windowOpens(c)!)}`)
    return out
  }
  return []
}

export function caseStatus(c: OnboardingCase): CaseStatus {
  if (c.declined) return { ball: "declined", label: `Declined ${formatDay(c.declined.at)}` }
  if (c.handedOver)
    return { ball: "done", label: `In operation from ${formatMonth(c.offer?.takeoverDate ?? c.handedOver.at)}` }
  switch (c.phase) {
    case "assessment": {
      const rec = recommendation(c)
      if (rec === "decline" && registerChecks(company(c)).some((r) => r.light === "red"))
        return { ball: "us", label: "Fails the register check · decide" }
      if (!c.saftFiles.length) return { ball: "customer", label: "Waiting for SAF-T files" }
      const confirmed = Number(Boolean(c.signoffs.accountant)) + Number(Boolean(c.signoffs.sales))
      if (confirmed === 2) return { ball: "ready", label: "Ready to send the offer" }
      return { ball: "us", label: `To decide · ${confirmed} of 2 confirmed` }
    }
    case "offer": {
      const offer = c.offer!
      if (offer.status === "questioned") return { ball: "us", label: "Customer asked about the offer" }
      if (offer.validUntil < TODAY) return { ball: "us", label: `Offer expired ${formatDay(offer.validUntil)}` }
      return { ball: "customer", label: `Offer sent ${formatDay(offer.sentAt)} · waiting to sign` }
    }
    case "setup":
    case "takeover": {
      const tasks = phaseTasks(c, c.phase).filter((t) => !isSettled(t) && !t.later)
      const answered = tasks.filter((t) => t.status === "answered").length
      const ours = tasks.filter((t) => t.status === "open").length
      const theirs = tasks.filter((t) => t.status === "with_customer").length
      // A question from them that nobody answered comes first.
      const last = c.thread.filter((m) => !m.internal).at(-1)
      if (last?.from === "customer" && c.offer?.acceptedAt && last.at >= c.offer.acceptedAt)
        return { ball: "us", label: `${company(c).contact.name.split(" ")[0]} asked a question` }
      if (c.phase === "takeover" && !takeoverWindowOpen(c))
        return { ball: "waiting", label: `Checks open ${formatDay(windowOpens(c)!)}` }
      if (answered) return { ball: "us", label: `${answered} ${answered === 1 ? "answer" : "answers"} to review` }
      if (!blockers(c).length) return { ball: "ready", label: `Ready to approve ${PHASE_LABEL[c.phase].toLowerCase()}` }
      if (ours) return { ball: "us", label: `${ours} for you${theirs ? ` · ${theirs} with customer` : ""}` }
      return { ball: "customer", label: `Waiting on customer · ${theirs} open` }
    }
  }
}

export const BALL_META: Record<Ball, { label: string; dot: string }> = {
  us: { label: "Your move", dot: "bg-warning" },
  customer: { label: "Their move", dot: "bg-info" },
  ready: { label: "Ready", dot: "bg-success" },
  waiting: { label: "Waiting", dot: "bg-muted-foreground/40" },
  done: { label: "In operation", dot: "bg-success" },
  declined: { label: "Declined", dot: "bg-muted-foreground/40" },
}

/** The company's onboarding link exists once there is an offer to read. */
export function hasCustomerLink(c: OnboardingCase) {
  return Boolean(c.offer)
}

export function personName(id: string) {
  return TEAM_BY_ID.get(id)?.name ?? ACCOUNTANT_BY_ID.get(id)?.name ?? id
}

// ── Reducer ──

export type OnboardingAction =
  | {
      type: "create"
      id: string
      accountantId: string
      meetingNote: string
      /** SAF-T files uploaded with the company; they can also come later. */
      saftFiles?: string[]
    }
  | { type: "upload_saft"; caseId: string }
  | { type: "signoff"; caseId: string; role: "accountant" | "sales"; on: boolean; by: string }
  | { type: "send_offer"; caseId: string; terms: OfferTerms }
  | { type: "offer_message"; caseId: string; from: "customer" | "firm"; author: string; text: string; internal?: boolean }
  /** Signing on their link, with the KYC answers that come before it. */
  | { type: "sign"; caseId: string; kyc?: Kyc; signature?: Signature }
  | { type: "decline"; caseId: string; reason: string }
  | { type: "restore"; caseId: string }
  | { type: "send_task"; caseId: string; taskId: string; message: string }
  | { type: "answer_task"; caseId: string; taskId: string; text: string; file?: string }
  | { type: "submit_kyc"; caseId: string; kyc: Kyc }
  | { type: "settle_task"; caseId: string; taskId: string; status: "done" | "na" | "open" }
  | { type: "simulate_answer"; caseId: string; taskId: string }
  | { type: "approve"; caseId: string }
  | { type: "reopen"; caseId: string; phase: "setup" | "takeover"; reason: string }
  | { type: "start_takeover_early"; caseId: string }
  /** Looks for ourselves: the bank feed in Tripletex, our role in the
      register. */
  | { type: "check_task"; caseId: string; taskId: string }
  /** Leaves a task for after the hand-over, or takes it back. */
  | { type: "set_later"; caseId: string; taskId: string; on: boolean }
  /** At hand-over, a task still with the company became a task in their
      app. */
  | { type: "moved_task"; caseId: string; taskId: string; requestId: string }
  | {
      /** A task a person adds by hand, in any phase. With an ask, it is for
          the company; send puts it on their link at once. */
      type: "add_task"
      caseId: string
      phase: Phase
      group: string
      title: string
      note?: string
      required: boolean
      ask?: { kind: ManualAskKind; message: string; options?: string[] }
      send?: boolean
    }
  | { type: "remove_task"; caseId: string; taskId: string }
  /** "Approve from now on" for one supplier (name) or, without one, all. */
  | { type: "pre_approve_supplier"; caseId: string; name?: string; on: boolean }
  /** Confirms an employee's pay agreement (name) or, without one, all. */
  | { type: "pre_approve_employee"; caseId: string; name?: string; on: boolean }
  | { type: "update_routine"; caseId: string; routineId: string; patch: Partial<Omit<Routine, "id">> }
  | { type: "add_routine"; caseId: string; who: Routine["who"] }
  | { type: "remove_routine"; caseId: string; routineId: string }
  | { type: "reset_routines"; caseId: string }

const CANNED_ANSWER: Record<AskKind, string> = {
  confirm: "Done",
  text: "I send hours and absence by the 15th.",
  file: "Uploaded.",
  choice: "",
  kyc: "",
  token: "Connected · checked against the org. no.",
  routines: "Looks right.",
}

/** Simulated answers that fit their question, by template task. */
const CANNED_BY_TASK: Record<string, (c: OnboardingCase) => string> = {
  payroll: () => `Yes, the ${ordinal(TRIPLETEX_PAY_DAY)}.`,
  handover: (c) =>
    selfManaged(c)
      ? "Nothing open except the lease on the studio, renewed in March. The vouchers are in Tripletex, and the paper ones in a folder at the studio."
      : "Uploaded the handover letter.",
}

/** What a check sees. In the demo: it runs once they say it's done, or when
    the question went out on an earlier day (they did it and didn't say). */
function runCheck(task: OnboardingTask, c: OnboardingCase): NonNullable<OnboardingTask["check"]> {
  const done = Boolean(task.answer) || (task.ask?.sentAt !== undefined && task.ask.sentAt < TODAY)
  const accounts = bankAccounts(company(c))
  if (task.verify === "bank_feed")
    return done
      ? {
          at: TODAY,
          ok: true,
          text: `Feed running: lines from ${accounts.map((a) => a.ledger).join(", ")} reached Tripletex this morning.`,
        }
      : { at: TODAY, ok: false, text: "Nothing from their bank has reached Tripletex yet." }
  return done
    ? { at: TODAY, ok: true, text: `${FIRM.name} is registered as accountant in the Brønnøysund register, with the a-melding role.` }
    : { at: TODAY, ok: false, text: `${FIRM.name} isn't registered as their accountant yet: the registration waits for a signature in Altinn.` }
}

const CHECKED_BY: Record<NonNullable<OnboardingTask["verify"]>, string> = {
  bank_feed: "Tripletex check",
  altinn_role: "Register check",
}

/** Runs a task's check and settles it when the check passes. */
function checked(task: OnboardingTask, c: OnboardingCase): OnboardingTask {
  if (!task.verify) return task
  const check = runCheck(task, c)
  return check.ok
    ? { ...task, check, status: "done", settled: { at: TODAY, by: CHECKED_BY[task.verify] } }
    : { ...task, check }
}

/** What they last agreed to: the signed list, or the last change they
    confirmed. */
function confirmedRoutines(c: OnboardingCase): Routine[] {
  return c.confirmedRoutines ?? c.offer?.routines ?? caseRoutines({ ...c, routines: undefined })
}

/** Each change from one list to the other, in words: "Reconciles the bank
    accounts: Monthly, by the 10th → Every 2nd month, by the 10th". */
export function routineChanges(before: Routine[], after: Routine[]): string[] {
  const out: string[] = []
  const was = new Map(before.map((r) => [r.id, r]))
  const side = (r: Routine) => (r.who === "firm" ? "Sanna" : "you")
  for (const r of after) {
    if (!r.task.trim()) continue
    const old = was.get(r.id)
    if (!old) out.push(`New for ${side(r)}: ${r.task} (${r.when})`)
    else {
      if (old.who !== r.who) out.push(`${r.task}: now ${side(r)}`)
      if ((old.when ?? "") !== (r.when ?? "")) out.push(`${r.task}: ${old.when} → ${r.when}`)
      if (old.task !== r.task && old.who === r.who) out.push(`“${old.task}” is now “${r.task}”`)
    }
  }
  const now = new Set(after.map((r) => r.id))
  for (const r of before) if (!now.has(r.id) && r.task.trim()) out.push(`No longer: ${r.task}`)
  return out
}

/** The "who does what" task, once the division of work changed after
    signing: the change goes back to them to confirm. */
function routinesChanged(c: OnboardingCase): OnboardingCase {
  if (c.offer?.status !== "accepted" || c.handedOver) return c
  const id = `${c.id}:routines`
  const first = company(c).contact.name.split(" ")[0]
  const existing = c.tasks.find((t) => t.id === id)
  // Sent: they confirm what they were shown; a further change waits.
  if (existing?.status === "with_customer") return c
  const changes = routineChanges(confirmedRoutines(c), caseRoutines(c))
  // Changed back to what they signed: nothing to confirm.
  if (!changes.length) return existing && existing.status === "open" ? { ...c, tasks: c.tasks.filter((t) => t.id !== id) } : c
  const task: OnboardingTask = {
    id,
    phase: c.phase,
    group: "How we work together",
    title: "Who does what · changed since signing",
    finding: `The division of work changed after ${first} signed. It's part of the agreement, so they confirm the new version.`,
    source: "The signed agreement",
    required: true,
    status: "open",
    ask: {
      kind: "routines",
      message: `Hi ${first}, we'd like to change who does what since you signed:\n${changes.map((line) => `• ${line}`).join("\n")}\nCheck the whole list and confirm, or tell us what to change.`,
    },
  }
  return existing
    ? withTask(c, id, (t) => ({ ...t, ...task, phase: t.phase, group: t.group }))
    : { ...c, tasks: [...c.tasks, task] }
}

function event(c: OnboardingCase, e: Omit<PhaseEvent, "id" | "at"> & { at?: string }): PhaseEvent[] {
  // Ids come from the history length, so StrictMode's double-invoked reducer
  // produces the same one twice.
  return [...c.history, { id: `${c.id}-h${c.history.length + 1}`, at: TODAY, ...e }]
}

function withTask(c: OnboardingCase, taskId: string, patch: (t: OnboardingTask) => OnboardingTask) {
  return { ...c, tasks: c.tasks.map((t) => (t.id === taskId ? patch(t) : t)) }
}

/** A customer answer: a verified connection settles itself, one we can
    check is checked, anything else comes back to us to review. */
function answered(c: OnboardingCase, task: OnboardingTask, text: string, file?: string): OnboardingTask {
  const answer = { text, file, at: TODAY }
  if (task.ask?.kind === "token")
    return { ...task, status: "done", answer, settled: { at: TODAY, by: "Tripletex check" } }
  if (task.verify) {
    const next = checked({ ...task, answer }, c)
    // A note with it ("done for two of them, not sure about the third")
    // is for a person to read, whatever the check says.
    const note = text.replace(/^done\.?\s*/i, "").trim()
    if (next.status === "done" && !note) return next
    return { ...next, status: "answered", settled: undefined }
  }
  return { ...task, status: "answered", answer }
}

/** Signing turns the offer into the engagement: Setup starts with their
    KYC answers in for review, and what only the company can do goes out on
    their link at once: the Tripletex connection, the bank feed, and signing
    the Altinn registration we filed for them. */
function startSetup(c: OnboardingCase): OnboardingCase {
  const existing = phaseTasks(c, "setup").filter((t) => !t.manual)
  const tasks = existing.length
    ? existing
    : build(c, "setup").map((t) => {
        if (t.ask?.kind === "kyc" && c.kyc)
          return {
            ...t,
            status: "answered" as const,
            ask: { ...t.ask, sentAt: TODAY },
            answer: { text: kycSummary(c.kyc), at: TODAY },
          }
        if (t.ask && (t.ask.kind === "kyc" || t.ask.kind === "token" || t.verify))
          return { ...t, status: "with_customer" as const, ask: { ...t.ask, sentAt: TODAY } }
        return t
      })
  // Tasks added by hand during the offer stay, after the template's.
  const manual = c.tasks.filter((t) => t.phase === "setup" && t.manual)
  return {
    ...c,
    phase: "setup",
    tasks: [...c.tasks.filter((t) => t.phase !== "setup"), ...tasks, ...manual],
    // What the first "how we work together" meeting goes through.
    suppliers: caseSuppliers(c),
    employees: caseEmployees(c),
    routines: caseRoutines(c),
  }
}

export function onboardingReducer(cases: OnboardingCase[], action: OnboardingAction, me: string): OnboardingCase[] {
  if (action.type === "create") {
    if (cases.some((c) => c.id === action.id)) return cases
    const c = base(action.id, action.accountantId, TODAY, action.meetingNote)
    return [
      ...cases,
      { ...c, saftFiles: action.saftFiles ?? [], history: [{ ...c.history[0], by: me }] },
    ]
  }

  return cases.map((c) => (c.id === action.caseId ? apply(c, action, me) : c))
}

function apply(c: OnboardingCase, action: Exclude<OnboardingAction, { type: "create" }>, me: string): OnboardingCase {
  const contact = company(c).contact.name
  switch (action.type) {
    case "upload_saft": {
      if (c.saftFiles.length) return c
      const org = company(c).orgNo.replaceAll(" ", "")
      return { ...c, saftFiles: [`SAF-T_2025_${org}.xml`, `SAF-T_2026H1_${org}.xml`] }
    }

    case "signoff": {
      if (c.phase !== "assessment") return c
      const signoffs = { ...c.signoffs }
      if (action.on) signoffs[action.role] = { at: TODAY, by: personName(action.by) }
      else delete signoffs[action.role]
      return { ...c, signoffs }
    }

    case "send_offer": {
      if (c.phase !== "assessment" && c.phase !== "offer") return c
      const version = (c.offer?.version ?? 0) + 1
      const offer: Offer = {
        ...action.terms,
        // Who does what, as someone worked on it, fitted to the scope in
        // these terms: no payroll, no pay lines; payroll added, the template's.
        routines: fitScope(c, action.terms),
        version,
        sentAt: TODAY,
        validUntil: addDays(TODAY, 20),
        status: "sent",
      }
      const history =
        c.phase === "assessment"
          ? event(
              { ...c, history: event(c, { phase: "assessment", action: "approved", by: me, note: "Both confirmed" }) },
              { phase: "offer", action: "sent", by: me, note: `Offer v${version} sent to ${contact}` }
            )
          : event(c, {
              phase: "offer",
              action: "sent",
              by: me,
              note: `Offer v${version} replaces v${version - 1}`,
            })
      return { ...c, phase: "offer", offer, routines: offer.routines, history }
    }

    case "offer_message": {
      if (!c.offer) return c
      const message: OfferMessage = {
        id: `${c.id}-m${c.thread.length + 1}`,
        from: action.from,
        author: action.author,
        internal: action.internal || undefined,
        text: action.text,
        at: TODAY,
      }
      const status =
        c.offer.status === "accepted" || action.internal
          ? c.offer.status
          : action.from === "customer"
            ? "questioned"
            : "answered"
      return { ...c, thread: [...c.thread, message], offer: { ...c.offer, status } }
    }

    case "sign": {
      if (c.phase !== "offer" || !c.offer) return c
      const signedRoutines = c.offer.routines ?? caseRoutines(c)
      const edited = c.routines
      const started = startSetup({
        ...c,
        kyc: action.kyc ?? defaultKyc(company(c)),
        // What they signed is the agreement; an edit made after this
        // version went out isn't lost, it goes back to them as a change.
        routines: signedRoutines,
        offer: { ...c.offer, status: "accepted", acceptedAt: TODAY, signature: action.signature },
        history: event(c, { phase: "offer", action: "signed", by: contact }),
      })
      return edited && routineChanges(signedRoutines, edited).length ? routinesChanged({ ...started, routines: edited }) : started
    }

    case "decline":
      return {
        ...c,
        declined: { at: TODAY, by: personName(me), reason: action.reason },
        history: event(c, { phase: c.phase, action: "declined", by: me, note: action.reason }),
      }

    case "restore":
      return {
        ...c,
        declined: undefined,
        history: event(c, { phase: c.phase, action: "restored", by: me }),
      }

    case "send_task":
      return withTask(c, action.taskId, (t) =>
        t.ask && !isSettled(t)
          ? {
              ...t,
              status: "with_customer",
              ask: { ...t.ask, message: action.message, sentAt: TODAY },
              answer: undefined,
            }
          : t
      )

    case "answer_task":
      return withTask(c, action.taskId, (t) =>
        t.status === "with_customer" ? answered(c, t, action.text, action.file) : t
      )

    case "submit_kyc": {
      const task = c.tasks.find((t) => t.ask?.kind === "kyc" && t.status === "with_customer")
      if (!task) return c
      return withTask({ ...c, kyc: action.kyc }, task.id, (t) => answered(c, t, kycSummary(action.kyc)))
    }

    case "simulate_answer": {
      const task = c.tasks.find((t) => t.id === action.taskId)
      if (!task?.ask || task.status !== "with_customer") return c
      if (task.ask.kind === "kyc") return apply(c, { type: "submit_kyc", caseId: c.id, kyc: defaultKyc(company(c)) }, me)
      const key = task.id.split(":")[1]
      const text =
        task.ask.kind === "choice"
          ? task.ask.options?.[0] ?? "Yes"
          : CANNED_BY_TASK[key]?.(c) ?? CANNED_ANSWER[task.ask.kind]
      return withTask(c, task.id, (t) => answered(c, t, text, task.ask!.kind === "file" ? "dokument.pdf" : undefined))
    }

    case "check_task":
      return withTask(c, action.taskId, (t) => (t.verify && !isSettled(t) ? checked(t, c) : t))

    case "set_later":
      return withTask(c, action.taskId, (t) =>
        action.on ? { ...t, later: { at: TODAY, by: personName(me) } } : { ...t, later: undefined }
      )

    case "moved_task":
      return withTask(c, action.taskId, (t) => ({
        ...t,
        movedTo: action.requestId,
        status: "done",
        settled: { at: TODAY, by: "Moved to their app" },
      }))

    case "settle_task": {
      const task = c.tasks.find((t) => t.id === action.taskId)
      // Accepting their yes to a changed division of work amends the
      // agreement: it's what they agreed to from now on, and it's on record.
      if (task?.ask?.kind === "routines" && action.status === "done" && task.answer) {
        const settled = withTask(c, task.id, (t) => ({ ...t, status: "done", settled: { at: TODAY, by: personName(me) } }))
        return {
          ...settled,
          confirmedRoutines: caseRoutines(c),
          history: event(c, {
            phase: c.phase,
            action: "amended",
            by: contact,
            note: `Who does what changed, confirmed ${formatDay(task.answer.at)}`,
          }),
        }
      }
      return withTask(c, action.taskId, (t) =>
        action.status === "open"
          ? { ...t, status: t.answer ? "answered" : "open", settled: undefined }
          : { ...t, status: action.status, settled: { at: TODAY, by: personName(me) } }
      )
    }

    case "approve": {
      if (blockers(c).length) return c
      if (c.phase === "setup") {
        const has = phaseTasks(c, "takeover").some((t) => !t.manual)
        return {
          ...c,
          phase: "takeover",
          tasks: has ? c.tasks : [...c.tasks, ...build(c, "takeover")],
          history: event(c, { phase: "setup", action: "approved", by: me }),
        }
      }
      if (c.phase === "takeover" && !c.handedOver)
        return {
          ...c,
          handedOver: { at: TODAY, by: personName(me) },
          history: event(c, { phase: "takeover", action: "approved", by: me, note: "Handed over to operations" }),
        }
      return c
    }

    case "reopen": {
      if (c.handedOver || phaseIndex(action.phase) >= phaseIndex(c.phase)) return c
      return {
        ...c,
        phase: action.phase,
        history: event(c, { phase: action.phase, action: "reopened", by: me, note: action.reason }),
      }
    }

    case "start_takeover_early":
      return c.takeoverStartedEarly ? c : { ...c, takeoverStartedEarly: { at: TODAY, by: personName(me) } }

    case "add_task": {
      const title = action.title.trim()
      if (!title) return c
      // Numbered from the manual tasks so far, so StrictMode's double-invoked
      // reducer produces the same id twice.
      const n = c.tasks.filter((t) => t.manual).length + 1
      const sent = Boolean(action.ask && action.send)
      const task: OnboardingTask = {
        id: `${c.id}:manual-${n}`,
        phase: action.phase,
        group: action.group.trim() || "Other",
        title,
        finding: action.note?.trim() ?? "",
        required: action.required,
        status: sent ? "with_customer" : "open",
        ask: action.ask ? { ...action.ask, sentAt: sent ? TODAY : undefined } : undefined,
        manual: { at: TODAY, by: personName(me) },
      }
      return { ...c, tasks: [...c.tasks, task] }
    }

    case "remove_task":
      return { ...c, tasks: c.tasks.filter((t) => t.id !== action.taskId || !t.manual) }

    case "pre_approve_supplier":
      return {
        ...c,
        suppliers: caseSuppliers(c).map((s) =>
          !action.name || s.name === action.name ? { ...s, preApproved: action.on } : s
        ),
      }

    case "pre_approve_employee":
      return {
        ...c,
        employees: caseEmployees(c).map((e) =>
          !action.name || e.name === action.name ? { ...e, preApproved: action.on } : e
        ),
      }

    case "update_routine":
      return routinesChanged({
        ...c,
        routines: caseRoutines(c).map((r) => (r.id === action.routineId ? { ...r, ...action.patch } : r)),
      })

    case "add_routine": {
      const routines = caseRoutines(c)
      // Numbered past every added row so far, so StrictMode's double-invoked
      // reducer produces the same id twice and a removed row's id is never
      // reused.
      const n = Math.max(0, ...routines.map((r) => Number(r.id.match(/^added-(\d+)$/)?.[1] ?? 0))) + 1
      const cadence: Cadence = { every: "event", text: "When it happens" }
      return routinesChanged({
        ...c,
        routines: [
          ...routines,
          { id: `added-${n}`, area: "general", who: action.who, task: "", cadence, when: cadenceLabel(cadence) },
        ],
      })
    }

    case "remove_routine":
      return routinesChanged({ ...c, routines: caseRoutines(c).filter((r) => r.id !== action.routineId) })

    case "reset_routines":
      return routinesChanged({ ...c, routines: caseRoutines({ ...c, routines: undefined }) })
  }
}

/** What the agent makes of an answer before anyone accepts it: whether it
    answers the question, and what to do if not. Reads the words; says
    nothing when there is nothing to say. */
export function readTaskAnswer(c: OnboardingCase, task: OnboardingTask): { ok: boolean; text: string } | undefined {
  const answer = task.answer
  if (!answer || task.status !== "answered") return undefined
  const text = answer.text.trim()
  const lower = text.toLowerCase()
  const key = task.id.split(":")[1]
  const first = company(c).contact.name.split(" ")[0]
  // "I'll send the rest on Thursday": an answer that says it isn't one yet.
  if (/\b(i'll|i will|we'll|we will|later|next week|on (monday|tuesday|wednesday|thursday|friday))\b/.test(lower) && /\bsend|upload|follow/.test(lower))
    return { ok: false, text: `${first} says more is coming. Keep it open until it's in.` }
  if (task.ask?.kind === "kyc" && c.kyc) {
    const owners = registeredOwners(company(c))
    const said = c.kyc.comments?.[0] ?? ""
    const missing = owners.filter((o) => !said.toLowerCase().includes(o.name.split(" ")[0].toLowerCase()))
    if (c.kyc.answers[0] && !missing.length)
      return { ok: true, text: "The owners they named match the register of beneficial owners." }
    if (missing.length)
      return {
        ok: false,
        text: `The register of beneficial owners also lists ${missing.map((o) => `${o.name} (${o.share} %)`).join(", ")}. Ask about it before accepting.`,
      }
  }
  if (task.ask?.kind === "routines" && lower.startsWith("change:"))
    return { ok: false, text: `${first} wants a change. Edit who does what, then send it again.` }
  if (key === "payroll") {
    const said = text.match(/\b(?:pay|paid|on) (?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i) ?? text.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/)
    const day = said ? Number(said[1]) : undefined
    if (/^(yes|yep|correct|right)\b/i.test(text) || day === TRIPLETEX_PAY_DAY)
      return { ok: true, text: `Pay day is the ${ordinal(TRIPLETEX_PAY_DAY)}, as Tripletex shows. Accepting puts it on the client.` }
    if (day)
      return {
        ok: false,
        text: `Says pay day is the ${ordinal(day)}, but the last pay runs in Tripletex went out on the ${ordinal(TRIPLETEX_PAY_DAY)}. Check which is right before the first pay run.`,
      }
    return { ok: false, text: "Doesn't say which day. Ask again?" }
  }
  if (key === "handover" && selfManaged(c)) {
    const archive = /voucher|archive|folder|tripletex|binder|box|drive|dropbox|office|kept/i.test(text)
    const open = /open|nothing|lease|loan|agreement|contract|dispute|waiting|owe/i.test(text)
    if (archive && open) return { ok: true, text: "Says what's open and where the vouchers are kept." }
    return {
      ok: false,
      text: archive ? "Says where the vouchers are, not what's still open. Ask again?" : "Doesn't say where the vouchers are kept. Ask again?",
    }
  }
  if (task.ask?.kind === "file")
    return answer.file
      ? { ok: true, text: `File attached: ${answer.file}.` }
      : { ok: false, text: "No file came with the answer." }
  // Anything else written: does it talk about what was asked at all?
  if (task.ask?.kind === "text" && !offTopicExempt(text)) {
    const words = (t: string) =>
      new Set(t.toLowerCase().match(/[a-zæøå]{5,}/g)?.filter((w) => !COMMON_WORDS.has(w)) ?? [])
    const asked = words(`${task.title} ${task.ask.message}`)
    const shared = [...words(text)].some((w) => asked.has(w) || [...asked].some((a) => a.slice(0, 5) === w.slice(0, 5)))
    if (!shared) return { ok: false, text: "Doesn't seem to answer what was asked. Read it, and ask again if so." }
  }
  return undefined
}

const COMMON_WORDS = new Set(["about", "there", "their", "which", "would", "could", "should", "these", "those", "where", "please", "thanks"])

/** Short replies that answer anything: "yes", "done", "no". */
function offTopicExempt(text: string) {
  return /^(yes|no|done|ok|okay|sure|nothing)\b/i.test(text.trim()) || text.trim().length < 12
}

/** The tasks the company sees: sent to them, answered, or settled after
    they answered. Never the finding, never anything not sent. */
export function customerTasks(c: OnboardingCase) {
  return c.tasks.filter((t) => t.ask?.sentAt && !t.movedTo)
}

// ── In operation ──

/** The client's icon and the shape of its generated monthly figures. */
const INDUSTRY_KEY: Record<string, IndustryKey> = {
  "vestfjord-sykkel": "bikes",
  "gronn-hage": "cafe",
  "nordkyst-havbruk": "seafood",
  "kollen-fysio": "dental",
  "brattli-elektro": "plumbing",
  "lunde-transport": "logistics",
  "sentrum-optikk": "dental",
  "molla-bakeri": "cafe",
  "havly-yoga": "climbing",
  "polar-kaffe": "cafe",
  "nordnes-snekker": "construction",
}

const COLORS = ["stroke-teal-500", "stroke-sky-500", "stroke-rose-500", "stroke-indigo-500", "stroke-lime-500", "stroke-orange-500"]

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })

/** The pay day the company gave us in setup ("We pay on the 20th"), or the 25th. */
function payDay(c: OnboardingCase) {
  const answer = c.tasks.find((t) => t.id === `${c.id}:payroll`)?.answer?.text
  const day = Number(answer?.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/)?.[1])
  return day >= 1 && day <= 28 ? day : 25
}

/** A handed-over company as a client in operation: the register's facts, the
    signed offer and what onboarding learned. Its id is the case id, so
    /clients/<case id> is its page. The months before the takeover were kept
    elsewhere, so its work starts empty. */
export function clientFromCase(c: OnboardingCase): Client {
  const co = company(c)
  const offer = c.offer
  const takeover = offer?.takeoverDate ?? c.handedOver?.at ?? TODAY
  const accounts = bankAccounts(co)
  const previous = offer?.previousAccountant || co.currentAccountant
  const term = vatTermOf(co)
  // What the customer told us in Setup, kept for the agents and the team.
  const said = (key: string) => c.tasks.find((t) => t.id === `${c.id}:${key}`)?.answer
  const routinesAnswer = said("routines")
  const payrollAnswer = said("payroll")
  const notes = [
    `Handed over from onboarding ${formatDay(c.handedOver?.at ?? TODAY)}. We keep the books from ${formatDay(takeover)}.`,
    c.meetingNote,
    offer
      ? `${formatKr(offer.monthly)} a month for up to ${offer.includedEmployees} employees and ${nok.format(offer.includedVouchers)} vouchers a year.`
      : "",
    previous && offer?.handoverNote ? `${previous}: ${offer.handoverNote}` : "",
    c.kyc?.note ?? "",
    routinesAnswer ? `Who does what, confirmed ${formatDay(routinesAnswer.at)}: “${routinesAnswer.text}”` : "",
    payrollAnswer ? `Pay: “${payrollAnswer.text}”` : "",
    co.saft.summary,
  ]
  return {
    id: c.id,
    name: co.name,
    orgNo: co.orgNo,
    industry: co.industry,
    industryKey: INDUSTRY_KEY[c.id] ?? "it",
    employees: co.employees,
    accountantId: c.accountantId,
    contacts: [{ ...co.contact, responsiveness: "New customer, no reply pattern yet" }],
    period: formatMonth(takeover),
    payDate: `${payDay(c)} ${MONTH_SHORT.format(new Date(`${nextMonth(OPEN_MONTH)}-01T12:00:00Z`))}`,
    vatTerm: term,
    bankAccount: accounts[0].number,
    accounts,
    nextDeadline: { label: "Takeover", date: formatDay(takeover) },
    since: takeover.slice(0, 7),
    color: COLORS[hash(c.id) % COLORS.length],
    profile: {
      clientSince: MONTH_YEAR.format(new Date(`${takeover}T12:00:00Z`)),
      services: [
        "Bookkeeping",
        ...(offer?.payroll ? ["Payroll"] : []),
        ...(offer?.invoicing ? ["Invoicing"] : []),
        `VAT (${term.toLowerCase()})`,
        "Annual accounts",
      ],
      systems: ["Tripletex", `DNB ${accounts[0].number}`],
      revenueLastYear: co.revenue,
      fiscalYear: "Calendar year",
      address: co.city,
      // Notes are keyed by their text.
      notes: [...new Set(notes.filter(Boolean))],
      routines: caseRoutines(c),
    },
  }
}

// Built once per case object, so a client keeps its identity until its
// case changes.
const CLIENTS_BY_CASE = new WeakMap<OnboardingCase, Client>()

/** The companies onboarding has handed over, as clients in operation. */
export function handedOverClients(cases: OnboardingCase[]): Client[] {
  return cases
    .filter((c) => c.handedOver && !c.declined)
    .map((c) => {
      const cached = CLIENTS_BY_CASE.get(c)
      if (cached) return cached
      const client = clientFromCase(c)
      CLIENTS_BY_CASE.set(c, client)
      return client
    })
}

// ── Saved cases ──

/** Cases saved by earlier builds. The "live" phase became a handover at the
    takeover (stamped from the approval that handed it over), and an
    "imported" assessment counts as approved. Cases for companies no longer
    in the register are dropped. */
export function migrateOnboarding(saved: OnboardingCase[]): OnboardingCase[] {
  const phase = (p: string) => (p === "live" ? "takeover" : p) as Phase
  return saved
    .filter((c) => REGISTER_BY_ID.has(c.id))
    .map((c) => {
      const history = (c.history ?? []).map((e) => ({
        ...e,
        phase: phase(e.phase),
        action: (e.action as string) === "imported" ? ("approved" as const) : e.action,
      }))
      const live = (c.phase as string) === "live"
      const handover = history.findLast(
        (e) => e.action === "approved" && (e.phase === "takeover" || e.note === "Handed over to operations")
      )
      return {
        ...c,
        phase: phase(c.phase),
        saftFiles: c.saftFiles ?? [],
        signoffs: c.signoffs ?? {},
        thread: c.thread ?? [],
        tasks: (c.tasks ?? []).map((t) => ({ ...t, phase: phase(t.phase) })),
        handedOver:
          c.handedOver ??
          (live
            ? handover
              ? { at: handover.at, by: personName(handover.by) }
              : { at: c.offer?.takeoverDate ?? c.createdAt, by: personName(c.accountantId) }
            : undefined),
        history,
      }
    })
}
