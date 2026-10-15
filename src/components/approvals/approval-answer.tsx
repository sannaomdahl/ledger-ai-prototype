"use client"

// The customer's side of an approval task: each line with what stands out
// on it in plain words, approve or reject (with a short reason), and "from
// now on" for the suppliers (or the pay) they trust. One tap approves the
// lot. The same list carries invoices before they're paid and, for the pay
// run, employees before salaries go out: it reads the line's domain.
import { useState } from "react"
import { cn } from "cn"
import { ActivityIcon, CheckIcon, SendIcon, ThumbsUpIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { formatNok } from "@/components/accounting/meta"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  approvedSupplier,
  dayLabel,
  policyOf,
  supplierShort,
} from "@/lib/accounting/approvals"
import { ACCOUNTANT_BY_ID, CLIENT_BY_ID } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { usePortalContact, useStillOpen } from "@/components/portal/portal-contact"
import { useAccounting } from "@/lib/accounting/store"
import type { ApprovalLine, CustomerRequest, ReviewItem } from "@/lib/accounting/types"

type Choice = Pick<ApprovalLine, "decision" | "note" | "remember">

function LineCard({
  line,
  item,
  choice,
  known,
  onChange,
}: {
  line: ApprovalLine
  item: ReviewItem
  choice: Choice
  /** A supplier they already approve from now on: no need to ask again. */
  known: boolean
  onChange: (choice: Choice) => void
}) {
  const payroll = item.domain === "payroll"
  const due = item.dueDate ?? item.date
  const late = !payroll && due < TODAY
  const name = payroll ? item.title.split(" ")[0] : supplierShort(item.title)
  const approved = choice.decision === "approved"
  const rejected = choice.decision === "rejected"

  return (
    <li
      className={cn(
        "border-border flex flex-col gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-150",
        approved && "border-success/30 bg-success/5",
        rejected && "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-foreground truncate text-sm font-medium">{item.title}</span>
          <span className="text-muted-foreground text-xs">
            {payroll ? (
              [item.subtitle, item.basis].filter(Boolean).join(" · ")
            ) : (
              <>
                Invoice {dayLabel(item.date)} ·{" "}
                <span className={cn(late && "text-destructive font-medium")}>
                  {late ? `was due ${dayLabel(due)}` : `due ${dayLabel(due)}`}
                </span>
              </>
            )}
          </span>
        </div>
        <span className="text-foreground shrink-0 text-sm font-medium tabular-nums">
          {formatNok(Math.abs(item.amount))}
        </span>
      </div>

      {line.anomaly ? (
        <p className="bg-warning/10 text-warning-foreground dark:text-warning flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs leading-5">
          <ActivityIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {line.anomaly}
        </p>
      ) : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ThumbsUpIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {payroll
            ? "Nothing stands out"
            : known
              ? `Usually approved: you approve ${name} every month`
              : `Not on your approved suppliers yet`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={approved ? "default" : "outline"}
          aria-pressed={approved}
          onClick={() => onChange({ ...choice, decision: "approved" })}
        >
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant={rejected ? "destructive" : "outline"}
          aria-pressed={rejected}
          onClick={() => onChange({ ...choice, decision: "rejected", remember: false })}
        >
          <XIcon data-icon="inline-start" aria-hidden="true" />
          Reject
        </Button>
        {approved && (payroll || !known) ? (
          <label className="text-foreground ms-1 inline-flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={Boolean(choice.remember)}
              onCheckedChange={(checked) => onChange({ ...choice, remember: Boolean(checked) })}
            />
            {payroll ? "Same pay from now on" : `Approve ${name} from now on`}
          </label>
        ) : null}
      </div>

      {rejected ? (
        <Textarea
          value={choice.note ?? ""}
          onChange={(e) => onChange({ ...choice, note: e.target.value })}
          placeholder={payroll ? "What's wrong with it?" : "What's wrong? We'll sort it out with the supplier."}
          aria-label={`Why you reject ${item.title}`}
          className="min-h-16 resize-none text-sm"
        />
      ) : null}
    </li>
  )
}

export function ApprovalAnswer({
  request,
  onSent,
}: {
  request: CustomerRequest
  onSent: () => void
}) {
  const { state, dispatch } = useAccounting()
  const viewer = usePortalContact()
  const stillOpen = useStillOpen(request)
  const client = CLIENT_BY_ID.get(request.clientId)
  const accountant = client ? ACCOUNTANT_BY_ID.get(client.accountantId) : undefined
  const recipient = client?.contacts.find((c) => c.id === request.recipientId) ?? client?.contacts[0]
  const lines = request.lines ?? []
  const payroll = request.domain === "payroll"
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(lines.map((l) => [l.itemId, { decision: l.decision, note: l.note, remember: l.remember }]))
  )
  const [optedOut, setOptedOut] = useState(false)
  const policy = policyOf(state, request.clientId)

  const rows = lines.flatMap((line) => {
    const item = state.items.find((i) => i.id === line.itemId)
    return item ? [{ line, item }] : []
  })
  const decided = rows.filter(({ line }) => choices[line.itemId]?.decision).length
  const missingReason = rows.some(
    ({ line }) => choices[line.itemId]?.decision === "rejected" && !choices[line.itemId]?.note?.trim()
  )
  const ready = decided === rows.length && !missingReason
  const accountantFirst = accountant?.name.split(" ")[0] ?? "your accountant"

  function approveAll() {
    setChoices((current) =>
      Object.fromEntries(
        rows.map(({ line }) => {
          const c = current[line.itemId] ?? {}
          return [line.itemId, c.decision ? c : { ...c, decision: "approved" as const }]
        })
      )
    )
  }

  function submit() {
    if (!stillOpen()) return onSent()
    dispatch({
      type: "customer_approve",
      requestId: request.id,
      contactId: viewer?.id,
      lines: rows.map(({ line }) => {
        const c = choices[line.itemId] ?? {}
        return {
          ...line,
          decision: c.decision,
          note: c.decision === "rejected" ? c.note?.trim() : undefined,
          remember: c.decision === "approved" ? c.remember : undefined,
        }
      }),
    })
    const rejected = rows.filter(({ line }) => choices[line.itemId]?.decision === "rejected").length
    toast.success(`Sent to ${accountantFirst}`, {
      description: rejected
        ? payroll
          ? `${accountantFirst} fixes ${rejected === 1 ? "the one you rejected" : "the ones you rejected"} and sends ${rejected === 1 ? "it" : "them"} back to you. The rest go out on payday.`
          : `${rejected === 1 ? "The rejected one is" : "The rejected ones are"} on hold until ${accountantFirst} has sorted it out. The rest are paid when they're due.`
        : payroll
          ? "Salaries go out on the pay day."
          : "They're paid when they're due.",
    })
    onSent()
  }

  function optOut() {
    dispatch({
      type: "approvals",
      action: {
        type: "set_mode",
        clientId: request.clientId,
        mode: "anomalies_only",
        from: "portal",
        by: viewer?.name ?? recipient?.name,
      },
    })
    setOptedOut(true)
    toast.success("We'll only ask when something looks off", {
      description: `Suppliers you approve from now on are paid without a list. ${accountantFirst} can switch it back any time.`,
    })
  }

  function askAlways() {
    dispatch({
      type: "approvals",
      action: {
        type: "set_mode",
        clientId: request.clientId,
        mode: "always",
        from: "portal",
        by: viewer?.name ?? recipient?.name,
      },
    })
    toast.success("We'll ask you about every invoice", {
      description: `From the next list on. ${accountantFirst} can switch it back any time.`,
    })
  }

  // The week's invoices paid without asking: folded away, never hidden.
  const paidWithout = (request.paidWithout ?? []).flatMap((id) => {
    const item = state.items.find((i) => i.id === id)
    return item ? [item] : []
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {decided} of {rows.length} decided
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={approveAll} disabled={decided === rows.length}>
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          Approve all
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(({ line, item }) => (
          <LineCard
            key={line.itemId}
            line={line}
            item={item}
            choice={choices[line.itemId] ?? {}}
            known={!payroll && Boolean(approvedSupplier(state, request.clientId, item.title))}
            onChange={(choice) => setChoices((current) => ({ ...current, [line.itemId]: choice }))}
          />
        ))}
      </ul>
      {!payroll && paidWithout.length ? (
        <details className="group border-border rounded-lg border px-3 py-2.5 text-xs">
          <summary className="text-muted-foreground flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <ThumbsUpIcon className="size-3.5 shrink-0" aria-hidden="true" />
              Also paid this week, nothing to do: {paidWithout.length} from your approved suppliers
            </span>
            <span className="text-foreground shrink-0 font-medium tabular-nums">
              {formatNok(paidWithout.reduce((sum, i) => sum + Math.abs(i.amount), 0))}
            </span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {paidWithout.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3">
                <span className="text-foreground min-w-0 truncate">{i.title}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  due {dayLabel(i.dueDate ?? i.date)} · {formatNok(Math.abs(i.amount))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!payroll && policy.mode === "anomalies_only" ? (
        <p className="text-muted-foreground text-xs text-pretty">
          Suppliers you&apos;ve approved are paid without asking. We still ask when it&apos;s a new supplier, the
          amount is far from the usual, or the bank account changes.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!payroll && policy.mode === "anomalies_only" && !optedOut ? (
          <button
            type="button"
            onClick={askAlways}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 transition-colors duration-150"
          >
            Ask me about every invoice
          </button>
        ) : !payroll && (policy.mode === "always" || optedOut) ? (
          optedOut ? (
            <span className="text-muted-foreground text-xs">
              Done: from now on we only ask when something looks off.
            </span>
          ) : (
            <button
              type="button"
              onClick={optOut}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 transition-colors duration-150"
            >
              Only ask me when something looks off
            </button>
          )
        ) : (
          <span />
        )}
        <Button type="button" disabled={!ready} onClick={submit}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          {missingReason ? "Add a reason to send" : "Send answer"}
        </Button>
      </div>
    </div>
  )
}
