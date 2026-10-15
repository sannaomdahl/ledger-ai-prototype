"use client"

// The four steps every pay run goes through, as a track on the pay run
// summary: ask what changed, approve the lines, have the customer approve
// the run, approve it. Each step says where it stands and offers the one
// thing to do next. Same bar grammar as the onboarding phase track.
import { RemindButton } from "@/components/accounting/remind-button"
import { StepLine, TrackStep, type StepState } from "@/components/accounting/track-step"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import {
  BanIcon,
  BellRingIcon,
  ClipboardListIcon,
  EllipsisIcon,
  ListChecksIcon,
  SendIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TimerIcon,
  Undo2Icon,
  UserCheckIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AnomalyCount } from "@/components/accounting/anomaly"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { anomaliesOf, openAnomalies } from "@/lib/accounting/anomalies"
import { checkinRequest, CLIENT_BY_ID, dayLabel, monthName } from "@/lib/accounting/data"
import type { Payroll } from "@/lib/accounting/payroll"
import {
  employeesOf,
  lineApproval,
  payApprovalRequest,
  type PayLoop,
} from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"
import type { Answered } from "@/lib/accounting/types"
import { ActionMenu, type TaskAction } from "@/components/accounting/task-actions"

/** "Sat 26 Sep 09:14". */
type CustomerRequestDraft = NonNullable<ReturnType<typeof payApprovalRequest>>

export function answeredAt(a: Pick<Answered, "at">) {
  return `${dayLabel(a.at)}${a.at.length > 10 ? ` ${a.at.slice(11, 16)}` : ""}`
}

/** A loop step with one line of detail and its actions. */
function Step({
  state,
  icon,
  title,
  detail,
  children,
}: {
  state: StepState
  icon: ReactNode
  title: string
  detail: ReactNode
  children?: ReactNode
}) {
  return (
    <TrackStep state={state} icon={icon} title={title}>
      <StepLine actions={children}>{detail}</StepLine>
    </TrackStep>
  )
}

/** Going ahead without the customer: possible, but on record. */
export function OverrideDialog({
  clientId,
  month,
  what,
  open,
  onOpenChange,
}: {
  clientId: string
  month: string
  what: "checkin" | "approval"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch } = useAccounting()
  const [reason, setReason] = useState("")
  const client = CLIENT_BY_ID.get(clientId)
  const first = client?.contacts[0]?.name.split(" ")[0] ?? "the customer"

  function submit() {
    dispatch({ type: "people", action: { type: "override", clientId, month, what, reason } })
    toast.message(
      what === "checkin" ? "Going ahead without the check-in" : "Customer approval skipped",
      { description: "The reason is in every pay line's trail." }
    )
    setReason("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason.trim()) submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {what === "checkin"
                ? `Approve without ${first}'s answer?`
                : `Approve without ${first}'s approval?`}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {what === "checkin"
                ? `Possible, but nobody has told us who started, left or was away in ${monthName(month)}. If something changed, it's fixed in next month's run.`
                : `Possible, but ${first} hasn't seen the run. The auditor will ask who approved it.`}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="override-reason">Why</FieldLabel>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                what === "checkin"
                  ? `${first} confirmed on the phone that nothing changed`
                  : `${first} approved by phone, on holiday until Monday`
              }
              className="min-h-16 resize-none"
            />
            <FieldDescription>Logged on every line in the run, with your name.</FieldDescription>
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={!reason.trim()}>
              <ShieldAlertIcon data-icon="inline-start" aria-hidden="true" />
              Go ahead without it
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The check-in, the lines, the customer's approval and the run, side by side. */
/** Says so once the last rejected pay line is fixed, with the send right
    there, instead of leaving the accountant to notice the step changed. */
function FixedPrompt({ fixed, first, count, onSend }: { fixed: boolean; first: string; count: number; onSend: () => void }) {
  const was = useRef(fixed)
  useEffect(() => {
    if (fixed && !was.current)
      toast.success(`All of ${first}'s rejections are fixed`, {
        description: `Send the corrected ${count === 1 ? "line" : "lines"} for ${first} to approve.`,
        action: { label: `Send to ${first}`, onClick: onSend },
        duration: 10000,
      })
    was.current = fixed
    // onSend reads the latest state when clicked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixed])
  return null
}

export function LoopTrack({
  clientId,
  month,
  payroll,
  loop,
  onOverride,
}: {
  clientId: string
  month: string
  payroll: Payroll
  loop: PayLoop
  onOverride: (what: "checkin" | "approval") => void
}) {
  const { state, dispatch } = useAccounting()
  // The approval the customer is about to get, shown before it goes out:
  // the accountant reads (and can edit) the message first.
  const [preview, setPreview] = useState<CustomerRequestDraft | null>(null)
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return null
  const contact =
    client.contacts.find((c) => c.id === loop.checkin?.recipientId) ?? client.contacts[0]
  const first = contact.name.split(" ")[0]
  const regular = payroll.runs.length === 0
  const { checkin, approval } = loop

  // ── 1. Check-in ──
  function sendCheckin() {
    dispatch({ type: "send_request", request: checkinRequest(client!, month) })
    toast.success(`Check-in sent to ${first}`, {
      description: `Reply by ${dayLabel(loop.cutoff)} so salaries go out on ${dayLabel(loop.regularPayDate)}.`,
    })
  }

  const checkinMenu: TaskAction[] = checkin && loop.checkinState === "waiting"
    ? [
        {
          id: "simulate-none",
          label: "Simulate “No changes”",
          icon: SparklesIcon,
          group: "customer",
          run: () => {
            dispatch({ type: "simulate_reply", requestId: checkin.id })
            toast.info(`${first} answered: no changes`)
          },
        },
        {
          id: "simulate-changes",
          label: "Simulate an answer with changes",
          icon: SparklesIcon,
          group: "customer",
          run: () => {
            const someone = employeesOf(state, clientId).find((e) => !e.end)
            dispatch({
              type: "customer_checkin",
              requestId: checkin.id,
              answer: {
                noChanges: false,
                hires: "Sofie Berg, barista from 1 Dec, 215 kr/h",
                absence: someone ? `${someone.name.split(" ")[0]} had a week's holiday 12–16 Oct` : undefined,
              },
            })
            toast.info(`${first} answered with changes`)
          },
        },
        {
          id: "simulate-late",
          label: "Simulate a late answer",
          icon: TimerIcon,
          group: "customer",
          run: () => {
            dispatch({ type: "people", action: { type: "simulate_late_checkin", requestId: checkin.id } })
            toast.info(`${first} answered after the cut-off`, { description: "Payday moves." })
          },
        },
        {
          id: "override-checkin",
          label: "Approve without their answer…",
          icon: ShieldAlertIcon,
          group: "danger",
          run: () => onOverride("checkin"),
        },
      ]
    : []

  const checkinStep = (() => {
    if (!regular)
      return { state: "done" as const, detail: loop.checkinOverride ? "Went ahead without it" : "Answered before the run" }
    switch (loop.checkinState) {
      case "not_sent":
        return {
          state: "current" as const,
          detail: `Ask ${first} what changed before you start · reply by ${dayLabel(loop.cutoff)}`,
          action: (
            <Button type="button" size="xs" variant="outline" onClick={sendCheckin}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send check-in
            </Button>
          ),
        }
      case "waiting":
        return {
          state: "waiting" as const,
          detail: `Sent to ${first} ${checkin?.sentAt ?? ""} · reply by ${dayLabel(loop.cutoff)}, or payday moves`,
          action: (
            <>
              {checkin ? <RemindButton request={checkin} /> : null}
              <ActionMenu
                actions={checkinMenu}
                trigger={
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="More for the check-in">
                    <EllipsisIcon aria-hidden="true" />
                  </Button>
                }
              />
            </>
          ),
        }
      case "overridden":
        return {
          state: "done" as const,
          detail: `Went ahead without ${first}'s answer: “${loop.checkinOverride?.reason}”`,
        }
      case "answered": {
        const by = checkin?.answeredBy
        const late = by && by.at.slice(0, 10) > loop.cutoff
        const who = `${by?.name.split(" ")[0] ?? first}, ${by ? answeredAt(by) : ""}`
        if (!loop.changes)
          return {
            state: "done" as const,
            detail: (
              <>
                No changes since last month · {who}
                {late ? <span className="text-warning-text"> · after the cut-off</span> : null}
              </>
            ),
          }
        if (loop.applied)
          return { state: "done" as const, detail: `${who} · added to the run: ${loop.applied.summary}` }
        return {
          state: "current" as const,
          detail: `${who} reported changes: see below`,
        }
      }
    }
  })()

  // ── 2. Lines ──
  const total = payroll.lines.length - payroll.skipped.length
  const approved = payroll.paid.length + payroll.ready.length
  // Approved by hand, one by one: they stop the bulk approval.
  const unusualOpen = payroll.open.filter((i) => openAnomalies(state, i).length).length
  const linesStep = {
    state: (payroll.open.length === 0 ? "done" : approved ? "current" : "next") as StepState,
    detail:
      payroll.open.length === 0 ? (
        `All ${total} approved`
      ) : (
        <>
          {approved} of {total} pay lines approved · {payroll.open.length} to go, below
          {unusualOpen ? (
            <>
              {" · "}
              <AnomalyCount n={unusualOpen} suffix="to approve by hand" />
            </>
          ) : null}
        </>
      ),
  }

  /** Lines on a list with a real anomaly; pay the customer hasn't
      confirmed is marked too, but isn't one. */
  function countUnusual(lines: { itemId: string }[]) {
    return lines.filter((l) => {
      const item = state.items.find((i) => i.id === l.itemId)
      return item ? anomaliesOf(state, item).length > 0 : false
    }).length
  }

  // ── 3. Customer approval ──
  const checkinOk = !regular || loop.checkinState === "answered" || loop.checkinState === "overridden"
  function sendApproval() {
    const request = payApprovalRequest(state, clientId, month)
    if (request) setPreview(request)
  }

  function confirmSend(request: CustomerRequestDraft) {
    setPreview(null)
    dispatch({ type: "send_request", request })
    dispatch({ type: "people", action: { type: "track_approval", clientId, month } })
    const n = request.lines?.length ?? 0
    const flagged = request.lines?.filter((l) => l.anomaly).length ?? 0
    const unusual = countUnusual(request.lines ?? [])
    toast.success(
      n < payroll.ready.length
        ? `${n} ${n === 1 ? "line" : "lines"} sent to ${first} for approval`
        : `Pay run sent to ${first} for approval`,
      {
        description: unusual
          ? `${unusual} ${unusual === 1 ? "anomaly is" : "anomalies are"} marked for a real look${flagged > unusual ? `, and ${flagged - unusual} pay ${first} hasn't confirmed before` : ""}.`
          : flagged
          ? flagged === n
            ? `${flagged === 1 ? "It's" : "All of them are"} marked for a real look.`
            : `${flagged} ${flagged === 1 ? "line is" : "lines are"} marked for a real look. The rest is the same as always.`
          : n < payroll.ready.length
            ? "The lines they already approved aren't asked again."
            : "Nothing stands out: a thumbs up is all it needs.",
      }
    )
  }
  const optOut: TaskAction = {
    id: "opt-out",
    label: `${first} doesn't want to approve pay runs`,
    icon: BanIcon,
    group: "more",
    run: () => {
      dispatch({ type: "people", action: { type: "set_opt_out", clientId, optOut: true } })
      toast.message(`${first} no longer approves pay runs`, {
        description: "Turn it back on here whenever they want.",
      })
    },
  }
  const approvalMenu: TaskAction[] = [
    ...(approval && loop.approvalState === "waiting"
      ? [
          {
            id: "simulate-approval",
            label: "Simulate customer approval",
            icon: SparklesIcon,
            group: "customer" as const,
            run: () => {
              dispatch({ type: "simulate_reply", requestId: approval.id })
              toast.info(`${first} approved the run`)
            },
          },
          {
            id: "remind-approval",
            label: "Remind",
            icon: BellRingIcon,
            group: "customer" as const,
            run: () => {
              dispatch({ type: "remind", requestId: approval.id })
              toast.message(`Reminder sent to ${first}`)
            },
          },
        ]
      : []),
    optOut,
    ...(approval && loop.approvalState === "waiting"
      ? [
          {
            id: "withdraw-approval",
            label: "Withdraw it from their app",
            icon: Undo2Icon,
            group: "more" as const,
            run: () => {
              dispatch({ type: "withdraw_request", requestId: approval.id })
              toast.message(`Withdrawn from ${first}'s app`, { description: "Send it again when the run is ready." })
            },
          },
        ]
      : []),
    ...(loop.approvalState === "waiting" || loop.approvalState === "rejected" || loop.approvalState === "changed"
      ? [
          {
            id: "override-approval",
            label: "Approve without their approval…",
            icon: ShieldAlertIcon,
            group: "danger" as const,
            run: () => onOverride("approval"),
          },
        ]
      : []),
  ]
  const menu = (
    <ActionMenu
      actions={approvalMenu}
      trigger={
        <Button type="button" size="icon-xs" variant="ghost" aria-label="More for the customer's approval">
          <EllipsisIcon aria-hidden="true" />
        </Button>
      }
    />
  )
  const remembered = approval?.lines?.filter((l) => l.remember && l.decision === "approved").length ?? 0
  const names = (items: { title: string }[]) => {
    const firsts = items.map((i) => i.title.split(" ")[0])
    return firsts.length > 1 ? `${firsts.slice(0, -1).join(", ")} and ${firsts.at(-1)}` : (firsts[0] ?? "")
  }
  // A rejection the firm hasn't dealt with yet, in the customer's words.
  const rejection = loop.rejections[0]
  const allCorrected = loop.rejections.every((r) => r.corrected)
  const rejectionText = rejection
    ? `${rejection.by.split(" ")[0]} rejected ${names(loop.rejections.map((r) => r.item))}${rejection.note ? `: “${rejection.note}”` : ""}`
    : undefined
  // Where the rejected lines are now: corrected and waiting to go out
  // again, or still to fix.
  const rejectionNext = allCorrected ? "Corrected: send it again." : "Back in review."
  // The last rejected line fixed: say so, and offer to send it, instead of
  // leaving the accountant to notice the step changed.
  const fixedAll =
    loop.rejections.length > 0 &&
    allCorrected &&
    (loop.approvalState === "changed" || loop.approvalState === "not_sent") &&
    loop.toApprove.length > 0 &&
    checkinOk

  const approvalStep = (() => {
    switch (loop.approvalState) {
      case "opted_out":
        return {
          state: "done" as StepState,
          detail: `${first} doesn't approve pay runs (since ${dayLabel(loop.optOut!.at)})`,
          action: (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => dispatch({ type: "people", action: { type: "set_opt_out", clientId, optOut: false } })}
            >
              Turn back on
            </Button>
          ),
        }
      case "overridden":
        return {
          state: "done" as StepState,
          detail: `Approved without ${first}: “${loop.approvalOverride?.reason}”`,
        }
      case "approved":
        return {
          state: "done" as StepState,
          detail: (
            <>
              Approved by {approval?.answeredBy?.name ?? first}
              {approval?.answeredBy ? `, ${answeredAt(approval.answeredBy)}` : ""}
              {remembered ? ` · ${remembered} same pay from now on` : ""}
              {rejectionText ? (
                <span className={cn("block", allCorrected ? "text-muted-foreground" : "text-destructive")}>
                  {rejectionText}. {allCorrected ? "Corrected: approve it and send it again." : "Back in review, not in this run."}
                </span>
              ) : null}
            </>
          ),
        }
      case "waiting":
        return {
          state: "waiting" as StepState,
          detail: (
            <>
              Sent to {first} {approval?.sentAt ?? ""} · {approval?.lines?.length ?? 0} lines
              {countUnusual(approval?.lines ?? []) ? (
                <>
                  {" · "}
                  <AnomalyCount n={countUnusual(approval?.lines ?? [])} suffix="marked" />
                </>
              ) : null}
            </>
          ),
          action: menu,
        }
      case "rejected": {
        // In the run (approved again unchanged): send it again or leave it
        // out. Back in review: fix it in the table, then send it.
        const inRun = loop.toApprove.length > 0
        return {
          state: (inRun ? "current" : "waiting") as StepState,
          detail: `${rejectionText ?? `${first} rejected a line`}. ${
            inRun
              ? "You approved it unchanged: send it again with a note, or leave it out of the run."
              : `Back in review below: fix ${loop.rejections.length === 1 ? "it" : "them"} and send again, or move ${loop.rejections.length === 1 ? "it" : "them"} to next month.`
          }`,
          action: inRun ? (
            <>
              <Button type="button" size="xs" variant="outline" onClick={sendApproval}>
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Send again
              </Button>
              {menu}
            </>
          ) : (
            menu
          ),
        }
      }
      case "changed":
      case "not_sent": {
        const changed = loop.approvalState === "changed"
        const asking = loop.toApprove
        // Some lines sit on a list the customer still has open: the new
        // one replaces it.
        const outdated = asking.some((i) => lineApproval(state.requests, i).state === "waiting")
        return {
          state: (asking.length && checkinOk ? "current" : "next") as StepState,
          detail: (
            <>
              {changed
                ? outdated
                  ? `The list ${first} has is out of date: send ${names(asking)} again in one list`
                  : `Send ${names(asking)} to ${first}: ${asking.length === 1 ? "it isn't" : "they aren't"} approved at this pay yet`
                : asking.length
                  ? checkinOk
                    ? `Send ${first} the ${asking.length} approved ${asking.length === 1 ? "line" : "lines"}`
                    : "After the check-in"
                  : "Once lines are approved"}
              {rejectionText ? (
                <span className={cn("block", allCorrected ? "text-muted-foreground" : "text-destructive")}>
                  {rejectionText}. {rejectionNext}
                </span>
              ) : null}
            </>
          ),
          action: (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={!asking.length || !checkinOk}
                onClick={sendApproval}
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                {changed ? "Send again" : "Send for approval"}
              </Button>
              {menu}
            </>
          ),
        }
      }
    }
  })()

  // ── 4. The run ──
  const runStep = {
    state: (payroll.done ? "done" : !loop.blocked && payroll.ready.length ? "current" : "next") as StepState,
    detail: payroll.done
      ? payroll.runs.length > 1
        ? `${payroll.runs.length} runs approved`
        : `Approved · pays ${dayLabel(payroll.runs[0]?.payDate ?? loop.payDate)}`
      : payroll.runs.length
        ? `Regular run approved · follow-up pays ${dayLabel(loop.payDate)}`
        : `One salary voucher · pays ${dayLabel(loop.payDate)}`,
  }

  return (
    <>
    <FixedPrompt fixed={fixedAll} first={first} count={loop.toApprove.length} onSend={sendApproval} />
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
      {preview ? (
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{preview.title}</DialogTitle>
            <DialogDescription>
              To {contact.name} in their app, with an email. {preview.lines?.length ?? 0}{" "}
              {(preview.lines?.length ?? 0) === 1 ? "line" : "lines"} to approve
              {countUnusual(preview.lines ?? []) ? `, ${countUnusual(preview.lines ?? [])} marked` : ""}.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="pay-approval-message">Message</FieldLabel>
            <Textarea
              id="pay-approval-message"
              value={preview.message}
              onChange={(e) => setPreview({ ...preview, message: e.target.value })}
              className="min-h-48 text-sm"
            />
            <FieldDescription>Written by the agent from the run. Edit it if you like.</FieldDescription>
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="button" disabled={!preview.message.trim()} onClick={() => confirmSend(preview)}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send to {first}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
    <ol className="grid gap-x-4 gap-y-5 @xl/main:grid-cols-2 @4xl/main:grid-cols-4" aria-label="Pay run steps">
      <Step state={checkinStep.state} icon={<ClipboardListIcon aria-hidden="true" />} title="Check-in" detail={checkinStep.detail}>
        {"action" in checkinStep ? checkinStep.action : null}
      </Step>
      <Step state={linesStep.state} icon={<ListChecksIcon aria-hidden="true" />} title="Pay lines" detail={linesStep.detail} />
      <Step
        state={approvalStep.state}
        icon={<UserCheckIcon aria-hidden="true" />}
        title="Customer approval"
        detail={approvalStep.detail}
      >
        {"action" in approvalStep ? approvalStep.action : null}
      </Step>
      <Step state={runStep.state} icon={<SendIcon aria-hidden="true" />} title="Run approved" detail={runStep.detail} />
    </ol>
    </>
  )
}
