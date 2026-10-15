// What the accountant has signed off, beyond booking lines: closed months
// (the report went out), approved pay runs, submitted filings and fixed bank
// issues. The store holds them; these helpers read them.
import { MONTHS } from "./data"
import { monthStatus, type PeriodsState } from "./periods"
import { type Closing } from "./report"
import type { Progress } from "./types"

export const EMPTY_PROGRESS: Progress = {
  payRuns: {},
  filings: {},
  corrections: {},
  recon: {},
  matches: {},
}

/** Where the demo starts: nothing signed beyond the seed. The Jul–Aug VAT
    returns went in by 10 Oct (see filings.ts), so a late August invoice
    needs a corrected return. */
export function seedProgress(): Progress {
  return EMPTY_PROGRESS
}

/** The part of the store that knows what is signed. `state` fits.
    `periods` carries reopened months; without it a month counts as it was
    last closed. */
export type Signoffs = { closing: Closing; progress: Progress; periods?: PeriodsState }

export const NO_SIGNOFFS: Signoffs = { closing: {}, progress: EMPTY_PROGRESS }

/** Closed in the seed (older months) or by the accountant sending the
    monthly report, and not reopened since. A month before we took the
    client over was closed by whoever kept the books then. */
export function isMonthClosed(
  clientId: string,
  month: string,
  signed: Pick<Signoffs, "closing" | "periods">
) {
  const status = monthStatus(clientId, month, signed)
  return status === "closed" || status === "before"
}

/** The month's regular run is approved (follow-up runs may still come). */
export function isPayRunApproved(clientId: string, month: string, progress: Progress) {
  const meta = MONTHS.find((m) => m.id === month)
  return (
    meta?.status === "closed" ||
    Object.values(progress.payRuns).some((r) => r.clientId === clientId && r.month === month)
  )
}
