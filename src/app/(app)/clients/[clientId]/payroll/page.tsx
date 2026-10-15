import { PayRunSummary } from "@/components/accounting/pay-run-summary"
import { PayrollTable } from "@/components/people/payroll-table"

export default async function PayrollPage({
  params,
}: PageProps<"/clients/[clientId]/payroll">) {
  const { clientId } = await params
  return (
    <>
      <PayRunSummary clientId={clientId} />
      <PayrollTable clientId={clientId} />
    </>
  )
}
