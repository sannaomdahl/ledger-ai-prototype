"use client"

import * as React from "react"
import type { ReactNode } from "react"
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

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
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
import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ENTRY_ASSIGNEE_MEMBERS,
  ENTRY_ASSIGNEE_OPTIONS,
  ENTRY_INITIAL_DRAFTS,
  ENTRY_INVITE_ASSIGNEE_OPTION,
  ENTRY_LABEL_OPTIONS,
  ENTRY_LABEL_SELECTION_OPTIONS,
  ENTRY_NO_ASSIGNEE_OPTION,
  ENTRY_NO_LABEL_OPTION,
  ENTRY_PRIORITY_OPTIONS,
  ENTRY_STATUS_OPTIONS,
  ENTRY_TABS,
  type EntryAssigneeOption,
  type EntryAssigneeSelectionItem,
  type EntryDraftRecord,
  type EntryLabelOption,
  type EntryLabelSelectionItem,
  type EntryPriorityOption,
  type EntryStatusOption,
  type EntryTabId,
  type InviteAssigneeOption,
  type NoAssigneeOption,
} from "./data"
import { InfoIcon, CircleDotIcon, CircleIcon, PauseCircleIcon, CircleCheckIcon, CircleXIcon, MoreHorizontalIcon, TriangleAlertIcon, UserIcon, SendIcon, TagIcon, CalendarIcon, CalendarSearchIcon, AlertCircleIcon, PlusIcon } from "lucide-react"

// Fixed reference "now" so the date picker presets render deterministically.
const ENTRY_REFERENCE_NOW = new Date("2026-06-30T09:00:00")

type EntryToastKind = "success" | "error"

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

function EntryStatusGlyph({
  tone,
  className,
}: {
  tone: EntryStatusOption["tone"]
  className?: string
}) {
  switch (tone) {
    case "backlog":
      return (
        <CircleDotIcon className={cn(
                      "text-muted-foreground/70! **:text-muted-foreground/70! size-4 shrink-0",
                      className
                    )} aria-hidden="true" />
      )
    case "planned":
      return (
        <CircleIcon className={cn(
                      "text-foreground/70! [&_*]:text-foreground/70! size-4 shrink-0",
                      className
                    )} aria-hidden="true" />
      )
    case "inProgress":
      return (
        <CircleDotIcon className={cn(
                      "size-4 shrink-0 text-sky-500! [&_*]:text-sky-500!",
                      className
                    )} aria-hidden="true" />
      )
    case "paused":
      return (
        <PauseCircleIcon className={cn(
                      "size-4 shrink-0 text-amber-500! [&_*]:text-amber-500!",
                      className
                    )} aria-hidden="true" />
      )
    case "completed":
      return (
        <CircleCheckIcon className={cn(
                      "size-4 shrink-0 text-emerald-500! [&_*]:text-emerald-500!",
                      className
                    )} aria-hidden="true" />
      )
    case "cancelled":
      return (
        <CircleXIcon className={cn(
                      "text-muted-foreground! [&_*]:text-muted-foreground! size-4 shrink-0",
                      className
                    )} aria-hidden="true" />
      )
  }
}

function EntryStatusLabel({ status }: { status: EntryStatusOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <EntryStatusGlyph tone={status.tone} />
      <span className="truncate">{status.label}</span>
    </span>
  )
}

function EntryStatusField({
  value,
  onValueChange,
}: {
  value: EntryStatusOption
  onValueChange: (option: EntryStatusOption) => void
}) {
  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Status"
        hint="Use the status that best matches the entry's current movement."
      />
      <Combobox
        items={ENTRY_STATUS_OPTIONS}
        value={value}
        onValueChange={(nextStatus) => {
          if (nextStatus) {
            onValueChange(nextStatus as EntryStatusOption)
          }
        }}
        itemToStringValue={(item: EntryStatusOption) => item.label}
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
          <ComboboxValue placeholder="Set status">
            {(selectedStatus: EntryStatusOption | null) =>
              selectedStatus ? (
                <EntryStatusLabel status={selectedStatus} />
              ) : (
                <span className="text-muted-foreground truncate">
                  Set status
                </span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxInput
            showTrigger={false}
            placeholder="Change status"
            className="mb-1"
          />
          <ComboboxEmpty>No statuses found.</ComboboxEmpty>
          <ComboboxList>
            {(item: EntryStatusOption) => (
              <ComboboxItem key={item.value} value={item}>
                <EntryStatusLabel status={item} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
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
                      "size-4 shrink-0 text-yellow-500! [&_*]:text-yellow-500!",
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
    priority.tone === "urgent" ? "text-yellow-500!" : "text-foreground!"

  return (
    <span
      className={cn(
        "text-foreground! flex min-w-0 items-center gap-2",
        priority.tone === "urgent" && "text-yellow-500!",
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

function UserGlyph({ className }: { className?: string }) {
  return (
    <UserIcon className={cn("size-4 shrink-0", className)} />
  )
}

function PaperPlaneIcon({ className }: { className?: string }) {
  return (
    <SendIcon className={cn("size-4 shrink-0", className)} />
  )
}

function AssigneeTriggerLabel({
  option,
  placeholder,
}: {
  option: NoAssigneeOption | EntryAssigneeOption | null
  placeholder: string
}) {
  if (!option) {
    return <span className="text-muted-foreground truncate">{placeholder}</span>
  }

  if (option.type === "none") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <UserGlyph className="text-muted-foreground" />
        <span className="truncate">{option.label}</span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-5">
        <AvatarImage src={option.avatar} alt={option.label} />
        <AvatarFallback className="text-[9px]">
          {option.initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{option.label}</span>
    </span>
  )
}

function AssigneeListRow({
  option,
}: {
  option: NoAssigneeOption | EntryAssigneeOption | InviteAssigneeOption
}) {
  if (option.type === "none") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <UserGlyph className="text-muted-foreground" />
        <span className="truncate">{option.label}</span>
      </span>
    )
  }

  if (option.type === "invite") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <PaperPlaneIcon className="text-muted-foreground" />
        <span className="truncate">{option.label}</span>
      </span>
    )
  }

  return (
    <Item size="xs" className="p-0">
      <ItemMedia>
        <Avatar className="size-5">
          <AvatarImage src={option.avatar} alt={option.label} />
          <AvatarFallback className="text-[9px]">
            {option.initials}
          </AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="gap-1 whitespace-nowrap">
          <span>{option.label}</span>
          {option.isCurrentUser ? (
            <span className="text-muted-foreground font-normal">(You)</span>
          ) : null}
        </ItemTitle>
      </ItemContent>
    </Item>
  )
}

function EntryAssigneeField({
  value,
  onValueChange,
}: {
  value: EntryAssigneeOption | null
  onValueChange: (option: EntryAssigneeOption | null) => void
}) {
  const selectedAssignee = value ?? ENTRY_NO_ASSIGNEE_OPTION

  function handleAssigneeChange(
    nextAssignee: EntryAssigneeSelectionItem | null
  ) {
    if (!nextAssignee || nextAssignee.type === "invite") {
      return
    }

    onValueChange(nextAssignee.type === "member" ? nextAssignee : null)
  }

  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Assignee"
        hint="Select the person accountable for the first follow-up."
      />
      <Combobox
        items={ENTRY_ASSIGNEE_OPTIONS}
        value={selectedAssignee}
        onValueChange={handleAssigneeChange}
        itemToStringValue={(item: EntryAssigneeSelectionItem) =>
          item.searchText
        }
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
          <ComboboxValue placeholder="No assignee">
            {(
              selectedAssignee: NoAssigneeOption | EntryAssigneeOption | null
            ) => (
              <AssigneeTriggerLabel
                option={selectedAssignee}
                placeholder="No assignee"
              />
            )}
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxInput
            showTrigger={false}
            placeholder="Select assignee"
            className="mb-1"
          />
          <ComboboxEmpty>No assignees found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxItem value={ENTRY_NO_ASSIGNEE_OPTION}>
              <AssigneeListRow option={ENTRY_NO_ASSIGNEE_OPTION} />
            </ComboboxItem>
            <ComboboxSeparator />

            <ComboboxGroup items={ENTRY_ASSIGNEE_MEMBERS}>
              <ComboboxLabel>Team members</ComboboxLabel>
              <ComboboxCollection>
                {(member: EntryAssigneeOption) => (
                  <ComboboxItem key={member.id} value={member}>
                    <AssigneeListRow option={member} />
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>

            <ComboboxSeparator />

            <ComboboxGroup items={[ENTRY_INVITE_ASSIGNEE_OPTION]}>
              <ComboboxLabel>New user</ComboboxLabel>
              <ComboboxCollection>
                {(item: InviteAssigneeOption) => (
                  <ComboboxItem
                    key={item.id}
                    value={item}
                    className="[&>span[aria-hidden=true]]:hidden"
                  >
                    <AssigneeListRow option={item} />
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

function LabelDot({ option }: { option: EntryLabelOption }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-3 shrink-0 rounded-full", option.colorClassName)}
    />
  )
}

function LabelTriggerSummary({
  selectedLabels,
  placeholder,
}: {
  selectedLabels: EntryLabelOption[]
  placeholder: string
}) {
  if (!selectedLabels.length) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <TagIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground truncate">{placeholder}</span>
      </span>
    )
  }

  const visibleLabels = selectedLabels.slice(0, 3)
  const hiddenLabelCount = selectedLabels.length - visibleLabels.length
  const selectedLabelText = selectedLabels
    .map((label) => label.label)
    .join(", ")

  if (selectedLabels.length === 1) {
    const [label] = selectedLabels

    return (
      <span className="flex min-w-0 items-center gap-2">
        <LabelDot option={label} />
        <span className="truncate">{label.label}</span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="sr-only">Selected labels: {selectedLabelText}</span>
      {visibleLabels.map((label) => (
        <LabelDot key={label.id} option={label} />
      ))}
      {hiddenLabelCount > 0 ? (
        <span className="text-muted-foreground ml-0.5 text-xs tabular-nums">
          +{hiddenLabelCount}
        </span>
      ) : null}
    </span>
  )
}

function LabelOptionRow({ option }: { option: EntryLabelSelectionItem }) {
  if (option.type === "none") {
    return <span className="truncate">{option.label}</span>
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <LabelDot option={option} />
      <span className="truncate">{option.label}</span>
    </span>
  )
}

function isLabelSelectionItemEqual(
  item: EntryLabelSelectionItem,
  value: EntryLabelSelectionItem
) {
  return item.id === value.id
}

function isLabelSelected(
  labels: readonly EntryLabelOption[],
  item: EntryLabelOption
) {
  return labels.some((label) => label.id === item.id)
}

function EntryLabelsField({
  value,
  onValueChange,
}: {
  value: EntryLabelOption[]
  onValueChange: (labels: EntryLabelOption[]) => void
}) {
  function handleLabelsChange(nextItems: EntryLabelSelectionItem[]) {
    if (nextItems.some((item) => item.type === "none")) {
      onValueChange([])
      return
    }

    onValueChange(
      nextItems.filter(
        (item): item is EntryLabelOption => item.type === "label"
      )
    )
  }

  return (
    <Field className="gap-2">
      <FieldLabelHint
        label="Labels"
        hint="Tag the record with the workstream it should join."
      />
      <Combobox
        multiple
        items={ENTRY_LABEL_SELECTION_OPTIONS}
        value={value}
        onValueChange={handleLabelsChange}
        itemToStringValue={(item: EntryLabelSelectionItem) => item.searchText}
        isItemEqualToValue={isLabelSelectionItemEqual}
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
          <ComboboxValue placeholder="Add label">
            {(selectedLabels: EntryLabelOption[]) => (
              <LabelTriggerSummary
                selectedLabels={selectedLabels ?? []}
                placeholder="Add label"
              />
            )}
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className="max-w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxInput
            showTrigger={false}
            placeholder="Select labels"
            className="mb-1"
          />
          <ComboboxEmpty>No labels found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxItem
              value={ENTRY_NO_LABEL_OPTION}
              className="pr-3 pl-8 [&>span[aria-hidden=true]]:hidden"
            >
              <Checkbox
                aria-hidden="true"
                tabIndex={-1}
                checked={value.length === 0}
                className="[&_[data-slot=checkbox-indicator]]:text-primary-foreground! [&_[data-slot=checkbox-indicator]_*]:text-primary-foreground! pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
              />
              <LabelOptionRow option={ENTRY_NO_LABEL_OPTION} />
            </ComboboxItem>
            <ComboboxSeparator />

            {ENTRY_LABEL_OPTIONS.map((item) => (
              <ComboboxItem
                key={item.id}
                value={item}
                className="pr-3 pl-8 [&>span[aria-hidden=true]]:hidden"
              >
                <Checkbox
                  aria-hidden="true"
                  tabIndex={-1}
                  checked={isLabelSelected(value, item)}
                  className="[&_[data-slot=checkbox-indicator]]:text-primary-foreground! [&_[data-slot=checkbox-indicator]_*]:text-primary-foreground! pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
                />
                <LabelOptionRow option={item} />
              </ComboboxItem>
            ))}
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

function getUpcomingWeekEnd(today: Date) {
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  return isSameDay(today, weekEnd) ? addWeeks(weekEnd, 1) : weekEnd
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
        searchText: "End of week Sunday week close target",
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

function updateDraftRecord(
  drafts: Record<EntryTabId, EntryDraftRecord>,
  tabId: EntryTabId,
  patch: Partial<EntryDraftRecord>
) {
  return {
    ...drafts,
    [tabId]: {
      ...drafts[tabId],
      ...patch,
    },
  }
}

function getToastIcon(kind: EntryToastKind) {
  if (kind === "error") {
    return (
      <AlertCircleIcon className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
    )
  }

  return (
    <CircleCheckIcon className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
  )
}

function ToastTitle({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <span className="flex items-start gap-2">
      {icon}
      <span className="min-w-0">{children}</span>
    </span>
  )
}

function ToastDescription({ children }: { children: string }) {
  return (
    <span className="grid grid-cols-[1rem_1fr] gap-2">
      <span aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

function showEntryToast(
  title: string,
  description: string,
  kind: EntryToastKind = "success"
) {
  const toastTitle = <ToastTitle icon={getToastIcon(kind)}>{title}</ToastTitle>
  const options = {
    description: <ToastDescription>{description}</ToastDescription>,
    icon: null,
  }

  if (kind === "error") {
    toast.error(toastTitle, options)
    return
  }

  toast.success(toastTitle, options)
}

export function TabbedEntryDialog() {
  const [open, setOpen] = React.useState(true)
  const [activeTabId, setActiveTabId] = React.useState<EntryTabId>("action")
  const [drafts, setDrafts] =
    React.useState<Record<EntryTabId, EntryDraftRecord>>(ENTRY_INITIAL_DRAFTS)
  const [status, setStatus] = React.useState(ENTRY_STATUS_OPTIONS[1])
  const [assignee, setAssignee] = React.useState<EntryAssigneeOption | null>(
    ENTRY_ASSIGNEE_MEMBERS[0]
  )
  const [dueDate, setDueDate] = React.useState<DateSelectionValue>(() => {
    const today = startOfDay(ENTRY_REFERENCE_NOW)

    return {
      type: "preset",
      id: "tomorrow",
      label: "Tomorrow",
      date: addDays(today, 1),
    }
  })
  const [priority, setPriority] = React.useState(ENTRY_PRIORITY_OPTIONS[2])
  const [labels, setLabels] = React.useState<EntryLabelOption[]>(
    ENTRY_LABEL_OPTIONS.slice(0, 2)
  )

  const activeTab =
    ENTRY_TABS.find((tab) => tab.id === activeTabId) ?? ENTRY_TABS[0]
  const activeDraft = drafts[activeTab.id]
  const canCreate = activeDraft.title.trim().length > 0

  function handleCreate() {
    if (!canCreate) {
      showEntryToast(
        "Add a title first",
        "Each entry needs a clear title before it can be created.",
        "error"
      )
      return
    }

    showEntryToast(
      `${activeTab.label} created`,
      `${activeDraft.title} was queued with ${status.label.toLowerCase()} status.`
    )
    setOpen(false)
  }

  return (
    <TooltipProvider delay={150}>
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex min-h-[360px] items-center justify-center">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setOpen(true)}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Open entry composer
          </Button>
        </div>

        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create entry</DialogTitle>
            <DialogDescription>
              Create and assign a quick record.
            </DialogDescription>
          </DialogHeader>

          <form
            id="dialog-12-entry-form"
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              handleCreate()
            }}
          >
            <Tabs
              value={activeTabId}
              onValueChange={(value) => setActiveTabId(value as EntryTabId)}
              className="gap-5"
            >
              <TabsList>
                {ENTRY_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {ENTRY_TABS.map((tab) => {
                const draft = drafts[tab.id]

                return (
                  <TabsContent key={tab.id} value={tab.id}>
                    <div className="flex flex-col gap-5">
                      <FieldGroup className="gap-4">
                        <Field className="gap-2">
                          <FieldLabelHint
                            htmlFor={`entry-${tab.id}-title`}
                            label="Title"
                            hint="Use a short outcome-oriented title."
                          />
                          <InputGroup>
                            <InputGroupAddon>
                              <InputGroupText className="text-muted-foreground [&_svg]:size-4">
                                {tab.icon}
                              </InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              id={`entry-${tab.id}-title`}
                              value={draft.title}
                              placeholder={tab.titlePlaceholder}
                              onChange={(event) =>
                                setDrafts((currentDrafts) =>
                                  updateDraftRecord(currentDrafts, tab.id, {
                                    title: event.target.value,
                                  })
                                )
                              }
                            />
                          </InputGroup>
                        </Field>

                        <Field className="gap-2">
                          <FieldLabelHint
                            htmlFor={`entry-${tab.id}-note`}
                            label="Notes"
                            hint="Add only the context the next owner needs."
                          />
                          <Textarea
                            id={`entry-${tab.id}-note`}
                            value={draft.note}
                            placeholder={tab.notePlaceholder}
                            className="min-h-24 resize-none"
                            onChange={(event) =>
                              setDrafts((currentDrafts) =>
                                updateDraftRecord(currentDrafts, tab.id, {
                                  note: event.target.value,
                                })
                              )
                            }
                          />
                        </Field>
                      </FieldGroup>

                      <div className="grid gap-3 min-[360px]:grid-cols-2">
                        <EntryStatusField
                          value={status}
                          onValueChange={setStatus}
                        />
                        <EntryAssigneeField
                          value={assignee}
                          onValueChange={setAssignee}
                        />
                        <EntryDueDateField
                          value={dueDate}
                          onValueChange={setDueDate}
                        />
                        <EntryPriorityField
                          value={priority}
                          onValueChange={setPriority}
                        />
                        <EntryLabelsField
                          value={labels}
                          onValueChange={setLabels}
                        />
                      </div>
                    </div>
                  </TabsContent>
                )
              })}
            </Tabs>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                form="dialog-12-entry-form"
                disabled={!canCreate}
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                {activeTab.primaryActionLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}