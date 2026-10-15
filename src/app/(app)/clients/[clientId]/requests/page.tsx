import { RequestsBoard } from "@/components/accounting/requests-board"

export default async function ClientRequestsPage({
  params,
}: PageProps<"/clients/[clientId]/requests">) {
  const { clientId } = await params
  return (
    <RequestsBoard
      clientId={clientId}
      title="Tasks & requests"
      description="What we asked this customer, where each one is in the loop, and what is ready to book."
    />
  )
}
