"use client"

// How we work together. Who does what (the division of work the engagement
// agreement has to contain) is drafted before the offer by sales or the
// accountant and goes out with it: signing the offer agrees to it, and a
// change after that goes back to the customer to confirm. Setup's first
// meeting adds which suppliers they approve from now on (read from the
// SAF-T) and which pay agreements they confirm. All of it carries over to
// the client at hand-over. The customer's side, `RoutinesReview`, is here
// too.
import { useState, type ReactNode } from "react"
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
  BuildingIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  caseEmployees,
  caseRoutines,
  caseSuppliers,
  company,
  formatDay,
  formatKr,
  routineWarnings,
  type OnboardingCase,
  type OnboardingEmployee,
  type Routine,
} from "@/lib/accounting/onboarding"
import {
  CADENCE_KINDS,
  cadenceKind,
  cadenceLabel,
  cadenceOfKind,
  EVENT_SUGGESTIONS,
  MONTH_NAMES,
  WEEKDAYS,
  type Cadence,
  type CadenceKind,
} from "@/lib/accounting/routines"
import { useAccounting } from "@/lib/accounting/store"

const PAY_LABEL: Record<OnboardingEmployee["pay"], string> = {
  fixed: "Fixed",
  hourly: "Hourly",
  commission: "Commission",
}

export function payText(e: Pick<OnboardingEmployee, "pay" | "amount">) {
  if (e.pay === "hourly") return `${formatKr(e.amount)} an hour`
  if (e.pay === "commission") return `${formatKr(e.amount)} base + commission`
  return `${formatKr(e.amount)} a month`
}

function SectionHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-px px-1">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      <p className="text-muted-foreground text-xs text-pretty">{description}</p>
    </div>
  )
}

// ── Suppliers ──

function SuppliersCard({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  const { dispatch } = useAccounting()
  const suppliers = caseSuppliers(c)
  const approved = suppliers.filter((s) => s.preApproved).length
  const first = company(c).contact.name.split(" ")[0]

  function set(name: string | undefined, on: boolean) {
    dispatch({ type: "onboarding", action: { type: "pre_approve_supplier", caseId: c.id, name, on } })
  }

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Suppliers from the SAF-T</FrameTitle>
          <FrameDescription className="text-xs">
            {suppliers.length} paid last year · {approved ? `${approved} approved from now on` : "none approved yet"}
          </FrameDescription>
        </div>
        {readOnly ? null : (
          <Button size="sm" variant="outline" onClick={() => set(undefined, approved < suppliers.length)}>
            {approved < suppliers.length ? "Approve all" : "Clear all"}
          </Button>
        )}
      </FrameHeader>
      <FramePanel className="p-0">
        <ul className="divide-y">
          {suppliers.map((s) => (
            <li key={s.name}>
              <label
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 @xl/main:grid-cols-[auto_minmax(0,1fr)_7rem_7rem]",
                  !readOnly && "hover:bg-muted/40 cursor-pointer transition-colors duration-150"
                )}
              >
                <Switch
                  size="sm"
                  checked={s.preApproved}
                  disabled={readOnly}
                  onCheckedChange={(on) => set(s.name, on)}
                  aria-label={`Approve ${s.name} from now on`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-sm font-medium">{s.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {s.account}
                    <span className="@xl/main:hidden"> · {s.cadence}</span>
                  </span>
                </span>
                <span className="text-muted-foreground hidden text-xs @xl/main:block">{s.cadence}</span>
                <span className="text-foreground text-right text-sm tabular-nums">{formatKr(s.yearly)}</span>
              </label>
            </li>
          ))}
        </ul>
      </FramePanel>
      <FrameFooter>
        <p className="text-muted-foreground text-xs text-pretty">
          Go through the list with {first}. An approved supplier skips the weekly approval list unless something stands
          out: an amount far from last year&apos;s, a large one-off, or a price other customers don&apos;t pay.
        </p>
      </FrameFooter>
    </Frame>
  )
}

// ── Employees ──

function EmployeesCard({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  const { dispatch } = useAccounting()
  const employees = caseEmployees(c)
  if (!employees.length) return null
  const confirmed = employees.filter((e) => e.preApproved).length
  const more = company(c).employees - employees.length

  function set(name: string | undefined, on: boolean) {
    dispatch({ type: "onboarding", action: { type: "pre_approve_employee", caseId: c.id, name, on } })
  }

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Employees and pay agreements</FrameTitle>
          <FrameDescription className="text-xs">
            {company(c).employees} on the last a-melding · {confirmed ? `${confirmed} confirmed` : "none confirmed yet"}
          </FrameDescription>
        </div>
        {readOnly ? null : (
          <Button size="sm" variant="outline" onClick={() => set(undefined, confirmed < employees.length)}>
            {confirmed < employees.length ? "Confirm all" : "Clear all"}
          </Button>
        )}
      </FrameHeader>
      <FramePanel className="p-0">
        <ul className="divide-y">
          {employees.map((e) => (
            <li key={e.name}>
              <label
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2",
                  !readOnly && "hover:bg-muted/40 cursor-pointer transition-colors duration-150"
                )}
              >
                <Switch
                  size="sm"
                  checked={e.preApproved}
                  disabled={readOnly}
                  onCheckedChange={(on) => set(e.name, on)}
                  aria-label={`Confirm ${e.name}'s pay agreement`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-sm font-medium">{e.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{e.role}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <Badge variant="outline" size="sm">
                    {PAY_LABEL[e.pay]}
                  </Badge>
                  <span className="text-foreground text-xs tabular-nums">{payText(e)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </FramePanel>
      <FrameFooter>
        <p className="text-muted-foreground text-xs text-pretty">
          A confirmed agreement is &ldquo;same as always&rdquo; in the pay run. New people, changes and spikes still
          come back to the customer.{more > 0 ? ` ${more} more come in with the first pay run.` : ""}
        </p>
      </FrameFooter>
    </Frame>
  )
}

// ── Who does what ──

/** The lists differ: a line added, removed or changed. */
function sameRoutines(a: Routine[], b: Routine[]) {
  const key = (r: Routine) => `${r.id}|${r.who}|${r.task}|${r.when ?? ""}`
  return a.length === b.length && a.every((r, i) => key(r) === key(b[i]))
}

/** Who does what changed after this offer version went out, so it isn't
    what they would sign. */
export function offerOutdated(c: OnboardingCase) {
  const offer = c.offer
  return Boolean(offer && offer.status !== "accepted" && offer.routines && !sameRoutines(offer.routines, caseRoutines(c)))
}

/** Where the customer's agreement stands: in the offer, signed, or a change
    since then waiting on them (the "Who does what" task). */
function routinesStatus(c: OnboardingCase) {
  const task = c.tasks.find((t) => t.id === `${c.id}:routines`)
  const first = company(c).contact.name.split(" ")[0]
  const offer = c.offer
  if (!offer) return "Goes out with the offer"
  if (offer.status !== "accepted") {
    return offer.routines && !sameRoutines(offer.routines, caseRoutines(c))
      ? `Changed since offer v${offer.version} · send a new version so ${first} signs this one`
      : `In offer v${offer.version} · ${first} agrees to it by signing`
  }
  if (!task) return `Signed by ${first} ${formatDay(offer.acceptedAt!)}`
  if (task.status === "done" && task.answer) return `Confirmed by ${first} ${formatDay(task.answer.at)}`
  if (task.status === "done") return `Settled ${formatDay(task.settled!.at)}`
  if (task.status === "answered") return `${first} answered ${formatDay(task.answer!.at)} · review it in the checklist`
  if (task.status === "with_customer") return `Sent to ${first} ${formatDay(task.ask!.sentAt!)} to confirm`
  return `Changed since ${first} signed · send it from the checklist`
}

/** The day of the month, kept within 1–28 so it exists every month. */
function DayInput({ value, onChange, label }: { value: number; onChange: (day: number) => void; label: string }) {
  return (
    <Input
      type="number"
      min={1}
      max={28}
      value={value}
      onChange={(e) => onChange(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
      aria-label={label}
      className="h-8 w-16 text-sm tabular-nums"
    />
  )
}

/** When a line comes round: a kind, and the day it falls on. "When it
    happens" lines take a few words instead, with the usual ones offered. */
function CadencePicker({ routine, onChange }: { routine: Routine; onChange: (cadence: Cadence) => void }) {
  const cadence: Cadence = routine.cadence ?? { every: "event", text: routine.when || "When it happens" }
  const kind = cadenceKind(cadence)
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full min-w-0 justify-start font-normal text-xs max-sm:order-3 max-sm:col-span-2"
            aria-label={`When: ${cadenceLabel(cadence)}`}
            title={cadenceLabel(cadence)}
          />
        }
      >
        <span className="truncate">{cadenceLabel(cadence)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <Select
          value={kind}
          items={CADENCE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
          onValueChange={(value) => value && onChange(cadenceOfKind(value as CadenceKind, cadence))}
        >
          <SelectTrigger className="w-full" aria-label="How often">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CADENCE_KINDS.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cadence.every === "week" ? (
          <Select
            value={String(cadence.weekday)}
            items={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
            onValueChange={(value) => value && onChange({ every: "week", weekday: Number(value) })}
          >
            <SelectTrigger className="w-full" aria-label="Day of the week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d, i) => (
                <SelectItem key={d} value={String(i + 1)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : cadence.every === "vat_term" ? (
          <p className="text-muted-foreground text-xs text-pretty">
            Follows their VAT term and its deadlines: the 10th of the month after each term, 31 August for May–June.
          </p>
        ) : cadence.every === "month" ? (
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            By the
            <DayInput value={cadence.day} onChange={(day) => onChange({ ...cadence, day })} label="Day of the month" />
            of the month
          </label>
        ) : cadence.every === "year" ? (
          <div className="flex items-center gap-2">
            <DayInput value={cadence.day} onChange={(day) => onChange({ ...cadence, day })} label="Day" />
            <Select
              value={String(cadence.month)}
              items={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
              onValueChange={(value) => value && onChange({ ...cadence, month: Number(value) })}
            >
              <SelectTrigger className="min-w-0 flex-1" aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              value={cadence.text}
              onChange={(e) => onChange({ every: "event", text: e.target.value })}
              placeholder="When it happens"
              aria-label="When"
              className="h-8 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {EVENT_SUGGESTIONS.filter((text) => text !== cadence.text).map((text) => (
                <Button
                  key={text}
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => onChange({ every: "event", text })}
                >
                  {text}
                </Button>
              ))}
            </div>
          </div>
        )}
        <p className="text-muted-foreground text-xs text-pretty">
          {routine.who === "customer"
            ? "The customer gets a nudge in their app when it's due."
            : routine.id === "report"
              ? "We get a reminder when it's due. This day is also when the month's close is due."
              : "We get a reminder when it's due."}
        </p>
      </PopoverContent>
    </Popover>
  )
}

function RoutineRow({
  c,
  routine,
  editing,
}: {
  c: OnboardingCase
  routine: Routine
  editing: boolean
}) {
  const { dispatch } = useAccounting()
  const patch = (p: Partial<Omit<Routine, "id">>) =>
    dispatch({ type: "onboarding", action: { type: "update_routine", caseId: c.id, routineId: routine.id, patch: p } })

  if (!editing)
    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2">
        <span className="text-foreground min-w-0 text-sm text-pretty">{routine.task || "—"}</span>
        <span className="text-muted-foreground text-right text-xs">{routine.when}</span>
      </li>
    )

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_13rem_auto] items-center gap-2 px-3 py-1.5 max-sm:grid-cols-[minmax(0,1fr)_auto]">
      <Input
        value={routine.task}
        onChange={(e) => patch({ task: e.target.value })}
        placeholder="What needs doing"
        aria-label="Task"
        className="h-8 text-sm"
      />
      <CadencePicker routine={routine} onChange={(cadence) => patch({ cadence, when: cadenceLabel(cadence) })} />
      <span className="flex items-center gap-0.5">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={routine.who === "customer" ? "Move to Sanna" : "Move to the customer"}
          title={routine.who === "customer" ? "Move to Sanna" : "Move to the customer"}
          onClick={() => patch({ who: routine.who === "customer" ? "firm" : "customer" })}
        >
          {routine.who === "customer" ? <BuildingIcon aria-hidden="true" /> : <UserIcon aria-hidden="true" />}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Remove"
          onClick={() =>
            dispatch({ type: "onboarding", action: { type: "remove_routine", caseId: c.id, routineId: routine.id } })
          }
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </span>
    </li>
  )
}

export function RoutinesCard({
  c,
  readOnly,
  action,
}: {
  c: OnboardingCase
  readOnly: boolean
  /** Next to Edit: sending a new offer version once the list changed. */
  action?: ReactNode
}) {
  const { dispatch } = useAccounting()
  const [editing, setEditing] = useState(false)
  const routines = caseRoutines(c)
  const co = company(c)
  const status = routinesStatus(c)
  const sides: { who: Routine["who"]; label: string }[] = [
    { who: "customer", label: co.name },
    { who: "firm", label: "Sanna" },
  ]
  const isEditing = editing && !readOnly
  const warnings = readOnly ? [] : routineWarnings(c)

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Who does what</FrameTitle>
          <FrameDescription className="text-xs">
            Part of the engagement agreement{status ? ` · ${status}` : ""}
          </FrameDescription>
        </div>
        {readOnly ? null : isEditing ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dispatch({ type: "onboarding", action: { type: "reset_routines", caseId: c.id } })}
            >
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Our template
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
              Done
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {action}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" aria-hidden="true" />
              Edit
            </Button>
          </div>
        )}
      </FrameHeader>
      {warnings.length ? (
        <FramePanel className="bg-warning/5 flex flex-col gap-1 py-2">
          {warnings.map((w) => (
            <p key={w} className="text-warning-text text-xs text-pretty">
              {w}
            </p>
          ))}
        </FramePanel>
      ) : null}
      {sides.map(({ who, label }) => {
        const rows = routines.filter((r) => r.who === who)
        return (
          <FramePanel key={who} className="p-0">
            <div className="text-muted-foreground bg-muted/30 flex items-center gap-2 border-b px-3 py-1.5 text-xs font-medium">
              {who === "customer" ? (
                <UserIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <BuildingIcon className="size-3.5" aria-hidden="true" />
              )}
              {label}
              <span className="tabular-nums">· {rows.length}</span>
            </div>
            <ul className="divide-y">
              {rows.map((routine) => (
                <RoutineRow key={routine.id} c={c} routine={routine} editing={isEditing} />
              ))}
            </ul>
            {isEditing ? (
              <div className="border-t px-1.5 py-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => dispatch({ type: "onboarding", action: { type: "add_routine", caseId: c.id, who } })}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Add for {who === "customer" ? co.contact.name.split(" ")[0] : "Sanna"}
                </Button>
              </div>
            ) : null}
          </FramePanel>
        )
      })}
    </Frame>
  )
}

/** Setup's "how we work together": the three lists from the first meeting. */
export function WorkingTogether({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="How we work together"
        description="Go through these in the first meeting. Who does what was signed with the offer; a change goes back to them to confirm. All of it stays with the client after hand-over."
      />
      <RoutinesCard c={c} readOnly={readOnly} />
      <SuppliersCard c={c} readOnly={readOnly} />
      <EmployeesCard c={c} readOnly={readOnly} />
    </div>
  )
}

// ── The customer's side ──

/** On the onboarding link: the division of work to confirm, with the
    suppliers they approved in the meeting. One tap if it's right, a note if
    not. */
/** A line of theirs as they read it: "Sends supplier invoices…" becomes
    "Send supplier invoices…". Lines that start with a name stay. */
export function asYou(task: string) {
  const [first, ...rest] = task.split(" ")
  if (!/^[A-Z][a-z]+s$/.test(first) || !rest.length) return task
  const base = first.endsWith("ies") ? `${first.slice(0, -3)}y` : first.endsWith("ches") || first.endsWith("shes") ? first.slice(0, -2) : first.slice(0, -1)
  return [base, ...rest].join(" ")
}

/** The division of work as the customer reads it: theirs, then ours. */
export function RoutinesList({ routines }: { routines: Routine[] }) {
  const sides: { who: Routine["who"]; label: string }[] = [
    { who: "customer", label: "You" },
    { who: "firm", label: "Sanna" },
  ]
  return (
    <div className="flex flex-col gap-4">
      {sides.map(({ who, label }) => (
        <div key={who} className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          <ul className="flex flex-col rounded-lg border">
            {routines
              .filter((r) => r.who === who && r.task)
              .map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                  <span className="text-foreground min-w-0 text-sm text-pretty">{who === "customer" ? asYou(r.task) : r.task}</span>
                  <span className="text-muted-foreground shrink-0 text-right text-xs">{r.when}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function RoutinesReview({
  c,
  onSend,
}: {
  c: OnboardingCase
  onSend: (text: string) => void
}) {
  const routines = caseRoutines(c)
  const suppliers = caseSuppliers(c).filter((s) => s.preApproved)
  const employees = caseEmployees(c).filter((e) => e.preApproved)
  const [changing, setChanging] = useState(false)
  const [note, setNote] = useState("")

  return (
    <div className="flex flex-col gap-4">
      <RoutinesList routines={routines} />
      {suppliers.length || employees.length ? (
        <p className="text-muted-foreground text-sm text-pretty">
          {suppliers.length ? (
            <>
              Approved from now on, as we agreed:{" "}
              <span className="text-foreground">{suppliers.map((s) => s.name).join(", ")}</span>. They only come back to
              you if something looks off.
            </>
          ) : null}
          {employees.length
            ? ` ${employees.length} pay ${employees.length === 1 ? "agreement" : "agreements"} confirmed as they are.`
            : null}
        </p>
      ) : null}
      {changing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should be different?"
            aria-label="What should be different"
            className="min-h-20 resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!note.trim()} onClick={() => onSend(`Change: ${note.trim()}`)}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setChanging(true)}>
            Suggest a change
          </Button>
          <Button type="button" onClick={() => onSend("Looks right.")}>
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            Looks right
          </Button>
        </div>
      )}
    </div>
  )
}
