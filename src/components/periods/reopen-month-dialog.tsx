"use client"

// Reopening a closed month: customers forget invoices all the time, and a
// big one belongs in its own month's VAT term. The reason goes on the
// month's history with who reopened it, and the dialog says plainly what
// reopening sets off before anything changes.
import { useState, type ReactNode } from "react"
import { FileTextIcon, HistoryIcon, LandmarkIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

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
import { CLIENT_BY_ID, monthLabel } from "@/lib/accounting/data"
import { getClientFilings, vatFilingId } from "@/lib/accounting/filings"
import { useAccounting } from "@/lib/accounting/store"

/** The month's name alone: "August". */
export function monthWord(month: string) {
  return monthLabel(month).split(" ")[0]
}

export function ReopenMonthDialog({
  clientId,
  month,
  open,
  onOpenChange,
}: {
  clientId: string
  month: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <ReopenForm clientId={clientId} month={month} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Consequence({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="text-muted-foreground mt-0.5 shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="text-pretty">{children}</span>
    </li>
  )
}

function ReopenForm({
  clientId,
  month,
  onDone,
}: {
  clientId: string
  month: string
  onDone: () => void
}) {
  const { state, dispatch } = useAccounting()
  const [reason, setReason] = useState("")
  const client = CLIENT_BY_ID.get(clientId)!
  const first = client.contacts[0]?.name.split(" ")[0] ?? "The customer"
  const name = monthWord(month)
  const filing = getClientFilings(client, state.items, state).find(
    (f) => f.id === vatFilingId(client, month)
  )
  const filed = filing?.status === "submitted" || Boolean(filing?.correction)
  const hasPayroll = state.items.some((i) => i.clientId === clientId && i.domain === "payroll")

  function reopen() {
    if (!reason.trim()) return
    dispatch({ type: "periods", action: { type: "reopen", clientId, month, reason } })
    toast.success(`${name} reopened for ${client.name}`, {
      description: `Bookkeeping and reconciliation for ${name} are open. Close it again from Monthly report to send the updated report.`,
    })
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        reopen()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Reopen {name} for {client.name}?
        </DialogTitle>
        <DialogDescription className="text-pretty">
          {name}&apos;s bookkeeping and reconciliation open again. When you close it
          again, {first} gets an updated report.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="reopen-reason">Why</FieldLabel>
        <Textarea
          id="reopen-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="5 invoices the customer forgot to send"
          className="min-h-16 resize-none"
          autoFocus
        />
        <FieldDescription>Kept in {name}&apos;s history with your name and today&apos;s date.</FieldDescription>
      </Field>

      <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
        <Consequence icon={<FileTextIcon aria-hidden="true" />}>
          {first} keeps the {name} report they have until the updated one goes out.
        </Consequence>
        {filing ? (
          <Consequence icon={<LandmarkIcon aria-hidden="true" />}>
            {filed
              ? `${filing.short} is already filed. Whatever you book in ${name} needs a corrected VAT return, under Filings.`
              : `${filing.short} isn't filed yet, so what you book in ${name} goes into it.`}
          </Consequence>
        ) : null}
        {hasPayroll ? (
          <Consequence icon={<WalletIcon aria-hidden="true" />}>
            Salary corrections are paid in the current run and periodised back. See Payroll.
          </Consequence>
        ) : null}
        <Consequence icon={<HistoryIcon aria-hidden="true" />}>
          The payroll, ledger and VAT reconciliations are signed off again before you close.
        </Consequence>
      </ul>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!reason.trim()}>
          <HistoryIcon data-icon="inline-start" aria-hidden="true" />
          Reopen {name}
        </Button>
      </DialogFooter>
    </form>
  )
}
