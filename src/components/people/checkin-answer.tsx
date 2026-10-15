"use client"

// The customer's side of a pay period check-in. Most months nothing
// changed, so that is one big tap. Otherwise five short questions, any of
// them optional. The cut-off and what happens after it are said plainly,
// because a late answer moves everyone's payday.
import { useState } from "react"
import { CheckIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ACCOUNTANT_BY_ID, CLIENT_BY_ID, dayLabel, monthLabel, payDates } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { payDateIfAnsweredOn } from "@/lib/accounting/people"
import { usePortalContact, useStillOpen } from "@/components/portal/portal-contact"
import { useAccounting } from "@/lib/accounting/store"
import type { CheckinAnswer as Answer, CustomerRequest } from "@/lib/accounting/types"

const FIELDS: { key: Exclude<keyof Answer, "noChanges">; label: string; placeholder: string }[] = [
  {
    key: "hires",
    label: "Anyone new?",
    placeholder: "Name, job, start date and pay. Sofie Berg, barista, from 1 Dec, 215 kr an hour",
  },
  { key: "leavers", label: "Anyone leaving?", placeholder: "Name and the date of their last working day. Ida, last day 30 Nov" },
  { key: "absence", label: "Holidays or sick leave?", placeholder: "Who, and which days" },
  { key: "overtime", label: "Any overtime?", placeholder: "Who, and how many hours. Ida, 6 h on 10 and 17 Oct" },
  { key: "other", label: "Anything else?", placeholder: "A bonus, a new pay rate, a changed position…" },
]

export function CheckinAnswer({
  request,
  onSent,
}: {
  request: CustomerRequest
  onSent: () => void
}) {
  const { dispatch } = useAccounting()
  const viewer = usePortalContact()
  const stillOpen = useStillOpen(request)
  const [answer, setAnswer] = useState<Omit<Answer, "noChanges">>({})
  const client = CLIENT_BY_ID.get(request.clientId)
  const accountant = client ? ACCOUNTANT_BY_ID.get(client.accountantId) : undefined
  const dates = client ? payDates(client, request.period) : undefined
  const late = dates ? TODAY > dates.cutoff : false
  const filled = FIELDS.some((f) => answer[f.key]?.trim())

  function send(next: Answer) {
    if (!stillOpen()) return onSent()
    dispatch({
      type: "customer_checkin",
      requestId: request.id,
      answer: next,
      contactId: viewer?.id,
    })
    toast.success(`Sent to ${accountant?.name.split(" ")[0] ?? "your accountant"}`, {
      description: next.noChanges
        ? "Thanks, that settles it. We'll send you the pay run to approve before payday."
        : "We'll add the changes to the pay run and send it to you to approve.",
    })
    onSent()
  }

  return (
    <div className="flex flex-col gap-4">
      {dates ? (
        <p className="text-muted-foreground text-sm text-pretty">
          {late ? (
            <>
              The cut-off was <span className="text-foreground font-medium">{dayLabel(dates.cutoff)}</span>.
              If you reply today, payday moves to{" "}
              <span className="text-foreground font-medium">
                {dayLabel(payDateIfAnsweredOn(client!, request.period, TODAY))}
              </span>{" "}
              because the answers came in late.
            </>
          ) : (
            <>
              This is about the hours worked in {monthLabel(request.period).split(" ")[0]}, paid on{" "}
              {dayLabel(dates.payDate)}. Reply by <span className="text-foreground font-medium">{dayLabel(dates.cutoff)}</span> so
              salaries go out on <span className="text-foreground font-medium">{dayLabel(dates.payDate)}</span>.
              Later than that, payday moves.
            </>
          )}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="h-11 w-full text-[15px]"
        onClick={() => send({ noChanges: true })}
      >
        <CheckIcon data-icon="inline-start" aria-hidden="true" />
        No changes since last month
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" aria-hidden="true" />
        or tell us what changed
        <span className="bg-border h-px flex-1" aria-hidden="true" />
      </div>

      <FieldGroup className="gap-3">
        {FIELDS.map((field) => (
          <Field key={field.key}>
            <FieldLabel htmlFor={`${request.id}-${field.key}`}>{field.label}</FieldLabel>
            <Textarea
              id={`${request.id}-${field.key}`}
              value={answer[field.key] ?? ""}
              onChange={(e) => setAnswer((a) => ({ ...a, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="min-h-11 resize-none"
            />
          </Field>
        ))}
      </FieldGroup>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={!filled}
          onClick={() =>
            send({
              noChanges: false,
              ...Object.fromEntries(
                FIELDS.map((f) => [f.key, answer[f.key]?.trim() || undefined])
              ),
            })
          }
        >
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send changes
        </Button>
      </div>
    </div>
  )
}
