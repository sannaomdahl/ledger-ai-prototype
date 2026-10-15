"use client"

// The firm's side of an approval task, in the detail panel: each line,
// what stood out on it, what the customer decided and why, and who answered
// when. A rejected invoice stays on hold until the accountant settles it:
// ask the supplier for a credit note, or pay it anyway. Pay-run lines
// (domain "payroll") show the same way, without the payment part.
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"
import { useState } from "react"
import { ActivityIcon, BellRingIcon, FileMinusIcon, MessageCircleQuestionIcon, SendIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { formatNok } from "@/components/accounting/meta"
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
import { creditNoteEmail, creditNoteFor } from "@/lib/accounting/documents"
import { Separator } from "@/components/ui/separator"
import {
  approvalsOf,
  dayLabel,
  invoiceApprovals,
  stampLabel,
  supplierShort,
} from "@/lib/accounting/approvals"
import { addDays, CLIENT_BY_ID, dayLabel as weekday, TODAY } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { ApprovalLine, CustomerRequest, ReviewItem } from "@/lib/accounting/types"
import { OverdueBadge } from "./approval-status"

function Decision({ line, payroll }: { line: ApprovalLine; payroll: boolean }) {
  if (line.decision === "approved")
    return (
      <Badge variant="success-light" className="shrink-0">
        Approved{line.remember ? (payroll ? ", same pay from now on" : ", from now on") : ""}
      </Badge>
    )
  if (line.decision === "rejected")
    return (
      <Badge variant="destructive-light" className="shrink-0">
        Rejected
      </Badge>
    )
  return (
    <Badge variant="outline" className="shrink-0">
      Waiting
    </Badge>
  )
}

export function ApprovalLines({ request }: { request: CustomerRequest }) {
  const { state, dispatch } = useAccounting()
  const a = approvalsOf(state)
  const client = CLIENT_BY_ID.get(request.clientId)
  const recipient = client?.contacts.find((c) => c.id === request.recipientId)
  const lines = request.lines ?? []
  const payroll = request.domain === "payroll"
  const rows = new Map(
    payroll ? [] : invoiceApprovals(state, request.clientId).map((r) => [r.item.id, r])
  )
  const nav = [request.id, ...lines.map((l) => l.itemId)]
  // The e-mail to the supplier, read before it goes.
  const [email, setEmail] = useState<{ item: ReviewItem; text: string } | null>(null)
  const firstName = recipient?.name.split(" ")[0] ?? "the customer"

  /** Asks the customer what to do before the firm decides: a pick-one
      task in their app, about the line. */
  function askFirst(item: ReviewItem, note?: string) {
    if (!recipient) return
    dispatch({
      type: "add_task",
      clientId: request.clientId,
      domain: "bookkeeping",
      about: item.id,
      request: {
        kind: "confirm",
        responseType: "choice",
        options: [`Ask ${supplierShort(item.title)} for a credit note`, "It's right after all, pay it", "Call me"],
        title: `${supplierShort(item.title)}, ${formatNok(Math.abs(item.amount))}: credit note or pay?`,
        message: `Hi ${firstName}, you rejected the ${supplierShort(item.title)} invoice of ${dayLabel(item.date)}${note ? ` (“${note}”)` : ""}. Shall we ask them for a credit note? Until we hear from you, it stays unpaid.`,
        recipientId: recipient.id,
        due: weekday(addDays(TODAY, 3)),
        priority: "medium",
      },
    })
    toast.success(`Asked ${firstName}`, { description: "A task in their app. The invoice stays on hold." })
  }

  function settle(item: ReviewItem, how: "credit_note" | "pay_anyway", sent?: string) {
    dispatch({ type: "approvals", action: { type: "settle", itemId: item.id, how, email: sent } })
    toast.success(
      how === "pay_anyway" ? `${supplierShort(item.title)} will be paid` : `Credit note asked from ${supplierShort(item.title)}`,
      {
        description:
          how === "pay_anyway"
            ? "Scheduled in Tripletex for the due date, or today if it has passed."
            : "The invoice stays unpaid. Book the credit note against it when it arrives.",
      }
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="border-border/60 flex flex-col overflow-hidden rounded-lg border">
        {lines.map((line, index) => {
          const item = state.items.find((i) => i.id === line.itemId)
          if (!item) return null
          const row = rows.get(item.id)
          const settled = a.settled[item.id]
          return (
            <li key={line.itemId} className="flex flex-col">
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <div className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "open_item", id: item.id, nav })}
                    className="text-foreground hover:text-foreground/80 min-w-0 truncate text-left text-sm font-medium underline-offset-4 transition-colors duration-150 hover:underline"
                  >
                    {item.title}
                  </button>
                  <span className="text-foreground shrink-0 text-sm tabular-nums">
                    {formatNok(Math.abs(item.amount))}
                  </span>
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span>
                    {payroll
                      ? [item.subtitle, item.basis].filter(Boolean).join(" · ")
                      : `Invoice ${dayLabel(item.date)} · due ${dayLabel(item.dueDate ?? item.date)}`}
                  </span>
                  {row?.overdue ? <OverdueBadge due={item.dueDate ?? item.date} size="sm" /> : null}
                </div>
                {line.anomaly ? (
                  <p className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-xs">
                    <ActivityIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {line.anomaly}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Decision line={line} payroll={payroll} />
                  {row && row.status !== "with_customer" ? (
                    <span
                      className={cn(
                        "text-xs",
                        row.payment.state === "hold" ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {row.payment.label}
                    </span>
                  ) : null}
                </div>
                {line.note ? (
                  <blockquote className="text-foreground border-l-2 pl-2.5 text-xs leading-5 text-pretty">
                    &ldquo;{line.note}&rdquo;
                  </blockquote>
                ) : null}
                {!payroll && line.decision === "rejected" ? (
                  settled ? (
                    <CreditNoteFollowUp item={item} how={settled.how} by={settled.by} at={settled.at} nav={nav} />
                  ) : (
                    <>
                      <AskedFirst itemId={item.id} />
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => setEmail({ item, text: creditNoteEmail(item, line.note) })}
                        >
                          <FileMinusIcon data-icon="inline-start" aria-hidden="true" />
                          Ask the supplier for a credit note…
                        </Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => askFirst(item, line.note)}>
                          <MessageCircleQuestionIcon data-icon="inline-start" aria-hidden="true" />
                          Ask {firstName} first
                        </Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => settle(item, "pay_anyway")}>
                          <SendIcon data-icon="inline-start" aria-hidden="true" />
                          Pay anyway
                        </Button>
                      </div>
                    </>
                  )
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <Dialog open={Boolean(email)} onOpenChange={(open) => !open && setEmail(null)}>
        {email ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ask {supplierShort(email.item.title)} for a credit note</DialogTitle>
              <DialogDescription>
                An e-mail from you to {email.item.title}. The invoice stays unpaid, and a follow-up stays on this
                line until the credit note is booked.
              </DialogDescription>
            </DialogHeader>
            {/* The customer is copied, so nothing about their supplier
                happens behind their back; replies come to the client's own
                address with us and land on this line. */}
            <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate">
                {email.item.title} · faktura@{supplierShort(email.item.title).toLowerCase().replace(/[^a-z0-9]/g, "")}.no
              </dd>
              <dt className="text-muted-foreground">Cc</dt>
              <dd className="min-w-0 truncate">
                {recipient?.name ?? "The customer"}
                {recipient?.email ? ` · ${recipient.email}` : ""}
              </dd>
              <dt className="text-muted-foreground">Reply to</dt>
              <dd className="min-w-0 truncate">
                {email.item.clientId}@inbox.sanna.no
                <span className="text-muted-foreground"> · answers land on this line</span>
              </dd>
            </dl>
            <Field>
              <FieldLabel htmlFor="credit-note-email">E-mail</FieldLabel>
              <Textarea
                id="credit-note-email"
                value={email.text}
                onChange={(e) => setEmail({ ...email, text: e.target.value })}
                className="min-h-56 text-sm"
              />
              <FieldDescription>Drafted by the agent from the invoice and {firstName}&apos;s reason.</FieldDescription>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button
                type="button"
                disabled={!email.text.trim()}
                onClick={() => {
                  settle(email.item, "credit_note", email.text)
                  setEmail(null)
                }}
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Send to {supplierShort(email.item.title)}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
      <p className="text-muted-foreground text-xs">
        {request.answeredBy
          ? `Answered by ${request.answeredBy.name}, ${stampLabel(request.answeredBy.at)}`
          : `Waiting on ${recipient?.name ?? "the customer"} since ${request.sentAt}${request.due ? `, due ${request.due}` : ""}`}
      </p>
    </div>
  )
}

/** The question to the customer about a rejected line, while it is out
    and once they answered. */
function AskedFirst({ itemId }: { itemId: string }) {
  const { state, dispatch } = useAccounting()
  const asked = state.requests.findLast((r) => r.about === itemId && r.resolution !== "cancelled")
  if (!asked) return null
  const answer = asked.reply?.text
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "open_request", id: asked.id })}
      className="text-muted-foreground hover:text-foreground text-left text-xs underline-offset-4 transition-colors duration-150 hover:underline"
    >
      {answer ? `They answered: ${answer.replace(/^Picked: /, "")}` : `Asked them ${asked.sentAt.toLowerCase()}, waiting for the answer`}
    </button>
  )
}

/** After a rejection is settled: paid anyway, or the credit note chased
    until it is booked. */
function CreditNoteFollowUp({
  item,
  how,
  by,
  at,
  nav,
}: {
  item: ReviewItem
  how: "credit_note" | "pay_anyway"
  by: string
  at: string
  nav: string[]
}) {
  const { state, dispatch } = useAccounting()
  if (how === "pay_anyway")
    return (
      <span className="text-muted-foreground text-xs">
        Paid anyway · {by}, {stampLabel(at)}
      </span>
    )
  const note = creditNoteFor(state, item.id)
  const name = supplierShort(item.title)
  if (note)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {note.status === "booked"
            ? `Credit note booked (voucher ${note.voucherNo}): the invoice is cleared`
            : "Credit note in the inbox, to book"}
        </span>
        {note.status !== "booked" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => dispatch({ type: "open_item", id: note.id, nav: [note.id, ...nav] })}
          >
            Open it
          </Button>
        ) : null}
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-warning-text text-xs">
        Waiting on {name}&apos;s credit note · asked by {by}, {stampLabel(at)}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            dispatch({ type: "documents", action: { type: "remind_supplier", invoiceId: item.id } })
            toast.message(`Reminder e-mailed to ${name}`)
          }}
        >
          <BellRingIcon data-icon="inline-start" aria-hidden="true" />
          Remind {name}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            dispatch({ type: "documents", action: { type: "credit_note_arrived", invoiceId: item.id } })
            toast.info(`${name}'s credit note arrived`, { description: "It's in the Bookkeeping inbox to book." })
          }}
        >
          <SparklesIcon data-icon="inline-start" aria-hidden="true" />
          Simulate the credit note arriving
        </Button>
      </div>
    </div>
  )
}
