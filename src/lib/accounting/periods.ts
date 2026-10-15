// Months after they close: reopening one, what that sets off, and the
// reconciliations beyond the bank (payroll, ledgers, VAT).
//
// A month is open until its report goes out; after that it is read-only.
// Customers forget invoices all the time: a small one is booked in the
// month it turns up, a bigger one reopens its own month. Reopening opens
// the month's bookkeeping and reconciliation again, and closing it again
// sends the customer an updated report. Every close and reopen after the
// seed is kept here, with who did it and why, so the month report can show
// the month's history. The reconciliations beyond the bank are signed off
// here too, section by section, and their findings settled.
import {
  ACCOUNTANT_BY_ID,
  CLIENT_BY_ID,
  CURRENT_USER,
  hash,
  isOpenPeriod,
  MONTHS,
  monthName,
  paidFromAccount,
} from "./data"
import { TODAY } from "./deadlines"
import { closeKey, shortMonth, type Closing } from "./report"
import type { StoreState } from "./store"
import { log } from "./trail"
import type { IssueKind, ReconResolution, ReviewItem, Stamp } from "./types"

/** A forgotten invoice under this amount (VAT included) is booked in the
    month it turns up, by default. From it up, its own month is reopened so
    the VAT lands in the right term. A firm habit, not a rule of law. */
export const LATE_INVOICE_LIMIT = 10_000

/** open: being worked. closed: the report went out, read-only.
    reopened: closed once and open again until it is closed again.
    before: a month before we took the client over. */
export type MonthStatus = "open" | "closed" | "reopened" | "before"

export type MonthEvent = {
  kind: "closed" | "reopened"
  /** "28 Sep", like a closing record's `closedAt`. */
  on: string
  by: string
  /** Why it was reopened. */
  reason?: string
}

/** The reconciliations next to the bank's. */
export type ReconSection = "payroll" | "ledgers" | "vat"

export type PeriodsState = {
  /** Per `closeKey`: the month's closes and reopens, oldest first. Only
      kept once a month is reopened; before that the seed (or the closing
      record) is all there is. */
  history: Record<string, MonthEvent[]>
  /** Reconciliation findings settled, by finding id. */
  findings: Record<string, ReconResolution>
  /** Reconciliations signed off, by `signKey`. */
  signed: Record<string, Stamp>
}

export function seedPeriods(): PeriodsState {
  return { history: {}, findings: {}, signed: {} }
}

/** Saved before this existed (or by an older build): fill in what's missing. */
export function migratePeriods(saved: Partial<PeriodsState> | undefined): PeriodsState {
  return { ...seedPeriods(), ...saved }
}

export function signKey(clientId: string, month: string, section: ReconSection) {
  return `${closeKey(clientId, month)}:${section}`
}

/** What the store holds that a month's status reads. `state` fits. */
type View = { closing: Closing; periods?: PeriodsState }

/** The one place that says whether a month can still be worked. */
export function monthStatus(clientId: string, month: string, s: View): MonthStatus {
  const since = CLIENT_BY_ID.get(clientId)?.since
  if (since && month < since) return "before"
  const last = s.periods?.history[closeKey(clientId, month)]?.at(-1)
  if (last) return last.kind === "reopened" ? "reopened" : "closed"
  if (s.closing[closeKey(clientId, month)]) return "closed"
  const meta = MONTHS.find((m) => m.id === month)
  if (meta) return meta.status
  // Before the data starts everything is closed; after the open month,
  // nothing is yet.
  return month < MONTHS.at(-1)!.id ? "closed" : "open"
}

/** Lines in it can be booked, matched and reconciled. */
export function isWorkable(status: MonthStatus) {
  return status === "open" || status === "reopened"
}

/** Whether a line can still be decided on. Bookkeeping follows its month;
    pay lines follow the pay period, which runs ahead of it. */
export function isEditable(
  item: Pick<ReviewItem, "clientId" | "domain" | "period">,
  s: View
) {
  if (item.domain === "payroll") return isOpenPeriod(item)
  return isWorkable(monthStatus(item.clientId, item.period, s))
}

/** "2026-09-28" as "28 Sep". */
export function dayLabel(iso: string) {
  return `${Number(iso.slice(8))} ${shortMonth(iso.slice(0, 7))}`
}

/** The month's closes and reopens, oldest first, starting with the close
    before any reopen (the seed's or the accountant's first). */
export function monthHistory(clientId: string, month: string, s: View): MonthEvent[] {
  const events = s.periods?.history[closeKey(clientId, month)]
  if (events?.length) return events
  const first = firstClose(clientId, month, s.closing)
  return first ? [first] : []
}

function firstClose(clientId: string, month: string, closing: Closing): MonthEvent | undefined {
  const record = closing[closeKey(clientId, month)]
  if (record) return { kind: "closed", on: record.closedAt, by: CURRENT_USER.name }
  const meta = MONTHS.find((m) => m.id === month)
  if (meta?.status !== "closed") return undefined
  const accountant = ACCOUNTANT_BY_ID.get(CLIENT_BY_ID.get(clientId)?.accountantId ?? "")
  return {
    kind: "closed",
    on: meta.note.replace(/^Closed /, ""),
    by: accountant?.name ?? CURRENT_USER.name,
  }
}

/** How many reports went out for the month. 2 and up: the customer has an
    updated report. */
export function reportVersion(clientId: string, month: string, s: View) {
  return monthHistory(clientId, month, s).filter((e) => e.kind === "closed").length
}

/** The reopen the month is in, while it is reopened. */
export function openReopen(clientId: string, month: string, s: View) {
  const last = monthHistory(clientId, month, s).at(-1)
  return last?.kind === "reopened" ? last : undefined
}

/** Booked into a month after it was closed once: its VAT return takes it
    in late, and a return already filed needs a correction for it. */
export function bookedIntoReopened(item: ReviewItem, s: View) {
  return (
    item.domain === "bookkeeping" &&
    monthStatus(item.clientId, item.period, s) === "reopened" &&
    // Booked before the close and reversed since: it was in the return
    // already. Booking it again is a correction of that booking, not a
    // late invoice for the return to take in a second time.
    !item.activity.some((a) => a.title.startsWith("Reversed voucher"))
  )
}

/** The note for an updated report: what changed, then the agent's usual
    draft from the numbers. */
export function updatedNoteIntro(clientId: string, month: string, s: View & { items: ReviewItem[] }) {
  const added = s.items.filter(
    (i) => i.clientId === clientId && i.period === month && i.backdated
  ).length
  const name = monthName(month)
  return added
    ? `Updated report: we added ${added} ${added === 1 ? "invoice" : "invoices"} that came in after we closed ${name}. `
    : `Updated report for ${name}. `
}

// ── Reopening and closing again ──

/** Reopens a closed month. Its reconciliations are signed off again once
    the new bookings are in. */
export function reopenMonth(
  state: StoreState,
  clientId: string,
  month: string,
  reason: string
): StoreState {
  if (monthStatus(clientId, month, state) !== "closed") return state
  const key = closeKey(clientId, month)
  const signed = Object.fromEntries(
    Object.entries(state.periods.signed).filter(([k]) => !k.startsWith(`${key}:`))
  )
  const event: MonthEvent = {
    kind: "reopened",
    on: dayLabel(TODAY),
    by: CURRENT_USER.name,
    reason: reason.trim() || undefined,
  }
  return {
    ...state,
    periods: {
      ...state.periods,
      signed,
      history: {
        ...state.periods.history,
        [key]: [...monthHistory(clientId, month, state), event],
      },
    },
  }
}

/** The store closed the month (its closing record is set): a month with a
    history gets the close on it, so the report counts as updated. */
export function recordClose(state: StoreState, clientId: string, month: string): StoreState {
  const key = closeKey(clientId, month)
  const events = state.periods.history[key]
  if (!events?.length || events.at(-1)?.kind === "closed") return state
  const event: MonthEvent = { kind: "closed", on: dayLabel(TODAY), by: CURRENT_USER.name }
  return {
    ...state,
    periods: { ...state.periods, history: { ...state.periods.history, [key]: [...events, event] } },
  }
}

// ── Invoices added by hand ──

/** A forgotten invoice the accountant adds from a file the customer sent. */
export type ManualInvoice = {
  clientId: string
  supplier: string
  /** ISO dates. */
  date: string
  dueDate: string
  /** VAT included, positive. */
  amount: number
  fileName?: string
  /** The month it is booked in. */
  period: string
  /** Reopen `period` first, for this reason. */
  reopen?: string
}

/** Next id for an invoice added by hand, from the count so StrictMode's
    double-invoked reducer makes the same one twice. */
export function manualInvoiceId(items: ReviewItem[], clientId: string) {
  const prefix = `${clientId}-bk-manual-`
  return `${prefix}${items.filter((i) => i.id.startsWith(prefix)).length + 1}`
}

export type SupplierGuess = {
  /** The supplier as the books spell it, when known. */
  title: string
  account: string
  vat: string
  confidence: number
  reasoning: string[]
  issue?: IssueKind
}

/** What the agent suggests for a supplier typed in by hand: how this client
    booked them before, else how other clients book them, else a first
    guess to check. */
export function suggestForSupplier(
  clientId: string,
  supplier: string,
  items: ReviewItem[]
): SupplierGuess {
  const name = supplier.trim()
  const same = (i: ReviewItem) =>
    i.domain === "bookkeeping" && i.title.toLowerCase() === name.toLowerCase()
  const own = items
    .filter((i) => i.clientId === clientId && same(i) && i.status === "booked")
    .sort((a, b) => b.period.localeCompare(a.period))
  if (own.length) {
    const line = own[0].suggestion.lines[0]
    const count = own.length
    return {
      title: own[0].title,
      account: line.account,
      vat: line.vat ?? "1 · Input 25%",
      confidence: count > 1 ? 0.94 : 0.88,
      reasoning: [
        `Booked to ${line.account} like ${own[0].title}'s ${count === 1 ? "earlier invoice" : `last ${count} invoices`}.`,
        `VAT ${line.vat ?? "1 · Input 25%"}, as before.`,
        "Added by hand: compare the amount with the uploaded invoice.",
      ],
    }
  }
  const elsewhere = items.find((i) => i.clientId !== clientId && same(i))
  if (elsewhere) {
    const line = elsewhere.suggestion.lines[0]
    return {
      title: elsewhere.title,
      account: line.account,
      vat: line.vat ?? "1 · Input 25%",
      confidence: 0.8,
      reasoning: [
        `First invoice from ${elsewhere.title} for this client.`,
        `Other clients book ${elsewhere.title} to ${line.account}.`,
      ],
    }
  }
  return {
    title: name,
    account: "6800 Office supplies",
    vat: "1 · Input 25%",
    confidence: 0.55,
    reasoning: [
      `First invoice from ${name}: no history to go by.`,
      "6800 until you pick the right account from the invoice.",
    ],
  }
}

function manualItem(state: StoreState, invoice: ManualInvoice): ReviewItem | undefined {
  const client = CLIENT_BY_ID.get(invoice.clientId)
  if (!client) return undefined
  const id = manualInvoiceId(state.items, client.id)
  const guess = suggestForSupplier(client.id, invoice.supplier, state.items)
  const amount = -Math.abs(Math.round(invoice.amount))
  const kid = String(hash(`${id}-kid`)).padStart(13, "4").slice(0, 13)
  const account = paidFromAccount(client, { kind: "invoice", subtitle: "" })
  return {
    id,
    clientId: client.id,
    domain: "bookkeeping",
    period: invoice.period,
    kind: "invoice",
    dueDate: invoice.dueDate,
    title: guess.title,
    subtitle: "Added by hand",
    date: invoice.date,
    amount,
    source: "Uploaded by the accountant",
    evidence: { label: "Invoice", attached: Boolean(invoice.fileName), fileName: invoice.fileName },
    facts: [
      { label: "Supplier", value: guess.title },
      { label: "Invoice date", value: dayLabel(invoice.date) },
      { label: "Received", value: `${dayLabel(TODAY)} · added by hand` },
      { label: "Due date", value: dayLabel(invoice.dueDate) },
      { label: "KID", value: kid, mono: true },
      { label: "Pay from", value: `DNB ${account.number}`, mono: true },
    ],
    suggestion: {
      lines: [{ account: guess.account, vat: guess.vat, amount }],
      confidence: guess.confidence,
      reasoning: guess.reasoning,
    },
    issue: guess.issue,
    status: "needs_review",
    activity: [
      log(
        "accountant",
        `Added by hand by ${CURRENT_USER.name}`,
        invoice.fileName ? `From ${invoice.fileName}.` : "No file attached yet."
      ),
      log("agent", `Suggested ${guess.account}`, guess.reasoning[0]),
    ],
  }
}

// ── Actions ──

export type PeriodsAction =
  | { type: "reopen"; clientId: string; month: string; reason: string }
  | { type: "sign"; clientId: string; month: string; section: ReconSection }
  | { type: "unsign"; clientId: string; month: string; section: ReconSection }
  | { type: "resolve_finding"; id: string; how: ReconResolution["how"] }
  | { type: "unresolve_finding"; id: string }
  | { type: "add_invoice"; invoice: ManualInvoice }

export function periodsApply(state: StoreState, action: PeriodsAction): StoreState {
  const periods = state.periods
  const stampNow = (): Stamp => ({ at: TODAY, by: CURRENT_USER.name })
  switch (action.type) {
    case "reopen":
      return reopenMonth(state, action.clientId, action.month, action.reason)

    case "sign":
      return {
        ...state,
        periods: {
          ...periods,
          signed: { ...periods.signed, [signKey(action.clientId, action.month, action.section)]: stampNow() },
        },
      }

    case "unsign": {
      const signed = { ...periods.signed }
      delete signed[signKey(action.clientId, action.month, action.section)]
      return { ...state, periods: { ...periods, signed } }
    }

    case "resolve_finding":
      return {
        ...state,
        periods: {
          ...periods,
          findings: { ...periods.findings, [action.id]: { ...stampNow(), how: action.how } },
        },
      }

    case "unresolve_finding": {
      const findings = { ...periods.findings }
      delete findings[action.id]
      return { ...state, periods: { ...periods, findings } }
    }

    case "add_invoice": {
      const { invoice } = action
      const opened = invoice.reopen !== undefined
        ? reopenMonth(state, invoice.clientId, invoice.period, invoice.reopen)
        : state
      const item = manualItem(opened, invoice)
      if (!item) return state
      return { ...opened, items: [...opened.items, item] }
    }
  }
}
