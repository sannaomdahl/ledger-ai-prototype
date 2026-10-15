"use client"

// Opening a task from a summary (a client's Overview, Home, notifications)
// takes the accountant to where that task lives: an invoice or receipt to
// Bookkeeping, a bank line with nothing behind it to Reconciliation, a pay
// line to Payroll, a task with neither to Tasks & requests. The panel opens there, beside the list it belongs to, instead of
// over a page that isn't about it.
import { usePathname, useRouter } from "next/navigation"

import { tabOf } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { CustomerRequest, ReviewItem } from "@/lib/accounting/types"

export function useOpenTask() {
  const router = useRouter()
  const pathname = usePathname()
  const { state, dispatch } = useAccounting()

  function itemOf(target: ReviewItem | CustomerRequest) {
    if ("suggestion" in target) return target
    return target.itemId ? state.items.find((i) => i.id === target.itemId) : undefined
  }

  function hrefOf(target: ReviewItem | CustomerRequest, item?: ReviewItem) {
    const base = `/clients/${target.clientId}`
    return item ? `${base}/${tabOf(item)}` : `${base}/requests`
  }

  /** `nav` is the list ↑/↓ should walk once there (ids of the same kind). */
  return function openTask(target: ReviewItem | CustomerRequest, nav?: string[]) {
    const item = itemOf(target)
    const href = hrefOf(target, item)
    const period = item?.period ?? target.period
    // Only rows that live on the same tab: ↑/↓ never walks off the page.
    const walk = (nav ?? []).filter((id) => {
      const other =
        state.items.find((i) => i.id === id) ??
        state.requests.find((r) => r.id === id)
      return other && hrefOf(other, itemOf(other)) === href
    })

    // The process tab shows one month; make it the task's month.
    if (period !== state.month) dispatch({ type: "set_month", month: period })
    if (item) {
      dispatch({ type: "open_item", id: item.id, nav: walk.length ? walk : [item.id] })
    } else {
      dispatch({ type: "open_request", id: target.id, nav: walk.length ? walk : [target.id] })
    }
    if (pathname !== href) router.push(href)
  }
}
