import type {
  Activity,
  BankAccount,
  Client,
  ClientProfile,
  CustomerRequest,
  IssueKind,
  ItemStatus,
  Person,
  ReviewItem,
  Signal,
  SourceKind,
} from "./types"
import { defaultRoutines } from "./routines"

// ── People ──

export const ACCOUNTANTS: Person[] = [
  {
    id: "ingrid",
    name: "Ingrid Hansen",
    initials: "IH",
    email: "ingrid@sanna.no",
    role: "Accountant",
  },
  {
    id: "marius",
    name: "Marius Berg",
    initials: "MB",
    email: "marius@sanna.no",
    role: "Accountant",
  },
  {
    id: "sofie",
    name: "Sofie Nilsen",
    initials: "SN",
    email: "sofie@sanna.no",
    role: "Payroll specialist",
  },
]

export const CURRENT_USER = ACCOUNTANTS[0]

export const ACCOUNTANT_BY_ID = new Map(ACCOUNTANTS.map((a) => [a.id, a]))

/** Everyone a task can be passed to: the accountants and the people around
    them who don't own clients. */
export const TEAM: Person[] = [
  ...ACCOUNTANTS,
  {
    id: "emma",
    name: "Emma Lie",
    initials: "EL",
    email: "emma@sanna.no",
    role: "Sales",
  },
]

export const TEAM_BY_ID = new Map(TEAM.map((p) => [p.id, p]))

// ── Clients ──

function contact(
  id: string,
  name: string,
  role: string,
  domain: string
): Person {
  const [first, last] = name.split(" ")
  const h = hash(name)
  return {
    id,
    name,
    role,
    initials: `${first[0]}${last?.[0] ?? ""}`,
    email: `${first.toLowerCase()}@${domain}`,
    phone: `+47 ${900 + (h % 90)} ${String(10 + (h % 89)).padStart(2, "0")} ${String(100 + (h % 899)).slice(0, 3)}`,
    responsiveness: RESPONSIVENESS[h % RESPONSIVENESS.length],
  }
}

const RESPONSIVENESS = [
  "Usually replies within a day",
  "Replies in 2-3 days, answers faster on SMS",
  "Replies same day, often from the phone",
  "Slow on e-mail, prefers the customer app",
]

/** A vehicle the company owns or leases, as the agent knows it: from the
    Statens vegvesen register on the org number, the asset accounts
    (1230/1240) in the SAF-T, and lease invoices. Decides the VAT on fuel. */
export type Vehicle = {
  reg: string
  kind: "passenger car" | "van, class 2"
  how: "owned" | "leased"
}

/** Clients whose vehicles were checked, and what was found. A client not
    here hasn't been checked: the agent asks. */
export const VEHICLES: Record<string, { checked: string; list: Vehicle[] }> = {
  "fjord-kaffebar": { checked: "Statens vegvesen and the SAF-T, Jan 2026", list: [] },
  "bergen-bygg": {
    checked: "Statens vegvesen and the SAF-T, Jan 2026",
    list: [
      { reg: "EV 41207", kind: "van, class 2", how: "leased" },
      { reg: "EL 88310", kind: "van, class 2", how: "owned" },
    ],
  },
  "nordkapp-ror": {
    checked: "Statens vegvesen and the SAF-T, Jan 2026",
    list: [{ reg: "VH 20981", kind: "van, class 2", how: "owned" }],
  },
}

const CLIENT_SEEDS: Omit<Client, "profile" | "accounts">[] = [
  {
    id: "fjord-kaffebar",
    name: "Fjord Kaffebar AS",
    orgNo: "923 456 781",
    industry: "Café & bakery",
    industryKey: "cafe",
    employees: 12,
    accountantId: "ingrid",
    contacts: [
      contact("kari", "Kari Nordmann", "CEO", "fjordkaffebar.no"),
      contact("anders", "Anders Lie", "Shop manager", "fjordkaffebar.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1503.44.12877",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: true,
    color: "stroke-amber-500",
  },
  {
    id: "nordlys-design",
    name: "Nordlys Design AS",
    orgNo: "918 223 904",
    industry: "Design studio",
    industryKey: "design",
    employees: 6,
    accountantId: "ingrid",
    contacts: [
      contact("thea", "Thea Moen", "Founder", "nordlys.design"),
    ],
    period: "October 2026",
    payDate: "25 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1207.33.90412",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: true,
    color: "stroke-violet-500",
  },
  {
    id: "bergen-bygg",
    name: "Bergen Byggservice AS",
    orgNo: "912 778 330",
    industry: "Construction",
    industryKey: "construction",
    employees: 18,
    accountantId: "marius",
    contacts: [
      contact("per", "Per Haugen", "Managing director", "bergenbygg.no"),
      contact("sigrid", "Sigrid Vold", "Office manager", "bergenbygg.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "3000.21.55410",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: true,
    color: "stroke-sky-500",
  },
  {
    id: "havbris",
    name: "Havbris Sjømat AS",
    orgNo: "927 004 215",
    industry: "Seafood wholesale",
    industryKey: "seafood",
    employees: 9,
    accountantId: "ingrid",
    contacts: [
      contact("lars", "Lars Dahl", "CFO", "havbris.no"),
    ],
    period: "October 2026",
    payDate: "15 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "3201.10.77321",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-emerald-500",
  },
  {
    id: "solberg-tann",
    name: "Solberg Tannklinikk AS",
    orgNo: "915 660 142",
    industry: "Dental clinic",
    industryKey: "dental",
    employees: 7,
    accountantId: "ingrid",
    contacts: [
      contact("hanne", "Hanne Solberg", "Owner", "solbergtann.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Annual",
    bankAccount: "1506.88.12093",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: true,
    color: "stroke-rose-500",
  },
  {
    id: "tinde",
    name: "Tinde Klatresenter AS",
    orgNo: "926 118 507",
    industry: "Climbing gym",
    industryKey: "climbing",
    employees: 14,
    accountantId: "sofie",
    contacts: [
      contact("eirik", "Eirik Strand", "General manager", "tinde.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1254.61.00873",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: true,
    color: "stroke-orange-500",
  },
  {
    id: "vik-holm",
    name: "Vik & Holm Advokatfirma DA",
    orgNo: "911 902 376",
    industry: "Law firm",
    industryKey: "law",
    employees: 5,
    accountantId: "sofie",
    contacts: [
      contact("marte", "Marte Vik", "Partner", "vikholm.no"),
    ],
    period: "October 2026",
    payDate: "25 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "8601.12.44109",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-slate-500",
  },
  {
    id: "lysaker-it",
    name: "Lysaker IT-Drift AS",
    orgNo: "920 331 648",
    industry: "IT services",
    industryKey: "it",
    employees: 11,
    accountantId: "ingrid",
    contacts: [
      contact("jon", "Jon Aasen", "CEO", "lysakerit.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1600.40.23117",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: true,
    color: "stroke-cyan-500",
  },
  {
    id: "aurora-frisor",
    name: "Aurora Frisør AS",
    orgNo: "929 145 603",
    industry: "Hair salon",
    industryKey: "salon",
    employees: 4,
    accountantId: "ingrid",
    contacts: [
      contact("linn", "Linn Berge", "Owner", "aurorafrisor.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Annual",
    bankAccount: "1813.27.66540",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: true,
    color: "stroke-pink-500",
  },
  {
    id: "grunerlokka-sykkel",
    name: "Grünerløkka Sykkel AS",
    orgNo: "924 870 219",
    industry: "Bike shop & repairs",
    industryKey: "bikes",
    employees: 6,
    accountantId: "sofie",
    contacts: [
      contact("mads", "Mads Eriksen", "Owner", "lokkasykkel.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1506.11.84420",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-lime-500",
  },
  {
    id: "nordkapp-ror",
    name: "Nordkapp Rørlegger AS",
    orgNo: "916 553 082",
    industry: "Plumbing",
    industryKey: "plumbing",
    employees: 9,
    accountantId: "ingrid",
    contacts: [
      contact("trond", "Trond Nilsen", "Managing director", "nordkappror.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "4202.18.30961",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: false,
    color: "stroke-blue-500",
  },
  {
    id: "sjobris-hotell",
    name: "Sjøbris Hotell AS",
    orgNo: "913 402 776",
    industry: "Hotel",
    industryKey: "hotel",
    employees: 23,
    accountantId: "ingrid",
    contacts: [
      contact("ingvild", "Ingvild Ruud", "Hotel director", "sjobris.no"),
      contact("ole", "Ole Brekke", "Controller", "sjobris.no"),
    ],
    period: "October 2026",
    payDate: "15 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "3000.55.12094",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-teal-500",
  },
  {
    id: "bolgen-barnehage",
    name: "Bølgen Barnehage SA",
    orgNo: "921 007 334",
    industry: "Kindergarten",
    industryKey: "kindergarten",
    employees: 16,
    accountantId: "ingrid",
    contacts: [
      contact("astrid", "Astrid Holm", "Daily manager", "bolgenbhg.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Annual",
    bankAccount: "1644.09.55813",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: false,
    color: "stroke-yellow-500",
  },
  {
    id: "kvist-arkitekter",
    name: "Kvist Arkitekter AS",
    orgNo: "919 634 505",
    industry: "Architects",
    industryKey: "architecture",
    employees: 8,
    accountantId: "ingrid",
    contacts: [
      contact("henrik", "Henrik Kvist", "Partner", "kvist.no"),
    ],
    period: "October 2026",
    payDate: "25 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1503.77.21408",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-stone-500",
  },
  {
    id: "polar-logistikk",
    name: "Polar Logistikk AS",
    orgNo: "925 781 930",
    industry: "Logistics",
    industryKey: "logistics",
    employees: 21,
    accountantId: "marius",
    contacts: [
      contact("rune", "Rune Olsen", "CEO", "polarlog.no"),
      contact("maria", "Maria Lund", "Finance", "polarlog.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "9710.05.33126",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: false,
    color: "stroke-indigo-500",
  },
  {
    id: "mathallen-deli",
    name: "Mathallen Deli AS",
    orgNo: "928 316 441",
    industry: "Deli & catering",
    industryKey: "deli",
    employees: 10,
    accountantId: "ingrid",
    contacts: [
      contact("jonas-m", "Jonas Mo", "Owner", "mathallendeli.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1207.64.88235",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-red-500",
  },
  {
    id: "bakeriet-hjornet",
    name: "Bakeriet på Hjørnet AS",
    orgNo: "930 118 264",
    industry: "Bakery",
    industryKey: "cafe",
    employees: 7,
    accountantId: "ingrid",
    contacts: [
      contact("silje", "Silje Brun", "Owner", "bakerietpahjornet.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1506.22.47190",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-amber-500",
  },
  {
    id: "nord-elektro",
    name: "Nord Elektro AS",
    orgNo: "924 559 802",
    industry: "Electrical contractor",
    industryKey: "plumbing",
    employees: 13,
    accountantId: "ingrid",
    contacts: [
      contact("kjetil", "Kjetil Aas", "Managing director", "nordelektro.no"),
      contact("hilde", "Hilde Sand", "Office manager", "nordelektro.no"),
    ],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "4212.08.66314",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: false,
    color: "stroke-blue-500",
  },
  {
    id: "studio-vind",
    name: "Studio Vind AS",
    orgNo: "931 402 117",
    industry: "Branding studio",
    industryKey: "design",
    employees: 4,
    accountantId: "ingrid",
    contacts: [contact("elise", "Elise Vik", "Founder", "studiovind.no")],
    period: "October 2026",
    payDate: "25 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1207.91.30528",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: false,
    color: "stroke-violet-500",
  },
  {
    id: "fjellstua",
    name: "Fjellstua Kafé AS",
    orgNo: "922 874 390",
    industry: "Mountain café",
    industryKey: "cafe",
    employees: 9,
    accountantId: "ingrid",
    contacts: [contact("ola", "Ola Rustad", "Daily manager", "fjellstua.no")],
    period: "October 2026",
    payDate: "20 Nov",
    vatTerm: "Annual",
    bankAccount: "2801.13.55062",
    nextDeadline: { label: "A-melding", date: "5 Nov" },
    pinned: false,
    color: "stroke-emerald-500",
  },
  // The simple demo client: five bookings with one question for the
  // customer, three employees with one missing sick note, a clean bank.
  {
    id: "skarv-consulting",
    name: "Skarv Consulting AS",
    orgNo: "932 607 418",
    industry: "IT consulting",
    industryKey: "it",
    employees: 3,
    accountantId: "ingrid",
    contacts: [contact("konstantin", "Konstantin Baykov", "Founder", "skarv.no")],
    period: "October 2026",
    payDate: "25 Nov",
    vatTerm: "Bi-monthly",
    bankAccount: "1506.40.71935",
    nextDeadline: { label: "MVA-melding", date: "10 Dec" },
    pinned: true,
    color: "stroke-fuchsia-500",
  },
]

// ── Customer profiles ──

const INDUSTRY_NOTES: Record<Client["industryKey"], string[]> = {
  cafe: [
    "Card receipts often missing for small purchases, ask weekly rather than at close.",
    "Staff meals booked as welfare (5990), supplier dinners as entertainment.",
  ],
  design: ["Most costs are software subscriptions from foreign suppliers (reverse charge)."],
  construction: [
    "Material purchases must carry a project number to be re-invoiced.",
    "Crew overtime peaks in autumn, approve with Sigrid, not Per.",
  ],
  seafood: ["Export sales are VAT exempt, check the 0-rate on outgoing invoices."],
  dental: ["Treatment revenue is VAT exempt; only retail products carry 25%."],
  climbing: ["Membership income via Stripe, settled weekly."],
  law: ["Client disbursements go through the client account, never the ledger."],
  it: ["Hardware resold to customers goes to 4300, own equipment to 6540."],
  salon: ["Owner pays some supplies privately, reimbursed monthly."],
  bikes: ["Seasonal staff on hourly contracts from March to September."],
  plumbing: ["Vans are leased; fuel on company cards."],
  hotel: ["Food and beverage at 15% VAT, rooms at 12%."],
  kindergarten: ["Municipal grants arrive quarterly; accrue them monthly."],
  architecture: ["Projects invoiced on milestones; WIP reviewed at quarter end."],
  logistics: ["Tolls (AutoPASS) and fuel are the bulk of card spend."],
  deli: ["Catering orders mix 15% and 25% VAT on the same receipt."],
}

const CITY_BY_INDEX = [
  "Torggata 12, 0181 Oslo",
  "Bryggen 5, 5003 Bergen",
  "Kongens gate 30, 7011 Trondheim",
  "Markens gate 18, 4611 Kristiansand",
  "Storgata 44, 9008 Tromsø",
  "Thorvald Meyers gate 61, 0552 Oslo",
]

/** The one customer who arrived with last year's reporting still to file. */
export const LATE_JOINER_ID = "fjellstua"

/** The client kept simple for walking someone through the app: this
    month's bookkeeping, payroll and bank, then the report. No filings and
    no history of earlier questions. */
export const DEMO_CLIENT_ID = "skarv-consulting"

function buildProfile(client: Omit<Client, "profile" | "accounts">): ClientProfile {
  const h = hash(client.id)
  const hasPayroll = client.employees > 0
  const services = [
    "Bookkeeping",
    ...(hasPayroll ? ["Payroll"] : []),
    ...(hasFilings(client.id)
      ? [`VAT (${client.vatTerm.toLowerCase()})`, "Annual accounts"]
      : []),
  ]
  const systems = [
    "Tripletex",
    `DNB ${client.bankAccount}`,
    ...(["cafe", "climbing", "hotel", "bikes", "deli", "salon"].includes(
      client.industryKey
    )
      ? ["Planday"]
      : []),
    ...(["cafe", "deli", "salon", "bikes"].includes(client.industryKey)
      ? ["Zettle POS"]
      : []),
  ]
  // Who does what: the firm's template, varied a little per client.
  const routines = defaultRoutines({
    payroll: hasPayroll,
    vatTerm: client.vatTerm,
    payDay: Number(client.payDate.split(" ")[0]),
    variant: h,
  })
  // Fjellstua switched to the firm in September with last year's reporting
  // still undone, so the filings view has a late catch-up to show.
  if (client.id === LATE_JOINER_ID) {
    return {
      routines,
      clientSince: "Sep 2026",
      services,
      systems,
      revenueLastYear: Math.round(client.employees * (0.9 + (h % 120) / 100) * 1_000_000),
      fiscalYear: "Calendar year",
      address: CITY_BY_INDEX[h % CITY_BY_INDEX.length],
      notes: [
        "Joined in September 2026. The previous accountant never filed the 2025 tax return or annual accounts.",
        ...INDUSTRY_NOTES[client.industryKey],
      ],
    }
  }
  return {
    clientSince: `${["Jan", "Mar", "May", "Aug", "Oct"][h % 5]} ${2018 + (h % 7)}`,
    services,
    systems,
    revenueLastYear: Math.round(client.employees * (0.9 + (h % 120) / 100) * 1_000_000),
    fiscalYear: "Calendar year",
    address: CITY_BY_INDEX[h % CITY_BY_INDEX.length],
    notes: INDUSTRY_NOTES[client.industryKey],
    routines,
  }
}

/** The operating account from the seed, a card account the company cards
    draw on, and the tax withholding account every employer keeps. The
    numbers share the operating account's branch. */
function buildAccounts(client: Omit<Client, "profile" | "accounts">): BankAccount[] {
  const branch = client.bankAccount.split(".")[0]
  return [
    { ledger: "1920", name: "Operating account", number: client.bankAccount },
    {
      ledger: "1921",
      name: "Card account",
      number: `${branch}.${digits(`${client.id}-card-a`, 2)}.${digits(`${client.id}-card-b`, 5)}`,
    },
    {
      ledger: "1950",
      name: "Tax withholding",
      number: `${branch}.${digits(`${client.id}-tax-a`, 2)}.${digits(`${client.id}-tax-b`, 5)}`,
    },
  ]
}

/** VAT returns, the A-melding and annual reporting are part of the
    client's work in the app. */
export function hasFilings(clientId: string) {
  return clientId !== DEMO_CLIENT_ID
}

/** Every client in operation: the seed, then the companies onboarding handed
    over. Changed in place by `setOnboardedClients`, so lookups anywhere,
    module-level imports included, see a new client at once. */
export const CLIENTS: Client[] = CLIENT_SEEDS.map((client) => ({
  ...client,
  accounts: buildAccounts(client),
  profile: buildProfile(client),
}))

export const CLIENT_BY_ID = new Map(CLIENTS.map((c) => [c.id, c]))

const SEED_CLIENTS = CLIENTS.length
let clientsVersion = 0

/** Moves on whenever the client list changes, for lists cached on it. */
export function getClientsVersion() {
  return clientsVersion
}

/** Replaces the clients that came from onboarding. The store calls it
    whenever its onboarding cases change (load, another tab, a handover),
    so the registry always mirrors the state React renders. */
export function setOnboardedClients(clients: Client[]) {
  const current = CLIENTS.slice(SEED_CLIENTS)
  if (current.length === clients.length && current.every((c, i) => c === clients[i])) return
  for (const client of CLIENTS.splice(SEED_CLIENTS)) CLIENT_BY_ID.delete(client.id)
  for (const client of clients) {
    if (CLIENT_BY_ID.has(client.id)) continue
    CLIENTS.push(client)
    CLIENT_BY_ID.set(client.id, client)
  }
  clientsVersion += 1
}

// ── Chart of accounts (NS 4102) and VAT codes, Tripletex numbering ──

/** The full chart (NS 4102, as Tripletex numbers it): every account the
    accountant may book to, not only the ones the agent suggests. */
export const CHART_OF_ACCOUNTS = [
  "1200 Machinery & equipment",
  "1230 Cars",
  "1240 Vans & other vehicles",
  "1250 Fixtures & fittings",
  "1280 Office machines",
  "1460 Stock of goods",
  "1500 Accounts receivable",
  "1530 Earned, not invoiced",
  "1570 Receivable, shareholder",
  "1571 Receivable, employees",
  "1700 Prepaid expenses",
  "1749 Other prepaid costs",
  "1900 Cash",
  "1920 Operating account",
  "1921 Card account",
  "2050 Other equity",
  "2400 Accounts payable",
  "2600 Tax withheld",
  "2770 Employer's NI payable",
  "2780 Employer's NI on accrued holiday pay",
  "2910 Owed to employees",
  "2930 Salaries payable",
  "2940 Holiday pay owed",
  "2990 Other accrued costs",
  "3000 Sales revenue",
  "3010 Sales, food served (25%)",
  "3020 Sales, takeaway food (15%)",
  "3100 Sales, VAT exempt",
  "3600 Rental income",
  "4000 Raw materials",
  "4300 Goods for resale",
  "4500 Subcontractors",
  "5000 Salaries",
  "5010 Holiday pay",
  "5090 Accrued salaries",
  "5180 Holiday pay accrued",
  "5200 Benefits in kind",
  "5290 Benefits, contra",
  "5330 Board fees",
  "5400 Employer's NI",
  "5420 Pension (OTP)",
  "5800 Sick pay refunded by NAV",
  "5900 Staff gifts",
  "5910 Staff canteen",
  "5990 Staff welfare",
  "6000 Depreciation",
  "6100 Freight & delivery",
  "6300 Rent premises",
  "6340 Electricity & heating",
  "6360 Cleaning",
  "6400 Leasing machinery",
  "6420 Software subscriptions",
  "6440 Leasing vehicles",
  "6540 Equipment & fixtures",
  "6551 Computer equipment",
  "6600 Repairs, premises",
  "6620 Repairs, equipment",
  "6700 Accounting & audit",
  "6720 Legal & advisory",
  "6790 Other external services",
  "6800 Office supplies",
  "6840 Newspapers & subscriptions",
  "6860 Meetings & courses",
  "6900 Phone & internet",
  "6940 Postage",
  "7000 Fuel",
  "7020 Vehicle maintenance",
  "7040 Vehicle insurance",
  "7100 Car expenses",
  "7130 Travel, taxable allowance",
  "7140 Travel expenses",
  "7150 Per diem, tax-free",
  "7320 Advertising",
  "7350 Entertainment, deductible",
  "7360 Entertainment, not deductible",
  "7410 Membership fees, deductible",
  "7420 Gifts, deductible",
  "7430 Gifts, not deductible",
  "7500 Insurance",
  "7700 Board & general meeting",
  "7770 Bank fees",
  "7790 Other operating costs",
  "7830 Bad debts",
  "8040 Interest income",
  "8140 Interest expenses",
  "8160 Currency loss",
] as const

/** The accounts the agents suggest most: shown first in the picker. */
export const ACCOUNTS = [
  "3000 Sales revenue",
  "4300 Goods for resale",
  "5990 Staff welfare",
  "6300 Rent premises",
  "6340 Electricity & heating",
  "6420 Software subscriptions",
  "6540 Equipment & fixtures",
  "6800 Office supplies",
  "6860 Meetings & courses",
  "6900 Phone & internet",
  "7000 Fuel",
  "7100 Car expenses",
  "7140 Travel expenses",
  "7320 Advertising",
  "7350 Entertainment, deductible",
  "7360 Entertainment, not deductible",
  "7770 Bank fees",
  "1570 Receivable, shareholder",
] as const

export const VAT_CODES = [
  "1 · Input 25%",
  "11 · Input 15%",
  "13 · Input 12%",
  "81 · Import of goods 25%",
  "86 · Reverse charge 25%",
  "3 · Output 25%",
  "0 · No VAT",
] as const

// ── Bookkeeping templates ──
// One invoice, receipt or bank line each, with the agent's proposal. Clients
// pick a subset so the portfolio looks varied without hand-writing 60 rows.

type BookkeepingTemplate = {
  key: string
  title: string
  subtitle: string
  /** Invoice date for invoices, purchase date for card and Vipps. */
  day: number
  /** Supplier invoices only: days until the payment is due. Its bank line
      falls on the due date, often in the next month. */
  terms?: number
  amount: number
  account: string
  vat: string
  confidence: number
  reasoning: string[]
  evidence: ReviewItem["evidence"]
  issue?: IssueKind
  /** An invoice that arrived late: its own date in a closed month, while
      it lands in the open month's inbox. Only seeded in the open month. */
  dated?: string
  /** A subscription at a fixed price: the same amount every month, so the
      months before don't wobble while the agent says "no changes". */
  fixed?: true
  /** A supplier seen for the first time this month: no history before. */
  fresh?: true
  /** What keeps the agent from being sure: see Suggestion.gap. */
  gap?: string
  /** The invoice names another bank account than the supplier's earlier
      invoices: see ReviewItem.payeeChanged. */
  payTo?: { before: string; now: string }
}

const BOOKKEEPING_TEMPLATES: BookkeepingTemplate[] = [
  {
    key: "elkjop",
    title: "Elkjøp Oslo City",
    subtitle: "VISA 4821 ELKJOP OSLO CITY",
    day: 24,
    amount: -4490,
    account: "6540 Equipment & fixtures",
    vat: "1 · Input 25%",
    confidence: 0.58,
    reasoning: [
      "Electronics retailer, amount under the 30 000 kr capitalisation limit, so expensed as equipment.",
      "No receipt in the Tripletex inbox, e-mail forwarding or the card feed.",
      "Without a receipt the 898 kr input VAT cannot be deducted.",
    ],
    evidence: { label: "Receipt", attached: false },
    issue: "missing_receipt",
  },
  {
    key: "adobe",
    title: "Adobe Systems Software",
    subtitle: "ADOBE *CREATIVE CLOUD",
    day: 3,
    amount: -1239,
    fixed: true,
    account: "6420 Software subscriptions",
    vat: "86 · Reverse charge 25%",
    confidence: 0.97,
    reasoning: [
      "Same supplier and amount booked to 6420 for the last 11 months.",
      "Foreign supplier without Norwegian VAT, so reverse charge applies.",
      "Invoice PDF matched from the e-mail inbox.",
    ],
    evidence: {
      label: "Invoice",
      attached: true,
      fileName: "adobe-invoice-oct.pdf",
    },
  },
  {
    key: "telenor",
    title: "Telenor Norge AS",
    subtitle: "EHF 88210442 TELENOR",
    day: 12,
    terms: 20,
    amount: -899,
    fixed: true,
    account: "6900 Phone & internet",
    vat: "1 · Input 25%",
    confidence: 0.99,
    reasoning: [
      "EHF invoice received through Tripletex, account line pre-coded by the supplier.",
      "Matches the recurring monthly subscription: the shop's broadband, not staff phones, so there's no phone benefit (ekom) to report on the a-melding.",
    ],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-88210442" },
  },
  {
    key: "fyr",
    title: "Restaurant Fyr Bistronomi",
    subtitle: "VISA 4821 FYR BISTRONOMI",
    day: 18,
    amount: -3870,
    account: "7360 Entertainment, not deductible",
    vat: "0 · No VAT",
    confidence: 0.52,
    reasoning: [
      "Restaurant bill on a Friday evening, receipt attached from the card app. No input VAT on food and drink either way (mva-loven § 8-3).",
      "Could be client entertainment or a staff event (5990). A simple meal with business contacts is only deductible up to 592 kr a person in 2026, without spirits (7350); over it, 7360.",
      "Attendees and purpose are required for the documentation either way, and they decide the account.",
    ],
    evidence: { label: "Receipt", attached: true, fileName: "fyr-receipt.jpg" },
    issue: "unclear_purpose",
  },
  {
    key: "circlek",
    title: "Circle K Ryen",
    subtitle: "VISA 4821 CIRCLE K RYEN",
    day: 9,
    amount: -742,
    account: "7000 Fuel",
    vat: "1 · Input 25%",
    confidence: 0.86,
    reasoning: [
      "Fuel purchase, the company van is registered as a business vehicle.",
      "Receipt matched from the card app.",
    ],
    gap: "The receipt doesn't say which vehicle was filled. Input VAT on fuel is only deductible for a van registered as a goods vehicle (varebil klasse 2), not for a passenger car: the plate number on the receipt, or the van in the client's asset list, would settle it.",
    evidence: { label: "Receipt", attached: true, fileName: "circlek.jpg" },
  },
  {
    key: "vipps",
    title: "Vipps · Mathias Kolstad",
    subtitle: "VIPPS *MATHIAS KOLSTAD",
    day: 21,
    amount: -2500,
    account: "1570 Receivable, shareholder",
    vat: "0 · No VAT",
    confidence: 0.31,
    reasoning: [
      "Payment to a private person with no invoice or message.",
      "Could be a private expense, a refund of an outlay, or casual labour that must be reported on the A-melding.",
      "Parked on 1570 until the purpose is known.",
    ],
    evidence: { label: "Documentation", attached: false },
    issue: "private_expense",
  },
  {
    key: "tine",
    title: "Tine SA",
    subtitle: "EHF 5510238 TINE SA",
    day: 5,
    terms: 30,
    amount: -18420,
    account: "4300 Goods for resale",
    vat: "11 · Input 15%",
    confidence: 0.96,
    reasoning: [
      "Food wholesaler, EHF lines carry 15% food VAT.",
      "Matches weekly purchase pattern.",
    ],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-5510238" },
  },
  {
    key: "clas",
    title: "Clas Ohlson Storo",
    subtitle: "VISA 4821 CLAS OHLSON",
    day: 14,
    amount: -1149,
    account: "6800 Office supplies",
    vat: "1 · Input 25%",
    confidence: 0.71,
    reasoning: [
      "Hardware and office store, most purchases here were booked to 6800.",
      "No receipt found yet.",
    ],
    evidence: { label: "Receipt", attached: false },
    issue: "missing_receipt",
  },
  {
    key: "meta",
    title: "Meta Platforms Ireland",
    subtitle: "FACEBK *ADS 7HQ2K",
    day: 1,
    amount: -3000,
    account: "7320 Advertising",
    vat: "86 · Reverse charge 25%",
    confidence: 0.93,
    reasoning: [
      "Ad spend receipt from Meta Business Manager.",
      "Foreign service, reverse charge VAT.",
    ],
    gap: "The amount differs from month to month with the campaigns, so there is no fixed pattern to check it against.",
    evidence: { label: "Receipt", attached: true, fileName: "meta-ads-oct.pdf" },
  },
  {
    key: "norwegian",
    title: "Norwegian Air Shuttle",
    subtitle: "NORWEGIAN AIR 3282",
    day: 16,
    amount: -2368,
    account: "7140 Travel expenses",
    vat: "13 · Input 12%",
    confidence: 0.67,
    reasoning: [
      "Domestic flight OSL to BGO, e-ticket attached.",
      "Traveller and purpose are missing, which the travel documentation needs.",
    ],
    evidence: { label: "E-ticket", attached: true, fileName: "e-ticket.pdf" },
    issue: "unclear_purpose",
  },
  {
    key: "hafslund",
    title: "Hafslund Strøm AS",
    subtitle: "EHF 7710345 HAFSLUND",
    day: 10,
    terms: 14,
    amount: -3412,
    account: "6340 Electricity & heating",
    vat: "1 · Input 25%",
    confidence: 0.98,
    reasoning: ["Recurring electricity supplier, EHF invoice matched."],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-7710345" },
  },
  {
    key: "aws",
    title: "Amazon Web Services EMEA",
    subtitle: "AWS EMEA SARL",
    day: 2,
    terms: 10,
    amount: -2184,
    account: "6420 Software subscriptions",
    vat: "86 · Reverse charge 25%",
    confidence: 0.95,
    reasoning: [
      "Cloud hosting, same account as prior months.",
      "Reverse charge on foreign service.",
    ],
    evidence: { label: "Invoice", attached: true, fileName: "aws-oct.pdf" },
  },
  {
    key: "github",
    title: "GitHub, Inc.",
    subtitle: "GITHUB *TEAM PLAN",
    day: 4,
    amount: -1176,
    fixed: true,
    account: "6420 Software subscriptions",
    vat: "86 · Reverse charge 25%",
    confidence: 0.97,
    reasoning: [
      "Same supplier and amount booked to 6420 every month since January.",
      "Foreign supplier without Norwegian VAT, so reverse charge applies.",
      "Receipt matched from the GitHub billing e-mail.",
    ],
    evidence: { label: "Receipt", attached: true, fileName: "github-receipt-oct.pdf" },
  },
  {
    key: "google-workspace",
    title: "Google Cloud EMEA",
    subtitle: "GOOGLE *WORKSPACE",
    day: 1,
    amount: -1380,
    fixed: true,
    account: "6420 Software subscriptions",
    vat: "86 · Reverse charge 25%",
    confidence: 0.98,
    reasoning: [
      "Same supplier booked to 6420 every month, the amount follows the number of users.",
      "Foreign supplier without Norwegian VAT, so reverse charge applies.",
      "Receipt matched from the Google billing e-mail.",
    ],
    evidence: { label: "Receipt", attached: true, fileName: "google-workspace-oct.pdf" },
  },
  {
    key: "komplett",
    title: "Komplett.no",
    subtitle: "VISA 4821 KOMPLETT.NO",
    day: 15,
    amount: -7990,
    account: "6540 Equipment & fixtures",
    vat: "1 · Input 25%",
    confidence: 0.93,
    reasoning: [
      "Two 27\" monitors, under the 30 000 kr capitalisation limit, so expensed as equipment.",
      "Receipt matched from the card app.",
    ],
    gap: "First purchase like this at the client: no earlier booking to confirm 6540 over 6551 Computer equipment.",
    evidence: { label: "Receipt", attached: true, fileName: "komplett-ordre.pdf" },
  },
  {
    key: "apotek",
    title: "Apotek 1 Majorstuen",
    subtitle: "VISA 4821 APOTEK 1",
    day: 22,
    amount: -289,
    account: "1570 Receivable, shareholder",
    vat: "0 · No VAT",
    confidence: 0.41,
    reasoning: [
      "Pharmacy purchases on the company card are usually private.",
      "Could be a first-aid kit for the premises, which would go on 6800.",
    ],
    evidence: { label: "Receipt", attached: false },
    issue: "private_expense",
  },
  {
    key: "kontorspar",
    title: "Kontorspar AS",
    subtitle: "EHF 1022871 KONTORSPAR",
    day: 7,
    terms: 30,
    amount: -6250,
    account: "6800 Office supplies",
    vat: "1 · Input 25%",
    confidence: 0.94,
    reasoning: ["Office supplies wholesaler, EHF invoice matched."],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-1022871" },
  },
  {
    key: "byggmakker",
    title: "Byggmakker Åsane",
    subtitle: "VISA 7702 BYGGMAKKER",
    day: 11,
    amount: -12890,
    account: "4300 Goods for resale",
    vat: "1 · Input 25%",
    confidence: 0.64,
    reasoning: [
      "Building materials. Could be material for a customer project (4300) or own tools (6540).",
      "The project number is missing from the receipt, so it can't be linked to a job.",
    ],
    evidence: { label: "Receipt", attached: true, fileName: "byggmakker.pdf" },
    issue: "unclear_purpose",
  },
  {
    key: "newsupplier",
    title: "Nordic Espresso Supply ApS",
    subtitle: "NORDIC ESPRESSO SUPPLY",
    day: 26,
    terms: 14,
    amount: -8740,
    account: "6540 Equipment & fixtures",
    vat: "81 · Import of goods 25%",
    confidence: 0.69,
    reasoning: [
      "First payment to this Danish supplier. No supplier record exists in Tripletex yet.",
      "The invoice lists a grinder and spare parts, which looks like equipment.",
      "Goods from Denmark: the VAT is import VAT through customs (code 81), not reverse charge, which is for services.",
    ],
    evidence: {
      label: "Invoice",
      attached: true,
      fileName: "nes-invoice-2291.pdf",
    },
    // No history before this month. That it's new is an anomaly, for the
    // customer's approval; the booking itself needs no answer.
    fresh: true,
  },
  {
    // A brand-new supplier with a large amount: booked, and the customer
    // has to look at it before it is paid.
    key: "bolge",
    title: "Bølge Reklamebyrå AS",
    subtitle: "EHF 4410982 BØLGE REKLAMEBYRÅ",
    day: 22,
    terms: 14,
    amount: -38750,
    fresh: true,
    account: "7320 Advertising",
    vat: "1 · Input 25%",
    confidence: 0.72,
    reasoning: [
      "New window signage and a menu redesign, the invoice lines read as advertising.",
      "EHF invoice received through Tripletex, booked to 7320.",
    ],
    gap: "Signage that lasts for years could be an asset rather than a cost: at 38 750 kr it is over the 30 000 kr limit, if the sign is most of it.",
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-4410982" },
  },
  {
    key: "bama-late",
    title: "Bama Storkjøkken AS",
    subtitle: "EHF 3390127 BAMA STORKJØKKEN",
    day: 26,
    dated: "2026-08-24",
    terms: 30,
    amount: -6875,
    account: "4300 Goods for resale",
    vat: "11 · Input 15%",
    confidence: 0.92,
    reasoning: [
      "Fruit and vegetables for the kitchen, the same lines as Bama's other invoices this year.",
      "Bama sent it again on 26 Oct after a payment reminder; the first copy never reached the Tripletex inbox.",
      "Dated 24 Aug, and the Jul–Aug VAT return is already filed. Book it in October, or reopen August and file a corrected return.",
    ],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-3390127" },
    // A resent invoice after a "reminder", to a new account: exactly how
    // invoice fraud looks. Booking it is fine; paying it needs a call.
    payTo: { before: "6012.05.33871", now: "9710.44.18265" },
  },
  {
    key: "printhuset-late",
    title: "Printhuset Oslo AS",
    subtitle: "EHF 7781204 PRINTHUSET OSLO",
    day: 23,
    dated: "2026-08-19",
    terms: 30,
    amount: -14250,
    account: "7320 Advertising",
    vat: "1 · Input 25%",
    confidence: 0.9,
    reasoning: [
      "Print run of campaign brochures, booked like Printhuset's spring invoice.",
      "Sent to an old e-mail address in August, forwarded to the inbox on 23 Oct.",
      "Dated 19 Aug, and the Jul–Aug VAT return is already filed. Book it in October, or reopen August and file a corrected return.",
    ],
    evidence: { label: "EHF invoice", attached: true, fileName: "EHF-7781204" },
  },
]

const BOOKKEEPING_BY_KEY = new Map(BOOKKEEPING_TEMPLATES.map((t) => [t.key, t]))

/** An invoice has terms. A card or Vipps payment with a receipt is a
    receipt; without one, all there is is the bank line. */
function kindOf(t: BookkeepingTemplate): SourceKind {
  if (t.terms) return "invoice"
  return t.evidence.attached ? "receipt" : "bank_line"
}

// ── Payroll templates ──

type PayrollTemplate = {
  key: string
  role: string
  basis: string
  gross: number
  lines: { account: string; amount: number }[]
  confidence: number
  reasoning: string[]
  evidence: ReviewItem["evidence"]
  issue?: IssueKind
  /** Commission pay: what the commission usually comes to in a month. */
  usual?: number
}

const PAYROLL_TEMPLATES: PayrollTemplate[] = [
  {
    key: "hourly-ok",
    role: "Barista",
    basis: "Hourly · 118 h",
    gross: 19116,
    lines: [{ account: "Hourly wage · 118 h × 162 kr", amount: 19116 }],
    confidence: 0.97,
    reasoning: [
      "Hours match the approved Planday timesheet.",
      "Same hourly rate as the contract on file.",
    ],
    evidence: { label: "Timesheet", attached: true, fileName: "planday-oct.csv" },
  },
  {
    key: "fixed-ok",
    role: "General manager",
    basis: "Fixed · monthly",
    gross: 52000,
    lines: [{ account: "Fixed salary", amount: 52000 }],
    confidence: 0.99,
    reasoning: ["Fixed salary, no changes since last run."],
    evidence: { label: "Contract", attached: true, fileName: "contract.pdf" },
  },
  {
    key: "overtime",
    role: "Shift lead",
    basis: "Fixed + 6 h overtime",
    // 42 500 a month is about 262 kr an hour (162.5 h); overtime is paid
    // at least 40% on top of that (arbeidsmiljøloven § 10-6 (11)).
    gross: 44702,
    lines: [
      { account: "Fixed salary", amount: 42500 },
      { account: "Overtime 40% · 6 h × 367 kr", amount: 2202 },
    ],
    confidence: 0.63,
    reasoning: [
      "6 h logged after closing on 10 and 17 October.",
      "The overtime is not approved in the timesheet, so it can't go on payroll yet.",
    ],
    evidence: { label: "Timesheet", attached: true, fileName: "planday-oct.csv" },
    issue: "overtime_unapproved",
  },
  {
    key: "sick",
    role: "Barista",
    basis: "Hourly · 96 h + 4 sick days",
    gross: 18204,
    lines: [
      { account: "Hourly wage · 96 h × 162 kr", amount: 15552 },
      { account: "Sick pay · 4 days (employer period)", amount: 2652 },
    ],
    confidence: 0.58,
    reasoning: [
      "4 consecutive sick days registered, which is within the employer period.",
      "No self-certification (egenmelding) or doctor's note is on file.",
    ],
    evidence: { label: "Sick note", attached: false },
    issue: "sick_leave",
  },
  {
    key: "newhire",
    // Started mid-October, so her first hours belong in October's run. (A
    // hire who starts after the month has no line in it: they wait on the
    // employee list until their first month, see people.ts.)
    role: "Barista · started 19 Oct",
    basis: "Hourly · 46 h · new hire",
    gross: 7452,
    lines: [{ account: "Hourly wage · 46 h × 162 kr", amount: 7452 }],
    confidence: 0.4,
    reasoning: [
      "Started 19 Oct on a signed contract: 46 h in the Planday timesheet, paid with October's run and reported on November's A-melding.",
      "No national ID number, so no tax card yet: until it's fetched, 50% is withheld. The bank account number is missing too, which the payment needs.",
    ],
    evidence: { label: "Tax card", attached: false },
    issue: "missing_tax_card",
  },
  {
    key: "bonus",
    role: "Baker",
    basis: "Hourly · 104 h",
    gross: 17264,
    lines: [{ account: "Hourly wage · 104 h × 166 kr", amount: 17264 }],
    confidence: 0.66,
    reasoning: [
      "Hours match the timesheet.",
      "A 5 000 kr bonus is mentioned in an e-mail from Kari on 20 Oct but is not in the payroll input.",
    ],
    evidence: { label: "E-mail", attached: true, fileName: "re-bonus.eml" },
    issue: "unregistered_bonus",
  },
  {
    key: "fixed-ok-2",
    role: "Designer",
    basis: "Fixed · monthly",
    gross: 48500,
    lines: [{ account: "Fixed salary", amount: 48500 }],
    confidence: 0.99,
    reasoning: ["Fixed salary, no changes since last run."],
    evidence: { label: "Contract", attached: true, fileName: "contract.pdf" },
  },
  {
    key: "developer-ok",
    role: "Senior developer",
    basis: "Fixed · monthly",
    gross: 64000,
    lines: [{ account: "Fixed salary", amount: 64000 }],
    confidence: 0.99,
    reasoning: ["Fixed salary, no changes since last run."],
    evidence: { label: "Contract", attached: true, fileName: "contract.pdf" },
  },
  {
    key: "consultant-ok",
    role: "IT consultant",
    basis: "Fixed · monthly",
    gross: 56500,
    lines: [{ account: "Fixed salary", amount: 56500 }],
    confidence: 0.98,
    reasoning: ["Fixed salary, no changes since last run."],
    evidence: { label: "Contract", attached: true, fileName: "contract.pdf" },
  },
  {
    key: "developer-sick",
    role: "Developer",
    basis: "Fixed · 4 sick days",
    gross: 52000,
    lines: [{ account: "Fixed salary", amount: 52000 }],
    confidence: 0.6,
    reasoning: [
      "4 consecutive sick days registered, which is within the employer period.",
      "The fixed salary runs as normal through the employer period.",
      "No self-certification (egenmelding) or doctor's note is on file.",
    ],
    evidence: { label: "Sick note", attached: false },
    issue: "sick_leave",
  },
  {
    // The striking one: a commission ten times what this rep usually earns.
    key: "commission-spike",
    role: "Account manager",
    basis: "Commission · base 24 000",
    gross: 192000,
    lines: [
      { account: "Base salary", amount: 24000 },
      { account: "Commission · October", amount: 168000 },
    ],
    confidence: 0.7,
    reasoning: [
      "Base salary matches the contract.",
      "Commission of 168 000 kr from the CRM export is about 10× what was paid in August and September.",
    ],
    evidence: { label: "Commission report", attached: true, fileName: "crm-commission-oct.xlsx" },
    usual: 17000,
  },
]

const PAYROLL_BY_KEY = new Map(PAYROLL_TEMPLATES.map((t) => [t.key, t]))

// ── Per-client selection ──

/** One client's own version of a template: an amount that differs from
    the template's, and what the agent made of it. */
type Tweak = {
  /** This month's amount. */
  amount?: number
  /** The months before, when they differ from the template's. */
  history?: number
  confidence?: number
  reasoning?: string[]
  gap?: string
}

type Seed = [key: string, status?: ItemStatus, tweak?: Tweak]

const CLIENT_BOOKKEEPING: Record<string, Seed[]> = {
  "fjord-kaffebar": [
    ["elkjop"],
    ["fyr", "customer_replied"],
    ["clas", "waiting_customer"],
    ["vipps"],
    ["tine"],
    ["telenor", "booked"],
    // Ten times the usual power bill: booked as invoiced, and on the
    // approval list for Kari to look at.
    [
      "hafslund",
      "booked",
      {
        amount: -34120,
        confidence: 0.64,
        reasoning: [
          "Recurring electricity supplier, EHF invoice matched.",
          "The invoice includes a settlement after a meter reading, which could explain part of the amount.",
        ],
        gap: "The invoice doesn't split the settlement from the usual month, so it can't show how much of the 34 120 kr is the meter reading.",
      },
    ],
    ["meta"],
    // The company has no vehicle of its own: fuel on its card is a question.
    [
      "circlek",
      undefined,
      {
        confidence: 0.62,
        reasoning: [
          "Fuel on the company card, receipt matched from the card app.",
          "Fjord Kaffebar has no vehicle: none on its org number at Statens vegvesen, none on 1230/1240 and no lease. August and September's fuel was still booked with VAT.",
        ],
        gap: "Without a company van the fuel is probably for a private or passenger car: no VAT deduction then, and the trip may belong in a mileage allowance instead. Who drove, and in what?",
      },
    ],
    ["newsupplier"],
    ["kontorspar", "booked"],
    ["adobe", "booked"],
    ["bama-late"],
    ["bolge", "booked"],
  ],
  "nordlys-design": [
    ["printhuset-late"],
    ["adobe"],
    ["norwegian", "waiting_customer"],
    ["aws"],
    ["telenor"],
    ["apotek"],
    ["meta", "booked"],
    ["kontorspar", "booked"],
  ],
  "bergen-bygg": [
    ["byggmakker"],
    ["circlek"],
    ["elkjop", "waiting_customer"],
    ["telenor", "booked"],
    ["hafslund"],
    ["vipps"],
    ["clas", "booked"],
  ],
  havbris: [
    ["tine", "booked"],
    ["circlek", "booked"],
    ["norwegian", "customer_replied"],
    ["telenor", "booked"],
    ["hafslund", "booked"],
  ],
  "solberg-tann": [
    ["kontorspar"],
    ["apotek", "waiting_customer"],
    ["telenor"],
    ["adobe", "booked"],
  ],
  tinde: [
    ["meta"],
    ["hafslund"],
    ["fyr"],
    ["clas"],
    ["elkjop"],
    ["telenor", "booked"],
  ],
  "vik-holm": [
    ["norwegian", "booked"],
    ["adobe", "booked"],
    ["telenor", "booked"],
    ["kontorspar", "booked"],
  ],
  "lysaker-it": [
    ["aws"],
    ["adobe"],
    ["newsupplier"],
    ["telenor", "booked"],
    ["meta", "booked"],
  ],
  "aurora-frisor": [
    ["clas"],
    ["meta"],
    ["telenor", "booked"],
    ["hafslund", "booked"],
  ],
  "grunerlokka-sykkel": [
    ["newsupplier"],
    ["kontorspar", "booked"],
    ["telenor", "booked"],
    ["circlek", "booked"],
  ],
  "nordkapp-ror": [
    ["byggmakker", "waiting_customer"],
    ["circlek"],
    ["vipps"],
    ["telenor", "booked"],
  ],
  "sjobris-hotell": [
    ["tine"],
    ["hafslund"],
    ["fyr", "customer_replied"],
    ["meta"],
    ["adobe", "booked"],
    ["telenor", "booked"],
  ],
  "bolgen-barnehage": [
    ["kontorspar", "booked"],
    ["hafslund", "booked"],
    ["telenor", "booked"],
  ],
  "kvist-arkitekter": [
    ["adobe"],
    ["norwegian"],
    ["aws", "booked"],
    // The same plan as everyone else at three times the price: steady in
    // Kvist's own history, an outlier against the firm's other clients.
    [
      "telenor",
      "booked",
      {
        amount: -2990,
        history: -2990,
        confidence: 0.81,
        reasoning: [
          "EHF invoice received through Tripletex, account line pre-coded by the supplier.",
          "Same amount as Kvist's earlier months, booked to 6900 like before.",
        ],
        gap: "Kvist pays three times what the firm's other clients pay Telenor for the same plan: the booking is sure, the price is the question.",
      },
    ],
  ],
  "polar-logistikk": [
    ["circlek"],
    ["circlek", "booked"],
    ["byggmakker"],
    ["norwegian", "waiting_customer"],
    ["telenor", "booked"],
    ["aws", "booked"],
  ],
  "mathallen-deli": [
    ["tine"],
    ["elkjop"],
    ["apotek"],
    ["hafslund", "booked"],
  ],
  "bakeriet-hjornet": [
    ["tine"],
    ["fyr", "customer_replied"],
    ["clas"],
    ["telenor", "booked"],
  ],
  "nord-elektro": [
    ["byggmakker"],
    ["circlek"],
    ["newsupplier"],
    ["telenor", "booked"],
    ["aws", "booked"],
  ],
  "studio-vind": [
    ["adobe", "booked"],
    ["meta", "booked"],
    ["telenor", "booked"],
  ],
  "fjellstua": [
    ["tine"],
    ["hafslund"],
    ["vipps"],
    ["circlek", "booked"],
  ],
  "skarv-consulting": [
    ["aws"],
    ["github"],
    ["google-workspace"],
    ["komplett"],
    ["norwegian"],
  ],
}

const EMPLOYEE_NAMES = [
  "Emma Larsen",
  "Jonas Eide",
  "Sara Ali",
  "Oliver Haug",
  "Maja Solheim",
  "Liam Johansen",
  "Nora Bakke",
  "Henrik Lund",
  "Ida Knutsen",
  "Filip Sæther",
  "Selma Aune",
  "Tobias Vang",
]

const CLIENT_PAYROLL: Record<string, Seed[]> = {
  "fjord-kaffebar": [
    ["hourly-ok"],
    ["overtime", "waiting_customer"],
    ["sick"],
    ["newhire"],
    ["fixed-ok"],
    ["bonus"],
  ],
  "nordlys-design": [["fixed-ok-2"], ["fixed-ok"], ["bonus"]],
  "bergen-bygg": [
    ["overtime"],
    ["hourly-ok"],
    ["sick", "waiting_customer"],
    ["fixed-ok"],
  ],
  havbris: [["fixed-ok", "booked"], ["hourly-ok", "booked"]],
  "solberg-tann": [["fixed-ok"], ["fixed-ok-2"], ["newhire"]],
  tinde: [["hourly-ok"], ["hourly-ok"], ["overtime"], ["sick"]],
  "vik-holm": [["fixed-ok", "booked"], ["fixed-ok-2", "booked"]],
  "lysaker-it": [["fixed-ok-2"], ["fixed-ok"], ["bonus", "customer_replied"], ["commission-spike"]],
  "aurora-frisor": [["hourly-ok"], ["fixed-ok"]],
  "grunerlokka-sykkel": [["hourly-ok", "booked"], ["fixed-ok", "booked"]],
  "nordkapp-ror": [["overtime", "waiting_customer"], ["fixed-ok"], ["hourly-ok"]],
  "sjobris-hotell": [
    ["hourly-ok"],
    ["hourly-ok"],
    ["sick"],
    ["newhire"],
    ["fixed-ok"],
  ],
  "bolgen-barnehage": [["fixed-ok", "booked"], ["fixed-ok-2", "booked"], ["hourly-ok", "booked"]],
  "kvist-arkitekter": [["fixed-ok-2"], ["fixed-ok-2"], ["bonus"]],
  "polar-logistikk": [["overtime"], ["overtime"], ["hourly-ok"], ["fixed-ok"]],
  "mathallen-deli": [["hourly-ok"], ["sick", "waiting_customer"], ["fixed-ok"]],
  "bakeriet-hjornet": [["hourly-ok"], ["overtime"], ["fixed-ok", "booked"]],
  "nord-elektro": [["overtime", "waiting_customer"], ["fixed-ok"], ["hourly-ok"]],
  "studio-vind": [["fixed-ok-2", "booked"], ["fixed-ok", "booked"]],
  "fjellstua": [["hourly-ok"], ["hourly-ok"], ["newhire"]],
  "skarv-consulting": [["developer-ok"], ["consultant-ok"], ["developer-sick"]],
}

// The headcount everyone sees is the people on the pay run, so the client
// header, the report and the payroll page agree. (The business profile,
// revenue and costs, was already built from the seed's figure above.)
for (const client of CLIENTS) {
  const lines = CLIENT_PAYROLL[client.id]
  if (lines) client.employees = lines.length
}

/** How a template is paid: a fixed salary, by the hour, or a base plus
    commission. */
export type PayAgreement = "fixed" | "hourly" | "commission"

function agreementOf(t: PayrollTemplate): PayAgreement {
  if (t.basis.startsWith("Fixed")) return "fixed"
  if (t.basis.startsWith("Commission")) return "commission"
  return "hourly"
}

/** The hourly rate in "Hourly wage · 118 h × 162 kr". */
function hourlyRate(t: PayrollTemplate) {
  return Number(t.lines[0].account.match(/× (\d+) kr/)?.[1] ?? 168)
}

/** The employee on a client's n-th pay line: the same name every month. */
function employeeName(clientId: string, index: number) {
  const offset = hash(clientId) % EMPLOYEE_NAMES.length
  return EMPLOYEE_NAMES[(offset + index) % EMPLOYEE_NAMES.length]
}

/** When they started: a new hire on 19 October, everyone else years ago. */
function employedSince(t: PayrollTemplate, name: string) {
  if (t.issue === "missing_tax_card") return "2026-10-19"
  const month = [1, 3, 4, 6, 8, 11][hash(name) % 6]
  const day = 1 + (hash(`${name}-d`) % 27)
  return `${2019 + (hash(`${name}-y`) % 6)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** What a closed month paid. A fixed salary is the same every month (that
    is the point of "same as always"); hours and commission move. */
function closedPay(t: PayrollTemplate, period: string, seed: string) {
  const agreement = agreementOf(t)
  if (agreement === "fixed") return [{ account: "Fixed salary", amount: t.lines[0].amount }]
  if (agreement === "commission")
    return [
      t.lines[0],
      { account: `Commission · ${MONTH_NAME[period.slice(5)]}`, amount: vary(t.usual ?? 0, seed) },
    ]
  const rate = hourlyRate(t)
  const hours = Math.round(vary(t.gross, seed) / rate)
  return [{ account: `Hourly wage · ${hours} h × ${rate} kr`, amount: hours * rate }]
}

/** One employee as the pay lines know them, for the employee list. */
export type RosterRow = {
  clientId: string
  name: string
  role: string
  agreement: PayAgreement
  /** Monthly salary, hourly rate or base, NOK. */
  amount: number
  start: string
  /** Hours come from Planday; fixed salaries from the Tripletex register. */
  source: "planday" | "tripletex"
}

/** Everyone on the seeded pay runs, in pay-line order. */
export function payrollRoster(): RosterRow[] {
  return CLIENT_SEEDS.flatMap((seed) =>
    (CLIENT_PAYROLL[seed.id] ?? []).flatMap(([key], index) => {
      const t = PAYROLL_BY_KEY.get(key)
      if (!t) return []
      const name = employeeName(seed.id, index)
      const agreement = agreementOf(t)
      const planday = CLIENT_BY_ID.get(seed.id)?.profile.systems.includes("Planday")
      return [
        {
          clientId: seed.id,
          name,
          role: t.role.split(" · ")[0],
          agreement,
          amount: agreement === "hourly" ? hourlyRate(t) : t.lines[0].amount,
          start: employedSince(t, name),
          source: planday && agreement === "hourly" ? "planday" : "tripletex",
        } satisfies RosterRow,
      ]
    })
  )
}

/** A pay line that pays for an earlier month, seeded so the trail and the
    A-melding have one to show: overtime from September paid with October. */
export const SEEDED_CORRECTION = {
  itemId: "nordlys-design-pr-2026-10-c1",
  clientId: "nordlys-design",
  earnedIn: "2026-09",
  what: "Overtime",
} as const

// ── Seed helpers ──

let activitySeq = 0
export function activityId() {
  activitySeq += 1
  return `act-${activitySeq}`
}

/** Where pay input comes from: shift businesses keep hours in Planday,
    the rest pay fixed salaries straight from Tripletex. */
type PayrollSource = "planday" | "salary_register"

/** Where the line came from, as the first entry of its trail. */
function importedFrom(kind: SourceKind | PayrollSource) {
  switch (kind) {
    case "invoice":
      return "Invoice received in the Tripletex inbox"
    case "receipt":
      return "Receipt matched from the card app"
    case "bank_line":
      return "Imported from DNB via Tripletex MCP"
    case "salary_register":
      return "Salaries read from the Tripletex salary register"
    case "planday":
      return "Payroll input synced from Planday"
  }
}

function seedActivity(
  domain: "bookkeeping" | "payroll",
  kind: SourceKind | PayrollSource,
  firstReason: string,
  proposal: string,
  status: ItemStatus,
  voucherNo?: string
): Activity[] {
  const log: Activity[] = [
    {
      id: activityId(),
      actor: "system",
      title: importedFrom(kind),
      time: "Today 06:10",
    },
    {
      id: activityId(),
      actor: "agent",
      title: `Suggested ${proposal}`,
      detail: firstReason,
      time: "Today 06:12",
    },
  ]

  if (status === "booked") {
    log.push(
      {
        id: activityId(),
        actor: "accountant",
        title: "Confirmed by Ingrid Hansen",
        time: "Fri 30 Oct 14:32",
      },
      {
        id: activityId(),
        actor: "system",
        title:
          domain === "bookkeeping"
            ? `Voucher ${voucherNo} created in Tripletex`
            : "Approved for the pay run",
        time: "Fri 30 Oct 14:32",
      }
    )
  }

  return log
}

let voucherSeq = 412
export function nextVoucherNo() {
  voucherSeq += 1
  return `2026-0${voucherSeq}`
}

// ── Periods ──

/** The demo's today: Monday of the week October closes. The A-melding
    for the salaries paid in October is due Thursday, Monday's approval
    lists go out, October's books lock on the 10th and its hours are
    paid from the 15th. Everything else is dated around it. */
export const TODAY = "2026-11-02"

export type PeriodMeta = {
  id: string
  label: string
  status: "open" | "closed"
  note: string
}

/** One working month drives everything: that month's bank lines, and the pay
    run built from that month's hours (paid on the 20th of the next month). */
export const MONTHS: PeriodMeta[] = [
  { id: "2026-10", label: "October 2026", status: "open", note: "Locks 10 Nov" },
  { id: "2026-09", label: "September 2026", status: "closed", note: "Closed 9 Oct" },
  { id: "2026-08", label: "August 2026", status: "closed", note: "Closed 8 Sep" },
]

export const PERIODS: Record<"bookkeeping" | "payroll", PeriodMeta[]> = {
  bookkeeping: MONTHS,
  payroll: [
    { id: "2026-10", label: "October 2026", status: "open", note: "Pays 20 Nov" },
    { id: "2026-09", label: "September 2026", status: "closed", note: "Paid 20 Oct" },
    { id: "2026-08", label: "August 2026", status: "closed", note: "Paid 20 Sep" },
  ],
}

export const OPEN_MONTH = MONTHS[0].id

export const OPEN_PERIOD = {
  bookkeeping: OPEN_MONTH,
  payroll: OPEN_MONTH,
}

export function nextMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

/** Not locked: the open month, or a later one a document was moved to. */
export function isOpenPeriod(item: Pick<ReviewItem, "domain" | "period">) {
  return item.period >= OPEN_PERIOD[item.domain]
}

/** The months an invoice or receipt can be booked in: the open one and the
    one after it. Closed months are locked. */
export const BOOKABLE_PERIODS = [OPEN_MONTH, nextMonth(OPEN_MONTH)]

/** The client tab a line is worked on. Bookkeeping is the inbox of
    supplier invoices (EHF, upload, e-mail): money that hasn't left yet.
    A card receipt or a bank line with nothing behind it has already
    left the bank, so it is worked from the bank line in the
    Reconciliation, the source of truth for what happened. Pay lines are
    Payroll. (Accountants, 7 Oct: "keep the inbox to the invoices".) */
export type ItemTab = "bookkeeping" | "reconciliation" | "payroll"

export function tabOf(item: Pick<ReviewItem, "domain" | "kind">): ItemTab {
  if (item.domain === "payroll") return "payroll"
  return item.kind === "invoice" ? "bookkeeping" : "reconciliation"
}

export const TAB_LABEL: Record<ItemTab, string> = {
  bookkeeping: "Bookkeeping",
  reconciliation: "Reconciliation",
  payroll: "Payroll",
}

const LONG_MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "2026-10" as "October 2026". */
export function monthLabel(period: string) {
  return LONG_MONTH.format(new Date(`${period}-01T12:00:00Z`))
}

/** "2026-09-26" plus 14 days is "2026-10-10". */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Pay dates ──

/** Days before payday the customer's answers have to be in: the check-in,
    and with it everything the pay run needs. Later than that, payday moves. */
export const PAY_CUTOFF_DAYS = 10

function isWeekend(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/** Pay that falls on a weekend goes out the Friday before. */
export function bankingDayOnOrBefore(iso: string) {
  let day = iso
  while (isWeekend(day)) day = addDays(day, -1)
  return day
}

/** The first banking day after a date. */
export function nextBankingDay(iso: string) {
  let day = addDays(iso, 1)
  while (isWeekend(day)) day = addDays(day, 1)
  return day
}

/** The pay day in the client's contract, in the month after the hours. */
export function contractPayDay(client: Pick<Client, "payDate">, month: string) {
  return `${nextMonth(month)}-${client.payDate.split(" ")[0].padStart(2, "0")}`
}

/** When the regular run pays (a banking day), and the cut-off for the
    customer's answers. */
export function payDates(client: Pick<Client, "payDate">, month: string) {
  const contract = contractPayDay(client, month)
  return {
    contract,
    payDate: bankingDayOnOrBefore(contract),
    cutoff: bankingDayOnOrBefore(addDays(contract, -PAY_CUTOFF_DAYS)),
  }
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

/** "2026-10-09" as "Fri 9 Oct", the way requests write their dates. */
export function dayLabel(iso: string) {
  return DAY_LABEL.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

/** The questions that open a pay period, ready to send. */
export function checkinRequest(
  client: Client,
  month: string
): Omit<CustomerRequest, "id" | "status" | "round" | "sentAt"> {
  const { payDate, cutoff } = payDates(client, month)
  const name = monthLabel(month).split(" ")[0]
  const contact = client.contacts[0]
  return {
    clientId: client.id,
    domain: "payroll",
    period: month,
    kind: "payroll_checkin",
    responseType: "checkin",
    title: `Check-in before ${name}'s pay run`,
    message: `Hi ${contact.name.split(" ")[0]}, before we start ${name}'s pay run: anyone new? Anyone leaving? Any holidays or sick leave? Any overtime, and who worked how many hours? Anything else we should know?\n\nIf nothing changed, one tap is enough. Salaries go out on ${dayLabel(payDate)} when we hear from you by ${dayLabel(cutoff)}.`,
    recipientId: contact.id,
    due: dayLabel(cutoff),
    priority: "medium",
  }
}

// ── Deterministic "randomness" so server and client render the same data ──

export function hash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function digits(seed: string, length: number) {
  let out = ""
  let h = hash(seed)
  while (out.length < length) {
    out += String(h % 10)
    h = hash(`${h}`)
  }
  return out
}

function vary(amount: number, seed: string) {
  // ±9%, rounded to whole kroner, keeps recurring bills recognisable.
  const factor = 0.91 + (hash(seed) % 180) / 1000
  return Math.round(amount * factor)
}

const MONTH_NAME: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

export function monthName(period: string) {
  return MONTH_NAME[period.slice(5)] ?? period
}

function shortDate(period: string, day: number) {
  return `${day} ${MONTH_NAME[period.slice(5)]}`
}

/** "2026-10-02" as "2 Oct". */
function shortIso(date: string) {
  return shortDate(date.slice(0, 7), Number(date.slice(8)))
}

/** The account a payment leaves from. Company cards draw on the card
    account; invoices and Vipps are paid from the operating account. */
export function paidFromAccount(
  client: Pick<Client, "accounts">,
  line: { kind?: SourceKind; subtitle: string }
): BankAccount {
  const card = line.kind !== "invoice" && !line.subtitle.startsWith("VIPPS")
  return client.accounts.find((a) => a.ledger === (card ? "1921" : "1920"))!
}

// ── Source-system facts shown in the detail panel ──

function bookkeepingFacts(
  t: BookkeepingTemplate,
  client: Client,
  period: string,
  seed: string
) {
  const card = t.subtitle.startsWith("VISA")
  const vipps = t.subtitle.startsWith("VIPPS")
  const supplierOrg = `${digits(`${t.key}-org`, 3)} ${digits(`${t.key}-org2`, 3)} ${digits(`${t.key}-org3`, 3)}`
  const paidFrom = `DNB ${paidFromAccount(client, { kind: kindOf(t), subtitle: t.subtitle }).number}`

  if (card) {
    return [
      { label: "Paid with", value: `Company card •••• ${digits(`${client.id}-card`, 4)}` },
      { label: "Merchant", value: t.title },
      { label: "Purchase date", value: shortDate(period, t.day) },
      { label: "Settled", value: shortDate(period, Math.min(t.day + 2, 28)) },
      { label: "Account", value: paidFrom, mono: true },
      { label: "Bank reference", value: `*${digits(seed, 11)}`, mono: true },
    ]
  }
  if (vipps) {
    return [
      { label: "Paid with", value: "Vipps Business" },
      { label: "Recipient", value: t.title.replace("Vipps · ", "") },
      { label: "Payment date", value: shortDate(period, t.day) },
      { label: "Message", value: "(none)" },
      { label: "Account", value: paidFrom, mono: true },
      { label: "Bank reference", value: `*${digits(seed, 11)}`, mono: true },
    ]
  }
  const invoiceDate = t.dated ?? `${period}-${String(t.day).padStart(2, "0")}`
  return [
    { label: "Supplier", value: t.title },
    { label: "Supplier org. no.", value: supplierOrg, mono: true },
    { label: "Invoice no.", value: digits(`${seed}-inv`, 7), mono: true },
    { label: "Invoice date", value: shortIso(invoiceDate) },
    ...(t.dated
      ? [{ label: "Received", value: shortDate(period, t.day) }]
      : []),
    {
      label: "Due date",
      value: `${shortIso(addDays(invoiceDate, t.terms ?? 14))} · ${t.terms ?? 14} days`,
    },
    { label: "KID", value: digits(`${seed}-kid`, 13), mono: true },
    {
      label: "Pay to",
      value: t.payTo
        ? `${t.payTo.now} (was ${t.payTo.before})`
        : `${digits(`${t.key}-acct`, 4)}.${digits(`${t.key}-acct2`, 2)}.${digits(`${t.key}-acct3`, 5)}`,
      mono: true,
    },
    { label: "Pay from", value: paidFrom, mono: true },
  ]
}

function payrollFacts(
  t: PayrollTemplate,
  client: Client,
  name: string,
  seed: string
) {
  const hourly = t.basis.startsWith("Hourly")
  return [
    { label: "Employee no.", value: String(100 + (hash(seed) % 80)), mono: true },
    { label: "Position", value: `${t.role.split(" · ")[0]} · ${hourly ? "Part-time" : "100%"}` },
    { label: "Pay type", value: hourly ? "Hourly, per Planday" : "Fixed monthly" },
    { label: "Tax card", value: t.issue === "missing_tax_card" ? "Not fetched" : `Table ${8100 + (hash(`${seed}-tab`) % 40)}` },
    { label: "Bank account", value: t.issue === "missing_tax_card" ? "Missing" : `•••• ${digits(`${seed}-acct`, 4)}`, mono: true },
    { label: "Employed since", value: `${shortIso(employedSince(t, name))} ${employedSince(t, name).slice(0, 4)}` },
    { label: "Employer", value: client.name },
  ]
}

/** Past periods happened on real dates, not "Today". */
function stamp(log: Activity[], when?: string) {
  if (!when) return log
  return log.map((entry) => ({ ...entry, time: when }))
}

function buildItems() {
  const items: ReviewItem[] = []

  for (const client of CLIENTS) {
    CLIENT_BOOKKEEPING[client.id]?.forEach(([key, status, tweak], index) => {
      const t = BOOKKEEPING_BY_KEY.get(key)
      if (!t) return

      PERIODS.bookkeeping.forEach((period) => {
        const open = period.status === "open"
        // A new supplier has no history before this month, and a late
        // invoice only arrived now.
        if (!open && (t.fresh || t.dated)) return
        const finalStatus = open ? (status ?? "needs_review") : "booked"
        const seed = `${client.id}-${period.id}-${key}-${index}`
        const before = tweak?.history ?? t.amount
        const amount = open
          ? (tweak?.amount ?? t.amount)
          : -Math.abs(t.fixed ? before : vary(before, seed))
        const reasoning = (open && tweak?.reasoning) || t.reasoning
        const voucherNo = finalStatus === "booked" ? nextVoucherNo() : undefined
        const kind = kindOf(t)
        const date = t.dated ?? `${period.id}-${String(t.day).padStart(2, "0")}`
        items.push({
          id: `${client.id}-bk-${period.id}-${index}`,
          clientId: client.id,
          domain: "bookkeeping",
          period: period.id,
          kind,
          dueDate: t.terms ? addDays(date, t.terms) : undefined,
          title: t.title,
          subtitle: t.subtitle,
          date,
          amount,
          source:
            kind === "invoice"
              ? t.subtitle.startsWith("EHF")
                ? "EHF · Tripletex inbox"
                : "E-mail · Tripletex inbox"
              : kind === "receipt"
                ? "Receipt · card app"
                : `Bank · DNB ${paidFromAccount(client, { kind, subtitle: t.subtitle }).number}`,
          evidence: open
            ? t.evidence
            : { ...t.evidence, attached: true, fileName: t.evidence.fileName ?? "receipt.jpg" },
          facts: bookkeepingFacts(t, client, period.id, seed),
          suggestion: {
            lines: [{ account: t.account, vat: t.vat, amount }],
            confidence: open ? (tweak?.confidence ?? t.confidence) : Math.max(t.confidence, 0.9),
            reasoning,
            gap: open ? (tweak?.gap ?? (tweak?.reasoning ? undefined : t.gap)) : undefined,
          },
          issue: open ? t.issue : undefined,
          payeeChanged: open ? t.payTo : undefined,
          status: finalStatus,
          voucherNo,
          activity: stamp(
            seedActivity(
              "bookkeeping",
              kind,
              reasoning[0],
              t.account,
              finalStatus,
              voucherNo
            ),
            open ? undefined : shortDate(period.id, Math.min(t.day + 2, 28))
          ),
        })
      })
    })

    CLIENT_PAYROLL[client.id]?.forEach(([key, status], index) => {
      const t = PAYROLL_BY_KEY.get(key)
      if (!t) return
      const planday = client.profile.systems.includes("Planday")
      const name = employeeName(client.id, index)

      PERIODS.payroll.forEach((period) => {
        const open = period.status === "open"
        // A new hire has no history before their start date.
        if (!open && t.issue === "missing_tax_card") return
        const finalStatus = open ? (status ?? "needs_review") : "booked"
        const seed = `${client.id}-${index}-${name}`
        const history = open ? undefined : closedPay(t, period.id, `${seed}-${period.id}`)
        const gross = history ? history.reduce((sum, l) => sum + l.amount, 0) : t.gross
        items.push({
          id: `${client.id}-pr-${period.id}-${index}`,
          clientId: client.id,
          domain: "payroll",
          period: period.id,
          title: name,
          subtitle: t.role,
          date: `${nextMonth(period.id)}-${client.payDate.split(" ")[0].padStart(2, "0")}`,
          amount: gross,
          basis: t.basis,
          source: planday
            ? `Planday · ${MONTH_NAME[period.id.slice(5)]} hours`
            : `Tripletex · ${MONTH_NAME[period.id.slice(5)]} salaries`,
          evidence: open ? t.evidence : { ...t.evidence, attached: true, fileName: t.evidence.fileName ?? "payslip.pdf" },
          facts: payrollFacts(t, client, name, seed),
          suggestion: {
            lines: history ?? t.lines,
            confidence: open ? t.confidence : 0.97,
            reasoning: t.reasoning,
          },
          issue: open ? t.issue : undefined,
          status: finalStatus,
          activity: stamp(
            seedActivity(
              "payroll",
              planday ? "planday" : "salary_register",
              t.reasoning[0],
              `${formatShortNok(gross)} gross`,
              finalStatus
            ),
            open ? undefined : shortDate(nextMonth(period.id), 12)
          ),
        })
      })
    })
  }

  // Thea wrote that the designer's overtime on a pitch in September never
  // reached September's run. It is paid now, as its own line.
  const designer = items.find((i) => i.id === "nordlys-design-pr-2026-10-0")
  if (designer) {
    items.push({
      ...designer,
      id: SEEDED_CORRECTION.itemId,
      subtitle: "Overtime for September, paid now",
      amount: 3344,
      basis: "Correction · September",
      evidence: { label: "E-mail", attached: true, fileName: "re-overtime-september.eml" },
      suggestion: {
        lines: [{ account: "Overtime 40% · 8 h × 418 kr in September", amount: 3344 }],
        confidence: 0.86,
        reasoning: [
          "Thea's e-mail of 22 Oct: 8 h overtime on the Hurtigruten pitch in September never reached September's run.",
          "Paid in this run and reported in November's A-melding, dated when it is paid.",
          "Booked back to September: Dr 5000 / Cr 2980 accrued salary, reversed when it is paid.",
        ],
      },
      issue: undefined,
      status: "needs_review",
      activity: [
        {
          id: activityId(),
          actor: "accountant",
          title: "Added a correction for September",
          detail: "From Thea's e-mail of 22 Oct. Paid now, earned in September.",
          time: "Fri 30 Oct 15:20",
        },
        {
          id: activityId(),
          actor: "agent",
          title: "Booked back to September",
          detail: "Dr 5000 Salaries / Cr 2980 Accrued salary in September. Reversed when it is paid in November.",
          time: "Fri 30 Oct 15:21",
        },
      ],
    })
  }

  return items
}

function formatShortNok(value: number) {
  return `${new Intl.NumberFormat("nb-NO").format(value)} kr`
}

// ── Requests the loop already has in flight ──

export const REQUEST_KIND_FOR_ISSUE: Record<
  IssueKind,
  CustomerRequest["kind"]
> = {
  missing_receipt: "missing_receipt",
  unclear_purpose: "explain",
  private_expense: "explain",
  overtime_unapproved: "confirm",
  sick_leave: "document",
  missing_tax_card: "document",
  unregistered_bonus: "confirm",
}

export function draftRequest(
  item: ReviewItem,
  client: Client
): Pick<
  CustomerRequest,
  "kind" | "title" | "message" | "responseType" | "options"
> {
  const amount = `${new Intl.NumberFormat("nb-NO").format(Math.abs(item.amount))} kr`
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(item.date))
  const firstName = client.contacts[0]?.name.split(" ")[0] ?? "there"

  switch (item.issue) {
    case "missing_receipt":
      return {
        kind: "missing_receipt",
        responseType: "file",
        title: `Receipt for ${item.title}, ${amount}`,
        message: `Hi ${firstName}, we're missing the receipt for ${amount} at ${item.title} on ${date}. Could you snap a photo of it and tell us briefly what was bought?`,
      }
    case "unclear_purpose":
      return {
        kind: "explain",
        responseType: "text",
        title: `What was ${item.title} for?`,
        message: `Hi ${firstName}, could you tell us what the ${amount} payment to ${item.title} on ${date} was for? If it was a meal or trip, please list who took part and the business purpose.`,
      }
    case "private_expense":
      return {
        kind: "explain",
        responseType: "choice",
        options: ["Business expense", "Private, I'll pay it back", "Not sure, call me"],
        title: `Business or private: ${item.title}`,
        message: `Hi ${firstName}, the ${amount} payment to ${item.title} on ${date} looks like it could be private. Was it a business expense? If so, what was it for?`,
      }
    case "overtime_unapproved":
      return {
        kind: "confirm",
        responseType: "confirm",
        title: `Approve overtime for ${item.title}`,
        message: `Hi ${firstName}, ${item.title} logged 6 hours of overtime in October that isn't approved in Planday. Should we pay it out in the November run?`,
      }
    case "sick_leave":
      return {
        kind: "document",
        responseType: "file",
        title: `Sick note for ${item.title}`,
        message: `Hi ${firstName}, ${item.title} has 4 sick days registered in October. Could you upload the self-certification (egenmelding) or doctor's note so we can calculate sick pay?`,
      }
    case "missing_tax_card":
      return {
        kind: "document",
        responseType: "text",
        title: `Onboarding details for ${item.title}`,
        message: `Hi ${firstName}, welcome to ${item.title}, who started on 19 October! We need their national ID number (fødselsnummer or D-number) to fetch the tax deduction card from Skatteetaten, and their bank account number to pay them. Until the tax card is in, 50% tax is withheld.`,
      }
    case "unregistered_bonus":
      return {
        kind: "confirm",
        responseType: "confirm",
        title: `Confirm bonus for ${item.title}`,
        message: `Hi ${firstName}, your e-mail on 20 Oct mentions a 5 000 kr bonus for ${item.title}. Should it be paid in the November run?`,
      }
    default:
      return {
        kind: "explain",
        responseType: "text",
        title: `Question about ${item.title}`,
        message: `Hi ${firstName}, we have a quick question about ${item.title} (${amount}, ${date}). Could you add some context?`,
      }
  }
}

function buildRequests(items: ReviewItem[]) {
  const requests: CustomerRequest[] = []
  let seq = 100

  // Questions the agents drafted overnight for flagged lines. The accountant
  // decides whether they go out, so they sit in "Needs decision".
  for (const item of items) {
    if (!isOpenPeriod(item) || item.status !== "needs_review" || !item.issue)
      continue
    if (hash(item.id) % 3 === 0) continue
    const client = CLIENT_BY_ID.get(item.clientId)
    if (!client) continue
    seq += 1
    const draft = draftRequest(item, client)
    requests.push({
      id: `REQ-${seq}`,
      clientId: item.clientId,
      domain: item.domain,
      itemId: item.id,
      period: item.period,
      ...draft,
      recipientId: client.contacts[0].id,
      due: "Fri 6 Nov",
      priority:
        item.domain === "payroll" || item.issue === "private_expense"
          ? "high"
          : "medium",
      status: "draft",
      round: 0,
      sentAt: "Drafted 06:12",
    })
    item.requestId = `REQ-${seq}`
    item.activity.push({
      id: activityId(),
      actor: "agent",
      title: "Drafted a question for the customer",
      detail: draft.title,
      time: "Today 06:12",
    })
  }

  for (const item of items) {
    if (item.status !== "waiting_customer" && item.status !== "customer_replied")
      continue
    const client = CLIENT_BY_ID.get(item.clientId)
    if (!client) continue
    seq += 1
    const draft = draftRequest(item, client)
    const request: CustomerRequest = {
      id: `REQ-${seq}`,
      clientId: item.clientId,
      domain: item.domain,
      itemId: item.id,
      period: item.period,
      ...draft,
      recipientId: client.contacts[0].id,
      due: "Thu 5 Nov",
      priority: item.domain === "payroll" ? "high" : "medium",
      status: item.status === "customer_replied" ? "replied" : "sent",
      round: 1,
      sentAt: item.status === "customer_replied" ? "Wed 28 Oct" : "Thu 29 Oct",
      reply:
        item.status === "customer_replied"
          ? { ...cannedReply(item, client).reply!, time: "Fri 30 Oct 16:40" }
          : undefined,
    }
    item.requestId = request.id
    item.activity.push({
      id: activityId(),
      actor: "accountant",
      title: `Asked ${client.contacts[0].name}`,
      detail: request.message,
      time: request.sentAt,
    })
    if (request.reply) {
      const updated = cannedReply(item, client)
      item.activity.push({
        id: activityId(),
        actor: "customer",
        title: `${client.contacts[0].name} replied`,
        detail: request.reply.text,
        time: request.reply.time,
      })
      item.suggestion = updated.suggestion
      item.evidence = updated.evidence
      if (item.domain === "payroll") {
        item.amount = updated.suggestion.lines.reduce((s, l) => s + l.amount, 0)
      }
      item.activity.push({
        id: activityId(),
        actor: "agent",
        title: "Updated the suggestion from the reply",
        detail: updated.suggestion.reasoning[0],
        time: request.reply.time,
      })
    }
    requests.push(request)
  }

  // One finished loop so the Resolved column isn't empty on first load.
  const booked = items.find(
    (i) =>
      i.clientId === "fjord-kaffebar" && i.status === "booked" && isOpenPeriod(i)
  )
  if (booked) {
    seq += 1
    requests.push({
      id: `REQ-${seq}`,
      clientId: booked.clientId,
      domain: booked.domain,
      itemId: booked.id,
      period: booked.period,
      responseType: "file",
      kind: "missing_receipt",
      title: `Receipt for ${booked.title}`,
      message: "Hi Kari, could you send us the receipt for this purchase?",
      recipientId: "kari",
      due: "Fri 23 Oct",
      priority: "low",
      status: "resolved",
      round: 1,
      sentAt: "Last week",
      reply: {
        text: "Found it in my e-mail, attached.",
        attachment: "receipt.pdf",
        time: "Last week",
      },
      resolution: "booked",
    })
    booked.requestId = `REQ-${seq}`
  }

  // History: last month's questions, answered and booked. This is what the
  // client overview shows under "What happened before".
  for (const item of items) {
    if (isOpenPeriod(item) || item.domain !== "bookkeeping") continue
    const template = BOOKKEEPING_BY_KEY.get(
      BOOKKEEPING_TEMPLATES.find((t) => t.title === item.title)?.key ?? ""
    )
    if (!template?.issue || hash(item.id) % 2 === 1) continue
    if (item.clientId === DEMO_CLIENT_ID) continue
    const client = CLIENT_BY_ID.get(item.clientId)
    if (!client) continue
    seq += 1
    const probe = { ...item, issue: template.issue }
    const draft = draftRequest(probe, client)
    const answered = cannedReply(probe, client)
    const sentDay = shortDate(item.period, Math.min(template.day + 3, 27))
    requests.push({
      id: `REQ-${seq}`,
      clientId: item.clientId,
      domain: "bookkeeping",
      itemId: item.id,
      period: item.period,
      ...draft,
      recipientId: client.contacts[0].id,
      due: sentDay,
      priority: "medium",
      status: "resolved",
      round: hash(item.id) % 5 === 0 ? 2 : 1,
      sentAt: sentDay,
      reply: answered.reply ? { ...answered.reply, time: sentDay } : undefined,
      resolution: "booked",
    })
    item.requestId = `REQ-${seq}`
  }

  // Approval lists: Fjord Kaffebar's from two weeks ago still waiting on
  // Kari (its Hafslund invoice is past due now), and Havbris's from last
  // Monday answered with a supplier approved from now on and one line
  // rejected. See approvals.ts.
  requests.push(...seedApprovalLists(items))

  // Questions the customers opened themselves from their app: one still
  // waiting on the firm, one answered with a question back.
  requests.push(
    {
      id: "Q-501",
      clientId: "fjord-kaffebar",
      domain: "payroll",
      period: OPEN_MONTH,
      origin: "customer",
      responseType: "text",
      kind: "customer_question",
      title: "New barista starting 1 December",
      message:
        "Hi! We're hiring Sofie Berg as a barista from 1 December, 60% position, 215 kr/h. What do you need from us before she starts? Contract attached.",
      attachment: "Arbeidsavtale_Sofie_Berg.pdf",
      recipientId: "kari",
      due: "",
      priority: "medium",
      status: "replied",
      round: 1,
      sentAt: "Fri 30 Oct",
    },
    {
      id: "Q-502",
      clientId: "nordlys-design",
      domain: "bookkeeping",
      period: OPEN_MONTH,
      origin: "customer",
      responseType: "text",
      kind: "customer_question",
      title: "Can I expense my home office?",
      message:
        "I work from home two days a week. Can the company cover part of my rent or internet?",
      recipientId: "thea",
      due: "",
      priority: "medium",
      status: "sent",
      round: 1,
      sentAt: "Wed 28 Oct",
      thread: [
        {
          id: "Q-502-1",
          from: "accountant",
          text:
            "Internet yes: the company can cover it up to 4 392 kr a year tax-free. Rent is harder unless you have a separate room used only for work. Is that the case?",
          time: "Thu 29 Oct",
        },
      ],
    },
    {
      id: "Q-503",
      clientId: "solberg-tann",
      domain: "bookkeeping",
      period: OPEN_MONTH,
      origin: "customer",
      responseType: "text",
      kind: "customer_question",
      title: "Leasing the new X-ray unit",
      message:
        "The supplier offers 5-year leasing or buying it for 480 000 kr. Which is better for us tax-wise? We have to decide by Friday.",
      attachment: "Tilbud_Planmeca.pdf",
      recipientId: "hanne",
      due: "",
      priority: "high",
      status: "replied",
      round: 1,
      sentAt: "2 hours ago",
    },
    {
      id: "Q-504",
      clientId: "aurora-frisor",
      domain: "general",
      period: OPEN_MONTH,
      origin: "customer",
      responseType: "text",
      kind: "customer_question",
      title: "New address from November",
      message:
        "We moved the salon to Storgata 14 on 1 November. Do you need to update anything with Brønnøysund, or on our invoices?",
      recipientId: "linn",
      due: "",
      priority: "low",
      status: "replied",
      round: 1,
      sentAt: "This morning",
    }
  )

  return requests
}

/** The approval lists already out when the demo starts. Their lines carry
    what stood out when they were sent, in the customer's words. */
function seedApprovalLists(items: ReviewItem[]): CustomerRequest[] {
  const line = (clientId: string, index: number) => `${clientId}-bk-${OPEN_MONTH}-${index}`
  const trail = (itemId: string, title: string, detail: string | undefined, time: string, actor: Activity["actor"]) => {
    items.find((i) => i.id === itemId)?.activity.push({ id: activityId(), actor, title, detail, time })
  }

  const fjord: CustomerRequest = {
    id: "APR-518",
    clientId: "fjord-kaffebar",
    domain: "bookkeeping",
    period: OPEN_MONTH,
    responseType: "approval",
    kind: "approval",
    title: "Approve 2 invoices before they're paid",
    message:
      "Hi Kari, this week we booked 2 invoices. One needs a real look: Hafslund Strøm is 34 120 kr, about 10 times what you usually pay for power. Kontorspar is a supplier you approve every month. Please approve by Wed 21 Oct so both are paid on time.",
    recipientId: "kari",
    due: "Wed 21 Oct",
    priority: "high",
    status: "sent",
    round: 1,
    sentAt: "Mon 19 Oct",
    lines: [
      { itemId: line("fjord-kaffebar", 10) },
      { itemId: line("fjord-kaffebar", 6), anomaly: "10× what you usually pay Hafslund Strøm" },
    ],
  }

  const havbris: CustomerRequest = {
    id: "APR-512",
    clientId: "havbris",
    domain: "bookkeeping",
    period: OPEN_MONTH,
    responseType: "approval",
    kind: "approval",
    title: "Approve 3 invoices before they're paid",
    message:
      "Hi Lars, this week we booked 3 invoices. One needs a real look: Tine isn't on your approved suppliers yet. Telenor and Hafslund are suppliers you approve every month. Please approve by Wed 28 Oct so they're paid on time.",
    recipientId: "lars",
    due: "Wed 28 Oct",
    priority: "medium",
    status: "replied",
    round: 1,
    sentAt: "Mon 26 Oct",
    answeredBy: { contactId: "lars", name: "Lars Dahl", at: "2026-10-27T08:47" },
    lines: [
      { itemId: line("havbris", 0), decision: "approved", remember: true },
      { itemId: line("havbris", 3), decision: "approved" },
      {
        itemId: line("havbris", 4),
        decision: "rejected",
        note: "We moved out of the Sandviken warehouse at the end of September. This meter isn't ours any more.",
      },
    ],
  }

  for (const request of [fjord, havbris]) {
    const client = CLIENT_BY_ID.get(request.clientId)
    const to = client?.contacts.find((c) => c.id === request.recipientId)?.name ?? "the customer"
    for (const l of request.lines ?? []) {
      trail(l.itemId, `Sent for approval to ${to}`, `${request.id} · ${request.title}`, request.sentAt, "accountant")
      if (!l.decision || !request.answeredBy) continue
      trail(
        l.itemId,
        l.decision === "approved"
          ? `Approved by ${request.answeredBy.name}${l.remember ? ", from now on" : ""}`
          : `Rejected by ${request.answeredBy.name}`,
        l.note,
        "Tue 27 Oct",
        "customer"
      )
    }
  }
  return [fjord, havbris]
}

// ── Why the agent thinks so ──

/** Turns the agent's reasoning into typed signals: where each fact came from
    and whether it supports the suggestion or argues against it. */
export function signalsFor(item: ReviewItem): Signal[] {
  // A card receipt is worked from its bank line: that the money left the
  // card account for the same amount on the same day is evidence too.
  const bank: Signal[] =
    item.kind === "receipt"
      ? [
          {
            text: `The card payment of ${new Intl.NumberFormat("nb-NO").format(Math.abs(item.amount))} kr on ${shortIso(item.date)} matches the receipt's amount and date.`,
            source: "bank",
            effect: "supports",
          },
        ]
      : []
  return [...bank, ...item.suggestion.reasoning.map((text) => {
    const t = text.toLowerCase()
    const against =
      /no receipt|missing|without|not approved|no self|not in the payroll|could be|unclear|first payment|first invoice|no history|no earlier|no invoice|usually private|can't|cannot|not on file|is closed|already filed|rejected|has no vehicle|still booked with vat|new bank account/.test(
        t
      )
    const source: Signal["source"] = /^[^:“]{1,40}: “/.test(text) || /reply|customer|confirmed by|your note|recalculated|rejected it|set the salary|out of pocket|sent by/.test(t)
      ? "customer"
      : /month|history|recurring|same supplier|previous|prior|pattern|last run/.test(t)
        ? "history"
        : /vat|reverse charge|capitalisation|employer period|a-melding|limit|holiday pay|ferieloven|§/.test(t)
          ? "rule"
          : /receipt|invoice|ehf|pdf|e-ticket|timesheet|e-mail|order/.test(t)
            ? "document"
            : /supplier record|registry|registered|tax deduction card|skatteetaten|vegvesen|^leaving/.test(t)
              ? "registry"
              : "bank"
    return {
      text,
      source,
      effect: against ? "against" : "supports",
    } satisfies Signal
  })]
}

/** The same counterparty in earlier months, as the agent would have seen it. */
export function similarBookings(item: ReviewItem, items: ReviewItem[]) {
  return items
    .filter(
      (i) =>
        i.clientId === item.clientId &&
        i.domain === item.domain &&
        i.title === item.title &&
        i.period < item.period &&
        i.status === "booked"
    )
    .sort((a, b) => (a.period < b.period ? 1 : -1))
    .slice(0, 3)
}

/** The limit for a simple meal with business contacts to be deductible,
    per person, VAT included: 592 kr for every year 2023–26, set before the
    year (FSFIN § 6-21). Spirits on the bill remove the deduction entirely. */
export const ENTERTAINMENT_LIMIT = 592

/** A meal with business contacts, once the customer said who was there:
    4 people, so the bill per person decides 7350 or 7360. The VAT is never
    deductible on food and drink. */
function entertainment(item: ReviewItem): ReviewItem["suggestion"] {
  const people = 4
  const each = Math.round(Math.abs(item.amount) / people)
  const over = each > ENTERTAINMENT_LIMIT
  const account = over ? "7360 Entertainment, not deductible" : "7350 Entertainment, deductible"
  const nok = new Intl.NumberFormat("nb-NO")
  return {
    lines: [{ account, vat: "0 · No VAT", amount: item.amount }],
    confidence: 0.93,
    reasoning: [
      "Purpose and attendees documented from the customer's reply: a meal with Morten from Tine, 4 people.",
      over
        ? `${nok.format(each)} kr a person is over the ${ENTERTAINMENT_LIMIT} kr limit for a deductible business meal in 2026, so it goes on 7360 and is added back in the tax return.`
        : `${nok.format(each)} kr a person is within the ${ENTERTAINMENT_LIMIT} kr limit for a deductible business meal in 2026, so 7350.`,
      "No input VAT on food and drink (mva-loven § 8-3), whatever the account.",
    ],
    gap: "The receipt doesn't list the drinks: with spirits on the bill the meal isn't deductible at any amount.",
  }
}

/** What the customer "sends back" when the demo simulates a reply, and how the
    agent updates its suggestion from it. */
export function cannedReply(
  item: ReviewItem,
  client: Client,
  request?: Pick<CustomerRequest, "responseType" | "options">
): {
  reply: CustomerRequest["reply"]
  suggestion: ReviewItem["suggestion"]
  evidence: ReviewItem["evidence"]
} {
  const first = item.suggestion.lines[0]
  const time = "Just now"

  // A pick-one task comes back as the chosen option, whatever the issue.
  if (request?.responseType === "choice" && request.options?.length) {
    const picked =
      item.issue === "private_expense"
        ? (request.options.find((o) => /private/i.test(o)) ?? request.options[0])
        : request.options[0]
    const base = cannedReply(item, client)
    return {
      ...base,
      reply: { text: `Picked: ${picked}`, time },
    }
  }

  switch (item.issue) {
    case "missing_receipt":
      return {
        reply: {
          text: `Here's the receipt. It's a new card terminal for the counter.`,
          attachment: "IMG_4821.jpg",
          time,
        },
        evidence: {
          label: "Receipt",
          attached: true,
          fileName: "IMG_4821.jpg",
        },
        suggestion: {
          lines: item.suggestion.lines,
          confidence: 0.94,
          reasoning: [
            `Receipt matched: ${new Intl.NumberFormat("nb-NO").format(Math.abs(item.amount))} kr incl. 25% VAT, item is equipment for the premises.`,
            `Keeps ${first.account}, input VAT is now deductible.`,
          ],
        },
      }
    case "unclear_purpose": {
      // A meal is decided by who was there; a trip or a purchase by what it
      // was for.
      const meal = /^73[56]0/.test(first.account)
      return {
        reply: {
          text: meal
            ? "Dinner with our supplier from Tine and 3 of us after the trade fair. Attendees: Kari, Anders, Silje + Morten (Tine)."
            : item.title.includes("Norwegian")
              ? "That was me, flying to Bergen to meet a customer on the 17th."
              : "Material for the Hansen job, project 2291. It goes on their invoice.",
          time,
        },
        evidence: item.evidence,
        suggestion: meal
          ? entertainment(item)
          : {
              lines: item.suggestion.lines,
              confidence: 0.91,
              reasoning: [
                "Purpose documented from the customer's reply.",
                `Keeps ${first.account}${first.vat ? `, VAT ${first.vat}` : ""}.`,
              ],
            },
      }
    }
    case "private_expense":
      return {
        reply: {
          text: "Sorry, that one was private. I'll pay it back to the company account.",
          time,
        },
        evidence: { label: "Confirmation", attached: true, fileName: "Reply" },
        suggestion: {
          lines: [
            {
              account: "1570 Receivable, shareholder",
              vat: "0 · No VAT",
              amount: item.amount,
            },
          ],
          confidence: 0.96,
          reasoning: [
            "Customer confirmed it's private, so it's booked as a receivable on the shareholder.",
            "The receivable closes when the refund arrives in the bank feed.",
          ],
        },
      }
    case "overtime_unapproved":
      return {
        reply: {
          text: "Yes, approved. He covered two closing shifts for Sara.",
          time,
        },
        evidence: { label: "Approval", attached: true, fileName: "Reply" },
        suggestion: {
          lines: item.suggestion.lines,
          confidence: 0.97,
          reasoning: ["Overtime approved by the customer, 6 h at 40% added."],
        },
      }
    case "sick_leave":
      return {
        reply: {
          text: "Egenmelding uploaded.",
          attachment: "egenmelding.pdf",
          time,
        },
        evidence: {
          label: "Sick note",
          attached: true,
          fileName: "egenmelding.pdf",
        },
        suggestion: {
          lines: item.suggestion.lines,
          confidence: 0.95,
          reasoning: [
            "Self-certification covers all 4 days, so sick pay in the employer period applies.",
          ],
        },
      }
    case "missing_tax_card":
      return {
        reply: {
          text: "Account 1503.12.34567, fødselsnummer sent via the secure form.",
          time,
        },
        evidence: { label: "Tax card", attached: true, fileName: "Skattekort 2026" },
        suggestion: {
          lines: item.suggestion.lines,
          confidence: 0.92,
          reasoning: [
            "Tax deduction card fetched from Skatteetaten with the national ID number (table 8115), and the bank account added for the payment.",
            "First pay with October's run, on November's A-melding.",
          ],
        },
      }
    case "unregistered_bonus":
      return {
        reply: {
          text: `Yes please, 5 000 kr in November. ${client.contacts[0].name.split(" ")[0]}`,
          time,
        },
        evidence: { label: "Approval", attached: true, fileName: "Reply" },
        suggestion: {
          lines: [
            ...item.suggestion.lines,
            { account: "Bonus", amount: 5000 },
          ],
          confidence: 0.96,
          reasoning: ["Bonus confirmed by the customer and added to the run."],
        },
      }
    default:
      return {
        reply: { text: "Thanks, all good.", time },
        evidence: item.evidence,
        suggestion: { ...item.suggestion, confidence: 0.9 },
      }
  }
}

/** What the agent makes of something the accountant learned outside the
    app, on the phone or by e-mail: hours or a bonus it can read, and
    otherwise the same update a written answer from the customer would give.
    Whatever was flagged is settled by the accountant's word. */
export function suggestFromNote(
  item: ReviewItem,
  client: Client,
  note: string
): Pick<ReviewItem, "suggestion" | "evidence"> {
  const nok = (value: number) => `${new Intl.NumberFormat("nb-NO").format(value)} kr`
  const evidence = { label: "Your note", attached: true, fileName: "Note" }
  const said = `From your note: “${note.trim()}”`

  if (item.domain === "payroll") {
    const hours = note.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hours?\b|timer\b|t\b)/i)
    const hourly = item.suggestion.lines.find((l) => /× (\d+) kr/.test(l.account))
    if (hours && hourly) {
      const h = Number(hours[1].replace(",", "."))
      const rate = Number(hourly.account.match(/× (\d+) kr/)![1])
      const amount = Math.round(h * rate)
      return {
        evidence,
        suggestion: {
          lines: [{ account: `Hourly wage · ${h} h × ${rate} kr`, amount }],
          confidence: 0.95,
          reasoning: [said, `Recalculated the pay: ${h} h × ${rate} kr = ${nok(amount)}.`],
        },
      }
    }
    // A monthly salary corrected in words: "should be 45 200", "80% from
    // October". The number in the note wins over last month's.
    const fixed = item.suggestion.lines[0]
    if (fixed && /^(Fixed|Base) salary/.test(fixed.account) && !/bonus/i.test(note)) {
      const amountSaid = note.match(/(\d{1,3}(?:[\s.]\d{3})+|\d{4,})\s*(?:kr|nok)?/i)
      const percentSaid = note.match(/(\d{1,3})\s*%/)
      const amount = amountSaid
        ? Number(amountSaid[1].replace(/[\s.]/g, ""))
        : percentSaid
          ? Math.round((fixed.amount * Number(percentSaid[1])) / 100)
          : undefined
      if (amount && amount !== fixed.amount)
        return {
          evidence,
          suggestion: {
            lines: [{ ...fixed, amount }, ...item.suggestion.lines.slice(1)],
            confidence: 0.93,
            reasoning: [
              said,
              `Set the salary to ${nok(amount)}${amountSaid ? "" : ` (${percentSaid![1]}% of ${nok(fixed.amount)})`}, from ${nok(fixed.amount)}.`,
            ],
          },
        }
    }
    const bonus = /bonus/i.test(note) ? note.match(/(\d[\d\s.]*\d)\s*(?:kr|nok)?/i) : null
    if (bonus) {
      const amount = Number(bonus[1].replace(/[\s.]/g, ""))
      return {
        evidence,
        suggestion: {
          lines: [
            ...item.suggestion.lines.filter((l) => !l.account.startsWith("Bonus")),
            { account: "Bonus", amount },
          ],
          confidence: 0.95,
          reasoning: [said, `Added a ${nok(amount)} bonus to the run.`],
        },
      }
    }
  }

  const base = cannedReply(item, client)
  return {
    evidence: base.evidence.attached ? base.evidence : evidence,
    suggestion: {
      ...base.suggestion,
      confidence: Math.max(base.suggestion.confidence, 0.92),
      reasoning: [said, ...base.suggestion.reasoning],
    },
  }
}

// ── Initial state ──

export function createInitialData() {
  activitySeq = 0
  voucherSeq = 412
  const items = buildItems()
  const requests = buildRequests(items)
  seedCheckins(requests)
  seedTeamwork(items, requests)
  markApprovedEarlier(items, requests)
  return { items, requests }
}

/** This month's invoices booked before today went out on the Monday list
    after their date, and the customer approved them the day after: by the
    first week of November that's every one, except those on the lists the
    demo shows (Fjord's still waiting, Havbris's with a rejection). What
    the accountant books from here goes on the next list. */
function markApprovedEarlier(items: ReviewItem[], requests: CustomerRequest[]) {
  const listed = new Set(
    requests.filter((r) => r.kind === "approval").flatMap((r) => (r.lines ?? []).map((l) => l.itemId))
  )
  for (const item of items) {
    if (item.kind !== "invoice" || item.status !== "booked" || item.period !== OPEN_MONTH) continue
    if (listed.has(item.id)) continue
    const weekday = new Date(`${item.date}T12:00:00Z`).getUTCDay()
    const listDay = addDays(item.date, (8 - weekday) % 7)
    if (listDay < TODAY) item.approvedEarlier = true
  }
}

/** October's check-ins went out on Friday 23 Oct. Most customers have
    answered "No changes"; Fjord Kaffebar hasn't yet, Solberg wrote what
    changed, and Skarv's goes out from the payroll page during the demo. */
function seedCheckins(requests: CustomerRequest[]) {
  let seq = 200
  for (const client of CLIENTS) {
    if (!CLIENT_PAYROLL[client.id] || client.id === DEMO_CLIENT_ID) continue
    seq += 1
    const base = checkinRequest(client, OPEN_MONTH)
    const contact = client.contacts[0]
    const h = hash(`${client.id}-checkin`)
    const at = `2026-10-${23 + (h % 3)}T${String(8 + (h % 9)).padStart(2, "0")}:${String(10 + (h % 49)).padStart(2, "0")}`
    const sent = { ...base, id: `PAY-${seq}`, round: 1, sentAt: "Fri 23 Oct" }
    if (client.id === "fjord-kaffebar") {
      requests.push({ ...sent, status: "sent" })
      continue
    }
    const answeredBy = { contactId: contact.id, name: contact.name, at }
    if (client.id === "solberg-tann") {
      requests.push({
        ...sent,
        status: "replied",
        answeredBy,
        checkin: {
          noChanges: false,
          leavers: `${employeeName(client.id, 1)} is leaving us, last day 30 Nov.`,
          absence: `${employeeName(client.id, 0).split(" ")[0]} was off sick 19–21 Oct, egenmelding.`,
        },
      })
      continue
    }
    requests.push({
      ...sent,
      status: "resolved",
      resolution: "done",
      answeredBy,
      checkin: { noChanges: true },
    })
  }
}

/** A few tasks already moving between colleagues: one asked of Ingrid, one
    handed to her, one she's waiting on and one that came back answered. */
function seedTeamwork(items: ReviewItem[], requests: CustomerRequest[]) {
  const note = (id: string, authorId: string, text: string, time: string) => ({
    id,
    authorId,
    text,
    time,
  })
  const tasks: {
    id: string
    mode: "ask" | "handover"
    from: string
    to: string
    text: string
    at: string
    answer?: { text: string; at: string }
  }[] = [
    {
      id: "bergen-bygg-pr-2026-10-0",
      mode: "ask",
      from: "marius",
      to: "ingrid",
      text: "You set up Bergen Bygg's payroll last year. Does their contract pay 50% or 100% after 21:00? I want to get this right before I approve.",
      at: "Fri 30 Oct",
    },
    {
      id: "polar-logistikk-bk-2026-10-0",
      mode: "handover",
      from: "marius",
      to: "ingrid",
      text: "I'm off from Thursday. Can you take Polar's fuel card lines? The rest of their month is done.",
      at: "Fri 30 Oct",
    },
    {
      id: "fjord-kaffebar-pr-2026-10-3",
      mode: "ask",
      from: "ingrid",
      to: "sofie",
      text: "The new barista has no tax card yet. Can we run 50% withholding for November, or should we wait for Skatteetaten?",
      at: "Today 09:12",
    },
    {
      id: "Q-503",
      mode: "ask",
      from: "ingrid",
      to: "marius",
      text: "You did the leasing vs. buying analysis for Kvist in the spring. Do you still have the template?",
      at: "Today 08:40",
      answer: {
        text: "Yes: Clients/Kvist/2026/leasing-vs-buy.xlsx. At 480 000 kr, buying usually wins if they have the cash, because of depreciation.",
        at: "Today 10:05",
      },
    },
  ]

  for (const t of tasks) {
    const task =
      items.find((i) => i.id === t.id) ?? requests.find((r) => r.id === t.id)
    if (!task) continue
    task.handoff = {
      mode: t.mode,
      from: t.from,
      to: t.to,
      note: t.text,
      at: t.at,
      status: t.answer || t.mode === "handover" ? "answered" : "open",
    }
    if (t.mode === "handover") task.assigneeId = t.to
    task.notes = [
      note(`${t.id}-n1`, t.from, t.text, t.at),
      ...(t.answer ? [note(`${t.id}-n2`, t.to, t.answer.text, t.answer.at)] : []),
    ]
  }
}
