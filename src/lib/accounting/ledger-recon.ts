// The reconciliations beyond the bank, for one client and month: the
// a-melding against the pay accounts, the supplier and customer ledgers
// against 2400 and 1500, and the VAT accounts against the returns. Each one
// lays the trial balance from Tripletex next to what should add up to it,
// which is where the trial balance earns its keep. Reconciliation has no
// anomalies: a difference is a finding, settled as fixed in Tripletex or
// explained and carried, and whatever work it needs becomes a task. Every
// section is signed off once it adds up; a reopened month signs them again.
// Derived from the store, like the bank's.
import { BALANCE_MONTHS, buildBalanceSheet, openVatTerms, vatOnLedger } from "./balance"
import { CLIENT_BY_ID, hasFilings, hash, monthName, OPEN_MONTH } from "./data"
import { getClientFilings, inputVat, vatFilingId } from "./filings"
import { monthStatus, signKey, type PeriodsState, type ReconSection } from "./periods"
import { SEEDED_FOLLOW_UP } from "./payroll"
import { payPaidIn, type PayFigures } from "./reconciliation"
import { buildReport, shortMonth } from "./report"
import type { Signoffs } from "./signoffs"
import type { Client, ReconResolution, ReviewItem, Stamp } from "./types"

/** The store's slice these read. `state` fits. */
export type ReconData = Signoffs & { items: ReviewItem[]; periods: PeriodsState }

// ── Findings ──

export type Finding = {
  id: string
  clientId: string
  period: string
  section: ReconSection
  title: string
  detail: string
  /** Per account: what the ledger has that the other side doesn't (the
      a-melding, the supplier or customer ledger) while it is open. */
  effect: Record<string, number>
  /** What "Fixed in Tripletex" did, and what carrying it over means. */
  fixed: string
  /** What carrying it over means; absent when the law doesn't allow it. */
  carried?: string
  /** When the customer holds the answer: the task to send them. */
  ask?: { title: string; message: string }
}

export type FindingState = Finding & { resolution?: ReconResolution }

function prevMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

function nextMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

/** What the agent found this month, beyond the bank. Seeded for the demo
    clients' open month. */
function findingsFor(client: Client, month: string, items: ReviewItem[]): Finding[] {
  if (month !== OPEN_MONTH) return []
  const first = client.contacts[0]?.name.split(" ")[0] ?? "there"
  const base = { clientId: client.id, period: month }
  if (client.id === "fjord-kaffebar") {
    // The follow-up run in the data (payroll.ts): what it paid is in the
    // ledger, and the a-melding built from the regular run lacks it.
    const late = items.find((i) => i.id === SEEDED_FOLLOW_UP.itemId)
    const name = late?.title ?? "One employee"
    const gross = late?.amount ?? 0
    const holiday = Math.round(gross * 0.102)
    const nok = new Intl.NumberFormat("nb-NO").format(gross)
    const tine = items.find((i) => i.clientId === client.id && /tine/i.test(i.title))?.title ?? "Tine SA"
    return [
      {
        ...base,
        id: `${client.id}-${month}-amelding`,
        section: "payroll",
        title: `Follow-up run for ${name} not in the a-melding`,
        detail: `${name}'s September hours came in after the regular run and went out in follow-up run 2 on 23 Oct: ${nok} kr gross, in the ledger. The October a-melding was built from the regular run on 20 Oct and doesn't have it yet. It has to go in: the payment date decides the a-melding's month, so it can't wait for November.`,
        effect: {
          "5000": gross,
          "2600": Math.round(gross * 0.3),
          "2770": Math.round(gross * 0.141),
          "2940": holiday,
          "2780": Math.round(holiday * 0.141),
        },
        fixed: "Added to the October a-melding, due 5 Nov",
      },
      {
        ...base,
        id: `${client.id}-${month}-credit-note`,
        section: "ledgers",
        title: `Credit note from ${tine} posted without a supplier`,
        detail: `Voucher 2026-0391 takes a 1 250 kr credit note from ${tine} straight to 2400 instead of to ${tine}'s supplier account. The open invoices add up to 1 250 kr more than 2400.`,
        effect: { "2400": -1250 },
        fixed: `Moved to ${tine}'s supplier account`,
        carried: `Nets out against ${tine}'s next invoice`,
        ask: {
          title: `Credit note from ${tine}, 1 250 kr`,
          message: `Hi ${first}, there's a 1 250 kr credit from ${tine} in October. Did they send you a credit note? If you have it, could you upload it here?`,
        },
      },
    ]
  }
  if (client.id === "skarv-consulting") {
    return [
      {
        ...base,
        id: `${client.id}-${month}-kid`,
        section: "ledgers",
        title: "Customer payment without a KID",
        detail:
          "2 500 kr came in on 14 Oct without a KID or invoice number. It is on 1500 but not matched to an invoice, so the customer ledger shows 2 500 kr more than 1500.",
        effect: { "1500": -2500 },
        fixed: "Matched to its invoice in Tripletex",
        carried: "Left open until we know which invoice it pays",
        ask: {
          title: "Which invoice does the 2 500 kr payment pay?",
          message: `Hi ${first}, a payment of 2 500 kr came in on 14 Oct without an invoice number. Do you know which customer and invoice it is for?`,
        },
      },
    ]
  }
  return []
}

function withState(findings: Finding[], periods: PeriodsState): FindingState[] {
  return findings.map((f) => ({ ...f, resolution: periods.findings[f.id] }))
}

/** What a finding still does to an account: nothing once fixed. */
function effectOn(findings: FindingState[], account: string) {
  return findings
    .filter((f) => f.resolution?.how !== "fixed")
    .reduce((sum, f) => sum + (f.effect[account] ?? 0), 0)
}

// ── Where a month stands ──

export type SectionStatus = {
  section: ReconSection
  applicable: boolean
  signed?: Stamp
  /** Findings neither fixed nor explained: they block the sign-off. */
  open: number
  done: boolean
}

function hasPayroll(clientId: string, items: ReviewItem[]) {
  return items.some((i) => i.clientId === clientId && i.domain === "payroll")
}

/** Each section's state, cheap enough for every client in a grid. A month
    closed before the app (or before a reopen) was reconciled then. */
export function reconSections(data: ReconData, clientId: string, month: string): SectionStatus[] {
  const client = CLIENT_BY_ID.get(clientId)
  const status = monthStatus(clientId, month, data)
  const inData = BALANCE_MONTHS.includes(month) && status !== "before" && Boolean(client)
  const findings = client ? withState(findingsFor(client, month, data.items), data.periods) : []
  const applies: Record<ReconSection, boolean> = {
    payroll: inData && hasPayroll(clientId, data.items),
    ledgers: inData,
    vat: inData && hasFilings(clientId),
  }
  return (["payroll", "ledgers", "vat"] as const).map((section) => {
    const signed = data.periods.signed[signKey(clientId, month, section)]
    const open = findings.filter((f) => f.section === section && !f.resolution).length
    return {
      section,
      applicable: applies[section],
      signed,
      open,
      done: !applies[section] || Boolean(signed) || status === "closed",
    }
  })
}

// ── Payroll: a-melding against the pay accounts ──

export type PayrollRow = {
  account: string
  name: string
  /** Where the a-melding figure comes from. */
  basis: string
  reported: number
  ledger: number
  difference: number
  /** The account at month end on the trial balance. Absent for the cost
      account, which only moves within the year. */
  balance?: number
  balanceNote?: string
}

export type PayrollCheck = {
  /** The hours whose pay went out this month. */
  hours: string
  /** The bi-monthly term the employer's NI and withholding are paid by. */
  term: { label: string; due: string }
  rows: PayrollRow[]
  findings: FindingState[]
  difference: number
}

function termOf(month: string) {
  const m = Number(month.slice(5))
  const start = m % 2 === 1 ? month : prevMonth(month)
  const end = nextMonth(start)
  return {
    label: `${shortMonth(start)}–${shortMonth(end)}`,
    due: `${nextMonth(end)}-15`,
  }
}

function balanceAt(lines: { account: string; amounts: number[] }[], account: string, index: number) {
  return lines.find((l) => l.account === account)?.amounts[index] ?? 0
}

export function payrollCheck(data: ReconData, clientId: string, month: string): PayrollCheck {
  const client = CLIENT_BY_ID.get(clientId)!
  const findings = withState(
    findingsFor(client, month, data.items).filter((f) => f.section === "payroll"),
    data.periods
  )
  const pay: PayFigures = payPaidIn(client, month, data.items)
  const sheet = buildBalanceSheet(clientId, data.items)
  const index = sheet.months.indexOf(month)
  const term = termOf(month)
  const odd = Number(month.slice(5)) % 2 === 1
  const termNote = odd
    ? `${shortMonth(month)} so far, paid with ${shortMonth(nextMonth(month))} on 15 ${shortMonth(nextMonth(nextMonth(month)))}`
    : `${term.label}, paid 15 ${shortMonth(nextMonth(month))}`
  const row = (
    account: string,
    name: string,
    basis: string,
    ledger: number,
    balanceNote?: string
  ): PayrollRow => {
    const reported = ledger - effectOn(findings, account)
    return {
      account,
      name,
      basis,
      reported,
      ledger,
      difference: ledger - reported,
      balance: balanceNote ? balanceAt(sheet.lines, account, index) : undefined,
      balanceNote,
    }
  }
  const extra = (account: string) => findings.reduce((sum, f) => sum + (f.effect[account] ?? 0), 0)
  // The ledger has whatever the findings describe; the a-melding lacks it
  // until it is fixed.
  const rows = [
    row("5000", "Salaries", "Gross pay reported", pay.gross + extra("5000")),
    row("2600", "Tax withheld", "Withholding reported", pay.tax + extra("2600"), termNote),
    row("2770", "Employer's NI", "14.1% of the pay reported", pay.employer + extra("2770"), termNote),
    row("2940", "Holiday pay", "10.2% of the holiday pay basis", pay.holiday + extra("2940"), "Earned since 1 Jan, paid out in June"),
    row("2780", "Employer's NI on holiday pay", "14.1% of the holiday pay", pay.holidayEmployer + extra("2780"), "On the holiday pay owed"),
  ]
  return {
    hours: prevMonth(month),
    term,
    rows,
    findings,
    difference: rows.reduce((sum, r) => sum + Math.abs(r.difference), 0),
  }
}

// ── Ledgers: suppliers against 2400, customers against 1500 ──

export type SubledgerLine = {
  label: string
  detail: string
  amount: number
  /** An invoice from Bookkeeping; opens in the panel. */
  itemId?: string
}

export type LedgerCheck = {
  account: "2400" | "1500"
  name: string
  subledgerName: string
  /** The account on the trial balance. */
  balance: number
  lines: SubledgerLine[]
  subledger: number
  difference: number
}

export type LedgersCheck = {
  accounts: LedgerCheck[]
  findings: FindingState[]
}

const day = (iso: string) => `${Number(iso.slice(8))} ${shortMonth(iso.slice(0, 7))}`

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

export function ledgersCheck(data: ReconData, clientId: string, month: string): LedgersCheck {
  const client = CLIENT_BY_ID.get(clientId)!
  const findings = withState(
    findingsFor(client, month, data.items).filter((f) => f.section === "ledgers"),
    data.periods
  )
  const sheet = buildBalanceSheet(clientId, data.items)
  const index = sheet.months.indexOf(month)
  const end = lastDay(month)

  // Suppliers: the invoices booked by month end and not paid by then. The
  // agent's lines from Bookkeeping by name, the rest of Tripletex's supplier
  // ledger together.
  const open = data.items
    .filter(
      (i) =>
        i.clientId === clientId &&
        i.kind === "invoice" &&
        // Owed to an employee (2910), and credit notes netted out with the
        // invoices they clear.
        !i.expense &&
        !i.creditFor &&
        !data.items.some((c) => c.creditFor === i.id && c.status === "booked") &&
        i.status === "booked" &&
        i.period <= month &&
        i.date <= end &&
        (i.dueDate ?? "") > end
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
  const payables = balanceAt(sheet.lines, "2400", index)
  const listed = open.reduce((sum, i) => sum + Math.abs(i.amount), 0)
  const rest = Math.max(payables - listed - effectOn(findings, "2400"), 0)
  // A plausible count for the rest: more invoices as the balance grows, not
  // in proportion.
  const restCount = Math.max(1, Math.round(Math.sqrt(rest / 220) * (0.9 + (hash(`${clientId}-${month}-ap`) % 20) / 100)))
  const supplierLines: SubledgerLine[] = [
    ...open.map((i) => ({
      label: i.title,
      detail: `Invoice ${day(i.date)} · due ${day(i.dueDate!)}${i.backdated ? " · booked after the close" : ""}`,
      amount: Math.abs(i.amount),
      itemId: i.id,
    })),
    {
      label: open.length ? "Other open invoices" : "Open invoices",
      detail: `${restCount} ${restCount === 1 ? "invoice" : "invoices"} from ${Math.max(1, Math.round(restCount / 2.4))} suppliers, in Tripletex`,
      amount: rest,
    },
  ]

  // Customers: invoice businesses by age, card businesses by settlement.
  const receivables = balanceAt(sheet.lines, "1500", index)
  const arEffect = effectOn(findings, "1500")
  const sales = buildReport(clientId, month).salesDetail
  const customerLines: SubledgerLine[] = []
  if (sales.kind === "pos") {
    customerLines.push({
      label: "Card sales not paid out yet",
      detail: "Nets pays card sales out two banking days after",
      amount: receivables - arEffect,
    })
  } else {
    // The same overdue invoices the customer's monthly report lists.
    const notDue = receivables - sales.overdue.amount - arEffect
    const average = Math.max(receivables / Math.max(sales.sent, 1), 1)
    const count = Math.max(1, Math.round(notDue / average))
    customerLines.push({
      label: "Not due yet",
      detail: `${count} ${count === 1 ? "invoice" : "invoices"}, most of them sent in ${monthName(month)}`,
      amount: notDue,
    })
    if (sales.overdue.count)
      customerLines.push({
        label: "Overdue",
        detail: `${sales.overdue.count} ${sales.overdue.count === 1 ? "invoice" : "invoices"}, as in the customer's monthly report`,
        amount: sales.overdue.amount,
      })
  }

  const check = (
    account: LedgerCheck["account"],
    name: string,
    subledgerName: string,
    balance: number,
    lines: SubledgerLine[]
  ): LedgerCheck => {
    const subledger = lines.reduce((sum, l) => sum + l.amount, 0)
    return { account, name, subledgerName, balance, lines, subledger, difference: balance - subledger }
  }
  return {
    accounts: [
      check("2400", "Accounts payable", "Supplier ledger", payables, supplierLines),
      check("1500", "Accounts receivable", "Customer ledger", receivables, customerLines),
    ],
    findings,
  }
}

// ── VAT: the VAT accounts against the returns ──

export type VatRow = {
  id: string
  /** "T4 · Jul–Aug", "T5 · Sep so far". */
  label: string
  months: string[]
  /** filed: went to Skatteetaten. drafted: both months closed. so_far: the
      term is still running. */
  state: "filed" | "drafted" | "so_far"
  due?: string
  ledger: number
  /** What the return says (or will say: the agent drafts from the ledger). */
  filed: number
  difference: number
  /** Invoices booked into the term after its return went in. */
  late: number
}

export type VatCheck = {
  rows: VatRow[]
  ledger: number
  /** 2700–2740 on the trial balance. */
  balance: number
}

export function vatCheck(data: ReconData, clientId: string, month: string): VatCheck {
  const client = CLIENT_BY_ID.get(clientId)!
  const filings = getClientFilings(client, data.items, data)
  const sheet = buildBalanceSheet(clientId, data.items)
  const index = sheet.months.indexOf(month)
  const rows = openVatTerms(client, month).map((months): VatRow => {
    const id = vatFilingId(client, months[0])
    const filing = filings.find((f) => f.id === id)
    const ledger = vatOnLedger(client, months, data.items)
    const wasFiled = filing?.status === "submitted" || Boolean(filing?.correction)
    const corrected = new Set(data.progress.corrections[id]?.itemIds ?? [])
    const uncorrected = data.items.filter(
      (i) =>
        i.clientId === clientId && i.backdated && months.includes(i.period) && !corrected.has(i.id)
    )
    const filed = wasFiled ? ledger + uncorrected.reduce((sum, i) => sum + inputVat(i), 0) : ledger
    const term = id.match(/T(\d)$/)?.[1]
    const span =
      months.length === 1
        ? `${shortMonth(months[0])} so far`
        : `${shortMonth(months[0])}–${shortMonth(months.at(-1)!)}`
    const whole = term ? months.length === 2 : months.at(-1)!.endsWith("-12")
    return {
      id,
      label: term ? `T${term} · ${span}` : `${months[0].slice(0, 4)} · ${whole ? "the year" : `Jan–${shortMonth(months.at(-1)!)} so far`}`,
      months,
      state: wasFiled ? "filed" : whole && filing?.status === "ready" ? "drafted" : "so_far",
      due: filing?.due,
      ledger,
      filed,
      difference: ledger - filed,
      late: wasFiled ? uncorrected.length : 0,
    }
  })
  return {
    rows,
    ledger: rows.reduce((sum, r) => sum + r.ledger, 0),
    balance: balanceAt(sheet.lines, "2740", index),
  }
}
