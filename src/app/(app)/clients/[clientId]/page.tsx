import { ClientOverview } from "@/components/accounting/client-overview"

export default async function ClientPage({
  params,
}: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params
  return <ClientOverview clientId={clientId} />
}
