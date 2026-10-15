"use client"

// VAT returns and annual reporting, outside the monthly rhythm. Per client
// it's a list; for the firm it's a bird's-eye grid (adapted from
// @reui/data-grid-filtering-2, like the clients grid) with what's ready to
// submit on top. Rows reuse the deadline grammar: date block, title, badge.
import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/reui/badge"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { useTable, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { cn } from "cn"
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClockIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { CLIENT_BY_ID, dayLabel, monthName } from "@/lib/accounting/data"
import { AGA_RATE, getPayroll } from "@/lib/accounting/payroll"
import { daysUntil, type DeadlineStatus } from "@/lib/accounting/deadlines"
import {
  byUrgency,
  FILING_KIND_HINT,
  formatVatAmount,
  getClientFilings,
  needsAction,
  type Filing,
  type FilingStatus,
} from "@/lib/accounting/filings"
import { filingBreakdown, hasBreakdown } from "@/lib/accounting/filing-breakdown"
import { formatAmount } from "@/lib/accounting/format"
import { scopedClients, useAccounting } from "@/lib/accounting/store"
import type { Client } from "@/lib/accounting/types"
import { DateBlock } from "./deadline-list"
import { breakdownTotal, useFilingBreakdown } from "./filing-breakdown"
import { ClientChip, DotSeparator } from "./primitives"
import { ScopeToggle } from "./scope-toggle"

type Tone = "done" | "ready" | "late" | "progress" | "upcoming"

function toneOf(filing: Filing): Tone {
  if (filing.late) return "late"
  const map: Record<FilingStatus, Tone> = {
    submitted: "done",
    ready: "ready",
    in_progress: "progress",
    upcoming: "upcoming",
  }
  return map[filing.status]
}

const TONE: Record<
  Tone,
  {
    label: string
    badge: "success-light" | "info-light" | "destructive-light" | "warning-light" | "outline"
    chip: string
    icon: ReactNode
    deadline: DeadlineStatus
  }
> = {
  done: {
    label: "Submitted",
    badge: "success-light",
    chip: "border-transparent bg-success/10 text-success-text",
    icon: <CheckIcon aria-hidden="true" />,
    deadline: "done",
  },
  ready: {
    label: "Ready to submit",
    badge: "info-light",
    chip: "border-info/40 bg-info/10 text-info-foreground",
    icon: <SendIcon aria-hidden="true" />,
    deadline: "ready",
  },
  late: {
    label: "Late",
    badge: "destructive-light",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: <TriangleAlertIcon aria-hidden="true" />,
    deadline: "blocked",
  },
  progress: {
    label: "In progress",
    badge: "warning-light",
    chip: "border-warning/40 bg-warning/5 text-warning-text",
    icon: <ClockIcon aria-hidden="true" />,
    deadline: "upcoming",
  },
  upcoming: {
    label: "Upcoming",
    badge: "outline",
    chip: "border-border text-muted-foreground",
    icon: <CircleDashedIcon aria-hidden="true" />,
    deadline: "upcoming",
  },
}

function when(filing: Filing) {
  if (filing.status === "submitted") return null
  // A correction has no deadline of its own: file it soon, before
  // Skatteetaten finds it.
  if (filing.correction) return "Correction, file it soon"
  const days = daysUntil(filing.due)
  if (days < 0) return `${-days} days overdue`
  if (days === 0) return "Due today"
  if (days === 1) return "Due tomorrow"
  if (days <= 60) return `Due in ${days} days`
  return `Due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(filing.due))}`
}

// ── Submitting ──

/** One confirm dialog per list, fed by whichever row asked. */
function useSubmit() {
  const { state, dispatch } = useAccounting()
  const [pending, setPending] = useState<Filing | null>(null)
  const client = pending ? CLIENT_BY_ID.get(pending.clientId) : undefined
  const breakdown = pending ? filingBreakdown(pending, state.items, state) : undefined
  // An a-melding reports the pay that went out in its month: the runs for
  // the month before's hours. Shown before it goes, with where it came from.
  const paidIn = pending?.kind === "a_melding" ? pending.id.slice(-7) : undefined
  const hours = paidIn
    ? `${paidIn.slice(5) === "01" ? Number(paidIn.slice(0, 4)) - 1 : paidIn.slice(0, 4)}-${String(((Number(paidIn.slice(5)) + 10) % 12) + 1).padStart(2, "0")}`
    : undefined
  const pay = pending && hours ? getPayroll(state.items, state.progress, pending.clientId, hours, state.closing) : undefined
  const receiver =
    pending?.kind === "annual_accounts"
      ? "Brønnøysundregistrene"
      : pending?.kind === "a_melding"
        ? "the a-ordningen"
        : "Skatteetaten"

  const dialog = (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Submit {pending?.correction ? "a corrected " : ""}
            {pending?.name} {pending?.period} for {client?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.correction
              ? `It replaces the return already filed, now with the ${pending.correction.itemIds.length === 1 ? "correction" : "corrections"} booked into the term since`
              : pending?.kind === "a_melding"
                ? "It goes to the a-ordningen through Altinn with every pay line of the month's runs, corrections for earlier months included"
                : "It goes to " + receiver + " through Altinn with the figures the agent drafted from Tripletex"}
            {pending?.amount !== undefined
              ? `: ${formatVatAmount(pending.amount).toLowerCase()}`
              : ""}
            . The receipt is filed on the customer in Tripletex.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pay && hours ? (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <ul className="flex flex-col gap-1">
              {pay.runs.map((run) => (
                <li key={run.seq} className="text-muted-foreground flex justify-between gap-4">
                  <span>
                    {run.seq > 1 ? `Follow-up run ${run.seq}` : "Regular run"} · {monthName(hours)} hours, paid{" "}
                    {dayLabel(run.payDate)} · {run.itemIds.length} {run.itemIds.length === 1 ? "person" : "people"}
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{formatAmount(run.gross)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t pt-2">
              {(() => {
                const gross = pay.paid.reduce((sum, i) => sum + i.amount, 0)
                return [
                  ["Gross pay", gross],
                  ["Tax withheld (forskuddstrekk)", Math.round(gross * 0.3)],
                  ["Employer's NI, 14.1%", Math.round(gross * AGA_RATE)],
                  ["Holiday pay accrued, 10.2%", Math.round(gross * 0.102)],
                ].map(([label, amount]) => (
                  <div key={label} className="text-muted-foreground flex justify-between gap-4">
                    <dt>{label}</dt>
                    <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatAmount(Number(amount))}</dd>
                  </div>
                ))
              })()}
            </dl>
            <Link
              href={`/clients/${pending!.clientId}/payroll`}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
              onClick={() => setPending(null)}
            >
              Open the pay run behind it
            </Link>
          </div>
        ) : null}
        {breakdown?.kind === "vat" && !breakdown.correction ? (
          <dl className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3 text-sm">
            {[
              ["VAT on sales", breakdown.outputVat],
              ["VAT on purchases", -breakdown.inputVat],
              ...(breakdown.late.length ? [["Late invoices", -breakdown.lateVat] as const] : []),
              ...(breakdown.rounding ? [["Rounding", breakdown.rounding] as const] : []),
            ].map(([label, amount]) => (
              <div key={label} className="text-muted-foreground flex justify-between gap-4">
                <dt>{label}</dt>
                <dd className="tabular-nums">{formatAmount(Number(amount))}</dd>
              </div>
            ))}
            <div className="text-foreground flex justify-between gap-4 border-t pt-1 font-semibold">
              <dt>{breakdown.total >= 0 ? "To pay" : "To reclaim"}</dt>
              <dd className="tabular-nums">{formatAmount(Math.abs(breakdownTotal(breakdown)))}</dd>
            </div>
          </dl>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pending) return
              dispatch({
                type: "submit_filing",
                filingId: pending.id,
                correction: pending.correction?.itemIds,
              })
              toast.success(`${pending.correction ? "Corrected " : ""}${pending.name} submitted`, {
                description: `${client?.name} · ${pending.period}. Receipt from ${receiver} saved in Tripletex.`,
              })
              setPending(null)
            }}
          >
            Submit to{" "}
            {receiver === "Brønnøysundregistrene" ? "Brønnøysund" : receiver.replace(/^the /, "")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { ask: setPending, dialog }
}

// ── Rows ──

function FilingRow({
  filing,
  showClient,
  onSubmit,
  onBreakdown,
}: {
  filing: Filing
  showClient?: boolean
  onSubmit: (filing: Filing) => void
  onBreakdown: (filing: Filing) => void
}) {
  const breakdown = hasBreakdown(filing)
  const tone = TONE[toneOf(filing)]
  const client = CLIENT_BY_ID.get(filing.clientId)
  const relative = when(filing)

  return (
    <Item size="sm" className="rounded-none px-3">
      <ItemMedia className="self-center">
        <DateBlock iso={filing.due} status={tone.deadline} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="w-full min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
          <span className="min-w-0 truncate">
            {showClient ? (
              <Link
                href={`/clients/${filing.clientId}/filings`}
                className="hover:underline"
              >
                {client?.name}
              </Link>
            ) : null}
            {showClient ? " · " : ""}
            {filing.name} {filing.period}
          </span>
          <Badge variant={tone.badge} size="sm" className="shrink-0">
            {tone.label}
          </Badge>
        </ItemTitle>
        <ItemDescription className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted-foreground shrink-0">
            {FILING_KIND_HINT[filing.kind]}
          </span>
          {relative ? (
            <>
              <DotSeparator />
              <span
                className={cn(
                  "shrink-0 font-medium",
                  filing.late ? "text-destructive" : "text-foreground"
                )}
              >
                {relative}
              </span>
            </>
          ) : null}
          <DotSeparator />
          <span className="min-w-0 truncate">{filing.detail}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3">
        {filing.amount !== undefined ? (
          // The number opens where it comes from.
          <button
            type="button"
            onClick={() => onBreakdown(filing)}
            className="text-muted-foreground hover:text-foreground decoration-muted-foreground/40 hidden rounded-sm text-sm tabular-nums underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-current sm:block"
            title="See where this number comes from"
          >
            {formatVatAmount(filing.amount)}
          </button>
        ) : breakdown ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onBreakdown(filing)}>
            See the numbers
          </Button>
        ) : null}
        {needsAction(filing) ? (
          <Button
            type="button"
            size="sm"
            onClick={() => (breakdown ? onBreakdown(filing) : onSubmit(filing))}
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            {breakdown
              ? filing.correction
                ? "Review correction"
                : "Review & submit"
              : "Submit"}
          </Button>
        ) : filing.status === "in_progress" ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link href={filing.href} />}
            nativeButton={false}
          >
            Monthly report
          </Button>
        ) : null}
      </ItemActions>
    </Item>
  )
}

/** The same routine return for several customers (every T4 due 10 Oct),
    folded into one row that opens in place, like the deadline groups. */
function FilingGroupRow({
  filings,
  onSubmit,
  onBreakdown,
}: {
  filings: Filing[]
  onSubmit: (filing: Filing) => void
  onBreakdown: (filing: Filing) => void
}) {
  const [open, setOpen] = useState(false)
  const first = filings[0]
  const tone = TONE[toneOf(first)]
  const total = filings.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  const names = filings
    .map((f) => CLIENT_BY_ID.get(f.clientId)?.name.replace(/ (AS|DA|SA)$/, ""))
    .join(", ")

  return (
    <div>
      <Item
        size="sm"
        render={
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
        }
        className="hover:bg-muted/40 w-full rounded-none px-3 text-left transition-colors duration-150"
      >
        <ItemMedia className="self-center">
          <DateBlock iso={first.due} status={tone.deadline} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle className="w-full min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
            <span className="min-w-0 truncate">
              {first.name} {first.period} · {filings.length} customers
            </span>
            <Badge variant={tone.badge} size="sm" className="shrink-0">
              {tone.label}
            </Badge>
          </ItemTitle>
          <ItemDescription className="flex min-w-0 items-center gap-x-2 text-xs">
            <span className="text-foreground shrink-0 font-medium">{when(first)}</span>
            <DotSeparator />
            <span className="min-w-0 truncate">{names}</span>
          </ItemDescription>
        </ItemContent>
        <ItemActions className="gap-3">
          {total ? (
            <span className="text-muted-foreground hidden text-sm tabular-nums sm:block">
              {formatVatAmount(total)}
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "text-muted-foreground ease-snappy size-4 transition-[rotate] duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </ItemActions>
      </Item>
      {open ? (
        <div className="bg-muted/20 border-t">
          {filings.map((filing, index) => (
            <div key={filing.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <FilingRow filing={filing} showClient onSubmit={onSubmit} onBreakdown={onBreakdown} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FilingList({
  filings,
  showClient,
  onSubmit,
  onBreakdown,
}: {
  filings: Filing[]
  showClient?: boolean
  onSubmit: (filing: Filing) => void
  onBreakdown: (filing: Filing) => void
}) {
  // Across customers, three or more of the same on-time return fold together.
  // Late ones never fold: each needs its own look.
  const rows: Filing[][] = []
  for (const filing of filings) {
    const group = showClient && !filing.late
      ? rows.find(
          (r) =>
            !r[0].late &&
            r[0].kind === filing.kind &&
            r[0].period === filing.period &&
            r[0].due === filing.due
        )
      : undefined
    if (group) group.push(filing)
    else rows.push([filing])
  }
  const folded = rows.flatMap((r) => (r.length >= 3 ? [r] : r.map((f) => [f])))

  return (
    <div className="flex flex-col">
      {folded.map((row, index) => (
        <div key={row[0].id}>
          {index > 0 ? <Separator className="opacity-60" /> : null}
          {row.length > 1 ? (
            <FilingGroupRow filings={row} onSubmit={onSubmit} onBreakdown={onBreakdown} />
          ) : (
            <FilingRow
              filing={row[0]}
              showClient={showClient}
              onSubmit={onSubmit}
              onBreakdown={onBreakdown}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── One client ──

export function ClientFilings({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const { ask, dialog } = useSubmit()
  const { open: explain, sheet } = useFilingBreakdown(ask)
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return null

  const filings = getClientFilings(client, state.items, state)
  const vat = filings.filter((f) => f.group === "vat")
  const annual = filings.filter((f) => f.group === "annual")
  const payroll = filings.filter((f) => f.group === "payroll")
  const nextVat = vat.find((f) => f.status !== "submitted")
  const nextPayroll = payroll.find((f) => f.status !== "submitted")
  const years = [...new Set(annual.map((f) => f.period))]
  const lateAnnual = annual.filter((f) => f.late).length

  return (
    <div className="grid min-w-0 items-start gap-4 @5xl/main:grid-cols-2">
      <Frame dense spacing="sm" className="w-full">
        <FrameHeader>
          <FrameTitle>VAT returns</FrameTitle>
          <FrameDescription className="text-xs">
            {client.vatTerm === "Annual" ? "Annual term" : "Bi-monthly terms"}
            {nextVat
              ? ` · next due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(nextVat.due))}`
              : " · all submitted"}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          <FilingList filings={vat} onSubmit={ask} onBreakdown={explain} />
        </FramePanel>
      </Frame>
      {payroll.length ? (
        <Frame dense spacing="sm" className="w-full @5xl/main:order-last">
          <FrameHeader>
            <FrameTitle>A-melding</FrameTitle>
            <FrameDescription className="text-xs">
              Pay, tax withheld and employer&apos;s NI, monthly
              {nextPayroll
                ? ` · next due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(nextPayroll.due))}`
                : " · all submitted"}
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0">
            <FilingList filings={payroll} onSubmit={ask} onBreakdown={explain} />
          </FramePanel>
        </Frame>
      ) : null}
      <Frame dense spacing="sm" className="w-full">
        <FrameHeader>
          <FrameTitle>Annual reporting</FrameTitle>
          <FrameDescription className="text-xs">
            {lateAnnual
              ? `${lateAnnual} late from before the customer joined`
              : "Shareholder register, tax return and annual accounts"}
          </FrameDescription>
        </FrameHeader>
        {years.map((year) => (
          <FramePanel key={year} className="p-0">
            <div className="text-muted-foreground px-3 pt-2.5 pb-1 text-xs font-medium">
              Fiscal year {year}
            </div>
            <Separator className="opacity-60" />
            <FilingList
              filings={annual.filter((f) => f.period === year)}
              onSubmit={ask}
              onBreakdown={explain}
            />
          </FramePanel>
        ))}
      </Frame>
      {dialog}
      {sheet}
    </div>
  )
}

// ── The firm ──

type FilingRowData = Client & {
  filings: Filing[]
  vat: Filing[]
  payroll: Filing[]
  annualLast: Filing[]
  annualNow: Filing[]
  next?: Filing
}

/** One square per filing: the term or form, its colour and icon. */
function Chip({ filing, label }: { filing: Filing; label: string }) {
  const tone = TONE[toneOf(filing)]
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-9 items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] font-medium tabular-nums [&_svg]:size-3",
        tone.chip
      )}
      title={`${filing.name} ${filing.period}: ${tone.label}`}
    >
      {tone.icon}
      {label}
      <span className="sr-only">: {tone.label}</span>
    </span>
  )
}

function ChipStrip({ filings, label }: { filings: Filing[]; label: (f: Filing) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {filings.map((filing) => (
        <Chip key={filing.id} filing={filing} label={label(filing)} />
      ))}
    </div>
  )
}

const ANNUAL_SHORT: Record<Filing["kind"], string> = {
  mva: "MVA",
  shareholders: "RF-1086",
  tax_return: "Skatt",
  annual_accounts: "Årsr.",
  a_melding: "A-m.",
}

function useFilingColumns(): ColumnDef<DataGridFeatures, FilingRowData>[] {
  return useMemo(
    () => [
      {
        accessorKey: "name",
        id: "client",
        header: ({ column }) => <DataGridColumnHeader title="Customer" column={column} />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <ClientChip client={row.original} size="xs" />
            <div className="flex min-w-0 flex-col gap-px">
              <span className="text-foreground truncate text-sm font-medium">
                {row.original.name}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {row.original.vatTerm} VAT · since {row.original.profile.clientSince}
              </span>
            </div>
          </div>
        ),
        size: 240,
        enableSorting: true,
      },
      {
        id: "vat",
        accessorFn: (row) => row.vat.filter((f) => f.status === "ready").length,
        header: ({ column }) => <DataGridColumnHeader title="VAT 2026" column={column} />,
        cell: ({ row }) => (
          <ChipStrip
            filings={row.original.vat.filter((f) => f.period.includes("2026"))}
            label={(f) => (f.short === "2026" ? "Annual" : f.short)}
          />
        ),
        size: 300,
        enableSorting: true,
      },
      {
        id: "payroll",
        accessorFn: (row) => row.payroll.filter((f) => f.status === "ready").length,
        header: ({ column }) => <DataGridColumnHeader title="A-melding" column={column} />,
        cell: ({ row }) =>
          row.original.payroll.length ? (
            <ChipStrip filings={row.original.payroll} label={(f) => f.short} />
          ) : (
            <span className="text-muted-foreground text-xs">No payroll</span>
          ),
        size: 170,
        enableSorting: true,
      },
      {
        id: "annualLast",
        accessorFn: (row) => row.annualLast.filter((f) => f.status !== "submitted").length,
        header: ({ column }) => <DataGridColumnHeader title="Year-end 2025" column={column} />,
        cell: ({ row }) => (
          <ChipStrip filings={row.original.annualLast} label={(f) => ANNUAL_SHORT[f.kind]} />
        ),
        size: 240,
        enableSorting: true,
      },
      {
        id: "annualNow",
        header: () => <span className="text-muted-foreground text-xs font-medium">Year-end 2026</span>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.annualNow[0]?.detail.split(" · ")[0]}
          </span>
        ),
        size: 150,
        enableSorting: false,
      },
      {
        id: "next",
        accessorFn: (row) => row.next?.due ?? "9999",
        header: ({ column }) => <DataGridColumnHeader title="Next due" column={column} />,
        cell: ({ row }) => {
          const next = row.original.next
          if (!next) return <span className="text-muted-foreground text-xs">All filed</span>
          return (
            <div className="flex min-w-0 flex-col gap-px">
              <span
                className={cn(
                  "truncate text-sm",
                  next.late ? "text-destructive font-medium" : "text-foreground"
                )}
              >
                {next.name} {next.short}
              </span>
              <span className="text-muted-foreground text-xs">{when(next)}</span>
            </div>
          )
        },
        size: 190,
        enableSorting: true,
      },
    ],
    []
  )
}

function Legend() {
  const tones: Tone[] = ["done", "ready", "late", "progress", "upcoming"]
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {tones.map((tone) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded border [&_svg]:size-2.5",
              TONE[tone].chip
            )}
            aria-hidden="true"
          >
            {TONE[tone].icon}
          </span>
          {TONE[tone].label}
        </span>
      ))}
    </div>
  )
}

export function FilingsOverview() {
  const router = useRouter()
  const { state } = useAccounting()
  const { ask, dialog } = useSubmit()
  const { open: explain, sheet } = useFilingBreakdown(ask)
  const [sorting, setSorting] = useState<SortingState>([{ id: "next", desc: false }])

  const clients = scopedClients(state.scope)
  const rows = useMemo<FilingRowData[]>(
    () =>
      clients.map((client) => {
        const filings = getClientFilings(client, state.items, {
          closing: state.closing,
          progress: state.progress,
          periods: state.periods,
        })
        return {
          ...client,
          filings,
          vat: filings.filter((f) => f.group === "vat"),
          payroll: filings.filter((f) => f.group === "payroll"),
          annualLast: filings.filter((f) => f.group === "annual" && f.period === "2025"),
          annualNow: filings.filter((f) => f.group === "annual" && f.period === "2026"),
          next: filings
            .filter((f) => f.status === "ready" || f.status === "in_progress")
            .sort(byUrgency)[0],
        }
      }),
    [clients, state.items, state.closing, state.progress, state.periods]
  )

  const ready = rows.flatMap((r) => r.filings.filter(needsAction)).sort(byUrgency)
  const late = ready.filter((f) => f.late).length
  const toPay = ready.reduce((sum, f) => sum + Math.max(0, f.amount ?? 0), 0)
  const columns = useFilingColumns()

  const table = useTable({
    features: dataGridFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
  })

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Frame dense spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-px">
            <FrameTitle>Ready to submit</FrameTitle>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
              <span>
                {ready.length} {ready.length === 1 ? "filing" : "filings"} drafted and waiting on you
              </span>
              {late ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span className="text-destructive font-medium">{late} late</span>
                </>
              ) : null}
              {toPay ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span>{formatAmount(toPay)} VAT to pay</span>
                </>
              ) : null}
            </FrameDescription>
          </div>
          <ScopeToggle />
        </FrameHeader>
        <FramePanel className="p-0">
          {ready.length ? (
            <FilingList filings={ready} showClient onSubmit={ask} onBreakdown={explain} />
          ) : (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm text-pretty">
              Nothing to submit. A VAT return shows up here once every month
              it covers is reconciled; the last month closes after it.
            </p>
          )}
        </FramePanel>
      </Frame>

      <DataGrid
        table={table}
        recordCount={rows.length}
        emptyMessage="No customers in this view."
        onRowClick={(row) => router.push(`/clients/${row.id}/filings`)}
        tableLayout={{ dense: true }}
        tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
      >
        <Frame dense variant="default" spacing="sm" className="w-full">
          <FrameHeader>
            <FrameTitle>Every filing, every customer</FrameTitle>
            <FrameDescription className="text-xs">
              VAT terms, A-meldinger and year-end reporting for{" "}
              {state.scope === "mine" ? "my customers" : "the whole firm"}
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0 shadow-none!">
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
          </FramePanel>
          <FrameFooter>
            <Legend />
          </FrameFooter>
        </Frame>
      </DataGrid>
      {dialog}
      {sheet}
    </div>
  )
}
