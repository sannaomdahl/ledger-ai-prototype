"use client"

// The Reconciliation tab: the bank first, then everything else the trial
// balance has to agree with before the month closes: payroll against the
// a-melding, the supplier and customer ledgers, and VAT. Each section says
// with a dot whether it is done; the close track asks for all of them.
import { heldInvoices } from "@/lib/accounting/approvals"
import { useState } from "react"
import { cn } from "cn"

import { BankReconciliation } from "@/components/accounting/bank-reconciliation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import { reconSections } from "@/lib/accounting/ledger-recon"
import { monthStatus, type ReconSection } from "@/lib/accounting/periods"
import { getBankReconciliation } from "@/lib/accounting/reconciliation"
import { useAccounting } from "@/lib/accounting/store"
import {
  LedgersReconciliation,
  PayrollReconciliation,
  VatReconciliation,
} from "./ledger-reconciliation"
import { PeriodBanner } from "./period-banner"

type Section = "bank" | ReconSection

const LABEL: Record<Section, string> = {
  bank: "Bank",
  payroll: "Payroll",
  ledgers: "Suppliers & customers",
  vat: "VAT",
}

export function ReconciliationView({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [section, setSection] = useState<Section>("bank")
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return null

  // A month before we took the client over has nothing of ours to reconcile.
  if (monthStatus(clientId, state.month, state) === "before") return <PeriodBanner clientId={clientId} />

  const bank = getBankReconciliation(client, state.month, state.items, state.progress, heldInvoices(state, client.id))
  const sections = reconSections(state, clientId, state.month)
  const dot = (s: Section) => {
    if (s === "bank") return bank.reconciled ? "bg-success" : "bg-warning"
    const status = sections.find((x) => x.section === s)!
    if (!status.applicable) return "bg-muted-foreground/30"
    return status.done ? "bg-success" : "bg-warning"
  }

  return (
    <>
      <PeriodBanner clientId={clientId} />
      <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
        <TabsList className="h-auto flex-wrap">
          {(Object.keys(LABEL) as Section[]).map((s) => (
            <TabsTrigger key={s} value={s} className="gap-1.5">
              <span className={cn("size-1.5 shrink-0 rounded-full", dot(s))} aria-hidden="true" />
              {LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {section === "bank" ? (
        <BankReconciliation clientId={clientId} />
      ) : section === "payroll" ? (
        <PayrollReconciliation clientId={clientId} />
      ) : section === "ledgers" ? (
        <LedgersReconciliation clientId={clientId} />
      ) : (
        <VatReconciliation clientId={clientId} />
      )}
    </>
  )
}
