"use client"

// Remind, with what the reminder says in front of the accountant: what is
// still open on the task, line by line, in a message they can edit. It
// lands on the task in the customer's app (and by e-mail).
import { useState } from "react"
import { BellRingIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import { remindText, useAccounting } from "@/lib/accounting/store"
import type { CustomerRequest } from "@/lib/accounting/types"

export function RemindButton({ request }: { request: CustomerRequest }) {
  const { state, dispatch } = useAccounting()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const client = CLIENT_BY_ID.get(request.clientId)
  const contact = client?.contacts.find((c) => c.id === request.recipientId) ?? client?.contacts[0]
  const first = contact?.name.split(" ")[0] ?? "the customer"

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => {
          setText(`Hi ${first}, ${remindText(state, request)}`)
          setOpen(true)
        }}
      >
        <BellRingIcon data-icon="inline-start" aria-hidden="true" />
        Remind
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Remind {first}</DialogTitle>
            <DialogDescription>
              {request.title} · {request.id} · sent {request.sentAt}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Reminder"
            className="min-h-28 resize-none text-sm"
          />
          <p className="text-muted-foreground text-xs text-pretty">
            Shows on the task in {first}&apos;s app, and goes by e-mail.
          </p>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                dispatch({ type: "remind", requestId: request.id, text: text.replace(/^Hi [^,]+, /, "") })
                toast.message(`Reminder sent to ${first}`, { description: request.title })
                setOpen(false)
              }}
            >
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
