"use client"

import { Fragment } from "react"
import { useRouter } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuAction } from "@/components/ui/sidebar"
import { ITEM_ACTIONS } from "./data"
import { MoreHorizontalIcon } from "lucide-react"

const ACTION_PATH: Record<string, string> = {
  open: "",
  bookkeeping: "/bookkeeping",
  payroll: "/payroll",
}

export function ItemActionMenu({
  label,
  clientId,
}: {
  label: string
  clientId: string
}) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction showOnHover aria-label={`Actions for ${label}`} />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      {/* Content */}
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={4}
        className="w-44"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {ITEM_ACTIONS.map((action) => (
            <Fragment key={action.id}>
              {action.destructive && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant={action.destructive ? "destructive" : "default"}
                className="[&_svg]:size-3.5 [&_svg]:opacity-60"
                disabled={!(action.id in ACTION_PATH)}
                onClick={() =>
                  action.id in ACTION_PATH &&
                  router.push(`/clients/${clientId}${ACTION_PATH[action.id]}`)
                }
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}