"use client"

// Setup and Takeover as one checklist each, a small card per group the way
// the work is split (agreement, routines, VAT, systems, bank, authorities;
// then bank, ledger, VAT, payroll, documents). A settled group folds to one
// line; inside a card, open rows say where they stand and settled ones stay
// quiet. Every row is one task: what the agent found (the team's eyes only),
// and, when only the company can do it, the question that goes out on their
// onboarding link. The phase is approved by a person once every required row
// is settled. Tasks added by hand sit in the same cards, and the assessment
// and offer get a small task list of their own. Simulating the company's
// answers (a demo stand-in for them using their link) and accepting answers
// in bulk happen once per card, not per row.
import { useState, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameHeader,
  FramePanel,
} from "@/components/reui/frame"
import { cn } from "cn"
import {
  ArrowRightIcon,
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  EllipsisIcon,
  EyeOffIcon,
  MessageSquareReplyIcon,
  PaperclipIcon,
  RotateCcwIcon,
  PlusIcon,
  PlugIcon,
  SearchCheckIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  company,
  formatDay,
  hasCustomerLink,
  isSettled,
  neededByLabel,
  PHASE_LABEL,
  phaseTasks,
  readTaskAnswer,
  tripletexConnected,
  takeoverWindowOpen,
  WINDOW_DAYS,
  windowOpens,
  type OnboardingCase,
  type OnboardingTask,
  type Phase,
  type TaskStatus,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"

const PANEL_MOTION =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"

const STATUS: Record<TaskStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  open: { label: "Yours", variant: "warning-light" },
  with_customer: { label: "With customer", variant: "info-light" },
  answered: { label: "Answered · your turn", variant: "warning-light" },
  done: { label: "Done", variant: "success-light" },
  na: { label: "Not applicable", variant: "outline" },
}

function StatusMark({ status }: { status: TaskStatus }) {
  const base = "inline-flex size-5 shrink-0 items-center justify-center rounded-full"
  switch (status) {
    case "done":
      return (
        <span className={cn(base, "bg-success text-white")}>
          <CheckIcon className="size-3" strokeWidth={3} aria-hidden="true" />
        </span>
      )
    case "na":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")}>
          <BanIcon className="size-3" aria-hidden="true" />
        </span>
      )
    case "with_customer":
      return (
        <span className={cn(base, "border-info text-info-text border-[1.5px]")}>
          <SendIcon className="size-2.5" strokeWidth={2.5} aria-hidden="true" />
        </span>
      )
    case "answered":
      return (
        <span className={cn(base, "bg-warning text-white")}>
          <MessageSquareReplyIcon className="size-3" aria-hidden="true" />
        </span>
      )
    default:
      return (
        <span className={cn(base, "text-muted-foreground/60")}>
          <CircleIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
      )
  }
}

function subline(c: OnboardingCase, task: OnboardingTask, first: string) {
  if (task.movedTo) return `Moved to ${first}'s app as ${task.movedTo}`
  if (task.later && !isSettled(task))
    return `${c.handedOver ? "Open since the hand-over" : "After the hand-over"}${task.neededBy ? ` · ${neededByLabel(c, task)}` : ""}`
  if (task.needs === "tripletex" && !tripletexConnected(c) && task.status === "open") return "Waiting for Tripletex access"
  if (task.check && !task.check.ok && !isSettled(task)) return `Checked ${formatDay(task.check.at)}: not yet`
  switch (task.status) {
    case "with_customer":
      return `Sent ${formatDay(task.ask!.sentAt!)} · waiting on ${first}`
    case "answered":
      return `${first} answered ${formatDay(task.answer!.at)}: “${task.answer!.text}”`
    case "done":
      return `Done ${formatDay(task.settled!.at)} · ${task.settled!.by}`
    case "na":
      return `Not applicable · ${task.settled!.by}`
    default:
      if (task.manual)
        return task.ask ? `Question for ${first} not sent yet` : task.finding || `Added by ${task.manual.by}`
      return task.ask ? `Draft question for ${first} ready` : task.finding
  }
}

function Block({
  label,
  icon,
  children,
  className,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </span>
      {children}
    </div>
  )
}

/** One task. Open rows carry a status line and badge; settled ones are a
    single quiet line. Either expands to the finding (with where it comes
    from), the question, what came back and what the agent makes of it, and
    the actions. */
export function TaskRow({
  c,
  task,
  open,
  onOpenChange,
  readOnly,
  removable,
}: {
  c: OnboardingCase
  task: OnboardingTask
  open: boolean
  onOpenChange: (open: boolean) => void
  /** No actions on the task itself: a past phase, or one not started. */
  readOnly: boolean
  /** A task added by hand, on a case that still takes changes. */
  removable: boolean
}) {
  const { dispatch } = useAccounting()
  const contact = company(c).contact
  const first = contact.name.split(" ")[0]
  const [message, setMessage] = useState(task.ask?.message ?? "")
  const canAsk = Boolean(task.ask) && !isSettled(task) && !readOnly
  // Before the offer there is no link to send a question to.
  const linked = hasCustomerLink(c)
  const settled = isSettled(task)
  // Read from Tripletex: nothing to look at until it's connected.
  const blind = task.needs === "tripletex" && !tripletexConnected(c)
  const reading = readTaskAnswer(c, task)
  // Setup and takeover tasks can wait for the hand-over; once it's done,
  // there is nothing left to wait for.
  // Not the ones everything rests on: the law's questions, the Tripletex
  // connection and a change to the signed agreement.
  const kind = task.ask?.kind
  const binding = kind === "kyc" || kind === "token" || kind === "routines"
  const deferrable =
    !readOnly && !settled && task.required && !binding && !c.handedOver && (task.phase === "setup" || task.phase === "takeover")
  const statusBadge = task.later
    ? { label: "After hand-over", variant: "outline" as const }
    : blind && task.status === "open"
      ? { label: "Needs Tripletex", variant: "outline" as const }
      : STATUS[task.status]

  function act(action: Parameters<typeof dispatch>[0]) {
    dispatch(action)
  }
  function settle(status: "done" | "na" | "open") {
    act({ type: "onboarding", action: { type: "settle_task", caseId: c.id, taskId: task.id, status } })
  }
  function send() {
    act({ type: "onboarding", action: { type: "send_task", caseId: c.id, taskId: task.id, message: message.trim() } })
    toast.success(`Sent to ${first}`, {
      description: c.handedOver
        ? "It's a task in their customer app now, with an email to say so."
        : "It's on their onboarding page, with an email to say so.",
    })
  }
  function check() {
    act({ type: "onboarding", action: { type: "check_task", caseId: c.id, taskId: task.id } })
  }
  function later(on: boolean) {
    act({ type: "onboarding", action: { type: "set_later", caseId: c.id, taskId: task.id, on } })
    toast.success(on ? "Left for after the hand-over" : `Back in ${PHASE_LABEL[task.phase].toLowerCase()}`, {
      description: on
        ? `It no longer holds up the approval and moves to the client with the hand-over.${task.neededBy ? ` ${neededByLabel(c, task)}.` : ""}`
        : "It holds up the approval again.",
    })
  }
  function remove() {
    act({ type: "onboarding", action: { type: "remove_task", caseId: c.id, taskId: task.id } })
    toast.success("Task removed", { description: task.title })
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="group/task">
      <CollapsibleTrigger
        type="button"
        className={cn(
          "hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-inset",
          settled ? "py-2" : "py-2.5"
        )}
      >
        <StatusMark status={task.status} />
        {settled ? (
          <>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{task.title}</span>
            <span className="text-muted-foreground shrink-0 text-xs max-sm:hidden">
              {task.status === "done" ? `Done ${formatDay(task.settled!.at)}` : "Not applicable"}
            </span>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground truncate text-sm font-medium">
                {task.title}
                {!task.required ? <span className="text-muted-foreground font-normal"> · optional</span> : null}
              </span>
              <span className="text-muted-foreground truncate text-xs">{subline(c, task, first)}</span>
            </span>
            <Badge variant={statusBadge.variant} size="sm" className="max-sm:hidden">
              {statusBadge.label}
            </Badge>
          </>
        )}
        <ChevronDownIcon
          className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/task:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={PANEL_MOTION}>
        <div className="flex flex-col gap-4 px-3 pt-1 pb-4 ps-11">
          {task.manual ? (
            <Block
              label={`Added by ${task.manual.by} ${formatDay(task.manual.at)} · only the team sees this`}
              icon={<EyeOffIcon className="size-3" aria-hidden="true" />}
            >
              {task.finding ? <p className="text-foreground text-sm text-pretty">{task.finding}</p> : null}
            </Block>
          ) : (
            <Block
              label="What the agent found · only the team sees this"
              icon={<EyeOffIcon className="size-3" aria-hidden="true" />}
            >
              {blind ? (
                <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm text-pretty">
                  <PlugIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  Read from their Tripletex once {first} connects it. Nothing to check it against before that.
                </p>
              ) : (
                <p className="text-foreground text-sm text-pretty">{task.finding}</p>
              )}
              {task.source ? <span className="text-muted-foreground text-xs">Source: {task.source}</span> : null}
            </Block>
          )}

          {task.verify && task.check ? (
            <Block
              label={`Checked ${formatDay(task.check.at)}`}
              icon={<SearchCheckIcon className="size-3" aria-hidden="true" />}
            >
              <p
                className={cn(
                  "rounded-md border px-3 py-2 text-sm text-pretty",
                  task.check.ok
                    ? "bg-success/8 border-success/20 text-foreground"
                    : "bg-warning/8 border-warning/20 text-foreground"
                )}
              >
                {task.check.text}
              </p>
            </Block>
          ) : null}

          {task.later && !settled && task.neededBy ? (
            <Block label="Left for after the hand-over">
              <p className="text-foreground text-sm text-pretty">{neededByLabel(c, task)}.</p>
            </Block>
          ) : null}

          {task.ask ? (
            <Block
              label={
                task.ask.sentAt
                  ? `Asked ${first} ${formatDay(task.ask.sentAt)}`
                  : task.manual
                    ? `Question for ${first}${linked ? "" : " · goes out once their link opens with the offer"}`
                    : `Question for ${first} · drafted by the agent`
              }
            >
              {canAsk && task.status !== "with_customer" ? (
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-16 resize-y text-sm"
                  aria-label={`Message to ${first}`}
                />
              ) : (
                <p className="bg-muted/50 text-foreground rounded-md px-3 py-2 text-sm text-pretty whitespace-pre-line">
                  {task.ask.message}
                </p>
              )}
              {task.ask.kind === "choice" && task.ask.options?.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {task.ask.options.map((option) => (
                    <Badge key={option} variant="outline" size="sm">
                      {option}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </Block>
          ) : null}

          {task.answer ? (
            <Block label={`${first}'s answer · ${formatDay(task.answer.at)}`}>
              <div className="bg-info/8 border-info/15 text-foreground flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm text-pretty">
                {task.answer.text}
                {task.answer.file ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <PaperclipIcon className="size-3" aria-hidden="true" />
                    {task.answer.file}
                  </span>
                ) : null}
              </div>
            </Block>
          ) : null}

          {reading ? (
            <Block label="The agent's read" icon={<SparklesIcon className="size-3" aria-hidden="true" />}>
              <p className={cn("text-sm text-pretty", reading.ok ? "text-foreground" : "text-warning-text")}>
                {reading.text}
              </p>
            </Block>
          ) : null}

          {readOnly && !removable ? null : (
            <div className="flex flex-wrap items-center gap-2">
              {readOnly ? null : (
                <>
                  {task.status === "open" ? (
                    <>
                      {task.ask && linked ? (
                        <>
                          <Button size="sm" onClick={send} disabled={!message.trim()}>
                            <SendIcon data-icon="inline-start" aria-hidden="true" />
                            Send to {first}
                          </Button>
                          {task.verify || binding ? null : (
                            <Button size="sm" variant="outline" onClick={() => settle("done")} disabled={blind}>
                              <CheckIcon data-icon="inline-start" aria-hidden="true" />
                              Sorted it ourselves
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => settle("done")}
                          disabled={blind}
                          title={blind ? "Connect Tripletex first: there's nothing to check it against yet" : undefined}
                        >
                          <CheckIcon data-icon="inline-start" aria-hidden="true" />
                          Mark done
                        </Button>
                      )}
                      {binding ? null : (
                        <Button size="sm" variant="ghost" onClick={() => settle("na")}>
                          Not applicable
                        </Button>
                      )}
                    </>
                  ) : null}
                  {task.verify && !settled ? (
                    <Button size="sm" variant={task.status === "open" ? "outline" : "default"} onClick={check}>
                      <SearchCheckIcon data-icon="inline-start" aria-hidden="true" />
                      Check now
                    </Button>
                  ) : null}
                  {task.status === "with_customer" && !task.verify && !binding ? (
                    <Button size="sm" variant="ghost" onClick={() => settle("done")}>
                      Mark done anyway
                    </Button>
                  ) : null}
                  {task.status === "answered" ? (
                    <>
                      {/* When the agent reads the answer as short of what was
                          asked, asking again comes first. */}
                      <Button size="sm" variant={reading?.ok === false ? "outline" : "default"} onClick={() => settle("done")}>
                        <CheckIcon data-icon="inline-start" aria-hidden="true" />
                        {reading?.ok === false ? "Accept anyway" : "Accept answer"}
                      </Button>
                      {task.ask ? (
                        <Button
                          size="sm"
                          variant={reading?.ok === false ? "default" : "outline"}
                          onClick={send}
                          disabled={!message.trim()}
                        >
                          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                          Ask again
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {settled && !task.movedTo ? (
                    <Button size="sm" variant="outline" onClick={() => settle("open")}>
                      <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                      Reopen
                    </Button>
                  ) : null}
                  {deferrable ? (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => later(!task.later)}>
                      {task.later ? (
                        <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                      ) : (
                        <ArrowRightIcon data-icon="inline-start" aria-hidden="true" />
                      )}
                      {task.later ? `Back into ${PHASE_LABEL[task.phase].toLowerCase()}` : "Finish after hand-over"}
                    </Button>
                  ) : null}
                </>
              )}
              {removable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ms-auto"
                        aria-label={`More for ${task.title}`}
                      />
                    }
                  >
                    <EllipsisIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto">
                    <DropdownMenuItem variant="destructive" onClick={remove}>
                      <Trash2Icon aria-hidden="true" />
                      Remove task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type ListProps = {
  c: OnboardingCase
  readOnly: boolean
  /** Opens the add-task dialog, in a group or the phase's default. Left out
      when the case takes no changes; hand-added tasks can't be removed then
      either. */
  onAdd?: (group?: string) => void
}

/** One group as its own small card: name and count on top, folded to that
    line once every task in it is settled. */
function GroupCard({
  c,
  group,
  tasks,
  readOnly,
  onAdd,
  openId,
  onOpenId,
}: ListProps & {
  group: string
  tasks: OnboardingTask[]
  openId: string | null
  onOpenId: (id: string | null) => void
}) {
  const { dispatch } = useAccounting()
  const settled = tasks.filter(isSettled).length
  const complete = settled === tasks.length
  // Folded when it is already settled on arrival; after that it is the
  // reader's to open and close, so settling a row doesn't snap it shut.
  const [expanded, setExpanded] = useState(!complete)
  const first = company(c).contact.name.split(" ")[0]
  const waiting = readOnly ? [] : tasks.filter((t) => t.status === "with_customer")
  const answers = readOnly ? [] : tasks.filter((t) => t.status === "answered")

  function simulate() {
    for (const task of waiting)
      dispatch({ type: "onboarding", action: { type: "simulate_answer", caseId: c.id, taskId: task.id } })
    toast.info(`Simulated ${first}'s ${waiting.length === 1 ? "answer" : "answers"}`, {
      description: "As if they answered on their onboarding link.",
    })
  }
  function acceptAll() {
    for (const task of answers)
      dispatch({ type: "onboarding", action: { type: "settle_task", caseId: c.id, taskId: task.id, status: "done" } })
    toast.success(`Accepted ${answers.length} ${answers.length === 1 ? "answer" : "answers"}`, { description: group })
  }

  return (
    <Frame dense spacing="sm" className="w-full">
      <Collapsible open={expanded} onOpenChange={setExpanded} className="group/card">
        <FrameHeader className="p-0">
          <CollapsibleTrigger
            type="button"
            className="focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-(--frame-radius) px-(--frame-panel-header-px) py-(--frame-panel-header-py) text-left outline-none focus-visible:ring-3"
          >
            {complete ? (
              <span className="bg-success inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white">
                <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden="true" />
              </span>
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                complete ? "text-muted-foreground font-medium" : "text-foreground font-semibold"
              )}
            >
              {group}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {settled} of {tasks.length}
            </span>
            <ChevronDownIcon
              className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/card:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        </FrameHeader>
        <CollapsibleContent className={PANEL_MOTION}>
          <FramePanel className="p-0">
            <ul className="divide-y">
              {tasks.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    c={c}
                    task={task}
                    open={openId === task.id}
                    onOpenChange={(open) => onOpenId(open ? task.id : null)}
                    readOnly={readOnly}
                    removable={Boolean(task.manual && onAdd)}
                  />
                </li>
              ))}
            </ul>
            {onAdd || waiting.length || answers.length ? (
              <div className="flex flex-wrap items-center gap-1 border-t px-1.5 py-1">
                {onAdd ? (
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onAdd(group)}>
                    <PlusIcon data-icon="inline-start" aria-hidden="true" />
                    Add task
                  </Button>
                ) : null}
                <span className="ms-auto flex flex-wrap items-center gap-1">
                  {answers.length > 1 ? (
                    <Button size="sm" variant="ghost" onClick={acceptAll}>
                      <CheckIcon data-icon="inline-start" aria-hidden="true" />
                      Accept {answers.length} answers
                    </Button>
                  ) : null}
                  {waiting.length ? (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={simulate}>
                      <SparklesIcon data-icon="inline-start" aria-hidden="true" />
                      Simulate {first}&apos;s {waiting.length === 1 ? "answer" : "answers"}
                    </Button>
                  ) : null}
                </span>
              </div>
            ) : null}
          </FramePanel>
        </CollapsibleContent>
      </Collapsible>
    </Frame>
  )
}

function GroupCards({ tasks, ...props }: ListProps & { tasks: OnboardingTask[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const groups = [...new Set(tasks.map((t) => t.group))]
  return groups.map((group) => (
    <GroupCard
      key={group}
      {...props}
      group={group}
      tasks={tasks.filter((t) => t.group === group)}
      openId={openId}
      onOpenId={setOpenId}
    />
  ))
}

function ListHeader({
  title,
  description,
  onAdd,
  children,
}: {
  title: string
  description: ReactNode
  onAdd?: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 flex-col gap-px">
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs text-pretty">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        {children}
        {onAdd ? (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Add task
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ChecklistPanel({
  c,
  phase,
  readOnly,
  onAdd,
}: ListProps & {
  phase: "setup" | "takeover"
}) {
  const { dispatch } = useAccounting()
  const tasks = phaseTasks(c, phase)
  const required = tasks.filter((t) => t.required && !t.later)
  const settled = required.filter(isSettled).length
  const deferred = tasks.filter((t) => t.later && !isSettled(t)).length
  const blind = !tripletexConnected(c) && tasks.some((t) => t.needs === "tripletex" && !isSettled(t))
  const withCustomer = tasks.filter((t) => t.status === "with_customer").length
  const answered = tasks.filter((t) => t.status === "answered").length
  const first = company(c).contact.name.split(" ")[0]
  const waiting = phase === "takeover" && !takeoverWindowOpen(c) && !readOnly

  return (
    <div className="flex flex-col gap-3">
      {waiting ? (
        <Frame spacing="sm" className="w-full">
          <FramePanel className="flex flex-wrap items-center gap-3">
            <ClockIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <p className="text-foreground min-w-0 flex-1 text-sm text-pretty">
              The takeover checks open {formatDay(windowOpens(c)!)}, {WINDOW_DAYS} days before the takeover on{" "}
              {formatDay(c.offer!.takeoverDate)}. Balances checked earlier go stale before we take over.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                dispatch({ type: "onboarding", action: { type: "start_takeover_early", caseId: c.id } })
              }
            >
              Start now anyway
            </Button>
          </FramePanel>
        </Frame>
      ) : null}

      <ListHeader
        title={phase === "setup" ? "Setup checklist" : "Takeover checks"}
        description={
          <>
            {settled} of {required.length} required settled
            {withCustomer ? ` · ${withCustomer} with ${first}` : ""}
            {answered ? ` · ${answered} answered, to review` : ""}
            {deferred ? ` · ${deferred} after hand-over` : ""}
            {blind && phase === "setup" ? " · most checks wait for Tripletex access" : ""}
          </>
        }
        onAdd={onAdd ? () => onAdd() : undefined}
      >
        <Progress
          value={required.length ? (settled / required.length) * 100 : 100}
          className="w-28"
          aria-label={`${settled} of ${required.length} settled`}
        />
      </ListHeader>

      <div className={cn("flex flex-col gap-3", waiting && "opacity-60")} inert={waiting || undefined}>
        <GroupCards c={c} tasks={tasks} readOnly={readOnly} onAdd={onAdd} />
      </div>
    </div>
  )
}

const EMPTY: Record<Phase, string> = {
  assessment: "Nothing extra yet. Add anything to check or ask before deciding.",
  offer: "Nothing extra yet. Add anything to sort out before they sign.",
  setup: "Tasks added now join the setup checklist when it starts.",
  takeover: "Tasks added now join the takeover checks when they start.",
}

/** Hand-added tasks for a phase without a checklist of its own: the
    assessment, the offer, or setup and takeover before they start. */
export function PhaseTasks({ c, phase, readOnly, onAdd }: ListProps & { phase: Phase }) {
  const tasks = phaseTasks(c, phase)
  const required = tasks.filter((t) => t.required)
  if (!tasks.length && !onAdd) return null
  return (
    <div className="flex flex-col gap-3">
      <ListHeader
        title={phase === "setup" || phase === "takeover" ? `Added to ${PHASE_LABEL[phase].toLowerCase()}` : "Tasks"}
        description={
          tasks.length
            ? required.length
              ? `${required.filter(isSettled).length} of ${required.length} required settled`
              : `${tasks.filter(isSettled).length} of ${tasks.length} settled`
            : EMPTY[phase]
        }
        onAdd={onAdd ? () => onAdd() : undefined}
      />
      <GroupCards c={c} tasks={tasks} readOnly={readOnly} onAdd={onAdd} />
    </div>
  )
}
