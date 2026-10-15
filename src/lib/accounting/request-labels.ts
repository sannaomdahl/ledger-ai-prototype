// How a task that carries its own content (an approval list, a pay
// check-in) reads in a list: what it is, and what the customer said. Plain
// text, for the board, the bell and Home alike.
import { monthLabel } from "./data"
import type { CustomerRequest } from "./types"

/** True for the bundles the firm sends that have no line behind them. */
export function isBundle(request: CustomerRequest) {
  return request.kind === "approval" || request.kind === "payroll_checkin"
}

/** "Approval · 6 invoices", "Pay run approval · 7 employees", "Pay
    check-in · October 2026". Undefined for any other task. */
export function bundleLabel(request: CustomerRequest) {
  if (request.kind === "approval") {
    const n = request.lines?.length ?? 0
    return request.domain === "payroll"
      ? `Pay run approval · ${n} ${n === 1 ? "employee" : "employees"}`
      : `Approval · ${n} ${n === 1 ? "invoice" : "invoices"}`
  }
  if (request.kind === "payroll_checkin") return `Pay check-in · ${monthLabel(request.period)}`
  return undefined
}

/** What the customer answered on a bundle, in a few words. */
export function bundleAnswer(request: CustomerRequest) {
  if (request.kind === "approval") {
    const lines = request.lines ?? []
    const approved = lines.filter((l) => l.decision === "approved").length
    const rejected = lines.filter((l) => l.decision === "rejected").length
    if (!approved && !rejected) return undefined
    const remembered = lines.filter((l) => l.remember).length
    const parts = [
      rejected ? `Approved ${approved}, rejected ${rejected}` : approved === lines.length ? `Approved all ${approved}` : `Approved ${approved} of ${lines.length}`,
      remembered ? `${remembered} from now on` : "",
    ].filter(Boolean)
    return parts.join(" · ")
  }
  if (request.kind === "payroll_checkin") {
    const answer = request.checkin
    if (!answer) return undefined
    if (answer.noChanges) return "No changes since last month"
    return [
      answer.hires ? `New: ${answer.hires}` : "",
      answer.leavers ? `Leaving: ${answer.leavers}` : "",
      answer.absence ? `Away: ${answer.absence}` : "",
      answer.overtime ? `Overtime: ${answer.overtime}` : "",
      answer.other ?? "",
    ]
      .filter(Boolean)
      .join(" · ")
  }
  return undefined
}
