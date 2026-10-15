"use client"

import { useState, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { cn } from "cn"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  activityKindIcon,
  activityKindIndicatorClass,
  DEAL,
  DEAL_ACTIVITY,
  STAGE_OPTIONS,
  stageProbability,
  stageVariant,
  taskStatusVariant,
  TOAST_ERROR_ICON,
  TOAST_MESSAGE_ICON,
  TOAST_SUCCESS_ICON,
  type DealActivity,
  type DealField,
  type DealOwner,
  type DealStage,
  type DealTask,
  type TextSegments,
} from "./data"
import { ListChecksIcon, PanelRightIcon, CircleDollarSignIcon, XIcon, CheckIcon, PlusIcon } from "lucide-react"

// Section wrapper: the px-5 rhythm and Separator between blocks are lifted from
// sheet-7's notification list so the drawer keeps one vertical spine.
function Section({
  label,
  action,
  children,
}: {
  label?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </h3>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function DotSeparator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted-foreground/40 size-1 shrink-0 rounded-full",
        className
      )}
      aria-hidden="true"
    />
  )
}

function SegmentedText({
  value,
  className,
}: {
  value: TextSegments
  className?: string
}) {
  const segments = Array.isArray(value) ? value : [value]

  if (segments.length === 1) {
    return <span className={className}>{segments[0]}</span>
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-x-1.5",
        className
      )}
    >
      {segments.map((segment, index) => (
        <span
          key={`${segment}-${index}`}
          className="inline-flex min-w-0 items-center gap-x-1.5"
        >
          {index > 0 ? <DotSeparator /> : null}
          <span className="min-w-0 truncate">{segment}</span>
        </span>
      ))}
    </span>
  )
}

function formatText(value: TextSegments) {
  return Array.isArray(value) ? value.join(", ") : value
}

// MiniProgress: the hatched track + Progress indicator copied verbatim from
// sheet-7; the win-probability bar is half of the block's signature.
function MiniProgress({ value }: { value: number }) {
  const indicatorColor =
    value >= 80
      ? "**:data-[slot=progress-indicator]:bg-success"
      : value >= 50
        ? "**:data-[slot=progress-indicator]:bg-primary"
        : "**:data-[slot=progress-indicator]:bg-warning"

  return (
    <div className="bg-muted/55 relative mt-1.5 h-1 overflow-hidden rounded-full">
      <div
        className="text-muted-foreground pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-45deg,currentColor_0,currentColor_1px,transparent_0,transparent_4px)] opacity-20"
        aria-hidden="true"
      />
      <Progress
        value={value}
        className={cn(
          "absolute inset-0 gap-0",
          "**:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent",
          "**:data-[slot=progress-indicator]:rounded-none",
          indicatorColor
        )}
      />
    </div>
  )
}

// FactRow: key fields as a label/value dl, the grammar from solution-agents-7's
// run-detail sheet.
function FactRow({ fact }: { fact: DealField }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground text-sm">{fact.label}</dt>
      <dd className="text-foreground min-w-0 text-sm">
        <SegmentedText value={fact.value} />
      </dd>
    </div>
  )
}

// Owner avatars: sheet-7's AvatarGroup grammar; Emma Wilson resolves to initials
// as the deliberate fallback. The deal-team avatars are the other half of the
// signature.
function OwnerAvatars({
  owners,
  ownerId,
}: {
  owners: DealOwner[]
  ownerId: string
}) {
  const owner = owners.find((person) => person.id === ownerId)

  return (
    <div className="flex items-center justify-between gap-3">
      <AvatarGroup className="-space-x-1">
        {owners.map((person) => (
          <Avatar key={person.id} className="size-6">
            {person.avatar ? (
              <AvatarImage src={person.avatar} alt={person.name} />
            ) : null}
            <AvatarFallback className="text-[10px]">
              {person.initials}
            </AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      {owner ? (
        <p className="text-muted-foreground inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 text-xs">
          <span className="text-foreground font-medium">{owner.name}</span>
          <DotSeparator />
          <span className="truncate">owns</span>
        </p>
      ) : null}
    </div>
  )
}

// Next-step row: sheet-7's notification-item grammar (colored icon cell +
// content column with a title/badge row and a muted meta line), reskinned to the
// deal's one open task. No hand-rolled card or icon box.
function NextStepRow({ task }: { task: DealTask }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-warning relative grid size-5 shrink-0 place-items-center">
        <span className="grid size-5 place-items-center leading-none [&_svg]:block [&_svg]:size-4">
          <ListChecksIcon aria-hidden="true" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-foreground min-w-0 text-sm leading-5 font-medium">
            {task.name}
          </p>
          <Badge variant={taskStatusVariant[task.status]}>{task.status}</Badge>
        </div>
        <p className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 text-xs">
          <span>{task.type}</span>
          <DotSeparator />
          <SegmentedText value={task.due} />
        </p>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
          <Avatar className="size-5">
            {task.owner.avatar ? (
              <AvatarImage src={task.owner.avatar} alt={task.owner.name} />
            ) : null}
            <AvatarFallback className="text-[9px]">
              {task.owner.initials}
            </AvatarFallback>
          </Avatar>
          <span>{task.owner.name}</span>
        </div>
      </div>
    </div>
  )
}

// ActivityRow: timeline-1's TimelineItem / Header / Indicator grammar (via the
// agents-7 ladder) reskinned to one logged activity.
function ActivityRow({
  activity,
  step,
}: {
  activity: DealActivity
  step: number
}) {
  return (
    <TimelineItem
      step={step}
      className="has-[+[data-completed]]:[&_[data-slot=timeline-separator]]:bg-border group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=vertical]/timeline:not-last:pb-6"
    >
      <TimelineHeader className="flex min-w-0 items-start justify-between gap-2.5">
        <TimelineSeparator className="bg-border group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.25rem-1rem)] group-data-[orientation=vertical]/timeline:translate-y-7" />
        <TimelineIndicator
          className={cn(
            "group-data-completed/timeline-item:border-border flex size-5 items-center justify-center rounded-full border group-data-[orientation=vertical]/timeline:-left-6 [&_svg]:size-3",
            activityKindIndicatorClass[activity.kind]
          )}
        >
          {activityKindIcon[activity.kind]}
        </TimelineIndicator>

        <TimelineTitle className="min-w-0 text-sm leading-5">
          <SegmentedText
            value={activity.title}
            className="text-foreground font-medium"
          />
        </TimelineTitle>

        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {activity.timeLabel}
        </span>
      </TimelineHeader>

      <TimelineContent className="flex min-w-0 flex-col items-start gap-2 pb-1">
        {activity.detail ? (
          <p className="text-muted-foreground max-w-[52ch] text-sm leading-5">
            {activity.detail}
          </p>
        ) : null}
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Avatar className="size-5">
            {activity.author.avatar ? (
              <AvatarImage
                src={activity.author.avatar}
                alt={activity.author.name}
              />
            ) : null}
            <AvatarFallback className="text-[9px]">
              {activity.author.initials}
            </AvatarFallback>
          </Avatar>
          <span>{activity.author.name}</span>
        </div>
      </TimelineContent>
    </TimelineItem>
  )
}

export function DealDetailSheet() {
  const [open, setOpen] = useState(true)
  // savedStage is the committed baseline; stage is the in-flight selection.
  const [savedStage, setSavedStage] = useState<DealStage>(DEAL.stage)
  const [stage, setStage] = useState<DealStage>(DEAL.stage)
  const probability = stageProbability[stage]
  const dirty = stage !== savedStage

  function handleStageChange(value: string | null) {
    if (value !== null) {
      setStage(value as DealStage)
    }
  }

  function handleSave() {
    setSavedStage(stage)
    toast.success("Deal updated", {
      description: `${formatText(DEAL.name)} moved to ${stage}, ${stageProbability[stage]}% win probability.`,
      icon: TOAST_SUCCESS_ICON,
    })
  }

  function handleLogActivity() {
    toast.message("Activity logged", {
      description:
        "Call with Daniel Cho saved to the Brightwave Media timeline.",
      icon: TOAST_MESSAGE_ICON,
    })
  }

  function handleAddNote() {
    toast.message("Note added", {
      description: "Saved to DEAL-4821. Visible to the deal team on next sync.",
      icon: TOAST_MESSAGE_ICON,
    })
  }

  function handleWon() {
    setStage("Closed Won")
    setSavedStage("Closed Won")
    toast.success("Deal marked Won", {
      description: `${formatText(DEAL.name)} booked at ${DEAL.amount} ARR. Closes Jun 28.`,
      icon: TOAST_SUCCESS_ICON,
    })
  }

  function handleLost() {
    setStage("Closed Lost")
    setSavedStage("Closed Lost")
    toast.error("Deal marked Lost", {
      description:
        "Brightwave Media moved to Closed Lost. Add a reason on next sync.",
      icon: TOAST_ERROR_ICON,
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Actions */}
      <div className="flex min-h-[360px] items-center justify-center">
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(true)}
            >
              <PanelRightIcon data-icon="inline-start" aria-hidden="true" />
              Open Deal
            </Button>
          }
        />
      </div>

      {/* Content */}
      <SheetContent
        side="right"
        showCloseButton={false}
        initialFocus={false}
        className="bg-popover inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(30rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 outline-none"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 gap-0 border-b p-0">
          <div className="flex min-h-9 items-center justify-between gap-2 px-4">
            <span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
              <CircleDollarSignIcon className="size-3.5" aria-hidden="true" />
              {DEAL.id}
            </span>
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close deal detail"
                  className="shrink-0"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 px-4 pt-0 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <SheetTitle className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                <SegmentedText value={DEAL.name} className="flex-nowrap" />
              </SheetTitle>
              <Badge variant={stageVariant[stage]}>{stage}</Badge>
            </div>
            <SheetDescription className="text-muted-foreground text-xs">
              <SegmentedText value={DEAL.closeLine} />
            </SheetDescription>
            <div className="flex items-center gap-2 pt-0.5">
              <Button type="button" size="sm" onClick={handleWon}>
                <CheckIcon data-icon="inline-start" aria-hidden="true" />
                Mark Won
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleLost}
              >
                Mark Lost
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full min-h-0">
            {/* Hero: amount, delta, and the win-probability progress */}
            <Section>
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-foreground text-4xl font-semibold tracking-tight tabular-nums">
                    {DEAL.amount}
                  </span>
                  <Badge variant="success-light">{DEAL.delta}</Badge>
                </div>
                <span className="text-muted-foreground pb-1 text-xs">
                  {DEAL.prior}
                </span>
              </div>
              <MiniProgress value={probability} />
              <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                <span>Win probability</span>
                <span className="tabular-nums">{probability}%</span>
              </div>
            </Section>

            <Separator className="opacity-60" />

            {/* Inline stage change */}
            <Section label="Stage">
              <div className="flex items-center gap-2">
                <Select
                  value={stage}
                  onValueChange={handleStageChange}
                  items={STAGE_OPTIONS}
                >
                  <SelectTrigger
                    id="deal-stage"
                    aria-label="Change deal stage"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {STAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {dirty ? (
                  <Button type="button" size="sm" onClick={handleSave}>
                    Save
                  </Button>
                ) : null}
              </div>
              {dirty ? (
                <p className="text-warning inline-flex items-center gap-1.5 text-xs">
                  <span
                    className="bg-warning size-1.5 shrink-0 rounded-full"
                    aria-hidden="true"
                  />
                  <span>Unsaved stage change</span>
                  <DotSeparator className="bg-warning/70" />
                  <span>win probability now {probability}%</span>
                </p>
              ) : null}
            </Section>

            <Separator className="opacity-60" />

            {/* Key fields */}
            <Section label="Key Fields">
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5">
                {DEAL.fields.map((field) => (
                  <FactRow key={field.label} fact={field} />
                ))}
              </dl>
            </Section>

            <Separator className="opacity-60" />

            {/* Deal team */}
            <Section label="Deal Team">
              <OwnerAvatars owners={DEAL.owners} ownerId={DEAL.ownerId} />
            </Section>

            <Separator className="opacity-60" />

            {/* Next step */}
            <Section
              label="Next Step"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleLogActivity}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Log activity
                </Button>
              }
            >
              <NextStepRow task={DEAL.nextStep} />
            </Section>

            <Separator className="opacity-60" />

            {/* Financials */}
            <Section label="Financials">
              <div className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5">
                {DEAL.financials.map((field) => (
                  <FactRow key={field.label} fact={field} />
                ))}
              </div>
            </Section>

            <Separator className="opacity-60" />

            {/* Note */}
            <Section
              label="Note"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddNote}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Add note
                </Button>
              }
            >
              <div className="flex flex-col gap-2">
                <p className="text-foreground text-sm leading-5">{DEAL.note}</p>
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Avatar className="size-5">
                    {DEAL.noteAuthor.avatar ? (
                      <AvatarImage
                        src={DEAL.noteAuthor.avatar}
                        alt={DEAL.noteAuthor.name}
                      />
                    ) : null}
                    <AvatarFallback className="text-[9px]">
                      {DEAL.noteAuthor.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span>{DEAL.noteAuthor.name}</span>
                </div>
              </div>
            </Section>

            <Separator className="opacity-60" />

            {/* Activity log */}
            <Section label="Activity">
              <Timeline defaultValue={0}>
                {DEAL_ACTIVITY.map((item, index) => (
                  <ActivityRow key={item.id} activity={item} step={index + 1} />
                ))}
              </Timeline>
            </Section>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}