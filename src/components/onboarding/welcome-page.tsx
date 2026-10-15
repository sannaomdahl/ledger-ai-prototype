"use client"

// The company's side of onboarding: the link they get with the offer. No
// login; the link is the access. It reads like the customer app (same warm
// paper, same timeline) but says plainly that they are not a customer yet:
// first the agreement to read and sign (with who does what in it, and the
// know-your-customer questions the law asks before we take anyone on), then
// the few things only they can do (Tripletex, bank, Altinn), then our dates
// up to the first month.
// Tasks sent in any phase show here. Once the takeover is approved it points
// to their customer app. Answers land on the
// accountant's checklist at once (both tabs share the demo data). Never shown: the agent's findings, the price estimate, internal
// notes, or anything not sent.
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameHeader, FramePanel } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { cn } from "cn"
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  LandmarkIcon,
  LockIcon,
  MessageCirclePlusIcon,
  PlugIcon,
  SendIcon,
  SignatureIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  DATE,
  ENTER,
  FileAnswer,
  ITEM,
  NODE,
  PANEL_MOTION,
  PortalShell,
  RAIL,
  TextAnswer,
} from "@/components/portal/customer-portal"
import { ACCOUNTANT_BY_ID, TEAM_BY_ID } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import {
  company,
  customerTasks,
  EXTRA_EMPLOYEE,
  EXTRA_VOUCHERS,
  formatDay,
  formatKr,
  formatMonth,
  caseRoutines,
  isSettled,
  KYC_FOLLOW_UP,
  KYC_QUESTIONS,
  kycComplete,
  neededByDate,
  registeredOwners,
  SALES_ID,
  selfManaged,
  type Kyc,
  type OnboardingCase,
  type OnboardingTask,
  type Signature,
} from "@/lib/accounting/onboarding"
import { useSettings } from "@/lib/accounting/settings"
import { useAccounting } from "@/lib/accounting/store"
import { scope } from "./offer-panel"
import { OfferSignature, SignatureMark } from "./signature-pad"
import { RoutinesList, RoutinesReview } from "./working-together"

const ASK_HINT: Record<NonNullable<OnboardingTask["ask"]>["kind"], string> = {
  kyc: "Four yes-or-no questions",
  token: "Log in to Tripletex and approve",
  confirm: "Tell us when it's done",
  text: "Write a short answer",
  file: "Upload a file",
  choice: "Pick one",
  routines: "Check and confirm",
}

/** Their words for our task names. */
function taskTitle(c: OnboardingCase, task: OnboardingTask) {
  const key = task.id.split(":")[1]
  if (key.startsWith("bank-")) return `Connect ${task.title.split(" · ")[0].replace(/^\d+ /, "your ").toLowerCase()} to Tripletex`
  const titles: Record<string, string> = {
    kyc: "Answer the know-your-customer questions",
    tripletex: "Connect your Tripletex",
    routines: "Check who does what",
    payroll: "Tell us who sends hours and absence",
    bank: "Connect your bank accounts to Tripletex",
    altinn: "Sign our registration in Altinn",
    statement: "Send the last bank statement",
    handover: selfManaged(c) ? "Tell us what's open at the takeover" : "Send the handover from your accountant",
  }
  return titles[key] ?? task.title
}

// ── Answers ──

type KycDraft = { answers: (boolean | null)[]; comments: string[]; note: string }

/** The owners question starts from the register of beneficial owners: they
    confirm or correct it rather than type it out. */
function kycDraft(c: OnboardingCase): KycDraft {
  const owners = registeredOwners(company(c))
  return {
    answers: KYC_QUESTIONS.map(() => null),
    comments: [owners.map((o) => `${o.name} ${o.share} %`).join(", "), "", "", ""],
    note: "",
  }
}

/** What still stands between the questions and the signature. */
function kycHint(draft: KycDraft) {
  const open = draft.answers.filter((a) => a === null).length
  if (open) return `Answer the ${open === 4 ? "four" : open === 1 ? "last" : open} ${open === 1 ? "question" : "questions"} above first.`
  const missing = draft.answers.findIndex((a, i) => a && !draft.comments[i]?.trim())
  return missing >= 0 ? `Question ${missing + 1}: a “yes” needs a line on what it means.` : ""
}

function asKyc(draft: KycDraft): Kyc {
  return {
    answers: draft.answers.map(Boolean),
    comments: draft.comments.map((comment, i) => (draft.answers[i] ? comment.trim() : "")),
    note: draft.note.trim(),
  }
}

/** The four questions. A "yes" opens a line under its question asking what
    it means; it has to be filled in. */
function KycForm({ c, draft, onChange }: { c: OnboardingCase; draft: KycDraft; onChange: (draft: KycDraft) => void }) {
  const owners = registeredOwners(company(c))
  const listsOwners = owners.some((o) => o.share > 25)
  const set = (patch: Partial<KycDraft>) => onChange({ ...draft, ...patch })
  const [noting, setNoting] = useState(Boolean(draft.note))
  const disputesRegister = draft.answers[0] === false && listsOwners
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y">
        {KYC_QUESTIONS.map((question, index) => (
          <li key={question} className="flex flex-col gap-2 py-3 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground min-w-0 flex-1 text-sm text-pretty">{question}</span>
              <span className="flex gap-1" role="group" aria-label={question}>
                {[true, false].map((value) => (
                  <Button
                    key={String(value)}
                    type="button"
                    size="sm"
                    variant={draft.answers[index] === value ? "default" : "outline"}
                    aria-pressed={draft.answers[index] === value}
                    onClick={() => set({ answers: draft.answers.map((v, i) => (i === index ? value : v)) })}
                  >
                    {value ? "Yes" : "No"}
                  </Button>
                ))}
              </span>
            </div>
            {index === 0 ? (
              <span
                className={cn(
                  "text-xs text-pretty",
                  disputesRegister ? "text-warning-text" : "text-muted-foreground"
                )}
              >
                The register of beneficial owners lists {owners.map((o) => `${o.name} (${o.share} %)`).join(" and ")}.
                {disputesRegister
                  ? " That's more than 25 %: if the register is wrong, tell us in the note below."
                  : ""}
              </span>
            ) : null}
            {index === 3 ? (
              <span className="text-muted-foreground text-xs text-pretty">
                Like a minister, member of parliament, judge or top civil servant, or their close family.
              </span>
            ) : null}
            {draft.answers[index] ? (
              <Textarea
                value={draft.comments[index]}
                onChange={(e) => set({ comments: draft.comments.map((v, i) => (i === index ? e.target.value : v)) })}
                placeholder={KYC_FOLLOW_UP[index]}
                aria-label={KYC_FOLLOW_UP[index]}
                className="min-h-12 resize-none"
              />
            ) : null}
          </li>
        ))}
      </ul>
      {noting || disputesRegister ? (
        <Textarea
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Anything else we should know"
          aria-label="Anything else"
          className="min-h-12 resize-none"
          autoFocus={noting}
        />
      ) : (
        <Button type="button" variant="ghost" size="sm" className="-ms-2 w-fit" onClick={() => setNoting(true)}>
          Add a note
        </Button>
      )}
    </div>
  )
}

/** The questions on their own, for a case that asked them after signing. */
function KycAnswer({ c, onSend }: { c: OnboardingCase; onSend: (kyc: Kyc) => void }) {
  const [draft, setDraft] = useState(() => kycDraft(c))
  return (
    <div className="flex flex-col gap-3">
      <KycForm c={c} draft={draft} onChange={setDraft} />
      <div className="flex justify-end">
        <Button type="button" disabled={!kycComplete(draft)} onClick={() => onSend(asKyc(draft))}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send answers
        </Button>
      </div>
    </div>
  )
}

/** One click: in the real thing, Tripletex's own login and consent screen. */
function ConnectAnswer({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button type="button" onClick={() => onSend("Connected · checked against the org. no.")}>
          <PlugIcon data-icon="inline-start" aria-hidden="true" />
          Connect Tripletex
        </Button>
      </div>
      <p className="text-muted-foreground text-right text-xs text-pretty">
        You log in to Tripletex and approve read access for Sanna. Nothing changes in your books.
      </p>
    </div>
  )
}

function ChoiceAnswer({ options, onSend }: { options: string[]; onSend: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {options.map((option) => (
        <Button key={option} type="button" variant="outline" onClick={() => onSend(option)}>
          {option}
        </Button>
      ))}
    </div>
  )
}

function DoneAnswer({ onSend }: { onSend: (text: string) => void }) {
  const [note, setNote] = useState("")
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        aria-label="Note"
        className="min-h-14 resize-none"
      />
      <div className="flex justify-end">
        <Button type="button" onClick={() => onSend(note.trim() ? `Done. ${note.trim()}` : "Done")}>
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          I&apos;ve done it
        </Button>
      </div>
    </div>
  )
}

function TaskCard({
  c,
  task,
  open,
  onOpenChange,
  accountantFirst,
}: {
  c: OnboardingCase
  task: OnboardingTask
  open: boolean
  onOpenChange: (open: boolean) => void
  accountantFirst: string
}) {
  const { dispatch } = useAccounting()
  const kind = task.ask!.kind

  function sent(description = `${accountantFirst} will check it.`) {
    toast.success(`Sent to ${accountantFirst}`, { description })
  }
  function answer(text: string, file?: string) {
    dispatch({ type: "onboarding", action: { type: "answer_task", caseId: c.id, taskId: task.id, text, file } })
    sent(
      kind === "token"
        ? "Connected. That one's done."
        : task.verify
          ? "We check the connection on our side too; you'll see it here when it's confirmed."
          : undefined
    )
  }

  return (
    <Frame dense spacing="sm" className={cn("transition-shadow duration-200", open && "shadow-md")}>
      <Collapsible open={open} onOpenChange={onOpenChange} className="group/task">
        <CollapsibleTrigger type="button" className="flex w-full text-left">
          <FrameHeader className="flex grow flex-row items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <TimelineTitle render={<span />} className="text-foreground text-[15px] leading-5 font-semibold text-pretty">
                {taskTitle(c, task)}
              </TimelineTitle>
              <span className="text-muted-foreground text-xs">
                {task.verify === "bank_feed"
                  ? "A few minutes in your online bank · we see it in Tripletex too"
                  : task.verify === "altinn_role"
                    ? "Sign in Altinn · we see it in the register too"
                    : ASK_HINT[kind]}
              </span>
            </div>
            <ChevronDownIcon
              className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/task:rotate-180"
              aria-hidden="true"
            />
          </FrameHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className={PANEL_MOTION}>
          <FramePanel className="flex flex-col gap-4">
            <figure className="flex flex-col gap-1.5 border-l-2 pl-3">
              <blockquote className="text-foreground text-sm leading-5 text-pretty whitespace-pre-line">{task.ask!.message}</blockquote>
              <figcaption className="text-muted-foreground text-xs">
                {accountantFirst} · {formatDay(task.ask!.sentAt!)}
              </figcaption>
            </figure>
            {task.verify === "altinn_role" ? (
              <a
                href="https://www.altinn.no/"
                target="_blank"
                rel="noreferrer"
                className="text-foreground w-fit text-sm font-medium underline underline-offset-4"
              >
                Open Altinn
              </a>
            ) : null}
            <Separator />
            {kind === "kyc" ? (
              <KycAnswer
                c={c}
                onSend={(kyc) => {
                  dispatch({ type: "onboarding", action: { type: "submit_kyc", caseId: c.id, kyc } })
                  sent()
                }}
              />
            ) : kind === "token" ? (
              <ConnectAnswer onSend={(text) => answer(text)} />
            ) : kind === "choice" ? (
              <ChoiceAnswer options={task.ask!.options ?? ["Yes", "No"]} onSend={(text) => answer(text)} />
            ) : kind === "routines" ? (
              <RoutinesReview c={c} onSend={(text) => answer(text)} />
            ) : kind === "file" ? (
              <FileAnswer onSend={(text, file) => answer(text, file)} />
            ) : kind === "text" ? (
              <TextAnswer onSend={(text) => answer(text)} />
            ) : (
              <DoneAnswer onSend={(text) => answer(text)} />
            )}
          </FramePanel>
        </CollapsibleContent>
      </Collapsible>
    </Frame>
  )
}

// ── The offer ──

/** The open node of a step still to do; a check once it's done. */
function StepEntry({ date, title, done, children }: { date: string; title?: string; done?: boolean; children: ReactNode }) {
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={cn(DATE, "text-foreground")}>{date}</TimelineDate>
        {title ? <TimelineTitle className="text-foreground">{title}</TimelineTitle> : null}
        {done ? (
          <TimelineIndicator className={cn(NODE, "bg-primary text-primary-foreground border-none")}>
            <CheckIcon className="size-3.5" aria-hidden="true" />
          </TimelineIndicator>
        ) : (
          <TimelineIndicator
            className={cn(NODE, "bg-background border-foreground/70 size-2.5 group-data-[orientation=vertical]/timeline:top-[7px]")}
          />
        )}
      </TimelineHeader>
      <TimelineContent>{children}</TimelineContent>
    </>
  )
}

/** The offer as three steps on the timeline, one card each: read the
    agreement, answer the know-your-customer questions, sign. */
function OfferSteps({ c, accountantFirst, steps }: { c: OnboardingCase; accountantFirst: string; steps: number[] }) {
  const [kyc, setKyc] = useState(() => kycDraft(c))
  const ready = kycComplete(kyc)
  return (
    <>
      <TimelineItem step={steps[0]} className={ITEM}>
        <StepEntry date={formatDay(TODAY)} title="Read the agreement">
          <AgreementCard c={c} />
        </StepEntry>
      </TimelineItem>
      <TimelineItem step={steps[1]} className={ITEM}>
        <StepEntry date="Before you sign" title="Four questions the law asks" done={ready}>
          <Frame dense spacing="sm">
            <FramePanel>
              <KycForm c={c} draft={kyc} onChange={setKyc} />
            </FramePanel>
          </Frame>
        </StepEntry>
      </TimelineItem>
      <TimelineItem step={steps[2]} className={ITEM}>
        <StepEntry date={`Sign by ${formatDay(c.offer!.validUntil)}`}>
          <SignCard c={c} kyc={kyc} accountantFirst={accountantFirst} />
        </StepEntry>
      </TimelineItem>
    </>
  )
}

function AgreementCard({ c }: { c: OnboardingCase }) {
  const { dispatch } = useAccounting()
  const offer = c.offer!
  const co = company(c)
  const sales = TEAM_BY_ID.get(SALES_ID)!
  const salesFirst = sales.name.split(" ")[0]
  const shared = c.thread.filter((m) => !m.internal)
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState("")
  const routines = offer.routines ?? caseRoutines(c)

  return (
    <Frame dense spacing="sm">
      <FrameHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-foreground text-[15px] leading-5 font-semibold">Accounting agreement</span>
          <span className="text-muted-foreground text-xs">
            Version {offer.version} · valid until {formatDay(offer.validUntil)}
          </span>
        </div>
        <FileTextIcon className="text-muted-foreground size-4" aria-hidden="true" />
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-3xl font-semibold tracking-tight tabular-nums">{formatKr(offer.monthly)}</span>
          <span className="text-muted-foreground text-sm">a month, excl. VAT</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Included</dt>
            <dd className="text-foreground">
              {offer.includedEmployees} employees, {offer.includedVouchers.toLocaleString("nb-NO")} invoices and receipts a year
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">We start</dt>
            <dd className="text-foreground">{formatDay(offer.takeoverDate)}</dd>
            {offer.previousAccountant ? (
              <dd className="text-muted-foreground text-xs text-pretty">{offer.previousAccountant} until then</dd>
            ) : null}
          </div>
          <div className="col-span-2 flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">What we do</dt>
            <dd className="text-foreground">{scope(offer).join(", ")}</dd>
          </div>
        </dl>

        <Collapsible className="group/details border-t pt-3">
          <CollapsibleTrigger
            type="button"
            className="text-foreground flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
          >
            <span>
              Who does what{" "}
              <span className="text-muted-foreground font-normal">
                · {routines.filter((r) => r.who === "customer" && r.task).length} for you,{" "}
                {routines.filter((r) => r.who === "firm" && r.task).length} for us
              </span>
            </span>
            <ChevronDownIcon
              className="text-muted-foreground ease-snappy size-4 shrink-0 transition-[rotate] duration-200 group-data-open/details:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className={PANEL_MOTION}>
            <div className="flex flex-col gap-3 pt-3">
              <RoutinesList routines={routines} />
              <p className="text-muted-foreground text-xs text-pretty">
                {offer.handoverNote ? `${offer.handoverNote} ` : ""}Beyond what&apos;s included:{" "}
                {formatKr(EXTRA_EMPLOYEE)} a year per extra employee, {formatKr(EXTRA_VOUCHERS)} a year per 100 extra
                invoices and receipts.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {shared.length ? (
          <ul className="flex flex-col gap-3 border-t pt-4">
            {shared.map((m) => {
              const firm = m.from === "firm"
              const who = firm ? TEAM_BY_ID.get(m.author)?.name ?? "Sanna" : "You"
              return (
                <li key={m.id} className={cn("flex flex-col gap-1", !firm && "items-end text-right")}>
                  <span className="text-muted-foreground text-xs">
                    {who} · {formatDay(m.at)}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm text-pretty",
                      firm ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                    )}
                  >
                    {m.text}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : null}

        {asking ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Ask ${salesFirst} anything about the offer…`}
              aria-label="Your question"
              className="min-h-20 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!text.trim()}
                onClick={() => {
                  dispatch({
                    type: "onboarding",
                    action: { type: "offer_message", caseId: c.id, from: "customer", author: co.contact.name, text: text.trim() },
                  })
                  setText("")
                  setAsking(false)
                  toast.success(`Sent to ${salesFirst}`, { description: "The answer comes back here." })
                }}
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Send question
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="ghost" className="-ms-2 w-fit" onClick={() => setAsking(true)}>
            <MessageCirclePlusIcon data-icon="inline-start" aria-hidden="true" />
            Ask {salesFirst} a question
          </Button>
        )}
      </FramePanel>
    </Frame>
  )
}

/** Signing, as in ReUI's agreement signing card: the badge, the pad when
    signing by hand is on, and one button. */
function SignCard({ c, kyc, accountantFirst }: { c: OnboardingCase; kyc: KycDraft; accountantFirst: string }) {
  const { dispatch } = useAccounting()
  const offer = c.offer!
  const co = company(c)
  const expired = offer.validUntil < TODAY
  const ready = kycComplete(kyc)
  const [{ drawnSignature: byHand }] = useSettings()
  const [ink, setInk] = useState<Signature | null>(null)
  const [signed, setSigned] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  function sign() {
    setSigned(true)
    // A beat on the signed card before the page moves on to setup.
    timer.current = window.setTimeout(() => {
      dispatch({ type: "onboarding", action: { type: "sign", caseId: c.id, kyc: asKyc(kyc), signature: ink ?? undefined } })
      toast.success("Signed. Welcome!", {
        description: `${accountantFirst} takes it from here. A few things for you are below.`,
      })
    }, 900)
  }

  const hint = expired
    ? "This offer has expired. Ask us for a new one."
    : !ready
      ? kycHint(kyc)
      : byHand && !ink
        ? "Draw your signature, or type your name."
        : null

  return (
    <Frame dense spacing="sm" className="shadow-md">
      <FrameHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-foreground text-[15px] leading-5 font-semibold">Sign the agreement</span>
          <span className="text-muted-foreground truncate text-xs">
            As {co.contact.name} for {co.name}
          </span>
        </div>
        <Badge variant={signed ? "success-light" : "warning-light"}>{signed ? "Signed" : "Awaiting signature"}</Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        {byHand && !expired ? (
          <OfferSignature
            name={co.contact.role ? `${co.contact.name}, ${co.contact.role}` : co.contact.name}
            disabled={!ready}
            signedOn={signed ? formatDay(TODAY) : undefined}
            onChange={setInk}
          />
        ) : null}
        {signed ? (
          <p role="status" className="flex h-10 items-center justify-center gap-1.5 text-sm font-medium">
            <CheckIcon className="text-success size-4" aria-hidden="true" />
            Agreement signed
          </p>
        ) : (
          <Button type="button" size="lg" className="w-full" disabled={expired || !ready || (byHand && !ink)} onClick={sign}>
            <SignatureIcon data-icon="inline-start" aria-hidden="true" />
            Sign the agreement
          </Button>
        )}
        {hint && !signed ? <p className="text-muted-foreground text-center text-xs text-pretty">{hint}</p> : null}
      </FramePanel>
    </Frame>
  )
}

/** The signed agreement, to read again: the terms, who does what as it
    stands now, and what was said about the offer. */
function SignedAgreement({ c }: { c: OnboardingCase }) {
  const offer = c.offer!
  const shared = c.thread.filter((m) => !m.internal)
  return (
    <Collapsible className="group/agreement">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {formatKr(offer.monthly)} a month · {scope(offer).join(", ")}
        </span>
        <CollapsibleTrigger
          type="button"
          className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 font-medium underline-offset-4 transition-colors duration-150 hover:underline"
        >
          <span className="group-data-open/agreement:hidden">Your agreement</span>
          <span className="hidden group-data-open/agreement:inline">Hide</span>
          <ChevronDownIcon
            className="ease-snappy size-3.5 transition-[rotate] duration-200 group-data-open/agreement:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className={PANEL_MOTION}>
        <div className="mt-3 flex flex-col gap-4 border-t pt-3">
          {offer.signature ? (
            <figure className="flex flex-col items-start gap-1">
              <SignatureMark signature={offer.signature} />
              <figcaption className="text-muted-foreground border-t pt-1 text-xs">
                {company(c).contact.name} · signed {formatDay(offer.acceptedAt!)}
              </figcaption>
            </figure>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground text-xs">Included</dt>
            <dd className="text-foreground">
              {offer.includedEmployees} employees, {offer.includedVouchers.toLocaleString("nb-NO")} invoices and
              receipts a year
            </dd>
            <dt className="text-muted-foreground text-xs">We keep the books from</dt>
            <dd className="text-foreground">{formatDay(offer.takeoverDate)}</dd>
          </dl>
          <RoutinesList routines={caseRoutines(c)} />
          {shared.length ? (
            <ul className="flex flex-col gap-2">
              {shared.map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5 text-sm">
                  <span className="text-muted-foreground text-xs">
                    {m.from === "firm" ? TEAM_BY_ID.get(m.author)?.name ?? "Sanna" : "You"} · {formatDay(m.at)}
                  </span>
                  <span className="text-foreground text-pretty">{m.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Once they've signed, their accountant is the one to ask, about
    anything. The conversation since signing is here (plus a question from
    before it that nobody answered yet); the offer's own is in "Your
    agreement". In their customer app after the hand-over. */
function AskAccountant({ c }: { c: OnboardingCase }) {
  const { dispatch } = useAccounting()
  const accountant = ACCOUNTANT_BY_ID.get(c.accountantId)!
  const first = accountant.name.split(" ")[0]
  const contact = company(c).contact
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState("")
  const shared = c.thread.filter((m) => !m.internal)
  const since = c.offer?.acceptedAt ?? TODAY
  const before = shared.filter((m) => m.at < since)
  const open = before.at(-1)?.from === "customer" ? [before.at(-1)!] : []
  const messages = [...open, ...shared.filter((m) => m.at >= since)]
  const waiting = messages.at(-1)?.from === "customer"

  function send() {
    if (!text.trim()) return
    dispatch({
      type: "onboarding",
      action: { type: "offer_message", caseId: c.id, from: "customer", author: contact.name, text: text.trim() },
    })
    setText("")
    setAsking(false)
    toast.success(`Sent to ${first}`, { description: "The answer comes back here." })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          <AvatarFallback className="text-xs">{accountant.initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-px text-sm">
          <span className="text-foreground font-medium">{accountant.name} is your accountant</span>
          <span className="text-muted-foreground truncate text-xs">
            {waiting ? `${first} usually answers within a working day` : accountant.email}
          </span>
        </div>
        {asking ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
            <MessageCirclePlusIcon data-icon="inline-start" aria-hidden="true" />
            Ask {first}
          </Button>
        )}
      </div>
      {messages.length ? (
        <ul className="flex flex-col gap-3 border-t pt-3">
          {messages.map((m) => {
            const firm = m.from === "firm"
            return (
              <li key={m.id} className={cn("flex flex-col gap-1", !firm && "items-end text-right")}>
                <span className="text-muted-foreground text-xs">
                  {firm ? TEAM_BY_ID.get(m.author)?.name ?? ACCOUNTANT_BY_ID.get(m.author)?.name ?? "Sanna" : "You"} ·{" "}
                  {formatDay(m.at)}
                </span>
                <p
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm text-pretty",
                    firm ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                  )}
                >
                  {m.text}
                </p>
              </li>
            )
          })}
        </ul>
      ) : null}
      {asking ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${first} anything…`}
            aria-label={`Your question to ${first}`}
            className="min-h-20 resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!text.trim()} onClick={send}>
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Rail entries ──

function DoneEntry({ date, title, children }: { date: string; title: string; children?: ReactNode }) {
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>{formatDay(date)}</TimelineDate>
        <TimelineTitle className="text-foreground">{title}</TimelineTitle>
        <TimelineIndicator className={cn(NODE, "bg-primary text-primary-foreground border-none")}>
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </TimelineIndicator>
      </TimelineHeader>
      {children ? <TimelineContent>{children}</TimelineContent> : null}
    </>
  )
}

function TodayEntry({ note }: { note: ReactNode }) {
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>{formatDay(TODAY)}</TimelineDate>
        <TimelineTitle className="text-foreground">Today</TimelineTitle>
        <TimelineIndicator className={cn(NODE, "bg-primary ring-primary/10 border-none ring-4")}>
          <span className="bg-primary-foreground size-2 rounded-full" />
        </TimelineIndicator>
      </TimelineHeader>
      <TimelineContent>{note}</TimelineContent>
    </>
  )
}

function MilestoneEntry({
  date,
  title,
  children,
  locked,
}: {
  date: string
  title: string
  children?: ReactNode
  locked?: boolean
}) {
  return (
    <>
      <TimelineHeader>
        <TimelineSeparator className={RAIL} />
        <TimelineDate className={DATE}>{date}</TimelineDate>
        <TimelineTitle className={locked ? "text-muted-foreground font-normal" : "text-foreground"}>{title}</TimelineTitle>
        <TimelineIndicator
          className={cn(NODE, "bg-background border-muted-foreground/30 size-3 group-data-[orientation=vertical]/timeline:top-1.5")}
        />
      </TimelineHeader>
      {children ? <TimelineContent>{children}</TimelineContent> : null}
    </>
  )
}

function SentList({ c, tasks, accountantFirst }: { c: OnboardingCase; tasks: OnboardingTask[]; accountantFirst: string }) {
  const checking = tasks.filter((t) => !isSettled(t)).length
  return (
    <Collapsible className="group/sent">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {checking > 0
            ? `${accountantFirst} is checking ${checking === 1 ? "one of them" : `${checking} of them`}.`
            : "All of them are done."}
        </span>
        <CollapsibleTrigger
          type="button"
          className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 font-medium underline-offset-4 transition-colors duration-150 hover:underline"
        >
          <span className="group-data-open/sent:hidden">Show</span>
          <span className="hidden group-data-open/sent:inline">Hide</span>
          <ChevronDownIcon
            className="ease-snappy size-3.5 transition-[rotate] duration-200 group-data-open/sent:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className={PANEL_MOTION}>
        <ul className="mt-3 flex flex-col border-t">
          {tasks.map((task) => (
            <li key={task.id} className="flex min-w-0 items-baseline gap-3 border-b py-2.5">
              <span className="text-foreground min-w-0 flex-1 truncate">{taskTitle(c, task)}</span>
              <span className="shrink-0 text-xs">{isSettled(task) ? "Done" : `${accountantFirst} is checking`}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** What's coming once they sign, so the agreement isn't a leap in the dark. */
const AFTER_SIGNING = [
  "Connect your Tripletex, so we can read your books",
  "Approve the bank feed in your online bank",
  "Sign the registration we send you in Altinn",
  "A first meeting with your accountant: which suppliers you approve from now on",
]

// ── Page ──

export function WelcomePage({ caseId }: { caseId: string }) {
  const { state } = useAccounting()
  const c = state.onboarding.find((x) => x.id === caseId)
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)

  if (!c || (!c.offer && !customerTasks(c).length)) {
    return (
      <PortalShell>
        <Header name={c ? company(c).name : undefined} />
        <p className="text-muted-foreground text-sm text-pretty">
          There&apos;s nothing here yet. This page opens when Sanna sends you an offer.
        </p>
      </PortalShell>
    )
  }

  const co = company(c)
  // No offer, yet something was sent: the page shows just the tasks.
  const offer = c.offer
  const accountant = ACCOUNTANT_BY_ID.get(c.accountantId)!
  const accountantFirst = accountant.name.split(" ")[0]
  const first = co.contact.name.split(" ")[0]
  const signed = offer?.status === "accepted"
  const live = Boolean(c.handedOver)
  // Sent in any phase, the template's and the ones added by hand.
  const tasks = customerTasks(c)
  const pending = tasks.filter((t) => t.status === "with_customer")
  const sent = tasks.filter((t) => t.status !== "with_customer")
  const activeId =
    openId === undefined || (openId && !pending.some((t) => t.id === openId)) ? pending[0]?.id : openId
  const assessed =
    c.history.find((e) => e.phase === "assessment" && e.action === "approved")?.at ?? c.createdAt
  // The takeover date passed while onboarding is still finishing: we keep
  // the books already, the last few things are just late.
  const takenOver = Boolean(offer && signed && offer.takeoverDate <= TODAY)
  const beforeTakeover =
    offer && signed && !live && !takenOver ? ` before we take over on ${formatDay(offer.takeoverDate)}` : ""
  /** When a pending task is due: its own date if it has one, otherwise the
      takeover. */
  const dueLabel = (task: OnboardingTask) => {
    const by = neededByDate(c, task)
    if (by) return `By ${formatDay(by)}`
    if (offer && signed && !live) return takenOver ? "As soon as you can" : `Before ${formatDay(offer.takeoverDate)}`
    return `Asked ${formatDay(task.ask!.sentAt!)}`
  }
  // What "Today" says once the offer is out of the way (or before there is one).
  const today =
    offer && !signed ? null : pending.length ? (
      <>
        <span className="text-foreground font-medium">
          {pending.length} {pending.length === 1 ? "thing" : "things"} from you
        </span>
        {beforeTakeover || (takenOver ? ", to finish the takeover" : "")}.
      </>
    ) : live ? null : signed ? (
      takenOver
        ? `Nothing for you right now. ${accountantFirst} is finishing the takeover checks.`
        : `Nothing for you right now. ${accountantFirst} is preparing the takeover.`
    ) : (
      `Nothing for you right now. ${accountantFirst} is looking at your figures.`
    )

  if (c.declined) {
    return (
      <PortalShell>
        <Header name={co.name} />
        <p className="text-foreground text-sm text-pretty">
          This offer is no longer open. If you&apos;d like to talk about it, write to{" "}
          {TEAM_BY_ID.get(SALES_ID)!.email}.
        </p>
      </PortalShell>
    )
  }

  let step = 0
  const next = () => ++step

  return (
    <PortalShell>
      <header className={cn("flex flex-col gap-6", ENTER)}>
        <Header name={co.name} />
        <div className="flex flex-col gap-3">
          <Badge variant={live ? "success-light" : "outline"} size="lg" className="w-fit">
            {live
              ? "Customer"
              : offer && signed
                ? `Onboarding · we start ${formatDay(offer.takeoverDate)}`
                : offer
                  ? "Offer · not a customer yet"
                  : "Not a customer yet"}
          </Badge>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight text-balance">
            {live
              ? `You're all set, ${first}`
              : signed
                ? `Welcome aboard, ${first}`
                : offer
                  ? `Hi ${first}, here's our offer`
                  : `Hi ${first}`}
          </h1>
          <p className="text-muted-foreground max-w-prose text-pretty">
            {live
              ? `We keep ${co.name}'s books from ${formatMonth(offer?.takeoverDate ?? c.handedOver!.at)}. Your tasks and monthly reports are in your customer app now.`
              : offer && signed
                ? takenOver
                  ? `We keep ${co.name}'s books from ${formatDay(offer.takeoverDate)}. ${accountantFirst} is finishing the takeover checks; your customer app opens when they're done.`
                  : `${co.name} has signed. We take over the books on ${formatDay(offer.takeoverDate)}${offer.previousAccountant ? `; until then ${offer.previousAccountant} keeps them` : ""}. Below is what we need from you before that.`
                : offer
                  ? `${co.name} isn't a Sanna customer yet, and nothing changes until you sign. Read the agreement, ask us anything, and sign when you're ready.`
                  : `We're looking at whether we're a good fit for ${co.name}. Before we can send you an offer, we need a little from you.`}
          </p>
          {live ? (
            <Button className="w-fit" nativeButton={false} render={<Link href={`/portal/${c.id}`} />}>
              Open your customer app
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        {signed && !live ? (
          <AskAccountant c={c} />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">{accountant.initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-px text-sm">
              <span className="text-foreground font-medium">{accountant.name} {live ? "is" : "will be"} your accountant</span>
              <span className="text-muted-foreground truncate text-xs">{accountant.email}</span>
            </div>
          </div>
        )}
      </header>

      <div className={ENTER} style={{ animationDelay: "100ms" }}>
        <Timeline
          value={live ? 99 : signed ? 3 + (sent.length ? 1 : 0) : offer ? 2 : 1 + (sent.length ? 1 : 0)}
          className="isolate"
        >
          {offer ? (
            <TimelineItem step={next()} className={ITEM}>
              <DoneEntry date={assessed} title={`We looked at ${co.name}`}>
                From the register and your figures. We&apos;d like to work with you.
              </DoneEntry>
            </TimelineItem>
          ) : null}

          {offer && signed ? (
            <TimelineItem step={next()} className={ITEM}>
              <DoneEntry date={offer.acceptedAt!} title="You signed the agreement">
                <SignedAgreement c={c} />
              </DoneEntry>
            </TimelineItem>
          ) : offer ? (
            <OfferSteps c={c} accountantFirst={accountantFirst} steps={[next(), next(), next()]} />
          ) : null}

          {sent.length ? (
            <TimelineItem step={next()} className={ITEM}>
              <DoneEntry date={sent.at(-1)!.answer?.at ?? TODAY} title={`You've sent ${sent.length} ${sent.length === 1 ? "thing" : "things"}`}>
                <SentList c={c} tasks={sent} accountantFirst={accountantFirst} />
              </DoneEntry>
            </TimelineItem>
          ) : null}

          {takenOver && offer ? (
            <TimelineItem step={next()} className={ITEM}>
              <DoneEntry date={offer.takeoverDate} title="We took over your books">
                {offer.previousAccountant ? `${offer.previousAccountant} handed over to us.` : "From here, we keep them."}
              </DoneEntry>
            </TimelineItem>
          ) : null}

          {today ? (
            <TimelineItem step={next()} className={ITEM}>
              <TodayEntry note={today} />
            </TimelineItem>
          ) : null}

          {pending.map((task) => (
            <TimelineItem key={task.id} step={next()} className={ITEM}>
              <TimelineHeader>
                <TimelineSeparator className={RAIL} />
                <TimelineDate className={cn(DATE, "text-foreground")}>
                  {dueLabel(task)}
                </TimelineDate>
                <TimelineIndicator
                  className={cn(NODE, "bg-background border-foreground/70 size-2.5 group-data-[orientation=vertical]/timeline:top-[7px]")}
                />
              </TimelineHeader>
              <TimelineContent>
                <TaskCard
                  c={c}
                  task={task}
                  open={activeId === task.id}
                  onOpenChange={(open) => setOpenId(open ? task.id : null)}
                  accountantFirst={accountantFirst}
                />
              </TimelineContent>
            </TimelineItem>
          ))}

          {offer && !signed ? (
            <TimelineItem step={next()} className={ITEM}>
              <MilestoneEntry date="After you sign" title="A few things only you can do" locked>
                <ul className="flex flex-col gap-1.5">
                  {AFTER_SIGNING.map((line) => (
                    <li key={line} className="flex items-center gap-2">
                      <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </MilestoneEntry>
            </TimelineItem>
          ) : null}

          {!offer || live ? null : (
            <>
              {takenOver ? null : (
                <TimelineItem step={next()} className={ITEM}>
                  <MilestoneEntry date={formatDay(offer.takeoverDate)} title="We take over your books" locked={!signed}>
                    {offer.previousAccountant
                      ? `${offer.previousAccountant} hands over to us. We check the balances in the two weeks before.`
                      : "We check the balances in the two weeks before."}
                  </MilestoneEntry>
                </TimelineItem>
              )}
              <TimelineItem step={next()} className={ITEM}>
                <MilestoneEntry
                  date={formatMonth(offer.takeoverDate)}
                  title="Your first month with us"
                  locked={!signed}
                >
                  This page becomes your customer app, with your monthly report.
                </MilestoneEntry>
              </TimelineItem>
            </>
          )}
        </Timeline>
      </div>
    </PortalShell>
  )
}

function Header({ name }: { name?: string }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <IconTile variant="solid" size="xs">
        <LandmarkIcon aria-hidden="true" />
      </IconTile>
      <span className="text-foreground font-medium">Sanna</span>
      {name ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate">{name}</span>
        </>
      ) : null}
    </p>
  )
}
