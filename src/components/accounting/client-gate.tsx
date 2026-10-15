"use client"

// A client's pages, in the workspace and the customer app, exist for every
// register company too, so a company handed over from onboarding has them in
// the static build. Until the store knows it as a client (it may still be
// onboarding, or the saved data hasn't loaded yet) this stands in for them.
import type { ReactNode } from "react"
import Link from "next/link"

import { Frame, FramePanel } from "@/components/reui/frame"
import { PortalShell } from "@/components/portal/customer-portal"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import { company } from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"

export function ClientGate({
  clientId,
  side,
  children,
}: {
  clientId: string
  /** The firm's workspace, or the customer's app. */
  side: "workspace" | "portal"
  children: ReactNode
}) {
  // Read through the store, so a handover or a load re-renders the gate.
  const { state } = useAccounting()
  // The customer's page waits for the saved data: showing the demo's
  // starting state first would flash tasks that are already answered.
  if (side === "portal" && !state.loaded) return <PortalShell>{null}</PortalShell>
  if (CLIENT_BY_ID.has(clientId)) return children
  // Nothing until the saved data had its chance, so a handed-over client
  // doesn't flash "not a client" on reload.
  if (!state.loaded) return null

  const c = state.onboarding.find((x) => x.id === clientId)
  const name = c ? company(c).name : undefined

  if (side === "portal") {
    // Signed and onboarding: they are a customer, the app just isn't open
    // yet. Their onboarding page is where things happen until then.
    const signed = c?.offer?.status === "accepted" && !c.declined
    return (
      <PortalShell>
        <p className="text-muted-foreground text-sm text-pretty">
          {signed
            ? `Your customer app opens when we take over ${name}'s books. Until then, everything is on your onboarding page.`
            : `${name ? `${name} isn't a Sanna customer yet. ` : ""}This app opens once we take over your books.`}
        </p>
        {signed ? (
          <Link
            href={`/welcome/${clientId}`}
            className="text-foreground text-sm font-medium underline-offset-4 hover:underline"
          >
            Open your onboarding page
          </Link>
        ) : null}
      </PortalShell>
    )
  }

  return (
    <Frame spacing="sm" className="w-full">
      <FramePanel className="text-muted-foreground flex flex-col items-center gap-1 py-12 text-center text-sm">
        {c && !c.declined ? (
          <>
            <span>{name} isn&apos;t a client in operation yet.</span>
            <Link
              href={`/onboarding/${clientId}`}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Open its onboarding
            </Link>
          </>
        ) : (
          "There's no client here."
        )}
      </FramePanel>
    </Frame>
  )
}
