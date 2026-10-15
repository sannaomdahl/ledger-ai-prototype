import { ClientFilings } from "@/components/accounting/filings"

export default async function ClientFilingsPage({
  params,
}: PageProps<"/clients/[clientId]/filings">) {
  const { clientId } = await params
  return <ClientFilings clientId={clientId} />
}
