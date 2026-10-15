"use client"

// Asking a colleague about a task, or handing it to them. Asking keeps the
// task mine and waits for their note; handing over makes it theirs.
import { useState } from "react"
import { UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CLIENT_BY_ID, CURRENT_USER, TEAM } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { Task } from "@/lib/accounting/team"
import type { Handoff, Person } from "@/lib/accounting/types"

/** Who is likely to know: people already on the task, then the client's
    accountant, then everyone else. */
function suggestionsFor(task: Task, people: Person[]) {
  const involved = new Set([
    ...(task.notes ?? []).map((n) => n.authorId),
    ...(task.handoff ? [task.handoff.from, task.handoff.to] : []),
  ])
  const owner = CLIENT_BY_ID.get(task.clientId)?.accountantId
  const rank = (p: Person) => (involved.has(p.id) ? 0 : p.id === owner ? 1 : 2)
  return [...people].sort((a, b) => rank(a) - rank(b)).slice(0, 3)
}

function TeamForm({
  task,
  initialMode,
  onDone,
}: {
  task: Task
  initialMode: Handoff["mode"]
  onDone: () => void
}) {
  const { dispatch } = useAccounting()
  const [mode, setMode] = useState(initialMode)
  const [to, setTo] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const client = CLIENT_BY_ID.get(task.clientId)
  const people = TEAM.filter((p) => p.id !== CURRENT_USER.id)
  const suggested = suggestionsFor(task, people)
  const person = people.find((p) => p.id === to)
  const first = person?.name.split(" ")[0]
  const canSend = Boolean(person) && (mode === "handover" || note.trim().length > 0)

  function submit() {
    if (!person || !canSend) return
    dispatch({ type: "team_handoff", id: task.id, mode, to: person.id, note })
    toast.success(mode === "ask" ? `Asked ${first}` : `Handed over to ${first}`, {
      description: `${first} sees it on their Home under From your team.`,
    })
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {mode === "ask" ? "Ask a colleague" : "Hand over"}
        </DialogTitle>
        <DialogDescription className="text-pretty">
          <span className="text-foreground font-medium">{task.title}</span>
          {client ? ` · ${client.name}` : null}
        </DialogDescription>
      </DialogHeader>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Handoff["mode"])}>
        <TabsList className="w-full">
          <TabsTrigger value="ask" className="flex-1 gap-1.5">
            <UsersIcon className="size-3.5" aria-hidden="true" />
            Ask for input
          </TabsTrigger>
          <TabsTrigger value="handover" className="flex-1 gap-1.5">
            <UserPlusIcon className="size-3.5" aria-hidden="true" />
            Hand over
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Field>
        <FieldLabel htmlFor="team-person">
          {mode === "ask" ? "Who should look at it?" : "Who takes it?"}
        </FieldLabel>
        <Combobox
          items={people}
          value={person ?? null}
          onValueChange={(next) => setTo((next as Person | null)?.id ?? null)}
          itemToStringLabel={(p: Person) => p.name}
          itemToStringValue={(p: Person) => p.id}
          autoHighlight
        >
          <ComboboxInput
            id="team-person"
            placeholder="Type a name…"
            showTrigger={false}
            showClear={Boolean(person)}
          />
          <ComboboxContent>
            <ComboboxEmpty>Nobody on the team by that name.</ComboboxEmpty>
            <ComboboxList>
              {(p: Person) => (
                <ComboboxItem key={p.id} value={p}>
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[9px]">{p.initials}</AvatarFallback>
                  </Avatar>
                  {p.name}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {person ? null : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Suggested</span>
            {suggested.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="xs"
                variant="outline"
                className="rounded-full"
                onClick={() => setTo(p.id)}
              >
                <Avatar className="size-4">
                  <AvatarFallback className="text-[8px]">{p.initials}</AvatarFallback>
                </Avatar>
                {p.name}
              </Button>
            ))}
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="team-note">
          {mode === "ask" ? "Your question" : "Note (optional)"}
        </FieldLabel>
        <Textarea
          id="team-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            mode === "ask"
              ? `What do you need from ${first ?? "them"}?`
              : `Anything ${first ?? "they"} should know?`
          }
          className="min-h-20 resize-none"
        />
        <p className="text-muted-foreground text-xs text-pretty">
          {mode === "ask"
            ? "The task stays yours. Their answer comes back on the task, under Team."
            : `${first ?? "They"} owns the task from now on. You can take it back under More.`}{" "}
          The customer never sees this.
        </p>
      </Field>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={!canSend}>
          {mode === "ask" ? (
            <UsersIcon data-icon="inline-start" aria-hidden="true" />
          ) : (
            <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {mode === "ask"
            ? first
              ? `Ask ${first}`
              : "Ask"
            : first
              ? `Hand over to ${first}`
              : "Hand over"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TeamDialog() {
  const { state, dispatch } = useAccounting()
  const dialog = state.teamDialog
  const task = dialog
    ? (state.items.find((i) => i.id === dialog.id) ??
      state.requests.find((r) => r.id === dialog.id))
    : undefined
  const close = () => dispatch({ type: "close_team_dialog" })

  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {task && dialog ? (
          <TeamForm key={`${task.id}-${dialog.mode}`} task={task} initialMode={dialog.mode} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
