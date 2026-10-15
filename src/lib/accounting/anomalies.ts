// Anomalies: one concept across bookkeeping and payroll. The processes run
// on their own until a line is unusual against its own pattern; then a
// person looks. For an invoice that is the customer, on the weekly approval
// list; for a pay line, on the pay-run approval. Either way it is never
// booked or approved in bulk.
//
// Invoices are read in approvals.ts, pay lines in people.ts; this module is
// the one place the UI asks.
import { anomaliesFor, approverOf, dayLabel, invoiceApprovals } from "./approvals"
import { CLIENT_BY_ID, isOpenPeriod, monthName } from "./data"
import { employeeFor, employeesOf, lineApproval, payAnomalyOf, peopleOf } from "./people"
import type { StoreState } from "./store"
import type { Anomaly, AnomalyKind, ReviewItem } from "./types"

export type AnomalyState = Pick<StoreState, "approvals" | "requests" | "items" | "onboarding" | "people">

/** What stands out on a line, invoice or pay. Empty when nothing does. */
export function anomaliesOf(state: AnomalyState, item: ReviewItem): Anomaly[] {
  if (item.domain === "payroll") {
    const employee = employeeFor(employeesOf(state, item.clientId), item)
    const anomaly = payAnomalyOf(item, state.items, employee, peopleOf(state).corrections)
    return anomaly ? [anomaly] : []
  }
  return anomaliesFor(state, item)
}

/** The anomalies that still matter: lines in a month that's open, where
    the approval is ahead. A closed month's are history. */
export function openAnomalies(state: AnomalyState, item: ReviewItem): Anomaly[] {
  if (!isOpenPeriod(item) || item.skipped) return []
  return anomaliesOf(state, item)
}

/** What an anomaly sets off for this line, where it stands now, in one
    sentence for the firm. */
export function anomalyOutcome(state: AnomalyState, item: ReviewItem): string {
  const first = (name?: string) => name?.split(" ")[0] ?? "the customer"
  if (item.domain === "payroll") {
    const contact = first(CLIENT_BY_ID.get(item.clientId)?.contacts[0]?.name)
    const approval = lineApproval(state.requests, item)
    const by = first(approval.request?.answeredBy?.name)
    switch (approval.state) {
      case "approved":
        return `${by} approved this pay with it marked.`
      case "rejected":
        return `${by} rejected this pay.`
      case "changed":
        return `The pay changed since ${by} answered: it goes to them again.`
      case "waiting":
        return `Marked on the pay-run approval with ${contact}, waiting for their answer.`
      default:
        return `Approve it by hand, not in bulk. It is marked for ${contact} when they approve the ${monthName(item.period)} run.`
    }
  }
  const approver = first(approverOf(state, item.clientId)?.name)
  if (item.status !== "booked")
    return `Book it by hand, not in bulk. It goes on ${approver}'s next approval list with this marked, and isn't paid before they approve.`
  const row = invoiceApprovals(state, item.clientId).find((r) => r.item.id === item.id)
  switch (row?.status) {
    case "with_customer":
      return `Marked on ${row.request?.id ?? "the list"}, waiting for ${approver}'s approval. Not paid before.`
    case "approved":
      return `${first(row.decidedBy)} approved it with this marked${row.decidedAt ? `, ${dayLabel(row.decidedAt.slice(0, 10))}` : ""}.`
    case "rejected":
    case "credit_note":
      return `${first(row.decidedBy)} rejected it.`
    default:
      return `Goes on ${approver}'s next approval list with this marked. Not paid before they approve.`
  }
}

/** Each kind in a word or two, for filters and the audit trail. */
export const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  new_supplier: "New supplier",
  amount_jump: "Far above the usual",
  benchmark: "Above other clients' price",
  large_amount: "Large amount",
  bank_account: "Bank account changed",
  new_employee: "New employee",
  pay_change: "Pay far from last month",
  commission: "Commission spike",
  correction: "Correction for an earlier month",
  leaving: "Final pay",
  off_agreement: "Off the agreement",
  extra_pay: "Extra pay line",
}

/** The kinds that can show up in each domain, in the order filters list them. */
export const ANOMALY_KINDS: Record<ReviewItem["domain"], AnomalyKind[]> = {
  bookkeeping: ["new_supplier", "bank_account", "amount_jump", "benchmark", "large_amount"],
  payroll: ["new_employee", "pay_change", "commission", "correction", "leaving", "off_agreement", "extra_pay"],
}
