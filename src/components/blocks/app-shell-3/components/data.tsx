import { type ReactNode } from "react"
import { BuildingIcon, HouseIcon, LandmarkIcon, MessagesSquareIcon, ExternalLinkIcon, BookOpenCheckIcon, WalletIcon, PinOffIcon } from "lucide-react"

// ── Types ──

export type NavChild = {
  id: string
  label: string
  href?: string
  isActive?: boolean
}

export type NavItem = {
  id: string
  label: string
  icon: ReactNode
  href?: string
  isActive?: boolean
  children?: NavChild[]
}

export type Workspace = {
  id: string
  name: string
  tier?: string
  imageUrl?: string
}

export type Project = {
  id: string
  name: string
  progress: number
  color: string
}

export type ItemAction = {
  id: string
  label: string
  icon: ReactNode
  destructive: boolean
}

// ── Workspaces ──

export const WORKSPACES: Workspace[] = [
  {
    id: "fjell",
    name: "Sanna AS",
    tier: "Accounting firm · 12 seats",
  },
  {
    id: "fjell-lonn",
    name: "Sanna Lønn",
    tier: "Payroll bureau · 4 seats",
  },
]

// ── Nav Main ──

export const NAV_MAIN: NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    icon: <HouseIcon aria-hidden="true" />,
  },
  {
    id: "clients",
    label: "Clients",
    href: "/clients",
    icon: <BuildingIcon aria-hidden="true" />,
    // The two lives of a customer: the month-to-month work, and on their way in.
    children: [
      { id: "operations", label: "In operation", href: "/clients" },
      { id: "onboarding", label: "Onboarding", href: "/onboarding" },
    ],
  },
  {
    id: "requests",
    label: "Tasks & requests",
    href: "/requests",
    icon: <MessagesSquareIcon aria-hidden="true" />,
  },
  {
    id: "filings",
    label: "Filings",
    href: "/filings",
    icon: <LandmarkIcon aria-hidden="true" />,
  },
]

// ── Item Actions ──

export const ITEM_ACTIONS: ItemAction[] = [
  {
    id: "open",
    label: "Open client",
    icon: <ExternalLinkIcon aria-hidden="true" />,
    destructive: false,
  },
  {
    id: "bookkeeping",
    label: "Bookkeeping",
    icon: <BookOpenCheckIcon aria-hidden="true" />,
    destructive: false,
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: <WalletIcon aria-hidden="true" />,
    destructive: false,
  },
  {
    id: "unpin",
    label: "Unpin",
    icon: <PinOffIcon aria-hidden="true" />,
    destructive: true,
  },
]

// ── Notification Types ──

export type NotificationType =
  | "mention"
  | "comment"
  | "share"
  | "invite"
  | "billing"
  | "security"
  | "feature"
  | "deployment"
  | "usage"
  | "system"
  | "task"
  | "approval"
  | "integration"
  | "achievement"
  | "feedback"
  | "team_join"
  | "reaction"
  | "review"
  | "event"

export type NotificationVariant = "info" | "success" | "warning" | "destructive"

export type NotificationAction = {
  label: string
  variant?: "default" | "outline" | "destructive"
}

export type NotificationAttachment = {
  name: string
  size: string
}

export type NotificationAvatar = {
  src: string
  fallback: string
}

export type NotificationGroupMember = {
  src: string
  fallback: string
  online?: boolean
}

export type NotificationMeta = {
  label: string
  value: string
  color?: string
}

export type Notification = {
  id: string
  type: NotificationType
  variant?: NotificationVariant
  title: string
  body?: string
  time: string
  unread?: boolean
  avatar?: NotificationAvatar
  username?: string
  link?: string
  badge?: string
  actions?: NotificationAction[]
  attachment?: NotificationAttachment
  meta?: NotificationMeta
  progress?: number
  progressVariant?: "default" | "success"
  avatarGroup?: NotificationGroupMember[]
  avatarGroupCount?: number
  rating?: number
  eventDate?: string
  eventTime?: string
  /** Opens this review item when the notification is clicked. */
  itemId?: string
  /** Opens this task (one with no line behind it) when clicked. */
  requestId?: string
  /** Goes to this page when clicked. */
  href?: string
}
