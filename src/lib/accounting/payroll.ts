// A month's pay runs. The regular run pays everyone who is ready; whoever
// is held back (input missing, a question with the customer) is paid in a
// follow-up run as soon as they are ready, moved to next month's run, or
// left out. Each run is its own salary voucher and payment file, the way
// Fiken shows two September runs side by side. Derived from the store.
import {
  CLIENT_BY_ID,
  dayLabel,
  hash,
  MONTHS,
  monthLabel,
  monthName,
  nextBankingDay,
  nextMonth,
  payDates,
} from "./data"
import { TODAY } from "./deadlines"
import type { Filing } from "./filings"
import type { Closing } from "./report"
import { isMonthClosed, type Signoffs } from "./signoffs"
import type { Client, PayRun, Progress, ReviewItem } from "./types"

export function payRunKey(clientId: string, month: string, seq: number) {
  return `${clientId}:${month}:${seq}`
}

/** The client's pay day in the month after the hours. On a weekend it goes
    out the Friday before. */
export function regularPayDate(clientId: string, month: string) {
  return payDates(CLIENT_BY_ID.get(clientId)!, month).payDate
}

/** Money can't go out today or earlier: the first banking day after today. */
export function soonestPayDate() {
  return nextBankingDay(TODAY)
}

/** A follow-up run goes out with the regular pay day while that is still
    ahead, and otherwise on the next banking day: nobody waits a month. */
export function followUpPayDate(clientId: string, month: string) {
  const regular = regularPayDate(clientId, month)
  const soonest = soonestPayDate()
  return regular > soonest ? regular : soonest
}

/** A closed month paid in two runs before the demo starts: the shift
    lead's September hours came in late and went out
    in a follow-up run on 23 Oct. The October a-melding was built from the
    regular run only, which the payroll reconciliation finds. */
export const SEEDED_FOLLOW_UP = {
  clientId: "fjord-kaffebar",
  month: "2026-09",
  itemId: "fjord-kaffebar-pr-2026-09-1",
  payDate: "2026-10-23",
} as const

export type Payroll = {
  /** Paid before the data starts (a closed month in the seed). */
  closed: boolean
  /** Paid before the data starts, or the month it was paid in is closed:
      nothing here moves any more. */
  locked: boolean
  /** The month's pay lines, without the ones moved to next month. */
  lines: ReviewItem[]
  /** In an approved run. */
  paid: ReviewItem[]
  /** Approved one by one, waiting for a run. */
  ready: ReviewItem[]
  /** Not approved yet: in review, with the customer or snoozed. */
  open: ReviewItem[]
  /** Left out of this month's pay. */
  skipped: ReviewItem[]
  /** Moved from this month to next month's run. */
  moved: ReviewItem[]
  runs: PayRun[]
  /** The run that approving now would make. */
  nextSeq: number
  /** When that run would pay, before any late answers move it. */
  nextPayDate: string
  /** Every line paid or left out. */
  done: boolean
}

export function getPayroll(
  items: ReviewItem[],
  progress: Progress,
  clientId: string,
  month: string,
  closing: Closing = {}
): Payroll {
  const closed = MONTHS.find((m) => m.id === month)?.status === "closed"
  const own = items.filter((i) => i.clientId === clientId && i.domain === "payroll")
  const lines = own.filter((i) => i.period === month)
  const moved = own.filter((i) => i.movedFrom === month)
  let runs = Object.values(progress.payRuns)
    .filter((r) => r.clientId === clientId && r.month === month)
    .sort((a, b) => a.seq - b.seq)
  // Closed months were paid in one run before the data starts.
  if (closed && !runs.length && lines.length) {
    const payDate = regularPayDate(clientId, month)
    const seeded = SEEDED_FOLLOW_UP
    const late =
      seeded.clientId === clientId && seeded.month === month
        ? lines.filter((i) => i.id === seeded.itemId)
        : []
    const regular = lines.filter((i) => !late.includes(i))
    const run = (seq: number, paid: ReviewItem[], date: string): PayRun => ({
      clientId,
      month,
      seq,
      itemIds: paid.map((i) => i.id),
      gross: paid.reduce((sum, i) => sum + i.amount, 0),
      payDate: date,
      at: date,
      by: "",
    })
    runs = [run(1, regular, payDate), ...(late.length ? [run(2, late, seeded.payDate)] : [])]
  }
  const inRun = new Set(runs.flatMap((r) => r.itemIds))
  const left = lines.filter((i) => !inRun.has(i.id) && !i.skipped)
  const ready = left.filter((i) => i.status === "booked")
  const open = left.filter((i) => i.status !== "booked")
  const regular = regularPayDate(clientId, month)
  return {
    closed,
    // Pay closes with the month it is paid in: September's hours are paid
    // in October and stay open until October is closed.
    locked: closed || isMonthClosed(clientId, nextMonth(month), { closing }),
    lines,
    paid: lines.filter((i) => inRun.has(i.id)),
    ready,
    open,
    skipped: lines.filter((i) => i.skipped && !inRun.has(i.id)),
    moved,
    runs,
    nextSeq: runs.length + 1,
    nextPayDate: runs.length
      ? followUpPayDate(clientId, month)
      : closed
        ? regular
        : regular > soonestPayDate()
          ? regular
          : soonestPayDate(),
    done: lines.length > 0 && left.length === 0,
  }
}

/** The run a pay line went out in. */
export function runOf(runs: PayRun[], itemId: string) {
  return runs.find((r) => r.itemIds.includes(itemId))
}

/** What happens to an employee who isn't in the run being approved. */
export type PayHold = "follow_up" | "move" | "skip"

export const PAY_HOLD_LABEL: Record<PayHold, (month: string) => string> = {
  follow_up: () => "Follow-up run when ready",
  move: (month) => `Move to ${monthTitle(nextMonth(month))}'s run`,
  skip: () => "Don't pay this month",
}

function monthTitle(period: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long" }).format(
    new Date(`${period}-01T12:00:00`)
  )
}

// ── A-melding ──

/** Employer's NI (zone 1, 14.1%) on gross pay. */
export const AGA_RATE = 0.141

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

/** One A-melding per month with pay: the month the salaries are paid in,
    due the 5th of the month after. September's hours are paid in October,
    so they go in October's A-melding, due 5 November. Ready once the
    month's runs are approved; corrections for earlier months go in the
    A-melding of the month they are paid. */
export function aMeldingFilings(
  client: Client,
  items: ReviewItem[],
  signed: Signoffs & { people?: { corrections?: { itemId: string; earnedIn: string }[] } }
): Filing[] {
  const base = `/clients/${client.id}`
  const corrections = signed.people?.corrections ?? []
  return [...MONTHS]
    .reverse()
    .flatMap((meta) => {
      const hours = meta.id
      // Months before a new client's takeover were someone else's to report.
      if (client.since && hours < client.since) return []
      const payroll = getPayroll(items, signed.progress, client.id, hours, signed.closing)
      if (!payroll.lines.length) return []
      const paid = nextMonth(hours)
      const due = `${nextMonth(paid)}-05`
      const id = `${client.id}-amelding-${paid}`
      const stamp = signed.progress.filings[id]
      // Reported before the data starts, except a few of the October
      // ones (due 5 Nov) that wait on the accountant.
      const seededFiled =
        meta.status === "closed" &&
        (due < TODAY || !(client.id === "fjord-kaffebar" || hash(`${client.id}-am`) % 3 === 0))
      const counted = payroll.lines.filter((i) => !i.skipped)
      const gross = counted.reduce((sum, i) => sum + i.amount, 0)
      const people = new Set(counted.map((i) => i.title)).size
      const earlier = corrections.filter((c) => counted.some((i) => i.id === c.itemId))
      const status: Filing["status"] =
        stamp || seededFiled
          ? "submitted"
          : payroll.done
            ? "ready"
            : meta.status === "open"
              ? "in_progress"
              : "upcoming"
      const includes = earlier.length
        ? ` · includes ${earlier.map((c) => monthLabel(c.earnedIn).split(" ")[0]).join(", ")} paid now`
        : ""
      return [
        {
          id,
          clientId: client.id,
          kind: "a_melding",
          group: "payroll",
          name: "A-melding",
          period: `${monthLabel(paid)} · ${monthName(hours)} hours`,
          short: monthName(paid),
          due,
          status,
          late: status === "ready" && due < TODAY,
          detail:
            status === "submitted"
              ? stamp
                ? "Submitted to the a-ordningen through Altinn"
                : `Submitted ${dayLabel(`${nextMonth(paid)}-0${1 + (hash(id) % 4)}`)}`
              : status === "ready"
                ? `${people} ${people === 1 ? "employee" : "employees"}, ${nok.format(gross)} kr gross, employer's NI ${nok.format(Math.round(gross * AGA_RATE))} kr${includes}`
                : payroll.runs.length
                  ? `Regular run approved, ${payroll.open.length + payroll.ready.length} still to pay${includes}`
                  : `Built from ${monthLabel(hours).split(" ")[0]}'s pay runs once they're approved${includes}`,
          stamp,
          href: `${base}/payroll`,
        } satisfies Filing,
      ]
    })
}
