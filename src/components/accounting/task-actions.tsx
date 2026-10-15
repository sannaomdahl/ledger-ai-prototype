"use client"

// Every action a task offers, worked out in one place from what the task is
// (a bank line, a pay line, a request), what the agent flagged and where it
// sits in the loop. The panel shows the first two as buttons and the rest
// under "…"; a list row shows all of them in its menu.
import { Fragment, useEffect, useRef, type ReactElement } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  ArrowRightIcon,
  BanIcon,
  BellRingIcon,
  CalendarArrowUpIcon,
  CheckIcon,
  HistoryIcon,
  NotebookPenIcon,
  EllipsisIcon,
  GraduationCapIcon,
  MessageSquareReplyIcon,
  MessageSquareXIcon,
  SendIcon,
  SparklesIcon,
  Undo2Icon,
  UserPlusIcon,
  UserRoundCheckIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CLIENT_BY_ID,
  CURRENT_USER,
  monthName,
  nextMonth,
  TEAM_BY_ID,
} from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { lateInvoiceInfo } from "@/lib/accounting/filings"
import { isEditable } from "@/lib/accounting/periods"
import { recommendReopen } from "@/components/periods/late-invoice"
import { getPayroll } from "@/lib/accounting/payroll"
import { OUTCOMES, type Outcome } from "@/lib/accounting/outcomes"
import {
  creditAccount,
  DISMISS_REASONS,
  followsRule,
  useAccounting,
  type DismissReason,
} from "@/lib/accounting/store"
import { customerRejection } from "@/lib/accounting/people"
import { isBundle } from "@/lib/accounting/request-labels"
import { isSnoozed, type Task } from "@/lib/accounting/team"
import type { CustomerRequest, ReviewItem } from "@/lib/accounting/types"
import { formatNok } from "./meta"

type Group = "decide" | "customer" | "team" | "more" | "danger"

export type TaskAction = {
  id: string
  label: string
  icon: LucideIcon
  group: Group
  run?: () => void
  /** A choice to make first (snooze until, why not send): a submenu. */
  options?: { id: string; label: string; run: () => void }[]
  /** Never a button, even when it comes first. */
  menuOnly?: boolean
}

const GROUP_ORDER: Group[] = ["decide", "customer", "team", "more", "danger"]

function addDays(days: number) {
  const date = new Date(`${TODAY}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00`))
}

const SNOOZE_OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "Thursday", days: 3 },
  { label: "Next week", days: 7 },
]

/** Actions that work the same on any task: the team, snoozing. */
function useTeamActions(task: Task, onAnswer?: () => void) {
  const { dispatch } = useAccounting()
  const h = task.handoff
  const me = CURRENT_USER.id
  const actions: TaskAction[] = []
  const colleague = h ? TEAM_BY_ID.get(h.to) : undefined
  const first = (name?: string) => name?.split(" ")[0] ?? "them"

  if (h?.mode === "ask" && h.status === "open" && h.to === me && onAnswer) {
    const asker = TEAM_BY_ID.get(h.from)
    actions.push({
      id: "answer-colleague",
      label: `Answer ${first(asker?.name)}`,
      icon: MessageSquareReplyIcon,
      group: "team",
      run: onAnswer,
    })
  }

  if (h?.mode === "ask" && h.status === "open" && h.from === me) {
    actions.push(
      {
        id: "simulate-colleague",
        label: `Simulate ${first(colleague?.name)}'s answer`,
        icon: SparklesIcon,
        group: "team",
        menuOnly: true,
        run: () => {
          dispatch({ type: "simulate_team_reply", id: task.id })
          toast.info(`${colleague?.name ?? "Your colleague"} answered`, {
            description: "Their note is on the task, under Team.",
          })
        },
      },
      {
        id: "withdraw",
        label: `Withdraw question to ${first(colleague?.name)}`,
        icon: XIcon,
        group: "team",
        menuOnly: true,
        run: () => {
          dispatch({ type: "withdraw_handoff", id: task.id })
          toast.message("Question withdrawn")
        },
      }
    )
  } else {
    actions.push({
      id: "ask-colleague",
      label: "Ask a colleague…",
      icon: UsersIcon,
      group: "team",
      menuOnly: true,
      run: () => dispatch({ type: "open_team_dialog", id: task.id, mode: "ask" }),
    })
  }

  if (h?.mode === "handover" && task.assigneeId && task.assigneeId !== me) {
    actions.push({
      id: "take-back",
      label: `Take back from ${first(colleague?.name)}`,
      icon: UserRoundCheckIcon,
      group: "team",
      menuOnly: true,
      run: () => {
        dispatch({ type: "withdraw_handoff", id: task.id })
        toast.message("The task is yours again")
      },
    })
  } else {
    actions.push({
      id: "hand-over",
      label: "Hand over…",
      icon: UserPlusIcon,
      group: "team",
      menuOnly: true,
      run: () => dispatch({ type: "open_team_dialog", id: task.id, mode: "handover" }),
    })
  }

  actions.push(
    isSnoozed(task)
      ? {
          id: "unsnooze",
          label: "Back to the queue",
          icon: AlarmClockOffIcon,
          group: "more",
          menuOnly: true,
          run: () => dispatch({ type: "snooze", id: task.id, until: null }),
        }
      : {
          id: "snooze",
          label: "Snooze",
          icon: AlarmClockIcon,
          group: "more",
          options: SNOOZE_OPTIONS.map((o) => {
            const until = addDays(o.days)
            return {
              id: `snooze-${o.days}`,
              label: `${o.label} · ${dayLabel(until)}`,
              run: () => {
                dispatch({ type: "snooze", id: task.id, until })
                toast.message(`Snoozed until ${dayLabel(until)}`, {
                  description: "It comes back to your queue that morning.",
                  action: {
                    label: "Undo",
                    onClick: () => dispatch({ type: "snooze", id: task.id, until: null }),
                  },
                })
              },
            }
          }),
        }
  )
  return actions
}

/** A bank line or pay line. `onAnswer` jumps to where a colleague's
    question can be answered; `onAddInfo` opens the panel's note to the
    agent (only the panel has one). */
export function useItemActions(
  item: ReviewItem,
  request: CustomerRequest | undefined,
  onAnswer?: () => void,
  onAddInfo?: () => void
): TaskAction[] {
  const { state, dispatch } = useAccounting()
  const team = useTeamActions(item, onAnswer)
  // A closed month is read-only until it is reopened.
  if (!isEditable(item, state)) return []

  const bookkeeping = item.domain === "bookkeeping"
  const client = CLIENT_BY_ID.get(item.clientId)
  const verb = bookkeeping ? "Book" : "Approve for the run"
  const late = bookkeeping ? lateInvoiceInfo(item, state.items, state) : undefined
  const payroll = bookkeeping
    ? undefined
    : getPayroll(state.items, state.progress, item.clientId, item.period)

  // A pay line that went out in a run is paid: nothing to undo here.
  if (payroll?.paid.includes(item)) return []
  const rejection = bookkeeping ? undefined : customerRejection(state, item)

  // Left out of this month: the only thing to do is take it back.
  if (item.skipped) {
    return [
      {
        id: "unskip",
        label: `Pay for ${monthName(item.period)} after all`,
        icon: HistoryIcon,
        group: "decide",
        run: () => {
          dispatch({ type: "set_pay_hold", itemId: item.id, hold: null })
          toast.message(`${item.title} is back in ${monthName(item.period)}'s pay`)
        },
      },
    ]
  }

  /** Payroll only: pay later, or not this month. */
  const holds: TaskAction[] = payroll
    ? [
        {
          id: "move",
          label: `Move to ${monthName(nextMonth(item.period))}'s run`,
          icon: CalendarArrowUpIcon,
          group: "more",
          menuOnly: true,
          run: () => {
            dispatch({ type: "set_pay_hold", itemId: item.id, hold: "move" })
            toast.message(`${item.title} moved to ${monthName(nextMonth(item.period))}'s run`, {
              description: `${monthName(item.period)}'s run no longer waits for them.`,
              action: {
                label: "Undo",
                onClick: () => dispatch({ type: "set_pay_hold", itemId: item.id, hold: null }),
              },
            })
          },
        },
        {
          id: "skip",
          label: "Don't pay this month",
          icon: BanIcon,
          group: "more",
          menuOnly: true,
          run: () => {
            dispatch({ type: "set_pay_hold", itemId: item.id, hold: "skip" })
            toast.message(`${item.title} left out of ${monthName(item.period)}'s pay`, {
              action: {
                label: "Undo",
                onClick: () => dispatch({ type: "set_pay_hold", itemId: item.id, hold: null }),
              },
            })
          },
        },
      ]
    : []

  /** What the accountant heard on the phone, told to the agent. */
  const addInfo: TaskAction[] = onAddInfo
    ? [
        {
          id: "add-info",
          label: "Add info myself",
          icon: NotebookPenIcon,
          group: "customer",
          run: onAddInfo,
        },
      ]
    : []

  if (item.status === "booked") {
    return [
      {
        id: "reverse",
        label: bookkeeping ? "Reverse booking" : "Undo approval",
        icon: Undo2Icon,
        group: "danger",
        menuOnly: true,
        run: () => {
          dispatch({ type: "reverse_booking", itemId: item.id })
          toast.message(bookkeeping ? "Booking reversed" : "Approval undone", {
            description: "The line is back in review.",
          })
        },
      },
      ...holds,
    ]
  }

  const settle = (outcome?: Outcome, label = verb): TaskAction => ({
    id: outcome ?? "confirm",
    label: outcome ? OUTCOMES[outcome].label : label,
    icon: CheckIcon,
    group: "decide",
    run: () => {
      dispatch({ type: "confirm", ids: [item.id], outcome })
      toast.success(
        outcome
          ? OUTCOMES[outcome].done
          : bookkeeping
            ? "Booked in Tripletex"
            : "Approved for the pay run",
        {
          description: bookkeeping
            ? `${item.title} → ${outcome === "to_shareholder" ? "1570 Receivable, shareholder" : item.suggestion.lines[0].account} / ${creditAccount(item).split(" ")[0]}`
            : `${item.title} · ${formatNok(item.amount)}. Goes into one salary voucher when the run is approved.`,
        }
      )
    },
  })

  const ask = (label = "Ask customer"): TaskAction => ({
    id: "ask",
    label,
    icon: SendIcon,
    group: "customer",
    run: () => dispatch({ type: "open_ask", id: item.id }),
  })

  /** A late invoice: book it now and report it with the next return, or
      reopen its month (a real reopen: the month opens until it is closed
      again with an updated report). Either one books it. The firm's habit
      for its size comes first. */
  const lateChoices = (): TaskAction[] => {
    if (!late) return []
    const now = monthName(item.period)
    const then = monthName(late.month)
    const here: TaskAction = {
      id: "late-current",
      label: `Book in ${now}`,
      icon: CheckIcon,
      group: "decide",
      run: () => {
        dispatch({ type: "confirm", ids: [item.id] })
        toast.success(`Booked in ${now}`, {
          description: `Input VAT goes in ${late.next.short}. ${late.filing.short} stays as it is.`,
        })
      },
    }
    const back: TaskAction = {
      id: "late-reopen",
      label: late.reopened
        ? `Book in ${then}${late.filed ? `, correct ${late.filing.short}` : ""}`
        : `Reopen ${then}${late.filed ? `, correct ${late.filing.short}` : ""}`,
      icon: HistoryIcon,
      group: "decide",
      run: () => {
        dispatch({ type: "confirm", ids: [item.id], backdate: true })
        toast.success(late.reopened ? `Booked in ${then}` : `${then} reopened, booked there`, {
          description: [
            late.filed
              ? `${late.filing.short} is marked for a corrected return under Filings.`
              : `It goes into the ${late.filing.short} return before you file it.`,
            late.reopened ? "" : `Close ${then} again from Monthly report to send the updated report.`,
          ]
            .filter(Boolean)
            .join(" "),
        })
      },
    }
    return recommendReopen(item.amount) ? [back, here] : [here, back]
  }

  /** What settles the line when it's in review, main choice first. */
  function decisions(): TaskAction[] {
    if (late) {
      return [...lateChoices(), ask()]
    }
    if (bookkeeping) {
      switch (item.issue) {
        case "missing_receipt":
          return [ask("Ask for receipt"), settle("without_receipt")]
        case "unclear_purpose":
          return [ask(), settle(undefined, "Book as suggested")]
        case "private_expense":
          return [ask(), settle("to_shareholder")]
        default:
          return [settle(), ask()]
      }
    }
    switch (item.issue) {
      case "overtime_unapproved":
        return [settle("approve_overtime"), settle("without_overtime"), ask()]
      case "missing_tax_card":
        return [settle("withholding_50"), ask("Ask for tax card")]
      case "sick_leave":
        return [ask("Ask for sick note"), settle("register_sick_leave")]
      case "unregistered_bonus":
        return [settle("with_bonus"), settle("without_bonus"), ask()]
      default:
        return [settle(), ask()]
    }
  }

  const rule: TaskAction[] = bookkeeping
    ? [
        {
          id: "rule",
          label: "Always book like this",
          icon: GraduationCapIcon,
          group: "more",
          menuOnly: true,
          run: () => {
            const others = state.items.filter((i) => followsRule(i, item)).length
            dispatch({ type: "add_rule", itemId: item.id })
            toast.success("The agent will book it like this from now on", {
              description: `${item.title} → ${item.suggestion.lines[0].account}${others ? `. Also applied to ${others} open ${others === 1 ? "line" : "lines"}.` : "."}`,
            })
          },
        },
      ]
    : []

  let lead: TaskAction[]
  if (item.status === "needs_review" && request?.status === "draft") {
    const [firstDecision, ...otherDecisions] = decisions().filter(
      (a) => a.group === "decide"
    )
    lead = [
      {
        id: "send-draft",
        label: "Review & send question",
        icon: SendIcon,
        group: "customer",
        run: () => dispatch({ type: "open_ask", id: item.id }),
      },
      // "Book anyway" reads right; "Book without receipt" already says it.
      firstDecision.id === "confirm"
        ? { ...firstDecision, label: `${verb} anyway` }
        : firstDecision,
      {
        id: "dismiss-draft",
        label: "Don't send",
        icon: MessageSquareXIcon,
        group: "customer",
        options: (Object.keys(DISMISS_REASONS) as DismissReason[]).map((reason) => ({
          id: reason,
          label: DISMISS_REASONS[reason],
          run: () => {
            dispatch({ type: "dismiss_draft", requestId: request.id, reason })
            toast.message("Draft dismissed", {
              description: "Nothing was sent. The line stays in your review queue.",
              action: {
                label: "Undo",
                onClick: () => dispatch({ type: "restore_draft", request }),
              },
            })
          },
        })),
      },
      ...otherDecisions.map((a) => ({ ...a, menuOnly: true })),
    ]
  } else if (item.status === "customer_replied") {
    // The agent re-read the reply and updated its suggestion: take it.
    lead = late ? [...lateChoices(), ask("Ask again")] : [settle(), ask("Ask again")]
  } else if (item.status === "waiting_customer" && request) {
    const who = client?.contacts.find((c) => c.id === request.recipientId) ?? client?.contacts[0]
    lead = [
      {
        id: "remind",
        label: "Remind",
        icon: BellRingIcon,
        group: "customer",
        run: () => {
          dispatch({ type: "remind", requestId: request.id })
          toast.message("Reminder sent", {
            description: `${request.title} was nudged by e-mail and in the customer app.`,
          })
        },
      },
      // They called instead of answering in the app.
      ...addInfo,
      {
        id: "simulate-reply",
        label: "Simulate customer reply",
        icon: SparklesIcon,
        group: "customer",
        menuOnly: true,
        run: () => {
          dispatch({ type: "simulate_reply", requestId: request.id })
          toast.info(`${who?.name ?? "Customer"} replied`, {
            description: "The agent re-read the reply and updated its suggestion.",
          })
        },
      },
      {
        ...settle(undefined, `${verb} without waiting`),
        menuOnly: true,
      },
    ]
  } else if (rejection && !rejection.corrected && item.status === "needs_review" && addInfo.length) {
    // The customer said no to this pay: correct it from what they said,
    // or approve it unchanged and explain when it goes out to them again.
    lead = [
      { ...addInfo[0], label: "Correct the pay", group: "decide" },
      { ...settle(undefined, "Approve unchanged"), menuOnly: true },
      ask(),
    ]
  } else {
    lead = decisions()
  }

  const info = lead.some((a) => a.id === "add-info")
    ? []
    : addInfo.map((a) => ({ ...a, menuOnly: true }))

  // A colleague's question comes before my own decisions.
  const answer = team.filter((a) => a.id === "answer-colleague")
  const rest = team.filter((a) => a.id !== "answer-colleague")
  return [...answer, ...lead, ...info, ...rest, ...holds, ...rule]
}

/** A request with nothing behind it: a manual task or a customer's
    question. */
export function useRequestActions(
  request: CustomerRequest,
  onAnswer?: () => void
): TaskAction[] {
  const { dispatch } = useAccounting()
  const router = useRouter()
  const team = useTeamActions(request, onAnswer)
  const client = CLIENT_BY_ID.get(request.clientId)
  if (request.status === "resolved" || request.status === "draft") return []

  // An approval or a check-in isn't closed by hand: it closes when every
  // line is decided (or the answers are added to the run). Until then it
  // can be withdrawn, or worked where it belongs.
  if (isBundle(request)) {
    const payroll = request.domain === "payroll"
    const first = client?.contacts.find((c) => c.id === request.recipientId)?.name.split(" ")[0] ?? "the customer"
    const goTo: TaskAction = {
      id: "open-loop",
      label: payroll ? "Open the pay run" : "Open Bookkeeping",
      icon: ArrowRightIcon,
      group: "decide",
      run: () => {
        dispatch({ type: "set_month", month: request.period })
        router.push(`/clients/${request.clientId}/${payroll ? "payroll" : "bookkeeping"}`)
      },
    }
    const sent: TaskAction[] =
      request.status === "sent"
        ? [
            {
              id: "remind",
              label: "Remind",
              icon: BellRingIcon,
              group: "customer",
              run: () => {
                dispatch({ type: "remind", requestId: request.id })
                toast.message("Reminder sent")
              },
            },
            {
              id: "simulate-reply",
              label: "Simulate customer reply",
              icon: SparklesIcon,
              group: "customer",
              menuOnly: true,
              run: () => {
                dispatch({ type: "simulate_reply", requestId: request.id })
                toast.info(`${client?.contacts[0].name ?? "Customer"} replied`)
              },
            },
            {
              id: "withdraw",
              label: `Withdraw it from ${first}'s app`,
              icon: Undo2Icon,
              group: "danger",
              menuOnly: true,
              run: () => {
                dispatch({ type: "withdraw_request", requestId: request.id })
                toast.message("Withdrawn", { description: `${first} no longer sees it. Send it again when it's ready.` })
              },
            },
          ]
        : []
    return [goTo, ...sent, ...team.filter((a) => a.id !== "answer-colleague"), ...team.filter((a) => a.id === "answer-colleague")]
  }

  const done: TaskAction = {
    id: "done",
    label: "Mark as done",
    icon: CheckIcon,
    group: "decide",
    run: () => {
      dispatch({ type: "resolve_request", requestId: request.id })
      toast.success("Task done", { description: request.title })
    },
  }

  const lead: TaskAction[] =
    request.status === "sent"
      ? [
          {
            id: "remind",
            label: "Remind",
            icon: BellRingIcon,
            group: "customer",
            run: () => {
              dispatch({ type: "remind", requestId: request.id })
              toast.message("Reminder sent")
            },
          },
          {
            id: "simulate-reply",
            label: "Simulate customer reply",
            icon: SparklesIcon,
            group: "customer",
            menuOnly: true,
            run: () => {
              dispatch({ type: "simulate_reply", requestId: request.id })
              toast.info(`${client?.contacts[0].name ?? "Customer"} replied`)
            },
          },
          { ...done, label: "Close without an answer", menuOnly: true },
        ]
      : [done]

  const answer = team.filter((a) => a.id === "answer-colleague")
  const rest = team.filter((a) => a.id !== "answer-colleague")
  return [...answer, ...lead, ...rest]
}

function MenuItems({ actions }: { actions: TaskAction[] }) {
  const groups = GROUP_ORDER.map((g) => actions.filter((a) => a.group === g)).filter(
    (g) => g.length > 0
  )
  return groups.map((group, index) => (
    <Fragment key={group[0].group}>
      {index > 0 ? <DropdownMenuSeparator /> : null}
      <DropdownMenuGroup>
        {group.map((action) =>
          action.options ? (
            <DropdownMenuSub key={action.id}>
              <DropdownMenuSubTrigger>
                <action.icon aria-hidden="true" />
                {action.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {action.options.map((option) => (
                  <DropdownMenuItem key={option.id} onClick={option.run}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem
              key={action.id}
              onClick={action.run}
              variant={action.group === "danger" ? "destructive" : "default"}
            >
              <action.icon aria-hidden="true" />
              {action.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuGroup>
    </Fragment>
  ))
}

/** All of a task's actions in one menu, for a list row. */
export function ActionMenu({
  actions,
  trigger,
}: {
  actions: TaskAction[]
  trigger: ReactElement
}) {
  if (actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-60">
        <MenuItems actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The main action, at most one more beside it, the rest under "…". */
function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role=listbox],[role=menu],[role=dialog]"))
  )
}

/** The panel's actions. With `keys`, Y takes the first one and A asks the
    customer, so a list goes by as fast as reading it: yes, ask, next (J). */
export function ActionBar({ actions, keys = false }: { actions: TaskAction[]; keys?: boolean }) {
  const buttons = actions.filter((a) => !a.menuOnly && !a.options && a.run).slice(0, 2)
  const menu = actions.filter((a) => !buttons.includes(a))
  const ask = actions.find((a) => a.id === "ask" && a.run)
  const latest = useRef({ first: buttons[0], ask })
  useEffect(() => {
    latest.current = { first: buttons[0], ask }
  })
  useEffect(() => {
    if (!keys) return
    function onKeyDown(event: KeyboardEvent) {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.key === "y" ? latest.current.first : event.key === "a" ? latest.current.ask : undefined
      if (!target?.run) return
      event.preventDefault()
      target.run()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [keys])
  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons.map((action, index) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant={index === 0 ? "default" : "outline"}
          onClick={action.run}
        >
          <action.icon data-icon="inline-start" aria-hidden="true" />
          {action.label}
          {keys && (index === 0 || action === ask) ? (
            <Kbd className={cn("ms-1 hidden sm:inline-flex", index === 0 && "bg-primary-foreground/15 text-primary-foreground")}>
              {index === 0 ? "Y" : "A"}
            </Kbd>
          ) : null}
        </Button>
      ))}
      {menu.length > 0 ? (
        <ActionMenu
          actions={menu}
          trigger={
            <Button type="button" size="sm" variant="outline">
              <EllipsisIcon data-icon="inline-start" aria-hidden="true" />
              More
            </Button>
          }
        />
      ) : null}
    </div>
  )
}
