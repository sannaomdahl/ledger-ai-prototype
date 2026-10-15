// The client's employees and what they are paid, and the loop around each
// pay run: ask what changed (the check-in), do the run, have the customer
// approve it. The accountant can start on the lines before the answers are
// in, but the run isn't approved without them, or without a reason logged.
// The store keeps `people` in its state, saves it, and sends
// `{ type: "people", action }` here.
import {
  addDays,
  bankingDayOnOrBefore,
  CLIENT_BY_ID,
  CURRENT_USER,
  dayLabel,
  DEMO_CLIENT_ID,
  hash,
  monthLabel,
  nextBankingDay,
  nextMonth,
  OPEN_MONTH,
  payDates,
  payrollRoster,
  SEEDED_CORRECTION,
  type PayAgreement,
} from "./data"
import { TODAY } from "./deadlines"
import { getPayroll, payRunKey, soonestPayDate } from "./payroll"
import { nextRequestId } from "./ids"
import type { NewRequest, StoreState } from "./store"
import { log, stamp } from "./trail"
import type {
  Anomaly,
  AnomalyKind,
  ApprovalLine,
  CheckinAnswer,
  Client,
  CustomerRequest,
  ReviewItem,
  Stamp,
} from "./types"

export type { PayAgreement }

/** Someone on the client's payroll and the pay agreed with them. */
export type Employee = {
  id: string
  clientId: string
  name: string
  role: string
  agreement: PayAgreement
  /** Monthly salary, hourly rate or base salary (commission), NOK. 0 when
      not known yet. */
  amount: number
  /** ISO dates. `end` is the last working day. */
  start: string
  end?: string
  /** The customer confirmed this pay once ("Same pay from now on"): from
      then on an unchanged fixed salary is "Same as always". */
  confirmed?: { by: string; at: string; via: "approval" | "onboarding" }
  /** Where we learned about them. */
  source: "tripletex" | "planday" | "onboarding" | "checkin" | "accountant"
  /** Someone who starts after the month: kept on our list until then and
      created in Tripletex on this day, because Tripletex bills an employee
      from when the record exists. */
  tripletexFrom?: string
  /** What payroll needs that we don't have yet. The task asking the
      customer for it is the request `about` this employee's id. */
  details?: { missing: string[] }
}

/** What a new hire's first pay needs besides the contract, in the order a
    customer is asked for it. The tax card is fetched once the ID is in. */
export const HIRE_DETAILS = ["national ID (fødselsnummer)", "bank account", "home address", "e-mail for payslips"]

/** A pay line that pays for an earlier month: paid (and reported) now,
    booked back to the month it was earned. */
export type PayCorrection = {
  itemId: string
  clientId: string
  earnedIn: string
  /** "Commission", "Overtime", "Salary". */
  what: string
}

/** Approving without the customer, with the reason on record. */
export type PayOverride = Stamp & { reason: string }

/** The pay-run approval sent to the customer, and the gross of each line
    when it went, so a line changed since then sends it again. */
export type SentApproval = { requestId: string; amounts: Record<string, number> }

export type PeopleState = {
  employees: Employee[]
  corrections: PayCorrection[]
  /** Keyed by `payRunKey`. */
  approvals: Record<string, SentApproval>
  /** Check-in answers turned into work, by request id. */
  applied: Record<string, Stamp & { summary: string }>
  /** `${clientId}:${month}:checkin` or `${payRunKey}:approval`. */
  overrides: Record<string, PayOverride>
  /** Customers who said they don't want to approve pay runs. */
  optOut: Record<string, Stamp>
}

/** A seeded confirmation: the customer approved this pay some months ago. */
function seededConfirmation(clientId: string, name: string): Employee["confirmed"] {
  const client = CLIENT_BY_ID.get(clientId)
  const h = hash(`${clientId}-${name}-ok`)
  return {
    by: client?.contacts[0]?.name ?? "The customer",
    at: `2026-0${3 + (h % 5)}-${String(10 + (h % 18)).padStart(2, "0")}`,
    via: "approval",
  }
}

export function seedPeople(): PeopleState {
  const counts = new Map<string, number>()
  const employees = payrollRoster().map((row): Employee => {
    const n = (counts.get(row.clientId) ?? 0) + 1
    counts.set(row.clientId, n)
    const isNew = row.start >= `${OPEN_MONTH}-01`
    return {
      id: `${row.clientId}-e${n}`,
      clientId: row.clientId,
      name: row.name,
      role: row.role,
      agreement: row.agreement,
      amount: row.amount,
      start: row.start,
      // Skarv is the walk-through: nobody confirmed yet, so its first
      // approval is where "Same pay from now on" happens.
      confirmed:
        isNew || row.clientId === DEMO_CLIENT_ID
          ? undefined
          : seededConfirmation(row.clientId, row.name),
      source: row.source,
    }
  })
  return {
    employees,
    corrections: [{ ...SEEDED_CORRECTION }],
    approvals: {},
    applied: {},
    overrides: {},
    optOut: {},
  }
}

let fallback: PeopleState | undefined

/** The slice, or the seed when saved data predates it. */
export function peopleOf(state: { people?: PeopleState }): PeopleState {
  const people = state.people as Partial<PeopleState> | undefined
  if (people?.employees) return people as PeopleState
  fallback ??= seedPeople()
  return fallback
}

// ── Reading the list ──

/** "Fixed · 52 000 kr a month", "Hourly · 162 kr", "Commission · base 24 000 kr". */
export function agreementLabel(e: Pick<Employee, "agreement" | "amount">) {
  const kr = (v: number) => `${new Intl.NumberFormat("nb-NO").format(v)} kr`
  if (e.agreement === "fixed") return e.amount ? `Fixed · ${kr(e.amount)} a month` : "Fixed · salary to confirm"
  if (e.agreement === "hourly") return e.amount ? `Hourly · ${kr(e.amount)} an hour` : "Hourly · rate to confirm"
  return e.amount ? `Commission · base ${kr(e.amount)}` : "Commission · base to confirm"
}

export const AGREEMENT_LABEL: Record<PayAgreement, string> = {
  fixed: "Fixed salary",
  hourly: "Hourly",
  commission: "Base + commission",
}

/** The employees a company brought from onboarding, before anything was
    changed here: pre-approved ones start as confirmed. */
function fromOnboarding(state: Pick<StoreState, "onboarding">, clientId: string): Employee[] {
  const c = state.onboarding.find((o) => o.id === clientId && o.handedOver)
  const at = c?.handedOver?.at ?? TODAY
  return (c?.employees ?? []).map((e, index) => ({
    id: `${clientId}-e${index + 1}`,
    clientId,
    name: e.name,
    role: e.role,
    agreement: e.pay,
    amount: e.amount,
    start: c?.offer?.takeoverDate ?? at,
    confirmed: e.preApproved ? { by: "Agreed in onboarding", at, via: "onboarding" } : undefined,
    source: "onboarding",
  }))
}

/** Pay the customer approved with "Same pay from now on", by employee name. */
function rememberedPay(state: Pick<StoreState, "requests" | "items">, clientId: string) {
  const out = new Map<string, NonNullable<Employee["confirmed"]>>()
  for (const r of state.requests) {
    if (r.clientId !== clientId || r.kind !== "approval" || r.domain !== "payroll" || !r.answeredBy)
      continue
    for (const line of r.lines ?? []) {
      if (!line.remember || line.decision !== "approved") continue
      const item = state.items.find((i) => i.id === line.itemId)
      if (item && !out.has(item.title))
        out.set(item.title, { by: r.answeredBy.name, at: r.answeredBy.at.slice(0, 10), via: "approval" })
    }
  }
  return out
}

type ListState = Pick<StoreState, "people" | "onboarding" | "requests" | "items">

/** Everyone on the client's payroll, confirmations from approvals included. */
export function employeesOf(state: ListState, clientId: string): Employee[] {
  const own = peopleOf(state).employees.filter((e) => e.clientId === clientId)
  const list = own.length ? own : fromOnboarding(state, clientId)
  const remembered = rememberedPay(state, clientId)
  return list.map((e) =>
    e.confirmed || !remembered.has(e.name) ? e : { ...e, confirmed: remembered.get(e.name) }
  )
}

/** The employee a pay line pays. */
export function employeeFor(employees: Employee[], item: Pick<ReviewItem, "clientId" | "title">) {
  return employees.find((e) => e.clientId === item.clientId && e.name === item.title)
}

export function correctionOf(state: Pick<StoreState, "people">, itemId: string) {
  return peopleOf(state).corrections.find((c) => c.itemId === itemId)
}

function lastDay(month: string) {
  return addDays(`${nextMonth(month)}-01`, -1)
}

/** Where someone stands this pay period, in a word. */
export type EmployeeStatus = "confirmed" | "unconfirmed" | "new" | "leaving" | "left" | "starts"

export function employeeStatus(e: Employee, month: string): EmployeeStatus {
  if (e.end && e.end < `${month}-01`) return "left"
  if (e.end) return "leaving"
  if (e.start > lastDay(month)) return "starts"
  if (e.start >= `${month}-01` || e.source === "checkin" || e.source === "accountant")
    return e.confirmed ? "confirmed" : "new"
  return e.confirmed ? "confirmed" : "unconfirmed"
}

function prevMonth(month: string) {
  return addDays(`${month}-01`, -1).slice(0, 7)
}

/** One person in a month's pay run: their regular pay line (or the one
    moved on to next month's run), any line for an earlier month paid with
    it, or no line at all because they start later or have left. */
export type EmployeeRow = {
  id: string
  /** Missing for a pay line nobody on the list matches. */
  employee?: Employee
  name: string
  line?: ReviewItem
  /** Corrections for earlier months, and any second line. */
  extra: ReviewItem[]
  /** The line went on to next month's run. */
  moved: boolean
}

/** The month's pay run, one row per employee, in list order. Someone with
    no line shows while it matters: starting next month, or paid last month
    and gone now. */
export function employeeRows(state: ListState, clientId: string, month: string): EmployeeRow[] {
  const employees = employeesOf(state, clientId)
  const corrections = new Set(peopleOf(state).corrections.map((c) => c.itemId))
  const own = state.items.filter((i) => i.clientId === clientId && i.domain === "payroll")
  const lines = own.filter((i) => i.period === month || i.movedFrom === month)
  const rowOf = (name: string, employee: Employee | undefined, mine: ReviewItem[]): EmployeeRow => {
    const line = mine.find((i) => !corrections.has(i.id))
    return {
      id: line?.id ?? employee?.id ?? mine[0].id,
      employee,
      name,
      line,
      extra: mine.filter((i) => i !== line),
      moved: line?.movedFrom === month,
    }
  }
  const rows = employees.flatMap((e) => {
    const mine = lines.filter((i) => i.title === e.name)
    if (mine.length) return [rowOf(e.name, e, mine)]
    const status = employeeStatus(e, month)
    // Everyone who starts later is on the list, however far ahead: that is
    // where their details and their Tripletex date are followed.
    const startsNext = status === "starts"
    const justLeft =
      status === "left" && own.some((i) => i.title === e.name && i.period === prevMonth(month))
    return startsNext || justLeft ? [rowOf(e.name, e, [])] : []
  })
  const known = new Set(employees.map((e) => e.name))
  const orphans = [...new Set(lines.filter((i) => !known.has(i.title)).map((i) => i.title))]
  return [...rows, ...orphans.map((name) => rowOf(name, undefined, lines.filter((i) => i.title === name)))]
}

// ── What stands out on a pay line ──

const kr = (v: number) => `${new Intl.NumberFormat("nb-NO").format(Math.round(v))} kr`

function longMonth(period: string) {
  return monthLabel(period).split(" ")[0]
}

/** Earlier months' pay for the same person, newest first. */
function history(item: ReviewItem, items: ReviewItem[], corrections: PayCorrection[]) {
  const skip = new Set(corrections.map((c) => c.itemId))
  return items
    .filter(
      (i) =>
        i.clientId === item.clientId &&
        i.domain === "payroll" &&
        i.title === item.title &&
        i.period < item.period &&
        !skip.has(i.id)
    )
    .sort((a, b) => b.period.localeCompare(a.period))
}

/** Nothing stands out, but the customer never confirmed this pay. */
export const UNCONFIRMED = "You haven't confirmed this pay before"

/** Why a pay line needs a real look, in words the customer understands
    too: a new employee, pay far from last month, a commission spike, a
    correction for an earlier month. Or that nothing stands out but the
    customer never confirmed this pay. Nothing for pay that's as usual. */
function payLook(
  item: ReviewItem,
  items: ReviewItem[],
  employee: Employee | undefined,
  corrections: PayCorrection[]
): { kind: AnomalyKind | "unconfirmed"; text: string } | undefined {
  const correction = corrections.find((c) => c.itemId === item.id)
  if (correction)
    return { kind: "correction", text: `${correction.what} for ${longMonth(correction.earnedIn)}, paid now` }

  const past = history(item, items, corrections)
  if (!employee || employee.start >= `${item.period}-01` || (!past.length && !employee.confirmed)) {
    const start = employee?.start
    return {
      kind: "new_employee",
      text: start && start > lastDay(item.period) ? `New employee, starts ${dayLabel(start)}` : "New employee: first pay",
    }
  }

  if (employee.agreement === "commission" && past.length) {
    const commission = item.amount - employee.amount
    const usual = past.reduce((sum, i) => sum + (i.amount - employee.amount), 0) / past.length
    if (usual > 0 && commission / usual >= 3)
      return {
        kind: "commission",
        text: `Commission ${Math.round(commission / usual)}× usual: ${kr(commission)} against about ${kr(usual)}`,
      }
  }

  // A final pay is bigger than usual because of the holiday pay in it:
  // that it's the last one is what to look at, not the jump.
  if (employee.end && employee.end <= lastDay(nextMonth(item.period))) {
    const holiday = item.suggestion.lines.find((l) => /^Holiday pay/.test(l.account))
    return {
      kind: "leaving",
      text: `Leaving ${dayLabel(employee.end)}: final pay${holiday ? `, with ${kr(holiday.amount)} holiday pay` : ""}`,
    }
  }

  const last = past[0]
  if (last && last.amount > 0 && item.amount > 0) {
    const ratio = item.amount / last.amount
    if (ratio >= 2)
      return {
        kind: "pay_change",
        text: `${ratio >= 3 ? Math.round(ratio) : Math.round(ratio * 10) / 10}× last month: ${kr(last.amount)} → ${kr(item.amount)}`,
      }
    if (ratio <= 0.5) return { kind: "pay_change", text: `${Math.round((1 - ratio) * 100)}% less than last month` }
  }

  if (employee.agreement === "fixed" && employee.amount && item.amount !== employee.amount) {
    const diff = item.amount - employee.amount
    return {
      kind: "off_agreement",
      text:
        diff > 0
          ? `${kr(diff)} on top of the fixed ${kr(employee.amount)}`
          : `${kr(-diff)} less than the fixed ${kr(employee.amount)}`,
    }
  }

  const extra = item.suggestion.lines.slice(1).find((l) => !l.account.startsWith("Commission"))
  if (extra)
    return {
      kind: "extra_pay",
      text: `Includes ${extra.account.charAt(0).toLowerCase()}${extra.account.slice(1)}, ${kr(extra.amount)}`,
    }

  if (!employee.confirmed) return { kind: "unconfirmed", text: UNCONFIRMED }
  return undefined
}

/** What the customer sees marked on a pay line of their approval: an
    anomaly, or that they never confirmed this pay. */
export function payAnomaly(
  item: ReviewItem,
  items: ReviewItem[],
  employee: Employee | undefined,
  corrections: PayCorrection[]
): string | undefined {
  return payLook(item, items, employee, corrections)?.text
}

/** The anomaly on a pay line, if any. Pay the customer hasn't confirmed
    yet isn't one: nothing about it is unusual, like an invoice from a
    known supplier that isn't on the approved list. */
export function payAnomalyOf(
  item: ReviewItem,
  items: ReviewItem[],
  employee: Employee | undefined,
  corrections: PayCorrection[]
): Anomaly | undefined {
  const look = payLook(item, items, employee, corrections)
  if (!look || look.kind === "unconfirmed") return undefined
  return { kind: look.kind, short: look.text, detail: look.text }
}

/** The same anomaly in the firm's words, where the customer's read oddly. */
export function forFirm(anomaly: string) {
  return anomaly === UNCONFIRMED
    ? "Pay not confirmed by the customer yet"
    : anomaly
}

/** A fixed salary the customer confirmed, paid exactly as agreed. */
export function isSameAsAlways(item: ReviewItem, employee: Employee | undefined, anomaly?: string) {
  return (
    !anomaly &&
    employee?.agreement === "fixed" &&
    Boolean(employee.confirmed) &&
    item.amount === employee.amount
  )
}

/** The anomaly for a pay line, read from the store. */
export function lineAnomaly(state: ListState, item: ReviewItem) {
  if (item.domain !== "payroll") return undefined
  const employees = employeesOf(state, item.clientId)
  return payAnomaly(item, state.items, employeeFor(employees, item), peopleOf(state).corrections)
}

// ── The loop around a pay run ──

/** What the loop reads. The store's state fits; so do the sign-offs plus
    items and requests that deadlines and the month close have. */
export type LoopState = Pick<StoreState, "items" | "requests" | "progress" | "closing"> & {
  people?: PeopleState
}

/** The month's check-in. One the firm withdrew doesn't count: it can be
    sent again. */
export function checkinOf(requests: CustomerRequest[], clientId: string, month: string) {
  return requests.findLast(
    (r) =>
      r.clientId === clientId &&
      r.period === month &&
      r.kind === "payroll_checkin" &&
      r.resolution !== "cancelled"
  )
}

/** An answer that needs work: someone new, someone leaving, someone away. */
export function checkinHasChanges(answer?: CheckinAnswer) {
  return Boolean(answer && !answer.noChanges && (answer.hires || answer.leavers || answer.absence || answer.overtime || answer.other))
}

function hasChanges(r?: CustomerRequest) {
  return checkinHasChanges(r?.checkin)
}

// ── The customer's decision on each pay line ──

function isPayApproval(r: CustomerRequest) {
  return r.kind === "approval" && r.domain === "payroll" && r.status !== "draft"
}

/** Where one pay line stands with the customer. The latest list it was on
    decides; a line whose gross changed since then needs approving again. */
export type LineApproval = {
  state: "not_sent" | "changed" | "waiting" | "approved" | "rejected"
  request?: CustomerRequest
  line?: ApprovalLine
}

export function lineApproval(requests: CustomerRequest[], item: Pick<ReviewItem, "id" | "amount">): LineApproval {
  let found: { request: CustomerRequest; line: ApprovalLine } | undefined
  for (const request of requests) {
    if (!isPayApproval(request)) continue
    const line = request.lines?.find((l) => l.itemId === item.id)
    if (line) found = { request, line }
  }
  if (!found) return { state: "not_sent" }
  const { request, line } = found
  const changed = line.amount !== undefined && line.amount !== item.amount
  if (line.decision === "approved") return { state: changed ? "changed" : "approved", request, line }
  if (line.decision === "rejected") return { state: changed ? "changed" : "rejected", request, line }
  // Withdrawn, replaced or closed without an answer: not approved.
  if (request.status !== "sent") return { state: "not_sent", request, line }
  return { state: changed ? "changed" : "waiting", request, line }
}

/** The customer's rejection on a pay line that isn't settled yet: it
    stays until the line goes out to them again, moves or is left out. */
export function customerRejection(
  state: Pick<StoreState, "requests">,
  item: ReviewItem
): { by: string; note?: string; request: CustomerRequest; corrected: boolean } | undefined {
  if (item.domain !== "payroll" || item.skipped || item.movedFrom) return undefined
  const a = lineApproval(state.requests, item)
  if (a.line?.decision !== "rejected" || !a.request) return undefined
  return {
    by: a.request.answeredBy?.name ?? "The customer",
    note: a.line.note,
    request: a.request,
    // The pay changed since they rejected it: what's left is their yes.
    corrected: a.line.amount !== undefined && a.line.amount !== item.amount,
  }
}

export type CheckinState = "not_sent" | "waiting" | "answered" | "overridden"

export type ApprovalState =
  | "opted_out"
  | "not_sent"
  | "changed"
  | "waiting"
  | "rejected"
  | "approved"
  | "overridden"

export type PayLoop = {
  /** Closed months and months without pay have no loop. */
  active: boolean
  checkin?: CustomerRequest
  checkinState: CheckinState
  /** The answer had changes and they were turned into work. */
  applied?: Stamp & { summary: string }
  changes: boolean
  checkinOverride?: PayOverride
  /** Reply by this day, or payday moves. */
  cutoff: string
  /** The customer's approval of the run that approving now would make. */
  approval?: CustomerRequest
  approvalState: ApprovalState
  approvalOverride?: PayOverride
  /** Lines in the run that still need the customer's yes. */
  toApprove: ReviewItem[]
  /** Lines the customer rejected that the firm hasn't settled. */
  rejections: { item: ReviewItem; by: string; note?: string; request: CustomerRequest; corrected: boolean }[]
  optOut?: Stamp
  /** Pay day in the contract and the banking day it becomes. */
  contractPayDay: string
  regularPayDate: string
  /** When the next run pays, late answers included. */
  payDate: string
  /** The regular run moved because the answers came in late. */
  late?: { from: string; reason: string }
  /** Why the run can't be approved yet. */
  blocked?: string
}

export function checkinKey(clientId: string, month: string) {
  return `${clientId}:${month}:checkin`
}

export function approvalKey(clientId: string, month: string, seq: number) {
  return `${payRunKey(clientId, month, seq)}:approval`
}

/** Days from one ISO date to the next. */
function daysBetween(from: string, to: string) {
  return Math.round(
    (new Date(`${to.slice(0, 10)}T12:00:00Z`).getTime() -
      new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime()) /
      86_400_000
  )
}

/** Payday moves by as many days as the check-in came in after the cut-off,
    and a run approved by the customer after the bank file had to go pays
    the banking day after their approval. Never in the past. */
function shiftedPayDate(
  regular: string,
  cutoff: string,
  checkinAt?: string,
  approvalAt?: string
): string {
  let date = regular
  if (checkinAt && checkinAt.slice(0, 10) > cutoff) {
    date = addDays(date, daysBetween(cutoff, checkinAt))
    while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addDays(date, 1)
  }
  // The payment file reaches the bank two banking days before payday.
  const fileBy = addDays(regular, -2)
  if (approvalAt && approvalAt.slice(0, 10) > fileBy) {
    const after = nextBankingDay(approvalAt.slice(0, 10))
    if (after > date) date = after
  }
  const soonest = soonestPayDate()
  return date > soonest ? date : soonest
}

/** When salaries go out if the check-in is answered on this day. */
export function payDateIfAnsweredOn(client: Pick<Client, "payDate">, month: string, day: string) {
  const dates = payDates(client, month)
  return shiftedPayDate(dates.payDate, dates.cutoff, day)
}

export function getPayLoop(state: LoopState, clientId: string, month: string): PayLoop {
  const people = peopleOf(state)
  const client = CLIENT_BY_ID.get(clientId)
  const payroll = getPayroll(state.items, state.progress, clientId, month, state.closing)
  const dates = client
    ? payDates(client, month)
    : { contract: payroll.nextPayDate, payDate: payroll.nextPayDate, cutoff: payroll.nextPayDate }
  const active = Boolean(client) && !payroll.locked && payroll.lines.length > 0
  const checkin = checkinOf(state.requests, clientId, month)
  const checkinOverride = people.overrides[checkinKey(clientId, month)]
  const answered = Boolean(checkin?.checkin)
  const checkinState: CheckinState = answered
    ? "answered"
    : checkinOverride
      ? "overridden"
      : checkin && checkin.status !== "draft"
        ? "waiting"
        : "not_sent"
  const changes = hasChanges(checkin)
  const applied = checkin ? people.applied[checkin.id] : undefined

  // Everyone paid: the loop reads the last run's approval, not an empty
  // next one.
  const settled =
    !payroll.ready.length && !payroll.open.length && payroll.runs.length
      ? payroll.runs[payroll.runs.length - 1].seq
      : undefined
  const seq = settled ?? payroll.nextSeq
  const optOut = people.optOut[clientId]
  const approvalOverride = people.overrides[approvalKey(clientId, month, seq)]
  // The customer approves line by line: the run approving now would make
  // (or, once everyone is paid, the last one) is approved when every line
  // in it is, at the gross it has now. A rejected line goes back to review
  // and doesn't hold up the others.
  const lastRun = settled !== undefined ? payroll.runs[payroll.runs.length - 1] : undefined
  const scope = lastRun
    ? state.items.filter((i) => lastRun.itemIds.includes(i.id))
    : payroll.ready
  const decisions = scope.map((item) => ({ item, ...lineApproval(state.requests, item) }))
  const monthApprovals = state.requests.filter(
    (r) => isPayApproval(r) && r.clientId === clientId && r.period === month
  )
  const rejections = [...payroll.open, ...payroll.ready].flatMap((item) => {
    const r = customerRejection(state, item)
    return r ? [{ item, ...r }] : []
  })
  // The newest list behind the run: the one the step talks about.
  const behind = new Set(decisions.map((d) => d.request?.id).filter(Boolean))
  const approval = state.requests.findLast((r) => behind.has(r.id)) ?? monthApprovals.at(-1)
  const has = (s: LineApproval["state"]) => decisions.some((d) => d.state === s)
  const approvalState: ApprovalState = optOut
    ? "opted_out"
    : approvalOverride
      ? "overridden"
      : !scope.length
        ? rejections.length
          ? "rejected"
          : "not_sent"
        : has("changed") || (has("not_sent") && monthApprovals.length > 0)
          ? "changed"
          : has("not_sent")
            ? "not_sent"
            : has("waiting")
              ? "waiting"
              : has("rejected")
                ? "rejected"
                : "approved"
  // Lines that still need the customer's yes: what "Send" sends.
  const toApprove = decisions.filter((d) => d.state !== "approved").map((d) => d.item)

  // Only the regular run waits on the check-in and can move.
  const regularRun = payroll.runs.find((r) => r.seq === 1)
  const shifted =
    seq === 1
      ? shiftedPayDate(
          dates.payDate,
          dates.cutoff,
          checkinOverride && !answered ? undefined : checkin?.answeredBy?.at,
          approvalState === "approved" ? approval?.answeredBy?.at : undefined
        )
      : payroll.nextPayDate
  const late =
    regularRun && regularRun.payDate > dates.payDate
      ? { from: dates.payDate, reason: "the answers came in late" }
      : seq === 1 && shifted > dates.payDate
        ? {
            from: dates.payDate,
            reason:
              checkin?.answeredBy && checkin.answeredBy.at.slice(0, 10) > dates.cutoff
                ? "the check-in came in after the cut-off"
                : "the approval came in after the bank file had to go",
          }
        : undefined

  const contact = client?.contacts.find((c) => c.id === checkin?.recipientId) ?? client?.contacts[0]
  const first = contact?.name.split(" ")[0] ?? "the customer"
  const rejectedInRun = decisions.filter((d) => d.state === "rejected").map((d) => d.item.title.split(" ")[0])
  const changedNames = toApprove.map((i) => i.title.split(" ")[0])
  const blocked = !active
    ? undefined
    : seq === 1 && checkinState === "not_sent"
      ? "Send the check-in first: the run waits for the answers"
      : seq === 1 && checkinState === "waiting"
        ? `Waiting for ${first}'s check-in`
        : seq === 1 && changes && !applied
          ? `Add ${first}'s answers to the run first`
          : approvalState === "not_sent" || approvalState === "changed"
            ? approvalState === "changed"
              ? `Send ${list(changedNames)} to ${first} for approval first`
              : `Send the run to ${first} for approval first`
            : approvalState === "waiting"
              ? `Waiting for ${first}'s approval`
              : approvalState === "rejected"
                ? rejectedInRun.length
                  ? `${first} rejected ${list(rejectedInRun)}: send again or leave out`
                  : `${first} rejected ${list(rejections.map((r) => r.item.title.split(" ")[0]))}: back in review`
                : undefined

  return {
    active,
    checkin,
    checkinState,
    applied,
    changes,
    checkinOverride,
    cutoff: dates.cutoff,
    approval,
    approvalState,
    approvalOverride,
    toApprove,
    rejections,
    optOut,
    contractPayDay: dates.contract,
    regularPayDate: dates.payDate,
    payDate: regularRun ? payroll.nextPayDate : shifted,
    late,
    blocked,
  }
}

/** The check-in and the customer's approval in a few words each, for the
    month close and the deadlines. An approved run reads its own approval. */
export function loopWords(state: LoopState, clientId: string, month: string) {
  const loop = getPayLoop(state, clientId, month)
  const people = peopleOf(state)
  const client = CLIENT_BY_ID.get(clientId)
  const first = (loop.checkin?.answeredBy?.name ?? client?.contacts[0]?.name ?? "the customer").split(" ")[0]
  const checkin =
    loop.checkinState === "answered"
      ? `Check-in answered by ${first}${loop.checkin?.answeredBy && loop.checkin.answeredBy.at.slice(0, 10) > loop.cutoff ? ", late" : ""}`
      : loop.checkinState === "waiting"
        ? `Check-in waiting on ${first}`
        : loop.checkinState === "overridden"
          ? "Went ahead without the check-in"
          : "Check-in not sent"
  const payroll = getPayroll(state.items, state.progress, clientId, month, state.closing)
  const seq = payroll.runs.length ? 1 : payroll.nextSeq
  const approver = (loop.approval?.answeredBy?.name ?? first).split(" ")[0]
  const approval = loop.optOut
    ? undefined
    : people.overrides[approvalKey(clientId, month, seq)] || loop.approvalState === "overridden"
      ? "approved without the customer"
      : loop.approvalState === "approved"
        ? `${approver} approved the run`
        : payroll.runs.length
          ? undefined
          : loop.approvalState === "waiting"
            ? `waiting for ${first}'s approval`
            : loop.approvalState === "rejected"
              ? `${first} rejected ${loop.rejections.length === 1 ? "a line" : `${loop.rejections.length} lines`}`
              : undefined
  return { loop, checkin, approval }
}

// ── Building the customer's tasks ──

/** What is still missing for someone held back, in the customer's words. */
function missingFor(item: ReviewItem) {
  // The customer answered: what's left is the accountant's approval.
  if (item.status === "customer_replied") return undefined
  switch (item.issue) {
    case "sick_leave":
      return "sick note"
    case "missing_tax_card":
      return "tax card and bank details"
    case "overtime_unapproved":
      return "OK on the overtime"
    case "unregistered_bonus":
      return "answer on the bonus"
    default:
      return item.status === "waiting_customer" ? "answer" : undefined
  }
}

function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]
}

/** The pay run as an approval task: the lines in it that still need the
    customer's yes, what stands out on each, and who is still missing.
    Lines they already approved at the same gross aren't asked again. */
export function payApprovalRequest(state: StoreState, clientId: string, month: string): NewRequest | undefined {
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return undefined
  const payroll = getPayroll(state.items, state.progress, clientId, month, state.closing)
  if (!payroll.ready.length) return undefined
  const loop = getPayLoop(state, clientId, month)
  const asking = loop.toApprove
  if (!asking.length) return undefined
  const already = payroll.ready.filter((i) => !asking.includes(i))
  const employees = employeesOf(state, clientId)
  const corrections = peopleOf(state).corrections
  const lines = asking.map((i) => ({
    itemId: i.id,
    anomaly: payAnomaly(i, state.items, employeeFor(employees, i), corrections),
    amount: i.amount,
  }))
  const flagged = lines.filter((l) => l.anomaly).length
  const gross = asking.reduce((sum, i) => sum + i.amount, 0)
  const contact = client.contacts[0]
  const name = longMonth(month)
  const seq = payroll.nextSeq
  const firstName = (title: string) => title.split(" ")[0]
  // What the customer still owes us: a line they answered waits on the
  // accountant now, not on them.
  const missing = payroll.open.filter((i) => i.status !== "customer_replied").map((i) => {
    const what = missingFor(i)
    return what ? `${firstName(i.title)}'s ${what}` : firstName(i.title)
  })
  // Lines the customer turned down before: say what was done about them.
  const fixed = asking.filter((i) => lineApproval(state.requests, i).line?.decision === "rejected")
  // The day before the firm approves the run (payday minus 5), never on a
  // weekend: the customer's yes comes first.
  const approveBy = bankingDayOnOrBefore(addDays(loop.payDate, -6))
  const people = (n: number) => `${n} ${n === 1 ? "employee" : "employees"}`
  const message = [
    already.length
      ? `Hi ${contact.name.split(" ")[0]}, ${fixed.length ? `we've updated ${list(fixed.map((i) => `${firstName(i.title)}'s pay`))} after your comment` : `${list(asking.map((i) => firstName(i.title)))} ${asking.length === 1 ? "is" : "are"} ready for ${name}'s pay run`}: ${kr(gross)} gross, paid ${dayLabel(loop.payDate)}. You already approved ${list(already.map((i) => firstName(i.title)))}, so there's nothing more to do for them.`
      : `Hi ${contact.name.split(" ")[0]}, ${seq === 1 ? `${name}'s pay run` : `a follow-up run for ${name}`} is ready: ${people(asking.length)}, ${kr(gross)} gross, paid ${dayLabel(loop.payDate)}.`,
    // Who isn't in it comes first: it matters more to the customer than
    // the lines that are as usual.
    missing.length
      ? `Not in it yet: we're still missing ${list(missing)}. Send ${missing.length === 1 ? "it" : "them"} in the app and ${missing.length === 1 ? "that pay follows" : "their pay follows"} in a follow-up run as soon as we have it.`
      : "",
    flagged
      ? flagged === lines.length
        ? `${flagged === 1 ? "It stands out" : `All ${flagged} stand out`}: we've marked ${flagged === 1 ? "it" : "them"}.`
        : `${flagged === 1 ? "One line stands out" : `${flagged} lines stand out`}: we've marked ${flagged === 1 ? "it" : "them"}. The rest is the same as always.`
      : missing.length
        ? `The ${asking.length === 1 ? "line" : `${asking.length} lines`} to approve now ${asking.length === 1 ? "is" : "are"} the same as always.`
        : "Nothing stands out this time. Give us a thumbs up and it goes out.",
    loop.late ? `Payday moved to ${dayLabel(loop.payDate)} because ${loop.late.reason}.` : "",
    `Approve by ${dayLabel(approveBy > TODAY ? approveBy : TODAY)} so salaries go out on time.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return {
    clientId,
    domain: "payroll",
    period: month,
    kind: "approval",
    responseType: "approval",
    title: already.length
      ? `Approve the ${asking.length === 1 ? `change to ${firstName(asking[0].title)}'s pay` : `${asking.length} changed pay lines`} for ${name}`
      : seq === 1
        ? `Approve ${name}'s pay run`
        : `Approve follow-up run ${seq} for ${name}`,
    message,
    recipientId: contact.id,
    due: dayLabel(approveBy > TODAY ? approveBy : TODAY),
    priority: "high",
    lines,
  }
}

// ── Reading a check-in answer ──

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
}

/** "31 Oct", "1. november" → ISO in 2026. */
function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{1,2})\.?\s*(jan|feb|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|des|dec)[a-z]*/i)
  if (!m) return undefined
  const month = MONTH_INDEX[m[2].toLowerCase()]
  return `2026-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

/** A hire in a customer's own words ("We're hiring Sofie Berg as a
    barista from 1 December, 215 kr/h"): who, what, the pay and the start,
    or nothing when the text names nobody. */
export function hireFromQuestion(text: string, month: string) {
  const at = text.match(/\b(?:hiring|hired|hire|new employee[:,]?|ansetter|ansatt)\s+([A-ZÆØÅ][\wæøå'-]+(?:\s+[A-ZÆØÅ][\wæøå'-]+)?)/)
  if (!at) return undefined
  return parseHire(text.slice(at.index! + at[0].length - at[1].length), month)
}

/** "Sofie Berg, barista from 1 Nov, 215 kr/h" → who, what and the pay. */
function parseHire(text: string, month: string) {
  const name = text.match(/^\s*([A-ZÆØÅ][\wæøåÆØÅ'-]+(?:\s+[A-ZÆØÅ][\wæøåÆØÅ'-]+){0,2})/)?.[1]
  if (!name) return undefined
  const rest = text.slice(text.indexOf(name) + name.length)
  // "as junior developer", "som barista", or the first plain part.
  const named = rest.match(/\b(?:as|som)\s+(?:an?\s+)?([^,\d]+?)(?:\s+(?:from|starts?|started|starting|fra)\b|,|$)/i)?.[1]
  const role =
    named?.trim() ||
    (rest
      .split(",")
      .map((p) => p.replace(/\b(from|start(?:s|ed|ing)?|fra)\b.*$/i, "").replace(/^\s*(as|som)\s+/i, "").trim())
      .find((p) => p && !/\d/.test(p)) ??
      "New employee")
  const hourly = rest.match(/(\d[\d\s]*)\s*(?:kr)?\s*(?:\/\s*h|an hour|per hour|i timen)/i)
  const monthly = rest.match(/(\d[\d\s]{3,})\s*(?:kr)?/)
  const agreement: PayAgreement = /commission|provisjon/i.test(rest)
    ? "commission"
    : hourly || !monthly
      ? "hourly"
      : "fixed"
  const amount = Number((hourly ?? monthly)?.[1].replace(/\s/g, "") ?? 0)
  return {
    name,
    role: role.charAt(0).toUpperCase() + role.slice(1),
    agreement,
    amount,
    start: parseDate(rest) ?? `${nextMonth(month)}-01`,
  }
}

function entries(text?: string) {
  return (text ?? "")
    .split(/\n|;/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Employees named in a piece of text, by full or first name. */
function named(employees: Employee[], text: string) {
  const lower = text.toLowerCase()
  return employees.filter(
    (e) => lower.includes(e.name.toLowerCase()) || new RegExp(`\\b${e.name.split(" ")[0]}\\b`, "i").test(text)
  )
}

// ── Changing the list and the lines ──

export type NewHire = {
  clientId: string
  month: string
  name: string
  role: string
  agreement: PayAgreement
  amount: number
  start: string
  /** Hours in the month, for an hourly hire who already started. */
  hours?: number
}

export type PeopleAction =
  | ({ type: "add_hire"; from?: string } & NewHire)
  | { type: "mark_leaving"; clientId: string; employeeId: string; end: string }
  | {
      type: "add_correction"
      clientId: string
      month: string
      employeeId: string
      earnedIn: string
      what: string
      amount: number
      note: string
    }
  /** Records the approval task just sent (by `send_request`) for the run. */
  | { type: "track_approval"; clientId: string; month: string }
  | { type: "apply_checkin"; requestId: string }
  | { type: "override"; clientId: string; month: string; what: "checkin" | "approval"; reason: string }
  | { type: "set_opt_out"; clientId: string; optOut: boolean }
  /** Demo: the customer answers "No changes", three days after the cut-off. */
  | { type: "simulate_late_checkin"; requestId: string }

function withPeople(state: StoreState, people: PeopleState): StoreState {
  return { ...state, people }
}

/** The client's list as stored, with onboarding's employees copied in the
    first time something changes. */
function stored(state: StoreState, clientId: string): Employee[] {
  const people = peopleOf(state)
  if (people.employees.some((e) => e.clientId === clientId)) return people.employees
  return [...people.employees, ...fromOnboarding(state, clientId)]
}

/** Adds a note to a pay line and sends it back for a look: lower
    confidence, the reason in its trail. A line already in a run stays. */
function flagLine(
  state: StoreState,
  itemId: string,
  reason: string,
  title: string,
  cap: number
): StoreState {
  const payroll = (item: ReviewItem) =>
    getPayroll(state.items, state.progress, item.clientId, item.period, state.closing)
  return {
    ...state,
    items: state.items.map((i) => {
      if (i.id !== itemId || payroll(i).paid.includes(i)) return i
      const reopen = i.status === "booked"
      return {
        ...i,
        status: reopen ? "needs_review" : i.status,
        suggestion: {
          ...i.suggestion,
          confidence: Math.min(i.suggestion.confidence, cap),
          reasoning: [...i.suggestion.reasoning.filter((r) => r !== reason), reason],
        },
        activity: [
          ...i.activity,
          log("customer", title, reason),
          ...(reopen ? [log("system", "Back in review", "The check-in changed what we knew.")] : []),
        ],
      }
    }),
  }
}

/** Working days (Mon–Fri) from a start date to the end of its month, out
    of the month's. Undefined when they started on or before the 1st. */
function workdayShare(start: string, month: string) {
  if (start <= `${month}-01` || start.slice(0, 7) !== month) return undefined
  let worked = 0
  let of = 0
  for (let day = `${month}-01`; day <= lastDay(month); day = addDays(day, 1)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    of++
    if (day >= start) worked++
  }
  return of ? { worked, of } : undefined
}

/** A pay line for someone new, flagged until their details are in. */
function hireLine(state: StoreState, hire: NewHire, from: string): ReviewItem {
  const client = CLIENT_BY_ID.get(hire.clientId)!
  const n = state.items.filter((i) => i.id.startsWith(`${hire.clientId}-pr-${hire.month}-n`)).length
  const startsLater = hire.start > lastDay(hire.month)
  const rate = hire.agreement === "hourly" ? hire.amount : 0
  const hours = hire.agreement === "hourly" && !startsLater ? (hire.hours ?? 0) : 0
  // A monthly salary starting mid-month is paid for the working days from
  // the start, not the whole month.
  const share = !startsLater && hire.agreement !== "hourly" ? workdayShare(hire.start, hire.month) : undefined
  const amount = startsLater
    ? 0
    : hire.agreement === "hourly"
      ? hours * rate
      : share
        ? Math.round((hire.amount * share.worked) / share.of)
        : hire.amount
  const part = share ? ` · ${share.worked} of ${share.of} working days` : ""
  const line =
    hire.agreement === "fixed"
      ? `Fixed salary${part}`
      : hire.agreement === "commission"
        ? `Base salary${part}`
        : hours
          ? `Hourly wage · ${hours} h × ${rate} kr`
          : "Hourly wage · hours from the first timesheet"
  return {
    id: `${hire.clientId}-pr-${hire.month}-n${n + 1}`,
    clientId: hire.clientId,
    domain: "payroll",
    period: hire.month,
    title: hire.name,
    subtitle: `${hire.role} · starts ${dayLabel(hire.start)}`,
    date: payDates(client, hire.month).payDate,
    amount,
    basis: `${AGREEMENT_LABEL[hire.agreement]} · new hire`,
    source: from,
    evidence: { label: "Tax card", attached: false },
    facts: [
      { label: "Employee no.", value: "Not created yet" },
      { label: "Position", value: hire.role },
      { label: "Pay type", value: agreementLabel(hire) },
      { label: "Tax card", value: "Not fetched" },
      { label: "Bank account", value: "Missing", mono: true },
      { label: "Employed since", value: `${dayLabel(hire.start)} ${hire.start.slice(0, 4)}` },
      { label: "Employer", value: client.name },
    ],
    suggestion: {
      lines: [{ account: line, amount }],
      confidence: 0.45,
      reasoning: [
        startsLater
          ? `${hire.name} starts ${dayLabel(hire.start)}: reported on the A-melding from then, first pay in ${longMonth(nextMonth(hire.month))}'s run.`
          : `${hire.name} started ${dayLabel(hire.start)}, so ${longMonth(hire.month)} is their first pay.`,
        ...(share
          ? [`Paid for ${share.worked} of ${share.of} working days in ${longMonth(hire.month)}: ${kr(hire.amount)} a month from ${dayLabel(hire.start)}.`]
          : []),
        "Tax deduction card and bank account number are missing.",
      ],
    },
    issue: "missing_tax_card",
    status: "needs_review",
    activity: [log("system", from), log("agent", "Set up a pay line for the new hire", agreementLabel(hire))],
  }
}

function hire(state: StoreState, input: NewHire, from: string, confirmed?: Employee["confirmed"]): StoreState {
  const employees = stored(state, input.clientId)
  const count = employees.filter((e) => e.clientId === input.clientId).length
  const employee: Employee = {
    id: `${input.clientId}-e${count + 1}`,
    clientId: input.clientId,
    name: input.name,
    role: input.role,
    agreement: input.agreement,
    amount: input.amount,
    start: input.start,
    confirmed,
    source: from.startsWith("Check-in") ? "checkin" : "accountant",
  }
  // Someone who starts after the month has no hours in its run: they wait
  // on the list, and are created in Tripletex the day they start.
  const inRun = input.start <= lastDay(input.month)
  if (!inRun) {
    employee.tripletexFrom = input.start
    employee.details = { missing: [...HIRE_DETAILS] }
  }
  // What payroll still needs is asked for now, not the week of payday: a
  // task in the customer's app about this employee.
  const client = CLIENT_BY_ID.get(input.clientId)
  const ask = !inRun && client?.contacts[0] ? hireDetailsRequest(employee, client) : undefined
  const requests = ask
    ? [
        ...state.requests,
        {
          ...ask,
          id: nextRequestId(state.requests, "TASK", 400),
          status: "sent" as const,
          round: 1,
          sentAt: "Just now",
        },
      ]
    : state.requests
  return {
    ...withPeople(state, { ...peopleOf(state), employees: [...employees, employee] }),
    items: inRun ? [...state.items, hireLine(state, input, from)] : state.items,
    requests,
  }
}

function joined(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "")
}

/** The task asking the customer for a future hire's details: due within a
    week, and never after the start. */
export function hireDetailsRequest(
  employee: Pick<Employee, "id" | "clientId" | "name" | "start">,
  client: Pick<Client, "id" | "contacts">,
  missing: string[] = HIRE_DETAILS
): NewRequest {
  const contact = client.contacts[0]
  const first = employee.name.split(" ")[0]
  const due = addDays(TODAY, 7) < employee.start ? addDays(TODAY, 7) : employee.start
  return {
    clientId: client.id,
    domain: "payroll",
    period: OPEN_MONTH,
    about: employee.id,
    kind: "document",
    responseType: "text",
    title: `Details for ${employee.name} before ${dayLabel(employee.start)}`,
    message: `Hi ${contact.name.split(" ")[0]}, to pay ${first} from ${dayLabel(employee.start)} we need ${joined(missing)}. With the ID we fetch the tax card from Skatteetaten. We create ${first} in Tripletex on the start date, so there's no fee before then.`,
    recipientId: contact.id,
    due: dayLabel(due),
    priority: "medium",
  }
}

function leave(state: StoreState, clientId: string, employeeId: string, end: string, by: string): StoreState {
  const employees = stored(state, clientId)
  const employee = employees.find((e) => e.id === employeeId)
  if (!employee) return state
  const next = withPeople(state, {
    ...peopleOf(state),
    employees: employees.map((e) => (e.id === employeeId ? { ...e, end } : e)),
  })
  const line = state.items.findLast(
    (i) =>
      i.clientId === clientId &&
      i.domain === "payroll" &&
      i.title === employee.name &&
      i.period >= OPEN_MONTH &&
      !peopleOf(state).corrections.some((c) => c.itemId === i.id)
  )
  if (!line) return next
  const flagged = flagLine(
    next,
    line.id,
    `Leaving ${dayLabel(end)}: the final pay settles holiday pay (feriepenger) and any hours owed.`,
    by,
    0.75
  )
  // Their last regular pay day is this run's: the holiday pay earned this
  // year goes out with it (ferieloven § 11 (3)), and the a-melding reports
  // the end date.
  if (end > lastDay(nextMonth(line.period))) return flagged
  return {
    ...flagged,
    items: flagged.items.map((i) => {
      if (i.id !== line.id || i.suggestion.lines.some((l) => /^Holiday pay/.test(l.account))) return i
      const year = i.period.slice(0, 4)
      const earlier = flagged.items.filter(
        (p) => p.clientId === clientId && p.domain === "payroll" && p.title === employee.name && p.period.startsWith(year) && p.period < i.period
      )
      const usual = earlier.length ? earlier.reduce((sum, p) => sum + p.amount, 0) / earlier.length : i.amount
      const months = Number(i.period.slice(5))
      const base = Math.round(usual * (months - 1) + i.amount)
      const holiday = Math.round(base * 0.102)
      const lines = [...i.suggestion.lines, { account: `Holiday pay ${year} · 10.2% of ${kr(base)}`, amount: holiday }]
      return {
        ...i,
        amount: lines.reduce((sum, l) => sum + l.amount, 0),
        suggestion: {
          ...i.suggestion,
          lines,
          reasoning: [
            ...i.suggestion.reasoning,
            `Final pay: the ${kr(holiday)} holiday pay earned in ${year} goes out with it (ferieloven § 11 (3)), with tax withheld. The base is ${kr(base)}, this year's pay so far. The holiday taken in summer was already deducted in June, so nothing is owed back.`,
            `The a-melding for ${longMonth(nextMonth(i.period))} reports ${dayLabel(end)} as the end date.`,
          ],
        },
        activity: [...i.activity, log("agent", "Added the holiday pay to the final pay", `${kr(holiday)}, 10.2% of ${kr(base)}`)],
      }
    }),
  }
}

/** Closes a request with a message from the firm on its thread, so the
    customer reads what happened instead of a bare "Done". */
export function closeRequest(
  request: CustomerRequest,
  resolution: NonNullable<CustomerRequest["resolution"]>,
  text: string
): CustomerRequest {
  return {
    ...request,
    status: "resolved",
    resolution,
    thread: [
      ...(request.thread ?? []),
      { id: `${request.id}-${(request.thread?.length ?? 0) + 1}`, from: "accountant", text, time: "Just now" },
    ],
  }
}

function rejectedNames(state: Pick<StoreState, "items">, request: CustomerRequest) {
  return (request.lines ?? [])
    .filter((l) => l.decision === "rejected")
    .map((l) => state.items.find((i) => i.id === l.itemId)?.title.split(" ")[0] ?? "the line")
}

/** The customer's answer on a pay-run approval. A rejected line goes back
    to review with their reason, out of the run: the lines they approved
    can be paid without it. */
export function answerPayApproval(state: StoreState, request: CustomerRequest, by: { name: string }): StoreState {
  const rejected = (request.lines ?? []).filter((l) => l.decision === "rejected")
  if (!rejected.length) return state
  return {
    ...state,
    items: state.items.map((item) => {
      const line = rejected.find((l) => l.itemId === item.id)
      if (!line) return item
      const payroll = getPayroll(state.items, state.progress, item.clientId, item.period, state.closing)
      if (payroll.paid.includes(item) || payroll.locked) return item
      const reason = `${by.name} rejected it: “${line.note ?? "no reason given"}”`
      return {
        ...item,
        status: "needs_review",
        snoozedUntil: undefined,
        suggestion: {
          ...item.suggestion,
          confidence: Math.min(item.suggestion.confidence, 0.5),
          reasoning: [reason, ...item.suggestion.reasoning.filter((r) => r !== reason)],
        },
        activity: [
          ...item.activity,
          log("system", "Back in review", "Out of the run until it's fixed and approved again. The rest can be paid."),
        ],
      }
    }),
  }
}

/** Closes a rejected pay-run approval once every rejected line is dealt
    with: moved to next month, left out, or sent again. */
export function settlePayApprovals(state: StoreState, clientId: string): StoreState {
  let changed = false
  const requests = state.requests.map((r) => {
    if (r.status !== "replied" || !isPayApproval(r) || r.clientId !== clientId) return r
    const outcomes: string[] = []
    for (const line of r.lines ?? []) {
      if (line.decision !== "rejected") continue
      const item = state.items.find((i) => i.id === line.itemId)
      if (!item) continue
      const first = item.title.split(" ")[0]
      if (item.movedFrom) outcomes.push(`${first}'s pay moves to ${longMonth(item.period)}'s run`)
      else if (item.skipped) outcomes.push(`${first} isn't paid for ${longMonth(item.period)}`)
      else return r
    }
    if (!outcomes.length) return r
    changed = true
    const text = `${list(outcomes)}.`
    return closeRequest(r, "done", `Thanks for flagging it. ${text.charAt(0).toUpperCase()}${text.slice(1)}`)
  })
  return changed ? { ...state, requests } : state
}

export function peopleApply(state: StoreState, action: PeopleAction): StoreState {
  const people = peopleOf(state)
  switch (action.type) {
    case "add_hire":
      return hire(state, action, action.from ?? `Added by ${CURRENT_USER.name}`)

    case "mark_leaving":
      return leave(state, action.clientId, action.employeeId, action.end, `${CURRENT_USER.name} marked them as leaving`)

    case "add_correction": {
      const client = CLIENT_BY_ID.get(action.clientId)
      const employee = stored(state, action.clientId).find((e) => e.id === action.employeeId)
      if (!client || !employee || action.amount <= 0) return state
      const n = state.items.filter((i) => i.id.startsWith(`${action.clientId}-pr-${action.month}-c`)).length
      const earned = longMonth(action.earnedIn)
      const paidIn = longMonth(nextMonth(action.month))
      const template = state.items.findLast(
        (i) => i.clientId === action.clientId && i.domain === "payroll" && i.title === employee.name
      )
      const item: ReviewItem = {
        id: `${action.clientId}-pr-${action.month}-c${n + 1}`,
        clientId: action.clientId,
        domain: "payroll",
        period: action.month,
        title: employee.name,
        subtitle: `${action.what} for ${earned}, paid now`,
        date: payDates(client, action.month).payDate,
        amount: action.amount,
        basis: `Correction · ${earned}`,
        source: `Added by ${CURRENT_USER.name}`,
        evidence: { label: "Note", attached: true, fileName: "Note" },
        facts: template?.facts ?? [{ label: "Employer", value: client.name }],
        suggestion: {
          lines: [{ account: `${action.what} for ${earned}, paid now`, amount: action.amount }],
          confidence: 0.86,
          reasoning: [
            action.note.trim() || `Earned in ${earned}, missed in ${earned}'s run.`,
            `Paid in this run and reported in ${paidIn}'s A-melding, dated when it is paid.`,
            `Booked back to ${earned}: Dr 5000 / Cr 2980 accrued salary, reversed when it is paid.`,
          ],
        },
        status: "needs_review",
        activity: [
          log("accountant", `Added a correction for ${earned}`, action.note.trim() || undefined),
          log(
            "agent",
            `Booked back to ${earned}`,
            `Dr 5000 Salaries / Cr 2980 Accrued salary in ${earned}. Reversed when it is paid in ${paidIn}.`
          ),
        ],
      }
      return {
        ...withPeople(state, {
          ...people,
          corrections: [
            ...people.corrections,
            { itemId: item.id, clientId: action.clientId, earnedIn: action.earnedIn, what: action.what },
          ],
        }),
        items: [...state.items, item],
      }
    }

    case "track_approval": {
      const request = state.requests.findLast(
        (r) =>
          r.clientId === action.clientId &&
          r.period === action.month &&
          r.kind === "approval" &&
          r.domain === "payroll"
      )
      if (!request) return state
      const payroll = getPayroll(state.items, state.progress, action.clientId, action.month, state.closing)
      const amounts = Object.fromEntries(
        (request.lines ?? []).map((l) => [l.itemId, state.items.find((i) => i.id === l.itemId)?.amount ?? 0])
      )
      const key = payRunKey(action.clientId, action.month, payroll.nextSeq)
      const contact = CLIENT_BY_ID.get(action.clientId)?.contacts.find((c) => c.id === request.recipientId)
      // The new list replaces any still open for the month, and closes
      // the ones answered with a rejection: what they asked about is in it.
      const requests = state.requests.map((r) => {
        if (r.id === request.id || !isPayApproval(r) || r.clientId !== action.clientId || r.period !== action.month)
          return r
        if (r.status === "sent")
          return closeRequest(r, "cancelled", `We've sent you an updated version (${request.id}). No need to answer this one.`)
        if (r.status === "replied")
          return closeRequest(
            r,
            "done",
            `Thanks! We've sorted out ${list(rejectedNames(state, r))} and sent ${request.id} for you to approve.`
          )
        return r
      })
      return {
        ...withPeople(state, { ...people, approvals: { ...people.approvals, [key]: { requestId: request.id, amounts } } }),
        requests,
        items: state.items.map((i) =>
          i.id in amounts
            ? { ...i, activity: [...i.activity, log("accountant", `Sent to ${contact?.name ?? "the customer"} for approval`, request.title)] }
            : i
        ),
      }
    }

    case "apply_checkin": {
      const request = state.requests.find((r) => r.id === action.requestId)
      const answer = request?.checkin
      if (!request || !answer || people.applied[request.id]) return state
      const who = request.answeredBy?.name ?? "The customer"
      const from = `Check-in · ${who}`
      // A month already closed takes nothing new: hires go into the next
      // month's run, and absence is noted for the record only.
      const locked = getPayroll(state.items, state.progress, request.clientId, request.period, state.closing).locked
      const month = locked ? nextMonth(request.period) : request.period
      let next = state
      const done: string[] = []
      const unmatched: string[] = []
      for (const text of entries(answer.hires)) {
        const parsed = parseHire(text, month)
        if (!parsed) {
          unmatched.push(text)
          continue
        }
        next = hire(next, { clientId: request.clientId, month, ...parsed }, from)
        done.push(locked ? `${parsed.name} added to ${longMonth(month)}'s run` : `${parsed.name} added`)
      }
      for (const text of entries(answer.leavers)) {
        const [employee] = named(stored(next, request.clientId).filter((e) => e.clientId === request.clientId), text)
        if (!employee) {
          unmatched.push(text)
          continue
        }
        const end = parseDate(text) ?? lastDay(nextMonth(request.period))
        next = leave(next, request.clientId, employee.id, end, `${who} said in the check-in`)
        done.push(`${employee.name.split(" ")[0]} leaving ${dayLabel(end)}`)
      }
      const reported: [string | undefined, string, string][] = [
        [answer.absence, "absence", "reported absence"],
        [answer.overtime, "overtime", "confirmed overtime"],
      ]
      for (const [field, noun, verb] of reported)
      for (const text of entries(field)) {
        const found = named(stored(next, request.clientId).filter((e) => e.clientId === request.clientId), text)
        if (!found.length) unmatched.push(text)
        for (const employee of found) {
          const line = next.items.findLast(
            (i) =>
              i.clientId === request.clientId &&
              i.domain === "payroll" &&
              i.period === request.period &&
              i.title === employee.name &&
              !peopleOf(next).corrections.some((c) => c.itemId === i.id)
          )
          if (!line || locked) {
            if (locked) unmatched.push(`${text} (${longMonth(request.period)} is closed)`)
            continue
          }
          next = flagLine(next, line.id, `Check-in: “${text}”`, `${who} ${verb} in the check-in`, 0.7)
          // Overtime waiting on the customer's OK has it now: the line is
          // back with the accountant, and the question about it is answered.
          if (noun === "overtime" && line.issue === "overtime_unapproved") {
            const asked = line.requestId ? next.requests.find((r) => r.id === line.requestId) : undefined
            next = {
              ...next,
              items: next.items.map((i) =>
                i.id === line.id
                  ? {
                      ...i,
                      status: "customer_replied",
                      suggestion: {
                        ...i.suggestion,
                        confidence: 0.92,
                        reasoning: [...i.suggestion.reasoning, `${who} confirmed the overtime in the check-in.`],
                      },
                    }
                  : i
              ),
              requests: next.requests.map((r) =>
                r.id === asked?.id && r.status === "sent"
                  ? { ...r, status: "replied", reply: { text: `Answered in the check-in: ${text}`, time: "Just now" } }
                  : r
              ),
            }
          }
          // A question the agent drafted about the same line is out of date:
          // the customer just told us. Ask again if it's still needed.
          const draft = next.requests.find((r) => r.itemId === line.id && r.status === "draft")
          if (draft)
            next = {
              ...next,
              requests: next.requests.filter((r) => r.id !== draft.id),
              items: next.items.map((i) =>
                i.id === line.id
                  ? {
                      ...i,
                      requestId: undefined,
                      activity: [...i.activity, log("system", "Dropped the agent's draft question", "The check-in answered it.")],
                    }
                  : i
              ),
            }
          done.push(`${noun} on ${employee.name.split(" ")[0]}'s line`)
        }
      }
      const summary =
        [done.join(" · "), unmatched.length ? `not matched: ${unmatched.join("; ")}` : ""]
          .filter(Boolean)
          .join(" · ") || "Nothing to change"
      return {
        ...withPeople(next, {
          ...peopleOf(next),
          applied: { ...peopleOf(next).applied, [request.id]: { ...stamp(), summary } },
        }),
        requests: next.requests.map((r) =>
          r.id === request.id ? { ...r, status: "resolved", resolution: "done" } : r
        ),
      }
    }

    case "override": {
      const payroll = getPayroll(state.items, state.progress, action.clientId, action.month, state.closing)
      const key =
        action.what === "checkin"
          ? checkinKey(action.clientId, action.month)
          : approvalKey(action.clientId, action.month, payroll.nextSeq)
      const reason = action.reason.trim()
      if (!reason) return state
      const title =
        action.what === "checkin"
          ? "Going ahead without the check-in answer"
          : "Approving the run without the customer's approval"
      const affected = new Set([...payroll.ready, ...payroll.open].map((i) => i.id))
      // What the customer still has open for it closes, so they aren't left
      // answering something that already went ahead. The reason is the
      // firm's: they get a plain note.
      const name = longMonth(action.month)
      const requests = state.requests.map((r) => {
        if (r.clientId !== action.clientId || r.period !== action.month || r.status === "resolved" || r.status === "draft")
          return r
        if (action.what === "checkin" && r.kind === "payroll_checkin")
          return closeRequest(r, "cancelled", `No need to answer this one any more: we went ahead with ${name}'s pay run.`)
        if (action.what === "approval" && isPayApproval(r))
          return closeRequest(
            r,
            r.status === "sent" ? "cancelled" : "done",
            `No need to approve this one: we went ahead with ${name}'s pay run after talking to you.`
          )
        return r
      })
      return {
        ...withPeople(state, { ...people, overrides: { ...people.overrides, [key]: { ...stamp(), reason } } }),
        requests,
        items: state.items.map((i) =>
          affected.has(i.id)
            ? { ...i, activity: [...i.activity, log("accountant", `${title} · ${CURRENT_USER.name}`, reason)] }
            : i
        ),
      }
    }

    case "set_opt_out": {
      const optOut = { ...people.optOut }
      if (action.optOut) optOut[action.clientId] = stamp()
      else delete optOut[action.clientId]
      return withPeople(state, { ...people, optOut })
    }

    case "simulate_late_checkin": {
      const request = state.requests.find((r) => r.id === action.requestId)
      const client = request ? CLIENT_BY_ID.get(request.clientId) : undefined
      if (!request || !client || request.status !== "sent") return state
      const contact = client.contacts.find((c) => c.id === request.recipientId) ?? client.contacts[0]
      const at = `${addDays(payDates(client, request.period).cutoff, 3)}T10:12`
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status: "resolved",
                resolution: "done",
                checkin: { noChanges: true },
                answeredBy: { contactId: contact.id, name: contact.name, at },
              }
            : r
        ),
      }
    }
  }
}
