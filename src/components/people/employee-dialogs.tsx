"use client"

// The three things that change who is paid what: a new hire, someone
// leaving, and pay that belonged to an earlier month. Each one lands in the
// open pay run as a line the accountant approves like any other.
import { useState } from "react"
import { CalendarMinusIcon, HistoryIcon, UserPlusIcon } from "lucide-react"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addDays, dayLabel, monthLabel, MONTHS, nextMonth } from "@/lib/accounting/data"
import { AGREEMENT_LABEL, type Employee, type PayAgreement } from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"

const AGREEMENTS = (Object.keys(AGREEMENT_LABEL) as PayAgreement[]).map((value) => ({
  value,
  label: AGREEMENT_LABEL[value],
}))

const AMOUNT_LABEL: Record<PayAgreement, string> = {
  fixed: "Monthly salary, kr",
  hourly: "Hourly rate, kr",
  commission: "Base salary, kr",
}

function long(month: string) {
  return monthLabel(month).split(" ")[0]
}

function lastDay(month: string) {
  return addDays(`${nextMonth(month)}-01`, -1)
}

/** A plain Select over a short list, the way the approve dialog does it. */
function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
  label,
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as T)} items={options}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const digits = (value: string) => Number(value.replace(/\D/g, "")) || 0

// ── New hire ──

export function AddHireDialog({
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
        {open ? <HireForm clientId={clientId} month={month} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function HireForm({ clientId, month, onDone }: { clientId: string; month: string; onDone: () => void }) {
  const { dispatch } = useAccounting()
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [agreement, setAgreement] = useState<PayAgreement>("hourly")
  const [amount, setAmount] = useState(0)
  const [start, setStart] = useState(`${month}-15`)
  const [hours, setHours] = useState(0)
  const startedThisMonth = start <= lastDay(month)
  // Starts after the month: no hours in its run. On our list now, in
  // Tripletex from the start date, details asked from the customer now.
  const paidLater = start > lastDay(month)

  function submit() {
    dispatch({
      type: "people",
      action: {
        type: "add_hire",
        clientId,
        month,
        name: name.trim(),
        role: role.trim() || "New employee",
        agreement,
        amount,
        start,
        hours: agreement === "hourly" && startedThisMonth ? hours : undefined,
      },
    })
    toast.success(`${name.trim()} added`, {
      description: paidLater
        ? `Starts ${dayLabel(start)}: created in Tripletex that day, details asked from the customer now.`
        : `A pay line in ${long(month)}'s run, flagged as new until the tax card and bank account are in.`,
    })
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a new hire</DialogTitle>
        <DialogDescription className="text-pretty">
          They get a pay line in {long(month)}&apos;s run, marked as new for you and for
          the customer when they approve the run.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="hire-name">Name</FieldLabel>
          <Input id="hire-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sofie Berg" />
        </Field>
        <Field>
          <FieldLabel htmlFor="hire-role">Job</FieldLabel>
          <Input id="hire-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Barista" />
        </Field>
        <Field>
          <FieldLabel htmlFor="hire-agreement">Pay agreement</FieldLabel>
          <Choice id="hire-agreement" label="Pay agreement" value={agreement} options={AGREEMENTS} onChange={setAgreement} />
        </Field>
        <Field>
          <FieldLabel htmlFor="hire-amount">{AMOUNT_LABEL[agreement]}</FieldLabel>
          <Input
            id="hire-amount"
            inputMode="numeric"
            className="tabular-nums"
            value={amount ? String(amount) : ""}
            onChange={(e) => setAmount(digits(e.target.value))}
            placeholder={agreement === "hourly" ? "215" : "42000"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="hire-start">First working day</FieldLabel>
          <Input id="hire-start" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        {agreement === "hourly" && startedThisMonth ? (
          <Field>
            <FieldLabel htmlFor="hire-hours">Hours in {long(month)}</FieldLabel>
            <Input
              id="hire-hours"
              inputMode="numeric"
              className="tabular-nums"
              value={hours ? String(hours) : ""}
              onChange={(e) => setHours(digits(e.target.value))}
              placeholder="From the timesheet"
            />
          </Field>
        ) : null}
      </FieldGroup>
      <p className="text-muted-foreground text-xs text-pretty">
        {paidLater
          ? `Starting ${dayLabel(start)}, after ${long(month)}: on the employee list now, created in Tripletex on ${dayLabel(start)} (it bills from when the employee exists), and the customer is asked for the ID, bank account, address and e-mail right away.`
          : "We still need their tax deduction card and bank account number: the line asks for them."}
      </p>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!name.trim()}>
          <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
          {paidLater ? "Add to the employees" : "Add to the run"}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Leaving ──

export function LeavingDialog({
  employee,
  month,
  onOpenChange,
}: {
  employee: Employee | null
  month: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(employee)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {employee ? <LeavingForm employee={employee} month={month} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function LeavingForm({ employee, month, onDone }: { employee: Employee; month: string; onDone: () => void }) {
  const { dispatch } = useAccounting()
  const [end, setEnd] = useState(employee.end ?? lastDay(nextMonth(month)))
  const first = employee.name.split(" ")[0]

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: "people", action: { type: "mark_leaving", clientId: employee.clientId, employeeId: employee.id, end } })
        toast.success(`${first} is leaving ${dayLabel(end)}`, {
          description: "Their line in the run is flagged for the final pay.",
        })
        onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>{employee.name} is leaving</DialogTitle>
        <DialogDescription className="text-pretty">
          The final pay settles holiday pay (feriepenger) and any hours owed. We flag
          {` ${first}'s`} line in the run so it gets a proper look, and the A-melding
          ends the employment on the last day.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="leaving-end">Last working day</FieldLabel>
        <Input id="leaving-end" type="date" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit">
          <CalendarMinusIcon data-icon="inline-start" aria-hidden="true" />
          Mark as leaving
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Correction for an earlier month ──

const WHAT = ["Commission", "Overtime", "Salary", "Bonus"].map((w) => ({ value: w, label: w }))

export function CorrectionDialog({
  clientId,
  month,
  employees,
  preset,
  open,
  onOpenChange,
}: {
  clientId: string
  month: string
  employees: Employee[]
  preset?: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <CorrectionForm
            clientId={clientId}
            month={month}
            employees={employees}
            preset={preset}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CorrectionForm({
  clientId,
  month,
  employees,
  preset,
  onDone,
}: {
  clientId: string
  month: string
  employees: Employee[]
  preset?: Employee
  onDone: () => void
}) {
  const { dispatch } = useAccounting()
  // The months before the open one: closed, so the pay comes now.
  const earlier = MONTHS.filter((m) => m.id < month).map((m) => ({ value: m.id, label: m.label }))
  const people = employees.map((e) => ({ value: e.id, label: e.name }))
  const [employeeId, setEmployeeId] = useState(preset?.id ?? people[0]?.value ?? "")
  const [earnedIn, setEarnedIn] = useState(earlier.at(-1)?.value ?? month)
  const [what, setWhat] = useState(preset?.agreement === "commission" ? "Commission" : "Overtime")
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState("")
  const employee = employees.find((e) => e.id === employeeId)
  const earned = long(earnedIn)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!employee || !amount) return
        dispatch({
          type: "people",
          action: { type: "add_correction", clientId, month, employeeId, earnedIn, what, amount, note },
        })
        toast.success(`${what} for ${earned} added to ${long(month)}'s run`, {
          description: `Booked back to ${earned} through 2980 and reported in ${long(nextMonth(month))}'s A-melding.`,
        })
        onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>Correction for an earlier month</DialogTitle>
        <DialogDescription className="text-pretty">
          Pay that belonged in a closed month. It&apos;s paid in {long(month)}&apos;s run as its
          own line and reported in that month&apos;s A-melding; the cost is booked back to
          the month it was earned.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="correction-employee">Employee</FieldLabel>
          <Choice id="correction-employee" label="Employee" value={employeeId} options={people} onChange={setEmployeeId} />
        </Field>
        <Field>
          <FieldLabel htmlFor="correction-month">Earned in</FieldLabel>
          <Choice id="correction-month" label="Earned in" value={earnedIn} options={earlier} onChange={setEarnedIn} />
        </Field>
        <Field>
          <FieldLabel htmlFor="correction-what">What</FieldLabel>
          <Choice id="correction-what" label="What" value={what} options={WHAT} onChange={setWhat} />
        </Field>
        <Field>
          <FieldLabel htmlFor="correction-amount">Amount, kr</FieldLabel>
          <Input
            id="correction-amount"
            inputMode="numeric"
            className="tabular-nums"
            value={amount ? String(amount) : ""}
            onChange={(e) => setAmount(digits(e.target.value))}
            placeholder="6400"
          />
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="correction-note">Why</FieldLabel>
        <Textarea
          id="correction-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`A deal signed 31 ${monthLabel(earnedIn).slice(0, 3)} wasn't in the CRM export for ${earned}'s run`}
          className="min-h-14 resize-none"
        />
        <FieldDescription>Goes in the line&apos;s trail, and the customer sees it when they approve the run.</FieldDescription>
      </Field>
      <div className="bg-muted/40 text-muted-foreground flex flex-col gap-1 rounded-lg border p-3 text-xs">
        <span className="text-foreground font-medium">
          {what} for {earned}, paid now{amount ? ` · ${new Intl.NumberFormat("nb-NO").format(amount)} kr` : ""}
        </span>
        <span>Booked back to {earned}: Dr 5000 / Cr 2980 accrued salary, reversed when it is paid.</span>
        <span>Reported in {long(nextMonth(month))}&apos;s A-melding, with the date it is paid.</span>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!employee || !amount}>
          <HistoryIcon data-icon="inline-start" aria-hidden="true" />
          Add to the run
        </Button>
      </DialogFooter>
    </form>
  )
}
