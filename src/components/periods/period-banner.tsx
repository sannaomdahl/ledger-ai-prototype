"use client"

// One line above a client's working pages saying what state the month is
// in when it isn't simply open: closed and read-only (with the way to
// reopen it), reopened (since when, why, and how it ends), or a month
// before we took the client over.
import Link from "next/link"
import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { ArrowRightIcon, CalendarClockIcon, HistoryIcon, LockIcon, LockOpenIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CLIENT_BY_ID, monthLabel } from "@/lib/accounting/data"
import { getClientFilings, vatFilingId } from "@/lib/accounting/filings"
import { monthHistory, monthStatus, openReopen } from "@/lib/accounting/periods"
import { useAccounting } from "@/lib/accounting/store"
import { monthWord, ReopenMonthDialog } from "./reopen-month-dialog"

export function PeriodBanner({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [reopening, setReopening] = useState(false)
  const client = CLIENT_BY_ID.get(clientId)
  const month = state.month
  if (!client) return null
  const status = monthStatus(clientId, month, state)
  if (status === "open") return null
  const name = monthWord(month)

  if (status === "before") {
    return (
      <Banner icon={<CalendarClockIcon aria-hidden="true" />}>
        <span className="text-foreground font-medium">
          We keep {client.name}&apos;s books from {monthLabel(client.since!)}.
        </span>{" "}
        {name} and the months before were kept by their previous accountant; their balances
        came in with the SAF-T file.
      </Banner>
    )
  }

  if (status === "reopened") {
    const reopen = openReopen(clientId, month, state)
    const filing = getClientFilings(client, state.items, state).find(
      (f) => f.id === vatFilingId(client, month)
    )
    const filed = filing?.status === "submitted" || Boolean(filing?.correction)
    return (
      <Banner
        tone="warning"
        icon={<LockOpenIcon aria-hidden="true" />}
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/clients/${clientId}/report`} />}
          >
            Close {name} again
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        }
      >
        <span className="text-foreground font-medium">
          {name} is reopened{reopen ? ` since ${reopen.on}` : ""}
          {reopen?.reason ? `: ${reopen.reason}` : ""}.
        </span>{" "}
        {filing
          ? filed
            ? `What you book here goes into a corrected ${filing.short} return. `
            : `What you book here goes into the ${filing.short} return. `
          : ""}
        Closing it again sends an updated report.
      </Banner>
    )
  }

  const last = monthHistory(clientId, month, state).at(-1)
  return (
    <>
      <Banner
        icon={<LockIcon aria-hidden="true" />}
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setReopening(true)}>
            <HistoryIcon data-icon="inline-start" aria-hidden="true" />
            Reopen {name}
          </Button>
        }
      >
        <span className="text-foreground font-medium">
          {name} is closed{last ? `, report sent ${last.on}` : ""}.
        </span>{" "}
        Read-only until you reopen it.
      </Banner>
      <ReopenMonthDialog
        clientId={clientId}
        month={month}
        open={reopening}
        onOpenChange={setReopening}
      />
    </>
  )
}

function Banner({
  icon,
  tone,
  action,
  children,
}: {
  icon: ReactNode
  tone?: "warning"
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2",
        tone === "warning" ? "border-warning/40 bg-warning/5" : "bg-muted/30"
      )}
    >
      <span
        className={cn(
          "shrink-0 [&_svg]:size-4",
          tone === "warning" ? "text-warning-text" : "text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <p className="text-muted-foreground min-w-0 flex-1 text-sm text-pretty">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
