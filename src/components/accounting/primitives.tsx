"use client"

// Small pieces shared by the grids, sheet and board. Each one is lifted from an
// installed block (named per component) so the app keeps one visual grammar.
import type { ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import { Item, ItemMedia } from "@/components/ui/item"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import type { Client, Domain, ItemStatus } from "@/lib/accounting/types"
import { IconTile } from "@/components/reui/icon-tile"
import { Building2Icon } from "lucide-react"
import { confidenceTone, formatPercent, ITEM_STATUS_META } from "./meta"

/** data-grid-filtering-2 · AutomationKindChip */
export function IconChip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Item
      render={<span />}
      className={cn(
        "p-0",
        "border-background bg-muted flex size-9 shrink-0 items-center justify-center border-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-4",
        className
      )}
      aria-hidden="true"
    >
      <ItemMedia variant="icon" className="size-auto">
        {children}
      </ItemMedia>
    </Item>
  )
}

/** One icon for every client, in ReUI's IconTile. Unified on purpose: with
    hundreds of clients, the name carries identity, not the glyph. */
export function ClientChip({
  size = "sm",
  className,
  replied = false,
}: {
  client?: Pick<Client, "industryKey">
  size?: "xs" | "sm" | "default"
  className?: string
  /** Blue dot: a customer answered and it's waiting on you. */
  replied?: boolean
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <IconTile variant="outline" size={size} className="text-muted-foreground">
        <Building2Icon aria-hidden="true" />
      </IconTile>
      {replied ? (
        <span
          className="bg-info ring-background absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2"
          aria-hidden="true"
        />
      ) : null}
    </span>
  )
}

/** What a customer needs from me, as two dots: purple = customer replies
    waiting, orange = my first decisions. An empty slot keeps a grey dot, so
    every row lines up. Counts live in the label (and the row's tooltip). */
export function AttentionIndicators({
  replied,
  decide,
}: {
  replied: number
  decide: number
}) {
  const label = [
    replied ? `${replied} customer ${replied === 1 ? "reply" : "replies"} to review` : "",
    decide ? `${decide} waiting for your decision` : "",
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <Dot className={replied > 0 ? "bg-info" : undefined} />
      <Dot className={decide > 0 ? "bg-warning" : undefined} />
    </span>
  )
}

function Dot({ className }: { className?: string }) {
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", className ?? "bg-muted-foreground/20")}
      aria-hidden="true"
    />
  )
}

/** data-grid-filtering-2 · StateCell */
export function StatusBadge({
  status,
  domain,
}: {
  status: ItemStatus
  /** A pay line isn't booked on its own: it is approved for the run. */
  domain?: Domain
}) {
  const meta = ITEM_STATUS_META[status]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", meta.dotClassName)}
        aria-hidden="true"
      />
      {domain === "payroll" && status === "booked" ? "Approved" : meta.label}
    </Badge>
  )
}

/** kanban-board-9 · CandidateMatch, reworded to the agent's confidence. */
export function ConfidenceMeter({
  value,
  label = "Confidence",
  compact = false,
}: {
  value: number
  label?: string
  compact?: boolean
}) {
  const tone = confidenceTone(value)

  return (
    <div className={cn("flex flex-col", compact ? "gap-1" : "gap-1.5")}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn(
            "text-muted-foreground leading-none font-medium",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "leading-none font-semibold tabular-nums",
            compact ? "text-xs" : "text-sm",
            tone.text
          )}
        >
          {formatPercent(value)}
        </span>
      </div>

      <Progress
        value={Math.round(value * 100)}
        className={cn(
          "**:data-[slot=progress-track]:bg-muted gap-0 **:data-[slot=progress-indicator]:rounded-full **:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-track]:rounded-full",
          tone.indicator
        )}
      >
        <ProgressLabel className="sr-only">{label}</ProgressLabel>
      </Progress>
    </div>
  )
}

/** solution-crm-4 · DotSeparator */
export function DotSeparator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted-foreground/40 size-1 shrink-0 rounded-full",
        className
      )}
      aria-hidden="true"
    />
  )
}
