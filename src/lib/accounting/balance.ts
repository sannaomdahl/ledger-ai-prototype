// The balance sheet as it stands at each month end this year: what the
// business owns, what it owes, and the profit so far. Tripletex holds the
// real trial balance; here it is generated per client (deterministically)
// to agree with everything else the prototype shows: the profit is the
// monthly report's, the bank accounts are the reconciliation's, the VAT
// owed is the filings'. What the business owes its suppliers is the line
// that makes the two sides meet.
import { CLIENT_BY_ID, hash, monthLabel, MONTHS } from "./data"
import { inputVat } from "./filings"
import {
  cardBalance,
  employerBalance,
  holidayBalance,
  holidayEmployerBalance,
  taxBalance,
} from "./reconciliation"
import {
  core,
  figuresFor,
  goodsLabel,
  monthsUpTo,
  receivablesAt,
  salesKind,
  startingCash,
  vatFor,
} from "./report"
import type { Client, IndustryKey, ReviewItem } from "./types"

const YEAR = Number(MONTHS[0].id.slice(0, 4))

/** January to the open month: the months of this year with a balance. */
export const BALANCE_MONTHS = monthsUpTo(MONTHS[0].id, Number(MONTHS[0].id.slice(5)))

// ── What each kind of business owns ──

type AssetProfile = {
  /** Stock on hand, as months of the next month's purchases. */
  stock?: { months: number; label: string }
  /** What the fixed assets cost, as months of an average month's sales. */
  fixed: { cost: number; account: "1200" | "1230" | "1250"; label: string }
}

const ASSETS: Record<IndustryKey, AssetProfile> = {
  cafe: { stock: { months: 0.35, label: "Coffee, food & drink" }, fixed: { cost: 1.2, account: "1200", label: "Coffee machines & kitchen" } },
  deli: { stock: { months: 0.4, label: "Food in stock" }, fixed: { cost: 0.9, account: "1200", label: "Counters & cold rooms" } },
  design: { fixed: { cost: 0.3, account: "1250", label: "Computers & furniture" } },
  construction: { stock: { months: 0.35, label: "Building materials" }, fixed: { cost: 1.4, account: "1230", label: "Vans & machinery" } },
  seafood: { stock: { months: 0.25, label: "Fish in cold storage" }, fixed: { cost: 0.8, account: "1200", label: "Cold store & equipment" } },
  dental: { stock: { months: 0.6, label: "Clinical supplies" }, fixed: { cost: 2.2, account: "1200", label: "Dental chairs & X-ray" } },
  climbing: { stock: { months: 2.5, label: "Shop stock" }, fixed: { cost: 3, account: "1200", label: "Walls, holds & mats" } },
  law: { fixed: { cost: 0.25, account: "1250", label: "Computers & furniture" } },
  it: { stock: { months: 0.4, label: "Hardware for resale" }, fixed: { cost: 0.35, account: "1250", label: "Computers & servers" } },
  salon: { stock: { months: 1.5, label: "Hair products" }, fixed: { cost: 0.7, account: "1250", label: "Chairs & fittings" } },
  bikes: { stock: { months: 1.8, label: "Bikes & parts" }, fixed: { cost: 0.6, account: "1250", label: "Workshop & fittings" } },
  plumbing: { stock: { months: 0.6, label: "Pipes & fittings" }, fixed: { cost: 1, account: "1230", label: "Vans & tools" } },
  hotel: { stock: { months: 0.3, label: "Food, drink & linen" }, fixed: { cost: 4, account: "1200", label: "Furniture & kitchen" } },
  kindergarten: { fixed: { cost: 0.8, account: "1200", label: "Play equipment" } },
  architecture: { fixed: { cost: 0.3, account: "1250", label: "Computers & plotters" } },
  logistics: { stock: { months: 0.1, label: "Fuel in tank" }, fixed: { cost: 3, account: "1230", label: "Trucks & trailers" } },
}

/** Fixed assets are written off over five years. */
const LIFE = 60

// ── The business loan ──

export type Loan = {
  lender: string
  /** Borrowed. */
  principal: number
  /** Serial loan: the same principal every month, interest on top. */
  instalment: number
  /** Yearly interest rate. */
  rate: number
  /** First instalment, "2023-04". */
  firstMonth: string
  /** Last instalment. */
  lastMonth: string
  /** Number of instalments. */
  term: number
}

/** Months left to pay at the end of the open month, for the clients who
    borrowed. Some are close to done, some have years left. */
const LOAN_LEFT: Partial<Record<string, number>> = {
  "fjord-kaffebar": 2,
  "bergen-bygg": 8,
  "sjobris-hotell": 47,
  "polar-logistikk": 31,
  tinde: 23,
  "solberg-tann": 14,
  "grunerlokka-sykkel": 5,
  "nordkapp-ror": 19,
  "mathallen-deli": 11,
  fjellstua: 38,
}

function addMonths(period: string, count: number) {
  const [y, m] = period.split("-").map(Number)
  const index = y * 12 + (m - 1) + count
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

function round(value: number, to = 100) {
  return Math.round(value / to) * to
}

/** One average month's sales. */
function base(client: Client) {
  return client.profile.revenueLastYear / 12
}

export function loanFor(client: Client): Loan | undefined {
  const left = LOAN_LEFT[client.id]
  if (left === undefined) return undefined
  const h = hash(`${client.id}-loan`)
  const term = [36, 48, 60, 84][h % 4]
  const paid = Math.max(term - left, 6)
  const fullTerm = paid + left
  const principal = round(base(client) * ASSETS[client.industryKey].fixed.cost * (0.6 + (h % 30) / 100), 10_000)
  const open = MONTHS[0].id
  return {
    lender: "DNB Bank",
    principal,
    instalment: round(principal / fullTerm, 10),
    rate: 0.059 + (h % 12) / 1000,
    firstMonth: addMonths(open, -paid + 1),
    lastMonth: addMonths(open, left),
    term: fullTerm,
  }
}

/** What is left on the loan after the instalment of `month`. */
export function loanBalance(loan: Loan, month: string) {
  const paid = Math.min(Math.max(monthsBetween(loan.firstMonth, month) + 1, 0), loan.term)
  return paid >= loan.term ? 0 : loan.principal - loan.instalment * paid
}

export function loanMonthsLeft(loan: Loan, month: string) {
  return Math.max(monthsBetween(month, loan.lastMonth), 0)
}

// ── The accounts ──

export type BalanceSide = "assets" | "liabilities"

export type BalanceGroup =
  | "fixed"
  | "stock"
  | "receivables"
  | "bank"
  | "equity"
  | "longterm"
  | "shortterm"

export const GROUP_LABEL: Record<BalanceGroup, string> = {
  fixed: "Fixed assets",
  stock: "Inventory",
  receivables: "Receivables",
  bank: "Bank",
  equity: "Equity",
  longterm: "Long-term debt",
  shortterm: "Short-term debt",
}

export const GROUP_SIDE: Record<BalanceGroup, BalanceSide> = {
  fixed: "assets",
  stock: "assets",
  receivables: "assets",
  bank: "assets",
  equity: "liabilities",
  longterm: "liabilities",
  shortterm: "liabilities",
}

export type BalanceLine = {
  account: string
  name: string
  group: BalanceGroup
  /** Plain words for the owner. */
  hint: string
  /** One per month in BALANCE_MONTHS, as a positive balance on its side
      (VAT owed is positive, VAT to reclaim negative). */
  amounts: number[]
}

export type ResultLine = {
  account: string
  name: string
  /** Year to date, per month in BALANCE_MONTHS. Income positive, costs
      negative. */
  amounts: number[]
}

export type BalanceSheet = {
  client: Client
  months: string[]
  lines: BalanceLine[]
  /** The income statement so far this year, which the profit line sums. */
  result: ResultLine[]
  loan?: Loan
  stockLabel?: string
}

// ── One month end ──

/** Salary cost in the monthly report splits into gross pay, holiday pay
    earned (10.2%) and employer's NI (14.1% on both). */
function payOf(client: Client, month: string) {
  const staff = core(client, month).costs.staff
  const gross = staff / (1.102 * 1.141)
  return { gross, holiday: gross * 0.102, employer: gross * 1.102 * 0.141 }
}

/** The months of `month`'s year up to and including it. */
function yearTo(month: string) {
  return monthsUpTo(month, Number(month.slice(5)))
}

/** VAT not yet paid at the end of `month`. Bi-monthly: the term that just
    ended is paid the 10th of the month after next, so an odd month still
    owes the term before. Annual: the year so far, and last year's until
    it is paid on 10 March. */
function vatOwed(client: Client, month: string) {
  const year = Number(month.slice(0, 4))
  if (client.vatTerm === "Annual") {
    const last = Number(month.slice(5)) < 3 ? yearTo(`${year - 1}-12`) : []
    return vatFor(client, [...last, ...yearTo(month)])
  }
  const odd = Number(month.slice(5)) % 2 === 1
  return vatFor(client, monthsUpTo(month, odd ? 3 : 2))
}

/** The VAT returns not paid at the end of `month`, as the months each
    covers: the same stretch `vatOwed` sums, one return at a time. */
export function openVatTerms(client: Client, month: string): string[][] {
  const year = Number(month.slice(0, 4))
  if (client.vatTerm === "Annual") {
    return [
      ...(Number(month.slice(5)) < 3 ? [yearTo(`${year - 1}-12`)] : []),
      yearTo(month),
    ]
  }
  const odd = Number(month.slice(5)) % 2 === 1
  if (!odd) return [monthsUpTo(month, 2)]
  const [a, b, c] = monthsUpTo(month, 3)
  return [[a, b], [c]]
}

/** What one return's months put on the VAT accounts: output minus input,
    to the krone, less the input VAT on invoices booked into them after
    they closed (a reopened month). */
export function vatOnLedger(client: Client, months: string[], items: ReviewItem[]) {
  const late = items
    .filter((i) => i.clientId === client.id && i.backdated && months.includes(i.period))
    .reduce((sum, i) => sum + inputVat(i), 0)
  return Math.round(vatFor(client, months)) - late
}

/** The VAT accounts (2700–2740) at month end: every return not paid yet. */
export function vatBalance(client: Client, month: string, items: ReviewItem[]) {
  return openVatTerms(client, month).reduce(
    (sum, months) => sum + vatOnLedger(client, months, items),
    0
  )
}

/** Employer's NI is paid with the withholding, every two months on the
    15th of the month after the term. */
function employerOwed(client: Client, month: string) {
  const odd = Number(month.slice(5)) % 2 === 1
  return (odd ? [month] : monthsUpTo(month, 2)).reduce(
    (sum, m) => sum + payOf(client, m).employer,
    0
  )
}

/** Holiday pay is earned through the year and paid out in June the year
    after. */
function holidayOwed(client: Client, month: string) {
  const year = Number(month.slice(0, 4))
  const last = Number(month.slice(5)) < 6 ? yearTo(`${year - 1}-12`) : []
  return [...last, ...yearTo(month)].reduce((sum, m) => sum + payOf(client, m).holiday, 0)
}

/** Rent is paid a quarter ahead; insurance a year ahead in January. */
function prepaidAt(client: Client, month: string) {
  const index = Number(month.slice(5)) - 1
  const rent = core(client, month).costs.rent
  return rent * (2 - (index % 3)) + base(client) * 0.12 * ((11 - index) / 12)
}

/** Supplier invoices are paid on two to four weeks' credit. */
function suppliersAt(client: Client, month: string) {
  const { costs } = core(client, month)
  const spread = (hash(`${client.id}-${month}-ap`) % 300) / 1000
  return (costs.goods + costs.other) * (0.5 + spread)
}

function shareCapital(client: Client) {
  return hash(`${client.id}-sc`) % 3 === 0 ? 100_000 : 30_000
}

function fixedAt(client: Client, month: string) {
  const profile = ASSETS[client.industryKey]
  const cost = round(base(client) * profile.fixed.cost, 10_000)
  const age = 10 + (hash(`${client.id}-age`) % 30) + monthsBetween(`${YEAR}-01`, month) + 1
  return { cost, value: cost * Math.max(1 - age / LIFE, 0) }
}

function profitFor(client: Client, months: string[]) {
  return months.reduce((sum, m) => sum + core(client, m).profit, 0)
}

/** Every line at a month end except the operating account, which is what
    the others leave. Tax withheld sits on both sides (in 1950, owed on
    2600) and never moves the operating account. */
function ledgerAt(client: Client, month: string) {
  const profile = ASSETS[client.industryKey]
  const loan = loanFor(client)
  const year = Number(month.slice(0, 4))
  return {
    fixed: round(fixedAt(client, month).value),
    // Enough stock for the weeks ahead: it follows next month's purchases,
    // so a bike shop fills up before spring and a hotel before summer.
    stock: profile.stock
      ? round(core(client, addMonths(month, 1)).costs.goods * profile.stock.months)
      : 0,
    receivables: receivablesAt(client, month),
    prepaid: round(prepaidAt(client, month)),
    card: cardBalance(client, month),
    capital: shareCapital(client),
    profit: profitFor(client, yearTo(month)),
    // Last year's profit stays in the company as other equity.
    retained: year > YEAR
      ? profitFor(client, monthsUpTo(`${year - 1}-12`, (year - YEAR) * 12))
      : year < YEAR
        ? -profitFor(client, monthsUpTo(`${YEAR - 1}-12`, (YEAR - year) * 12))
        : 0,
    loan: loan ? loanBalance(loan, month) : 0,
    suppliers: round(suppliersAt(client, month)),
    vat: round(vatOwed(client, month)),
    employer: round(employerOwed(client, month)),
    holiday: round(holidayOwed(client, month)),
  }
}

type Ledger = ReturnType<typeof ledgerAt>

/** Equity minus what is owed, minus every asset but the operating account. */
function leftover(l: Ledger, otherEquity: number) {
  return (
    l.capital + otherEquity + l.retained + l.profit +
    l.loan + l.suppliers + l.vat + l.employer + l.holiday -
    (l.fixed + l.stock + l.receivables + l.prepaid + l.card)
  )
}

const OTHER_EQUITY = new Map<string, number>()

/** Other equity at the start of the year: set so January starts from the
    cash the business had, and so no month end this year dips below a
    quarter of a month's sales. */
function otherEquity(client: Client) {
  const known = OTHER_EQUITY.get(client.id)
  if (known !== undefined) return known
  const year = monthsUpTo(`${YEAR}-12`, 12)
  const january = ledgerAt(client, year[0])
  let equity = startingCash(client) + january.profit * 0.8 - leftover(january, 0)
  const lowest = Math.min(...year.map((m) => leftover(ledgerAt(client, m), equity)))
  const floor = base(client) * 0.25
  if (lowest < floor) equity += floor - lowest
  equity = round(equity, 10_000)
  OTHER_EQUITY.set(client.id, equity)
  return equity
}

/** The operating account (1920) at month end. The monthly report's "In the
    bank" and the reconciliation's statement balance. */
export function bankAt(client: Client, month: string) {
  return round(leftover(ledgerAt(client, month), otherEquity(client)), 1000)
}

export function buildBalanceSheet(
  clientId: string,
  items: ReviewItem[]
): BalanceSheet {
  const client = CLIENT_BY_ID.get(clientId)!
  const profile = ASSETS[client.industryKey]
  const months = BALANCE_MONTHS
  const loan = loanFor(client)
  const ledgers = months.map((m) => ledgerAt(client, m))
  const pick = (key: keyof Ledger) => ledgers.map((l) => l[key])
  const equity = otherEquity(client)
  const withholding = months.map((m) => taxBalance(client, m, items))
  const nok = new Intl.NumberFormat("nb-NO")
  const pos = salesKind(client) === "pos"

  const lines: BalanceLine[] = [
    {
      account: profile.fixed.account,
      name: profile.fixed.label,
      group: "fixed",
      hint: `Bought for ${nok.format(fixedAt(client, months[0]).cost)} kr, written off over five years`,
      amounts: pick("fixed"),
    },
    ...(profile.stock
      ? [
          {
            account: "1460",
            name: profile.stock.label,
            group: "stock" as const,
            hint: "Goods on the shelf at cost, from the month-end stock count",
            amounts: pick("stock"),
          },
        ]
      : []),
    {
      account: "1500",
      name: pos ? "Card sales on the way" : "Customers who owe you",
      group: "receivables",
      hint: pos ? "Two days of card sales the terminal hasn't paid out yet" : "Invoices sent and not paid yet",
      amounts: pick("receivables"),
    },
    {
      account: "1700",
      name: "Paid in advance",
      group: "receivables",
      hint: "Rent paid a quarter ahead and the year's insurance",
      amounts: pick("prepaid"),
    },
    ...client.accounts.map((account) => ({
      account: account.ledger,
      name: account.name,
      group: "bank" as const,
      hint: `DNB ${account.number}`,
      amounts:
        account.ledger === "1920"
          ? months.map((m) => figuresFor(client, m).cash)
          : account.ledger === "1921"
            ? pick("card")
            : withholding,
    })),
    {
      account: "2000",
      name: "Share capital",
      group: "equity",
      hint: "Paid in when the company was founded",
      amounts: pick("capital"),
    },
    {
      account: "2050",
      name: "Other equity",
      group: "equity",
      hint: "Profit earlier years left in the company",
      amounts: months.map(() => equity),
    },
    {
      account: "8800",
      name: "Profit so far this year",
      group: "equity",
      hint: "Sales minus costs since 1 January",
      amounts: pick("profit"),
    },
    ...(loan
      ? [
          {
            account: "2220",
            name: `Business loan, ${loan.lender}`,
            group: "longterm" as const,
            hint: `${nok.format(loan.instalment)} kr a month, last instalment ${monthLabel(loan.lastMonth)}`,
            amounts: pick("loan"),
          },
        ]
      : []),
    {
      account: "2400",
      name: "Suppliers you owe",
      group: "shortterm",
      hint: "Invoices received and not paid yet",
      amounts: pick("suppliers"),
    },
    {
      account: "2740",
      name: "VAT",
      group: "shortterm",
      hint: "Charged on sales minus paid on purchases, not settled yet",
      // To the krone, return by return, so the VAT reconciliation adds up.
      amounts: months.map((m) => vatBalance(client, m, items)),
    },
    {
      account: "2600",
      name: "Tax withheld from pay",
      group: "shortterm",
      hint: "Kept on the tax account until it goes to Skatteetaten",
      amounts: withholding,
    },
    // The pay accounts follow the pay runs, like the withholding above, so
    // the payroll reconciliation ties them to the a-melding.
    {
      account: "2770",
      name: "Employer's NI",
      group: "shortterm",
      hint: "14.1% on pay, paid every two months",
      amounts: months.map((m) => employerBalance(client, m, items)),
    },
    {
      account: "2780",
      name: "Employer's NI on holiday pay",
      group: "shortterm",
      hint: "14.1% on the holiday pay earned, paid with it in June",
      amounts: months.map((m) => holidayEmployerBalance(client, m, items)),
    },
    {
      account: "2940",
      name: "Holiday pay earned",
      group: "shortterm",
      hint: "Paid out to employees in June",
      amounts: months.map((m) => holidayBalance(client, m, items)),
    },
  ]

  // The bank is rounded to the thousand; the suppliers line takes the
  // difference, so every month balances to the krone.
  const suppliers = lines.find((l) => l.account === "2400")!
  suppliers.amounts = months.map(
    (_, i) =>
      sumSide(lines, "assets", i) -
      sumSide(lines.filter((l) => l !== suppliers), "liabilities", i)
  )

  const figures = months.map((m) => core(client, m))
  const ytd = (value: (f: (typeof figures)[number]) => number) =>
    months.map((_, i) => figures.slice(0, i + 1).reduce((sum, f) => sum + value(f), 0))
  const result: ResultLine[] = [
    { account: "3000", name: "Sales", amounts: ytd((f) => f.sales) },
    { account: "4000", name: goodsLabel(client), amounts: ytd((f) => -f.costs.goods) },
    { account: "5000", name: "Salaries & tax", amounts: ytd((f) => -f.costs.staff) },
    { account: "6300", name: "Rent", amounts: ytd((f) => -f.costs.rent) },
    { account: "6000", name: "Everything else", amounts: ytd((f) => -f.costs.other) },
  ]

  return { client, months, lines, result, loan, stockLabel: profile.stock?.label }
}

export function sumSide(lines: BalanceLine[], side: BalanceSide, index: number) {
  return lines
    .filter((l) => GROUP_SIDE[l.group] === side)
    .reduce((sum, l) => sum + l.amounts[index], 0)
}

export function sumGroup(lines: BalanceLine[], group: BalanceGroup, index: number) {
  return lines.filter((l) => l.group === group).reduce((sum, l) => sum + l.amounts[index], 0)
}
