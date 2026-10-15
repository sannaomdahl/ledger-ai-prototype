// The monthly report a customer gets once their month is closed: sales,
// costs, profit and cash in words a business owner uses, plus what the agent
// noticed. Tripletex holds the real ledger; here the figures are generated
// per client and month (deterministically, so every render agrees) from the
// client's size, industry and season.
import { bankAt } from "./balance"
import { CLIENT_BY_ID, MONTHS, monthName, nextMonth } from "./data"
import type { Client, IndustryKey, ReviewItem } from "./types"

// ── Closed months ──

/** What the accountant sent when they closed a month for a client. */
export type MonthCloseRecord = {
  closedAt: string
  /** The accountant's note at the top of the report. */
  note: string
}

/** Keyed by `closeKey(clientId, month)`. */
export type Closing = Record<string, MonthCloseRecord>

export function closeKey(clientId: string, month: string) {
  return `${clientId}:${month}`
}

// ── Figures ──

type Profile = {
  /** Sales by calendar month, 1 = an average month. */
  season: number[]
  /** Shares of an average month's sales. */
  goods: number
  staff: number
  rent: number
  other: number
  /** What "goods" means for this business, in the owner's words. */
  goodsLabel: string
  /** Card sales over the counter, or invoices to customers. */
  sales: "pos" | "invoices"
  /** Average ticket (pos) or invoice (invoices), kr. */
  ticket: number
  /** Share of sales that carries VAT, and at what blended rate. */
  vatShare: number
  vatRate: number
  /** Share of purchases whose VAT is deducted, when it differs from
      `vatShare`: exports are zero-rated but still deduct input VAT. */
  inputShare?: number
}

const FLAT = [0.94, 0.96, 1.02, 1, 1.02, 1.04, 0.86, 0.96, 1.06, 1.06, 1.04, 1.04]
const SUMMER = [0.8, 0.8, 0.9, 0.95, 1.05, 1.15, 1.25, 1.2, 1.05, 0.95, 0.9, 1]

const PROFILES: Record<IndustryKey, Profile> = {
  cafe: { season: SUMMER, goods: 0.31, staff: 0.36, rent: 0.09, other: 0.13, goodsLabel: "Coffee, food & drink", sales: "pos", ticket: 118, vatShare: 1, vatRate: 0.2 },
  deli: { season: SUMMER, goods: 0.38, staff: 0.3, rent: 0.08, other: 0.12, goodsLabel: "Food supplies", sales: "pos", ticket: 164, vatShare: 1, vatRate: 0.18 },
  design: { season: FLAT, goods: 0.12, staff: 0.54, rent: 0.07, other: 0.15, goodsLabel: "Freelancers & software", sales: "invoices", ticket: 48_000, vatShare: 1, vatRate: 0.25 },
  construction: { season: [0.7, 0.75, 0.95, 1.05, 1.15, 1.15, 0.8, 1.1, 1.15, 1.1, 1.05, 1.05], goods: 0.34, staff: 0.4, rent: 0.04, other: 0.12, goodsLabel: "Building materials", sales: "invoices", ticket: 86_000, vatShare: 1, vatRate: 0.25 },
  seafood: { season: [1.1, 1, 1, 0.95, 0.9, 0.85, 0.8, 0.92, 1, 1.08, 1.15, 1.2], goods: 0.66, staff: 0.15, rent: 0.03, other: 0.08, goodsLabel: "Fish from suppliers", sales: "invoices", ticket: 124_000, vatShare: 0.3, vatRate: 0.15, inputShare: 0.8 },
  dental: { season: FLAT, goods: 0.1, staff: 0.52, rent: 0.09, other: 0.14, goodsLabel: "Clinical supplies", sales: "pos", ticket: 1_450, vatShare: 0.1, vatRate: 0.25 },
  climbing: { season: [1.2, 1.15, 1.1, 1, 0.85, 0.7, 0.6, 0.75, 1.05, 1.15, 1.2, 1.25], goods: 0.08, staff: 0.38, rent: 0.24, other: 0.14, goodsLabel: "Shop stock", sales: "pos", ticket: 390, vatShare: 1, vatRate: 0.2 },
  law: { season: FLAT, goods: 0.03, staff: 0.6, rent: 0.1, other: 0.12, goodsLabel: "Court fees & outlays", sales: "invoices", ticket: 62_000, vatShare: 1, vatRate: 0.25 },
  it: { season: FLAT, goods: 0.18, staff: 0.52, rent: 0.05, other: 0.12, goodsLabel: "Hardware & licences", sales: "invoices", ticket: 54_000, vatShare: 1, vatRate: 0.25 },
  salon: { season: [0.85, 0.85, 0.95, 1, 1.05, 1.15, 0.8, 0.95, 1.05, 1.05, 1.1, 1.2], goods: 0.14, staff: 0.46, rent: 0.12, other: 0.14, goodsLabel: "Hair products", sales: "pos", ticket: 780, vatShare: 1, vatRate: 0.25 },
  bikes: { season: [0.4, 0.5, 0.9, 1.4, 1.6, 1.6, 1.5, 1.3, 1, 0.7, 0.5, 0.6], goods: 0.44, staff: 0.26, rent: 0.1, other: 0.1, goodsLabel: "Bikes & parts", sales: "pos", ticket: 2_350, vatShare: 1, vatRate: 0.25 },
  plumbing: { season: FLAT, goods: 0.3, staff: 0.42, rent: 0.04, other: 0.13, goodsLabel: "Pipes & fittings", sales: "invoices", ticket: 21_000, vatShare: 1, vatRate: 0.25 },
  hotel: { season: [0.7, 0.75, 0.85, 0.9, 1.05, 1.3, 1.45, 1.35, 1.05, 0.9, 0.8, 0.9], goods: 0.2, staff: 0.38, rent: 0.16, other: 0.14, goodsLabel: "Food, drink & linen", sales: "pos", ticket: 1_640, vatShare: 1, vatRate: 0.13 },
  kindergarten: { season: [1, 1, 1, 1, 1, 1, 0.9, 1, 1.02, 1.02, 1.02, 1.02], goods: 0.08, staff: 0.72, rent: 0.1, other: 0.06, goodsLabel: "Food & play materials", sales: "invoices", ticket: 3_400, vatShare: 0, vatRate: 0 },
  architecture: { season: FLAT, goods: 0.08, staff: 0.6, rent: 0.08, other: 0.13, goodsLabel: "Consultants & prints", sales: "invoices", ticket: 71_000, vatShare: 1, vatRate: 0.25 },
  logistics: { season: FLAT, goods: 0.36, staff: 0.38, rent: 0.05, other: 0.12, goodsLabel: "Fuel & tolls", sales: "invoices", ticket: 38_000, vatShare: 1, vatRate: 0.25 },
}

function hash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A stable wobble in [-spread, spread]. */
function wobble(seed: string, spread: number) {
  return ((hash(seed) % 2001) / 1000 - 1) * spread
}

function prevMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

/** The last `count` months up to and including `month`, oldest first. */
export function monthsUpTo(month: string, count: number) {
  const out = [month]
  while (out.length < count) out.unshift(prevMonth(out[0]))
  return out
}

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTH_SHORT = MONTH_LONG.map((m) => m.slice(0, 3))

export function longMonth(period: string) {
  return MONTH_LONG[Number(period.slice(5)) - 1]
}

export function shortMonth(period: string) {
  return MONTH_SHORT[Number(period.slice(5)) - 1] ?? monthName(period)
}

function round(value: number, to = 100) {
  return Math.round(value / to) * to
}

export type Costs = {
  staff: number
  goods: number
  rent: number
  other: number
}

export type MonthFigures = {
  month: string
  sales: number
  costs: Costs
  totalCosts: number
  profit: number
  /** Profit as a share of sales. */
  margin: number
  cash: number
}

/** One average month's sales for the client. */
function baseSales(client: Client) {
  return client.profile.revenueLastYear / 12
}

const OTHER_EXTRA = 0.05

/** Sales and costs for a month, before cash. The balance sheet builds on
    these too, and the bank balance comes out of it. */
export function core(client: Client, month: string) {
  const p = PROFILES[client.industryKey]
  const base = baseSales(client)
  const seed = `${client.id}-${month}`
  // Last year's revenue grows into this year at a client-specific pace.
  const growth = 1 + ((hash(client.orgNo) % 15) - 4) / 100
  const season = p.season[Number(month.slice(5)) - 1]
  const sales = round(base * growth * season * (1 + wobble(`${seed}-s`, 0.05)))
  // Fixed costs grow with the business, not with the season. OTHER_EXTRA
  // covers what the profiles leave out (insurance, accounting, bank, cars)
  // and brings an average month to the 5–8% margin a Norwegian SMB runs at.
  const fixed = base * growth
  const costs: Costs = {
    goods: round(sales * p.goods * (1 + wobble(`${seed}-g`, 0.06))),
    // Salaries follow headcount, not the season. July pays holiday pay
    // instead of salary, so the staff line dips.
    staff: round(
      fixed * p.staff * (month.endsWith("-07") ? 0.72 : 1) * (1 + wobble(`${seed}-p`, 0.02))
    ),
    rent: round(fixed * p.rent),
    other: round(fixed * (p.other + OTHER_EXTRA) * (1 + wobble(`${seed}-o`, 0.1))),
  }
  const totalCosts = costs.goods + costs.staff + costs.rent + costs.other
  return { sales, costs, totalCosts, profit: sales - totalCosts }
}

export function figuresFor(client: Client, month: string): MonthFigures {
  const f = core(client, month)
  return {
    month,
    ...f,
    margin: f.sales ? f.profit / f.sales : 0,
    cash: cashAt(client, month),
  }
}

/** Money in the bank at month end: what is left once the balance sheet
    has placed everything else (see balance.ts). */
function cashAt(client: Client, month: string): number {
  return bankAt(client, month)
}

/** Customers' unpaid invoices at month end; card sales take two days to
    settle. The report's "outstanding" and the balance sheet's 1500. */
export function receivablesAt(client: Client, month: string) {
  const sales = core(client, month).sales
  if (PROFILES[client.industryKey].sales === "pos") return round(sales / 15)
  return round(sales * (0.45 + wobble(`${client.id}-${month}-ar`, 0.1)), 1000)
}

/** Opening cash for the year, before the balance sheet took over: about a
    month and a bit of sales. The ledger starts January from here. */
export function startingCash(client: Client) {
  return baseSales(client) * 1.1 * (1 + wobble(`${client.id}-cash`, 0.3))
}

/** What "goods" means for this business, in the owner's words. */
export function goodsLabel(client: Client) {
  return PROFILES[client.industryKey].goodsLabel
}

/** How VAT works for this business: the share of sales that carries it, at
    what blended rate, and the share of purchases it is deducted on. */
export function vatProfile(client: Client) {
  const p = PROFILES[client.industryKey]
  return { share: p.vatShare, rate: p.vatRate, inputShare: p.inputShare ?? p.vatShare, exports: p.inputShare !== undefined }
}

/** The advance tax instalment the monthly report plans for. */
export function advanceTax(client: Client) {
  return round(baseSales(client) * 12 * 0.08 * 0.22 / 4, 1000)
}

export function salesKind(client: Client) {
  return PROFILES[client.industryKey].sales
}

// ── The report ──

export type CostLine = { key: keyof Costs; label: string; amount: number; share: number }

export type SalesDetail =
  | { kind: "pos"; transactions: number; averageTicket: number }
  | {
      kind: "invoices"
      sent: number
      /** Still unpaid at month end. */
      outstanding: number
      overdue: { count: number; amount: number }
    }

export type UpcomingPayment = {
  label: string
  /** ISO date. */
  date: string
  amount: number
  hint: string
}

export type Highlight = {
  tone: "good" | "watch" | "neutral"
  text: string
}

export type MonthlyReport = {
  client: Client
  month: string
  label: string
  current: MonthFigures
  previous: MonthFigures
  /** Six months ending with this one, for the trend. */
  trend: MonthFigures[]
  costs: CostLine[]
  salesDetail: SalesDetail
  payroll: { people: number; amount: number; paidOn: string }
  upcoming: UpcomingPayment[]
  highlights: Highlight[]
}

function day(period: string, d: number) {
  return `${period}-${String(d).padStart(2, "0")}`
}

/** VAT on a stretch of months: output on sales minus input on purchases.
    The VAT returns on the Filings tab use it too. */
export function vatFor(client: Client, months: string[]) {
  const p = PROFILES[client.industryKey]
  return months.reduce((sum, m) => {
    const f = core(client, m)
    const output = f.sales * p.vatShare * p.vatRate
    const input = (f.costs.goods + f.costs.other) * 0.2 * (p.inputShare ?? p.vatShare)
    return sum + output - input
  }, 0)
}

/** What leaves the account soon after this month, so the owner can plan. */
function upcomingAfter(client: Client, month: string, current: MonthFigures): UpcomingPayment[] {
  const out: UpcomingPayment[] = []
  const next = nextMonth(month)
  const payDay = Number(client.payDate.split(" ")[0])
  if (client.employees > 0) {
    out.push({
      label: "Salaries",
      date: day(next, payDay),
      amount: round(current.costs.staff * 0.72, 1000),
      hint: `${client.employees} people, after tax`,
    })
  }
  const p = PROFILES[client.industryKey]
  if (p.vatShare > 0) {
    if (client.vatTerm === "Bi-monthly") {
      // An odd month opens a term, so the one due next is the term before;
      // an even month ends a term, due the 10th of the month after next.
      const odd = Number(month.slice(5)) % 2 === 1
      const term = odd ? [prevMonth(prevMonth(month)), prevMonth(month)] : [prevMonth(month), month]
      const vat = round(vatFor(client, term), 1000)
      // Mostly exports: more VAT paid on purchases than charged on sales,
      // so Skatteetaten pays the difference back.
      out.push({
        label: `VAT ${vat < 0 ? "back" : ""}, ${shortMonth(term[0])}–${shortMonth(term[1])}`.replace(" ,", ","),
        date: day(odd ? next : nextMonth(next), 10),
        amount: vat,
        hint: vat < 0 ? "Refund from Skatteetaten to your account" : "Filed by us, paid from your account",
      })
    } else {
      const year = month.slice(0, 4)
      const soFar = monthsUpTo(month, Number(month.slice(5)))
      out.push({
        label: `VAT for ${year} so far`,
        date: `${Number(year) + 1}-03-10`,
        amount: Math.max(round(vatFor(client, soFar), 1000), 0),
        hint: "Set this aside: annual VAT is due in March",
      })
    }
  }
  // Advance tax (forskuddsskatt) falls due in February, April, September
  // and November.
  const taxMonth = ["02", "04", "09", "11"].find((m) => m > next.slice(5))
  if (taxMonth && current.profit > 0) {
    const due = `${next.slice(0, 4)}-${taxMonth}`
    out.push({
      label: "Advance company tax",
      date: day(due, 15),
      amount: advanceTax(client),
      hint: "Instalment on this year's tax",
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

const pct = (value: number) => `${Math.abs(Math.round(value * 100))}%`
const kr = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })
export const formatKr = (value: number) => `${kr.format(Math.round(value))} kr`

function change(now: number, before: number) {
  return before ? (now - before) / Math.abs(before) : 0
}

function highlightsFor(
  report: Omit<MonthlyReport, "highlights">
): Highlight[] {
  const { current, previous, costs, salesDetail, trend, month } = report
  const prevName = longMonth(previous.month)
  const out: Highlight[] = []
  const salesChange = change(current.sales, previous.sales)

  if (Math.abs(salesChange) >= 0.03) {
    out.push({
      tone: salesChange > 0 ? "good" : "watch",
      text: `Sales ${salesChange > 0 ? "rose" : "fell"} ${pct(salesChange)} on ${prevName}.${
        report.client.industryKey === "bikes" || report.client.industryKey === "hotel" ||
        report.client.industryKey === "cafe"
          ? salesChange < 0
            ? " That's the season turning, not something to worry about."
            : ""
          : ""
      }`,
    })
  } else {
    out.push({ tone: "neutral", text: `Sales held steady against ${prevName}.` })
  }

  // The cost that moved most, relative to sales.
  const goodsShareNow = current.costs.goods / Math.max(current.sales, 1)
  const goodsSharePrev = previous.costs.goods / Math.max(previous.sales, 1)
  if (goodsShareNow - goodsSharePrev > 0.015) {
    const line = costs.find((c) => c.key === "goods")
    out.push({
      tone: "watch",
      text: `${line?.label} took ${pct(goodsShareNow)} of sales, up from ${pct(goodsSharePrev)}. Worth a look at supplier prices.`,
    })
  }

  if (salesDetail.kind === "invoices" && salesDetail.overdue.count > 0) {
    out.push({
      tone: "watch",
      text: `${salesDetail.overdue.count} ${salesDetail.overdue.count === 1 ? "invoice is" : "invoices are"} overdue (${formatKr(salesDetail.overdue.amount)}). We can send reminders for you.`,
    })
  }

  const best = [...trend].sort((a, b) => b.profit - a.profit)[0]
  if (best.month === month && current.profit > 0) {
    out.push({ tone: "good", text: "Your best month for profit in the last half year." })
  } else if (current.profit < 0) {
    out.push({
      tone: "watch",
      text: `A loss of ${formatKr(-current.profit)} this month. Cash covers it, but let's talk if it repeats.`,
    })
  }

  return out.slice(0, 3)
}

/** What the month's bookkeeping says the customer could do differently:
    money lost to a rule they may not know. Read from the booked lines. */
export function bookkeepingTips(items: ReviewItem[], clientId: string, month: string): Highlight[] {
  const own = items.filter((i) => i.clientId === clientId && i.period === month && i.domain === "bookkeeping" && i.status === "booked")
  const out: Highlight[] = []
  const meals = own.filter((i) => i.suggestion.lines[0]?.account.startsWith("7360"))
  if (meals.length) {
    const amount = meals.reduce((sum, i) => sum + Math.abs(i.amount), 0)
    out.push({
      tone: "watch",
      text: `${meals.length === 1 ? "A business meal" : `${meals.length} business meals`} came to more than 592 kr a person, so ${formatKr(amount)} can't be deducted. Kept under 592 kr a person, without spirits, the company can deduct it.`,
    })
  }
  const lost = own.filter((i) => i.evidence.label === "Self-made voucher")
  if (lost.length) {
    const vat = lost.reduce((sum, i) => sum + Math.round((Math.abs(i.amount) * 25) / 125), 0)
    out.push({
      tone: "watch",
      text: `${lost.length === 1 ? "One purchase" : `${lost.length} purchases`} had no receipt: about ${formatKr(vat)} VAT the company couldn't get back. A photo in the app the same day saves it.`,
    })
  }
  // Corrections found from this month's lines, whatever month they fix.
  const fixed = items.filter(
    (i) => i.clientId === clientId && i.vatFix && items.find((f) => f.id === i.vatFix!.from)?.period === month
  )
  if (fixed.length) {
    out.push({
      tone: "neutral",
      text: `Fuel for a passenger car carries no VAT deduction. We corrected ${fixed.length} earlier ${fixed.length === 1 ? "receipt" : "receipts"} this year (${formatKr(fixed.reduce((sum, i) => sum + (i.vatFix?.vat ?? 0), 0))}).`,
    })
  }
  const owed = own.filter((i) => i.suggestion.lines[0]?.account.startsWith("1570"))
  if (owed.length) {
    out.push({
      tone: "watch",
      text: `${formatKr(owed.reduce((sum, i) => sum + Math.abs(i.amount), 0))} of private spending on the company's account is owed back. Paid back within 60 days, it isn't taxed as dividend.`,
    })
  }
  return out
}

export function buildReport(clientId: string, month: string): MonthlyReport {
  const client = CLIENT_BY_ID.get(clientId)!
  const p = PROFILES[client.industryKey]
  const current = figuresFor(client, month)
  const previous = figuresFor(client, prevMonth(month))
  const trend = monthsUpTo(month, 6).map((m) => figuresFor(client, m))
  const costs: CostLine[] = (
    [
      ["staff", "Salaries & tax"],
      ["goods", p.goodsLabel],
      ["rent", "Rent"],
      ["other", "Everything else"],
    ] as const
  )
    .map(([key, label]) => ({
      key,
      label,
      amount: current.costs[key],
      share: current.costs[key] / current.totalCosts,
    }))
    .sort((a, b) => b.amount - a.amount)

  const seed = `${clientId}-${month}`
  const salesDetail: SalesDetail =
    p.sales === "pos"
      ? {
          kind: "pos",
          transactions: Math.round(current.sales / p.ticket),
          averageTicket: Math.round(p.ticket * (1 + wobble(`${seed}-t`, 0.06))),
        }
      : (() => {
          const sent = Math.max(1, Math.round(current.sales / p.ticket))
          const overdueCount = hash(`${seed}-od`) % 4 === 0 ? 0 : hash(`${seed}-od`) % 3
          return {
            kind: "invoices",
            sent,
            outstanding: receivablesAt(client, month),
            overdue: {
              count: overdueCount,
              amount: round(overdueCount * p.ticket * (0.8 + wobble(`${seed}-oa`, 0.2)), 100),
            },
          }
        })()

  const payDay = Number(client.payDate.split(" ")[0])
  const draft = {
    client,
    month,
    label: `${longMonth(month)} ${month.slice(0, 4)}`,
    current,
    previous,
    trend,
    costs,
    salesDetail,
    payroll: {
      people: client.employees,
      amount: round(current.costs.staff * 0.72, 1000),
      // Hours worked in a month are paid on the pay day of the next.
      paidOn: day(month, payDay),
    },
    upcoming: upcomingAfter(client, month, current),
  }
  return { ...draft, highlights: highlightsFor(draft) }
}

/** The agent's draft of the accountant's note: two or three plain sentences
    the owner can forward to their board as they are. */
export function draftNote(clientId: string, month: string) {
  const report = buildReport(clientId, month)
  const { current, previous, client, upcoming } = report
  const first = client.contacts[0].name.split(" ")[0]
  const name = longMonth(month)
  const salesChange = change(current.sales, previous.sales)
  const verdict =
    current.profit <= 0
      ? `${name} ended with a loss`
      : current.margin >= 0.1 && salesChange > -0.03
        ? `${name} was a strong month`
        : current.profit > previous.profit
          ? `${name} was a better month than ${longMonth(previous.month)}`
          : salesChange < -0.03
            ? `${name} was a quieter month`
            : `${name} was a steady month`
  const sales =
    Math.abs(salesChange) < 0.03
      ? `sales were about the same as ${longMonth(previous.month)} at ${formatKr(current.sales)}`
      : `sales ${salesChange > 0 ? "went up" : "went down"} ${pct(salesChange)} to ${formatKr(current.sales)}`
  const vat = upcoming.find((u) => u.label.startsWith("VAT"))
  const plan = !vat
    ? ""
    : vat.amount < 0
      ? ` You get ${formatKr(-vat.amount)} back in VAT on the ${Number(vat.date.slice(8))}th.`
      : ` Keep ${formatKr(vat.amount)} ready for VAT.`
  const result =
    current.profit > 0
      ? `and you kept ${formatKr(current.profit)} after costs`
      : `but costs came to ${formatKr(-current.profit)} more than that`
  return `Hi ${first}, ${verdict}: ${sales}, ${result}. You have ${formatKr(current.cash)} in the bank.${plan} Ask me here if anything looks off.`
}

// ── Recurring costs ──

/** One supplier the business pays every month: this month against last. */
export type RecurringCost = {
  supplier: string
  /** What it is, in the owner's words: the cost account's name. */
  what: string
  now: number
  before: number
  /** Share of last month's amount: 0.1 is 10% more. */
  change: number
}

/** Accounts that hold one-offs, not running costs: meals, trips, fuel,
    equipment, private spending. */
const ONE_OFF = /^(1570|5990|6540|6860|7000|7100|7140|7350|7360)\b/

/** The suppliers billed both this month and last, with the two amounts
    side by side: "this is what you paid for the office last month, and
    this month". From the booked lines (the month in progress counts what
    has arrived so far). */
export function recurringCosts(items: ReviewItem[], clientId: string, month: string): RecurringCost[] {
  const before = prevMonth(month)
  const sums = new Map<string, { what: string; byMonth: Record<string, number> }>()
  for (const i of items) {
    if (
      i.clientId !== clientId ||
      i.domain !== "bookkeeping" ||
      i.kind === "bank_line" ||
      (i.period !== month && i.period !== before)
    )
      continue
    const account = i.suggestion.lines[0]?.account ?? ""
    if (ONE_OFF.test(account)) continue
    const entry = sums.get(i.title) ?? { what: account.replace(/^\d+\s*/, ""), byMonth: {} }
    entry.byMonth[i.period] = (entry.byMonth[i.period] ?? 0) + Math.abs(i.amount)
    sums.set(i.title, entry)
  }
  return [...sums.entries()]
    .filter(([, e]) => e.byMonth[month] && e.byMonth[before])
    .map(([supplier, e]) => ({
      supplier,
      what: e.what,
      now: e.byMonth[month],
      before: e.byMonth[before],
      change: change(e.byMonth[month], e.byMonth[before]),
    }))
    .sort((a, b) => b.now - a.now)
}

/** Months with a report the customer can read, newest first. */
export function publishedMonths(closing: Closing, clientId: string) {
  return MONTHS.filter(
    (m) => m.status === "closed" || Boolean(closing[closeKey(clientId, m.id)])
  ).map((m) => m.id)
}
