"use client"

// Adding an invoice by hand: the customer forgot to send it and mails it
// now. The file, the supplier, the dates and the amount make a bookkeeping
// line like any other, with the agent's suggestion from how the supplier
// was booked before. The invoice date decides the month: if that month is
// closed, the choice is made right here, to book it in the month you're in
// or to reopen its own month, with the firm's habit preselected.
import { useMemo, useState } from "react"
import { cn } from "cn"
import { AlertCircleIcon, FileTextIcon, PlusIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatBytes, useFileUpload } from "@/hooks/use-file-upload"
import { addDays, CLIENT_BY_ID, MONTHS, monthLabel, nextMonth } from "@/lib/accounting/data"
import { TODAY } from "@/lib/accounting/deadlines"
import { getClientFilings, vatFilingId } from "@/lib/accounting/filings"
import { formatAmount } from "@/lib/accounting/format"
import {
  manualInvoiceId,
  monthStatus,
  suggestForSupplier,
} from "@/lib/accounting/periods"
import { useAccounting } from "@/lib/accounting/store"
import { formatPercent } from "@/components/accounting/meta"
import { bookHereHint, LIMIT_NOTE, recommendReopen, reopenHint } from "./late-invoice"
import { monthWord } from "./reopen-month-dialog"

export function AddInvoiceDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {open ? <AddInvoiceForm clientId={clientId} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** "12 500", "12500,50" or "12.500" as kroner. */
function parseAmount(text: string) {
  const clean = text.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")
  const value = Number(clean)
  return Number.isFinite(value) && value > 0 ? value : 0
}

type Choice = "here" | "reopen"

function AddInvoiceForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const { state, dispatch } = useAccounting()
  const client = CLIENT_BY_ID.get(clientId)!
  const first = client.contacts[0]?.name.split(" ")[0] ?? "The customer"
  // The month in view: open or reopened, or the dialog isn't offered.
  const here = state.month
  const [{ files, errors, isDragging }, upload] = useFileUpload({
    accept: ".pdf,.jpg,.jpeg,.png,.xml",
    maxSize: 10 * 1024 * 1024,
  })
  const [supplier, setSupplier] = useState("")
  const [date, setDate] = useState("")
  const [due, setDue] = useState("")
  const [dueTouched, setDueTouched] = useState(false)
  const [amountText, setAmountText] = useState("")
  const [picked, setPicked] = useState<Choice | null>(null)

  const amount = parseAmount(amountText)
  const file = files[0]?.file
  const suppliers = useMemo(
    () =>
      [...new Set(
        state.items
          .filter((i) => i.clientId === clientId && i.kind === "invoice")
          .map((i) => i.title)
      )].sort((a, b) => a.localeCompare(b, "nb")),
    [state.items, clientId]
  )
  const guess = supplier.trim() ? suggestForSupplier(clientId, supplier, state.items) : undefined

  // Where the invoice date puts it.
  const dated = date.slice(0, 7)
  const status = dated ? monthStatus(clientId, dated, state) : undefined
  const oldest = MONTHS.at(-1)!.id
  const latest = nextMonth(MONTHS[0].id)
  const closedBefore = Boolean(dated && dated < here && (status === "closed" || status === "before"))
  // Reopening needs the month's books here: not one before the data starts
  // or before we took the client over.
  const canReopen = closedBefore && status === "closed" && dated >= oldest
  const recommended: Choice = canReopen && recommendReopen(amount) ? "reopen" : "here"
  const choice: Choice = canReopen ? (picked ?? recommended) : "here"
  const period = closedBefore
    ? choice === "reopen"
      ? dated
      : here
    : dated && dated > here
      ? dated <= latest
        ? dated
        : here
      : dated || here

  const filing = canReopen
    ? getClientFilings(client, state.items, state).find((f) => f.id === vatFilingId(client, dated))
    : undefined
  const filed = filing?.status === "submitted" || Boolean(filing?.correction)
  const term = (month: string) => vatFilingId(client, month).match(/T\d$/)?.[0] ?? month.slice(0, 4)

  const valid = supplier.trim() && date && due && due >= date && amount > 0

  function submit() {
    if (!valid) return
    const id = manualInvoiceId(state.items, clientId)
    const reopen = closedBefore && choice === "reopen"
    dispatch({
      type: "periods",
      action: {
        type: "add_invoice",
        invoice: {
          clientId,
          supplier: supplier.trim(),
          date,
          dueDate: due,
          amount,
          fileName: file?.name,
          period,
          reopen: reopen ? `Forgotten invoice from ${guess?.title ?? supplier.trim()}` : undefined,
        },
      },
    })
    // Show it where it went, open in the panel.
    if (period !== here) dispatch({ type: "set_month", month: period })
    dispatch({ type: "open_item", id, nav: [id] })
    toast.success(
      reopen ? `${monthWord(period)} reopened, invoice added` : `Invoice added to ${monthWord(period)}`,
      {
        description: reopen
          ? `It waits in ${monthWord(period)}'s Bookkeeping with the agent's suggestion. Close ${monthWord(period)} again to send the updated report.`
          : "It waits in Bookkeeping with the agent's suggestion.",
      }
    )
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Add an invoice</DialogTitle>
        <DialogDescription className="text-pretty">
          One {client.name} sent outside the inbox. It becomes a line in Bookkeeping with the
          agent&apos;s suggestion, booked when you confirm it.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="add-invoice-file">Invoice</FieldLabel>
        {file ? (
          <Attachment size="sm" className="w-full">
            <AttachmentMedia>
              <FileTextIcon aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentDescription>{formatBytes(file.size, 1)}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => upload.removeFile(files[0].id)}
              >
                <XIcon aria-hidden="true" />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ) : (
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
            <span className="font-medium">Upload the invoice</span>
            <span className="text-muted-foreground text-xs">or drop a PDF or photo here</span>
          </button>
        )}
        <input {...upload.getInputProps({ id: "add-invoice-file" })} className="sr-only" tabIndex={-1} />
        {errors.length ? (
          <p className="text-destructive flex items-center gap-1.5 text-xs">
            <AlertCircleIcon className="size-3.5" aria-hidden="true" />
            {errors[0]}
          </p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="add-invoice-supplier">Supplier</FieldLabel>
        <Input
          id="add-invoice-supplier"
          list="add-invoice-suppliers"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Name on the invoice"
          autoComplete="off"
        />
        <datalist id="add-invoice-suppliers">
          {suppliers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {guess ? (
          <FieldDescription className="flex items-start gap-1.5">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="text-pretty">
              The agent suggests <span className="text-foreground">{guess.account}</span>, VAT{" "}
              {guess.vat} ({formatPercent(guess.confidence)}). {guess.reasoning[0]}
            </span>
          </FieldDescription>
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="add-invoice-date">Invoice date</FieldLabel>
          <Input
            id="add-invoice-date"
            type="date"
            value={date}
            max={TODAY}
            onChange={(e) => {
              setDate(e.target.value)
              if (!dueTouched && e.target.value) setDue(addDays(e.target.value, 14))
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="add-invoice-due">Due date</FieldLabel>
          <Input
            id="add-invoice-due"
            type="date"
            value={due}
            min={date || undefined}
            onChange={(e) => {
              setDue(e.target.value)
              setDueTouched(true)
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="add-invoice-amount">Amount</FieldLabel>
          <Input
            id="add-invoice-amount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="With VAT, kr"
            className="tabular-nums"
          />
        </Field>
      </div>

      {closedBefore ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-foreground text-sm text-pretty">
            Dated {monthLabel(dated)}, which is closed
            {filed && filing ? ` and its VAT return (${filing.short}) is filed` : ""}.
            {canReopen ? " Where should it go?" : ` It is booked in ${monthWord(here)}.`}
          </p>
          {canReopen ? (
            <RadioGroup
              value={choice}
              onValueChange={(value) => setPicked(value as Choice)}
              className="gap-2"
            >
              <ChoiceCard
                value="here"
                title={`Book it in ${monthWord(here)}`}
                recommended={recommended === "here"}
                hint={bookHereHint(term(here))}
              />
              <ChoiceCard
                value="reopen"
                title={`Reopen ${monthWord(dated)} and book it there`}
                recommended={recommended === "reopen"}
                hint={reopenHint({
                  name: monthWord(dated),
                  term: term(dated),
                  filed,
                  reopened: false,
                  first,
                })}
              />
            </RadioGroup>
          ) : (
            <p className="text-muted-foreground text-xs text-pretty">{bookHereHint(term(here))}</p>
          )}
          {canReopen ? (
            <p className="text-muted-foreground text-xs text-pretty">
              {amount ? `${formatAmount(amount)}. ` : ""}
              {LIMIT_NOTE}
            </p>
          ) : null}
        </div>
      ) : date && period !== here ? (
        <p className="text-muted-foreground text-xs text-pretty">
          Goes into {monthLabel(period)}, the month of its invoice date.
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!valid}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {closedBefore && choice === "reopen"
            ? `Reopen ${monthWord(dated)} and add`
            : "Add invoice"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ChoiceCard({
  value,
  title,
  hint,
  recommended,
}: {
  value: Choice
  title: string
  hint: string
  recommended: boolean
}) {
  return (
    <label
      className={cn(
        "border-border hover:bg-muted/40 relative flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors duration-150",
        "has-data-checked:border-primary has-data-checked:bg-primary/5 has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px]"
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-foreground flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {title}
          {recommended ? <Badge variant="info-light">Recommended</Badge> : null}
        </span>
        <span className="text-muted-foreground text-xs leading-4 text-pretty">{hint}</span>
      </span>
    </label>
  )
}
