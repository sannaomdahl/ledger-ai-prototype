"use client"

// Starts an onboarding. It belongs to the firm's book, so it sits on the two
// client lists (In operation and Onboarding), not on a customer's own pages.
import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NewCustomerDialog } from "@/components/onboarding/new-customer-dialog"

export function NewCustomerButton() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // The Pages build adds a trailing slash.
  const path = pathname.replace(/\/$/, "")
  if (path !== "/clients" && path !== "/onboarding") return null

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        New customer
      </Button>
      <NewCustomerDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => router.push(`/onboarding/${id}`)}
      />
    </>
  )
}
