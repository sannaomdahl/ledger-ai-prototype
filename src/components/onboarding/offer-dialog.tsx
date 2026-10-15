"use client"

// The offer is the contract. Its terms start from the agent's estimate; what
// goes out is frozen, and changing it later sends a new version that replaces
// the old one on the company's link.
import { useState } from "react"
import { SendIcon, TriangleAlertIcon } from "lucide-react"
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
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  company,
  defaultTerms,
  EXTRA_EMPLOYEE,
  EXTRA_VOUCHERS,
  formatKr,
  takeoverDateWarning,
  type OfferTerms,
  type OnboardingCase,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"

export function OfferDialog({
  c,
  open,
  onOpenChange,
}: {
  c: OnboardingCase
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <OfferForm c={c} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function OfferForm({ c, onDone }: { c: OnboardingCase; onDone: () => void }) {
  const { dispatch } = useAccounting()
  const co = company(c)
  const revising = Boolean(c.offer)
  const [terms, setTerms] = useState<OfferTerms>(() => {
    if (!c.offer) return defaultTerms(co)
    const { monthly, includedEmployees, includedVouchers, payroll, invoicing, takeoverDate, previousAccountant, handoverNote } =
      c.offer
    return { monthly, includedEmployees, includedVouchers, payroll, invoicing, takeoverDate, previousAccountant, handoverNote }
  })
  const first = co.contact.name.split(" ")[0]
  const dateWarning = takeoverDateWarning(co, terms.takeoverDate, terms.previousAccountant)

  function set<K extends keyof OfferTerms>(key: K, value: OfferTerms[K]) {
    setTerms((t) => ({ ...t, [key]: value }))
  }

  function submit() {
    dispatch({ type: "onboarding", action: { type: "send_offer", caseId: c.id, terms } })
    toast.success(revising ? `New offer sent to ${first}` : `Offer sent to ${first}`, {
      description: revising
        ? "Their link now shows this version; the old one says it was replaced."
        : `${co.contact.email} got a link to read and sign it. It also carries their onboarding from here.`,
    })
    onDone()
  }

  const number = (key: "monthly" | "includedEmployees" | "includedVouchers") => ({
    value: String(terms[key]),
    inputMode: "numeric" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, Number(e.target.value.replace(/\D/g, "")) || 0),
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{revising ? `Change the offer · v${(c.offer?.version ?? 0) + 1}` : "Send the offer"}</DialogTitle>
        <DialogDescription className="text-pretty">
          {co.name} · agent&apos;s estimate {formatKr(co.saft.monthlyPrice)}/mo
          {co.saft.currentFee ? `, they pay ${formatKr(co.saft.currentFee)}/mo today` : ""}.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-1">
          <FieldLabel htmlFor="offer-monthly">Per month, kr</FieldLabel>
          <Input id="offer-monthly" className="tabular-nums" {...number("monthly")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="offer-employees">Employees</FieldLabel>
          <Input id="offer-employees" className="tabular-nums" {...number("includedEmployees")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="offer-vouchers">Vouchers/yr</FieldLabel>
          <Input id="offer-vouchers" className="tabular-nums" {...number("includedVouchers")} />
        </Field>
      </FieldGroup>
      <p className="text-muted-foreground -mt-2 text-xs text-pretty">
        Beyond that, a year: {formatKr(EXTRA_EMPLOYEE)} per extra employee, {formatKr(EXTRA_VOUCHERS)} per 100 extra vouchers.
      </p>

      <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="offer-payroll">Payroll</FieldLabel>
          </FieldContent>
          <Switch id="offer-payroll" checked={terms.payroll} onCheckedChange={(v) => set("payroll", v)} />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="offer-invoicing">Invoicing their customers</FieldLabel>
          </FieldContent>
          <Switch id="offer-invoicing" checked={terms.invoicing} onCheckedChange={(v) => set("invoicing", v)} />
        </Field>
      </FieldGroup>

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="offer-takeover">We take over from</FieldLabel>
          <Input
            id="offer-takeover"
            type="date"
            value={terms.takeoverDate}
            onChange={(e) => e.target.value && set("takeoverDate", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="offer-previous">Previous accountant</FieldLabel>
          <Input
            id="offer-previous"
            value={terms.previousAccountant}
            onChange={(e) => set("previousAccountant", e.target.value)}
          />
        </Field>
      </FieldGroup>
      {dateWarning ? (
        <p className="text-warning-text -mt-2 flex gap-1.5 text-xs text-pretty">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {dateWarning}
        </p>
      ) : null}
      <Field>
        <FieldLabel htmlFor="offer-handover">Until then</FieldLabel>
        <Textarea
          id="offer-handover"
          value={terms.handoverNote}
          onChange={(e) => set("handoverNote", e.target.value)}
          className="min-h-14 resize-none"
        />
        <FieldDescription>What the previous accountant still does. Shown to {first}.</FieldDescription>
      </Field>

      <p className="text-muted-foreground text-xs text-pretty">
        Who does what goes with it, as it stands on the case page{terms.payroll ? "" : ", without the pay lines"}.{" "}
        {first} agrees to it by signing.
      </p>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!terms.monthly}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          {revising ? "Send new version" : `Send to ${first}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
