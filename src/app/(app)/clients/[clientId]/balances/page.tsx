import { ClientBalances } from "@/components/accounting/balances"

export default async function ClientBalancesPage({
  params,
}: PageProps<"/clients/[clientId]/balances">) {
  const { clientId } = await params
  return <ClientBalances clientId={clientId} />
}
