"use client"

// Closing a month for one customer ends with a report they can read and take
// to their board. The close track says what still stands in the way (the same
// work as the Bookkeeping and Payroll tabs); the preview is exactly what the
// customer will get, with the accountant's note drafted by the agent from the
// numbers. Closing publishes it to the customer's app and emails them, and
// locks the month. Any closed month can be reopened (with a reason); closing
// it again sends an updated report, and the month's history shows it all.
import Link from "next/link"
import { useState, type CSSProperties } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  LockIcon,
  LockOpenIcon,
  RotateCcwIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { MonthHistory } from "@/components/periods/month-history"
import { monthWord, ReopenMonthDialog } from "@/components/periods/reopen-month-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ReportNote, MonthlyReportView } from "@/components/report/monthly-report"
import { ACCOUNTANT_BY_ID, CLIENT_BY_ID, monthLabel } from "@/lib/accounting/data"
import { monthStatus, openReopen, updatedNoteIntro } from "@/lib/accounting/periods"
import { buildReport, draftNote } from "@/lib/accounting/report"
import type { CloseStep } from "@/lib/accounting/month-close"
import { isBundle } from "@/lib/accounting/request-labels"
import { getMonthClose, useAccounting } from "@/lib/accounting/store"

function portalHref(clientId: string, month: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/portal/${clientId}?tab=numbers&month=${month}`
}

// Where each close step's work is done, by its tab's name.
const STEP_TAB: Record<CloseStep["id"], string> = {
  bookkeeping: "Bookkeeping",
  payroll: "Payroll",
  bank: "Reconciliation",
  ledgers: "Reconciliation",
  vat: "Filings",
}

type TrackState = "done" | "todo" | "ready" | "waiting"

type TrackStep = {
  id: string
  label: string
  detail: string
  state: TrackState
  /** 0 to 1: how much of the bar is filled while the step is open. */
  progress?: number
  href?: string
}

// The close as a track, left to right: the work steps, then sending the
// report. Each step links to where its work is done.
function CloseTrack({ steps }: { steps: TrackStep[] }) {
  return (
    <ol
      className="grid grid-cols-2 gap-x-3 gap-y-4 @3xl/main:grid-cols-(--steps)"
      style={{ "--steps": `repeat(${steps.length}, minmax(0, 1fr))` } as CSSProperties}
    >
      {steps.map((step, index) => {
        const body = (
          <>
            <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width,background-color] duration-300 ease-out",
                  step.state === "ready" ? "bg-info" : "bg-success"
                )}
                style={{
                  width: `${
                    step.state === "done" || step.state === "ready"
                      ? 100
                      : Math.round((step.progress ?? 0) * 100)
                  }%`,
                }}
              />
            </span>
            <span className="flex items-center gap-1.5">
              <StepMark state={step.state} index={index} />
              <span
                className={cn(
                  // Six steps with the VAT return: let a label wrap rather
                  // than cut "Submit the VAT return" to "Submit the VA…".
                  "line-clamp-2 text-sm leading-5 text-balance",
                  step.state === "waiting"
                    ? "text-muted-foreground"
                    : "text-foreground font-medium"
                )}
              >
                {step.label}
              </span>
              {step.href ? (
                <ChevronRightIcon
                  className="text-muted-foreground ms-auto size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover/step:opacity-100 group-focus-visible/step:opacity-100"
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span className="text-muted-foreground line-clamp-2 ps-5.5 text-xs text-pretty">
              {step.detail}
            </span>
          </>
        )
        const className = "flex flex-col gap-2 rounded-md"
        return (
          <li key={step.id} className="min-w-0">
            {step.href ? (
              <Link
                href={step.href}
                className={cn(
                  className,
                  "group/step hover:bg-muted/40 focus-visible:ring-ring/50 -m-1.5 p-1.5 outline-none transition-colors duration-150 focus-visible:ring-3"
                )}
              >
                {body}
              </Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StepMark({ state, index }: { state: TrackState; index: number }) {
  if (state === "done") {
    return (
      <span className="bg-success text-success-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-full">
        <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  if (state === "ready") {
    return (
      <span className="border-info text-info-text inline-flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]">
        <SendIcon className="size-2" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] font-semibold tabular-nums",
        state === "todo"
          ? "border-foreground/60 text-foreground"
          : "border-muted-foreground/40 text-muted-foreground"
      )}
    >
      {index + 1}
    </span>
  )
}

export function MonthReport({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const status = monthStatus(clientId, state.month, state)
  if (status === "before") return <BeforeTakeover clientId={clientId} />
  // The draft note is per client, month and state: switching any of them
  // (a reopen too) starts from a fresh draft.
  return <MonthReportFor key={`${clientId}-${state.month}-${status}`} clientId={clientId} />
}

/** A month before we took the client over: nothing to close here. */
function BeforeTakeover({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)!
  const first = monthLabel(client.since!)
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Close {monthWord(state.month)}</FrameTitle>
          <FrameDescription className="text-xs">Before we took {client.name} over</FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className="flex items-start gap-3 px-4 py-4">
        <CalendarClockIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-foreground font-medium">{first} is the first month we close for them.</p>
          <p className="text-muted-foreground text-pretty">
            {monthWord(state.month)} and the months before were closed by their previous accountant.
            The close track for {monthWord(client.since!)} fills in as its invoices, pay and bank
            lines come in, and {client.contacts[0]?.name.split(" ")[0] ?? "the customer"} gets
            their first monthly report when it closes.
          </p>
        </div>
      </FramePanel>
    </Frame>
  )
}

function MonthReportFor({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)!
  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId)!
  const contact = client.contacts[0]
  const firstName = contact.name.split(" ")[0]
  const month = state.month
  const monthLong = monthWord(month)
  const close = getMonthClose(state, clientId, month)
  const report = buildReport(clientId, month)
  const reopened = close.status === "reopened"
  const reopen = openReopen(clientId, month, state)
  // An updated report says what changed before the usual note.
  const draft = () =>
    (reopened ? updatedNoteIntro(clientId, month, state) : "") + draftNote(clientId, month)
  // The agent's draft follows the numbers (and what was added to a reopened
  // month) until the accountant writes their own.
  const [own, setNote] = useState<string | null>(null)
  const note = own ?? draft()
  const edited = own !== null && own !== draft()
  const stepsLeft = close.steps.filter((s) => !s.done).length
  // Tasks for the month still open with either side. They don't hold the
  // close (nothing in them is booked), but closing past them should be a
  // choice, not a surprise.
  const openTasks = state.requests.filter(
    (r) =>
      r.clientId === clientId &&
      r.period === month &&
      (r.status === "sent" || r.status === "replied") &&
      // This month's pay check-in and approval belong to the run paid next
      // month, and close with it.
      !(r.domain === "payroll" && isBundle(r))
  )
  const onUs = openTasks.filter((r) => r.status === "replied").length
  const onThem = openTasks.length - onUs
  const [reopening, setReopening] = useState(false)
  const updated = close.version > 1

  function send() {
    dispatch({ type: "close_month", clientId, month, note: note.trim() })
    toast.success(
      reopened ? `${monthLong} closed again for ${client.name}` : `${monthLong} closed for ${client.name}`,
      {
        description: reopened
          ? `The updated report is in ${firstName}'s app, marked as updated, and they got an email.`
          : `The report is in ${firstName}'s app, and they got an email.`,
      }
    )
  }

  const noteSlot = close.closed ? (
    <ReportNote
      note={close.note}
      author={accountant}
      meta={<span>{updated ? `Updated report, sent ${close.closedAt}` : `Sent ${close.closedAt}`}</span>}
    />
  ) : (
    <ReportNote
      author={accountant}
      meta={
        <span className="inline-flex items-center gap-1">
          <SparklesIcon className="size-3.5" aria-hidden="true" />
          {edited ? "Edited" : "Drafted by the agent"}
        </span>
      }
      editor={
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={`Note to ${contact.name}`}
            className="min-h-24 resize-y text-[15px] leading-6"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              Goes at the top of the report. Written from the numbers below.
            </span>
            {edited ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setNote(null)}
              >
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                Use the agent&apos;s draft
              </Button>
            ) : null}
          </div>
        </div>
      }
    />
  )

  const track: TrackStep[] = [
    ...close.steps.map((step) => ({
      id: step.id,
      label: step.label,
      detail: step.detail,
      state: (step.done ? "done" : "todo") as TrackState,
      progress: step.progress,
      href: close.closed ? undefined : step.href,
    })),
    {
      id: "send",
      label: reopened || (close.closed && updated) ? "Send the updated report" : "Send the report",
      detail: close.closed
        ? `In ${firstName}'s app since ${close.closedAt}`
        : close.readyToSend
          ? reopened
            ? `Replaces the one in ${firstName}'s app, with an email`
            : `To ${firstName}'s app, with an email`
          : "Once the steps before it are done",
      state: close.closed ? "done" : close.readyToSend ? "ready" : "waiting",
    },
  ]

  // One button, always doing the next thing: go to the first open step,
  // send once everything is done, reopen after.
  const next = close.steps.find((s) => !s.done)
  const action = close.closed ? (
    <Button type="button" variant="ghost" size="sm" onClick={() => setReopening(true)}>
      <HistoryIcon data-icon="inline-start" aria-hidden="true" />
      Reopen {monthLong}
    </Button>
  ) : next ? (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={next.href} />}
    >
      {stepsLeft === close.steps.length ? "Start with" : "Next:"} {STEP_TAB[next.id]}
      <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
    </Button>
  ) : (
    <Button type="button" size="sm" disabled={!note.trim()} onClick={send}>
      <SendIcon data-icon="inline-start" aria-hidden="true" />
      {reopened ? `Close ${monthLong} & send updated report` : `Close ${monthLong} & send report`}
    </Button>
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Frame dense spacing="sm" className="w-full">
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-px">
            <div className="flex items-center gap-2">
              <FrameTitle>Close {monthLong}</FrameTitle>
              {close.closed ? (
                <Badge variant="success-light">
                  <LockIcon aria-hidden="true" />
                  {updated ? "Updated report sent" : "Sent"}
                </Badge>
              ) : reopened ? (
                <Badge variant="warning-light">
                  <LockOpenIcon aria-hidden="true" />
                  Reopened
                </Badge>
              ) : close.readyToSend ? (
                <Badge variant="info-light">Ready</Badge>
              ) : (
                <Badge variant="warning-light">Open</Badge>
              )}
            </div>
            <FrameDescription className="text-xs">
              {close.closed
                ? `${updated ? "Closed again" : "Closed"} ${close.closedAt}`
                : `${reopened && reopen ? `Reopened ${reopen.on} · ` : ""}${track.length - stepsLeft - 1} of ${track.length} done · ${
                    stepsLeft
                      ? `${stepsLeft} ${stepsLeft === 1 ? "step" : "steps"} before the report can go`
                      : "Everything is booked"
                  }`}
            </FrameDescription>
          </div>
          {action}
        </FrameHeader>
        <FramePanel className="px-4 pt-4 pb-3.5">
          <CloseTrack steps={track} />
        </FramePanel>
        {close.history.some((e) => e.kind === "reopened") ? (
          <FramePanel className="px-4 py-3">
            <div className="flex flex-col gap-2.5">
              <span className="text-muted-foreground text-xs font-medium">History</span>
              <MonthHistory history={close.history} />
            </div>
          </FramePanel>
        ) : null}
        <FrameFooter>
          <p className="text-muted-foreground text-xs text-pretty">
            {close.closed
              ? `${contact.name} has the ${updated ? "updated report" : "report"} in their app and got an email. ${monthLong} is read-only until you reopen it. Questions about it come back to you under Tasks & requests.`
              : reopened
                ? close.readyToSend
                  ? `Locks ${monthLong} again and sends ${contact.name} the updated report, marked as updated in their app.`
                  : `${firstName} keeps the report they have until the updated one goes out. Book what came in, then sign off the reconciliations again.`
                : close.readyToSend
                  ? `Locks ${monthLong} and sends the report to ${contact.name}.`
                  : "Finish the steps above first. The report fills in as lines are booked."}
            {!close.closed && openTasks.length ? (
              <span className="text-warning-text block pt-1">
                {[
                  onUs ? `${onUs} ${onUs === 1 ? "answer waits" : "answers wait"} on you` : "",
                  onThem ? `${onThem} ${onThem === 1 ? "task is" : "tasks are"} still with ${firstName}` : "",
                ]
                  .filter(Boolean)
                  .join(" and ")
                  .replace(/^./, (c) => c.toUpperCase())}{" "}
                for {monthLong}. They stay open after the close, under Tasks &amp; requests.
              </span>
            ) : null}
          </p>
        </FrameFooter>
      </Frame>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-foreground text-sm font-semibold">
              {close.closed
                ? updated
                  ? "What the customer got: the updated report"
                  : "What the customer got"
                : reopened
                  ? "Preview: the updated report"
                  : "Preview: what the customer gets"}
            </h2>
            <p className="text-muted-foreground text-xs">
              {report.label} · in {firstName}&apos;s app under Your numbers
              {reopened || updated ? ", marked as updated" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={portalHref(clientId, month)} target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
            {close.closed ? "See it as the customer" : "Customer view"}
          </Button>
        </div>
        <MonthlyReportView report={report} noteSlot={noteSlot} />
      </div>
      <ReopenMonthDialog
        clientId={clientId}
        month={month}
        open={reopening}
        onOpenChange={setReopening}
      />
    </div>
  )
}
