// VAT returns and annual reporting: the filings that don't follow the monthly
// rhythm. One list per client, whatever month is in view, so a return can be
// done early, late or on time without hunting for the right month.
import { formatAmount } from "./format"
import { CLIENT_BY_ID, hash, hasFilings, LATE_JOINER_ID, MONTHS, monthName } from "./data"
import { TODAY } from "./deadlines"
import { aMeldingFilings } from "./payroll"
import { vatFor } from "./report"
import { isWorkable, monthStatus, signKey } from "./periods"
import { isMonthClosed, type Signoffs } from "./signoffs"
import type { Client, ReviewItem, Stamp } from "./types"

export type FilingKind =
  | "mva"
  | "shareholders"
  | "tax_return"
  | "annual_accounts"
  /** Pay, tax withheld and employer's NI for a month, to the a-ordningen. */
  | "a_melding"

export type FilingGroup = "vat" | "annual" | "payroll"

/** submitted: filed. ready: the agent drafted it and every month it covers
    is closed. in_progress: some months still open. upcoming: nothing to do
    yet. A ready filing past its due date is also `late`. */
export type FilingStatus = "submitted" | "ready" | "in_progress" | "upcoming"

export type Filing = {
  id: string
  clientId: string
  kind: FilingKind
  group: FilingGroup
  /** "MVA-melding", "Skattemelding"… */
  name: string
  /** "T4 · Jul–Aug 2026", "2025". */
  period: string
  /** Short column label for the overview: "T4", "2025". */
  short: string
  due: string
  status: FilingStatus
  late: boolean
  detail: string
  /** VAT to pay (positive) or reclaim (negative). */
  amount?: number
  stamp?: Stamp
  /** A filed return that late invoices were booked into: it needs a
      corrected return for them. `amount` is then the change. */
  correction?: { itemIds: string[] }
  /** Invoices dated in the term that came in after it closed. */
  lateInvoices?: number
  /** Where the underlying work lives. */
  href: string
}

export const FILING_KIND_LABEL: Record<FilingKind, string> = {
  mva: "MVA-melding",
  shareholders: "Aksjonærregisteroppgave",
  tax_return: "Skattemelding",
  annual_accounts: "Årsregnskap",
  a_melding: "A-melding",
}

/** What each form is, for people who don't read Norwegian forms daily. */
export const FILING_KIND_HINT: Record<FilingKind, string> = {
  mva: "VAT return",
  shareholders: "Shareholder register",
  tax_return: "Company tax return",
  annual_accounts: "Annual accounts",
  a_melding: "Pay and tax report",
}

const YEAR = 2026

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })

function period(month: number) {
  return `${YEAR}-${String(month).padStart(2, "0")}`
}

/** "Sep", not Intl's "Sept". */
function mon(month: number) {
  return monthName(period(month))
}

/** Months before the prototype's data starts count as closed and filed. */
function closedMonth(clientId: string, month: string, signed: Signoffs) {
  const oldest = MONTHS[MONTHS.length - 1].id
  return month < oldest || isMonthClosed(clientId, month, signed)
}

function submittedOn(due: string, seed: string) {
  const date = new Date(due)
  date.setDate(date.getDate() - 1 - (hash(seed) % 6))
  return `Submitted ${dayFmt.format(date)}`
}

/** The return the agent drafts: the same figures as the customer's monthly
    report ("VAT, Jul–Aug" under Coming up), to the krone instead of rounded. */
function vatAmount(client: Client, months: string[]): number {
  return Math.round(vatFor(client, months))
}

function vatFilings(
  client: Client,
  items: ReviewItem[],
  signed: Signoffs
): Filing[] {
  const base = `/clients/${client.id}`
  const filed = (id: string) => signed.progress.filings[id]

  if (client.vatTerm === "Annual") {
    const last = `${client.id}-mva-${YEAR - 1}`
    const current = `${client.id}-mva-${YEAR}`
    const closed = Array.from({ length: 12 }, (_, i) => period(i + 1)).filter(
      (m) => closedMonth(client.id, m, signed)
    ).length
    return [
      {
        id: last,
        clientId: client.id,
        kind: "mva",
        group: "vat",
        name: FILING_KIND_LABEL.mva,
        period: `Annual · ${YEAR - 1}`,
        short: String(YEAR - 1),
        due: `${YEAR}-03-10`,
        status: "submitted",
        late: false,
        detail: submittedOn(`${YEAR}-03-10`, last),
        href: `${base}/filings`,
      },
      {
        id: current,
        clientId: client.id,
        kind: "mva",
        group: "vat",
        name: FILING_KIND_LABEL.mva,
        period: `Annual · ${YEAR}`,
        short: String(YEAR),
        due: `${YEAR + 1}-03-10`,
        status: filed(current) ? "submitted" : closed > 0 ? "in_progress" : "upcoming",
        late: false,
        detail: filed(current)
          ? "Submitted to Skatteetaten"
          : `${closed} of 12 months closed · drafted once December closes`,
        stamp: filed(current),
        href: `${base}/filings`,
      },
    ]
  }

  // Bi-monthly terms. Due the 10th of the second month after the term,
  // except T3 (31 Aug) and T6 (10 Feb next year).
  const DUE = [
    `${YEAR}-04-10`,
    `${YEAR}-06-10`,
    `${YEAR}-08-31`,
    `${YEAR}-10-10`,
    `${YEAR}-12-10`,
    `${YEAR + 1}-02-10`,
  ]
  return DUE.map((due, index) => {
    const term = index + 1
    const months = [period(term * 2 - 1), period(term * 2)]
    const id = `${client.id}-mva-${YEAR}-T${term}`
    const closed = months.filter((m) => closedMonth(client.id, m, signed))
    // The return is drafted once the term's months are reconciled, closed or
    // not: the VAT goes in, then the last month closes (as in Tripletex,
    // where creating the return locks the term).
    const reconciled = months.filter(
      (m) =>
        closed.includes(m) ||
        (isWorkable(monthStatus(client.id, m, signed)) &&
          Boolean(signed.periods?.signed[signKey(client.id, m, "vat")]))
    )
    const oldest = MONTHS[MONTHS.length - 1].id
    // Terms that ended before the data starts, or were due before today,
    // were filed in the seed, and ones before a new client's takeover by
    // their previous accountant.
    const before = Boolean(client.since && months[1] < client.since)
    const seededFiled = months[1] < oldest || due < TODAY || before
    const stamp = filed(id)
    const started = months[0] <= MONTHS[0].id
    // Invoices booked back into the term after it closed.
    const late = items.filter(
      (i) => i.clientId === client.id && i.backdated && months.includes(i.period)
    )
    // Bookings corrected after the fact: input VAT taken back.
    const fixes = items.filter(
      (i) => i.clientId === client.id && i.vatFix && months.includes(i.period)
    )
    const fixVat = (list: ReviewItem[]) => list.reduce((sum, i) => sum + (i.vatFix?.vat ?? 0), 0)
    const corrected = new Set(signed.progress.corrections[id]?.itemIds ?? [])
    const uncorrected = late.filter((i) => !corrected.has(i.id))
    // A fix made before the return went in is in it: only later ones need
    // a corrected return.
    const unfixed = fixes.filter((i) => !corrected.has(i.id) && !(stamp && i.vatFix!.at <= stamp.at))
    const lateVat = (list: ReviewItem[]) => list.reduce((sum, i) => sum + inputVat(i), 0)
    const wasFiled = seededFiled || Boolean(stamp)
    const correction = wasFiled && uncorrected.length + unfixed.length > 0
    const status: FilingStatus =
      wasFiled && !correction
        ? "submitted"
        : reconciled.length === 2 || correction
          ? "ready"
          : started
            ? "in_progress"
            : "upcoming"
    const amount = correction
      ? fixVat(unfixed) - lateVat(uncorrected)
      : status === "ready" || wasFiled
        ? vatAmount(client, months) - lateVat(late) + fixVat(fixes)
        : undefined
    const monthStates = months
      .map((m) => {
        const name = mon(Number(m.slice(5)))
        if (closed.includes(m)) return `${name} closed`
        if (reconciled.includes(m)) return `${name} reconciled`
        return m <= MONTHS[0].id ? `${name} open` : `${name} not started`
      })
      .join(" · ")
    return {
      id,
      clientId: client.id,
      kind: "mva",
      group: "vat",
      name: FILING_KIND_LABEL.mva,
      period: `T${term} · ${mon(term * 2 - 1)}–${mon(term * 2)} ${YEAR}`,
      short: `T${term}`,
      due,
      status,
      late: status === "ready" && !correction && due < TODAY,
      detail: correction
        ? `Corrected return for ${[
            uncorrected.length
              ? `${uncorrected.length} late ${uncorrected.length === 1 ? "invoice" : "invoices"} booked into ${mon(term * 2 - 1)}–${mon(term * 2)}`
              : "",
            unfixed.length
              ? `input VAT taken back on ${unfixed.length} ${unfixed.length === 1 ? "booking" : "bookings"} (${unfixed[0].title})`
              : "",
          ]
            .filter(Boolean)
            .join(" and ")}`
        : status === "submitted"
          ? signed.progress.corrections[id]
            ? "Corrected return submitted through Altinn"
            : stamp
              ? "Submitted to Skatteetaten through Altinn"
              : before
                ? "Filed by the previous accountant"
                : submittedOn(due, id)
          : status === "ready"
            ? [
                closed.length === 2
                  ? "Both months closed, return drafted by the agent"
                  : `Both months reconciled, return drafted by the agent · submit it, then close ${mon(term * 2)}`,
                late.length ? `includes ${late.length} late ${late.length === 1 ? "invoice" : "invoices"}` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : status === "in_progress"
              ? monthStates
              : `Term starts 1 ${mon(term * 2 - 1)}`,
      amount,
      stamp,
      correction: correction ? { itemIds: [...late, ...fixes].map((i) => i.id) } : undefined,
      lateInvoices: late.length || undefined,
      href:
        status === "in_progress" ? `${base}/report` : `${base}/filings`,
    } satisfies Filing
  })
}

function annualFilings(client: Client, signed: Signoffs): Filing[] {
  const base = `/clients/${client.id}`
  const late = client.id === LATE_JOINER_ID
  const out: Filing[] = []

  for (const year of [YEAR - 1, YEAR]) {
    const forms: { kind: FilingKind; due: string }[] = [
      { kind: "shareholders", due: `${year + 1}-01-31` },
      { kind: "tax_return", due: `${year + 1}-05-31` },
      { kind: "annual_accounts", due: `${year + 1}-07-31` },
    ]
    const closed = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, "0")}`
    ).filter((m) => year < YEAR || closedMonth(client.id, m, signed)).length

    for (const form of forms) {
      const id = `${client.id}-${form.kind}-${year}`
      const stamp = signed.progress.filings[id]
      // Last year was filed in the seed, except what the late joiner's
      // previous accountant left undone.
      const seededFiled =
        year < YEAR && !(late && form.kind !== "shareholders")
      const status: FilingStatus =
        stamp || seededFiled
          ? "submitted"
          : year < YEAR
            ? "ready"
            : "upcoming"
      out.push({
        id,
        clientId: client.id,
        kind: form.kind,
        group: "annual",
        name: FILING_KIND_LABEL[form.kind],
        period: String(year),
        short: String(year),
        due: form.due,
        status,
        late: status === "ready" && form.due < TODAY,
        detail:
          status === "submitted"
            ? stamp
              ? form.kind === "annual_accounts"
                ? "Submitted to Brønnøysundregistrene"
                : "Submitted to Skatteetaten through Altinn"
              : submittedOn(form.due, id)
            : status === "ready"
              ? "Drafted from the 2025 balance imported at onboarding"
              : `${closed} of 12 months closed · opens when December closes`,
        stamp,
        href: `${base}/filings`,
      })
    }
  }
  return out
}

/** The VAT return a month belongs to: its bi-monthly term, or the year. */
export function vatFilingId(client: Client, month: string) {
  if (client.vatTerm === "Annual") return `${client.id}-mva-${month.slice(0, 4)}`
  return `${client.id}-mva-${month.slice(0, 4)}-T${Math.ceil(Number(month.slice(5)) / 2)}`
}

/** An invoice that arrived after its own month closed, waiting in a later
    month. One already in its own (reopened) month is an ordinary invoice. */
export function isLateInvoice(item: ReviewItem) {
  const dated = item.date.slice(0, 7)
  return (
    item.kind === "invoice" &&
    item.status !== "booked" &&
    dated < MONTHS[0].id &&
    dated < item.period
  )
}

export type LateInvoice = {
  /** The closed month it is dated in. */
  month: string
  /** The VAT return that month belongs to, and whether it went in. */
  filing: { short: string }
  filed: boolean
  /** The return it goes in if it is booked where it waits instead. */
  next: { short: string }
  /** Its month is reopened already: booking it there reopens nothing. */
  reopened: boolean
}

/** "T4", or the year for an annual VAT client. */
function termShort(client: Client, month: string) {
  return vatFilingId(client, month).match(/T\d$/)?.[0] ?? month.slice(0, 4)
}

export function lateInvoiceInfo(
  item: ReviewItem,
  items: ReviewItem[],
  signed: Signoffs
): LateInvoice | undefined {
  if (!isLateInvoice(item)) return undefined
  const client = CLIENT_BY_ID.get(item.clientId)!
  const filings = getClientFilings(client, items, signed)
  const month = item.date.slice(0, 7)
  // A client whose VAT isn't ours to file still has terms to name.
  const filing = filings.find((f) => f.id === vatFilingId(client, month))
  return {
    month,
    filing: { short: termShort(client, month) },
    filed: filing ? filing.status === "submitted" || Boolean(filing.correction) : false,
    next: { short: termShort(client, item.period) },
    reopened: monthStatus(client.id, month, signed) === "reopened",
  }
}

/** The VAT return for the term `month` is in has gone to Skatteetaten:
    booking into the term now needs a corrected return. */
export function vatTermFiled(clientId: string, month: string, items: ReviewItem[], signed: Signoffs) {
  const client = CLIENT_BY_ID.get(clientId)
  if (!client || !hasFilings(clientId)) return false
  const filing = getClientFilings(client, items, signed).find((f) => f.id === vatFilingId(client, month))
  return filing?.status === "submitted"
}

/** Input VAT on an invoice (amounts include VAT). Reverse charge nets out. */
export function inputVat(item: ReviewItem) {
  const rate = Number(item.suggestion.lines[0].vat?.match(/Input (\d+)%/)?.[1] ?? 0)
  return Math.round((Math.abs(item.amount) * rate) / (100 + rate))
}

export function getClientFilings(
  client: Client,
  items: ReviewItem[],
  signed: Signoffs
): Filing[] {
  if (!hasFilings(client.id)) return []
  return [
    ...vatFilings(client, items, signed),
    ...annualFilings(client, signed),
    ...aMeldingFilings(client, items, signed),
  ]
}

/** What needs the accountant: late or ready first, then by due date. */
export function needsAction(filing: Filing) {
  return filing.status === "ready"
}

export function byUrgency(a: Filing, b: Filing) {
  return Number(b.late) - Number(a.late) || a.due.localeCompare(b.due)
}

export function formatVatAmount(amount: number) {
  return amount >= 0
    ? `To pay ${formatAmount(amount)}`
    : `To reclaim ${formatAmount(-amount)}`
}
