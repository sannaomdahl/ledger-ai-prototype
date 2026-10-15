// Where a filing's number comes from. A VAT return is output VAT on sales
// minus input VAT on purchases, post by post as on the MVA-melding, each
// post split by month and by the ledger accounts behind it, plus any late
// invoices booked into the term. The tax return walks from the year's
// profit to the tax. Every figure is the one the filing row shows, to the
// krone, so the accountant can see exactly what goes to Skatteetaten.
import { CLIENT_BY_ID, MONTHS } from "./data"
import { inputVat, type Filing } from "./filings"
import { advanceTax, core, goodsLabel, monthsUpTo, vatFor, vatProfile } from "./report"
import { isMonthClosed, type Signoffs } from "./signoffs"
import type { Client, ReviewItem } from "./types"

export type PostSource = {
  /** Ledger account(s) in Tripletex. */
  account: string
  label: string
  basis: number
  vat: number
}

export type VatPost = {
  /** The MVA-melding code. */
  code: string
  label: string
  /** 0.25, 0.15… 0 for zero-rated and exempt sales. */
  rate: number
  basis: number
  vat: number
  /** Per month of the term. */
  months: { month: string; basis: number; vat: number }[]
  sources: PostSource[]
}

export type LateLine = {
  item: ReviewItem
  basis: number
  vat: number
  /** Already in a corrected return that went in. */
  corrected: boolean
}

export type VatBreakdown = {
  kind: "vat"
  filing: Filing
  client: Client
  months: string[]
  /** Months of the term not closed yet: their figures can still move. */
  openMonths: string[]
  output: VatPost[]
  input: VatPost[]
  late: LateLine[]
  outputVat: number
  inputVat: number
  lateVat: number
  /** Rounding the posts to whole kroner, so they add up to the total. */
  rounding: number
  /** What the return says: to pay (positive) or reclaim (negative). */
  total: number
  /** Bookings corrected after the fact: input VAT taken back. */
  fixes: LateLine[]
  fixVat: number
  /** A corrected return: what went in before, and the change. */
  correction?: { filed: number; change: number; late: number; fixed: number }
}

export type TaxStep = { label: string; detail?: string; amount: number; strong?: boolean }

export type TaxBreakdown = {
  kind: "tax"
  filing: Filing
  client: Client
  year: string
  steps: TaxStep[]
  total: number
}

export type FilingBreakdown = VatBreakdown | TaxBreakdown

const NAMES: Record<string, string> = {
  "3": "Sales, 25% VAT",
  "31": "Food and drink, 15% VAT",
  "33": "Rooms and transport, 12% VAT",
  "52": "Exports, zero-rated",
  "6": "Sales outside the VAT act",
  "1": "Purchases, 25% deductible",
}

function round(value: number) {
  return Math.round(value)
}

/** The rates behind a blended one: 20% for a café is part 25% (drinks to
    stay), part 15% (food to take away). */
function outputSplit(rate: number): { code: string; rate: number; weight: number }[] {
  if (rate <= 0) return []
  if (rate >= 0.25) return [{ code: "3", rate: 0.25, weight: 1 }]
  if (rate === 0.15) return [{ code: "31", rate: 0.15, weight: 1 }]
  const low = rate < 0.15 ? { code: "33", rate: 0.12 } : { code: "31", rate: 0.15 }
  const high = (rate - low.rate) / (0.25 - low.rate)
  return [
    { code: "3", rate: 0.25, weight: high },
    { ...low, weight: 1 - high },
  ]
}

/** The months a VAT filing covers. */
export function filingMonths(filing: Filing): string[] {
  const year = filing.id.match(/-(\d{4})(?:-T\d)?$/)?.[1] ?? MONTHS[0].id.slice(0, 4)
  const term = filing.id.match(/-T(\d)$/)?.[1]
  if (!term) return monthsUpTo(`${year}-12`, 12)
  const first = Number(term) * 2 - 1
  return [first, first + 1].map((m) => `${year}-${String(m).padStart(2, "0")}`)
}

function post(
  code: string,
  rate: number,
  months: string[],
  basisOf: (month: string) => number,
  sources: { account: string; label: string; basisOf: (month: string) => number }[]
): VatPost {
  const rows = months.map((month) => {
    const basis = basisOf(month)
    return { month, basis: round(basis), vat: round(basis * rate) }
  })
  const basis = months.reduce((sum, m) => sum + basisOf(m), 0)
  return {
    code,
    label: NAMES[code],
    rate,
    basis: round(basis),
    vat: round(basis * rate),
    months: rows,
    sources: sources.map((s) => {
      const b = months.reduce((sum, m) => sum + s.basisOf(m), 0)
      return { account: s.account, label: s.label, basis: round(b), vat: round(b * rate) }
    }),
  }
}

function vatBreakdown(filing: Filing, items: ReviewItem[], signed: Signoffs): VatBreakdown {
  const client = CLIENT_BY_ID.get(filing.clientId)!
  const p = vatProfile(client)
  const all = filingMonths(filing)
  const oldest = MONTHS.at(-1)!.id
  // A return still being built counts the months so far.
  const months =
    filing.status === "in_progress" || filing.status === "upcoming"
      ? all.filter((m) => m <= MONTHS[0].id)
      : all
  const openMonths = months.filter(
    (m) => m >= oldest && !isMonthClosed(client.id, m, signed)
  )

  const sales = (m: string) => core(client, m).sales
  const output: VatPost[] = outputSplit(p.share > 0 ? p.rate : 0).map((part) =>
    post(part.code, part.rate, months, (m) => sales(m) * p.share * part.weight, [
      { account: "3000", label: "Sales revenue", basisOf: (m) => sales(m) * p.share * part.weight },
    ])
  )
  if (p.share < 1) {
    const code = p.exports ? "52" : "6"
    output.push(
      post(code, 0, months, (m) => sales(m) * (1 - p.share), [
        {
          account: p.exports ? "3200" : "3100",
          label: p.exports ? "Export sales" : "Sales without VAT",
          basisOf: (m) => sales(m) * (1 - p.share),
        },
      ])
    )
  }

  // Purchases carry 25% on the price before VAT: a fifth of what was paid.
  const goods = (m: string) => core(client, m).costs.goods * p.inputShare * 0.8
  const other = (m: string) => core(client, m).costs.other * p.inputShare * 0.8
  const input: VatPost[] =
    p.inputShare > 0
      ? [
          post("1", 0.25, months, (m) => goods(m) + other(m), [
            { account: "4300", label: goodsLabel(client), basisOf: goods },
            { account: "6000–7700", label: "Other costs: power, software, cars, insurance…", basisOf: other },
          ]),
        ]
      : []

  const corrected = new Set(signed.progress.corrections[filing.id]?.itemIds ?? [])
  const late: LateLine[] = items
    .filter((i) => i.clientId === client.id && i.backdated && all.includes(i.period))
    .map((item) => {
      const vat = inputVat(item)
      return { item, basis: Math.abs(item.amount) - vat, vat, corrected: corrected.has(item.id) }
    })

  const fixes: LateLine[] = items
    .filter((i) => i.clientId === client.id && i.vatFix && all.includes(i.period))
    .map((item) => ({
      item,
      basis: Math.abs(item.amount),
      vat: item.vatFix!.vat,
      corrected: corrected.has(item.id) || Boolean(filing.stamp && item.vatFix!.at <= filing.stamp.at),
    }))
  const fixVat = fixes.reduce((sum, l) => sum + l.vat, 0)

  const outputVat = output.reduce((sum, x) => sum + x.vat, 0)
  const inputSum = input.reduce((sum, x) => sum + x.vat, 0)
  const lateVat = late.reduce((sum, l) => sum + l.vat, 0)
  const exact = Math.round(vatFor(client, months))
  const rounding = exact - (outputVat - inputSum)
  const total = exact - lateVat + fixVat

  const breakdown: VatBreakdown = {
    kind: "vat",
    filing,
    client,
    months,
    openMonths,
    output,
    input,
    late,
    outputVat,
    inputVat: inputSum,
    lateVat,
    fixes,
    fixVat,
    rounding,
    total,
  }
  if (filing.correction) {
    const pendingLate = late.filter((l) => !l.corrected).reduce((sum, l) => sum + l.vat, 0)
    const pendingFix = fixes.filter((l) => !l.corrected).reduce((sum, l) => sum + l.vat, 0)
    const change = pendingFix - pendingLate
    breakdown.correction = { filed: total - change, change, late: -pendingLate, fixed: pendingFix }
  }
  return breakdown
}

/** The tax return, from the year's profit: costs the law doesn't let you
    deduct go back in, 22% of what's left is the tax, and the advance tax
    paid during the year comes off it. */
function taxBreakdown(filing: Filing): TaxBreakdown {
  const client = CLIENT_BY_ID.get(filing.clientId)!
  const year = filing.period
  const months = monthsUpTo(`${year}-12`, 12)
  const figures = months.map((m) => core(client, m))
  const sum = (pick: (f: (typeof figures)[number]) => number) =>
    figures.reduce((total, f) => total + pick(f), 0)
  const sales = sum((f) => f.sales)
  const costs = sum((f) => f.totalCosts)
  const profit = sales - costs
  // Client dinners, gifts and fines: booked as costs, not deductible.
  const addBack = Math.round(sum((f) => f.costs.other) * 0.012)
  const taxable = Math.max(profit + addBack, 0)
  const tax = Math.round(taxable * 0.22)
  const paid = advanceTax(client) * 4
  const steps: TaxStep[] = [
    { label: "Sales", detail: `3000–3999, 1 Jan – 31 Dec ${year}`, amount: Math.round(sales) },
    { label: "Costs", detail: "4000–7999: goods, salaries, rent and the rest", amount: -Math.round(costs) },
    { label: "Profit before tax", amount: Math.round(profit), strong: true },
    { label: "Not deductible", detail: "Client entertainment, gifts and fines (account 7360, 7430)", amount: addBack },
    { label: "Taxable income", amount: taxable, strong: true },
    { label: "Company tax, 22%", amount: tax, strong: true },
    { label: "Advance tax paid", detail: `Four instalments of ${new Intl.NumberFormat("nb-NO").format(advanceTax(client))} kr`, amount: -paid },
  ]
  return { kind: "tax", filing, client, year, steps, total: tax - paid }
}

/** Whether a filing has numbers to break down. */
export function hasBreakdown(filing: Filing) {
  return (
    filing.status !== "upcoming" &&
    (filing.kind === "mva" || filing.kind === "tax_return" || filing.kind === "annual_accounts")
  )
}

export function filingBreakdown(
  filing: Filing,
  items: ReviewItem[],
  signed: Signoffs
): FilingBreakdown | undefined {
  if (!hasBreakdown(filing)) return undefined
  return filing.kind === "mva" ? vatBreakdown(filing, items, signed) : taxBreakdown(filing)
}
