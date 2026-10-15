"use client"

// The customer's side of the loop: one timeline, read top to bottom. What
// they've already sent, where today is, then each thing we need from them in
// date order, with our own dates in between so they see why a date matters.
// Answers go straight back to the accountant's queue (both tabs share the
// demo data). Composition from @reui/c-timeline-3 (status timeline with
// completed steps) plus the ReUI Frame and file-upload hook. The customer can
// also ask the accountant something: the box under the greeting opens the
// form in a dialog. Their questions and the answers live in a second tab,
// next to the timeline. A third tab, Your numbers, holds the monthly report
// for every closed month. A company with several contacts sees the page as
// one of them: "Things we need" holds that person's tasks, and whatever they
// answer is recorded in their name.
import { ApprovalAnswer } from "@/components/approvals/approval-answer"
import { CheckinAnswer } from "@/components/people/checkin-answer"
import { PortalContactContext, usePortalContact, useStillOpen } from "@/components/portal/portal-contact"
import { useSearchParams } from "next/navigation"
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameHeader, FramePanel } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { cn } from "cn"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarIcon,
  ChartColumnIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileIcon,
  LandmarkIcon,
  ListTodoIcon,
  MessageCirclePlusIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  ReceiptTextIcon,
  SendIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { BorderBeam } from "border-beam"
import { BotAvatar } from "bot-avatars"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useFileUpload } from "@/hooks/use-file-upload"
import { MonthlyReportView, ReportNote } from "@/components/report/monthly-report"
import {
  asOfLabel,
  BalanceTable,
  BalanceTiles,
  OwnAndOwe,
} from "@/components/report/balance-sheet"
import { buildBalanceSheet } from "@/lib/accounting/balance"
import { useSettings } from "@/lib/accounting/settings"
import { reportVersion } from "@/lib/accounting/periods"
import { isMonthClosed } from "@/lib/accounting/signoffs"
import { ACCOUNTANT_BY_ID, CLIENT_BY_ID, MONTHS, monthName, OPEN_MONTH } from "@/lib/accounting/data"
import { getClientDeadlines, TODAY, type Deadline } from "@/lib/accounting/deadlines"
import { buildReport, longMonth, publishedMonths } from "@/lib/accounting/report"
import {
  conversation,
  getMonthClose,
  useAccounting,
  type ConversationTurn,
} from "@/lib/accounting/store"
import type { CustomerRequest, Domain, ReviewItem } from "@/lib/accounting/types"
import { formatDate, formatNok } from "@/components/accounting/meta"
import { saveFile } from "@/lib/accounting/files"
import { refundDay, type SentDocument } from "@/lib/accounting/documents"
import { employeesOf } from "@/lib/accounting/people"
import { addDays, dayLabel } from "@/lib/accounting/data"



// ── Dates ──

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

const DAY = 86_400_000
const today = new Date(`${TODAY}T00:00:00`)

/** Request dues are written for people ("Fri 2 Oct"); parse them back. */
function parseDue(due: string) {
  const match = due.match(/(\d{1,2}) (\w{3})/)
  return match
    ? new Date(2026, MONTH_INDEX[match[2]] ?? 0, Number(match[1]))
    : new Date(today.getTime() + 99 * DAY)
}

function daysFrom(date: Date) {
  return Math.round((date.getTime() - today.getTime()) / DAY)
}

const formatDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
})

/** "in 4 days", "tomorrow", "3 days late": the part people act on. */
function relative(days: number) {
  if (days < -1) return `${-days} days late`
  if (days === -1) return "1 day late"
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  return `in ${days} days`
}

/** Due within a day, or late: the only thing on the page that turns red. */
function isPressing(days: number) {
  return days <= 1
}

/** What the customer has to do, in their words, not the firm's. */
const ASK: Record<CustomerRequest["responseType"], string> = {
  file: "Upload a photo or a file",
  text: "Write a short answer",
  choice: "Pick one option",
  confirm: "Answer yes or no",
  approval: "Approve each line",
  checkin: "Tell us what changed",
}

/** Our dates, as the customer would say them. */
const MILESTONE_COPY: Record<Deadline["kind"], string> = {
  payrun: "We approve the pay run",
  payday: "Salaries are paid",
  close: "We close the month",
  mva: "We file your VAT return",
  "a-melding": "We report salaries to the authorities",
}

// ── Context: what the task is about ──

function TaskContext({ item }: { item: ReviewItem }) {
  const card = item.facts.find((f) => f.label === "Paid with")?.value
  return (
    <div className="bg-muted/40 border-border/60 flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2">
      <IconTile variant="outline" size="xs" className="text-muted-foreground">
        {item.domain === "bookkeeping" ? (
          <LandmarkIcon aria-hidden="true" />
        ) : (
          <CalendarIcon aria-hidden="true" />
        )}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {item.title}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {item.domain === "bookkeeping"
            ? `${formatDate(item.date)}${card ? ` · ${card}` : ""}`
            : `${item.subtitle} · ${monthName(item.period)} hours`}
        </span>
      </div>
      {item.domain === "bookkeeping" ? (
        <span className="text-foreground shrink-0 text-sm tabular-nums">
          {formatNok(Math.abs(item.amount))}
        </span>
      ) : null}
    </div>
  )
}

// ── Answer controls, one per response type ──

function useSend(request: CustomerRequest, accountantName: string) {
  const { dispatch } = useAccounting()
  const contact = usePortalContact()
  const stillOpen = useStillOpen(request)
  return (text: string, attachment?: string) => {
    if (!stillOpen()) return
    dispatch({
      type: "customer_reply",
      requestId: request.id,
      text,
      attachment,
      contactId: contact?.id,
    })
    toast.success(`Sent to ${accountantName}`, {
      description: "You'll hear back here if anything else is needed.",
    })
  }
}

export function TextAnswer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("")
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your answer…"
        aria-label="Your answer"
        className="min-h-20 resize-none"
      />
      <div className="flex justify-end">
        <Button type="button" disabled={!text.trim()} onClick={() => onSend(text.trim())}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send answer
        </Button>
      </div>
    </div>
  )
}

function ChoiceAnswer({
  options,
  onSend,
}: {
  options: string[]
  onSend: (text: string) => void
}) {
  const [picked, setPicked] = useState<string>("")
  const [note, setNote] = useState("")
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={picked} onValueChange={(v) => setPicked(v as string)} className="gap-2">
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              "border-border hover:bg-muted/40 flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150",
              "has-data-checked:border-primary has-data-checked:bg-primary/5"
            )}
          >
            <RadioGroupItem value={option} />
            {option}
          </label>
        ))}
      </RadioGroup>
      {/* A pick never says everything: the words are input for the agent too. */}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        aria-label="Note"
        className="min-h-14 resize-none"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!picked}
          onClick={() => onSend(note.trim() ? `${picked}. ${note.trim()}` : picked)}
        >
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send answer
        </Button>
      </div>
    </div>
  )
}

export function FileAnswer({
  onSend,
  allowMissing = false,
}: {
  onSend: (text: string, file?: string) => void
  /** A receipt can be lost: answering without a file, in words, is fine. */
  allowMissing?: boolean
}) {
  const [note, setNote] = useState("")
  const [missing, setMissing] = useState(false)
  const [
    { files, isDragging, errors },
    {
      removeFile,
      openFileDialog,
      getInputProps,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
    },
  ] = useFileUpload({ accept: "image/*,application/pdf", maxSize: 10 * 1024 * 1024 })
  const file = files[0]

  return (
    <div className="flex flex-col gap-3">
      {file ? (
        <div className="border-border flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2">
          {file.preview && file.file.type?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.preview}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
          ) : (
            <IconTile variant="outline" size="sm" className="text-muted-foreground">
              <FileIcon aria-hidden="true" />
            </IconTile>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{file.file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${file.file.name}`}
            onClick={() => removeFile(file.id)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={openFileDialog}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              openFileDialog()
            }
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          data-dragging={isDragging || undefined}
          className="border-border hover:bg-muted/40 data-dragging:border-primary data-dragging:bg-primary/5 focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors duration-150 outline-none focus-visible:ring-[3px]"
        >
          <UploadIcon className="text-muted-foreground size-5" aria-hidden="true" />
          <span className="text-sm font-medium">Take a photo or upload a file</span>
          <span className="text-muted-foreground text-xs">
            Drop it here, or click to browse · JPG, PNG or PDF up to 10 MB
          </span>
        </div>
      )}
      <input {...getInputProps()} className="sr-only" aria-label="Upload file" tabIndex={-1} />
      {errors.length ? (
        <p className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircleIcon className="size-3.5" aria-hidden="true" />
          {errors[0]}
        </p>
      ) : null}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          missing
            ? "What did you buy, where, and what was it for? We'll write it up as a voucher for you to confirm."
            : "Add a note (optional)"
        }
        aria-label="Note"
        className="min-h-14 resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {allowMissing && !file ? (
          <button
            type="button"
            aria-pressed={missing}
            onClick={() => setMissing((m) => !m)}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 transition-colors duration-150"
          >
            {missing ? "I have it after all" : "I don't have it"}
          </button>
        ) : (
          <span />
        )}
        {missing && !file ? (
          <Button
            type="button"
            disabled={!note.trim()}
            onClick={() => onSend(`I don't have the receipt. ${note.trim()}`)}
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Send without it
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!file}
            onClick={() => {
              if (!file) return
              // Kept in the browser so the accountant can open the real file.
              if (file.file instanceof File) void saveFile(file.file)
              onSend(note.trim() || "Uploaded.", file.file.name)
            }}
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Send file
          </Button>
        )}
      </div>
      {missing && !file ? (
        <p className="text-muted-foreground text-xs text-pretty">
          Without a receipt the cost can still be booked, but the VAT on it can&apos;t be deducted.
        </p>
      ) : null}
    </div>
  )
}

function ConfirmAnswer({ onSend }: { onSend: (text: string) => void }) {
  const [note, setNote] = useState("")
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        aria-label="Note"
        className="min-h-14 resize-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => onSend(note.trim() ? `No. ${note.trim()}` : "No.")}>
          <XIcon data-icon="inline-start" aria-hidden="true" />
          No
        </Button>
        <Button type="button" onClick={() => onSend(note.trim() ? `Yes. ${note.trim()}` : "Yes, confirmed.")}>
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          Yes
        </Button>
      </div>
    </div>
  )
}

/** Height-animated collapsible panel (Base UI exposes the measured height). */
export const PANEL_MOTION =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"

/** One-shot staged entrance for the page's two chunks, 100ms apart. */
export const ENTER =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-snappy motion-reduce:slide-in-from-bottom-0"

// ── Timeline geometry (c-timeline-3): nodes and rail sit 1.75rem left ──

export const ITEM = "pb-8 group-data-[orientation=vertical]/timeline:ms-10 last:pb-0"
export const RAIL =
  "group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem)] group-data-[orientation=vertical]/timeline:translate-y-7"
export const NODE =
  "flex size-6 items-center justify-center group-data-[orientation=vertical]/timeline:-left-7"
/** The date line is as tall as a node, so the two read as one row. */
export const DATE = "mb-1 leading-6"

// ── The next-10-days band ──

/** "Now" is everything due within this many days (late ones included). */
const WINDOW_DAYS = 10
const horizon = new Date(today.getTime() + WINDOW_DAYS * DAY)

/** A soft tinted band behind the items in the window, rail included. */
const BAND =
  "relative before:bg-muted/70 before:absolute before:inset-y-0 before:-left-14 before:-right-4 before:-z-10"

/** The one date of ours each kind of task holds up. VAT, A-melding and
    payday follow from those, so they never repeat the ask. */
function holdsUp(kind: Deadline["kind"], request: CustomerRequest) {
  if (kind === "close") return request.domain === "bookkeeping"
  if (kind === "payrun") return request.domain === "payroll"
  return false
}

// ── What they've already sent ──

/** Whether the customer answered it themselves, rather than the firm
    closing or withdrawing it. */
function customerAnswered(request: CustomerRequest) {
  return Boolean(
    request.reply || request.answeredBy || request.thread?.some((t) => t.from === "customer")
  )
}

/** Where something they were sent stands now, in their words, and the
    firm's last word on it once it's closed. */
function sentState(request: CustomerRequest, accountantFirst: string) {
  const note =
    request.status === "resolved"
      ? request.thread?.findLast((t) => t.from === "accountant")?.text
      : undefined
  if (request.status !== "resolved") {
    const rejected = request.lines?.some((l) => l.decision === "rejected")
    return {
      label: rejected ? `${accountantFirst} is sorting out what you rejected` : `${accountantFirst} is checking`,
      note,
    }
  }
  if (request.resolution === "cancelled") return { label: "Withdrawn", note }
  if (!customerAnswered(request)) return { label: `Closed by ${accountantFirst}`, note }
  return { label: "Done", note }
}

function SentEntry({
  requests,
  accountantFirst,
}: {
  requests: CustomerRequest[]
  accountantFirst: string
}) {
  const checking = requests.filter((r) => r.status === "replied").length
  const answers = requests.filter(customerAnswered).length
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>Earlier this month</TimelineDate>
        <TimelineTitle className="text-foreground">
          {answers
            ? `You've sent ${answers} ${answers === 1 ? "answer" : "answers"}`
            : `${requests.length} ${requests.length === 1 ? "task" : "tasks"} closed`}
        </TimelineTitle>
        <TimelineIndicator className={cn(NODE, "bg-primary text-primary-foreground border-none")}>
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </TimelineIndicator>
      </TimelineHeader>
      <TimelineContent>
        <Collapsible className="group/sent">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {checking > 0
                ? `${accountantFirst} is checking ${checking === 1 ? "one of them" : `${checking} of them`}.`
                : "Nothing more needed from you."}
            </span>
            <CollapsibleTrigger
              type="button"
              className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 font-medium underline-offset-4 transition-colors duration-150 hover:underline"
            >
              <span className="group-data-open/sent:hidden">Show</span>
              <span className="hidden group-data-open/sent:inline">Hide</span>
              <ChevronDownIcon
                className="ease-snappy size-3.5 transition-[rotate] duration-200 group-data-open/sent:rotate-180"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className={PANEL_MOTION}>
            <ul className="mt-3 flex flex-col border-t">
              {requests.map((request) => {
                const { label, note } = sentState(request, accountantFirst)
                return (
                  <li key={request.id} className="flex min-w-0 flex-col gap-1 border-b py-2.5">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <span className="text-foreground min-w-0 flex-1 truncate">
                        {request.title}
                      </span>
                      <span className="shrink-0 text-xs">{label}</span>
                    </div>
                    {note ? (
                      <p className="text-muted-foreground text-xs leading-5 text-pretty">
                        {accountantFirst}: {note}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </TimelineContent>
    </>
  )
}

// ── One thing we need from them ──

/** The message, what it's about, and the answer controls. */
function TaskBody({
  request,
  onSent,
}: {
  request: CustomerRequest
  onSent: () => void
}) {
  const { state } = useAccounting()
  const client = CLIENT_BY_ID.get(request.clientId)!
  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId)!
  const item = request.itemId
    ? state.items.find((i) => i.id === request.itemId)
    : undefined
  const sendRaw = useSend(request, accountant.name.split(" ")[0])
  const send = (text: string, attachment?: string) => {
    sendRaw(text, attachment)
    onSent()
  }

  const [opening, ...rest] = conversation(request)

  return (
    <>
      <figure className="flex flex-col gap-1.5 border-l-2 pl-3">
        <blockquote className="text-foreground text-sm leading-5 text-pretty whitespace-pre-line">
          {request.message}
        </blockquote>
        <figcaption className="text-muted-foreground text-xs">
          {accountant.name} · {opening.time} ·{" "}
          <span className="font-mono tabular-nums">{request.id}</span>
        </figcaption>
      </figure>
      {item ? <TaskContext item={item} /> : null}
      {/* A follow-up: what was said since the first question. */}
      {rest.map((turn) => (
        <PortalTurn key={turn.id} turn={turn} accountantName={accountant.name} />
      ))}
      <Separator />
      {request.responseType === "approval" ? (
        <ApprovalAnswer request={request} onSent={onSent} />
      ) : request.responseType === "checkin" ? (
        <CheckinAnswer request={request} onSent={onSent} />
      ) : request.responseType === "text" ? (
        <TextAnswer onSend={(text) => send(text)} />
      ) : request.responseType === "choice" ? (
        <ChoiceAnswer
          options={request.options ?? ["Yes", "No"]}
          onSend={(text) => send(`Picked: ${text}`)}
        />
      ) : request.responseType === "file" ? (
        <FileAnswer
          allowMissing={request.kind === "missing_receipt" || /receipt/i.test(request.title)}
          onSend={(text, file) => send(text, file)}
        />
      ) : (
        <ConfirmAnswer onSend={(text) => send(text)} />
      )}
    </>
  )
}

/** "Fri 2 Oct · in 4 days", with the relative part red when pressing. */
function DueText({ date, prefix = "Due " }: { date: Date; prefix?: string }) {
  const days = daysFrom(date)
  return (
    <>
      {prefix}
      {formatDay.format(date)}
      <span aria-hidden="true"> · </span>
      <span
        className={cn(
          isPressing(days) ? "text-destructive font-semibold" : "text-muted-foreground"
        )}
      >
        {relative(days)}
      </span>
    </>
  )
}

/** The task as a collapsible card; `aside` sits before the chevron. */
function TaskCard({
  request,
  open,
  onOpenChange,
  onSent,
  aside,
}: {
  request: CustomerRequest
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
  aside?: ReactNode
}) {
  return (
    <Frame
      dense
      spacing="sm"
      className={cn("transition-shadow duration-200", open && "shadow-md")}
    >
      <Collapsible open={open} onOpenChange={onOpenChange} className="group/task">
        <CollapsibleTrigger type="button" className="flex w-full text-left">
          <FrameHeader className="flex grow flex-row items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <TimelineTitle
                render={<span />}
                className="text-foreground text-[15px] leading-5 font-semibold text-pretty"
              >
                {request.title}
              </TimelineTitle>
              <span className="text-muted-foreground text-xs">
                {ASK[request.responseType]}
                {request.round > 1 ? " · follow-up" : ""}
              </span>
            </div>
            {aside}
            <ChevronDownIcon
              className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/task:rotate-180"
              aria-hidden="true"
            />
          </FrameHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className={PANEL_MOTION}>
          <FramePanel className="flex flex-col gap-4">
            <TaskBody request={request} onSent={onSent} />
          </FramePanel>
        </CollapsibleContent>
      </Collapsible>
    </Frame>
  )
}

function TaskEntry({
  request,
  date,
  open,
  onOpenChange,
  onSent,
  hot = false,
}: {
  request: CustomerRequest
  date: Date
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
  /** Inside the next-10-days band: the days left become a red tag. */
  hot?: boolean
}) {
  const days = daysFrom(date)
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        {hot ? (
          <TimelineDate className={cn(DATE, "text-foreground flex items-center justify-between gap-2")}>
            Due {formatDay.format(date)}
            <Badge variant={isPressing(days) ? "destructive" : "destructive-light"} size="default">
              {relative(days)}
            </Badge>
          </TimelineDate>
        ) : (
          <TimelineDate className={cn(DATE, "text-foreground")}>
            <DueText date={date} />
          </TimelineDate>
        )}
        {/* A small point on the rail: the date carries the meaning. */}
        <TimelineIndicator
          className={cn(
            NODE,
            "bg-background border-foreground/70 size-2.5 group-data-[orientation=vertical]/timeline:top-[7px]",
            hot && isPressing(days) && "bg-destructive border-destructive"
          )}
        />
      </TimelineHeader>
      <TimelineContent>
        <TaskCard
          request={request}
          open={open}
          onOpenChange={onOpenChange}
          onSent={onSent}
        />
      </TimelineContent>
    </>
  )
}

/** Where "now" is on the rail. `children` sit under it. */
function TodayEntry({ note }: { note?: ReactNode }) {
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>{formatDay.format(today)}</TimelineDate>
        <TimelineTitle className="text-foreground">Today</TimelineTitle>
        <TimelineIndicator
          className={cn(NODE, "bg-primary ring-primary/10 border-none ring-4")}
        >
          <span className="bg-primary-foreground size-2 rounded-full" />
        </TimelineIndicator>
      </TimelineHeader>
      {note ? <TimelineContent>{note}</TimelineContent> : null}
    </>
  )
}

// ── One of our dates ──

function MilestoneEntry({
  deadline,
  date,
  monthLabel,
  waitingOn,
}: {
  deadline: Deadline
  date: Date
  monthLabel: string
  /** How many of the customer's open tasks this date is waiting on. */
  waitingOn: number
}) {
  const title =
    deadline.kind === "close"
      ? `We close ${monthLabel}`
      : MILESTONE_COPY[deadline.kind]
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>{formatDay.format(date)}</TimelineDate>
        <TimelineTitle
          className={waitingOn ? "text-foreground" : "text-muted-foreground font-normal"}
        >
          {title}
        </TimelineTitle>
        <TimelineIndicator
          className={cn(
            NODE,
            "bg-background border-muted-foreground/30 size-3 group-data-[orientation=vertical]/timeline:top-1.5"
          )}
        />
      </TimelineHeader>
      {/* Only dates that depend on the customer say anything more. */}
      {waitingOn ? (
        <TimelineContent>
          {waitingOn === 1
            ? "Waiting for your answer above."
            : `Waiting for ${waitingOn} of your answers above.`}
        </TimelineContent>
      ) : null}
    </>
  )
}

// ── Conversations the customer started ──

/** One turn, from the customer's side: their words are "You". */
function PortalTurn({
  turn,
  accountantName,
}: {
  turn: ConversationTurn
  accountantName: string
}) {
  const mine = turn.from === "customer"
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        mine ? "bg-muted/60 rounded-lg px-3 py-2.5" : "border-l-2 pl-3"
      )}
    >
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium">
          {mine ? "You" : accountantName}
        </span>
        {" · "}
        {turn.time}
      </p>
      <p className="text-foreground text-sm leading-5 text-pretty whitespace-pre-line">
        {turn.text}
      </p>
      {turn.attachment ? (
        <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-xs">
          <PaperclipIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{turn.attachment}</span>
        </span>
      ) : null}
    </div>
  )
}

/** A compact "attach a file" control for messages. */
function AttachFile({
  onChange,
}: {
  onChange: (name: string | undefined) => void
}) {
  const [{ files, errors }, { removeFile, openFileDialog, getInputProps }] =
    useFileUpload({
      accept: "image/*,application/pdf",
      maxSize: 10 * 1024 * 1024,
      onFilesChange: (next) => {
        const picked = next[0]?.file
        // Kept in the browser so the accountant can open the real file.
        if (picked instanceof File) void saveFile(picked)
        onChange(picked?.name)
      },
    })
  const file = files[0]
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {file ? (
        <span className="border-border inline-flex h-8 min-w-0 items-center gap-1.5 self-start rounded-md border ps-2.5 pe-1 text-sm">
          <PaperclipIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          <span className="max-w-48 truncate">{file.file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${file.file.name}`}
            onClick={() => removeFile(file.id)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </span>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={openFileDialog}>
          <PaperclipIcon data-icon="inline-start" aria-hidden="true" />
          Attach a file
        </Button>
      )}
      <input {...getInputProps()} className="sr-only" aria-label="Attach a file" tabIndex={-1} />
      {errors.length ? (
        <p className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircleIcon className="size-3.5" aria-hidden="true" />
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}

/** What the question is about, in the customer's words. The accountant
    sees it as bookkeeping, payroll or general. */
const TOPICS: { value: Domain | "general"; label: string }[] = [
  { value: "bookkeeping", label: "Bills, receipts & bank" },
  { value: "payroll", label: "Salaries & employees" },
  { value: "general", label: "Something else" },
]

/** Asking the accountant: what it's about, a subject, the message, a file. */
function AskForm({
  clientId,
  contactId,
  accountantFirst,
  onSent,
  onCancel,
  autoFocus,
  initialTitle = "",
  placeholder,
}: {
  clientId: string
  contactId: string
  accountantFirst: string
  onSent?: () => void
  onCancel?: () => void
  autoFocus?: boolean
  /** Prefilled subject, e.g. when asking about a report. */
  initialTitle?: string
  placeholder?: string
}) {
  const { dispatch } = useAccounting()
  const id = useId()
  const [topic, setTopic] = useState<Domain | "general">("general")
  const [title, setTitle] = useState(initialTitle)
  const [text, setText] = useState("")
  const [attachment, setAttachment] = useState<string | undefined>()
  // Remount the file picker with each fresh form.
  const [formKey, setFormKey] = useState(0)
  const ready = title.trim() && text.trim()

  function submit() {
    if (!ready) return
    dispatch({
      type: "customer_ask",
      clientId,
      contactId,
      domain: topic,
      title: title.trim(),
      text: text.trim(),
      attachment,
    })
    toast.success(`Sent to ${accountantFirst}`, {
      description: "You'll see the answer here.",
    })
    setTopic("general")
    setTitle(initialTitle)
    setText("")
    setAttachment(undefined)
    setFormKey((k) => k + 1)
    onSent?.()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel id={`${id}-topic`}>What is it about?</FieldLabel>
          <RadioGroup
            aria-labelledby={`${id}-topic`}
            value={topic}
            onValueChange={(v) => setTopic(v as Domain | "general")}
            className="grid gap-2 sm:grid-cols-3"
          >
            {TOPICS.map((t) => (
              <label
                key={t.value}
                className={cn(
                  "border-border hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150",
                  "has-data-checked:border-primary has-data-checked:bg-primary/5"
                )}
              >
                <RadioGroupItem value={t.value} />
                {t.label}
              </label>
            ))}
          </RadioGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-title`}>Subject</FieldLabel>
          <Input
            id={`${id}-title`}
            value={title}
            autoFocus={autoFocus && !initialTitle}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New employee starting in December"
            autoComplete="off"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>Message</FieldLabel>
          <Textarea
            id={`${id}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? `Hi ${accountantFirst}, …`}
            autoFocus={autoFocus && Boolean(initialTitle)}
            className="min-h-28 resize-none"
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <AttachFile key={formKey} onChange={setAttachment} />
        <div className="flex gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={!ready}>
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Send to {accountantFirst}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Where a question stands, from the customer's side. */
function questionState(request: CustomerRequest, accountantFirst: string) {
  if (request.status === "resolved") return { label: "Done", fresh: false }
  if (request.status === "sent")
    return { label: `${accountantFirst} answered`, fresh: true }
  return { label: `Waiting for ${accountantFirst}`, fresh: false }
}

/** The customer's side of the thread: answer, or say it's settled. */
function QuestionReply({
  request,
  accountantFirst,
}: {
  request: CustomerRequest
  accountantFirst: string
}) {
  const { dispatch } = useAccounting()
  const [text, setText] = useState("")
  const [attachment, setAttachment] = useState<string | undefined>()
  const [formKey, setFormKey] = useState(0)

  function send() {
    const body = text.trim()
    if (!body && !attachment) return
    dispatch({
      type: "customer_message",
      requestId: request.id,
      text: body || "Attached.",
      attachment,
    })
    setText("")
    setAttachment(undefined)
    setFormKey((k) => k + 1)
    toast.success(`Sent to ${accountantFirst}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          request.status === "sent" ? `Reply to ${accountantFirst}…` : "Add something…"
        }
        aria-label={`Message to ${accountantFirst}`}
        className="min-h-16 resize-none"
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <AttachFile key={formKey} onChange={setAttachment} />
        <div className="flex flex-wrap items-center gap-2">
          {request.status === "sent" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dispatch({ type: "resolve_request", requestId: request.id })
                toast.success("Marked as done", { description: request.title })
              }}
            >
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
              That answers it
            </Button>
          ) : null}
          <Button type="button" disabled={!text.trim() && !attachment} onClick={send}>
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The whole conversation, then the customer's reply box while it's open. */
function QuestionThread({
  request,
  accountantName,
}: {
  request: CustomerRequest
  accountantName: string
}) {
  return (
    <>
      {conversation(request).map((turn) => (
        <PortalTurn key={turn.id} turn={turn} accountantName={accountantName} />
      ))}
      {request.status !== "resolved" ? (
        <>
          <Separator />
          <QuestionReply
            request={request}
            accountantFirst={accountantName.split(" ")[0]}
          />
        </>
      ) : null}
    </>
  )
}

function QuestionCard({
  request,
  accountantName,
  open,
  onOpenChange,
}: {
  request: CustomerRequest
  accountantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const accountantFirst = accountantName.split(" ")[0]
  const status = questionState(request, accountantFirst)
  return (
    <Frame
      dense
      spacing="sm"
      className={cn("transition-shadow duration-200", open && "shadow-md")}
    >
      <Collapsible open={open} onOpenChange={onOpenChange} className="group/task">
        <CollapsibleTrigger type="button" className="flex w-full text-left">
          <FrameHeader className="flex grow flex-row items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground truncate text-[15px] leading-5 font-semibold">
                {request.title}
              </span>
              <span className="text-muted-foreground text-xs">
                Asked {request.sentAt}
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{request.id}</span>
              </span>
            </div>
            <Badge
              variant={
                status.fresh ? "info-light" : request.status === "resolved" ? "success-light" : "outline"
              }
              className="shrink-0"
            >
              {status.label}
            </Badge>
            <ChevronDownIcon
              className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/task:rotate-180"
              aria-hidden="true"
            />
          </FrameHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className={PANEL_MOTION}>
          <FramePanel className="flex flex-col gap-3">
            <QuestionThread request={request} accountantName={accountantName} />
          </FramePanel>
        </CollapsibleContent>
      </Collapsible>
    </Frame>
  )
}

/** The customer's questions, answered ones open so the answer is seen. */
function QuestionList({
  questions,
  accountantName,
}: {
  questions: CustomerRequest[]
  accountantName: string
}) {
  const [openIds, setOpenIds] = useState<Set<string> | null>(null)
  const isOpen = (r: CustomerRequest) =>
    openIds ? openIds.has(r.id) : r.status === "sent"
  return (
    <div className="flex flex-col gap-2">
      {questions.map((request) => (
        <QuestionCard
          key={request.id}
          request={request}
          accountantName={accountantName}
          open={isOpen(request)}
          onOpenChange={(next) => {
            const ids = new Set(
              openIds ?? questions.filter((q) => q.status === "sent").map((q) => q.id)
            )
            if (next) ids.add(request.id)
            else ids.delete(request.id)
            setOpenIds(ids)
          }}
        />
      ))}
    </div>
  )
}

// ── Page ──

/** The app's neutral theme, nudged a few degrees warm for the customer's
    side: paper instead of screen. Both token layers are set, because ReUI's
    Frame reads var(--color-x), which :root has already resolved. */
const WARM_PAPER = (() => {
  const tokens: Record<string, string> = {
    background: "oklch(0.993 0.004 85)",
    foreground: "oklch(0.17 0.008 60)",
    card: "oklch(0.998 0.003 85)",
    "card-foreground": "oklch(0.17 0.008 60)",
    popover: "oklch(0.998 0.003 85)",
    "popover-foreground": "oklch(0.17 0.008 60)",
    primary: "oklch(0.22 0.01 60)",
    "primary-foreground": "oklch(0.985 0.004 85)",
    secondary: "oklch(0.966 0.006 80)",
    "secondary-foreground": "oklch(0.22 0.01 60)",
    muted: "oklch(0.966 0.006 80)",
    "muted-foreground": "oklch(0.53 0.012 65)",
    accent: "oklch(0.966 0.006 80)",
    "accent-foreground": "oklch(0.22 0.01 60)",
    border: "oklch(0.915 0.008 75)",
    input: "oklch(0.915 0.008 75)",
    ring: "oklch(0.7 0.012 70)",
  }
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(tokens)) {
    style[`--${name}`] = value
    style[`--color-${name}`] = value
  }
  return style as CSSProperties
})()

/** Everything the portal shows, worked out once per render. */
function usePortal(clientId: string, contactId?: string | null) {
  const { state } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)!
  const contact = client.contacts.find((c) => c.id === contactId) ?? client.contacts[0]
  // A task is for the contact it was sent to. One sent to someone who isn't
  // a contact any more falls to the main contact.
  const forContact = (r: CustomerRequest) =>
    r.recipientId === contact.id ||
    (contact.id === client.contacts[0].id && !client.contacts.some((c) => c.id === r.recipientId))
  const accountant = ACCOUNTANT_BY_ID.get(client.accountantId)!
  const accountantFirst = accountant.name.split(" ")[0]
  const monthLabel =
    MONTHS.find((m) => m.id === state.month)?.label.split(" ")[0] ??
    monthName(state.month)

  // Drafts never reach the customer: only what the accountant sent. Earlier
  // months are history the customer doesn't need here.
  const visible = state.requests.filter(
    (r) => r.clientId === clientId && r.status !== "draft"
  )
  // What the firm asked for runs on the timeline; what the customer asked
  // is a conversation of its own.
  const asked = visible.filter((r) => r.origin !== "customer")
  const own = asked.filter(forContact)
  // Waiting on the other contacts, so the page can say so.
  const others = client.contacts
    .filter((c) => c.id !== contact.id)
    .map((person) => ({
      person,
      count: asked.filter((r) => r.status === "sent" && r.recipientId === person.id).length,
    }))
    .filter((o) => o.count > 0)
  const rank = { sent: 0, replied: 1, resolved: 2, draft: 3 }
  const questions = visible
    .filter(
      (r) =>
        r.origin === "customer" &&
        (r.status !== "resolved" || r.period === state.month)
    )
    .sort((a, b) => rank[a.status] - rank[b.status])
  const answered = questions.filter((r) => r.status === "sent").length
  const pending = own
    .filter((r) => r.status === "sent")
    .map((request) => ({ request, date: parseDue(request.due) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const sent = own.filter(
    (r) =>
      r.status === "replied" || (r.status === "resolved" && r.period === state.month)
  )
  const closed = getMonthClose(state, clientId, state.month).closed
  const milestones = getClientDeadlines(client, state.month, state.items, state.requests, state)
    // Once the month is closed (and its report sent), its close date is past.
    .filter((d) => d.status !== "done" && !(closed && d.kind === "close"))
    .map((deadline) => ({ deadline, date: new Date(`${deadline.date}T00:00:00`) }))
    .filter(({ date }) => daysFrom(date) >= 0)
  // Now: everything due within the band (late ones included).
  const now = pending.filter((p) => daysFrom(p.date) <= WINDOW_DAYS)

  return {
    clientId,
    client,
    contact,
    accountant,
    accountantFirst,
    monthLabel,
    questions,
    answered,
    pending,
    sent,
    milestones,
    now,
    others,
  }
}

type Portal = ReturnType<typeof usePortal>

/** The warm page and its centred column. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-svh w-full" style={WARM_PAPER}>
      <main className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-12 sm:py-16">
        {children}
      </main>
    </div>
  )
}

/** Firm, customer and hello, and who the page is seen as when the company
    has more than one contact. */
function PortalGreeting({
  portal,
  onContactChange,
}: {
  portal: Portal
  onContactChange: (contactId: string) => void
}) {
  const contacts = portal.client.contacts
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
          <IconTile variant="solid" size="xs">
            <LandmarkIcon aria-hidden="true" />
          </IconTile>
          <span className="text-foreground font-medium">Sanna</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{portal.client.name}</span>
        </p>
        {contacts.length > 1 ? (
          <Select
            value={portal.contact.id}
            items={contacts.map((c) => ({ value: c.id, label: c.name }))}
            onValueChange={(value) => value && onContactChange(value)}
          >
            <SelectTrigger size="sm" aria-label="Viewing as" className="text-muted-foreground gap-1.5">
              <span className="text-xs">Viewing as</span>
              <SelectValue className="text-foreground" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    <span className="text-muted-foreground"> · {c.role}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <h1 className="text-foreground text-3xl font-semibold tracking-tight">
        Hi {portal.contact.name.split(" ")[0]}
      </h1>
    </div>
  )
}

type Tile = { label: string; value: string; hint: string; urgent?: boolean }

/** The three facts a customer comes back for. */
function PortalTiles({ portal }: { portal: Portal }) {
  const { pending, now, sent, accountantFirst } = portal
  const first = pending[0]
  const tiles: Tile[] = [
    {
      label: "To send",
      value: String(pending.length),
      hint: now.length
        ? `${now.length} due by ${formatDay.format(horizon)}`
        : "Nothing due soon",
    },
    {
      label: "Next due",
      value: first ? formatDay.format(first.date) : "—",
      hint: first ? relative(daysFrom(first.date)) : "Nothing to send",
      urgent: first ? isPressing(daysFrom(first.date)) : false,
    },
    {
      label: "Sent this month",
      value: String(sent.length),
      hint: sent.some((r) => r.status === "replied")
        ? `${accountantFirst} is on it`
        : sent.length
          ? "All settled"
          : "Nothing yet",
    },
  ]
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="bg-card flex flex-col gap-1 rounded-xl border p-4 shadow-xs"
        >
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-foreground text-2xl font-semibold tracking-tight tabular-nums">
            {tile.value}
          </dd>
          <dd
            className={cn(
              "text-xs",
              tile.urgent ? "text-destructive font-medium" : "text-muted-foreground"
            )}
          >
            {tile.hint}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The rail: what was sent, today, what's due, and our dates. */
function PortalTimeline({ portal }: { portal: Portal }) {
  const { pending, sent, now, milestones, accountantFirst, monthLabel } = portal
  const { state } = useAccounting()

  // One accordion: the first task is open until the customer picks another;
  // after an answer, focus moves on to the next one.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)

  // A task can close on the firm's side while it sits here: sorted out on
  // the phone, withdrawn, replaced. Say so, rather than let it vanish.
  const answeredHere = useRef(new Set<string>())
  const pendingIds = pending.map((p) => p.request.id).join(",")
  const before = useRef(pendingIds)
  useEffect(() => {
    const was = before.current.split(",").filter(Boolean)
    before.current = pendingIds
    const still = new Set(pendingIds.split(","))
    for (const id of was) {
      if (still.has(id) || answeredHere.current.has(id)) continue
      const request = state.requests.find((r) => r.id === id)
      if (!request || request.status !== "resolved") continue
      const said = request.thread?.findLast((t) => t.from === "accountant")?.text
      toast.message(`${accountantFirst} closed “${request.title}”`, {
        description: said ?? "Nothing more needed from you.",
      })
    }
  }, [pendingIds, state.requests, accountantFirst])
  const sentHere = (id: string) => () => {
    answeredHere.current.add(id)
    setOpenId(undefined)
  }
  const activeId =
    openId === undefined || (openId && !pending.some((p) => p.request.id === openId))
      ? pending[0]?.request.id
      : openId

  // Later tasks and our own dates follow on the plain rail, in date order.
  const laterEntries = [
    ...pending
      .filter((p) => daysFrom(p.date) > WINDOW_DAYS)
      .map((p) => ({ kind: "task" as const, date: p.date, p })),
    ...milestones.map((m) => ({ kind: "milestone" as const, date: m.date, m })),
  ].sort(
    // Same day: the customer's task before the date it feeds into.
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      Number(a.kind === "milestone") - Number(b.kind === "milestone")
  )
  const hasSent = sent.length > 0
  // Everything up to today is behind us: the rail is solid to here.
  const todayStep = hasSent ? 2 : 1

  return (
    <Timeline value={todayStep} className="isolate">
      {hasSent ? (
        <TimelineItem step={1} className={ITEM}>
          <SentEntry requests={sent} accountantFirst={accountantFirst} />
        </TimelineItem>
      ) : null}
      <TimelineItem
        step={todayStep}
        className={cn(
          ITEM,
          BAND,
          "before:-top-4 before:rounded-t-2xl",
          now.length === 0 && "before:rounded-b-2xl"
        )}
      >
        <TodayEntry
          note={
            now.length ? (
              <>
                <span className="text-foreground font-medium">Next 10 days</span>
                {` · ${now.length} to send by ${formatDay.format(horizon)}`}
              </>
            ) : (
              "Nothing due in the next 10 days."
            )
          }
        />
      </TimelineItem>
      {now.map((p, index) => {
        const id = p.request.id
        const last = index === now.length - 1
        return (
          <TimelineItem
            key={id}
            step={todayStep + 1 + index}
            className={cn(ITEM, BAND, last && "before:rounded-b-2xl")}
          >
            <TaskEntry
              request={p.request}
              date={p.date}
              open={activeId === id}
              onOpenChange={(open) => setOpenId(open ? id : null)}
              onSent={sentHere(id)}
              hot
            />
          </TimelineItem>
        )
      })}
      {laterEntries.map((entry, index) => {
        const step = todayStep + 1 + now.length + index
        if (entry.kind === "task") {
          const id = entry.p.request.id
          return (
            <TimelineItem key={id} step={step} className={ITEM}>
              <TaskEntry
                request={entry.p.request}
                date={entry.p.date}
                open={activeId === id}
                onOpenChange={(open) => setOpenId(open ? id : null)}
                onSent={sentHere(id)}
              />
            </TimelineItem>
          )
        }
        return (
          <TimelineItem key={entry.m.deadline.id} step={step} className={ITEM}>
            <MilestoneEntry
              deadline={entry.m.deadline}
              date={entry.m.date}
              monthLabel={monthLabel}
              waitingOn={
                pending.filter((p) => holdsUp(entry.m.deadline.kind, p.request)).length
              }
            />
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}

/** Asking, always on the page: a prompt that opens the ask dialog. */
function AskBox({ portal, onOpen }: { portal: Portal; onOpen: () => void }) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"

  return (
    // The beam draws the eye to the prompt.
    <BorderBeam size="md" colorVariant="ocean" theme={theme} strength={0.6}>
      <div className="bg-card rounded-2xl border p-3 shadow-xs">
        <button
          type="button"
          onClick={onOpen}
          className="text-muted-foreground hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-150 outline-none focus-visible:ring-[3px]"
        >
          <BotAvatar type="flower" size={24} theme={theme} aria-hidden="true" />
          <span className="flex-1">Ask {portal.accountantFirst} anything…</span>
          <MessageCirclePlusIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
    </BorderBeam>
  )
}

/** Sending a bill, a receipt or an expense: next to asking, the other
    thing a customer comes to the app to do. */
function SendBox({ portal, onOpen }: { portal: Portal; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/50 -mt-3 flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-[3px]"
    >
      <ReceiptTextIcon className="size-4" aria-hidden="true" />
      Send {portal.accountantFirst} a bill, a receipt or someone&apos;s expense
    </button>
  )
}

const SEND_TYPES: { value: SentDocument["type"]; label: string; hint: string }[] = [
  { value: "bill", label: "A bill to pay", hint: "An invoice the company hasn't paid yet" },
  { value: "receipt", label: "A card receipt", hint: "Paid with the company card or Vipps" },
  { value: "expense", label: "Someone's expense", hint: "An employee paid with their own money" },
]

function SendDocumentDialog({
  portal,
  open,
  onOpenChange,
}: {
  portal: Portal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch } = useAccounting()
  const id = useId()
  const [type, setType] = useState<SentDocument["type"]>("bill")
  const [supplier, setSupplier] = useState("")
  const [date, setDate] = useState(TODAY)
  const [due, setDue] = useState("")
  const [amount, setAmount] = useState("")
  const [employee, setEmployee] = useState("")
  const [note, setNote] = useState("")
  const [file, setFile] = useState<string | undefined>()
  const [formKey, setFormKey] = useState(0)
  // One array per change of the store: the Select reads `items` in an
  // effect, and a new array every render would loop.
  const people = useMemo(
    () => employeesOf(state, portal.clientId).filter((e) => !e.end || e.end >= TODAY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.people, state.onboarding, state.requests, state.items, portal.clientId]
  )
  const employeeItems = useMemo(() => people.map((p) => ({ value: p.name, label: p.name })), [people])
  const kr = Number(amount.replace(/\s/g, "").replace(",", "."))
  const ready = supplier.trim() && kr > 0 && date && (type !== "expense" || employee)

  function reset() {
    setType("bill")
    setSupplier("")
    setDate(TODAY)
    setDue("")
    setAmount("")
    setEmployee("")
    setNote("")
    setFile(undefined)
    setFormKey((k) => k + 1)
  }

  function submit() {
    if (!ready) return
    dispatch({
      type: "documents",
      action: {
        type: "customer_document",
        clientId: portal.clientId,
        contactId: portal.contact.id,
        doc: {
          type,
          supplier: supplier.trim(),
          date,
          // A bill without a due date is due in 14 days, like most terms.
          dueDate: type === "bill" ? due || addDays(date, 14) : undefined,
          amount: kr,
          employee: type === "expense" ? employee : undefined,
          note: note.trim() || undefined,
          file,
        },
      },
    })
    toast.success(`Sent to ${portal.accountantFirst}`, {
      description:
        type === "expense"
          ? `${employee.split(" ")[0]} gets it back with the pay on ${dayLabel(refundDay(portal.clientId))}.`
          : type === "receipt"
            ? `${portal.accountantFirst} books it from the card payment it belongs to.`
            : `${portal.accountantFirst} books it and it's paid on the due date.`,
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={WARM_PAPER} className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {portal.accountantFirst} a document</DialogTitle>
          <DialogDescription>
            Any month, even one that&apos;s closed: {portal.accountantFirst} books it where it belongs.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel id={`${id}-type`}>What is it?</FieldLabel>
              <RadioGroup
                aria-labelledby={`${id}-type`}
                value={type}
                onValueChange={(v) => setType(v as SentDocument["type"])}
                className="grid gap-2 sm:grid-cols-3"
              >
                {SEND_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      "border-border hover:bg-muted/40 flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors duration-150",
                      "has-data-checked:border-primary has-data-checked:bg-primary/5"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <RadioGroupItem value={t.value} />
                      {t.label}
                    </span>
                    <span className="text-muted-foreground text-xs">{t.hint}</span>
                  </label>
                ))}
              </RadioGroup>
            </Field>
            {type === "expense" ? (
              <Field>
                <FieldLabel htmlFor={`${id}-employee`}>Who paid?</FieldLabel>
                <Select value={employee} onValueChange={(v) => v && setEmployee(String(v))} items={employeeItems}>
                  <SelectTrigger id={`${id}-employee`} className="w-full">
                    <SelectValue placeholder="Pick the employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem_8rem]">
              <Field>
                <FieldLabel htmlFor={`${id}-supplier`}>{type === "bill" ? "From" : "Shop"}</FieldLabel>
                <Input
                  id={`${id}-supplier`}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder={type === "bill" ? "Bama Storkjøkken AS" : "Clas Ohlson"}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
                <Input id={`${id}-date`} type="date" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-amount`}>Amount, kr</FieldLabel>
                <Input
                  id={`${id}-amount`}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1 249"
                  className="tabular-nums"
                />
              </Field>
              {type === "bill" ? (
                <Field className="sm:col-start-2">
                  <FieldLabel htmlFor={`${id}-due`}>Due</FieldLabel>
                  <Input
                    id={`${id}-due`}
                    type="date"
                    value={due || addDays(date, 14)}
                    min={date}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
            <Field>
              <FieldLabel htmlFor={`${id}-note`}>What was it for?</FieldLabel>
              <Textarea
                id={`${id}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type === "expense" ? "Milk jugs for the counter, the shop was out" : "Optional"}
                className="min-h-16 resize-none"
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <AttachFile key={formKey} onChange={setFile} />
            <Button type="submit" disabled={!ready}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send to {portal.accountantFirst}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** What the ask dialog opens with: empty, or about a report. */
type AskDraft = { title: string; placeholder?: string }

/** Asking the accountant, in a dialog over whatever the customer was
    looking at. The page's warm tokens go with it: the dialog renders
    outside the page. */
function AskDialog({
  portal,
  draft,
  onOpenChange,
  onSent,
}: {
  portal: Portal
  draft: AskDraft | null
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent style={WARM_PAPER} className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask {portal.accountantFirst}</DialogTitle>
          <DialogDescription>
            The answer comes back here, under Your questions.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <AskForm
            clientId={portal.clientId}
            contactId={portal.contact.id}
            accountantFirst={portal.accountantFirst}
            initialTitle={draft.title}
            placeholder={draft.placeholder}
            onSent={onSent}
            onCancel={() => onOpenChange(false)}
            autoFocus
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Nothing asked yet: what asking is for, and the way in. */
function NoQuestions({ portal, onAsk }: { portal: Portal; onAsk: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
      <MessagesSquareIcon className="text-muted-foreground size-5" aria-hidden="true" />
      <p className="text-muted-foreground max-w-xs text-sm text-pretty">
        Questions you send {portal.accountantFirst} show up here with the answers.
      </p>
      <Button type="button" variant="outline" onClick={onAsk}>
        <MessageCirclePlusIcon data-icon="inline-start" aria-hidden="true" />
        Ask {portal.accountantFirst}
      </Button>
    </div>
  )
}

// ── Your numbers: the monthly report ──

/** Asking about the report in view: the subject is filled in, so the
    accountant knows which numbers the question is about. */
function AskAboutNumbers({
  portal,
  label,
  onAsk,
}: {
  portal: Portal
  label: string
  onAsk: (draft: AskDraft) => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      onClick={() =>
        onAsk({
          title: `About the ${label} numbers`,
          placeholder: `Hi ${portal.accountantFirst}, I don't understand…`,
        })
      }
    >
      <MessageCirclePlusIcon data-icon="inline-start" aria-hidden="true" />
      Ask {portal.accountantFirst} about these numbers
    </Button>
  )
}

function PortalReport({
  portal,
  month,
  onMonthChange,
  onAsk,
}: {
  portal: Portal
  month: string | undefined
  onMonthChange: (month: string) => void
  onAsk: (draft: AskDraft) => void
}) {
  const { state } = useAccounting()
  const published = publishedMonths(state.closing, portal.clientId)
  const shown = month && published.includes(month) ? month : published[0]
  const openClosed = published.includes(OPEN_MONTH)
  const closeDate = portal.milestones.find((m) => m.deadline.kind === "close")?.date

  if (!shown) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
        <ChartColumnIcon className="text-muted-foreground size-5" aria-hidden="true" />
        <p className="text-muted-foreground max-w-xs text-sm text-pretty">
          Your first monthly overview shows up here when we close a month.
        </p>
      </div>
    )
  }

  const report = buildReport(portal.clientId, shown)
  const close = getMonthClose(state, portal.clientId, shown)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Newest first: the months we've closed and reported on. */}
        <div role="group" aria-label="Month" className="flex flex-wrap gap-1.5">
          {published.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={m === shown ? "default" : "outline"}
              aria-pressed={m === shown}
              onClick={() => onMonthChange(m)}
            >
              {longMonth(m)}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            toast.message("Board pack", {
              description: `In the product this downloads ${report.label} as a PDF with the full accounts from Tripletex.`,
            })
          }
        >
          <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          PDF for the board
        </Button>
      </div>

      {!openClosed && shown === published[0] ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {longMonth(OPEN_MONTH)} comes when we close the month
          {closeDate ? `, by ${formatDay.format(closeDate)}` : ""}.
        </p>
      ) : null}

      <MonthlyReportView
        report={report}
        note={
          <ReportNote
            note={close.note}
            author={portal.accountant}
            meta={
              <span>
                {report.label}
                {/* Closed again after a reopen: the customer sees it changed. */}
                {reportVersion(portal.clientId, shown, state) > 1
                  ? ` · Updated report, ${close.closedAt}`
                  : ""}
              </span>
            }
          />
        }
      />
      <AskAboutNumbers portal={portal} label={longMonth(shown)} onAsk={onAsk} />
    </div>
  )
}

/** Where the business stands today (preview): the balance sheet's overview,
    with every account month by month one click away. */
function PortalBalance({
  portal,
  onAsk,
}: {
  portal: Portal
  onAsk: (draft: AskDraft) => void
}) {
  const { state } = useAccounting()
  const sheet = buildBalanceSheet(portal.clientId, state.items)
  const month = sheet.months.at(-1)!
  const provisional = sheet.months.filter(
    (m) => m >= MONTHS.at(-1)!.id && !isMonthClosed(portal.clientId, m, state)
  )
  return (
    <div className="@container/balances flex flex-col gap-6">
      <p className="text-muted-foreground text-sm text-pretty">
        Your company on {asOfLabel(month)}: what it owns, what it owes and how the year is going.
        {provisional.includes(month)
          ? ` We're still booking ${longMonth(month)}, so these can move a little.`
          : ""}
      </p>
      <BalanceTiles sheet={sheet} month={month} />
      <OwnAndOwe sheet={sheet} month={month} />
      <Collapsible>
        <CollapsibleTrigger
          render={<Button type="button" variant="outline" size="sm" className="self-start" />}
        >
          Every account, month by month
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="bg-card rounded-xl border shadow-xs">
            <BalanceTable sheet={sheet} month={month} provisional={provisional} />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <AskAboutNumbers portal={portal} label="balance sheet" onAsk={onAsk} />
    </div>
  )
}

function PortalNumbers(props: {
  portal: Portal
  month: string | undefined
  onMonthChange: (month: string) => void
  onAsk: (draft: AskDraft) => void
}) {
  const [settings] = useSettings()
  const [view, setView] = useState<"report" | "balance">("report")
  if (!settings.balances) return <PortalReport {...props} />
  return (
    <div className="flex flex-col gap-6">
      <Tabs value={view} onValueChange={(value) => setView(value as "report" | "balance")}>
        <TabsList className="self-start">
          <TabsTrigger value="report" className="px-3">
            Monthly report
          </TabsTrigger>
          <TabsTrigger value="balance" className="px-3">
            Where you stand
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "report" ? (
        <PortalReport {...props} />
      ) : (
        <PortalBalance portal={props.portal} onAsk={props.onAsk} />
      )}
    </div>
  )
}

/** A report the customer hasn't opened yet gets one line under the hello. */
function ReportReady({ month, onOpen }: { month: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-xs transition-colors duration-150 outline-none focus-visible:ring-[3px]"
    >
      <IconTile variant="outline" size="sm" className="text-muted-foreground">
        <ChartColumnIcon aria-hidden="true" />
      </IconTile>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-foreground text-sm font-medium">
          Your {longMonth(month)} overview is ready
        </span>
        <span className="text-muted-foreground text-xs">
          Sales, costs, profit and what&apos;s coming up
        </span>
      </span>
      <ArrowRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
    </button>
  )
}

type PortalTab = "todo" | "questions" | "numbers"

const TABS = new Set<PortalTab>(["todo", "questions", "numbers"])

/** A tab label with a shorter form for phones. */
function Label({ short, children }: { short: string; children: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{children}</span>
    </>
  )
}

export function CustomerPortal({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  // The report email links to ?tab=numbers&month=…; a click wins after that.
  // ?as=<contact> opens the page as that contact.
  const params = useSearchParams()
  const [contactId, setContactId] = useState<string | null>(params.get("as"))
  const portal = usePortal(clientId, contactId)
  const urlTab = params.get("tab") as PortalTab | null
  const [picked, setTab] = useState<PortalTab | null>(null)
  const tab = picked ?? (urlTab && TABS.has(urlTab) ? urlTab : "todo")
  const [reportMonth, setReportMonth] = useState<string | undefined>(
    params.get("month") ?? undefined
  )
  const [seenReport, setSeenReport] = useState(tab === "numbers")
  const [asking, setAsking] = useState<AskDraft | null>(null)
  const [sending, setSending] = useState(false)
  const freshReport =
    !seenReport && publishedMonths(state.closing, clientId).includes(OPEN_MONTH)
      ? OPEN_MONTH
      : undefined

  // The floating tabs stay in reach far down the timeline; a switch from
  // there brings the new tab's top into view.
  const [settings] = useSettings()
  const floating = settings.floatingTabs
  const tabsRef = useRef<HTMLDivElement>(null)

  function openTab(next: PortalTab) {
    setTab(next)
    if (next === "numbers") setSeenReport(true)
    const top = tabsRef.current?.getBoundingClientRect().top ?? 0
    if (floating && top < 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      tabsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })
    }
  }

  // @reui/c-tabs-6: full-width segmented tabs with icons, or the floating
  // preview: the same three as a dark pill at the bottom of the screen, the
  // inverse of the paper so it reads as the way around. A phone gets short
  // labels so all three fit in a third of the width.
  const tabList = (
    <TabsList
      variant={floating ? "floating" : "default"}
      className={
        floating
          ? cn(
              "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 w-auto sm:inset-x-0 sm:mx-auto sm:w-fit",
              // Dark tokens on the pill only: labels, counts and the active
              // highlight all flip with it. Opaque, or the paper shows through.
              "dark bg-background text-foreground",
              "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500 motion-reduce:slide-in-from-bottom-0"
            )
          : "w-full group-data-horizontal/tabs:h-10"
      }
    >
      <TabsTrigger value="todo">
        <ListTodoIcon className="size-4" aria-hidden="true" />
        <Label short="To do">Things we need</Label>
        <Badge variant="outline" size="sm" className="tabular-nums">
          {portal.pending.length}
        </Badge>
      </TabsTrigger>
      <TabsTrigger value="questions">
        <MessagesSquareIcon className="size-4" aria-hidden="true" />
        <Label short="Questions">Your questions</Label>
        <Badge
          variant={portal.answered ? "info-light" : "outline"}
          size="sm"
          className="tabular-nums"
        >
          {portal.questions.length}
        </Badge>
        {portal.answered ? (
          <span className="sr-only">, {portal.answered} answered</span>
        ) : null}
      </TabsTrigger>
      <TabsTrigger value="numbers">
        <ChartColumnIcon className="size-4" aria-hidden="true" />
        <Label short="Numbers">Your numbers</Label>
        {freshReport ? (
          <Badge variant="info-light" size="sm">
            New
          </Badge>
        ) : null}
      </TabsTrigger>
    </TabsList>
  )

  return (
    <PortalContactContext value={portal.contact}>
    <PortalShell>
      {/* Hello, the way to ask, then the three facts a customer comes back for. */}
      <header className={cn("flex flex-col gap-6", ENTER)}>
        <PortalGreeting portal={portal} onContactChange={setContactId} />
        <AskBox portal={portal} onOpen={() => setAsking({ title: "" })} />
        <SendBox portal={portal} onOpen={() => setSending(true)} />
        {freshReport ? (
          <ReportReady
            month={freshReport}
            onOpen={() => {
              setReportMonth(freshReport)
              openTab("numbers")
            }}
          />
        ) : null}
      </header>

      {/* What we need from them, and what they asked us: one tab each. The
          floating preview pins the tabs to the bottom of the screen, outside
          the entrance wrapper: its transform would anchor them to the page. */}
      <Tabs value={tab} onValueChange={(value) => openTab(value as PortalTab)}>
        {floating ? tabList : null}
        <div
          ref={tabsRef}
          className={cn("flex scroll-mt-6 flex-col gap-8", floating && "pb-16", ENTER)}
          style={{ animationDelay: "100ms" }}
        >
          {floating ? null : tabList}
          <TabsContent value="todo" className="flex flex-col gap-10">
            <div className="flex flex-col gap-3">
              <PortalTiles portal={portal} />
              {portal.others.length ? (
                <p className="text-muted-foreground text-xs text-pretty">
                  {portal.others.map(({ person, count }, index) => (
                    <span key={person.id}>
                      {index > 0 ? " · " : null}
                      {count} {count === 1 ? "task is" : "tasks are"} for {person.name.split(" ")[0]}.{" "}
                      <button
                        type="button"
                        onClick={() => setContactId(person.id)}
                        className="text-foreground font-medium underline-offset-4 hover:underline"
                      >
                        View as {person.name.split(" ")[0]}
                      </button>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
            <PortalTimeline key={portal.contact.id} portal={portal} />
          </TabsContent>
          <TabsContent value="questions">
            {portal.questions.length ? (
              <QuestionList
                questions={portal.questions}
                accountantName={portal.accountant.name}
              />
            ) : (
              <NoQuestions portal={portal} onAsk={() => setAsking({ title: "" })} />
            )}
          </TabsContent>
          <TabsContent value="numbers">
            <PortalNumbers
              portal={portal}
              month={reportMonth}
              onMonthChange={setReportMonth}
              onAsk={setAsking}
            />
          </TabsContent>
        </div>
      </Tabs>
      <SendDocumentDialog portal={portal} open={sending} onOpenChange={setSending} />
      <AskDialog
        portal={portal}
        draft={asking}
        onOpenChange={(open) => {
          if (!open) setAsking(null)
        }}
        // A new question lands in its tab, where the answer will come.
        onSent={() => {
          setAsking(null)
          openTab("questions")
        }}
      />
    </PortalShell>
    </PortalContactContext>
  )
}
