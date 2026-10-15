"use client"

// One client at a glance, for an accountant who has hundreds: who they are,
// what is due and what blocks it, what needs a human now, and what happened
// before. Built from ReUI Frame (card-9's column strip for the profile) and
// shadcn Item rows.
import Link from "next/link"
import { cn } from "cn"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  CheckCheckIcon,
  ChevronRightIcon,
  MessagesSquareIcon,
  ReceiptTextIcon,
  StickyNoteIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { FromOnboarding } from "@/components/onboarding/from-onboarding"
import {
  CLIENT_BY_ID,
  MONTHS,
  monthName,
  OPEN_PERIOD,
  TAB_LABEL,
  tabOf,
  VEHICLES,
} from "@/lib/accounting/data"
import { openAnomalies } from "@/lib/accounting/anomalies"
import { getClientDeadlines } from "@/lib/accounting/deadlines"
import { isWorkable, monthStatus } from "@/lib/accounting/periods"
import { getMonthClose, useAccounting } from "@/lib/accounting/store"
import type { Anomaly, Client, ReviewItem } from "@/lib/accounting/types"
import { AgentRules, WhoDoesWhat } from "./client-agreements"
import { DeadlineList } from "./deadline-list"
import { useOpenTask } from "./use-open-task"
import { AnomalyBadge, AnomalyIcon } from "./anomaly"
import { formatNok, ISSUE_META } from "./meta"
import { DotSeparator, IconChip, StatusBadge } from "./primitives"

type WorkTile = {
  title: string
  value: string
  /** Nothing left: the tile goes quiet. */
  done: boolean
  detail: string
  href: string
}

// solution-analytics-8 · MetricKpis: Frame tiles with a value, a separator
// and a line under it. Each one opens the tab its work is in.
function WorkTiles({ tiles }: { tiles: WorkTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 @4xl/main:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.title}
          href={tile.href}
          className="group/tile focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
        >
          <Frame className="group-hover/tile:bg-muted/30 transition-colors duration-150">
            <FramePanel className="flex flex-col gap-4">
              <h3 className="text-muted-foreground flex items-center justify-between text-sm font-medium">
                {tile.title}
                <ChevronRightIcon
                  className="size-3.5 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100"
                  aria-hidden="true"
                />
              </h3>
              <div className="space-y-2.5">
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-2xl font-medium tracking-tight tabular-nums",
                    tile.done ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {tile.done ? <CheckCheckIcon className="text-success-text size-5" aria-hidden="true" /> : null}
                  {tile.value}
                </span>
                <Separator />
                <div className="text-muted-foreground truncate text-xs">{tile.detail}</div>
              </div>
            </FramePanel>
          </Frame>
        </Link>
      ))}
    </div>
  )
}

/** The four counts an accountant clears to zero for a client, each a way
    into the tab where that work is done: the invoice inbox (every open
    month), the bank, the pay run, and what waits on the customer. Revenue
    and headcount are in the report; here they would only take room. */
function useWorkTiles(client: Client): WorkTile[] {
  const { state } = useAccounting()
  const base = `/clients/${client.id}`
  const month = state.month
  const inbox = state.items.filter(
    (i) =>
      i.clientId === client.id &&
      tabOf(i) === "bookkeeping" &&
      i.status !== "booked" &&
      (i.period === month || isWorkable(monthStatus(client.id, i.period, state)))
  )
  const inboxOther = inbox.filter((i) => i.period !== month).length
  const close = getMonthClose(state, client.id, month)
  const bank = close.bank
  const receipts = [...bank.suggested, ...bank.waiting].filter((l) => l.kind === "receipt").length
  const noDoc = bank.unmatched.length
  const pay = state.items.filter(
    (i) => i.clientId === client.id && i.domain === "payroll" && i.period === OPEN_PERIOD.payroll && i.status !== "booked" && !i.skipped
  ).length
  const waiting = state.requests.filter(
    (r) => r.clientId === client.id && r.status === "sent" && r.origin !== "customer"
  )
  const replied = state.requests.filter((r) => r.clientId === client.id && r.status === "replied").length
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  return [
    {
      title: "Inbox",
      value: inbox.length ? `${inbox.length} to book` : "Empty",
      done: !inbox.length,
      detail: inbox.length
        ? [plural(inbox.filter((i) => i.status === "waiting_customer").length, "with the customer", "with the customer"), inboxOther ? `${inboxOther} for other months` : ""]
            .filter((t) => t && !t.startsWith("0 "))
            .join(" · ") || "Invoices and expenses"
        : "Every invoice booked",
      href: `${base}/bookkeeping`,
    },
    {
      title: "Bank",
      value: bank.toDo ? `${bank.toDo} to clear` : "Reconciled",
      done: !bank.toDo,
      detail: bank.toDo
        ? [receipts ? plural(receipts, "receipt") + " to book" : "", noDoc ? `${noDoc} without a document` : ""]
            .filter(Boolean)
            .join(" · ") || "Lines to match"
        : "Matches the DNB statements",
      href: `${base}/reconciliation`,
    },
    {
      title: "Payroll",
      value: pay ? `${pay} to approve` : "Ready",
      done: !pay,
      detail: pay ? `${monthName(OPEN_PERIOD.payroll)} hours, paid ${client.payDate}` : "Every pay line approved",
      href: `${base}/payroll`,
    },
    {
      title: `Waiting on ${client.contacts[0]?.name.split(" ")[0] ?? "the customer"}`,
      value: waiting.length ? plural(waiting.length, "task") : "Nothing",
      done: !waiting.length,
      detail: replied ? `${plural(replied, "answer")} back to read` : waiting.length ? "Reminders go out on their own" : "All answered",
      href: `${base}/requests`,
    },
  ]
}

function Engagement({ client }: { client: Client }) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Engagement</FrameTitle>
        <FrameDescription className="text-xs">
          Customer since {client.profile.clientSince}
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Services</span>
          <div className="flex flex-wrap gap-1.5">
            {client.profile.services.map((service) => (
              <Badge key={service} variant="secondary" size="sm">
                {service}
              </Badge>
            ))}
          </div>
        </div>
        {VEHICLES[client.id] ? (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Vehicles</span>
              {VEHICLES[client.id].list.length ? (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {VEHICLES[client.id].list.map((v) => (
                    <li key={v.reg} className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{v.reg}</span>
                      <span className="text-muted-foreground text-xs">
                        {v.kind} · {v.how}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm">None on the company</span>
              )}
              <span className="text-muted-foreground text-xs text-pretty">
                {VEHICLES[client.id].checked}. Decides the VAT on fuel.
              </span>
            </div>
          </>
        ) : null}
        <Separator />
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Connected systems</span>
          <div className="flex flex-wrap gap-1.5">
            {client.profile.systems.map((system) => (
              <Badge
                key={system}
                variant="outline"
                size="sm"
                className="font-normal"
              >
                <span
                  className="bg-success size-1.5 rounded-full"
                  aria-hidden="true"
                />
                {system}
              </Badge>
            ))}
          </div>
        </div>
      </FramePanel>
    </Frame>
  )
}

function reasonFor(item: ReviewItem, anomalies: Anomaly[]) {
  if (item.status === "customer_replied") return "Customer replied, ready to book"
  if (item.issue) return ISSUE_META[item.issue].label
  if (anomalies.length) return anomalies[0].short
  return "Low confidence"
}

function AttentionList({ items }: { items: ReviewItem[] }) {
  const openTask = useOpenTask()
  const { state } = useAccounting()
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-px">
          <FrameTitle>Needs a human</FrameTitle>
          <FrameDescription className="text-xs">
            Lines the agents won&apos;t book on their own: a question, an anomaly or low confidence
          </FrameDescription>
        </div>
        <Badge variant="outline" className="tabular-nums">
          {items.length}
        </Badge>
      </FrameHeader>
      <FramePanel className="p-0">
        {items.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-sm">
            <CheckCheckIcon className="text-success-text size-5" aria-hidden="true" />
            Nothing needs you right now.
          </div>
        ) : (
          items.map((item, index) => {
            const anomalies = openAnomalies(state, item)
            return (
            <div key={item.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <Item
                size="sm"
                render={
                  <button
                    type="button"
                    // Opens on the tab the line lives on, walking this
                    // list's lines of the same kind.
                    onClick={() =>
                      openTask(
                        item,
                        items.filter((i) => tabOf(i) === tabOf(item)).map((i) => i.id)
                      )
                    }
                  />
                }
                className="hover:bg-muted/40 w-full rounded-none px-3 text-left transition-colors duration-150"
              >
                <ItemMedia>
                  <IconChip
                    className={
                      item.status === "customer_replied"
                        ? "text-info-text"
                        : "text-warning-text"
                    }
                  >
                    {item.status === "customer_replied" ? (
                      <MessagesSquareIcon aria-hidden="true" />
                    ) : item.issue ? (
                      ISSUE_META[item.issue].icon
                    ) : anomalies.length ? (
                      <AnomalyIcon aria-hidden="true" />
                    ) : (
                      <ReceiptTextIcon aria-hidden="true" />
                    )}
                  </IconChip>
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="w-full min-w-0 text-sm">
                    <span className="truncate">{item.title}</span>
                  </ItemTitle>
                  <ItemDescription className="truncate text-xs">
                    {TAB_LABEL[tabOf(item)]} ·{" "}
                    {reasonFor(item, anomalies)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="gap-3">
                  <span className="text-foreground hidden text-sm tabular-nums sm:block">
                    {formatNok(item.amount)}
                  </span>
                  <span className="hidden items-center gap-1.5 md:flex">
                    <AnomalyBadge anomalies={anomalies} />
                    <StatusBadge status={item.status} domain={item.domain} />
                  </span>
                  <ChevronRightIcon
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                </ItemActions>
              </Item>
            </div>
            )
          })
        )}
      </FramePanel>
    </Frame>
  )
}

function Contacts({ client }: { client: Client }) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Contacts</FrameTitle>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-0 p-0">
        {client.contacts.map((person, index) => (
          <div key={person.id}>
            {index > 0 ? <Separator className="opacity-60" /> : null}
            <Item size="sm" className="items-start px-3">
              <ItemMedia>
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">
                    {person.initials}
                  </AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent className="min-w-0 gap-0.5">
                <ItemTitle className="w-full min-w-0 text-sm">
                  <span className="truncate">{person.name}</span>
                  <span className="text-muted-foreground shrink-0 font-normal">
                    {person.role}
                  </span>
                </ItemTitle>
                <ItemDescription className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
                  <span className="truncate">{person.email}</span>
                  <DotSeparator />
                  <span className="shrink-0 tabular-nums">{person.phone}</span>
                </ItemDescription>
                <ItemDescription className="text-xs">
                  {person.responsiveness}
                </ItemDescription>
              </ItemContent>
            </Item>
          </div>
        ))}
      </FramePanel>
    </Frame>
  )
}

function Notes({ client }: { client: Client }) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Notes</FrameTitle>
        <FrameDescription className="text-xs">
          Shared with the agents, so they draft better questions
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-2.5">
        {client.profile.notes.map((note) => (
          <p key={note} className="text-foreground flex gap-2 text-sm leading-5">
            <StickyNoteIcon
              className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0 text-pretty">{note}</span>
          </p>
        ))}
        <p className="text-muted-foreground text-xs">{client.profile.address}</p>
      </FramePanel>
    </Frame>
  )
}

function History({ client }: { client: Client }) {
  const { state } = useAccounting()
  const openTask = useOpenTask()
  const past = MONTHS.filter((m) => m.status === "closed")
  const asked = state.requests
    .filter(
      (r) =>
        r.clientId === client.id &&
        r.status === "resolved" &&
        past.some((m) => m.id === r.period)
    )
    .slice(0, 4)

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>What happened before</FrameTitle>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-0 p-0">
        {past.map((month, index) => {
          const lines = state.items.filter(
            (i) => i.clientId === client.id && i.period === month.id
          )
          const questions = state.requests.filter(
            (r) => r.clientId === client.id && r.period === month.id
          ).length
          return (
            <div key={month.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <Item size="sm" className="px-3">
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="text-sm">{month.label}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {lines.filter((i) => i.domain === "bookkeeping").length} invoices,
                    receipts and bank lines
                    {lines.some((i) => i.domain === "payroll")
                      ? `, ${lines.filter((i) => i.domain === "payroll").length} pay lines`
                      : ""}
                    {questions
                      ? ` · ${questions} ${questions === 1 ? "question" : "questions"} to the customer`
                      : " · no questions needed"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {monthStatus(client.id, month.id, state) === "reopened" ? (
                    <Badge variant="warning-light" size="sm">
                      Reopened
                    </Badge>
                  ) : (
                    <Badge variant="success-light" size="sm">
                      {month.note}
                    </Badge>
                  )}
                </ItemActions>
              </Item>
            </div>
          )
        })}
        {asked.length > 0 ? (
          <>
            <Separator className="opacity-60" />
            <div className="flex flex-col gap-1 px-3 pt-2.5 pb-1">
              <span className="text-muted-foreground text-xs font-medium">
                Recent questions
              </span>
            </div>
            {asked.map((request) => (
              <Item
                key={request.id}
                size="xs"
                render={
                  <button
                    type="button"
                    onClick={() => openTask(request)}
                  />
                }
                className="hover:bg-muted/40 w-full rounded-none px-3 text-left transition-colors duration-150"
              >
                <ItemContent className="min-w-0 gap-0">
                  <ItemTitle className="w-full min-w-0 text-[13px] font-normal">
                    <span className="truncate">{request.title}</span>
                  </ItemTitle>
                  <ItemDescription className="truncate text-xs">
                    {monthName(request.period)} · answered
                    {request.round > 1
                      ? ` after ${request.round} asks`
                      : " first time"}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </>
        ) : null}
      </FramePanel>
    </Frame>
  )
}

export function ClientOverview({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)!
  const tiles = useWorkTiles(client)
  const month = MONTHS.find((m) => m.id === state.month)
  const deadlines = getClientDeadlines(
    client,
    state.month,
    state.items,
    state.requests,
    state
  )
  const own = state.items.filter(
    (i) => i.clientId === clientId && i.period === state.month
  )
  // An anomaly needs a human however sure the agent is of the posting.
  const unusual = new Set(
    own.filter((i) => i.status === "needs_review" && openAnomalies(state, i).length).map((i) => i.id)
  )
  const attention = own
    .filter(
      (i) =>
        i.status === "customer_replied" ||
        (i.status === "needs_review" &&
          !i.skipped &&
          (i.issue || unusual.has(i.id) || i.suggestion.confidence < 0.9))
    )
    .sort(
      (a, b) =>
        Number(b.status === "customer_replied") -
          Number(a.status === "customer_replied") ||
        Number(unusual.has(b.id)) - Number(unusual.has(a.id)) ||
        a.suggestion.confidence - b.suggestion.confidence
    )
  const blocked = deadlines.filter((d) => d.status === "blocked").length

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <WorkTiles tiles={tiles} />
      <div className="grid min-w-0 items-start gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Frame dense spacing="sm" className="w-full">
            <FrameHeader className="flex-row items-center justify-between gap-2">
              <div className="flex flex-col gap-px">
                <FrameTitle>Deadlines · {month?.label}</FrameTitle>
                <FrameDescription className="text-xs">
                  {month?.status === "open"
                    ? blocked
                      ? `${blocked} blocked by open work`
                      : "Nothing blocking, on track"
                    : "Month closed"}
                </FrameDescription>
              </div>
            </FrameHeader>
            <FramePanel className="p-0">
              <DeadlineList deadlines={deadlines} />
            </FramePanel>
          </Frame>
          <FromOnboarding clientId={clientId} />
          {month?.status === "open" ? <AttentionList items={attention} /> : null}
        </div>
        <div className="grid min-w-0 items-start gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-1">
          <Engagement client={client} />
          <WhoDoesWhat client={client} />
          <AgentRules client={client} />
          <Contacts client={client} />
          <Notes client={client} />
          <History client={client} />
        </div>
      </div>
    </div>
  )
}
