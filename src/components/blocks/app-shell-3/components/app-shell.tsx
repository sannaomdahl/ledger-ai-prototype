import type { ReactNode } from "react"
import { cn } from "cn"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"

export function AppShell({
  children,
  breadcrumb,
  actions,
}: {
  children?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
}) {
  return (
    <SidebarProvider
      className={cn(
        "[--sidebar-width:260px]",
        "[--sidebar-border:transparent]",
        "[&_[data-slot=sidebar-menu-button][data-active]]:border-border/60! [&_[data-slot=sidebar-menu-button][data-active]]:border",
        "[&_[data-slot=sidebar-menu-button][data-active]]:shadow-xs! [&_[data-slot=sidebar-menu-button][data-active]]:shadow-black/5!",
        "[&_[data-slot=sidebar-menu-button][data-active]]:bg-background! [&_[data-slot=sidebar-menu-button][data-active]]:hover:bg-background! **:data-[slot=sidebar-menu-button]:hover:bg-transparent!",
        "[&_[data-slot=sidebar-menu-button][data-active]]:text-foreground [&_[data-slot=sidebar-menu-button][data-active]>svg]:text-primary [&_[data-slot=sidebar-menu-button][data-active]>svg]:opacity-100",
        "**:data-[slot=sidebar-menu-button]:text-accent-foreground/80 **:data-[slot=sidebar-menu-button]:hover:text-foreground",
        "[&_[data-collapsible=icon]_[data-slot=sidebar-menu-button][data-active]>svg]:-ml-px",
        "[&_[data-slot=sidebar-menu-button]:hover>svg]:opacity-100 [&_[data-slot=sidebar-menu-button]>svg]:opacity-60",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:border-border/60! [&_[data-slot=sidebar-menu-sub-button][data-active]]:border",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:shadow-xs! [&_[data-slot=sidebar-menu-sub-button][data-active]]:shadow-black/5!",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:bg-background! [&_[data-slot=sidebar-menu-sub-button][data-active]]:hover:bg-background! **:data-[slot=sidebar-menu-sub-button]:hover:bg-transparent!",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:text-foreground [&_[data-slot=sidebar-menu-sub-button][data-active]>svg]:text-primary [&_[data-slot=sidebar-menu-sub-button][data-active]>svg]:opacity-100",
        "**:data-[slot=sidebar-menu-sub-button]:text-accent-foreground/80 **:data-[slot=sidebar-menu-sub-button]:hover:text-foreground",
        "[&_[data-slot=sidebar-menu-sub-button]:hover>svg]:opacity-100 [&_[data-slot=sidebar-menu-sub-button]>svg]:opacity-60",
        // --chrome-y: the h-14 header plus the inset card's top and bottom margins.
        "h-screen [--chrome-y:4.5rem] [--content-max:88rem]"
      )}
    >
      {/* Sidebar */}
      <AppSidebar />
      <SidebarInset className="ml-0! overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <div className="mx-auto flex w-full max-w-(--content-max) min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <div className="min-w-0 flex-1">{breadcrumb}</div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <div className="mx-auto flex w-full max-w-(--content-max) min-w-0 flex-1 flex-col gap-4">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}