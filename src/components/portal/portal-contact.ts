"use client"

// Who is looking at the customer app. Answers given anywhere on the page
// (approval lists and check-ins too) go in this person's name.
import { createContext, useContext } from "react"
import { toast } from "sonner"

import { ACCOUNTANT_BY_ID, CLIENT_BY_ID } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { CustomerRequest, Person } from "@/lib/accounting/types"

export const PortalContactContext = createContext<Person | null>(null)

/** The contact viewing the customer app, for answers that record who gave
    them (`contactId` on customer_approve / customer_checkin). */
export function usePortalContact() {
  return useContext(PortalContactContext)
}

/** Before the customer's answer goes: is the task still waiting for it?
    The firm may have closed or replaced it in the meantime, and an answer
    to a closed task would otherwise vanish behind a "Sent" toast. */
export function useStillOpen(request: CustomerRequest) {
  const { state } = useAccounting()
  return () => {
    const now = state.requests.find((r) => r.id === request.id)
    if (now?.status === "sent") return true
    const client = CLIENT_BY_ID.get(request.clientId)
    const first = (client && ACCOUNTANT_BY_ID.get(client.accountantId)?.name.split(" ")[0]) ?? "Your accountant"
    toast.error(`${first} already closed this one`, {
      description:
        now?.thread?.findLast((t) => t.from === "accountant")?.text ?? "Your answer wasn't sent. Nothing more is needed.",
    })
    return false
  }
}
