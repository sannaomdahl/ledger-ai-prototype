"use client"

// Where the business stands at a month end: the overview an owner reads
// (cash, stock, the loan, what's owed either way) and the same numbers line
// by line, month by month, the way an accountant reads a trial balance.
// Shared by the accountant's Balances tab and the customer's app.
import type { ReactNode } from "react"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import { ArrowDownRightIcon, ArrowUpRightIcon, CheckIcon, MinusIcon } from "lucide-react"

import {
  GROUP_LABEL,
  GROUP_SIDE,
  loanBalance,
  loanMonthsLeft,
  sumGroup,
  sumSide,
  type BalanceGroup,
  type BalanceSheet,
} from "@/lib/accounting/balance"
import { monthLabel } from "@/lib/accounting/data"
import { core, formatKr, longMonth, shortMonth } from "@/lib/accounting/report"

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

function lastDayLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `${new Date(y, m, 0).getDate()} ${shortMonth(month)}`
}

/** The column for `month`, or the latest one. */
export function monthIndex(sheet: BalanceSheet, month: string) {
  const index = sheet.months.indexOf(month)
  return index < 0 ? sheet.months.length - 1 : index
}

// ── Pieces ──

/** One bar per month, the month in view in full ink. */
function MiniBars({
  values,
  active,
  label,
}: {
  values: number[]
  active: number
  label: string
}) {
  const max = Math.max(...values.map((v) => Math.max(v, 0)), 1)
  return (
    <div
      className="flex h-8 items-end gap-[3px] text-(--series-1)"
      role="img"
      aria-label={label}
    >
      {values.map((value, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-[2px] bg-current"
          style={{
            height: `${Math.max((Math.max(value, 0) / max) * 100, 4)}%`,
            opacity: i === active ? 1 : 0.28,
          }}
        />
      ))}
    </div>
  )
}

function Change({
  now,
  before,
  since,
  upIsGood = true,
}: {
  now: number
  before: number
  since: string
  upIsGood?: boolean
}) {
  const diff = now - before
  const flat = Math.abs(diff) < Math.max(Math.abs(before) * 0.01, 1000)
  const good = diff > 0 === upIsGood
  const Icon = flat ? MinusIcon : diff > 0 ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          !flat && (good ? "text-success-text" : "text-destructive")
        )}
        aria-hidden="true"
      />
      <span className="tabular-nums">
        {flat
          ? `Same as ${since}`
          : `${diff > 0 ? "+" : "−"}${nok.format(Math.abs(diff))} kr since ${since}`}
      </span>
    </span>
  )
}

function Tile({
  label,
  value,
  children,
}: {
  label: string
  value: number
  children?: ReactNode
}) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1.5 rounded-xl border p-4 shadow-xs">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground truncate text-xl font-semibold tracking-tight tabular-nums">
        {formatKr(value)}
      </dd>
      {children}
    </div>
  )
}

// ── Overview ──

export function BalanceTiles({ sheet, month }: { sheet: BalanceSheet; month: string }) {
  const i = monthIndex(sheet, month)
  const m = sheet.months[i]
  const jan = sheet.months[0]
  const bank = sheet.months.map((_, j) => sumGroup(sheet.lines, "bank", j))
  const stock = sheet.lines.find((l) => l.group === "stock")
  const loan = sheet.loan
  const loanLine = sheet.lines.find((l) => l.group === "longterm")
  const profit = sheet.lines.find((l) => l.account === "8800")!
  const prev = Math.max(i - 1, 0)
  const prevName = shortMonth(sheet.months[prev])

  // About how many weeks the stock lasts at next month's buying pace.
  const weeks = stock
    ? Math.round(
        (stock.amounts[i] /
          Math.max(core(sheet.client, sheet.months[Math.min(i + 1, sheet.months.length - 1)]).costs.goods, 1)) *
          4.3
      )
    : 0

  return (
    <dl className="grid grid-cols-2 gap-3 @3xl/balances:grid-cols-4">
      <Tile label="In the bank" value={bank[i]}>
        <dd>
          <Change now={bank[i]} before={bank[prev]} since={`end of ${prevName}`} />
        </dd>
        <dd className="mt-auto pt-1">
          <MiniBars values={bank} active={i} label={`Bank balance at each month end, January to ${longMonth(m)}`} />
        </dd>
      </Tile>
      {stock ? (
        <Tile label={`Inventory · ${stock.name.toLowerCase()}`} value={stock.amounts[i]}>
          <dd>
            <Change now={stock.amounts[i]} before={stock.amounts[0]} since="January" upIsGood={false} />
          </dd>
          <dd className="text-muted-foreground text-xs text-pretty">
            About {weeks} {weeks === 1 ? "week" : "weeks"} of buying, at cost
          </dd>
          <dd className="mt-auto pt-1">
            <MiniBars values={stock.amounts} active={i} label={`Inventory at each month end, January to ${longMonth(m)}`} />
          </dd>
        </Tile>
      ) : null}
      {loan && loanLine ? (
        <LoanTile sheet={sheet} index={i} />
      ) : (
        <Tile label="No loans" value={0}>
          <dd className="text-muted-foreground text-xs text-pretty">
            The company has no bank loans on its books.
          </dd>
        </Tile>
      )}
      <Tile label="Profit so far this year" value={profit.amounts[i]}>
        <dd className="text-muted-foreground text-xs text-pretty">
          1 January to {lastDayLabel(m)}, before tax
        </dd>
        <dd className="mt-auto pt-1">
          <MiniBars
            values={sheet.months.map((mm) => core(sheet.client, mm).profit)}
            active={i}
            label="Profit each month this year"
          />
        </dd>
      </Tile>
      {!stock ? (
        <Tile
          label="Customers who owe you"
          value={sheet.lines.find((l) => l.account === "1500")!.amounts[i]}
        >
          <dd>
            <Change
              now={sheet.lines.find((l) => l.account === "1500")!.amounts[i]}
              before={sheet.lines.find((l) => l.account === "1500")!.amounts[0]}
              since={shortMonth(jan)}
              upIsGood={false}
            />
          </dd>
        </Tile>
      ) : null}
    </dl>
  )
}

function LoanTile({ sheet, index }: { sheet: BalanceSheet; index: number }) {
  const loan = sheet.loan!
  const month = sheet.months[index]
  const left = loanBalance(loan, month)
  const months = loanMonthsLeft(loan, month)
  const repaid = 1 - left / loan.principal
  const interest = Math.round((left * loan.rate) / 12)
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1.5 rounded-xl border p-4 shadow-xs">
      <dt className="text-muted-foreground text-xs">Business loan left · {loan.lender}</dt>
      <dd className="text-foreground truncate text-xl font-semibold tracking-tight tabular-nums">
        {formatKr(left)}
      </dd>
      <dd className="text-foreground text-xs font-medium text-pretty">
        {months === 0
          ? "Paid off"
          : `${months} ${months === 1 ? "instalment" : "instalments"} left · paid off ${monthLabel(loan.lastMonth)}`}
      </dd>
      <dd className="text-muted-foreground text-xs text-pretty tabular-nums">
        {nok.format(loan.instalment)} kr a month plus about {nok.format(interest)} kr interest
      </dd>
      <dd className="mt-auto flex flex-col gap-1 pt-1">
        <span
          className="bg-muted h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(repaid * 100)}
          aria-label="Share of the loan repaid"
        >
          <span
            className="bg-(--series-1) block h-full rounded-full"
            style={{ width: `${Math.round(repaid * 100)}%` }}
          />
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {Math.round(repaid * 100)}% of {formatKr(loan.principal)} repaid
        </span>
      </dd>
    </div>
  )
}

const OWN: BalanceGroup[] = ["fixed", "stock", "receivables", "bank"]
const OWE: BalanceGroup[] = ["longterm", "shortterm", "equity"]

/** What the business owns and what it owes, group by group, with the
    lines behind each group one click away. */
export function OwnAndOwe({ sheet, month }: { sheet: BalanceSheet; month: string }) {
  const i = monthIndex(sheet, month)
  const prev = Math.max(i - 1, 0)
  const column = (title: string, groups: BalanceGroup[], total: number, hint: string) => (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>{title}</FrameTitle>
          <FrameDescription className="text-xs">{hint}</FrameDescription>
        </div>
        <span className="text-foreground text-sm font-semibold tabular-nums">{formatKr(total)}</span>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        {groups
          .filter((g) => sheet.lines.some((l) => l.group === g))
          .map((group) => {
            const lines = sheet.lines.filter((l) => l.group === group)
            const now = sumGroup(sheet.lines, group, i)
            const before = sumGroup(sheet.lines, group, prev)
            return (
              <details key={group} className="group/own">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm [&::-webkit-details-marker]:hidden">
                  <span className="text-foreground font-medium">{GROUP_LABEL[group]}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
                      {now === before ? "" : `${now > before ? "+" : "−"}${nok.format(Math.abs(now - before))}`}
                    </span>
                    <span className="text-foreground tabular-nums">{formatKr(now)}</span>
                  </span>
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5 border-s ps-3">
                  {lines.map((line) => (
                    <li key={line.account} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-foreground truncate">
                          <span className="text-muted-foreground tabular-nums">{line.account}</span>{" "}
                          {line.name}
                        </span>
                        <span className="text-muted-foreground truncate">{line.hint}</span>
                      </span>
                      <span className="text-foreground shrink-0 tabular-nums">
                        {formatKr(line.amounts[i])}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
      </FramePanel>
    </Frame>
  )
  return (
    <div className="grid gap-4 @3xl/balances:grid-cols-2">
      {column("What the business owns", OWN, sumSide(sheet.lines, "assets", i), "Open a group to see its accounts")}
      {column("What it owes, and equity", OWE, sumSide(sheet.lines, "liabilities", i), "Debt first, then what belongs to the owners")}
    </div>
  )
}

// ── Line by line ──

/** Every account at every month end this year: a trial balance, with the
    month in view highlighted and the open month marked provisional. */
export function BalanceTable({
  sheet,
  month,
  provisional,
  showResult = true,
}: {
  sheet: BalanceSheet
  month: string
  /** Months not closed yet: their figures can still move. */
  provisional: string[]
  showResult?: boolean
}) {
  const i = monthIndex(sheet, month)
  const cell = (j: number) =>
    cn(
      "px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap",
      j === i && "bg-muted/60 text-foreground font-medium"
    )
  const groups: BalanceGroup[] = [...OWN, ...OWE]
  const sides = [
    { side: "assets" as const, label: "Assets", groups: groups.filter((g) => GROUP_SIDE[g] === "assets") },
    { side: "liabilities" as const, label: "Equity and liabilities", groups: groups.filter((g) => GROUP_SIDE[g] === "liabilities") },
  ]
  const fmt = (v: number) => (v < 0 ? `−${nok.format(-v)}` : nok.format(v))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-xs">
        <caption className="sr-only">
          Balance per account at each month end, January to {longMonth(sheet.months.at(-1)!)}, in kroner
        </caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="bg-card sticky left-0 z-10 px-3 py-2 text-left font-medium">
              Account
            </th>
            {sheet.months.map((m, j) => (
              <th
                key={m}
                scope="col"
                className={cn(
                  "px-2.5 py-2 text-right font-medium whitespace-nowrap",
                  j === i && "bg-muted/60 text-foreground rounded-t-md"
                )}
              >
                {shortMonth(m)}
                {provisional.includes(m) ? (
                  <span className="text-warning-text" title="Not closed yet: can still move">
                    *
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        {sides.map(({ side, label, groups: sideGroups }) => (
          <tbody key={side}>
            <tr>
              <th
                colSpan={sheet.months.length + 1}
                scope="colgroup"
                className="text-foreground border-t px-3 pt-3 pb-1 text-left text-[11px] font-semibold tracking-wide uppercase"
              >
                {label}
              </th>
            </tr>
            {sideGroups
              .filter((g) => sheet.lines.some((l) => l.group === g))
              .flatMap((group) => [
                ...sheet.lines
                  .filter((l) => l.group === group)
                  .map((line) => (
                    <tr key={line.account} className="hover:bg-muted/30">
                      <th
                        scope="row"
                        className="bg-card text-foreground sticky left-0 z-10 max-w-64 truncate px-3 py-1.5 text-left font-normal"
                        title={line.hint}
                      >
                        <span className="text-muted-foreground tabular-nums">{line.account}</span>{" "}
                        {line.name}
                      </th>
                      {line.amounts.map((v, j) => (
                        <td key={j} className={cell(j)}>
                          {fmt(v)}
                        </td>
                      ))}
                    </tr>
                  )),
                <tr key={`${group}-total`} className="text-muted-foreground">
                  <th
                    scope="row"
                    className="bg-card sticky left-0 z-10 px-3 pt-1 pb-2.5 text-left font-medium"
                  >
                    {GROUP_LABEL[group]}
                  </th>
                  {sheet.months.map((_, j) => (
                    <td key={j} className={cn(cell(j), "border-t pt-1 pb-2.5 font-medium")}>
                      {fmt(sumGroup(sheet.lines, group, j))}
                    </td>
                  ))}
                </tr>,
              ])}
            <tr className="text-foreground">
              <th
                scope="row"
                className="bg-card sticky left-0 z-10 border-t px-3 py-2 text-left font-semibold"
              >
                Total {label.toLowerCase()}
              </th>
              {sheet.months.map((_, j) => (
                <td key={j} className={cn(cell(j), "border-t py-2 font-semibold")}>
                  {fmt(sumSide(sheet.lines, side, j))}
                </td>
              ))}
            </tr>
          </tbody>
        ))}
        <tbody>
          <tr className="text-muted-foreground">
            <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-2 text-left font-normal">
              Difference
            </th>
            {sheet.months.map((_, j) => {
              const diff = sumSide(sheet.lines, "assets", j) - sumSide(sheet.lines, "liabilities", j)
              return (
                <td key={j} className={cell(j)}>
                  {diff === 0 ? (
                    <span className="text-success-text inline-flex items-center gap-1">
                      <CheckIcon className="size-3" aria-hidden="true" />0
                    </span>
                  ) : (
                    <span className="text-destructive">{fmt(diff)}</span>
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
        {showResult ? (
          <tbody>
            <tr>
              <th
                colSpan={sheet.months.length + 1}
                scope="colgroup"
                className="text-foreground border-t px-3 pt-3 pb-1 text-left text-[11px] font-semibold tracking-wide uppercase"
              >
                Income statement, year to date
              </th>
            </tr>
            {sheet.result.map((line) => (
              <tr key={line.account} className="hover:bg-muted/30">
                <th
                  scope="row"
                  className="bg-card text-foreground sticky left-0 z-10 px-3 py-1.5 text-left font-normal"
                >
                  <span className="text-muted-foreground tabular-nums">{line.account}</span> {line.name}
                </th>
                {line.amounts.map((v, j) => (
                  <td key={j} className={cell(j)}>
                    {fmt(v)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="text-foreground">
              <th
                scope="row"
                className="bg-card sticky left-0 z-10 border-t px-3 py-2 text-left font-semibold"
              >
                Profit so far (8800)
              </th>
              {sheet.months.map((_, j) => (
                <td key={j} className={cn(cell(j), "border-t py-2 font-semibold")}>
                  {fmt(sheet.result.reduce((sum, l) => sum + l.amounts[j], 0))}
                </td>
              ))}
            </tr>
          </tbody>
        ) : null}
      </table>
    </div>
  )
}

export function asOfLabel(month: string) {
  return `${lastDayLabel(month)} ${month.slice(0, 4)}`
}
