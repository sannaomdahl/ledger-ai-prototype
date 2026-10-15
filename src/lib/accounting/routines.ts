// Who does what: the division of work the engagement agreement has to spell
// out (GRFS asks for it). One template sales or the accountant starts from
// before the offer, that goes into the agreement the company signs, and
// that stays on the client after hand-over. Every line's "when" is a
// cadence, not free text, so the system knows when to remind whoever owns
// it; `when` is its label, kept on the line for everything that reads it.
// Kept free of other imports so the seed data can use it at load time.
import type { Routine } from "./onboarding"

export type RoutineShape = {
  /** They have employees, so the pay loop is part of the work. */
  payroll: boolean
  /** We send their invoices to their customers. */
  invoicing?: boolean
  vatTerm: "Bi-monthly" | "Annual"
  /** Day of the month salaries are paid. */
  payDay?: number
  /** Varies the template a little between clients, so they don't all read
      the same. Any number; only its remainder is used. */
  variant?: number
}

/** When a line of the division of work comes round. */
export type Cadence =
  /** 1 is Monday, 5 is Friday. */
  | { every: "week"; weekday: number }
  /** By this day of the month; every month, every second month or every
      quarter. */
  | { every: "month"; day: number; months?: 1 | 2 | 3 }
  /** By each VAT term's own deadline, whatever the client's term is: the
      10th of the month after it, 31 August for May–June. (Earlier builds
      kept a day here; it isn't used.) */
  | { every: "vat_term"; day?: number }
  | { every: "year"; month: number; day: number }
  /** No date: it happens when something else does ("As they arrive"). */
  | { every: "event"; text: string }

export type CadenceKind = Cadence["every"] | "month2" | "quarter"

export const CADENCE_KINDS: { id: CadenceKind; label: string }[] = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "month2", label: "Every 2nd month" },
  { id: "quarter", label: "Quarterly" },
  { id: "vat_term", label: "Each VAT term" },
  { id: "year", label: "Yearly" },
  { id: "event", label: "When it happens" },
]

/** Lines that follow something else rather than the calendar: the
    suggestions offered for "When it happens". */
export const EVENT_SUGGESTIONS = [
  "As they arrive",
  "When it happens",
  "The same day",
  "By the due date",
  "Before each pay run",
  "Before their first or last day",
]

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function cadenceKind(c: Cadence): CadenceKind {
  if (c.every === "month" && c.months === 2) return "month2"
  if (c.every === "month" && c.months === 3) return "quarter"
  return c.every
}

/** A cadence of another kind, keeping the day where it carries over. */
export function cadenceOfKind(kind: CadenceKind, from?: Cadence): Cadence {
  const day = from && "day" in from && from.day ? from.day : 10
  switch (kind) {
    case "week":
      return { every: "week", weekday: from?.every === "week" ? from.weekday : 1 }
    case "month":
      return { every: "month", day }
    case "month2":
      return { every: "month", day, months: 2 }
    case "quarter":
      return { every: "month", day, months: 3 }
    case "vat_term":
      return { every: "vat_term" }
    case "year":
      return { every: "year", month: from?.every === "year" ? from.month : 5, day: from?.every === "year" ? from.day : 31 }
    case "event":
      return { every: "event", text: from?.every === "event" ? from.text : EVENT_SUGGESTIONS[1] }
  }
}

/** "Every Monday", "Monthly, by the 10th", "Yearly, by 31 May". */
export function cadenceLabel(c: Cadence): string {
  switch (c.every) {
    case "week":
      return `Every ${WEEKDAYS[c.weekday - 1] ?? "Monday"}`
    case "month":
      return `${c.months === 2 ? "Every 2nd month" : c.months === 3 ? "Quarterly" : "Monthly"}, by the ${ordinal(c.day)}`
    case "vat_term":
      return "Each VAT term, by the deadline"
    case "year":
      return `Yearly, by ${c.day} ${MONTH_NAMES[c.month - 1]?.slice(0, 3) ?? ""}`.trim()
    case "event":
      return c.text
  }
}

/** A line with its cadence and the label everything else reads. */
function line(r: Omit<Routine, "when">, cadence: Cadence): Routine {
  return { ...r, cadence, when: cadenceLabel(cadence) }
}

/** The day of the month a monthly firm line falls on, if it has one: the
    report's day is when the month's close is due. */
export function routineDay(routines: Routine[] | undefined, id: string) {
  const cadence = routines?.find((r) => r.id === id)?.cadence
  return cadence?.every === "month" && (cadence.months ?? 1) === 1 ? cadence.day : undefined
}

export const ROUTINE_AREA_LABEL: Record<Routine["area"], string> = {
  bookkeeping: "Bookkeeping",
  payroll: "Payroll",
  reporting: "Reporting",
  general: "General",
}

/** The default division of work, in the order a month runs. Ids are stable
    keys, so an edited row keeps its place. Reconciliation is three lines,
    each on its own clock: the bank every month, VAT before each return and
    the trial balance once a year. */
export function defaultRoutines(shape: RoutineShape): Routine[] {
  const v = Math.abs(shape.variant ?? 0)
  const payDay = shape.payDay ?? 25
  const cutoff = Math.max(payDay - 10, 1)
  const send = [
    "Sends supplier invoices to the Tripletex inbox (EHF or e-mail)",
    "Sends supplier invoices to the Tripletex inbox and forwards any that arrive by post",
    "Makes sure suppliers send EHF; forwards PDF invoices to the inbox",
  ][v % 3]
  const receipts: [string, Cadence] = (
    [
      ["Uploads card receipts in the customer app", { every: "week", weekday: 5 }],
      ["Snaps card and Vipps receipts in the customer app", { every: "event", text: "The same day" }],
      ["Uploads receipts for card purchases", { every: "week", weekday: 5 }],
    ] satisfies [string, Cadence][]
  )[v % 3]
  const report = [10, 12, 10][v % 3]
  const annualVat = shape.vatTerm === "Annual"

  return [
    line({ id: "send-invoices", area: "bookkeeping", who: "customer", task: send }, { every: "event", text: "As they arrive" }),
    line({ id: "receipts", area: "bookkeeping", who: "customer", task: receipts[0] }, receipts[1]),
    line(
      { id: "approve-invoices", area: "bookkeeping", who: "customer", task: "Approves booked supplier invoices before they are paid" },
      { every: "week", weekday: 2 }
    ),
    line(
      { id: "pay-invoices", area: "bookkeeping", who: "customer", task: "Pays approved invoices in the online bank" },
      { every: "event", text: "By the due date" }
    ),
    line({ id: "book", area: "bookkeeping", who: "firm", task: "Books invoices, receipts and bank lines" }, { every: "week", weekday: 5 }),
    line({ id: "approval-list", area: "bookkeeping", who: "firm", task: "Sends the list of invoices to approve" }, { every: "week", weekday: 1 }),
    ...(shape.payroll
      ? [
          line(
            {
              id: "checkin",
              area: "payroll",
              who: "customer",
              task: "Answers the pay check-in: hires, leavers, holidays, sick leave and overtime",
            },
            { every: "month", day: cutoff }
          ),
          line(
            { id: "hires", area: "payroll", who: "customer", task: "Tells us about new hires and leavers, with contracts" },
            { every: "event", text: "Before their first or last day" }
          ),
          line(
            { id: "approve-pay", area: "payroll", who: "customer", task: "Approves the pay run" },
            { every: "month", day: Math.max(payDay - 5, 1) }
          ),
          line(
            { id: "run-payroll", area: "payroll", who: "firm", task: "Runs payroll and sends the payment file to the bank" },
            { every: "month", day: payDay }
          ),
          line({ id: "a-melding", area: "payroll", who: "firm", task: "Files the a-melding" }, { every: "month", day: 5 }),
        ]
      : []),
    ...(shape.invoicing ? invoicingLines() : []),
    line(
      { id: "vat", area: "reporting", who: "firm", task: annualVat ? "Files the annual VAT return" : "Files the VAT return" },
      annualVat ? { every: "year", month: 3, day: 10 } : { every: "vat_term" }
    ),
    line({ id: "reconcile", area: "reporting", who: "firm", task: "Reconciles the bank accounts" }, { every: "month", day: report }),
    line(
      { id: "reconcile-vat", area: "reporting", who: "firm", task: "Reconciles VAT against the ledger before each return" },
      annualVat ? { every: "year", month: 3, day: 1 } : { every: "vat_term" }
    ),
    line({ id: "report", area: "reporting", who: "firm", task: "Sends the monthly report" }, { every: "month", day: report }),
    line(
      {
        id: "changes",
        area: "general",
        who: "customer",
        task: "Tells us about new contracts, loans, investments or changes in the business",
      },
      { every: "event", text: "When it happens" }
    ),
    line(
      { id: "reconcile-year", area: "reporting", who: "firm", task: "Reconciles every balance sheet account for the year end" },
      { every: "year", month: 3, day: 31 }
    ),
    line({ id: "annual", area: "reporting", who: "firm", task: "Prepares the annual accounts and tax return" }, { every: "year", month: 5, day: 31 }),
  ]
}

/** When we invoice their customers for them: they say what to bill, we
    send it and follow up what's unpaid. */
export function invoicingLines(): Routine[] {
  return [
    line(
      { id: "invoice-basis", area: "bookkeeping", who: "customer", task: "Tells us what to invoice: hours, materials and agreed prices" },
      { every: "week", weekday: 5 }
    ),
    line(
      { id: "send-sales-invoices", area: "bookkeeping", who: "firm", task: "Sends invoices to their customers from Tripletex" },
      { every: "week", weekday: 1 }
    ),
    line(
      { id: "dunning", area: "bookkeeping", who: "firm", task: "Sends reminders on unpaid customer invoices" },
      { every: "month", day: 15 }
    ),
  ]
}

export function ordinal(n: number) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
