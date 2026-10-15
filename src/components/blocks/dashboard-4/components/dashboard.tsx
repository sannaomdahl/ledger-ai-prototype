"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { Badge, type BadgeProps } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { cn } from "cn"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { Discord } from "@/components/ui/svgs/discord"
import { GoogleMeet } from "@/components/ui/svgs/googleMeet"
import { Openai } from "@/components/ui/svgs/openai"
import { OpenaiDark } from "@/components/ui/svgs/openaiDark"
import { Slack } from "@/components/ui/svgs/slack"
import { Zoom } from "@/components/ui/svgs/zoom"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  agentCallMetrics,
  callChartConfig,
  callVolumeData,
  overviewMetrics,
  toolbarFilters,
  type FilterKey,
  type MetricKey,
} from "./data"
import { CalendarIcon, PlusIcon, SettingsIcon, ArrowRightIcon, HelpCircleIcon, ExternalLinkIcon, Headphones } from "lucide-react"

const metricById = new Map(overviewMetrics.map((metric) => [metric.id, metric]))

type AgentMetricFilter = "calls" | "share"

const metricDomainPadding: Record<MetricKey, number> = {
  calls: 5000,
  avgDuration: 8,
  totalCost: 2500,
  avgCost: 2,
  llmCost: 600,
  avgLlmCost: 12,
}

const agentMetricFilters: { value: AgentMetricFilter; label: string }[] = [
  { value: "calls", label: "Calls" },
  { value: "share", label: "Share" },
]

const agentTones = [
  {
    dot: "bg-blue-500",
    fill: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  {
    dot: "bg-violet-500",
    fill: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
  },
  {
    dot: "bg-amber-500",
    fill: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    dot: "bg-emerald-500",
    fill: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    dot: "bg-rose-500",
    fill: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
  {
    dot: "bg-cyan-500",
    fill: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  {
    dot: "bg-indigo-500",
    fill: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
  },
]

type IntegrationItem = {
  id: string
  name: string
  description: string
  logo: ReactNode
  statusLabel: string
  statusVariant: BadgeProps["variant"]
}

const integrationItems: IntegrationItem[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Transcripts and response traces",
    logo: (
      <>
        <Openai className="size-6 dark:hidden" aria-hidden="true" />
        <OpenaiDark className="hidden size-6 dark:block" aria-hidden="true" />
      </>
    ),
    statusLabel: "Live",
    statusVariant: "success-light",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Escalation alerts and handoffs",
    logo: <Slack className="size-6" aria-hidden="true" />,
    statusLabel: "Live",
    statusVariant: "success-light",
  },
  {
    id: "voice-gateway",
    name: "Voice Gateway",
    description: "SIP routing and failover",
    logo: <Discord className="size-6" aria-hidden="true" />,
    statusLabel: "Live",
    statusVariant: "success-light",
  },
  {
    id: "google-meet",
    name: "Google Meet",
    description: "Meetings and call context",
    logo: <GoogleMeet className="size-6" aria-hidden="true" />,
    statusLabel: "Syncing",
    statusVariant: "info-light",
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Voice sessions and recordings",
    logo: <Zoom className="size-6" aria-hidden="true" />,
    statusLabel: "Review",
    statusVariant: "warning-light",
  },
]

function isAgentMetricFilter(value: string | null): value is AgentMetricFilter {
  return value === "calls" || value === "share"
}

function formatMetricValue(metric: MetricKey, value: number) {
  if (metric === "avgDuration") {
    const minutes = Math.floor(value / 60)
    const seconds = String(value % 60).padStart(2, "0")
    return `${minutes}:${seconds}`
  }

  if (metric === "llmCost") {
    return `$${value.toLocaleString()}`
  }

  if (metric === "avgLlmCost") {
    return `$${value.toLocaleString()}`
  }

  return value.toLocaleString()
}

function FilterSelect({
  filterKey,
  value,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  filterKey: FilterKey
  value: string
  onValueChange: (value: string) => void
  "aria-label": string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => next && onValueChange(next)}
      items={toolbarFilters[filterKey]}
    >
      <SelectTrigger className="w-40" aria-label={ariaLabel}>
        {filterKey === "range" ? (
          <CalendarIcon className="size-4" aria-hidden="true" />
        ) : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {toolbarFilters[filterKey].map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function OverviewToolbar() {
  const [range, setRange] = useState("7d")
  const [interval, setInterval] = useState("daily")
  const [agent, setAgent] = useState("all")
  const [extraFilter, setExtraFilter] = useState(false)
  const [message, setMessage] = useState("")

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSelect
          filterKey="range"
          value={range}
          onValueChange={setRange}
          aria-label="Date range"
        />
        <FilterSelect
          filterKey="interval"
          value={interval}
          onValueChange={setInterval}
          aria-label="Aggregation interval"
        />
        <FilterSelect
          filterKey="agent"
          value={agent}
          onValueChange={setAgent}
          aria-label="Agent scope"
        />
        <Button
          type="button"
          variant={extraFilter ? "secondary" : "outline"}
          onClick={() => setExtraFilter((current) => !current)}
        >
          <PlusIcon aria-hidden="true" />
          {extraFilter ? "Filtered" : "Add Filter"}
        </Button>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
        <Button
          type="button"
          onClick={() => setMessage("New report action queued.")}
        >
          <PlusIcon aria-hidden="true" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setMessage("Dashboard configuration opened.")}
        >
          <SettingsIcon aria-hidden="true" />
          Configure
        </Button>
      </div>

      <span className="sr-only" aria-live="polite">
        {message}
      </span>
    </div>
  )
}

function OverviewChart() {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("calls")
  const selectedMetric = metricById.get(activeMetric) ?? overviewMetrics[0]
  const metricValues = callVolumeData.map((point) => point[activeMetric])
  const minMetricValue = Math.min(...metricValues)
  const maxMetricValue = Math.max(...metricValues)
  const domainPadding = metricDomainPadding[activeMetric]
  const metricDomain: [number, number] = [
    Math.max(0, minMetricValue - domainPadding),
    maxMetricValue + domainPadding,
  ]

  return (
    <Frame stacked className="w-full overflow-hidden">
      <FrameHeader className="p-0!">
        <div className="grid sm:grid-cols-3 lg:grid-cols-6">
          {overviewMetrics.map((metric, index) => {
            const active = metric.id === activeMetric

            return (
              <button
                key={metric.id}
                type="button"
                className={cn(
                  "focus-visible:ring-ring/50 group hover:bg-muted/40 hover:text-foreground relative flex min-h-18 min-w-0 flex-col items-start justify-center gap-1 border-b px-4 py-3 text-start transition-colors outline-none focus-visible:z-10 focus-visible:ring-[3px] sm:border-b-0",
                  index % 3 !== 2 && "sm:border-e",
                  index < overviewMetrics.length - 1 && "lg:border-e",
                  active ? "bg-muted/60 text-foreground" : "text-foreground"
                )}
                aria-pressed={active}
                onClick={() => setActiveMetric(metric.id)}
              >
                <span
                  className={cn(
                    "text-xs transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {metric.label}
                </span>
                <span className="text-sm font-semibold tabular-nums transition-colors">
                  {metric.value}
                  {metric.detail ? (
                    <span className="text-muted-foreground ms-1 text-xs font-normal transition-colors">
                      {metric.detail}
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <span
                    className="bg-foreground absolute inset-x-4 bottom-0 h-0.5"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </FrameHeader>

      <FramePanel className="p-0!">
        <div className="px-4 pt-6 pb-3">
          <div className="text-muted-foreground mb-5 flex flex-wrap items-center justify-end gap-2 text-xs">
            <span>
              Min{" "}
              <span className="text-foreground font-medium tabular-nums">
                {formatMetricValue(activeMetric, minMetricValue)}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
            />
            <span>
              Max{" "}
              <span className="text-foreground font-medium tabular-nums">
                {formatMetricValue(activeMetric, maxMetricValue)}
              </span>
            </span>
          </div>

          <ChartContainer
            config={callChartConfig}
            className="h-[400px] w-full"
            initialDimension={{ width: 900, height: 400 }}
          >
            <ComposedChart
              accessibilityLayer
              data={callVolumeData}
              margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <pattern
                  id="dashboard-4-call-volume-stripe"
                  patternUnits="userSpaceOnUse"
                  width="6"
                  height="6"
                >
                  <rect
                    width="6"
                    height="6"
                    fill={`var(--color-${activeMetric})`}
                    opacity="0.04"
                  />
                  <path
                    d="M0,6 L6,0"
                    stroke={`var(--color-${activeMetric})`}
                    strokeWidth="0.8"
                    opacity="0.15"
                  />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={metricDomain} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    className="min-w-40 gap-2.5"
                    labelFormatter={(value) => (
                      <div className="border-border/50 mb-0.5 border-b pb-2">
                        <span className="text-xs font-medium">{value}</span>
                      </div>
                    )}
                    formatter={(value, name) => {
                      const metricKey = name as MetricKey
                      const metric = metricById.get(metricKey) ?? selectedMetric

                      return (
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="size-2.5 shrink-0 rounded-full bg-(--metric-color)"
                              style={
                                {
                                  "--metric-color": `var(--color-${metricKey})`,
                                } as CSSProperties
                              }
                            />
                            <span className="text-muted-foreground">
                              {metric.label}
                            </span>
                          </div>
                          <span className="text-foreground font-semibold tabular-nums">
                            {formatMetricValue(metricKey, Number(value))}
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />
              <Area
                key={activeMetric}
                type="natural"
                dataKey={activeMetric}
                fill="url(#dashboard-4-call-volume-stripe)"
                stroke="none"
                connectNulls
                legendType="none"
                tooltipType="none"
              />
              <Line
                key={`${activeMetric}-line`}
                type="natural"
                dataKey={activeMetric}
                stroke={`var(--color-${activeMetric})`}
                strokeWidth={1}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: "var(--background)",
                  stroke: `var(--color-${activeMetric})`,
                  strokeWidth: 2,
                }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>

          <div className="mt-2 flex justify-end">
            <Button type="button" variant="outline">
              View more
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </FramePanel>
    </Frame>
  )
}

function AgentsPanel() {
  const [agentMetric, setAgentMetric] = useState<AgentMetricFilter>("calls")

  return (
    <Frame stacked className="min-h-full w-full overflow-hidden">
      <FrameHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FrameTitle>Most Called Agents</FrameTitle>
            <HelpCircleIcon className="text-muted-foreground size-3.5" aria-hidden="true" />
          </div>
          <FrameDescription className="text-xs">
            Call volume by agent
          </FrameDescription>
        </div>

        <Select
          value={agentMetric}
          onValueChange={(value) => {
            if (isAgentMetricFilter(value)) setAgentMetric(value)
          }}
          items={agentMetricFilters}
        >
          <SelectTrigger
            aria-label="Agent metric"
            className="min-w-28 shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {agentMetricFilters.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </FrameHeader>

      <FramePanel className="p-0!">
        <div className="space-y-3 px-4 py-4">
          {agentCallMetrics.map((agent, index) => {
            const tone = agentTones[index % agentTones.length]
            const value =
              agentMetric === "calls"
                ? agent.calls.toLocaleString()
                : `${agent.share}%`

            return (
              <div
                key={agent.name}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3"
              >
                <div className="bg-muted relative h-8 min-w-0 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "absolute inset-y-0 start-0 rounded-full opacity-20",
                      tone.fill
                    )}
                    style={{ width: `${agent.share}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 flex h-full min-w-0 items-center gap-2 px-3 text-xs font-medium">
                    <span
                      className={cn("size-2 shrink-0 rounded-full", tone.dot)}
                      aria-hidden="true"
                    />
                    <span className="truncate">{agent.name}</span>
                  </span>
                </div>
                <span
                  className={cn(
                    "justify-self-end text-end text-xs font-semibold tabular-nums",
                    tone.text
                  )}
                >
                  {value}
                </span>
              </div>
            )
          })}
        </div>
      </FramePanel>
    </Frame>
  )
}

function IntegrationRow({
  item,
  showSeparator,
}: {
  item: IntegrationItem
  showSeparator: boolean
}) {
  return (
    <li>
      <Item size="sm" className="gap-3 px-3 py-3">
        <ItemMedia className="size-8">{item.logo}</ItemMedia>

        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="text-sm font-medium">{item.name}</ItemTitle>
          <ItemDescription className="truncate text-xs">
            {item.description}
          </ItemDescription>
        </ItemContent>

        <ItemActions className="ms-auto flex-wrap justify-end gap-2">
          <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
          <Button type="button" variant="outline" size="sm">
            Connect
          </Button>
        </ItemActions>
      </Item>
      {showSeparator ? (
        <Separator className="mx-3 w-auto border-t border-dashed bg-transparent" />
      ) : null}
    </li>
  )
}

function IntegrationsPanel() {
  return (
    <Frame stacked className="min-h-full w-full">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <FrameTitle>Integrations</FrameTitle>
          <FrameDescription>Connections for voice ops</FrameDescription>
        </div>
        <Button type="button" variant="outline" size="sm">
          Manage
          <ExternalLinkIcon aria-hidden="true" className="opacity-50" />
        </Button>
      </FrameHeader>

      <FramePanel className="p-0!">
        <ul className="flex flex-col">
          {integrationItems.map((item, index) => (
            <IntegrationRow
              key={item.id}
              item={item}
              showSeparator={index < integrationItems.length - 1}
            />
          ))}
        </ul>
      </FramePanel>
    </Frame>
  )
}

export function Dashboard() {
  return (
    <div className="text-foreground @container mx-auto flex w-full max-w-6xl flex-col gap-3">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <span className="text-muted-foreground inline-flex items-center gap-1.5 pb-1 text-xs font-medium">
            <Headphones className="size-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Active Calls
            <span className="text-foreground tabular-nums">294</span>
          </span>
        </div>
        <OverviewToolbar />
      </header>

      <OverviewChart />

      <section className="grid gap-1 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AgentsPanel />
        <IntegrationsPanel />
      </section>
    </div>
  )
}