import { MonthReport } from "@/components/accounting/month-report"

export default async function ClientReportPage({
  params,
}: PageProps<"/clients/[clientId]/report">) {
  const { clientId } = await params
  return <MonthReport clientId={clientId} />
}
