import type { ReactNode } from "react"
import type { BadgeProps } from "@/components/reui/badge"
import {
  CircleCheckIcon,
  ClipboardListIcon,
  ListChecksIcon,
  ListTodoIcon,
  TextIcon,
  UploadIcon,
  BabyIcon,
  BikeIcon,
  BotIcon,
  BedDoubleIcon,
  BriefcaseIcon,
  CoffeeIcon,
  DraftingCompassIcon,
  FishIcon,
  HardHatIcon,
  MountainIcon,
  PaletteIcon,
  SandwichIcon,
  ScaleIcon,
  ScissorsIcon,
  ServerCogIcon,
  SmileIcon,
  TruckIcon,
  WrenchIcon,
  CalendarClockIcon,
  CircleHelpIcon,
  FileQuestionIcon,
  FileWarningIcon,
  HandCoinsIcon,
  HeartPulseIcon,
  IdCardIcon,
  MessageCircleQuestionIcon,
  MessageSquareTextIcon,
  ReceiptTextIcon,
  ServerIcon,
  ShieldQuestionIcon,
  UserIcon,
} from "lucide-react"

import type {
  ActivityActor,
  CustomerRequest,
  IndustryKey,
  ResponseType,
  IssueKind,
  ItemStatus,
  RequestKind,
  RequestStatus,
} from "@/lib/accounting/types"

// ── Formatting ──

const nok = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatNok(value: number) {
  return `${nok.format(value)} kr`
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso))
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

// ── Item status ──

export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; dotClassName: string }
> = {
  needs_review: { label: "Needs review", dotClassName: "bg-amber-500" },
  customer_replied: { label: "Customer replied", dotClassName: "bg-info" },
  waiting_customer: {
    label: "Waiting on customer",
    dotClassName: "bg-sky-500",
  },
  booked: { label: "Booked", dotClassName: "bg-emerald-500" },
}

// ── Agent flags ──

export const ISSUE_META: Record<IssueKind, { label: string; icon: ReactNode }> =
  {
    missing_receipt: {
      label: "Missing receipt",
      icon: <FileWarningIcon aria-hidden="true" />,
    },
    unclear_purpose: {
      label: "Purpose unclear",
      icon: <CircleHelpIcon aria-hidden="true" />,
    },
    private_expense: {
      label: "Possibly private",
      icon: <ShieldQuestionIcon aria-hidden="true" />,
    },
    overtime_unapproved: {
      label: "Overtime not approved",
      icon: <CalendarClockIcon aria-hidden="true" />,
    },
    sick_leave: {
      label: "Sick note missing",
      icon: <HeartPulseIcon aria-hidden="true" />,
    },
    missing_tax_card: {
      label: "Tax card missing",
      icon: <IdCardIcon aria-hidden="true" />,
    },
    unregistered_bonus: {
      label: "Bonus not in input",
      icon: <HandCoinsIcon aria-hidden="true" />,
    },
  }

// ── Confidence ──

/** Traffic light: green only when the agent is 90%+ sure, orange when a
    human should look, red when the agent is mostly guessing. */
export function confidenceTone(value: number) {
  if (value >= 0.9)
    return {
      label: "High",
      text: "text-success-text",
      indicator: "**:data-[slot=progress-indicator]:bg-emerald-500",
    }
  if (value >= 0.7)
    return {
      label: "Medium",
      text: "text-orange-700 dark:text-orange-400",
      indicator: "**:data-[slot=progress-indicator]:bg-orange-500",
    }
  return {
    label: "Low",
    text: "text-red-700 dark:text-red-400",
    indicator: "**:data-[slot=progress-indicator]:bg-red-500",
  }
}

// ── Requests ──

export const REQUEST_KIND_META: Record<
  RequestKind,
  { label: string; icon: ReactNode }
> = {
  missing_receipt: {
    label: "Missing receipt",
    icon: <ReceiptTextIcon aria-hidden="true" />,
  },
  explain: {
    label: "Explain transaction",
    icon: <MessageSquareTextIcon aria-hidden="true" />,
  },
  confirm: {
    label: "Confirm details",
    icon: <CircleHelpIcon aria-hidden="true" />,
  },
  document: {
    label: "Request document",
    icon: <FileQuestionIcon aria-hidden="true" />,
  },
  custom: {
    label: "Custom task",
    icon: <ListTodoIcon aria-hidden="true" />,
  },
  customer_question: {
    label: "From the customer",
    icon: <MessageCircleQuestionIcon aria-hidden="true" />,
  },
  approval: {
    label: "Approval",
    icon: <ListChecksIcon aria-hidden="true" />,
  },
  payroll_checkin: {
    label: "Pay period check-in",
    icon: <ClipboardListIcon aria-hidden="true" />,
  },
}

// ── How the customer answers ──

export const RESPONSE_TYPE_META: Record<
  ResponseType,
  { label: string; hint: string; icon: ReactNode }
> = {
  text: {
    label: "Text answer",
    hint: "A free-text reply",
    icon: <TextIcon aria-hidden="true" />,
  },
  choice: {
    label: "Pick an option",
    hint: "One tap from a list you define",
    icon: <ListChecksIcon aria-hidden="true" />,
  },
  file: {
    label: "Upload a file",
    hint: "Photo, PDF or document",
    icon: <UploadIcon aria-hidden="true" />,
  },
  confirm: {
    label: "Yes / No",
    hint: "Approve or decline",
    icon: <CircleCheckIcon aria-hidden="true" />,
  },
  approval: {
    label: "Approve a list",
    hint: "Approve or reject each line",
    icon: <ListChecksIcon aria-hidden="true" />,
  },
  checkin: {
    label: "Check-in",
    hint: "What changed this pay period",
    icon: <ClipboardListIcon aria-hidden="true" />,
  },
}

export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { label: string; variant: BadgeProps["variant"]; dotClassName: string }
> = {
  draft: {
    label: "Needs decision",
    variant: "warning-light",
    dotClassName: "bg-amber-500",
  },
  sent: {
    label: "Waiting on customer",
    variant: "outline",
    dotClassName: "bg-sky-500",
  },
  replied: {
    label: "Customer replied",
    variant: "info-light",
    dotClassName: "bg-info",
  },
  resolved: {
    label: "Resolved",
    variant: "success-light",
    dotClassName: "bg-emerald-500",
  },
}

/** The status as the accountant should read it: a customer question waiting
    on us is "asked", not "replied". */
export function requestStatusMeta(request: CustomerRequest) {
  const meta = REQUEST_STATUS_META[request.status]
  if (request.origin !== "customer") return meta
  if (request.status === "replied")
    return { ...meta, label: request.thread?.length ? "Customer replied" : "Customer asked" }
  return meta
}

// ── Activity timeline ──

export const ACTOR_META: Record<
  ActivityActor,
  { icon: ReactNode; indicatorClassName: string }
> = {
  agent: {
    icon: <BotIcon className="size-3.5" aria-hidden="true" />,
    indicatorClassName:
      "border-primary/20 bg-primary/10 text-primary dark:bg-primary/15",
  },
  accountant: {
    icon: <UserIcon className="size-3.5" aria-hidden="true" />,
    indicatorClassName:
      "border-success/20 bg-success/10 text-success-text dark:bg-success/15",
  },
  customer: {
    icon: <MessageSquareTextIcon className="size-3.5" aria-hidden="true" />,
    indicatorClassName: "border-info/20 bg-info/10 text-info-text dark:bg-info/15",
  },
  system: {
    icon: <ServerIcon className="size-3.5" aria-hidden="true" />,
    indicatorClassName:
      "border-border bg-muted text-muted-foreground dark:bg-muted/60",
  },
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => /^[A-ZÆØÅ]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
}

// ── Priority ──

export const PRIORITY_META: Record<
  CustomerRequest["priority"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  low: { label: "Low", variant: "outline" },
  medium: { label: "Medium", variant: "outline" },
  high: { label: "High", variant: "destructive-light" },
}

// ── Client icons ──

export const INDUSTRY_ICON: Record<IndustryKey, ReactNode> = {
  cafe: <CoffeeIcon aria-hidden="true" />,
  design: <PaletteIcon aria-hidden="true" />,
  construction: <HardHatIcon aria-hidden="true" />,
  seafood: <FishIcon aria-hidden="true" />,
  dental: <SmileIcon aria-hidden="true" />,
  climbing: <MountainIcon aria-hidden="true" />,
  law: <ScaleIcon aria-hidden="true" />,
  it: <ServerCogIcon aria-hidden="true" />,
  salon: <ScissorsIcon aria-hidden="true" />,
  bikes: <BikeIcon aria-hidden="true" />,
  plumbing: <WrenchIcon aria-hidden="true" />,
  hotel: <BedDoubleIcon aria-hidden="true" />,
  kindergarten: <BabyIcon aria-hidden="true" />,
  architecture: <DraftingCompassIcon aria-hidden="true" />,
  logistics: <TruckIcon aria-hidden="true" />,
  deli: <SandwichIcon aria-hidden="true" />,
}

export const FALLBACK_CLIENT_ICON = <BriefcaseIcon aria-hidden="true" />
