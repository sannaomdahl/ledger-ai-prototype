import { AppBreadcrumb } from "@/components/accounting/app-breadcrumb"
import { AskCustomerDialog } from "@/components/accounting/ask-customer-dialog"
import { CustomerViewButton } from "@/components/accounting/customer-view-button"
import { DemoToday } from "@/components/accounting/demo-today"
import { InspectorLayout } from "@/components/accounting/detail-panel"
import { MonthSwitcher } from "@/components/accounting/month-switcher"
import { NewCustomerButton } from "@/components/accounting/new-customer-button"
import { TeamDialog } from "@/components/accounting/team-dialog"
import { AppShell } from "@/components/blocks/app-shell-3/components/app-shell"

// The accountant workspace: sidebar, header and the review panel.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      breadcrumb={<AppBreadcrumb />}
      actions={
        <div className="flex items-center gap-2">
          <DemoToday />
          <MonthSwitcher />
          <CustomerViewButton />
          <NewCustomerButton />
        </div>
      }
    >
      <InspectorLayout>{children}</InspectorLayout>
      <AskCustomerDialog />
      <TeamDialog />
    </AppShell>
  )
}
