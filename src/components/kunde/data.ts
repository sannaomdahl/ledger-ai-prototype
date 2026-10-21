// Dummy data for the Sanna-style customer view: Fjordlys Rådgivning AS, the
// consulting firm from the sanna.no mockups, seen by its daglig leder. The
// accountant is Truls Uppheim (statsautorisert), as on the website. Numbers
// echo the website where it shows them (omsetning 1 284 000, +12 %, lønn
// 612 000, utestående 412 000, AGA 136 400 on 16 Nov) and are invented
// around that.

export const TODAY = "2026-10-21"

export const FIRM = {
  name: "Fjordlys Rådgivning AS",
  orgNo: "927 318 455",
  system: "Tripletex",
}

export const CONTACT = {
  name: "Andrea Omdahl",
  first: "Andrea",
  role: "Daglig leder",
}

export const TRIPLETEX_URL = "https://tripletex.no/"
export const BANK_URL = "https://www.dnb.no/bedrift"

export const ACCOUNTANT = {
  name: "Truls Uppheim",
  first: "Truls",
  title: "Din regnskapsfører",
  photo: "team/truls.webp",
  reply: "Svarer som regel innen en time",
}

// ── Dette trenger vi fra deg ──

export type TodoKind = "file" | "approve" | "choice"

export type Todo = {
  id: string
  kind: TodoKind
  title: string
  detail: string
  /** ISO date the thing holds up. */
  due: string
  /** What the date is for, in the customer's words. */
  holdsUp: string
  /** Only for `choice`. */
  options?: string[]
  action: string
}

export const TODOS: Todo[] = [
  {
    id: "lonn-okt",
    kind: "approve",
    title: "Godkjenn lønn for oktober",
    detail: "7 ansatte · 603 136 kr · Amalie fra 6. oktober",
    due: "2026-10-23",
    holdsUp: "Lønn betales 25. oktober",
    action: "Godkjenn lønn",
  },
  {
    id: "proshop",
    kind: "file",
    title: "Last opp fakturaen fra Proshop",
    detail: "7 472 kr betalt med kort 3. september · trolig kontorutstyr",
    due: "2026-10-28",
    holdsUp: "Vi lukker oktober 31. oktober",
    action: "Last opp",
  },
  {
    id: "nordic-cloud",
    kind: "choice",
    title: "Nordic Cloud AS, 48 000 kr",
    detail:
      "Det er en årlig lisens. Skal jeg fordele den over 12 måneder, eller bokføre alt i oktober?",
    due: "2026-10-28",
    holdsUp: "Vi lukker oktober 31. oktober",
    options: ["Fordel over året", "Alt i oktober"],
    action: "Velg",
  },
]

/** Already done this month: greyed out at the top of the timeline. */
export const DONE: {
  id: string
  title: string
  detail: string
  when: string
}[] = [
  {
    id: "lonn-sep",
    title: "Godkjent lønn for september",
    detail: "7 ansatte · 598 000 kr",
    when: "24. sep",
  },
  {
    id: "mva-sep",
    title: "Bekreftet MVA-grunnlag for juli–august",
    detail: "Levert 10. oktober",
    when: "8. okt",
  },
]

/** Locked until Truls gets there. */
export const UPCOMING: { id: string; title: string; detail: string }[] = [
  {
    id: "lonn-nov",
    title: "Godkjenn lønn for november",
    detail: "Åpner 20. november",
  },
  {
    id: "arsregnskap",
    title: "Signer årsregnskap for 2025",
    detail: "Truls sender det i Altinn i januar",
  },
]

/** In Truls' hands: the customer sees it move, and does nothing. */
export const WITH_TRULS: { id: string; title: string; detail: string }[] = [
  {
    id: "kvitteringer",
    title: "Kvitteringer for oktober bokføres",
    detail: "128 av 129 · den siste venter på deg",
  },
]

// ── Lønn for oktober: what "Godkjenn lønn" opens ──

export type PayLine = {
  name: string
  role: string
  base: number
  commission: number
  /** Something Truls wants them to see before approving. */
  note?: string
  /** Started mid-month: paid for the working days from this one. */
  startDay?: number
}

/** October 2026 has 22 working days; from the 6th there are 19 left. */
export const WORKING_DAYS = 22
export function workingDaysFrom(day: number) {
  let n = 0
  for (let d = day; d <= 31; d++) {
    const w = new Date(2026, 9, d).getDay()
    if (w !== 0 && w !== 6) n++
  }
  return n
}

/** This month's pay for a line: the full base, or the days actually worked. */
export function grossFor(p: PayLine) {
  const base = p.startDay
    ? Math.round((p.base * workingDaysFrom(p.startDay)) / WORKING_DAYS)
    : p.base
  return base + p.commission
}

export const PAYROLL: PayLine[] = [
  { name: "Andrea Omdahl", role: "Daglig leder", base: 110_000, commission: 0 },
  {
    name: "Jonas Melby",
    role: "Seniorkonsulent",
    base: 82_000,
    commission: 23_000,
    note: "Provisjon Havlyst Q3",
  },
  {
    name: "Ida Strand",
    role: "Seniorkonsulent",
    base: 78_000,
    commission: 19_000,
  },
  { name: "Markus Lie", role: "Konsulent", base: 72_000, commission: 14_000 },
  { name: "Nora Ekeland", role: "Konsulent", base: 70_000, commission: 11_000 },
  {
    name: "Henrik Dahl",
    role: "Konsulent",
    base: 68_000,
    commission: 0,
    note: "50 % sykmeldt fra 6. okt · NAV fra dag 17",
  },
  {
    name: "Amalie Voss",
    role: "Konsulent",
    base: 65_000,
    commission: 0,
    startDay: 6,
    note: "Fra 6. okt",
  },
]

export function payrollTotal() {
  return PAYROLL.reduce((sum, p) => sum + grossFor(p), 0)
}

// ── Status for oktober: what Sanna has already done ──

export type StatusLine = {
  label: string
  value: string
  done: boolean
}

export const STATUS: StatusLine[] = [
  { label: "Kvitteringer bokført", value: "128 av 129", done: false },
  { label: "Bank avstemt", value: "Ferdig", done: true },
  { label: "MVA-melding", value: "Levert 10. okt", done: true },
  { label: "Lønnskjøring", value: "Venter på deg", done: false },
]

// ── Tallene: September 2026 is the last closed month ──

export const REPORT_MONTH = "September 2026"

export type Stat = {
  label: string
  value: number
  /** The line under the number: change or a note. */
  hint: string
  tone?: "positive" | "warning" | "neutral"
}

export const STATS: Stat[] = [
  {
    label: "Omsetning",
    value: 1_284_000,
    hint: "+12 % fra august",
    tone: "positive",
  },
  {
    label: "Lønnskostnader",
    value: 612_000,
    hint: "+64 000 · ny konsulent",
    tone: "neutral",
  },
  {
    label: "Utestående",
    value: 412_000,
    hint: "2 fakturaer over 30 dager",
    tone: "warning",
  },
]

/** Truls' two sentences about the month, as on the website. */
export const SUMMARY = [
  "Omsetningen var 1 284 000 kr, 12 % høyere enn i august. Økningen kommer fra to nye kunder.",
  "Lønnskostnadene økte med 64 000 kr fordi en ny konsulent startet 1. september.",
]

// ── Booket mot fakturert, per måned (kr) ──

export type MonthRow = {
  month: string
  /** Contracted work for the month: signed engagements and retainers. */
  booket: number
  /** What was actually invoiced. Undefined for months not yet invoiced. */
  fakturert?: number
}

export const MONTHS: MonthRow[] = [
  { month: "Jan", booket: 1_050_000, fakturert: 1_012_000 },
  { month: "Feb", booket: 1_080_000, fakturert: 1_064_000 },
  { month: "Mar", booket: 1_150_000, fakturert: 1_188_000 },
  { month: "Apr", booket: 1_120_000, fakturert: 1_071_000 },
  { month: "Mai", booket: 1_180_000, fakturert: 1_142_000 },
  { month: "Jun", booket: 1_210_000, fakturert: 1_236_000 },
  { month: "Jul", booket: 780_000, fakturert: 742_000 },
  { month: "Aug", booket: 1_130_000, fakturert: 1_146_000 },
  { month: "Sep", booket: 1_240_000, fakturert: 1_284_000 },
  { month: "Okt", booket: 1_310_000 },
  { month: "Nov", booket: 1_290_000 },
  { month: "Des", booket: 960_000 },
]

/** The year's revenue goal, agreed with Truls in January. */
export const GOAL_2026 = 13_500_000

export function invoicedYtd() {
  return MONTHS.reduce((sum, m) => sum + (m.fakturert ?? 0), 0)
}

/** Booked for the months not invoiced yet: what the rest of the year holds. */
export function bookedAhead() {
  return MONTHS.filter((m) => m.fakturert === undefined).reduce(
    (sum, m) => sum + m.booket,
    0,
  )
}

// ── Belegg per konsulent, september ──

export type Consultant = {
  name: string
  /** Billable share of available hours, in percent. */
  utilization: number
  /** Started this year, so a lower number is expected. */
  isNew?: boolean
}

export const UTILIZATION_TARGET = 80

export const CONSULTANTS: Consultant[] = [
  { name: "Jonas Melby", utilization: 92 },
  { name: "Ida Strand", utilization: 88 },
  { name: "Markus Lie", utilization: 84 },
  { name: "Nora Ekeland", utilization: 81 },
  { name: "Henrik Dahl", utilization: 74 },
  { name: "Amalie Voss", utilization: 61 },
  { name: "Andrea Omdahl", utilization: 38 },
]

// ── Frister: our dates, with the one worth a heads-up ──

export type DeadlineStatus = "done" | "you" | "truls" | "planned"

export type Deadline = {
  date: string
  label: string
  status: DeadlineStatus
  /** A short reason it matters, only when it does. */
  note?: string
  warn?: boolean
}

/** The month's dates, and the first ones after it. */
export const DEADLINES: { month: string; items: Deadline[] }[] = [
  {
    month: "Oktober",
    items: [
      { date: "2026-10-10", label: "MVA-melding", status: "done" },
      { date: "2026-10-23", label: "Godkjenn lønn", status: "you" },
      { date: "2026-10-25", label: "Lønn betales", status: "truls" },
      { date: "2026-10-31", label: "Oktober lukkes", status: "truls" },
    ],
  },
  {
    month: "November",
    items: [
      { date: "2026-11-05", label: "A-melding", status: "planned" },
      {
        date: "2026-11-16",
        label: "Arbeidsgiveravgift",
        status: "planned",
        note: "136 400 kr. Truls flytter penger fra sparekontoen i tide.",
        warn: true,
      },
    ],
  },
]

export const DEADLINE_STATUS: Record<DeadlineStatus, string> = {
  done: "Ferdig",
  you: "Venter på deg",
  truls: "Truls",
  planned: "Planlagt",
}

// ── Flags on September: a few things worth a look, each closable ──

export type Flag = {
  id: string
  title: string
  detail: string
  /** The question to Truls the flag pre-writes, if it has one. */
  ask?: string
  /** The software flag opens a breakdown instead. */
  expands?: boolean
  /** A money flag links to the bank. */
  bank?: boolean
}

export const FLAGS: Flag[] = [
  {
    id: "likviditet",
    title: "Ikke nok til husleien 25. oktober",
    detail:
      "Etter lønn 25. oktober står det 162 000 kr på driftskontoen, og husleien 1. november er 184 000 kr. Overfør 25 000 kr fra sparekontoen før 1. november.",
    ask: "Hei Truls! Kan du flytte 25 000 kr fra sparekontoen til drift før husleien 1. november?",
    bank: true,
  },
  {
    id: "programvare",
    title: "Programvare økte 20 % siden august",
    detail: "38 300 kr i september, 6 400 kr mer. Det meste er Claude.",
    expands: true,
  },
]

// ── The closed months: the figures the pane shows for each ──

export type MonthReport = {
  id: string
  label: string
  /** When Truls closed the month and wrote it up. */
  prepared: string
  /** The date the figures are per. */
  asOf: string
  /** Truls' summary, two or three sentences. */
  summary: string[]
  tiles: {
    label: string
    value: string
    hint: string
    tone?: "positive" | "warning" | "neutral"
  }[]
  kpis: { label: string; value: string; hint: string }[]
}

export const MONTH_REPORTS: MonthReport[] = [
  {
    id: "2026-09",
    label: "September 2026",
    prepared: "8. oktober 2026",
    asOf: "30. september 2026",
    summary: [
      "Omsetningen endte på 1 284 000 kr, 12 % høyere enn i august. Økningen kommer fra to nye kunder, Nordvik Energi og Solberg Bygg.",
      "Lønnskostnadene økte med 64 000 kr fordi Nora startet 1. september. Resultatet ble 318 000 kr, 25 % margin.",
      "Programvare har økt 20 % siden august, i hovedsak Claude.",
    ],
    tiles: [
      {
        label: "Omsetning",
        value: "1 284 000",
        hint: "+12 % fra august",
        tone: "positive",
      },
      {
        label: "Lønnskostnader",
        value: "612 000",
        hint: "+64 000 · ny konsulent",
        tone: "neutral",
      },
      {
        label: "Utestående",
        value: "412 000",
        hint: "Truls følger opp",
        tone: "neutral",
      },
      {
        label: "På konto",
        value: "774 000",
        hint: "162 000 etter lønn 25. okt",
        tone: "neutral",
      },
    ],
    kpis: [
      {
        label: "Resultat",
        value: "318 000",
        hint: "25 % margin · +3 % mot mål",
      },
      { label: "Snitt timepris", value: "1 450 kr", hint: "+50 kr fra august" },
      {
        label: "Omsetning per konsulent",
        value: "214 000",
        hint: "+9 % fra september i fjor",
      },
      {
        label: "Snitt prosjektverdi",
        value: "386 000",
        hint: "+14 % fra i fjor",
      },
    ],
  },
  {
    id: "2026-08",
    label: "August 2026",
    prepared: "9. september 2026",
    asOf: "31. august 2026",
    summary: [
      "Omsetningen tok seg opp etter ferien og endte på 1 146 000 kr, 54 % over juli.",
      "Ingen endringer i lønn. Alle kundefordringer er innenfor fristen, og resultatet ble 262 000 kr.",
    ],
    tiles: [
      {
        label: "Omsetning",
        value: "1 146 000",
        hint: "+54 % fra juli (ferie)",
        tone: "positive",
      },
      {
        label: "Lønnskostnader",
        value: "548 000",
        hint: "uendret fra juli",
        tone: "neutral",
      },
      {
        label: "Utestående",
        value: "356 000",
        hint: "alt innenfor fristen",
        tone: "positive",
      },
      {
        label: "På konto",
        value: "912 000",
        hint: "ved utgangen av måneden",
        tone: "neutral",
      },
    ],
    kpis: [
      { label: "Resultat", value: "262 000", hint: "23 % margin · mål 22 %" },
      { label: "Snitt timepris", value: "1 400 kr", hint: "uendret fra juli" },
      {
        label: "Omsetning per konsulent",
        value: "229 000",
        hint: "+6 % fra august i fjor",
      },
      {
        label: "Snitt prosjektverdi",
        value: "372 000",
        hint: "+11 % fra i fjor",
      },
    ],
  },
  {
    id: "2026-07",
    label: "Juli 2026",
    prepared: "11. august 2026",
    asOf: "31. juli 2026",
    summary: [
      "Feriemåned: omsetningen endte på 742 000 kr, 40 % under juni, som planlagt.",
      "Feriepengene ble utbetalt i juni, så lønnskostnadene i juli er ordinære. Resultatet ble 41 000 kr.",
    ],
    tiles: [
      {
        label: "Omsetning",
        value: "742 000",
        hint: "−40 % fra juni · ferie",
        tone: "warning",
      },
      {
        label: "Lønnskostnader",
        value: "548 000",
        hint: "feriepenger utbetalt i juni",
        tone: "neutral",
      },
      {
        label: "Utestående",
        value: "298 000",
        hint: "alt innenfor fristen",
        tone: "positive",
      },
      {
        label: "På konto",
        value: "1 105 000",
        hint: "ved utgangen av måneden",
        tone: "neutral",
      },
    ],
    kpis: [
      { label: "Resultat", value: "41 000", hint: "6 % margin · ferie" },
      { label: "Snitt timepris", value: "1 400 kr", hint: "uendret" },
      {
        label: "Omsetning per konsulent",
        value: "148 000",
        hint: "−3 % fra juli i fjor",
      },
      {
        label: "Snitt prosjektverdi",
        value: "372 000",
        hint: "+11 % fra i fjor",
      },
    ],
  },
]

/** Consulting KPIs for the month, with what to compare against. */
export const KPIS: { label: string; value: string; hint: string }[] = [
  { label: "Resultat", value: "318 000", hint: "25 % margin · +3 % mot mål" },
  { label: "Snitt timepris", value: "1 450 kr", hint: "+50 kr fra august" },
  {
    label: "Omsetning per konsulent",
    value: "214 000",
    hint: "+9 % fra september i fjor",
  },
  {
    label: "Snitt prosjektverdi",
    value: "386 000",
    hint: "+14 % fra i fjor",
  },
]

// ── Største kunder: who the revenue comes from, against last year ──

export type TopClient = {
  name: string
  /** Invoiced January–September 2026. */
  ytd: number
  /** The same months last year; none for a new client. */
  lastYear?: number
}

export const TOP_CLIENTS: TopClient[] = [
  { name: "Havlyst AS", ytd: 2_940_000, lastYear: 2_410_000 },
  { name: "Brekke Consulting", ytd: 1_620_000, lastYear: 1_180_000 },
  { name: "Nordvik Energi", ytd: 1_350_000 },
  { name: "Tindra Helse", ytd: 1_120_000, lastYear: 1_290_000 },
  { name: "Solberg Bygg", ytd: 880_000 },
  { name: "Øvrige 9 kunder", ytd: 1_975_000, lastYear: 1_860_000 },
]

// ── Spør tallene: instant answers from the books ──

export const AI_STARTERS = [
  "Hvor mye har vi brukt på programvare i år?",
  "Hva står det på konto nå?",
  "Hvem skylder oss mest?",
]

const MONTH_NAMES = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
]

export const RECEIVABLES = [
  {
    name: "Havlyst AS",
    amount: 240_000,
    days: 41,
    note: "De har betalt den 28. hver måned i år.",
  },
  {
    name: "Brekke Consulting",
    amount: 172_000,
    days: 33,
    note: "Første gang de er sene.",
  },
]

export const BANK = {
  today: 774_000,
  afterPayroll: 162_000,
  savings: 1_450_000,
}

/** Answers from the books. Reads the question for a person, a vendor, a
    customer, a month or a subject, and answers from the same data the
    page shows. What it can't find, it says so, and hands to Truls. */
export function askNumbers(question: string): string {
  const q = question.toLowerCase()
  const has = (...words: string[]) => words.some((w) => q.includes(w))
  const first = (name: string) => name.split(" ")[0]

  // A person: their pay, their billable share, or both.
  const person = PAYROLL.find((p) => q.includes(first(p.name).toLowerCase()))
  if (person) {
    const pay = `${first(person.name)} har ${kr(person.base)} kr i fastlønn${
      person.commission
        ? ` og ${kr(person.commission)} kr i provisjon i oktober, ${kr(person.base + person.commission)} kr brutto`
        : " og ingen provisjon"
    }.${person.note ? ` ${person.note}.` : ""}`
    const c = CONSULTANTS.find((x) => x.name === person.name)
    const bill = c
      ? `Faktureringsgrad i september: ${c.utilization} %${c.utilization >= UTILIZATION_TARGET ? ", over målet" : ", under målet på 80 %"}.`
      : ""
    if (has("lønn", "tjener", "provisjon", "brutto")) return pay
    if (has("faktur", "belegg", "timer", "utnytt")) return bill || pay
    return `${pay} ${bill}`.trim()
  }

  // A vendor.
  const vendor = SOFTWARE.find((l) =>
    l.name
      .toLowerCase()
      .split(/[ (]/)
      .some((w) => w && q.includes(w.replace(")", ""))),
  )
  if (vendor) {
    const diff = vendor.sep - vendor.aug
    return `${vendor.name} kostet ${kr(vendor.sep)} kr i september, ${
      diff > 0
        ? `${kr(diff)} kr mer enn`
        : diff < 0
          ? `${kr(-diff)} kr mindre enn`
          : "det samme som"
    } i august. Det bokføres på 6420 Programvare.`
  }

  // A customer.
  const customer = RECEIVABLES.find((r) =>
    q.includes(first(r.name).toLowerCase()),
  )
  if (customer)
    return `${customer.name} skylder ${kr(customer.amount)} kr. Fakturaen er ${customer.days} dager gammel. ${customer.note}`

  // A month.
  const monthIdx = MONTH_NAMES.findIndex((m) => q.includes(m))
  if (
    monthIdx >= 0 &&
    has("omsetning", "fakturer", "booket", "inntekt", "solgte", "tjente")
  ) {
    const m = MONTHS[monthIdx]
    return m.fakturert !== undefined
      ? `I ${MONTH_NAMES[monthIdx]} fakturerte dere ${kr(m.fakturert)} kr, mot ${kr(m.booket)} kr booket.`
      : `${MONTH_NAMES[monthIdx][0].toUpperCase()}${MONTH_NAMES[monthIdx].slice(1)} er ikke fakturert ennå. Det er booket ${kr(m.booket)} kr.`
  }

  if (has("hvor mange ansatte", "antall ansatte", "ansatte har"))
    return `7 ansatte: deg og 6 konsulenter. Amalie startet 6. oktober, Henrik er 50 % sykmeldt.`
  if (has("programvare", "software", "verktøy", "lisens")) {
    const { sep, change } = softwareTotals()
    const top = [...SOFTWARE].sort((a, b) => b.sep - a.sep).slice(0, 3)
    return `${kr(sep)} kr i september, ${Math.round(change * 100)} % mer enn i august. Størst er ${top.map((l) => `${l.name} ${kr(l.sep)}`).join(", ")}. Hittil i år: 184 300 kr.`
  }
  if (has("skylder", "utestående", "forfalt", "purring", "ubetalt"))
    return `Utestående er 412 000 kr. Over 30 dager: ${RECEIVABLES.map((r) => `${r.name} ${kr(r.amount)} kr (${r.days} dager)`).join(" og ")}. Resten er innenfor fristen.`
  if (has("konto", "bank", "saldo", "likvid", "penger", "kontant"))
    return `${kr(BANK.today)} kr på driftskontoen og ${kr(BANK.savings)} kr på sparekontoen. Etter lønn 25. oktober står det ${kr(BANK.afterPayroll)} kr på drift, så husleien 1. november trenger 25 000 kr fra sparekontoen.`
  if (has("husleie", "leie"))
    return `Husleien er 184 000 kr i måneden og forfaller den 1. Neste er 1. november.`
  if (has("mål", "budsjett", "lander")) {
    const landing = invoicedYtd() + bookedAhead()
    return `${mnok(invoicedYtd())} fakturert til og med september. Med det som er booket ut året lander dere på ${mnok(landing)}, ${kr(GOAL_2026 - landing)} kr under målet på ${mnok(GOAL_2026)}.`
  }
  if (has("timepris"))
    return `Snitt timepris i september var 1 450 kr, 50 kr opp fra august. Jonas ligger høyest med 1 650 kr, Amalie lavest med 1 100 kr.`
  if (has("resultat", "margin", "overskudd", "tjener vi"))
    return `Resultatet i september var 318 000 kr, 25 % margin. Målet er 22 %. Hittil i år: 2,4 MNOK.`
  if (has("faktureringsgrad", "belegg", "utnyttelse"))
    return `September: ${CONSULTANTS.filter((c) => c.name !== CONTACT.name)
      .map((c) => `${first(c.name)} ${c.utilization} %`)
      .join(", ")}. Målet er ${UTILIZATION_TARGET} %.`
  if (has("omsetning", "inntekt", "fakturert", "solgte"))
    return `Omsetningen i september var 1 284 000 kr, 12 % opp fra august. Hittil i år ${mnok(invoicedYtd())}.`
  if (has("lønn", "lønnskostnad"))
    return `Lønn i oktober er ${kr(payrollTotal())} kr brutto for 7 ansatte, utbetales 25. oktober. Lønnskostnadene i september var 612 000 kr, 64 000 mer enn i august fordi Nora startet 1. september.`
  if (
    has(
      "frist",
      "forfall",
      "mva",
      "a-melding",
      "arbeidsgiveravgift",
      "aga",
      "skatt",
    )
  )
    return `Neste frister: 23. oktober godkjenn lønn, 25. oktober lønn betales, 31. oktober oktober lukkes, 5. november a-melding, 16. november arbeidsgiveravgift 136 400 kr, 10. desember MVA-melding.`
  if (has("utbytte"))
    return `Fri egenkapital per september er 2,1 MNOK, så det er rom for utbytte. Beløpet bestemmer dere, Truls lager styrevedtaket.`
  if (has("kunder", "kunde"))
    return `Dere har 14 aktive kunder. Havlyst AS er størst med 2,9 MNOK hittil i år, så Brekke Consulting med 1,6 MNOK.`
  return "Det fant jeg ikke i tallene. Spør Truls, så svarer han i løpet av dagen."
}

// ── Insight: software costs ──

export type SoftwareLine = { name: string; aug: number; sep: number }

export const SOFTWARE: SoftwareLine[] = [
  { name: "Anthropic (Claude)", aug: 9_800, sep: 13_600 },
  { name: "Figma", aug: 8_400, sep: 8_400 },
  { name: "OpenAI", aug: 5_100, sep: 6_900 },
  { name: "Slack", aug: 4_100, sep: 4_100 },
  { name: "Notion", aug: 2_400, sep: 3_200 },
  { name: "Linear", aug: 2_100, sep: 2_100 },
]

export function softwareTotals() {
  const aug = SOFTWARE.reduce((s, l) => s + l.aug, 0)
  const sep = SOFTWARE.reduce((s, l) => s + l.sep, 0)
  return { aug, sep, change: (sep - aug) / aug }
}

// ── Reading an uploaded document ──

export type Recognised = {
  supplier: string
  what: string
  amount: number
  date: string
  account: string
  tag: string
  comment: string
}

/** Suppliers the demo recognises from the file name or the PDF's text.
    Anything else plays the Norwegian receipt, the walk-through document. */
export const SUPPLIERS: { keys: string[]; result: Recognised }[] = [
  {
    keys: ["proshop", "1938014", "viewfinity"],
    result: {
      supplier: "Proshop AS",
      what: '2 × Samsung ViewFinity S6 34" skjermer, faktura 1938014',
      amount: 7_472,
      date: "2026-09-03",
      account: "6540 Inventar og utstyr",
      tag: "Kontorutstyr",
      comment: "To skjermer til kontoret",
    },
  },
  {
    keys: ["norwegian", "y3fjnm", "kjøpskvittering", "flypris"],
    result: {
      supplier: "Norwegian Air Shuttle",
      what: "Flybillett Pristina–Oslo t/r, 26. sep–3. okt",
      amount: 4_513,
      date: "2026-09-11",
      account: "7140 Reisekostnad",
      tag: "Reise",
      comment: `Reise ${CONTACT.first}`,
    },
  },
  {
    keys: ["figma"],
    result: {
      supplier: "Figma",
      what: "Professional, 4 seter, oktober",
      amount: 8_400,
      date: "2026-10-01",
      account: "6420 Programvare",
      tag: "Programvare",
      comment: "Designverktøy, månedlig",
    },
  },
  {
    keys: ["anthropic", "claude"],
    result: {
      supplier: "Anthropic",
      what: "Claude Team, oktober",
      amount: 14_200,
      date: "2026-10-02",
      account: "6420 Programvare",
      tag: "Programvare",
      comment: "KI-verktøy, månedlig",
    },
  },
  {
    keys: ["vipps"],
    result: {
      supplier: "Vipps",
      what: "Lunsj med konsulentgruppen",
      amount: 890,
      date: "2026-10-21",
      account: "7350 Representasjon",
      tag: "Mat",
      comment: "Lunsj, konsulentgruppen",
    },
  },
]

/** The steps the reader shows while it works, in order. */
export const READ_STEPS = [
  "Leser dokumentet",
  "Finner leverandør og beløp",
  "Foreslår konto og merkelapp",
]

// ── Chat with Truls ──

export type Message = {
  id: string
  from: "you" | "truls"
  text: string
  /** "I dag 09:12" */
  at: string
}

export const CHAT: Message[] = [
  {
    id: "m1",
    from: "you",
    text: "Hei! Kan vi kjøre bonus med lønn i november?",
    at: "Mandag 14:02",
  },
  {
    id: "m2",
    from: "truls",
    text: "Ja, det fikser vi. Send meg beløpene, så tar jeg det med.",
    at: "Mandag 14:20",
  },
]

export type ThreadStatus = "open" | "resolved" | "ai"

export type Thread = {
  id: string
  title: string
  status: ThreadStatus
  /** "I dag", "12. sep" */
  updated: string
  messages: Message[]
}

/** Every conversation with Truls, newest first. Resolved ones are kept:
    what was asked and what was decided, for the next time it comes up. */
export const THREADS: Thread[] = [
  {
    id: "okt",
    title: "Oktober",
    status: "open",
    updated: "I dag",
    messages: CHAT,
  },
  {
    id: "sanna",
    title: "Sanna (KI)",
    status: "ai",
    updated: "Svarer med en gang",
    messages: [],
  },
  {
    id: "firmabil",
    title: "Firmabil til Jonas",
    status: "open",
    updated: "3. okt",
    messages: [
      {
        id: "f1",
        from: "you",
        text: "Jonas vil ha firmabil. Lønner det seg for oss?",
        at: "3. okt 09:10",
      },
      {
        id: "f2",
        from: "truls",
        text: "Sjelden for en konsulent som kjører lite. Jeg regner på elbil mot kjøregodtgjørelse og kommer tilbake med tall.",
        at: "3. okt 11:42",
      },
    ],
  },
  {
    id: "mva-aug",
    title: "MVA-melding juli–august",
    status: "resolved",
    updated: "8. okt",
    messages: [
      {
        id: "m1",
        from: "truls",
        text: "MVA for juli–august: 318 400 kr å betale, forfall 10. oktober. Grunnlaget ligger i Tripletex. Ok?",
        at: "7. okt 15:02",
      },
      { id: "m2", from: "you", text: "Ja", at: "7. okt 15:30" },
      {
        id: "m3",
        from: "truls",
        text: "Levert. Betalingen går fra driftskontoen 10. oktober.",
        at: "8. okt 08:15",
      },
    ],
  },
  {
    id: "kapital",
    title: "Kapitalforhøyelse",
    status: "resolved",
    updated: "12. sep",
    messages: [
      {
        id: "k1",
        from: "you",
        text: "Vi henter 2 MNOK fra en investor i Q4. Hva må vi gjøre?",
        at: "28. aug 10:20",
      },
      {
        id: "k2",
        from: "truls",
        text: "Styrevedtak, generalforsamlingsprotokoll og melding til Foretaksregisteret. Jeg lager utkastene, dere signerer i Altinn. Regn med to uker.",
        at: "28. aug 13:05",
      },
      { id: "k3", from: "you", text: "Supert, kjør på.", at: "28. aug 13:20" },
      {
        id: "k4",
        from: "truls",
        text: "Registrert i Brønnøysund i dag. Aksjekapitalen er oppdatert i regnskapet.",
        at: "12. sep 14:48",
      },
    ],
  },
]

/** Where documents can come from, besides a drop. */
export const SOURCES = ["Gmail", "Outlook", "Google Drive", "Claude", "ChatGPT"]

/** The same, when the Nordic Cloud question was already answered on the timeline. */
export const LIVE_MESSAGE_SETTLED =
  "Hei Andrea! September er lukket. Omsetningen endte på 1 284 000 kr, 12 % opp fra august, mest fra to nye kunder. Lønn økte 64 000 fordi Nora startet 1. september. Nordic Cloud-lisensen tar jeg slik du svarte."

/** Lands when Meldinger is opened: September is closed, with one question. */
export const LIVE_MESSAGE =
  "Hei Andrea! September er lukket. Omsetningen endte på 1 284 000 kr, 12 % opp fra august, mest fra to nye kunder. Lønn økte 64 000 fordi Nora startet 1. september. Skal jeg fordele Nordic Cloud-lisensen over året?"

/** Things people ask Truls, as one-tap starters in the chat. */
export const STARTERS = [
  "Hvor mye har vi brukt på programvare i år?",
  "Kan vi ta ut utbytte i desember?",
  "Hva koster en ny konsulent oss per måned?",
]

// ── Formatting ──

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

/** "1 284 000" */
export function kr(value: number) {
  return nok.format(value)
}

/** "1,28 MNOK" for headline numbers. */
export function mnok(value: number) {
  return `${(value / 1_000_000).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MNOK`
}

const DAY = 86_400_000

export function daysFrom(iso: string, from = TODAY) {
  return Math.round((Date.parse(iso) - Date.parse(from)) / DAY)
}

const shortDay = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
})

/** "23. okt" */
export function dayLabel(iso: string) {
  return shortDay.format(new Date(`${iso}T00:00:00`)).replace(/\.$/, "")
}

/** "om 2 dager", "i morgen", "i dag", "3 dager siden" */
export function relative(iso: string) {
  const d = daysFrom(iso)
  if (d < -1) return `${-d} dager siden`
  if (d === -1) return "i går"
  if (d === 0) return "i dag"
  if (d === 1) return "i morgen"
  return `om ${d} dager`
}

// ── Everything the model is given when it answers for Sanna or Truls ──

/** The whole dummy ledger as one object, for the system prompt. */
export function ledgerForModel() {
  return {
    today: TODAY,
    firm: FIRM,
    contact: CONTACT,
    accountant: ACCOUNTANT,
    openTasks: TODOS,
    doneTasks: DONE,
    withAccountant: WITH_TRULS,
    upcoming: UPCOMING,
    payrollOctober: PAYROLL.map((p) => ({ ...p, grossThisMonth: grossFor(p) })),
    payrollOctoberTotal: payrollTotal(),
    consultantsBillableShareSeptember: CONSULTANTS,
    billableTarget: UTILIZATION_TARGET,
    revenueByMonth2026: MONTHS,
    revenueGoal2026: GOAL_2026,
    invoicedYtd: invoicedYtd(),
    bookedAhead: bookedAhead(),
    topClientsYtd: TOP_CLIENTS,
    receivablesOver30Days: RECEIVABLES,
    bank: BANK,
    softwareAugSep: SOFTWARE,
    deadlines: DEADLINES,
    flags: FLAGS,
    monthReports: MONTH_REPORTS,
    earlierConversations: THREADS.filter((t) => t.status !== "ai"),
  }
}
