"use client"

// Bookkeeping's Suppliers view: everyone who sends the client invoices, not
// only the approved ones, with what they cost and whether the customer
// approves them from now on. Beside the list, how this customer approves
// payments: the routine they agreed, and the trail an auditor asks for.
import { useMemo, useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import { CheckIcon, DownloadIcon, SearchIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { AnomalyCount, AnomalyIcon } from "@/components/accounting/anomaly"
import { DotSeparator } from "@/components/accounting/primitives"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  approverOf,
  auditTrail,
  dayLabel,
  policyOf,
  routineText,
  SOURCE_LABEL,
  stampLabel,
  supplierBook,
  supplierShort,
  trailCsv,
  type ApprovalMode,
  type SupplierRow,
  type SupplierStatus,
} from "@/lib/accounting/approvals"
import { CLIENT_BY_ID, monthLabel, MONTHS, monthName } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { formatAmount } from "@/lib/accounting/format"
import { useAccounting } from "@/lib/accounting/store"

type StatusFilter = "all" | SupplierStatus

const STATUS: Record<SupplierStatus, { label: string; variant: "success-light" | "outline" | "warning-light" }> = {
  auto: { label: "Auto-approved", variant: "success-light" },
  asks: { label: "Asks every time", variant: "outline" },
  new: { label: "New", variant: "warning-light" },
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "auto", label: "Auto-approved" },
  { value: "asks", label: "Asks every time" },
  { value: "new", label: "New" },
]

/** "Mar 2021" for an approval from before this year, "12 Aug" after. */
function sinceLabel(since: string) {
  return since.startsWith(TODAY.slice(0, 4))
    ? dayLabel(since)
    : `${dayLabel(since).split(" ")[1]} ${since.slice(0, 4)}`
}

/** Who approved, when and how; or why it isn't approved. */
function StatusNote({ row }: { row: SupplierRow }) {
  if (row.approval)
    return (
      <span className="text-muted-foreground text-xs text-pretty">
        {row.approval.by.split(" ")[0]}, {sinceLabel(row.approval.since)} · {SOURCE_LABEL[row.approval.source]}
      </span>
    )
  if (row.revoked)
    return (
      <span className="text-muted-foreground text-xs">
        Revoked by {row.revoked.by.split(" ")[0]}, {stampLabel(row.revoked.at)}
      </span>
    )
  if (row.status === "new" && row.invoices.length)
    return (
      <span className="text-muted-foreground text-xs">
        First invoice {dayLabel(row.invoices.at(-1)!.date)}
      </span>
    )
  return null
}

function SupplierList({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)
  const policy = policyOf(state, clientId)
  const first = approverOf(state, clientId)?.name.split(" ")[0] ?? "the customer"
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [query, setQuery] = useState("")
  const rows = useMemo(
    () => supplierBook(state, clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.requests, state.approvals, state.onboarding, clientId]
  )
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.value, f.value === "all" ? rows.length : rows.filter((r) => r.status === f.value).length])
  ) as Record<StatusFilter, number>
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!q || `${r.supplier} ${r.account ?? ""}`.toLowerCase().includes(q))
  )
  const months = rows[0]?.months.map((m) => m.month) ?? []
  // Each supplier opens its latest invoice; ↑/↓ walk the list shown.
  const nav = shown.flatMap((r) => (r.invoices[0] ? [r.invoices[0].id] : []))

  function approve(supplier: string) {
    dispatch({ type: "approvals", action: { type: "add_supplier", clientId, supplier } })
    toast.success(`${supplierShort(supplier)} approved from now on`, {
      description: "Added by you. It only goes on a list marked for a look when something looks off.",
    })
  }

  function revoke(supplier: string) {
    dispatch({ type: "approvals", action: { type: "revoke_supplier", clientId, supplier } })
    toast.message(`${supplierShort(supplier)} asks every time again`, {
      description: "Taken off the approved suppliers. Earlier approvals stay in the trail.",
      action: {
        label: "Undo",
        onClick: () => dispatch({ type: "approvals", action: { type: "add_supplier", clientId, supplier } }),
      },
    })
  }

  return (
    <Frame dense spacing="sm" className="w-full min-w-0">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Suppliers</FrameTitle>
          <FrameDescription className="text-xs text-pretty">
            Everyone who sends {client?.name ?? "this client"} invoices.{" "}
            {policy.mode === "always"
              ? `Auto-approved ones still go on ${first}'s weekly list, unflagged, until ${first} asks for less.`
              : "Auto-approved ones are paid without asking, unless something looks off."}
          </FrameDescription>
        </div>
        <InputGroup className="w-52">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search suppliers"
            aria-label="Search suppliers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      </FrameHeader>
      <FramePanel className="p-0 shadow-none!">
        <div className="px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
            <TabsList variant="line" className="gap-5">
              {FILTERS.map((f) => (
                <TabsTrigger
                  key={f.value}
                  value={f.value}
                  className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                >
                  <span>{f.label}</span>
                  <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                    {counts[f.value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Separator />
        <div className="overflow-x-auto">
          {shown.length ? (
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th scope="col" className="px-3 py-2 text-left font-normal">
                    Supplier
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-normal">
                    Approval
                  </th>
                  {months.map((m) => (
                    <th key={m} scope="col" className="px-3 py-2 text-right font-normal">
                      {monthName(m)}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    This year
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((row) => (
                  <tr key={row.supplier} className="align-top">
                    <td className="px-3 py-2">
                      <span className="flex min-w-0 flex-col gap-px">
                        {row.invoices[0] ? (
                          <button
                            type="button"
                            onClick={() => dispatch({ type: "open_item", id: row.invoices[0].id, nav })}
                            className="text-foreground hover:text-foreground/80 text-left underline-offset-4 transition-colors duration-150 hover:underline"
                          >
                            {row.supplier}
                          </button>
                        ) : (
                          <span className="text-foreground">{row.supplier}</span>
                        )}
                        <span className="text-muted-foreground text-xs">{row.account ?? "No account yet"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-col items-start gap-1">
                        <Badge variant={STATUS[row.status].variant} size="sm">
                          {STATUS[row.status].label}
                        </Badge>
                        <StatusNote row={row} />
                      </span>
                    </td>
                    {row.months.map((m) => (
                      <td key={m.month} className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                        {m.amount ? formatAmount(m.amount) : "–"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <span className="flex flex-col items-end gap-px">
                        <span className="text-foreground tabular-nums">{row.year ? formatAmount(row.year) : "–"}</span>
                        {row.yearNote ? <span className="text-muted-foreground text-xs">{row.yearNote}</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.status === "auto" ? (
                        <Button type="button" variant="ghost" size="xs" onClick={() => revoke(row.supplier)}>
                          <Undo2Icon data-icon="inline-start" aria-hidden="true" />
                          Revoke
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="xs" onClick={() => approve(row.supplier)}>
                          <CheckIcon data-icon="inline-start" aria-hidden="true" />
                          Approve from now on
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm text-pretty">
              {rows.length
                ? "No supplier matches. Try another filter or search."
                : "No supplier invoices yet. Suppliers show up here with their first invoice."}
            </p>
          )}
        </div>
      </FramePanel>
    </Frame>
  )
}

// ── The routine ──

const MODE_OPTIONS: { value: ApprovalMode; label: string }[] = [
  { value: "always", label: "Every week, even when nothing stands out" },
  { value: "anomalies_only", label: "Only when something looks off" },
]

function ApprovalRoutine({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)
  const policy = policyOf(state, clientId)
  const approver = approverOf(state, clientId)
  const contacts = (client?.contacts ?? []).map((c) => ({
    value: c.id,
    label: `${c.name}${c.role ? ` · ${c.role}` : ""}`,
  }))

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Approval routine</FrameTitle>
        <FrameDescription className="text-xs text-pretty">
          Agreed with the customer. They can switch to &ldquo;only when something looks off&rdquo; from their app.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">Send a list</span>
          <Select
            value={policy.mode}
            onValueChange={(value) => {
              if (!value || value === policy.mode) return
              dispatch({
                type: "approvals",
                action: { type: "set_mode", clientId, mode: value as ApprovalMode, from: "firm" },
              })
              toast.success(
                value === "always" ? "Lists go out every week again" : "Only what needs a look goes out now",
                {
                  description:
                    value === "always"
                      ? `${approver?.name.split(" ")[0]} gets a list even when nothing stands out.`
                      : "Invoices from approved suppliers are approved automatically and logged.",
                }
              )
            }}
            items={MODE_OPTIONS}
          >
            <SelectTrigger size="sm" aria-label="When to send a list" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            {policy.changed
              ? policy.changed.from === "portal"
                ? `${policy.changed.by} chose this in the customer app, ${stampLabel(policy.changed.at)}`
                : `Changed by ${policy.changed.by}, ${stampLabel(policy.changed.at)}`
              : "The default until the customer asks for less."}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">Who approves</span>
          <Select
            value={policy.approverId}
            onValueChange={(value) => {
              if (!value) return
              dispatch({ type: "approvals", action: { type: "set_approver", clientId, contactId: value } })
            }}
            items={contacts}
          >
            <SelectTrigger size="sm" aria-label="Who approves" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {contacts.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Lists go out</dt>
          <dd className="text-foreground">{policy.cadence}, due before the first invoice is</dd>
          <dt className="text-muted-foreground">Needs a look</dt>
          <dd className="text-foreground text-pretty">
            New supplier · more than {policy.deviation === 1 ? "twice" : `${1 + policy.deviation}×`} the usual ·{" "}
            {formatAmount(policy.largeAmount)} or more · price far above what other clients pay
          </dd>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-foreground">On the due date, from Tripletex, once approved</dd>
        </dl>
      </FramePanel>
    </Frame>
  )
}

// ── For the auditor ──

const TRAIL_PREVIEW = 4

function AuditorTrail({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)
  const [all, setAll] = useState(false)
  const rows = useMemo(
    () => auditTrail(state, clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.requests, state.approvals, state.onboarding, clientId]
  )
  const shown = all ? rows : rows.slice(0, TRAIL_PREVIEW)
  const auto = rows.filter((r) => r.via === "Auto").length
  const rejected = rows.filter((r) => r.decision.startsWith("Rejected")).length
  const unusual = rows.filter((r) => r.flagged).length

  function exportCsv() {
    const blob = new Blob([trailCsv(rows)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `approvals-${clientId}-${TODAY}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Exported for the auditor", {
      description: `${rows.length} decisions with who, when and the payment that followed.`,
    })
  }

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Payment routine for the auditor</FrameTitle>
          <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <span>{rows.length} decisions since {monthLabel(MONTHS.at(-1)!.id).split(" ")[0]}</span>
            {auto ? (
              <>
                <DotSeparator className="bg-input" />
                <span>{auto} auto-approved</span>
              </>
            ) : null}
            {rejected ? (
              <>
                <DotSeparator className="bg-input" />
                <span>{rejected} rejected</span>
              </>
            ) : null}
            {unusual ? (
              <>
                <DotSeparator className="bg-input" />
                <AnomalyCount n={unusual} suffix="decided" />
              </>
            ) : null}
          </FrameDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          Export
        </Button>
      </FrameHeader>
      <FramePanel>
        <p className="text-foreground text-xs leading-5 text-pretty">
          How {client?.name ?? "this client"} approves payments: {routineText(state, clientId)}
        </p>
      </FramePanel>
      {rows.length ? (
        <FramePanel className="p-0">
          <ul>
            {shown.map((row, index) => (
              <li key={row.id}>
                {index > 0 ? <Separator className="opacity-60" /> : null}
                <div className="flex flex-col gap-0.5 px-3 py-2">
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="text-foreground min-w-0 truncate text-xs font-medium">{row.supplier}</span>
                    <span className="text-foreground shrink-0 text-xs tabular-nums">{formatAmount(row.amount)}</span>
                  </div>
                  <span
                    className={cn(
                      "text-xs text-pretty",
                      row.decision.startsWith("Rejected") ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {row.decision}
                  </span>
                  {row.flagged ? (
                    <span className="text-warning-text flex items-start gap-1 text-[11px] leading-4 text-pretty [&_svg]:mt-0.5 [&_svg]:size-3 [&_svg]:shrink-0">
                      <AnomalyIcon aria-hidden="true" />
                      {row.flagged}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground text-[11px] leading-4">
                    {stampLabel(row.at)} · {row.via.startsWith("APR-") ? `List ${row.via}` : row.via} · {row.payment}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </FramePanel>
      ) : null}
      {rows.length > TRAIL_PREVIEW ? (
        <FrameFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </Button>
        </FrameFooter>
      ) : null}
    </Frame>
  )
}

export function BookkeepingSuppliers({ clientId }: { clientId: string }) {
  return (
    <div className="grid min-w-0 items-start gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_20rem]">
      <SupplierList clientId={clientId} />
      <div className="flex min-w-0 flex-col gap-4">
        <ApprovalRoutine clientId={clientId} />
        <AuditorTrail clientId={clientId} />
      </div>
    </div>
  )
}
