"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "cn"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ACCOUNTANT_BY_ID,
  CLIENT_BY_ID,
  hasFilings,
  tabOf,
  type ItemTab,
} from "@/lib/accounting/data"
import { getClientFilings } from "@/lib/accounting/filings"
import { isWorkable, monthStatus } from "@/lib/accounting/periods"
import { useSettings } from "@/lib/accounting/settings"
import { getMonthClose, useAccounting } from "@/lib/accounting/store"
import { ClientChip, DotSeparator } from "./primitives"

type Section =
  | "overview"
  | "bookkeeping"
  | "payroll"
  | "reconciliation"
  | "requests"
  | "filings"
  | "files"
  | "balances"
  | "report"

function CountPill({ value }: { value: number }) {
  if (!value) return null
  return (
    <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
      {value}
    </span>
  )
}

export function ClientHeader({ clientId }: { clientId: string }) {
  const pathname = usePathname()
  const { state } = useAccounting()
  const [settings] = useSettings()
  // The tab the accountant just clicked, until the route catches up: the
  // underline moves on click instead of waiting for the next page to load.
  const [clicked, setClicked] = useState<{ from: string; value: Section } | null>(
    null
  )
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return null

  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId)
  // Bookkeeping is an inbox across the open months, so its count is too.
  const own = state.items.filter(
    (i) =>
      i.clientId === clientId &&
      (i.period === state.month ||
        (tabOf(i) === "bookkeeping" &&
          i.status !== "booked" &&
          isWorkable(monthStatus(clientId, state.month, state)) &&
          isWorkable(monthStatus(clientId, i.period, state))))
  )
  const open = (tab: ItemTab) =>
    own.filter(
      (i) =>
        tabOf(i) === tab &&
        (i.status === "needs_review" || i.status === "customer_replied")
    ).length
  const openRequests = state.requests.filter(
    (r) =>
      r.clientId === clientId &&
      r.period === state.month &&
      (r.status === "draft" || r.status === "replied")
  ).length

  const report = getMonthClose(state, clientId, state.month)
  // Lines to match or answer, and ledger issues to fix.
  const toReconcile = report.bank.toDo
  const reportStatus = report.closed
    ? { label: "Sent", tone: "bg-muted text-muted-foreground" }
    : report.readyToSend
      ? { label: "Ready to send", tone: "bg-info/10 text-info-text" }
      : { label: "Open", tone: "bg-muted text-muted-foreground" }
  const readyFilings = getClientFilings(client, state.items, state).filter(
    (f) => f.status === "ready"
  ).length

  const base = `/clients/${clientId}`
  // The last segment, so a trailing slash (the static export) still matches.
  const last = pathname.replace(/\/$/, "").split("/").pop()
  const section: Section =
    last === "bookkeeping" ||
    last === "payroll" ||
    last === "reconciliation" ||
    last === "requests" ||
    last === "filings" ||
    last === "files" ||
    last === "balances" ||
    last === "report"
      ? last
      : "overview"
  const active = clicked?.from === pathname ? clicked.value : section

  const tabs: { value: Section; label: string; href: string; count: number }[] =
    [
      { value: "overview", label: "Overview", href: base, count: 0 },
      // The work first: the invoices, the pay run and what the customer
      // approves. Reconciliation sits next to the report it leads to.
      {
        value: "bookkeeping",
        label: "Bookkeeping",
        href: `${base}/bookkeeping`,
        count: open("bookkeeping"),
      },
      {
        value: "payroll",
        label: "Payroll",
        href: `${base}/payroll`,
        count: open("payroll"),
      },
      {
        value: "requests",
        label: "Tasks & requests",
        href: `${base}/requests`,
        count: openRequests,
      },
      ...(hasFilings(clientId)
        ? [
            {
              value: "filings" as const,
              label: "Filings",
              href: `${base}/filings`,
              count: readyFilings,
            },
          ]
        : []),
      { value: "files", label: "Files", href: `${base}/files`, count: 0 },
      // Preview, switched on under Preferences.
      ...(settings.balances || section === "balances"
        ? [{ value: "balances" as const, label: "Balances", href: `${base}/balances`, count: 0 }]
        : []),
      {
        value: "reconciliation",
        label: "Reconciliation",
        href: `${base}/reconciliation`,
        count: toReconcile,
      },
      {
        value: "report",
        label: "Monthly report",
        href: `${base}/report`,
        count: 0,
      },
    ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <ClientChip client={client} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-foreground truncate text-lg leading-6 font-semibold tracking-tight">
              {client.name}
            </h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
              <span className="tabular-nums">Org. {client.orgNo}</span>
              <DotSeparator />
              <span>{client.industry}</span>
              <DotSeparator />
              <span>Customer since {client.profile.clientSince}</span>
              <DotSeparator />
              <span>{client.employees} employees</span>
              <DotSeparator />
              <span>{client.vatTerm} VAT</span>
              <DotSeparator />
              <span className="inline-flex items-center gap-1">
                <span className="bg-success size-1.5 rounded-full" aria-hidden="true" />
                Tripletex synced 06:10
              </span>
            </p>
          </div>
        </div>
        {accountant ? (
          <div className="text-muted-foreground hidden items-center gap-2 text-xs sm:flex">
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">
                {accountant.initials}
              </AvatarFallback>
            </Avatar>
            <span>
              <span className="text-foreground font-medium">
                {accountant.name}
              </span>{" "}
              · accountant
            </span>
          </div>
        ) : null}
      </div>

      <Tabs
        value={active}
        onValueChange={(value) => setClicked({ from: pathname, value: value as Section })}
      >
        {/* Scrolls sideways on narrow screens. The bottom padding keeps the
            active underline inside the scroll box, so it is never clipped and
            never adds a vertical scrollbar. The divider is an inset line for
            the same reason: the underline sits on top of it. */}
        <TabsList
          variant="line"
          className="h-auto w-full max-w-full justify-start gap-5 overflow-x-auto overflow-y-hidden pb-[5px] shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>[data-slot=tabs-indicator]]:bottom-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              nativeButton={false}
              render={<Link href={tab.href} />}
              // The report closes the month, so it sits apart at the end.
              className={cn(
                "flex-none gap-2 px-0 pt-0 pb-2.5 text-sm",
                tab.value === "report" && "ms-auto"
              )}
            >
              <span>{tab.label}</span>
              <CountPill value={tab.count} />
              {tab.value === "report" ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-normal",
                    reportStatus.tone
                  )}
                >
                  {reportStatus.label}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
