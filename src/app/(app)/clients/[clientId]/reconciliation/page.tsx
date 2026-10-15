import { ReconciliationView } from "@/components/periods/reconciliation-view"

export default async function ReconciliationPage({
  params,
}: PageProps<"/clients/[clientId]/reconciliation">) {
  const { clientId } = await params
  return <ReconciliationView clientId={clientId} />
}
