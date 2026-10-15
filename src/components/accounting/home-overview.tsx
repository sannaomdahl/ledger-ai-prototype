"use client"

// The accountant's start page, built around what needs them now: a row of
// counts on top, the people waiting on them (colleagues, then customers) in
// the main column, and the deadlines coming up beside it. People waiting on
// me show whatever month they belong to; deadlines and drafts are for the open
// month.
import Link from "next/link"
import { useState, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import {
  CalendarClockIcon,
  MessageSquareDashedIcon,
  MessagesSquareIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { CLIENT_BY_ID, CURRENT_USER, MONTHS, OPEN_MONTH, TEAM_BY_ID } from "@/lib/accounting/data"
import {
  daysUntil,
  getClientDeadlines,
  type Deadline,
} from "@/lib/accounting/deadlines"
import { caseStatus, isOnboarding } from "@/lib/accounting/onboarding"
import { lastCustomerText, scopedClients, useAccounting } from "@/lib/accounting/store"
import { bundleAnswer, bundleLabel } from "@/lib/accounting/request-labels"
import { teamInbox, type InboxEntry } from "@/lib/accounting/team"
import { DeadlineGroupRow, DeadlineRow } from "./deadline-list"
import { useOpenTask } from "./use-open-task"

/** How far ahead "Coming up" looks before "Show all". */
const HORIZON_DAYS = 14

const INBOX_REASON: Record<InboxEntry["reason"], (name: string) => string> = {
  asked_you: (name) => `${name} asked you`,
  handed_you: (name) => `${name} handed it to you`,
  answered: (name) => `${name} answered`,
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

type Counter = {
  label: string
  value: number
  icon: ReactNode
  /** stats-12's icon colour. */
  iconClassName: string
  /** stats-12's status line under the value. */
  info: ReactNode
  /** A section on this page, or another page. */
  target: { section: string } | { href: string }
}

// @reui/stats-12 · stat card, made clickable: it jumps to the list the
// number counts, so the tile is the way in, not just a readout.
function CounterCard({ counter }: { counter: Counter }) {
  const className =
    "group/stat focus-visible:ring-ring/50 block w-full rounded-(--radius-xl) text-left outline-none focus-visible:ring-[3px]"
  const card = (
    <Frame className="h-full transition-[box-shadow] duration-150 group-hover/stat:shadow-md">
      <FramePanel className="flex h-full flex-col items-start gap-6">
        <Item
          render={<span />}
          className={cn(
            "border-background bg-muted flex size-10.5 items-center justify-center border-2 p-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-5",
            counter.iconClassName
          )}
        >
          <ItemMedia variant="icon" className="size-auto">
            {counter.icon}
          </ItemMedia>
        </Item>

        <div className="space-y-0.5">
          <div className="text-foreground text-2xl leading-none font-bold tabular-nums">
            {counter.value}
          </div>
          <div className="text-muted-foreground text-sm font-medium">
            {counter.label}
          </div>
        </div>

        {counter.info}
      </FramePanel>
    </Frame>
  )
  if ("href" in counter.target)
    return (
      <Link href={counter.target.href} className={className}>
        {card}
      </Link>
    )
  const section = counter.target.section
  return (
    <button type="button" onClick={() => scrollToSection(section)} className={className}>
      {card}
    </button>
  )
}

/** One person waiting on me: who, about what, and what they said. */
function InboxRow({
  avatar,
  icon,
  title,
  context,
  quote,
  onOpen,
}: {
  avatar?: string
  icon?: ReactNode
  title: string
  context: string
  quote?: string
  onOpen: () => void
}) {
  return (
    <Item
      size="sm"
      render={<button type="button" onClick={onOpen} />}
      className="hover:bg-muted/40 w-full items-start rounded-none px-3 text-left transition-colors duration-150"
    >
      <ItemMedia className="self-start">
        {avatar ? (
          <Avatar className="mt-0.5 size-6">
            <AvatarFallback className="text-[10px]">{avatar}</AvatarFallback>
          </Avatar>
        ) : (
          icon
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="w-full min-w-0 text-sm">
          <span className="truncate">{title}</span>
        </ItemTitle>
        <ItemDescription className="truncate text-xs">{context}</ItemDescription>
        {quote ? (
          <ItemDescription className="text-foreground line-clamp-2 text-xs">
            “{quote}”
          </ItemDescription>
        ) : null}
      </ItemContent>
    </Item>
  )
}

/** Same deadline, same day: one row, however many customers. */
function foldDeadlines(deadlines: Deadline[]) {
  return deadlines.reduce<Deadline[][]>((groups, d) => {
    const last = groups[groups.length - 1]
    if (last && last[0].date === d.date && last[0].kind === d.kind) last.push(d)
    else groups.push([d])
    return groups
  }, [])
}

export function HomeOverview() {
  const { state, dispatch } = useAccounting()
  const openTask = useOpenTask()
  const [showAll, setShowAll] = useState(false)
  // Home is always my desk, whatever the Clients page is browsing.
  const clients = scopedClients("mine")
  const month = MONTHS.find((m) => m.id === OPEN_MONTH)
  const inScope = new Set(clients.map((c) => c.id))

  const deadlines = clients
    .flatMap((client) =>
      getClientDeadlines(client, OPEN_MONTH, state.items, state.requests, state)
    )
    .filter((d) => d.status !== "done")
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
  const soon = deadlines.filter((d) => daysUntil(d.date) <= HORIZON_DAYS)
  const groups = foldDeadlines(showAll ? deadlines : soon)
  const blocked = soon.filter((d) => d.status === "blocked").length
  const thisWeek = deadlines.filter(
    (d) => d.status !== "done" && daysUntil(d.date) <= 7
  ).length

  // Asks and handovers reach me on any client, not only my own.
  const fromTeam = teamInbox([...state.items, ...state.requests])
  const mine = state.requests.filter((r) => inScope.has(r.clientId))
  const replies = mine.filter((r) => r.status === "replied")
  // Agent drafts belong to the month they were drafted for.
  const drafts = mine.filter(
    (r) => r.status === "draft" && r.period === OPEN_MONTH
  ).length
  /** "· August 2026" on a row from another month than the open one. */
  const otherMonth = (period: string) =>
    period === OPEN_MONTH
      ? ""
      : ` · ${MONTHS.find((m) => m.id === period)?.label ?? period}`

  const askedMe = fromTeam.filter((e) => e.reason !== "answered").length
  const questions = replies.filter((r) => r.origin === "customer").length
  const blockedThisWeek = deadlines.filter(
    (d) => d.status === "blocked" && daysUntil(d.date) <= 7
  ).length

  // Companies on their way in that are mine.
  const onboarding = state.onboarding.filter(
    (c) => c.accountantId === CURRENT_USER.id && isOnboarding(c)
  )
  const onboardingMine = onboarding.filter((c) => caseStatus(c).ball === "us").length

  const counters: Counter[] = [
    {
      label: "From your team",
      value: fromTeam.length,
      icon: <UsersIcon aria-hidden="true" />,
      iconClassName: "text-teal-600 dark:text-teal-400",
      info: askedMe ? (
        <Badge variant="warning-light">{askedMe} waiting on you</Badge>
      ) : (
        <Badge variant="outline">Nothing waiting on you</Badge>
      ),
      target: { section: "home-team" },
    },
    {
      label: "From customers",
      value: replies.length,
      icon: <MessagesSquareIcon aria-hidden="true" />,
      iconClassName: "text-violet-600 dark:text-violet-400",
      info: (
        <Badge variant="info-light">
          {questions} {questions === 1 ? "question" : "questions"},{" "}
          {replies.length - questions} {replies.length - questions === 1 ? "answer" : "answers"}
        </Badge>
      ),
      target: { section: "home-customers" },
    },
    {
      label: "Questions to decide",
      value: drafts,
      icon: <MessageSquareDashedIcon aria-hidden="true" />,
      iconClassName: "text-amber-600 dark:text-amber-400",
      info: <Badge variant="outline">Agent drafts · {month?.label}</Badge>,
      target: { href: "/requests" },
    },
    {
      label: "Due in 7 days",
      value: thisWeek,
      icon: <CalendarClockIcon aria-hidden="true" />,
      iconClassName: "text-blue-600 dark:text-blue-400",
      info: blockedThisWeek ? (
        <Badge variant="warning-light">{blockedThisWeek} blocked</Badge>
      ) : (
        <Badge variant="success-light">All on track</Badge>
      ),
      target: { section: "home-deadlines" },
    },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="text-foreground text-lg font-semibold tracking-tight">
            Good morning, {CURRENT_USER.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
            <span>{clients.length} of your customers</span>
            {onboarding.length ? (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href="/onboarding"
                  className="hover:text-foreground underline-offset-4 transition-colors duration-150 hover:underline"
                >
                  {onboarding.length} onboarding
                  {onboardingMine ? `, ${onboardingMine} waiting on you` : ""}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => dispatch({ type: "open_task_composer", clientId: null })}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          New task
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
        {counters.map((counter) => (
          <CounterCard key={counter.label} counter={counter} />
        ))}
      </div>

      <div className="grid min-w-0 items-start gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <section id="home-team" className="scroll-mt-4">
            <Frame dense spacing="sm" className="w-full">
              <FrameHeader className="flex-row items-center justify-between gap-2">
                <div className="flex flex-col gap-px">
                  <FrameTitle>From your team</FrameTitle>
                  <FrameDescription className="text-xs">
                    Questions, handovers and answers from colleagues
                  </FrameDescription>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {fromTeam.length}
                </Badge>
              </FrameHeader>
              <FramePanel className="p-0">
                {fromTeam.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Nothing from colleagues.
                  </p>
                ) : (
                  fromTeam.map(({ task, handoff, reason }, index) => {
                    const client = CLIENT_BY_ID.get(task.clientId)
                    const who = TEAM_BY_ID.get(
                      reason === "answered" ? handoff.to : handoff.from
                    )
                    const said =
                      reason === "answered"
                        ? task.notes?.findLast((n) => n.authorId === handoff.to)?.text
                        : handoff.note
                    return (
                      <div key={task.id}>
                        {index > 0 ? <Separator className="opacity-60" /> : null}
                        <InboxRow
                          avatar={who?.initials}
                          title={task.title}
                          context={`${INBOX_REASON[reason](who?.name.split(" ")[0] ?? "A colleague")}${client ? ` · ${client.name}` : ""}${otherMonth(task.period)}`}
                          quote={said || undefined}
                          onOpen={() => openTask(task)}
                        />
                      </div>
                    )
                  })
                )}
              </FramePanel>
            </Frame>
          </section>

          <section id="home-customers" className="scroll-mt-4">
            <Frame dense spacing="sm" className="w-full">
              <FrameHeader className="flex-row items-center justify-between gap-2">
                <div className="flex flex-col gap-px">
                  <FrameTitle>From customers</FrameTitle>
                  <FrameDescription className="text-xs">
                    Answers and questions waiting on you
                  </FrameDescription>
                </div>
                <Badge variant="info-light" className="tabular-nums">
                  {replies.length}
                </Badge>
              </FrameHeader>
              <FramePanel className="p-0">
                {replies.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Nothing waiting.
                  </p>
                ) : (
                  replies.map((request, index) => {
                    const client = CLIENT_BY_ID.get(request.clientId)
                    return (
                      <div key={request.id}>
                        {index > 0 ? <Separator className="opacity-60" /> : null}
                        <InboxRow
                          icon={
                            <MessagesSquareIcon
                              className="text-info-text mt-1 size-4"
                              aria-hidden="true"
                            />
                          }
                          title={request.title}
                          context={`${client?.name ?? ""}${request.origin === "customer" ? " · Question" : ""}${bundleLabel(request) ? ` · ${bundleLabel(request)}` : ""}${otherMonth(request.period)}`}
                          quote={bundleAnswer(request) ?? lastCustomerText(request)}
                          // On the client's process tab, walking this
                          // client's replies.
                          onOpen={() =>
                            openTask(
                              request,
                              replies
                                .filter((r) => r.clientId === request.clientId)
                                .map((r) => r.itemId ?? r.id)
                            )
                          }
                        />
                      </div>
                    )
                  })
                )}
              </FramePanel>
            </Frame>
          </section>
        </div>

        <section id="home-deadlines" className="scroll-mt-4">
          <Frame dense spacing="sm" className="w-full">
            <FrameHeader className="flex-row items-center justify-between gap-2">
              <div className="flex flex-col gap-px">
                <FrameTitle>
                  {showAll
                    ? `Deadlines · ${month?.label}`
                    : `Coming up · ${month?.label}`}
                </FrameTitle>
                <FrameDescription className="text-xs">
                  {showAll
                    ? `${deadlines.length} deadlines this month`
                    : blocked
                      ? `Next 2 weeks · ${blocked} blocked by open work`
                      : "Next 2 weeks · all on track"}
                </FrameDescription>
              </div>
            </FrameHeader>
            <FramePanel className="p-0">
              {groups.length === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                  Nothing due in the next 2 weeks.
                </p>
              ) : (
                groups.map((group, index) => (
                  <div key={group[0].id}>
                    {index > 0 ? <Separator className="opacity-60" /> : null}
                    {group.length > 1 ? (
                      <DeadlineGroupRow deadlines={group} />
                    ) : (
                      <DeadlineRow deadline={group[0]} showClient />
                    )}
                  </div>
                ))
              )}
            </FramePanel>
            {deadlines.length > soon.length ? (
              <FrameFooter className="flex-row justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Show the next 2 weeks" : `Show all ${deadlines.length}`}
                </Button>
              </FrameFooter>
            ) : null}
          </Frame>
        </section>
      </div>
    </div>
  )
}
