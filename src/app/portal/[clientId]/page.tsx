import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ClientGate } from "@/components/accounting/client-gate"
import { CustomerPortal } from "@/components/portal/customer-portal"
import { CLIENT_BY_ID, CLIENTS } from "@/lib/accounting/data"
import { REGISTER, REGISTER_BY_ID } from "@/lib/accounting/onboarding"

// Pre-rendered per client for the static export (GitHub Pages), and per
// register company, which becomes a client once its takeover is approved.
export const dynamicParams = false

export function generateStaticParams() {
  const ids = new Set([...CLIENTS.map((c) => c.id), ...REGISTER.map((c) => c.id)])
  return [...ids].map((clientId) => ({ clientId }))
}

export async function generateMetadata({
  params,
}: PageProps<"/portal/[clientId]">) {
  const { clientId } = await params
  const name = CLIENT_BY_ID.get(clientId)?.name ?? REGISTER_BY_ID.get(clientId)?.name
  return { title: name ? `${name} · Sanna` : "Sanna" }
}

export default async function PortalPage({
  params,
}: PageProps<"/portal/[clientId]">) {
  const { clientId } = await params
  if (!CLIENT_BY_ID.has(clientId) && !REGISTER_BY_ID.has(clientId)) notFound()
  // The portal reads ?tab= and ?month= (the report email links to them), so
  // it renders on the client under this boundary.
  return (
    <Suspense>
      <ClientGate clientId={clientId} side="portal">
        <CustomerPortal clientId={clientId} />
      </ClientGate>
    </Suspense>
  )
}
