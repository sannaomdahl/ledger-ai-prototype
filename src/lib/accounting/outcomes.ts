// The ways a line can be settled besides "book it as suggested". Each one
// belongs to a flag the agent raised: a pay line with unapproved overtime is
// settled by approving the overtime or by paying without it, not by
// "booking" it.
import type { IssueKind, PostingLine, ReviewItem } from "./types"

export type Outcome =
  | "approve_overtime"
  | "without_overtime"
  | "withholding_50"
  | "register_sick_leave"
  | "with_bonus"
  | "without_bonus"
  | "to_shareholder"
  | "without_receipt"

type OutcomeSpec = {
  /** Button and menu label. */
  label: string
  /** The flag it answers. */
  issue: IssueKind
  /** What the trail says the accountant decided. */
  log: string
  /** The toast after it's done. */
  done: string
  /** New lines, when the decision changes the posting or the pay. */
  lines?: (item: ReviewItem) => PostingLine[]
}

const BONUS = 5000

export const OUTCOMES: Record<Outcome, OutcomeSpec> = {
  approve_overtime: {
    label: "Approve overtime",
    issue: "overtime_unapproved",
    log: "Approved the overtime",
    done: "Overtime approved",
  },
  without_overtime: {
    label: "Pay without overtime",
    issue: "overtime_unapproved",
    log: "Left the overtime out of this run",
    done: "Approved without overtime",
    lines: (item) =>
      item.suggestion.lines.filter((l) => !l.account.startsWith("Overtime")),
  },
  withholding_50: {
    label: "Use 50% withholding",
    issue: "missing_tax_card",
    log: "Set tax withholding to 50% until the tax card arrives",
    done: "Approved with 50% withholding",
  },
  register_sick_leave: {
    label: "Register sick leave",
    issue: "sick_leave",
    log: "Registered the sick leave in the employer period",
    done: "Sick leave registered",
  },
  with_bonus: {
    label: "Add bonus & approve",
    issue: "unregistered_bonus",
    log: `Added the ${BONUS.toLocaleString("nb-NO")} kr bonus from the e-mail`,
    done: "Approved with bonus",
    lines: (item) => [
      ...item.suggestion.lines,
      { account: "Bonus · one-off", amount: BONUS },
    ],
  },
  without_bonus: {
    label: "Approve without bonus",
    issue: "unregistered_bonus",
    log: "Left the bonus for a later run",
    done: "Approved without bonus",
  },
  to_shareholder: {
    label: "Book to shareholder",
    issue: "private_expense",
    log: "Booked as a private expense on 1570",
    done: "Booked to shareholder",
    lines: (item) => [
      { account: "1570 Receivable, shareholder", vat: "0 · No VAT", amount: item.amount },
    ],
  },
  without_receipt: {
    label: "Book without receipt",
    issue: "missing_receipt",
    log: "Booked without a receipt, no input VAT",
    done: "Booked without receipt",
    // Without a receipt there is no input VAT to deduct: it's all cost.
    lines: (item) => item.suggestion.lines.map((l) => ({ ...l, vat: "0 · No VAT" })),
  },
}

/** Pay follows the lines; a bank line's amount never changes. */
export function settle(item: ReviewItem, outcome?: Outcome): Partial<ReviewItem> {
  const lines = outcome ? OUTCOMES[outcome].lines?.(item) : undefined
  if (!lines) return {}
  return {
    suggestion: { ...item.suggestion, lines },
    amount:
      item.domain === "payroll"
        ? lines.reduce((sum, l) => sum + l.amount, 0)
        : item.amount,
  }
}
