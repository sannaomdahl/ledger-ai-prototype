"use client"

// Deadlines with what stands in their way. One row per deadline: a date
// block, what is due, why it is (or isn't) ready, and a link to the work.
// shadcn Item rows inside a ReUI Frame.
import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/reui/badge"
import { cn } from "cn"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import {
  daysUntil,
  type Deadline,
  type DeadlineStatus,
} from "@/lib/accounting/deadlines"

const STATUS: Record<
  DeadlineStatus,
  { label: string; variant: "success-light" | "info-light" | "warning-light" | "outline" }
> = {
  done: { label: "Done", variant: "success-light" },
  ready: { label: "Ready", variant: "info-light" },
  blocked: { label: "Blocked", variant: "warning-light" },
  upcoming: { label: "Upcoming", variant: "outline" },
}

export function DateBlock({ iso, status }: { iso: string; status: DeadlineStatus }) {
  const date = new Date(iso)
  const days = daysUntil(iso)
  const soon = status !== "done" && days <= 7
  return (
    <div
      className={cn(
        "border-border flex w-12 shrink-0 flex-col items-center rounded-md border py-1 leading-none",
        soon && status === "blocked" && "border-warning/40 bg-warning/5"
      )}
    >
      <span className="text-muted-foreground text-[10px] font-medium uppercase">
        {new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date)}
      </span>
      <span className="text-foreground text-base font-semibold tabular-nums">
        {date.getDate()}
      </span>
    </div>
  )
}

function when(iso: string, status: DeadlineStatus) {
  if (status === "done") return null
  const days = daysUntil(iso)
  if (days < 0) return `${-days}d overdue`
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return `In ${days} days`
}

export function DeadlineRow({
  deadline,
  showClient,
}: {
  deadline: Deadline
  showClient?: boolean
}) {
  const status = STATUS[deadline.status]
  const client = CLIENT_BY_ID.get(deadline.clientId)
  const { review, waiting, drafts } = deadline.blockers
  const relative = when(deadline.date, deadline.status)

  return (
    <Item
      size="sm"
      render={<Link href={deadline.href} />}
      className="hover:bg-muted/40 rounded-none px-3 transition-colors duration-150"
    >
      <ItemMedia className="self-center">
        <DateBlock iso={deadline.date} status={deadline.status} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="w-full min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
          <span className="min-w-0 truncate">
            {showClient ? `${client?.name} · ` : ""}
            {deadline.title}
          </span>
          <Badge variant={status.variant} size="sm" className="shrink-0">
            {status.label}
          </Badge>
        </ItemTitle>
        <ItemDescription className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {relative ? (
            <span
              className={cn(
                "shrink-0 font-medium",
                deadline.status === "blocked" ? "text-warning-text" : "text-foreground"
              )}
            >
              {relative}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{deadline.detail}</span>
        </ItemDescription>
        {deadline.status === "blocked" && review + waiting + drafts > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {review ? (
              <Badge variant="outline" size="sm" className="font-normal">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {review} to review
              </Badge>
            ) : null}
            {waiting ? (
              <Badge variant="outline" size="sm" className="font-normal">
                <span className="size-1.5 rounded-full bg-sky-500" aria-hidden="true" />
                {waiting} with customer
              </Badge>
            ) : null}
            {drafts ? (
              <Badge variant="outline" size="sm" className="font-normal">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {drafts} to decide
              </Badge>
            ) : null}
          </div>
        ) : null}
      </ItemContent>
      <ItemActions>
        <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
      </ItemActions>
    </Item>
  )
}

/** Several customers with the same deadline on the same day, folded into
    one row that expands in place. Blocked ones are counted on the row and
    listed first when it opens. */
export function DeadlineGroupRow({ deadlines }: { deadlines: Deadline[] }) {
  const [open, setOpen] = useState(false)
  const first = deadlines[0]
  const blocked = deadlines.filter((d) => d.status === "blocked").length
  const status = blocked
    ? { label: `${blocked} blocked`, variant: STATUS.blocked.variant }
    : STATUS[first.status]
  const relative = when(first.date, blocked ? "blocked" : first.status)
  const sorted = [...deadlines].sort(
    (a, b) => Number(b.status === "blocked") - Number(a.status === "blocked")
  )
  const names = deadlines
    .map((d) => CLIENT_BY_ID.get(d.clientId)?.name.replace(/ (AS|DA|SA)$/, ""))
    .join(", ")

  return (
    <div>
      <Item
        size="sm"
        render={
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          />
        }
        className="hover:bg-muted/40 w-full rounded-none px-3 text-left transition-colors duration-150"
      >
        <ItemMedia className="self-center">
          <DateBlock iso={first.date} status={blocked ? "blocked" : first.status} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle className="w-full min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
            <span className="min-w-0 truncate">
              {first.title} · {deadlines.length} customers
            </span>
            <Badge variant={status.variant} size="sm" className="shrink-0">
              {status.label}
            </Badge>
          </ItemTitle>
          <ItemDescription className="flex min-w-0 items-center gap-x-2 text-xs">
            {relative ? (
              <span
                className={cn(
                  "shrink-0 font-medium",
                  blocked ? "text-warning-text" : "text-foreground"
                )}
              >
                {relative}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{names}</span>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChevronDownIcon
            className={cn(
              "text-muted-foreground ease-snappy size-4 transition-[rotate] duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </ItemActions>
      </Item>
      {open ? (
        <div className="bg-muted/20 border-t">
          {sorted.map((deadline, index) => (
            <div key={deadline.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <DeadlineRow deadline={deadline} showClient />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DeadlineList({
  deadlines,
  showClient,
  empty = "No deadlines this month.",
}: {
  deadlines: Deadline[]
  showClient?: boolean
  empty?: string
}) {
  if (deadlines.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">{empty}</p>
    )
  }
  return (
    <div className="flex flex-col">
      {deadlines.map((deadline, index) => (
        <div key={deadline.id}>
          {index > 0 ? <Separator className="opacity-60" /> : null}
          <DeadlineRow deadline={deadline} showClient={showClient} />
        </div>
      ))}
    </div>
  )
}
