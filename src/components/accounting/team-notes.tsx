"use client"

// The firm's side of a task: where it stands between colleagues, and the
// notes they leave each other. Nothing here reaches the customer app.
import { useState, type Ref } from "react"
import { cn } from "cn"
import {
  AlarmClockIcon,
  ArrowRightLeftIcon,
  LockIcon,
  MessageSquareReplyIcon,
  MessagesSquareIcon,
  SendIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CURRENT_USER, TEAM_BY_ID } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import { isSnoozed, type Task } from "@/lib/accounting/team"
import { DotSeparator } from "./primitives"

type TeamStatus = { label: string; icon: LucideIcon; className: string }

function firstName(id?: string) {
  return (id && TEAM_BY_ID.get(id)?.name.split(" ")[0]) || "A colleague"
}

/** Where a task stands inside the firm, in one line, or nothing. */
export function teamStatusOf(task: Task): TeamStatus | null {
  const h = task.handoff
  const me = CURRENT_USER.id
  if (h?.mode === "ask" && h.status === "open") {
    if (h.to === me)
      return {
        label: `${firstName(h.from)} asked you`,
        icon: MessageSquareReplyIcon,
        className: "text-primary",
      }
    return {
      label: `Waiting on ${firstName(h.to)}`,
      icon: UsersIcon,
      className: "text-muted-foreground",
    }
  }
  if (h?.mode === "ask" && h.status === "answered" && h.from === me)
    return {
      label: `${firstName(h.to)} answered`,
      icon: MessagesSquareIcon,
      className: "text-info-text",
    }
  if (h?.mode === "handover" && task.assigneeId) {
    if (task.assigneeId === me && h.from !== me)
      return {
        label: `Handed to you by ${firstName(h.from)}`,
        icon: ArrowRightLeftIcon,
        className: "text-primary",
      }
    if (task.assigneeId !== me)
      return {
        label: `With ${firstName(task.assigneeId)}`,
        icon: ArrowRightLeftIcon,
        className: "text-muted-foreground",
      }
  }
  if (isSnoozed(task) && task.snoozedUntil)
    return {
      label: `Snoozed until ${new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(`${task.snoozedUntil}T12:00:00`))}`,
      icon: AlarmClockIcon,
      className: "text-muted-foreground",
    }
  return null
}

export function TeamStatusLine({
  task,
  className,
}: {
  task: Task
  className?: string
}) {
  const status = teamStatusOf(task)
  if (!status) return null
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-xs [&_svg]:size-3 [&_svg]:shrink-0",
        status.className,
        className
      )}
    >
      <status.icon aria-hidden="true" />
      <span className="truncate">{status.label}</span>
    </span>
  )
}

/** Whether the team tab has something new for me. */
export function teamNeedsMe(task: Task) {
  const h = task.handoff
  const me = CURRENT_USER.id
  return (
    (h?.mode === "ask" && h.status === "open" && h.to === me) ||
    (h?.mode === "ask" && h.status === "answered" && h.from === me)
  )
}

export function TeamNotes({
  task,
  composerRef,
}: {
  task: Task
  composerRef?: Ref<HTMLTextAreaElement>
}) {
  const { dispatch } = useAccounting()
  const [text, setText] = useState("")
  const h = task.handoff
  const me = CURRENT_USER.id
  const notes = task.notes ?? []
  const askedMe = h?.mode === "ask" && h.status === "open" && h.to === me
  const waiting = h?.mode === "ask" && h.status === "open" && h.from === me
  const asker = firstName(h?.from)
  const colleague = firstName(h?.to)

  function send() {
    const body = text.trim()
    if (!body) return
    dispatch({ type: "team_note", id: task.id, text: body })
    setText("")
    toast.success(askedMe ? `Answered ${asker}` : "Note added", {
      description: askedMe
        ? `${asker} sees your answer on the task and on their Home.`
        : "Only your team sees it.",
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 && !h ? (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
          <UsersIcon className="text-muted-foreground size-5" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-sm font-medium">
              Nobody else is on this yet
            </p>
            <p className="text-muted-foreground text-xs text-balance">
              Ask a colleague for input and keep the task, or hand it over.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "open_team_dialog", id: task.id, mode: "ask" })}
            >
              <UsersIcon data-icon="inline-start" aria-hidden="true" />
              Ask a colleague
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                dispatch({ type: "open_team_dialog", id: task.id, mode: "handover" })
              }
            >
              <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
              Hand over
            </Button>
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map((note) => {
            const author = TEAM_BY_ID.get(note.authorId)
            return (
              <li key={note.id} className="flex gap-2.5">
                <Avatar className="mt-px size-6">
                  <AvatarFallback className="text-[10px]">
                    {author?.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="text-foreground font-medium">
                      {note.authorId === me ? "You" : author?.name}
                    </span>
                    <DotSeparator />
                    <span>{note.time}</span>
                  </p>
                  <p className="text-foreground text-sm leading-5 whitespace-pre-line">
                    {note.text}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {waiting ? (
        <p className="bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs">
          <UsersIcon className="size-3.5" aria-hidden="true" />
          Waiting on {colleague}. The task stays yours.
        </p>
      ) : null}

      {notes.length > 0 || h ? (
        <div className="flex flex-col gap-2">
          <Textarea
            ref={composerRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={askedMe ? `Answer ${asker}…` : "Write a note for the team…"}
            aria-label={askedMe ? `Answer to ${asker}` : "Note for the team"}
            className="min-h-16 resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <LockIcon className="size-3" aria-hidden="true" />
              Only your team sees this
            </span>
            <Button type="button" size="sm" disabled={!text.trim()} onClick={send}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              {askedMe ? `Answer ${asker}` : "Add note"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
