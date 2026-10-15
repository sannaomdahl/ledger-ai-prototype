"use client"

// A task added by hand, in any phase: something the template doesn't cover.
// It sits in a group like the template's own (an existing one, or a new
// one), can block the approval, and can carry a question for the company
// that goes out on their link now or later.
import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  company,
  hasCustomerLink,
  PHASE_LABEL,
  phaseTasks,
  type ManualAskKind,
  type OnboardingCase,
  type Phase,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"

const NEW_GROUP = "__new"

const ASK_KIND: { id: ManualAskKind; label: string; hint: string }[] = [
  { id: "confirm", label: "Confirm", hint: "They tick it off when it's done." },
  { id: "text", label: "Answer", hint: "They write a short answer." },
  { id: "file", label: "File", hint: "They upload a document." },
  { id: "choice", label: "Choose", hint: "They pick one of your options." },
]

export function AddTaskDialog({
  c,
  phase,
  group,
  open,
  onOpenChange,
}: {
  c: OnboardingCase
  phase: Phase
  /** The group to start in, when added from a group's card. */
  group?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <AddTaskForm c={c} phase={phase} group={group} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AddTaskForm({
  c,
  phase,
  group: startGroup,
  onDone,
}: {
  c: OnboardingCase
  phase: Phase
  group?: string
  onDone: () => void
}) {
  const { dispatch } = useAccounting()
  const first = company(c).contact.name.split(" ")[0]
  const groups = [...new Set([...phaseTasks(c, phase).map((t) => t.group), "Other"])]
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [group, setGroup] = useState(startGroup ?? "Other")
  const [newGroup, setNewGroup] = useState("")
  // Only setup, takeover and the assessment wait on their tasks.
  const blocks = phase !== "offer"
  const [required, setRequired] = useState(blocks)
  const [asking, setAsking] = useState(false)
  const [kind, setKind] = useState<ManualAskKind>("confirm")
  const [message, setMessage] = useState("")
  const [options, setOptions] = useState("")
  // One per line; a single line splits on commas.
  const choices = (options.includes("\n") ? options.split("\n") : options.split(","))
    .map((o) => o.trim())
    .filter(Boolean)
  // It can only go out on a link that exists, for the phase that is running.
  const canSend = hasCustomerLink(c) && phase === c.phase
  const [send, setSend] = useState(canSend)
  const groupName = group === NEW_GROUP ? newGroup.trim() : group
  const valid =
    Boolean(title.trim()) &&
    Boolean(groupName) &&
    (!asking || (Boolean(message.trim()) && (kind !== "choice" || choices.length >= 2)))

  function submit() {
    if (!valid) return
    const sent = asking && send && canSend
    dispatch({
      type: "onboarding",
      action: {
        type: "add_task",
        caseId: c.id,
        phase,
        group: groupName,
        title: title.trim(),
        note: note.trim() || undefined,
        required: blocks && required,
        ask: asking ? { kind, message: message.trim(), options: kind === "choice" ? choices : undefined } : undefined,
        send: sent,
      },
    })
    toast.success("Task added", {
      description: sent ? `Sent to ${first} on their onboarding page.` : `Under ${groupName} in ${PHASE_LABEL[phase].toLowerCase()}.`,
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
        <DialogTitle>Add a task to {PHASE_LABEL[phase].toLowerCase()}</DialogTitle>
        <DialogDescription className="text-pretty">
          For anything the checklist doesn&apos;t cover. Only the team sees the note.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="task-title">Task</FieldLabel>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="E.g. Check the leasing contracts"
          autoFocus
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="task-note">
          Note <span className="text-muted-foreground font-normal">· optional</span>
        </FieldLabel>
        <Textarea
          id="task-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to look for, and why"
          className="min-h-16 resize-none"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="task-group">Group</FieldLabel>
        <div className="flex gap-2">
          <Select
            value={group}
            items={[...groups.map((g) => ({ value: g, label: g })), { value: NEW_GROUP, label: "New group…" }]}
            onValueChange={(value) => value && setGroup(value)}
          >
            <SelectTrigger id="task-group" className={group === NEW_GROUP ? "w-36 shrink-0" : "w-full"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {groups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value={NEW_GROUP}>New group…</SelectItem>
            </SelectContent>
          </Select>
          {group === NEW_GROUP ? (
            <Input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Group name"
              aria-label="New group name"
              autoFocus
            />
          ) : null}
        </div>
      </Field>

      {blocks ? (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="task-required">Required</FieldLabel>
            <FieldDescription>
              {phase === "assessment"
                ? "The offer can't go out until it's settled."
                : `${PHASE_LABEL[phase]} can't be approved until it's settled.`}
            </FieldDescription>
          </FieldContent>
          <Switch id="task-required" checked={required} onCheckedChange={setRequired} />
        </Field>
      ) : null}

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="task-ask">Ask {first}</FieldLabel>
          <FieldDescription>It goes on their onboarding page.</FieldDescription>
        </FieldContent>
        <Switch id="task-ask" checked={asking} onCheckedChange={setAsking} />
      </Field>

      {asking ? (
        <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Tabs value={kind} onValueChange={(v) => setKind(v as ManualAskKind)}>
              <TabsList>
                {ASK_KIND.map((k) => (
                  <TabsTrigger key={k.id} value={k.id} className="px-2.5 text-xs">
                    {k.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="text-muted-foreground text-xs">{ASK_KIND.find((k) => k.id === kind)!.hint}</span>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Hi ${first}, …`}
            aria-label={`Message to ${first}`}
            className="bg-background min-h-16 resize-none"
          />
          {kind === "choice" ? (
            <Textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={"One option per line\nYes, we have it\nNo, not yet"}
              aria-label="Options"
              className="bg-background min-h-16 resize-none"
            />
          ) : null}
          {canSend ? (
            <Field orientation="horizontal">
              <Checkbox id="task-send" checked={send} onCheckedChange={setSend} />
              <FieldLabel htmlFor="task-send" className="font-normal">
                Send it now
              </FieldLabel>
            </Field>
          ) : (
            <p className="text-muted-foreground text-xs text-pretty">
              {hasCustomerLink(c)
                ? `Saved as a draft. Send it once ${PHASE_LABEL[phase].toLowerCase()} starts.`
                : "Saved as a draft. Their link opens with the offer."}
            </p>
          )}
        </div>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!valid}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          Add task
        </Button>
      </DialogFooter>
    </form>
  )
}
