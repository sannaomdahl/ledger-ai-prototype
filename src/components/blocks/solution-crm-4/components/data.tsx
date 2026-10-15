import { type ReactNode } from "react"
import { type BadgeProps } from "@/components/reui/badge"
import { CircleCheckIcon, AlertCircleIcon, InfoIcon, SmartphoneIcon, MailIcon, CalendarIcon, MessageSquareTextIcon, MonitorIcon } from "lucide-react"

// ── Toast feedback icons ─────────────────────────────────────────────────────
// Success toasts use a green check; the destructive toast uses the alert glyph
// with text-destructive; message toasts use a muted info icon.
export const TOAST_SUCCESS_ICON = (
  <CircleCheckIcon className="size-[18px] text-green-600" aria-hidden="true" />
)

export const TOAST_ERROR_ICON = (
  <AlertCircleIcon className="text-destructive size-[18px]" aria-hidden="true" />
)

export const TOAST_MESSAGE_ICON = (
  <InfoIcon className="text-muted-foreground size-[18px]" aria-hidden="true" />
)

// Mid-market B2B SaaS sales world pack. Each rep keeps one portrait across the
// block so the owner avatar, task owner, and activity authors stay one identity
// (Emma Wilson is the deliberate initials-only fallback).
const PEOPLE = {
  mira: {
    id: "mira-stone",
    name: "Mira Stone",
    role: "Account Executive",
    initials: "MS",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
  },
  leo: {
    id: "leo-grant",
    name: "Leo Grant",
    role: "Account Executive",
    initials: "LG",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&dpr=2&q=80",
  },
  nora: {
    id: "nora-vale",
    name: "Nora Vale",
    role: "Sales Manager",
    initials: "NV",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&dpr=2&q=80",
  },
  sana: {
    id: "sana-qureshi",
    name: "Sana Qureshi",
    role: "Account Executive",
    initials: "SQ",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&h=96&dpr=2&q=80",
  },
  emma: {
    id: "emma-wilson",
    name: "Emma Wilson",
    role: "Sales Development Rep",
    initials: "EW",
  },
} as const

// ── Deal stage ───────────────────────────────────────────────────────────────
export type DealStage =
  | "Qualified"
  | "Discovery"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost"

export const stageVariant: Record<DealStage, BadgeProps["variant"]> = {
  Qualified: "secondary",
  Discovery: "secondary",
  Proposal: "info-light",
  Negotiation: "warning-light",
  "Closed Won": "success-light",
  "Closed Lost": "destructive-light",
}

// Win probability per stage; the Select moves both the badge and the progress.
export const stageProbability: Record<DealStage, number> = {
  Qualified: 20,
  Discovery: 35,
  Proposal: 55,
  Negotiation: 75,
  "Closed Won": 100,
  "Closed Lost": 0,
}

export const STAGE_OPTIONS: { value: DealStage; label: DealStage }[] = [
  { value: "Qualified", label: "Qualified" },
  { value: "Discovery", label: "Discovery" },
  { value: "Proposal", label: "Proposal" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Closed Won", label: "Closed Won" },
  { value: "Closed Lost", label: "Closed Lost" },
]

// ── Key fields ───────────────────────────────────────────────────────────────
export type TextSegments = string | readonly string[]

export type DealField = {
  label: string
  value: TextSegments
}

// ── Deal team ────────────────────────────────────────────────────────────────
export type DealOwner = {
  id: string
  name: string
  role: string
  initials: string
  avatar?: string
}

// ── Next step / task ─────────────────────────────────────────────────────────
export type TaskStatus = "Due today" | "Upcoming" | "Overdue"

export const taskStatusVariant: Record<TaskStatus, BadgeProps["variant"]> = {
  "Due today": "warning-light",
  Upcoming: "secondary",
  Overdue: "destructive-light",
}

export type DealTask = {
  id: string
  name: string
  type: string
  due: TextSegments
  status: TaskStatus
  owner: DealOwner
}

// ── Activity log (timeline-1 grammar) ────────────────────────────────────────
export type ActivityKind = "call" | "email" | "meeting" | "note" | "demo"

export const activityKindIcon: Record<ActivityKind, ReactNode> = {
  call: (
    <SmartphoneIcon className="size-3.5" aria-hidden="true" />
  ),
  email: (
    <MailIcon className="size-3.5" aria-hidden="true" />
  ),
  meeting: (
    <CalendarIcon className="size-3.5" aria-hidden="true" />
  ),
  note: (
    <MessageSquareTextIcon className="size-3.5" aria-hidden="true" />
  ),
  demo: (
    <MonitorIcon className="size-3.5" aria-hidden="true" />
  ),
}

export const activityKindIndicatorClass: Record<ActivityKind, string> = {
  call: "border-success/20 bg-success/10 text-success dark:bg-success/15",
  email: "border-info/20 bg-info/10 text-info dark:bg-info/15",
  meeting: "border-primary/20 bg-primary/10 text-primary dark:bg-primary/15",
  note: "border-warning/20 bg-warning/10 text-warning dark:bg-warning/15",
  demo: "border-info/20 bg-info/10 text-info dark:bg-info/15",
}

export type DealActivity = {
  id: string
  kind: ActivityKind
  title: TextSegments
  detail?: string
  author: DealOwner
  timeLabel: string
}

// ── The deal on the sheet ────────────────────────────────────────────────────
export type DealDetail = {
  id: string
  name: TextSegments
  stage: DealStage
  amount: string
  delta: string
  prior: string
  closeLine: TextSegments
  fields: DealField[]
  financials: DealField[]
  owners: DealOwner[]
  ownerId: string
  noteAuthor: DealOwner
  note: string
  nextStep: DealTask
}

export const DEAL: DealDetail = {
  id: "DEAL-4821",
  name: ["Brightwave Media", "Pro Annual"],
  stage: "Negotiation",
  amount: "$48,000",
  delta: "+$6K",
  prior: "vs $42K at proposal",
  closeLine: ["Closes Jun 28", "41 days in pipeline"],
  fields: [
    { label: "Account", value: "Brightwave Media" },
    { label: "Primary contact", value: ["Daniel Cho", "VP Marketing"] },
    { label: "Close date", value: "Jun 28, 2026" },
    { label: "Plan", value: ["Pro Annual", "45 seats"] },
    { label: "Source", value: "Inbound" },
    { label: "Deal ID", value: "DEAL-4821" },
  ],
  financials: [
    { label: "Amount", value: "$48,000 ARR" },
    { label: "Forecast", value: ["Commit", "$36K weighted"] },
    { label: "Discount", value: "12% off list" },
    { label: "Term", value: ["12 months", "auto-renew"] },
  ],
  owners: [PEOPLE.mira, PEOPLE.nora, PEOPLE.emma],
  ownerId: PEOPLE.mira.id,
  noteAuthor: PEOPLE.mira,
  note: "Daniel confirmed budget for 45 seats. Legal reviewing the MSA, redlines back by Jun 24. Security questionnaire cleared on Jun 16.",
  nextStep: {
    id: "TASK-318",
    name: "Send revised order form",
    type: "Email",
    due: ["Due today", "4:00 PM"],
    status: "Due today",
    owner: PEOPLE.mira,
  },
}

export const DEAL_ACTIVITY: DealActivity[] = [
  {
    id: "act-1",
    kind: "call",
    title: ["Pricing call", "Connected"],
    detail:
      "Daniel Cho agreed to 45 seats at 12% off. Asked for revised order form by end of week.",
    author: PEOPLE.mira,
    timeLabel: "2h ago",
  },
  {
    id: "act-2",
    kind: "email",
    title: "Security questionnaire returned",
    detail: "SOC 2 report and DPA sent to Brightwave legal. No open items.",
    author: PEOPLE.nora,
    timeLabel: "Yesterday",
  },
  {
    id: "act-3",
    kind: "demo",
    title: ["Workflow demo", "6 attendees"],
    detail:
      "Walked the Brightwave team through automations and reporting. Strong interest from ops.",
    author: PEOPLE.mira,
    timeLabel: "Jun 11",
  },
  {
    id: "act-4",
    kind: "meeting",
    title: "Discovery with VP Marketing",
    detail: "Scoped 45 seats across two teams. Budget cycle closes end of Q2.",
    author: PEOPLE.emma,
    timeLabel: "Jun 4",
  },
]