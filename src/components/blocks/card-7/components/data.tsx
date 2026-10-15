import { type ReactNode } from "react"
import { CopyIcon, GlobeIcon, CalendarIcon, UserIcon } from "lucide-react"

export type BottomType = "logo" | "badge" | "avatars" | null

export interface ICard {
  label: string
  icon: ReactNode
  primary: string
  primaryHref?: string
  secondary: string
  bottom: BottomType
  bottomLogo?: string
}

export const CARDS: ICard[] = [
  {
    label: "Company",
    icon: (
      <CopyIcon aria-hidden />
    ),
    primary: "ReUI Inc.",
    secondary: "Amsterdam, NL",
    bottom: "logo",
    bottomLogo: "HotmartLogo",
  },
  {
    label: "API Endpoint",
    icon: (
      <GlobeIcon aria-hidden />
    ),
    primary: "api.reui.io",
    primaryHref: "#",
    secondary: "Requests: 124k/day",
    bottom: "badge",
  },
  {
    label: "Next Session",
    icon: (
      <CalendarIcon aria-hidden />
    ),
    primary: "26 Dec, 2025",
    secondary: "RAI Amsterdam",
    bottom: "avatars",
  },
  {
    label: "Social Profile",
    icon: (
      <UserIcon aria-hidden />
    ),
    primary: "@reui_io",
    primaryHref: "#",
    secondary: "2,468 Members",
    bottom: null,
  },
]