import { notFound } from "next/navigation"

import { ClientGate } from "@/components/accounting/client-gate"
import { ClientHeader } from "@/components/accounting/client-header"
import { CLIENT_BY_ID, CLIENTS } from "@/lib/accounting/data"
import { REGISTER, REGISTER_BY_ID } from "@/lib/accounting/onboarding"

// Every client is known at build time, so each page can be pre-rendered
// (the GitHub Pages build is a static export). So is every company that can
// be onboarded: once its takeover is approved it becomes a client in the
// browser, and its pages have to exist already.
export const dynamicParams = false

export function generateStaticParams() {
  const ids = new Set([...CLIENTS.map((c) => c.id), ...REGISTER.map((c) => c.id)])
  return [...ids].map((clientId) => ({ clientId }))
}

export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/clients/[clientId]">) {
  const { clientId } = await params
  if (!CLIENT_BY_ID.has(clientId) && !REGISTER_BY_ID.has(clientId)) notFound()

  return (
    <ClientGate clientId={clientId} side="workspace">
      <div className="flex flex-col gap-4">
        <ClientHeader clientId={clientId} />
        {children}
      </div>
    </ClientGate>
  )
}
