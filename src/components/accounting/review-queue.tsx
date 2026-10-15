"use client"

// Adapted from @reui/data-grid-filtering-2. The agents' suggestions for one
// client, split by where they are in the accountant <-> customer loop.
import { useCallback, useMemo, useState } from "react"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table"
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
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  CheckCheckIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  FilterIcon,
  FlagIcon,
  FunnelXIcon,
  GaugeIcon,
  LockIcon,
  MessageSquareDashedIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PayFlag } from "@/components/people/pay-line-note"
import { AnomalyBadge, AnomalyIcon, AnomalyLine } from "./anomaly"
import { AddInvoiceDialog } from "@/components/periods/add-invoice-dialog"
import { monthName, OPEN_PERIOD, PERIODS, tabOf } from "@/lib/accounting/data"
import { ANOMALY_KINDS, ANOMALY_LABEL, openAnomalies, type AnomalyState } from "@/lib/accounting/anomalies"
import { isLateInvoice } from "@/lib/accounting/filings"
import { isWorkable, monthHistory, monthStatus } from "@/lib/accounting/periods"
import { getPayroll, runOf } from "@/lib/accounting/payroll"
import { creditAccount, useAccounting } from "@/lib/accounting/store"
import { isParked } from "@/lib/accounting/team"
import type { Domain, IssueKind, ReviewItem } from "@/lib/accounting/types"
import { applyFilters, renderSingleSelectedLabel } from "./grid-filters"
import {
  confidenceTone,
  formatDate,
  formatNok,
  initials,
  ISSUE_META,
} from "./meta"
import {
  ConfidenceMeter,
  DotSeparator,
  IconChip,
  StatusBadge,
} from "./primitives"
import { ActionMenu, useItemActions } from "./task-actions"
import { teamStatusOf, TeamStatusLine } from "./team-notes"

export type QueueTab = "review" | "waiting" | "booked" | "all"

function queueTabs(domain: Domain): { value: QueueTab; label: string }[] {
  return [
    { value: "review", label: "To review" },
    { value: "waiting", label: "Waiting" },
    { value: "booked", label: domain === "payroll" ? "Approved" : "Booked" },
    { value: "all", label: "All" },
  ]
}

export function inTab(item: ReviewItem, tab: QueueTab) {
  switch (tab) {
    case "review":
      return (
        (item.status === "needs_review" || item.status === "customer_replied") &&
        !item.skipped &&
        !isParked(item)
      )
    // On the customer, on a colleague, or snoozed. A pay line left out of
    // the month waits on nobody: it shows under All.
    case "waiting":
      return (
        !item.skipped &&
        (item.status === "waiting_customer" ||
          (item.status !== "booked" && isParked(item)))
      )
    case "booked":
      return item.status === "booked"
    case "all":
      return true
  }
}

/** Ready for a one-click confirm: the agent is sure, nothing is flagged and
    nothing is unusual. An anomaly always gets a person's look, however sure
    the agent is of the posting. */
export function isAutoConfirmable(item: ReviewItem, state: AnomalyState) {
  return (
    item.status === "needs_review" &&
    !item.issue &&
    !openAnomalies(state, item).length &&
    !item.skipped &&
    !isLateInvoice(item) &&
    !isParked(item) &&
    item.suggestion.confidence >= 0.9
  )
}

const ISSUE_OPTIONS = (Object.keys(ISSUE_META) as IssueKind[]).map((key) => ({
  value: key,
  label: ISSUE_META[key].label,
}))

const CONFIDENCE_OPTIONS = [
  { value: "High", label: "High (90%+)" },
  { value: "Medium", label: "Medium (70-89%)" },
  { value: "Low", label: "Low (<70%)" },
]

function anomalyOptions(domain: Domain) {
  return ANOMALY_KINDS[domain].map((kind) => ({ value: kind, label: ANOMALY_LABEL[kind] }))
}

function buildFilterFields(domain: Domain): FilterField[] {
  const anomalies = anomalyOptions(domain)
  return [
    {
      id: "search",
      label: domain === "bookkeeping" ? "Supplier" : "Employee",
      icon: <SearchIcon className="size-3.5" aria-hidden />,
      type: "text",
      placeholder: "Search...",
    },
    {
      id: "issue",
      label: "Agent flag",
      icon: <FlagIcon className="size-3.5" aria-hidden />,
      type: "select",
      searchable: false,
      options: ISSUE_OPTIONS,
      renderValue: ({ values }) =>
        renderSingleSelectedLabel(values, ISSUE_OPTIONS),
    },
    {
      id: "anomaly",
      label: "Anomaly",
      icon: <AnomalyIcon className="size-3.5" aria-hidden />,
      type: "select",
      searchable: false,
      options: anomalies,
      renderValue: ({ values }) => renderSingleSelectedLabel(values, anomalies),
    },
    {
      id: "confidence",
      label: "Confidence",
      icon: <GaugeIcon className="size-3.5" aria-hidden />,
      type: "select",
      searchable: false,
      options: CONFIDENCE_OPTIONS,
      renderValue: ({ values }) =>
        renderSingleSelectedLabel(values, CONFIDENCE_OPTIONS),
    },
  ]
}

function createDefaultFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({
      id: "search-1",
      path: ["search"],
      operator: "contains",
      value: "",
    }),
  ])
}

function fieldValue(item: ReviewItem, field: string, state: AnomalyState) {
  switch (field) {
    case "search":
      return [item.title, item.subtitle, item.suggestion.lines[0]?.account]
        .join(" ")
        .toLowerCase()
    case "issue":
      return item.issue ?? ""
    case "anomaly":
      return openAnomalies(state, item).map((a) => a.kind)
    case "confidence":
      return confidenceTone(item.suggestion.confidence).label
    default:
      return ""
  }
}

// ── Cells ──

/** "Invoice · due 2 Oct" or "Card receipt": what the document is and, for
    an invoice, when it will leave the bank. */
export function documentLabel(item: ReviewItem) {
  if (item.expense)
    return `Expense · ${item.expense.employee.split(" ")[0]} · repaid ${item.dueDate ? formatDate(item.dueDate) : "with the pay"}`
  if (item.creditFor) return "Credit note"
  if (item.kind === "invoice")
    return `Invoice · due ${item.dueDate ? formatDate(item.dueDate) : "on receipt"}`
  if (item.kind === "receipt") return "Card receipt"
  return "Bank line"
}

function DocumentCell({ item }: { item: ReviewItem }) {
  const { state } = useAccounting()
  const open = item.status !== "booked"
  const unusual = open && !item.issue && openAnomalies(state, item).length > 0
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconChip
        className={
          open && (item.issue || unusual)
            ? "text-warning-text"
            : "text-muted-foreground"
        }
      >
        {open && item.issue ? (
          ISSUE_META[item.issue].icon
        ) : unusual ? (
          <AnomalyIcon aria-hidden="true" />
        ) : (
          <ReceiptTextIcon aria-hidden="true" />
        )}
      </IconChip>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {item.title}
        </span>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          {item.period !== state.month ? (
            <Badge variant="info-light" size="sm" className="shrink-0">
              {monthName(item.period)}
            </Badge>
          ) : null}
          <span className="shrink-0 tabular-nums">{formatDate(item.date)}</span>
          <DotSeparator className="bg-input" />
          <span className="truncate">{documentLabel(item)}</span>
        </div>
      </div>
    </div>
  )
}

function EmployeeCell({ item }: { item: ReviewItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(item.title)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {item.title}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {item.subtitle}
        </span>
      </div>
    </div>
  )
}

function PostingCell({ item }: { item: ReviewItem }) {
  const line = item.suggestion.lines[0]
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-foreground truncate text-sm">{line.account}</span>
      <span className="text-muted-foreground truncate text-xs">
        {item.domain === "bookkeeping"
          ? [
              `VAT ${line.vat}`,
              `against ${creditAccount(item).split(" ")[0]}`,
              item.accrueMonths ? `spread over ${item.accrueMonths} months` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : item.suggestion.lines.length > 1
            ? `+ ${item.suggestion.lines.length - 1} more line${item.suggestion.lines.length > 2 ? "s" : ""}`
            : item.basis}
      </span>
    </div>
  )
}

/** "Paid · regular run" under a pay line; until then, what stands out. */
function PayRunStatus({ item }: { item: ReviewItem }) {
  const { state } = useAccounting()
  const run = runOf(
    getPayroll(state.items, state.progress, item.clientId, item.period).runs,
    item.id
  )
  if (!run) return <PayFlag item={item} />
  return (
    <span className="text-muted-foreground text-xs">
      Paid · {run.seq === 1 ? "regular run" : `follow-up run ${run.seq}`}
    </span>
  )
}

function StatusCell({
  item,
  hasDraft,
}: {
  item: ReviewItem
  hasDraft: boolean
}) {
  const { state } = useAccounting()
  if (item.skipped)
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Badge variant="outline">Not paid this month</Badge>
        <span className="text-muted-foreground text-xs">Left out of {monthName(item.period)}</span>
      </div>
    )
  const anomalies = openAnomalies(state, item)
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className="flex max-w-full min-w-0 items-center gap-1.5">
        <StatusBadge status={item.status} domain={item.domain} />
        <AnomalyBadge anomalies={anomalies} />
      </div>
      {teamStatusOf(item) && item.status !== "booked" ? (
        <TeamStatusLine task={item} />
      ) : hasDraft && item.status === "needs_review" ? (
        <span className="text-primary inline-flex items-center gap-1 text-xs [&_svg]:size-3">
          <MessageSquareDashedIcon aria-hidden="true" />
          Question drafted
        </span>
      ) : item.issue && item.status === "needs_review" ? (
        <span className="inline-flex items-center gap-1 text-xs text-warning-text [&_svg]:size-3">
          {ISSUE_META[item.issue].icon}
          {ISSUE_META[item.issue].label}
        </span>
      ) : anomalies.length && item.domain === "bookkeeping" && item.status !== "booked" ? (
        <AnomalyLine anomalies={anomalies} />
      ) : item.status === "booked" && item.voucherNo ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          Voucher {item.voucherNo}
        </span>
      ) : item.domain === "payroll" ? (
        <PayRunStatus item={item} />
      ) : null}
    </div>
  )
}

function ActionsCell({ item }: { item: ReviewItem }) {
  const { state } = useAccounting()
  const request = item.requestId
    ? state.requests.find((r) => r.id === item.requestId)
    : undefined
  const actions = useItemActions(item, request)
  return (
    <ActionMenu
      actions={actions}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Open actions for ${item.title}`}
        >
          <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
        </Button>
      }
    />
  )
}

function createColumns(
  domain: Domain,
  hasDraft: (item: ReviewItem) => boolean
): ColumnDef<DataGridFeatures, ReviewItem>[] {
  const isBookkeeping = domain === "bookkeeping"
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
      id: "title",
      header: ({ column }) => (
        <DataGridColumnHeader
          title={isBookkeeping ? "Supplier" : "Employee"}
          column={column}
        />
      ),
      cell: ({ row }) =>
        isBookkeeping ? (
          <DocumentCell item={row.original} />
        ) : (
          <EmployeeCell item={row.original} />
        ),
      size: isBookkeeping ? 300 : 230,
      minSize: 200,
      enableSorting: true,
      enableHiding: false,
      meta: { autoSize: true, headerClassName: "pl-3!", cellClassName: "pl-3!" },
    },
    {
      accessorFn: (row) => row.amount,
      id: "amount",
      header: ({ column }) => (
        <DataGridColumnHeader
          title={isBookkeeping ? "Amount" : "Gross pay"}
          column={column}
        />
      ),
      cell: ({ row }) => (
        <span className="text-foreground text-sm tabular-nums">
          {formatNok(row.original.amount)}
        </span>
      ),
      size: 130,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.suggestion.lines[0]?.account,
      id: "posting",
      header: ({ column }) => (
        <DataGridColumnHeader
          title={isBookkeeping ? "Suggested posting" : "Pay lines"}
          column={column}
        />
      ),
      cell: ({ row }) => <PostingCell item={row.original} />,
      size: 220,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.suggestion.confidence,
      id: "confidence",
      header: ({ column }) => (
        <DataGridColumnHeader title="Confidence" column={column} />
      ),
      cell: ({ row }) => (
        <div className="w-24">
          <ConfidenceMeter
            value={row.original.suggestion.confidence}
            label="Agent"
            compact
          />
        </div>
      ),
      size: 130,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.status,
      id: "status",
      header: ({ column }) => (
        <DataGridColumnHeader title="Status" column={column} />
      ),
      cell: ({ row }) => (
        <StatusCell item={row.original} hasDraft={hasDraft(row.original)} />
      ),
      size: 190,
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
          <ActionsCell item={row.original} />
        </div>
      ),
      size: 56,
      enableSorting: false,
    },
  ]
}

export function ReviewQueue({
  clientId,
  domain,
  title,
}: {
  clientId: string
  domain: Domain
  title: string
}) {
  const { state, dispatch } = useAccounting()
  const panelOpen = Boolean(state.openItemId)
  const period = state.month
  // Bookkeeping follows the month: open, or reopened after a close. Pay
  // runs ahead of it, so payroll keeps to its own open period.
  const status = monthStatus(clientId, period, state)
  const readOnly =
    domain === "bookkeeping" ? !isWorkable(status) : period !== OPEN_PERIOD[domain]
  const periodMeta = PERIODS[domain].find((p) => p.id === period)
  const lockNote =
    domain === "payroll"
      ? periodMeta?.note
      : status === "before"
        ? "Before we took over"
        : `Closed ${monthHistory(clientId, period, state).at(-1)?.on ?? ""}`.trim()
  const [adding, setAdding] = useState(false)
  const [tab, setActiveTab] = useState<QueueTab>("review")
  // A closed month has nothing to review, so it opens on everything.
  const activeTab: QueueTab = readOnly && tab === "review" ? "all" : tab
  const [filterQuery, setFilterQuery] =
    useState<FilterQuery>(createDefaultFilters)
  const filters = useMemo(
    () => flattenFilterConditions(filterQuery),
    [filterQuery]
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: "confidence", desc: false },
  ])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const items = useMemo(
    () =>
      // Bank lines and card receipts live on the Reconciliation tab.
      // Bookkeeping is an inbox: what is still to book shows whatever month
      // it belongs to (a reopened August's next to October's), each with its
      // month; what's booked is the month in view.
      state.items.filter(
        (i) =>
          i.clientId === clientId &&
          tabOf(i) === domain &&
          (i.period === period ||
            (domain === "bookkeeping" &&
              !readOnly &&
              i.status !== "booked" &&
              isWorkable(monthStatus(clientId, i.period, state))))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.closing, state.periods, clientId, domain, period, readOnly]
  )
  const otherMonths = items.filter((i) => i.period !== period).length
  const otherNames = [...new Set(items.filter((i) => i.period !== period).map((i) => monthName(i.period)))]
  const filterFields = useMemo(() => buildFilterFields(domain), [domain])
  const filteredBase = useMemo(
    () => applyFilters(items, filters, (item, field) => fieldValue(item, field, state)),
    [items, filters, state]
  )
  const rows = useMemo(
    () => filteredBase.filter((item) => inTab(item, activeTab)),
    [filteredBase, activeTab]
  )
  const tabCounts = useMemo(
    () =>
      Object.fromEntries(
        queueTabs(domain).map((tab) => [
          tab.value,
          filteredBase.filter((item) => inTab(item, tab.value)).length,
        ])
      ) as Record<QueueTab, number>,
    [filteredBase, domain]
  )

  const autoConfirmable = items.filter((i) => isAutoConfirmable(i, state))
  const flagged = items.filter(
    (i) => i.status === "needs_review" && i.issue && !i.skipped
  ).length
  // Lines still to book with something unusual: a booked one has gone on
  // to the customer's approval.
  const unusual = items.filter((i) => i.status !== "booked" && openAnomalies(state, i).length).length
  const replied = items.filter((i) => i.status === "customer_replied").length
  const selectedIds = Object.keys(rowSelection).filter((id) =>
    items.some((i) => i.id === id && i.status !== "booked" && !i.skipped)
  )

  const resetPagination = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [])

  const confirm = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      dispatch({ type: "confirm", ids })
      setRowSelection({})
      toast.success(
        domain === "bookkeeping"
          ? ids.length === 1
            ? "Booked in Tripletex"
            : `${ids.length} vouchers booked in Tripletex`
          : ids.length === 1
            ? "Approved for the pay run"
            : `${ids.length} employees approved for the pay run`,
        {
          description:
            domain === "bookkeeping"
              ? "Invoices wait on 2400 until their payment is matched in the reconciliation."
              : "Nothing goes to Tripletex yet. Approving the run makes one salary voucher for everyone.",
        }
      )
    },
    [dispatch, domain]
  )

  const draftItemIds = useMemo(
    () =>
      new Set(
        state.requests.filter((r) => r.status === "draft").map((r) => r.itemId)
      ),
    [state.requests]
  )

  const columns = useMemo(
    () =>
      createColumns(domain, (item) => draftItemIds.has(item.id)),
    [domain, draftItemIds]
  )

  const table = useTable({
    features: dataGridFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      rowSelection,
      pagination,
      // With the panel open the grid is a picker: the panel already shows
      // the posting and confidence, so those columns step aside for room.
      columnVisibility: panelOpen
        ? { select: false, posting: false, confidence: false, actions: false }
        : {},
      // Narrower picker columns so every visible cell fits beside the panel.
      columnSizing: panelOpen ? { title: 220, amount: 112, status: 156 } : {},
    },
    enableRowSelection: (row) => row.original.status !== "booked" && !row.original.skipped,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
  })
  // The panel walks rows in the order the grid shows them (sort + filters).
  const navIds = table.getPrePaginatedRowModel().rows.map((row) => row.id)

  const activeId = state.openItemId && items.some((i) => i.id === state.openItemId)
    ? state.openItemId
    : null

  const emptyMessage =
    activeTab === "review"
      ? "Nothing left to review. The agents will add new suggestions as transactions arrive."
      : activeTab === "waiting"
        ? "Nothing waiting on customers or colleagues."
        : "Nothing here yet."

  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      emptyMessage={emptyMessage}
      onRowClick={(row) =>
        dispatch({ type: "open_item", id: row.id, nav: navIds })
      }
      tableLayout={{ dense: true }}
      tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
    >
      <Frame dense variant="default" spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <FrameTitle className="text-balance">
              {title} · {domain === "payroll" ? `${periodMeta?.label} hours` : periodMeta?.label}
            </FrameTitle>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
              <span>
                {items.length}{" "}
                {domain === "payroll"
                  ? items.length === 1 ? "employee" : "employees"
                  : items.length === 1 ? "document" : "documents"}
                {otherMonths ? ` · ${otherMonths} for ${otherNames.join(" and ")}` : ""}
              </span>
              <DotSeparator className="bg-input" />
              {readOnly ? (
                <span className="inline-flex items-center gap-1">
                  <LockIcon className="size-3" aria-hidden="true" />
                  {lockNote}, read-only
                </span>
              ) : (
                <span>{flagged} flagged by agents</span>
              )}
              {!readOnly && unusual > 0 ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span className="text-warning-text inline-flex items-center gap-1 [&_svg]:size-3">
                    <AnomalyIcon aria-hidden="true" />
                    {unusual} {unusual === 1 ? "anomaly" : "anomalies"} to look at
                  </span>
                </>
              ) : null}
              {replied > 0 ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span className="text-info-text">
                    {replied} customer {replied === 1 ? "reply" : "replies"} to
                    review
                  </span>
                </>
              ) : null}
            </FrameDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          {/* The forgotten invoice the customer mailed: added by hand. */}
          {domain === "bookkeeping" && !readOnly ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => setAdding(true)}
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              Add invoice
            </Button>
          ) : null}
          {readOnly ? null : selectedIds.length > 0 ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => confirm(selectedIds)}
            >
              <CheckIcon className="size-4" aria-hidden="true" />
              {domain === "bookkeeping" ? "Book" : "Approve"} {selectedIds.length} selected
            </Button>
          ) : autoConfirmable.length > 0 ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => confirm(autoConfirmable.map((i) => i.id))}
            >
              <CheckCheckIcon className="size-4" aria-hidden="true" />
              {domain === "bookkeeping" ? "Book" : "Approve"} {autoConfirmable.length} high-confidence
            </Button>
          ) : null}
          </div>
        </FrameHeader>

        <FramePanel className="p-0 shadow-none!">
          <div className="px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as QueueTab)
                setRowSelection({})
                resetPagination()
              }}
            >
              <TabsList variant="line" className="gap-5">
                {queueTabs(domain).map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                  >
                    <span>
                      {tab.value === "booked" && domain === "payroll" ? "Approved" : tab.label}
                    </span>
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

          {/* The row open in the panel keeps a quiet highlight. */}
          {activeId ? (
            <style>{`[data-queue="${domain}"] tr[data-row-id="${activeId}"] > td { background: color-mix(in oklab, var(--primary) 6%, transparent); }`}</style>
          ) : null}
          <div data-queue={domain}>
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
          </div>

          <Separator />

          <FrameFooter>
            <DataGridPagination />
          </FrameFooter>
        </FramePanel>
      </Frame>
      {domain === "bookkeeping" ? (
        <AddInvoiceDialog clientId={clientId} open={adding} onOpenChange={setAdding} />
      ) : null}
    </DataGrid>
  )
}
