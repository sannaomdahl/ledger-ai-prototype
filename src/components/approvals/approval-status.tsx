"use client"

// The small pieces the approval views share: why an invoice needs a real
// look (or doesn't), and the overdue flag. One vocabulary for this week's
// list on Bookkeeping and the detail panel.
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"
import { CircleDashedIcon, ThumbsUpIcon } from "lucide-react"

import { AnomalyList } from "@/components/accounting/anomaly"

import { approvalReason, dayLabel, type InvoiceApproval } from "@/lib/accounting/approvals"
import type { BadgeProps } from "@/components/reui/badge"

/** "Overdue, due 24 Sep": past its due date and not approved. */
export function OverdueBadge({ due, size }: { due: string; size?: BadgeProps["size"] }) {
  return (
    <Badge variant="destructive-light" size={size} className="shrink-0">
      Overdue, due {dayLabel(due)}
    </Badge>
  )
}

/** Why a line needs a look, or why it doesn't, in one or two short lines:
    its anomalies, a supplier that isn't approved yet (nothing unusual,
    just not on the list), or who approved the supplier. */
export function LookReason({ row, className }: { row: InvoiceApproval; className?: string }) {
  if (row.anomalies.length) return <AnomalyList anomalies={row.anomalies} className={className} />
  if (!row.supplier)
    return (
      <p className={cn("text-muted-foreground flex items-start gap-1.5 text-xs", className)}>
        <CircleDashedIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Not on the approved suppliers yet
      </p>
    )
  return (
    <p className={cn("text-muted-foreground flex items-start gap-1.5 text-xs", className)}>
      <ThumbsUpIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {approvalReason(row.supplier)}
    </p>
  )
}
