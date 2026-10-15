"use client"

// The app-shell-3 header breadcrumb (house icon + bullet separators), driven by
// the current route.
import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HouseIcon } from "lucide-react"

import { BulletSeparator } from "@/components/blocks/app-shell-3/components/bullet-separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import { REGISTER_BY_ID } from "@/lib/accounting/onboarding"

const SECTION_LABEL: Record<string, string> = {
  bookkeeping: "Bookkeeping",
  payroll: "Payroll",
  reconciliation: "Reconciliation",
  requests: "Tasks & requests",
  filings: "Filings",
  files: "Files",
  balances: "Balances",
  report: "Monthly report",
}

function useCrumbs() {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)

  if (parts[0] === "requests") {
    return [{ label: "Tasks & requests" }]
  }
  if (parts[0] === "filings") {
    return [{ label: "Filings" }]
  }
  if (parts[0] === "onboarding") {
    const crumbs: { label: string; href?: string }[] = [
      { label: "Clients", href: "/clients" },
      { label: "Onboarding", href: "/onboarding" },
    ]
    if (parts[1]) crumbs.push({ label: REGISTER_BY_ID.get(parts[1])?.name ?? "Company" })
    return crumbs
  }
  if (parts[0] === "clients") {
    const crumbs: { label: string; href?: string }[] = [
      { label: "Clients", href: "/clients" },
    ]
    // The list names its half of Clients; a client's own pages lead with
    // the client instead.
    if (!parts[1]) crumbs.push({ label: "In operation" })
    if (parts[1]) {
      // A company handed over from onboarding is named from the register.
      const name = CLIENT_BY_ID.get(parts[1])?.name ?? REGISTER_BY_ID.get(parts[1])?.name
      crumbs.push({ label: name ?? "Client", href: `/clients/${parts[1]}` })
    }
    if (parts[2]) crumbs.push({ label: SECTION_LABEL[parts[2]] ?? parts[2] })
    return crumbs
  }
  return []
}

export function AppBreadcrumb() {
  const crumbs = useCrumbs()
  const isRoot = crumbs.length === 0

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden items-center md:flex">
          {isRoot ? (
            <BreadcrumbPage className="flex items-center gap-1.5">
              <HouseIcon className="size-4" aria-hidden="true" />
              Home
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              render={<Link href="/" />}
              className="flex items-center gap-1.5"
            >
              <HouseIcon className="size-4" aria-hidden="true" />
              Home
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {isRoot
          ? null
          : crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1
              return (
                <Fragment key={crumb.label}>
                  <BreadcrumbSeparator className="hidden items-center md:flex">
                    <BulletSeparator />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
