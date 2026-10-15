// What each client owes the authorities (and its staff) for a working month,
// and what in the queue stands in the way. Derived from the store, never
// stored, so a booking in the panel moves a deadline from blocked to ready.
import { addDays, bankingDayOnOrBefore, dayLabel, hasFilings, MONTHS, monthName, nextMonth, TODAY } from "./data"
import { formatAmount } from "./format"
import { getMonthClose } from "./month-close"
import { isWorkable, monthStatus } from "./periods"
import { aMeldingFilings, getPayroll } from "./payroll"
import { getPayLoop, type PeopleState } from "./people"
import { ordinal, routineDay } from "./routines"
import { NO_SIGNOFFS, type Signoffs } from "./signoffs"
import type { Client, CustomerRequest, ReviewItem } from "./types"

export type DeadlineKind = "a-melding" | "mva" | "close" | "payrun" | "payday"

export type DeadlineStatus = "done" | "ready" | "blocked" | "upcoming"

export type Deadline = {
  id: string
  clientId: string
  kind: DeadlineKind
  /** ISO date, used for sorting and grouping. */
  date: string
  title: string
  status: DeadlineStatus
  /** One line: what is left, or when it was done. */
  detail: string
  href: string
  blockers: { review: number; waiting: number; drafts: number }
}

// The demo's today lives with the seed data, which is built around it.
export { TODAY }

function prevMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

function day(period: string, d: number) {
  return `${period}-${String(d).padStart(2, "0")}`
}

export function formatDeadlineDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso))
}

export function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - new Date(TODAY).getTime()
  return Math.round(ms / 86_400_000)
}

export function getClientDeadlines(
  client: Client,
  month: string,
  items: ReviewItem[],
  requests: CustomerRequest[],
  signed: Signoffs & { people?: PeopleState } = NO_SIGNOFFS
): Deadline[] {
  const meta = MONTHS.find((m) => m.id === month)
  // A month before a new client's takeover was someone else's to file. From
  // the open month, what's ahead is their first month with us.
  if (client.since && month < client.since)
    return meta?.status === "open" ? firstMonthDeadlines(client, client.since) : []
  const close = getMonthClose({ ...signed, items, requests }, client.id, month)
  // The month as it stands now (reopened, or closed by the accountant), not
  // as the seed started it.
  const open = isWorkable(monthStatus(client.id, month, signed))
  const next = nextMonth(month)
  const base = `/clients/${client.id}`
  // Pay lines left out of the month block nothing.
  const own = items.filter(
    (i) => i.clientId === client.id && i.period === month && !i.skipped
  )
  const count = (domain: ReviewItem["domain"]) => {
    const scoped = own.filter((i) => i.domain === domain)
    return {
      review: scoped.filter(
        (i) => i.status === "needs_review" || i.status === "customer_replied"
      ).length,
      waiting: scoped.filter((i) => i.status === "waiting_customer").length,
      drafts: requests.filter(
        (r) =>
          r.clientId === client.id &&
          r.domain === domain &&
          r.period === month &&
          r.status === "draft"
      ).length,
      total: scoped.length,
    }
  }
  const bk = count("bookkeeping")
  const pr = count("payroll")
  const hasPayroll = pr.total > 0
  const filings = hasFilings(client.id)
  const payDay = Number(client.payDate.split(" ")[0])

  const left = (c: typeof bk, noun: string) => {
    const parts = [
      c.review
        ? `${c.review} ${c.review === 1 ? noun.replace(/s$/, "") : noun} to review`
        : "",
      c.waiting ? `${c.waiting} with the customer` : "",
      c.drafts
        ? `${c.drafts} ${c.drafts === 1 ? "question" : "questions"} to decide`
        : "",
    ].filter(Boolean)
    return parts.join(" · ")
  }

  const deadlines: Deadline[] = []

  // The A-melding for the pay that goes out this month (last month's
  // hours), due the 5th of next month. It is a filing of its own.
  const aMelding = filings
    ? aMeldingFilings(client, items, signed).find((f) => f.id === `${client.id}-amelding-${month}`)
    : undefined
  if (aMelding) {
    deadlines.push({
      id: `${client.id}-${month}-amelding`,
      clientId: client.id,
      kind: "a-melding",
      date: aMelding.due,
      // The pay it reports went out this month, for last month's hours:
      // both said, so nobody has to work out which month is meant.
      title: `A-melding for ${monthName(month)} · ${monthName(
        `${month.slice(5) === "01" ? Number(month.slice(0, 4)) - 1 : month.slice(0, 4)}-${String(((Number(month.slice(5)) + 10) % 12) + 1).padStart(2, "0")}`
      ).slice(0, 3)} hours`,
      status:
        aMelding.status === "submitted"
          ? "done"
          : aMelding.status === "ready"
            ? aMelding.late
              ? "blocked"
              : "ready"
            : "upcoming",
      detail: aMelding.status === "ready" ? `Ready to submit · ${aMelding.detail}` : aMelding.detail,
      href: `${base}/filings`,
      blockers: { review: 0, waiting: 0, drafts: 0 },
    })
  }

  const bank = close.bank
  const closeStatus: DeadlineStatus = close.closed
    ? "done"
    : close.readyToSend
      ? "ready"
      : "blocked"
  deadlines.push({
    id: `${client.id}-${month}-close`,
    clientId: client.id,
    kind: "close",
    // The day the client was promised the monthly report, from who does what.
    date: day(next, routineDay(client.profile.routines, "report") ?? 10),
    title: `Close ${meta?.label ?? month}`,
    status: closeStatus,
    detail: close.closed
      ? `${bk.total} invoices and lines booked, bank reconciled, report sent`
      : close.readyToSend
        ? "Every step done, the report is ready to send"
        : left(bk, "lines") ||
          (bank.open.length
            ? `Bank differs from the ledger by ${formatAmount(Math.abs(bank.difference))}`
            : close.steps
                .filter((s) => !s.done)
                .map((s) => s.label.toLowerCase())
                .join(" · ")
                .replace(/^./, (c) => c.toUpperCase())),
    href: `${base}/report`,
    blockers: { review: bk.review, waiting: bk.waiting, drafts: bk.drafts },
  })

  if (filings && client.vatTerm === "Bi-monthly") {
    // Terms run Jan–Feb, Mar–Apr … and are due the 10th of the second month
    // after the term ends. An odd month opens a term, so the one due now is
    // the previous term, already closed; an even month ends the current term.
    const termStart = Number(month.slice(5)) % 2 === 1
    const from = termStart ? prevMonth(prevMonth(month)) : prevMonth(month)
    const to = termStart ? prevMonth(month) : month
    const blocked = !termStart && bk.review + bk.waiting > 0
    const term = Number(to.slice(5)) / 2
    const filed = Boolean(signed.progress.filings[`${client.id}-mva-${to.slice(0, 4)}-T${term}`])
    deadlines.push({
      id: `${client.id}-${month}-mva`,
      clientId: client.id,
      kind: "mva",
      date: day(termStart ? next : nextMonth(next), 10),
      title: `MVA-melding, ${monthName(from)}–${monthName(to)}`,
      status:
        !open || filed ? "done" : termStart ? "ready" : blocked ? "blocked" : "upcoming",
      detail: !open || filed
        ? "Submitted to Skatteetaten"
        : termStart
          ? "Both months closed, return drafted by the agent"
          : blocked
            ? "Drafted once this month is reconciled, filed before it closes"
            : "Drafted once the term ends",
      href: `${base}/filings`,
      blockers: termStart
        ? { review: 0, waiting: 0, drafts: 0 }
        : { review: bk.review, waiting: bk.waiting, drafts: 0 },
    })
  }

  if (hasPayroll) {
    const payroll = getPayroll(items, signed.progress, client.id, month, signed.closing)
    const loop = getPayLoop({ ...signed, items, requests }, client.id, month)
    const runs = payroll.runs.length
    const regularRun = payroll.runs.find((r) => r.seq === 1)
    const payDate = regularRun?.payDate ?? (loop.active ? loop.payDate : loop.regularPayDate)
    // Pay runs on its own clock: this month's hours are paid next month,
    // and stay open after this month's books close.
    const payOpen = !payroll.locked && !payroll.done
    deadlines.push({
      id: `${client.id}-${month}-payrun`,
      clientId: client.id,
      kind: "payrun",
      // From the payday it really has (a late answer moves it), so it
      // always comes after the customer's approve-by date (payday minus 6)
      // and before the payment file goes (two banking days before payday).
      date: bankingDayOnOrBefore(addDays(payDate, -3)),
      title: `Approve pay run for ${monthName(month)} hours`,
      // Approving the ready ones is never blocked by the rest, only by the
      // customer's check-in and approval.
      status: payroll.done
        ? "done"
        : payroll.ready.length && !loop.blocked
          ? "ready"
          : payroll.ready.length
            ? "blocked"
            : !payOpen
              ? "done"
              : pr.review + pr.waiting + pr.drafts > 0
                ? "blocked"
                : "ready",
      detail: payroll.locked
        ? `${payroll.paid.length} employees paid`
        : payroll.done
          ? runs > 1
            ? `${runs} runs approved, ${payroll.paid.length} employees paid`
            : "Approved, salary run created in Tripletex"
          : [
              runs ? `Run approved for ${payroll.paid.length}` : "",
              payroll.ready.length
                ? `${payroll.ready.length} ready for ${runs ? "a follow-up run" : "the run"}`
                : "",
              left(pr, "pay lines"),
              payroll.ready.length ? loop.blocked : "",
            ]
              .filter(Boolean)
              .join(" · "),
      href: `${base}/payroll`,
      blockers: { review: pr.review, waiting: pr.waiting, drafts: pr.drafts },
    })
    deadlines.push({
      id: `${client.id}-${month}-payday`,
      clientId: client.id,
      kind: "payday",
      date: payDate,
      title: "Payday",
      status: payDate > TODAY ? "upcoming" : "done",
      detail: payDate <= TODAY
        ? "Paid"
        : loop.late
          ? `Moved from ${dayLabel(loop.late.from)} because ${loop.late.reason}`
          : payDate < day(next, payDay)
            ? `The ${payDay}th is a weekend, so it goes out ${dayLabel(payDate)}`
            : "Payment file goes to DNB the day before",
      href: `${base}/payroll`,
      blockers: { review: 0, waiting: 0, drafts: 0 },
    })
  }

  return deadlines.sort((a, b) => a.date.localeCompare(b.date))
}

/** A client handed over from onboarding, before its first month opens:
    nothing is booked yet, so every date is simply ahead. The first payday
    after the takeover is ours, its a-melding and the month's close follow,
    and the VAT term it falls in is ours to file. */
function firstMonthDeadlines(client: Client, since: string): Deadline[] {
  const base = `/clients/${client.id}`
  const next = nextMonth(since)
  const payDay = Number(client.payDate.split(" ")[0]) || 25
  const payroll = client.profile.services.includes("Payroll")
  const none = { review: 0, waiting: 0, drafts: 0 }
  const entry = (kind: DeadlineKind, date: string, title: string, detail: string, href: string): Deadline => ({
    id: `${client.id}-${since}-${kind}`,
    clientId: client.id,
    kind,
    date,
    title,
    status: "upcoming",
    detail,
    href: `${base}/${href}`,
    blockers: none,
  })
  const out: Deadline[] = []
  if (payroll) {
    out.push(
      entry(
        "payrun",
        day(since, Math.max(payDay - 5, 1)),
        "Approve the first pay run with us",
        `The pay check-in goes out on the ${ordinal(Math.max(payDay - 10, 1))}; the run is built from the answer`,
        "payroll"
      ),
      entry("payday", day(since, payDay), "First payday", "Payment file goes to DNB the day before", "payroll"),
      entry("a-melding", day(next, 5), `A-melding for ${monthName(since)}`, "Our first a-melding for them", "payroll")
    )
  }
  out.push(
    entry(
      "close",
      day(next, 10),
      `Close ${monthName(since)}, the first month with us`,
      "Bookkeeping, reconciliation and the first monthly report",
      "report"
    )
  )
  if (hasFilings(client.id) && client.vatTerm === "Bi-monthly") {
    // The term the takeover month falls in; the months before it came from
    // the previous accountant's books.
    const odd = Number(since.slice(5)) % 2 === 1
    const from = odd ? since : prevMonth(since)
    const to = odd ? next : since
    out.push(
      entry(
        "mva",
        day(nextMonth(nextMonth(to)), 10),
        `MVA-melding, ${monthName(from)}–${monthName(to)}`,
        odd ? "Our first full VAT term" : `${monthName(from)} comes from the previous accountant's books`,
        "filings"
      )
    )
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
