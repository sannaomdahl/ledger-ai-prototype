"use client"

// The monthly report, as the customer reads it: the accountant's note, four
// numbers, the sales trend, what the agent noticed, where the money went and
// what leaves the account next. Shared by the customer's app and the
// accountant's preview, so the accountant sends exactly what they saw.
// Colour carries identity only: sales in one blue (the month in view full,
// the five before it faded), and each cost in its own palette slot.
import type { ReactNode } from "react"
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { cn } from "cn"
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  CircleAlertIcon,
  MinusIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react"
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  formatKr,
  longMonth,
  bookkeepingTips,
  recurringCosts,
  shortMonth,
  type Highlight,
  type MonthlyReport,
  type RecurringCost,
} from "@/lib/accounting/report"
import { useAccounting } from "@/lib/accounting/store"
import type { Person } from "@/lib/accounting/types"

const compact = new Intl.NumberFormat("nb-NO", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const formatDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
})

function day(iso: string) {
  return formatDay.format(new Date(`${iso}T00:00:00`))
}

// ── Pieces ──

function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Frame dense spacing="sm" className={cn("w-full", className)}>
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <FrameTitle>{title}</FrameTitle>
        {aside}
      </FrameHeader>
      <FramePanel>{children}</FramePanel>
    </Frame>
  )
}

/** "+8% vs Aug", with the arrow and colour saying whether that's good. */
function Delta({
  now,
  before,
  month,
  upIsGood = true,
}: {
  now: number
  before: number
  month: string
  upIsGood?: boolean
}) {
  const change = before ? (now - before) / Math.abs(before) : 0
  const flat = Math.abs(change) < 0.01
  // From or to a loss a percentage says nothing: show last month instead.
  const crossed = before <= 0 || now <= 0
  const good = change > 0 === upIsGood
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      {flat ? (
        <MinusIcon className="size-3.5" aria-hidden="true" />
      ) : change > 0 ? (
        <ArrowUpRightIcon
          className={cn(
            "size-3.5",
            good ? "text-success-text" : "text-destructive",
          )}
          aria-hidden="true"
        />
      ) : (
        <ArrowDownRightIcon
          className={cn(
            "size-3.5",
            good ? "text-success-text" : "text-destructive",
          )}
          aria-hidden="true"
        />
      )}
      <span className="tabular-nums">
        {crossed
          ? `vs ${compact.format(before)} kr in ${shortMonth(month)}`
          : `${flat ? "Same as" : `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% vs`} ${shortMonth(month)}`}
      </span>
    </span>
  )
}

function Numbers({ report }: { report: MonthlyReport }) {
  const { current, previous } = report
  const tiles = [
    {
      label: "Sales",
      value: current.sales,
      before: previous.sales,
      hint: "What customers paid you, before VAT",
    },
    {
      label: "Costs",
      value: current.totalCosts,
      before: previous.totalCosts,
      upIsGood: false,
      hint: "Salaries, goods, rent and the rest",
    },
    {
      label: "Profit",
      value: current.profit,
      before: previous.profit,
      hint: `${Math.round(current.margin * 100)} kr of every 100 kr in sales`,
    },
    {
      label: "In the bank",
      value: current.cash,
      before: previous.cash,
      hint: `On ${day(`${report.month}-${lastDay(report.month)}`)}`,
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="bg-card flex min-w-0 flex-col gap-1 rounded-xl border p-4 shadow-xs"
        >
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-foreground truncate text-xl font-semibold tracking-tight tabular-nums">
            {compact.format(tile.value)} kr
          </dd>
          <dd>
            <Delta
              now={tile.value}
              before={tile.before}
              month={previous.month}
              upIsGood={tile.upIsGood}
            />
          </dd>
          <dd className="text-muted-foreground text-xs text-pretty">
            {tile.hint}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function lastDay(period: string) {
  const [y, m] = period.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

const chartConfig = {
  sales: { label: "Sales", color: "var(--series-1)" },
} satisfies ChartConfig

type TrendRow = { month: string; name: string; sales: number; profit: number }

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: TrendRow }[]
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="bg-popover text-popover-foreground flex min-w-36 flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md">
      <span className="font-medium">{longMonth(row.month)}</span>
      <span className="flex justify-between gap-4">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-[2px] bg-(--series-1)"
            aria-hidden="true"
          />
          Sales
        </span>
        <span className="tabular-nums">{formatKr(row.sales)}</span>
      </span>
      <span className="flex justify-between gap-4">
        <span className="text-muted-foreground">Profit</span>
        <span className="tabular-nums">{formatKr(row.profit)}</span>
      </span>
    </div>
  )
}

/** Six months of sales; the month in view in full ink, the rest recede. */
function Trend({ report }: { report: MonthlyReport }) {
  const data: TrendRow[] = report.trend.map((f) => ({
    month: f.month,
    name: shortMonth(f.month),
    sales: f.sales,
    profit: f.profit,
  }))
  return (
    <Section
      title="Sales, last 6 months"
      aside={
        <span className="text-muted-foreground text-xs">
          Hover a month for profit
        </span>
      }
    >
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-44 w-full text-(--series-1)"
      >
        <BarChart
          data={data}
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="28%"
        >
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            width={60}
            tickLine={false}
            axisLine={false}
            tickCount={3}
            tickFormatter={(v: number) => compact.format(v)}
          />
          <ChartTooltip
            cursor={{ fillOpacity: 0.5 }}
            content={<TrendTooltip />}
          />
          <Bar dataKey="sales" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={row.month}
                // SVG attributes can't read CSS variables; the container's
                // text colour carries the ink.
                fill="currentColor"
                fillOpacity={row.month === report.month ? 1 : 0.28}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {/* The same six months as text, for screen readers and exact values. */}
      <table className="sr-only">
        <caption>Sales and profit by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Sales</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <td>{longMonth(row.month)}</td>
              <td>{formatKr(row.sales)}</td>
              <td>{formatKr(row.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

const HIGHLIGHT_ICON: Record<Highlight["tone"], ReactNode> = {
  good: <TrendingUpIcon className="text-success-text" aria-hidden="true" />,
  watch: <CircleAlertIcon className="text-warning-text" aria-hidden="true" />,
  neutral: <MinusIcon className="text-muted-foreground" aria-hidden="true" />,
}

function Highlights({ report }: { report: MonthlyReport }) {
  const { state } = useAccounting()
  // What the bookkeeping cost them that they could avoid, after the numbers.
  const tips = bookkeepingTips(state.items, report.client.id, report.month)
  return (
    <Section
      title="What we noticed"
      aside={
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <SparklesIcon className="size-3.5" aria-hidden="true" />
          From your books
        </span>
      }
    >
      <ul className="flex flex-col gap-3">
        {[...report.highlights, ...tips].map((h) => (
          <li key={h.text} className="flex gap-2.5 text-sm leading-5">
            <span className="mt-0.5 shrink-0 [&_svg]:size-4">
              {HIGHLIGHT_ICON[h.tone]}
            </span>
            <span className="text-foreground text-pretty">{h.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Each cost keeps its colour whatever its rank this month. Slots 1–4 of
    the categorical palette, validated for colour-blind separation. */
const COST_COLOR: Record<keyof MonthlyReport["current"]["costs"], string> = {
  staff: "var(--series-1)",
  goods: "var(--series-2)",
  rent: "var(--series-3)",
  other: "var(--series-4)",
}

const COST_ORDER = Object.keys(COST_COLOR) as (keyof typeof COST_COLOR)[]

function Costs({ report }: { report: MonthlyReport }) {
  return (
    <Section
      title="Where the money went"
      aside={
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatKr(report.current.totalCosts)}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {/* The whole month's costs as one bar, a 2px gap between parts.
            Parts stay in palette order so neighbours are always the pairs
            validated to stay apart; the list below is sorted by size. */}
        <div className="flex h-2.5 gap-0.5" aria-hidden="true">
          {[...report.costs]
            .sort(
              (a, b) => COST_ORDER.indexOf(a.key) - COST_ORDER.indexOf(b.key),
            )
            .map((line) => (
              <span
                key={line.key}
                className="h-full min-w-1 rounded-[3px]"
                style={{
                  flexGrow: line.share,
                  background: COST_COLOR[line.key],
                }}
              />
            ))}
        </div>
        <ul className="flex flex-col gap-2.5">
          {report.costs.map((line) => (
            <li key={line.key} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: COST_COLOR[line.key] }}
                aria-hidden="true"
              />
              <span className="text-foreground min-w-0 flex-1 truncate">
                {line.label}
              </span>
              <span className="text-foreground shrink-0 tabular-nums">
                {formatKr(line.amount)}
              </span>
              <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                {Math.round(line.share * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function Row({
  icon,
  title,
  detail,
  value,
}: {
  icon: ReactNode
  title: string
  detail: ReactNode
  value?: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <IconTile variant="outline" size="sm" className="text-muted-foreground">
        {icon}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs text-pretty">
          {detail}
        </span>
      </div>
      {value ? (
        <span className="text-foreground shrink-0 text-sm tabular-nums">
          {value}
        </span>
      ) : null}
    </div>
  )
}

function MoneyInOut({ report }: { report: MonthlyReport }) {
  const { salesDetail, payroll } = report
  return (
    <Section title="Money in and out">
      <div className="flex flex-col gap-4">
        {salesDetail.kind === "pos" ? (
          <Row
            icon={<BanknoteIcon aria-hidden="true" />}
            title={`${new Intl.NumberFormat("nb-NO").format(salesDetail.transactions)} sales at the counter`}
            detail={`About ${formatKr(salesDetail.averageTicket)} each, settled to your account`}
            value={formatKr(report.current.sales)}
          />
        ) : (
          <Row
            icon={<BanknoteIcon aria-hidden="true" />}
            title={`${salesDetail.sent} ${salesDetail.sent === 1 ? "invoice" : "invoices"} sent`}
            detail={
              <>
                {formatKr(salesDetail.outstanding)} not paid yet at month end
                {salesDetail.overdue.count ? (
                  <>
                    {" · "}
                    <span className="text-foreground font-medium">
                      {salesDetail.overdue.count} overdue
                    </span>
                  </>
                ) : null}
              </>
            }
            value={formatKr(report.current.sales)}
          />
        )}
        {payroll.people > 0 ? (
          <Row
            icon={<UsersIcon aria-hidden="true" />}
            title={`Salaries paid on ${day(payroll.paidOn)}`}
            detail={`${payroll.people} people, after tax. With tax and holiday pay: ${formatKr(report.current.costs.staff)}`}
            value={formatKr(payroll.amount)}
          />
        ) : null}
      </div>
    </Section>
  )
}

/** "+12%", "−8%", "Same" or "10× August": how much a running cost moved. */
function changeLabel(cost: RecurringCost, before: string) {
  const ratio = cost.now / cost.before
  if (ratio >= 2.5) return `${Math.round(ratio)}× ${longMonth(before)}`
  if (Math.abs(cost.change) < 0.01) return "Same"
  return `${cost.change > 0 ? "+" : "−"}${Math.abs(Math.round(cost.change * 100))}%`
}

/** The suppliers paid every month, this month next to last: the low-effort
    way to see what the office, power or phone cost, and what changed. */
function RecurringCosts({ report }: { report: MonthlyReport }) {
  const { state } = useAccounting()
  const costs = recurringCosts(state.items, report.client.id, report.month)
  if (!costs.length) return null
  const before = report.previous.month
  // A quarter up or down is worth a word; less is the usual wobble.
  const moved = costs.filter((c) => Math.abs(c.change) >= 0.25)
  return (
    <Section
      title="Recurring costs"
      aside={
        <span className="text-muted-foreground text-xs">
          {moved.length
            ? `${moved.length} changed since ${longMonth(before)}`
            : `Same suppliers as ${longMonth(before)}`}
        </span>
      }
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Suppliers paid every month, {longMonth(report.month)} against {longMonth(before)}
        </caption>
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th scope="col" className="pb-2 text-left font-normal">
              Supplier
            </th>
            <th scope="col" className="hidden pb-2 text-right font-normal @md/report:table-cell">
              {shortMonth(before)}
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              {shortMonth(report.month)}
            </th>
            <th scope="col" className="w-24 pb-2 text-right font-normal">
              <span className="sr-only">Change</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {costs.map((cost) => {
            const big = Math.abs(cost.change) >= 0.25
            return (
              <tr key={cost.supplier}>
                <td className="py-2 pr-3">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate">{cost.supplier}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {cost.what}
                      <span className="@md/report:hidden">
                        {" "}
                        · {formatKr(cost.before)} in {shortMonth(before)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="text-muted-foreground hidden py-2 text-right tabular-nums @md/report:table-cell">
                  {formatKr(cost.before)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    big ? "text-foreground font-semibold" : "text-foreground"
                  )}
                >
                  {formatKr(cost.now)}
                </td>
                <td className="py-2 pl-2 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                      !big
                        ? "text-muted-foreground"
                        : cost.change > 0
                          ? "bg-warning/10 text-warning-foreground dark:text-warning"
                          : "bg-success/10 text-success-text"
                    )}
                  >
                    {changeLabel(cost, before)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}

function ComingUp({ report }: { report: MonthlyReport }) {
  if (!report.upcoming.length) return null
  // Refunds (negative) come in; the total is what goes out.
  const total = report.upcoming.reduce(
    (sum, u) => sum + Math.max(u.amount, 0),
    0,
  )
  return (
    <Section
      title="Coming up"
      aside={
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatKr(total)} to pay
        </span>
      }
    >
      <ul className="flex flex-col divide-y">
        {report.upcoming.map((u) => (
          <li
            key={u.label}
            className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-muted-foreground w-14 shrink-0 text-xs tabular-nums">
              {day(u.date)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground text-sm">{u.label}</span>
              <span className="text-muted-foreground text-xs">{u.hint}</span>
            </span>
            <span
              className={cn(
                "shrink-0 text-sm tabular-nums",
                u.amount < 0 ? "text-success-text" : "text-foreground",
              )}
            >
              {u.amount < 0 ? `+${formatKr(-u.amount)}` : formatKr(u.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ── The report ──

/** The accountant's note, signed. `editor` replaces the text while drafting. */
export function ReportNote({
  note,
  author,
  meta,
  editor,
}: {
  note?: string
  author: Person
  meta?: ReactNode
  editor?: ReactNode
}) {
  return (
    <figure className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-xs">
      <figcaption className="text-muted-foreground flex items-center gap-2 text-xs">
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">
            {author.initials}
          </AvatarFallback>
        </Avatar>
        <span>
          <span className="text-foreground font-medium">{author.name}</span>,
          your accountant
        </span>
        {meta ? <span className="ms-auto">{meta}</span> : null}
      </figcaption>
      {editor ?? (
        <blockquote className="text-foreground text-[15px] leading-6 text-pretty whitespace-pre-line">
          {note}
        </blockquote>
      )}
    </figure>
  )
}

export function MonthlyReportView({
  report,
  note,
  noteSlot,
}: {
  report: MonthlyReport
  /** The note as published; `noteSlot` replaces the whole note block. */
  note?: ReactNode
  noteSlot?: ReactNode
}) {
  return (
    // Sized by its own width: a narrow column in the customer's app, a wide
    // one in the accountant's preview.
    <div
      className={cn(
        "@container/report flex min-w-0 flex-col gap-4",
        // Categorical palette, light and dark steps of the same hues.
        "[--series-1:#2a78d6] [--series-2:#eb6834] [--series-3:#1baf7a] [--series-4:#eda100]",
        "dark:[--series-1:#3987e5] dark:[--series-2:#d95926] dark:[--series-3:#199e70] dark:[--series-4:#c98500]",
      )}
    >
      {noteSlot ?? note}
      <Numbers report={report} />
      <Trend report={report} />
      <div className="grid min-w-0 gap-4 @xl/report:grid-cols-2">
        <Highlights report={report} />
        <Costs report={report} />
      </div>
      <RecurringCosts report={report} />
      <div className="grid min-w-0 gap-4 @2xl/report:grid-cols-2">
        <MoneyInOut report={report} />
        <ComingUp report={report} />
      </div>
    </div>
  )
}
