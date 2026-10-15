"use client"

// A hire who starts after this month: on our employee list now, created in
// Tripletex the day they start (Tripletex bills an employee from when the
// record exists), with what payroll still needs asked from the customer
// right away rather than days before the first pay.
import { SendIcon, SparklesIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CLIENT_BY_ID, dayLabel, OPEN_PERIOD } from "@/lib/accounting/data"
import {
  agreementLabel,
  employeesOf,
  hireDetailsRequest,
  hireFromQuestion,
  HIRE_DETAILS,
  type Employee,
} from "@/lib/accounting/people"
import { useAccounting } from "@/lib/accounting/store"
import type { CustomerRequest } from "@/lib/accounting/types"

function list(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? ""
}

/** Sends the customer the task for a hire's missing details, for one who
    was added before the task went out with the hire. */
export function useAskHireDetails() {
  const { dispatch } = useAccounting()
  return (employee: Pick<Employee, "id" | "clientId" | "name" | "start">, missing = HIRE_DETAILS) => {
    const client = CLIENT_BY_ID.get(employee.clientId)
    if (!client?.contacts[0]) return
    const { about, domain, clientId, ...request } = hireDetailsRequest(employee, client, missing)
    dispatch({ type: "add_task", clientId, domain: domain === "general" ? undefined : domain, about, request })
    toast.success(`Asked ${client.contacts[0].name.split(" ")[0]} for ${employee.name.split(" ")[0]}'s details`, {
      description: "A task in their app, well before the first pay.",
    })
  }
}

/** Under a hire who starts later: when they reach Tripletex, and where
    their details are. */
export function HireDetailsStatus({ employee }: { employee: Employee }) {
  const { state, dispatch } = useAccounting()
  const ask = useAskHireDetails()
  if (!employee.tripletexFrom) return null
  const asked = state.requests.findLast((r) => r.about === employee.id && r.resolution !== "cancelled")
  const missing = employee.details?.missing ?? []
  const answered = asked && (asked.status === "replied" || asked.status === "resolved")
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <span>In Tripletex from {dayLabel(employee.tripletexFrom)}</span>
      <span aria-hidden="true">·</span>
      {answered ? (
        <span className="text-success-text">Details in</span>
      ) : asked ? (
        <button
          type="button"
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: "open_request", id: asked.id })
          }}
        >
          Details asked {asked.sentAt.toLowerCase()}
        </button>
      ) : missing.length ? (
        <>
          <span className="text-warning-text">Missing {missing.length} details</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              ask(employee, missing)
            }}
          >
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Ask for them
          </Button>
        </>
      ) : null}
    </span>
  )
}

/** On a customer's question that announces a hire: what the agent read
    from it, and the one step that sets it all up. */
export function HireSuggestion({ request }: { request: CustomerRequest }) {
  const { state, dispatch } = useAccounting()
  if (request.origin !== "customer" || request.domain !== "payroll") return null
  const month = OPEN_PERIOD.payroll
  const hire = hireFromQuestion(request.message, month)
  if (!hire) return null
  const employees = employeesOf(state, request.clientId)
  const existing = employees.find((e) => e.name === hire.name)
  const first = hire.name.split(" ")[0]
  const later = hire.start > `${month}-31`

  if (existing)
    return (
      <p className="text-muted-foreground text-xs text-pretty">
        {hire.name} is on the employee list, starting {dayLabel(existing.start)}
        {existing.tripletexFrom ? `, and goes into Tripletex on ${dayLabel(existing.tripletexFrom)}` : ""}.
      </p>
    )

  function setUp() {
    dispatch({
      type: "people",
      action: {
        type: "add_hire",
        clientId: request.clientId,
        month,
        from: `From ${request.id}, ${request.title}`,
        ...hire!,
      },
    })
    dispatch({
      type: "accountant_message",
      requestId: request.id,
      text: later
        ? `Thanks! ${first} is on the employee list from ${dayLabel(hire!.start)}, and we create ${first} in Tripletex on that day, so there's no fee before. The contract has most of what we need: I've sent you a short task for ${list(HIRE_DETAILS)}.`
        : `Thanks! ${first} is added to this month's pay run.`,
      close: true,
    })
    toast.success(`${hire!.name} added to the employees`, {
      description: later ? `Starts ${dayLabel(hire!.start)}. Details asked from the customer.` : "On this month's run.",
    })
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2.5">
      <span className="text-foreground inline-flex items-center gap-1.5 text-xs font-medium">
        <SparklesIcon className="size-3.5" aria-hidden="true" />
        The agent read a new hire
      </span>
      <dl className="text-muted-foreground grid grid-cols-[6rem_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt>Who</dt>
        <dd className="text-foreground">{hire.name}, {hire.role.toLowerCase()}</dd>
        <dt>Pay</dt>
        <dd className="text-foreground">{agreementLabel(hire)}</dd>
        <dt>Starts</dt>
        <dd className="text-foreground">{dayLabel(hire.start)}</dd>
      </dl>
      <p className="text-muted-foreground text-xs text-pretty">
        {later
          ? `Not in this month's run. Added to our employee list now and created in Tripletex on ${dayLabel(hire.start)}, so no licence fee before. ${request.attachment ? "The contract is attached; " : ""}we still need ${list(HIRE_DETAILS)}: ask now, not the week of payday.`
          : "Starts this month: added to this month's run as a new line."}
      </p>
      <div>
        <Button type="button" size="sm" onClick={setUp}>
          <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
          {later ? `Add ${first} & ask for the details` : `Add ${first} to the run`}
        </Button>
      </div>
    </div>
  )
}
