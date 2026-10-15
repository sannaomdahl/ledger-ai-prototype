"use client"

// The month's pay run, one row per employee: who they are and on what
// terms, whether the customer confirmed that pay, this month's gross and
// what stands out against their usual pay, and where their line is in the
// loop. The employee list and the pay lines used to be two tables of the
// same people; the list's agreement and confirmation are what make "Same
// as always" and the anomalies, so they sit on the person's row. A line for
// an earlier month shows under its employee. Rows open the pay line in the
// detail panel, like the bookkeeping queue.
import { createContext, useContext, useMemo, useState } from "react"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  useTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  CalendarMinusIcon,
  CheckCheckIcon,
  CheckIcon,
  CornerDownRightIcon,
  EllipsisVerticalIcon,
  HistoryIcon,
  LockIcon,
  MessageSquareDashedIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CLIENT_BY_ID,
  dayLabel,
  monthName,
  nextMonth,
  OPEN_PERIOD,
  PERIODS,
} from "@/lib/accounting/data"
import { getPayroll, runOf } from "@/lib/accounting/payroll"
import {
  agreementLabel,
  correctionOf,
  customerRejection,
  employeeRows,
  employeesOf,
  employeeStatus,
  type Employee,
  type PayCorrection,
} from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"
import type { ReviewItem } from "@/lib/accounting/types"
import { formatDate, formatNok, initials, ISSUE_META } from "@/components/accounting/meta"
import { ConfidenceMeter, DotSeparator, StatusBadge } from "@/components/accounting/primitives"
import { inTab, isAutoConfirmable, type QueueTab } from "@/components/accounting/review-queue"
import { ActionMenu, useItemActions, type TaskAction } from "@/components/accounting/task-actions"
import { teamStatusOf, TeamStatusLine } from "@/components/accounting/team-notes"
import { AddHireDialog, CorrectionDialog, LeavingDialog } from "./employee-dialogs"
import { PayFlag } from "./pay-line-note"
import { HireDetailsStatus } from "./hire-details"
import { AnomalyBadge, AnomalyIcon } from "@/components/accounting/anomaly"
import { openAnomalies } from "@/lib/accounting/anomalies"

const TABS: { value: QueueTab; label: string }[] = [
  { value: "review", label: "To review" },
  { value: "waiting", label: "Waiting" },
  { value: "booked", label: "Approved" },
  { value: "all", label: "All" },
]

/** A person's row, or a line for an earlier month under it. */
type PayRow = {
  id: string
  name: string
  employee?: Employee
  /** The pay line this row stands for. None for someone who starts later
      or has left. */
  item?: ReviewItem
  /** A second line under the person: usually pay for an earlier month. */
  sub?: boolean
  correction?: PayCorrection
  /** Moved on to next month's run. */
  moved: boolean
  subRows?: PayRow[]
}

/** A row belongs in a tab when its line does, or a line under it does.
    Moved lines and people without a line wait on nobody: only under All. */
function rowInTab(row: PayRow, tab: QueueTab): boolean {
  if (tab === "all") return true
  const own = Boolean(row.item && !row.moved && inTab(row.item, tab))
  return own || Boolean(row.subRows?.some((sub) => sub.item && inTab(sub.item, tab)))
}

/** "Hourly wage · 96 h × 162 kr + 1 more line". */
function linesSummary(item: ReviewItem) {
  const [first, ...rest] = item.suggestion.lines
  if (!first) return item.basis
  return rest.length
    ? `${first.account} + ${rest.length} more line${rest.length > 1 ? "s" : ""}`
    : first.account
}

// ── Cells ──

function EmployeeCell({ row }: { row: PayRow }) {
  if (row.sub)
    return (
      <div className="flex min-w-0 items-center gap-2 pl-5">
        <CornerDownRightIcon
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-foreground truncate text-sm">
            {row.correction
              ? `${row.correction.what} for ${monthName(row.correction.earnedIn)}`
              : row.item?.subtitle}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {row.correction ? "Correction, paid with this run" : "Second line this month"}
          </span>
        </div>
      </div>
    )
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(row.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">{row.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {row.employee?.role ?? row.item?.subtitle}
        </span>
      </div>
    </div>
  )
}

/** "Fixed · 52 000 kr", "Hourly · 162 kr", "Commission · base 24 000 kr":
    the unit follows from the kind. */
function shortAgreement(e: Employee) {
  if (!e.amount) return agreementLabel(e)
  const kr = `${new Intl.NumberFormat("nb-NO").format(e.amount)} kr`
  if (e.agreement === "fixed") return `Fixed · ${kr}`
  if (e.agreement === "hourly") return `Hourly · ${kr}`
  return `Commission · base ${kr}`
}

/** The pay agreed, and whether the customer confirmed it: the two things
    "Same as always" rests on. */
function AgreementCell({ row }: { row: PayRow }) {
  const month = useAccounting().state.month
  const e = row.employee
  if (row.sub || !e) return null
  const status = employeeStatus(e, month)
  const standing =
    status === "leaving" ? (
      <span className="text-warning-text">Leaving {dayLabel(e.end!)}</span>
    ) : status === "left" ? (
      <span>Left {dayLabel(e.end!)}</span>
    ) : status === "starts" || (status === "new" && e.start >= `${month}-01`) ? (
      <span className="text-info-text">New, starts {dayLabel(e.start)}</span>
    ) : status === "new" ? (
      <span className="text-info-text">New, not confirmed</span>
    ) : e.confirmed ? (
      <span className="inline-flex min-w-0 items-center gap-1">
        <CheckIcon className="text-success-text size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {e.confirmed.via === "onboarding"
            ? "Agreed in onboarding"
            : `Confirmed by ${e.confirmed.by.split(" ")[0]}`}
        </span>
      </span>
    ) : (
      <span>Not confirmed</span>
    )
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-foreground truncate text-sm">{shortAgreement(e)}</span>
      <span className="text-muted-foreground truncate text-xs">{standing}</span>
    </div>
  )
}

function GrossCell({ row }: { row: PayRow }) {
  const month = useAccounting().state.month
  const { item } = row
  if (!item) {
    const e = row.employee
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">
          {e && employeeStatus(e, month) === "starts"
            ? `First pay in ${monthName(e.start.slice(0, 7))}'s run`
            : `Nothing to pay for ${monthName(month)}`}
        </span>
        {e && employeeStatus(e, month) === "starts" ? <HireDetailsStatus employee={e} /> : null}
      </div>
    )
  }
  const out = row.moved || item.skipped
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span
        className={
          out
            ? "text-muted-foreground text-sm tabular-nums line-through decoration-1"
            : "text-foreground text-sm tabular-nums"
        }
      >
        {formatNok(item.amount)}
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {row.correction
          ? `Booked back to ${monthName(row.correction.earnedIn)}: Dr 5000 / Cr 2980`
          : linesSummary(item)}
      </span>
    </div>
  )
}

/** Against the person's usual pay and agreement. */
function FlagCell({ row }: { row: PayRow }) {
  if (!row.item || row.sub) return null
  return (
    <PayFlag
      item={row.item}
      fallback={<span className="text-muted-foreground text-xs">Nothing unusual</span>}
    />
  )
}

function PayStatus({ row }: { row: PayRow }) {
  const { state } = useAccounting()
  const { month } = state
  const { item } = row
  const payroll = getPayroll(
    state.items,
    state.progress,
    item?.clientId ?? row.employee?.clientId ?? "",
    month,
    state.closing
  )
  const run = item ? runOf(payroll.runs, item.id) : undefined
  const hasDraft = Boolean(
    item && state.requests.some((r) => r.status === "draft" && r.itemId === item.id)
  )
  const line = (text: string) => (
    <span className="text-muted-foreground truncate text-xs">{text}</span>
  )
  if (!item)
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Badge variant="outline">Not on this run</Badge>
      </div>
    )
  if (row.moved)
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Badge variant="outline">Moved</Badge>
        {line(`Paid with ${monthName(nextMonth(month))}'s run`)}
      </div>
    )
  if (item.skipped)
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Badge variant="outline">Not paid</Badge>
        {line(`Left out of ${monthName(month)}`)}
      </div>
    )
  if (run)
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Badge variant="outline" className="gap-1">
          <CheckIcon className="text-success-text" aria-hidden="true" />
          Paid
        </Badge>
        {line(
          `${run.seq === 1 ? "Regular run" : `Follow-up run ${run.seq}`} · ${payroll.locked ? "paid" : "pays"} ${formatDate(run.payDate)}`
        )}
      </div>
    )
  const rejection = customerRejection(state, item)
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className="flex max-w-full min-w-0 items-center gap-1.5">
        <StatusBadge status={item.status} domain="payroll" />
        <AnomalyBadge anomalies={openAnomalies(state, item)} />
      </div>
      {rejection ? (
        <span
          title={rejection.note ? `“${rejection.note}”` : undefined}
          className="text-destructive inline-flex max-w-full min-w-0 items-center gap-1 text-xs [&_svg]:size-3 [&_svg]:shrink-0"
        >
          <XCircleIcon aria-hidden="true" />
          <span className="truncate">
            {rejection.corrected
              ? `Corrected, needs ${rejection.by.split(" ")[0]}'s yes`
              : `Rejected by ${rejection.by.split(" ")[0]}`}
          </span>
        </span>
      ) : teamStatusOf(item) && item.status !== "booked" ? (
        <TeamStatusLine task={item} />
      ) : hasDraft && item.status === "needs_review" ? (
        <span className="text-primary inline-flex items-center gap-1 text-xs [&_svg]:size-3">
          <MessageSquareDashedIcon aria-hidden="true" />
          Question drafted
        </span>
      ) : item.issue && item.status === "needs_review" ? (
        <span className="text-warning-text inline-flex items-center gap-1 text-xs [&_svg]:size-3">
          {ISSUE_META[item.issue].icon}
          {ISSUE_META[item.issue].label}
        </span>
      ) : item.status === "booked" ? (
        line("Goes in the next run")
      ) : null}
    </div>
  )
}

const menuTrigger = (name: string) => (
  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Open actions for ${name}`}>
    <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
  </Button>
)

/** What the person's row offers besides their pay line, and whether the
    month can still change. Set by the table, read by each row's menu, so
    the columns stay the same from render to render. */
type PersonActions = {
  readOnly: boolean
  onCorrection: (employee: Employee) => void
  onLeaving: (employee: Employee) => void
}

const PersonActionsContext = createContext<PersonActions>({
  readOnly: true,
  onCorrection: () => {},
  onLeaving: () => {},
})

function personActions(row: PayRow, month: string, on: PersonActions): TaskAction[] {
  const e = row.employee
  if (on.readOnly || !e || row.sub) return []
  const status = employeeStatus(e, month)
  if (status === "left" || status === "starts") return []
  return [
    {
      id: "correction",
      label: "Correction for an earlier month",
      icon: HistoryIcon,
      group: "more",
      menuOnly: true,
      run: () => on.onCorrection(e),
    },
    {
      id: "leaving",
      label: e.end ? "Change last working day" : "Mark as leaving",
      icon: CalendarMinusIcon,
      group: "danger",
      menuOnly: true,
      run: () => on.onLeaving(e),
    },
  ]
}

function RowMenu({ row }: { row: PayRow }) {
  const month = useAccounting().state.month
  const extra = personActions(row, month, useContext(PersonActionsContext))
  return row.item ? (
    <LineMenu row={{ ...row, item: row.item }} month={month} extra={extra} />
  ) : (
    <ActionMenu actions={extra} trigger={menuTrigger(row.name)} />
  )
}

/** The pay line's own actions (approve, ask, move, leave out, undo), then
    the person's. A moved line only offers to come back. */
function LineMenu({
  row,
  month,
  extra,
}: {
  row: PayRow & { item: ReviewItem }
  month: string
  extra: TaskAction[]
}) {
  const { state, dispatch } = useAccounting()
  const { item } = row
  const request = item.requestId ? state.requests.find((r) => r.id === item.requestId) : undefined
  const own = useItemActions(item, request)
  const actions: TaskAction[] = row.moved
    ? [
        {
          id: "unmove",
          label: `Pay in ${monthName(month)}'s run after all`,
          icon: HistoryIcon,
          group: "decide",
          run: () => {
            dispatch({ type: "set_pay_hold", itemId: item.id, hold: null })
            toast.message(`${item.title} is back in ${monthName(month)}'s run`)
          },
        },
      ]
    : own
  return <ActionMenu actions={[...actions, ...extra]} trigger={menuTrigger(row.name)} />
}

function createColumns(): ColumnDef<DataGridFeatures, PayRow>[] {
  return [
    {
      id: "select",
      header: () => <DataGridTableRowSelectAll />,
      cell: ({ row }) => (row.getCanSelect() ? <DataGridTableRowSelect row={row} /> : null),
      size: 30,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
    },
    {
      accessorFn: (row) => row.name,
      id: "employee",
      header: ({ column }) => <DataGridColumnHeader title="Employee" column={column} />,
      cell: ({ row }) => <EmployeeCell row={row.original} />,
      size: 200,
      minSize: 170,
      enableSorting: true,
      enableHiding: false,
      meta: {
        autoSize: true,
        headerClassName: "pl-3!",
        cellClassName: "pl-3!",
      },
    },
    {
      accessorFn: (row) => row.employee?.agreement,
      id: "agreement",
      header: ({ column }) => <DataGridColumnHeader title="Agreement" column={column} />,
      cell: ({ row }) => <AgreementCell row={row.original} />,
      size: 180,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.item?.amount,
      id: "gross",
      header: ({ column }) => <DataGridColumnHeader title="Gross pay" column={column} />,
      cell: ({ row }) => <GrossCell row={row.original} />,
      size: 200,
      enableSorting: true,
      sortUndefined: "last",
    },
    {
      id: "flag",
      header: ({ column }) => <DataGridColumnHeader title="Anomaly" column={column} />,
      cell: ({ row }) => <FlagCell row={row.original} />,
      size: 190,
      enableSorting: false,
    },
    {
      accessorFn: (row) => row.item?.suggestion.confidence,
      id: "confidence",
      header: ({ column }) => <DataGridColumnHeader title="Confidence" column={column} />,
      cell: ({ row }) =>
        row.original.item ? (
          <div className="w-24">
            <ConfidenceMeter
              value={row.original.item.suggestion.confidence}
              label="Agent"
              compact
            />
          </div>
        ) : null,
      size: 120,
      enableSorting: true,
      sortUndefined: "last",
    },
    {
      accessorFn: (row) => row.item?.status,
      id: "status",
      header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
      cell: ({ row }) => <PayStatus row={row.original} />,
      size: 170,
      enableSorting: true,
      sortUndefined: "last",
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        // Menu clicks bubble through the portal; keep them off the row click.
        <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
          <RowMenu row={row.original} />
        </div>
      ),
      size: 56,
      enableSorting: false,
    },
  ]
}

// Lines for earlier months always show under their employee, and a run
// rarely has more than a dozen people: one page. Stable objects, so the
// table never sees its state change.
const ALL_EXPANDED = true as const
const ONE_PAGE = { pageIndex: 0, pageSize: 100 }

export function PayrollTable({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const month = state.month
  const panelOpen = Boolean(state.openItemId)
  const client = CLIENT_BY_ID.get(clientId)
  const first = client?.contacts[0]?.name.split(" ")[0] ?? "the customer"
  const periodMeta = PERIODS.payroll.find((p) => p.id === month)
  const payroll = getPayroll(state.items, state.progress, clientId, month, state.closing)
  // Pay runs ahead of the books: only the open pay period is worked on, and
  // a company handed over from onboarding has no runs before it joined.
  const readOnly =
    month !== OPEN_PERIOD.payroll ||
    payroll.locked ||
    Boolean(client?.since && month < client.since)

  const [tab, setTab] = useState<QueueTab>("review")
  const activeTab: QueueTab = readOnly && tab === "review" ? "all" : tab
  const [sorting, setSorting] = useState<SortingState>([{ id: "confidence", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [hiring, setHiring] = useState(false)
  const [leaving, setLeaving] = useState<Employee | null>(null)
  const [correcting, setCorrecting] = useState<{ preset?: Employee } | null>(null)

  const employees = employeesOf(state, clientId)
  const all: PayRow[] = useMemo(
    () =>
      employeeRows(state, clientId, month).map((r) => ({
        id: r.id,
        name: r.name,
        employee: r.employee,
        item: r.line,
        moved: r.moved,
        subRows: r.extra.map((item) => ({
          id: item.id,
          name: r.name,
          employee: r.employee,
          item,
          sub: true,
          correction: correctionOf(state, item.id),
          moved: item.movedFrom === month,
        })),
      })),
    [state, clientId, month]
  )
  const rows = useMemo(
    () =>
      all
        .filter((r) => rowInTab(r, activeTab))
        .map((r) =>
          activeTab === "all"
            ? r
            : {
                ...r,
                subRows: r.subRows?.filter((sub) => sub.item && inTab(sub.item, activeTab)),
              }
        ),
    [all, activeTab]
  )
  const tabCounts = Object.fromEntries(
    TABS.map((t) => [t.value, all.filter((r) => rowInTab(r, t.value)).length])
  ) as Record<QueueTab, number>

  // This month's lines, corrections included; moved ones belong to next month.
  const lines = payroll.lines
  const autoConfirmable = lines.filter((i) => isAutoConfirmable(i, state))
  const flagged = lines.filter((i) => i.status === "needs_review" && i.issue && !i.skipped).length
  const unusual = lines.filter((i) => i.status !== "booked" && openAnomalies(state, i).length).length
  const replied = lines.filter((i) => i.status === "customer_replied").length
  const confirmed = employees.filter((e) => e.confirmed).length
  const selectedIds = Object.keys(rowSelection).filter((id) =>
    lines.some((i) => i.id === id && i.status !== "booked" && !i.skipped)
  )

  function confirm(ids: string[]) {
    if (ids.length === 0) return
    dispatch({ type: "confirm", ids })
    setRowSelection({})
    toast.success(
      ids.length === 1
        ? "Approved for the pay run"
        : `${ids.length} pay lines approved for the run`,
      {
        description:
          "Nothing goes to Tripletex yet. Approving the run makes one salary voucher for everyone.",
      }
    )
  }

  // The cells read live state themselves, so the columns never change.
  const columns = useMemo(() => createColumns(), [])
  const personActionsValue: PersonActions = {
    readOnly,
    onCorrection: (employee) => setCorrecting({ preset: employee }),
    onLeaving: setLeaving,
  }

  const table = useTable({
    features: dataGridFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    state: {
      sorting,
      rowSelection,
      expanded: ALL_EXPANDED,
      pagination: ONE_PAGE,
      // With the panel open the table is a picker: the panel already shows
      // the agreement, the flag and the confidence.
      columnVisibility: panelOpen
        ? {
            select: false,
            agreement: false,
            flag: false,
            confidence: false,
            actions: false,
          }
        : {},
      columnSizing: panelOpen ? { employee: 220, gross: 150, status: 156 } : {},
    },
    enableRowSelection: (row) => {
      const { item, moved } = row.original
      return Boolean(item && !moved && !item.skipped && item.status !== "booked" && !readOnly)
    },
    enableSubRowSelection: false,
    // The state above is fixed: resetting it would only loop.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
  })
  // The panel walks the pay lines in the order the table shows them.
  const navIds = table
    .getPrePaginatedRowModel()
    .rows.flatMap((row) => (row.original.item ? [row.original.item.id] : []))
  const activeId = state.openItemId && navIds.includes(state.openItemId) ? state.openItemId : null

  if (!all.length && !employees.length) return null

  const emptyMessage =
    activeTab === "review"
      ? payroll.done
        ? "Nothing left to review: everyone is in an approved run."
        : "Nothing left to review. Approve the run above when the customer has said yes."
      : activeTab === "waiting"
        ? "Nothing waiting on the customer or a colleague."
        : activeTab === "booked"
          ? "No pay lines approved yet."
          : "Nobody on the payroll this month."

  return (
    <PersonActionsContext value={personActionsValue}>
      <DataGrid
        table={table}
        recordCount={rows.length}
        emptyMessage={emptyMessage}
        onRowClick={(row) =>
          row.item && dispatch({ type: "open_item", id: row.item.id, nav: navIds })
        }
        tableLayout={{ dense: true }}
        tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
      >
        <Frame dense variant="default" spacing="sm" className="w-full">
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-px">
              <FrameTitle className="text-balance">
                Employees · {periodMeta?.label ?? monthName(month)} hours
              </FrameTitle>
              <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
                <span>
                  {all.length} {all.length === 1 ? "person" : "people"}
                </span>
                <DotSeparator className="bg-input" />
                {readOnly ? (
                  <span className="inline-flex items-center gap-1">
                    <LockIcon className="size-3" aria-hidden="true" />
                    {periodMeta?.note ?? "Closed"}, read-only
                  </span>
                ) : (
                  <>
                    <span>
                      {confirmed} of {employees.length} agreements confirmed by {first}
                    </span>
                    {flagged ? (
                      <>
                        <DotSeparator className="bg-input" />
                        <span>{flagged} flagged by agents</span>
                      </>
                    ) : null}
                    {unusual ? (
                      <>
                        <DotSeparator className="bg-input" />
                        <span className="text-warning-text inline-flex items-center gap-1 [&_svg]:size-3">
                          <AnomalyIcon aria-hidden="true" />
                          {unusual} {unusual === 1 ? "anomaly" : "anomalies"} to look at
                        </span>
                      </>
                    ) : null}
                  </>
                )}
                {replied > 0 ? (
                  <>
                    <DotSeparator className="bg-input" />
                    <span className="text-info-text">
                      {replied} customer {replied === 1 ? "reply" : "replies"} to review
                    </span>
                  </>
                ) : null}
              </FrameDescription>
            </div>
            {readOnly ? null : (
              <div className="flex flex-wrap items-center gap-2">
                {selectedIds.length > 0 ? (
                  <Button type="button" className="shrink-0" onClick={() => confirm(selectedIds)}>
                    <CheckIcon className="size-4" aria-hidden="true" />
                    Approve {selectedIds.length} selected
                  </Button>
                ) : autoConfirmable.length > 0 ? (
                  <Button
                    type="button"
                    className="shrink-0"
                    onClick={() => confirm(autoConfirmable.map((i) => i.id))}
                  >
                    <CheckCheckIcon className="size-4" aria-hidden="true" />
                    Approve {autoConfirmable.length} high-confidence
                  </Button>
                ) : null}
              </div>
            )}
          </FrameHeader>

          <FramePanel className="p-0 shadow-none!">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  setTab(value as QueueTab)
                  setRowSelection({})
                }}
              >
                <TabsList variant="line" className="gap-5">
                  {TABS.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                    >
                      <span>{t.label}</span>
                      <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                        {tabCounts[t.value]}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {readOnly ? null : (
                <div className="flex flex-wrap items-center gap-1 pb-(--frame-panel-header-py)">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCorrecting({})}>
                    <HistoryIcon data-icon="inline-start" aria-hidden="true" />
                    Correction for an earlier month
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHiring(true)}>
                    <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
                    Add new hire
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* The row open in the panel keeps a quiet highlight. */}
            {activeId ? (
              <style>{`[data-queue="payroll"] tr[data-row-id="${activeId}"] > td { background: color-mix(in oklab, var(--primary) 6%, transparent); }`}</style>
            ) : null}
            <div data-queue="payroll">
              <DataGridScrollArea>
                <DataGridTable />
              </DataGridScrollArea>
            </div>
          </FramePanel>
        </Frame>
        <AddHireDialog clientId={clientId} month={month} open={hiring} onOpenChange={setHiring} />
        <LeavingDialog
          employee={leaving}
          month={month}
          onOpenChange={(open) => !open && setLeaving(null)}
        />
        <CorrectionDialog
          clientId={clientId}
          month={month}
          employees={employees.filter((e) => employeeStatus(e, month) !== "starts")}
          preset={correcting?.preset}
          open={Boolean(correcting)}
          onOpenChange={(open) => !open && setCorrecting(null)}
        />
      </DataGrid>
    </PersonActionsContext>
  )
}
