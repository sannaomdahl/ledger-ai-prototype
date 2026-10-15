"use client"

import { useCallback, useMemo, useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  DataGrid,
  dataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { Filters } from "@/components/reui/filters/filters"
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterConditions,
} from "@/components/reui/filters/filters-query"
import type { FilterCondition } from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
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
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "cn"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createAutomationColumns } from "./columns"
import {
  AUTOMATION_TABS,
  AUTOMATIONS,
  DELIVERY_FILTER_OPTIONS,
  getAutomationTabFromState,
  OWNER_FILTER_OPTIONS,
  UPDATED_FILTER_OPTIONS,
  type AutomationState,
  type AutomationTab,
  type IAutomationRecord,
} from "./data"
import { SearchIcon, UsersIcon, RouteIcon, ClockIcon, PlusIcon, FilterIcon, FunnelXIcon } from "lucide-react"

type ToastTone = "success" | "neutral" | "destructive"

const toneStyles: Record<ToastTone, { dot: string }> = {
  success: { dot: "bg-emerald-500" },
  neutral: { dot: "bg-sky-500" },
  destructive: { dot: "bg-rose-500" },
}

function showAutomationToast({
  tone,
  title,
  description,
}: {
  tone: ToastTone
  title: string
  description: string
}) {
  toast.custom((id) => (
    <div className="bg-popover text-popover-foreground border-border flex w-[356px] flex-col gap-3 rounded-md border p-4 shadow-lg">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1 flex size-2 shrink-0 rounded-full",
            toneStyles[tone].dot
          )}
          aria-hidden="true"
        />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            {description}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => toast.dismiss(id)}>
          Done
        </Button>
      </div>
    </div>
  ))
}

function getAutomationSearchBlob(automation: IAutomationRecord) {
  return [
    automation.title,
    automation.kind,
    automation.state,
    automation.deliveryMode,
    automation.audienceLabel,
    automation.runWindowLabel,
    automation.owner.name,
    automation.owner.email,
    automation.owner.teamLabel,
    automation.approvalRequired ? "approval required" : "auto-approved",
    automation.enabled ? "enabled" : "disabled",
  ]
    .join(" ")
    .toLowerCase()
}

/** Operators that take no value, so an empty `values` list is expected. */
const VALUELESS_OPERATORS = new Set(["empty", "not_empty"])

function getActiveFilters(filters: FilterCondition[]) {
  return filters.filter((filter) => {
    const { operator, values } = filter
    if (VALUELESS_OPERATORS.has(operator)) return true
    if (!values || values.length === 0) return false
    if (
      values.every((value) => typeof value === "string" && value.trim() === "")
    ) {
      return false
    }
    if (values.every((value) => value === null || value === undefined)) {
      return false
    }
    if (values.every((value) => Array.isArray(value) && value.length === 0)) {
      return false
    }
    return true
  })
}

function renderSelectedCount(values: unknown[]) {
  if (values.length === 0) return "Select..."
  if (values.length > 1) return `${values.length} selected`
  return null
}

function renderSingleSelectedLabel(
  values: unknown[],
  options: { value: string; label: string }[]
) {
  const state = renderSelectedCount(values)
  if (state) return state

  const option = options.find((item) => item.value === values[0])
  return option?.label ?? String(values[0])
}

function filterFieldValue(
  automation: IAutomationRecord,
  field: string
): unknown {
  switch (field) {
    case "workflow":
      return getAutomationSearchBlob(automation)
    case "ownerTeam":
      return automation.owner.team
    case "deliveryMode":
      return automation.deliveryMode
    case "updatedBucket":
      return automation.updatedBucket
    default:
      return ""
  }
}

function matchesFilterCondition(
  fieldValue: unknown,
  operator: string,
  values: unknown[]
): boolean {
  switch (operator) {
    case "is":
      return values.includes(fieldValue)
    case "is_not":
      return !values.includes(fieldValue)
    case "is_any_of":
      return values.some((value) => fieldValue === value)
    case "is_none_of":
      return !values.some((value) => fieldValue === value)
    case "contains": {
      const tokens = values.map((value) => String(value).trim()).filter(Boolean)
      if (tokens.length === 0) return true
      return tokens.some((token) =>
        String(fieldValue).toLowerCase().includes(token.toLowerCase())
      )
    }
    case "not_contains":
      return !values.some((value) =>
        String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
      )
    case "starts_with":
      return values.some((value) =>
        String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase())
      )
    case "ends_with":
      return values.some((value) =>
        String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase())
      )
    case "empty":
      return fieldValue === "" || fieldValue == null
    case "not_empty":
      return fieldValue !== "" && fieldValue != null
    default:
      return true
  }
}

function applyFiltersToData(
  data: IAutomationRecord[],
  filters: FilterCondition[]
): IAutomationRecord[] {
  const active = getActiveFilters(filters)
  let result = [...data]

  active.forEach((filter) => {
    const { field, operator, values, negated } = filter

    result = result.filter((item) => {
      const raw = filterFieldValue(item, field)
      const fieldValue = raw != null ? raw : ""
      const matches = matchesFilterCondition(fieldValue, operator, values)

      // A chip negated from its menu keeps its operator and flips its meaning.
      return negated ? !matches : matches
    })
  })

  return result
}

const OWNER_TEAM_FILTER_OPTIONS = OWNER_FILTER_OPTIONS.filter(
  (option) => option.value !== "everyone"
).map((option) => ({
  value: option.value,
  label: option.label,
}))

const DELIVERY_MODE_FILTER_OPTIONS = DELIVERY_FILTER_OPTIONS.filter(
  (option) => option.value !== "any"
).map((option) => ({
  value: option.value,
  label: option.label,
}))

const UPDATED_BUCKET_FILTER_OPTIONS = UPDATED_FILTER_OPTIONS.filter(
  (option) => option.value !== "any"
).map((option) => ({
  value: option.value,
  label: option.label,
}))

const filterFields: FilterField[] = [
  {
    id: "workflow",
    label: "Workflow",
    icon: (
      <SearchIcon className="size-3.5" aria-hidden />
    ),
    type: "text",
    placeholder: "Search...",
  },
  {
    id: "ownerTeam",
    label: "Owner team",
    icon: (
      <UsersIcon className="size-3.5" aria-hidden />
    ),
    type: "select",
    searchable: false,
    options: OWNER_TEAM_FILTER_OPTIONS,
    renderValue: ({ values }) =>
      renderSingleSelectedLabel(values, OWNER_TEAM_FILTER_OPTIONS),
  },
  {
    id: "deliveryMode",
    label: "Delivery mode",
    icon: (
      <RouteIcon className="size-3.5" aria-hidden />
    ),
    type: "select",
    searchable: false,
    options: DELIVERY_MODE_FILTER_OPTIONS,
    renderValue: ({ values }) =>
      renderSingleSelectedLabel(values, DELIVERY_MODE_FILTER_OPTIONS),
  },
  {
    id: "updatedBucket",
    label: "Last updated",
    icon: (
      <ClockIcon className="size-3.5" aria-hidden />
    ),
    type: "select",
    searchable: false,
    options: UPDATED_BUCKET_FILTER_OPTIONS,
    renderValue: ({ values }) =>
      renderSingleSelectedLabel(values, UPDATED_BUCKET_FILTER_OPTIONS),
  },
]

function createDefaultAutomationFilters(): FilterQuery {
  return createFilterQuery([
    createFilterRule({
      id: "workflow-1",
      path: ["workflow"],
      operator: "contains",
      value: "",
    }),
  ])
}

function getTabCounts(records: IAutomationRecord[]) {
  return {
    all: records.length,
    live: records.filter((record) => record.state === "live").length,
    review: records.filter((record) => record.state === "review").length,
    drafts: records.filter((record) => record.state === "drafts").length,
    paused: records.filter((record) => record.state === "paused").length,
  } satisfies Record<AutomationTab, number>
}

export function AutomationLibraryGridView() {
  const [automations, setAutomations] =
    useState<IAutomationRecord[]>(AUTOMATIONS)
  const [activeTab, setActiveTab] = useState<AutomationTab>("all")
  const [filterQuery, setFilterQuery] = useState<FilterQuery>(
    createDefaultAutomationFilters
  )
  const filters = useMemo(
    () => flattenFilterConditions(filterQuery),
    [filterQuery]
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  })
  const [automationPendingArchive, setAutomationPendingArchive] =
    useState<IAutomationRecord | null>(null)

  const resetPagination = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [])

  const filteredBaseAutomations = useMemo(() => {
    return applyFiltersToData(automations, filters)
  }, [automations, filters])

  const filteredAutomations = useMemo(
    () =>
      filteredBaseAutomations.filter((automation) =>
        activeTab === "all"
          ? true
          : getAutomationTabFromState(automation.state) === activeTab
      ),
    [activeTab, filteredBaseAutomations]
  )

  const tabCounts = useMemo(
    () => getTabCounts(filteredBaseAutomations),
    [filteredBaseAutomations]
  )

  const filteredLiveCount = useMemo(
    () =>
      filteredAutomations.filter((automation) => automation.state === "live")
        .length,
    [filteredAutomations]
  )

  const filteredReviewCount = useMemo(
    () =>
      filteredAutomations.filter((automation) => automation.state === "review")
        .length,
    [filteredAutomations]
  )

  const selectedCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection]
  )

  const columns = useMemo(
    () =>
      createAutomationColumns({
        onAction: (action, automation) => {
          if (action === "archive") {
            setAutomationPendingArchive(automation)
            return
          }

          if (action === "edit") {
            showAutomationToast({
              tone: "neutral",
              title: "Workflow editor",
              description: `Connect "${automation.title}" to your builder, side panel, or automation step editor.`,
            })
            return
          }

          showAutomationToast({
            tone: "success",
            title: "Workflow details",
            description: `"${automation.title}" is ready for a detail route, run history drawer, or audit panel.`,
          })
        },
        onToggleEnabled: (automation, nextValue) => {
          const nextState: AutomationState =
            nextValue && automation.state === "paused"
              ? "live"
              : nextValue && automation.state === "drafts"
                ? "review"
                : !nextValue && automation.state === "live"
                  ? "paused"
                  : automation.state

          setAutomations((current) =>
            current.map((item) =>
              item.id === automation.id
                ? {
                    ...item,
                    enabled: nextValue,
                    state: nextState,
                  }
                : item
            )
          )

          showAutomationToast({
            tone: nextValue ? "success" : "neutral",
            title: nextValue ? "Workflow enabled" : "Workflow paused",
            description: nextValue
              ? `"${automation.title}" is ready to run in the ${nextState === "review" ? "review" : "live"} queue.`
              : `"${automation.title}" will stay available but will not continue running until resumed.`,
          })
        },
      }),
    []
  )

  const table = useTable({
    features: dataGridFeatures,
    data: filteredAutomations,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      rowSelection,
      pagination,
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
  })

  const handleClearControls = useCallback(() => {
    setFilterQuery(createDefaultAutomationFilters())
    resetPagination()
  }, [resetPagination])

  const handleFiltersChange = useCallback(
    (nextQuery: FilterQuery) => {
      setFilterQuery(nextQuery)
      resetPagination()
    },
    [resetPagination]
  )

  const handleArchiveAutomation = useCallback(() => {
    if (!automationPendingArchive) return

    const automationToArchive = automationPendingArchive

    setAutomations((current) =>
      current.filter(
        (automation) => automation.id !== automationPendingArchive.id
      )
    )
    setRowSelection((current) => {
      const next = { ...current }
      delete next[automationPendingArchive.id]
      return next
    })
    setAutomationPendingArchive(null)
    resetPagination()

    showAutomationToast({
      tone: "destructive",
      title: "Workflow archived",
      description: `"${automationToArchive.title}" was removed from this automation library.`,
    })
  }, [automationPendingArchive, resetPagination])

  const emptyMessage =
    "No workflows match this automation slice. Switch tabs or clear the filters."

  return (
    <>
      {/* Table */}
      <DataGrid
        table={table}
        recordCount={filteredAutomations.length}
        emptyMessage={emptyMessage}
        tableLayout={{
          dense: true,
        }}
        tableClassNames={{
          edgeCell: "first:ps-3 last:pe-3",
        }}
      >
        <Frame dense variant="default" spacing="sm" className="w-full">
          <FrameHeader className="flex-row items-center justify-between gap-3">
            <div className="flex flex-col gap-px">
              <FrameTitle className="text-balance">
                Automation Library
              </FrameTitle>
              <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
                <span>
                  {filteredAutomations.length} workflow
                  {filteredAutomations.length === 1 ? "" : "s"}
                </span>
                <span
                  className="bg-input size-1 shrink-0 rounded-full"
                  aria-hidden="true"
                />
                <span>{filteredLiveCount} live</span>
                <span
                  className="bg-input size-1 shrink-0 rounded-full"
                  aria-hidden="true"
                />
                <span>{filteredReviewCount} review</span>
                {selectedCount > 0 ? (
                  <>
                    <span
                      className="bg-input size-1 shrink-0 rounded-full"
                      aria-hidden="true"
                    />
                    <span>{selectedCount} selected</span>
                  </>
                ) : null}
              </FrameDescription>
            </div>

            <Button type="button" className="shrink-0">
              <PlusIcon className="size-4" aria-hidden="true" />
              New workflow
            </Button>
          </FrameHeader>

          <FramePanel className="p-0 shadow-none!">
            <div className="px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  setActiveTab(value as AutomationTab)
                  resetPagination()
                }}
              >
                <TabsList variant="line" className="gap-5">
                  {AUTOMATION_TABS.map((tab) => (
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
                onQueryChange={handleFiltersChange}
                size="default"
                trigger={
                  <Button variant="outline" aria-label="Filters">
                    <FilterIcon className="size-4" aria-hidden="true" />
                    Filters
                  </Button>
                }
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedCount > 0 ? (
                  <Badge size="sm" variant="secondary">
                    {selectedCount} selected
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearControls}
                >
                  <FunnelXIcon className="size-4" aria-hidden="true" />
                  Clear
                </Button>
              </div>
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

      <AlertDialog
        open={automationPendingArchive != null}
        onOpenChange={(open) => {
          if (!open) {
            setAutomationPendingArchive(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              {automationPendingArchive
                ? `Archive "${automationPendingArchive.title}" from this automation library. Run history and ownership context can stay available in your backend, but this row will disappear from the grid preview.`
                : "Archive this workflow from the automation library."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveAutomation}
              render={
                <Button type="button" variant="destructive">
                  Archive
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}