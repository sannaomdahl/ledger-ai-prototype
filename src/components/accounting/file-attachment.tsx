"use client"

// A file in a conversation or on a line, as the shadcn Attachment chip
// (ReUI c-attachment-1 / c-attachment-3 patterns), opening a preview dialog.
// Real uploads come back from IndexedDB and show as they are; seeded demo
// files are rendered from the line they belong to (invoice, receipt, payslip).
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { ArrowUpRightIcon, DownloadIcon, FileTextIcon, ImageIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CLIENT_BY_ID } from "@/lib/accounting/data"
import {
  clientFiles,
  findFile,
  formatWhen,
  type FileEntry,
  type FileSummary,
} from "@/lib/accounting/file-index"
import { loadFile } from "@/lib/accounting/files"
import { useAccounting } from "@/lib/accounting/store"
import type { Client, ReviewItem } from "@/lib/accounting/types"
import { formatDate, formatNok } from "./meta"

export function extension(name: string) {
  // EHF is the Norwegian e-invoice format; the inbox names them by number.
  if (/^EHF/i.test(name)) return "EHF e-invoice"
  return name.includes(".") ? name.split(".").pop()!.toUpperCase() : "File"
}

export function isImageName(name: string) {
  return /\.(jpe?g|png|heic|webp|gif)$/i.test(name)
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The uploaded blob behind a name, as an object URL while mounted. */
function useStoredFile(name: string) {
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    let url: string | null = null
    let alive = true
    if (!name) return
    loadFile(name).then((blob) => {
      if (!alive || !blob) return
      url = URL.createObjectURL(blob)
      setFile({ blob, url })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [name])
  return file
}

function download(url: string, name: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
}

// ── Rendered documents for demo files ──

function fact(item: ReviewItem, label: string) {
  return item.facts.find((f) => f.label === label)?.value
}

function vatRate(item: ReviewItem) {
  const code = item.suggestion.lines[0]?.vat ?? ""
  if (code.startsWith("1 ") || code.startsWith("86 ")) return 0.25
  if (code.startsWith("11 ")) return 0.15
  if (code.startsWith("13 ")) return 0.12
  return 0
}

/** Paper stays paper in dark mode: a white sheet with dark ink. */
function Sheet({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-5 rounded-sm bg-white p-6 text-[13px] leading-5 text-zinc-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_24px_-12px_rgb(0_0_0/0.25)]",
        narrow ? "max-w-72 font-mono text-xs" : "max-w-xl"
      )}
    >
      {children}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "font-semibold")}>
      <span className={strong ? undefined : "text-zinc-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function InvoiceDoc({ item, client }: { item: ReviewItem; client: Client }) {
  const gross = Math.abs(item.amount)
  const rate = vatRate(item)
  const net = gross / (1 + rate)
  return (
    <Sheet>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{item.title}</span>
          <span className="text-zinc-500">Org. {fact(item, "Supplier org. no.")} MVA</span>
        </div>
        <span className="text-lg font-semibold tracking-tight">Faktura</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-zinc-500">Til</span>
          <span className="font-medium">{client.name}</span>
          <span>{client.profile.address}</span>
          <span className="text-zinc-500">Org. {client.orgNo}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <Row label="Fakturanr." value={fact(item, "Invoice no.") ?? "—"} />
          <Row label="Fakturadato" value={fact(item, "Invoice date") ?? formatDate(item.date)} />
          <Row label="Forfall" value={fact(item, "Due date") ?? formatDate(item.date)} />
        </div>
      </div>
      <div className="flex flex-col gap-1 border-y border-zinc-200 py-3">
        <div className="flex justify-between gap-4 text-zinc-500">
          <span>Beskrivelse</span>
          <span>Beløp</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="min-w-0 truncate">{item.subtitle}</span>
          <span className="tabular-nums">{formatNok(net)}</span>
        </div>
      </div>
      <div className="ms-auto flex w-56 flex-col gap-0.5">
        <Row label="Sum eks. mva" value={formatNok(net)} />
        <Row label={`Mva ${Math.round(rate * 100)} %`} value={formatNok(gross - net)} />
        <Row label="Å betale" value={formatNok(gross)} strong />
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-200 pt-3 text-zinc-500">
        <span>KID {fact(item, "KID") ?? "—"}</span>
        <span>Kontonr. {fact(item, "Paid from")?.replace("DNB ", "") ?? client.bankAccount}</span>
      </div>
    </Sheet>
  )
}

function ReceiptDoc({ item }: { item: ReviewItem }) {
  const gross = Math.abs(item.amount)
  const rate = vatRate(item)
  return (
    <Sheet narrow>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-semibold uppercase">{item.title}</span>
        <span className="text-zinc-500">Kvittering</span>
      </div>
      <div className="flex flex-col gap-0.5 border-y border-dashed border-zinc-300 py-3">
        <Row label={item.subtitle.replace(/^VISA \d+ /, "").slice(0, 22)} value={formatNok(gross)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Row label="TOTAL" value={formatNok(gross)} strong />
        <Row label={`herav mva ${Math.round(rate * 100)}%`} value={formatNok(gross - gross / (1 + rate))} />
      </div>
      <div className="flex flex-col gap-0.5 text-zinc-500">
        <span>{fact(item, "Paid with") ?? "Bankkort"}</span>
        <span>{fact(item, "Purchase date") ?? formatDate(item.date)} · Godkjent</span>
      </div>
    </Sheet>
  )
}

function PayslipDoc({ item, client }: { item: ReviewItem; client: Client }) {
  const gross = item.amount
  const tax = Math.round(gross * 0.3)
  return (
    <Sheet>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{client.name}</span>
          <span className="text-zinc-500">Lønnsslipp</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="font-medium">{item.title}</span>
          <span className="text-zinc-500">{item.subtitle}</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 border-y border-zinc-200 py-3">
        {item.suggestion.lines.map((line) => (
          <Row key={line.account} label={line.account} value={formatNok(line.amount)} />
        ))}
      </div>
      <div className="ms-auto flex w-56 flex-col gap-0.5">
        <Row label="Brutto" value={formatNok(gross)} />
        <Row label="Forskuddstrekk" value={`−${formatNok(tax)}`} />
        <Row label="Utbetalt" value={formatNok(gross - tax)} strong />
      </div>
    </Sheet>
  )
}

/** A file we only know by name: its title and who sent it, no invented body. */
function PlainDoc({ name, from }: { name: string; from?: string }) {
  const title = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ")
  return (
    <Sheet>
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">{title}</span>
        {from ? <span className="text-zinc-500">From {from}</span> : null}
      </div>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[92, 100, 84, 96, 60, 0, 88, 100, 72].map((w, i) =>
          w ? (
            <span key={i} className="h-2 rounded-full bg-zinc-100" style={{ width: `${w}%` }} />
          ) : (
            <span key={i} className="h-2" />
          )
        )}
      </div>
      <p className="text-center text-xs text-zinc-500">
        Demo file: the original opens here once documents come from Tripletex.
      </p>
    </Sheet>
  )
}

/** A document we hold the content of (an agreement, a set of answers),
    laid out as the paper reads. */
function SummaryDoc({ summary }: { summary: FileSummary }) {
  return (
    <Sheet>
      <span className="text-base font-semibold">{summary.title}</span>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5">
        {summary.rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-pretty">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.sections?.map((section) => (
        <div key={section.title} className="flex flex-col gap-1.5 border-t border-zinc-200 pt-3">
          <span className="font-semibold">{section.title}</span>
          <ul className="flex flex-col gap-1">
            {section.rows.map(([task, when]) => (
              <li key={task} className="flex justify-between gap-4">
                <span className="text-pretty">{task}</span>
                <span className="shrink-0 text-right text-zinc-500">{when}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {summary.note ? <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500">{summary.note}</p> : null}
    </Sheet>
  )
}

function RenderedDoc({
  name,
  item,
  client,
  from,
  summary,
}: {
  name: string
  item?: ReviewItem
  client?: Client
  from?: string
  summary?: FileSummary
}) {
  if (summary) return <SummaryDoc summary={summary} />
  if (item && client) {
    if (item.domain === "payroll" && /payslip|lonn/i.test(name)) {
      return <PayslipDoc item={item} client={client} />
    }
    if (item.domain === "bookkeeping") {
      const card = Boolean(fact(item, "Paid with"))
      return card || isImageName(name) || /receipt|kvittering/i.test(name) ? (
        <ReceiptDoc item={item} />
      ) : (
        <InvoiceDoc item={item} client={client} />
      )
    }
  }
  return <PlainDoc name={name} from={from} />
}

// ── The preview ──

/** Where a file came from, under its title: when it arrived, from whom,
    how, and what it belongs to. */
function FileFacts({ entry }: { entry: FileEntry }) {
  const rows = [
    ["Received", formatWhen(entry.at)],
    ["From", entry.by.name],
    ["Came in through", entry.via],
    ...(entry.link ? [["Belongs to", `${entry.link.label} · ${entry.link.detail}`]] : []),
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-foreground min-w-0 truncate">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The file opened: the real upload when this browser has it, otherwise a
    document rendered from the line it belongs to. */
export function FilePreview({
  name,
  itemId,
  clientId,
  from,
  entry,
  open,
  onOpenChange,
}: {
  name: string
  itemId?: string
  clientId?: string
  from?: string
  /** The file's record in the client's files, for the facts and a way to
      what it belongs to. */
  entry?: FileEntry
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch } = useAccounting()
  const router = useRouter()
  const stored = useStoredFile(open ? name : "")
  const item = itemId ? state.items.find((i) => i.id === itemId) : undefined
  const client = CLIENT_BY_ID.get(clientId ?? item?.clientId ?? "")
  const image = stored ? stored.blob.type.startsWith("image/") : isImageName(name)
  const pdf = stored?.blob.type === "application/pdf"
  const meta = [extension(name), stored ? formatSize(stored.blob.size) : null]
    .filter(Boolean)
    .join(" · ")
  const caption = [
    from ? `From ${from}` : null,
    item ? `${item.title} · ${formatDate(item.date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const link = entry?.link

  function openLink() {
    if (!link) return
    onOpenChange(false)
    if (link.itemId) dispatch({ type: "open_item", id: link.itemId })
    else if (link.requestId) dispatch({ type: "open_request", id: link.requestId })
    else if (link.href) router.push(link.href)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader className="min-w-0 pe-8">
          <DialogTitle className="truncate">{name}</DialogTitle>
          <DialogDescription className="truncate">
            {[meta, entry ? null : caption].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {entry ? <FileFacts entry={entry} /> : null}
        <div className="bg-muted/50 -mx-4 min-h-0 flex-1 overflow-auto px-4 py-6">
          {stored && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stored.url}
              alt={`${name}, uploaded${from ? ` by ${from}` : ""}`}
              className="mx-auto max-h-[65dvh] w-auto rounded-sm object-contain shadow-sm outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
          ) : stored && pdf ? (
            <iframe
              src={stored.url}
              title={name}
              className="h-[65dvh] w-full rounded-sm bg-white"
            />
          ) : (
            <RenderedDoc
              name={name}
              item={item}
              client={client}
              from={from ?? entry?.by.name}
              summary={entry?.summary}
            />
          )}
        </div>
        {stored || (link && (link.itemId || link.requestId || link.href)) ? (
          <DialogFooter>
            {link && (link.itemId || link.requestId || link.href) ? (
              <Button type="button" variant="outline" onClick={openLink}>
                <ArrowUpRightIcon data-icon="inline-start" aria-hidden="true" />
                Open {link.itemId ? "the line" : link.requestId ? "the conversation" : link.detail.split(" · ")[0]}
              </Button>
            ) : null}
            {stored ? (
              <Button type="button" variant="outline" onClick={() => download(stored.url, name)}>
                <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                Download
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ── The chip ──

export function FileAttachment({
  name,
  itemId,
  clientId,
  from,
  className,
}: {
  name: string
  /** The line the file belongs to, so a demo file can be rendered from it. */
  itemId?: string
  clientId?: string
  /** Who sent it, for the dialog's caption. */
  from?: string
  className?: string
}) {
  const { state } = useAccounting()
  const [open, setOpen] = useState(false)
  const stored = useStoredFile(name)
  const item = itemId ? state.items.find((i) => i.id === itemId) : undefined
  const owner = clientId ?? item?.clientId ?? ""
  const image = stored ? stored.blob.type.startsWith("image/") : isImageName(name)
  const meta = [extension(name), stored ? formatSize(stored.blob.size) : null]
    .filter(Boolean)
    .join(" · ")
  // Only looked up once the preview opens: it walks the client's files.
  const entry = open
    ? findFile(clientFiles(owner, state.items, state.requests, state), name, itemId)
    : undefined

  return (
    <>
      <Attachment size="sm" className={cn("max-w-full", className)}>
        <AttachmentMedia variant={stored && image ? "image" : "icon"}>
          {stored && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stored.url} alt="" width={32} height={32} />
          ) : image ? (
            <ImageIcon aria-hidden="true" />
          ) : (
            <FileTextIcon aria-hidden="true" />
          )}
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{name}</AttachmentTitle>
          <AttachmentDescription>{meta}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentTrigger aria-label={`Preview ${name}`} onClick={() => setOpen(true)} />
        {stored ? (
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={`Download ${name}`}
              onClick={() => download(stored.url, name)}
            >
              <DownloadIcon aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        ) : null}
      </Attachment>
      <FilePreview
        name={name}
        itemId={itemId}
        clientId={clientId}
        from={from}
        entry={entry}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
