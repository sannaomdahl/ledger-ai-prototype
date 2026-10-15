"use client"

// Companies on their way in, on the same Frame > tabs > Filters > grid spine
// as the Clients list (@reui/data-grid-filtering-2). The tabs are the phases;
// inside a phase the status line says who holds the case and why, so the
// accountant sorts by "is it me" rather than by stage.
import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
import { FilterIcon, FunnelXIcon, SearchIcon, UserIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ACCOUNTANT_BY_ID, ACCOUNTANTS, CURRENT_USER } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import {
  caseStatus,
  company,
  formatDay,
  isOnboarding,
  phaseIndex,
  type Ball,
  type CaseStatus,
  type OnboardingCase,
  type Phase,
  type RegisterCompany,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { applyFilters, renderSingleSelectedLabel } from "@/components/accounting/grid-filters"
import { ScopeToggle } from "@/components/accounting/scope-toggle"
import { ClientChip, DotSeparator } from "@/components/accounting/primitives"
import { BallBadge, PhaseMeter } from "./meta"

type Row = OnboardingCase & { company: RegisterCompany; status: CaseStatus }

type Tab = "all" | Phase | "declined"

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assessment", label: "Assessment" },
  { value: "offer", label: "Offer" },
  { value: "setup", label: "Setup" },
  { value: "takeover", label: "Takeover" },
  { value: "declined", label: "Declined" },
]

/** Mine first, then what's ready to approve, then what waits on others. */
const BALL_ORDER: Record<Ball, number> = {
  us: 0,
  ready: 1,
  customer: 2,
  waiting: 3,
  done: 4,
  declined: 5,
}

const ACCOUNTANT_OPTIONS = ACCOUNTANTS.map((a) => ({ value: a.id, label: a.name }))

const filterFields: FilterField[] = [
  {
    id: "company",
    label: "Company",
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
    renderValue: ({ values }) => renderSingleSelectedLabel(values, ACCOUNTANT_OPTIONS),
  },
]

function createDefaultFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({ id: "company-1", path: ["company"], operator: "contains", value: "" }),
  ])
}

function fieldValue(row: Row, field: string) {
  switch (field) {
    case "company":
      return [row.company.name, row.company.orgNo, row.company.industry, row.company.city]
        .join(" ")
        .toLowerCase()
    case "accountant":
      return row.accountantId
    default:
      return ""
  }
}

function inTab(row: Row, tab: Tab) {
  if (tab === "declined") return Boolean(row.declined)
  // Handed over, the company is a client in operation and leaves this list.
  if (!isOnboarding(row)) return false
  return tab === "all" || row.phase === tab
}

function daysSince(iso: string) {
  return Math.round((new Date(TODAY).getTime() - new Date(iso).getTime()) / 86_400_000)
}

// ── Cells ──

function CompanyCell({ row }: { row: Row }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ClientChip />
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">{row.company.name}</span>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate tabular-nums">{row.company.orgNo}</span>
          <DotSeparator className="bg-input" />
          <span className="truncate">{row.company.industry}</span>
        </div>
      </div>
    </div>
  )
}

function AccountantCell({ row }: { row: Row }) {
  const accountant = ACCOUNTANT_BY_ID.get(row.accountantId)
  if (!accountant) return null
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-7">
        <AvatarFallback className="text-[10px]">{accountant.initials}</AvatarFallback>
      </Avatar>
      <span className="text-foreground truncate text-sm">{accountant.name}</span>
    </div>
  )
}

function TakeoverCell({ row }: { row: Row }) {
  if (!row.offer) return <span className="text-muted-foreground text-sm">Not agreed</span>
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-foreground text-sm tabular-nums">{formatDay(row.offer.takeoverDate)}</span>
      <span className="text-muted-foreground truncate text-xs">
        {row.offer.status === "accepted" ? "Signed" : "Proposed"}
      </span>
    </div>
  )
}

function createColumns(): ColumnDef<DataGridFeatures, Row>[] {
  return [
    {
      accessorFn: (row) => row.company.name,
      id: "company",
      header: ({ column }) => <DataGridColumnHeader title="Company" column={column} />,
      cell: ({ row }) => <CompanyCell row={row.original} />,
      size: 260,
      minSize: 220,
      enableSorting: true,
      enableHiding: false,
      meta: { autoSize: true, headerClassName: "pl-3!", cellClassName: "pl-3!" },
    },
    {
      accessorFn: (row) => ACCOUNTANT_BY_ID.get(row.accountantId)?.name,
      id: "accountant",
      header: ({ column }) => <DataGridColumnHeader title="Accountant" column={column} />,
      cell: ({ row }) => <AccountantCell row={row.original} />,
      size: 170,
      enableSorting: true,
    },
    {
      accessorFn: (row) => phaseIndex(row.phase),
      id: "phase",
      header: ({ column }) => <DataGridColumnHeader title="Phase" column={column} />,
      cell: ({ row }) => <PhaseMeter c={row.original} />,
      size: 110,
      enableSorting: true,
    },
    {
      accessorFn: (row) => BALL_ORDER[row.status.ball],
      id: "status",
      header: ({ column }) => <DataGridColumnHeader title="Where it stands" column={column} />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <BallBadge ball={row.original.status.ball} />
          <span className="text-muted-foreground max-w-full truncate text-xs">{row.original.status.label}</span>
        </div>
      ),
      size: 250,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.offer?.takeoverDate ?? "9999",
      id: "takeover",
      header: ({ column }) => <DataGridColumnHeader title="Takeover" column={column} />,
      cell: ({ row }) => <TakeoverCell row={row.original} />,
      size: 110,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.createdAt,
      id: "started",
      header: ({ column }) => <DataGridColumnHeader title="Started" column={column} />,
      cell: ({ row }) => {
        const days = daysSince(row.original.createdAt)
        return (
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-foreground text-sm tabular-nums">{formatDay(row.original.createdAt)}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} ago`}
            </span>
          </div>
        )
      },
      size: 105,
      enableSorting: true,
    },
  ]
}

export function OnboardingGrid() {
  const router = useRouter()
  const { state } = useAccounting()
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const [filterQuery, setFilterQuery] = useState<FilterQuery>(createDefaultFilters)
  const filters = useMemo(() => flattenFilterConditions(filterQuery), [filterQuery])
  const [sorting, setSorting] = useState<SortingState>([{ id: "status", desc: false }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })

  const rows = useMemo<Row[]>(
    () =>
      state.onboarding
        .filter((c) => state.scope === "all" || c.accountantId === CURRENT_USER.id)
        .map((c) => ({ ...c, company: company(c), status: caseStatus(c) })),
    [state.onboarding, state.scope]
  )

  const filteredBase = useMemo(() => applyFilters(rows, filters, fieldValue), [rows, filters])
  const filteredRows = useMemo(
    () => filteredBase.filter((row) => inTab(row, activeTab)),
    [activeTab, filteredBase]
  )
  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((tab) => [tab.value, filteredBase.filter((row) => inTab(row, tab.value)).length])
      ) as Record<Tab, number>,
    [filteredBase]
  )
  const mine = rows.filter((r) => r.status.ball === "us").length
  const ready = rows.filter((r) => r.status.ball === "ready").length

  const resetPagination = useCallback(() => {
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }))
  }, [])

  const columns = useMemo(() => createColumns(), [])

  const table = useTable({
    features: dataGridFeatures,
    data: filteredRows,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      pagination,
      columnVisibility: { accountant: state.scope === "all" },
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  })

  return (
    <DataGrid
      table={table}
      recordCount={filteredRows.length}
      emptyMessage="Nobody in this phase. Switch tabs or clear the filters."
      onRowClick={(row) => router.push(`/onboarding/${row.id}`)}
      tableLayout={{ dense: true }}
      tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
    >
      <Frame dense variant="default" spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <FrameTitle className="text-balance">Onboarding</FrameTitle>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
              <span>{mine} waiting on you</span>
              <DotSeparator className="bg-input" />
              <span>{ready} ready to approve</span>
              <DotSeparator className="bg-input" />
              <span>Not customers until they sign</span>
            </FrameDescription>
          </div>
          <ScopeToggle />
        </FrameHeader>

        <FramePanel className="p-0 shadow-none!">
          <div className="overflow-x-auto px-(--frame-panel-header-px) pt-(--frame-panel-header-py) [scrollbar-width:none]">
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as Tab)
                resetPagination()
              }}
            >
              <TabsList variant="line" className="gap-5">
                {TABS.filter((tab) => tab.value !== "declined" || counts.declined > 0).map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                  >
                    <span>{tab.label}</span>
                    <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                      {counts[tab.value]}
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
