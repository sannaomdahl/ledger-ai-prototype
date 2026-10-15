"use client"

// One step of a loop track: the payroll run (check-in → pay lines →
// customer approval → run) and bookkeeping (book → approval → paid) share it.
import { CheckIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

export type StepState = "done" | "current" | "waiting" | "late" | "next"

const BAR: Record<StepState, string> = {
  done: "bg-success",
  current: "bg-foreground/70",
  waiting: "bg-warning",
  late: "bg-destructive",
  next: "bg-border",
}

export function TrackStep({
  state,
  icon,
  title,
  children,
}: {
  state: StepState
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <span className={cn("h-1.5 w-full rounded-full", BAR[state])} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
            state === "next" ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {state === "done" ? <CheckIcon className="text-success-text" aria-hidden="true" /> : icon}
          {title}
          <span className="sr-only">
            {state === "done" ? ", done" : state === "waiting" ? ", waiting" : state === "late" ? ", overdue" : ""}
          </span>
        </span>
        {children}
      </div>
    </li>
  )
}

/** One thing a step says, and what to do about it. */
export function StepLine({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs text-pretty">{children}</span>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}
