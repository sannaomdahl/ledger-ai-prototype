"use client"

// Dismissing an agent's draft question: the question is not sent, the line
// stays in the accountant's review queue, and the reason goes back to the
// agents so they draft fewer questions like it. Undo restores the draft.
import { useState, type ReactElement } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  DISMISS_REASONS,
  useAccounting,
  type DismissReason,
} from "@/lib/accounting/store"
import type { CustomerRequest } from "@/lib/accounting/types"

export function DismissDraft({
  request,
  trigger,
}: {
  request: CustomerRequest
  trigger: ReactElement
}) {
  const { dispatch } = useAccounting()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<DismissReason>("have_info")

  function dismiss() {
    dispatch({ type: "dismiss_draft", requestId: request.id, reason })
    setOpen(false)
    toast.message("Draft dismissed", {
      description: "Nothing was sent. The line stays in your review queue.",
      action: {
        label: "Undo",
        onClick: () => dispatch({ type: "restore_draft", request }),
      },
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 gap-3">
        <PopoverHeader>
          <PopoverTitle>Don&apos;t send this question?</PopoverTitle>
          <PopoverDescription className="text-xs">
            The customer won&apos;t see it. The line stays in your review queue,
            and the agent learns from your reason.
          </PopoverDescription>
        </PopoverHeader>
        <Field>
          <FieldLabel className="sr-only">Reason</FieldLabel>
          <RadioGroup
            value={reason}
            onValueChange={(value) => setReason(value as DismissReason)}
            className="gap-2"
          >
            {(Object.keys(DISMISS_REASONS) as DismissReason[]).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <RadioGroupItem value={key} />
                {DISMISS_REASONS[key]}
              </label>
            ))}
          </RadioGroup>
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Keep draft
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
