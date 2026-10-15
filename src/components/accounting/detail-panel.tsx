"use client"

// The review panel. Docked beside the list (no overlay, no blur) so the
// accountant can walk items with ↑/↓ and keep the list in view. The summary
// and actions stay pinned; the detail is split into tabs. Section, FactRow,
// MiniProgress, RequestBlock and ActivityRow come from @reui/solution-crm-4.
import { heldInvoices } from "@/lib/accounting/approvals"
import { HireSuggestion } from "@/components/people/hire-details"
import { ApprovalLines } from "@/components/approvals/approval-lines"
import { CheckinSummary } from "@/components/people/checkin-summary"
import { PayLineNote } from "@/components/people/pay-line-note"
import { anomalyOutcome, openAnomalies } from "@/lib/accounting/anomalies"
import { AnomalyBadge, AnomalyCallout } from "./anomaly"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { cn } from "cn"
import {
  BookOpenCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  ChevronUpIcon,
  FileWarningIcon,
  GraduationCapIcon,
  LockIcon,
  MessageSquareDashedIcon,
  SendIcon,
  SparklesIcon,
  WalletIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ACCOUNTANT_BY_ID,
  ACCOUNTS,
  BOOKABLE_PERIODS,
  CHART_OF_ACCOUNTS,
  CLIENT_BY_ID,
  CURRENT_USER,
  monthLabel,
  monthName,
  PERIODS,
  TAB_LABEL,
  tabOf,
  VAT_CODES,
} from "@/lib/accounting/data"
import { inputVat, lateInvoiceInfo, vatTermFiled, type LateInvoice } from "@/lib/accounting/filings"
import { isEditable, monthHistory, monthStatus } from "@/lib/accounting/periods"
import { bookHereHint, recommendReopen, reopenHint } from "@/components/periods/late-invoice"
import { getPayroll, runOf } from "@/lib/accounting/payroll"
import { employeesOf } from "@/lib/accounting/people"
import { followsItsRule, ruleFor } from "@/lib/accounting/rules"
import {
  bankEntry,
  getBankReconciliation,
  type BankLine,
} from "@/lib/accounting/reconciliation"
import {
  conversation,
  creditAccount,
  useAccounting,
  type ConversationTurn,
} from "@/lib/accounting/store"
import { isBundle } from "@/lib/accounting/request-labels"
import type {
  Activity,
  Client,
  CustomerRequest,
  Person,
  ReviewItem,
} from "@/lib/accounting/types"
import {
  ACTOR_META,
  confidenceTone,
  formatDate,
  formatNok,
  formatPercent,
  ISSUE_META,
  REQUEST_KIND_META,
  REQUEST_STATUS_META,
  requestStatusMeta,
  RESPONSE_TYPE_META,
} from "./meta"
import { AgentReasoning } from "./agent-reasoning"
import { FileAttachment } from "./file-attachment"
import { DotSeparator, StatusBadge } from "./primitives"
import { ActionBar, useItemActions, useRequestActions, type TaskAction } from "./task-actions"
import { TeamNotes, teamNeedsMe, TeamStatusLine } from "./team-notes"

/** The accounts the agents use most first, then the rest of the chart. */
const SUGGESTED_ACCOUNTS: ReadonlySet<string> = new Set(ACCOUNTS)
const ACCOUNT_ITEMS: string[] = [
  ...ACCOUNTS,
  ...CHART_OF_ACCOUNTS.filter((a) => !SUGGESTED_ACCOUNTS.has(a)),
]

/** Accounts kept per person: who the money is on matters. */
export function perPerson(account: string) {
  return /^(1570|1571|2910)\b/.test(account)
}
const VAT_OPTIONS = VAT_CODES.map((v) => ({ value: v, label: v }))
const SPREAD_OPTIONS = [1, 3, 6, 12].map((n) => ({
  value: String(n),
  label: n === 1 ? "No, all in one month" : `${n} months`,
}))

// solution-crm-4 · Section
function Section({
  label,
  action,
  children,
}: {
  label?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </h3>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  )
}

// solution-crm-4 · MiniProgress, driven by agent confidence.
function MiniProgress({ value }: { value: number }) {
  return (
    <div className="bg-muted/55 relative mt-1.5 h-1 overflow-hidden rounded-full">
      <div
        className="text-muted-foreground pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-45deg,currentColor_0,currentColor_1px,transparent_0,transparent_4px)] opacity-20"
        aria-hidden="true"
      />
      <Progress
        value={Math.round(value * 100)}
        className={cn(
          "absolute inset-0 gap-0",
          "**:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent",
          "**:data-[slot=progress-indicator]:rounded-none",
          confidenceTone(value).indicator
        )}
      />
    </div>
  )
}

// solution-crm-4 · FactRow
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-foreground min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/** One turn of the conversation. The customer's words sit in a tinted box,
    the firm's as a quote, so the two sides read apart at a glance. */
function Turn({
  turn,
  customer,
  accountant,
  itemId,
  clientId,
}: {
  turn: ConversationTurn
  customer: Person
  accountant: Person
  /** The line the conversation is about, so its files can be previewed. */
  itemId?: string
  clientId: string
}) {
  if (turn.from === "accountant") {
    return (
      <figure className="flex flex-col gap-1 border-l-2 pl-3">
        <figcaption className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">{accountant.name}</span>
          {" · "}
          {turn.time}
        </figcaption>
        <blockquote className="text-muted-foreground text-sm leading-5 whitespace-pre-line">
          {turn.text}
        </blockquote>
      </figure>
    )
  }
  return (
    <div className="bg-muted/40 border-border/60 flex flex-col gap-2 rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Avatar className="size-5">
          <AvatarFallback className="text-[9px]">{customer.initials}</AvatarFallback>
        </Avatar>
        <span className="text-foreground font-medium">{customer.name}</span>
        <DotSeparator />
        <span>{turn.time}</span>
      </div>
      <p className="text-foreground text-sm leading-5 whitespace-pre-line">{turn.text}</p>
      {turn.attachment ? (
        <FileAttachment
          name={turn.attachment}
          itemId={itemId}
          clientId={clientId}
          from={customer.name}
          className="bg-background"
        />
      ) : null}
    </div>
  )
}

function RequestBlock({
  request,
  client,
}: {
  request: CustomerRequest
  client: Client
}) {
  const recipient =
    client.contacts.find((c) => c.id === request.recipientId) ??
    client.contacts[0]
  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId) ?? CURRENT_USER
  const status = requestStatusMeta(request)
  const fromCustomer = request.origin === "customer"
  const [opening, ...rest] = conversation(request)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-foreground text-sm leading-5 font-medium">
            {request.title}
          </p>
          <p className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 text-xs">
            <span>{request.id}</span>
            <DotSeparator />
            <span>
              {request.status === "draft"
                ? request.sentAt
                : fromCustomer
                  ? `Asked by ${recipient.name} ${request.sentAt}`
                  : `Sent ${request.sentAt}`}
            </span>
            {request.due ? (
              <>
                <DotSeparator />
                <span>Due {request.due}</span>
              </>
            ) : null}
            {request.round > 1 ? (
              <>
                <DotSeparator />
                <span>Asked {request.round}×</span>
              </>
            ) : null}
          </p>
        </div>
        <Badge variant={status.variant} className="shrink-0 gap-1.5">
          <span
            className={cn("size-1.5 shrink-0 rounded-full", status.dotClassName)}
            aria-hidden="true"
          />
          {status.label}
        </Badge>
      </div>

      {fromCustomer ? (
        <Turn
          turn={opening}
          customer={recipient}
          accountant={accountant}
          itemId={request.itemId}
          clientId={client.id}
        />
      ) : (
        <>
          <p className="text-muted-foreground border-border border-l-2 pl-3 text-sm leading-5 whitespace-pre-line">
            {request.message}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className="gap-1 font-normal [&_svg]:size-3">
              {RESPONSE_TYPE_META[request.responseType].icon}
              {RESPONSE_TYPE_META[request.responseType].label}
            </Badge>
            {request.options?.map((option) => (
              <Badge key={option} variant="secondary" className="font-normal">
                {option}
              </Badge>
            ))}
          </div>
        </>
      )}

      {rest.map((turn) => (
        <Turn
          key={turn.id}
          turn={turn}
          customer={recipient}
          accountant={accountant}
          itemId={request.itemId}
          clientId={client.id}
        />
      ))}

      {request.status === "draft" ? (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <SparklesIcon className="text-primary size-3.5" aria-hidden="true" />
          <span>
            Drafted by the agent, not sent. Goes to{" "}
            <span className="text-foreground font-medium">
              {recipient.name}
            </span>{" "}
            if you send it.
          </span>
        </div>
      ) : request.status === "sent" ? (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">
              {recipient.initials}
            </AvatarFallback>
          </Avatar>
          <span>
            Waiting on{" "}
            <span className="text-foreground font-medium">
              {recipient.name}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** The accountant's side of the thread: answer and hand the ball back, or
    answer and close it in one go. */
function ReplyComposer({ request }: { request: CustomerRequest }) {
  const { dispatch } = useAccounting()
  const [text, setText] = useState("")
  const client = CLIENT_BY_ID.get(request.clientId)!
  const recipient =
    client.contacts.find((c) => c.id === request.recipientId) ??
    client.contacts[0]
  const first = recipient.name.split(" ")[0]

  function send(close: boolean) {
    const body = text.trim()
    if (!body) return
    dispatch({ type: "accountant_message", requestId: request.id, text: body, close })
    setText("")
    toast.success(close ? "Answered and closed" : `Sent to ${first}`, {
      description: close
        ? `${first} sees your answer in their app.`
        : `${first} can answer you from their app.`,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send(false)
          }
        }}
        placeholder={`Write to ${first}…`}
        aria-label={`Message to ${recipient.name}`}
        className="min-h-20 resize-none"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!text.trim()}
          onClick={() => send(true)}
        >
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          Send & mark done
        </Button>
        <Button type="button" size="sm" disabled={!text.trim()} onClick={() => send(false)}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send
        </Button>
      </div>
    </div>
  )
}

// solution-crm-4 · ActivityRow
function ActivityRow({ activity, step }: { activity: Activity; step: number }) {
  const meta = ACTOR_META[activity.actor]
  return (
    <TimelineItem
      step={step}
      className="has-[+[data-completed]]:[&_[data-slot=timeline-separator]]:bg-border group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=vertical]/timeline:not-last:pb-6"
    >
      <TimelineHeader className="flex min-w-0 items-start justify-between gap-2.5">
        <TimelineSeparator className="bg-border group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.25rem-1rem)] group-data-[orientation=vertical]/timeline:translate-y-7" />
        <TimelineIndicator
          className={cn(
            "group-data-completed/timeline-item:border-border flex size-5 items-center justify-center rounded-full border group-data-[orientation=vertical]/timeline:-left-6 [&_svg]:size-3",
            meta.indicatorClassName
          )}
        >
          {meta.icon}
        </TimelineIndicator>

        <TimelineTitle className="text-foreground min-w-0 text-sm leading-5 font-medium">
          {activity.title}
        </TimelineTitle>

        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {activity.time}
        </span>
      </TimelineHeader>

      {activity.detail ? (
        <TimelineContent className="flex min-w-0 flex-col items-start gap-2 pb-1">
          <p className="text-muted-foreground max-w-[52ch] text-sm leading-5">
            {activity.detail}
          </p>
        </TimelineContent>
      ) : null}
    </TimelineItem>
  )
}

/** The rule a line falls under, when the agents were taught one for its
    supplier: whether this line follows it, who set it, and a way to take it
    back. */
function RuleNote({ item }: { item: ReviewItem }) {
  const { state, dispatch } = useAccounting()
  const rule = ruleFor(state.rules, item)
  if (!rule) return null
  const follows = followsItsRule(rule, item)
  const who = ACCOUNTANT_BY_ID.get(rule.createdBy)?.name ?? rule.createdBy
  return (
    <div className="bg-muted/40 border-border/60 flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs">
      <GraduationCapIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <p className="text-muted-foreground min-w-0 flex-1 text-pretty">
        {follows ? (
          <>
            <span className="text-foreground font-medium">Booked by your rule:</span> {rule.match} always to{" "}
            {rule.account}
            {rule.vat ? `, VAT ${rule.vat}` : ""}.
          </>
        ) : (
          <>
            <span className="text-foreground font-medium">Differs from your rule:</span> {rule.match} usually goes to{" "}
            {rule.account}.
          </>
        )}{" "}
        Set by {who}, {formatDate(rule.createdAt)}.
      </p>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="-my-1 shrink-0"
        onClick={() => {
          dispatch({ type: "remove_rule", ruleId: rule.id })
          toast.success("Rule removed", {
            description: `The agents suggest ${rule.match} from history again.`,
          })
        }}
      >
        Remove rule
      </Button>
    </div>
  )
}

function PostingEditor({ item }: { item: ReviewItem }) {
  const { state, dispatch } = useAccounting()
  const line = item.suggestion.lines[0]
  const [account, setAccount] = useState(line.account)
  const [vat, setVat] = useState(line.vat ?? "")
  const [who, setWho] = useState(line.counterparty ?? "")
  const dirty =
    account !== line.account || vat !== (line.vat ?? "") || who !== (line.counterparty ?? "")
  const locked = item.status === "booked"
  const client = CLIENT_BY_ID.get(item.clientId)!
  // Owners (the contacts) and employees: the people money can be on.
  const people = [
    ...client.contacts.map((c) => c.name),
    ...employeesOf(state, item.clientId)
      .map((e) => e.name)
      .filter((n) => !client.contacts.some((c) => c.name === n)),
  ]
  const owner = client.contacts[0]?.name

  return (
    <>
      <dl className="grid grid-cols-[7.5rem_1fr] items-center gap-x-4 gap-y-2.5">
        <FactRow label="Debit">
          <Combobox
            items={ACCOUNT_ITEMS}
            value={account}
            onValueChange={(value) => value && setAccount(value as string)}
            disabled={locked}
          >
            <ComboboxInput
              aria-label="Debit account"
              placeholder="Search all accounts…"
              className="w-full"
              disabled={locked}
            />
            <ComboboxContent>
              <ComboboxEmpty>No account with that name or number.</ComboboxEmpty>
              <ComboboxList>
                {(a: string) => (
                  <ComboboxItem key={a} value={a}>
                    <span className="min-w-0 flex-1 truncate">{a}</span>
                    {SUGGESTED_ACCOUNTS.has(a) ? null : (
                      <span className="text-muted-foreground shrink-0 text-xs">Chart</span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </FactRow>
        {perPerson(account) ? (
          <FactRow label="On">
            <span className="flex flex-col gap-1">
              <Select
                value={who}
                onValueChange={(value) => setWho((value as string) ?? "")}
                items={people.map((p) => ({ value: p, label: p }))}
                disabled={locked}
              >
                <SelectTrigger aria-label="Who it's on" className="w-full">
                  <SelectValue placeholder="Who owes it…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {people.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs text-pretty">
                {!who
                  ? "Kept per person, so the balance shows who owes what."
                  : who === owner
                    ? "A shareholder: credit is taxed as dividend unless it's under 100 000 kr and repaid within 60 days (sktl § 10-11 (4))."
                    : /^2910/.test(account)
                      ? "Repaid with the next pay."
                      : "Taking it from their pay needs a written agreement first (aml § 14-15)."}
              </span>
            </span>
          </FactRow>
        ) : null}
        <FactRow label="VAT code">
          <Select
            value={vat}
            onValueChange={(value) => value && setVat(value)}
            items={VAT_OPTIONS}
            disabled={locked}
          >
            <SelectTrigger aria-label="VAT code" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {VAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FactRow>
        <FactRow label="Credit">
          <span className="flex flex-col gap-0.5">
            <span>
              {creditAccount(item)}
              {item.kind === "invoice" && !item.expense ? (
                <span className="text-muted-foreground"> · {item.title}</span>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs text-pretty">
              {item.kind === "invoice"
                ? "On the supplier's own ledger, open until the payment is matched in the reconciliation"
                : item.kind === "receipt"
                  ? "Paid by card, the bank line is matched to it"
                  : "Booked from the bank line itself"}
            </span>
          </span>
        </FactRow>
        <FactRow label="Amount">
          <span className="tabular-nums">{formatNok(Math.abs(item.amount))}</span>
        </FactRow>
        {item.voucherNo ? (
          <FactRow label="Voucher">
            <span className="tabular-nums">{item.voucherNo}</span>
          </FactRow>
        ) : null}
      </dl>
      {dirty ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-warning-text inline-flex items-center gap-1.5 text-xs">
            <span
              className="bg-warning size-1.5 shrink-0 rounded-full"
              aria-hidden="true"
            />
            Unsaved override
          </p>
          <span className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch({
                  type: "update_posting",
                  itemId: item.id,
                  account,
                  vat,
                  counterparty: perPerson(account) ? who || undefined : undefined,
                })
                toast.message("Saved for this line", {
                  description: `Other lines from ${item.title} keep the agent's suggestion.`,
                })
              }}
            >
              Save for this line
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                dispatch({
                  type: "update_posting",
                  itemId: item.id,
                  account,
                  vat,
                  counterparty: perPerson(account) ? who || undefined : undefined,
                })
                dispatch({ type: "add_rule", itemId: item.id })
                toast.success("Saved, and the agents learned it", {
                  description: `${item.title} → ${account} from now on. You can remove the rule on the client's Overview.`,
                })
              }}
            >
              <GraduationCapIcon data-icon="inline-start" aria-hidden="true" />
              Always book like this
            </Button>
          </span>
        </div>
      ) : (
        <RuleNote item={item} />
      )}
    </>
  )
}

/** Which month an invoice or receipt is booked in, and whether its cost is
    spread over several. Saved as soon as it changes. */
export function AllocationFields({ item }: { item: ReviewItem }) {
  const { dispatch } = useAccounting()
  const locked = item.status === "booked"
  const months = item.accrueMonths ?? 1
  const periods = BOOKABLE_PERIODS.includes(item.period)
    ? BOOKABLE_PERIODS
    : [item.period, ...BOOKABLE_PERIODS]
  const periodOptions = periods.map((p) => ({ value: p, label: monthLabel(p) }))
  const line = item.suggestion.lines[0]

  function set(period: string, accrueMonths: number) {
    dispatch({ type: "set_allocation", itemId: item.id, period, accrueMonths })
    toast.message(
      accrueMonths > 1
        ? `Spread over ${accrueMonths} months from ${monthLabel(period)}`
        : `Booked in ${monthLabel(period)}`,
      {
        description:
          period === item.period
            ? undefined
            : `Moves to the ${monthLabel(period)} Bookkeeping tab.`,
      }
    )
  }

  return (
    <>
      <dl className="grid grid-cols-[7.5rem_1fr] items-center gap-x-4 gap-y-2.5">
        <FactRow label="Book in">
          <Select
            value={item.period}
            onValueChange={(value) => value && set(value, months)}
            items={periodOptions}
            disabled={locked}
          >
            <SelectTrigger aria-label="Month to book in" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {periodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FactRow>
        <FactRow label="Spread the cost">
          <Select
            value={String(months)}
            onValueChange={(value) => value && set(item.period, Number(value))}
            items={SPREAD_OPTIONS}
            disabled={locked}
          >
            <SelectTrigger aria-label="Spread the cost over" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SPREAD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FactRow>
      </dl>
      {months > 1 ? (
        <p className="text-muted-foreground text-xs text-pretty">
          Debits 1700 Prepaid expenses now, then {months} monthly vouchers of{" "}
          <span className="text-foreground tabular-nums">
            {formatNok(Math.abs(item.amount) / months)}
          </span>{" "}
          to {line.account} from {monthLabel(item.period)}.
        </p>
      ) : null}
    </>
  )
}

/** A late invoice's two ways out, explained, the firm's habit for its
    size first. The buttons are in the action bar above. */
function LateInvoiceNote({ late, item }: { late: LateInvoice; item: ReviewItem }) {
  const then = monthName(late.month)
  const now = monthName(item.period)
  const client = CLIENT_BY_ID.get(item.clientId)
  const back = recommendReopen(item.amount)
  const rows = [
    {
      key: "here",
      label: `Book in ${now}`,
      hint: bookHereHint(late.next.short),
    },
    {
      key: "back",
      label: late.reopened ? `Book in ${then}` : `Reopen ${then}`,
      hint: reopenHint({
        name: monthLabel(late.month).split(" ")[0],
        term: late.filing.short,
        filed: late.filed,
        reopened: late.reopened,
        first: client?.contacts[0]?.name.split(" ")[0] ?? "The customer",
      }),
    },
  ]
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground text-pretty">
        {late.reopened
          ? `Dated ${formatDate(item.date)}. ${then} is reopened, so it can go back there.`
          : `Dated ${formatDate(item.date)}, but ${then} is closed${
              late.filed
                ? ` and its VAT return (${late.filing.short}) is already filed.`
                : `. Its VAT return (${late.filing.short}) isn't filed yet.`
            }`}
      </p>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5">
        {(back ? [rows[1], rows[0]] : rows).map((row, index) => (
          <FactRow key={row.key} label={row.label}>
            <span className="text-muted-foreground flex flex-col items-start gap-1 text-pretty">
              {index === 0 ? <Badge variant="info-light">Recommended for this amount</Badge> : null}
              {row.hint}
            </span>
          </FactRow>
        ))}
      </dl>
    </div>
  )
}

/** The bank line behind an invoice or receipt, when the panel was opened
    from the reconciliation: the money already moved, so this is the entry
    against the bank account, not the invoice's own booking. */
function useBankLine(item: ReviewItem): BankLine | undefined {
  const { state } = useAccounting()
  const pathname = usePathname()
  if (!pathname.endsWith("/reconciliation") || item.domain !== "bookkeeping") return undefined
  const client = CLIENT_BY_ID.get(item.clientId)!
  return getBankReconciliation(client, state.month, state.items, state.progress, heldInvoices(state, client.id)).lines.find(
    (l) => l.item?.id === item.id
  )
}

function BankPayment({ line, item }: { line: BankLine; item: ReviewItem }) {
  const client = CLIENT_BY_ID.get(item.clientId)!
  const account = client.accounts.find((a) => a.ledger === line.account)!
  const entry = bankEntry(line, account.name)
  const kid = item.facts.find((f) => f.label === "KID")?.value
  return (
    <>
      <dl className="grid grid-cols-[7.5rem_1fr] items-center gap-x-4 gap-y-2.5">
        <FactRow label="Debit">{entry.debit}</FactRow>
        <FactRow label="Credit">{entry.credit}</FactRow>
        <FactRow label="Amount">
          <span className="tabular-nums">{formatNok(Math.abs(line.amount))}</span>
        </FactRow>
        <FactRow label="Statement">
          <span className="flex flex-col gap-0.5">
            <span className="font-mono text-[13px]">{line.text}</span>
            <span className="text-muted-foreground text-xs">
              {formatDate(line.date)} · DNB {account.number}
            </span>
          </span>
        </FactRow>
        {kid && line.kind === "invoice" ? (
          <FactRow label="KID">
            <span className="font-mono text-[13px] tabular-nums">{kid}</span>
          </FactRow>
        ) : null}
      </dl>
      <p className="text-muted-foreground text-xs text-pretty">
        {line.kind === "invoice" && item.expense
          ? item.status === "booked"
            ? `Owed to ${item.expense.employee} on 2910 since ${monthLabel(item.period)} (voucher ${item.voucherNo}). The refund goes out with the pay; accepting the match clears it.`
            : "Book the expense to 2910 first; the refund then clears it."
          : line.kind === "invoice"
          ? item.status === "booked"
            ? `The invoice sits on 2400 since ${monthLabel(item.period)} (voucher ${item.voucherNo}). Accepting the match pays it off from ${line.account}.`
            : "Book the invoice to 2400 first; the payment then clears it."
          : line.kind === "none"
            ? `Paid from ${line.account} with nothing behind it yet: booking it books the bank line.`
            : `Paid by card from ${line.account}: booking the receipt books the bank line.`}
      </p>
    </>
  )
}

/** What the panel offers on a bank line: accept the agent's match, or book
    what it pays and match it in one go. */
function useBankActions(line: BankLine | undefined, item: ReviewItem, late: boolean): TaskAction[] {
  const { state, dispatch } = useAccounting()
  if (!line || line.kind === "none") return []
  // The reconciliation of a closed month is read-only until it is reopened.
  const status = monthStatus(item.clientId, state.month, state)
  if (status !== "open" && status !== "reopened") return []
  if (line.state === "suggested")
    return [
      {
        id: "accept-match",
        label: "Accept match",
        icon: CheckIcon,
        group: "decide",
        run: () => {
          // A receipt is matched by booking it; an invoice's payment by
          // accepting the voucher from 2400.
          // Booking moves the panel on by itself; accepting a payment
          // doesn't, so it steps on the way a decision in the queues does.
          if (line.kind === "receipt") dispatch({ type: "confirm", ids: [item.id] })
          else {
            dispatch({ type: "accept_matches", ids: [line.id] })
            dispatch({ type: "step", dir: 1 })
          }
          toast.success("Match accepted", {
            description: `${bankEntry(line).debit} / ${bankEntry(line).credit} in Tripletex.`,
          })
        },
      },
    ]
  if (line.state === "waiting" && item.status === "needs_review" && !item.issue && !late)
    return [
      {
        id: "book-match",
        label: "Book & match",
        icon: CheckIcon,
        group: "decide",
        run: () => {
          dispatch({ type: "confirm", ids: [item.id] })
          dispatch({ type: "accept_matches", ids: [line.id] })
          toast.success("Booked and matched", {
            description:
              line.kind === "invoice"
                ? `Invoice on 2400, payment from ${line.account}.`
                : `${item.suggestion.lines[0].account} / ${line.account}.`,
          })
        },
      },
    ]
  return []
}

/** An answer showed that earlier bookings this year were wrong the same
    way. Correcting them puts the VAT right in their own months: a term
    already filed gets a corrected return (the law's way, not a catch-up
    voucher in this month). */
function LookBack({ item }: { item: ReviewItem }) {
  const { state, dispatch } = useAccounting()
  const back = item.suggestion.lookBack
  if (!back) return null
  const earlier = back.itemIds
    .map((id) => state.items.find((i) => i.id === id))
    .filter((i): i is ReviewItem => Boolean(i))
    .sort((a, b) => a.date.localeCompare(b.date))
  const filed = earlier.filter((i) => vatTermFiled(i.clientId, i.period, state.items, state))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs text-pretty">
        {back.why}. The same booking earlier this year took input VAT it shouldn&apos;t have.
      </p>
      <ul className="flex flex-col gap-1.5">
        {earlier.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {formatDate(i.date)} · {i.voucherNo ?? "voucher"}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatNok(Math.abs(i.amount))} · VAT {formatNok(inputVat(i))}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs text-pretty">
          {filed.length
            ? `${filed.length} ${filed.length === 1 ? "is" : "are"} in a filed VAT term: correcting ${filed.length === 1 ? "it" : "them"} drafts a corrected return.`
            : "None is in a filed VAT term: the open return takes the correction."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            dispatch({ type: "correct_earlier", itemId: item.id })
            toast.success(`Corrected ${earlier.length} earlier ${earlier.length === 1 ? "booking" : "bookings"}`, {
              description: filed.length
                ? `${formatNok(back.vat)} input VAT taken back. The corrected return is on Filings.`
                : `${formatNok(back.vat)} input VAT taken back in the open term.`,
            })
          }}
        >
          Correct {earlier.length === 1 ? "it" : `all ${earlier.length}`}
        </Button>
      </div>
    </div>
  )
}

/** Something the accountant learned on the phone or by e-mail. The agent
    re-suggests from it; an open question to the customer is closed. */
function AgentNote({
  item,
  request,
  onDone,
}: {
  item: ReviewItem
  request: CustomerRequest | undefined
  onDone: () => void
}) {
  const { dispatch } = useAccounting()
  const [text, setText] = useState("")
  const client = CLIENT_BY_ID.get(item.clientId)!
  const first = client.contacts[0].name.split(" ")[0]
  // A draft never reached them; only a sent question needs closing.
  const asked = request?.status === "sent"

  function submit() {
    if (!text.trim()) return
    dispatch({ type: "agent_note", itemId: item.id, text })
    toast.success("The agent updated the suggestion", {
      description: asked
        ? `From your note. ${first}'s question is closed in their app.`
        : "From your note. Check it and approve.",
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
          if (e.key === "Escape") onDone()
        }}
        placeholder={
          item.domain === "payroll"
            ? `${first} called: 40 hours, the overtime is approved…`
            : `${first} called: it was a lunch with a supplier…`
        }
        aria-label="What the customer told you"
        className="min-h-20 resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs text-pretty">
          {asked ? `Closes the question to ${first}. ` : ""}The agent re-suggests, you approve.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!text.trim()} onClick={submit}>
            <SparklesIcon data-icon="inline-start" aria-hidden="true" />
            Update suggestion
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Where a pay line stands in the month's runs, in one line. */
function PayRunLine({ item }: { item: ReviewItem }) {
  const { state } = useAccounting()
  if (item.domain !== "payroll") return null
  const payroll = getPayroll(state.items, state.progress, item.clientId, item.period)
  const run = runOf(payroll.runs, item.id)
  const text = run
    ? `Paid in ${run.seq === 1 ? "the regular run" : `follow-up run ${run.seq}`} · ${formatDate(run.payDate)}`
    : item.skipped
      ? `Not paid for ${monthName(item.period)}`
      : item.movedFrom
        ? `Moved from ${monthName(item.movedFrom)}'s run`
        : item.status === "booked"
          ? payroll.runs.length
            ? "Approved, goes in the next follow-up run"
            : "Approved, goes in the regular run"
          : null
  if (!text) return null
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <HistoryIcon className="size-3.5" aria-hidden="true" />
      {text}
    </div>
  )
}

function PayLines({ item }: { item: ReviewItem }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5">
      {item.suggestion.lines.map((line) => (
        <FactRow key={line.account} label={line.account}>
          <span className="tabular-nums">{formatNok(line.amount)}</span>
        </FactRow>
      ))}
      <div className="contents">
        <dt className="text-foreground border-t pt-2.5 text-sm font-medium">
          Gross pay
        </dt>
        <dd className="text-foreground border-t pt-2.5 text-sm font-medium tabular-nums">
          {formatNok(item.amount)}
        </dd>
      </div>
    </dl>
  )
}

type PanelTab = "suggestion" | "customer" | "team" | "details" | "activity"

function NavButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role=listbox],[role=menu],[role=dialog]"))
  )
}

function TopBar({
  icon,
  label,
  position,
}: {
  icon: ReactNode
  label: string
  position?: { index: number; total: number }
}) {
  const { dispatch } = useAccounting()
  const hasPrev = position ? position.index > 0 : false
  const hasNext = position ? position.index < position.total - 1 : false
  return (
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
      <span className="text-muted-foreground inline-flex min-w-0 items-center gap-2 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {position && position.total > 1 ? (
          <>
            <span className="text-muted-foreground mr-1 text-xs tabular-nums">
              {position.index + 1} / {position.total}
            </span>
            <NavButton
              label="Previous"
              shortcut="↑"
              disabled={!hasPrev}
              onClick={() => dispatch({ type: "step", dir: -1 })}
            >
              <ChevronUpIcon aria-hidden="true" />
            </NavButton>
            <NavButton
              label="Next"
              shortcut="↓"
              disabled={!hasNext}
              onClick={() => dispatch({ type: "step", dir: 1 })}
            >
              <ChevronDownIcon aria-hidden="true" />
            </NavButton>
          </>
        ) : null}
        <NavButton
          label="Close"
          shortcut="Esc"
          disabled={false}
          onClick={() => dispatch({ type: "open_item", id: null })}
        >
          <XIcon aria-hidden="true" />
        </NavButton>
      </div>
    </div>
  )
}

function ItemView({ item }: { item: ReviewItem }) {
  const { state, dispatch } = useAccounting()
  const [tab, setTab] = useState<PanelTab>("suggestion")
  const client = CLIENT_BY_ID.get(item.clientId)!
  const request = item.requestId
    ? state.requests.find((r) => r.id === item.requestId)
    : undefined
  // Bookkeeping follows its month (open, or reopened after a close); pay
  // lines follow the pay period.
  const open = isEditable(item, state)
  const period = PERIODS[item.domain].find((p) => p.id === item.period)
  const lockNote =
    item.domain === "payroll"
      ? period?.note
      : monthStatus(item.clientId, item.period, state) === "before"
        ? "before we took over"
        : `report sent ${monthHistory(item.clientId, item.period, state).at(-1)?.on ?? ""}`.trim()
  const tone = confidenceTone(item.suggestion.confidence)
  const index = state.nav.indexOf(item.id)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [noting, setNoting] = useState(false)
  const late = lateInvoiceInfo(item, state.items, state)
  const bankLine = useBankLine(item)
  const itemActions = useItemActions(
    item,
    request,
    () => {
      setTab("team")
      requestAnimationFrame(() => composer.current?.focus())
    },
    () => setNoting(true)
  )
  const bankActions = useBankActions(bankLine, item, Boolean(late))
  const anomalies = openAnomalies(state, item)
  // On a bank line the match comes first; the item's own decisions follow.
  const actions = bankActions.length
    ? [...bankActions, ...itemActions.map((a) => (a.group === "decide" ? { ...a, menuOnly: true } : a))]
    : itemActions

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PanelTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <SidebarHeader className="gap-0 p-0">
        <TopBar
          icon={
            item.domain === "bookkeeping" ? (
              <BookOpenCheckIcon aria-hidden="true" />
            ) : (
              <WalletIcon aria-hidden="true" />
            )
          }
          label={`${client.name} · ${bankLine ? "Reconciliation" : TAB_LABEL[tabOf(item)]}`}
          position={index >= 0 ? { index, total: state.nav.length } : undefined}
        />

        {/* Summary: the bird's-eye view that never scrolls away */}
        <div className="flex flex-col gap-3 border-b px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h2 className="text-foreground min-w-0 text-base leading-6 font-semibold tracking-tight text-balance">
                {item.title}
              </h2>
              <div className="flex shrink-0 items-center gap-1.5">
                <AnomalyBadge anomalies={anomalies} size="default" />
                <StatusBadge status={item.status} domain={item.domain} />
              </div>
            </div>
            <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
              <span className="shrink-0">{formatDate(item.date)}</span>
              <DotSeparator />
              <span className="min-w-0 truncate">{item.subtitle}</span>
              {item.basis ? (
                <>
                  <DotSeparator />
                  <span className="shrink-0">{item.basis}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <span className="text-foreground text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {formatNok(item.amount)}
            </span>
            <span className="text-muted-foreground text-xs">
              Agent{" "}
              <span className={cn("font-medium tabular-nums", tone.text)}>
                {formatPercent(item.suggestion.confidence)}
              </span>
            </span>
          </div>
          <MiniProgress value={item.suggestion.confidence} />

          {item.issue && item.status === "needs_review" ? (
            <div className="flex items-start gap-2 text-xs [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0">
              <span className="text-warning-text">
                {ISSUE_META[item.issue].icon}
              </span>
              <p className="text-muted-foreground line-clamp-2 leading-4 text-pretty">
                <span className="font-medium whitespace-nowrap text-warning-text">
                  {ISSUE_META[item.issue].label}.
                </span>{" "}
                {item.suggestion.reasoning[item.suggestion.reasoning.length - 1]}
              </p>
            </div>
          ) : null}

          <TeamStatusLine task={item} />
          <PayRunLine item={item} />

          {!open && bankLine && bankLine.date.slice(0, 7) !== item.period ? (
            // The payment of a closed month's invoice: matched in the month
            // the money moved. The invoice's month stays closed.
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <LockIcon className="size-3.5" aria-hidden="true" />
              Invoice booked in {monthName(item.period)}, which stays closed · the payment is matched in{" "}
              {monthName(bankLine.date.slice(0, 7))}
            </div>
          ) : !open ? (
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <LockIcon className="size-3.5" aria-hidden="true" />
              {period?.label ?? monthLabel(item.period)} is closed · {lockNote}
            </div>
          ) : null}
          {/* A closed month's invoice can still be paid in the open one. */}
          {(open || bankActions.length) && actions.length > 0 ? (
            <ActionBar actions={actions} keys />
          ) : null}
          {noting && open && item.status !== "booked" ? (
            <AgentNote item={item} request={request} onDone={() => setNoting(false)} />
          ) : null}
        </div>

        <div className="border-b px-4 pt-2">
          <TabsList variant="line" className="gap-4">
            <TabsTrigger value="suggestion" className="px-0 pb-2 text-xs">
              Suggestion
            </TabsTrigger>
            <TabsTrigger value="customer" className="gap-1.5 px-0 pb-2 text-xs">
              Customer
              {request && request.status !== "resolved" ? (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    REQUEST_STATUS_META[request.status].dotClassName
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5 px-0 pb-2 text-xs">
              Team
              {teamNeedsMe(item) ? (
                <span className="bg-primary size-1.5 rounded-full" aria-hidden="true" />
              ) : item.notes?.length ? (
                <span className="text-muted-foreground tabular-nums">
                  {item.notes.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="details" className="px-0 pb-2 text-xs">
              Details
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 px-0 pb-2 text-xs">
              Activity
              <span className="text-muted-foreground tabular-nums">
                {item.activity.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <TabsContent value="suggestion">
          {anomalies.length ? (
            <div className="px-5 pt-4">
              <AnomalyCallout anomalies={anomalies} outcome={anomalyOutcome(state, item)} />
            </div>
          ) : null}
          {bankLine ? (
            <>
              <Section label={bankLine.kind === "invoice" ? "Payment from the bank" : "From the bank"}>
                <BankPayment line={bankLine} item={item} />
              </Section>
              <Separator className="opacity-60" />
            </>
          ) : null}
          <Section
            label={
              item.domain === "payroll"
                ? "Pay lines"
                : bankLine?.kind === "invoice"
                  ? "Invoice booking"
                  : "Posting"
            }
          >
            {item.domain === "bookkeeping" ? (
              <PostingEditor
                key={`${item.id}-${item.suggestion.lines[0].account}-${item.suggestion.lines[0].vat}`}
                item={item}
              />
            ) : (
              <>
                <PayLines item={item} />
                <PayLineNote item={item} />
              </>
            )}
          </Section>
          {late ? (
            <>
              <Separator className="opacity-60" />
              <Section label="Arrived after its month closed">
                <LateInvoiceNote late={late} item={item} />
              </Section>
            </>
          ) : (tabOf(item) === "bookkeeping" || item.kind === "receipt") && open ? (
            <>
              <Separator className="opacity-60" />
              <Section label="Period">
                <AllocationFields item={item} />
              </Section>
            </>
          ) : null}
          <Separator className="opacity-60" />
          <Section label="Why the agent suggests this">
            <AgentReasoning item={item} />
          </Section>
          {item.suggestion.lookBack && open ? (
            <>
              <Separator className="opacity-60" />
              <Section label="Same mistake earlier this year">
                <LookBack item={item} />
              </Section>
            </>
          ) : null}
          <Separator className="opacity-60" />
          <Section label="Evidence">
            {item.evidence.attached ? (
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0 text-sm">
                  {item.evidence.label}
                </span>
                <FileAttachment
                  name={item.evidence.fileName ?? `${item.evidence.label}.pdf`}
                  itemId={item.id}
                  clientId={item.clientId}
                  className="min-w-0"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                  <FileWarningIcon className="text-warning-text size-4" aria-hidden="true" />
                  {item.evidence.label} missing
                </span>
                <Badge variant="warning-light">Not found</Badge>
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="customer">
          {request ? (
            <Section label="Customer request">
              <RequestBlock request={request} client={client} />
            </Section>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <MessageSquareDashedIcon
                className="text-muted-foreground size-5"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <p className="text-foreground text-sm font-medium">
                  No questions for {client.contacts[0].name.split(" ")[0]}
                </p>
                <p className="text-muted-foreground text-xs text-balance">
                  If something is missing, ask the customer. Their answer comes
                  back here.
                </p>
              </div>
              {open && item.status !== "booked" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch({ type: "open_ask", id: item.id })}
                >
                  <SendIcon data-icon="inline-start" aria-hidden="true" />
                  Ask customer
                </Button>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="team">
          <Section label="Inside the firm">
            <TeamNotes task={item} composerRef={composer} />
          </Section>
        </TabsContent>

        <TabsContent value="details">
          <Section
            label={
              item.kind === "invoice"
                ? "From the invoice"
                : item.kind === "receipt"
                  ? "From the card and receipt"
                  : item.kind === "bank_line"
                    ? "From the bank"
                    : "From the employee record"
            }
          >
            <dl className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5">
              {item.facts.map((fact) => (
                <FactRow key={fact.label} label={fact.label}>
                  <span
                    className={cn(
                      "break-words",
                      fact.mono && "font-mono text-[13px] tabular-nums"
                    )}
                  >
                    {fact.value}
                  </span>
                </FactRow>
              ))}
            </dl>
          </Section>
          <Separator className="opacity-60" />
          <Section label="Source">
            <dl className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5">
              <FactRow label="Imported from">{item.source}</FactRow>
              <FactRow label="Period">{period?.label ?? monthLabel(item.period)}</FactRow>
              {item.voucherNo ? (
                <FactRow label="Voucher">
                  <span className="font-mono text-[13px] tabular-nums">
                    {item.voucherNo}
                  </span>
                </FactRow>
              ) : null}
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="activity">
          <Section>
            <Timeline defaultValue={0}>
              {[...item.activity].reverse().map((entry, i) => (
                <ActivityRow key={entry.id} activity={entry} step={i + 1} />
              ))}
            </Timeline>
          </Section>
        </TabsContent>
      </SidebarContent>
    </Tabs>
  )
}

/** A task the accountant created by hand: no suggestion behind it, so the
    panel is just the request and its thread. */
function RequestView({ request }: { request: CustomerRequest }) {
  const { state } = useAccounting()
  const index = state.nav.indexOf(request.id)
  const client = CLIENT_BY_ID.get(request.clientId)!
  const status = requestStatusMeta(request)
  const fromCustomer = request.origin === "customer"
  const open = request.status === "sent" || request.status === "replied"
  const composer = useRef<HTMLTextAreaElement>(null)
  const actions = useRequestActions(request, () => {
    composer.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    composer.current?.focus({ preventScroll: true })
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader className="gap-0 p-0">
        <TopBar
          icon={REQUEST_KIND_META[request.kind].icon}
          label={`${client.name} · ${
            fromCustomer
              ? "Question from the customer"
              : request.kind === "approval"
                ? request.domain === "payroll"
                  ? "Pay run approval"
                  : "Approval list"
                : request.kind === "payroll_checkin"
                  ? "Pay check-in"
                  : "Manual task"
          }`}
          position={index >= 0 ? { index, total: state.nav.length } : undefined}
        />
        <div className="flex flex-col gap-3 border-b px-4 py-3.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h2 className="text-foreground min-w-0 text-base leading-6 font-semibold tracking-tight text-balance">
              {request.title}
            </h2>
            <Badge variant={status.variant} className="shrink-0 gap-1.5">
              <span
                className={cn("size-1.5 rounded-full", status.dotClassName)}
                aria-hidden="true"
              />
              {status.label}
            </Badge>
          </div>
          <TeamStatusLine task={request} />
          {actions.length > 0 ? <ActionBar actions={actions} /> : null}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <Section label={fromCustomer ? "Conversation" : "Task"}>
          <RequestBlock request={request} client={client} />
          {open ? <HireSuggestion request={request} /> : null}
        </Section>
        {request.responseType === "approval" ? (
          <>
            <Separator />
            <Section label="Lines">
              <ApprovalLines request={request} />
            </Section>
          </>
        ) : request.responseType === "checkin" ? (
          <>
            <Separator />
            <Section label="Their answer">
              <CheckinSummary request={request} />
            </Section>
          </>
        ) : null}
        {/* An approval or a check-in is answered in its own form: a message
            would reopen it. Questions about a line go on that line. */}
        {open && !isBundle(request) ? (
          <>
            <Separator />
            <Section label={fromCustomer ? "Your answer" : "Follow up"}>
              <ReplyComposer key={request.id} request={request} />
            </Section>
          </>
        ) : null}
        <Separator />
        <Section label="Inside the firm">
          <TeamNotes key={request.id} task={request} composerRef={composer} />
        </Section>
      </SidebarContent>
    </div>
  )
}

/** Keeps the mobile sheet in step with the store: shadcn's Sidebar tracks
    its mobile sheet separately from the desktop open state. */
function MobileSync({ open }: { open: boolean }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar()
  const { dispatch } = useAccounting()
  useEffect(() => {
    if (isMobile && openMobile !== open) setOpenMobile(open)
    // Only react to the store opening or closing the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile])
  useEffect(() => {
    if (isMobile && open && !openMobile) {
      dispatch({ type: "open_item", id: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMobile])
  return null
}

/** The review panel: shadcn's Sidebar on the right (the ReUI c-sidebar-4
    inspector pattern), docked beside the page on desktop and a sheet on
    mobile. Non-modal, so the list stays clickable while it is open. */
export function InspectorLayout({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAccounting()
  const item = state.items.find((i) => i.id === state.openItemId)
  const request = state.openRequestId
    ? state.requests.find((r) => r.id === state.openRequestId)
    : undefined
  const open = Boolean(item || request)

  // The panel belongs beside the task's own list. Leaving for a page where
  // the task doesn't live (another tab, another client) closes it.
  const pathname = usePathname()
  useEffect(() => {
    const target = item ?? request
    if (!target) return
    const base = `/clients/${target.clientId}`
    const home = item
      ? `${base}/${tabOf(item)}`
      : request?.itemId
        ? undefined
        : `${base}/requests`
    const belongs =
      pathname === "/requests" ||
      // Bookkeeping opens the approval lists its invoices go out on.
      (pathname === `${base}/bookkeeping` && request?.kind === "approval") ||
      // The reconciliation opens what a bank line pays: invoices and receipts.
      (pathname === `${base}/reconciliation` && item?.domain === "bookkeeping") ||
      pathname === `${base}/requests` ||
      (home !== undefined && pathname === home) ||
      (!!request?.itemId && pathname.startsWith(base))
    if (!belongs) dispatch({ type: "open_item", id: null })
    // Only a change of page decides this, never the panel's own stepping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Walk the list the panel was opened from without leaving the keyboard.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (state.askItemId || state.taskComposer || isTyping(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault()
        dispatch({ type: "step", dir: 1 })
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault()
        dispatch({ type: "step", dir: -1 })
      } else if (event.key === "Escape") {
        dispatch({ type: "open_item", id: null })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, state.askItemId, state.taskComposer, dispatch])

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        if (!next) dispatch({ type: "open_item", id: null })
      }}
      className="min-h-0 flex-1 gap-0 [--sidebar-border:var(--border)] [--sidebar:var(--background)]"
      style={{ "--sidebar-width": "26rem" } as React.CSSProperties}
    >
      <MobileSync open={open} />
      {/* Pages size themselves against this column, not the viewport, so an
          open panel reflows them instead of cropping them. */}
      <div className="@container/main flex min-w-0 flex-1 flex-col gap-4">
        {children}
      </div>
      <Sidebar
        side="right"
        variant="floating"
        collapsible="offcanvas"
        // The container re-displays on every open, which replays this entrance
        // once per open and never while stepping between items.
        className="animate-in fade-in slide-in-from-right-4 ease-drawer sticky top-0 bottom-auto h-[calc(100svh-var(--chrome-y))] pt-0 pr-0 duration-300 group-data-[state=collapsed]:hidden motion-reduce:slide-in-from-right-0"
      >
        {item ? (
          <ItemView item={item} />
        ) : request ? (
          <RequestView request={request} />
        ) : null}
      </Sidebar>
    </SidebarProvider>
  )
}
