// Domain model for the intelligence-layer mock. Tripletex stays the system of
// record; everything here is what the agents propose on top of it and what the
// accountant / customer decide.
import type { Routine } from "./onboarding"

export type Domain = "bookkeeping" | "payroll"

export type Person = {
  id: string
  name: string
  initials: string
  email: string
  role?: string
  phone?: string
  /** How this contact usually behaves with requests. */
  responsiveness?: string
}

/** Picks the client's icon; see INDUSTRY_ICON in the UI. */
export type IndustryKey =
  | "cafe"
  | "design"
  | "construction"
  | "seafood"
  | "dental"
  | "climbing"
  | "law"
  | "it"
  | "salon"
  | "bikes"
  | "plumbing"
  | "hotel"
  | "kindergarten"
  | "architecture"
  | "logistics"
  | "deli"

/** A bank account and the ledger account it is reconciled against. Every
    client has an operating account and a card account; employers also keep
    withheld tax apart on 1950. (The skattetrekkskonto requirement was lifted
    on 1 Jan 2026; kept here until the firm decides how it works now.) */
export type BankAccount = {
  ledger: "1920" | "1921" | "1950"
  name: string
  /** DNB account number. */
  number: string
}

export type Client = {
  id: string
  name: string
  orgNo: string
  industry: string
  industryKey: IndustryKey
  employees: number
  accountantId: string
  contacts: Person[]
  period: string
  payDate: string
  vatTerm: "Bi-monthly" | "Annual"
  /** The operating account's number (1920). */
  bankAccount: string
  /** Operating first, then card, then tax withholding. */
  accounts: BankAccount[]
  nextDeadline: { label: string; date: string }
  /** A company handed over from onboarding: the first month we keep its
      books ("2026-10"). The months before were kept elsewhere. */
  since?: Period
  pinned?: boolean
  color: string
  profile: ClientProfile
}

export type ClientProfile = {
  clientSince: string
  services: string[]
  systems: string[]
  revenueLastYear: number
  fiscalYear: string
  address: string
  notes: string[]
  /** Who does what, as agreed in the engagement (see routines.ts). */
  routines?: Routine[]
}

/** Accounting month, "2026-09". Bookkeeping closes a month after the fact;
    payroll runs ahead of it, so each domain has its own open period. */
export type Period = string

/** Where a suggestion sits in the accountant <-> customer loop. */
export type ItemStatus =
  | "needs_review"
  | "waiting_customer"
  | "customer_replied"
  | "booked"

/** Why an agent could not simply propose "confirm": something it can't
    book without an answer. What is merely unusual is an anomaly. */
export type IssueKind =
  | "missing_receipt"
  | "unclear_purpose"
  | "private_expense"
  | "overtime_unapproved"
  | "sick_leave"
  | "missing_tax_card"
  | "unregistered_bonus"

/** What makes a line unusual against its own pattern: a supplier or an
    employee we haven't seen, an amount far from the usual, a price other
    clients don't pay. The agent may know exactly how to book it; an
    anomaly is why a person looks before money leaves the bank, and why it
    is never booked in bulk. */
export type AnomalyKind =
  // Supplier invoices
  | "new_supplier"
  | "amount_jump"
  | "benchmark"
  | "large_amount"
  | "bank_account"
  // Pay lines
  | "new_employee"
  | "pay_change"
  | "commission"
  | "correction"
  | "leaving"
  | "off_agreement"
  | "extra_pay"

export type Anomaly = {
  kind: AnomalyKind
  /** For the customer: a few plain words. */
  short: string
  /** For the firm: the numbers behind it. */
  detail: string
}

export type ActivityActor = "agent" | "accountant" | "customer" | "system"

export type Activity = {
  id: string
  actor: ActivityActor
  title: string
  detail?: string
  time: string
}

export type PostingLine = {
  account: string
  vat?: string
  amount: number
  /** Accounts kept per person or company (1570, 2910, 2400, 1500): who
      it is on, so the balance can be read person by person. */
  counterparty?: string
}

/** One piece of evidence behind a suggestion, and which way it pulls. */
export type Signal = {
  text: string
  source: "history" | "document" | "rule" | "bank" | "registry" | "customer"
  effect: "supports" | "against" | "neutral"
}

export type Suggestion = {
  lines: PostingLine[]
  confidence: number
  reasoning: string[]
  /** What keeps the agent from being certain, in one sentence, when none
      of the reasoning argues against it: "why 86 and not 100". */
  gap?: string
  /** An answer showed earlier bookings this fiscal year were wrong the same
      way: which, and the input VAT they took that they shouldn't have. */
  lookBack?: { itemIds: string[]; vat: number; why: string }
}

export type Evidence = {
  label: string
  attached: boolean
  fileName?: string
}

export type Fact = { label: string; value: string; mono?: boolean }

/** Asking a colleague. "ask": they give input, the task stays yours.
    "handover": the task becomes theirs. Only the firm ever sees this. */
export type Handoff = {
  mode: "ask" | "handover"
  /** Team member ids. */
  from: string
  to: string
  note: string
  at: string
  /** An ask is answered once the colleague writes back. A handover is
      done the moment it is made. */
  status: "open" | "answered"
}

/** A note inside the firm: never shown in the customer app. */
export type TeamNote = {
  id: string
  /** Team member id. */
  authorId: string
  text: string
  time: string
}

/** What every task carries for the team, whether it is a bank line, a pay
    line or a request with nothing behind it. */
export type TeamFields = {
  /** Who works the task now. Absent means the client's accountant. */
  assigneeId?: string
  /** The latest ask or handover. */
  handoff?: Handoff
  notes?: TeamNote[]
  /** Out of the queue until this day ("2026-09-29"). */
  snoozedUntil?: string
}

/** What a bookkeeping line is built from. An invoice is booked against 2400
    when it arrives and its payment is matched later, often the next month. A
    receipt was paid on the spot by card or Vipps, so it is booked against
    1920. A bank line has nothing behind it yet: it is worked on in the
    reconciliation, usually by asking the customer. */
export type SourceKind = "invoice" | "receipt" | "bank_line"

export type ReviewItem = TeamFields & {
  id: string
  clientId: string
  domain: Domain
  period: Period
  /** Counterparty for bookkeeping, employee for payroll. */
  title: string
  /** Bank text for bookkeeping, role for payroll. */
  subtitle: string
  date: string
  amount: number
  source: string
  /** Payroll only: "118 h hourly", "Fixed 42 500". */
  basis?: string
  evidence: Evidence
  /** Source-system facts: invoice no., KID, employee no., tax table... */
  facts: Fact[]
  suggestion: Suggestion
  issue?: IssueKind
  status: ItemStatus
  requestId?: string
  voucherNo?: string
  /** Bookkeeping only. */
  kind?: SourceKind
  /** Invoices: when the payment is due, and so when it leaves the bank. */
  dueDate?: string
  /** Invoices and receipts: the cost is spread over this many months from
      `period`, through 1700 Prepaid expenses. */
  accrueMonths?: number
  /** An invoice dated in a closed month that was booked back into it: the
      month was reopened and its VAT return takes it in. */
  backdated?: true
  /** Seed only: an invoice booked before the demo starts, approved by the
      customer on the weekly list after its date (those lists aren't in the
      data, like the closed months'). Booking it again drops it. */
  approvedEarlier?: true
  /** An employee's out-of-pocket expense, sent from the customer app: an
      invoice owed to the employee on 2910 instead of a supplier on 2400,
      repaid with the next pay (`dueDate`). Never on an approval list: the
      company sent it. */
  expense?: { employee: string; submittedBy: string }
  /** A credit note: the rejected invoice (its id) it clears. */
  creditFor?: string
  /** Invoices: the supplier asks to be paid to a different bank account
      than on every earlier invoice. The classic invoice fraud. */
  payeeChanged?: { before: string; now: string }
  /** Corrected after the fact: an answer on a later line (`from`) showed
      this one took input VAT it shouldn't have. In a filed term it needs a
      corrected return. */
  vatFix?: Stamp & { from: string; vat: number }
  /** Payroll: moved here from this month's run. */
  movedFrom?: Period
  /** Payroll: left out of this month's pay on purpose. */
  skipped?: true
  activity: Activity[]
}

export type RequestKind =
  | "missing_receipt"
  | "explain"
  | "confirm"
  | "document"
  | "custom"
  /** Started by the customer from their app. */
  | "customer_question"
  /** A list the customer approves line by line: booked invoices before
      they are paid, or the pay run before it goes out. */
  | "approval"
  /** The questions that open a pay period: who started, who left, who was
      away. */
  | "payroll_checkin"

/** How the task is exposed to the customer in their app. "approval" and
    "checkin" carry their own content (`lines`, `checkin`). */
export type ResponseType = "text" | "choice" | "file" | "confirm" | "approval" | "checkin"

/** Who answered on the customer's side, and when (ISO date and time), so an
    approval holds up in front of an auditor. */
export type Answered = { contactId: string; name: string; at: string }

/** One line of an approval task. */
export type ApprovalLine = {
  itemId: string
  /** Why this line needs a real look: a new supplier, an amount far from
      what they usually pay, a new employee. Absent: nothing stands out. */
  anomaly?: string
  /** Absent until the customer decides. */
  decision?: "approved" | "rejected"
  /** The customer's reason when they reject or question a line. */
  note?: string
  /** "Approve this supplier (employee) from now on": next time it only
      comes back if something looks off. */
  remember?: boolean
  /** Pay lines: the gross when it went out. A line changed since then
      needs approving again; one that didn't keeps its decision. */
  amount?: number
}

/** The customer's answer to the questions that open a pay period. */
export type CheckinAnswer = {
  /** "No changes since last month", in one tap. */
  noChanges: boolean
  hires?: string
  leavers?: string
  absence?: string
  /** Who worked overtime, and how many hours: it goes on the pay run
      only once the customer has said so. */
  overtime?: string
  other?: string
}

/** draft = the agent wrote the question, the accountant hasn't decided yet. */
export type RequestStatus = "draft" | "sent" | "replied" | "resolved"

export type CustomerReply = {
  text: string
  attachment?: string
  time: string
}

/** One turn in the back-and-forth after the opening message and first reply. */
export type ThreadMessage = {
  id: string
  from: "accountant" | "customer"
  text: string
  attachment?: string
  time: string
}

export type CustomerRequest = TeamFields & {
  id: string
  clientId: string
  domain: Domain | "general"
  /** Absent for tasks the accountant created by hand. */
  itemId?: string
  /** A task about a line without being its question: asking the customer
      what to do about an invoice they rejected. The line's own state
      doesn't follow it. */
  about?: string
  period: Period
  responseType: ResponseType
  /** Choice tasks only. */
  options?: string[]
  kind: RequestKind
  title: string
  message: string
  /** A file sent with the opening message (customer questions). */
  attachment?: string
  recipientId: string
  due: string
  priority: "low" | "medium" | "high"
  status: RequestStatus
  round: number
  sentAt: string
  reply?: CustomerReply
  /** Everything said after the opening message and the first reply. */
  thread?: ThreadMessage[]
  /** Who opened it. Absent means the firm did. A customer question starts
      in "replied" (the ball is with the accountant) and alternates with
      "sent" as the two sides answer each other. */
  origin?: "customer"
  /** cancelled = withdrawn by the firm, or replaced by a newer version. */
  resolution?: "booked" | "done" | "cancelled"
  /** Approval tasks: the lines the customer decides on. */
  lines?: ApprovalLine[]
  /** Invoice lists: the invoices from approved suppliers that were paid
      without asking when this list went out, so the customer still sees
      the whole week. */
  paidWithout?: string[]
  /** Pay period check-ins: what the customer told us. */
  checkin?: CheckinAnswer
  /** Who on the customer's side last answered, and when. */
  answeredBy?: Answered
}

/** A standing instruction the accountant gave the agents from a decision:
    "always book this supplier like this". */
export type AgentRule = {
  id: string
  clientId: string
  /** The counterparty the rule matches. */
  match: string
  account: string
  vat?: string
  createdBy: string
  createdAt: string
}

/** Who did something and when, for actions that only need a trail. */
export type Stamp = { at: string; by: string }

/** Something on the ledger's bank account (1920) that the bank statement
    does not agree with. Bank lines that simply aren't matched yet are not
    issues: matching them clears them. */
export type ReconIssueKind =
  /** The same payment sits in the ledger twice. */
  | "duplicate"
  /** Paid in the ledger, not through the bank yet. */
  | "in_transit"
  /** Booked at one rate, debited at another. */
  | "currency"

export type ReconIssue = {
  id: string
  clientId: string
  period: Period
  kind: ReconIssueKind
  title: string
  detail: string
  date: string
  /** What it does to ledger 1920 against the bank: negative lowers it. */
  ledgerEffect: number
  voucherNo?: string
}

/** fixed = corrected in Tripletex, the effect is gone.
    carried = a timing difference, explained and carried to next month. */
export type ReconResolution = Stamp & { how: "fixed" | "carried" }

/** One approved pay run: one salary voucher and one payment file. A month
    has its regular run and, when input came late, follow-up runs for the
    employees who were held back. */
export type PayRun = Stamp & {
  clientId: string
  /** The month of hours it pays. */
  month: Period
  /** 1 is the regular run. */
  seq: number
  itemIds: string[]
  gross: number
  /** ISO date the money reaches the employees. */
  payDate: string
}

/** A corrected VAT return, filed for invoices booked into a term after its
    return went in. */
export type Correction = Stamp & { itemIds: string[] }

/** What the accountant signs off besides closing the month (that is the
    store's `closing`): pay runs, filings, bank issues and the bank lines
    matched to what they pay. Keyed `${clientId}:${period}:${seq}` (pay
    runs), by filing id (filings and corrections), by issue id and by bank
    line id. */
export type Progress = {
  payRuns: Record<string, PayRun>
  filings: Record<string, Stamp>
  corrections: Record<string, Correction>
  recon: Record<string, ReconResolution>
  /** Bank lines matched by hand. An invoice payment the rules matched on
      its own (KID and amount) needs no entry; `undone` takes one apart. */
  matches: Record<string, Stamp & { undone?: true }>
}
