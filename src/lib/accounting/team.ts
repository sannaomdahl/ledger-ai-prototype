// Working a task together inside the firm: asking a colleague for input,
// handing a task over, and the notes the team leaves on it. None of this
// reaches the customer app.
import { CLIENT_BY_ID, CURRENT_USER, TEAM_BY_ID } from "./data"
import { TODAY } from "./deadlines"
import type { CustomerRequest, Handoff, Person, ReviewItem } from "./types"

export type Task = ReviewItem | CustomerRequest

export function isItem(task: Task): task is ReviewItem {
  return "suggestion" in task
}

/** Who works the task now: whoever it was handed to, else the client's
    accountant. */
export function ownerOf(task: Task): Person | undefined {
  const id = task.assigneeId ?? CLIENT_BY_ID.get(task.clientId)?.accountantId
  return id ? TEAM_BY_ID.get(id) : undefined
}

/** The colleague an open ask is waiting on. */
export function waitingOn(task: Task): Person | undefined {
  const h = task.handoff
  return h?.mode === "ask" && h.status === "open" ? TEAM_BY_ID.get(h.to) : undefined
}

export function isSnoozed(task: Task) {
  return Boolean(task.snoozedUntil && task.snoozedUntil > TODAY)
}

export function isDone(task: Task) {
  return isItem(task) ? task.status === "booked" : task.status === "resolved"
}

/** Out of my hands for now: a colleague has the ball, or I parked it. */
export function isParked(task: Task) {
  const h = task.handoff
  const askedByMe =
    h?.mode === "ask" && h.status === "open" && h.from === CURRENT_USER.id
  return askedByMe || isSnoozed(task)
}

export type InboxReason = "asked_you" | "handed_you" | "answered"

export type InboxEntry = { task: Task; handoff: Handoff; reason: InboxReason }

/** What the team needs from me, or gave back to me: asks waiting on me,
    tasks handed to me, and my asks that got an answer. Done tasks leave. */
export function teamInbox(tasks: Task[], me = CURRENT_USER.id): InboxEntry[] {
  return tasks.flatMap<InboxEntry>((task) => {
    const h = task.handoff
    if (!h || isDone(task)) return []
    if (h.mode === "ask" && h.status === "open" && h.to === me)
      return [{ task, handoff: h, reason: "asked_you" }]
    if (h.mode === "handover" && h.to === me && task.assigneeId === me)
      return [{ task, handoff: h, reason: "handed_you" }]
    if (h.mode === "ask" && h.status === "answered" && h.from === me)
      return [{ task, handoff: h, reason: "answered" }]
    return []
  })
}

/** A colleague's answer for the demo, in the voice of what they'd know. */
export function cannedTeamReply(task: Task): string {
  if (isItem(task)) {
    switch (task.issue) {
      case "missing_tax_card":
        return "Yes, run 50% withholding for November. Skatteetaten usually issues the card within a week, and the next run corrects it."
      case "overtime_unapproved":
        return "Their contract pays 50% on weekday evenings. I'd approve it: the shift lead does this every month and Kari always signs off later."
      case "sick_leave":
        return "Four days is within self-certification, so an egenmelding is enough. Pay it, but get the form before we file the A-melding."
      case "unregistered_bonus":
        return "Kari confirmed the bonus on the phone last week. Add it to this run."
      case "private_expense":
        return "That's a relative of the owner who helped at the counter in September. It's casual labour, not private. Should go on payroll."
      default:
        return "Looks right to me. Book it as the agent suggests."
    }
  }
  return "I'll call them this afternoon and let you know here."
}
