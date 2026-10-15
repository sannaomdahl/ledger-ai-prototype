"use client"

// Adapted from @reui/data-grid-filtering-2: same Frame > tabs > Filters > grid
// > pagination spine, rows are the firm's client portfolio.
import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/reui/badge"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { Filters } from "@/components/reui/filters/filters"
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterConditions,
} from "@/components/reui/filters/filters-query"
import type { FilterField, FilterQuery } from "@/components/reui/filters/filters-types"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "cn"
import {
  BookOpenCheckIcon,
  BuildingIcon,
  CalendarClockIcon,
  EllipsisVerticalIcon,
  FilterIcon,
  FunnelXIcon,
  MessagesSquareIcon,
  SearchIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ACCOUNTANT_BY_ID, ACCOUNTANTS, OPEN_MONTH } from "@/lib/accounting/data"
import {
  getClientDeadlines,
  formatDeadlineDate,
  type Deadline,
} from "@/lib/accounting/deadlines"
import {
  getClientStats,
  scopedClients,
  useAccounting,
  type ClientStats,
} from "@/lib/accounting/store"
import type { Client } from "@/lib/accounting/types"
import { applyFilters, renderSingleSelectedLabel } from "./grid-filters"
import { ScopeToggle } from "./scope-toggle"
import { ClientChip, DotSeparator } from "./primitives"

type ClientRow = Client & { stats: ClientStats; next?: Deadline }

type ClientTab = "all" | ClientStats["health"]

const CLIENT_TABS: { value: Exclude<ClientTab, "closed">; label: string }[] = [
  { value: "all", label: "All clients" },
  { value: "needs_review", label: "Needs review" },
  { value: "waiting_customer", label: "Waiting on customer" },
  { value: "ready_to_close", label: "Ready to close" },
]

const HEALTH_META: Record<
  ClientStats["health"],
  { label: string; dotClassName: string }
> = {
  needs_review: { label: "Needs review", dotClassName: "bg-amber-500" },
  waiting_customer: {
    label: "Waiting on customer",
    dotClassName: "bg-sky-500",
  },
  ready_to_close: { label: "Ready to close", dotClassName: "bg-emerald-500" },
  closed: { label: "Closed", dotClassName: "bg-zinc-400" },
}

const ACCOUNTANT_OPTIONS = ACCOUNTANTS.map((a) => ({
  value: a.id,
  label: a.name,
}))

const filterFields: FilterField[] = [
  {
    id: "client",
    label: "Client",
    icon: <SearchIcon className="size-3.5" aria-hidden />,
    type: "text",
    placeholder: "Search...",
  },
  {
    id: "accountant",
    label: "Accountant",
    icon: <UserIcon className="size-3.5" aria-hidden />,
    type: "select",
    searchable: false,
    options: ACCOUNTANT_OPTIONS,
    renderValue: ({ values }) =>
      renderSingleSelectedLabel(values, ACCOUNTANT_OPTIONS),
  },
]

function createDefaultFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({
      id: "client-1",
      path: ["client"],
      operator: "contains",
      value: "",
    }),
  ])
}

function fieldValue(row: ClientRow, field: string) {
  switch (field) {
    case "client":
      return [row.name, row.orgNo, row.industry].join(" ").toLowerCase()
    case "accountant":
      return row.accountantId
    default:
      return ""
  }
}

// ── Cells ──

function ClientCell({ client }: { client: ClientRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ClientChip client={client} />
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {client.name}
        </span>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate tabular-nums">{client.orgNo}</span>
          <DotSeparator className="bg-input" />
          <span className="truncate">{client.industry}</span>
        </div>
      </div>
    </div>
  )
}

function AccountantCell({ client }: { client: ClientRow }) {
  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId)
  if (!accountant) return null
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-7">
        <AvatarFallback className="text-[10px]">
          {accountant.initials}
        </AvatarFallback>
      </Avatar>
      <span className="text-foreground truncate text-sm">
        {accountant.name}
      </span>
    </div>
  )
}

function CountCell({
  value,
  hint,
  tone,
}: {
  value: number
  hint?: string
  tone?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          value === 0 ? "text-muted-foreground" : tone ?? "text-foreground"
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-muted-foreground truncate text-xs">{hint}</span>
      ) : null}
    </div>
  )
}

function DeadlineCell({ client }: { client: ClientRow }) {
  if (!client.next) {
    return <span className="text-muted-foreground text-sm">All filed</span>
  }
  const blocked = client.next.status === "blocked"
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-foreground truncate text-sm">{client.next.title}</span>
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-1 text-xs",
          blocked ? "text-warning-text" : "text-muted-foreground"
        )}
      >
        <CalendarClockIcon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {formatDeadlineDate(client.next.date)}
          {blocked ? " · blocked" : ""}
        </span>
      </span>
    </div>
  )
}

function HealthCell({ health }: { health: ClientStats["health"] }) {
  const meta = HEALTH_META[health]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", meta.dotClassName)}
        aria-hidden="true"
      />
      {meta.label}
    </Badge>
  )
}

function ActionsCell({
  client,
  onNavigate,
}: {
  client: ClientRow
  onNavigate: (href: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Open actions for ${client.name}`}
          >
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onNavigate(`/clients/${client.id}`)}>
            <BuildingIcon className="size-4" aria-hidden="true" />
            Open client
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onNavigate(`/clients/${client.id}/bookkeeping`)}
          >
            <BookOpenCheckIcon className="size-4" aria-hidden="true" />
            Bookkeeping queue
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onNavigate(`/clients/${client.id}/payroll`)}
          >
            <WalletIcon className="size-4" aria-hidden="true" />
            Payroll run
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onNavigate(`/clients/${client.id}/requests`)}
          >
            <MessagesSquareIcon className="size-4" aria-hidden="true" />
            Tasks & requests
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function createColumns(
  onNavigate: (href: string) => void
): ColumnDef<DataGridFeatures, ClientRow>[] {
  return [
    {
      accessorFn: (row) => row.name,
      id: "client",
      header: ({ column }) => (
        <DataGridColumnHeader title="Client" column={column} />
      ),
      cell: ({ row }) => <ClientCell client={row.original} />,
      size: 250,
      minSize: 220,
      enableSorting: true,
      enableHiding: false,
      meta: {
        autoSize: true,
        headerClassName: "pl-3!",
        cellClassName: "pl-3!",
      },
    },
    {
      accessorFn: (row) => ACCOUNTANT_BY_ID.get(row.accountantId)?.name,
      id: "accountant",
      header: ({ column }) => (
        <DataGridColumnHeader title="Accountant" column={column} />
      ),
      cell: ({ row }) => <AccountantCell client={row.original} />,
      size: 170,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.stats.toReview + row.stats.replied,
      id: "toReview",
      header: ({ column }) => (
        <DataGridColumnHeader title="To review" column={column} />
      ),
      cell: ({ row }) => {
        const { toReview, replied, flagged, drafts } = row.original.stats
        const hint =
          replied > 0
            ? `${replied} replied`
            : drafts > 0
              ? `${drafts} to decide`
              : flagged > 0
                ? `${flagged} flagged`
                : undefined
        return (
          <CountCell
            value={toReview + replied}
            hint={hint}
            tone="text-warning-text"
          />
        )
      },
      size: 105,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.stats.waiting,
      id: "waiting",
      header: ({ column }) => (
        <DataGridColumnHeader title="With customer" column={column} />
      ),
      cell: ({ row }) => (
        <CountCell
          value={row.original.stats.waiting}
          tone="text-sky-700 dark:text-sky-400"
        />
      ),
      size: 110,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.stats.payrollOpen,
      id: "payroll",
      header: ({ column }) => (
        <DataGridColumnHeader title="Payroll" column={column} />
      ),
      cell: ({ row }) => {
        const { payrollOpen, payrollTotal } = row.original.stats
        return (
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-foreground text-sm tabular-nums">
              {payrollTotal - payrollOpen}/{payrollTotal} ready
            </span>
            <span className="text-muted-foreground text-xs">
              Pay date {row.original.payDate}
            </span>
          </div>
        )
      },
      size: 125,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.next?.date ?? "9999",
      id: "deadline",
      header: ({ column }) => (
        <DataGridColumnHeader title="Next deadline" column={column} />
      ),
      cell: ({ row }) => <DeadlineCell client={row.original} />,
      size: 190,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.stats.health,
      id: "health",
      header: ({ column }) => (
        <DataGridColumnHeader title="Status" column={column} />
      ),
      cell: ({ row }) => <HealthCell health={row.original.stats.health} />,
      size: 150,
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        // Menu clicks bubble through the portal; keep them off the row click.
        <div
          className="flex items-center justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <ActionsCell client={row.original} onNavigate={onNavigate} />
        </div>
      ),
      size: 48,
      enableSorting: false,
    },
  ]
}

export function ClientsGrid() {
  const router = useRouter()
  const { state } = useAccounting()
  const [activeTab, setActiveTab] = useState<ClientTab>("all")
  const [filterQuery, setFilterQuery] =
    useState<FilterQuery>(createDefaultFilters)
  const filters = useMemo(
    () => flattenFilterConditions(filterQuery),
    [filterQuery]
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: "toReview", desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  const clients = scopedClients(state.scope)
  const rows = useMemo<ClientRow[]>(
    () =>
      clients.map((client) => ({
        ...client,
        // The whole store, as Home and the sidebar pass it: approvals and
        // the pay loop change what is ready and what is blocked.
        stats: getClientStats(state.items, client.id, state.requests, OPEN_MONTH, state),
        // The next deadline that isn't done yet, blocked ones first.
        next: getClientDeadlines(client, OPEN_MONTH, state.items, state.requests, state).find(
          (d) => d.status !== "done"
        ),
      })),
    [clients, state]
  )

  const filteredBase = useMemo(
    () => applyFilters(rows, filters, fieldValue),
    [rows, filters]
  )

  const filteredRows = useMemo(
    () =>
      filteredBase.filter((row) =>
        activeTab === "all" ? true : row.stats.health === activeTab
      ),
    [activeTab, filteredBase]
  )

  const tabCounts = useMemo(
    () => ({
      all: filteredBase.length,
      needs_review: filteredBase.filter((r) => r.stats.health === "needs_review")
        .length,
      waiting_customer: filteredBase.filter(
        (r) => r.stats.health === "waiting_customer"
      ).length,
      ready_to_close: filteredBase.filter(
        (r) => r.stats.health === "ready_to_close"
      ).length,
    }),
    [filteredBase]
  )

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          review: acc.review + row.stats.toReview + row.stats.replied,
          waiting: acc.waiting + row.stats.waiting,
        }),
        { review: 0, waiting: 0 }
      ),
    [rows]
  )

  const resetPagination = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [])

  const columns = useMemo(
    () => createColumns((href) => router.push(href)),
    [router]
  )

  const table = useTable({
    features: dataGridFeatures,
    data: filteredRows,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      pagination,
      // Every row is mine in "My customers", so the column would repeat me.
      columnVisibility: { accountant: state.scope === "all" },
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  })

  return (
    <DataGrid
      table={table}
      recordCount={filteredRows.length}
      emptyMessage="No clients match this view. Switch tabs or clear the filters."
      onRowClick={(row) => router.push(`/clients/${row.id}`)}
      tableLayout={{ dense: true }}
      tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
    >
      <Frame dense variant="default" spacing="sm" className="w-full">
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <FrameTitle className="text-balance">In operation</FrameTitle>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
              <span>
                {state.scope === "mine" ? "My customers" : "All customers"} ·{" "}
                {rows.length}
              </span>
              <DotSeparator className="bg-input" />
              <span>{totals.review} suggestions to review</span>
              <DotSeparator className="bg-input" />
              <span>{totals.waiting} with customers</span>
            </FrameDescription>
          </div>
          <ScopeToggle />
        </FrameHeader>

        <FramePanel className="p-0 shadow-none!">
          <div className="px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as ClientTab)
                resetPagination()
              }}
            >
              <TabsList variant="line" className="gap-5">
                {CLIENT_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                  >
                    <span>{tab.label}</span>
                    <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                      {tabCounts[tab.value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3 px-(--frame-panel-header-px) py-2.5">
            <Filters
              query={filterQuery}
              fields={filterFields}
              onQueryChange={(next) => {
                setFilterQuery(next)
                resetPagination()
              }}
              size="default"
              trigger={
                <Button variant="outline" aria-label="Filters">
                  <FilterIcon className="size-4" aria-hidden="true" />
                  Filters
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilterQuery(createDefaultFilters())
                resetPagination()
              }}
            >
              <FunnelXIcon className="size-4" aria-hidden="true" />
              Clear
            </Button>
          </div>

          <Separator />

          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>

          <Separator />

          <FrameFooter>
            <DataGridPagination />
          </FrameFooter>
        </FramePanel>
      </Frame>
    </DataGrid>
  )
}
