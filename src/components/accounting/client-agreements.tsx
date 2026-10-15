"use client"

// Two standing agreements on a client's Overview: who does what (the
// division of work in the engagement agreement, carried over from
// onboarding or seeded for clients from before), and what the agents were
// taught ("always book this supplier like this"), with a way to take a rule
// back.
import { useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { BuildingIcon, GraduationCapIcon, UserIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ACCOUNTANT_BY_ID, OPEN_MONTH, TEAM_BY_ID } from "@/lib/accounting/data"
import { formatDay } from "@/lib/accounting/onboarding"
import { ruleFor } from "@/lib/accounting/rules"
import { useAccounting } from "@/lib/accounting/store"
import type { Client } from "@/lib/accounting/types"

/** Rows per side before "Show all". */
const FOLDED = 3

export function WhoDoesWhat({ client }: { client: Client }) {
  const [all, setAll] = useState(false)
  const routines = (client.profile.routines ?? []).filter((r) => r.task)
  if (!routines.length) return null
  const sides = [
    { who: "customer" as const, label: client.contacts[0]?.name.split(" ")[0] ?? "Customer", icon: <UserIcon className="size-3.5" aria-hidden="true" /> },
    { who: "firm" as const, label: "Sanna", icon: <BuildingIcon className="size-3.5" aria-hidden="true" /> },
  ]
  const hidden = sides.reduce((n, s) => n + Math.max(0, routines.filter((r) => r.who === s.who).length - FOLDED), 0)

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Who does what</FrameTitle>
        <FrameDescription className="text-xs">
          {client.since ? "Agreed in onboarding, part of the engagement agreement" : "From the engagement agreement"}
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-0 p-0">
        {sides.map((side, index) => {
          const rows = routines.filter((r) => r.who === side.who)
          return (
            <div key={side.who}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <div className="text-muted-foreground flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-xs font-medium">
                {side.icon}
                {side.label}
              </div>
              <ul className="flex flex-col pb-1.5">
                {(all ? rows : rows.slice(0, FOLDED)).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 px-3 py-1">
                    <span className="text-foreground min-w-0 text-[13px] leading-5 text-pretty">{r.task}</span>
                    <span className="text-muted-foreground shrink-0 text-right text-xs">{r.when}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {hidden ? (
          <>
            <Separator className="opacity-60" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground m-1"
              onClick={() => setAll((v) => !v)}
            >
              {all ? "Show fewer" : `Show all ${routines.length}`}
            </Button>
          </>
        ) : null}
      </FramePanel>
    </Frame>
  )
}

export function AgentRules({ client }: { client: Client }) {
  const { state, dispatch } = useAccounting()
  const rules = state.rules.filter((r) => r.clientId === client.id)
  const used = (match: string) =>
    state.items.filter(
      (i) => i.period === OPEN_MONTH && ruleFor(rules, i)?.match === match
    ).length

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-px">
          <FrameTitle>What the agents learned</FrameTitle>
          <FrameDescription className="text-xs">
            Rules for every new line from the supplier
          </FrameDescription>
        </div>
        <Badge variant="outline" className="tabular-nums">
          {rules.length}
        </Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-0 p-0">
        {rules.length === 0 ? (
          <p className="text-muted-foreground flex gap-2 px-3 py-4 text-xs text-pretty">
            <GraduationCapIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Nothing yet. Pick &ldquo;Always book like this&rdquo; on a line and the agents book that supplier the same
              way from then on.
            </span>
          </p>
        ) : (
          rules.map((rule, index) => {
            const who = TEAM_BY_ID.get(rule.createdBy) ?? ACCOUNTANT_BY_ID.get(rule.createdBy)
            const n = used(rule.match)
            return (
              <div key={rule.id}>
                {index > 0 ? <Separator className="opacity-60" /> : null}
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-foreground truncate text-sm font-medium">{rule.match}</span>
                    <span className="text-muted-foreground text-xs text-pretty">
                      {rule.account}
                      {rule.vat ? ` · VAT ${rule.vat}` : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {who?.name ?? rule.createdBy} · {formatDay(rule.createdAt)} {rule.createdAt.slice(0, 4)}
                      {n ? ` · used on ${n} ${n === 1 ? "line" : "lines"} this month` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove the rule for ${rule.match}`}
                    title="Remove rule"
                    onClick={() => {
                      dispatch({ type: "remove_rule", ruleId: rule.id })
                      toast.success("Rule removed", {
                        description: `The agents suggest ${rule.match} from history again. Lines already booked stay as they are.`,
                      })
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </FramePanel>
    </Frame>
  )
}
