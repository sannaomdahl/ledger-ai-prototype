"use client"

// Opens the customer's side of the loop in a new tab. On a client's pages it
// goes straight to that customer; elsewhere it asks which one.
import { usePathname } from "next/navigation"
import { ChevronDownIcon, ExternalLinkIcon, MonitorSmartphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import { hasCustomerLink } from "@/lib/accounting/onboarding"
import { scopedClients, useAccounting } from "@/lib/accounting/store"
import { welcomeHref } from "@/components/onboarding/links"

/** A plain link (it opens a new tab), so the base path is added by hand. */
function portalHref(clientId: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/portal/${clientId}`
}

export function CustomerViewButton() {
  const pathname = usePathname()
  const { state } = useAccounting()
  const clientId = pathname.startsWith("/clients/")
    ? pathname.split("/")[2]
    : undefined
  const client = clientId ? CLIENT_BY_ID.get(clientId) : undefined
  // A company onboarding sees its onboarding link, once the offer opens it.
  const caseId = pathname.startsWith("/onboarding/") ? pathname.split("/")[2] : undefined
  const onboarding = caseId ? state.onboarding.find((c) => c.id === caseId) : undefined

  if (caseId) {
    return onboarding && hasCustomerLink(onboarding) ? (
      <Button
        variant="outline"
        nativeButton={false}
        render={<a href={welcomeHref(caseId)} target="_blank" rel="noopener noreferrer" />}
      >
        <MonitorSmartphoneIcon data-icon="inline-start" aria-hidden="true" />
        Customer view
        <ExternalLinkIcon className="text-muted-foreground" aria-hidden="true" />
      </Button>
    ) : (
      <Button variant="outline" disabled title="Their page opens when the offer is sent">
        <MonitorSmartphoneIcon data-icon="inline-start" aria-hidden="true" />
        Customer view
      </Button>
    )
  }

  if (client) {
    return (
      <Button
        variant="outline"
        nativeButton={false}
        render={
          <a href={portalHref(client.id)} target="_blank" rel="noopener noreferrer" />
        }
      >
        <MonitorSmartphoneIcon data-icon="inline-start" aria-hidden="true" />
        Customer view
        <ExternalLinkIcon className="text-muted-foreground" aria-hidden="true" />
      </Button>
    )
  }

  // Customers with open tasks first: those are the portals worth looking at.
  const pending = (id: string) =>
    state.requests.filter((r) => r.clientId === id && r.status === "sent").length
  const clients = [...scopedClients("mine")].sort(
    (a, b) => pending(b.id) - pending(a.id) || a.name.localeCompare(b.name)
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <MonitorSmartphoneIcon data-icon="inline-start" aria-hidden="true" />
        Customer view
        <ChevronDownIcon className="text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Open a customer&apos;s app</DropdownMenuLabel>
          {clients.map((c) => (
            <DropdownMenuItem
              key={c.id}
              render={
                <a href={portalHref(c.id)} target="_blank" rel="noopener noreferrer" />
              }
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {pending(c.id) ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {pending(c.id)} open
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* The Sanna-style customer view: dummy data, outside the store. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sanna style, Norwegian</DropdownMenuLabel>
          <DropdownMenuItem
            render={
              <a
                href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/kunde`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <span className="min-w-0 flex-1 truncate">Fjordlys Rådgivning AS</span>
            <span className="text-muted-foreground text-xs">demo</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
