"use client"

// Small pieces the onboarding list, case page and the company's link share:
// the register/SAF-T light, who holds the case, and the phase it is in.
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"

import {
  BALL_META,
  PHASES,
  phaseIndex,
  type Ball,
  type CaseStatus,
  type Light,
  type OnboardingCase,
} from "@/lib/accounting/onboarding"

const LIGHT_CLASS: Record<Light, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  grey: "bg-muted-foreground/30",
}

export const LIGHT_LABEL: Record<Light, string> = {
  green: "OK",
  yellow: "Look closer",
  red: "Blocks",
  grey: "Not scored",
}

export function LightDot({ light, className }: { light: Light; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", LIGHT_CLASS[light], className)}
      aria-hidden="true"
    />
  )
}

/** Who holds the case, as a dot and a short status line. */
export function StatusLine({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", BALL_META[status.ball].dot)}
        aria-hidden="true"
      />
      <span className="truncate">{status.label}</span>
    </span>
  )
}

const BALL_BADGE: Record<Ball, React.ComponentProps<typeof Badge>["variant"]> = {
  us: "warning-light",
  customer: "info-light",
  ready: "success-light",
  waiting: "outline",
  done: "success-light",
  declined: "outline",
}

export function BallBadge({ ball }: { ball: Ball }) {
  return (
    <Badge variant={BALL_BADGE[ball]} size="sm">
      {BALL_META[ball].label}
    </Badge>
  )
}

/** The phase as a label over four short segments, filled up to it; all
    four once the company is handed over. */
export function PhaseMeter({ c }: { c: OnboardingCase }) {
  const current = c.handedOver ? PHASES.length : phaseIndex(c.phase)
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-foreground truncate text-sm">
        {c.handedOver ? "Handed over" : PHASES[current].label}
      </span>
      <span className="flex gap-0.5" aria-hidden="true">
        {PHASES.map((step, index) => (
          <span
            key={step.id}
            className={cn(
              "h-1 w-4 rounded-full",
              c.declined
                ? "bg-muted"
                : index < current
                  ? "bg-success"
                  : index === current
                    ? "bg-foreground/70"
                    : "bg-muted"
            )}
          />
        ))}
      </span>
    </span>
  )
}
