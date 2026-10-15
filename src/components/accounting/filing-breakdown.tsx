"use client"

// The number a filing sends, and where it comes from. A side sheet opened
// from the filing's amount: the total as a sum, then each MVA-melding post
// with its months and ledger accounts, the late invoices, and the months it
// was built from. Submitting starts here, so the number is seen before it
// goes to Skatteetaten.
import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"
import {
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { MONTHS } from "@/lib/accounting/data"
import {
  filingBreakdown,
  type FilingBreakdown,
  type TaxBreakdown,
  type VatBreakdown,
  type VatPost,
} from "@/lib/accounting/filing-breakdown"
import { formatVatAmount, needsAction, type Filing } from "@/lib/accounting/filings"
import { longMonth } from "@/lib/accounting/report"
import { isMonthClosed } from "@/lib/accounting/signoffs"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate } from "./meta"

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })
const kr = (v: number) => `${v < 0 ? "−" : ""}${nok.format(Math.abs(v))} kr`
const pct = (rate: number) => `${Math.round(rate * 100)}%`

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1.5">
      <h3 className="text-foreground text-xs font-semibold tracking-wide uppercase">{children}</h3>
      {aside ? <span className="text-muted-foreground text-xs">{aside}</span> : null}
    </div>
  )
}

/** The return as a sum, top to bottom, ending in what goes to Skatteetaten. */
function Sum({ rows }: { rows: { label: string; amount: number; strong?: boolean; muted?: boolean }[] }) {
  return (
    <dl className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3 text-sm">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-4",
            row.strong && "text-foreground border-t pt-1.5 font-semibold",
            row.muted && "text-muted-foreground text-xs",
            i === rows.length - 1 && "text-base"
          )}
        >
          <dt>{row.label}</dt>
          <dd className="tabular-nums">{kr(row.amount)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One MVA-melding post. Opens to its months and the accounts behind it. */
function PostRow({ post, sign }: { post: VatPost; sign: 1 | -1 }) {
  return (
    <details className="group/post border-b last:border-b-0">
      <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="text-muted-foreground size-3.5 shrink-0 transition-[rotate] duration-150 group-open/post:rotate-90"
          aria-hidden="true"
        />
        <Badge variant="outline" size="sm" className="w-8 shrink-0 justify-center tabular-nums">
          {post.code}
        </Badge>
        <span className="text-foreground min-w-0 flex-1 truncate">{post.label}</span>
        <span className="text-muted-foreground hidden w-28 text-right text-xs tabular-nums sm:block">
          {nok.format(post.basis)} × {pct(post.rate)}
        </span>
        <span className="text-foreground w-24 shrink-0 text-right tabular-nums">
          {kr(sign * post.vat)}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pt-1 pb-3 ps-9 text-xs">
        <table className="w-full">
          <caption className="text-muted-foreground pb-1 text-left">By month</caption>
          <thead className="sr-only">
            <tr>
              <th>Month</th>
              <th>Basis</th>
              <th>VAT</th>
            </tr>
          </thead>
          <tbody>
            {post.months.map((row) => (
              <tr key={row.month}>
                <td className="text-foreground py-0.5">{longMonth(row.month)}</td>
                <td className="text-muted-foreground py-0.5 text-right tabular-nums">
                  {nok.format(row.basis)} kr basis
                </td>
                <td className="text-foreground w-24 py-0.5 text-right tabular-nums">{kr(sign * row.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full">
          <caption className="text-muted-foreground pb-1 text-left">From the ledger</caption>
          <thead className="sr-only">
            <tr>
              <th>Account</th>
              <th>Basis</th>
              <th>VAT</th>
            </tr>
          </thead>
          <tbody>
            {post.sources.map((source) => (
              <tr key={source.account}>
                <td className="text-foreground py-0.5">
                  <span className="text-muted-foreground tabular-nums">{source.account}</span>{" "}
                  {source.label}
                </td>
                <td className="text-muted-foreground py-0.5 text-right tabular-nums">
                  {nok.format(source.basis)} kr
                </td>
                <td className="text-foreground w-24 py-0.5 text-right tabular-nums">{kr(sign * source.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Posts({ title, posts, sign, total }: { title: string; posts: VatPost[]; sign: 1 | -1; total: number }) {
  if (!posts.length) return null
  return (
    <section>
      <SectionTitle aside={kr(sign * total)}>{title}</SectionTitle>
      <div className="overflow-hidden rounded-lg border">
        <div className="text-muted-foreground bg-muted/30 flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-medium">
          <span className="w-3.5" />
          <span className="w-8">Post</span>
          <span className="flex-1">What</span>
          <span className="hidden w-28 text-right sm:block">Basis × rate</span>
          <span className="w-24 text-right">VAT</span>
        </div>
        {posts.map((post) => (
          <PostRow key={post.code} post={post} sign={sign} />
        ))}
      </div>
    </section>
  )
}

/** The months the figures come from, and whether each is closed. A month
    in the working range opens its monthly report. */
function Provenance({ breakdown }: { breakdown: VatBreakdown }) {
  const { state, dispatch } = useAccounting()
  const router = useRouter()
  const working = new Set(MONTHS.map((m) => m.id))
  return (
    <section>
      <SectionTitle>Built from</SectionTitle>
      <ul className="flex flex-col gap-1.5 text-xs">
        {breakdown.months.map((month) => {
          const closed =
            month < MONTHS.at(-1)!.id || isMonthClosed(breakdown.client.id, month, state)
          return (
            <li key={month} className="flex items-center justify-between gap-3">
              <span className="text-foreground inline-flex items-center gap-1.5">
                <span
                  className={cn("size-1.5 rounded-full", closed ? "bg-success" : "bg-warning")}
                  aria-hidden="true"
                />
                {longMonth(month)} {month.slice(0, 4)}
                <span className="text-muted-foreground">
                  · {closed ? "closed and reconciled" : "still open"}
                </span>
              </span>
              {working.has(month) ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    dispatch({ type: "set_month", month })
                    router.push(`/clients/${breakdown.client.id}/report`)
                  }}
                >
                  Monthly report
                </Button>
              ) : null}
            </li>
          )
        })}
        <li className="text-muted-foreground pt-1 text-pretty">
          Sales and purchases come from the general ledger in Tripletex, the VAT code on every
          voucher deciding the post. Purchases deduct 25% of their price before VAT.
        </li>
      </ul>
    </section>
  )
}

function VatBody({ breakdown, onOpenItem }: { breakdown: VatBreakdown; onOpenItem: (id: string) => void }) {
  const { filing, correction } = breakdown
  const estimate = filing.status === "in_progress"
  const rows = correction
    ? [
        { label: "Return as filed", amount: correction.filed },
        ...(correction.late
          ? [
              {
                label: `Late ${breakdown.late.filter((l) => !l.corrected).length === 1 ? "invoice" : "invoices"}, input VAT`,
                amount: correction.late,
              },
            ]
          : []),
        ...(correction.fixed
          ? [
              {
                label: `Input VAT taken back, ${breakdown.fixes.filter((l) => !l.corrected).map((l) => l.item.title).filter((t, i, a) => a.indexOf(t) === i).join(", ")}`,
                amount: correction.fixed,
              },
            ]
          : []),
        { label: "Corrected return", amount: correction.filed + correction.change, strong: true },
        { label: "Change to pay or reclaim now", amount: correction.change, strong: true },
      ]
    : [
        { label: "VAT on sales", amount: breakdown.outputVat },
        { label: "VAT on purchases", amount: -breakdown.inputVat },
        ...(breakdown.late.length ? [{ label: "Late invoices booked into the term", amount: -breakdown.lateVat }] : []),
        ...(breakdown.rounding ? [{ label: "Rounding to whole kroner", amount: breakdown.rounding, muted: true }] : []),
        {
          label: estimate
            ? "So far"
            : breakdown.total >= 0
              ? "To pay Skatteetaten"
              : "To get back from Skatteetaten",
          amount: breakdown.total,
          strong: true,
        },
      ]

  return (
    <div className="flex flex-col gap-6">
      {breakdown.openMonths.length ? (
        <p className="border-warning/40 bg-warning/5 text-warning-text flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-pretty">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {breakdown.openMonths.map((m) => longMonth(m)).join(" and ")}{" "}
          {breakdown.openMonths.length === 1 ? "isn't" : "aren't"} closed yet: these figures move until{" "}
          {breakdown.openMonths.length === 1 ? "it closes" : "they close"}.
        </p>
      ) : null}
      <Sum rows={rows} />
      <Posts title="VAT on sales" posts={breakdown.output} sign={1} total={breakdown.outputVat} />
      <Posts title="VAT on purchases" posts={breakdown.input} sign={-1} total={breakdown.inputVat} />
      {!breakdown.output.length && !breakdown.input.length ? (
        <p className="text-muted-foreground text-sm text-pretty">
          No VAT on sales and none to deduct: the business is outside the VAT act.
        </p>
      ) : null}
      {breakdown.late.length ? (
        <section>
          <SectionTitle aside={kr(-breakdown.lateVat)}>Late invoices booked into the term</SectionTitle>
          <ul className="overflow-hidden rounded-lg border">
            {breakdown.late.map((line) => (
              <li key={line.item.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenItem(line.item.id)}
                  className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <FileTextIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-foreground truncate">{line.item.title}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      Dated {formatDate(line.item.date)} · {nok.format(Math.abs(line.item.amount))} kr incl. VAT
                      {line.corrected ? " · in the corrected return" : ""}
                    </span>
                  </span>
                  <span className="text-foreground w-24 shrink-0 text-right tabular-nums">{kr(-line.vat)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Provenance breakdown={breakdown} />
    </div>
  )
}

function TaxBody({ breakdown }: { breakdown: TaxBreakdown }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>From profit to tax</SectionTitle>
        <dl className="flex flex-col overflow-hidden rounded-lg border text-sm">
          {breakdown.steps.map((step) => (
            <div
              key={step.label}
              className={cn(
                "flex items-baseline justify-between gap-4 border-b px-3 py-2 last:border-b-0",
                step.strong && "bg-muted/30 font-medium"
              )}
            >
              <dt className="flex min-w-0 flex-col">
                <span className="text-foreground">{step.label}</span>
                {step.detail ? <span className="text-muted-foreground text-xs">{step.detail}</span> : null}
              </dt>
              <dd className="text-foreground tabular-nums">{kr(step.amount)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Sum
        rows={[
          { label: breakdown.total >= 0 ? "Left to pay" : "Back from Skatteetaten", amount: breakdown.total, strong: true },
        ]}
      />
      <p className="text-muted-foreground text-xs text-pretty">
        From the {breakdown.year} ledger in Tripletex
        {breakdown.client.id === "fjellstua" ? ", with the balance imported at onboarding" : ""}. The
        annual accounts use the same profit and loss.
      </p>
    </div>
  )
}

/** What the filing row shows as its number, and what the sheet adds up to. */
export function breakdownTotal(breakdown: FilingBreakdown) {
  if (breakdown.kind === "tax") return breakdown.total
  return breakdown.correction ? breakdown.correction.change : breakdown.total
}

/** One sheet per list, opened by whichever row asked. */
export function useFilingBreakdown(onSubmit: (filing: Filing) => void) {
  const { state, dispatch } = useAccounting()
  const [filing, setFiling] = useState<Filing | null>(null)
  // Keep the last one while the sheet animates out.
  const [shown, setShown] = useState<Filing | null>(null)
  if (filing && filing !== shown) setShown(filing)
  const breakdown = shown ? filingBreakdown(shown, state.items, state) : undefined
  const due = shown
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(shown.due))
    : ""

  const sheet = (
    <Sheet open={Boolean(filing)} onOpenChange={(open) => !open && setFiling(null)}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {shown && breakdown ? (
          <>
            <SheetHeader className="border-b pe-12">
              <SheetTitle>
                {shown.correction ? "Corrected " : ""}
                {shown.name} {shown.period}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {breakdown.client.name} · due {due} ·{" "}
                {shown.status === "submitted"
                  ? "as submitted"
                  : shown.status === "ready"
                    ? "drafted by the agent, not submitted"
                    : "in progress"}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {breakdown.kind === "vat" ? (
                <VatBody
                  breakdown={breakdown}
                  onOpenItem={(id) => {
                    setFiling(null)
                    dispatch({ type: "open_item", id, nav: breakdown.late.map((l) => l.item.id) })
                  }}
                />
              ) : (
                <TaxBody breakdown={breakdown} />
              )}
            </div>
            <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  toast.message("Draft return", {
                    description: `In the product this downloads ${shown.name} ${shown.period} as filed in Altinn, with every voucher behind each post.`,
                  })
                }
              >
                <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                PDF with vouchers
              </Button>
              {needsAction(shown) ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const target = shown
                    setFiling(null)
                    onSubmit(target)
                  }}
                >
                  <SendIcon data-icon="inline-start" aria-hidden="true" />
                  {shown.correction ? "Submit correction" : "Submit"}
                  {shown.kind === "mva" ? ` · ${formatVatAmount(breakdownTotal(breakdown)).toLowerCase()}` : ""}
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )

  return { open: setFiling, sheet }
}
