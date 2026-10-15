// The month's close: what has to be done before the report goes out, and
// whether it already went. In the order the work is done: book the month's
// invoices, have the salaries paid in it reported, then reconcile the bank
// against both. Salaries go out the month after the hours, so October's
// close holds September's hours (paid in October) and their A-melding, due
// 5 November; October's own hours are paid, and closed, with November.
// Every booking, approval, match and bank fix moves it. The payroll,
// supplier, customer and VAT reconciliations finish the work, signed off on
// the Reconciliation tab next to the bank's.
// Months before the open one are closed; a reopened month runs the track
// again and ends with an updated report (see periods.ts).
import { heldInvoices, invoiceApprovals, type ApprovalsState } from "./approvals"
import type { OnboardingCase } from "./onboarding"
import { addDays, CLIENT_BY_ID, dayLabel, MONTHS, monthLabel, tabOf } from "./data"
import { awaitedCreditNotes } from "./documents"
import { getClientFilings, vatFilingId } from "./filings"
import { formatAmount } from "./format"
import { reconSections } from "./ledger-recon"
import {
  migratePeriods,
  monthHistory,
  monthStatus,
  reportVersion,
  type MonthEvent,
  type MonthStatus,
} from "./periods"
import { getBankReconciliation, type BankReconciliation } from "./reconciliation"
import { closeKey, draftNote } from "./report"
import { aMeldingFilings, getPayroll } from "./payroll"
import { type PeopleState } from "./people"
import { type Signoffs } from "./signoffs"
import type { CustomerRequest, ReviewItem } from "./types"

export type CloseStep = {
  id: "bookkeeping" | "bank" | "payroll" | "ledgers" | "vat"
  label: string
  done: boolean
  /** What is left, or that it is done. */
  detail: string
  /** How far along, 0 to 1, from the items and lines behind it. */
  progress: number
  href: string
}

export type MonthClose = {
  closed: boolean
  closedAt?: string
  note?: string
  steps: CloseStep[]
  /** Every step done and not yet closed: the report can go out. */
  readyToSend: boolean
  bank: BankReconciliation
  status: MonthStatus
  /** Reports sent so far: 2 and up means the customer has an updated one. */
  version: number
  /** Closes and reopens, oldest first. */
  history: MonthEvent[]
}

/** "September", from "2026-09". */
function long(month: string) {
  return monthLabel(month).split(" ")[0]
}

function share(done: number, total: number) {
  return total ? done / total : 1
}

function left(open: ReviewItem[], noun: string) {
  const review = open.filter(
    (i) => i.status === "needs_review" || i.status === "customer_replied"
  ).length
  const waiting = open.filter((i) => i.status === "waiting_customer").length
  return [
    review ? `${review} ${review === 1 ? noun : `${noun}s`} to review` : "",
    waiting ? `${waiting} with the customer` : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

export function getMonthClose(
  data: Signoffs & {
    items: ReviewItem[]
    requests?: CustomerRequest[]
    people?: PeopleState
    approvals?: ApprovalsState
    onboarding?: OnboardingCase[]
  },
  clientId: string,
  month: string
): MonthClose {
  const meta = MONTHS.find((m) => m.id === month)
  const client = CLIENT_BY_ID.get(clientId)!
  const own = data.items.filter(
    (i) => i.clientId === clientId && i.period === month
  )
  const base = `/clients/${clientId}`
  const bk = own.filter((i) => tabOf(i) === "bookkeeping")
  const bkOpen = bk.filter((i) => i.status !== "booked")
  // The whole store (most callers) knows which invoices weren't paid.
  const held =
    data.approvals && data.onboarding && data.requests
      ? heldInvoices(
          { ...data, approvals: data.approvals, onboarding: data.onboarding, requests: data.requests },
          clientId
        )
      : undefined
  const bank = getBankReconciliation(client, month, data.items, data.progress, held)
  // An invoice the customer rejected is booked but not settled: credit
  // note or pay anyway, before the month can close on it.
  const unsettled =
    data.approvals && data.onboarding && data.requests
      ? invoiceApprovals(
          { ...data, approvals: data.approvals, onboarding: data.onboarding, requests: data.requests },
          clientId
        ).filter((a) => a.status === "rejected" && a.item.period === month).length
      : 0

  // Credit notes asked for and not booked yet: said, not blocking. The
  // invoice stays unpaid on 2400 and the reconciliation carries it.
  const awaited =
    data.approvals && data.onboarding && data.requests
      ? awaitedCreditNotes(
          { ...data, approvals: data.approvals, onboarding: data.onboarding, requests: data.requests },
          clientId
        ).filter((a) => a.item.period === month).length
      : 0

  const steps: CloseStep[] = [
    {
      id: "bookkeeping",
      label: "Book the invoices",
      done: bkOpen.length === 0 && unsettled === 0,
      progress: share(bk.length - bkOpen.length - unsettled, bk.length),
      detail:
        bkOpen.length || unsettled
          ? [
              bkOpen.length ? left(bkOpen, "document") : "",
              unsettled ? `${unsettled} rejected ${unsettled === 1 ? "invoice" : "invoices"} to settle` : "",
              awaited ? `${awaited} credit ${awaited === 1 ? "note" : "notes"} awaited` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : [
              `${bk.length} ${bk.length === 1 ? "document" : "documents"} booked`,
              awaited ? `${awaited} credit ${awaited === 1 ? "note" : "notes"} awaited` : "",
            ]
              .filter(Boolean)
              .join(" · "),
      href: `${base}/bookkeeping`,
    },
  ]
  // Salaries are paid the month after the hours, so a month's books hold
  // the run paid in it: last month's hours, and the A-melding that reports
  // them (due the 5th of the next month). This month's hours are paid, and
  // closed, with the next month; the payroll reconciliation reads the same.
  const hours = addDays(`${month}-01`, -1).slice(0, 7)
  const payroll = getPayroll(data.items, data.progress, clientId, hours, data.closing)
  if (payroll.lines.length && !(client.since && hours < client.since)) {
    const { paid, ready, open, skipped, runs } = payroll
    const filing = aMeldingFilings(client, data.items, data).find(
      (f) => f.id === `${clientId}-amelding-${month}`
    )
    const filed = !filing || filing.status === "submitted"
    const lastPay = runs.at(-1)?.payDate
    const decided = paid.length + skipped.length
    steps.push({
      id: "payroll",
      label: `Salaries paid in ${long(month)}`,
      done: payroll.done && filed,
      progress: share(decided + 0.9 * ready.length + (filed ? 1 : 0), payroll.lines.length + 1),
      detail: [
        payroll.done
          ? `${long(hours)} hours paid${lastPay ? ` ${dayLabel(lastPay)}` : ""}${runs.length > 1 ? ` in ${runs.length} runs` : ""}`
          : [
              `${long(hours)} hours`,
              open.length ? left(open, "employee") : "",
              ready.length ? `${ready.length} approved, run to approve` : "",
            ]
              .filter(Boolean)
              .join(": "),
        skipped.length ? `${skipped.length} not paid` : "",
        filing
          ? filed
            ? "A-melding submitted"
            : `A-melding to submit${filing.late ? ", late" : `, due ${dayLabel(filing.due)}`}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: payroll.done && !filed ? `${base}/filings` : `${base}/payroll`,
    })
  }
  // Card receipts are booked from their bank lines, so they count here.
  const receipts = [...bank.suggested, ...bank.waiting].filter((l) => l.kind === "receipt").length
  const toMatch = bank.suggested.length + bank.waiting.length + bank.unmatched.length - receipts
  steps.push({
    id: "bank",
    label: "Reconcile the bank",
    done: bank.reconciled,
    progress: bank.reconciled
      ? 1
      : share(
          bank.matched.length + bank.fixed.length,
          bank.lines.length + bank.open.length + bank.fixed.length
        ),
    detail: bank.reconciled
      ? bank.carried.length
        ? `Matches DNB, ${formatAmount(Math.abs(bank.difference))} carried over`
        : `All ${bank.accounts.length} accounts match their DNB statements`
      : [
          receipts ? `${receipts} card ${receipts === 1 ? "receipt" : "receipts"} to book` : "",
          toMatch ? `${toMatch} bank ${toMatch === 1 ? "line" : "lines"} to match` : "",
          bank.open.length
            ? `${bank.open.length} ledger ${bank.open.length === 1 ? "issue" : "issues"} to fix`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
    href: `${base}/reconciliation`,
  })

  const view = { ...data, periods: migratePeriods(data.periods) }
  const sections = reconSections(view, clientId, month).filter((s) => s.applicable)
  if (sections.length) {
    const signed = sections.filter((s) => s.done).length
    const open = sections.reduce((sum, s) => sum + s.open, 0)
    const names = { payroll: "payroll", ledgers: "ledgers", vat: "VAT" }
    const toSign = sections.filter((s) => !s.done).map((s) => names[s.section])
    steps.push({
      id: "ledgers",
      label: "Reconcile payroll and ledgers",
      done: signed === sections.length,
      progress: share(signed, sections.length),
      detail:
        signed === sections.length
          ? "Signed off against the trial balance"
          : [
              open ? `${open} ${open === 1 ? "difference" : "differences"} to explain` : "",
              `${toSign.join(", ").replace(/, ([^,]*)$/, " and $1")} to sign off`,
            ]
              .filter(Boolean)
              .join(" · ")
              .replace(/^./, (c) => c.toUpperCase()),
      href: `${base}/reconciliation`,
    })
  }

  // The month that ends a VAT term files its return before it closes: the
  // return is drafted once the term is reconciled (filings.ts), and a
  // reopened month with late invoices in it files the corrected one.
  // (An annual return follows the annual accounts, not December's close.)
  const termEnd = client.vatTerm === "Bi-monthly" && Number(month.slice(5)) % 2 === 0
  const vatReturn = termEnd
    ? getClientFilings(client, data.items, view).find((f) => f.id === vatFilingId(client, month))
    : undefined
  if (vatReturn) {
    const filed = vatReturn.status === "submitted"
    steps.push({
      id: "vat",
      label: "Submit the VAT return",
      done: filed,
      progress: filed ? 1 : vatReturn.status === "ready" ? 0.5 : 0,
      detail: filed
        ? `${vatReturn.short} ${vatReturn.correction ? "corrected return" : "return"} submitted`
        : vatReturn.status === "ready"
          ? `${vatReturn.short} ${vatReturn.correction ? "corrected return" : "return"} drafted, due ${dayLabel(vatReturn.due)}`
          : `${vatReturn.short} is drafted once the reconciliations are signed off`,
      href: `${base}/filings`,
    })
  }

  const status = monthStatus(clientId, month, view)
  const history = monthHistory(clientId, month, view)
  const version = reportVersion(clientId, month, view)
  const record = data.closing[closeKey(clientId, month)]

  // Closed before the app, and never reopened: everything was done then.
  if (meta?.status === "closed" && status === "closed" && !record && history.length <= 1) {
    return {
      closed: true,
      closedAt: meta.note.replace(/^Closed /, ""),
      note: draftNote(clientId, month),
      steps: steps.map((s) => ({ ...s, done: true, progress: 1 })),
      readyToSend: false,
      bank,
      status,
      version,
      history,
    }
  }

  const closed = status === "closed"
  const last = history.findLast((e) => e.kind === "closed")
  return {
    closed,
    closedAt: closed ? (record?.closedAt ?? last?.on) : undefined,
    // A reopened month keeps the note the customer last got until the
    // updated report replaces it.
    note: record?.note ?? (meta?.status === "closed" ? draftNote(clientId, month) : undefined),
    steps: closed ? steps.map((s) => ({ ...s, done: true, progress: 1 })) : steps,
    readyToSend: !closed && status !== "before" && steps.every((s) => s.done),
    bank,
    status,
    version,
    history,
  }
}
