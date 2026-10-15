"use client"

import { type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table"
import { Rating } from "@/components/reui/rating"
import { type ColumnDef } from "@tanstack/react-table"
import { cn } from "cn"
import { format, parseISO } from "date-fns"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Item, ItemMedia } from "@/components/ui/item"
import { Switch } from "@/components/ui/switch"
import {
  type AutomationKind,
  type AutomationOwnerAvailability,
  type AutomationState,
  type IAutomationRecord,
} from "./data"
import { GitBranchIcon, RouteIcon, SparklesIcon, MailIcon, BellRingIcon, EllipsisVerticalIcon, PencilIcon, EyeIcon, CircleCheckIcon, ArchiveIcon } from "lucide-react"

export type AutomationAction = "edit" | "open" | "archive"

const automationKindStyles: Record<
  AutomationKind,
  { chipClassName: string; icon: ReactNode }
> = {
  sequence: {
    chipClassName: "text-sky-600 dark:text-sky-300",
    icon: (
      <GitBranchIcon className="size-4" aria-hidden="true" />
    ),
  },
  routing: {
    chipClassName: "text-violet-600 dark:text-violet-300",
    icon: (
      <RouteIcon className="size-4" aria-hidden="true" />
    ),
  },
  enrichment: {
    chipClassName: "text-emerald-600 dark:text-emerald-300",
    icon: (
      <SparklesIcon className="size-4" aria-hidden="true" />
    ),
  },
  digest: {
    chipClassName: "text-amber-600 dark:text-amber-300",
    icon: (
      <MailIcon className="size-4" aria-hidden="true" />
    ),
  },
  escalation: {
    chipClassName: "text-rose-600 dark:text-rose-300",
    icon: (
      <BellRingIcon className="size-4" aria-hidden="true" />
    ),
  },
}

const stateBadgeStyles: Record<
  AutomationState,
  { label: string; dotClassName?: string }
> = {
  live: {
    label: "Live",
    dotClassName: "bg-emerald-500",
  },
  review: {
    label: "Needs approval",
    dotClassName: "bg-amber-500",
  },
  drafts: {
    label: "Draft",
    dotClassName: "bg-slate-400 dark:bg-slate-300",
  },
  paused: {
    label: "Paused",
    dotClassName: "bg-zinc-400 dark:bg-zinc-300",
  },
}

const updatedBucketLabel: Record<IAutomationRecord["updatedBucket"], string> = {
  today: "Today",
  "this-week": "This week",
  older: "Older",
}

const availabilityColor: Record<AutomationOwnerAvailability, string> = {
  online: "bg-green-500",
  away: "bg-yellow-400",
  busy: "bg-red-500",
  offline: "bg-gray-500",
}

function AutomationKindChip({ kind }: { kind: AutomationKind }) {
  const style = automationKindStyles[kind]

  return (
    <Item
      render={<span />}
      className={cn(
        "p-0",
        "border-background bg-muted flex size-9 items-center justify-center border-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-4",
        style.chipClassName
      )}
      aria-hidden="true"
    >
      <ItemMedia variant="icon" className="size-auto">
        {style.icon}
      </ItemMedia>
    </Item>
  )
}

function AutomationNameCell({ automation }: { automation: IAutomationRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AutomationKindChip kind={automation.kind} />
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {automation.title}
        </span>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate">{automation.runWindowLabel}</span>
          <span
            className="bg-input size-1 shrink-0 rounded-full"
            aria-hidden="true"
          />
          <span className="truncate">{automation.audienceLabel}</span>
        </div>
      </div>
    </div>
  )
}

function OwnerCell({ automation }: { automation: IAutomationRecord }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative shrink-0">
        <Avatar className="size-8">
          {automation.owner.avatar ? (
            <AvatarImage
              src={automation.owner.avatar}
              alt={automation.owner.name}
            />
          ) : null}
          <AvatarFallback>{automation.owner.initials}</AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "ring-background absolute right-0 bottom-0.5 size-2 rounded-full ring-2",
            availabilityColor[automation.owner.availability]
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0">
        <div className="text-foreground line-clamp-1 font-medium">
          {automation.owner.name}
        </div>
        <div
          className="text-muted-foreground line-clamp-1 text-xs"
          title={automation.owner.email}
        >
          {automation.owner.email}
        </div>
      </div>
    </div>
  )
}

function StateCell({ automation }: { automation: IAutomationRecord }) {
  const stateStyle = stateBadgeStyles[automation.state]

  return (
    <div className="flex min-w-0 items-center">
      <Badge variant="outline" className="gap-1.5">
        {stateStyle.dotClassName ? (
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              stateStyle.dotClassName
            )}
            aria-hidden="true"
          />
        ) : null}
        {stateStyle.label}
      </Badge>
    </div>
  )
}

function UpdatedCell({ automation }: { automation: IAutomationRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-foreground text-sm">
        {format(parseISO(automation.updatedAt), "MMM d, yyyy")}
      </span>
      <span className="text-muted-foreground text-xs">
        {updatedBucketLabel[automation.updatedBucket]}
      </span>
    </div>
  )
}

function RatingCell({ automation }: { automation: IAutomationRecord }) {
  return <Rating rating={automation.rating} size="sm" showValue={true} />
}

function AutomationActionsCell({
  automation,
  onAction,
  onToggleEnabled,
}: {
  automation: IAutomationRecord
  onAction: (action: AutomationAction, automation: IAutomationRecord) => void
  onToggleEnabled: (automation: IAutomationRecord, nextValue: boolean) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Open actions for ${automation.title}`}
          >
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      {/* Content */}
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onAction("edit", automation)}>
            <PencilIcon className="size-4" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("open", automation)}>
            <EyeIcon className="size-4" aria-hidden="true" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem
            closeOnClick={false}
            onClick={(event) => {
              // The Switch toggles itself and its click bubbles here; skip it
              // so item-level activation (row click, Enter/Space) toggles once.
              if (
                event.target instanceof Element &&
                event.target.closest('[data-slot="switch"]')
              ) {
                return
              }
              onToggleEnabled(automation, !automation.enabled)
            }}
            className="justify-between gap-4"
          >
            <span className="flex items-center gap-2">
              <CircleCheckIcon className="size-4" aria-hidden="true" />
              Enabled
            </span>
            <Switch
              size="sm"
              aria-label={`Toggle ${automation.title}`}
              checked={automation.enabled}
              onCheckedChange={(checked) =>
                onToggleEnabled(automation, checked)
              }
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onAction("archive", automation)}
          >
            <ArchiveIcon className="size-4" aria-hidden="true" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function createAutomationColumns({
  onAction,
  onToggleEnabled,
}: {
  onAction: (action: AutomationAction, automation: IAutomationRecord) => void
  onToggleEnabled: (automation: IAutomationRecord, nextValue: boolean) => void
}): ColumnDef<DataGridFeatures, IAutomationRecord>[] {
  return [
    {
      id: "select",
      header: () => <DataGridTableRowSelectAll />,
      cell: ({ row }) => <DataGridTableRowSelect row={row} />,
      size: 30,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
    },
    {
      accessorFn: (row) => row.title,
      id: "workflow",
      header: ({ column }) => (
        <DataGridColumnHeader title="Workflow" column={column} />
      ),
      cell: ({ row }) => <AutomationNameCell automation={row.original} />,
      size: 340,
      minSize: 200,
      enableSorting: true,
      enableHiding: false,
      meta: {
        autoSize: true,
        headerClassName: "pl-3!",
        cellClassName: "pl-3!",
      },
    },
    {
      accessorFn: (row) => row.owner.name,
      id: "owner",
      header: ({ column }) => (
        <DataGridColumnHeader title="Owner" column={column} />
      ),
      cell: ({ row }) => <OwnerCell automation={row.original} />,
      size: 175,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.rating,
      id: "rating",
      header: ({ column }) => (
        <DataGridColumnHeader title="Score" column={column} />
      ),
      cell: ({ row }) => <RatingCell automation={row.original} />,
      size: 150,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.state,
      id: "state",
      header: ({ column }) => (
        <DataGridColumnHeader title="State" column={column} />
      ),
      cell: ({ row }) => <StateCell automation={row.original} />,
      size: 150,
      enableSorting: true,
    },
    {
      accessorFn: (row) => parseISO(row.updatedAt).getTime(),
      id: "updatedAt",
      header: ({ column }) => (
        <DataGridColumnHeader title="Last updated" column={column} />
      ),
      cell: ({ row }) => <UpdatedCell automation={row.original} />,
      size: 125,
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <AutomationActionsCell
            automation={row.original}
            onAction={onAction}
            onToggleEnabled={onToggleEnabled}
          />
        </div>
      ),
      size: 56,
      enableSorting: false,
    },
  ]
}