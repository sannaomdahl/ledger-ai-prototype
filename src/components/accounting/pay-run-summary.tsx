"use client"

// A Frame header in the same grammar as the grids (title, dotted description,
// primary action), the four steps of the pay run, and the hatched progress
// track from app-shell-3's meter. Employees are approved one by one below;
// nothing reaches Tripletex until a run is approved here, as one salary
// voucher for everyone in it. The run never waits for the slowest answer:
// whoever is ready is paid, and the rest go in a follow-up run, move to next
// month's run or sit this month out. It does wait for the customer: the
// check-in that opens the period, and their approval of the run, unless the
// accountant goes ahead without them and says why.
import { useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { CalendarClockIcon, EllipsisIcon, MessageCircleQuestionIcon, SendIcon, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { CheckinAnswers } from "@/components/people/checkin-summary"
import { LoopTrack, OverrideDialog } from "@/components/people/pay-loop"
import {
  CLIENT_BY_ID,
  dayLabel,
  hasFilings,
  monthName,
  nextMonth,
  PERIODS,
} from "@/lib/accounting/data"
import {
  AGA_RATE,
  getPayroll,
  PAY_HOLD_LABEL,
  type PayHold,
  type Payroll,
} from "@/lib/accounting/payroll"
import { customerRejection, getPayLoop } from "@/lib/accounting/people"
import { lastCustomerText, useAccounting } from "@/lib/accounting/store"
import { isParked } from "@/lib/accounting/team"
import type { ReviewItem } from "@/lib/accounting/types"
import { formatDate, formatNok, initials, ISSUE_META } from "./meta"
import { DotSeparator } from "./primitives"
import { ActionMenu } from "./task-actions"

const HOLDS: PayHold[] = ["follow_up", "move", "skip"]

/** Why an employee isn't in the run, in a few words. */
function holdReason(item: ReviewItem, rejectedBy?: string) {
  if (rejectedBy) return `Rejected by ${rejectedBy.split(" ")[0]}`
  if (item.status === "waiting_customer") return "Waiting on the customer"
  if (isParked(item)) return "Snoozed or with a colleague"
  if (item.status === "customer_replied") return "Customer replied, not approved"
  if (item.issue) return ISSUE_META[item.issue].label
  return "Not approved yet"
}

function runName(seq: number) {
  return seq === 1 ? "Regular run" : `Follow-up run ${seq}`
}

/** Approving a run while some employees are still open: one decision each
    for the ones left out, defaulting to a follow-up run. */
function ApproveDialog({
  clientId,
  month,
  payroll,
  payDate,
  open,
  onOpenChange,
}: {
  clientId: string
  month: string
  payroll: Payroll
  payDate: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch } = useAccounting()
  const [holds, setHolds] = useState<Record<string, PayHold>>({})
  const { ready, open: left, nextSeq } = payroll
  const gross = ready.reduce((sum, i) => sum + i.amount, 0)
  const options = HOLDS.map((h) => ({ value: h, label: PAY_HOLD_LABEL[h](month) }))

  function approve() {
    const chosen = Object.fromEntries(left.map((i) => [i.id, holds[i.id] ?? "follow_up"]))
    dispatch({ type: "approve_pay_run", clientId, month, holds: chosen, payDate })
    const later = Object.values(chosen).filter((h) => h === "follow_up").length
    toast.success(`${runName(nextSeq)} approved for ${ready.length}`, {
      description: `One salary voucher in Tripletex, payment file to DNB for ${formatDate(payDate)}.${later ? ` ${later} wait for a follow-up run.` : ""}`,
    })
    setHolds({})
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Pay {ready.length} of {ready.length + left.length} now
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {runName(nextSeq)} for {monthName(month)} hours: {formatNok(gross)} gross,
            paid {formatDate(payDate)}. The others don&apos;t hold it up. Decide
            what happens to them:
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col">
          {left.map((item, index) => (
            <div key={item.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">{initials(item.title)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-foreground truncate text-sm font-medium">{item.title}</span>
                    <span className="text-muted-foreground truncate text-xs">{holdReason(item, customerRejection(state, item)?.by)}</span>
                  </div>
                </div>
                <Select
                  value={holds[item.id] ?? "follow_up"}
                  onValueChange={(value) =>
                    value && setHolds((h) => ({ ...h, [item.id]: value as PayHold }))
                  }
                  items={options}
                >
                  <SelectTrigger size="sm" aria-label={`What happens to ${item.title}`} className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs text-pretty">
          A follow-up run is its own salary voucher and payment file, approved here
          as soon as they&apos;re ready. Moving someone to {monthName(nextMonth(month))}{" "}
          pays them with next month&apos;s run.
        </p>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={approve}>
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Approve run for {ready.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Runs already approved. Who moved on or sits this month out shows on
    their row in the table below. */
function RunsFooter({ payroll }: { payroll: Payroll }) {
  const { runs, closed } = payroll
  if (!runs.length) return null
  return (
    <FrameFooter className="flex-col items-stretch gap-1.5 text-xs">
      {runs.map((run) => (
        <div key={run.seq} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-foreground font-medium">{runName(run.seq)}</span>
          <DotSeparator className="bg-input" />
          <span className="text-muted-foreground">
            {run.itemIds.length} {run.itemIds.length === 1 ? "line" : "lines"}
          </span>
          <DotSeparator className="bg-input" />
          <span className="text-muted-foreground tabular-nums">{formatNok(run.gross)}</span>
          <DotSeparator className="bg-input" />
          <span className="text-muted-foreground">
            {closed ? `Paid ${formatDate(run.payDate)}` : `Approved, pays ${formatDate(run.payDate)}`}
          </span>
        </div>
      ))}
    </FrameFooter>
  )
}

export function PayRunSummary({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const [confirming, setConfirming] = useState(false)
  const [override, setOverride] = useState<"checkin" | "approval" | null>(null)
  const client = CLIENT_BY_ID.get(clientId)
  const period = PERIODS.payroll.find((p) => p.id === state.month)
  const payroll = getPayroll(state.items, state.progress, clientId, state.month, state.closing)
  const loop = getPayLoop(state, clientId, state.month)
  const { lines, paid, ready, open, skipped, runs, closed, locked, done, nextSeq } = payroll
  const gross = lines.filter((i) => !i.skipped).reduce((sum, i) => sum + i.amount, 0)
  // Employer's NI (zone 1, 14.1%) and a flat 30% withholding estimate.
  const employerTax = gross * AGA_RATE
  const withholding = gross * 0.3
  const decided = paid.length + skipped.length
  const pct = Math.round((decided / Math.max(1, lines.length)) * 100)
  const first = client?.contacts[0]?.name.split(" ")[0] ?? "the customer"
  const blocked = loop.active ? loop.blocked : undefined
  // The customer's own questions about salaries that wait on the firm.
  const questions = state.requests.filter(
    (r) =>
      r.clientId === clientId &&
      r.origin === "customer" &&
      r.domain === "payroll" &&
      r.status === "replied"
  )
  const canApprove = ready.length > 0 && !blocked
  // The overrides only make sense where the customer is what's missing.
  const overrideWhat =
    blocked && ready.length
      ? loop.checkinState === "waiting" || loop.checkinState === "not_sent"
        ? nextSeq === 1
          ? "checkin"
          : null
        : loop.approvalState === "waiting" ||
            loop.approvalState === "rejected" ||
            loop.approvalState === "not_sent" ||
            loop.approvalState === "changed"
          ? "approval"
          : null
      : null

  function approveAll() {
    dispatch({ type: "approve_pay_run", clientId, month: state.month, payDate: loop.payDate })
    toast.success(`${runName(nextSeq)} approved`, {
      description: `One salary voucher for ${ready.length} ${ready.length === 1 ? "employee" : "employees"} in Tripletex. The payment file goes to DNB for ${dayLabel(loop.payDate)}${hasFilings(clientId) ? ", and the A-melding is ready to submit once the month's runs are done" : ""}.`,
    })
  }

  // What stands between the run and the bank, in one line beside the button.
  const next =
    blocked ?? (!ready.length && open.length ? "Approve pay lines in the table below first" : undefined)
  const label = !ready.length
    ? "Approve run"
    : open.length
      ? `Pay ${ready.length} now · ${open.length} later`
      : runs.length
        ? `Approve follow-up run · ${ready.length}`
        : "Approve run · one salary voucher"

  // Late answers moved payday; a weekend moves it to the Friday before.
  const payNote = loop.late
    ? `Pays ${dayLabel(loop.payDate)}, moved from ${dayLabel(loop.late.from)}: ${loop.late.reason}`
    : loop.regularPayDate < loop.contractPayDay
      ? `Pays ${dayLabel(loop.regularPayDate)} (the ${Number(loop.contractPayDay.slice(8))}th is a weekend)`
      : `Pays ${dayLabel(runs[0]?.payDate ?? loop.payDate)}`
  const changes = loop.active && loop.changes && loop.checkin ? loop.checkin : undefined

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-px">
          <div className="flex items-center gap-2">
            <FrameTitle>Pay run · {monthName(state.month)} hours</FrameTitle>
            {closed ? (
              <Badge variant="success-light">{period?.note}</Badge>
            ) : done ? (
              <Badge variant="success-light">
                {runs.length > 1 ? `${runs.length} runs approved` : "Salary voucher created"}
              </Badge>
            ) : open.length ? (
              <Badge variant="warning-light">{open.length} to approve</Badge>
            ) : (
              <Badge variant="info-light">{ready.length} ready to pay</Badge>
            )}
          </div>
          <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            {closed ? (
              <span>
                Paid {client?.payDate.split(" ")[0]} {monthName(nextMonth(state.month))}
              </span>
            ) : (
              <span className={loop.late ? "text-warning-text inline-flex items-center gap-1 font-medium" : undefined}>
                {loop.late ? <CalendarClockIcon className="size-3.5" aria-hidden="true" /> : null}
                {payNote}
              </span>
            )}
            {hasFilings(clientId) && (
              <>
                <DotSeparator className="bg-input" />
                <span>A-melding due 5 {monthName(nextMonth(nextMonth(state.month)))}</span>
              </>
            )}
          </FrameDescription>
        </div>
        {locked || done ? null : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {next ? (
              <span className="text-muted-foreground max-w-64 text-right text-xs text-pretty">
                {next}
              </span>
            ) : null}
            <Button
              type="button"
              disabled={!canApprove}
              onClick={() => (open.length ? setConfirming(true) : approveAll())}
            >
              <SendIcon className="size-4" aria-hidden="true" />
              {label}
            </Button>
            {overrideWhat ? (
              <ActionMenu
                actions={[
                  {
                    id: "override",
                    label:
                      overrideWhat === "checkin"
                        ? `Approve without ${first}'s answer…`
                        : `Approve without ${first}'s approval…`,
                    icon: ShieldAlertIcon,
                    group: "danger",
                    run: () => setOverride(overrideWhat),
                  },
                ]}
                trigger={
                  <Button type="button" variant="outline" size="icon" aria-label="More ways to approve">
                    <EllipsisIcon aria-hidden="true" />
                  </Button>
                }
              />
            ) : null}
          </div>
        )}
      </FrameHeader>
      {loop.active ? (
        <FramePanel>
          <LoopTrack
            clientId={clientId}
            month={state.month}
            payroll={payroll}
            loop={loop}
            onOverride={setOverride}
          />
        </FramePanel>
      ) : null}
      {changes ? (
        <FramePanel className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            What {changes.answeredBy?.name.split(" ")[0] ?? first} told us in the check-in
          </span>
          <CheckinAnswers request={changes} />
        </FramePanel>
      ) : null}
      {questions.length ? (
        // What the customer asked about salaries outside the check-in: it
        // may change the run (a new hire, a raise), so it shows here too.
        <FramePanel className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            {questions.length === 1 ? "A question" : `${questions.length} questions`} from{" "}
            {first} about salaries, waiting for you
          </span>
          <ul className="flex flex-col gap-1">
            {questions.map((q) => (
              <li key={q.id} className="flex min-w-0 items-baseline gap-2 text-sm">
                <MessageCircleQuestionIcon className="text-info-text size-3.5 shrink-0 translate-y-0.5" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => dispatch({ type: "open_request", id: q.id, nav: questions.map((x) => x.id) })}
                  className="text-foreground min-w-0 truncate text-left font-medium underline-offset-4 hover:underline"
                >
                  {q.title}
                </button>
                <span className="text-muted-foreground min-w-0 truncate text-xs">{lastCustomerText(q)}</span>
              </li>
            ))}
          </ul>
        </FramePanel>
      ) : null}
      <FramePanel className="grid gap-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Gross pay</span>
          <span className="text-foreground text-lg font-semibold tabular-nums">
            {formatNok(gross)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Employer&apos;s NI (est.)
          </span>
          <span className="text-foreground text-lg font-semibold tabular-nums">
            {formatNok(employerTax)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Tax withholding (est.)
          </span>
          <span className="text-foreground text-lg font-semibold tabular-nums">
            {formatNok(withholding)}
          </span>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Lines paid</span>
            <span className="text-foreground font-semibold tabular-nums">
              {paid.length}/{lines.length - skipped.length}
            </span>
          </div>
          <div className="bg-muted/55 relative h-1.5 overflow-hidden rounded-sm">
            <div
              className="text-muted-foreground pointer-events-none absolute inset-0 opacity-20"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 4px)",
              }}
            />
            <Progress
              value={pct}
              className="**:data-[slot=progress-indicator]:bg-success absolute inset-0 gap-0 **:data-[slot=progress-indicator]:rounded-none **:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent"
            />
          </div>
        </div>
      </FramePanel>
      <RunsFooter payroll={payroll} />
      {open.length && ready.length ? (
        <ApproveDialog
          clientId={clientId}
          month={state.month}
          payroll={payroll}
          payDate={loop.payDate}
          open={confirming}
          onOpenChange={setConfirming}
        />
      ) : null}
      {override ? (
        <OverrideDialog
          clientId={clientId}
          month={state.month}
          what={override}
          open={Boolean(override)}
          onOpenChange={(next) => !next && setOverride(null)}
        />
      ) : null}
    </Frame>
  )
}
