import type { ReactNode } from "react"
import { CircleDotIcon, FileTextIcon, BellIcon, ImageIcon, LayoutDashboardIcon } from "lucide-react"

export type EntryTabId = "action" | "brief" | "nudge" | "canvas" | "pulse"

export interface EntryTabRecord {
  id: EntryTabId
  label: string
  titlePlaceholder: string
  notePlaceholder: string
  primaryActionLabel: string
  icon: ReactNode
}

export interface EntryDraftRecord {
  title: string
  note: string
}

export type EntryStatus =
  | "backlog"
  | "planned"
  | "in-progress"
  | "paused"
  | "completed"
  | "cancelled"

export type EntryStatusTone =
  | "backlog"
  | "planned"
  | "inProgress"
  | "paused"
  | "completed"
  | "cancelled"

export interface EntryStatusOption {
  value: EntryStatus
  label: string
  tone: EntryStatusTone
  searchText: string
}

export type EntryPriority = "none" | "low" | "medium" | "high" | "urgent"
export type EntryPriorityTone = EntryPriority

export interface EntryPriorityOption {
  value: EntryPriority
  label: string
  tone: EntryPriorityTone
  searchText: string
}

export type EntryLabelOption = {
  type: "label"
  id: string
  value: string
  label: string
  colorClassName: string
  searchText: string
}

export type EmptyEntryLabelOption = {
  type: "none"
  id: "no-label"
  label: string
  searchText: string
}

export type EntryLabelSelectionItem = EmptyEntryLabelOption | EntryLabelOption

export type NoAssigneeOption = {
  type: "none"
  id: "no-assignee"
  value: "none"
  label: string
  searchText: string
}

export type EntryAssigneeOption = {
  type: "member"
  id: string
  value: string
  label: string
  avatar: string
  initials: string
  isCurrentUser?: boolean
  searchText: string
}

export type InviteAssigneeOption = {
  type: "invite"
  id: "invite-user"
  value: "invite"
  label: string
  searchText: string
}

export type EntryAssigneeSelectionItem =
  | NoAssigneeOption
  | EntryAssigneeOption
  | InviteAssigneeOption

export const ENTRY_TABS: EntryTabRecord[] = [
  {
    id: "action",
    label: "Action",
    titlePlaceholder: "Name the next action...",
    notePlaceholder: "Add context, acceptance notes, or blockers...",
    primaryActionLabel: "Create Action",
    icon: (
      <CircleDotIcon aria-hidden="true" />
    ),
  },
  {
    id: "brief",
    label: "Brief",
    titlePlaceholder: "Title the decision brief...",
    notePlaceholder: "Capture the decision, evidence, and open questions...",
    primaryActionLabel: "Create Brief",
    icon: (
      <FileTextIcon aria-hidden="true" />
    ),
  },
  {
    id: "nudge",
    label: "Nudge",
    titlePlaceholder: "What should the team remember?",
    notePlaceholder: "Add the short prompt that should be sent later...",
    primaryActionLabel: "Schedule Nudge",
    icon: (
      <BellIcon aria-hidden="true" />
    ),
  },
  {
    id: "canvas",
    label: "Canvas",
    titlePlaceholder: "Name the shared canvas...",
    notePlaceholder: "Describe what the canvas should organize...",
    primaryActionLabel: "Start Canvas",
    icon: (
      <ImageIcon aria-hidden="true" />
    ),
  },
  {
    id: "pulse",
    label: "Pulse",
    titlePlaceholder: "Name the status pulse...",
    notePlaceholder: "Summarize signal, risk, movement, and next readout...",
    primaryActionLabel: "Publish Pulse",
    icon: (
      <LayoutDashboardIcon aria-hidden="true" />
    ),
  },
]

export const ENTRY_INITIAL_DRAFTS: Record<EntryTabId, EntryDraftRecord> = {
  action: {
    title: "Close billing-event gaps before partner beta",
    note: "Confirm upgrade, downgrade, and trial-extension events are mapped before the beta opens.",
  },
  brief: {
    title: "Partner beta readiness decision",
    note: "Summarize launch criteria, support coverage, and rollout risks for reviewer sign-off.",
  },
  nudge: {
    title: "Remind support leads about beta cohort",
    note: "Send a short note before launch review so channel coverage is confirmed.",
  },
  canvas: {
    title: "Map activation handoff",
    note: "Sketch the owner handoff from signup to first successful invitation.",
  },
  pulse: {
    title: "Launch room health snapshot",
    note: "Share current readiness, open risks, and the next milestone in one update.",
  },
}

export const ENTRY_STATUS_OPTIONS: EntryStatusOption[] = [
  {
    value: "backlog",
    label: "Backlog",
    tone: "backlog",
    searchText: "Backlog queued later parking lot",
  },
  {
    value: "planned",
    label: "Planned",
    tone: "planned",
    searchText: "Planned scoped scheduled ready",
  },
  {
    value: "in-progress",
    label: "In Progress",
    tone: "inProgress",
    searchText: "Active in progress execution sprint",
  },
  {
    value: "paused",
    label: "Paused",
    tone: "paused",
    searchText: "Paused blocked waiting hold",
  },
  {
    value: "completed",
    label: "Completed",
    tone: "completed",
    searchText: "Completed done shipped finished",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    tone: "cancelled",
    searchText: "Cancelled closed removed stopped",
  },
]

export const ENTRY_PRIORITY_OPTIONS: EntryPriorityOption[] = [
  {
    value: "none",
    label: "No Priority",
    tone: "none",
    searchText: "No priority clear priority none",
  },
  {
    value: "low",
    label: "Low",
    tone: "low",
    searchText: "Low backlog nice to have",
  },
  {
    value: "medium",
    label: "Medium",
    tone: "medium",
    searchText: "Medium normal weekly tracking",
  },
  {
    value: "high",
    label: "High",
    tone: "high",
    searchText: "High critical path important",
  },
  {
    value: "urgent",
    label: "Urgent",
    tone: "urgent",
    searchText: "Urgent blocker emergency launch risk",
  },
]

export const ENTRY_NO_LABEL_OPTION: EmptyEntryLabelOption = {
  type: "none",
  id: "no-label",
  label: "No label",
  searchText: "No label clear labels remove labels empty",
}

export const ENTRY_LABEL_OPTIONS: EntryLabelOption[] = [
  {
    type: "label",
    id: "billing",
    value: "billing",
    label: "Billing",
    colorClassName: "bg-sky-500",
    searchText: "Billing invoice payment subscription",
  },
  {
    type: "label",
    id: "beta",
    value: "beta",
    label: "Beta",
    colorClassName: "bg-violet-500",
    searchText: "Beta cohort launch release",
  },
  {
    type: "label",
    id: "support",
    value: "support",
    label: "Support",
    colorClassName: "bg-emerald-500",
    searchText: "Support customer care coverage",
  },
  {
    type: "label",
    id: "risk",
    value: "risk",
    label: "Risk",
    colorClassName: "bg-rose-500",
    searchText: "Risk blocker escalation issue",
  },
]

export const ENTRY_LABEL_SELECTION_OPTIONS: EntryLabelSelectionItem[] = [
  ENTRY_NO_LABEL_OPTION,
  ...ENTRY_LABEL_OPTIONS,
]

export const ENTRY_NO_ASSIGNEE_OPTION: NoAssigneeOption = {
  type: "none",
  id: "no-assignee",
  value: "none",
  label: "No assignee",
  searchText: "No assignee unassigned clear assignee remove assignee",
}

export const ENTRY_ASSIGNEE_MEMBERS: EntryAssigneeOption[] = [
  {
    type: "member",
    id: "maya-stone",
    value: "maya-stone",
    label: "Maya Stone",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
    initials: "MS",
    isCurrentUser: true,
    searchText: "Maya Stone owner planning",
  },
  {
    type: "member",
    id: "leo-grant",
    value: "leo-grant",
    label: "Leo Grant",
    avatar:
      "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=96&h=96&dpr=2&q=80",
    initials: "LG",
    searchText: "Leo Grant design systems",
  },
  {
    type: "member",
    id: "nora-chen",
    value: "nora-chen",
    label: "Nora Chen",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=96&h=96&dpr=2&q=80",
    initials: "NC",
    searchText: "Nora Chen frontend engineering",
  },
  {
    type: "member",
    id: "samir-park",
    value: "samir-park",
    label: "Samir Park",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&dpr=2&q=80",
    initials: "SP",
    searchText: "Samir Park launch operations",
  },
]

export const ENTRY_INVITE_ASSIGNEE_OPTION: InviteAssigneeOption = {
  type: "invite",
  id: "invite-user",
  value: "invite",
  label: "Invite...",
  searchText: "Invite new user teammate member collaborator",
}

export const ENTRY_ASSIGNEE_OPTIONS: EntryAssigneeSelectionItem[] = [
  ENTRY_NO_ASSIGNEE_OPTION,
  ...ENTRY_ASSIGNEE_MEMBERS,
  ENTRY_INVITE_ASSIGNEE_OPTION,
]