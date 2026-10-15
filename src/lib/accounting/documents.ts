// What the customer sends the firm without being asked, and what follows a
// rejected invoice. From the customer app: a bill to pay (it lands in the
// Bookkeeping inbox, in its own month if that month is still open, else as
// a late invoice), a card receipt (matched to the card payment that had
// nothing behind it), or an expense someone paid out of their own pocket
// (owed to them on 2910 and repaid with the next pay). After a rejection:
// the credit note the firm asked the supplier for, chased until it is in.
import {
  addDays,
  CLIENT_BY_ID,
  CURRENT_USER,
  dayLabel,
  hash,
  OPEN_MONTH,
  payDates,
  paidFromAccount,
} from "./data"
import { TODAY } from "./deadlines"
import { invoiceApprovals } from "./approvals"
import { isWorkable, monthStatus, suggestForSupplier } from "./periods"
import type { StoreState } from "./store"
import { log } from "./trail"
import type { CustomerRequest, ReviewItem } from "./types"

/** What an employee's expense is owed on until it is repaid. */
export const EMPLOYEE_PAYABLE = "2910 Owed to employees"

export type SentDocument = {
  /** bill: an invoice to pay later. receipt: a card payment already
      made. expense: someone paid privately and is owed it back. */
  type: "bill" | "receipt" | "expense"
  /** The shop or supplier. */
  supplier: string
  /** ISO date on the document. */
  date: string
  /** VAT included, positive. */
  amount: number
  /** Bills: when it is due. */
  dueDate?: string
  /** Expenses: who paid. */
  employee?: string
  /** What it was for, in the customer's words. */
  note?: string
  file?: string
}

/** The pay day an expense is repaid on: the next regular run's. */
export function refundDay(clientId: string) {
  const client = CLIENT_BY_ID.get(clientId)!
  const now = payDates(client, OPEN_MONTH).payDate
  return now > TODAY ? now : payDates(client, TODAY.slice(0, 7)).payDate
}

const nok = (value: number) => `${new Intl.NumberFormat("nb-NO").format(Math.abs(value))} kr`

/** The month a sent document is booked in: its own while that month can
    still be worked, else the open one, where it shows as late. */
function bookingMonth(clientId: string, date: string, state: StoreState) {
  const own = date.slice(0, 7)
  if (own >= OPEN_MONTH) return own
  return isWorkable(monthStatus(clientId, own, state)) ? own : OPEN_MONTH
}

function nextId(state: StoreState, clientId: string) {
  const prefix = `${clientId}-bk-sent-`
  return `${prefix}${state.items.filter((i) => i.id.startsWith(prefix)).length + 1}`
}

function documentItem(
  state: StoreState,
  clientId: string,
  contactName: string,
  doc: SentDocument
): ReviewItem | undefined {
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return undefined
  const id = nextId(state, clientId)
  const guess = suggestForSupplier(clientId, doc.supplier, state.items)
  const amount = -Math.abs(Math.round(doc.amount))
  const expense = doc.type === "expense" && doc.employee
  // A card receipt the bank hasn't shown yet: already paid, so no due
  // date; it is booked from its card line when the statement has it.
  const receipt = doc.type === "receipt"
  // A bill without a due date is due in 14 days, like most terms.
  const due = expense ? refundDay(clientId) : receipt ? undefined : (doc.dueDate ?? addDays(doc.date, 14))
  const kid = String(hash(`${id}-kid`)).padStart(13, "4").slice(0, 13)
  const pay = paidFromAccount(client, { kind: "invoice", subtitle: "" })
  const first = contactName.split(" ")[0]
  const reasoning = expense
    ? [
        `Paid out of pocket by ${doc.employee}${doc.note ? `: “${doc.note}”` : ""}. Owed to them on 2910 and repaid with the pay on ${dayLabel(due!)}.`,
        "A documented outlay is a refund, not pay: no tax withheld and nothing on the A-melding.",
        ...guess.reasoning.slice(0, 1),
      ]
    : receipt
      ? [
          `Card receipt sent by ${first} in the app${doc.note ? `: “${doc.note}”` : ""}. No card payment of this amount on the statements yet: it is matched when one comes in.`,
          ...guess.reasoning,
        ]
      : [`Sent by ${first} in the app${doc.note ? `: “${doc.note}”` : ""}.`, ...guess.reasoning]
  return {
    id,
    clientId,
    domain: "bookkeeping",
    period: bookingMonth(clientId, doc.date, state),
    kind: receipt ? "receipt" : "invoice",
    dueDate: due,
    expense: expense ? { employee: doc.employee!, submittedBy: contactName } : undefined,
    title: guess.title,
    subtitle: expense ? `Paid by ${doc.employee}` : `Sent by ${first} in the app`,
    date: doc.date,
    amount,
    source: "Customer app",
    evidence: {
      label: expense || receipt ? "Receipt" : "Invoice",
      attached: Boolean(doc.file),
      fileName: doc.file,
    },
    facts: expense
      ? [
          { label: "Paid by", value: doc.employee! },
          { label: "Sent by", value: `${contactName}, ${dayLabel(TODAY)}` },
          { label: "Bought", value: dayLabel(doc.date) },
          { label: "Owed on", value: EMPLOYEE_PAYABLE },
          { label: "Repaid", value: `With the pay, ${dayLabel(due!)}` },
        ]
      : receipt
        ? [
            { label: "Shop", value: guess.title },
            { label: "Paid", value: `${dayLabel(doc.date)} · company card` },
            { label: "Sent by", value: `${contactName}, ${dayLabel(TODAY)}` },
          ]
        : [
          { label: "Supplier", value: guess.title },
          { label: "Invoice date", value: dayLabel(doc.date) },
          { label: "Received", value: `${dayLabel(TODAY)} · from ${first} in the app` },
          { label: "Due date", value: dayLabel(due!) },
          { label: "KID", value: kid, mono: true },
          { label: "Pay from", value: `DNB ${pay.number}`, mono: true },
        ],
    suggestion: {
      // No document, no deduction: an expense or receipt without one gets
      // no input VAT (and an expense no tax-free refund) until it is in.
      lines: [{ account: guess.account, vat: (expense || receipt) && !doc.file ? "0 · No VAT" : guess.vat, amount }],
      confidence: guess.confidence,
      reasoning: (expense || receipt) && !doc.file
        ? [...reasoning, "No receipt attached yet: no input VAT, and no tax-free refund, until it is in."]
        : reasoning,
    },
    issue: (expense || receipt) && !doc.file ? "missing_receipt" : guess.issue,
    status: "needs_review",
    activity: [
      log(
        "customer",
        expense ? `${first} sent ${doc.employee}'s expense` : receipt ? `${first} sent a card receipt` : `${first} sent a bill`,
        doc.file ? `${doc.file}${doc.note ? ` · ${doc.note}` : ""}` : doc.note
      ),
      log("agent", `Read it and suggested ${guess.account}`, reasoning[0]),
    ],
  }
}

/** A receipt the customer sent for a card payment with nothing behind it:
    the agent finds the payment by amount and books from it. */
function matchReceipt(state: StoreState, clientId: string, contactName: string, doc: SentDocument) {
  const amount = Math.abs(Math.round(doc.amount))
  const client = CLIENT_BY_ID.get(clientId)!
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
  // Money that went out by card, in a month that can still be worked, for
  // the same amount: the nearest to the receipt's date.
  const line = state.items
    .filter(
      (i) =>
        i.clientId === clientId &&
        i.domain === "bookkeeping" &&
        i.kind === "bank_line" &&
        i.status !== "booked" &&
        i.amount < 0 &&
        paidFromAccount(client, i).ledger === "1921" &&
        isWorkable(monthStatus(clientId, i.period, state)) &&
        Math.abs(Math.abs(i.amount) - amount) <= 1
    )
    .sort((a, b) => days(a.date, doc.date) - days(b.date, doc.date))[0]
  if (!line) return undefined
  // A line parked on 1570 because nobody knew what it was gets a real
  // account now that there is a receipt.
  const parked = line.suggestion.lines[0].account.startsWith("1570")
  const guess = parked ? suggestForSupplier(clientId, doc.supplier || line.title, state.items) : undefined
  const lines = guess
    ? [{ account: guess.account, vat: guess.vat, amount: line.amount }]
    : line.suggestion.lines
  const first = contactName.split(" ")[0]
  const request = line.requestId ? state.requests.find((r) => r.id === line.requestId) : undefined
  const reply: CustomerRequest["reply"] = {
    text: doc.note ? `Here's the receipt: ${doc.note}` : "Here's the receipt.",
    attachment: doc.file,
    time: "Just now",
  }
  const item: ReviewItem = {
    ...line,
    kind: "receipt",
    issue: undefined,
    status: "needs_review",
    evidence: { label: "Receipt", attached: true, fileName: doc.file ?? "receipt.jpg" },
    suggestion: {
      ...line.suggestion,
      lines,
      confidence: guess ? Math.min(guess.confidence, 0.85) : 0.94,
      reasoning: [
        `Receipt sent by ${first} in the app: ${nok(amount)} at ${doc.supplier || line.title}, the same amount as the card payment on ${dayLabel(line.date)}.`,
        guess
          ? `Moved from 1570 to ${lines[0].account} now that there is a receipt: check it against what was bought.`
          : `Keeps ${lines[0].account}; the input VAT is deductible now that there is a receipt.`,
      ],
      gap: undefined,
    },
    activity: [
      ...line.activity,
      log("customer", `${first} sent the receipt in the app`, doc.file),
      log("agent", "Matched it to the card payment", `${nok(amount)} on ${dayLabel(line.date)}.`),
    ],
  }
  return {
    ...state,
    items: state.items.map((i) => (i.id === line.id ? item : i)),
    // A question about the same payment is answered by it.
    requests: request
      ? state.requests.map((r) =>
          r.id === request.id && r.status !== "resolved"
            ? { ...r, status: "replied" as const, reply }
            : r
        )
      : state.requests,
  }
}

// ── Credit notes ──

/** The credit note booked against a rejected invoice, if it came. */
export function creditNoteFor(state: Pick<StoreState, "items">, invoiceId: string) {
  return state.items.find((i) => i.creditFor === invoiceId)
}

/** Rejected invoices the firm asked a credit note for that isn't booked
    yet: the follow-up the accountant would otherwise forget. */
export function awaitedCreditNotes(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
) {
  return invoiceApprovals(state, clientId)
    .filter((a) => a.status === "credit_note")
    .filter((a) => creditNoteFor(state, a.item.id)?.status !== "booked")
}

/** The e-mail to the supplier asking for a credit note, for the accountant
    to read before it goes. */
export function creditNoteEmail(item: ReviewItem, reason?: string) {
  const client = CLIENT_BY_ID.get(item.clientId)!
  const invoiceNo = item.facts.find((f) => /invoice no/i.test(f.label))?.value ?? item.subtitle.replace(/^EHF\s+/, "").split(" ")[0]
  return [
    `Hi,`,
    `We keep the books for ${client.name}. They have rejected invoice ${invoiceNo} of ${dayLabel(item.date)}, ${nok(item.amount)}${reason ? `, with this reason: “${reason}”` : "."}`,
    `Could you send a credit note for it (and a corrected invoice, if part of it is right) to their EHF address, or to us at this e-mail? Until then the invoice stays unpaid.`,
    `Best regards,\n${CURRENT_USER.name}, accountant for ${client.name}`,
  ].join("\n\n")
}

export type DocumentsAction =
  | { type: "customer_document"; clientId: string; contactId: string; doc: SentDocument }
  /** The supplier's credit note for a rejected invoice is in the inbox. */
  | { type: "credit_note_arrived"; invoiceId: string }
  | { type: "remind_supplier"; invoiceId: string }

export function documentsApply(state: StoreState, action: DocumentsAction): StoreState {
  switch (action.type) {
    case "customer_document": {
      const client = CLIENT_BY_ID.get(action.clientId)
      const contact = client?.contacts.find((c) => c.id === action.contactId) ?? client?.contacts[0]
      if (!client || !contact) return state
      if (action.doc.type === "receipt") {
        const matched = matchReceipt(state, client.id, contact.name, action.doc)
        if (matched) return matched
      }
      const item = documentItem(state, client.id, contact.name, action.doc)
      return item ? { ...state, items: [...state.items, item] } : state
    }

    case "credit_note_arrived": {
      const invoice = state.items.find((i) => i.id === action.invoiceId)
      if (!invoice || creditNoteFor(state, invoice.id)) return state
      const line = invoice.suggestion.lines[0]
      const note: ReviewItem = {
        ...invoice,
        id: `${invoice.id}-cn`,
        creditFor: invoice.id,
        // A fresh document: nothing flagged, nobody on it yet.
        issue: undefined,
        assigneeId: undefined,
        handoff: undefined,
        notes: undefined,
        snoozedUntil: undefined,
        period: isWorkable(monthStatus(invoice.clientId, invoice.period, state)) ? invoice.period : OPEN_MONTH,
        subtitle: `Credit note for invoice of ${dayLabel(invoice.date)}`,
        date: TODAY,
        dueDate: TODAY,
        amount: Math.abs(invoice.amount),
        status: "needs_review",
        voucherNo: undefined,
        requestId: undefined,
        backdated: undefined,
        approvedEarlier: undefined,
        evidence: { label: "Credit note", attached: true, fileName: `credit-note-${invoice.id.slice(-6)}.pdf` },
        facts: [
          { label: "Supplier", value: invoice.title },
          { label: "Credits", value: `Invoice of ${dayLabel(invoice.date)}, ${nok(invoice.amount)}` },
          { label: "Received", value: `${dayLabel(TODAY)} · EHF` },
        ],
        suggestion: {
          lines: [{ ...line, amount: Math.abs(line.amount) }],
          confidence: 0.98,
          reasoning: [
            `Credit note from ${invoice.title} for the full ${nok(invoice.amount)}, referencing the rejected invoice.`,
            `Booked against ${line.account} with the same VAT, it clears the invoice on 2400: nothing is paid.`,
          ],
        },
        activity: [log("system", `Credit note received from ${invoice.title}`, "Through the Tripletex EHF inbox.")],
      }
      return {
        ...state,
        items: [
          ...state.items.map((i) =>
            i.id === invoice.id
              ? { ...i, activity: [...i.activity, log("system", "Credit note received", "In the inbox to book.")] }
              : i
          ),
          note,
        ],
      }
    }

    case "remind_supplier":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.invoiceId
            ? {
                ...i,
                activity: [
                  ...i.activity,
                  log("accountant", `Reminded ${i.title} about the credit note · ${CURRENT_USER.name}`, "By e-mail."),
                ],
              }
            : i
        ),
      }
  }
}
