"use client"

// The customer view, Sanna style: warm paper, espresso ink, one orange
// accent, and as little text as the page can get away with. The customer
// is Fjordlys Rådgivning AS, a consulting firm, seen by its daglig leder.
//
// Three panes. "Dine oppgaver" is a timeline: a box to send Truls a
// document (read on the spot), what waits on them (the one place a
// primary button lives), what's done (greyed), what Truls is working on,
// and what's locked until later. A task that is answered shows it being
// sent, then moves down to the done list; a wrong document says so and
// stays. "Meldinger" holds every conversation: this month's with Truls,
// Sanna (KI) for instant answers from the books, and the settled ones kept
// for later. "Tallene dine" is the numbers, consulting-shaped: flags worth
// a look, the year against its goal, booked against invoiced, billable
// share, KPIs and the month's deadlines.
// Everything is dummy data from ./data, held in local state.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { cn } from "cn"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  LockIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  PrinterIcon,
  SendIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/reui/badge"
import { askModel, type Turn } from "@/components/kunde/ask"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ACCOUNTANT,
  AI_STARTERS,
  askNumbers,
  BANK_URL,
  bookedAhead,
  CONSULTANTS,
  CONTACT,
  dayLabel,
  DEADLINE_STATUS,
  DEADLINES,
  DONE,
  FIRM,
  FLAGS,
  GOAL_2026,
  grossFor,
  invoicedYtd,
  kr,
  LIVE_MESSAGE,
  LIVE_MESSAGE_SETTLED,
  mnok,
  MONTH_REPORTS,
  MONTHS,
  PAYROLL,
  payrollTotal,
  READ_STEPS,
  relative,
  SOFTWARE,
  softwareTotals,
  SOURCES,
  STARTERS,
  SUPPLIERS,
  THREADS,
  TODAY,
  TODOS,
  TOP_CLIENTS,
  TRIPLETEX_URL,
  UPCOMING,
  UTILIZATION_TARGET,
  WITH_TRULS,
  WORKING_DAYS,
  workingDaysFrom,
  type Deadline,
  type Message,
  type MonthReport,
  type Recognised,
  type Thread,
  type Todo,
} from "./data"

/** Static assets are served under the GitHub Pages base path. */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const ENTER =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-snappy motion-reduce:slide-in-from-bottom-0"

/** A card that just arrived in a list. */
const ARRIVE =
  "animate-in fade-in slide-in-from-top-2 fill-mode-both duration-400 ease-snappy motion-reduce:slide-in-from-top-0"

type Pane = "todo" | "messages" | "numbers"

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

// ── Small pieces ──

/** A white card stamped onto the paper, like the mockups on sanna.no. */
/** True inside the month-end document, where cards are sections on one sheet. */
const DocContext = createContext(false)

function Card({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const doc = useContext(DocContext)
  return (
    <section
      className={cn(
        doc
          ? "border-border flex flex-col gap-4 border-t pt-6 [counter-increment:section] break-inside-avoid"
          : "bg-card shadow-stamp flex flex-col gap-4 rounded-2xl p-5",
        className,
      )}
    >
      {children}
    </section>
  )
}

/** The small bolt-and-label line a Sanna card starts with; in the
    document, a numbered heading. */
function CardLabel({
  children,
  aside,
}: {
  children: ReactNode
  aside?: ReactNode
}) {
  const doc = useContext(DocContext)
  if (doc)
    return (
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground text-sm font-medium before:text-muted-foreground before:mr-2 before:content-[counter(section)]">
          {children}
        </h3>
        {aside ? (
          <span className="text-muted-foreground text-xs">{aside}</span>
        ) : null}
      </div>
    )
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <ZapIcon className="size-3 fill-current" aria-hidden="true" />
        {children}
      </span>
      {aside ? (
        <span className="text-muted-foreground text-xs">{aside}</span>
      ) : null}
    </div>
  )
}

function TrulsPhoto({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimiser
    <img
      src={`${BASE}/${ACCOUNTANT.photo}`}
      alt=""
      className={cn(
        "size-9 shrink-0 rounded-full object-cover object-top",
        className,
      )}
    />
  )
}

/** Sanna's own mark, for the KI thread. */
function SannaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full",
        className,
      )}
      aria-hidden="true"
    >
      <ZapIcon className="size-4 fill-current" />
    </span>
  )
}

/** The books live in Tripletex; this page sits on top. */
function TripletexLink({ size }: { size?: "sm" }) {
  return (
    <Button
      variant="outline"
      size={size}
      nativeButton={false}
      render={
        <a href={TRIPLETEX_URL} target="_blank" rel="noopener noreferrer" />
      }
    >
      Tripletex
      <ExternalLinkIcon
        data-icon="inline-end"
        className="text-muted-foreground"
        aria-hidden="true"
      />
    </Button>
  )
}

// ── Top bar and hello ──

function TopBar({ onChat }: { onChat: () => void }) {
  return (
    <header className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-4 px-4 pt-5 sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3 text-sm">
        <span className="text-foreground flex items-center gap-1 font-semibold tracking-tight">
          <ZapIcon className="size-4 fill-current" aria-hidden="true" />
          Sanna
        </span>
        <span className="text-muted-foreground truncate max-sm:hidden">
          {FIRM.name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="max-sm:hidden">
          <TripletexLink size="sm" />
        </span>
        <button
          type="button"
          onClick={onChat}
          className="hover:bg-card focus-visible:ring-ring/50 -mr-2 flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 text-left text-sm transition-colors outline-none focus-visible:ring-[3px]"
        >
          <TrulsPhoto className="size-8" />
          <span className="flex flex-col leading-tight">
            <span className="text-foreground font-medium">
              <span className="max-sm:hidden">{ACCOUNTANT.name}</span>
              <span className="sm:hidden">{ACCOUNTANT.first}</span>
            </span>
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <span
                className="bg-success size-1.5 rounded-full"
                aria-hidden="true"
              />
              Pålogget
            </span>
          </span>
        </button>
      </div>
    </header>
  )
}

function Greeting({ open }: { open: number }) {
  const line =
    open === 0
      ? "Oktober er ferdigstilt. Truls tar det herfra."
      : open === 1
        ? "Oktober er nesten ferdigstilt. Du har én ting å gjøre."
        : `Oktober er nesten ferdigstilt. Du har ${open} ting å gjøre.`
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-foreground text-4xl font-medium tracking-[-0.03em] sm:text-5xl">
        Hei {CONTACT.first}
      </h1>
      <p className="text-muted-foreground text-lg text-pretty">{line}</p>
    </div>
  )
}

// ── Send Truls a document: dropped here, read on the spot ──

type Reading =
  | { stage: "idle" }
  | { stage: "reading"; file: string; step: number }
  | { stage: "done"; file: string; result: Recognised }

/** A file handed to the reader by a task, which knows what it asked for. */
export type Incoming = { file: File; todoId: string; expect: string }

const supplier = (key: string) =>
  SUPPLIERS.find((s) => s.keys.includes(key))!.result

/** Which supplier a file is from: its name, and for a PDF the text inside.
    Nothing recognised means the document expected here. */
async function recognise(file: File, fallback: string): Promise<Recognised> {
  let haystack = file.name.toLowerCase()
  if (file.type === "application/pdf" || file.type.startsWith("text/")) {
    try {
      const head = await file.slice(0, 400_000).arrayBuffer()
      haystack += " " + new TextDecoder("latin1").decode(head).toLowerCase()
    } catch {
      // The name alone will do.
    }
  }
  const hit = SUPPLIERS.find((s) => s.keys.some((k) => haystack.includes(k)))
  return hit?.result ?? supplier(fallback)
}

function UploadBox({
  incoming,
  onRead,
}: {
  incoming: Incoming | null
  onRead: (result: Recognised, from?: Incoming) => void
}) {
  // Attached, not yet sent: the file waits for a note and the button.
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState("")
  const [reading, setReading] = useState<Reading>({ stage: "idle" })
  const [over, setOver] = useState(false)
  // Gmail is already on: that is where most receipts come from.
  const [connected, setConnected] = useState<Set<string>>(new Set(["Gmail"]))
  const fileRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLElement>(null)
  // Each handed-over file is read once, whatever re-runs the effect.
  const handled = useRef<Incoming | null>(null)

  async function take(file: File, from?: Incoming) {
    const name = file.name
    setReading({ stage: "reading", file: name, step: 0 })
    const result = await recognise(file, from?.expect ?? "norwegian")
    // The steps land one after another, so the reading is seen to happen.
    for (let step = 1; step < READ_STEPS.length; step++) {
      await wait(900)
      setReading({ stage: "reading", file: name, step })
    }
    await wait(900)
    // What they told us about it wins over the guess.
    const read = { ...result, comment: note.trim() || result.comment }
    setReading({ stage: "done", file: name, result: read })
    onRead(read, from)
    setNote("")
    setFile(null)
  }

  // A task's "Last opp" hands its file here, and brings the reader into view.
  useEffect(() => {
    if (!incoming || handled.current === incoming) return
    boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    const id = window.setTimeout(() => {
      handled.current = incoming
      void take(incoming.file, incoming)
    }, 0)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per handed-over file
  }, [incoming])

  if (reading.stage === "reading") {
    return (
      <Card className="scroll-mt-6 gap-3">
        <CardLabel>Sender til {ACCOUNTANT.first}</CardLabel>
        <div className="flex items-center gap-3">
          <PaperclipIcon
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-foreground truncate text-sm font-medium">
            {reading.file}
          </span>
        </div>
        <ol className="flex flex-col gap-1.5" aria-live="polite">
          {READ_STEPS.map((label, i) => {
            const state =
              i < reading.step ? "done" : i === reading.step ? "now" : "next"
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  state === "next"
                    ? "text-muted-foreground/60"
                    : "text-foreground",
                )}
              >
                {state === "done" ? (
                  <CheckIcon
                    className="text-success-text size-3.5"
                    aria-hidden="true"
                  />
                ) : state === "now" ? (
                  <LoaderCircleIcon
                    className="text-brand size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="bg-border mx-1 size-1.5 rounded-full"
                    aria-hidden="true"
                  />
                )}
                {label}
                {state === "now" ? "…" : null}
              </li>
            )
          })}
        </ol>
      </Card>
    )
  }

  if (reading.stage === "done") {
    const r = reading.result
    return (
      <Card className="scroll-mt-6 gap-3">
        <CardLabel aside={dayLabel(r.date)}>
          Lest og klar til bokføring
        </CardLabel>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-foreground text-[15px] font-medium">
              {r.supplier}
            </span>
            <span className="text-foreground text-[15px] font-medium tabular-nums">
              {kr(r.amount)} kr
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{r.what}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Konto</dt>
          <dd className="text-foreground">{r.account}</dd>
          <dt className="text-muted-foreground">Merkelapp</dt>
          <dd>
            <Badge
              variant="outline"
              className="bg-brand/10 text-brand-contrast border-transparent"
            >
              {r.tag}
            </Badge>
          </dd>
          <dt className="text-muted-foreground">Kommentar</dt>
          <dd className="text-foreground">{r.comment}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReading({ stage: "idle" })}
          >
            <UploadIcon data-icon="inline-start" aria-hidden="true" />
            Send et til
          </Button>
          <TripletexLink size="sm" />
          <span className="text-muted-foreground ml-auto text-xs">
            {ACCOUNTANT.first} bokfører i dag
          </span>
        </div>
      </Card>
    )
  }

  return (
    <section
      ref={boxRef}
      className="bg-card shadow-stamp flex scroll-mt-6 flex-col gap-3 rounded-2xl p-5"
    >
      <CardLabel>Send noe til {ACCOUNTANT.first}</CardLabel>
      {file ? (
        <div className="bg-muted/50 border-border flex items-center gap-3 rounded-xl border px-3 py-2.5">
          <PaperclipIcon
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {file.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {Math.max(1, Math.round(file.size / 1024))} kB
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setFile(null)}
            aria-label="Fjern filen"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const dropped = e.dataTransfer.files?.[0]
            if (dropped) setFile(dropped)
          }}
          className={cn(
            "border-border hover:border-ring hover:bg-muted/40 focus-visible:ring-ring/50 flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors outline-none focus-visible:ring-[3px]",
            over && "border-brand bg-brand/10",
          )}
        >
          <UploadIcon
            className="text-muted-foreground size-5"
            aria-hidden="true"
          />
          <span className="text-foreground text-sm font-medium">
            Slipp en kvittering, faktura eller et bilde her
          </span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        aria-label="Velg dokument"
        onChange={(e) => {
          const chosen = e.target.files?.[0]
          if (chosen) setFile(chosen)
          e.target.value = ""
        }}
      />
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Hva er dokumentet? «Reise Andrea», «lunsj med kunde» …"
        aria-label="Hva er dokumentet?"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            if (file) void take(file)
          }
        }}
        className="bg-background min-h-0 resize-none rounded-xl"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!file} onClick={() => file && void take(file)}>
          <SendIcon data-icon="inline-start" aria-hidden="true" />
          Send til {ACCOUNTANT.first}
        </Button>
        {!file ? (
          <span className="text-muted-foreground text-xs">
            Legg ved et dokument først.
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Eller koble til</span>
          {SOURCES.map((name) => {
            const on = connected.has(name)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setConnected((c) => {
                    const next = new Set(c)
                    if (on) next.delete(name)
                    else next.add(name)
                    return next
                  })
                  if (!on)
                    toast.success(`${name} er koblet til`, {
                      description:
                        "Kvitteringer og fakturaer hentes derfra automatisk.",
                    })
                }}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors outline-none focus-visible:ring-[3px]",
                  on
                    ? "bg-success/10 text-success-text border-transparent"
                    : "bg-background text-foreground border-border hover:bg-muted",
                )}
              >
                {on ? (
                  <CheckIcon className="size-3" aria-hidden="true" />
                ) : null}
                {name}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Godkjenn lønn: everyone on the pay run, then one button ──

function PayrollDialog({
  open,
  onOpenChange,
  onApprove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: () => void
}) {
  // Editable in place: a wrong number is fixed here, not in a message.
  const [lines, setLines] = useState(() =>
    PAYROLL.map((p) =>
      p.startDay
        ? {
            ...p,
            base: grossFor(p) - p.commission,
            note: `${p.note} · ${kr(p.base)} i full lønn, ${workingDaysFrom(p.startDay)}/${WORKING_DAYS} dager`,
          }
        : p,
    ),
  )
  const total = lines.reduce((sum, p) => sum + p.base + p.commission, 0)
  const changed = total !== payrollTotal()

  function edit(i: number, field: "base" | "commission", raw: string) {
    const value = Number(raw.replace(/\D/g, "")) || 0
    setLines((l) => l.map((p, j) => (j === i ? { ...p, [field]: value } : p)))
  }

  const cell =
    "bg-background h-8 w-24 rounded-lg px-2 text-right text-sm tabular-nums"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sanna bg-card text-foreground gap-5 rounded-2xl p-6 sm:max-w-2xl">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-foreground text-lg font-medium tracking-tight">
            Lønn for oktober
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            7 ansatte · utbetales 25. oktober · {ACCOUNTANT.first} har sjekket
            den mot september. Endre et tall om noe er feil.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <caption className="sr-only">Lønn per ansatt, oktober 2026</caption>
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th scope="col" className="pb-2 text-left font-medium">
                Navn
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-medium">
                Fastlønn
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-medium">
                Provisjon
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-medium">
                Brutto
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((p, i) => (
              <tr key={p.name} className="border-border border-t align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <span className="text-foreground block font-medium">
                    {p.name}
                  </span>
                  <span
                    className="text-muted-foreground block truncate text-xs"
                    title={p.note ? `${p.role} · ${p.note}` : undefined}
                  >
                    {p.role}
                    {p.note ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="text-note">{p.note}</span>
                      </>
                    ) : null}
                  </span>
                </th>
                <td className="py-2 pl-4 text-right">
                  <Input
                    inputMode="numeric"
                    value={kr(p.base)}
                    onChange={(e) => edit(i, "base", e.target.value)}
                    aria-label={`Fastlønn, ${p.name}`}
                    className={cell}
                  />
                </td>
                <td className="py-2 pl-4 text-right">
                  <Input
                    inputMode="numeric"
                    value={kr(p.commission)}
                    onChange={(e) => edit(i, "commission", e.target.value)}
                    aria-label={`Provisjon, ${p.name}`}
                    className={cn(
                      cell,
                      !p.commission && "text-muted-foreground",
                    )}
                  />
                </td>
                <td className="text-foreground py-2 pl-4 text-right leading-8 font-medium tabular-nums">
                  {kr(p.base + p.commission)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-border border-t">
              <th
                scope="row"
                className="text-foreground pt-3 text-left font-medium"
              >
                Sum brutto
              </th>
              <td
                colSpan={3}
                className="text-foreground pt-3 text-right font-medium tabular-nums"
              >
                {kr(total)} kr
                {changed ? (
                  <span className="text-brand-contrast ml-2 text-xs font-normal">
                    endret
                  </span>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>
        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <span className="text-muted-foreground text-xs text-pretty">
            Eksl. feriepenger, AGA og skattetrekk kommer i tillegg.{" "}
            {ACCOUNTANT.first} tar seg av dette.
          </span>
          <Button onClick={onApprove}>
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            {changed ? "Ja, godkjenn med endringer" : "Ja, godkjenn lønn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The timeline ──

type Tone = "done" | "focus" | "truls" | "next" | "sending"

const TONE_LABEL: Record<Tone, string> = {
  done: "Fullført",
  focus: "Venter på deg",
  truls: `Behandles av ${ACCOUNTANT.first}`,
  next: "Kommende",
  sending: "Sender",
}

/** The status line at the top of a timeline card, icon and label in one colour. */
function StatusLine({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        tone === "done" && "text-success-text",
        tone === "focus" && "text-brand-contrast",
        (tone === "truls" || tone === "next" || tone === "sending") &&
          "text-muted-foreground",
      )}
    >
      {tone === "done" ? (
        <CheckIcon className="size-3.5" aria-hidden="true" />
      ) : tone === "focus" ? (
        <LoaderCircleIcon className="size-3.5" aria-hidden="true" />
      ) : tone === "truls" ? (
        <LoaderCircleIcon
          className="size-3.5 animate-spin [animation-duration:2.5s]"
          aria-hidden="true"
        />
      ) : tone === "sending" ? (
        <LoaderCircleIcon
          className="text-brand size-3.5 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <LockIcon className="size-3.5" aria-hidden="true" />
      )}
      {label ?? TONE_LABEL[tone]}
    </span>
  )
}

/** One stop on the rail: a dot, a label and its cards. */
function Stop({
  label,
  tone,
  children,
}: {
  label: string
  tone: Tone
  children: ReactNode
}) {
  return (
    <li className="relative flex flex-col gap-3 pb-10 last:pb-0">
      <span
        className={cn(
          "absolute top-0 -left-[2.65rem] flex size-5 items-center justify-center rounded-full",
          tone === "focus" && "bg-brand/15",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "size-2 rounded-full",
            tone === "focus" ? "bg-brand" : "bg-border",
          )}
        />
      </span>
      <h3
        className={cn(
          "text-sm leading-5 font-medium",
          tone === "focus" ? "text-brand-contrast" : "text-muted-foreground",
        )}
      >
        {label}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </li>
  )
}

function TimelineCard({
  tone,
  statusLabel,
  title,
  detail,
  meta,
  error,
  actions,
  className,
}: {
  tone: Tone
  statusLabel?: string
  title: string
  detail?: string
  meta?: ReactNode
  /** What went wrong, when it did: the card stays and says so. */
  error?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-card shadow-stamp flex flex-col gap-3 rounded-2xl p-4 transition-opacity duration-300 sm:flex-row sm:items-center sm:gap-5 sm:p-5",
        tone === "done" && "opacity-60",
        tone === "next" && "opacity-70",
        tone === "sending" && "opacity-80",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <StatusLine tone={tone} label={statusLabel} />
        <span className="text-foreground text-[15px] leading-5 font-medium">
          {title}
        </span>
        {detail ? (
          <span className="text-muted-foreground text-sm text-pretty">
            {detail}
          </span>
        ) : null}
        {meta ? (
          <span className="text-muted-foreground mt-1 text-xs">{meta}</span>
        ) : null}
        {error ? (
          <span className="text-destructive mt-1 flex items-start gap-1.5 text-xs text-pretty">
            <AlertCircleIcon
              className="mt-px size-3.5 shrink-0"
              aria-hidden="true"
            />
            {error}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** A task that is really a question from Truls: his photo, his words, the
    answers as buttons, and a way to say something else about it. */
function QuestionCard({
  todo,
  lead,
  onDone,
  onComment,
}: {
  todo: Todo
  lead: boolean
  onDone: (what: string) => void
  onComment: () => void
}) {
  return (
    <div className="bg-card shadow-stamp flex flex-col gap-3 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <StatusLine tone="focus" />
        <span className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">
            {relative(todo.due)}
          </span>
          <span aria-hidden="true"> · </span>
          {todo.holdsUp}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <TrulsPhoto />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="bg-muted text-foreground rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm text-pretty">
            <span className="font-medium">{todo.title}.</span> {todo.detail}
          </div>
          <span className="text-muted-foreground px-1 text-[11px]">
            {ACCOUNTANT.first}
            <span aria-hidden="true"> · </span>i dag 08:50
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        {todo.options?.map((option, i) => (
          <Button
            key={option}
            variant={lead && i === 0 ? "default" : "outline"}
            onClick={() => onDone(option)}
          >
            {option}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onComment}
          aria-label={`Skriv til ${ACCOUNTANT.first} om dette`}
        >
          <MessageCircleIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function TodoActions({
  todo,
  lead,
  onApprove,
  onUpload,
}: {
  todo: Todo
  lead: boolean
  onApprove: () => void
  onUpload: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  if (todo.kind === "file") {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="sr-only"
          aria-label="Velg faktura"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ""
          }}
        />
        <Button
          variant={lead ? "default" : "outline"}
          onClick={() => fileRef.current?.click()}
        >
          <PaperclipIcon data-icon="inline-start" aria-hidden="true" />
          {todo.action}
        </Button>
      </>
    )
  }
  return (
    <Button variant={lead ? "default" : "outline"} onClick={onApprove}>
      <CheckIcon data-icon="inline-start" aria-hidden="true" />
      {todo.action}
    </Button>
  )
}

/** What a task is doing right now, besides waiting. */
type TaskState = { sending?: string; error?: string }

function Timeline({
  done,
  states,
  booked,
  onDone,
  onApprove,
  onUpload,
  onComment,
}: {
  done: Record<string, string>
  states: Record<string, TaskState>
  booked: Recognised[]
  onDone: (id: string, what: string) => void
  onApprove: () => void
  onUpload: (todo: Todo, file: File) => void
  onComment: (todo: Todo) => void
}) {
  const open = TODOS.filter((t) => !done[t.id]).sort((a, b) =>
    a.due.localeCompare(b.due),
  )
  const sent = TODOS.filter((t) => done[t.id])
  return (
    <ol className="border-border ml-2.5 flex flex-col border-l pl-8 sm:ml-3">
      <Stop label="Venter på deg" tone="focus">
        {open.length ? (
          open.map((todo, i) => {
            const state = states[todo.id] ?? {}
            if (state.sending)
              return (
                <TimelineCard
                  key={todo.id}
                  tone="sending"
                  statusLabel={state.sending}
                  title={todo.title}
                  detail={todo.detail}
                />
              )
            return todo.kind === "choice" ? (
              <QuestionCard
                key={todo.id}
                todo={todo}
                lead={i === 0}
                onDone={(what) => onDone(todo.id, what)}
                onComment={() => onComment(todo)}
              />
            ) : (
              <TimelineCard
                key={todo.id}
                tone="focus"
                title={todo.title}
                detail={todo.detail}
                error={state.error}
                meta={
                  <>
                    <span className="text-foreground font-medium">
                      {relative(todo.due)}
                    </span>
                    <span aria-hidden="true"> · </span>
                    {todo.holdsUp}
                  </>
                }
                actions={
                  <TodoActions
                    todo={todo}
                    lead={i === 0}
                    onApprove={onApprove}
                    onUpload={(file) => onUpload(todo, file)}
                  />
                }
              />
            )
          })
        ) : (
          <div className="bg-card shadow-stamp flex items-center gap-3 rounded-2xl p-5">
            <span className="bg-success/10 text-success-text flex size-9 items-center justify-center rounded-full">
              <CheckIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-foreground text-[15px] font-medium">
                Ingenting venter på deg
              </span>
              <span className="text-muted-foreground text-sm">
                {ACCOUNTANT.first} lukker oktober 31. oktober. Du hører fra ham
                om noe mangler.
              </span>
            </div>
          </div>
        )}
      </Stop>

      <Stop label="Fullførte oppgaver" tone="done">
        {sent.map((t) => (
          <TimelineCard
            key={t.id}
            tone="done"
            title={t.title}
            detail={done[t.id]}
            meta={dayLabel(TODAY)}
            className={ARRIVE}
          />
        ))}
        {DONE.map((d) => (
          <TimelineCard
            key={d.id}
            tone="done"
            title={d.title}
            detail={d.detail}
            meta={d.when}
          />
        ))}
      </Stop>

      <Stop label={`Hos ${ACCOUNTANT.first}`} tone="truls">
        {booked.map((b, i) => (
          <TimelineCard
            key={i}
            tone="truls"
            title={`${b.supplier}, ${kr(b.amount)} kr`}
            detail={`${b.account} · ${b.tag} · «${b.comment}»`}
            meta="Bokføres i dag"
            className={ARRIVE}
          />
        ))}
        {WITH_TRULS.map((w) => (
          <TimelineCard
            key={w.id}
            tone="truls"
            title={w.title}
            detail={w.detail}
          />
        ))}
      </Stop>

      <Stop label="Neste oppgaver" tone="next">
        {UPCOMING.map((u) => (
          <TimelineCard
            key={u.id}
            tone="next"
            title={u.title}
            detail={u.detail}
          />
        ))}
      </Stop>
    </ol>
  )
}

// ── Tallene ──

const TONE_TEXT = {
  positive: "text-success-text",
  warning: "text-warning-text",
  neutral: "text-muted-foreground",
}

function StatTiles({ report }: { report: MonthReport }) {
  const stats = report.tiles
  const doc = useContext(DocContext)
  return (
    <dl
      className={cn(
        "grid grid-cols-2 sm:grid-cols-4",
        doc ? "bg-border gap-px overflow-hidden rounded-lg" : "gap-3",
      )}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn(
            "flex flex-col gap-1 p-4",
            doc ? "bg-card" : "bg-card shadow-stamp rounded-2xl",
          )}
        >
          <dt className="text-muted-foreground text-xs">{s.label}</dt>
          <dd className="text-foreground text-2xl font-medium tracking-tight tabular-nums">
            {s.value}
          </dd>
          <dd className={cn("text-xs", TONE_TEXT[s.tone ?? "neutral"])}>
            {s.hint}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The software breakdown behind its flag. */
function SoftwareLines() {
  const max = Math.max(...SOFTWARE.map((l) => l.sep))
  return (
    <ul className="flex flex-col gap-2">
      {SOFTWARE.map((l) => {
        const diff = l.sep - l.aug
        return (
          <li key={l.name} className="flex items-center gap-3 text-sm">
            <span className="text-foreground w-32 shrink-0 truncate sm:w-40">
              {l.name}
            </span>
            <span className="bg-muted relative h-2 flex-1 rounded-full">
              <span
                className="bg-chart-3 absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(l.aug / max) * 100}%` }}
              />
              <span
                className="bg-chart-1 absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(l.sep / max) * 100}%`,
                  opacity: diff > 0 ? 1 : 0.45,
                }}
              />
            </span>
            <span className="text-foreground w-16 shrink-0 text-right tabular-nums">
              {kr(l.sep)}
            </span>
            <span
              className={cn(
                "w-16 shrink-0 text-right text-xs tabular-nums",
                diff > 0 ? "text-brand-contrast" : "text-muted-foreground",
              )}
            >
              {diff > 0
                ? `+${kr(diff)}`
                : diff < 0
                  ? `−${kr(-diff)}`
                  : "uendret"}
            </span>
          </li>
        )
      })}
      <li className="text-muted-foreground flex flex-wrap items-center gap-x-4 pt-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-1 size-2 rounded-full" aria-hidden="true" />
          September
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-3 size-2 rounded-full" aria-hidden="true" />
          August
        </span>
        <span className="sm:ml-auto">Kr per måned, eks. mva.</span>
      </li>
    </ul>
  )
}

/** The flags, written up as Truls' notes at the end of the report. */
function Notes({ onAsk }: { onAsk: (text: string) => void }) {
  const { change } = softwareTotals()
  return (
    <Card>
      <CardLabel>Merknader fra {ACCOUNTANT.first}</CardLabel>
      <ol className="flex flex-col gap-4">
        {FLAGS.map((flag, i) => (
          <li key={flag.id} className="flex gap-3 text-sm">
            <span className="text-muted-foreground w-4 shrink-0 tabular-nums">
              {i + 1}.
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-foreground font-medium">
                {flag.expands
                  ? `Programvare økte ${Math.round(change * 100)} % siden august`
                  : flag.title}
              </span>
              <span className="text-muted-foreground text-pretty">
                {flag.detail}
              </span>
              {flag.expands ? (
                <div className="pt-1">
                  <SoftwareLines />
                </div>
              ) : null}
              {flag.ask ? (
                <div className="flex flex-wrap gap-2 pt-1 print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAsk(flag.ask!)}
                  >
                    <MessagesSquareIcon
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                    Spør {ACCOUNTANT.first}
                  </Button>
                  {flag.bank ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={BANK_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      Til bank
                      <ExternalLinkIcon
                        data-icon="inline-end"
                        className="text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** The year against its goal: invoiced so far, booked for the rest, the gap. */
function GoalCard() {
  const invoiced = invoicedYtd()
  const booked = bookedAhead()
  const landing = invoiced + booked
  const gap = GOAL_2026 - landing
  const pct = (v: number) => `${Math.min(100, (v / GOAL_2026) * 100)}%`
  return (
    <Card>
      <CardLabel aside={`Mål ${mnok(GOAL_2026)}`}>Omsetning 2026</CardLabel>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
        <span className="text-foreground text-3xl font-medium tracking-tight whitespace-nowrap tabular-nums">
          {mnok(invoiced)}
        </span>
        <span className="text-muted-foreground text-sm">
          fakturert til og med september
        </span>
      </div>
      <div
        className="bg-muted relative h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${mnok(invoiced)} fakturert og ${mnok(booked)} booket, av målet på ${mnok(GOAL_2026)}`}
      >
        <div
          className="bg-chart-3 absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(landing) }}
        />
        <div
          className="bg-chart-1 absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(invoiced) }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-chart-1 size-2 rounded-full" aria-hidden="true" />
          Fakturert{" "}
          <span className="text-foreground tabular-nums">{mnok(invoiced)}</span>
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-chart-3 size-2 rounded-full" aria-hidden="true" />
          Booket okt–des{" "}
          <span className="text-foreground tabular-nums">{mnok(booked)}</span>
        </span>
        <span className="text-muted-foreground sm:ml-auto">
          Lander på{" "}
          <span className="text-foreground tabular-nums">{mnok(landing)}</span>,{" "}
          <span className="text-foreground tabular-nums">
            {kr(Math.abs(gap))} kr
          </span>{" "}
          {gap > 0 ? "under målet" : "over målet"}
        </span>
      </div>
    </Card>
  )
}

const chartConfig = {
  booket: { label: "Booket", color: "var(--chart-3)" },
  fakturert: { label: "Fakturert", color: "var(--chart-1)" },
} satisfies ChartConfig

/** Booked against invoiced, per month. Oct–Dec are booked only. */
function BookedChart({ className }: { className?: string }) {
  const doc = useContext(DocContext)
  return (
    <Card className={className}>
      <CardLabel aside="kr per måned · 2026">Booket mot fakturert</CardLabel>
      <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
        <BarChart
          data={MONTHS}
          barCategoryGap="22%"
          barGap={2}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            className="stroke-border"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            className="fill-muted-foreground"
          />
          {doc ? null : (
            <ChartTooltip
              cursor={{ fill: "var(--muted)", radius: 6 }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {name === "booket" ? "Booket" : "Fakturert"}
                      </span>
                      <span className="text-foreground font-medium tabular-nums">
                        {kr(Number(value))} kr
                      </span>
                    </div>
                  )}
                />
              }
            />
          )}
          <Bar
            dataKey="booket"
            fill="var(--color-booket)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!doc}
          />
          <Bar
            dataKey="fakturert"
            fill="var(--color-fakturert)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!doc}
          />
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-chart-3 size-2 rounded-full" aria-hidden="true" />
          Booket
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-chart-1 size-2 rounded-full" aria-hidden="true" />
          Fakturert
        </span>
        <span className="text-muted-foreground sm:ml-auto">
          Okt–des er booket, ikke fakturert ennå.
        </span>
      </div>
    </Card>
  )
}

/** Billable share per consultant against the 80 % target. */
function Utilization({ className }: { className?: string }) {
  const below = CONSULTANTS.filter(
    (c) => c.utilization < UTILIZATION_TARGET && c.name !== CONTACT.name,
  )
  return (
    <Card className={className}>
      <CardLabel aside={`Mål ${UTILIZATION_TARGET} %`}>
        Faktureringsgrad per konsulent
      </CardLabel>
      <ul className="flex flex-col gap-2.5">
        {CONSULTANTS.map((c) => {
          const hit = c.utilization >= UTILIZATION_TARGET
          return (
            <li key={c.name} className="flex items-center gap-3 text-sm">
              <span className="text-foreground w-24 shrink-0 truncate sm:w-28">
                {c.name === CONTACT.name
                  ? `${CONTACT.first} (deg)`
                  : c.name.split(" ")[0]}
              </span>
              <span className="bg-muted relative h-2 flex-1 rounded-full">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    hit ? "bg-chart-2" : "bg-chart-3",
                  )}
                  style={{ width: `${c.utilization}%` }}
                />
                <span
                  className="bg-foreground/40 absolute -inset-y-1 w-px"
                  style={{ left: `${UTILIZATION_TARGET}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="text-foreground w-9 shrink-0 text-right tabular-nums">
                {c.utilization} %
              </span>
            </li>
          )
        })}
      </ul>
      {below.length ? (
        <p className="text-muted-foreground text-xs text-pretty">
          {below.map((c) => c.name.split(" ")[0]).join(" og ")} ligger under
          målet.
        </p>
      ) : null}
    </Card>
  )
}

/** Who the revenue comes from, and how each one moved against last year. */
function TopClients({ className }: { className?: string }) {
  const max = Math.max(...TOP_CLIENTS.map((c) => c.ytd))
  const fresh = TOP_CLIENTS.filter((c) => !c.lastYear)
  const freshSum = fresh.reduce((s, c) => s + c.ytd, 0)
  return (
    <Card className={className}>
      <CardLabel aside="hittil i år · mot i fjor">Største kunder</CardLabel>
      <ul className="flex flex-col gap-2.5">
        {TOP_CLIENTS.map((c) => {
          const change = c.lastYear ? (c.ytd - c.lastYear) / c.lastYear : null
          return (
            <li key={c.name} className="flex items-center gap-3 text-sm">
              <span className="flex w-32 shrink-0 items-center gap-1.5 sm:w-40">
                <span className="text-foreground truncate">{c.name}</span>
                {c.lastYear ? null : (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="bg-brand/10 text-brand-contrast shrink-0 border-transparent"
                  >
                    Ny
                  </Badge>
                )}
              </span>
              <span className="bg-muted relative h-2 flex-1 rounded-full">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    c.lastYear ? "bg-chart-2" : "bg-chart-1",
                  )}
                  style={{ width: `${(c.ytd / max) * 100}%` }}
                />
              </span>
              <span className="text-foreground w-16 shrink-0 text-right tabular-nums">
                {mnok(c.ytd)}
              </span>
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-xs tabular-nums",
                  change === null
                    ? "text-brand-contrast"
                    : change < 0
                      ? "text-warning-text"
                      : "text-success-text",
                )}
              >
                {change === null
                  ? "ny"
                  : `${change > 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)} %`}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground text-xs text-pretty">
        {fresh.length} nye kunder står for {mnok(freshSum)} i år. Tindra Helse
        er den eneste som har gått ned.
      </p>
    </Card>
  )
}

/** Four consulting KPIs with what they are measured against. */
function Kpis({
  report,
  className,
}: {
  report: MonthReport
  className?: string
}) {
  return (
    <Card className={className}>
      <CardLabel aside={report.label}>Nøkkeltall</CardLabel>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {report.kpis.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{k.label}</dt>
            <dd className="text-foreground text-xl font-medium tracking-tight tabular-nums">
              {k.value}
            </dd>
            <dd className="text-muted-foreground text-xs">{k.hint}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** A deadline's state, icon and label in one colour. */
function DeadlineState({
  d,
  done,
}: {
  d: Deadline
  done: Record<string, string>
}) {
  // Approving payroll in the timeline settles the matching deadline.
  const status =
    d.label === "Godkjenn lønn" && done["lonn-okt"] ? "done" : d.status
  if (status === "done")
    return (
      <span className="text-success-text flex items-center gap-1 text-xs font-medium">
        <CheckIcon className="size-3.5" aria-hidden="true" />
        {DEADLINE_STATUS.done}
      </span>
    )
  if (status === "you" || d.warn)
    return (
      <span className="bg-brand/10 text-brand-contrast rounded-full px-2 py-0.5 text-xs font-medium">
        {status === "you" ? DEADLINE_STATUS.you : relative(d.date)}
      </span>
    )
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      <ClockIcon className="size-3.5" aria-hidden="true" />
      {DEADLINE_STATUS[status]}
    </span>
  )
}

function DeadlineRow({
  d,
  done,
}: {
  d: Deadline
  done: Record<string, string>
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground w-12 shrink-0 tabular-nums">
          {dayLabel(d.date)}
        </span>
        <span className="text-foreground min-w-0 flex-1">{d.label}</span>
        <DeadlineState d={d} done={done} />
      </div>
      {d.note ? (
        <p className="text-muted-foreground pl-15 text-xs text-pretty">
          {d.note}
        </p>
      ) : null}
    </li>
  )
}

function Deadlines({
  className,
  done,
}: {
  className?: string
  done: Record<string, string>
}) {
  const [first, ...rest] = DEADLINES
  return (
    <Card className={className}>
      <CardLabel>Frister i {first.month.toLowerCase()}</CardLabel>
      <ul className="flex flex-col gap-3">
        {first.items.map((d) => (
          <DeadlineRow key={d.date} d={d} done={done} />
        ))}
      </ul>
      {rest.map((group) => (
        <div
          key={group.month}
          className="border-border flex flex-col gap-3 border-t pt-4"
        >
          <span className="text-muted-foreground text-xs font-medium">
            {group.month}
          </span>
          <ul className="flex flex-col gap-3">
            {group.items.map((d) => (
              <DeadlineRow key={d.date} d={d} done={done} />
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}

// ── Meldinger ──

/** What Truls says back in the demo, keyed on what was asked. */
function trulsReplies(text: string, asked: Message | undefined): string | null {
  const t = text.toLowerCase().trim()
  const question = asked?.from === "truls" && asked.text.trim().endsWith("?")
  if (question && asked.text === LIVE_MESSAGE) {
    return /^(ja|yes|jepp|gjerne)/.test(t)
      ? "Supert, da fordeler jeg den over 12 måneder. Oppgaven er ute av listen din."
      : /^nei/.test(t)
        ? "Greit, da tar jeg alt i oktober. Oppgaven er ute av listen din."
        : null
  }
  if (question && /^(ja|jepp|gjerne)/.test(t)) return "Supert, da gjør jeg det."
  if (question && /^nei/.test(t)) return "Greit, da lar jeg det ligge."
  if (
    t.includes("husleie") ||
    t.includes("sparekonto") ||
    t.includes("overfør")
  )
    return "Ja, jeg flytter 25 000 kr fra sparekontoen 30. oktober, så er husleien dekket. Vil du at jeg flytter 100 000 i stedet, så dere har litt luft i november?"
  if (t.includes("purring"))
    return "Ja, jeg sender purring til begge i dag. Havlyst får en vennlig én siden de pleier å betale sent, Brekke Consulting får standard. Ok?"
  if (t.includes("programvare"))
    return "184 300 kr hittil i år, 21 % mer enn på samme tid i fjor. De største postene er Anthropic, Figma og OpenAI."
  if (t.includes("utbytte"))
    return "Ja, det er rom for det. Fri egenkapital per september er 2,1 MNOK. Si hvor mye, så lager jeg styrevedtaket."
  if (t.includes("konsulent"))
    return "Rundt 98 000 kr i måneden alt inkludert, med 780 000 i årslønn, arbeidsgiveravgift og pensjon. Vil du ha regnestykket?"
  if (t.includes("bonus"))
    return "Send meg beløp per person, så legger jeg det inn på novemberlønnen."
  if (t.includes("firmabil") || t.includes("bil"))
    return "Elbil til 450 000 koster dere rundt 6 200 kr i måneden etter skatt. Kjøregodtgjørelse for Jonas lå på 1 900 i snitt. Jeg ville latt være."
  return `Takk, ${CONTACT.first}! Jeg ser på det og svarer deg i løpet av dagen.`
}

function Bubble({ message, ai }: { message: Message; ai?: boolean }) {
  const you = message.from === "you"
  return (
    <li
      className={cn(
        "flex max-w-[85%] flex-col gap-1",
        you ? "self-end items-end" : "self-start",
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm text-pretty",
          you
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {message.text}
      </div>
      <span className="text-muted-foreground px-1 text-[11px]">
        {you ? "Du" : ai ? "Sanna" : ACCOUNTANT.first}
        <span aria-hidden="true"> · </span>
        {message.at}
      </span>
    </li>
  )
}

function ThreadStatus({ thread }: { thread: Thread }) {
  if (thread.status === "resolved")
    return (
      <span className="text-success-text flex items-center gap-1 text-xs font-medium">
        <CheckIcon className="size-3.5" aria-hidden="true" />
        Løst {thread.updated}
      </span>
    )
  if (thread.status === "ai")
    return (
      <span className="text-muted-foreground text-xs">
        KI · {thread.updated.toLowerCase()}
      </span>
    )
  return <span className="text-muted-foreground text-xs">{thread.updated}</span>
}

function Messages({
  active,
  prefill,
  settled,
  onSettle,
}: {
  active: boolean
  /** The Nordic Cloud question was already answered on the timeline. */
  settled: boolean
  /** A question pre-written by a flag; a new value lands in the composer. */
  prefill: { text: string; n: number } | null
  /** "Ja" to Truls' question settles the matching task on the timeline. */
  onSettle: (todoId: string, what: string) => void
}) {
  const [threads, setThreads] = useState<Thread[]>(THREADS)
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<"truls" | "sanna">("truls")
  const [draft, setDraft] = useState("")
  const [typing, setTyping] = useState<string | null>(null)
  const arrived = useRef(false)
  const seq = useRef(0)
  const nextId = (prefix: string) => `${prefix}-${++seq.current}`
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const thread =
    mode === "sanna"
      ? threads.find((t) => t.id === "sanna")
      : threads.find((t) => t.id === selected)

  /** Truls or Sanna: who the pane talks to. */
  const toggle = (
    <div
      className="bg-muted flex rounded-lg p-0.5 text-xs font-medium"
      role="group"
      aria-label="Hvem vil du spørre"
    >
      {(
        [
          ["truls", ACCOUNTANT.first],
          ["sanna", "Sanna (KI)"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setMode(value)}
          className={cn(
            "focus-visible:ring-ring/50 flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors outline-none focus-visible:ring-[3px]",
            mode === value
              ? "bg-card text-foreground shadow-stamp"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "sanna" ? (
            <SparklesIcon className="text-brand size-3" aria-hidden="true" />
          ) : null}
          {label}
        </button>
      ))}
    </div>
  )
  const push = (id: string, message: Message, patch?: Partial<Thread>) =>
    setThreads((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, ...patch, messages: [...t.messages, message] }
          : t,
      ),
    )

  // The first visit: Truls is writing, and his message lands in this month's thread.
  useEffect(() => {
    if (!active || arrived.current) return
    let cancelled = false
    ;(async () => {
      await wait(800)
      if (cancelled) return
      setTyping("okt")
      await wait(1600)
      if (cancelled) return
      setTyping(null)
      // Once: strict mode's first run is cancelled above before it gets here.
      arrived.current = true
      const text = settled ? LIVE_MESSAGE_SETTLED : LIVE_MESSAGE
      setThreads((ts) =>
        ts.map((t) =>
          t.id !== "okt" || t.messages.some((m) => m.id === "live")
            ? t
            : {
                ...t,
                updated: "Nå",
                messages: [
                  ...t.messages,
                  { id: "live", from: "truls", text, at: "Nå" },
                ],
              },
        ),
      )
    })()
    return () => {
      cancelled = true
      setTyping(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the answer at arrival time is the one that counts
  }, [active])

  // A flag's question lands in the composer of this month's thread: state
  // adjusted from the prop during render, the React way, so no effect.
  const [seenPrefill, setSeenPrefill] = useState(0)
  if (prefill && prefill.n !== seenPrefill) {
    setSeenPrefill(prefill.n)
    setMode("truls")
    setSelected("okt")
    setDraft(prefill.text)
  }

  useEffect(() => {
    if (active && thread) endRef.current?.scrollIntoView({ block: "nearest" })
  }, [thread?.messages.length, typing, active, thread])

  async function send(text: string) {
    if (!thread) return
    const clean = text.trim()
    if (!clean) return
    const id = thread.id
    const asked = thread.messages[thread.messages.length - 1]
    push(
      id,
      { id: nextId("you"), from: "you", text: clean, at: "Nå" },
      { updated: "Nå" },
    )
    setDraft("")
    // What was said so far, for the model.
    const history: Turn[] = thread.messages.map((m) => ({
      role: m.from === "you" ? "user" : "assistant",
      text: m.text,
    }))
    if (thread.status === "ai") {
      // Sanna answers from the books: the model when there is one, the
      // canned answers otherwise.
      setTyping(id)
      const text =
        (await askModel("sanna", clean, history)) ?? askNumbers(clean)
      setTyping(null)
      push(id, { id: nextId("ai"), from: "truls", text, at: "Nå" })
      return
    }
    const canned = trulsReplies(clean, asked)
    const settling = asked?.text === LIVE_MESSAGE && canned
    if (settling)
      onSettle(
        "nordic-cloud",
        /^nei/i.test(clean) ? "Alt i oktober" : "Fordel over året",
      )
    // He reads it first, then writes. His answer comes from the model
    // when there is one; the yes/no on his own question stays scripted so
    // the task settles the same way every time.
    const pending = settling
      ? Promise.resolve(canned)
      : askModel("truls", clean, history)
    await wait(1200)
    setTyping(id)
    const [answer] = await Promise.all([pending, wait(1300)])
    setTyping(null)
    push(id, {
      id: nextId("truls"),
      from: "truls",
      text: answer ?? canned ?? trulsReplies(clean, undefined) ?? "",
      at: "Nå",
    })
  }

  function resolve(id: string) {
    setThreads((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status: "resolved", updated: dayLabel(TODAY) }
          : t,
      ),
    )
    toast.success("Lagret som løst", {
      description: "Du finner den igjen under Meldinger.",
    })
  }

  const unread = (t: Thread) =>
    t.id === "okt" &&
    t.messages.some((m) => m.id === "live") &&
    selected !== "okt"

  // The list: open first, Sanna, then what's settled.
  if (!thread) {
    const order = { open: 0, ai: 1, resolved: 2 }
    const list = [...threads]
      .filter((t) => t.status !== "ai")
      .sort((a, b) => order[a.status] - order[b.status])
    return (
      <Card className="gap-0 p-0">
        <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground text-[15px] font-medium">
              Samtaler med {ACCOUNTANT.first}
            </span>
            <span className="text-muted-foreground text-xs">
              Løste saker blir liggende her
            </span>
          </div>
          {toggle}
        </div>
        <ul className="flex flex-col">
          {list.map((t) => {
            const last = t.messages[t.messages.length - 1]
            const ai = t.status === "ai"
            return (
              <li key={t.id} className="border-border border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none focus-visible:ring-[3px]",
                    t.status === "resolved" && "opacity-70",
                  )}
                >
                  {ai ? <SannaMark /> : <TrulsPhoto />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-foreground truncate text-sm font-medium">
                        {t.title}
                      </span>
                      {unread(t) ? (
                        <span
                          className="bg-brand size-2 shrink-0 rounded-full"
                          aria-label="Ny melding"
                        />
                      ) : null}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {ai
                        ? "Spør om tallene, får svar med en gang. Truls ser alt."
                        : last
                          ? `${last.from === "you" ? "Du: " : ""}${last.text}`
                          : null}
                    </span>
                  </span>
                  <span className="shrink-0">
                    <ThreadStatus thread={t} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
    )
  }

  const ai = thread.status === "ai"
  const last = thread.messages[thread.messages.length - 1]
  const unanswered =
    ai && last?.from === "truls" && last.text.startsWith("Det fant jeg ikke")
  const lastQuestion = thread.messages[thread.messages.length - 2]?.text ?? ""
  const quick =
    !ai &&
    !typing &&
    last?.from === "truls" &&
    last.text.trim().endsWith("?") &&
    thread.status === "open" &&
    // Answered on the timeline in the meantime: nothing left to say yes to.
    !(last.text === LIVE_MESSAGE && settled)
  const starters = ai ? AI_STARTERS : STARTERS

  return (
    <Card className="gap-0 p-0">
      <div className="border-border flex items-center gap-3 border-b px-3 py-3 sm:px-4">
        {ai ? null : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setSelected(null)}
            aria-label="Tilbake til samtalene"
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
        )}
        {ai ? <SannaMark /> : <TrulsPhoto className="size-9" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground truncate text-[15px] font-medium">
            {thread.title}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
            {ai ? (
              <>
                <SparklesIcon
                  className="text-brand size-3"
                  aria-hidden="true"
                />
                Sanna svarer med KI fra regnskapet. {ACCOUNTANT.first} ser alt.
              </>
            ) : (
              <>
                <span
                  className="bg-success size-1.5 shrink-0 rounded-full"
                  aria-hidden="true"
                />
                {ACCOUNTANT.name} · {ACCOUNTANT.title.toLowerCase()}
              </>
            )}
          </span>
        </div>
        {thread.status === "open" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resolve(thread.id)}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            Marker som løst
          </Button>
        ) : thread.status === "resolved" ? (
          <ThreadStatus thread={thread} />
        ) : (
          toggle
        )}
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        <ul className="flex flex-col gap-4">
          {thread.messages.map((m) => (
            <Bubble key={m.id} message={m} ai={ai} />
          ))}
          {typing === thread.id ? (
            <li className="text-muted-foreground flex items-center gap-2 self-start text-xs">
              <span className="bg-muted flex gap-1 rounded-2xl rounded-bl-md px-3.5 py-3">
                <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
                <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
                <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full" />
              </span>
              {ACCOUNTANT.first} skriver
            </li>
          ) : null}
        </ul>
        <div ref={endRef} />
      </div>
      {thread.status === "resolved" ? (
        <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-5 py-4 text-xs">
          <span>Denne saken er løst og lagret.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setThreads((ts) =>
                ts.map((t) =>
                  t.id === thread.id ? { ...t, status: "open" } : t,
                ),
              )
            }
          >
            Gjenåpne
          </Button>
        </div>
      ) : (
        <div className="border-border flex flex-col gap-3 border-t px-5 py-4">
          {unanswered ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setMode("truls")
                setSelected("okt")
                setDraft(lastQuestion)
              }}
            >
              <MessagesSquareIcon data-icon="inline-start" aria-hidden="true" />
              Send til {ACCOUNTANT.first}
            </Button>
          ) : null}
          {quick ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => send("Ja")}>
                <CheckIcon data-icon="inline-start" aria-hidden="true" />
                Ja
              </Button>
              <Button size="sm" variant="outline" onClick={() => send("Nei")}>
                Nei
              </Button>
            </div>
          ) : thread.messages.length ===
            THREADS.find((t) => t.id === thread.id)?.messages.length ? (
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="bg-background text-foreground border-border hover:bg-muted focus-visible:ring-ring/50 rounded-full border px-3 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-[3px]"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              placeholder={
                ai ? "Spør om tallene …" : `Skriv til ${ACCOUNTANT.first}…`
              }
              aria-label={ai ? "Spør Sanna" : `Melding til ${ACCOUNTANT.first}`}
              rows={1}
              className="bg-background min-h-10 flex-1 resize-none rounded-xl"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <SendIcon aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
    </Card>
  )
}

// ── Page ──

export function KundeDashboard({ className }: { className?: string }) {
  const [pane, setPane] = useState<Pane>("todo")
  const [done, setDone] = useState<Record<string, string>>({})
  const [states, setStates] = useState<Record<string, TaskState>>({})
  const [booked, setBooked] = useState<Recognised[]>([])
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const [payroll, setPayroll] = useState(false)
  const [seenMessages, setSeenMessages] = useState(false)
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(
    null,
  )
  const [monthId, setMonthId] = useState(MONTH_REPORTS[0].id)
  const report = MONTH_REPORTS.find((m) => m.id === monthId) ?? MONTH_REPORTS[0]
  const open = TODOS.filter((t) => !done[t.id]).length

  const setState = (id: string, state: TaskState) =>
    setStates((s) => ({ ...s, [id]: state }))

  /** Sent: the card shows it going, then moves to the done list. */
  async function finish(id: string, what: string, quiet = false) {
    setState(id, { sending: `Sender til ${ACCOUNTANT.first}` })
    await wait(1100)
    setState(id, {})
    setDone((d) => (d[id] ? d : { ...d, [id]: what }))
    if (!quiet)
      toast.success(`Sendt til ${ACCOUNTANT.first}`, {
        description: "Du hører fra ham her om noe mer trengs.",
      })
  }

  function openPane(next: Pane, ask?: string) {
    setPane(next)
    if (next === "messages") setSeenMessages(true)
    if (ask) setPrefill((p) => ({ text: ask, n: (p?.n ?? 0) + 1 }))
    if (next !== "todo") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div
      className={cn(
        "sanna bg-background text-foreground min-h-svh w-full font-sans antialiased",
        className,
      )}
    >
      <TopBar onChat={() => openPane("messages")} />
      <main className="mx-auto flex w-full max-w-[920px] flex-col gap-8 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
        <div className={cn(ENTER, "print:hidden")}>
          <Greeting open={open} />
        </div>

        <Tabs
          value={pane}
          onValueChange={(v) => openPane(v as Pane)}
          className={cn("gap-6", ENTER)}
          style={{ animationDelay: "100ms" }}
        >
          <TabsList className="bg-muted w-full group-data-horizontal/tabs:h-10 print:hidden">
            <TabsTrigger
              value="todo"
              className="data-active:bg-card data-active:shadow-stamp"
            >
              <ListTodoIcon className="size-4" aria-hidden="true" />
              Dine oppgaver
              <Badge variant="outline" size="sm" className="tabular-nums">
                {open}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className="data-active:bg-card data-active:shadow-stamp"
            >
              <MessagesSquareIcon className="size-4" aria-hidden="true" />
              Meldinger
              {!seenMessages ? (
                <Badge
                  variant="outline"
                  size="sm"
                  className="bg-brand/10 text-brand-contrast border-transparent tabular-nums"
                >
                  1
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="numbers"
              className="data-active:bg-card data-active:shadow-stamp"
            >
              <FileTextIcon className="size-4" aria-hidden="true" />
              Månedsavslutning
            </TabsTrigger>
          </TabsList>

          <TabsContent value="todo" keepMounted className="flex flex-col gap-8">
            <UploadBox
              incoming={incoming}
              onRead={(result, from) => {
                setBooked((b) => [result, ...b])
                if (!from) return
                // The task asked for one document; another one is the wrong one.
                const expected = supplier(from.expect)
                if (result.supplier === expected.supplier)
                  void finish(
                    from.todoId,
                    `${result.supplier}, ${kr(result.amount)} kr`,
                    true,
                  )
                else
                  setState(from.todoId, {
                    error: `Dette ser ut som ${result.supplier}, ikke fakturaen fra ${expected.supplier.replace(/ AS$/, "")}. Last opp på nytt.`,
                  })
              }}
            />
            <Timeline
              done={done}
              states={states}
              booked={booked}
              onDone={(id, what) => void finish(id, what)}
              onApprove={() => setPayroll(true)}
              onUpload={(todo, file) => {
                setState(todo.id, { sending: "Leser fakturaen" })
                setIncoming({ file, todoId: todo.id, expect: "proshop" })
              }}
              onComment={(todo) =>
                openPane("messages", `Om ${todo.title.replace(/,.*$/, "")}: `)
              }
            />
          </TabsContent>

          <TabsContent value="messages" keepMounted>
            <Messages
              active={pane === "messages"}
              settled={Boolean(done["nordic-cloud"])}
              prefill={prefill}
              onSettle={(id, what) => void finish(id, what, true)}
            />
          </TabsContent>

          <TabsContent
            value="numbers"
            keepMounted
            className="flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-center gap-2 px-1 print:hidden">
              <Select
                value={monthId}
                items={MONTH_REPORTS.map((m) => ({
                  value: m.id,
                  label: m.label,
                }))}
                onValueChange={(value) => value && setMonthId(String(value))}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Velg måned"
                  className="bg-card shadow-stamp border-transparent"
                >
                  <SelectValue className="text-foreground" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {MONTH_REPORTS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-sm">
                {monthId === MONTH_REPORTS[0].id
                  ? "sist lukkede måned"
                  : "lukket måned"}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => window.print()}
              >
                <PrinterIcon data-icon="inline-start" aria-hidden="true" />
                Last ned PDF
              </Button>
            </div>

            <DocContext value={true}>
              <article
                aria-label={`Månedsavslutning ${report.label}`}
                className="bg-card shadow-stamp flex flex-col gap-6 rounded-md px-5 py-8 [counter-reset:section] sm:px-12 sm:py-12 print:rounded-none print:p-0 print:shadow-none"
              >
                <header className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                        <ZapIcon
                          className="size-3 fill-current"
                          aria-hidden="true"
                        />
                        Sanna · Månedsavslutning
                      </span>
                      <h2 className="text-foreground text-2xl font-medium tracking-tight sm:text-3xl">
                        {report.label}
                      </h2>
                      <span className="text-muted-foreground text-sm">
                        {FIRM.name} · org.nr {FIRM.orgNo}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 sm:text-right">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-foreground font-medium">
                          Utarbeidet av {ACCOUNTANT.name}
                        </span>
                        <span className="text-muted-foreground">
                          {report.prepared}
                        </span>
                        <span className="text-muted-foreground">
                          Tall per {report.asOf}, fra Tripletex
                        </span>
                      </div>
                      <TrulsPhoto className="size-10 sm:order-first" />
                    </div>
                  </div>
                  <div className="text-foreground flex flex-col gap-2 text-sm text-pretty">
                    {report.summary.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </header>

                <StatTiles report={report} />
                <Kpis report={report} />
                <GoalCard />
                <BookedChart />
                <Utilization />
                <TopClients />
                <Deadlines done={done} />
                {monthId === MONTH_REPORTS[0].id ? (
                  <Notes onAsk={(text) => openPane("messages", text)} />
                ) : null}

                <footer className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs">
                  <span>
                    Spørsmål om tallene? Skriv til {ACCOUNTANT.first} i
                    Meldinger.
                  </span>
                  <span>Side 1 av 1</span>
                </footer>
              </article>
            </DocContext>
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs print:hidden">
          <span>
            {FIRM.name} · org.nr {FIRM.orgNo}
          </span>
          <a
            href={TRIPLETEX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Tripletex
          </a>
        </p>
      </main>
      <PayrollDialog
        open={payroll}
        onOpenChange={setPayroll}
        onApprove={() => {
          setPayroll(false)
          void finish("lonn-okt", "Godkjent, 612 000 kr")
        }}
      />
    </div>
  )
}
