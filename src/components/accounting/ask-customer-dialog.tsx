"use client"

// Adapted from @reui/dialog-12 (tabbed create-entry dialog). The tabs are the
// kinds of question we can put to a customer; the agent pre-drafts the message
// from its flag, the accountant edits and sends. FieldLabelHint, the priority
// combobox and the due-date combobox are the block's own, kept verbatim.
import * as React from "react"
import { cn } from "cn"
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
} from "date-fns"
import { toast } from "sonner"
import { Badge } from "@/components/reui/badge"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CalendarIcon,
  CalendarSearchIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { CLIENT_BY_ID, draftRequest, TODAY } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type {
  CustomerRequest,
  Person,
  RequestKind,
  ReviewItem,
} from "@/lib/accounting/types"
import { Frame, FramePanel } from "@/components/reui/frame"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { scopedClients } from "@/lib/accounting/store"
import type { ResponseType } from "@/lib/accounting/types"
import {
  formatDate,
  formatNok,
  REQUEST_KIND_META,
  RESPONSE_TYPE_META,
} from "./meta"
import { DotSeparator } from "./primitives"

// The demo's today, so the date picker presets render deterministically.
const ENTRY_REFERENCE_NOW = new Date(`${TODAY}T09:00:00`)

type EntryPriorityOption = {
  value: CustomerRequest["priority"]
  label: string
  tone: "none" | "low" | "medium" | "high" | "urgent"
  searchText: string
}

const ENTRY_PRIORITY_OPTIONS: EntryPriorityOption[] = [
  { value: "low", label: "Low", tone: "low", searchText: "Low priority" },
  {
    value: "medium",
    label: "Medium",
    tone: "medium",
    searchText: "Medium priority",
  },
  {
    value: "high",
    label: "High · blocks close",
    tone: "urgent",
    searchText: "High priority blocks close payroll",
  },
]

// Customer questions are opened from the customer's app, never from here;
// approval lists and pay check-ins are built where their lines are.
const REQUEST_KINDS = (Object.keys(REQUEST_KIND_META) as RequestKind[]).filter(
  (k) =>
    k !== "custom" && k !== "customer_question" && k !== "approval" && k !== "payroll_checkin"
)
const RESPONSE_TYPES = (Object.keys(RESPONSE_TYPE_META) as ResponseType[]).filter(
  (t) => t !== "approval" && t !== "checkin"
)
const DEFAULT_OPTIONS = ["Yes", "No", "Not sure, call me"]

function FieldLabelHint({
  label,
  hint,
  htmlFor,
}: {
  label: string
  hint: string
  htmlFor?: string
}) {
  return (
    <div className="flex w-fit items-center gap-1.5 leading-none">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={`${label} help`}
            />
          }
        >
          <InfoIcon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-balance">
          {hint}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function LowPriorityIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0", className)}
    >
      <rect x="3" y="9" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect
        x="7"
        y="6"
        width="2.5"
        height="7"
        rx="1"
        fill="currentColor"
        opacity="0.28"
      />
      <rect
        x="11"
        y="3"
        width="2.5"
        height="10"
        rx="1"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  )
}

function MediumPriorityIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0", className)}
    >
      <rect x="3" y="9" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="7" y="6" width="2.5" height="7" rx="1" fill="currentColor" />
      <rect
        x="11"
        y="3"
        width="2.5"
        height="10"
        rx="1"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  )
}

function HighPriorityIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0", className)}
    >
      <rect x="3" y="9" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="7" y="6" width="2.5" height="7" rx="1" fill="currentColor" />
      <rect x="11" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
    </svg>
  )
}

function EntryPriorityGlyph({
  tone,
  className,
}: {
  tone: EntryPriorityOption["tone"]
  className?: string
}) {
  switch (tone) {
    case "none":
      return (
        <MoreHorizontalIcon className={cn(
                      "text-muted-foreground! [&_*]:text-muted-foreground! size-4 shrink-0",
                      className
                    )} aria-hidden="true" />
      )
    case "low":
      return (
        <LowPriorityIcon
          className={cn("text-foreground! [&_*]:text-foreground!", className)}
        />
      )
    case "medium":
      return (
        <MediumPriorityIcon
          className={cn("text-foreground! [&_*]:text-foreground!", className)}
        />
      )
    case "high":
      return (
        <HighPriorityIcon
          className={cn("text-foreground! [&_*]:text-foreground!", className)}
        />
      )
    case "urgent":
      return (
        <TriangleAlertIcon className={cn(
                      "size-4 shrink-0 text-destructive! [&_*]:text-destructive!",
                      className
                    )} aria-hidden="true" />
      )
  }
}

function EntryPriorityLabel({
  priority,
  className,
}: {
  priority: EntryPriorityOption
  className?: string
}) {
  const labelClassName =
    priority.tone === "urgent" ? "text-destructive!" : "text-foreground!"

  return (
    <span
      className={cn(
        "text-foreground! flex min-w-0 items-center gap-2",
        priority.tone === "urgent" && "text-destructive!",
        className
      )}
    >
      <EntryPriorityGlyph tone={priority.tone} />
      <span className={cn("truncate", labelClassName)}>{priority.label}</span>
    </span>
  )
}

function EntryPriorityField({
  value,
  onValueChange,
}: {
  value: EntryPriorityOption
  onValueChange: (option: EntryPriorityOption) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Priority"
        hint="Choose the priority signal the receiving team should scan first."
      />
      <Combobox
        items={ENTRY_PRIORITY_OPTIONS}
        value={value}
        onValueChange={(nextPriority) => {
          if (nextPriority) {
            onValueChange(nextPriority as EntryPriorityOption)
          }
        }}
        itemToStringValue={(item: EntryPriorityOption) => item.label}
        autoHighlight
      >
        <ComboboxTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          <ComboboxValue placeholder="Set priority">
            {(selectedPriority: EntryPriorityOption | null) =>
              selectedPriority ? (
                <EntryPriorityLabel priority={selectedPriority} />
              ) : (
                <span className="text-muted-foreground truncate">
                  Set priority
                </span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxInput
            showTrigger={false}
            placeholder="Change priority"
            className="mb-1"
          />
          <ComboboxEmpty>No priorities found.</ComboboxEmpty>
          <ComboboxList>
            {(item: EntryPriorityOption) => (
              <ComboboxItem key={item.value} value={item}>
                <EntryPriorityLabel priority={item} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

type PresetDateOption = {
  type: "preset"
  id: string
  label: string
  date: Date
  searchText: string
}

type CustomDateAction = {
  type: "custom"
  id: "custom-date"
  label: string
  searchText: string
}

type EmptyDateOption = {
  type: "none"
  id: "no-date"
  label: string
  searchText: string
}

type DateOption = EmptyDateOption | PresetDateOption | CustomDateAction

const noDateOption: EmptyDateOption = {
  type: "none",
  id: "no-date",
  label: "No date",
  searchText: "No date clear date remove date empty",
}

const customDateOption: CustomDateAction = {
  type: "custom",
  id: "custom-date",
  label: "Custom date...",
  searchText:
    "Custom date custom day calendar picker choose a date manual date",
}

type DateSelectionValue =
  | {
      type: "preset"
      id: string
      label: string
      date: Date
    }
  | {
      type: "custom"
      label: string
      date: Date
    }
  | null

function DateTriggerLabel({
  value,
  placeholder,
}: {
  value: DateSelectionValue
  placeholder: string
}) {
  if (!value) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <CalendarIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground truncate">{placeholder}</span>
      </span>
    )
  }

  const displayLabel =
    value.type === "custom" ? format(value.date, "MMM d") : value.label

  return (
    <span className="flex min-w-0 items-center gap-2">
      <CalendarIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{displayLabel}</span>
    </span>
  )
}

function DateOptionRow({ option }: { option: DateOption }) {
  if (option.type === "none") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <CalendarIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{option.label}</span>
      </span>
    )
  }

  if (option.type === "custom") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <CalendarSearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{option.label}</span>
      </span>
    )
  }

  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <CalendarIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{option.label}</span>
      </span>
      <span className="text-muted-foreground shrink-0 text-[13px] tabular-nums">
        {format(option.date, "dd/MM/yyyy")}
      </span>
    </span>
  )
}

/** The end of the working week: this Friday, or next week's once this
    one's is today or behind us. A customer's task is never due on a
    Sunday. */
function getUpcomingWeekEnd(today: Date) {
  const friday = addDays(endOfWeek(today, { weekStartsOn: 1 }), -2)
  return today >= friday ? addWeeks(friday, 1) : friday
}

function getUpcomingMonthEnd(today: Date) {
  const monthEnd = endOfMonth(today)
  return isSameDay(today, monthEnd) ? endOfMonth(addMonths(today, 1)) : monthEnd
}

function DateSelectionCombobox({
  value,
  onValueChange,
}: {
  value: DateSelectionValue
  onValueChange: (value: DateSelectionValue) => void
}) {
  const today = React.useMemo(() => startOfDay(ENTRY_REFERENCE_NOW), [])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [draftDate, setDraftDate] = React.useState<Date | undefined>(
    value?.date ?? addDays(today, 1)
  )

  const presetOptions = React.useMemo<PresetDateOption[]>(
    () => [
      {
        type: "preset",
        id: "tomorrow",
        label: "Tomorrow",
        date: addDays(today, 1),
        searchText: "Tomorrow next day due date",
      },
      {
        type: "preset",
        id: "end-of-week",
        label: "End of week",
        date: getUpcomingWeekEnd(today),
        searchText: "End of week Friday week close target",
      },
      {
        type: "preset",
        id: "in-one-week",
        label: "In one week",
        date: addWeeks(today, 1),
        searchText: "In one week next week seven days target",
      },
      {
        type: "preset",
        id: "end-of-month",
        label: "End of month",
        date: getUpcomingMonthEnd(today),
        searchText: "End of month month close month end target",
      },
      {
        type: "preset",
        id: "in-one-month",
        label: "In one month",
        date: addMonths(today, 1),
        searchText: "In one month next month thirty days target",
      },
    ],
    [today]
  )

  const dateOptions: DateOption[] = [
    noDateOption,
    ...presetOptions,
    customDateOption,
  ]

  const activePreset =
    value?.type === "preset"
      ? (presetOptions.find((option) => option.id === value.id) ?? null)
      : !value
        ? noDateOption
        : null

  React.useEffect(() => {
    if (!pickerOpen) {
      return
    }

    setDraftDate(value?.date ?? addDays(today, 1))
  }, [pickerOpen, today, value])

  function handleOptionChange(nextValue: DateOption | null) {
    if (!nextValue) {
      return
    }

    if (nextValue.type === "none") {
      onValueChange(null)
      return
    }

    if (nextValue.type === "custom") {
      requestAnimationFrame(() => setPickerOpen(true))
      return
    }

    onValueChange({
      type: "preset",
      id: nextValue.id,
      label: nextValue.label,
      date: nextValue.date,
    })
  }

  function handleConfirmCustomDate() {
    if (!draftDate) {
      return
    }

    onValueChange({
      type: "custom",
      label: format(draftDate, "MMM d"),
      date: draftDate,
    })
    setPickerOpen(false)
  }

  return (
    <>
      <Combobox
        items={dateOptions}
        value={activePreset}
        onValueChange={handleOptionChange}
        itemToStringValue={(item: DateOption) => item.searchText}
        autoHighlight
      >
        <ComboboxTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          <DateTriggerLabel value={value} placeholder="Set due date" />
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxList>
            <ComboboxItem value={noDateOption}>
              <DateOptionRow option={noDateOption} />
            </ComboboxItem>
            <ComboboxSeparator />

            {presetOptions.map((option) => (
              <ComboboxItem key={option.id} value={option}>
                <DateOptionRow option={option} />
              </ComboboxItem>
            ))}

            <ComboboxSeparator />
            <ComboboxItem value={customDateOption}>
              <DateOptionRow option={customDateOption} />
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Pick a date</DialogTitle>
          </DialogHeader>

          <div className="py-3">
            <Calendar
              mode="single"
              selected={draftDate}
              onSelect={setDraftDate}
              defaultMonth={draftDate ?? today}
              numberOfMonths={2}
              pagedNavigation
              showOutsideDays={false}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Dismiss
            </DialogClose>
            <Button
              size="sm"
              onClick={handleConfirmCustomDate}
              disabled={!draftDate}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EntryDueDateField({
  value,
  onValueChange,
}: {
  value: DateSelectionValue
  onValueChange: (value: DateSelectionValue) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Due date"
        hint="Set the intended review or follow-up date."
      />
      <DateSelectionCombobox value={value} onValueChange={onValueChange} />
    </Field>
  )
}

function RecipientRow({ person }: { person: Person }) {
  return (
    <Item size="xs" className="p-0">
      <ItemMedia>
        <Avatar className="size-5">
          <AvatarFallback className="text-[9px]">{person.initials}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="gap-1 whitespace-nowrap">
          <span>{person.name}</span>
          <span className="text-muted-foreground font-normal">
            {person.role}
          </span>
        </ItemTitle>
      </ItemContent>
    </Item>
  )
}

// dialog-12 · EntryAssigneeField, narrowed to the customer's contacts.
function RecipientField({
  contacts,
  value,
  onValueChange,
}: {
  contacts: Person[]
  value: Person
  onValueChange: (person: Person) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Send to"
        hint="The customer contact who gets the task in their app and by e-mail."
      />
      <Combobox
        items={contacts}
        value={value}
        onValueChange={(next) => {
          if (next) onValueChange(next as Person)
        }}
        itemToStringValue={(item: Person) => `${item.name} ${item.role}`}
        autoHighlight
      >
        <ComboboxTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          <ComboboxValue placeholder="Choose contact">
            {(selected: Person | null) =>
              selected ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[9px]">
                      {selected.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{selected.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground truncate">
                  Choose contact
                </span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxInput
            showTrigger={false}
            placeholder="Search contacts"
            className="mb-1"
          />
          <ComboboxEmpty>No contacts found.</ComboboxEmpty>
          <ComboboxList>
            {(item: Person) => (
              <ComboboxItem key={item.id} value={item}>
                <RecipientRow person={item} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

function ItemContext({ item }: { item: ReviewItem }) {
  return (
    <div className="bg-muted/40 border-border/60 flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-foreground truncate text-sm font-medium">
          {item.title}
        </span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="shrink-0">{formatDate(item.date)}</span>
          <DotSeparator />
          <span className="truncate">
            {item.domain === "bookkeeping" ? item.subtitle : item.basis}
          </span>
        </span>
      </div>
      <span className="text-foreground shrink-0 text-sm tabular-nums">
        {formatNok(item.amount)}
      </span>
    </div>
  )
}

/** How the task shows up in the customer's app. */
function ResponseTypePicker({
  value,
  onValueChange,
}: {
  value: ResponseType
  onValueChange: (value: ResponseType) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Customer answers with"
        hint="Decides the control the customer gets in their app."
      />
      <RadioGroup
        value={value}
        onValueChange={(next) => onValueChange(next as ResponseType)}
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {RESPONSE_TYPES.map((type) => {
          const meta = RESPONSE_TYPE_META[type]
          return (
            <label
              key={type}
              className={cn(
                "border-border hover:bg-muted/40 relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border p-2.5 transition-colors duration-150",
                "has-data-checked:border-primary has-data-checked:bg-primary/5 has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px]"
              )}
            >
              <RadioGroupItem value={type} className="sr-only" />
              <span className="text-foreground flex items-center gap-1.5 text-sm font-medium [&_svg]:size-3.5 [&_svg]:shrink-0">
                {meta.icon}
                <span className="truncate">{meta.label}</span>
              </span>
              <span className="text-muted-foreground text-xs leading-4">
                {meta.hint}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </Field>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (options: string[]) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Options"
        hint="The customer picks one. Keep them short."
      />
      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              value={option}
              aria-label={`Option ${index + 1}`}
              onChange={(event) =>
                onChange(
                  options.map((o, i) => (i === index ? event.target.value : o))
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove option ${index + 1}`}
              disabled={options.length <= 2}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        ))}
        {options.length < 5 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => onChange([...options, ""])}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Add option
          </Button>
        ) : null}
      </div>
    </Field>
  )
}

/** A faithful-enough sketch of the task in the customer's app, so the
    accountant sees what they are about to send. */
function TaskPreview({
  title,
  message,
  responseType,
  options,
  recipient,
  due,
}: {
  title: string
  message: string
  responseType: ResponseType
  options: string[]
  recipient: Person | undefined
  due: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-muted-foreground text-xs font-medium">
        What {recipient?.name.split(" ")[0] ?? "the customer"} sees
      </span>
      <Frame spacing="sm" className="w-full">
        <FramePanel className="flex min-w-0 flex-col gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              From Sanna · due {due}
            </span>
            <p className="text-foreground text-sm font-semibold text-balance break-words">
              {title || "Task title"}
            </p>
            <p className="text-muted-foreground line-clamp-4 text-xs leading-4 break-words whitespace-pre-line">
              {message || "Your message to the customer."}
            </p>
          </div>
          {responseType === "text" ? (
            <div className="border-border text-muted-foreground rounded-md border px-2.5 py-2 text-xs">
              Type your answer…
            </div>
          ) : responseType === "choice" ? (
            <div className="flex flex-col gap-1.5">
              {options.filter(Boolean).map((option) => (
                <div
                  key={option}
                  className="border-border flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                >
                  <span className="border-muted-foreground/50 size-3 shrink-0 rounded-full border" />
                  <span className="truncate">{option}</span>
                </div>
              ))}
            </div>
          ) : responseType === "file" ? (
            <div className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-md border border-dashed px-2.5 py-3 text-xs">
              <UploadIcon className="size-4" aria-hidden="true" />
              Take a photo or upload a file
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-primary text-primary-foreground rounded-md py-1.5 text-center text-xs font-medium">
                Yes
              </div>
              <div className="border-border rounded-md border py-1.5 text-center text-xs font-medium">
                No
              </div>
            </div>
          )}
        </FramePanel>
      </Frame>
    </div>
  )
}

type Draft = { title: string; message: string }

type TaskArea = "bookkeeping" | "payroll" | "general"

/** Which part of the job a manual task belongs to, so it lands under the
    right tab on Tasks & requests. */
const TASK_AREAS: { value: TaskArea; label: string }[] = [
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "payroll", label: "Payroll" },
  { value: "general", label: "General" },
]

const EMPTY_DRAFT: Draft = { title: "", message: "" }

function ComposerForm({
  item,
  presetClientId,
  onDone,
}: {
  /** Asking about a line. Absent for a manual task. */
  item?: ReviewItem
  presetClientId?: string | null
  onDone: () => void
}) {
  const { state, dispatch } = useAccounting()
  const manual = !item
  const [clientId, setClientId] = React.useState<string>(
    item?.clientId ?? presetClientId ?? scopedClients(state.scope)[0].id
  )
  const client = CLIENT_BY_ID.get(clientId)!
  const existing = item?.requestId
    ? state.requests.find((r) => r.id === item.requestId)
    : undefined
  const askingAgain =
    existing?.status === "sent" || existing?.status === "replied"
  // An agent draft already waiting on this line wins over a fresh one.
  const agentDraft = item
    ? existing?.status === "draft"
      ? existing
      : draftRequest(item, client)
    : undefined

  const [kind, setKind] = React.useState<RequestKind>(
    agentDraft?.kind ?? "custom"
  )
  const [area, setArea] = React.useState<TaskArea>("general")
  // One draft per tab so switching kinds never loses what was typed.
  const [drafts, setDrafts] = React.useState<Record<RequestKind, Draft>>(() => {
    const base = Object.fromEntries(
      [...REQUEST_KINDS, "custom"].map((k) => [k, EMPTY_DRAFT])
    ) as Record<RequestKind, Draft>
    if (agentDraft) {
      base[agentDraft.kind] = askingAgain
        ? { title: agentDraft.title, message: "Thanks for your reply! One more thing: " }
        : { title: agentDraft.title, message: agentDraft.message }
    }
    // A manual task opened from somewhere that knows what to ask.
    if (manual && state.taskComposer?.draft) base.custom = state.taskComposer.draft
    return base
  })
  const [responseType, setResponseType] = React.useState<ResponseType>(
    agentDraft?.responseType ?? "text"
  )
  const [options, setOptions] = React.useState<string[]>(
    agentDraft?.options ?? DEFAULT_OPTIONS
  )
  const [recipient, setRecipient] = React.useState<Person>(
    client.contacts.find((c) => c.id === existing?.recipientId) ??
      client.contacts[0]
  )
  const [dueDate, setDueDate] = React.useState<DateSelectionValue>(() => {
    const today = startOfDay(ENTRY_REFERENCE_NOW)
    return {
      type: "preset",
      id: "end-of-week",
      label: "End of week",
      date: getUpcomingWeekEnd(today),
    }
  })
  const [priority, setPriority] = React.useState(
    ENTRY_PRIORITY_OPTIONS.find((o) => o.value === existing?.priority) ??
      ENTRY_PRIORITY_OPTIONS[item?.domain === "payroll" ? 2 : 1]
  )

  const draft = drafts[kind]
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
  const canSend =
    draft.title.trim().length > 0 &&
    draft.message.trim().length > 0 &&
    (responseType !== "choice" || cleanOptions.length >= 2)
  const isAgentDraft =
    Boolean(agentDraft) &&
    kind === agentDraft?.kind &&
    !askingAgain &&
    draft.message === agentDraft?.message
  const dueLabel = dueDate ? format(dueDate.date, "EEE d MMM") : "No due date"

  function send() {
    if (!canSend) return
    const request = {
      kind,
      title: draft.title.trim(),
      message: draft.message.trim(),
      recipientId: recipient.id,
      due: dueLabel,
      priority: priority.value,
      responseType,
      options: responseType === "choice" ? cleanOptions : undefined,
    }
    if (item) {
      dispatch({ type: "ask", itemId: item.id, request })
    } else {
      dispatch({ type: "add_task", clientId, request, domain: area })
    }
    toast.success(`Sent to ${recipient.name}`, {
      description: `${client.name} sees it as a task in their app. When they answer, it comes back to you.`,
    })
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {manual
            ? "New task for a customer"
            : askingAgain
              ? `Ask ${client.name} again`
              : existing?.status === "draft"
                ? `Send the agent's question to ${client.name}`
                : `Ask ${client.name}`}
        </DialogTitle>
        <DialogDescription>
          {manual
            ? "Anything you need from the customer that isn't tied to a line: a document, a confirmation, an answer."
            : "The customer gets this as a task. Their answer comes back to this line, and the agent re-reads it before you book."}
        </DialogDescription>
      </DialogHeader>

      <form
        id="ask-customer-form"
        className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_16rem]"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {item ? (
            <ItemContext item={item} />
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Field className="gap-2">
                <FieldLabelHint label="Customer" hint="Who the task is for." />
                <Select
                  value={clientId}
                  items={scopedClients("all").map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  onValueChange={(value) => {
                    if (!value) return
                    setClientId(value)
                    setRecipient(CLIENT_BY_ID.get(value)!.contacts[0])
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Customer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {scopedClients(state.scope).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="gap-2">
                <FieldLabelHint
                  label="Area"
                  hint="Where the task sits on Tasks & requests, next to the work it belongs to."
                />
                <Tabs value={area} onValueChange={(value) => setArea(value as TaskArea)}>
                  <TabsList className="w-full">
                    {TASK_AREAS.map((a) => (
                      <TabsTrigger key={a.value} value={a.value} className="px-2.5 text-xs">
                        {a.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </Field>
            </div>
          )}

          {item ? (
            <Tabs
              value={kind}
              onValueChange={(value) => setKind(value as RequestKind)}
            >
              <TabsList className="w-full">
                {REQUEST_KINDS.map((k) => (
                  <TabsTrigger key={k} value={k} className="min-w-0 px-1.5 text-xs">
                    <span className="truncate">{REQUEST_KIND_META[k].label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          <FieldGroup className="gap-4">
            <Field className="gap-2">
              <FieldLabelHint
                htmlFor="ask-title"
                label="Title"
                hint="Shown as the task title in the customer's app."
              />
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText className="text-muted-foreground [&_svg]:size-4">
                    {REQUEST_KIND_META[kind].icon}
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="ask-title"
                  value={draft.title}
                  placeholder="What do you need from the customer?"
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [kind]: { ...current[kind], title: event.target.value },
                    }))
                  }
                />
              </InputGroup>
            </Field>

            <Field className="gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabelHint
                  htmlFor="ask-message"
                  label="Message"
                  hint="Plain language. The customer doesn't need to know account numbers."
                />
                {isAgentDraft ? (
                  <Badge variant="primary-light" size="sm" className="gap-1">
                    <SparklesIcon className="size-3" aria-hidden="true" />
                    Drafted by agent
                  </Badge>
                ) : null}
              </div>
              <Textarea
                id="ask-message"
                value={draft.message}
                placeholder="Write your question..."
                className="min-h-24 resize-none"
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [kind]: { ...current[kind], message: event.target.value },
                  }))
                }
              />
            </Field>
          </FieldGroup>

          <ResponseTypePicker value={responseType} onValueChange={setResponseType} />
          {responseType === "choice" ? (
            <OptionsEditor options={options} onChange={setOptions} />
          ) : null}

          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <RecipientField
              contacts={client.contacts}
              value={recipient}
              onValueChange={setRecipient}
            />
            <EntryDueDateField value={dueDate} onValueChange={setDueDate} />
            <EntryPriorityField value={priority} onValueChange={setPriority} />
          </div>
        </div>

        <div className="min-w-0 md:border-l md:pl-5">
          <TaskPreview
            title={draft.title}
            message={draft.message}
            responseType={responseType}
            options={options}
            recipient={recipient}
            due={dueLabel}
          />
        </div>
      </form>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" form="ask-customer-form" disabled={!canSend}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send to customer
        </Button>
      </DialogFooter>
    </>
  )
}

export function AskCustomerDialog() {
  const { state, dispatch } = useAccounting()
  const item = state.items.find((i) => i.id === state.askItemId)
  const composer = state.taskComposer
  const open = Boolean(item || composer)
  const close = () =>
    item
      ? dispatch({ type: "open_ask", id: null })
      : dispatch({ type: "close_task_composer" })

  return (
    <TooltipProvider delay={150}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl">
          {item ? (
            <ComposerForm key={item.id} item={item} onDone={close} />
          ) : composer ? (
            <ComposerForm
              key={composer.clientId ?? "new"}
              presetClientId={composer.clientId}
              onDone={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
