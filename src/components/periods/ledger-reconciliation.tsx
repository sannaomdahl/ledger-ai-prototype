"use client"

// The reconciliations next to the bank's, in the same Frame grammar: the
// a-melding against the pay accounts, the supplier and customer ledgers
// against 2400 and 1500, the VAT accounts against the returns. Each lays the
// trial balance from Tripletex beside what should add up to it. A
// difference is a finding with two ways out (fixed in Tripletex, or
// explained and carried over), and when the customer holds the answer it
// becomes a task for them. Each section is signed off once it adds up.
import Link from "next/link"
import { type ReactNode } from "react"
import { cn } from "cn"
import {
  ArrowRightIcon,
  CheckIcon,
  FileWarningIcon,
  SendIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
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
import { IconChip } from "@/components/accounting/primitives"
import { CLIENT_BY_ID, monthLabel, monthName } from "@/lib/accounting/data"
import { formatAmount } from "@/lib/accounting/format"
import {
  ledgersCheck,
  payrollCheck,
  reconSections,
  vatCheck,
  type FindingState,
  type SectionStatus,
} from "@/lib/accounting/ledger-recon"
import { lastDay } from "@/lib/accounting/reconciliation"
import { awaitedCreditNotes } from "@/lib/accounting/documents"
import { stampLabel, supplierShort } from "@/lib/accounting/approvals"
import {
  dayLabel,
  isWorkable,
  monthStatus,
  type ReconSection,
} from "@/lib/accounting/periods"
import { getMonthClose, useAccounting } from "@/lib/accounting/store"

/** "+3 412 kr" / "−54 kr", and a plain dash for nothing. */
function signed(value: number) {
  if (value === 0) return "–"
  return `${value > 0 ? "+" : "−"}${formatAmount(Math.abs(value))}`
}

function useSection(clientId: string, section: ReconSection) {
  const { state } = useAccounting()
  const status = reconSections(state, clientId, state.month).find((s) => s.section === section)!
  const locked = !isWorkable(monthStatus(clientId, state.month, state))
  return { status, locked }
}

// ── Pieces every section shares ──

export function SectionBadge({ status, waiting }: { status: SectionStatus; waiting?: boolean }) {
  if (!status.applicable) return <Badge variant="outline">Not part of our work</Badge>
  if (status.done) return <Badge variant="success-light">Reconciled</Badge>
  // The VAT waits for the bookkeeping and the bank before it can be signed.
  if (waiting) return <Badge variant="outline">After the invoices and bank</Badge>
  if (status.open)
    return (
      <Badge variant="warning-light">
        {status.open} to explain
      </Badge>
    )
  return <Badge variant="info-light">Ready to sign off</Badge>
}

/** Mark reconciled, or who did and when. */
function SignOff({
  clientId,
  section,
  status,
  locked,
}: {
  clientId: string
  section: ReconSection
  status: SectionStatus
  locked: boolean
}) {
  const { state, dispatch } = useAccounting()
  const month = state.month
  if (locked) {
    return (
      <span className="text-muted-foreground text-xs">
        {status.signed
          ? `Signed off ${dayLabel(status.signed.at)} by ${status.signed.by}`
          : "Reconciled when the month closed"}
      </span>
    )
  }
  if (status.signed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden text-xs sm:inline">
          Signed off {dayLabel(status.signed.at)} by {status.signed.by}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "periods", action: { type: "unsign", clientId, month, section } })}
        >
          <Undo2Icon data-icon="inline-start" aria-hidden="true" />
          Undo
        </Button>
      </div>
    )
  }
  // The VAT is signed off last: its return is drafted from it, so the
  // invoices, receipts and bank lines behind it have to be in first.
  const before =
    section === "vat"
      ? getMonthClose(state, clientId, month).steps.filter(
          (s) => (s.id === "bookkeeping" || s.id === "bank") && !s.done
        )
      : []
  return (
    <Button
      type="button"
      size="sm"
      disabled={status.open > 0 || before.length > 0}
      title={before.length ? `${before.map((s) => s.label).join(" and ")} first: the VAT return is drafted from them.` : undefined}
      onClick={() => {
        dispatch({ type: "periods", action: { type: "sign", clientId, month, section } })
        toast.success("Signed off", {
          description: "Kept with your name and today's date, for the month close and the auditor.",
        })
      }}
    >
      <CheckIcon data-icon="inline-start" aria-hidden="true" />
      {status.open
        ? "Explain the differences first"
        : before.length
          ? before[0].id === "bank" ? "Reconcile the bank first" : "Book the invoices first"
          : "Mark reconciled"}
    </Button>
  )
}

function FindingRow({ finding, locked }: { finding: FindingState; locked: boolean }) {
  const { dispatch } = useAccounting()
  const resolved = finding.resolution
  // The account it moves most (gross pay, not the tax on it). Number-like
  // keys come back sorted, so "first" would be the lowest account number.
  const total = Object.values(finding.effect).reduce((max, v) => (Math.abs(v) > Math.abs(max) ? v : max), 0)
  return (
    <Item size="sm" className="rounded-none px-3">
      <ItemMedia>
        <IconChip className={resolved ? "text-muted-foreground" : "text-warning-text"}>
          <FileWarningIcon aria-hidden="true" />
        </IconChip>
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className={cn("w-full min-w-0 text-sm", resolved && "text-muted-foreground")}>
          <span className="truncate">{finding.title}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-3 text-xs text-pretty">
          {resolved
            ? `${resolved.how === "fixed" ? finding.fixed : (finding.carried ?? "Carried over")} · ${resolved.by}, ${dayLabel(resolved.at)}`
            : finding.detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end gap-2">
        <span
          className={cn(
            "hidden w-24 text-right text-sm tabular-nums sm:block",
            resolved ? "text-muted-foreground" : "text-foreground",
            resolved?.how === "fixed" && "line-through"
          )}
        >
          {signed(total)}
        </span>
        {locked ? null : resolved ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "periods", action: { type: "unresolve_finding", id: finding.id } })}
          >
            <Undo2Icon data-icon="inline-start" aria-hidden="true" />
            Undo
          </Button>
        ) : (
          <>
            {finding.ask ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  dispatch({
                    type: "open_task_composer",
                    clientId: finding.clientId,
                    draft: finding.ask,
                  })
                }
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Create task
              </Button>
            ) : null}
            {finding.carried ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  dispatch({ type: "periods", action: { type: "resolve_finding", id: finding.id, how: "carried" } })
                  toast.message("Explained and carried over", { description: finding.carried })
                }}
              >
                Explained, carry over
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                dispatch({ type: "periods", action: { type: "resolve_finding", id: finding.id, how: "fixed" } })
                toast.success("Fixed in Tripletex, checked again", { description: `${finding.fixed}. Re-read from Tripletex: the difference is gone.` })
              }}
            >
              Fixed in Tripletex
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
  )
}

function Findings({ findings, locked }: { findings: FindingState[]; locked: boolean }) {
  if (!findings.length) return null
  return (
    <FramePanel className="p-0">
      <div className="text-muted-foreground px-3 pt-2.5 pb-1 text-xs font-medium">
        {findings.length === 1 ? "Difference found" : "Differences found"}
      </div>
      {findings.map((f) => (
        <div key={f.id}>
          <Separator className="opacity-60" />
          <FindingRow finding={f} locked={locked} />
        </div>
      ))}
    </FramePanel>
  )
}

/** The table head every section uses. */
function Head({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground bg-muted/30 flex items-center gap-3 border-b px-3 py-1.5 text-[11px] font-medium">
      {children}
    </div>
  )
}

function Amount({
  value,
  className,
  tone,
}: {
  value: number | string
  className?: string
  tone?: "warning" | "muted" | "strong"
}) {
  return (
    <span
      className={cn(
        "w-28 shrink-0 text-right text-sm tabular-nums",
        tone === "warning"
          ? "text-warning-text"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground",
        tone === "strong" && "font-medium",
        className
      )}
    >
      {typeof value === "number" ? formatAmount(value) : value}
    </span>
  )
}

function SectionFrame({
  clientId,
  section,
  title,
  description,
  children,
  footer,
}: {
  clientId: string
  section: ReconSection
  title: string
  description: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const { state } = useAccounting()
  const { status, locked } = useSection(clientId, section)
  const waiting =
    section === "vat" &&
    !status.done &&
    getMonthClose(state, clientId, state.month).steps.some(
      (s) => (s.id === "bookkeeping" || s.id === "bank") && !s.done
    )
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <div className="flex items-center gap-2">
            <FrameTitle>{title}</FrameTitle>
            <SectionBadge status={status} waiting={waiting} />
          </div>
          <FrameDescription className="text-xs text-pretty">{description}</FrameDescription>
        </div>
        {status.applicable ? (
          <SignOff clientId={clientId} section={section} status={status} locked={locked} />
        ) : null}
      </FrameHeader>
      {children}
      {footer ? (
        <FrameFooter>
          <p className="text-muted-foreground text-xs text-pretty">{footer}</p>
        </FrameFooter>
      ) : null}
    </Frame>
  )
}

function asOf(month: string) {
  return dayLabel(lastDay(month))
}

// ── Payroll ──

export function PayrollReconciliation({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const month = state.month
  const { status, locked } = useSection(clientId, "payroll")
  if (!status.applicable) {
    return (
      <Empty title={`Payroll · ${monthName(month)}`}>
        {CLIENT_BY_ID.get(clientId)?.name} has no payroll with us, so there is no a-melding to
        reconcile.
      </Empty>
    )
  }
  const check = payrollCheck(state, clientId, month)
  const reopened = monthStatus(clientId, month, state) === "reopened"
  return (
    <SectionFrame
      clientId={clientId}
      section="payroll"
      title={`Payroll · ${monthName(month)}`}
      description={`The ${monthLabel(month).split(" ")[0]} a-melding (pay for ${monthLabel(check.hours).split(" ")[0]} hours) against the salary vouchers · employer's NI term ${check.term.label}, paid ${dayLabel(check.term.due)}`}
      footer={
        <>
          2600 and 2770 hold the withholding and employer&apos;s NI until the term is paid on{" "}
          {dayLabel(check.term.due)}; 2940 and 2780 the holiday pay earned this year. Each should
          match the a-meldinger behind it.
          {reopened
            ? " Salary corrections for this month are paid in the current run and periodised back. See Payroll."
            : ""}
        </>
      }
    >
      <FramePanel className="p-0">
        <Head>
          <span className="min-w-0 flex-1">Account</span>
          <span className="w-28 shrink-0 text-right">A-melding</span>
          <span className="w-28 shrink-0 text-right">Ledger</span>
          <span className="w-28 shrink-0 text-right">Difference</span>
          <span className="hidden w-32 shrink-0 text-right lg:block">Trial balance {asOf(month)}</span>
        </Head>
        {check.rows.map((row, index) => (
          <div key={row.account}>
            {index > 0 ? <Separator className="opacity-60" /> : null}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-foreground truncate text-sm">
                  <span className="tabular-nums">{row.account}</span> {row.name}
                </span>
                <span className="text-muted-foreground truncate text-xs">{row.basis}</span>
              </div>
              <Amount value={row.reported} />
              <Amount value={row.ledger} />
              <Amount
                value={signed(row.difference)}
                tone={row.difference ? (status.open ? "warning" : "muted") : "muted"}
              />
              <div className="hidden w-32 shrink-0 flex-col items-end gap-px lg:flex">
                <span className="text-foreground text-sm tabular-nums">
                  {row.balance === undefined ? "–" : formatAmount(row.balance)}
                </span>
                <span className="text-muted-foreground truncate text-right text-[11px] leading-4">
                  {row.balanceNote ?? "Cost, compared by month"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </FramePanel>
      <Findings findings={check.findings} locked={locked} />
    </SectionFrame>
  )
}

// ── Suppliers and customers ──

export function LedgersReconciliation({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const month = state.month
  const { status, locked } = useSection(clientId, "ledgers")
  if (!status.applicable) {
    return <Empty title={`Ledgers · ${monthName(month)}`}>Nothing to reconcile for this month.</Empty>
  }
  const check = ledgersCheck(state, clientId, month)
  return (
    <SectionFrame
      clientId={clientId}
      section="ledgers"
      title={`Suppliers and customers · ${monthName(month)}`}
      description={`The supplier ledger against 2400 and the customer ledger against 1500, at ${asOf(month)}`}
      footer="Every open invoice should add up to its account on the trial balance. A difference is something posted to the account without a supplier or customer, or the other way round."
    >
      {check.accounts.map((account) => (
        <FramePanel key={account.account} className="p-0">
          <Head>
            <span className="min-w-0 flex-1">
              {account.subledgerName} · {account.account} {account.name}
            </span>
            <span className="w-28 shrink-0 text-right">Open</span>
          </Head>
          {account.lines.map((line, index) => {
            const row = (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-px text-left">
                  <span className="text-foreground truncate text-sm">{line.label}</span>
                  <span className="text-muted-foreground truncate text-xs">{line.detail}</span>
                </div>
                <Amount value={line.amount} />
              </>
            )
            return (
              <div key={`${line.label}-${index}`}>
                {index > 0 ? <Separator className="opacity-60" /> : null}
                {line.itemId ? (
                  <button
                    type="button"
                    className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 transition-colors duration-150"
                    onClick={() => dispatch({ type: "open_item", id: line.itemId!, nav: [line.itemId!] })}
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2">{row}</div>
                )}
              </div>
            )
          })}
          <Separator />
          <Totals
            rows={[
              { label: account.subledgerName, value: account.subledger },
              { label: `Trial balance, ${account.account}`, value: account.balance },
            ]}
            difference={account.difference}
            open={status.open > 0}
          />
        </FramePanel>
      ))}
      <AwaitedCreditNotes clientId={clientId} />
      <Findings findings={check.findings} locked={locked} />
    </SectionFrame>
  )
}

/** Credit notes the firm asked suppliers for: the rejected invoice sits on
    2400 until one comes, and that is known, not a difference to hunt. */
function AwaitedCreditNotes({ clientId }: { clientId: string }) {
  const { state, dispatch } = useAccounting()
  const awaited = awaitedCreditNotes(state, clientId)
  if (!awaited.length) return null
  return (
    <FramePanel className="p-0">
      <Head>
        <span className="min-w-0 flex-1">Waiting on a credit note · open on 2400 on purpose</span>
        <span className="w-28 shrink-0 text-right">Open</span>
      </Head>
      {awaited.map((a, index) => (
        <div key={a.item.id}>
          {index > 0 ? <Separator className="opacity-60" /> : null}
          <button
            type="button"
            className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 transition-colors duration-150"
            onClick={() => dispatch({ type: "open_item", id: a.item.id, nav: [a.item.id] })}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-px text-left">
              <span className="text-foreground truncate text-sm">{a.item.title}</span>
              <span className="text-muted-foreground truncate text-xs">
                {a.decidedBy?.split(" ")[0] ?? "The customer"} rejected it · you asked{" "}
                {supplierShort(a.item.title)} for a credit note
                {a.settlement ? ` ${stampLabel(a.settlement.at)}` : ""} · not paid until it comes
              </span>
            </div>
            <Amount value={a.item.amount} />
          </button>
        </div>
      ))}
    </FramePanel>
  )
}

function Totals({
  rows,
  difference,
  open,
}: {
  rows: { label: string; value: number }[]
  difference: number
  open: boolean
}) {
  return (
    <div className="bg-muted/20 flex flex-col gap-1 px-3 py-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-muted-foreground min-w-0 flex-1 text-sm">{r.label}</span>
          <Amount value={r.value} />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <span className="text-foreground min-w-0 flex-1 text-sm font-medium">Difference</span>
        <Amount
          value={difference ? signed(difference) : "None"}
          tone={difference ? (open ? "warning" : "muted") : "strong"}
          className="font-medium"
        />
      </div>
    </div>
  )
}

// ── VAT ──

const VAT_STATE: Record<"filed" | "drafted" | "so_far", string> = {
  filed: "Filed",
  drafted: "Drafted",
  so_far: "Term running",
}

export function VatReconciliation({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const month = state.month
  const { status } = useSection(clientId, "vat")
  if (!status.applicable) {
    return (
      <Empty title={`VAT · ${monthName(month)}`}>
        VAT returns for {CLIENT_BY_ID.get(clientId)?.name} aren&apos;t part of our work, so
        there is nothing to reconcile here.
      </Empty>
    )
  }
  const check = vatCheck(state, clientId, month)
  const late = check.rows.filter((r) => r.late > 0)
  return (
    <SectionFrame
      clientId={clientId}
      section="vat"
      title={`VAT · ${monthName(month)}`}
      description={`The VAT accounts (2700–2740) against every return not paid at ${asOf(month)}`}
      footer="The agent drafts each return from the VAT accounts, so a draft always matches. A return already filed differs when something was booked into its term afterwards: that needs a corrected return."
    >
      <FramePanel className="p-0">
        <Head>
          <span className="min-w-0 flex-1">Return</span>
          <span className="w-28 shrink-0 text-right">VAT accounts</span>
          <span className="w-28 shrink-0 text-right">Return</span>
          <span className="w-28 shrink-0 text-right">Difference</span>
        </Head>
        {check.rows.map((row, index) => (
          <div key={row.id}>
            {index > 0 ? <Separator className="opacity-60" /> : null}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-foreground truncate text-sm">{row.label}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {VAT_STATE[row.state]}
                  {row.due ? ` · due ${dayLabel(row.due)}` : ""}
                  {row.late
                    ? ` · ${row.late} ${row.late === 1 ? "invoice" : "invoices"} booked after filing`
                    : ""}
                </span>
              </div>
              <Amount value={row.ledger} />
              <Amount value={row.filed} />
              <Amount value={signed(row.difference)} tone={row.difference ? "warning" : "muted"} />
            </div>
          </div>
        ))}
        <Separator />
        <Totals
          rows={[
            { label: "VAT accounts, all open returns", value: check.ledger },
            { label: "Trial balance, 2700–2740", value: check.balance },
          ]}
          difference={check.balance - check.ledger}
          open
        />
      </FramePanel>
      {late.length ? (
        <FramePanel className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <p className="text-muted-foreground text-xs text-pretty">
            {late.map((r) => r.label.split(" · ")[0]).join(" and ")} needs a corrected return for
            what was booked into it after it was filed.
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/clients/${clientId}/filings`} />}
          >
            Corrected return in Filings
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </FramePanel>
      ) : null}
    </SectionFrame>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>{title}</FrameTitle>
      </FrameHeader>
      <FramePanel>
        <p className="text-muted-foreground text-sm text-pretty">{children}</p>
      </FramePanel>
    </Frame>
  )
}
