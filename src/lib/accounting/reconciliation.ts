// Bank reconciliation for one client and month, per bank account: every
// line on each DNB statement matched to what it pays, and each ledger
// account in Tripletex (1920 operating, 1921 card, 1950 tax withholding)
// against its statement. Invoices are booked on 2400 in Bookkeeping when
// they arrive; their payment here is a voucher from 2400 to 1920, whichever
// month the invoice was booked in. A card purchase already left 1921, so its
// receipt is booked straight against it. Salaries match themselves from the
// approved run's payment file. Derived from the store, never stored, so
// booking or matching a line moves the difference right away.
import { hash, MONTHS, monthName, OPEN_MONTH, paidFromAccount } from "./data"
import { getPayroll } from "./payroll"
import { figuresFor } from "./report"
import { isParked } from "./team"
import type {
  BankAccount,
  Client,
  Progress,
  ReconIssue,
  ReconResolution,
  ReviewItem,
} from "./types"

/** The ledger issues the agent found this month, all on 1920. Everything
    else in a difference is bank lines that aren't matched yet. */
export const RECON_ISSUES: ReconIssue[] = [
  {
    id: "recon-bolgen-hafslund",
    clientId: "bolgen-barnehage",
    period: OPEN_MONTH,
    kind: "duplicate",
    title: "Hafslund Strøm paid twice in the ledger",
    detail:
      "Voucher 2026-0398 registers the 10 Oct invoice as paid by hand, and the DNB payment on 23 Oct settles it again. 1920 is 3 412 kr too low and 2400 shows a debit balance for Hafslund.",
    date: "2026-10-10",
    ledgerEffect: -3412,
    voucherNo: "2026-0398",
  },
  {
    id: "recon-fjord-solberg",
    clientId: "fjord-kaffebar",
    period: OPEN_MONTH,
    kind: "in_transit",
    title: "Solberg & Hansen payment not through the bank yet",
    detail:
      "Sent from Tripletex and registered as paid on 29 Oct. DNB executes it on the due date, 2 Nov, so the statement shows it in November. Nothing is wrong, it only needs carrying.",
    date: "2026-10-29",
    ledgerEffect: -18420,
    voucherNo: "2026-0405",
  },
  {
    id: "recon-studio-adobe",
    clientId: "studio-vind",
    period: OPEN_MONTH,
    kind: "currency",
    title: "Currency difference on Adobe (USD)",
    detail:
      "Booked at the invoice rate of 10.62. DNB debited at 11.08 on 5 Oct, 54 kr more. The difference belongs on 8160 Currency loss.",
    date: "2026-10-05",
    ledgerEffect: 54,
    voucherNo: "2026-0379",
  },
]

/** What a bank line pays. `none` is a bank line with nothing behind it: its
    own review item, cleared by asking the customer and booking it. */
export type MatchKind = "invoice" | "receipt" | "payroll" | "none"

/** matched: ticked off and on the ledger. suggested: the agent found what it
    pays, the accountant hasn't accepted it. waiting: what it pays is still
    to book (a receipt to look at here, an invoice in Bookkeeping, salaries
    in Payroll). unmatched: nothing to match it to. */
export type BankLineState = "matched" | "suggested" | "waiting" | "unmatched"

export type Ledger = BankAccount["ledger"]

export type BankLine = {
  id: string
  clientId: string
  /** The account whose statement it is on. */
  account: Ledger
  /** ISO date on the statement. */
  date: string
  /** The statement text. */
  text: string
  amount: number
  kind: MatchKind
  /** The invoice or receipt it pays, or for `none` the line's own item. */
  item?: ReviewItem
  /** Payroll: the month of hours the salaries are for, and which run. */
  payRun?: string
  run?: number
  state: BankLineState
  /** Matched by the rules, on KID and amount, without anyone accepting it. */
  byRule?: boolean
  /** Already in the ledger. An invoice payment gets there when the match is
      accepted (a voucher from 2400 to 1920); a card receipt or a bank line
      when it is booked; salaries when the run is approved. */
  onLedger: boolean
}

/** The entry a bank line puts in the ledger, as an accountant reads it:
    the account debited, the bank account credited (or the other way round
    for money coming in). */
export function bankEntry(line: BankLine, accountName?: string) {
  const bank = `${line.account} ${accountName ?? LEDGER_NAME[line.account]}`
  const other =
    line.kind === "invoice"
      ? line.item?.expense
        ? "2910 Owed to employees"
        : "2400 Accounts payable"
      : line.kind === "payroll"
        ? "2930 Salaries payable"
        : line.item?.accrueMonths
          ? "1700 Prepaid expenses"
          : (line.item?.suggestion.lines[0].account ?? "")
  return line.amount < 0
    ? { debit: other, credit: bank }
    : { debit: bank, credit: other }
}

export const LEDGER_NAME: Record<Ledger, string> = {
  "1920": "Operating account",
  "1921": "Card account",
  "1950": "Tax withholding",
}

type Auto = {
  incoming: { count: number; amount: number }
  outgoing: { count: number; amount: number }
}

export type ReconIssueState = ReconIssue & { resolution?: ReconResolution }

/** One account's reconciliation. */
export type AccountRecon = {
  account: BankAccount
  /** Last day of the month, ISO. */
  asOf: string
  opening: number
  bank: number
  ledger: number
  /** Bank minus ledger. */
  difference: number
  /** What the rules matched on their own and never sent to review. */
  auto: Auto
  /** Every line on the month's statement that needs a match, by date. */
  lines: BankLine[]
  suggested: BankLine[]
  waiting: BankLine[]
  unmatched: BankLine[]
  matched: BankLine[]
  /** Lines the ledger doesn't have yet: what makes up the difference. */
  offLedger: { count: number; amount: number }
  /** Ledger issues still open: these block the close. */
  open: ReconIssueState[]
  /** Carried timing differences: explained, they don't block. */
  carried: ReconIssueState[]
  /** Corrected in Tripletex this month. */
  fixed: ReconIssueState[]
  /** Every line matched and no ledger issue left. */
  reconciled: boolean
  /** How many things stand between this account and a clean month. */
  toDo: number
}

/** Every account together, plus each one on its own. */
export type BankReconciliation = Omit<AccountRecon, "account"> & {
  accounts: AccountRecon[]
  /** Invoices booked on 2400 and not paid by month end. They stay open and
      are matched when the payment comes through. */
  payables: { items: ReviewItem[]; amount: number }
}

export function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

function prevMonth(period: string) {
  const [y, m] = period.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

function inMonth(date: string | undefined, month: string) {
  return Boolean(date && date.slice(0, 7) === month)
}

function kidOf(item: ReviewItem) {
  return item.facts.find((f) => f.label === "KID")?.value ?? ""
}

const sum = (lines: { amount: number }[]) => lines.reduce((total, l) => total + l.amount, 0)

/** A card receipt the agent can book from its bank line without a person:
    nothing flagged, nothing with the customer, and the amount and date on
    the receipt match the card payment. */
export function receiptIsSure(item: ReviewItem) {
  return (
    item.kind === "receipt" &&
    item.status === "needs_review" &&
    !item.issue &&
    !isParked(item) &&
    item.suggestion.confidence >= 0.9
  )
}

/** The month's statement lines that need a match, on every account,
    oldest first. */
const NONE_HELD: ReadonlySet<string> = new Set()

function statementLines(
  client: Client,
  month: string,
  items: ReviewItem[],
  progress: Progress,
  held: ReadonlySet<string> = NONE_HELD
): BankLine[] {
  const closed = MONTHS.find((m) => m.id === month)?.status === "closed"
  const own = items.filter((i) => i.clientId === client.id)
  // An approved invoice's payment carries its KID and exact amount: the
  // rules match it on their own. Only a match someone undid waits.
  const accepted = (id: string) => closed || !progress.matches[id]?.undone
  const accountOf = (item: ReviewItem) => paidFromAccount(client, item).ledger

  function documentLine(item: ReviewItem, kind: "invoice" | "receipt"): BankLine {
    const id = `${item.id}:paid`
    const booked = item.status === "booked"
    // A card receipt is booked from its bank line: booking it is the match.
    // One the agent is sure of is a suggestion to accept; the rest are
    // opened and decided one by one, like the invoices in Bookkeeping.
    const state: BankLineState =
      kind === "receipt"
        ? booked
          ? "matched"
          : receiptIsSure(item)
            ? "suggested"
            : "waiting"
        : !booked
          ? "waiting"
          : accepted(id)
            ? "matched"
            : "suggested"
    return {
      id,
      clientId: client.id,
      account: accountOf(item),
      date: kind === "invoice" ? item.dueDate! : item.date,
      text:
        kind === "invoice"
          ? item.expense
            ? `UTLEGG ${item.expense.employee.toUpperCase()}`
            : `GIRO ${kidOf(item)}`
          : item.subtitle,
      amount: item.amount,
      kind,
      item,
      state,
      onLedger: kind === "invoice" ? state === "matched" : booked,
      byRule: kind === "invoice" && state === "matched" && !progress.matches[id],
    }
  }

  const lines: BankLine[] = []
  for (const item of own) {
    if (item.domain !== "bookkeeping") continue
    // A credit note nets its invoice out on 2400: no money moves.
    if (item.creditFor) continue
    // An invoice the customer hasn't approved (or rejected) was never paid.
    if (item.kind === "invoice" && inMonth(item.dueDate, month) && !held.has(item.id)) {
      lines.push(documentLine(item, "invoice"))
    } else if (item.kind === "receipt" && inMonth(item.date, month)) {
      lines.push(documentLine(item, "receipt"))
    } else if (item.kind === "bank_line" && inMonth(item.date, month)) {
      const booked = item.status === "booked"
      lines.push({
        id: item.id,
        clientId: client.id,
        account: accountOf(item),
        date: item.date,
        text: item.subtitle,
        amount: item.amount,
        kind: "none",
        item,
        state: booked ? "matched" : "unmatched",
        onLedger: booked,
      })
    }
  }

  // Last month's pay runs go out net of tax: one payment per run, matched by
  // the run's own payment file. Before any run is approved the regular pay
  // day's line waits on Payroll.
  const payRun = prevMonth(month)
  const payroll = getPayroll(items, progress, client.id, payRun)
  const salaryText = `LØNN ${monthName(payRun).toUpperCase()} ${payRun.slice(0, 4)}`
  for (const run of payroll.runs) {
    if (!inMonth(run.payDate, month)) continue
    lines.push({
      id: `${client.id}:salaries:${payRun}:${run.seq}`,
      clientId: client.id,
      account: "1920",
      date: run.payDate,
      text: run.seq > 1 ? `${salaryText} (${run.seq})` : salaryText,
      amount: -Math.round(run.gross * 0.7),
      kind: "payroll",
      payRun,
      run: run.seq,
      state: "matched",
      onLedger: true,
    })
  }
  const unpaid = [...payroll.ready, ...payroll.open]
  const payDay = `${month}-${client.payDate.split(" ")[0].padStart(2, "0")}`
  if (!payroll.runs.length && unpaid.length && payDay <= lastDay(month)) {
    lines.push({
      id: `${client.id}:salaries:${payRun}:1`,
      clientId: client.id,
      account: "1920",
      date: payDay,
      text: salaryText,
      amount: -Math.round(sum(unpaid) * 0.7),
      kind: "payroll",
      payRun,
      run: 1,
      state: "waiting",
      onLedger: false,
    })
  }

  return lines.sort((a, b) => a.date.localeCompare(b.date))
}

/** The card account is topped up from operating as it runs low. */
export function cardBalance(client: Client, month: string) {
  return 4000 + Math.round((hash(`${client.id}-${month}-card`) % 21000) / 10) * 10
}

/** Gross pay that went out in `month`: last month's hours. Months before
    the data starts paid what the oldest month did. */
function paidGross(client: Client, month: string, items: ReviewItem[]) {
  const hours = prevMonth(month)
  const pay = items.filter((i) => i.clientId === client.id && i.domain === "payroll")
  const lines = pay.filter((i) => i.period === hours)
  const source = lines.length ? lines : pay.filter((i) => i.period === MONTHS[MONTHS.length - 1].id)
  return sum(source)
}

/** Withholding from the pay that went out in `month`. */
function withheld(client: Client, month: string, items: ReviewItem[]) {
  return Math.round(paidGross(client, month, items) * 0.3)
}

/** What the a-melding for `month` reports, from the pay that went out in
    it: gross pay, tax withheld and employer's NI (14.1%), and the holiday
    pay it earns (10.2%) with employer's NI on that. The salary vouchers
    book the same amounts to 5000, 2600, 2770, 2940 and 2780, so the two
    can be laid side by side in the payroll reconciliation. */
export type PayFigures = {
  gross: number
  tax: number
  employer: number
  holiday: number
  holidayEmployer: number
}

export function payPaidIn(client: Client, month: string, items: ReviewItem[]): PayFigures {
  const gross = paidGross(client, month, items)
  const holiday = Math.round(gross * 0.102)
  return {
    gross,
    tax: withheld(client, month, items),
    employer: Math.round(gross * 0.141),
    holiday,
    holidayEmployer: Math.round(holiday * 0.141),
  }
}

/** 2770 at month end. Employer's NI goes with the withholding: each
    bi-monthly term is paid on the 15th of the month after it. */
export function employerBalance(client: Client, month: string, items: ReviewItem[]) {
  const odd = Number(month.slice(5)) % 2 === 1
  const of = (m: string) => payPaidIn(client, m, items).employer
  return odd ? of(month) : of(prevMonth(month)) + of(month)
}

/** 2940 at month end: holiday pay earned since 1 January, plus last
    year's until it is paid out in June. */
export function holidayBalance(client: Client, month: string, items: ReviewItem[]) {
  const year = Number(month.slice(0, 4))
  const fromJanuary = (to: string) => {
    const out = [to]
    while (!out[0].endsWith("-01")) out.unshift(prevMonth(out[0]))
    return out
  }
  const last = Number(month.slice(5)) < 6 ? fromJanuary(`${year - 1}-12`) : []
  return [...last, ...fromJanuary(month)].reduce(
    (total, m) => total + payPaidIn(client, m, items).holiday,
    0
  )
}

/** 2780 at month end: employer's NI on the holiday pay owed. */
export function holidayEmployerBalance(client: Client, month: string, items: ReviewItem[]) {
  return Math.round(holidayBalance(client, month, items) * 0.141)
}

/** 1950 holds the month's withholding until the bi-monthly payment to
    Skatteetaten on the 15th of odd months clears the term before. */
export function taxBalance(client: Client, month: string, items: ReviewItem[]) {
  const odd = Number(month.slice(5)) % 2 === 1
  return odd
    ? withheld(client, month, items)
    : withheld(client, prevMonth(month), items) + withheld(client, month, items)
}

function account(client: Client, ledger: Ledger) {
  return client.accounts.find((a) => a.ledger === ledger)
}

function build(
  bankAccount: BankAccount,
  asOf: string,
  opening: number,
  bank: number,
  auto: Auto,
  lines: BankLine[],
  issues: ReconIssueState[]
): AccountRecon {
  const off = lines.filter((l) => !l.onLedger)
  const open = issues.filter((i) => !i.resolution)
  const carried = issues.filter((i) => i.resolution?.how === "carried")
  const fixed = issues.filter((i) => i.resolution?.how === "fixed")
  const ledger =
    bank - sum(off) + [...open, ...carried].reduce((total, i) => total + i.ledgerEffect, 0)
  const by = (state: BankLineState) => lines.filter((l) => l.state === state)
  const notMatched = lines.filter((l) => l.state !== "matched").length
  return {
    account: bankAccount,
    asOf,
    opening,
    bank,
    ledger,
    difference: bank - ledger,
    auto,
    lines,
    suggested: by("suggested"),
    waiting: by("waiting"),
    unmatched: by("unmatched"),
    matched: by("matched"),
    offLedger: { count: off.length, amount: sum(off) },
    open,
    carried,
    fixed,
    reconciled: notMatched === 0 && open.length === 0,
    toDo: notMatched + open.length,
  }
}

export function getBankReconciliation(
  client: Client,
  month: string,
  items: ReviewItem[],
  progress: Progress,
  /** Booked invoices that weren't paid: see approvals.ts heldInvoices. */
  held?: ReadonlySet<string>
): BankReconciliation {
  const all = statementLines(client, month, items, progress, held)
  const on = (ledger: Ledger) => all.filter((l) => l.account === ledger)
  const asOf = lastDay(month)
  const prev = prevMonth(month)

  const issues: ReconIssueState[] = RECON_ISSUES.filter(
    (i) => i.clientId === client.id && i.period === month
  ).map((i) => ({
    ...i,
    // A payment registered in the ledger before DNB executes it is a timing
    // difference: the agent carries it, and only raises it if next month's
    // statement doesn't show it either.
    resolution:
      progress.recon[i.id] ??
      (i.kind === "in_transit" ? { at: i.date, by: "The agent", how: "carried" as const } : undefined),
  }))

  // Card: whatever the purchases didn't explain is the top-up from 1920.
  const card = on("1921")
  const cardOpening = cardBalance(client, prev)
  const cardBank = cardBalance(client, month)
  const topUp = cardBank - cardOpening - sum(card)

  // Tax withholding: in on pay day, out to Skatteetaten in odd months.
  const taxOpening = taxBalance(client, prev, items)
  const taxIn = withheld(client, month, items)
  const taxOut = taxOpening + taxIn - taxBalance(client, month, items)

  // Operating: what the rules matched on their own (customer payments
  // against open invoices, rent, standing orders, the transfers to the
  // other two accounts) takes it from last month's balance to this one,
  // the same "In the bank" figure the customer's monthly report shows.
  const operating = on("1920")
  const opening = figuresFor(client, prev).cash
  const bank = figuresFor(client, month).cash
  const h = hash(`${client.id}-${month}-auto`)
  const incoming = Math.round(figuresFor(client, month).sales * (0.9 + (h % 8) / 100))

  // A company without employees (one handed over from onboarding) has no
  // tax withholding account.
  const operatingAccount = account(client, "1920")
  const cardAccount = account(client, "1921")
  const taxAccount = account(client, "1950")
  const accounts = [
    operatingAccount &&
      build(operatingAccount, asOf, opening, bank, {
        incoming: { count: 18 + (h % 40), amount: incoming },
        outgoing: { count: 8 + (h % 10), amount: bank - opening - sum(operating) - incoming },
      }, operating, issues),
    cardAccount &&
      build(cardAccount, asOf, cardOpening, cardBank, {
        incoming: { count: topUp > 0 ? 1 : 0, amount: Math.max(topUp, 0) },
        outgoing: { count: topUp < 0 ? 1 : 0, amount: Math.min(topUp, 0) },
      }, card, []),
    taxAccount &&
      build(taxAccount, asOf, taxOpening, taxBalance(client, month, items), {
        incoming: { count: taxIn ? 1 : 0, amount: taxIn },
        outgoing: { count: taxOut ? 1 : 0, amount: -taxOut },
      }, [], []),
  ].filter((a): a is AccountRecon => Boolean(a))

  const total = (pick: (a: AccountRecon) => number) =>
    accounts.reduce((sum, a) => sum + pick(a), 0)
  const end = asOf
  const payableItems = items.filter(
    (i) =>
      i.clientId === client.id &&
      i.kind === "invoice" &&
      !i.expense &&
      !i.creditFor &&
      !items.some((c) => c.creditFor === i.id && c.status === "booked") &&
      i.status === "booked" &&
      i.date <= end &&
      (i.dueDate ?? "") > end
  )
  const lines = [...all]
  const by = (state: BankLineState) => lines.filter((l) => l.state === state)

  return {
    accounts,
    asOf,
    opening: total((a) => a.opening),
    bank: total((a) => a.bank),
    ledger: total((a) => a.ledger),
    difference: total((a) => a.difference),
    auto: {
      incoming: {
        count: total((a) => a.auto.incoming.count),
        amount: total((a) => a.auto.incoming.amount),
      },
      outgoing: {
        count: total((a) => a.auto.outgoing.count),
        amount: total((a) => a.auto.outgoing.amount),
      },
    },
    lines,
    suggested: by("suggested"),
    waiting: by("waiting"),
    unmatched: by("unmatched"),
    matched: by("matched"),
    offLedger: {
      count: total((a) => a.offLedger.count),
      amount: total((a) => a.offLedger.amount),
    },
    payables: { items: payableItems, amount: sum(payableItems) },
    open: accounts.flatMap((a) => a.open),
    carried: accounts.flatMap((a) => a.carried),
    fixed: accounts.flatMap((a) => a.fixed),
    reconciled: accounts.every((a) => a.reconciled),
    toDo: total((a) => a.toDo),
  }
}
