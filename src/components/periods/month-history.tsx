"use client"

// A month's closes and reopens, oldest first: "Closed 8 Aug · Reopened
// 28 Sep by Ingrid Hansen: 5 forgotten invoices · Closed again 28 Sep". The
// trail an auditor (or a colleague) asks for when a report changed.
import { cn } from "cn"
import { LockIcon, LockOpenIcon } from "lucide-react"

import type { MonthEvent } from "@/lib/accounting/periods"

export function MonthHistory({ history }: { history: MonthEvent[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {history.map((event, index) => {
        const closes = history.slice(0, index + 1).filter((e) => e.kind === "closed").length
        const label =
          event.kind === "reopened"
            ? "Reopened"
            : closes > 1
              ? "Closed again, updated report sent"
              : "Closed, report sent"
        const latest = index === history.length - 1
        return (
          <li key={`${event.kind}-${index}`} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full [&_svg]:size-2.5",
                event.kind === "reopened"
                  ? "bg-warning/15 text-warning-text"
                  : "bg-success/15 text-success-text",
                !latest && "opacity-70"
              )}
              aria-hidden="true"
            >
              {event.kind === "reopened" ? <LockOpenIcon /> : <LockIcon />}
            </span>
            <span className="min-w-0 text-pretty">
              <span className={cn("font-medium", latest ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>{" "}
              <span className="text-muted-foreground">
                {event.on} by {event.by}
                {event.reason ? `: ${event.reason}` : ""}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
