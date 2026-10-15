"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { CURRENT_USER, OPEN_MONTH } from "@/lib/accounting/data"
import { getClientFilings } from "@/lib/accounting/filings"
import { isOnboarding } from "@/lib/accounting/onboarding"
import { scopedClients, useAccounting } from "@/lib/accounting/store"
import { NAV_MAIN, type NavItem } from "./data"

function isActive(pathname: string, href?: string) {
  if (!href) return false
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

function LeafNavItem({ item, badge }: { item: NavItem; badge?: number }) {
  const pathname = usePathname()
  return (
    <SidebarMenuItem>
      {/* Sidebar */}
      <SidebarMenuButton
        tooltip={item.label}
        isActive={isActive(pathname, item.href)}
        render={<Link href={item.href ?? "#"} />}
      >
        {item.icon}
        <span>{item.label}</span>
      </SidebarMenuButton>
      {badge ? (
        <SidebarMenuBadge className="tabular-nums">{badge}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  )
}

/**
 * An item with sub-pages, each with its count. It opens again whenever the
 * route comes inside it; with the sub-pages out of sight (folded, or the
 * sidebar collapsed to icons) the item itself carries the highlight.
 */
function GroupNavItem({
  item,
  counts,
}: {
  item: NavItem
  counts: Record<string, number>
}) {
  const pathname = usePathname()
  const { state: sidebar, isMobile } = useSidebar()
  const inside = (item.children ?? []).some((child) =>
    isActive(pathname, child.href)
  )
  const [open, setOpen] = useState(true)
  const [wasInside, setWasInside] = useState(inside)
  if (inside !== wasInside) {
    setWasInside(inside)
    if (inside) setOpen(true)
  }
  const iconsOnly = sidebar === "collapsed" && !isMobile

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        tooltip={item.label}
        isActive={inside && (!open || iconsOnly)}
        render={<Link href={item.href ?? "#"} />}
      >
        {item.icon}
        <span>{item.label}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={<SidebarMenuAction aria-label={`Toggle ${item.label}`} />}
      >
        <ChevronRightIcon
          className="transition-transform duration-200 group-data-open/collapsible:rotate-90"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.children?.map((child) => (
            <SidebarMenuSubItem key={child.id}>
              <SidebarMenuSubButton
                isActive={isActive(pathname, child.href)}
                render={<Link href={child.href ?? "#"} />}
              >
                <span className="truncate">{child.label}</span>
                <span className="text-muted-foreground ms-auto text-xs tabular-nums">
                  {counts[child.id]}
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function NavMain() {
  const { state } = useAccounting()
  // Replies are the loop coming back to the accountant, so they earn the badge.
  const mine = new Set(scopedClients("mine").map((c) => c.id))
  const scoped = state.requests.filter(
    (r) => mine.has(r.clientId) && r.period === OPEN_MONTH
  )
  const replies = scoped.filter((r) => r.status === "replied").length
  const decisions = scoped.filter((r) => r.status === "draft").length
  // Returns and reports the agent has drafted, waiting to be submitted.
  const readyFilings = scopedClients("mine").reduce(
    (sum, client) =>
      sum +
      getClientFilings(client, state.items, state).filter(
        (f) => f.status === "ready"
      ).length,
    0
  )
  // The firm's book under Clients, in the scope the lists show.
  const clientCounts = {
    operations: scopedClients(state.scope).length,
    onboarding: state.onboarding.filter(
      (c) =>
        isOnboarding(c) &&
        (state.scope === "all" || c.accountantId === CURRENT_USER.id)
    ).length,
  }

  return (
    <SidebarGroup>
      {/* Sidebar */}
      <SidebarGroupLabel className="in-data-[state=collapsed]:hidden">
        Workspace
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV_MAIN.map((item) =>
            item.children ? (
              <GroupNavItem key={item.id} item={item} counts={clientCounts} />
            ) : (
              <LeafNavItem
                key={item.id}
                item={item}
                badge={
                  item.id === "requests"
                    ? replies + decisions
                      : item.id === "filings"
                        ? readyFilings
                        : undefined
                }
              />
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
