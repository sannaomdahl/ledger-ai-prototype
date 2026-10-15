"use client"

// Preview, behind Preferences: the client's balance sheet as it stands, for
// the questions an owner asks halfway through a year they haven't looked at.
// What is the stock worth? How much is left on the loan, and for how long?
// An overview for those who want the answer, and the trial balance month by
// month for those who want every line.
import { useMemo, useState } from "react"
import { FlaskConicalIcon } from "lucide-react"

import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  asOfLabel,
  BalanceTable,
  BalanceTiles,
  OwnAndOwe,
} from "@/components/report/balance-sheet"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { buildBalanceSheet } from "@/lib/accounting/balance"
import { MONTHS } from "@/lib/accounting/data"
import { longMonth } from "@/lib/accounting/report"
import { useSettings } from "@/lib/accounting/settings"
import { isMonthClosed } from "@/lib/accounting/signoffs"
import { useAccounting } from "@/lib/accounting/store"

type View = "overview" | "lines"

export function PreviewOff({ what }: { what: string }) {
  const [, update] = useSettings()
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
      <FlaskConicalIcon className="text-muted-foreground size-5" aria-hidden="true" />
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">
        {what} is a preview and it&apos;s switched off. Turn it on here or under
        Preferences in the workspace menu.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => update({ balances: true })}>
        Turn on the preview
      </Button>
    </div>
  )
}

export function ClientBalances({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [settings] = useSettings()
  const [view, setView] = useState<View>("overview")
  const sheet = useMemo(() => buildBalanceSheet(clientId, state.items), [clientId, state.items])

  if (!settings.balances) return <PreviewOff what="The balance sheet" />

  const month = sheet.months.includes(state.month) ? state.month : sheet.months.at(-1)!
  const provisional = sheet.months.filter(
    (m) => m >= MONTHS.at(-1)!.id && !isMonthClosed(clientId, m, state)
  )
  const open = provisional.includes(month)

  return (
    <div className="@container/balances flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-foreground text-base font-semibold tracking-tight">
            Where {sheet.client.name} stands on {asOfLabel(month)}
          </h2>
          <p className="text-muted-foreground text-xs text-pretty">
            {open
              ? `${longMonth(month)} isn't closed yet, so its figures can still move. `
              : ""}
            From the ledger in Tripletex: the profit matches the monthly report, the bank the
            reconciliation.
          </p>
        </div>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="overview" className="px-2.5">
              Overview
            </TabsTrigger>
            <TabsTrigger value="lines" className="px-2.5">
              Trial balance
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "overview" ? (
        <>
          <BalanceTiles sheet={sheet} month={month} />
          <OwnAndOwe sheet={sheet} month={month} />
        </>
      ) : (
        <Frame dense spacing="sm" className="w-full">
          <FrameHeader>
            <FrameTitle>Trial balance, month by month</FrameTitle>
            <FrameDescription className="text-xs">
              Balance per account at each month end in 2026. {longMonth(month)} is highlighted
              {provisional.length ? "; * not closed yet" : ""}.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0">
            <BalanceTable sheet={sheet} month={month} provisional={provisional} />
          </FramePanel>
        </Frame>
      )}
    </div>
  )
}
