"use client"

// The firm's side of a pay period check-in: who answered and when, what
// they said, and the one step that turns their changes into work (a new
// hire's pay line, a leaver's final pay, absence on someone's line).
import { CheckIcon, ListPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { dayLabel } from "@/lib/accounting/data"
import { peopleOf } from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"
import type { CheckinAnswer, CustomerRequest } from "@/lib/accounting/types"
import { answeredAt } from "./pay-loop"

const QUESTIONS: { key: Exclude<keyof CheckinAnswer, "noChanges">; label: string }[] = [
  { key: "hires", label: "New hires" },
  { key: "leavers", label: "Leaving" },
  { key: "absence", label: "Holidays or sick leave" },
  { key: "overtime", label: "Overtime" },
  { key: "other", label: "Anything else" },
]

/** What they reported, and "Add to the pay run" until it's done. */
export function CheckinAnswers({ request }: { request: CustomerRequest }) {
  const { state, dispatch } = useAccounting()
  const answer = request.checkin
  if (!answer) return null
  const applied = peopleOf(state).applied[request.id]
  const answered = QUESTIONS.filter((q) => answer[q.key]?.trim())

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {answered.map((q) => (
          <div key={q.key} className="contents">
            <dt className="text-muted-foreground">{q.label}</dt>
            <dd className="text-foreground whitespace-pre-line text-pretty">{answer[q.key]}</dd>
          </div>
        ))}
      </dl>
      {applied ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs text-pretty">
          <CheckIcon className="text-success-text mt-px size-3.5 shrink-0" aria-hidden="true" />
          Added to the pay run by {applied.by}, {dayLabel(applied.at)}: {applied.summary}.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              dispatch({ type: "people", action: { type: "apply_checkin", requestId: request.id } })
              toast.success("Added to the pay run", {
                description: "New hires get a pay line, leavers a final-pay flag, absence and overtime a note on their line.",
              })
            }}
          >
            <ListPlusIcon data-icon="inline-start" aria-hidden="true" />
            Add to the pay run
          </Button>
          <span className="text-muted-foreground text-xs text-pretty">
            The run can&apos;t be approved until this is done.
          </span>
        </div>
      )}
    </div>
  )
}

export function CheckinSummary({ request }: { request: CustomerRequest }) {
  const by = request.answeredBy
  if (!request.checkin || !by)
    return (
      <p className="text-muted-foreground text-sm text-pretty">
        No answer yet. Sent {request.sentAt}; reply by {request.due}, or payday moves.
      </p>
    )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground font-medium">{by.name}</span>
        <span className="text-muted-foreground text-xs">{answeredAt(by)}</span>
        {request.checkin.noChanges ? (
          <Badge variant="success-light" size="sm">
            No changes since last month
          </Badge>
        ) : (
          <Badge variant="info-light" size="sm">
            Changes reported
          </Badge>
        )}
      </div>
      {request.checkin.noChanges ? null : <CheckinAnswers request={request} />}
    </div>
  )
}
