"use client"

// What stands out on a pay line compared with the person's earlier months
// and agreement, or that it is the same as always. A short flag in the
// payroll table, a fuller note in the detail panel. The anomaly itself
// reads like every other anomaly (see anomaly.tsx); the detail panel shows
// it in its callout on top.
import type { ReactNode } from "react"
import { CheckIcon, CircleDashedIcon, XCircleIcon } from "lucide-react"

import { AnomalyLine } from "@/components/accounting/anomaly"
import { formatNok } from "@/components/accounting/meta"
import { dayLabel, isOpenPeriod } from "@/lib/accounting/data"
import {
  customerRejection,
  employeeFor,
  employeesOf,
  forFirm,
  isSameAsAlways,
  payAnomaly,
  payAnomalyOf,
  UNCONFIRMED,
  peopleOf,
} from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"
import type { ReviewItem } from "@/lib/accounting/types"

function usePayFlag(item: ReviewItem) {
  const { state } = useAccounting()
  const employee = employeeFor(employeesOf(state, item.clientId), item)
  const corrections = peopleOf(state).corrections
  const anomaly = payAnomaly(item, state.items, employee, corrections)
  const flagged = payAnomalyOf(item, state.items, employee, corrections)
  return { employee, anomaly, flagged, same: isSameAsAlways(item, employee, anomaly) }
}

/** One line under the status in the pay-line queue, or a cell of its own in
    the payroll table, where `fallback` says that nothing stands out. There
    the agreement column already says when pay isn't confirmed yet. */
export function PayFlag({ item, fallback }: { item: ReviewItem; fallback?: ReactNode }) {
  const { anomaly, flagged, same } = usePayFlag(item)
  if (same) return <span className="text-success-text text-xs">Same as always</span>
  if (flagged) return <AnomalyLine anomalies={[flagged]} />
  if (!anomaly || fallback) return fallback ?? null
  return (
    <span className="text-muted-foreground flex max-w-full min-w-0 items-center gap-1 overflow-hidden text-xs [&_svg]:size-3 [&_svg]:shrink-0">
      <CircleDashedIcon aria-hidden="true" />
      <span className="truncate">{forFirm(anomaly)}</span>
    </span>
  )
}

/** Under the pay lines in the detail panel. */
export function PayLineNote({ item }: { item: ReviewItem }) {
  const { state } = useAccounting()
  const { employee, anomaly, flagged, same } = usePayFlag(item)
  if (item.domain !== "payroll") return null
  // The customer said no to this pay: that comes first, in their words.
  const rejection = customerRejection(state, item)
  if (rejection)
    return (
      <p className="text-muted-foreground mt-3 flex items-start gap-2 text-xs text-pretty">
        <XCircleIcon className="text-destructive mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="text-destructive font-medium">
            Rejected by {rejection.by}
            {rejection.note ? `: “${rejection.note}”` : ""}.
          </span>{" "}
          {rejection.corrected
            ? `Corrected to ${formatNok(item.amount)}: approve it, then send it to ${rejection.by.split(" ")[0]} again from the pay run.`
            : "Correct the pay and approve it, then send it to them again. Or move it to next month."}
        </span>
      </p>
    )
  // In an open month an anomaly has the callout on top of the panel.
  if (flagged) return isOpenPeriod(item) ? null : <AnomalyLine anomalies={[flagged]} className="mt-3" />
  if (anomaly === UNCONFIRMED)
    return (
      <p className="text-muted-foreground mt-3 flex items-start gap-2 text-xs text-pretty">
        <CircleDashedIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>{forFirm(anomaly)}. Marked for the customer when they approve the run.</span>
      </p>
    )
  if (!employee?.confirmed) return null
  return (
    <p className="text-muted-foreground mt-3 flex items-start gap-2 text-xs text-pretty">
      <CheckIcon className="text-success-text mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {same ? "Same as always. " : ""}
        {employee.confirmed.via === "onboarding"
          ? "Pay agreed in onboarding."
          : `${employee.confirmed.by} confirmed this pay on ${dayLabel(employee.confirmed.at)}: same pay from now on.`}
      </span>
    </p>
  )
}
