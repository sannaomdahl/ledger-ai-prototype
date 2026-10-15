import type { ReactNode } from "react"
import { TrendingUp, SettingsIcon, FileTextIcon } from "lucide-react"

export interface ISkill {
  icon: ReactNode
  label: string
}

export interface IApplicationCard {
  appliedFor: string
  location: string
  mobile: string
  email: string
  skills: ISkill[]
}

export const APPLICATION_CARD: IApplicationCard = {
  appliedFor: "Business Analyst",
  location: "Amsterdam, NL",
  mobile: "+31 6 9876 54 32",
  email: "jeroen.doe@reui.io",
  skills: [
    {
      icon: (
        <TrendingUp aria-hidden="true" />
      ),
      label: "Analysis",
    },
    {
      icon: (
        <SettingsIcon aria-hidden="true" />
      ),
      label: "Scrum",
    },
    {
      icon: (
        <FileTextIcon aria-hidden="true" />
      ),
      label: "UX Research",
    },
  ],
}