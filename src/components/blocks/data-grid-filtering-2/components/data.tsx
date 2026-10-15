export type AutomationTab = "all" | "live" | "review" | "drafts" | "paused"

export type AutomationKind =
  | "sequence"
  | "routing"
  | "enrichment"
  | "digest"
  | "escalation"

export type OwnerFilter =
  | "everyone"
  | "product"
  | "engineering"
  | "operations"
  | "revenue"
  | "support"

export type DeliveryFilter =
  | "any"
  | "scheduled"
  | "event-driven"
  | "manual"
  | "hybrid"

export type UpdatedFilter = "any" | "today" | "this-week" | "older"

export type AutomationState = Exclude<AutomationTab, "all">
export type AutomationOwnerAvailability = "online" | "away" | "busy" | "offline"

export interface IAutomationOwner {
  id: string
  name: string
  email: string
  initials: string
  avatar?: string
  availability: AutomationOwnerAvailability
  team: Exclude<OwnerFilter, "everyone">
  teamLabel: string
}

export interface IAutomationRecord {
  id: string
  title: string
  kind: AutomationKind
  state: AutomationState
  rating: number
  deliveryMode: Exclude<DeliveryFilter, "any">
  owner: IAutomationOwner
  updatedAt: string
  updatedBucket: Exclude<UpdatedFilter, "any">
  enabled: boolean
  approvalRequired: boolean
  audienceLabel: string
  runWindowLabel: string
}

const OWNERS: Record<string, IAutomationOwner> = {
  maya: {
    id: "maya-patel",
    name: "Maya Patel",
    email: "maya@reui.io",
    initials: "MP",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
    availability: "online",
    team: "product",
    teamLabel: "Product",
  },
  jonas: {
    id: "jonas-reed",
    name: "Jonas Reed",
    email: "jonas@reui.io",
    initials: "JR",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&dpr=2&q=80",
    availability: "busy",
    team: "engineering",
    teamLabel: "Engineering",
  },
  priya: {
    id: "priya-nair",
    name: "Priya Nair",
    email: "priya@reui.io",
    initials: "PN",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=96&h=96&dpr=2&q=80",
    availability: "away",
    team: "operations",
    teamLabel: "Operations",
  },
  emil: {
    id: "emil-novak",
    name: "Emil Novak",
    email: "emil@reui.io",
    initials: "EN",
    avatar:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=96&h=96&dpr=2&q=80",
    availability: "offline",
    team: "revenue",
    teamLabel: "Revenue",
  },
  nora: {
    id: "nora-ibrahim",
    name: "Nora Ibrahim",
    email: "nora@reui.io",
    initials: "NI",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&dpr=2&q=80",
    availability: "online",
    team: "support",
    teamLabel: "Support",
  },
}

function automation(
  input: Omit<IAutomationRecord, "owner"> & {
    owner: keyof typeof OWNERS
  }
): IAutomationRecord {
  return {
    ...input,
    owner: OWNERS[input.owner],
  }
}

export const AUTOMATION_TABS: { value: AutomationTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "review", label: "Needs Review" },
  { value: "drafts", label: "Drafts" },
  { value: "paused", label: "Paused" },
]

export const OWNER_FILTER_OPTIONS: {
  value: OwnerFilter
  label: string
}[] = [
  { value: "everyone", label: "Owner team" },
  { value: "product", label: "Product" },
  { value: "engineering", label: "Engineering" },
  { value: "operations", label: "Operations" },
  { value: "revenue", label: "Revenue" },
  { value: "support", label: "Support" },
]

export const DELIVERY_FILTER_OPTIONS: {
  value: DeliveryFilter
  label: string
}[] = [
  { value: "any", label: "Delivery mode" },
  { value: "scheduled", label: "Scheduled" },
  { value: "event-driven", label: "Event-driven" },
  { value: "manual", label: "Manual" },
  { value: "hybrid", label: "Hybrid" },
]

export const UPDATED_FILTER_OPTIONS: {
  value: UpdatedFilter
  label: string
}[] = [
  { value: "any", label: "Last updated" },
  { value: "today", label: "Today" },
  { value: "this-week", label: "This week" },
  { value: "older", label: "Older" },
]

export function getAutomationTabFromState(
  state: AutomationState
): Exclude<AutomationTab, "all"> {
  return state
}

export const AUTOMATIONS: IAutomationRecord[] = [
  automation({
    id: "renewal-touchpoint-orchestration",
    title: "Renewal touchpoint orchestration",
    kind: "sequence",
    state: "live",
    rating: 4.8,
    deliveryMode: "scheduled",
    owner: "emil",
    updatedAt: "2026-04-11",
    updatedBucket: "today",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Renewal accounts",
    runWindowLabel: "Weekdays 09:00",
  }),
  automation({
    id: "delegated-sender-review-route",
    title: "Delegated sender review route",
    kind: "routing",
    state: "review",
    rating: 4.2,
    deliveryMode: "manual",
    owner: "priya",
    updatedAt: "2026-04-11",
    updatedBucket: "today",
    enabled: false,
    approvalRequired: true,
    audienceLabel: "Delegated senders",
    runWindowLabel: "Queue-based release",
  }),
  automation({
    id: "launch-handoff-digest",
    title: "Launch handoff digest",
    kind: "digest",
    state: "live",
    rating: 4.7,
    deliveryMode: "scheduled",
    owner: "maya",
    updatedAt: "2026-04-10",
    updatedBucket: "this-week",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Launch squad",
    runWindowLabel: "Daily 08:30",
  }),
  automation({
    id: "sla-escalation-watch",
    title: "SLA escalation watch",
    kind: "escalation",
    state: "live",
    rating: 4.9,
    deliveryMode: "event-driven",
    owner: "nora",
    updatedAt: "2026-04-10",
    updatedBucket: "this-week",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Priority tickets",
    runWindowLabel: "On trigger",
  }),
  automation({
    id: "lead-enrichment-pass",
    title: "Lead enrichment pass",
    kind: "enrichment",
    state: "paused",
    rating: 3.9,
    deliveryMode: "hybrid",
    owner: "jonas",
    updatedAt: "2026-04-09",
    updatedBucket: "this-week",
    enabled: false,
    approvalRequired: false,
    audienceLabel: "Inbound pipeline",
    runWindowLabel: "Hourly batch",
  }),
  automation({
    id: "sandbox-onboarding-sequence",
    title: "Sandbox onboarding sequence",
    kind: "sequence",
    state: "drafts",
    rating: 4.1,
    deliveryMode: "scheduled",
    owner: "priya",
    updatedAt: "2026-04-08",
    updatedBucket: "this-week",
    enabled: false,
    approvalRequired: false,
    audienceLabel: "Trial workspaces",
    runWindowLabel: "Pending QA",
  }),
  automation({
    id: "partner-routing-fallback",
    title: "Partner routing fallback",
    kind: "routing",
    state: "live",
    rating: 4.4,
    deliveryMode: "hybrid",
    owner: "emil",
    updatedAt: "2026-04-07",
    updatedBucket: "this-week",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Partner renewals",
    runWindowLabel: "Live + nightly",
  }),
  automation({
    id: "weekly-adoption-digest",
    title: "Weekly adoption digest",
    kind: "digest",
    state: "paused",
    rating: 3.8,
    deliveryMode: "scheduled",
    owner: "maya",
    updatedAt: "2026-04-06",
    updatedBucket: "this-week",
    enabled: false,
    approvalRequired: false,
    audienceLabel: "Workspace champions",
    runWindowLabel: "Fridays 16:00",
  }),
  automation({
    id: "enterprise-risk-escalation",
    title: "Enterprise risk escalation",
    kind: "escalation",
    state: "review",
    rating: 4.3,
    deliveryMode: "manual",
    owner: "nora",
    updatedAt: "2026-04-05",
    updatedBucket: "older",
    enabled: false,
    approvalRequired: true,
    audienceLabel: "Enterprise accounts",
    runWindowLabel: "Manual release",
  }),
  automation({
    id: "crm-enrichment-backfill",
    title: "CRM enrichment backfill",
    kind: "enrichment",
    state: "live",
    rating: 4.6,
    deliveryMode: "scheduled",
    owner: "jonas",
    updatedAt: "2026-04-04",
    updatedBucket: "older",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Open opportunities",
    runWindowLabel: "Nightly 01:00",
  }),
  automation({
    id: "trial-conversion-follow-up",
    title: "Trial conversion follow-up",
    kind: "sequence",
    state: "drafts",
    rating: 4.0,
    deliveryMode: "scheduled",
    owner: "emil",
    updatedAt: "2026-04-03",
    updatedBucket: "older",
    enabled: false,
    approvalRequired: false,
    audienceLabel: "Product-led signups",
    runWindowLabel: "Awaiting copy",
  }),
  automation({
    id: "owner-assignment-router",
    title: "Owner assignment router",
    kind: "routing",
    state: "live",
    rating: 4.5,
    deliveryMode: "event-driven",
    owner: "priya",
    updatedAt: "2026-04-02",
    updatedBucket: "older",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Workspace requests",
    runWindowLabel: "Immediate",
  }),
  automation({
    id: "ops-exception-digest",
    title: "Ops exception digest",
    kind: "digest",
    state: "review",
    rating: 4.1,
    deliveryMode: "scheduled",
    owner: "priya",
    updatedAt: "2026-04-11",
    updatedBucket: "today",
    enabled: false,
    approvalRequired: true,
    audienceLabel: "Ops leadership",
    runWindowLabel: "Daily 18:00",
  }),
  automation({
    id: "billing-retry-escalation",
    title: "Billing retry escalation",
    kind: "escalation",
    state: "live",
    rating: 4.7,
    deliveryMode: "event-driven",
    owner: "nora",
    updatedAt: "2026-04-01",
    updatedBucket: "older",
    enabled: true,
    approvalRequired: false,
    audienceLabel: "Recovery queue",
    runWindowLabel: "On failure",
  }),
]