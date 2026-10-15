"use client"

// Adapted from @reui/kanban-board-9 on the ReUI Kanban. Columns are the stages
// of the customer loop. Dragging a card is a request to move it: the board
// works out what that means (send, book, ask again) and, when it needs a
// decision, asks in a dialog before anything changes. Above the columns, the
// volume nobody needs to discuss: lines the agents are sure of, per client,
// ready to book in one go, and this week's approval lists ready to send.
import {
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  Kanban,
  KanbanBoard as KanbanBoardPrimitive,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from "@/components/reui/kanban"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"
import Link from "next/link"
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  InboxIcon,
  ListChecksIcon,
  ListTodoIcon,
  PlusIcon,
  SendIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Item, ItemMedia } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CLIENT_BY_ID, OPEN_MONTH, tabOf } from "@/lib/accounting/data"
import { bundleAnswer, bundleLabel, isBundle } from "@/lib/accounting/request-labels"
import {
  lastCustomerText,
  scopedClients,
  useAccounting,
} from "@/lib/accounting/store"
import type {
  CustomerRequest,
  Domain,
  RequestStatus,
  ReviewItem,
} from "@/lib/accounting/types"
import { ReadyToSend } from "@/components/bookkeeping/ready-to-send"
import { DismissDraft } from "./dismiss-draft"
import { ScopeToggle } from "./scope-toggle"
import {
  formatNok,
  PRIORITY_META,
  REQUEST_KIND_META,
  requestStatusMeta,
  RESPONSE_TYPE_META,
} from "./meta"
import { ConfidenceMeter, DotSeparator } from "./primitives"
import { isAutoConfirmable } from "./review-queue"
import { teamStatusOf, TeamStatusLine } from "./team-notes"

type BoardColumn = {
  id: RequestStatus
  title: string
  description: string
  dotClassName: string
  empty: string
}

const COLUMNS: BoardColumn[] = [
  {
    id: "draft",
    title: "Needs decision",
    description: "Agent drafts · customer can't see these",
    dotClassName: "bg-amber-500",
    empty: "No drafts waiting on you",
  },
  {
    id: "sent",
    title: "Waiting on customer",
    description: "Customer sees these under To do",
    dotClassName: "bg-sky-500",
    empty: "Nothing out with customers",
  },
  {
    id: "replied",
    title: "Back with you",
    description: "Customer answered or asked something",
    dotClassName: "bg-info",
    empty: "No replies or questions",
  },
  {
    id: "resolved",
    title: "Resolved",
    description: "Customer sees these under Done",
    dotClassName: "bg-emerald-500",
    empty: "Nothing resolved this month",
  },
]

type AreaFilter = "all" | Domain | "general"

/** Which part of the job a task belongs to, so an accountant can work
    through, say, every payroll question across customers in one go. */
const AREAS: { value: AreaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "payroll", label: "Payroll" },
  { value: "general", label: "General" },
]

/** Server and hydration render a skeleton: dnd-kit's generated ids differ
    between server and client, so the board mounts on the client only. */
const subscribeNever = () => () => {}
function useMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

function BoardScrollArea({ children }: { children: ReactNode }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className="relative w-full min-w-0 pb-3"
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 w-full rounded-lg transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        <ScrollAreaPrimitive.Content
          data-slot="scroll-area-content"
          className="w-full min-w-fit"
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        data-slot="scroll-area-scrollbar"
        data-orientation="horizontal"
        orientation="horizontal"
        className="flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent"
      >
        <ScrollAreaPrimitive.Thumb
          data-slot="scroll-area-thumb"
          className="bg-foreground/15 relative flex-1 rounded-full"
        />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

// kanban-board-9 · CandidateMetaRow
function MetaRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-5 min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2 text-sm leading-5">
      <Item
        render={<span />}
        className="text-muted-foreground flex size-4 items-center justify-center border-0 p-0"
        aria-hidden="true"
      >
        <ItemMedia variant="icon" className="size-auto">
          {icon}
        </ItemMedia>
      </Item>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function StatusPill({ request }: { request: CustomerRequest }) {
  const meta = requestStatusMeta(request)
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", meta.dotClassName)}
        aria-hidden="true"
      />
      {meta.label}
    </Badge>
  )
}

function RequestCard({
  request,
  item,
  showClient,
  onOpen,
  isOverlay,
}: {
  request: CustomerRequest
  item?: ReviewItem
  showClient: boolean
  onOpen: () => void
  isOverlay?: boolean
}) {
  const { dispatch } = useAccounting()
  const client = CLIENT_BY_ID.get(request.clientId)
  const recipient =
    client?.contacts.find((c) => c.id === request.recipientId) ??
    client?.contacts[0]
  const kind = REQUEST_KIND_META[request.kind]
  const answer = RESPONSE_TYPE_META[request.responseType]
  const fromCustomer = request.origin === "customer"
  // An approval list or a pay check-in carries its own content: it says
  // what it is, and its answer is the decisions, not a message.
  const bundle = isBundle(request)
  const said = bundle ? bundleAnswer(request) : lastCustomerText(request)
  // A bank line's team state shows on its request's card.
  const teamTask = teamStatusOf(request)
    ? request
    : item && teamStatusOf(item)
      ? item
      : undefined
  // The whole card opens on click. A press that travels is a drag, not a
  // click, and the card's own buttons keep their jobs.
  const pressedAt = useRef<{ x: number; y: number } | null>(null)

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (isOverlay) return
    const start = pressedAt.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    const control = (event.target as HTMLElement).closest(
      "button, a, input, textarea, [role=menuitem], [role=radio]"
    )
    if (control && !control.hasAttribute("data-card-title")) return
    onOpen()
  }

  const body = (
    <FramePanel
      onPointerDown={(event) => {
        pressedAt.current = { x: event.clientX, y: event.clientY }
      }}
      onClick={handleClick}
      className={cn(
        "hover:border-foreground/20 ease-snappy flex min-w-0 cursor-pointer flex-col gap-2.5 p-3 transition-[border-color,box-shadow] duration-150 hover:shadow-sm",
        isOverlay && "rotate-1 shadow-lg"
      )}
    >
      {/* Status first: the thing a column scan is looking for */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <StatusPill request={request} />
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            {request.id}
          </span>
          <Badge variant={PRIORITY_META[request.priority].variant}>
            {PRIORITY_META[request.priority].label}
          </Badge>
        </span>
      </div>

      <KanbanItemHandle
        cursor={!isOverlay}
        className="flex min-w-0 flex-col gap-2.5"
      >
        <div className="min-w-0">
          {/* The keyboard way in: Enter on the title clicks it, and the
              click bubbles to the card, which opens. */}
          <button
            type="button"
            data-card-title
            className="focus-visible:ring-ring/50 line-clamp-2 rounded-sm text-left text-sm leading-5 font-semibold outline-none focus-visible:ring-[3px]"
          >
            {request.title}
          </button>
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs leading-5">
            <span className="truncate">
              {showClient ? client?.name : bundle ? bundleLabel(request) : kind.label}
            </span>
            <DotSeparator />
            <span className="inline-flex shrink-0 items-center gap-1 [&_svg]:size-3">
              {fromCustomer ? kind.icon : answer.icon}
              {fromCustomer ? "Question" : answer.label}
            </span>
          </div>
        </div>

        {said && (request.status === "replied" || (bundle && request.status === "resolved")) ? (
          <p className="bg-info/5 border-info/20 text-foreground rounded-md border px-2 py-1.5 text-xs leading-4">
            {/* Clamp the text, not the padded box, so no third line peeks. */}
            <span className="line-clamp-2">{bundle ? said : `“${said}”`}</span>
          </p>
        ) : null}

        {item ? (
          <ConfidenceMeter
            value={item.suggestion.confidence}
            label="Agent confidence"
            compact
          />
        ) : null}

        <div className="flex min-w-0 flex-col gap-1.5">
          {item ? (
            <MetaRow
              icon={
                item.domain === "bookkeeping" ? (
                  <BookOpenCheckIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <WalletIcon className="size-3.5" aria-hidden="true" />
                )
              }
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate">{item.title}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatNok(Math.abs(item.amount))}
                </span>
              </div>
            </MetaRow>
          ) : bundle ? (
            <MetaRow
              icon={
                request.kind === "approval" ? (
                  <ListChecksIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <ClipboardListIcon className="size-3.5" aria-hidden="true" />
                )
              }
            >
              <span className="text-muted-foreground truncate">
                {showClient
                  ? bundleLabel(request)
                  : request.kind === "approval"
                    ? "Approved line by line in their app"
                    : "Opens the pay period"}
              </span>
            </MetaRow>
          ) : (
            <MetaRow
              icon={<ListTodoIcon className="size-3.5" aria-hidden="true" />}
            >
              <span className="text-muted-foreground truncate">
                {fromCustomer ? "Opened by the customer" : "Manual task"}
              </span>
            </MetaRow>
          )}
          <MetaRow icon={<UserIcon className="size-3.5" aria-hidden="true" />}>
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar size="sm" className="size-4">
                <AvatarFallback className="text-[8px]">
                  {recipient?.initials}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">
                {request.answeredBy && request.status !== "sent"
                  ? `Answered by ${request.answeredBy.name}`
                  : recipient?.name}
              </span>
            </span>
          </MetaRow>
          {teamTask ? (
            <MetaRow icon={<UsersIcon className="size-3.5" aria-hidden="true" />}>
              <TeamStatusLine task={teamTask} className="text-sm [&_svg]:hidden" />
            </MetaRow>
          ) : null}
          <MetaRow
            icon={<CalendarClockIcon className="size-3.5" aria-hidden="true" />}
          >
            <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span>
                {request.status === "draft"
                  ? request.sentAt
                  : fromCustomer
                    ? `Asked ${request.sentAt}`
                    : `Sent ${request.sentAt}`}
              </span>
              {request.due ? (
                <>
                  <DotSeparator />
                  <span>Due {request.due}</span>
                </>
              ) : null}
            </span>
          </MetaRow>
        </div>
      </KanbanItemHandle>

      {request.status === "draft" && !isOverlay ? (
        <div className="flex items-center gap-1.5 border-t pt-2.5">
          <Button
            type="button"
            size="xs"
            // The card opens in the panel too, so once this one is decided
            // the panel moves on to the next draft in the column.
            onClick={() => {
              onOpen()
              // A list built elsewhere is reviewed in the panel itself.
              if (request.itemId) dispatch({ type: "open_ask", id: request.itemId })
            }}
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Review & send
          </Button>
          <DismissDraft
            request={request}
            trigger={
              <Button type="button" size="xs" variant="ghost" onClick={onOpen}>
                Don&apos;t send
              </Button>
            }
          />
        </div>
      ) : null}
    </FramePanel>
  )

  if (isOverlay) return body
  return <KanbanItem value={request.id}>{body}</KanbanItem>
}

type PendingMove = {
  request: CustomerRequest
  item?: ReviewItem
}

/** One client's lines in one area that the agents are sure of. */
type ReadyGroup = { clientId: string; domain: Domain; items: ReviewItem[] }

/** The volume behind the questions: per client, the lines the agents are
    90 %+ sure of with nothing flagged, bookable in one go. Bookkeeping
    means invoices; card receipts and bank lines are cleared in the
    reconciliation. */
function ReadyToBook({
  groups,
  showClient,
}: {
  groups: ReadyGroup[]
  showClient: boolean
}) {
  const { dispatch } = useAccounting()
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)

  function bookAll(group: ReadyGroup) {
    const client = CLIENT_BY_ID.get(group.clientId)
    const n = group.items.length
    dispatch({ type: "confirm", ids: group.items.map((i) => i.id) })
    toast.success(
      group.domain === "bookkeeping"
        ? `${n} ${n === 1 ? "voucher" : "vouchers"} booked in Tripletex`
        : `${n} ${n === 1 ? "employee" : "employees"} approved for the pay run`,
      {
        description: `${client?.name ?? ""} · ${
          group.domain === "bookkeeping"
            ? "Invoices wait on 2400 until their payment is matched."
            : "They go into one salary voucher when the run is approved."
        }`,
      }
    )
  }

  return (
    <Frame spacing="sm" className="w-full">
      <FrameHeader className="flex min-h-9 flex-row flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
        <CheckCheckIcon className="text-success-text size-4 shrink-0" aria-hidden="true" />
        <FrameTitle className="text-sm leading-5">Ready to book</FrameTitle>
        <span className="text-muted-foreground text-xs font-medium tabular-nums">{total}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px] leading-4 max-sm:basis-full">
          The agents are 90%+ sure and nothing is flagged · no question needed
        </span>
      </FrameHeader>
      <BoardScrollArea>
        <ul className="flex w-full gap-2 p-0.5">
          {groups.map((group) => {
            const client = CLIENT_BY_ID.get(group.clientId)
            const n = group.items.length
            const sum = group.items.reduce((s, i) => s + Math.abs(i.amount), 0)
            const bookkeeping = group.domain === "bookkeeping"
            const href = `/clients/${group.clientId}/${bookkeeping ? "bookkeeping" : "payroll"}`
            return (
              <li key={`${group.clientId}-${group.domain}`} className="min-w-[15rem] flex-1 basis-0">
                <FramePanel className="flex h-full min-w-0 flex-col gap-2.5 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground truncate text-sm leading-5 font-semibold">
                        {showClient ? client?.name : bookkeeping ? "Bookkeeping" : "Payroll"}
                      </span>
                      <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs [&_svg]:size-3">
                        {bookkeeping ? (
                          <BookOpenCheckIcon aria-hidden="true" />
                        ) : (
                          <WalletIcon aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {n} {bookkeeping ? (n === 1 ? "invoice" : "invoices") : n === 1 ? "pay line" : "pay lines"}
                        </span>
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatNok(sum)}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5">
                    <Button type="button" size="xs" onClick={() => bookAll(group)}>
                      <CheckCheckIcon data-icon="inline-start" aria-hidden="true" />
                      {bookkeeping ? "Book" : "Approve"} all {n}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      nativeButton={false}
                      // The client's tab shows one month: make it this one.
                      render={
                        <Link
                          href={href}
                          onClick={() =>
                            dispatch({ type: "set_month", month: group.items[0].period })
                          }
                        />
                      }
                    >
                      Look first
                      <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </div>
                </FramePanel>
              </li>
            )
          })}
        </ul>
      </BoardScrollArea>
    </Frame>
  )
}

export function RequestsBoard({
  clientId,
  title,
  description,
}: {
  clientId?: string
  title: string
  description: string
}) {
  const { state, dispatch } = useAccounting()
  const mounted = useMounted()
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [area, setArea] = useState<AreaFilter>("all")
  const inScope = new Set(scopedClients(state.scope).map((c) => c.id))
  // The firm-wide board is about now; a client's board follows its switcher.
  const period = clientId ? state.month : OPEN_MONTH
  const inView = state.requests.filter(
    (r) =>
      r.period === period &&
      (clientId ? r.clientId === clientId : inScope.has(r.clientId))
  )
  const areaCounts = Object.fromEntries(
    AREAS.map((a) => [
      a.value,
      a.value === "all"
        ? inView.length
        : inView.filter((r) => r.domain === a.value).length,
    ])
  ) as Record<AreaFilter, number>
  const requests =
    area === "all" ? inView : inView.filter((r) => r.domain === area)
  const byColumn = Object.fromEntries(
    COLUMNS.map((column) => [
      column.id,
      requests.filter((r) => r.status === column.id),
    ])
  ) as Record<RequestStatus, CustomerRequest[]>
  const itemFor = (r: CustomerRequest) =>
    r.itemId ? state.items.find((i) => i.id === r.itemId) : undefined
  // The confident volume, for the areas the tabs show (general tasks have
  // no lines behind them).
  const clientIds = clientId ? [clientId] : [...inScope]
  const readyAreas = (["bookkeeping", "payroll"] as const).filter(
    (d) => area === "all" || area === d
  )
  const ready: ReadyGroup[] = readyAreas
    .flatMap((domain) =>
      clientIds.map((id) => ({
        clientId: id,
        domain,
        items: state.items.filter(
          (i) =>
            i.clientId === id &&
            i.period === period &&
            (domain === "payroll" ? i.domain === "payroll" : tabOf(i) === "bookkeeping") &&
            isAutoConfirmable(i, state)
        ),
      }))
    )
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length)

  /** Opens a card with its column as the panel's list: ↑/↓ walk it, and a
      decision on one card moves the panel to the next that needs one. */
  function open(request: CustomerRequest, column: CustomerRequest[]) {
    const nav = column.map((c) => c.itemId ?? c.id)
    if (request.itemId) {
      dispatch({ type: "open_item", id: request.itemId, nav })
    } else {
      dispatch({ type: "open_request", id: request.id, nav })
    }
  }

  function handleMove({
    activeContainer,
    overContainer,
    activeIndex,
  }: KanbanMoveEvent) {
    const from = activeContainer as RequestStatus
    const to = overContainer as RequestStatus
    if (from === to) return
    const request = byColumn[from][activeIndex]
    if (!request) return
    const item = itemFor(request)
    const bounce = (why: string) =>
      toast.message("Can't move it there", { description: why })

    if (from === "resolved") return bounce("Resolved requests are final.")
    if (to === "draft") return bounce("Only agents draft questions.")
    if (to === "resolved" && isBundle(request))
      return bounce(
        request.kind === "approval"
          ? "An approval closes itself once every line is decided. Withdraw it from the task if it shouldn't go on."
          : "A check-in closes when its answers are added to the run, or withdraw it from the task."
      )
    if (to === "resolved") return setPending({ request, item })

    if (to === "sent") {
      // Sending a draft, or asking again after a reply: both go through the
      // composer so the accountant sees exactly what the customer will get.
      if (item) return dispatch({ type: "open_ask", id: item.id })
      return bounce("Open it and write your answer to the customer.")
    }

    if (to === "replied") {
      if (from === "draft")
        return bounce("Send the question first, then the customer can reply.")
      dispatch({ type: "simulate_reply", requestId: request.id })
      toast.info("Simulated the customer's answer", {
        description:
          "In the real product, the customer does this from their app.",
      })
    }
  }

  function confirmPending() {
    if (!pending) return
    const { request, item } = pending
    if (item && item.status !== "booked") {
      dispatch({ type: "confirm", ids: [item.id] })
      toast.success(
        item.domain === "bookkeeping" ? "Booked in Tripletex" : "Pay line approved",
        {
          description:
            item.domain === "bookkeeping"
              ? `${item.title} → ${item.suggestion.lines[0].account}`
              : `${item.title} · locked in the November run`,
        }
      )
    } else {
      dispatch({ type: "resolve_request", requestId: request.id })
      toast.success("Task done", { description: request.title })
    }
    setPending(null)
  }

  const pendingItem = pending?.item
  const pendingLine = pendingItem?.suggestion.lines[0]
  const verb = pendingItem?.domain === "payroll" ? "Approve" : "Book"
  const pendingCopy = pending
    ? pendingItem && pendingLine
      ? {
          title:
            pending.request.status === "replied"
              ? `${verb} ${pendingItem.title}?`
              : pending.request.status === "draft"
                ? `${verb} ${pendingItem.title} without asking?`
                : `${verb} ${pendingItem.title} before the customer answers?`,
          body: `${formatNok(Math.abs(pendingItem.amount))} to ${pendingLine.account}${pendingLine.vat ? `, VAT ${pendingLine.vat}` : ""}. Agent confidence ${Math.round(pendingItem.suggestion.confidence * 100)}%.${pending.request.status === "sent" ? " The open question will be closed." : ""}`,
          action: verb,
        }
      : {
          title: "Mark this task as done?",
          body:
            pending.request.status === "sent"
              ? "The customer hasn't answered. The task will be closed in their app."
              : "The customer's answer is kept on the task.",
          action: "Mark as done",
        }
    : null

  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="truncate text-sm leading-5 font-semibold">{title}</h2>
          <p className="text-muted-foreground text-xs leading-4 text-pretty">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {clientId ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`/portal/${clientId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
              See what the customer sees
            </Button>
          ) : (
            <ScopeToggle />
          )}
          <Button
            type="button"
            size="sm"
            onClick={() =>
              dispatch({ type: "open_task_composer", clientId: clientId ?? null })
            }
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            New task
          </Button>
        </div>
      </header>

      <Tabs
        value={area}
        onValueChange={(value) => setArea(value as AreaFilter)}
        className="border-b px-1"
      >
        <TabsList variant="line" className="gap-5">
          {AREAS.map((a) => (
            <TabsTrigger
              key={a.value}
              value={a.value}
              className="gap-2 px-0 pt-0 pb-2.5 text-sm"
            >
              <span>{a.label}</span>
              <span className="bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                {areaCounts[a.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {mounted && ready.length > 0 ? (
        <ReadyToBook groups={ready} showClient={!clientId} />
      ) : null}

      {/* This week's approval lists: invoices, so bookkeeping only. */}
      {mounted && (area === "all" || area === "bookkeeping") ? (
        <ReadyToSend clientIds={clientIds} showClient={!clientId} Scroll={BoardScrollArea} />
      ) : null}

      {!mounted ? (
        <div className="flex gap-3">
          {COLUMNS.map((c) => (
            <Skeleton
              key={c.id}
              className="h-64 min-w-[16.5rem] flex-1 rounded-xl"
            />
          ))}
        </div>
      ) : (
        <Kanban
          value={byColumn}
          onValueChange={() => {}}
          onMove={handleMove}
          getItemValue={(item) => item.id}
          className="w-full"
        >
          <BoardScrollArea>
            <KanbanBoardPrimitive className="flex w-full items-stretch gap-3 p-1">
              {COLUMNS.map((column) => {
                const cards = byColumn[column.id]
                return (
                  <KanbanColumn
                    key={column.id}
                    value={column.id}
                    className="min-w-[16.5rem] flex-1 basis-0"
                  >
                    <Frame
                      spacing="sm"
                      className="h-full"
                      aria-label={`${column.title}: ${column.description}`}
                    >
                      <FrameHeader className="flex min-h-9 flex-row items-center gap-2 px-2 py-1.5">
                        <span
                          className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            column.dotClassName
                          )}
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <FrameTitle className="truncate text-sm leading-5">
                              {column.title}
                            </FrameTitle>
                            <span className="text-muted-foreground shrink-0 text-xs leading-none font-medium tabular-nums">
                              {cards.length}
                            </span>
                          </div>
                          <span className="text-muted-foreground truncate text-[11px] leading-4">
                            {column.description}
                          </span>
                        </div>
                      </FrameHeader>

                      <KanbanColumnContent
                        value={column.id}
                        className="flex min-h-24 flex-col gap-2 p-0.5"
                      >
                        {cards.map((request) => (
                          <RequestCard
                            key={request.id}
                            request={request}
                            item={itemFor(request)}
                            showClient={!clientId}
                            onOpen={() => open(request, cards)}
                          />
                        ))}
                        {cards.length === 0 ? (
                          <div className="text-muted-foreground bg-background/70 flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-3 text-center text-xs">
                            <InboxIcon className="size-4" aria-hidden="true" />
                            {column.empty}
                          </div>
                        ) : null}
                      </KanbanColumnContent>
                    </Frame>
                  </KanbanColumn>
                )
              })}
            </KanbanBoardPrimitive>
          </BoardScrollArea>

          <KanbanOverlay>
            {({ value, variant }) => {
              if (variant === "column") return null
              const request = requests.find((r) => r.id === String(value))
              return request ? (
                <RequestCard
                  request={request}
                  item={itemFor(request)}
                  showClient={!clientId}
                  onOpen={() => {}}
                  isOverlay
                />
              ) : null
            }}
          </KanbanOverlay>
        </Kanban>
      )}

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(next) => {
          if (!next) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingCopy?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>
              {pendingCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
