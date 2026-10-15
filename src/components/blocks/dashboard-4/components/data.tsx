import { type ChartConfig } from "@/components/ui/chart"

export type MetricKey =
  | "calls"
  | "avgDuration"
  | "totalCost"
  | "avgCost"
  | "llmCost"
  | "avgLlmCost"

export type FilterKey = "range" | "interval" | "agent"

export interface FilterOption {
  value: string
  label: string
}

export interface OverviewMetric {
  id: MetricKey
  label: string
  value: string
  detail?: string
}

export interface CallVolumePoint {
  date: string
  calls: number
  avgDuration: number
  totalCost: number
  avgCost: number
  llmCost: number
  avgLlmCost: number
}

export interface AgentCallMetric {
  name: string
  calls: number
  share: number
}

export const toolbarFilters: Record<FilterKey, FilterOption[]> = {
  range: [
    { value: "7d", label: "Last 7 days" },
    { value: "14d", label: "Last 14 days" },
    { value: "30d", label: "Last 30 days" },
  ],
  interval: [
    { value: "daily", label: "Daily" },
    { value: "hourly", label: "Hourly" },
    { value: "weekly", label: "Weekly" },
  ],
  agent: [
    { value: "all", label: "All agents" },
    { value: "support", label: "Support" },
    { value: "sales", label: "Sales" },
  ],
}

export const overviewMetrics: OverviewMetric[] = [
  {
    id: "calls",
    label: "Calls",
    value: "77,258",
  },
  {
    id: "avgDuration",
    label: "Avg. duration",
    value: "2:51",
  },
  {
    id: "totalCost",
    label: "Total cost",
    value: "33,402",
    detail: "credits",
  },
  {
    id: "avgCost",
    label: "Avg. cost per call",
    value: "77,258",
    detail: "credits",
  },
  {
    id: "llmCost",
    label: "Total LLM cost",
    value: "$7,258",
  },
  {
    id: "avgLlmCost",
    label: "Avg. LLM cost",
    value: "$258",
  },
]

export const callVolumeData: CallVolumePoint[] = [
  {
    date: "17 Aug",
    calls: 71800,
    avgDuration: 164,
    totalCost: 30900,
    avgCost: 42,
    llmCost: 6450,
    avgLlmCost: 218,
  },
  {
    date: "18 Aug",
    calls: 74400,
    avgDuration: 168,
    totalCost: 31800,
    avgCost: 43,
    llmCost: 6660,
    avgLlmCost: 224,
  },
  {
    date: "19 Aug",
    calls: 73100,
    avgDuration: 162,
    totalCost: 31300,
    avgCost: 42,
    llmCost: 6510,
    avgLlmCost: 216,
  },
  {
    date: "20 Aug",
    calls: 78600,
    avgDuration: 174,
    totalCost: 34200,
    avgCost: 45,
    llmCost: 7120,
    avgLlmCost: 238,
  },
  {
    date: "21 Aug",
    calls: 76500,
    avgDuration: 171,
    totalCost: 33100,
    avgCost: 44,
    llmCost: 6890,
    avgLlmCost: 229,
  },
  {
    date: "22 Aug",
    calls: 82300,
    avgDuration: 181,
    totalCost: 36200,
    avgCost: 46,
    llmCost: 7580,
    avgLlmCost: 251,
  },
  {
    date: "23 Aug",
    calls: 80100,
    avgDuration: 176,
    totalCost: 34900,
    avgCost: 45,
    llmCost: 7330,
    avgLlmCost: 242,
  },
  {
    date: "24 Aug",
    calls: 77900,
    avgDuration: 169,
    totalCost: 33600,
    avgCost: 43,
    llmCost: 7040,
    avgLlmCost: 232,
  },
]

export const agentCallMetrics: AgentCallMetric[] = [
  { name: "Docs Support Agent", calls: 6424, share: 100 },
  { name: "Website Agent", calls: 3942, share: 61 },
  { name: "Billing Triage Agent", calls: 1820, share: 42 },
  { name: "Acme Co.", calls: 1194, share: 31 },
  { name: "Store Assistant", calls: 1094, share: 28 },
  { name: "Language Tutor v2.4 Advanced", calls: 1028, share: 27 },
  { name: "Returns Concierge Agent", calls: 914, share: 24 },
]

export const callChartConfig = {
  calls: {
    label: "Calls",
    color: "var(--color-blue-600)",
  },
  avgDuration: {
    label: "Avg. duration",
    color: "var(--color-blue-600)",
  },
  totalCost: {
    label: "Total cost",
    color: "var(--color-blue-600)",
  },
  avgCost: {
    label: "Avg. cost per call",
    color: "var(--color-blue-600)",
  },
  llmCost: {
    label: "Total LLM cost",
    color: "var(--color-blue-600)",
  },
  avgLlmCost: {
    label: "Avg. LLM cost",
    color: "var(--color-blue-600)",
  },
} satisfies ChartConfig