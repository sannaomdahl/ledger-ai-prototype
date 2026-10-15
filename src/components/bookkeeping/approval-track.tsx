"use client"

// The bookkeeping loop as a track above the queue, in the bar grammar of
// the pay run's: book the month's invoices, have the customer
// approve this week's list, see them paid. Unlike payroll it isn't one run
// a month: invoices flow in all the time and a list goes out every week,
// so the approval step speaks of this week's list and the one still out.
import { RemindButton } from "@/components/accounting/remind-button"
import { StepLine, TrackStep, type StepState } from "@/components/accounting/track-step"
import type { ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  BookOpenCheckIcon,
  EllipsisIcon,
  ListChecksIcon,
  ListIcon,
  SparklesIcon,
  UserCheckIcon,
  WalletIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AnomalyCount } from "@/components/accounting/anomaly"
import { ActionMenu, type TaskAction } from "@/components/accounting/task-actions"
import { DotSeparator } from "@/components/accounting/primitives"
import { Button } from "@/components/ui/button"
import {
  approvalLists,
  approverOf,
  clientApprovals,
  dayLabel,
  hasOpenRejection,
  invoiceApprovals,
  listLate,
  nextListDay,
  policyOf,
  weekdayLabel,
} from "@/lib/accounting/approvals"
import { openAnomalies } from "@/lib/accounting/anomalies"
import { awaitedCreditNotes } from "@/lib/accounting/documents"
import { CLIENT_BY_ID, monthName, OPEN_MONTH, tabOf } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { CustomerRequest } from "@/lib/accounting/types"
import { PrepareListDialog, useDraftList } from "./prepare-list"

// Payroll's four plus "late": an overdue invoice is the one red signal.
/** "Tue 15 Sep 08:47". */
function when(iso: string) {
  return `${weekdayLabel(iso)}${iso.length > 10 ? ` ${iso.slice(11, 16)}` : ""}`
}

/** The pay run's step (people/pay-loop), with room for more than one line:
    the approval step can have last week's list out and this week's ready. */
export function ApprovalTrack({
  clientId,
  prepare,
  onPrepareChange,
}: {
  clientId: string
  /** The list composer is open: the page can open it from a link. */
  prepare: boolean
  onPrepareChange: (open: boolean) => void
}) {
  const { state, dispatch } = useAccounting()
  const draft = useDraftList(clientId)
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return null
  const policy = policyOf(state, clientId)
  const approver = approverOf(state, clientId)
  const first = approver?.name.split(" ")[0] ?? "the customer"
  const month = state.month

  // ── 1. Book: the month's invoices ──
  const lines = state.items.filter(
    (i) => i.clientId === clientId && i.period === month && tabOf(i) === "bookkeeping"
  )
  const booked = lines.filter((i) => i.status === "booked").length
  // Booked by hand, one by one: they stop the bulk booking.
  const unusualToBook = lines.filter((i) => i.status !== "booked" && openAnomalies(state, i).length).length
  const bookStep: { state: StepState; text: string } = !lines.length
    ? { state: "next", text: `Nothing in ${monthName(month)} yet` }
    : booked === lines.length
      ? { state: "done", text: `All ${lines.length} of ${monthName(month)}'s invoices booked` }
      : {
          state: booked ? "current" : "next",
          text: `${booked} of ${lines.length} booked in ${monthName(month)} · ${lines.length - booked} to go, below`,
        }

  // ── 2. Customer approval: the list still out, and this week's ──
  const lists = approvalLists(state, clientId)
  const listNav = lists.map((r) => r.id)
  const openList = (request: CustomerRequest) =>
    dispatch({ type: "open_request", id: request.id, nav: listNav })
  const rejection = lists.find((r) => r.status === "replied" && hasOpenRejection(state, r))
  // The oldest list nobody answered: that's the one to chase.
  const out = lists.filter((r) => r.status === "sent").at(-1)
  const answered = !rejection ? lists.find((r) => r.status === "replied") : undefined
  const lastDone = lists.find((r) => r.status === "resolved" && r.answeredBy)
  const unbooked = lines.filter((i) => i.kind === "invoice" && i.status !== "booked").length

  function outMenu(request: CustomerRequest): TaskAction[] {
    const flagged = (request.lines ?? []).find((l) => l.anomaly) ?? request.lines?.[0]
    return [
      { id: "open", label: "Open the list", icon: ListIcon, group: "decide", run: () => openList(request) },
      {
        id: "simulate-approve",
        label: "Simulate customer approval",
        icon: SparklesIcon,
        group: "customer",
        run: () => {
          dispatch({ type: "simulate_reply", requestId: request.id })
          toast.info(`${first} approved the list`)
        },
      },
      {
        id: "simulate-reject",
        label: "Simulate a rejection",
        icon: SparklesIcon,
        group: "customer",
        run: () => {
          dispatch({
            type: "customer_approve",
            requestId: request.id,
            lines: (request.lines ?? []).map((l) =>
              l.itemId === flagged?.itemId
                ? { ...l, decision: "rejected", note: "This isn't ours. We didn't order anything like this." }
                : { ...l, decision: "approved" }
            ),
          })
          toast.info(`${first} rejected a line`, { description: "Settle it from the list." })
        },
      },
    ]
  }

  const approvalLines: ReactNode[] = []
  if (rejection) {
    const rejected = (rejection.lines ?? []).filter((l) => l.decision === "rejected").length
    approvalLines.push(
      <StepLine
        key="rejection"
        actions={
          <Button type="button" size="xs" variant="outline" onClick={() => openList(rejection)}>
            Settle in the list
          </Button>
        }
      >
        {rejection.answeredBy?.name.split(" ")[0] ?? first} answered {rejection.answeredBy ? when(rejection.answeredBy.at) : ""} ·{" "}
        <span className="text-warning-text">
          {rejected === 1 ? "a rejection" : `${rejected} rejections`} to settle
        </span>
      </StepLine>
    )
  } else if (answered) {
    approvalLines.push(
      <StepLine
        key="answered"
        actions={
          <Button type="button" size="xs" variant="outline" onClick={() => openList(answered)}>
            Open the list
          </Button>
        }
      >
        {answered.answeredBy?.name.split(" ")[0] ?? first} answered {answered.answeredBy ? when(answered.answeredBy.at) : ""}
      </StepLine>
    )
  }
  if (out) {
    const late = listLate(out)
    const outUnusual = (out.lines ?? []).filter((l) => l.anomaly && !l.decision).length
    approvalLines.push(
      <StepLine
        key="out"
        actions={
          <>
            <RemindButton request={out} />
            <ActionMenu
              actions={outMenu(out)}
              trigger={
                <Button type="button" size="icon-xs" variant="ghost" aria-label="More for the list">
                  <EllipsisIcon aria-hidden="true" />
                </Button>
              }
            />
          </>
        }
      >
        Waiting on {client.contacts.find((c) => c.id === out.recipientId)?.name.split(" ")[0] ?? first} since {out.sentAt}
        {outUnusual ? (
          <>
            {" · "}
            <AnomalyCount n={outUnusual} suffix="marked" />
          </>
        ) : null}
        {late ? (
          <span className="text-warning-text"> · was due {out.due}</span>
        ) : (
          ` · due ${out.due}`
        )}
      </StepLine>
    )
  }
  if (draft) {
    const look = draft.rows.filter((r) => r.needsLook).length
    const unusual = draft.rows.filter((r) => r.anomalies.length).length
    const unknown = look - unusual
    const n = draft.rows.length
    approvalLines.push(
      <StepLine
        key="draft"
        actions={
          <Button type="button" size="xs" variant="outline" onClick={() => onPrepareChange(true)}>
            <ListChecksIcon data-icon="inline-start" aria-hidden="true" />
            Prepare list
          </Button>
        }
      >
        This week&apos;s list: {n} {n === 1 ? "invoice" : "invoices"} ready ·{" "}
        {unusual ? <AnomalyCount n={unusual} /> : null}
        {unusual && unknown ? ", " : null}
        {unknown ? `${unknown} not on the approved suppliers` : null}
        {!look ? "nothing stands out" : null}
      </StepLine>
    )
  } else {
    approvalLines.push(
      <StepLine key="none">
        {policy.mode === "anomalies_only" ? "Nothing needs a look this week" : "Nothing to send this week"} · next
        list {weekdayLabel(nextListDay())}
        {unbooked && month === OPEN_MONTH
          ? `, with the ${unbooked === 1 ? "invoice" : `${unbooked} invoices`} still to book`
          : ""}
        {!out && !rejection && !answered && lastDone?.answeredBy
          ? `. The last one was approved by ${lastDone.answeredBy.name.split(" ")[0]}, ${dayLabel(lastDone.answeredBy.at)}`
          : ""}
      </StepLine>
    )
  }
  const approvalState: StepState = rejection || out || answered ? "waiting" : draft ? "current" : "done"

  // ── 3. Paid: where approved invoices are in their payment ──
  const summary = clientApprovals(state, client)
  const current = invoiceApprovals(state, clientId).filter((i) => !i.history)
  const paid = current.filter((i) => i.payment.state === "paid").length
  const scheduled = current
    .filter((i) => i.payment.state === "scheduled")
    .sort((x, y) => (x.payment.on ?? "").localeCompare(y.payment.on ?? ""))
  const held = current.filter((i) => i.payment.state === "hold" || i.payment.state === "stopped").length
  const overdue = [...summary.overdue.map((i) => i.item), ...summary.unbookedOverdue]
  const awaited = awaitedCreditNotes(state, clientId)
  const paidParts = [
    paid ? `${paid} paid` : "",
    scheduled.length ? `${scheduled.length} scheduled, next ${dayLabel(scheduled[0].payment.on!)}` : "",
    held ? `${held} on hold` : "",
  ].filter(Boolean)
  const paidState: StepState = overdue.length
    ? "late"
    : held
      ? "waiting"
      : scheduled.length
        ? "current"
        : paid
          ? "done"
          : "next"

  // The header says the one thing that matters most.
  const badge = overdue.length ? (
    <Badge variant="destructive-light">{overdue.length} overdue</Badge>
  ) : rejection ? (
    <Badge variant="warning-light">Rejection to settle</Badge>
  ) : out && listLate(out) ? (
    <Badge variant="warning-light">List late</Badge>
  ) : draft ? (
    <Badge variant="info-light">List ready to send</Badge>
  ) : out ? (
    <Badge variant="outline">Waiting on {first}</Badge>
  ) : (
    <Badge variant="success-light">Up to date</Badge>
  )

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-px">
          <div className="flex items-center gap-2">
            <FrameTitle>Booked, approved, paid</FrameTitle>
            {badge}
          </div>
          <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <span>
              A list to {approver?.name ?? "the customer"} every {policy.cadence.replace(/s$/, "")}
            </span>
            <DotSeparator className="bg-input" />
            <span>
              {policy.mode === "anomalies_only"
                ? "Only anomalies and suppliers not approved yet; the rest goes through"
                : "Even when nothing stands out"}
            </span>
            <DotSeparator className="bg-input" />
            <span>Paid from Tripletex on the due date</span>
          </FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel>
        <ol className="grid gap-x-4 gap-y-5 @xl/main:grid-cols-3" aria-label="From booked to paid">
          <TrackStep state={bookStep.state} icon={<BookOpenCheckIcon aria-hidden="true" />} title="Book">
            <StepLine>
              {bookStep.text}
              {unusualToBook ? (
                <>
                  {" · "}
                  <AnomalyCount n={unusualToBook} suffix="to book by hand" />
                </>
              ) : null}
            </StepLine>
          </TrackStep>
          <TrackStep state={approvalState} icon={<UserCheckIcon aria-hidden="true" />} title="Customer approval">
            {approvalLines}
          </TrackStep>
          <TrackStep state={paidState} icon={<WalletIcon aria-hidden="true" />} title="Paid">
            <StepLine
              actions={
                overdue.length ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      dispatch({ type: "open_item", id: overdue[0].id, nav: overdue.map((i) => i.id) })
                    }
                  >
                    See {overdue.length === 1 ? "it" : "them"}
                  </Button>
                ) : null
              }
            >
              {paidParts.length ? paidParts.join(" · ") : "Nothing approved to pay yet"}
              {overdue.length ? (
                <span className="text-destructive">
                  {paidParts.length ? " · " : ". "}
                  {overdue.length} overdue
                </span>
              ) : null}
            </StepLine>
            {awaited.length ? (
              <StepLine
                actions={
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => awaited[0].request && openList(awaited[0].request)}
                  >
                    Follow up
                  </Button>
                }
              >
                <span className="text-warning-text">
                  {awaited.length === 1
                    ? `Credit note awaited from ${awaited[0].item.title}`
                    : `${awaited.length} credit notes awaited`}
                </span>{" "}
                · not paid until it&apos;s booked
              </StepLine>
            ) : null}
          </TrackStep>
        </ol>
      </FramePanel>
      <PrepareListDialog clientId={clientId} open={prepare && Boolean(draft)} onOpenChange={onPrepareChange} />
    </Frame>
  )
}
