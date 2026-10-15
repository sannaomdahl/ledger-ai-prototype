import { ClientFiles } from "@/components/accounting/files"

export default async function ClientFilesPage({
  params,
}: PageProps<"/clients/[clientId]/files">) {
  const { clientId } = await params
  return <ClientFiles clientId={clientId} />
}
