"use client"

import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"

import { Progress } from "@/components/ui/progress"
import { SidebarGroup } from "@/components/ui/sidebar"
import { MONTHS, OPEN_MONTH } from "@/lib/accounting/data"
import { scopedClients, useAccounting } from "@/lib/accounting/store"


export function SpendingLimit() {
  const { state } = useAccounting()
  const mine = new Set(scopedClients("mine").map((c) => c.id))
  const month = MONTHS.find((m) => m.id === OPEN_MONTH) ?? MONTHS[0]
  const lines = state.items.filter(
    (i) => mine.has(i.clientId) && i.period === OPEN_MONTH
  )
  const booked = lines.filter((i) => i.status === "booked").length
  const pct = Math.round((booked / Math.max(1, lines.length)) * 100)
  const CLOSE = {
    label: `${month.label.split(" ")[0]} close · my customers`,
    resetLabel:
      month.status === "open"
        ? `${lines.length - booked} lines left · ${month.note.toLowerCase()}`
        : month.note,
  }
  const freePct = 100 - pct

  return (
    <SidebarGroup className="overflow-hidden group-data-[collapsible=icon]:hidden">
      <Frame
        spacing="xs"
        dense
        className="border-border shrink-0 border md:w-[225px]"
      >
        <FrameHeader>
          <FrameTitle className="text-warning-text text-xs">
            {CLOSE.label}
          </FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-2">
          <p className="text-muted-foreground text-xs leading-snug">
            {CLOSE.resetLabel}
          </p>

          <div className="bg-muted/55 relative h-1.5 overflow-hidden rounded-sm">
            <div
              className="text-muted-foreground pointer-events-none absolute inset-0 opacity-20"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 4px)",
              }}
            />
            <Progress
              value={pct}
              className="**:data-[slot=progress-indicator]:bg-success absolute inset-0 gap-0 **:data-[slot=progress-indicator]:rounded-none **:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between text-xs leading-none">
            <div className="flex items-center gap-1">
              <span className="text-foreground font-semibold">{pct}%</span>
              <span className="text-muted-foreground">Booked</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-foreground font-semibold">{freePct}%</span>
              <span className="text-muted-foreground">Open</span>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </SidebarGroup>
  )
}