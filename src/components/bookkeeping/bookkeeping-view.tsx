"use client"

// A client's Bookkeeping: the inbox of supplier invoices to work (card
// receipts are booked from their bank lines in the Reconciliation) (the approval
// track above the queue), or the suppliers behind them with the routine
// they're approved by. ?view=suppliers opens the second; ?prepare=1 opens
// this week's approval list, which is where "Look first" in Tasks &
// requests lands.
import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ReviewQueue } from "@/components/accounting/review-queue"
import { PeriodBanner } from "@/components/periods/period-banner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApprovalTrack } from "./approval-track"
import { BookkeepingSuppliers } from "./suppliers"

type View = "invoices" | "suppliers"

function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <Tabs value={view} onValueChange={(value) => onChange(value as View)}>
      <TabsList>
        <TabsTrigger value="invoices" className="px-2.5">
          Invoices
        </TabsTrigger>
        <TabsTrigger value="suppliers" className="px-2.5">
          Suppliers
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

/** What the static HTML shows until the URL is read: the invoices. */
export function BookkeepingFallback({ clientId }: { clientId: string }) {
  return (
    <>
      <ViewSwitch view="invoices" onChange={() => {}} />
      <BookkeepingInvoices clientId={clientId} />
    </>
  )
}

export function BookkeepingView({ clientId }: { clientId: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const view: View = params.get("view") === "suppliers" ? "suppliers" : "invoices"
  // A link can open the list once; after that the accountant decides.
  const [prepare, setPrepare] = useState<boolean | null>(null)
  const preparing = prepare ?? params.get("prepare") === "1"

  function go(next: { view?: View; prepare?: boolean }) {
    const query = new URLSearchParams()
    if ((next.view ?? view) === "suppliers") query.set("view", "suppliers")
    const qs = query.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <>
      <ViewSwitch view={view} onChange={(next) => go({ view: next })} />
      {view === "suppliers" ? (
        <BookkeepingSuppliers clientId={clientId} />
      ) : (
        <BookkeepingInvoices
          clientId={clientId}
          prepare={preparing}
          onPrepareChange={(open) => {
            setPrepare(open)
            // Closing drops ?prepare, so a reload doesn't open it again.
            if (!open && params.get("prepare")) go({})
          }}
        />
      )}
    </>
  )
}

function BookkeepingInvoices({
  clientId,
  prepare = false,
  onPrepareChange = () => {},
}: {
  clientId: string
  prepare?: boolean
  onPrepareChange?: (open: boolean) => void
}) {
  return (
    <>
      <PeriodBanner clientId={clientId} />
      <ApprovalTrack clientId={clientId} prepare={prepare} onPrepareChange={onPrepareChange} />
      <ReviewQueue clientId={clientId} domain="bookkeeping" title="Invoices" />
    </>
  )
}
