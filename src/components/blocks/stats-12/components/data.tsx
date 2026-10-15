"use client"

import { ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { Headphones, CircleCheckIcon, SmileIcon } from "lucide-react"

// ── Types ──

export interface CardData {
  icon: ReactNode
  iconBg: string
  value: string | number
  label: string
  info: ReactNode
}

// ── Data ──

export const cards: CardData[] = [
  {
    icon: (
      <Headphones aria-hidden="true" />
    ),
    iconBg: "text-blue-600 dark:text-blue-400",
    value: 320,
    label: "Support Tickets",
    info: <Badge variant="info-light">12 Open, 308 Closed</Badge>,
  },
  {
    icon: (
      <CircleCheckIcon aria-hidden="true" />
    ),
    iconBg: "text-emerald-600 dark:text-emerald-400",
    value: "98%",
    label: "Resolved",
    info: <Badge variant="success-light">+2.1% this month</Badge>,
  },
  {
    icon: (
      <SmileIcon aria-hidden="true" />
    ),
    iconBg: "text-amber-600 dark:text-amber-400",
    value: "4.8",
    label: "Satisfaction Rate",
    info: <Badge variant="warning-light">Avg. (out of 5)</Badge>,
  },
]