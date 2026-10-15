"use client"

// "My customers": everyone I'm responsible for, most urgent first. It
// replaces a hand-pinned list, which doesn't scale to hundreds of clients:
// the list orders itself, and customers with nothing waiting sink to the end. Two indicators per row, because they ask for
// different things: a customer answered (blue), or something needs my first
// decision (amber).
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2Icon } from "lucide-react"
import { AttentionIndicators } from "@/components/accounting/primitives"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { OPEN_MONTH } from "@/lib/accounting/data"
import { getClientDeadlines } from "@/lib/accounting/deadlines"
import {
  getClientStats,
  scopedClients,
  useAccounting,
} from "@/lib/accounting/store"
import type { Client } from "@/lib/accounting/types"

function ClientItem({
  client,
  replied,
  decide,
}: {
  client: Client
  /** Customer answers waiting for me. */
  replied: number
  /** Lines to review plus agent drafts waiting for my first call. */
  decide: number
}) {
  const pathname = usePathname()
  const href = `/clients/${client.id}`
  const tooltip = [
    client.name,
    replied ? `${replied} ${replied === 1 ? "reply" : "replies"} to review` : "",
    decide ? `${decide} waiting for your decision` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <SidebarMenuItem>
      {/* Sidebar */}
      <SidebarMenuButton
        tooltip={tooltip}
        isActive={pathname.startsWith(href)}
        render={<Link href={href} />}
      >
        <Building2Icon aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{client.name}</span>
        <span className="ml-auto group-data-[collapsible=icon]:hidden">
          <AttentionIndicators replied={replied} decide={decide} />
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function NavProjects() {
  const { state } = useAccounting()
  const ranked = scopedClients("mine")
    .map((client) => {
      const stats = getClientStats(
        state.items,
        client.id,
        state.requests,
        OPEN_MONTH,
        state
      )
      const nextBlocked = getClientDeadlines(
        client,
        OPEN_MONTH,
        state.items,
        state.requests,
        state
      ).find((d) => d.status === "blocked")
      return {
        client,
        // Answers and questions from the customer both wait on me.
        replied: stats.replied + stats.questions,
        decide: stats.toReview + stats.drafts,
        nextBlocked: nextBlocked?.date ?? "9999",
      }
    })
    // Priority: answers already back with me, then the deadline that is
    // closest to being missed, then the amount of work. Customers with
    // nothing waiting go last, alphabetically.
    .sort(
      (a, b) =>
        Number(b.replied > 0) - Number(a.replied > 0) ||
        a.nextBlocked.localeCompare(b.nextBlocked) ||
        b.replied + b.decide - (a.replied + a.decide) ||
        a.client.name.localeCompare(b.client.name)
    )
  const waiting = ranked.filter((row) => row.replied + row.decide > 0).length
  const shown = ranked

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="justify-between">
        My customers
        <span
          className="text-sidebar-foreground/60 tabular-nums"
          title={`${waiting} of ${ranked.length} need you`}
        >
          {waiting}/{ranked.length}
        </span>
      </SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu className="gap-0.25">
          {shown.length === 0 ? (
            <p className="text-sidebar-foreground/60 px-2 py-1.5 text-xs">
              No customers assigned to you.
            </p>
          ) : (
            shown.map((row) => (
              <ClientItem
                key={row.client.id}
                client={row.client}
                replied={row.replied}
                decide={row.decide}
              />
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
