"use client"

// This week's approval list as the agent drafted it: the invoices, what
// stands out on each, and a message in the firm's voice to edit before it
// goes out. Opened from the approval track on Bookkeeping; Tasks & requests
// sends the quiet ones in one click with the same draft.
import { useMemo, useState } from "react"
import { Badge } from "@/components/reui/badge"
import { SendIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { LookReason, OverdueBadge } from "@/components/approvals/approval-status"
import { DotSeparator } from "@/components/accounting/primitives"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  dayLabel,
  draftList,
  policyOf,
  supplierShort,
  weekdayLabel,
  type DraftList,
} from "@/lib/accounting/approvals"
import { OPEN_MONTH } from "@/lib/accounting/data"
import { formatAmount } from "@/lib/accounting/format"
import { useAccounting } from "@/lib/accounting/store"

/** The agent's draft for a client, recomputed only when what it reads changes. */
export function useDraftList(clientId: string) {
  const { state } = useAccounting()
  return useMemo(
    () => draftList(state, clientId),
    // The draft only depends on these slices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.requests, state.approvals, state.onboarding, clientId]
  )
}

/** Sends a draft as an approval task, with the message as edited. In the
    anomalies-only routine the rest went through without asking, and is
    logged with the list. */
export function useSendList() {
  const { state, dispatch } = useAccounting()
  return (clientId: string, draft: DraftList, message?: string) => {
    const look = draft.rows.filter((r) => r.needsLook).length
    dispatch({
      type: "send_request",
      request: {
        clientId,
        domain: "bookkeeping",
        period: OPEN_MONTH,
        responseType: "approval",
        kind: "approval",
        title: draft.title,
        message: message?.trim() || draft.message,
        recipientId: draft.recipient.id,
        due: weekdayLabel(draft.due),
        priority: draft.rows.some((r) => r.overdue) ? "high" : look ? "medium" : "low",
        lines: draft.lines,
        paidWithout: draft.auto.length ? draft.auto.map((r) => r.item.id) : undefined,
      },
      replaces: draft.replaces.map((r) => r.id),
    })
    if (policyOf(state, clientId).mode === "anomalies_only")
      dispatch({ type: "approvals", action: { type: "record_auto", clientId } })
    const n = draft.rows.length
    toast.success(`Approval list sent to ${draft.recipient.name.split(" ")[0]}`, {
      description: `${n} ${n === 1 ? "invoice" : "invoices"}, due ${weekdayLabel(draft.due)}. They're paid on their due dates once approved.`,
    })
  }
}

export function PrepareListDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch } = useAccounting()
  const draft = useDraftList(clientId)
  const send = useSendList()
  const policy = policyOf(state, clientId)
  // The edit belongs to the draft it was made on: a new draft starts fresh.
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null)
  if (!draft) return null
  const text = edit?.base === draft.message ? edit.text : draft.message
  const first = draft.recipient.name.split(" ")[0]
  const look = draft.rows.filter((r) => r.needsLook).length
  const nav = draft.rows.map((r) => r.item.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-4rem)] flex-col sm:max-w-xl">
        <DialogHeader className="gap-1">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>This week&apos;s approval list</DialogTitle>
            {look ? (
              <Badge variant="warning-light">
                {look} {look === 1 ? "needs" : "need"} a look
              </Badge>
            ) : (
              <Badge variant="success-light">Nothing stands out</Badge>
            )}
          </div>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <span>
              {draft.rows.length - draft.replaces.flatMap((r) => r.lines ?? []).length} booked{" "}
              {draft.rows.length === 1 ? "invoice" : "invoices"} not sent yet
              {draft.replaces.length
                ? ` · ${draft.replaces.flatMap((r) => r.lines ?? []).length} still open on ${draft.replaces.map((r) => r.id).join(", ")}`
                : ""}
            </span>
            <DotSeparator className="bg-input" />
            <span>To {draft.recipient.name}</span>
            {policy.mode === "anomalies_only" ? (
              <>
                <DotSeparator className="bg-input" />
                <span>Only what needs a look</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
          <ul className="border-border/60 flex flex-col overflow-hidden rounded-lg border">
            {draft.rows.map((row, index) => (
              <li key={row.item.id}>
                {index > 0 ? <Separator className="opacity-60" /> : null}
                {/* Looking closer closes the list; it's kept as edited. */}
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false)
                    dispatch({ type: "open_item", id: row.item.id, nav })
                  }}
                  className="hover:bg-muted/40 flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-150"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-foreground min-w-0 truncate text-sm font-medium">{row.item.title}</span>
                      {row.overdue ? <OverdueBadge due={row.item.dueDate ?? row.item.date} size="sm" /> : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Invoice {dayLabel(row.item.date)} · due {dayLabel(row.item.dueDate ?? row.item.date)}
                    </span>
                    <LookReason row={row} />
                  </span>
                  <span className="text-foreground shrink-0 text-sm tabular-nums">
                    {formatAmount(Math.abs(row.item.amount))}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`approval-message-${clientId}`}
              className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
            >
              <SparklesIcon className="size-3.5" aria-hidden="true" />
              Drafted by the agent for {first}. Edit before it goes out.
            </label>
            <Textarea
              id={`approval-message-${clientId}`}
              value={text}
              onChange={(e) => setEdit({ base: draft.message, text: e.target.value })}
              className="min-h-24 resize-none text-sm"
            />
            {draft.auto.length ? (
              <p className="text-muted-foreground text-xs text-pretty">
                {first} also sees, folded away, the {draft.auto.length} auto-approved{" "}
                {draft.auto.length === 1 ? "invoice" : "invoices"} paid without asking:{" "}
                {draft.auto.map((r) => supplierShort(r.item.title)).join(", ")}. Logged for the auditor.
              </p>
            ) : null}
            {draft.replaces.length ? (
              <p className="text-muted-foreground text-xs text-pretty">
                Takes over {draft.replaces.map((r) => r.id).join(" and ")}, still unanswered: it closes when this one goes
                out, so {first} has one list to answer.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-muted-foreground text-xs text-pretty">
            Due {weekdayLabel(draft.due)}, the day before the first invoice is
          </span>
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              onClick={() => {
                send(clientId, draft, text)
                setEdit(null)
                onOpenChange(false)
              }}
            >
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send to {first}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
