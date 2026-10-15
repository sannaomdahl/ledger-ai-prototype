// Every document we hold for a client, in one place: what the inbox and the
// bank feed brought in, what the customer uploaded, and what the firm sent
// out (returns, reports). Each file says who it came from, how, when, and
// what it belongs to. Built from the same items, requests and sign-offs the
// rest of the workspace shows, so nothing here is stored twice. A client
// handed over from onboarding also keeps what onboarding collected: the
// SAF-T files, the KYC answers, the handover letter and the engagement
// agreement as signed.
import { addDays, CLIENT_BY_ID, hash, MONTHS, monthLabel, TAB_LABEL, tabOf } from "./data"
import { TODAY } from "./deadlines"
import { getClientFilings, type Filing } from "./filings"
import { bankAccounts, company, FIRM, formatDay, formatKr, type OnboardingCase } from "./onboarding"
import { closeKey } from "./report"
import type { Signoffs } from "./signoffs"
import type { Client, CustomerRequest, ReviewItem } from "./types"

export type FolderKey =
  | "invoices"
  | "receipts"
  | "payroll"
  | "bank"
  | "customer"
  | "filings"
  | "reports"
  | "company"

/** The categories inside each year, in the order an accountant looks. */
export const FOLDERS: { key: FolderKey; label: string; hint: string }[] = [
  { key: "bank", label: "Bank statements", hint: "Month-end statements from DNB" },
  { key: "invoices", label: "Supplier invoices", hint: "From the EHF and e-mail inbox" },
  { key: "receipts", label: "Receipts", hint: "Card and Vipps purchases" },
  { key: "payroll", label: "Payroll", hint: "Timesheets, contracts, payslips, A-melding" },
  { key: "filings", label: "Filings", hint: "Returns and receipts from Altinn" },
  { key: "reports", label: "Monthly reports", hint: "Sent to the customer" },
  { key: "customer", label: "From the customer", hint: "Sent with questions and answers" },
  { key: "company", label: "Company & engagement", hint: "Registration, the engagement agreement, onboarding" },
]

/** A document we can show the gist of without the original: an agreement,
    a set of answers. */
export type FileSummary = {
  title: string
  rows: [label: string, value: string][]
  sections?: { title: string; rows: [label: string, value: string][] }[]
  note?: string
}

export type Uploader = "customer" | "firm" | "agent" | "system"

export type FileEntry = {
  id: string
  name: string
  folder: FolderKey
  /** When it reached us, "2026-09-22T14:32". */
  at: string
  /** Who sent or made it. */
  by: { name: string; kind: Uploader }
  /** The channel: "Customer app", "EHF inbox", "DNB bank feed"… */
  via: string
  /** What it belongs to, and where that is worked on. */
  link?: {
    label: string
    detail: string
    itemId?: string
    requestId?: string
    href?: string
  }
  /** For the preview: the line a demo file is rendered from. */
  itemId?: string
  /** For the preview: what the document says, when there is no line. */
  summary?: FileSummary
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A deterministic time of day, so the same file always arrived at the
    same minute. Office hours for people, early morning for feeds. */
function clock(seed: string, feed = false) {
  const h = hash(seed)
  const hour = feed ? 5 + (h % 2) : 8 + (h % 10)
  return `${String(hour).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`
}

function capped(date: string) {
  return date > TODAY ? TODAY : date
}

/** Reads the free-text times on requests ("Yesterday 16:40", "Tue 22 Sep",
    "Last week") into a date and time. */
export function parseWhen(text: string | undefined, fallback: string, seed: string): string {
  const time = text?.match(/(\d{1,2}):(\d{2})/)?.[0]
  const at = (date: string) => `${capped(date)}T${(time ?? clock(seed)).padStart(5, "0")}`
  if (!text) return at(fallback)
  if (/just now|minutes? ago|hours? ago|this morning|today|drafted/i.test(text)) return at(TODAY)
  if (/yesterday/i.test(text)) return at(addDays(TODAY, -1))
  const days = text.match(/(\d+) days? ago/i)
  if (days) return at(addDays(TODAY, -Number(days[1])))
  if (/last week/i.test(text)) return at(addDays(TODAY, -7))
  const dated = text.match(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)
  if (dated) {
    const month = String(MONTHS_SHORT.indexOf(dated[2]) + 1).padStart(2, "0")
    return at(`${TODAY.slice(0, 4)}-${month}-${dated[1].padStart(2, "0")}`)
  }
  return at(fallback)
}

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

/** One document can sit on several lines: the month's Planday export
    covers everyone on the run. Per-line documents stay apart. */
const PER_LINE = /^(payslip|receipt|contract)\.(pdf|jpe?g)$/i

/** Evidence labels that are not files (an answer typed in, a note). */
const NOT_A_FILE = new Set(["Reply", "Note"])

function folderOf(item: ReviewItem): FolderKey {
  if (item.domain === "payroll") return "payroll"
  return item.kind === "receipt" ? "receipts" : "invoices"
}

function itemLink(item: ReviewItem) {
  return {
    label: item.title,
    detail: `${TAB_LABEL[tabOf(item)]} · ${monthLabel(item.period)}`,
    itemId: item.id,
  }
}

function contactName(client: Client, id?: string) {
  return client.contacts.find((c) => c.id === id)?.name ?? client.contacts[0].name
}

function itemFile(client: Client, item: ReviewItem): FileEntry | undefined {
  const name = item.evidence.fileName
  if (!item.evidence.attached || !name || NOT_A_FILE.has(name)) return undefined
  const date = item.date.slice(0, 10)
  const seed = `${item.id}-file`
  if (item.domain === "payroll") {
    const timesheet = /\.csv$/i.test(name)
    const taxCard = /skattekort/i.test(name)
    const payslip = /payslip|lonn/i.test(name)
    return {
      id: `item:${item.id}`,
      name,
      folder: "payroll",
      at: timesheet
        ? `${capped(lastDay(item.period))}T${clock(seed, true)}`
        : `${capped(payslip ? date : `${item.period}-0${1 + (hash(seed) % 9)}`)}T${clock(seed, payslip)}`,
      by: timesheet
        ? { name: "Planday", kind: "system" }
        : taxCard
          ? { name: "Skatteetaten", kind: "system" }
          : payslip
            ? { name: "Tripletex", kind: "system" }
            : { name: contactName(client), kind: "customer" },
      via: timesheet ? "Planday sync" : taxCard ? "Altinn" : payslip ? "Pay run" : "Customer app",
      link: itemLink(item),
      itemId: item.id,
    }
  }
  const ehf = /^EHF/i.test(name)
  const receipt = item.kind === "receipt"
  return {
    id: `item:${item.id}`,
    name,
    folder: folderOf(item),
    at: `${capped(addDays(date, receipt ? 0 : hash(seed) % 3))}T${clock(seed, ehf)}`,
    by: receipt
      ? { name: contactName(client), kind: "customer" }
      : { name: item.title, kind: "system" },
    via: ehf ? "EHF inbox" : receipt ? "Customer app" : "E-mail inbox",
    link: itemLink(item),
    itemId: item.id,
  }
}

/** Files that came with a conversation: the customer's opening message,
    their answer, and anything after. */
function requestFiles(client: Client, request: CustomerRequest, items: ReviewItem[]): FileEntry[] {
  const item = request.itemId ? items.find((i) => i.id === request.itemId) : undefined
  const fallback = `${request.period}-15`
  const link = {
    label: request.title,
    detail: request.origin === "customer" ? "Customer question" : "Request to the customer",
    ...(item ? { itemId: item.id } : { requestId: request.id }),
  }
  const folder: FolderKey = item ? folderOf(item) : "customer"
  const customer = { name: contactName(client, request.recipientId), kind: "customer" as const }
  const firm = { name: "Sanna", kind: "firm" as const }
  const out: FileEntry[] = []
  const add = (name: string | undefined, when: string | undefined, key: string, from: "customer" | "accountant") => {
    if (!name) return
    out.push({
      id: `req:${request.id}:${key}`,
      name,
      folder,
      at: parseWhen(when, fallback, `${request.id}-${key}`),
      by: from === "customer" ? customer : firm,
      via: from === "customer" ? "Customer app" : "Workspace",
      link,
      itemId: item?.id,
    })
  }
  add(request.attachment, request.sentAt, "open", request.origin === "customer" ? "customer" : "accountant")
  add(request.reply?.attachment, request.reply?.time, "reply", "customer")
  request.thread?.forEach((m) => add(m.attachment, m.time, m.id, m.from))
  return out
}

function filingFiles(client: Client, filings: Filing[]): FileEntry[] {
  return filings.flatMap((filing): FileEntry[] => {
    const base = `/clients/${client.id}/filings`
    const link = { label: `${filing.name} ${filing.period}`, detail: "Filings", href: base }
    const slug = `${filing.name} ${filing.short}`
    if (filing.status === "submitted") {
      // Seeded returns went in a few days before they were due.
      const date = filing.stamp?.at ?? addDays(filing.due, -1 - (hash(filing.id) % 6))
      if (date > TODAY) return []
      return [
        {
          id: `filing:${filing.id}`,
          name: `Kvittering ${slug}.pdf`,
          folder: "filings" as const,
          at: `${date.slice(0, 10)}T${clock(filing.id)}`,
          by: {
            name: filing.kind === "annual_accounts" ? "Brønnøysundregistrene" : "Skatteetaten",
            kind: "system" as const,
          },
          via: "Altinn",
          link,
        },
      ]
    }
    if (filing.status === "ready") {
      return [
        {
          id: `filing:${filing.id}:draft`,
          name: `${slug} (draft).xml`,
          folder: "filings" as const,
          at: `${TODAY}T06:12`,
          by: { name: "Agent", kind: "agent" as const },
          via: "Drafted from Tripletex",
          link,
        },
      ]
    }
    return []
  })
}

/** The months we kept the books for: a client handed over from onboarding
    has none before its takeover. */
function ownMonths(client: Client) {
  return MONTHS.filter((m) => !client.since || m.id >= client.since)
}

function reportFiles(client: Client, signed: Signoffs): FileEntry[] {
  return ownMonths(client).flatMap((month) => {
    const record = signed.closing[closeKey(client.id, month.id)]
    if (month.status !== "closed" && !record) return []
    const when = record?.closedAt ?? month.note.replace(/^Closed /, "")
    return [
      {
        id: `report:${month.id}`,
        name: `Monthly report ${month.label}.pdf`,
        folder: "reports" as const,
        at: parseWhen(when, `${month.id}-28`, `${client.id}-${month.id}-report`),
        by: { name: "Sanna", kind: "firm" as const },
        via: "Sent to the customer's app",
        link: {
          label: month.label,
          detail: "Monthly report",
          href: `/clients/${client.id}/report`,
        },
      },
    ]
  })
}

/** Month-end statements for each account, the morning after. */
function bankFiles(client: Client): FileEntry[] {
  return ownMonths(client).flatMap((month) => {
    const day = addDays(lastDay(month.id), 1)
    if (day > TODAY) return []
    return client.accounts.map((account) => ({
      id: `bank:${month.id}:${account.ledger}`,
      name: `Kontoutskrift ${account.number} ${month.label}.pdf`,
      folder: "bank" as const,
      at: `${day}T${clock(`${client.id}-${month.id}-${account.ledger}`, true)}`,
      by: { name: "DNB", kind: "system" as const },
      via: "DNB bank feed",
      link: {
        label: `${account.ledger} ${account.name}`,
        detail: `Reconciliation · ${month.label}`,
        href: `/clients/${client.id}/reconciliation`,
      },
    }))
  })
}

function payrollReceipts(client: Client): FileEntry[] {
  if (!client.employees) return []
  return ownMonths(client).flatMap((month) => {
    // The A-melding for a pay run is due the 5th of the month after it.
    const pay = `${addDays(lastDay(month.id), 5)}`
    if (pay > TODAY) return []
    return [
      {
        id: `amelding:${month.id}`,
        name: `A-melding kvittering ${month.label}.pdf`,
        folder: "payroll" as const,
        at: `${addDays(pay, -1)}T${clock(`${client.id}-${month.id}-am`)}`,
        by: { name: "Skatteetaten", kind: "system" as const },
        via: "Altinn",
        link: { label: `Pay run ${month.label}`, detail: "Payroll", href: `/clients/${client.id}/payroll` },
      },
    ]
  })
}

/** The division of work, as the agreement lists it. */
function routineSections(client: Client, routines = client.profile.routines ?? []): FileSummary["sections"] {
  const rows = (who: "customer" | "firm") =>
    routines.filter((r) => r.who === who && r.task).map((r): [string, string] => [r.task, r.when ?? ""])
  return [
    { title: `${client.name} does`, rows: rows("customer") },
    { title: "Sanna does", rows: rows("firm") },
  ].filter((s) => s.rows.length)
}

const ENGAGEMENT_NOTE = "Saved to the company's documents in Tripletex when it was signed."

/** Registration and engagement papers, from when the client joined. */
function companyFiles(client: Client): FileEntry[] {
  const [mon, year] = client.profile.clientSince.split(" ")
  const joined = `${year}-${String(MONTHS_SHORT.indexOf(mon) + 1).padStart(2, "0")}-0${2 + (hash(client.id) % 7)}`
  const at = (seed: string, days = 0) => `${capped(addDays(joined, days))}T${clock(`${client.id}-${seed}`)}`
  const signer = client.contacts[0]
  const contact = { name: signer.name, kind: "customer" as const }
  const signedOn = formatDay(joined)
  const docs: FileEntry[] = [
    {
      id: "co:oppdrag",
      name: `Oppdragsavtale ${client.name}.pdf`,
      folder: "company",
      at: at("oppdrag"),
      by: contact,
      via: "Signed with BankID · saved to Tripletex documents",
      link: { label: "Engagement agreement", detail: `Signed by ${signer.name}, ${signedOn} ${year}` },
      summary: {
        title: "Oppdragsavtale · engagement agreement",
        rows: [
          ["Customer", `${client.name}, org. ${client.orgNo}`],
          ["Accountant", `${FIRM.name}, org. ${FIRM.orgNo}`],
          ["What we do", client.profile.services.join(", ")],
          ["Signed by", `${signer.name}, ${signer.role ?? "for the company"}`],
          ["Signed", `${signedOn} ${year}, with BankID`],
        ],
        sections: routineSections(client),
        note: ENGAGEMENT_NOTE,
      },
    },
    { id: "co:firmaattest", name: `Firmaattest ${client.orgNo.replace(/\s/g, "")}.pdf`, folder: "company", at: at("firmaattest", 1), by: { name: "Brønnøysundregistrene", kind: "system" }, via: "Fetched at onboarding", link: { label: "Company registration", detail: `Org. ${client.orgNo}` } },
    { id: "co:vedtekter", name: "Vedtekter.pdf", folder: "company", at: at("vedtekter", 3), by: contact, via: "Customer app", link: { label: "Articles of association", detail: "Company documents" } },
    { id: "co:aksjeeierbok", name: "Aksjeeierbok.xlsx", folder: "company", at: at("aksjeeierbok", 3), by: contact, via: "Customer app", link: { label: "Shareholder register", detail: "For the RF-1086" } },
  ]
  if (client.profile.clientSince === "Sep 2026") {
    docs.push({ id: "co:balanse", name: "Saldobalanse 31.12.2025 (forrige regnskapsfører).xlsx", folder: "company", at: at("balanse", 4), by: contact, via: "Customer app", link: { label: "Opening balance 2026", detail: "From the previous accountant" } })
  }
  return docs
}

const KYC_SHORT = ["Owners above 25 %", "Business abroad", "Cash above 40 000 kr", "Politically exposed person"]

/** What onboarding collected for a company handed over to operations: the
    SAF-T files from the assessment, the register extract, the KYC answers,
    the engagement agreement as signed on their link, the last statement
    before the feed and the previous accountant's handover letter. */
function onboardingFiles(client: Client, c: OnboardingCase): FileEntry[] {
  const co = company(c)
  const contact = { name: co.contact.name, kind: "customer" as const }
  const href = `/onboarding/${c.id}`
  const time = (seed: string) => clock(`${c.id}-${seed}`)
  const task = (key: string) => c.tasks.find((t) => t.id === `${c.id}:${key}`)
  const out: FileEntry[] = []

  c.saftFiles.forEach((name, index) =>
    out.push({
      id: `onb:saft:${index}`,
      name,
      folder: "company",
      at: `${capped(addDays(c.createdAt, 1 + index))}T${time(name)}`,
      by: contact,
      via: "Uploaded for the assessment",
      link: { label: "Assessment", detail: "SAF-T from their previous system", href },
    })
  )
  out.push({
    id: "onb:firmaattest",
    name: `Firmaattest ${co.orgNo.replace(/\s/g, "")}.pdf`,
    folder: "company",
    at: `${capped(c.createdAt)}T${time("firmaattest")}`,
    by: { name: "Brønnøysundregistrene", kind: "system" },
    via: "Register check in the assessment",
    link: { label: "Company registration", detail: `Org. ${co.orgNo}`, href },
  })

  const kyc = task("kyc")
  if (c.kyc && kyc?.answer) {
    out.push({
      id: "onb:kyc",
      name: `Kundekontroll ${co.name}.pdf`,
      folder: "company",
      at: `${capped(kyc.answer.at)}T${time("kyc")}`,
      by: contact,
      via: "Onboarding link",
      link: { label: "Know-your-customer answers", detail: kyc.settled ? `Checked by ${kyc.settled.by}` : "Anti-money-laundering act", href },
      summary: {
        title: "Know-your-customer answers",
        rows: [
          ...KYC_SHORT.map((label, i): [string, string] => [label, c.kyc!.answers[i] ? "Yes" : "No"]),
          ...(c.kyc.note ? [["Note", c.kyc.note] as [string, string]] : []),
          ["Answered by", `${co.contact.name}, ${formatDay(kyc.answer.at)}`],
        ],
        note: "Kept for five years after the customer relationship ends, as the anti-money-laundering act requires.",
      },
    })
  }

  const offer = c.offer
  if (offer?.acceptedAt) {
    const signed = `${formatDay(offer.acceptedAt)} ${offer.acceptedAt.slice(0, 4)}`
    out.push({
      id: "onb:oppdrag",
      name: `Oppdragsavtale ${co.name} v${offer.version}.pdf`,
      folder: "company",
      at: `${capped(offer.acceptedAt)}T${time("oppdrag")}`,
      by: contact,
      via: "Signed on the onboarding link · saved to Tripletex documents",
      link: { label: "Engagement agreement", detail: `Offer v${offer.version}, signed by ${co.contact.name} ${signed}`, href },
      summary: {
        title: "Oppdragsavtale · engagement agreement",
        rows: [
          ["Customer", `${co.name}, org. ${co.orgNo}`],
          ["Accountant", `${FIRM.name}, org. ${FIRM.orgNo}`],
          [
            "What we do",
            ["Bookkeeping", "VAT returns", "Annual accounts", ...(offer.payroll ? ["Payroll and A-melding"] : []), ...(offer.invoicing ? ["Invoicing"] : [])].join(", "),
          ],
          ["Price", `${formatKr(offer.monthly)} a month for up to ${offer.includedEmployees} employees and ${offer.includedVouchers.toLocaleString("nb-NO")} vouchers a year`],
          ["We take over", formatDay(offer.takeoverDate)],
          ...(offer.previousAccountant ? [["Until then", `${offer.previousAccountant}. ${offer.handoverNote}`] as [string, string]] : []),
          ["Signed by", `${co.contact.name}, ${co.contact.role ?? "for the company"}`],
          ["Signed", `${signed}, offer version ${offer.version}`],
        ],
        sections: routineSections(client),
        note: ENGAGEMENT_NOTE,
      },
    })
  }

  const statement = task("statement")
  if (statement?.answer?.file) {
    const accounts = bankAccounts(co)
    out.push({
      id: "onb:statement",
      name: statement.answer.file,
      folder: "bank",
      at: `${capped(statement.answer.at)}T${time("statement")}`,
      by: contact,
      via: "Onboarding link",
      link: { label: "Bank balances at the takeover", detail: accounts.map((a) => a.ledger).join(", "), href },
    })
  }
  const handover = task("handover")
  if (handover?.answer?.file) {
    out.push({
      id: "onb:handover",
      name: handover.answer.file === "dokument.pdf" ? `Overleveringsbrev ${offer?.previousAccountant || "forrige regnskapsfører"}.pdf` : handover.answer.file,
      folder: "company",
      at: `${capped(handover.answer.at)}T${time("handover")}`,
      by: contact,
      via: "Onboarding link",
      link: { label: "Handover from the previous accountant", detail: handover.answer.text, href },
    })
  }
  return out
}

export function clientFiles(
  clientId: string,
  items: ReviewItem[],
  requests: CustomerRequest[],
  /** The store's state fits: sign-offs, and the onboarding cases a
      handed-over client's documents come from. */
  signed: Signoffs & { onboarding?: OnboardingCase[] }
): FileEntry[] {
  const client = CLIENT_BY_ID.get(clientId)
  if (!client) return []
  const onboarded = signed.onboarding?.find((c) => c.id === clientId && c.handedOver)
  const own = items.filter((i) => i.clientId === clientId)

  // Customer uploads first: when the same file is also a line's evidence,
  // the conversation is where it came from.
  const fromRequests = requests
    .filter((r) => r.clientId === clientId && r.status !== "draft")
    .flatMap((r) => requestFiles(client, r, own))
  const seen = new Set(fromRequests.map((f) => `${f.name}|${f.itemId ?? ""}`))

  const shared = new Map<string, FileEntry>()
  const lines = new Map<string, number>()
  const fromItems: FileEntry[] = []
  for (const item of own) {
    const file = itemFile(client, item)
    if (!file || seen.has(`${file.name}|${item.id}`)) continue
    if (PER_LINE.test(file.name)) {
      fromItems.push(file)
      continue
    }
    const key = `${file.name}|${item.period}`
    const known = shared.get(key)
    if (known) {
      const n = (lines.get(key) ?? 1) + 1
      lines.set(key, n)
      known.link = { ...known.link!, label: `${n} ${item.domain === "payroll" ? "employees" : "lines"}` }
    } else shared.set(key, { ...file, id: `file:${key}` })
  }

  const filings = getClientFilings(client, items, signed)
  return [
    ...fromRequests,
    ...fromItems,
    ...shared.values(),
    ...filingFiles(client, filings),
    ...reportFiles(client, signed),
    ...bankFiles(client),
    ...payrollReceipts(client),
    // A client from onboarding has the real papers; the rest a plausible set.
    ...(onboarded ? onboardingFiles(client, onboarded) : companyFiles(client)),
  ].sort((a, b) => b.at.localeCompare(a.at))
}

/** The entry behind a file name shown somewhere else (a chip on a line). */
export function findFile(files: FileEntry[], name: string, itemId?: string) {
  return (
    files.find((f) => f.name === name && (!itemId || f.itemId === itemId)) ??
    files.find((f) => f.name === name)
  )
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** "Today, 14:32", "Yesterday, 09:10", "22 Sep 2026, 11:05". */
export function formatWhen(at: string) {
  const [date, time] = at.split("T")
  const label =
    date === TODAY
      ? "Today"
      : date === addDays(TODAY, -1)
        ? "Yesterday"
        : DAY.format(new Date(`${date}T12:00:00`))
  return `${label}, ${time}`
}
