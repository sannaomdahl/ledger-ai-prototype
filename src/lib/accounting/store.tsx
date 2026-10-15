"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react"

import {
  addDays,
  cannedReply,
  CLIENT_BY_ID,
  CLIENTS,
  createInitialData,
  CURRENT_USER,
  dayLabel,
  monthName,
  nextMonth,
  OPEN_MONTH,
  getClientsVersion,
  paidFromAccount,
  setOnboardedClients,
  suggestFromNote,
  TEAM_BY_ID,
} from "./data"
import { TODAY } from "./deadlines"
import { isLateInvoice, lateInvoiceInfo, vatTermFiled } from "./filings"
import { approvalsApply, seedApprovals, type ApprovalsAction, type ApprovalsState } from "./approvals"
import { documentsApply, EMPLOYEE_PAYABLE, type DocumentsAction } from "./documents"
import { emailNewTasks, emailReminder, emailReport } from "./notify"
import {
  company,
  handedOverClients,
  migrateOnboarding,
  onboardingReducer,
  seedOnboarding,
  type OnboardingAction,
  type OnboardingCase,
} from "./onboarding"
import { getMonthClose } from "./month-close"
import { OUTCOMES, settle, type Outcome } from "./outcomes"
import { getPayroll, payRunKey, type PayHold } from "./payroll"
import {
  answerPayApproval,
  checkinHasChanges,
  closeRequest,
  peopleApply,
  seedPeople,
  settlePayApprovals,
  type PeopleAction,
  type PeopleState,
} from "./people"
import { readAnswer } from "./read-answer"
import { isBundle } from "./request-labels"
import {
  bookedIntoReopened,
  signKey,
  isWorkable,
  migratePeriods,
  monthStatus,
  periodsApply,
  recordClose,
  reopenMonth,
  seedPeriods,
  type PeriodsAction,
  type PeriodsState,
} from "./periods"
import { RECON_ISSUES } from "./reconciliation"
import { seedRules } from "./rules"
import { closeKey, shortMonth, type Closing } from "./report"
import {
  EMPTY_PROGRESS,
  isMonthClosed,
  NO_SIGNOFFS,
  seedProgress,
  type Signoffs,
} from "./signoffs"
import { cannedTeamReply, isParked, type Task } from "./team"
import { log, stamp } from "./trail"
import { nextRequestId } from "./ids"
import type {
  Activity,
  AgentRule,
  Answered,
  ApprovalLine,
  CheckinAnswer,
  Handoff,
  TeamFields,
  TeamNote,
  Client,
  CustomerReply,
  CustomerRequest,
  Domain,
  PayRun,
  Progress,
  ReconResolution,
  ReviewItem,
  ThreadMessage,
} from "./types"

export type Scope = "mine" | "all"

export type DismissReason =
  | "have_info"
  | "handle_myself"
  | "agent_wrong"
  | "not_needed"

export const DISMISS_REASONS: Record<DismissReason, string> = {
  have_info: "I already have what I need",
  handle_myself: "I'll handle it with the customer myself",
  agent_wrong: "The agent is wrong about this line",
  not_needed: "Not worth asking about",
}

type State = {
  items: ReviewItem[]
  requests: CustomerRequest[]
  /** Months the accountant closed and reported on, per client. */
  closing: Closing
  /** Pay runs, filings and bank issues the accountant signed off. */
  progress: Progress
  /** My customers or the whole firm. Drives the sidebar, lists and home. */
  scope: Scope
  /** The working month every screen shows. */
  month: string
  /** The item open in the detail panel. */
  openItemId: string | null
  /** A manual task open in the detail panel (it has no item behind it). */
  openRequestId: string | null
  /** The list the panel was opened from, so ↑/↓ walk the same rows and a
      decision moves on to the next one. Item ids and request ids (a task
      with no bank line or pay line behind it) can be mixed. */
  nav: string[]
  /** The item the "Ask customer" composer is drafting for. */
  askItemId: string | null
  /** The manual-task composer, with the client preselected when known. */
  taskComposer: { clientId: string | null; draft?: TaskDraft } | null
  /** Rules the accountant taught the agents. */
  rules: AgentRule[]
  /** The "Ask a colleague" / "Hand over" dialog and the task it is for. */
  teamDialog: { id: string; mode: Handoff["mode"] } | null
  /** Companies on their way in, and the ones handed over to operations
      (those are clients now; see `handedOverClients`). */
  onboarding: OnboardingCase[]
  /** The saved data had its chance to load. Before that, a client that
      only exists in it (one handed over from onboarding) isn't known yet. */
  loaded: boolean
  /** Attestering: approved suppliers, the approval policy per client and
      where approved invoices are in their payment. See approvals.ts. */
  approvals: ApprovalsState
  /** Employees, their pay agreements and each pay period's check-in. See
      people.ts. */
  people: PeopleState
  /** Reopened months and the reconciliations beyond the bank. See
      periods.ts. */
  periods: PeriodsState
}

/** The store's state, for the feature modules that plug into it. */
export type StoreState = State

/** A task the firm sends that carries its own content: an approval list
    or a pay period check-in. The store gives it an id and sends it. */
export type NewRequest = Omit<CustomerRequest, "id" | "status" | "round" | "sentAt">

/** What the manual-task composer opens with, when something else (a
    reconciliation finding) already knows what to ask. */
export type TaskDraft = { title: string; message: string }

type AskPayload = Pick<
  CustomerRequest,
  | "kind"
  | "title"
  | "message"
  | "recipientId"
  | "due"
  | "priority"
  | "responseType"
  | "options"
>

type Action =
  | {
      type: "confirm"
      ids: string[]
      /** How a flagged line was settled, when not simply as suggested. */
      outcome?: Outcome
      /** A late invoice: reopen its own month and book it there. */
      backdate?: boolean
    }
  | { type: "ask"; itemId: string; request: AskPayload }
  | {
      type: "add_task"
      clientId: string
      request: AskPayload
      /** Which part of the job it belongs to; general when left out. */
      domain?: Domain | "general"
      /** The line it is about, without being that line's question. */
      about?: string
    }
  | { type: "simulate_reply"; requestId: string }
  /** Nudges the customer: the reminder lands on the task in their app
      (and by e-mail), saying what's still open. */
  | { type: "remind"; requestId: string; text?: string }
  | { type: "resolve_request"; requestId: string }
  /** Takes back a task the customer hasn't answered: gone from their app,
      marked withdrawn. */
  | { type: "withdraw_request"; requestId: string }
  | {
      type: "update_posting"
      itemId: string
      account: string
      vat?: string
      /** Who it's on, for accounts kept per person (1570, 1571, 2910). */
      counterparty?: string
    }
  | { type: "open_item"; id: string | null; nav?: string[] }
  | { type: "open_request"; id: string | null; nav?: string[] }
  | { type: "step"; dir: 1 | -1 }
  | { type: "dismiss_draft"; requestId: string; reason: DismissReason }
  | { type: "restore_draft"; request: CustomerRequest }
  | { type: "open_ask"; id: string | null }
  | { type: "open_task_composer"; clientId: string | null; draft?: TaskDraft }
  | { type: "close_task_composer" }
  | { type: "set_scope"; scope: Scope }
  | { type: "set_month"; month: string }
  | {
      type: "customer_reply"
      requestId: string
      text: string
      attachment?: string
      /** The contact answering, when it isn't the task's recipient. */
      contactId?: string
    }
  | {
      /** The customer opens a question or sends something unasked. */
      type: "customer_ask"
      clientId: string
      contactId: string
      domain: Domain | "general"
      title: string
      text: string
      attachment?: string
    }
  | {
      /** The customer adds to a conversation that is already open. */
      type: "customer_message"
      requestId: string
      text: string
      attachment?: string
    }
  | {
      /** The accountant answers in the thread; `close` also marks it done. */
      type: "accountant_message"
      requestId: string
      text: string
      close: boolean
    }
  | {
      /** Moves an invoice or receipt to the month it belongs to, and spreads
          its cost over `accrueMonths` from there. */
      type: "set_allocation"
      itemId: string
      period: string
      accrueMonths: number
    }
  | { type: "accept_matches"; ids: string[] }
  | { type: "unmatch"; id: string }
  | {
      /** Pays everyone approved and not paid yet, as the month's next run.
          `holds` says what happens to each employee left out of it. */
      type: "approve_pay_run"
      clientId: string
      month: string
      holds?: Record<string, PayHold>
      /** The regular run moved by late answers (see people.ts). */
      payDate?: string
    }
  | {
      /** Moves a pay line to next month's run, leaves it out of this
          month's pay, or (null) puts it back where it was. */
      type: "set_pay_hold"
      itemId: string
      hold: Exclude<PayHold, "follow_up"> | null
    }
  | {
      /** Something the accountant learned outside the app (a call, an
          e-mail): the agent re-suggests from it and any open question to
          the customer is closed. */
      type: "agent_note"
      itemId: string
      text: string
    }
  | {
      /** An answer showed earlier bookings were wrong the same way: correct
          them (the item's `suggestion.lookBack`). */
      type: "correct_earlier"
      itemId: string
    }
  | { type: "resolve_recon"; issueId: string; how: ReconResolution["how"] }
  | { type: "unresolve_recon"; issueId: string }
  | {
      type: "submit_filing"
      filingId: string
      /** A corrected return for these late invoices. */
      correction?: string[]
    }
  | {
      /** Closes the month for a client and publishes its report. */
      type: "close_month"
      clientId: string
      month: string
      note: string
    }
  | { type: "reopen_month"; clientId: string; month: string; reason?: string }
  /** Sends a task built elsewhere (approval lists, pay check-ins). */
  | {
      type: "send_request"
      request: NewRequest
      /** Unanswered lists the new one takes over: closed with a note. */
      replaces?: string[]
    }
  | {
      /** The customer decides on the lines of an approval task. */
      type: "customer_approve"
      requestId: string
      lines: ApprovalLine[]
      contactId?: string
    }
  | {
      /** The customer answers a pay period check-in. */
      type: "customer_checkin"
      requestId: string
      answer: CheckinAnswer
      contactId?: string
    }
  | { type: "approvals"; action: ApprovalsAction }
  | { type: "people"; action: PeopleAction }
  | { type: "periods"; action: PeriodsAction }
  | { type: "documents"; action: DocumentsAction }
  | {
      type: "hydrate"
      items: ReviewItem[]
      requests: CustomerRequest[]
      closing?: Closing
      progress?: Progress
      rules?: AgentRule[]
      onboarding?: OnboardingCase[]
      approvals?: ApprovalsState
      people?: PeopleState
      periods?: PeriodsState
    }
  | { type: "onboarding"; action: OnboardingAction }
  | { type: "loaded" }
  | {
      /** Asks a colleague about a task, or hands it to them. */
      type: "team_handoff"
      id: string
      mode: Handoff["mode"]
      to: string
      note: string
    }
  | { type: "team_note"; id: string; text: string }
  | { type: "simulate_team_reply"; id: string }
  /** Takes back an open ask, or a task handed to someone else. */
  | { type: "withdraw_handoff"; id: string }
  | { type: "snooze"; id: string; until: string | null }
  | { type: "add_rule"; itemId: string }
  | { type: "remove_rule"; ruleId: string }
  | { type: "reverse_booking"; itemId: string }
  | { type: "open_team_dialog"; id: string; mode: Handoff["mode"] }
  | { type: "close_team_dialog" }
  | { type: "reset" }

function init(): State {
  const { items, requests } = createInitialData()
  const onboarding = seedOnboarding()
  setOnboardedClients(handedOverClients(onboarding))
  return {
    items,
    requests,
    closing: {},
    progress: seedProgress(),
    scope: "mine",
    month: OPEN_MONTH,
    openItemId: null,
    openRequestId: null,
    nav: [],
    askItemId: null,
    taskComposer: null,
    rules: seedRules(),
    teamDialog: null,
    onboarding,
    loaded: false,
    approvals: seedApprovals(),
    people: seedPeople(),
    periods: seedPeriods(),
  }
}

/** A message from the firm on a request's thread, for the customer. */
function firmMessage(request: CustomerRequest, text: string): CustomerRequest {
  return { ...request, thread: [...(request.thread ?? []), message(request, "accountant", { text })] }
}

/** Next free voucher sequence number: one past the highest ever issued.
    A reversed voucher keeps its number (it is still on the line's trail), so
    booking again never reuses one Tripletex already has. Derived from state
    so StrictMode's double-invoked reducer never skips numbers. */
function nextVoucher(items: ReviewItem[]) {
  let highest = 412
  const seen = (text: string | undefined) => {
    for (const match of text?.matchAll(/\b\d{4}-0(\d+)\b/g) ?? [])
      highest = Math.max(highest, Number(match[1]))
  }
  for (const item of items) {
    if (item.domain !== "bookkeeping") continue
    seen(item.voucherNo)
    for (const entry of item.activity) if (/voucher/i.test(entry.title)) seen(entry.title)
  }
  return highest + 1
}

const GENERIC_REPLY: Record<CustomerRequest["responseType"], string> = {
  text: "Done, see my note: the numbers are in the shared folder.",
  choice: "",
  file: "Uploaded.",
  confirm: "Yes, confirmed.",
  approval: "Approved.",
  checkin: "No changes since last month.",
}

/** The customer who answers: the one named, else the task's recipient. */
function answeredBy(request: CustomerRequest, contactId?: string): Answered {
  const client = CLIENT_BY_ID.get(request.clientId)
  const contact =
    client?.contacts.find((c) => c.id === (contactId ?? request.recipientId)) ??
    client?.contacts[0]
  const clock = new Date().toTimeString().slice(0, 5)
  return {
    contactId: contact?.id ?? request.recipientId,
    name: contact?.name ?? "The customer",
    at: `${TODAY}T${clock}`,
  }
}

/** Records the customer's decisions on an approval task. Everything
    approved settles it; a rejected line hands it back to the firm. */
function withApproval(
  state: State,
  request: CustomerRequest,
  lines: ApprovalLine[],
  by: Answered
): State {
  const decided = new Map(lines.map((l) => [l.itemId, l]))
  const merged = (request.lines ?? []).map((l) => ({ ...l, ...decided.get(l.itemId) }))
  const allApproved = merged.every((l) => l.decision === "approved")
  const requests = state.requests.map((r) =>
    r.id === request.id
      ? {
          ...r,
          lines: merged,
          answeredBy: by,
          status: allApproved ? ("resolved" as const) : ("replied" as const),
          resolution: allApproved ? ("done" as const) : r.resolution,
        }
      : r
  )
  const items = state.items.map((i) => {
    const line = decided.get(i.id)
    if (!line?.decision) return i
    return {
      ...i,
      activity: [
        ...i.activity,
        log(
          "customer",
          line.decision === "approved"
            ? `Approved by ${by.name}${line.remember ? ", from now on" : ""}`
            : `Rejected by ${by.name}`,
          line.note
        ),
      ],
    }
  })
  const next = { ...state, requests, items }
  const answered = requests.find((r) => r.id === request.id)!
  return request.domain === "payroll" ? answerPayApproval(next, answered, by) : next
}

/** The customer's answer: the first one fills `reply`, later ones continue
    the thread so a follow-up never overwrites what was said before. */
function withCustomerAnswer(
  request: CustomerRequest,
  reply: CustomerReply
): CustomerRequest {
  if (!request.reply && !request.thread?.length)
    return { ...request, status: "replied", reply }
  return {
    ...request,
    status: "replied",
    thread: [...(request.thread ?? []), message(request, "customer", reply)],
  }
}

/** Ids come from the thread length, so StrictMode's double-invoked reducer
    produces the same one twice. */
function message(
  request: CustomerRequest,
  from: ThreadMessage["from"],
  body: { text: string; attachment?: string }
): ThreadMessage {
  return {
    id: `${request.id}-${(request.thread?.length ?? 0) + 1}`,
    from,
    text: body.text,
    attachment: body.attachment,
    time: "Just now",
  }
}

/** A reminder that says what's still open: on a list, each line with its
    amount and due date; otherwise the task and when it's due. */
export function remindText(state: Pick<State, "items">, request: CustomerRequest) {
  const lines = (request.lines ?? []).filter((l) => !l.decision)
  if (request.kind === "payroll_checkin")
    return `the check-in before the pay run is still open. Reply by ${request.due || "the cut-off"} so salaries go out on payday: later than that, payday moves. "No changes" is one tap.`
  if (!lines.length) return `"${request.title}" is still open${request.due ? `, due ${request.due}` : ""}.`
  const nok = (n: number) => `${new Intl.NumberFormat("nb-NO").format(Math.abs(n))} kr`
  const parts = lines.flatMap((l) => {
    const item = state.items.find((i) => i.id === l.itemId)
    if (!item) return []
    if (item.domain === "payroll") return [`${item.title.split(" ")[0]} ${nok(item.amount)}`]
    const due = item.dueDate ?? item.date
    const late = due < TODAY
    return [`${item.title} ${nok(item.amount)} (${late ? "was due" : "due"} ${Number(due.slice(8))} ${MONTH_SHORT[due.slice(5, 7)]})`]
  })
  const what = request.domain === "payroll" ? "pay lines" : "invoices"
  const hold =
    request.domain === "payroll"
      ? "Salaries go out once you've answered."
      : "They aren't paid until you approve, so a late answer means late payments."
  return `${parts.length} ${parts.length === 1 ? what.slice(0, -1) : what} still ${parts.length === 1 ? "waits" : "wait"} for your answer: ${parts.join(", ")}. ${hold}`
}

const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

function withActivity(
  items: ReviewItem[],
  itemId: string | undefined,
  ...entries: Activity[]
) {
  if (!itemId) return items
  return items.map((i) =>
    i.id === itemId ? { ...i, activity: [...i.activity, ...entries] } : i
  )
}

/** Whether the accountant still owes this row a decision. */
function awaitsDecision(state: State, id: string) {
  const item = state.items.find((i) => i.id === id)
  if (item)
    return (
      (item.status === "needs_review" || item.status === "customer_replied") &&
      !item.skipped &&
      !isParked(item)
    )
  const request = state.requests.find((r) => r.id === id)
  return (
    (request?.status === "draft" || request?.status === "replied") &&
    !isParked(request)
  )
}

function findTask(state: State, id: string): Task | undefined {
  return state.items.find((i) => i.id === id) ?? state.requests.find((r) => r.id === id)
}

/** Changes the team fields of a bank line, pay line or request, and logs
    it on the line's trail (requests show their notes instead). */
function withTask(
  state: State,
  id: string,
  patch: (task: Task) => TeamFields,
  ...entries: Activity[]
): State {
  if (state.items.some((i) => i.id === id))
    return {
      ...state,
      items: state.items.map((i) =>
        i.id === id ? { ...i, ...patch(i), activity: [...i.activity, ...entries] } : i
      ),
    }
  return {
    ...state,
    requests: state.requests.map((r) => (r.id === id ? { ...r, ...patch(r) } : r)),
  }
}

/** Ids come from the note count, so StrictMode's double-invoked reducer
    produces the same one twice. */
function teamNote(task: Task, authorId: string, text: string): TeamNote {
  return {
    id: `${task.id}-n${(task.notes?.length ?? 0) + 1}`,
    authorId,
    text,
    time: "Just now",
  }
}

/** Points the panel at an item or a request, whichever the id names. */
function focus(state: State, id: string): State {
  return state.items.some((i) => i.id === id)
    ? { ...state, openItemId: id, openRequestId: null }
    : { ...state, openItemId: null, openRequestId: id }
}

/** The row a decision was just taken on, if it is the one in the panel. */
function decidedOn(state: State, action: Action): string | undefined {
  const open = state.openItemId ?? state.openRequestId
  if (!open) return undefined
  const ids: string[] = []
  switch (action.type) {
    case "confirm":
      ids.push(...action.ids)
      break
    case "ask":
    case "agent_note":
      ids.push(action.itemId)
      break
    case "team_handoff":
    case "snooze":
      ids.push(action.id)
      break
    case "dismiss_draft":
    case "resolve_request":
    case "accountant_message": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (request) ids.push(request.id, ...(request.itemId ? [request.itemId] : []))
      break
    }
    default:
      return undefined
  }
  return ids.includes(open) ? open : undefined
}

/** "2026-10-05" → "5 Oct". */
function formatDay(iso: string) {
  return `${Number(iso.slice(8))} ${shortMonth(iso.slice(0, 7))}`
}

/** Open bank lines a new rule applies to: same client, same counterparty. */
export function followsRule(line: ReviewItem, source: ReviewItem) {
  return (
    line.id !== source.id &&
    line.clientId === source.clientId &&
    line.domain === "bookkeeping" &&
    line.title === source.title &&
    line.status !== "booked"
  )
}

/** Sets (or, with null, clears) one entry in a progress map. */
function withProgress<K extends keyof Progress>(
  state: State,
  map: K,
  key: string,
  value: Progress[K][string] | null
): State {
  const next = { ...state.progress[map] } as Progress[K]
  if (value === null) delete next[key]
  else next[key] = value
  return { ...state, progress: { ...state.progress, [map]: next } }
}

function reducer(state: State, action: Action): State {
  const next = moveOn(state, action)
  // A company handed over from onboarding is a client in operation: keep the
  // client registry (CLIENTS, CLIENT_BY_ID, scopedClients) in step with the
  // cases, whether they changed here, loaded or came from another tab. It
  // only mirrors the state, so running twice (StrictMode) does no harm.
  if (next.onboarding !== state.onboarding)
    setOnboardedClients(handedOverClients(next.onboarding))
  return next
}

const CARRIED_KIND = { confirm: "confirm", text: "custom", file: "document", choice: "custom" } as const

/** A company in operation answers in its customer app, not on the
    onboarding link: whatever was still with them at the hand-over, or sent
    after it, becomes a task there. The onboarding task points at it. */
function carryIntoApp(state: State): State {
  let next = state
  for (const c of state.onboarding) {
    if (!c.handedOver) continue
    for (const task of c.tasks) {
      const kind = task.ask?.kind
      // A task we check ourselves stays ours: the check settles it, not a reply.
      if (task.status !== "with_customer" || task.movedTo || task.verify || !kind || !(kind in CARRIED_KIND)) continue
      const id = nextRequestId(next.requests, "TASK", 400)
      const request: CustomerRequest = {
        id,
        clientId: c.id,
        domain: "general",
        period: isWorkable(monthStatus(c.id, next.month, next)) ? next.month : OPEN_MONTH,
        responseType: kind as keyof typeof CARRIED_KIND,
        options: task.ask!.options,
        kind: CARRIED_KIND[kind as keyof typeof CARRIED_KIND],
        title: task.title,
        message: task.ask!.message,
        recipientId: company(c).contact.id,
        due: dayLabel(addDays(TODAY, 7)),
        priority: "medium",
        status: "sent",
        round: 1,
        sentAt: "Just now",
      }
      next = {
        ...next,
        requests: [...next.requests, request],
        onboarding: onboardingReducer(
          next.onboarding,
          { type: "moved_task", caseId: c.id, taskId: task.id, requestId: id },
          CURRENT_USER.id
        ),
      }
    }
  }
  return next
}

/** After a decision on the open row, the panel moves on to the next row in
    the same list that still needs one, so a column of drafts or a queue of
    lines can be worked straight through. With nothing left it stays put. */
function moveOn(state: State, action: Action): State {
  const decided = decidedOn(state, action)
  const next = apply(state, action)
  if (!decided) return next
  const index = next.nav.indexOf(decided)
  if (index < 0) return next
  const ahead = [...next.nav.slice(index + 1), ...next.nav.slice(0, index)]
  const target = ahead.find((id) => awaitsDecision(next, id))
  if (!target) return next
  // The decided row has left the list it was opened from ("3 / 4" counts
  // what is left to decide).
  return { ...focus(next, target), nav: next.nav.filter((id) => id !== decided) }
}

function apply(state: State, action: Action): State {
  switch (action.type) {
    case "confirm": {
      const ids = new Set(action.ids)
      const resolvedRequests = new Set<string>()
      let voucherSeq = nextVoucher(state.items)

      // A late invoice booked back into its own month reopens that month
      // first (unless it is reopened already), with the invoice as reason.
      let opened = state
      if (action.backdate) {
        for (const item of state.items) {
          if (!ids.has(item.id) || !isLateInvoice(item)) continue
          const month = item.date.slice(0, 7)
          if (monthStatus(item.clientId, month, opened) === "closed")
            opened = reopenMonth(opened, item.clientId, month, `Late invoice from ${item.title}`)
        }
      }

      const items = opened.items.map((original) => {
        if (!ids.has(original.id) || original.status === "booked") return original
        const item = { ...original, ...settle(original, action.outcome) }
        const voucherNo =
          item.domain === "bookkeeping" ? `2026-0${voucherSeq++}` : undefined
        if (item.requestId) resolvedRequests.add(item.requestId)
        // A late invoice goes back into its own month, or stays in the open
        // one and is reported with the next return.
        const late = isLateInvoice(item) ? lateInvoiceInfo(item, state.items, state) : undefined
        const backdate = Boolean(late && action.backdate)
        const period = backdate && late ? late.month : item.period
        // Booked into a month after it closed once: its VAT return takes it
        // late, like a backdated invoice (a filed one needs a correction).
        const intoReopened = bookedIntoReopened({ ...item, period }, opened)
        // Booked into a term whose return already went in (filed before the
        // month closed): the same, it needs a corrected return.
        const intoFiled =
          item.domain === "bookkeeping" && !backdate && vatTermFiled(item.clientId, period, state.items, opened)
        return {
          ...item,
          status: "booked",
          voucherNo,
          period,
          backdated: backdate || intoReopened || intoFiled ? true : undefined,
          snoozedUntil: undefined,
          activity: [
            ...item.activity,
            ...(late
              ? [
                  log(
                    "accountant",
                    backdate
                      ? late.reopened
                        ? `Booked in ${monthName(late.month)}, reopened`
                        : `Reopened ${monthName(late.month)} and booked it there`
                      : `Booked in ${monthName(item.period)}, dated ${monthName(late.month)}`,
                    backdate
                      ? late.filed
                        ? `${late.filing.short} was already filed, so it needs a corrected return.`
                        : `Goes into the ${late.filing.short} return before it is filed.`
                      : `Input VAT is reported with ${late.next.short}. ${late.filing.short} stays as it is.`
                  ),
                ]
              : []),
            log(
              "accountant",
              action.outcome
                ? `${OUTCOMES[action.outcome].log} · ${CURRENT_USER.name}`
                : item.domain === "bookkeeping"
                  ? `Confirmed by ${CURRENT_USER.name}`
                  : `Approved by ${CURRENT_USER.name}`
            ),
            item.domain === "bookkeeping"
              ? log(
                  "system",
                  `Voucher ${voucherNo} created in Tripletex`,
                  `tripletex.create_voucher → ${debitAccount(item)} / ${creditAccount(item)}`
                )
              : log(
                  "system",
                  "Ready for the pay run",
                  "Goes into one salary voucher with the rest of the run."
                ),
          ],
        } satisfies ReviewItem
      })

      // A VAT sign-off no longer holds once something new is booked into its
      // month: sign it again before the return is drafted.
      const touched = new Set(
        items
          .filter((i) => ids.has(i.id) && i.domain === "bookkeeping")
          .map((i) => signKey(i.clientId, i.period, "vat"))
      )
      const signed = Object.fromEntries(
        Object.entries(opened.periods.signed).filter(([key]) => !touched.has(key))
      )
      return {
        ...opened,
        periods: { ...opened.periods, signed },
        items,
        // A draft that never went out just disappears; a sent one resolves.
        requests: state.requests
          .filter((r) => !(resolvedRequests.has(r.id) && r.status === "draft"))
          .map((r) =>
            resolvedRequests.has(r.id) && r.status !== "resolved"
              ? { ...r, status: "resolved", resolution: "booked" }
              : r
          ),
      }
    }

    case "ask": {
      const item = state.items.find((i) => i.id === action.itemId)
      if (!item) return state
      const client = CLIENT_BY_ID.get(item.clientId)
      const recipient = client?.contacts.find(
        (c) => c.id === action.request.recipientId
      )
      const existing = item.requestId
        ? state.requests.find((r) => r.id === item.requestId)
        : undefined
      const reopen = existing && existing.status !== "resolved"

      // Asking again keeps what was said: the first question and the
      // customer's answer stay, the new question follows them. A draft that
      // never went out is simply rewritten.
      const said = Boolean(existing?.reply || existing?.thread?.length)
      const request: CustomerRequest = reopen
        ? said
          ? {
              ...firmMessage(existing, action.request.message),
              ...action.request,
              message: existing.message,
              status: "sent",
              round: existing.round + 1,
              sentAt: existing.sentAt,
            }
          : {
              ...existing,
              ...action.request,
              status: "sent",
              round: existing.round + 1,
              sentAt: "Just now",
            }
        : {
            id: nextRequestId(state.requests, "REQ", 300),
            clientId: item.clientId,
            domain: item.domain,
            itemId: item.id,
            period: item.period,
            ...action.request,
            status: "sent",
            round: 1,
            sentAt: "Just now",
          }

      return {
        ...state,
        askItemId: null,
        requests: reopen
          ? state.requests.map((r) => (r.id === request.id ? request : r))
          : [...state.requests, request],
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "waiting_customer",
                requestId: request.id,
                activity: [
                  ...i.activity,
                  log(
                    "accountant",
                    reopen && existing.round > 0
                      ? `Asked ${recipient?.name ?? "the customer"} again`
                      : `Asked ${recipient?.name ?? "the customer"}`,
                    action.request.message
                  ),
                ],
              }
            : i
        ),
      }
    }

    case "add_task": {
      const request: CustomerRequest = {
        id: nextRequestId(state.requests, "TASK", 400),
        clientId: action.clientId,
        domain: action.domain ?? "general",
        // The month in view, unless that one is closed for this client: a
        // task never lands in a month nobody works in any more.
        period:
          isWorkable(monthStatus(action.clientId, state.month, state)) ? state.month : OPEN_MONTH,
        ...action.request,
        about: action.about,
        status: "sent",
        round: 1,
        sentAt: "Just now",
      }
      return {
        ...state,
        taskComposer: null,
        requests: [...state.requests, request],
      }
    }

    case "simulate_reply": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "sent") return state
      const client = CLIENT_BY_ID.get(request.clientId)
      if (!client) return state
      const recipient =
        client.contacts.find((c) => c.id === request.recipientId) ??
        client.contacts[0]
      const item = request.itemId
        ? state.items.find((i) => i.id === request.itemId)
        : undefined

      if (request.responseType === "approval")
        return withApproval(
          state,
          request,
          (request.lines ?? []).map((l) => ({ ...l, decision: "approved" })),
          answeredBy(request)
        )
      if (request.responseType === "checkin")
        return {
          ...state,
          requests: state.requests.map((r) =>
            r.id === request.id
              ? {
                  ...r,
                  // Nothing changed: nothing for the firm to do with it.
                  status: "resolved",
                  resolution: "done",
                  checkin: { noChanges: true },
                  answeredBy: answeredBy(request),
                }
              : r
          ),
        }

      // A manual task has nothing to re-suggest: the reply is the outcome.
      if (!item) {
        const text =
          request.responseType === "choice"
            ? `Picked: ${request.options?.[0] ?? "Yes"}`
            : GENERIC_REPLY[request.responseType]
        return {
          ...state,
          requests: state.requests.map((r) =>
            r.id === request.id
              ? withCustomerAnswer(r, {
                  text,
                  time: "Just now",
                  attachment:
                    request.responseType === "file" ? "upload.pdf" : undefined,
                })
              : r
          ),
        }
      }

      const outcome = cannedReply(item, client, request)
      const amount =
        item.domain === "payroll"
          ? outcome.suggestion.lines.reduce((sum, l) => sum + l.amount, 0)
          : item.amount

      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? { ...r, status: "replied", reply: outcome.reply }
            : r
        ),
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                amount,
                status: "customer_replied",
                suggestion: outcome.suggestion,
                evidence: outcome.evidence,
                activity: [
                  ...i.activity,
                  log("customer", `${recipient.name} replied`, outcome.reply?.text),
                  log(
                    "agent",
                    "Updated the suggestion from the reply",
                    outcome.suggestion.reasoning[0]
                  ),
                ],
              }
            : i
        ),
      }
    }

    case "customer_reply": {
      // The customer answering from the portal: the same loop as the demo
      // "simulate reply", but with their own words and file.
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "sent") return state
      const client = CLIENT_BY_ID.get(request.clientId)
      if (!client) return state
      const by = answeredBy(request, action.contactId)
      const reply = {
        text: action.text,
        attachment: action.attachment,
        time: "Just now",
      }
      const item = request.itemId
        ? state.items.find((i) => i.id === request.itemId)
        : undefined
      const requests = state.requests.map((r) =>
        r.id === request.id
          ? { ...withCustomerAnswer(r, reply), answeredBy: by }
          : r
      )
      if (!item) return { ...state, requests }

      // The agent reads what they wrote; only an answer it can't read
      // falls back to the demo's script, with their words quoted first.
      const read = readAnswer(item, client, state.items, {
        text: action.text,
        attachment: action.attachment,
        from: "customer",
        name: by.name.split(" ")[0],
      })
      const canned = cannedReply(item, client, request)
      const outcome = read
        ? { ...canned, ...read }
        : {
            ...canned,
            suggestion: {
              ...canned.suggestion,
              reasoning: [`${by.name.split(" ")[0]}: “${action.text.trim()}”`, ...canned.suggestion.reasoning],
            },
          }
      const amount =
        item.domain === "payroll"
          ? outcome.suggestion.lines.reduce((sum, l) => sum + l.amount, 0)
          : item.amount
      return {
        ...state,
        requests,
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                amount,
                status: "customer_replied",
                suggestion: outcome.suggestion,
                evidence: action.attachment
                  ? { ...outcome.evidence, attached: true, fileName: action.attachment }
                  : outcome.evidence,
                activity: [
                  ...i.activity,
                  log(
                    "customer",
                    `${by.name} replied in the customer app`,
                    action.attachment
                      ? `${action.text} (attached ${action.attachment})`
                      : action.text
                  ),
                  log(
                    "agent",
                    "Updated the suggestion from the reply",
                    outcome.suggestion.reasoning[1] ?? outcome.suggestion.reasoning[0]
                  ),
                ],
              }
            : i
        ),
      }
    }

    case "customer_ask": {
      const request: CustomerRequest = {
        // Customer questions are never removed, so their count gives a
        // fresh number even after drafts elsewhere are dismissed.
        id: `Q-${501 + state.requests.filter((r) => r.origin === "customer").length}`,
        clientId: action.clientId,
        domain: action.domain,
        period: state.month,
        origin: "customer",
        responseType: "text",
        kind: "customer_question",
        title: action.title,
        message: action.text,
        // The contact who asked; answers go back to them.
        recipientId: action.contactId,
        due: "",
        priority: "medium",
        // The ball is with the accountant from the start.
        status: "replied",
        round: 1,
        sentAt: "Just now",
        attachment: action.attachment,
      }
      return { ...state, requests: [...state.requests, request] }
    }

    case "customer_message": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status === "draft" || request.status === "resolved")
        return state
      // More from the customer on a line: the agent reads it again.
      const item = request.itemId ? state.items.find((i) => i.id === request.itemId) : undefined
      const client = CLIENT_BY_ID.get(request.clientId)
      const contact = client?.contacts.find((c) => c.id === request.recipientId) ?? client?.contacts[0]
      const read =
        item && client && item.status !== "booked"
          ? readAnswer(item, client, state.items, {
              text: action.text,
              attachment: action.attachment,
              from: "customer",
              name: contact?.name.split(" ")[0] ?? "The customer",
            })
          : null
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status: "replied",
                thread: [...(r.thread ?? []), message(r, "customer", action)],
              }
            : r
        ),
        items:
          read && item
            ? state.items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      ...read,
                      amount:
                        i.domain === "payroll"
                          ? read.suggestion.lines.reduce((sum, l) => sum + l.amount, 0)
                          : i.amount,
                      status: "customer_replied",
                      activity: [
                        ...i.activity,
                        log("agent", "Read the new message and updated the suggestion", read.suggestion.reasoning[1] ?? read.suggestion.reasoning[0]),
                      ],
                    }
                  : i
              )
            : state.items,
      }
    }

    case "accountant_message": {
      const request = state.requests.find((r) => r.id === action.requestId)
      // An approval or a check-in is answered line by line in its own form:
      // a message would reopen it and let a second answer rewrite the first.
      if (!request || request.status === "draft" || request.status === "resolved" || isBundle(request))
        return state
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status: action.close ? "resolved" : "sent",
                resolution: action.close ? "done" : r.resolution,
                thread: [...(r.thread ?? []), message(r, "accountant", action)],
              }
            : r
        ),
      }
    }

    case "hydrate":
      return {
        ...state,
        items: action.items,
        requests: action.requests,
        closing: action.closing ?? {},
        progress: { ...EMPTY_PROGRESS, ...action.progress },
        rules: action.rules ?? seedRules(),
        // Saved before onboarding existed: start from the seed.
        onboarding: action.onboarding ? migrateOnboarding(action.onboarding) : seedOnboarding(),
        // Saved before these existed: start from their seeds.
        approvals: action.approvals ?? seedApprovals(),
        people: action.people ?? seedPeople(),
        periods: migratePeriods(action.periods),
      }

    case "loaded":
      return state.loaded ? state : { ...state, loaded: true }

    case "onboarding":
      return carryIntoApp({
        ...state,
        onboarding: onboardingReducer(state.onboarding, action.action, CURRENT_USER.id),
      })

    case "close_month":
      // A month closed before (and reopened) gets the close on its history:
      // what goes out now is an updated report.
      return recordClose(
        {
          ...state,
          closing: {
            ...state.closing,
            [closeKey(action.clientId, action.month)]: {
              // "28 Sep", like the seeded months' "Closed 9 Sep".
              closedAt: `${Number(TODAY.slice(8))} ${shortMonth(TODAY.slice(0, 7))}`,
              note: action.note,
            },
          },
        },
        action.clientId,
        action.month
      )

    // The customer keeps the report they got until the updated one goes
    // out; see periods.ts.
    case "reopen_month":
      return reopenMonth(state, action.clientId, action.month, action.reason ?? "")

    case "send_request": {
      const prefix =
        action.request.kind === "approval"
          ? "APR"
          : action.request.kind === "payroll_checkin"
            ? "PAY"
            : "TASK"
      const request: CustomerRequest = {
        ...action.request,
        id: nextRequestId(state.requests, prefix, 600),
        status: "sent",
        round: 1,
        sentAt: "Just now",
      }
      const replaced = new Set(action.replaces ?? [])
      return {
        ...state,
        requests: [
          ...state.requests.map((r) =>
            replaced.has(r.id) && r.status === "sent"
              ? closeRequest(r, "cancelled", `These invoices are on your new list (${request.id}) now. No need to answer this one.`)
              : r
          ),
          request,
        ],
      }
    }

    case "customer_approve": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "sent") return state
      return withApproval(state, request, action.lines, answeredBy(request, action.contactId))
    }

    case "customer_checkin": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "sent") return state
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? {
                ...r,
                // "No changes" settles it; changes go to the firm to add.
                ...(checkinHasChanges(action.answer)
                  ? { status: "replied" as const }
                  : { status: "resolved" as const, resolution: "done" as const }),
                checkin: action.answer,
                answeredBy: answeredBy(request, action.contactId),
              }
            : r
        ),
      }
    }

    case "approvals":
      return approvalsApply(state, action.action)

    case "people":
      return peopleApply(state, action.action)

    case "periods":
      return periodsApply(state, action.action)
    case "documents":
      return documentsApply(state, action.action)

    case "set_allocation":
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.id !== action.itemId) return i
          const accrueMonths = action.accrueMonths > 1 ? action.accrueMonths : undefined
          if (i.period === action.period && i.accrueMonths === accrueMonths) return i
          return {
            ...i,
            period: action.period,
            accrueMonths,
            activity: [
              ...i.activity,
              log(
                "accountant",
                accrueMonths
                  ? `Spread over ${accrueMonths} months from ${monthName(action.period)}`
                  : `Booked in ${monthName(action.period)}`,
                accrueMonths
                  ? `Booked to 1700 Prepaid expenses, then ${accrueMonths} monthly vouchers to ${i.suggestion.lines[0].account}.`
                  : undefined
              ),
            ],
          }
        }),
      }

    case "accept_matches": {
      // A card receipt's line ("<item id>:paid") is matched by booking the
      // receipt against the card account; an invoice's payment by the
      // voucher from 2400.
      const receiptOf = (id: string) =>
        id.endsWith(":paid")
          ? state.items.find((i) => i.id === id.slice(0, -":paid".length) && i.kind === "receipt")
          : undefined
      const receipts = action.ids.flatMap((id) => receiptOf(id)?.id ?? [])
      let next = receipts.length ? apply(state, { type: "confirm", ids: receipts }) : state
      for (const id of action.ids) if (!receiptOf(id)) next = withProgress(next, "matches", id, stamp())
      return next
    }

    case "unmatch":
      return withProgress(state, "matches", action.id, { ...stamp(), undone: true })

    case "approve_pay_run": {
      const payroll = getPayroll(state.items, state.progress, action.clientId, action.month)
      if (!payroll.ready.length) return state
      const seq = payroll.nextSeq
      const run: PayRun = {
        ...stamp(),
        clientId: action.clientId,
        month: action.month,
        seq,
        itemIds: payroll.ready.map((i) => i.id),
        gross: payroll.ready.reduce((sum, i) => sum + i.amount, 0),
        payDate: action.payDate ?? payroll.nextPayDate,
      }
      const inRun = new Set(run.itemIds)
      const next = withProgress(state, "payRuns", payRunKey(action.clientId, action.month, seq), run)
      const runName = seq === 1 ? "the pay run" : `follow-up run ${seq}`
      let held = next
      for (const [itemId, hold] of Object.entries(action.holds ?? {})) {
        if (hold !== "follow_up") held = apply(held, { type: "set_pay_hold", itemId, hold })
      }
      return {
        ...held,
        items: held.items.map((i) =>
          inRun.has(i.id)
            ? {
                ...i,
                activity: [
                  ...i.activity,
                  log(
                    "system",
                    `Paid in ${runName}`,
                    `One salary voucher for ${run.itemIds.length} ${run.itemIds.length === 1 ? "employee" : "employees"} in Tripletex, payment file to DNB for ${formatDay(run.payDate)}.`
                  ),
                ],
              }
            : action.holds?.[i.id] === "follow_up"
              ? {
                  ...i,
                  activity: [
                    ...i.activity,
                    log("accountant", `Left out of ${runName}`, "Paid in a follow-up run once it is ready."),
                  ],
                }
              : i
        ),
      }
    }

    case "set_pay_hold": {
      const item = state.items.find((i) => i.id === action.itemId)
      if (!item || item.domain !== "payroll") return state
      const payroll = getPayroll(state.items, state.progress, item.clientId, item.movedFrom ?? item.period, state.closing)
      // Paid, or in a month the accountant closed: nothing moves any more.
      if (payroll.locked || payroll.runs.some((r) => r.itemIds.includes(item.id))) return state
      const patch: Partial<ReviewItem> =
        action.hold === "move"
          ? { period: nextMonth(item.period), movedFrom: item.period, skipped: undefined, snoozedUntil: undefined }
          : action.hold === "skip"
            ? { skipped: true, snoozedUntil: undefined }
            : { period: item.movedFrom ?? item.period, movedFrom: undefined, skipped: undefined }
      const title =
        action.hold === "move"
          ? `Moved to ${monthName(nextMonth(item.period))}'s pay run`
          : action.hold === "skip"
            ? `Not paid for ${monthName(item.period)}`
            : `Back in ${monthName(item.movedFrom ?? item.period)}'s pay run`
      // A line the customer rejected and that now moves or sits out
      // settles their rejection: they're told what happened.
      return settlePayApprovals(
        {
          ...state,
          items: state.items.map((i) =>
            i.id === item.id
              ? { ...i, ...patch, activity: [...i.activity, log("accountant", title)] }
              : i
          ),
        },
        item.clientId
      )
    }

    case "agent_note": {
      const item = state.items.find((i) => i.id === action.itemId)
      const text = action.text.trim()
      if (!item || item.status === "booked" || !text) return state
      const client = CLIENT_BY_ID.get(item.clientId)!
      const update =
        readAnswer(item, client, state.items, {
          text,
          from: "accountant",
          name: client.contacts[0].name.split(" ")[0],
        }) ?? suggestFromNote(item, client, text)
      const request = item.requestId
        ? state.requests.find((r) => r.id === item.requestId)
        : undefined
      const closing = request && request.status !== "resolved"
      return {
        ...state,
        // Nothing left to ask: a draft is dropped, a sent question closes in
        // the customer's app with a line saying it was sorted.
        requests: !closing
          ? state.requests
          : request.status === "draft"
            ? state.requests.filter((r) => r.id !== request.id)
            : state.requests.map((r) =>
                r.id === request.id
                  ? {
                      ...r,
                      status: "resolved",
                      resolution: "done",
                      thread: [
                        ...(r.thread ?? []),
                        message(r, "accountant", {
                          text: "Thanks, we sorted this out on the phone. Nothing more needed from you.",
                        }),
                      ],
                    }
                  : r
              ),
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                ...update,
                amount:
                  i.domain === "payroll"
                    ? update.suggestion.lines.reduce((sum, l) => sum + l.amount, 0)
                    : i.amount,
                issue: undefined,
                status: "needs_review",
                requestId: request?.status === "draft" ? undefined : i.requestId,
                snoozedUntil: undefined,
                activity: [
                  ...i.activity,
                  log("accountant", `${CURRENT_USER.name} added what the customer said`, text),
                  ...(closing && request.status !== "draft"
                    ? [log("system", "Closed the question in the customer app")]
                    : []),
                  log("agent", "Updated the suggestion from your note", update.suggestion.reasoning[1] ?? update.suggestion.reasoning[0]),
                ],
              }
            : i
        ),
      }
    }

    case "correct_earlier": {
      const item = state.items.find((i) => i.id === action.itemId)
      const back = item?.suggestion.lookBack
      if (!item || !back) return state
      const ids = new Set(back.itemIds)
      const when = stamp()
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.id === item.id)
            return {
              ...i,
              suggestion: { ...i.suggestion, lookBack: undefined },
              activity: [
                ...i.activity,
                log("accountant", `${CURRENT_USER.name} corrected ${ids.size} earlier ${ids.size === 1 ? "booking" : "bookings"}`, back.why),
              ],
            }
          if (!ids.has(i.id)) return i
          const vat = Math.round(
            (Math.abs(i.amount) * Number(i.suggestion.lines[0]?.vat?.match(/Input (\d+)%/)?.[1] ?? 0)) /
              (100 + Number(i.suggestion.lines[0]?.vat?.match(/Input (\d+)%/)?.[1] ?? 0))
          )
          return {
            ...i,
            vatFix: { ...when, from: item.id, vat },
            suggestion: {
              ...i.suggestion,
              lines: i.suggestion.lines.map((l) => ({ ...l, vat: "0 · No VAT" })),
            },
            activity: [
              ...i.activity,
              log("accountant", `${CURRENT_USER.name} corrected the VAT`, `${back.why}. Found from ${item.title}, ${item.date}.`),
            ],
          }
        }),
      }
    }

    case "resolve_recon":
      return withProgress(state, "recon", action.issueId, { ...stamp(), how: action.how })

    case "unresolve_recon":
      return withProgress(state, "recon", action.issueId, null)

    case "submit_filing":
      return action.correction
        ? withProgress(state, "corrections", action.filingId, {
            ...stamp(),
            itemIds: action.correction,
          })
        : withProgress(state, "filings", action.filingId, stamp())

    case "resolve_request": {
      // Approvals and check-ins close themselves when every line is
      // decided, or are withdrawn: "done" must never read as approved.
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || isBundle(request)) return state
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.requestId
            ? { ...r, status: "resolved", resolution: "done" }
            : r
        ),
      }
    }

    case "withdraw_request": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "sent") return state
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? closeRequest(r, "cancelled", "We've withdrawn this one: no need to answer it.")
            : r
        ),
        items: withActivity(state.items, request.itemId, log("accountant", "Withdrew the question")),
      }
    }

    case "remind": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request) return state
      const text = action.text?.trim() || remindText(state, request)
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id && r.status === "sent"
            ? { ...r, thread: [...(r.thread ?? []), message(r, "accountant", { text: `Reminder: ${text}` })] }
            : r
        ),
        items: withActivity(
          state.items,
          request.itemId,
          log("system", "Reminder sent to the customer", text)
        ),
      }
    }

    case "update_posting": {
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.id !== action.itemId) return i
          const [first, ...rest] = i.suggestion.lines
          const changed = first.account !== action.account
          const vatChanged = (action.vat ?? first.vat) !== first.vat
          return {
            ...i,
            suggestion: {
              ...i.suggestion,
              lines: [
                {
                  ...first,
                  account: action.account,
                  vat: action.vat ?? first.vat,
                  counterparty: action.counterparty,
                },
                ...rest,
              ],
            },
            activity: [
              ...i.activity,
              log(
                "accountant",
                changed
                  ? `Changed account to ${action.account}`
                  : vatChanged
                    ? `Changed VAT to ${action.vat}`
                    : `Put it on ${action.counterparty ?? "nobody"}`,
                "Only this line. “Always book like this” makes it a rule for the supplier."
              ),
            ],
          }
        }),
      }
    }

    case "open_item":
      return {
        ...state,
        openItemId: action.id,
        openRequestId: null,
        nav: action.nav ?? (action.id ? state.nav : []),
      }

    case "open_request":
      return {
        ...state,
        openRequestId: action.id,
        openItemId: null,
        nav: action.nav ?? (action.id ? state.nav : []),
      }

    case "step": {
      const open = state.openItemId ?? state.openRequestId
      if (!open) return state
      const index = state.nav.indexOf(open)
      const next = index < 0 ? undefined : state.nav[index + action.dir]
      return next ? focus(state, next) : state
    }

    case "dismiss_draft": {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request || request.status !== "draft") return state
      return {
        ...state,
        requests: state.requests.filter((r) => r.id !== request.id),
        items: state.items.map((i) =>
          i.id === request.itemId
            ? {
                ...i,
                requestId: undefined,
                activity: [
                  ...i.activity,
                  log(
                    "accountant",
                    "Dismissed the agent's draft question",
                    `Reason: ${DISMISS_REASONS[action.reason]}. The line stays in review.`
                  ),
                ],
              }
            : i
        ),
      }
    }

    case "restore_draft": {
      if (state.requests.some((r) => r.id === action.request.id)) return state
      return {
        ...state,
        requests: [...state.requests, action.request],
        items: state.items.map((i) =>
          i.id === action.request.itemId
            ? { ...i, requestId: action.request.id }
            : i
        ),
      }
    }

    case "team_handoff": {
      const task = findTask(state, action.id)
      const to = TEAM_BY_ID.get(action.to)
      if (!task || !to) return state
      const note = action.note.trim()
      const handoff: Handoff = {
        mode: action.mode,
        from: CURRENT_USER.id,
        to: to.id,
        note,
        at: "Just now",
        status: action.mode === "handover" ? "answered" : "open",
      }
      return {
        ...withTask(
          state,
          task.id,
          (t) => ({
            handoff,
            assigneeId: action.mode === "handover" ? to.id : t.assigneeId,
            notes: note ? [...(t.notes ?? []), teamNote(t, CURRENT_USER.id, note)] : t.notes,
          }),
          log(
            "accountant",
            action.mode === "ask" ? `Asked ${to.name}` : `Handed over to ${to.name}`,
            note || undefined
          )
        ),
        teamDialog: null,
      }
    }

    case "team_note": {
      const task = findTask(state, action.id)
      const text = action.text.trim()
      if (!task || !text) return state
      const h = task.handoff
      // Writing back on an ask that waits on me answers it.
      const answers =
        h?.mode === "ask" && h.status === "open" && h.to === CURRENT_USER.id
      const asker = h ? TEAM_BY_ID.get(h.from) : undefined
      return withTask(
        state,
        task.id,
        (t) => ({
          notes: [...(t.notes ?? []), teamNote(t, CURRENT_USER.id, text)],
          handoff: answers && h ? { ...h, status: "answered" } : t.handoff,
        }),
        log(
          "accountant",
          answers ? `Answered ${asker?.name ?? "a colleague"}` : "Left a team note",
          text
        )
      )
    }

    case "simulate_team_reply": {
      const task = findTask(state, action.id)
      const h = task?.handoff
      if (!task || !h || h.mode !== "ask" || h.status !== "open") return state
      const colleague = TEAM_BY_ID.get(h.to)
      const text = cannedTeamReply(task)
      return withTask(
        state,
        task.id,
        (t) => ({
          notes: [...(t.notes ?? []), teamNote(t, h.to, text)],
          handoff: { ...h, status: "answered" },
        }),
        log("accountant", `${colleague?.name ?? "A colleague"} answered`, text)
      )
    }

    case "withdraw_handoff": {
      const task = findTask(state, action.id)
      const h = task?.handoff
      if (!task || !h) return state
      const to = TEAM_BY_ID.get(h.to)
      const owner = CLIENT_BY_ID.get(task.clientId)?.accountantId
      return withTask(
        state,
        task.id,
        () => ({
          handoff: undefined,
          assigneeId: owner === CURRENT_USER.id ? undefined : CURRENT_USER.id,
        }),
        log(
          "accountant",
          h.mode === "ask"
            ? `Withdrew the question to ${to?.name ?? "a colleague"}`
            : `Took the task back from ${to?.name ?? "a colleague"}`
        )
      )
    }

    case "snooze":
      return withTask(
        state,
        action.id,
        () => ({ snoozedUntil: action.until ?? undefined }),
        log(
          "accountant",
          action.until ? `Snoozed until ${formatDay(action.until)}` : "Back in the queue"
        )
      )

    case "add_rule": {
      const item = state.items.find((i) => i.id === action.itemId)
      if (!item || item.domain !== "bookkeeping") return state
      const line = item.suggestion.lines[0]
      const rule: AgentRule = {
        id: `rule-${item.clientId}-${item.title}`,
        clientId: item.clientId,
        match: item.title,
        account: line.account,
        vat: line.vat,
        createdBy: CURRENT_USER.id,
        createdAt: TODAY,
      }
      const detail = `${line.account}${line.vat ? `, VAT ${line.vat}` : ""}`
      return {
        ...state,
        rules: [...state.rules.filter((r) => r.id !== rule.id), rule],
        items: state.items.map((i) => {
          if (i.id === item.id)
            return {
              ...i,
              activity: [
                ...i.activity,
                log("accountant", `Taught the agent: always book ${item.title} like this`, detail),
              ],
            }
          // Open lines from the same counterparty follow the rule at once.
          if (!followsRule(i, item)) return i
          const [first, ...rest] = i.suggestion.lines
          return {
            ...i,
            suggestion: {
              ...i.suggestion,
              confidence: Math.max(i.suggestion.confidence, 0.95),
              lines: [{ ...first, account: line.account, vat: line.vat }, ...rest],
            },
            activity: [
              ...i.activity,
              log("agent", "Applied your rule", `${item.title} → ${detail}`),
            ],
          }
        }),
      }
    }

    case "remove_rule":
      return { ...state, rules: state.rules.filter((r) => r.id !== action.ruleId) }

    case "reverse_booking": {
      const item = state.items.find((i) => i.id === action.itemId)
      if (!item || item.status !== "booked") return state
      if (
        item.domain === "payroll" &&
        getPayroll(state.items, state.progress, item.clientId, item.period).paid.includes(item)
      )
        return state
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "needs_review",
                voucherNo: undefined,
                // Booked again, it goes on a new list.
                approvedEarlier: undefined,
                activity: [
                  ...i.activity,
                  log(
                    "accountant",
                    item.domain === "bookkeeping"
                      ? `Reversed voucher ${item.voucherNo}`
                      : "Took the pay line out of the run"
                  ),
                  item.domain === "bookkeeping"
                    ? log(
                        "system",
                        "Reversal voucher created in Tripletex",
                        "tripletex.reverse_voucher"
                      )
                    : log(
                        "system",
                        "Back in review",
                        "Nothing had gone to Tripletex yet: the run isn't approved."
                      ),
                ],
              }
            : i
        ),
      }
    }

    case "open_team_dialog":
      return { ...state, teamDialog: { id: action.id, mode: action.mode } }

    case "close_team_dialog":
      return { ...state, teamDialog: null }

    case "open_ask":
      return { ...state, askItemId: action.id }

    case "open_task_composer":
      return { ...state, taskComposer: { clientId: action.clientId, draft: action.draft } }

    case "close_task_composer":
      return { ...state, taskComposer: null }

    case "set_scope":
      return { ...state, scope: action.scope }

    case "set_month":
      return {
        ...state,
        month: action.month,
        openItemId: null,
        openRequestId: null,
      }

    case "reset":
      return { ...init(), loaded: true }
  }
}

const StoreContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | null>(null)

/** Where the demo keeps its data, so the accountant tab and the customer
    portal tab see the same requests and answers. Bump to reset old data. */
const STORAGE_KEY = "ledger-ai-demo-v19"

type Saved = {
  items: ReviewItem[]
  requests: CustomerRequest[]
  closing?: Closing
  progress?: Progress
  rules?: AgentRule[]
  onboarding?: OnboardingCase[]
  approvals?: ApprovalsState
  people?: PeopleState
  periods?: PeriodsState
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Actions that only move the UI around; they never need saving. */
const UI_ONLY = new Set<Action["type"]>([
  "open_item",
  "open_request",
  "step",
  "open_ask",
  "open_task_composer",
  "close_task_composer",
  "open_team_dialog",
  "close_team_dialog",
  "set_scope",
  "set_month",
  "hydrate",
  "loaded",
])

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, init)
  // Saving happens only after a real change made in this tab. Never on load
  // and never for data that arrived from another tab, so the seed rendered on
  // the server can't overwrite what the other tab already did.
  const dirty = useRef(false)
  // The copy this tab last read or wrote. Re-reading only happens when the
  // stored copy differs, so a focus event can never reload data mid-drag.
  const lastRaw = useRef<string | null>(null)
  // Emails go out only for sends made in this tab, never for data that
  // arrived from another tab.
  const emailNext = useRef(false)
  // The changes made in this tab since it last saved. When another tab saved
  // in between (two tabs open on the demo, the customer's and ours), this
  // tab takes that copy and makes its own changes again on top of it, rather
  // than writing over the other tab's work.
  const unsaved = useRef<Action[]>([])
  const requestsRef = useRef(state.requests)
  const dispatch = useMemo<Dispatch<Action>>(
    () => (action) => {
      if (!UI_ONLY.has(action.type)) {
        dirty.current = true
        unsaved.current.push(action)
      }
      if (
        action.type === "ask" ||
        action.type === "add_task" ||
        action.type === "send_request" ||
        (action.type === "accountant_message" && !action.close)
      )
        emailNext.current = true
      if (action.type === "close_month") emailReport(action.clientId, action.month, action.note)
      if (action.type === "remind") {
        const request = requestsRef.current.find((r) => r.id === action.requestId)
        if (request) emailReminder(request)
      }
      rawDispatch(action)
    },
    []
  )
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  useEffect(() => {
    function adopt(raw: string | null) {
      if (!raw || raw === lastRaw.current) return
      try {
        const next = JSON.parse(raw) as Saved
        lastRaw.current = raw
        rawDispatch({ type: "hydrate", ...next })
        // Anything this tab did that isn't saved yet goes on top.
        for (const action of unsaved.current) rawDispatch(action)
      } catch {
        // A malformed copy is ignored; this tab keeps its own state.
      }
    }

    adopt(readRaw())
    // Batched with the load above, so one render has both.
    rawDispatch({ type: "loaded" })

    // Another tab changed the data: take its copy.
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) adopt(event.newValue)
    }
    // Belt and braces for a missed event: re-check when the tab comes back
    // into view. Unchanged data is a no-op, so this never interrupts a drag.
    function onFocus() {
      adopt(readRaw())
    }
    function onVisibility() {
      if (document.visibilityState === "visible") onFocus()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    // Older builds kept their own copies; drop them so every tab reads one.
    try {
      for (const key of ["ledger-ai-demo-v1", "ledger-ai-demo-v2", "ledger-ai-demo-v3", "ledger-ai-demo-v4", "ledger-ai-demo-v5", "ledger-ai-demo-v6", "ledger-ai-demo-v7", "ledger-ai-demo-v8", "ledger-ai-demo-v9", "ledger-ai-demo-v10", "ledger-ai-demo-v11", "ledger-ai-demo-v12", "ledger-ai-demo-v13", "ledger-ai-demo-v14", "ledger-ai-demo-v15", "ledger-ai-demo-v16", "ledger-ai-demo-v17", "ledger-ai-demo-v18"]) {
        window.localStorage.removeItem(key)
      }
    } catch {
      // Storage unavailable: nothing to clean up.
    }
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!dirty.current) return
    // Another tab saved since this one last read: take its copy and redo
    // this tab's changes on top. The state changes, so this runs again and
    // saves the merged copy.
    const stored = readRaw()
    if (stored && stored !== lastRaw.current) {
      try {
        const other = JSON.parse(stored) as Saved
        lastRaw.current = stored
        rawDispatch({ type: "hydrate", ...other })
        for (const action of unsaved.current) rawDispatch(action)
        return
      } catch {
        // A malformed copy: write ours over it.
      }
    }
    dirty.current = false
    unsaved.current = []
    try {
      const raw = JSON.stringify({
        items: state.items,
        requests: state.requests,
        closing: state.closing,
        progress: state.progress,
        rules: state.rules,
        onboarding: state.onboarding,
        approvals: state.approvals,
        people: state.people,
        periods: state.periods,
      } satisfies Saved)
      lastRaw.current = raw
      window.localStorage.setItem(STORAGE_KEY, raw)
    } catch {
      // Private mode or a full quota: the demo still works in this tab.
    }
  }, [
    state.items,
    state.requests,
    state.closing,
    state.progress,
    state.rules,
    state.onboarding,
    state.approvals,
    state.people,
    state.periods,
  ])

  // What this tab just sent: new requests, ones re-sent as a follow-up, or
  // an answer that hands the ball back to the customer.
  useEffect(() => {
    const before = new Map(requestsRef.current.map((r) => [r.id, r]))
    requestsRef.current = state.requests
    if (!emailNext.current) return
    emailNext.current = false
    const sent = state.requests.flatMap((r) => {
      if (r.status !== "sent") return []
      const prev = before.get(r.id)
      // A new message in the thread is what the customer needs to read.
      const said = r.thread?.at(-1)
      if (said && said.id !== prev?.thread?.at(-1)?.id) return [{ ...r, message: said.text }]
      return !prev || prev.status !== "sent" || prev.round !== r.round ? [r] : []
    })
    emailNewTasks(sent)
  }, [state.requests])

  return <StoreContext value={value}>{children}</StoreContext>
}

export function useAccounting() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useAccounting must be used inside AccountingProvider")
  return ctx
}

// ── Selectors ──

/** The account a bookkeeping line is debited: its cost account, or 1700
    Prepaid expenses while the cost is spread over several months. */
export function debitAccount(item: ReviewItem) {
  return item.accrueMonths ? "1700 Prepaid expenses" : item.suggestion.lines[0].account
}

/** The account a bookkeeping line is credited. An invoice waits on 2400
    until its payment is matched in the reconciliation; a card purchase or a
    bank line already left the bank, the card account or the operating one. */
export function creditAccount(item: ReviewItem) {
  if (item.expense) return EMPLOYEE_PAYABLE
  if (item.kind === "invoice") return "2400 Accounts payable"
  const account = paidFromAccount(CLIENT_BY_ID.get(item.clientId)!, item)
  return `${account.ledger} ${account.name}`
}

export function isMine(client: Client) {
  return client.accountantId === CURRENT_USER.id
}

let scoped: { version: number } & Record<Scope, Client[]> = {
  version: -1,
  mine: [],
  all: [],
}

/** The clients in operation, companies handed over from onboarding
    included. The same array until the list changes, so a memo can depend
    on it. */
export function scopedClients(scope: Scope): Client[] {
  const version = getClientsVersion()
  if (scoped.version !== version)
    scoped = { version, mine: CLIENTS.filter(isMine), all: [...CLIENTS] }
  return scoped[scope]
}

export type ClientStats = {
  toReview: number
  replied: number
  waiting: number
  drafts: number
  /** Questions the customer opened that wait on this firm. */
  questions: number
  booked: number
  total: number
  flagged: number
  payrollOpen: number
  payrollTotal: number
  /** Everything waiting on this firm: reviews, replies and questions. */
  todo: number
  progress: number
  /** Ledger issues on the bank account the accountant still has to fix. */
  bankIssues: number
  health: "needs_review" | "waiting_customer" | "ready_to_close" | "closed"
}

export function getClientStats(
  items: ReviewItem[],
  clientId: string,
  requests: CustomerRequest[] = [],
  month: string = OPEN_MONTH,
  signed: Signoffs = NO_SIGNOFFS
): ClientStats {
  // Pay lines left out of the month are decided: they count as nothing.
  const own = items.filter(
    (i) => i.clientId === clientId && i.period === month && !i.skipped
  )
  const toReview = own.filter((i) => i.status === "needs_review").length
  const replied = own.filter((i) => i.status === "customer_replied").length
  const waiting = own.filter((i) => i.status === "waiting_customer").length
  const booked = own.filter((i) => i.status === "booked").length
  const drafts = requests.filter(
    (r) => r.clientId === clientId && r.status === "draft" && r.period === month
  ).length
  const questions = requests.filter(
    (r) =>
      r.clientId === clientId &&
      r.origin === "customer" &&
      r.status === "replied" &&
      r.period === month
  ).length
  const flagged = own.filter(
    (i) => i.status === "needs_review" && i.issue
  ).length
  const payroll = own.filter((i) => i.domain === "payroll")
  const payrollOpen = payroll.filter((i) => i.status !== "booked").length
  const total = own.length
  const progress = total ? Math.round((booked / total) * 100) : 100
  const closedMonth = isMonthClosed(clientId, month, signed)
  const bankIssues = RECON_ISSUES.filter(
    (i) => i.clientId === clientId && i.period === month && !signed.progress.recon[i.id]
  ).length

  // "Ready to close" is the close track's own verdict, so the grid never
  // promises what the report page won't let you send: bank lines still to
  // match, a pay run to approve, ledgers to reconcile all hold it back.
  const ready =
    !closedMonth && getMonthClose({ ...signed, items }, clientId, month).readyToSend
  const health = closedMonth
    ? "closed"
    : ready
      ? "ready_to_close"
      : waiting > 0 && toReview + replied + bankIssues === 0
        ? "waiting_customer"
        : "needs_review"

  return {
    toReview,
    replied,
    waiting,
    drafts,
    questions,
    booked,
    total,
    flagged,
    payrollOpen,
    payrollTotal: payroll.length,
    todo: toReview + replied + questions,
    progress,
    bankIssues,
    health,
  }
}

export type ConversationTurn = {
  id: string
  from: "accountant" | "customer"
  text: string
  attachment?: string
  time: string
}

/** A request as one conversation, oldest first: the opening message, the
    customer's first reply, then everything said after. */
export function conversation(request: CustomerRequest): ConversationTurn[] {
  return [
    {
      id: `${request.id}-0`,
      from: request.origin === "customer" ? "customer" : "accountant",
      text: request.message,
      attachment: request.attachment,
      time: request.sentAt,
    },
    ...(request.reply
      ? [{ id: `${request.id}-r`, from: "customer" as const, ...request.reply }]
      : []),
    ...(request.thread ?? []),
  ]
}

/** What the customer said last: the line a list shows. */
export function lastCustomerText(request: CustomerRequest) {
  return conversation(request).findLast((t) => t.from === "customer")?.text
}

export function useClient(clientId: string): Client | undefined {
  return CLIENT_BY_ID.get(clientId)
}

export { CLIENTS }
export { getMonthClose }
