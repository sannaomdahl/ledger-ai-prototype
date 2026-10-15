"use client"

// Starting an onboarding after the first meeting: find the company in the
// register (name or org. no.), pick who is responsible, and write down what
// was said. The register check runs at once; SAF-T files can come with it or
// follow on the assessment.
import { useState } from "react"
import { AlertCircleIcon, BuildingIcon, FileTextIcon, PlusIcon, UploadIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatBytes, useFileUpload } from "@/hooks/use-file-upload"
import { ACCOUNTANTS, CURRENT_USER } from "@/lib/accounting/data"
import {
  overallLight,
  REGISTER,
  registerChecks,
  type RegisterCompany,
} from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { LightDot } from "./meta"

export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <NewCustomerForm onDone={() => onOpenChange(false)} onCreated={onCreated} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function NewCustomerForm({
  onDone,
  onCreated,
}: {
  onDone: () => void
  onCreated: (id: string) => void
}) {
  const { state, dispatch } = useAccounting()
  const taken = new Set(state.onboarding.map((c) => c.id))
  const available = REGISTER.filter((c) => !taken.has(c.id))
  const [picked, setPicked] = useState<RegisterCompany | null>(null)
  const [accountantId, setAccountantId] = useState(CURRENT_USER.id)
  const [note, setNote] = useState("")
  const [{ files, errors, isDragging }, upload] = useFileUpload({ accept: ".xml,.zip", multiple: true, maxFiles: 6 })

  function submit() {
    if (!picked) return
    const saftFiles = files.map((f) => f.file.name)
    dispatch({
      type: "onboarding",
      action: { type: "create", id: picked.id, accountantId, meetingNote: note.trim(), saftFiles },
    })
    toast.success(`${picked.name} added`, {
      description: saftFiles.length
        ? "The register check is done and the agent is reading the books."
        : "The register check is done. Add SAF-T files to finish the assessment.",
    })
    onDone()
    onCreated(picked.id)
  }

  const light = picked ? overallLight(registerChecks(picked).map((r) => r.light)) : undefined

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>New customer</DialogTitle>
        <DialogDescription className="text-pretty">
          Starts an onboarding. The company isn&apos;t a customer until they sign the offer.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="new-company">Company</FieldLabel>
        <Combobox
          items={available}
          value={picked}
          onValueChange={(next) => setPicked(next as RegisterCompany | null)}
          itemToStringLabel={(c: RegisterCompany) => c.name}
          itemToStringValue={(c: RegisterCompany) => c.id}
          filter={(c: RegisterCompany, query: string) => {
            const q = query.toLowerCase().replaceAll(" ", "")
            return (
              c.name.toLowerCase().replaceAll(" ", "").includes(q) ||
              c.orgNo.replaceAll(" ", "").includes(q)
            )
          }}
          autoHighlight
        >
          <ComboboxInput
            id="new-company"
            placeholder="Name or org. number"
            showTrigger={false}
            showClear={Boolean(picked)}
          />
          <ComboboxContent>
            <ComboboxEmpty>No company by that name in the register.</ComboboxEmpty>
            <ComboboxList>
              {(c: RegisterCompany) => (
                <ComboboxItem key={c.id} value={c}>
                  <BuildingIcon className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{c.orgNo}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {picked && light ? (
          <FieldDescription className="flex items-center gap-1.5">
            <LightDot light={light} />
            {picked.legalForm} · {picked.industry} · {picked.employees} employees · {picked.city}
            {light === "red" ? " · fails the register check" : light === "yellow" ? " · needs a closer look" : ""}
          </FieldDescription>
        ) : (
          <FieldDescription>Searched in the Brønnøysund register.</FieldDescription>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="new-accountant">Responsible accountant</FieldLabel>
        <Select
          value={accountantId}
          items={ACCOUNTANTS.map((a) => ({ value: a.id, label: a.name }))}
          onValueChange={(value) => value && setAccountantId(value)}
        >
          <SelectTrigger id="new-accountant" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ACCOUNTANTS.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="new-note">From the meeting</FieldLabel>
        <Textarea
          id="new-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why they want to switch, what they expect, anything the agents should know."
          className="min-h-20 resize-none"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="new-saft">
          SAF-T files <span className="text-muted-foreground font-normal">· optional</span>
        </FieldLabel>
        {files.length ? (
          <ul className="flex flex-col gap-1.5">
            {files.map((f) => (
              <li key={f.id}>
                <Attachment size="sm" className="w-full">
                  <AttachmentMedia>
                    <FileTextIcon aria-hidden="true" />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{f.file.name}</AttachmentTitle>
                    <AttachmentDescription>{formatBytes(f.file.size, 1)}</AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      type="button"
                      aria-label={`Remove ${f.file.name}`}
                      onClick={() => upload.removeFile(f.id)}
                    >
                      <XIcon aria-hidden="true" />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={upload.openFileDialog}
          onDragEnter={upload.handleDragEnter}
          onDragLeave={upload.handleDragLeave}
          onDragOver={upload.handleDragOver}
          onDrop={upload.handleDrop}
          data-dragging={isDragging || undefined}
          className="border-border hover:bg-muted/40 data-dragging:border-primary data-dragging:bg-primary/5 focus-visible:ring-ring/50 flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-[3px]"
        >
          <UploadIcon className="text-muted-foreground size-4" aria-hidden="true" />
          <span className="font-medium">{files.length ? "Add more" : "Upload SAF-T"}</span>
          <span className="text-muted-foreground text-xs">or drop XML or ZIP here</span>
        </button>
        <input {...upload.getInputProps({ id: "new-saft" })} className="sr-only" tabIndex={-1} />
        {errors.length ? (
          <p className="text-destructive flex items-center gap-1.5 text-xs">
            <AlertCircleIcon className="size-3.5" aria-hidden="true" />
            {errors[0]}
          </p>
        ) : (
          <FieldDescription>Last year and this year so far. They can also come later, on the assessment.</FieldDescription>
        )}
      </Field>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!picked}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          Add customer
        </Button>
      </DialogFooter>
    </form>
  )
}
