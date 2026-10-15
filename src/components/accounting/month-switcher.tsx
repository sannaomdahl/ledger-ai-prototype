"use client"

// The month a client's working pages show: that month's bank lines and the
// pay run built from its hours. Only those pages get a switcher. The firm-wide
// pages are about now, so they always show the open month; a client's
// Overview likewise, with the past under "What happened before". The dot
// follows the client: green once the month's report went out, amber while it
// is open, and amber again (with a ring) while a closed month is reopened.
import { usePathname } from "next/navigation"

import { MONTHS } from "@/lib/accounting/data"
import { monthHistory, monthStatus } from "@/lib/accounting/periods"
import { useAccounting } from "@/lib/accounting/store"
import { PeriodSwitcher, type SwitcherPeriod } from "./period-switcher"

export function MonthSwitcher() {
  const { state, dispatch } = useAccounting()
  const pathname = usePathname()
  const clientId = pathname.match(/^\/clients\/([^/]+)\/[^/]+/)?.[1]
  if (!clientId) return null
  const periods = MONTHS.map((m): SwitcherPeriod => {
    const status = monthStatus(clientId, m.id, state)
    const history = monthHistory(clientId, m.id, state)
    const last = history.at(-1)
    const note =
      status === "before"
        ? "Before we took over"
        : status === "reopened" && last
          ? `Reopened ${last.on}`
          : status === "closed" && last
            ? `${history.length > 1 ? "Closed again" : "Closed"} ${last.on}`
            : m.note
    return { ...m, status, note }
  })
  return (
    <PeriodSwitcher
      periods={periods}
      value={state.month}
      onValueChange={(month) => dispatch({ type: "set_month", month })}
    />
  )
}
