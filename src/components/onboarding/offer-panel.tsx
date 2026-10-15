"use client"

// The offer as sent (frozen), and the one conversation around it across every
// version: shared messages go to the company's link, internal ones stay
// between sales and the accountant. "Customer asked" is the state that needs
// us; signing on the link moves the company into Setup.
import { useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import { EyeOffIcon, SendIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CURRENT_USER, TEAM_BY_ID } from "@/lib/accounting/data"
import {
  company,
  formatDay,
  formatKr,
  type Offer,
  type OnboardingCase,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { SignatureMark } from "./signature-pad"

export const OFFER_STATUS: Record<
  Offer["status"],
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
> = {
  sent: { label: "Waiting to sign", variant: "info-light" },
  questioned: { label: "Customer asked", variant: "warning-light" },
  answered: { label: "Answered", variant: "info-light" },
  accepted: { label: "Signed", variant: "success-light" },
  superseded: { label: "Replaced", variant: "outline" },
}

/** What the company gets: always bookkeeping, VAT and the annual accounts. */
export function scope(offer: Offer) {
  return [
    "Bookkeeping",
    "VAT returns",
    "Annual accounts",
    ...(offer.payroll ? ["Payroll and A-melding"] : []),
    ...(offer.invoicing ? ["Invoicing"] : []),
  ]
}

function Term({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-sm font-medium tabular-nums">{value}</dd>
      {hint ? <dd className="text-muted-foreground text-xs text-pretty">{hint}</dd> : null}
    </div>
  )
}

export function OfferSummary({ c }: { c: OnboardingCase }) {
  const offer = c.offer!
  const status = OFFER_STATUS[offer.status]
  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-px">
          <FrameTitle>Offer v{offer.version}</FrameTitle>
          <FrameDescription className="text-xs">
            {offer.status === "accepted"
              ? `Signed ${formatDay(offer.acceptedAt!)} by ${company(c).contact.name}`
              : `Sent ${formatDay(offer.sentAt)} · valid until ${formatDay(offer.validUntil)}`}
          </FrameDescription>
        </div>
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
      </FrameHeader>
      <FramePanel>
        <dl className="grid grid-cols-2 gap-4 @3xl/main:grid-cols-4">
          <Term label="Per month" value={formatKr(offer.monthly)} hint={`${formatKr(offer.monthly * 12)} a year`} />
          <Term label="Included" value={`${offer.includedEmployees} employees`} hint={`${offer.includedVouchers.toLocaleString("nb-NO")} vouchers a year`} />
          <Term label="We take over from" value={formatDay(offer.takeoverDate)} hint={offer.previousAccountant ? `From ${offer.previousAccountant}` : undefined} />
          <Term label="Scope" value={`${scope(offer).length} services`} hint={scope(offer).join(", ")} />
        </dl>
        {offer.handoverNote ? (
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs text-pretty">
            Until then: {offer.handoverNote}
          </p>
        ) : null}
        {offer.signature ? (
          <figure className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
            <figcaption className="text-muted-foreground text-xs">
              {"typed" in offer.signature ? "Signed with a typed name" : "Signed by hand"} on the link,{" "}
              {formatDay(offer.acceptedAt!)}
            </figcaption>
            <SignatureMark signature={offer.signature} className="h-8 text-xl leading-8" />
          </figure>
        ) : null}
      </FramePanel>
    </Frame>
  )
}

function Message({ c, m }: { c: OnboardingCase; m: OnboardingCase["thread"][number] }) {
  const teammate = TEAM_BY_ID.get(m.author)
  const name = teammate?.name ?? m.author
  const initials = teammate?.initials ?? name.split(" ").map((p) => p[0]).join("")
  return (
    <li className="flex gap-3 px-3 py-3">
      <Avatar className="size-7">
        <AvatarFallback className={cn("text-[10px]", m.from === "customer" && "bg-info/15 text-info-text")}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-foreground font-medium">{name}</span>
          <span className="text-muted-foreground">
            {m.from === "customer" ? company(c).name : teammate?.role ?? "Sanna"} · {formatDay(m.at)}
          </span>
          {m.internal ? (
            <Badge variant="outline" size="sm" className="gap-1">
              <EyeOffIcon aria-hidden="true" />
              Internal
            </Badge>
          ) : null}
        </div>
        <p
          className={cn(
            "text-foreground text-sm text-pretty",
            m.internal && "bg-muted/60 rounded-md px-2.5 py-1.5"
          )}
        >
          {m.text}
        </p>
      </div>
    </li>
  )
}

/** The conversation with the company: about the offer before they sign,
    with their accountant after. One thread either way, so nothing said
    before signing gets lost. */
export function Thread({
  c,
  readOnly,
  title = "Offer dialogue",
}: {
  c: OnboardingCase
  readOnly: boolean
  title?: string
}) {
  const { dispatch } = useAccounting()
  const [text, setText] = useState("")
  const [internal, setInternal] = useState(false)
  const first = company(c).contact.name.split(" ")[0]

  function send() {
    if (!text.trim()) return
    dispatch({
      type: "onboarding",
      action: { type: "offer_message", caseId: c.id, from: "firm", author: CURRENT_USER.id, text: text.trim(), internal },
    })
    setText("")
  }

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader>
        <FrameTitle>{title}</FrameTitle>
        <FrameDescription className="text-xs">
          One thread across every version. Internal notes never reach {first}.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="p-0">
        {c.thread.length ? (
          <ul className="divide-y">
            {c.thread.map((m) => (
              <Message key={m.id} c={c} m={m} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            No questions yet. {first} can ask from their onboarding page.
          </p>
        )}
      </FramePanel>
      {readOnly ? null : (
        <FrameFooter className="flex flex-col gap-2 py-2.5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={internal ? "Note to the team…" : `Reply to ${first}…`}
            className="bg-background min-h-16 resize-none"
            aria-label="Message"
          />
          <div className="flex items-center justify-between gap-2">
            <Tabs value={internal ? "internal" : "shared"} onValueChange={(v) => setInternal(v === "internal")}>
              <TabsList>
                <TabsTrigger value="shared" className="px-2.5 text-xs">
                  To {first}
                </TabsTrigger>
                <TabsTrigger value="internal" className="px-2.5 text-xs">
                  Internal
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={send} disabled={!text.trim()}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              {internal ? "Add note" : "Send"}
            </Button>
          </div>
        </FrameFooter>
      )}
    </Frame>
  )
}

export function OfferPanel({ c, readOnly }: { c: OnboardingCase; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <OfferSummary c={c} />
      <Thread c={c} readOnly={readOnly} />
    </div>
  )
}
