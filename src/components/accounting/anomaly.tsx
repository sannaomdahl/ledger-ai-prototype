"use client"

// How an anomaly looks wherever it shows up: one icon, one colour, one
// word. A pill on rows and steps, a line in a few words under a status, a
// list with the numbers in the detail panel and on the approval list. The
// firm reads "Anomaly"; the customer only ever sees the plain words.
import { Badge, type BadgeProps } from "@/components/reui/badge"
import { cn } from "cn"
import { ActivityIcon } from "lucide-react"

import type { Anomaly } from "@/lib/accounting/types"

export { ActivityIcon as AnomalyIcon }

/** "Anomaly", or "2 anomalies". The details sit in the tooltip. */
export function AnomalyBadge({
  anomalies,
  size = "sm",
  className,
}: {
  anomalies: Anomaly[]
  size?: BadgeProps["size"]
  className?: string
}) {
  if (!anomalies.length) return null
  return (
    <Badge
      variant="warning-light"
      size={size}
      title={anomalies.map((a) => a.detail).join("\n")}
      className={cn("shrink-0 gap-1 font-medium [&_svg]:size-3", className)}
    >
      <ActivityIcon aria-hidden="true" />
      {anomalyCount(anomalies.length)}
    </Badge>
  )
}

export function anomalyCount(n: number) {
  return n === 1 ? "Anomaly" : `${n} anomalies`
}

/** The first anomaly in a few words, under a row's status. */
export function AnomalyLine({ anomalies, className }: { anomalies: Anomaly[]; className?: string }) {
  if (!anomalies.length) return null
  return (
    <span
      title={anomalies.map((a) => a.detail).join("\n")}
      className={cn(
        "text-warning-text flex max-w-full min-w-0 items-center gap-1 overflow-hidden text-xs [&_svg]:size-3 [&_svg]:shrink-0",
        className
      )}
    >
      <ActivityIcon aria-hidden="true" />
      <span className="truncate">
        {anomalies[0].short}
        {anomalies.length > 1 ? ` +${anomalies.length - 1}` : ""}
      </span>
    </span>
  )
}

/** Every anomaly with the numbers behind it. */
export function AnomalyList({ anomalies, className }: { anomalies: Anomaly[]; className?: string }) {
  if (!anomalies.length) return null
  return (
    <ul className={cn("flex flex-col gap-0.5", className)}>
      {anomalies.map((a) => (
        <li
          key={a.kind}
          className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-xs text-pretty"
        >
          <ActivityIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {a.detail}
        </li>
      ))}
    </ul>
  )
}

/** On top of the detail panel: what stands out, and what happens because
    of it. */
export function AnomalyCallout({
  anomalies,
  outcome,
  className,
}: {
  anomalies: Anomaly[]
  /** What the anomaly sets off, in one sentence. */
  outcome: string
  className?: string
}) {
  if (!anomalies.length) return null
  return (
    <div
      className={cn(
        "border-warning/25 bg-warning/8 dark:border-warning/25 dark:bg-warning/10 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5",
        className
      )}
    >
      <div className="text-warning-foreground dark:text-warning flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
        <ActivityIcon aria-hidden="true" />
        {anomalyCount(anomalies.length)}
      </div>
      <ul className="flex flex-col gap-1">
        {anomalies.map((a) => (
          <li key={a.kind} className="text-foreground text-sm text-pretty">
            {a.detail}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs text-pretty">{outcome}</p>
    </div>
  )
}

/** "2 anomalies" inline, in a sentence on a step or a header. */
export function AnomalyCount({ n, suffix, className }: { n: number; suffix?: string; className?: string }) {
  if (!n) return null
  return (
    <span
      className={cn(
        "text-warning-text inline-flex items-center gap-1 align-bottom whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        className
      )}
    >
      <ActivityIcon aria-hidden="true" />
      {n} {n === 1 ? "anomaly" : "anomalies"}
      {suffix ? ` ${suffix}` : ""}
    </span>
  )
}
