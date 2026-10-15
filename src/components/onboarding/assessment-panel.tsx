"use client"

// Should we take them on? One answer on top (the register decides a red;
// otherwise the books do), the internal price estimate beside it, then the
// evidence: the register check, the SAF-T findings. The decision itself is two
// confirmations, the accountant's and sales', in either order.
import type { ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import { CheckIcon, FileUpIcon, FileTextIcon, SparklesIcon, UndoIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ACCOUNTANT_BY_ID, CURRENT_USER, TEAM_BY_ID } from "@/lib/accounting/data"
import {
  bookFindings,
  company,
  formatDay,
  formatKr,
  OUR_SYSTEM,
  overallLight,
  RECOMMENDATION,
  recommendation,
  registerChecks,
  SALES_ID,
  type OnboardingCase,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { LIGHT_LABEL, LightDot } from "./meta"

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-lg font-medium tracking-tight tabular-nums">{value}</dd>
      {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
    </div>
  )
}

function Verdict({ c }: { c: OnboardingCase }) {
  const co = company(c)
  const rec = RECOMMENDATION[recommendation(c)]
  const preliminary = !c.saftFiles.length
  return (
    <Frame spacing="sm" className="w-full">
      <FramePanel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <SparklesIcon className="size-3" aria-hidden="true" />
              {preliminary ? "Agent's preliminary read · no SAF-T yet" : "Agent's assessment"}
            </span>
            <span className="text-foreground inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
              <LightDot light={rec.light} className="size-2.5" />
              {rec.label}
            </span>
          </div>
          <Badge variant="outline" size="sm">
            Internal · never shown to the company
          </Badge>
        </div>
        <p className="text-foreground max-w-prose text-sm text-pretty">
          {/* Not in Tripletex decides it on its own: say so first. */}
          {!preliminary && co.saft.sourceSystem !== OUR_SYSTEM
            ? `Keeps the books in ${co.saft.sourceSystem}, and we only take on ${OUR_SYSTEM} companies for now. ${co.saft.summary}`
            : preliminary
              ? co.preliminary
              : co.saft.summary}
        </p>
        <Separator />
        <dl className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-4">
          <Fact
            label="Price estimate"
            value={`${formatKr(co.saft.monthlyPrice)}/mo`}
            hint={preliminary ? "Rough until SAF-T" : "From volumes in SAF-T"}
          />
          <Fact
            label="They pay today"
            value={co.saft.currentFee ? `${formatKr(co.saft.currentFee)}/mo` : "Nothing"}
            hint={co.currentAccountant}
          />
          <Fact label="Workload" value={`${co.saft.workload} h/mo`} hint="Recurring, after takeover" />
          <Fact
            label="Vouchers"
            value={preliminary ? "—" : `${co.saft.vouchersPerYear.toLocaleString("nb-NO")}/yr`}
            hint={preliminary ? "Needs SAF-T" : `From ${co.saft.sourceSystem}`}
          />
        </dl>
      </FramePanel>
    </Frame>
  )
}

function RegisterCard({ c }: { c: OnboardingCase }) {
  const checks = registerChecks(company(c))
  const light = overallLight(checks.map((r) => r.light))
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-px">
          <FrameTitle>Register check</FrameTitle>
          <FrameDescription className="text-xs">Brønnøysund, fetched when the case was created</FrameDescription>
        </div>
        <Badge variant="outline" size="sm" className="gap-1.5">
          <LightDot light={light} className="size-1.5" />
          {LIGHT_LABEL[light]}
        </Badge>
      </FrameHeader>
      <FramePanel className="p-0">
        <dl className="divide-y">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-3 px-3 py-2">
              <LightDot light={check.light} className="mt-1.5" />
              <dt className="text-muted-foreground w-32 shrink-0 text-sm">{check.label}</dt>
              <dd className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground text-sm">{check.value}</span>
                {check.note ? <span className="text-muted-foreground text-xs text-pretty">{check.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </FramePanel>
    </Frame>
  )
}

function SaftCard({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  const { dispatch } = useAccounting()
  const co = company(c)
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-px">
          <FrameTitle>Books (SAF-T)</FrameTitle>
          <FrameDescription className="text-xs">
            {c.saftFiles.length ? `${c.saftFiles.length} files from ${co.saft.sourceSystem}` : "Not received yet"}
          </FrameDescription>
        </div>
        {c.saftFiles.length ? (
          <Badge variant="outline" size="sm" className="gap-1.5">
            <LightDot light={overallLight(bookFindings(co).map((f) => f.light))} className="size-1.5" />
            {LIGHT_LABEL[overallLight(bookFindings(co).map((f) => f.light))]}
          </Badge>
        ) : null}
      </FrameHeader>
      <FramePanel className="p-0">
        {c.saftFiles.length ? (
          <>
            <ul className="flex flex-wrap gap-1.5 px-3 py-2.5">
              {c.saftFiles.map((file) => (
                <li key={file}>
                  <Badge variant="secondary" size="sm" className="font-normal">
                    <FileTextIcon aria-hidden="true" />
                    {file}
                  </Badge>
                </li>
              ))}
            </ul>
            <Separator />
            <ul className="divide-y">
              {bookFindings(co).map((finding) => (
                <li key={finding.area} className="flex items-start gap-3 px-3 py-2">
                  <LightDot light={finding.light} className="mt-1.5" />
                  <span className="text-muted-foreground w-32 shrink-0 text-sm">{finding.area}</span>
                  <span className="text-foreground min-w-0 text-sm text-pretty">{finding.text}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <FileUpIcon className="text-muted-foreground size-5" aria-hidden="true" />
            <p className="text-muted-foreground max-w-sm text-sm text-pretty">
              The verdict waits for the books. Ask{" "}
              {co.currentAccountant && !co.currentAccountant.startsWith("Self")
                ? `${co.contact.name.split(" ")[0]} or ${co.currentAccountant}`
                : co.contact.name.split(" ")[0]}{" "}
              for SAF-T for last year and this year so far.
            </p>
            {readOnly ? null : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dispatch({ type: "onboarding", action: { type: "upload_saft", caseId: c.id } })
                  toast.success("SAF-T added", { description: "The agent re-ran the assessment on the books." })
                }}
              >
                <FileUpIcon data-icon="inline-start" aria-hidden="true" />
                Add SAF-T files
              </Button>
            )}
          </div>
        )}
      </FramePanel>
    </Frame>
  )
}

function Signoff({
  c,
  role,
  readOnly,
}: {
  c: OnboardingCase
  role: "accountant" | "sales"
  readOnly: boolean
}) {
  const { dispatch } = useAccounting()
  const personId = role === "accountant" ? c.accountantId : SALES_ID
  const person = ACCOUNTANT_BY_ID.get(personId) ?? TEAM_BY_ID.get(personId)!
  const signed = c.signoffs[role]
  const me = personId === CURRENT_USER.id
  const first = person.name.split(" ")[0]

  function set(on: boolean) {
    dispatch({ type: "onboarding", action: { type: "signoff", caseId: c.id, role, on, by: personId } })
  }

  return (
    <div className="bg-background flex min-w-0 items-center gap-2.5 rounded-lg border py-1.5 ps-1.5 pe-1.5">
      <span className="relative shrink-0">
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">{person.initials}</AvatarFallback>
        </Avatar>
        {signed ? (
          <span className="bg-success ring-background absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full text-white ring-2">
            <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {first} <span className="text-muted-foreground font-normal">· {role === "accountant" ? "Accountant" : "Sales"}</span>
        </span>
        <span className={cn("truncate text-xs", signed ? "text-success-text" : "text-muted-foreground")}>
          {signed ? `Confirmed ${formatDay(signed.at)}` : "Not confirmed"}
        </span>
      </span>
      {readOnly ? null : signed ? (
        <Button size="sm" variant="ghost" onClick={() => set(false)} aria-label={`Undo ${first}'s confirmation`}>
          <UndoIcon aria-hidden="true" />
        </Button>
      ) : me ? (
        <Button size="sm" onClick={() => set(true)}>
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          Confirm
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => set(true)}>
          <SparklesIcon data-icon="inline-start" aria-hidden="true" />
          Simulate
        </Button>
      )}
    </div>
  )
}

/** The decision: the accountant's yes and sales' yes, in either order.
    Either can undo until the offer goes out. */
export function Signoffs({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Signoff c={c} role="accountant" readOnly={readOnly} />
      <Signoff c={c} role="sales" readOnly={readOnly} />
    </div>
  )
}

export function AssessmentPanel({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Verdict c={c} />
      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <RegisterCard c={c} />
        <SaftCard c={c} readOnly={readOnly} />
      </div>
    </div>
  )
}
