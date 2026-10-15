"use client"

// One company on its way in. The phase track on top (@reui/stepper, composed
// like c-stepper-11: a bar, a title and a status line per step) doubles as the
// way to look back at an earlier phase; the decision bar under it says what
// stands between this phase and the next and holds the one button that moves
// it. Under that, the phase's own work and the tasks added by hand. Beside it:
// who they are, what was said in the meeting, and every phase change on
// record. Approving the takeover hands the company to operations; the case
// stays here, read-only, pointing at the client.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper"
import { cn } from "cn"
import {
  ArrowRightIcon,
  BanIcon,
  CheckIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SignatureIcon,
  SparklesIcon,
  UndoIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ACCOUNTANT_BY_ID } from "@/lib/accounting/data"
import {
  blockers,
  carriedOver,
  caseStatus,
  company,
  formatDay,
  formatKr,
  formatMonth,
  isOnboarding,
  PHASE_LABEL,
  PHASES,
  phaseIndex,
  phaseTasks,
  personName,
  type OnboardingCase,
  type Phase,
  type PhaseEvent,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { ClientChip, DotSeparator } from "@/components/accounting/primitives"
import { AddTaskDialog } from "./add-task-dialog"
import { AssessmentPanel, Signoffs } from "./assessment-panel"
import { ChecklistPanel, PhaseTasks } from "./checklist-panel"
import { BallBadge } from "./meta"
import { OfferDialog } from "./offer-dialog"
import { OfferPanel, Thread } from "./offer-panel"
import { offerOutdated, RoutinesCard, WorkingTogether } from "./working-together"

type StepState = "done" | "current" | "retained" | "next" | "later"

/** The bar's colour, for every state the stepper itself might set. */
const BAR: Record<StepState, string> = {
  done: "bg-success data-[state=active]:bg-success data-[state=completed]:bg-success",
  current: "bg-foreground/70 data-[state=active]:bg-foreground/70 data-[state=completed]:bg-foreground/70",
  retained: "bg-success/40 data-[state=active]:bg-success/40 data-[state=completed]:bg-success/40",
  next: "bg-border data-[state=active]:bg-border data-[state=completed]:bg-border",
  later: "bg-border data-[state=active]:bg-border data-[state=completed]:bg-border",
}

function lastEvent(c: OnboardingCase, phase: Phase, actions: PhaseEvent["action"][]) {
  return c.history.findLast((e) => e.phase === phase && actions.includes(e.action))
}

/** Where a case lives once it is handed over. */
function clientHref(c: OnboardingCase) {
  return `/clients/${c.id}`
}

function stepState(c: OnboardingCase, phase: Phase): StepState {
  const at = phaseIndex(c.phase)
  const i = phaseIndex(phase)
  if (i < at || (i === at && c.handedOver)) return "done"
  if (i === at) return "current"
  // A phase visited before a reopen keeps its work, read-only. Tasks added
  // by hand ahead of a phase don't count as a visit.
  if ((phase === "setup" || phase === "takeover") && phaseTasks(c, phase).some((t) => !t.manual)) return "retained"
  return i === at + 1 ? "next" : "later"
}

function stepDetail(c: OnboardingCase, phase: Phase, state: StepState) {
  switch (state) {
    case "current":
      return c.declined ? "Declined" : caseStatus(c).label
    case "retained":
      return "Visited before the reopen · read-only"
    case "next":
      return "Next"
    case "later":
      return "Later"
    case "done": {
      if (phase === "takeover" && c.handedOver) return `Handed over ${formatDay(c.handedOver.at)}`
      if (phase === "offer") {
        return c.offer?.acceptedAt ? `Signed ${formatDay(c.offer.acceptedAt)}` : "Signed"
      }
      const e = lastEvent(c, phase, ["approved"])
      return e ? `Approved ${formatDay(e.at)}` : "Done"
    }
  }
}

function PhaseTrack({
  c,
  viewing,
  onView,
}: {
  c: OnboardingCase
  viewing: Phase
  onView: (phase: Phase) => void
}) {
  return (
    <Stepper
      value={phaseIndex(viewing) + 1}
      onValueChange={(step) => onView(PHASES[step - 1].id)}
      className="w-full"
    >
      <StepperNav className="grid grid-cols-2 gap-x-3 gap-y-4 @lg/main:grid-cols-4">
        {PHASES.map((phase, index) => {
          const state = stepState(c, phase.id)
          return (
            <StepperItem key={phase.id} step={index + 1} className="relative min-w-0 items-start">
              <StepperTrigger className="hover:bg-muted/40 aria-selected:bg-muted/60 -m-1.5 flex min-w-0 grow flex-col items-stretch justify-start gap-2 rounded-md p-1.5 text-left transition-colors duration-150">
                <StepperIndicator className={cn("h-1.5 w-full rounded-full", BAR[state])}>
                  <span className="sr-only">{index + 1}</span>
                </StepperIndicator>
                <StepperTitle
                  className={cn(
                    "flex items-center gap-1.5 text-start text-sm",
                    state === "next" || state === "later" ? "text-muted-foreground font-normal" : "text-foreground"
                  )}
                >
                  {state === "done" ? (
                    <CheckIcon className="text-success-text size-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                  ) : null}
                  {phase.label}
                </StepperTitle>
                <StepperDescription className="line-clamp-2 text-start text-xs text-pretty">
                  {stepDetail(c, phase.id, state)}
                </StepperDescription>
              </StepperTrigger>
            </StepperItem>
          )
        })}
      </StepperNav>
    </Stepper>
  )
}

// ── The decision bar ──

function Bar({
  tone = "default",
  children,
  actions,
  footer,
}: {
  tone?: "default" | "ready" | "muted"
  children: React.ReactNode
  actions?: React.ReactNode
  /** Under the line, e.g. the sign-offs the decision waits on. */
  footer?: React.ReactNode
}) {
  return (
    <Frame spacing="sm" className="w-full">
      <FramePanel className={cn("flex flex-col gap-3", tone === "ready" && "bg-success/5")}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-foreground min-w-0 flex-[1_1_18rem] text-sm text-pretty">{children}</div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {footer}
      </FramePanel>
    </Frame>
  )
}

function DecisionBar({
  c,
  viewing,
  onSendOffer,
  onDecline,
  onReopen,
}: {
  c: OnboardingCase
  viewing: Phase
  onSendOffer: () => void
  onDecline: () => void
  onReopen: (phase: "setup" | "takeover") => void
}) {
  const { dispatch } = useAccounting()
  const router = useRouter()
  const first = company(c).contact.name.split(" ")[0]
  const state = stepState(c, viewing)

  // The notice on top of the page says it all.
  if (c.handedOver && viewing === c.phase) return null

  if (c.declined) {
    return (
      <Bar
        actions={
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "onboarding", action: { type: "restore", caseId: c.id } })}>
            <UndoIcon data-icon="inline-start" aria-hidden="true" />
            Put back on the list
          </Button>
        }
      >
        <span className="font-medium">Declined {formatDay(c.declined.at)}</span>
        <span className="text-muted-foreground"> by {c.declined.by}: {c.declined.reason}</span>
      </Bar>
    )
  }

  if (state === "done" || state === "retained") {
    const reopenable = (viewing === "setup" || viewing === "takeover") && state === "done" && !c.handedOver
    return (
      <Bar
        tone="muted"
        actions={
          reopenable ? (
            <Button size="sm" variant="outline" onClick={() => onReopen(viewing)}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reopen {PHASE_LABEL[viewing].toLowerCase()}
            </Button>
          ) : null
        }
      >
        <span className="text-muted-foreground">
          {state === "retained"
            ? `${PHASE_LABEL[viewing]} was visited before a reopen. Its work is kept read-only and counts again once ${PHASE_LABEL[c.phase].toLowerCase()} is approved.`
            : `${stepDetail(c, viewing, state)}. Read-only.`}
        </span>
      </Bar>
    )
  }

  if (state === "next" || state === "later") {
    return (
      <Bar tone="muted">
        <span className="text-muted-foreground">
          {PHASE_LABEL[viewing]} starts once {PHASE_LABEL[c.phase].toLowerCase()} is done.
        </span>
      </Bar>
    )
  }

  const blocked = blockers(c)
  switch (c.phase) {
    case "assessment":
      return (
        <Bar
          tone={blocked.length ? "default" : "ready"}
          footer={<Signoffs c={c} readOnly={false} />}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={onDecline}>
                <BanIcon data-icon="inline-start" aria-hidden="true" />
                Decline
              </Button>
              <Button size="sm" onClick={onSendOffer} disabled={blocked.length > 0}>
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Send offer
              </Button>
            </>
          }
        >
          {blocked.length && c.signoffs.accountant && c.signoffs.sales ? (
            <>
              <span className="font-medium">Both confirmed.</span>{" "}
              <span className="text-muted-foreground">{blocked.join(" · ")} before the offer goes out.</span>
            </>
          ) : blocked.length ? (
            <>
              <span className="font-medium">Take them on?</span>{" "}
              <span className="text-muted-foreground">
                The accountant and sales both confirm, then the offer goes out.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">Both confirmed.</span>{" "}
              <span className="text-muted-foreground">
                Sending the offer gives {first} a link to sign, then follow their onboarding.
              </span>
            </>
          )}
        </Bar>
      )
    case "offer":
      return (
        <Bar
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={onDecline}>
                <BanIcon data-icon="inline-start" aria-hidden="true" />
                Withdraw
              </Button>
              <Button size="sm" variant="outline" onClick={onSendOffer}>
                Change the offer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dispatch({ type: "onboarding", action: { type: "sign", caseId: c.id } })
                  toast.success(`Simulated: ${first} signed`, {
                    description:
                      "With the KYC answers, now in for review. Setup started; Tripletex and the Altinn signature went out on their link.",
                  })
                }}
              >
                <SparklesIcon data-icon="inline-start" aria-hidden="true" />
                Simulate {first} signs
              </Button>
            </>
          }
        >
          {c.offer?.status === "questioned" ? (
            <>
              <span className="font-medium">{first} asked about the offer.</span>{" "}
              <span className="text-muted-foreground">Answer in the dialogue, or change the offer.</span>
            </>
          ) : (
            <>
              <span className="font-medium">Waiting for {first} to sign.</span>{" "}
              <span className="text-muted-foreground">
                They answer the KYC questions and sign on their link, agreeing to who does what. That starts Setup.
              </span>
            </>
          )}
        </Bar>
      )
    case "setup":
    case "takeover": {
      const setup = c.phase === "setup"
      const next = setup ? "starts the takeover checks" : "hands them over to operations"
      // Questions still with them become tasks in their app; checks we run
      // ourselves and our own tasks go to the client page.
      const carried = carriedOver(c)
      const toApp = carried.filter((t) => t.status === "with_customer" && !t.verify && t.ask).length
      const left = carried.length - toApp
      const parts = [
        left ? `${left} open ${left === 1 ? "task goes" : "tasks go"} to the client page` : "",
        toApp ? `${toApp} ${toApp === 1 ? "question goes" : "questions go"} to their app` : "",
      ].filter(Boolean)
      const leftNote = parts.length ? ` ${parts.join(" and ")}.` : ""
      return (
        <Bar
          tone={blocked.length ? "default" : "ready"}
          actions={
            <Button
              size="sm"
              disabled={blocked.length > 0}
              onClick={() => {
                dispatch({ type: "onboarding", action: { type: "approve", caseId: c.id } })
                if (setup) toast.success("Setup approved", { description: "The takeover checks are on." })
                else
                  toast.success(`${company(c).name} is in operation`, {
                    description: leftNote
                      ? `Handed over to operations.${leftNote}`
                      : "Handed over to operations. They're a client like any other now.",
                    action: { label: "Open client", onClick: () => router.push(clientHref(c)) },
                  })
              }}
            >
              {setup ? (
                <CheckIcon data-icon="inline-start" aria-hidden="true" />
              ) : (
                <ArrowRightIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {setup ? "Approve setup" : "Hand over to operations"}
            </Button>
          }
        >
          {blocked.length ? (
            <span className="text-muted-foreground">{blocked.join(" · ")}.</span>
          ) : (
            <>
              <span className="font-medium">Everything required is settled.</span>{" "}
              <span className="text-muted-foreground">
                Approving {next}.{setup ? "" : leftNote}
              </span>
            </>
          )}
        </Bar>
      )
    }
    default:
      return null
  }
}

// ── Side column ──

function CompanyCard({ c }: { c: OnboardingCase }) {
  const co = company(c)
  const accountant = ACCOUNTANT_BY_ID.get(c.accountantId)
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Company</FrameTitle>
        <FrameDescription className="text-xs">{co.city} · {co.employees} employees</FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-[11px]">{co.contact.initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-foreground truncate text-sm font-medium">{co.contact.name}</span>
            <span className="text-muted-foreground truncate text-xs">{co.contact.role}</span>
          </div>
        </div>
        <div className="text-muted-foreground flex flex-col gap-1.5 text-xs">
          <span className="inline-flex min-w-0 items-center gap-2">
            <MailIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{co.contact.email}</span>
          </span>
          <span className="inline-flex items-center gap-2 tabular-nums">
            <PhoneIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {co.contact.phone}
          </span>
        </div>
        <Separator />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Accountant</dt>
          <dd className="text-foreground truncate">{accountant?.name}</dd>
          <dt className="text-muted-foreground">Sales</dt>
          <dd className="text-foreground truncate">{personName("emma")}</dd>
          <dt className="text-muted-foreground">Today</dt>
          <dd className="text-foreground truncate">{co.currentAccountant ?? "No accountant"}</dd>
          <dt className="text-muted-foreground">Estimate</dt>
          <dd className="text-foreground tabular-nums">{formatKr(co.saft.monthlyPrice)}/mo</dd>
        </dl>
      </FramePanel>
    </Frame>
  )
}

const EVENT_LABEL: Record<PhaseEvent["action"], (phase: string) => string> = {
  created: () => "Added as a new customer",
  approved: (phase) => `${phase} approved`,
  signed: () => "Offer signed",
  sent: () => "Offer sent",
  reopened: (phase) => `${phase} reopened`,
  declined: () => "Declined",
  restored: () => "Back on the list",
  amended: () => "Agreement amended",
}

const EVENT_ICON: Record<PhaseEvent["action"], React.ReactNode> = {
  created: <PlusIcon aria-hidden="true" />,
  approved: <CheckIcon aria-hidden="true" />,
  signed: <SignatureIcon aria-hidden="true" />,
  sent: <SendIcon aria-hidden="true" />,
  reopened: <RotateCcwIcon aria-hidden="true" />,
  declined: <BanIcon aria-hidden="true" />,
  restored: <UndoIcon aria-hidden="true" />,
  amended: <PencilIcon aria-hidden="true" />,
}

function History({ c }: { c: OnboardingCase }) {
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>Phase log</FrameTitle>
        <FrameDescription className="text-xs">Every phase change, kept for good</FrameDescription>
      </FrameHeader>
      <FramePanel className="p-0">
        <ol className="flex flex-col">
          {[...c.history].reverse().map((e) => (
            <li key={e.id} className="flex gap-3 border-b px-3 py-2.5 last:border-b-0">
              <span className="bg-muted text-muted-foreground mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:size-3">
                {EVENT_ICON[e.action]}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground text-sm">{EVENT_LABEL[e.action](PHASE_LABEL[e.phase])}</span>
                <span className="text-muted-foreground text-xs">
                  {personName(e.by)} · {formatDay(e.at)}
                </span>
                {e.note ? <span className="text-muted-foreground text-xs text-pretty">{e.note}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </FramePanel>
    </Frame>
  )
}

// ── Dialogs ──

function ReasonDialog({
  open,
  title,
  description,
  label,
  confirm,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: string
  description: string
  label: string
  confirm: string
  onConfirm: (reason: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reason.trim()) return
            onConfirm(reason.trim())
            setReason("")
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-pretty">{description}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="reason">{label}</FieldLabel>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-20 resize-none"
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!reason.trim()}>
              {confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──

export function OnboardingCasePage({ caseId }: { caseId: string }) {
  const { state, dispatch } = useAccounting()
  const c = state.onboarding.find((x) => x.id === caseId)
  const [picked, setPicked] = useState<{ phase: Phase; from: Phase } | null>(null)
  const [offering, setOffering] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reopening, setReopening] = useState<"setup" | "takeover" | null>(null)
  const [adding, setAdding] = useState<{ phase: Phase; group?: string } | null>(null)

  if (!c) {
    return (
      <Frame spacing="sm" className="w-full">
        <FramePanel className="text-muted-foreground py-12 text-center text-sm">
          This company isn&apos;t onboarding. Add it from Clients → Onboarding → New customer.
        </FramePanel>
      </Frame>
    )
  }

  const co = company(c)
  // A pick holds until the phase moves; then the view follows the case.
  const viewing = picked && picked.from === c.phase ? picked.phase : c.phase
  const readOnly = viewing !== c.phase || !isOnboarding(c)
  // Tasks can be added to the running phase and ahead of it, never behind.
  const onAdd =
    isOnboarding(c) && phaseIndex(viewing) >= phaseIndex(c.phase)
      ? (group?: string) => setAdding({ phase: viewing, group })
      : undefined
  const status = caseStatus(c)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <ClientChip />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-foreground flex items-center gap-2 truncate text-lg leading-6 font-semibold tracking-tight">
              <span className="truncate">{co.name}</span>
              <Badge variant="outline" size="sm" className="shrink-0">
                {c.handedOver ? "Onboarding done" : `Onboarding · ${PHASE_LABEL[c.phase]}`}
              </Badge>
            </h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
              <span className="tabular-nums">Org. {co.orgNo}</span>
              <DotSeparator />
              <span>{co.industry}</span>
              <DotSeparator />
              <span>Started {formatDay(c.createdAt)}</span>
              {c.offer ? (
                <>
                  <DotSeparator />
                  <span>Takeover {formatDay(c.offer.takeoverDate)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <BallBadge ball={status.ball} />
      </div>

      {c.handedOver ? (
        <Bar
          tone="ready"
          actions={
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={clientHref(c)} />}>
              Open client
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
          }
        >
          <span className="font-medium">
            Handed over to operations {formatDay(c.handedOver.at)}.
          </span>{" "}
          <span className="text-muted-foreground">
            {co.name} is a client from {formatMonth(c.offer?.takeoverDate ?? c.handedOver.at)}. This onboarding is kept
            read-only.
          </span>
        </Bar>
      ) : null}

      <PhaseTrack c={c} viewing={viewing} onView={(phase) => setPicked({ phase, from: c.phase })} />

      <div className="grid items-start gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <DecisionBar
            c={c}
            viewing={viewing}
            onSendOffer={() => setOffering(true)}
            onDecline={() => setDeclining(true)}
            onReopen={setReopening}
          />
          {viewing === "assessment" ? (
            <>
              <AssessmentPanel c={c} readOnly={readOnly} />
              {/* Drafted by sales or the accountant; it goes out with the offer. */}
              <RoutinesCard c={c} readOnly={readOnly} />
            </>
          ) : null}
          {viewing === "offer" ? (
            c.offer ? (
              <>
                <OfferPanel c={c} readOnly={readOnly} />
                <RoutinesCard
                  c={c}
                  readOnly={readOnly}
                  action={
                    !readOnly && offerOutdated(c) ? (
                      <Button size="sm" onClick={() => setOffering(true)}>
                        <SendIcon data-icon="inline-start" aria-hidden="true" />
                        Send new version
                      </Button>
                    ) : null
                  }
                />
              </>
            ) : (
              <Placeholder text="No offer yet. It is sent from the assessment once both have confirmed." />
            )
          ) : null}
          {viewing === "setup" || viewing === "takeover" ? (
            phaseTasks(c, viewing).some((t) => !t.manual) ? (
              <>
                <ChecklistPanel key={viewing} c={c} phase={viewing} readOnly={readOnly} onAdd={onAdd} />
                {viewing === "setup" ? <WorkingTogether c={c} readOnly={readOnly} /> : null}
              </>
            ) : (
              <>
                <Placeholder
                  text={
                    viewing === "setup"
                      ? "Setup starts when the offer is signed: access, agreements, systems and routines."
                      : "The takeover checks start when setup is approved: bank, ledger, VAT and payroll history up to the takeover date."
                  }
                />
                <PhaseTasks key={viewing} c={c} phase={viewing} readOnly={readOnly} onAdd={onAdd} />
              </>
            )
          ) : (
            <PhaseTasks key={viewing} c={c} phase={viewing} readOnly={readOnly} onAdd={onAdd} />
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <CompanyCard c={c} />
          {c.meetingNote ? (
            <Frame dense spacing="sm" className="w-full">
              <FrameHeader>
                <FrameTitle>From the meeting</FrameTitle>
              </FrameHeader>
              <FramePanel>
                <p className="text-foreground text-sm text-pretty">{c.meetingNote}</p>
              </FramePanel>
            </Frame>
          ) : null}
          {/* After signing, questions go to the accountant; the thread
              before that is the offer's, kept so nothing gets lost. */}
          {c.offer?.status === "accepted" ? (
            <Thread c={c} readOnly={!isOnboarding(c)} title={`Messages with ${co.contact.name.split(" ")[0]}`} />
          ) : null}
          <History c={c} />
        </aside>
      </div>

      <OfferDialog c={c} open={offering} onOpenChange={setOffering} />
      <AddTaskDialog
        c={c}
        phase={adding?.phase ?? viewing}
        group={adding?.group}
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
      />
      <ReasonDialog
        open={declining}
        onOpenChange={setDeclining}
        title={c.phase === "offer" ? "Withdraw the offer" : `Decline ${co.name}`}
        description="The evidence is kept and the case moves to Declined. You can put it back on the list later."
        label="Why"
        confirm="Decline"
        onConfirm={(reason) => {
          dispatch({ type: "onboarding", action: { type: "decline", caseId: c.id, reason } })
          setDeclining(false)
        }}
      />
      <ReasonDialog
        open={reopening !== null}
        onOpenChange={(open) => !open && setReopening(null)}
        title={`Reopen ${reopening ? PHASE_LABEL[reopening].toLowerCase() : ""}`}
        description="Later work stays as read-only history. Every phase has to be approved again on the way forward."
        label="What needs another look"
        confirm="Reopen"
        onConfirm={(reason) => {
          if (!reopening) return
          dispatch({ type: "onboarding", action: { type: "reopen", caseId: c.id, phase: reopening, reason } })
          setReopening(null)
          setPicked(null)
        }}
      />
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <Frame spacing="sm" className="w-full">
      <FramePanel className="text-muted-foreground py-12 text-center text-sm text-pretty">{text}</FramePanel>
    </Frame>
  )
}
