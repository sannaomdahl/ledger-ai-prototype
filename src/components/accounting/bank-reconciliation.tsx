"use client"

// The Reconciliation tab, in the same grammar as Bookkeeping and Payroll: a
// Frame summary like the pay run's, for every bank account together or one
// at a time (statement, ledger, difference and how many lines are matched),
// then the month's bank lines in the grid adapted from
// @reui/data-grid-filtering-2, the way the review queue is. Every line is
// matched to what it pays, and shows the entry that makes in the ledger:
// an invoice's payment clears 2400 from 1920, a card receipt is booked
// straight against 1921, salaries clear 2930 and match themselves from the
// run. A line with nothing behind it goes to the customer. Opening a row
// brings up what it pays in the review panel; the salaries open Payroll.
import { heldInvoices } from "@/lib/accounting/approvals"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table"
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
import { cn } from "cn"
import {
  ArrowLeftRightIcon,
  BookOpenCheckIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CreditCardIcon,
  EllipsisVerticalIcon,
  FileQuestionIcon,
  LandmarkIcon,
  LockIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  SendIcon,
  Undo2Icon,
  WalletIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { addDays, CLIENT_BY_ID, draftRequest, monthLabel, monthName, nextMonth } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { formatAmount } from "@/lib/accounting/format"
import { isWorkable, monthStatus } from "@/lib/accounting/periods"
import {
  bankEntry,
  getBankReconciliation,
  type AccountRecon,
  type BankLine,
  type BankLineState,
  type BankReconciliation as Recon,
  type Ledger,
  type MatchKind,
  type ReconIssueState,
} from "@/lib/accounting/reconciliation"
import { useAccounting } from "@/lib/accounting/store"
import type { BankAccount, ReconIssueKind } from "@/lib/accounting/types"
import { formatDate, formatNok, ISSUE_META } from "./meta"
import { DotSeparator, IconChip, StatusBadge } from "./primitives"

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })

/** "+3 412 kr" / "−54 kr": which way a line moves the difference. */
function signed(value: number) {
  if (value === 0) return formatAmount(0)
  return `${value > 0 ? "+" : "−"}${formatAmount(Math.abs(value))}`
}

// ── Ledger issues ──

const ISSUE_ICON: Record<ReconIssueKind, ReactNode> = {
  duplicate: <CopyIcon aria-hidden="true" />,
  in_transit: <ClockIcon aria-hidden="true" />,
  currency: <ArrowLeftRightIcon aria-hidden="true" />,
}

/** What fixing an issue does, per kind. */
function issueAction(issue: ReconIssueState, month: string) {
  switch (issue.kind) {
    case "duplicate":
      return {
        how: "fixed" as const,
        label: `Reverse ${issue.voucherNo}`,
        done: `Reversal of ${issue.voucherNo} posted`,
        toast: `Reversal voucher for ${issue.voucherNo} created in Tripletex`,
      }
    case "currency":
      return {
        how: "fixed" as const,
        label: `Book ${formatAmount(Math.abs(issue.ledgerEffect))} to 8160`,
        done: "Booked to 8160 Currency loss",
        toast: "Currency loss voucher created in Tripletex",
      }
    case "in_transit":
      return {
        how: "carried" as const,
        label: `Carry to ${monthName(nextMonth(month))}`,
        done: `Carried to ${monthName(nextMonth(month))}, clears when DNB books it`,
        toast: `Carried to ${monthName(nextMonth(month))} as an outstanding payment`,
      }
  }
}

function IssueRow({ issue, month }: { issue: ReconIssueState; month: string }) {
  const { dispatch } = useAccounting()
  const action = issueAction(issue, month)
  const resolved = Boolean(issue.resolution)

  return (
    <Item size="sm" className="rounded-none px-3">
      <ItemMedia>
        <IconChip className={resolved ? "text-muted-foreground" : "text-warning-text"}>
          {ISSUE_ICON[issue.kind]}
        </IconChip>
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className={cn("w-full min-w-0 text-sm", resolved && "text-muted-foreground")}>
          <span className="truncate">{issue.title}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-2 text-xs text-pretty">
          {resolved ? action.done : issue.detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3">
        <span
          className={cn(
            "hidden w-24 text-right text-sm tabular-nums sm:block",
            resolved ? "text-muted-foreground" : "text-foreground",
            issue.resolution?.how === "fixed" && "line-through"
          )}
        >
          {signed(-issue.ledgerEffect)}
        </span>
        {issue.resolution?.by === "The agent" ? (
          <span className="text-muted-foreground text-xs">Carried by the agent</span>
        ) : resolved ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "unresolve_recon", issueId: issue.id })}
          >
            <Undo2Icon data-icon="inline-start" aria-hidden="true" />
            Undo
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              dispatch({ type: "resolve_recon", issueId: issue.id, how: action.how })
              toast.success(action.toast, {
                description:
                  action.how === "carried"
                    ? "Listed on the reconciliation as an outstanding payment."
                    : "Ledger 1920 moved to match the bank.",
              })
            }}
          >
            {action.label}
          </Button>
        )}
      </ItemActions>
    </Item>
  )
}

// ── Summary ──

function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "success" | "warning"
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          "text-foreground text-lg font-semibold tabular-nums",
          tone === "success" && "text-success-text",
          tone === "warning" && "text-warning-text"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** The hatched meter of the pay run summary, for matched lines. */
function MatchMeter({ matched, total }: { matched: number; total: number }) {
  const pct = Math.round((matched / Math.max(1, total)) * 100)
  return (
    <div className="flex flex-col justify-center gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Bank lines matched</span>
        <span className="text-foreground font-semibold tabular-nums">
          {matched}/{total}
        </span>
      </div>
      <div className="bg-muted/55 relative h-1.5 overflow-hidden rounded-sm">
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 opacity-20"
          aria-hidden="true"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 4px)",
          }}
        />
        <Progress
          value={pct}
          className="**:data-[slot=progress-indicator]:bg-success absolute inset-0 gap-0 **:data-[slot=progress-indicator]:rounded-none **:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent"
        />
      </div>
    </div>
  )
}

function ReconBadge({ recon }: { recon: Pick<AccountRecon, "reconciled" | "toDo"> }) {
  return recon.reconciled ? (
    <Badge variant="success-light">Reconciled</Badge>
  ) : (
    <Badge variant="warning-light">{recon.toDo} to clear</Badge>
  )
}

function accountLabel(account: BankAccount) {
  return `${account.ledger} ${account.name}`
}

/** All accounts, or one. Each tab says whether its account is clean. */
function AccountTabs({
  bank,
  view,
  onChange,
}: {
  bank: Recon
  view: View
  onChange: (view: View) => void
}) {
  return (
    <Tabs value={view} onValueChange={(value) => onChange(value as View)}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="all" className="gap-1.5">
          All accounts
        </TabsTrigger>
        {bank.accounts.map((a) => (
          <TabsTrigger key={a.account.ledger} value={a.account.ledger} className="gap-1.5">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                a.reconciled ? "bg-success" : "bg-warning"
              )}
              aria-hidden="true"
            />
            {accountLabel(a.account)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** What a difference is made of, so nobody has to hunt for it: bank lines
    not on the ledger yet, ledger issues still open, timing carried. */
function DifferenceParts({ recon }: { recon: AccountRecon }) {
  const parts: string[] = []
  if (recon.offLedger.count)
    parts.push(
      `${recon.offLedger.count} bank ${recon.offLedger.count === 1 ? "line" : "lines"} not booked yet (${signed(recon.offLedger.amount)})`
    )
  for (const issue of recon.open) parts.push(`${issue.title} (${signed(-issue.ledgerEffect)})`)
  for (const issue of recon.carried) parts.push(`a payment in transit, carried (${signed(-issue.ledgerEffect)})`)
  if (!parts.length) return null
  return (
    <span className="text-warning-text block text-left text-xs text-pretty">
      Δ {formatAmount(Math.abs(recon.difference))}: {parts.join(" · ")}
    </span>
  )
}

/** Every account at a glance: statement, ledger, difference, status. */
function AccountRows({ bank, onOpen }: { bank: Recon; onOpen: (ledger: Ledger) => void }) {
  return (
    <FramePanel className="p-0">
      {bank.accounts.map((a, index) => (
        <div key={a.account.ledger}>
          {index > 0 ? <Separator className="opacity-60" /> : null}
          <Item
            size="sm"
            className="hover:bg-muted/50 cursor-pointer rounded-none px-3"
            render={<button type="button" onClick={() => onOpen(a.account.ledger)} />}
          >
            <ItemMedia>
              <IconChip className="text-muted-foreground">{LEDGER_ICON[a.account.ledger]}</IconChip>
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="text-sm">{accountLabel(a.account)}</ItemTitle>
              <ItemDescription className="text-xs">
                DNB {a.account.number} · {a.lines.length ? `${a.matched.length}/${a.lines.length} lines matched` : "Matched by rules"}
              </ItemDescription>
              {a.difference ? <DifferenceParts recon={a} /> : null}
            </ItemContent>
            <ItemActions className="gap-4">
              <span className="text-muted-foreground hidden w-28 text-right text-sm tabular-nums sm:block">
                {formatAmount(a.bank)}
              </span>
              <span
                className={cn(
                  "hidden w-24 text-right text-sm tabular-nums md:block",
                  a.difference ? "text-warning-text" : "text-muted-foreground"
                )}
              >
                {a.difference ? `Δ ${formatAmount(Math.abs(a.difference))}` : "No difference"}
              </span>
              <ReconBadge recon={a} />
            </ItemActions>
          </Item>
        </div>
      ))}
    </FramePanel>
  )
}

function Summary({
  bank,
  view,
  onView,
  month,
}: {
  bank: Recon
  view: View
  onView: (view: View) => void
  month: string
}) {
  const one = view === "all" ? undefined : bank.accounts.find((a) => a.account.ledger === view)!
  const shown = one ?? bank
  const asOf = dayMonth.format(new Date(bank.asOf))
  const issues = [...shown.open, ...shown.carried, ...shown.fixed]
  const next = monthLabel(nextMonth(month))
  const rules = shown.auto.incoming.count + shown.auto.outgoing.count
  const operating = !one || one.account.ledger === "1920"

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-col items-stretch gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-px">
            <div className="flex items-center gap-2">
              <FrameTitle>Bank reconciliation · {monthName(month)}</FrameTitle>
              <ReconBadge recon={shown} />
            </div>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
              <span>
                {one
                  ? `DNB ${one.account.number}`
                  : `${bank.accounts.length} DNB accounts`}
              </span>
              <DotSeparator className="bg-input" />
              <span>
                Statement {asOf} against{" "}
                {one ? `ledger ${one.account.ledger}` : bank.accounts.map((a) => a.account.ledger).join(", ")}
              </span>
              <DotSeparator className="bg-input" />
              <span>{rules} lines matched by rules</span>
            </FrameDescription>
          </div>
        </div>
        <AccountTabs bank={bank} view={view} onChange={onView} />
      </FrameHeader>
      {one ? (
        <FramePanel className="grid gap-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
          <Figure label={`DNB statement · ${asOf}`} value={formatAmount(one.bank)} />
          <Figure label={`Ledger ${one.account.ledger} · Tripletex`} value={formatAmount(one.ledger)} />
          <Figure
            label={
              one.reconciled && one.carried.length
                ? `Difference · carried to ${monthName(nextMonth(month))}`
                : "Difference"
            }
            value={formatAmount(Math.abs(one.difference))}
            tone={one.reconciled ? "success" : "warning"}
          />
          {one.lines.length ? (
            <MatchMeter matched={one.matched.length} total={one.lines.length} />
          ) : (
            <Figure
              label="Matched by rules"
              value={`${rules} ${rules === 1 ? "line" : "lines"}`}
            />
          )}
        </FramePanel>
      ) : (
        <AccountRows bank={bank} onOpen={onView} />
      )}
      {issues.length ? (
        <FramePanel className="p-0">
          <div className="text-muted-foreground px-3 pt-2.5 pb-1 text-xs font-medium">
            Ledger issues on 1920
          </div>
          {issues.map((issue) => (
            <div key={issue.id}>
              <Separator className="opacity-60" />
              <IssueRow issue={issue} month={month} />
            </div>
          ))}
        </FramePanel>
      ) : null}
      {operating && bank.payables.items.length ? (
        <FrameFooter className="text-muted-foreground flex-row flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span>Open on 2400 at month end, paid from 1920 in {next}:</span>
          {bank.payables.items.map((item, index) => (
            <span key={item.id} className="inline-flex items-center gap-1.5">
              {index > 0 ? <DotSeparator className="bg-input" /> : null}
              <span className="text-foreground">{item.title}</span>
              <span className="tabular-nums">
                {formatAmount(Math.abs(item.amount))}, due {formatDate(item.dueDate!)}
              </span>
            </span>
          ))}
        </FrameFooter>
      ) : null}
    </Frame>
  )
}

// ── Bank lines ──

type LineTab = BankLineState | "all"

const LINE_TABS: { value: LineTab; label: string }[] = [
  { value: "suggested", label: "Suggested" },
  { value: "unmatched", label: "No document" },
  { value: "waiting", label: "Not booked yet" },
  { value: "matched", label: "Matched" },
  { value: "all", label: "All" },
]

type View = "all" | Ledger

const LEDGER_ICON: Record<Ledger, ReactNode> = {
  "1920": <LandmarkIcon aria-hidden="true" />,
  "1921": <CreditCardIcon aria-hidden="true" />,
  "1950": <PiggyBankIcon aria-hidden="true" />,
}

const EMPTY: Record<LineTab, string> = {
  suggested: "No suggestions left. Every match the agent found is accepted.",
  unmatched: "Every bank line has an invoice or receipt behind it.",
  waiting: "Nothing left to book: every receipt, invoice and pay run behind a line is in.",
  matched: "Nothing matched yet.",
  all: "No bank lines to match this month.",
}

const KIND_ICON: Record<MatchKind, ReactNode> = {
  invoice: <ReceiptTextIcon aria-hidden="true" />,
  receipt: <CreditCardIcon aria-hidden="true" />,
  payroll: <WalletIcon aria-hidden="true" />,
  none: <FileQuestionIcon aria-hidden="true" />,
}

/** Status in the same dot-and-outline badge as the review queue. */
const LINE_STATUS: Record<
  Exclude<BankLineState, "unmatched">,
  { label: string; dotClassName: string }
> = {
  suggested: { label: "Suggested", dotClassName: "bg-info" },
  waiting: { label: "Not booked yet", dotClassName: "bg-zinc-400 dark:bg-zinc-300" },
  matched: { label: "Matched", dotClassName: "bg-emerald-500" },
}

function lineTitle(line: BankLine) {
  return line.kind === "payroll" ? "Salaries" : line.item!.title
}

/** What the line pays, as a two-line cell: the match, then the entry it
    makes in the ledger. The money has already moved, so the bank account is
    always one side of it. */
function matchText(line: BankLine): { primary: string; secondary: string } {
  const entry = bankEntry(line)
  const posting = `Dr ${entry.debit.split(" ")[0]} / Cr ${entry.credit.split(" ")[0]}`
  switch (line.kind) {
    case "invoice": {
      const item = line.item!
      return {
        primary: item.expense
          ? `Expense refund to ${item.expense.employee.split(" ")[0]}`
          : item.period < line.date.slice(0, 7)
            ? `Invoice booked in ${monthName(item.period)}`
            : `Invoice of ${formatDate(item.date)}`,
        secondary:
          item.status !== "booked"
            ? "Book the invoice first"
            : line.byRule
              ? `${posting} · KID and amount match · voucher ${item.voucherNo ?? ""}`.trim()
              : `Payment · ${posting} · voucher ${item.voucherNo ?? ""}`.trim(),
      }
    }
    case "receipt":
      return {
        primary:
          line.item!.status === "booked" ? "Card receipt" : `Card receipt · ${line.item!.suggestion.lines[0].account}`,
        secondary:
          line.item!.status === "booked"
            ? `${posting} · voucher ${line.item!.voucherNo}`
            : line.state === "suggested"
              ? `Receipt matches the payment · ${posting}`
              : `To look at · ${posting}`,
      }
    case "payroll":
      return {
        primary: `${monthName(line.payRun!)} pay run${line.run && line.run > 1 ? ` (follow-up ${line.run})` : ""}`,
        secondary:
          line.state === "matched"
            ? `${posting} · matched by the run`
            : "Waits on the pay run",
      }
    case "none":
      return {
        primary: line.state === "matched" ? "Booked from the bank line" : "Nothing found",
        secondary:
          line.state === "matched"
            ? `${posting} · voucher ${line.item!.voucherNo}`
            : "No invoice or receipt in Tripletex",
      }
  }
}

function LineCell({ line, showAccount }: { line: BankLine; showAccount: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconChip
        className={line.state === "unmatched" ? "text-warning-text" : "text-muted-foreground"}
      >
        {KIND_ICON[line.kind]}
      </IconChip>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">{lineTitle(line)}</span>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="shrink-0 tabular-nums">{formatDate(line.date)}</span>
          {showAccount ? (
            <>
              <DotSeparator className="bg-input" />
              <span className="shrink-0 tabular-nums">{line.account}</span>
            </>
          ) : null}
          <DotSeparator className="bg-input" />
          <span className="truncate font-mono text-[11px]">{line.text}</span>
        </div>
      </div>
    </div>
  )
}

function StatusCell({ line }: { line: BankLine }) {
  // A line with nothing behind it, or a card receipt still to book, is
  // its own review item: it shows that item's place in the loop with the
  // customer.
  if (
    line.item &&
    ((line.kind === "none" && line.state === "unmatched") ||
      (line.kind === "receipt" && line.state === "waiting"))
  ) {
    const item = line.item
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <StatusBadge status={item.status} />
        {item.issue && item.status === "needs_review" ? (
          <span className="text-warning-text inline-flex items-center gap-1 text-xs [&_svg]:size-3">
            {ISSUE_META[item.issue].icon}
            {ISSUE_META[item.issue].label}
          </span>
        ) : null}
      </div>
    )
  }
  const meta = LINE_STATUS[line.state as Exclude<BankLineState, "unmatched">]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dotClassName)} aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

type LineHandlers = {
  locked: boolean
  showAccount: boolean
  onAccept: (line: BankLine) => void
  onUndo: (line: BankLine) => void
  onOpen: (line: BankLine) => void
  onAsk: (line: BankLine) => void
}

function ActionsCell({ line, handlers }: { line: BankLine; handlers: LineHandlers }) {
  if (handlers.locked) return null
  const entries: { label: string; icon: ReactNode; run: () => void }[] = []
  if (line.state === "suggested")
    entries.push({ label: "Accept match", icon: <CheckIcon className="size-4" aria-hidden="true" />, run: () => handlers.onAccept(line) })
  if (line.state === "waiting")
    entries.push({
      label: line.kind === "payroll" ? "Open payroll" : line.kind === "receipt" ? "Look at the receipt" : "Book it",
      icon: <BookOpenCheckIcon className="size-4" aria-hidden="true" />,
      run: () => handlers.onOpen(line),
    })
  if (line.state === "unmatched")
    entries.push({ label: "Ask customer", icon: <SendIcon className="size-4" aria-hidden="true" />, run: () => handlers.onAsk(line) })
  // A receipt or a bank line is matched by booking it: undoing that is
  // reversing the voucher, from the line itself.
  if (line.state === "matched" && line.kind === "invoice")
    entries.push({ label: "Undo match", icon: <Undo2Icon className="size-4" aria-hidden="true" />, run: () => handlers.onUndo(line) })
  if (!entries.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Open actions for ${lineTitle(line)}`}
          >
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          {entries.map((entry) => (
            <DropdownMenuItem key={entry.label} onClick={entry.run}>
              {entry.icon}
              {entry.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function createColumns(handlers: LineHandlers): ColumnDef<DataGridFeatures, BankLine>[] {
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
      accessorFn: (row) => row.date,
      id: "line",
      header: ({ column }) => <DataGridColumnHeader title="Bank line" column={column} />,
      cell: ({ row }) => <LineCell line={row.original} showAccount={handlers.showAccount} />,
      size: 300,
      minSize: 220,
      enableSorting: true,
      enableHiding: false,
      meta: { autoSize: true, headerClassName: "pl-3!", cellClassName: "pl-3!" },
    },
    {
      accessorFn: (row) => row.amount,
      id: "amount",
      header: ({ column }) => <DataGridColumnHeader title="Amount" column={column} />,
      cell: ({ row }) => (
        <span className="text-foreground text-sm tabular-nums">{formatNok(row.original.amount)}</span>
      ),
      size: 130,
      enableSorting: true,
    },
    {
      accessorFn: (row) => matchText(row).primary,
      id: "match",
      header: ({ column }) => <DataGridColumnHeader title="Pays" column={column} />,
      cell: ({ row }) => {
        const text = matchText(row.original)
        return (
          <div className="flex min-w-0 flex-col gap-px">
            <span
              className={cn(
                "truncate text-sm",
                row.original.state === "unmatched" ? "text-warning-text" : "text-foreground"
              )}
            >
              {text.primary}
            </span>
            <span className="text-muted-foreground truncate text-xs">{text.secondary}</span>
          </div>
        )
      },
      size: 220,
      enableSorting: true,
    },
    {
      accessorFn: (row) => row.state,
      id: "status",
      header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
      cell: ({ row }) => <StatusCell line={row.original} />,
      size: 170,
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        // Menu clicks bubble through the portal; keep them off the row click.
        <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
          <ActionsCell line={row.original} handlers={handlers} />
        </div>
      ),
      size: 56,
      enableSorting: false,
    },
  ]
}

function BankLines({
  clientId,
  lines,
  month,
  locked,
  showAccount,
}: {
  clientId: string
  lines: BankLine[]
  month: string
  locked: boolean
  showAccount: boolean
}) {
  const { state, dispatch } = useAccounting()
  const router = useRouter()
  const panelOpen = Boolean(state.openItemId)
  const counts = useMemo(
    () =>
      Object.fromEntries(
        LINE_TABS.map((t) => [
          t.value,
          t.value === "all" ? lines.length : lines.filter((l) => l.state === t.value).length,
        ])
      ) as Record<LineTab, number>,
    [lines]
  )
  // Open on the first tab with work in it; after that the accountant's pick.
  const [tab, setTab] = useState<LineTab>(
    () => LINE_TABS.find((t) => t.value !== "all" && counts[t.value] > 0)?.value ?? "all"
  )
  const [sorting, setSorting] = useState<SortingState>([{ id: "line", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })

  const rows = useMemo(
    () => (tab === "all" ? lines : lines.filter((l) => l.state === tab)),
    [lines, tab]
  )
  const suggested = lines.filter((l) => l.state === "suggested")
  const selectedIds = Object.keys(rowSelection).filter((id) =>
    suggested.some((l) => l.id === id)
  )
  const earlier = lines.filter((l) => l.kind === "invoice" && l.item && l.item.period < month).length
  // Bank lines with nothing behind them that nobody has asked about yet (an
  // agent draft waiting to go counts as not asked).
  const toAsk = lines.filter((l) => {
    if (l.state !== "unmatched" || !l.item || l.item.status !== "needs_review") return false
    const request = l.item.requestId
      ? state.requests.find((r) => r.id === l.item!.requestId)
      : undefined
    return !request || request.status === "draft"
  })

  /** One agent-drafted question per line, sent at once. The customer gets
      them as separate tasks in their app and in one email. */
  function askAll() {
    const client = CLIENT_BY_ID.get(clientId)!
    const recipient = client.contacts[0]
    if (!recipient) return
    // Due at the end of this week, like the composer's default.
    const friday = addDays(TODAY, (5 - new Date(`${TODAY}T12:00:00`).getDay() + 7) % 7)
    const due = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
      .format(new Date(`${friday}T12:00:00`))
      .replace(",", "")
    for (const line of toAsk) {
      const draft = draftRequest(line.item!, client)
      dispatch({
        type: "ask",
        itemId: line.item!.id,
        request: { ...draft, recipientId: recipient.id, due, priority: "medium" },
      })
    }
    toast.success(`${toAsk.length} questions sent to ${recipient.name}`, {
      description: "One task per bank line in their app, all in one email.",
    })
  }

  const accept = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      // The store books card receipts and matches invoice payments.
      dispatch({ type: "accept_matches", ids })
      setRowSelection({})
      toast.success(ids.length === 1 ? "Match accepted" : `${ids.length} matches accepted`, {
        description:
          "Invoice payments get a voucher from 2400 to 1920. Card receipts are booked against the card account in Tripletex.",
      })
    },
    [dispatch]
  )

  const columns = useMemo(
    () =>
      createColumns({
        locked,
        showAccount,
        onAccept: (line) => accept([line.id]),
        onUndo: (line) => dispatch({ type: "unmatch", id: line.id }),
        onOpen: (line) =>
          line.kind === "payroll"
            ? router.push(`/clients/${clientId}/payroll`)
            : line.item && dispatch({ type: "open_item", id: line.item.id, nav: [line.item.id] }),
        onAsk: (line) => line.item && dispatch({ type: "open_ask", id: line.item.id }),
      }),
    [locked, showAccount, accept, dispatch, router, clientId]
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
      // Beside the panel the grid is a picker, as in the review queue.
      columnVisibility: panelOpen ? { select: false, match: false, actions: false } : {},
      columnSizing: panelOpen ? { line: 240, amount: 112, status: 150 } : {},
    },
    enableRowSelection: (row) => !locked && row.original.state === "suggested",
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
  })
  // The panel walks what the grid shows, skipping lines with nothing to open.
  const navIds = table
    .getPrePaginatedRowModel()
    .rows.map((row) => row.original.item?.id)
    .filter((id): id is string => Boolean(id))
  const activeId = rows.find((l) => l.item && l.item.id === state.openItemId)?.id ?? null

  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      emptyMessage={EMPTY[tab]}
      onRowClick={(line) => {
        if (line.item) dispatch({ type: "open_item", id: line.item.id, nav: navIds })
        // The salaries are the run's: they open where it was approved.
        else if (line.kind === "payroll") router.push(`/clients/${clientId}/payroll`)
      }}
      tableLayout={{ dense: true }}
      tableClassNames={{ edgeCell: "first:ps-3 last:pe-3" }}
    >
      <Frame dense variant="default" spacing="sm" className="w-full">
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <FrameTitle className="text-balance">Bank lines · {monthLabel(month)}</FrameTitle>
            <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs text-pretty">
              <span>
                {lines.length} {lines.length === 1 ? "line" : "lines"} to match
              </span>
              {locked ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span className="inline-flex items-center gap-1">
                    <LockIcon className="size-3" aria-hidden="true" />
                    Closed, read-only
                  </span>
                </>
              ) : earlier ? (
                <>
                  <DotSeparator className="bg-input" />
                  <span>
                    {earlier} {earlier === 1 ? "pays an invoice" : "pay invoices"} from earlier months
                  </span>
                </>
              ) : null}
            </FrameDescription>
          </div>
          {locked ? null : (
            <div className="flex flex-wrap items-center gap-2">
              {/* The missing-documents sweep: every line without one, asked at once. */}
              {toAsk.length > 1 ? (
                <Button type="button" variant="outline" className="shrink-0" onClick={askAll}>
                  <SendIcon className="size-4" aria-hidden="true" />
                  {toAsk.every((l) => l.item?.issue === "missing_receipt")
                    ? `Ask for all ${toAsk.length} receipts`
                    : `Ask for all ${toAsk.length} missing documents`}
                </Button>
              ) : null}
              {selectedIds.length > 0 ? (
                <Button type="button" className="shrink-0" onClick={() => accept(selectedIds)}>
                  <CheckIcon className="size-4" aria-hidden="true" />
                  Accept {selectedIds.length} selected
                </Button>
              ) : (
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={suggested.length === 0}
                  onClick={() => accept(suggested.map((l) => l.id))}
                >
                  <CheckCheckIcon className="size-4" aria-hidden="true" />
                  Accept {suggested.length} suggested
                </Button>
              )}
            </div>
          )}
        </FrameHeader>

        <FramePanel className="p-0 shadow-none!">
          <div className="px-(--frame-panel-header-px) pt-(--frame-panel-header-py)">
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value as LineTab)
                setRowSelection({})
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            >
              <TabsList variant="line" className="gap-5">
                {LINE_TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="gap-2 px-0 pt-0 pb-(--frame-panel-header-py) text-sm"
                  >
                    <span>{t.label}</span>
                    <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                      {counts[t.value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <Separator />

          {/* The row open in the panel keeps a quiet highlight. */}
          {activeId ? (
            <style>{`[data-queue="bank"] tr[data-row-id="${activeId}"] > td { background: color-mix(in oklab, var(--primary) 6%, transparent); }`}</style>
          ) : null}
          <div data-queue="bank">
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
    </DataGrid>
  )
}

export function BankReconciliation({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [view, setView] = useState<View>("all")
  const client = CLIENT_BY_ID.get(clientId)!
  const bank = getBankReconciliation(client, state.month, state.items, state.progress, heldInvoices(state, client.id))
  // Read-only once the month's report went out, until it is reopened.
  const locked = !isWorkable(monthStatus(clientId, state.month, state))
  const lines =
    view === "all" ? bank.lines : bank.lines.filter((l) => l.account === view)

  return (
    <>
      <Summary bank={bank} view={view} onView={setView} month={state.month} />
      <BankLines
        // A new month or account starts on its own first tab with work in it.
        key={`${state.month}-${view}`}
        clientId={clientId}
        lines={lines}
        month={state.month}
        locked={locked}
        showAccount={view === "all"}
      />
    </>
  )
}
