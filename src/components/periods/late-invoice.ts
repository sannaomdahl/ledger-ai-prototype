// The two ways to book an invoice that turns up after its month closed, in
// the words the panel and the "Add invoice" dialog share. VAT belongs to
// the term of the invoice date; booking a small one in the next term is
// common practice that accepts a small risk, not a rule. Said plainly, once.
import { formatAmount } from "@/lib/accounting/format"
import { LATE_INVOICE_LIMIT } from "@/lib/accounting/periods"

/** Book it where it turned up, or reopen its month: the firm's habit. */
export function recommendReopen(amount: number) {
  return Math.abs(amount) >= LATE_INVOICE_LIMIT
}

export function bookHereHint(nextTerm: string) {
  return `Input VAT goes in ${nextTerm}. Common for small amounts, but not a rule: VAT belongs to the term of the invoice date (mval § 15-9).`
}

export function reopenHint({
  name,
  term,
  filed,
  reopened,
  first,
}: {
  /** The month's name, "August". */
  name: string
  term: string
  filed: boolean
  /** The month is reopened already. */
  reopened: boolean
  /** The customer's first name. */
  first: string
}) {
  const vat = filed ? `VAT lands in ${term}, which needs a corrected return.` : `VAT lands in ${term}, where it belongs.`
  return reopened
    ? `${name} is reopened already. ${vat}`
    : `${vat} ${first} gets an updated ${name} report when you close it again.`
}

export const LIMIT_NOTE = `The firm books forgotten invoices under ${formatAmount(LATE_INVOICE_LIMIT)} in the current month and reopens for bigger ones.`
