"use client"

// Month switcher: the ReUI c-button-group-27 pattern (Select with a status dot
// inside a ButtonGroup), flanked by previous/next month buttons.
import { cn } from "cn"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PeriodMeta } from "@/lib/accounting/data"
import type { MonthStatus } from "@/lib/accounting/periods"

/** A month as the switcher shows it: its own client's status. */
export type SwitcherPeriod = Omit<PeriodMeta, "status"> & {
  status: PeriodMeta["status"] | MonthStatus
}

const STATUS_DOT: Record<SwitcherPeriod["status"], string> = {
  open: "bg-amber-500",
  closed: "bg-emerald-500",
  reopened: "bg-amber-500 ring-2 ring-amber-500/25",
  before: "bg-zinc-300 dark:bg-zinc-600",
}

function PeriodLabel({ period }: { period: SwitcherPeriod }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[period.status])}
        aria-hidden="true"
      />
      <span>{period.label}</span>
    </span>
  )
}

export function PeriodSwitcher({
  periods,
  value,
  onValueChange,
}: {
  /** Newest first. */
  periods: SwitcherPeriod[]
  value: string
  onValueChange: (id: string) => void
}) {
  const index = periods.findIndex((p) => p.id === value)
  const current = periods[index] ?? periods[0]

  return (
    <ButtonGroup aria-label="Period">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous month"
        disabled={index >= periods.length - 1}
        onClick={() => onValueChange(periods[index + 1].id)}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <Select
        value={current.id}
        items={periods.map((p) => ({ value: p.id, label: p.label }))}
        onValueChange={(next) => next && onValueChange(next)}
      >
        <SelectTrigger className="min-w-48" aria-label="Choose period">
          <SelectValue>
            {(id: string) => {
              const item = periods.find((p) => p.id === id)
              return item ? <PeriodLabel period={item} /> : null
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {periods.map((period) => (
              <SelectItem key={period.id} value={period.id}>
                <span className="flex w-full items-center justify-between gap-4">
                  <PeriodLabel period={period} />
                  <span className="text-muted-foreground text-xs">
                    {period.note}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next month"
        disabled={index <= 0}
        onClick={() => onValueChange(periods[index - 1].id)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </ButtonGroup>
  )
}
