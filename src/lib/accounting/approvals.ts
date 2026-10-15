// Attestering: the customer approves what we booked before it is paid.
// Suppliers they approve "from now on" only come back when something looks
// off: a new supplier, an amount far from what they usually pay, a large
// amount, or a price far from what our other clients pay the same supplier.
//
// The store keeps `approvals` in its state, saves it, and sends
// `{ type: "approvals", action }` here. Lists themselves are ordinary
// requests (kind "approval"), sent with the store's `send_request`; this
// module keeps what sits around them: the policy per client, the approved
// suppliers, how rejected lines were settled, and where each approved
// invoice is in its payment. Everything else is derived.
import type { StoreState } from "./store"
import {
  addDays,
  CLIENT_BY_ID,
  CURRENT_USER,
  hash,
  isOpenPeriod,
  monthName,
  MONTHS,
  OPEN_MONTH,
} from "./data"
import { TODAY } from "./deadlines"
import { formatAmount } from "./format"
import type {
  Anomaly,
  AnomalyKind,
  ApprovalLine,
  Client,
  CustomerRequest,
  Person,
  ReviewItem,
  Stamp,
} from "./types"
import { caseSuppliers } from "./onboarding"
import { log } from "./trail"

// ── State ──

export type ApprovalMode = "always" | "anomalies_only"

/** How a client wants its invoices approved. */
export type ApprovalPolicy = {
  /** "always": a list every week, even when nothing stands out.
      "anomalies_only": only what needs a look goes out; the rest is
      approved automatically and logged. */
  mode: ApprovalMode
  /** The contact who approves. */
  approverId: string
  /** When lists go out, in words: "Mondays". */
  cadence: string
  /** One invoice at or above this needs a look, NOK. */
  largeAmount: number
  /** A change this big against the usual amount needs a look: 1 = 100%,
      so twice the usual. Also used against what other clients pay. */
  deviation: number
  /** Who last changed the mode, and where. */
  changed?: { by: string; at: string; from: "portal" | "firm" }
}

/** A supplier the customer approves from now on. */
export type ApprovedSupplier = {
  clientId: string
  /** As the invoices name it ("Telenor Norge AS"). */
  supplier: string
  /** ISO date (or date and time) it was approved. */
  since: string
  /** Who approved it: the customer, or the accountant who added it. */
  by: string
  /** saft = pre-approved from the SAF-T at onboarding; customer = ticked
      "from now on" in an approval; accountant = added by the firm. */
  source: "saft" | "customer" | "accountant"
}

/** What the firm did about a line the customer rejected. */
export type Settlement = Stamp & { how: "credit_note" | "pay_anyway" }

/** An invoice approved without asking, as it was logged. */
export type AutoApproval = { at: string; supplier: string; by: string; since: string }

export type ApprovalsState = {
  /** Saved data from before this shape existed starts from the seed. */
  version: 1
  /** Per client. A client without one gets `defaultPolicy`. */
  policies: Record<string, ApprovalPolicy>
  /** Approved by the firm or from the SAF-T. Suppliers the customer
      remembered in an approval, and those pre-approved in onboarding, are
      derived from the requests and cases instead. */
  suppliers: ApprovedSupplier[]
  /** `${clientId}:${supplier}` → when the approval was taken back. */
  revoked: Record<string, Stamp>
  /** Rejected lines the firm settled, by item id. */
  settled: Record<string, Settlement>
  /** Auto-approvals as logged, by item id. Until logged they are derived. */
  auto: Record<string, AutoApproval>
}

const LARGE_AMOUNT = 25_000

/** Approved suppliers are paid without asking unless something about the
    invoice stands out: the customer only sees what needs a look (and, on
    the list, what was paid without asking). A customer who wants every
    invoice can say so. */
export function defaultPolicy(client?: Pick<Client, "contacts">): ApprovalPolicy {
  return {
    mode: "anomalies_only",
    approverId: client?.contacts[0]?.id ?? "",
    cadence: "Mondays",
    largeAmount: LARGE_AMOUNT,
    deviation: 1,
  }
}

/** Who approves where it isn't the first contact, and the customers who
    opted out of the weekly list. */
const POLICY_SEEDS: Record<string, Partial<ApprovalPolicy>> = {
  // "Approve with Sigrid, not Per" (the customer profile says so).
  "bergen-bygg": { approverId: "sigrid" },
  "polar-logistikk": { approverId: "maria" },
  "sjobris-hotell": { approverId: "ole" },
  "nord-elektro": { approverId: "hilde" },
  "kvist-arkitekter": {
    mode: "anomalies_only",
    changed: { by: "Henrik Kvist", at: "2026-08-03T19:12", from: "portal" },
  },
  "vik-holm": {
    mode: "anomalies_only",
    changed: { by: "Marte Vik", at: "2026-06-12T10:05", from: "portal" },
  },
  // A CFO who wants to see every invoice before it's paid.
  havbris: {
    mode: "always",
    changed: { by: "Lars Dahl", at: "2026-05-04T08:12", from: "portal" },
  },
}

const S = {
  telenor: "Telenor Norge AS",
  hafslund: "Hafslund Strøm AS",
  aws: "Amazon Web Services EMEA",
  kontorspar: "Kontorspar AS",
  tine: "Tine SA",
  bama: "Bama Storkjøkken AS",
  printhuset: "Printhuset Oslo AS",
}

type SupplierSeed = [supplier: string, source?: ApprovedSupplier["source"], since?: string, byContact?: string]

/** Each client's approved suppliers: the recurring ones (phone, power,
    hosting) pre-approved from the SAF-T when they joined, and a few the
    customer or the accountant added since. New and irregular suppliers
    are not on it. */
const SUPPLIER_SEEDS: Record<string, SupplierSeed[]> = {
  "fjord-kaffebar": [
    [S.telenor],
    [S.hafslund],
    [S.tine],
    [S.bama],
    [S.kontorspar, "customer", "2026-08-12T09:31", "kari"],
  ],
  "nordlys-design": [[S.telenor], [S.aws], [S.printhuset, "customer", "2026-04-20T13:02", "thea"]],
  "bergen-bygg": [[S.telenor], [S.hafslund]],
  havbris: [[S.telenor], [S.hafslund]],
  "solberg-tann": [[S.telenor], [S.kontorspar, "accountant", "2026-02-09"]],
  tinde: [[S.telenor], [S.hafslund]],
  "vik-holm": [[S.telenor], [S.kontorspar, "customer", "2026-06-12T10:04", "marte"]],
  "lysaker-it": [[S.telenor], [S.aws]],
  "aurora-frisor": [[S.telenor], [S.hafslund]],
  "grunerlokka-sykkel": [[S.telenor]],
  "nordkapp-ror": [[S.telenor]],
  "sjobris-hotell": [[S.telenor], [S.hafslund]],
  "bolgen-barnehage": [[S.telenor], [S.hafslund], [S.kontorspar]],
  "kvist-arkitekter": [[S.telenor], [S.aws]],
  "polar-logistikk": [[S.telenor], [S.aws]],
  "mathallen-deli": [[S.hafslund], [S.tine, "customer", "2026-05-18T07:55", "jonas-m"]],
  "bakeriet-hjornet": [[S.telenor]],
  "nord-elektro": [[S.telenor], [S.aws]],
  "studio-vind": [[S.telenor]],
  fjellstua: [[S.hafslund]],
  "skarv-consulting": [[S.aws]],
}

const MONTH_INDEX: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
}

/** "Mar 2021" (a client's start) as "2021-03-01". */
function fromMonthYear(label: string) {
  const [month, year] = label.split(" ")
  return `${year}-${MONTH_INDEX[month] ?? "01"}-01`
}

export function seedApprovals(): ApprovalsState {
  const policies: Record<string, ApprovalPolicy> = {}
  const suppliers: ApprovedSupplier[] = []
  for (const [clientId, seed] of Object.entries(POLICY_SEEDS)) {
    policies[clientId] = { ...defaultPolicy(CLIENT_BY_ID.get(clientId)), ...seed }
  }
  for (const [clientId, seeds] of Object.entries(SUPPLIER_SEEDS)) {
    const client = CLIENT_BY_ID.get(clientId)
    if (!client) continue
    // Pre-approved by whoever approves the invoices.
    const approver = policies[clientId]?.approverId ?? client.contacts[0].id
    for (const [supplier, source = "saft", since, byContact = approver] of seeds) {
      suppliers.push({
        clientId,
        supplier,
        source,
        since: since ?? fromMonthYear(client.profile.clientSince),
        by:
          source === "accountant"
            ? "Ingrid Hansen"
            : (client.contacts.find((c) => c.id === byContact) ?? client.contacts[0]).name,
      })
    }
  }
  return { version: 1, policies, suppliers, revoked: {}, settled: {}, auto: {} }
}

let seedCache: ApprovalsState | null = null

/** The slice, or the seed when the saved copy predates this shape. */
export function approvalsOf(state: Pick<StoreState, "approvals">): ApprovalsState {
  const a = state.approvals as Partial<ApprovalsState> | undefined
  if (a?.version === 1) return a as ApprovalsState
  seedCache ??= seedApprovals()
  return seedCache
}

// ── Small helpers ──

/** "Hafslund Strøm AS" → "Hafslund Strøm": how people say it. */
export function supplierShort(name: string) {
  return name.replace(/,? (AS|ASA|SA|DA|ApS|AB|Inc\.|Ltd)$/, "")
}

/** Client names without the company form, for sentences. */
function clientShort(client?: Client) {
  return client ? client.name.replace(/ (AS|DA|SA)$/, "") : "the client"
}

// Spelled out rather than Intl's, which writes "Sept" in some browsers.
const MONTH_SHORT = Object.keys(MONTH_INDEX)
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** "2026-09-24" (or "2026-09-24T08:47") → "24 Sep". */
export function dayLabel(iso: string) {
  return `${Number(iso.slice(8, 10))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`
}

/** "2026-10-01" → "Thu 1 Oct": how request dues are written. */
export function weekdayLabel(iso: string) {
  const day = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()
  return `${WEEKDAY[day]} ${dayLabel(iso)}`
}

/** "2026-09-15T08:47" → "15 Sep, 08:47". A plain date stays a date. */
export function stampLabel(iso: string) {
  const time = iso.slice(11, 16)
  return time ? `${dayLabel(iso)}, ${time}` : dayLabel(iso)
}

/** The time of day a reducer writes: the clock, on the demo's today. */
function now() {
  return `${TODAY}T${new Date().toTimeString().slice(0, 5)}`
}

const kr = formatAmount

/** "Twice" or "10×", for an amount against the usual. */
function times(ratio: number) {
  return ratio < 2.5 ? "Twice" : `${Math.round(ratio)}×`
}

function supplierKey(clientId: string, supplier: string) {
  return `${clientId}:${supplier}`
}

/** "Fri 2 Oct" or "Mon 14 Sep" → "2026-10-02". Request dues and sends
    are written for people; this reads them back. */
function parseDay(label: string) {
  const match = label.match(/(\d{1,2}) (\w{3})/)
  if (!match) return undefined
  return `2026-${MONTH_INDEX[match[2]] ?? "01"}-${match[1].padStart(2, "0")}`
}

// ── Policy and approved suppliers ──

export function policyOf(state: Pick<StoreState, "approvals">, clientId: string): ApprovalPolicy {
  return approvalsOf(state).policies[clientId] ?? defaultPolicy(CLIENT_BY_ID.get(clientId))
}

export function approverOf(state: Pick<StoreState, "approvals">, clientId: string): Person | undefined {
  const client = CLIENT_BY_ID.get(clientId)
  const id = policyOf(state, clientId).approverId
  return client?.contacts.find((c) => c.id === id) ?? client?.contacts[0]
}

/** Every supplier the client approves from now on: the stored ones, those
    pre-approved in onboarding Setup, and those the customer ticked "from
    now on" in an approval. A revocation outlives approvals made before it. */
export function approvedSuppliers(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): ApprovedSupplier[] {
  const a = approvalsOf(state)
  const found: ApprovedSupplier[] = a.suppliers.filter((s) => s.clientId === clientId)

  const handedOver = state.onboarding.find((c) => c.id === clientId && c.handedOver)
  for (const s of handedOver ? caseSuppliers(handedOver) : []) {
    if (!s.preApproved) continue
    const client = CLIENT_BY_ID.get(clientId)
    found.push({
      clientId,
      supplier: s.name,
      since: handedOver!.handedOver!.at,
      by: client?.contacts[0]?.name ?? "The customer",
      source: "saft",
    })
  }

  for (const r of state.requests) {
    if (r.clientId !== clientId || r.kind !== "approval" || r.domain !== "bookkeeping" || !r.answeredBy)
      continue
    for (const line of r.lines ?? []) {
      if (!line.remember || line.decision !== "approved") continue
      const item = state.items.find((i) => i.id === line.itemId)
      if (!item) continue
      found.push({
        clientId,
        supplier: item.title,
        since: r.answeredBy.at,
        by: r.answeredBy.name,
        source: "customer",
      })
    }
  }

  // One entry per supplier, the earliest approval still standing.
  const out = new Map<string, ApprovedSupplier>()
  for (const s of found) {
    const revoked = a.revoked[supplierKey(clientId, s.supplier)]
    if (revoked && s.since <= revoked.at) continue
    const seen = out.get(s.supplier)
    if (!seen || s.since < seen.since) out.set(s.supplier, s)
  }
  return [...out.values()].sort((x, y) => x.supplier.localeCompare(y.supplier))
}

export function approvedSupplier(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string,
  supplier: string
) {
  return approvedSuppliers(state, clientId).find((s) => s.supplier === supplier)
}

export const SOURCE_LABEL: Record<ApprovedSupplier["source"], string> = {
  saft: "From the SAF-T at onboarding",
  customer: "Approved in a list",
  accountant: "Added by the firm",
}

/** "Telenor is approved from now on, by Kari 12 Aug". */
export function approvalReason(s: Pick<ApprovedSupplier, "supplier" | "by" | "since" | "source">) {
  const who = s.by.split(" ")[0]
  return s.source === "saft"
    ? `${supplierShort(s.supplier)} was pre-approved by ${who} from the SAF-T`
    : `${supplierShort(s.supplier)} is approved from now on, by ${who} ${dayLabel(s.since)}`
}

// ── What stands out ──

export type { Anomaly, AnomalyKind }

/** What makes an invoice need a real look before it is paid. Pure: from
    the client's own history, its approved suppliers, its policy and what
    the firm's other clients pay the same supplier. */
export function anomaliesFor(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  item: ReviewItem
): Anomaly[] {
  if (item.domain !== "bookkeeping" || item.kind !== "invoice" || item.expense || item.creditFor) return []
  const policy = policyOf(state, item.clientId)
  const client = CLIENT_BY_ID.get(item.clientId)
  const amount = Math.abs(item.amount)
  const name = supplierShort(item.title)
  const out: Anomaly[] = []

  const earlier = state.items
    .filter(
      (i) =>
        i.clientId === item.clientId &&
        i.domain === "bookkeeping" &&
        i.title === item.title &&
        i.id !== item.id &&
        i.period < item.period
    )
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 3)

  // Paid to another account than every invoice before: whoever sent it
  // may not be the supplier. Never paid without a person checking.
  if (item.payeeChanged) {
    out.push({
      kind: "bank_account",
      short: `New bank account for ${name}`,
      detail: `Asks to be paid to ${item.payeeChanged.now}. Every earlier invoice from ${name} went to ${item.payeeChanged.before}. Check the change with ${name} on a phone number you already have, not one on the invoice.`,
    })
  }

  if (!earlier.length && !approvedSupplier(state, item.clientId, item.title)) {
    out.push({
      kind: "new_supplier",
      short: "New supplier",
      detail: `First invoice from ${item.title}: no earlier bookings at ${clientShort(client)}, and not on the approved suppliers.`,
    })
  }

  let jumped = false
  if (earlier.length) {
    const usual = earlier.reduce((sum, i) => sum + Math.abs(i.amount), 0) / earlier.length
    const ratio = amount / usual
    if (ratio >= 1 + policy.deviation) {
      jumped = true
      const months = [...earlier].reverse().map((i) => monthName(i.period))
      out.push({
        kind: "amount_jump",
        short: `${times(ratio)} what you usually pay ${name}`,
        detail: `${kr(amount)} is ${times(ratio).toLowerCase()} what ${clientShort(client)} usually pays ${name}: about ${kr(usual)} in ${months.length > 1 ? `${months[0]}–${months.at(-1)}` : months[0]}.`,
      })
    }
  }

  // The same supplier at the firm's other clients: the latest invoice each.
  if (!jumped) {
    const latest = new Map<string, ReviewItem>()
    for (const i of state.items) {
      if (
        i.clientId === item.clientId ||
        i.domain !== "bookkeeping" ||
        i.title !== item.title ||
        i.period > item.period
      )
        continue
      const seen = latest.get(i.clientId)
      if (!seen || i.period > seen.period) latest.set(i.clientId, i)
    }
    const others = [...latest.values()].map((i) => Math.abs(i.amount)).sort((a, b) => a - b)
    if (others.length >= 3) {
      const median = others[Math.floor(others.length / 2)]
      if (amount >= median * (1 + policy.deviation)) {
        out.push({
          kind: "benchmark",
          short: `Other businesses pay ${name} about ${kr(median)}`,
          detail: `${others.length} other clients pay ${name} about ${kr(median)}. ${clientShort(client)} pays ${kr(amount)}, ${times(amount / median).toLowerCase()} as much.`,
        })
      }
    }
  }

  if (amount >= policy.largeAmount) {
    out.push({
      kind: "large_amount",
      short: `Large amount: ${kr(amount)}`,
      detail: `${kr(amount)} is above the ${kr(policy.largeAmount)} limit for one invoice.`,
    })
  }
  return out
}

/** The anomalies as one line for the customer: the first two. */
export function anomalyText(anomalies: Anomaly[]) {
  return anomalies.length ? anomalies.slice(0, 2).map((a) => a.short).join(" · ") : undefined
}


// ── Where each invoice stands ──

export type InvoiceStatus =
  /** Booked, not on a list yet. */
  | "to_send"
  /** On a list the customer hasn't answered. */
  | "with_customer"
  /** Approved by the customer, or paid anyway by the firm. */
  | "approved"
  /** Approved without asking: the supplier is approved and nothing stood out. */
  | "auto"
  /** Rejected by the customer, not settled yet. */
  | "rejected"
  /** Rejected; the firm asked the supplier for a credit note. */
  | "credit_note"

export type InvoiceApproval = {
  item: ReviewItem
  status: InvoiceStatus
  /** A month closed before the lists in this app: approved the old way. */
  history: boolean
  anomalies: Anomaly[]
  /** Not on the approved suppliers, or something stands out. */
  needsLook: boolean
  supplier?: ApprovedSupplier
  request?: CustomerRequest
  line?: ApprovalLine
  /** Who approved (or rejected) and when, ISO date and time. */
  decidedBy?: string
  decidedAt?: string
  /** How it was approved, in a few words. */
  how?: string
  settlement?: Settlement
  payment: Payment
  /** Past its due date and not approved. */
  overdue: boolean
}

export type Payment = {
  state: "scheduled" | "paid" | "hold" | "stopped" | "none"
  label: string
  /** ISO date it is (or was) paid. */
  on?: string
}

function payment(item: ReviewItem, approvedOn?: string): Payment {
  const due = item.dueDate ?? item.date
  const on = approvedOn && approvedOn.slice(0, 10) > due ? approvedOn.slice(0, 10) : due
  if (on <= TODAY)
    return { state: "paid", label: `Paid ${dayLabel(on)}${on > due ? `, ${daysBetween(due, on)} days late` : ""}`, on }
  return { state: "scheduled", label: `Scheduled in Tripletex for ${dayLabel(due)}`, on: due }
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

/** Approval lists live in the requests: each line's latest list. */
const LIST_INDEX = new WeakMap<CustomerRequest[], Map<string, { request: CustomerRequest; line: ApprovalLine }>>()

function listIndex(requests: CustomerRequest[]) {
  let index = LIST_INDEX.get(requests)
  if (index) return index
  index = new Map()
  for (const request of requests) {
    if (request.kind !== "approval" || request.status === "draft") continue
    for (const line of request.lines ?? []) {
      // A list closed without an answer lets its open lines go again.
      if (request.status === "resolved" && !line.decision) continue
      index.set(line.itemId, { request, line })
    }
  }
  LIST_INDEX.set(requests, index)
  return index
}

/** The approval list an item is on, if any. */
export function listOf(state: Pick<StoreState, "requests">, itemId: string) {
  return listIndex(state.requests).get(itemId)
}

/** The Monday on or after a date: when the weekly list goes out. */
function listDay(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return addDays(date, (8 - day) % 7)
}

/** A closed month, approved before the lists in this app: by the approver
    the day after the weekly list, or automatically once they opted out. */
function historyOf(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  item: ReviewItem,
  policy: ApprovalPolicy,
  approver?: Person
): Pick<InvoiceApproval, "status" | "decidedBy" | "decidedAt" | "how" | "supplier"> {
  const supplier = approvedSupplier(state, item.clientId, item.title)
  const optedOut = policy.mode === "anomalies_only" && policy.changed && policy.changed.at.slice(0, 10) <= item.date
  if (optedOut && supplier && supplier.since.slice(0, 10) <= item.date && !anomaliesFor(state, item).length)
    return {
      status: "auto",
      supplier,
      decidedBy: supplier.by,
      decidedAt: item.date,
      how: `Auto-approved: ${approvalReason(supplier)}`,
    }
  const sent = listDay(item.date)
  const h = hash(item.id)
  const clock = `${String(8 + (h % 9)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`
  return {
    status: "approved",
    supplier,
    decidedBy: approver?.name ?? "The customer",
    decidedAt: `${addDays(sent, 1)}T${clock}`,
    how: `On the list of ${weekdayLabel(sent)}`,
  }
}

/** Every booked supplier invoice of a client and where it stands: on a
    list or not, approved by whom, paid or scheduled. Newest first. */
export function invoiceApprovals(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): InvoiceApproval[] {
  const a = approvalsOf(state)
  const policy = policyOf(state, clientId)
  const approver = approverOf(state, clientId)
  const index = listIndex(state.requests)
  const out: InvoiceApproval[] = []

  for (const item of state.items) {
    if (
      item.clientId !== clientId ||
      item.domain !== "bookkeeping" ||
      item.kind !== "invoice" ||
      // An employee's expense was sent by the company itself, and a credit
      // note settles a rejection: neither goes on a list.
      item.expense ||
      item.creditFor ||
      item.status !== "booked"
    )
      continue

    // Months closed before the lists started were approved the old way,
    // and so were this month's invoices on lists sent before the demo.
    if ((item.period < OPEN_MONTH && !item.backdated) || item.approvedEarlier) {
      const h = historyOf(state, item, policy, approver)
      out.push({
        item,
        history: true,
        anomalies: [],
        needsLook: false,
        ...h,
        payment: payment(item, h.decidedAt),
        overdue: false,
      })
      continue
    }

    const anomalies = anomaliesFor(state, item)
    const supplier = approvedSupplier(state, clientId, item.title)
    const needsLook = !supplier || anomalies.length > 0
    const listed = index.get(item.id)
    const settlement = a.settled[item.id]
    const base = { item, history: false, anomalies, needsLook, supplier }
    const overdueIfOpen = (item.dueDate ?? item.date) < TODAY

    if (listed) {
      const { request, line } = listed
      const by = request.answeredBy
      if (line.decision === "approved") {
        out.push({
          ...base,
          request,
          line,
          status: "approved",
          decidedBy: by?.name,
          decidedAt: by?.at,
          how: `Approved in ${request.id}${line.remember ? ", from now on" : ""}`,
          payment: payment(item, by?.at),
          overdue: false,
        })
      } else if (line.decision === "rejected") {
        if (settlement?.how === "pay_anyway")
          out.push({
            ...base,
            request,
            line,
            settlement,
            status: "approved",
            decidedBy: settlement.by,
            decidedAt: settlement.at,
            how: `Rejected by ${by?.name ?? "the customer"}, paid anyway`,
            payment: payment(item, settlement.at),
            overdue: false,
          })
        else if (settlement?.how === "credit_note")
          out.push({
            ...base,
            request,
            line,
            settlement,
            status: "credit_note",
            decidedBy: by?.name,
            decidedAt: by?.at,
            how: `Rejected by ${by?.name ?? "the customer"}`,
            payment: { state: "stopped", label: `Not paid: credit note asked from ${supplierShort(item.title)}` },
            overdue: false,
          })
        else
          out.push({
            ...base,
            request,
            line,
            status: "rejected",
            decidedBy: by?.name,
            decidedAt: by?.at,
            how: `Rejected by ${by?.name ?? "the customer"}`,
            payment: { state: "hold", label: "On hold" },
            overdue: overdueIfOpen,
          })
      } else {
        out.push({
          ...base,
          request,
          line,
          status: "with_customer",
          payment: { state: "none", label: "Not approved yet" },
          overdue: overdueIfOpen,
        })
      }
      continue
    }

    const logged = a.auto[item.id]
    if (logged || (policy.mode === "anomalies_only" && !needsLook && supplier)) {
      const s = supplier ?? { supplier: item.title, by: logged!.by, since: logged!.since, source: "customer" as const }
      // Approved automatically from the moment it could be: the invoice
      // came in, the supplier was approved, the customer opted out. Never
      // before any of them, and never re-dated when it is logged later.
      const decidedAt = logged?.at ?? autoDecidedAt(item, supplier, policy)
      out.push({
        ...base,
        status: "auto",
        decidedBy: logged?.by ?? supplier?.by,
        decidedAt,
        how: `Auto-approved: ${approvalReason(logged ? { ...s, by: logged.by, since: logged.since } : s)}`,
        payment: payment(item, decidedAt),
        overdue: false,
      })
      continue
    }

    out.push({
      ...base,
      status: "to_send",
      payment: { state: "none", label: "Not approved yet" },
      overdue: overdueIfOpen,
    })
  }

  return out.sort((x, y) => y.item.date.localeCompare(x.item.date))
}

/** When an invoice from an approved supplier was approved without asking:
    the latest of its date, the supplier's approval and the opt-out. */
function autoDecidedAt(item: ReviewItem, supplier: ApprovedSupplier | undefined, policy: ApprovalPolicy) {
  const optedOut = policy.mode === "anomalies_only" ? policy.changed?.at : undefined
  return [item.date, supplier?.since, optedOut]
    .filter((d): d is string => Boolean(d))
    .sort((x, y) => x.slice(0, 10).localeCompare(y.slice(0, 10)) || x.length - y.length)
    .at(-1)!
}

/** Booked invoices that haven't left the bank: not approved yet, rejected
    or stopped. The bank feed has no payment for them, whatever their due
    date says. */
export function heldInvoices(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): ReadonlySet<string> {
  const held = new Set<string>()
  for (const a of invoiceApprovals(state, clientId))
    if (a.payment.state === "hold" || a.payment.state === "stopped" || a.payment.state === "none")
      held.add(a.item.id)
  // Reversed while it was on a list: still not approved, so still unpaid.
  for (const item of state.items) {
    if (item.clientId !== clientId || item.kind !== "invoice" || item.status === "booked") continue
    const listed = listOf(state, item.id)
    if (listed && listed.line.decision !== "approved") held.add(item.id)
  }
  return held
}

/** Booked invoices that go on the next list: in "always" every one of
    them, in "anomalies_only" only those that need a look. */
export function toSend(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
) {
  return invoiceApprovals(state, clientId)
    .filter((i) => i.status === "to_send")
    .sort((x, y) => Number(y.needsLook) - Number(x.needsLook) || (x.item.dueDate ?? "").localeCompare(y.item.dueDate ?? ""))
}

/** The client's approval lists for invoices, newest first. */
export function approvalLists(state: Pick<StoreState, "requests">, clientId: string) {
  return state.requests
    .filter((r) => r.clientId === clientId && r.kind === "approval" && r.domain === "bookkeeping")
    .reverse()
}

/** A list the customer answered with a line the firm hasn't settled. */
export function hasOpenRejection(state: Pick<StoreState, "approvals">, request: CustomerRequest) {
  const a = approvalsOf(state)
  return (request.lines ?? []).some((l) => l.decision === "rejected" && !a.settled[l.itemId])
}

// ── The list the agent drafts ──

export type DraftList = {
  title: string
  message: string
  recipient: Person
  /** ISO date, the day before the first invoice falls due. */
  due: string
  lines: ApprovalLine[]
  /** Approved without asking when this list goes out. */
  auto: InvoiceApproval[]
  rows: InvoiceApproval[]
  /** Unanswered lists this one takes over: their lines are on it, and they
      close when it goes out, so the customer has one list, not two. */
  replaces: CustomerRequest[]
}

/** "A, B and C". */
function listOfNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
function count(n: number) {
  return NUMBER_WORDS[n] ?? String(n)
}

/** Why one line needs a look, as a clause for the message. */
function reasonClause(row: InvoiceApproval) {
  const name = supplierShort(row.item.title)
  const first = row.anomalies[0]
  if (!first) return `${name} isn't on your approved suppliers yet`
  switch (first.kind) {
    case "new_supplier":
      return row.anomalies.some((a) => a.kind === "large_amount")
        ? `${name} is a new supplier, and ${kr(Math.abs(row.item.amount))} is a large amount`
        : `${name} is a new supplier`
    case "amount_jump":
      return `${name} is ${kr(Math.abs(row.item.amount))}, ${first.short.split(" what")[0].toLowerCase()} what you usually pay`
    case "benchmark":
      return `${name} costs you ${kr(Math.abs(row.item.amount))}, while our other customers pay about ${first.short.split("about ")[1]}`
    case "large_amount":
      return `${name} is ${kr(Math.abs(row.item.amount))}, a large amount`
    case "bank_account":
      return `${name} asks to be paid to a new bank account, so please check it with them by phone`
    default:
      return `${name}: ${first.short.toLowerCase()}`
  }
}

/** The next list for a client, as the agent drafts it: the lines, what
    stands out on each, and a message in the firm's voice. Null when there
    is nothing to send. */
export function draftList(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): DraftList | null {
  const policy = policyOf(state, clientId)
  const recipient = approverOf(state, clientId)
  const fresh = toSend(state, clientId)
  if (!fresh.length || !recipient) return null
  // Lines still waiting on an earlier list come along.
  const carried = invoiceApprovals(state, clientId).filter(
    (i) => i.status === "with_customer" && i.request?.status === "sent"
  )
  const replaces = [...new Map(carried.map((i) => [i.request!.id, i.request!])).values()]
  const rows = [...fresh, ...carried].sort(
    (x, y) => Number(y.needsLook) - Number(x.needsLook) || (x.item.dueDate ?? "").localeCompare(y.item.dueDate ?? "")
  )
  const look = rows.filter((r) => r.needsLook)
  const usual = rows.filter((r) => !r.needsLook)
  const first = recipient.name.split(" ")[0]
  const earliest = rows.map((r) => r.item.dueDate ?? r.item.date).sort()[0]
  const due = earliest > addDays(TODAY, 1) ? addDays(earliest, -1) : addDays(TODAY, 1)
  const by = weekdayLabel(due)
  const n = rows.length
  const invoices = `${n} ${n === 1 ? "invoice" : "invoices"}`

  let message: string
  if (!look.length) {
    message = `Hi ${first}, no questions this week. We booked ${invoices} from suppliers you know: ${listOfNames(usual.map((r) => supplierShort(r.item.title)))}. Just give us a thumbs up by ${by} so ${n === 1 ? "it's" : "they're"} paid on time.`
  } else {
    const reasons = look.map(reasonClause)
    const lead =
      look.length === n
        ? `${n === 1 ? "It needs" : `All ${count(n)} need`} a real look: ${listOfNames(reasons)}.`
        : `${look.length === 1 ? "One needs" : `${count(look.length)[0].toUpperCase()}${count(look.length).slice(1)} need`} a real look: ${listOfNames(reasons)}.`
    const rest = usual.length
      ? ` ${listOfNames(usual.map((r) => supplierShort(r.item.title)))} ${usual.length === 1 ? "is a supplier" : "are suppliers"} you approve every month.`
      : ""
    const opening = replaces.length
      ? `here are ${invoices} to approve: ${fresh.length} booked this week and ${carried.length} still open from ${replaces.map((r) => r.sentAt).join(" and ")}, so there's one list to answer.`
      : `this week we booked ${invoices}.`
    message = `Hi ${first}, ${opening} ${lead}${rest} Please approve by ${by} so ${n === 1 ? "it's" : "they're"} paid on time.`
  }

  const auto =
    policy.mode === "anomalies_only"
      ? invoiceApprovals(state, clientId).filter((i) => i.status === "auto" && !i.history && !approvalsOf(state).auto[i.item.id])
      : []

  return {
    title: `Approve ${invoices} before ${n === 1 ? "it's" : "they're"} paid`,
    message,
    recipient,
    due,
    rows,
    auto,
    replaces,
    lines: rows.map((r) => ({ itemId: r.item.id, anomaly: anomalyText(r.anomalies) })),
  }
}

// ── For the auditor ──

export type TrailRow = {
  id: string
  /** ISO date and time of the decision. */
  at: string
  supplier: string
  invoiceNo?: string
  invoiceDate: string
  amount: number
  /** Approved by …, Auto-approved …, Rejected by … */
  decision: string
  /** The anomaly the customer saw marked, when there was one. */
  flagged?: string
  /** The list it was on, or "Auto". */
  via: string
  payment: string
}

/** Everything approved, rejected or auto-approved, newest first: who,
    when, through which list, and the payment that followed. */
export function auditTrail(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): TrailRow[] {
  return invoiceApprovals(state, clientId)
    .filter((i) => i.status !== "to_send" && i.status !== "with_customer")
    .map((i) => {
      const decision =
        i.status === "auto"
          ? i.how ?? "Auto-approved"
          : i.status === "approved"
            ? i.settlement
              ? `Rejected by ${i.request?.answeredBy?.name ?? "the customer"}, paid anyway by ${i.settlement.by}`
              : `Approved by ${i.decidedBy ?? "the customer"}${i.line?.anomaly ? " with the anomaly marked" : ""}${i.line?.remember ? ", from now on" : ""}`
            : i.status === "credit_note"
              ? `Rejected by ${i.decidedBy ?? "the customer"}, credit note asked by ${i.settlement?.by}`
              : `Rejected by ${i.decidedBy ?? "the customer"}: “${i.line?.note ?? ""}”`
      return {
        id: i.item.id,
        at: i.settlement?.at ?? i.decidedAt ?? i.item.date,
        supplier: i.item.title,
        invoiceNo: i.item.facts.find((f) => f.label === "Invoice no.")?.value,
        invoiceDate: i.item.date,
        amount: Math.abs(i.item.amount),
        decision,
        flagged: i.line?.anomaly,
        via: i.request ? i.request.id : i.status === "auto" ? "Auto" : (i.how ?? ""),
        payment: i.payment.label,
      }
    })
    .sort((x, y) => y.at.localeCompare(x.at))
}

/** The trail as CSV, for the auditor's spreadsheet. */
export function trailCsv(rows: TrailRow[]) {
  const cell = (value: string | number | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`
  const head = ["Decided", "Supplier", "Invoice no.", "Invoice date", "Amount (NOK)", "Decision", "Anomaly", "Via", "Payment"]
  const body = rows.map((r) =>
    [r.at.replace("T", " "), r.supplier, r.invoiceNo, r.invoiceDate, r.amount, r.decision, r.flagged, r.via, r.payment]
      .map(cell)
      .join(",")
  )
  return [head.map(cell).join(","), ...body].join("\n")
}

/** The routine in words, as the auditor reads it. */
export function routineText(state: Pick<StoreState, "approvals">, clientId: string) {
  const policy = policyOf(state, clientId)
  const approver = approverOf(state, clientId)
  const who = approver ? `${approver.name}${approver.role ? ` (${approver.role})` : ""}` : "the customer"
  const checks = `a new supplier, an amount more than ${policy.deviation === 1 ? "twice" : `${1 + policy.deviation}×`} the usual, ${kr(policy.largeAmount)} or more, or a price well above what other clients pay the same supplier`
  return policy.mode === "always"
    ? `Every supplier invoice is approved by ${who} before it is paid. We send a list on ${policy.cadence}, even when nothing stands out. An anomaly (${checks}) is marked for a real look.`
    : `Invoices from approved suppliers are approved automatically and logged. ${who} approves the rest before they are paid: anything from a supplier not on the list, and any anomaly (${checks}). Lists go out on ${policy.cadence}.`
}

// ── Across clients ──

export type ClientApprovals = {
  client: Client
  policy: ApprovalPolicy
  toSend: InvoiceApproval[]
  withCustomer: InvoiceApproval[]
  rejected: InvoiceApproval[]
  scheduled: InvoiceApproval[]
  overdue: InvoiceApproval[]
  /** Past their due date and not even booked yet, so no list can carry
      them: the bookkeeping is what holds them up. */
  unbookedOverdue: ReviewItem[]
  lists: CustomerRequest[]
}

export function clientApprovals(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  client: Client
): ClientApprovals {
  const all = invoiceApprovals(state, client.id).filter((i) => !i.history)
  return {
    client,
    policy: policyOf(state, client.id),
    toSend: all.filter((i) => i.status === "to_send"),
    withCustomer: all.filter((i) => i.status === "with_customer"),
    rejected: all.filter((i) => i.status === "rejected"),
    scheduled: all.filter((i) => i.payment.state === "scheduled"),
    overdue: all.filter((i) => i.overdue),
    unbookedOverdue: state.items.filter(
      (i) =>
        i.clientId === client.id &&
        i.domain === "bookkeeping" &&
        i.kind === "invoice" &&
        i.status !== "booked" &&
        isOpenPeriod(i) &&
        (i.dueDate ?? i.date) < TODAY
    ),
    lists: approvalLists(state, client.id).filter((r) => r.status !== "resolved"),
  }
}

/** When the next weekly list goes out, after today's. */
export function nextListDay() {
  return listDay(addDays(TODAY, 1))
}

// ── Every supplier in the books ──

/** Auto-approved: on the approved suppliers. Asks every time: known from
    earlier months or the SAF-T, but approved invoice by invoice. New: its
    first invoice is this month's. */
export type SupplierStatus = "auto" | "asks" | "new"

export type SupplierRow = {
  supplier: string
  status: SupplierStatus
  approval?: ApprovedSupplier
  /** When the approval was taken back, if it was. */
  revoked?: Stamp
  /** Invoiced per month, the last three months, oldest first. */
  months: { month: string; amount: number }[]
  /** Invoiced so far this year, NOK. */
  year: number
  /** Where the year figure comes from when it isn't this year's ledger. */
  yearNote?: string
  /** The account they're usually booked to, "6900 Phone & internet". */
  account?: string
  /** Their invoices in the books, newest first. */
  invoices: ReviewItem[]
}

const STATUS_ORDER: Record<SupplierStatus, number> = { new: 0, asks: 1, auto: 2 }

/** The most common value, or undefined. */
function mostCommon(values: (string | undefined)[]) {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Every supplier in a client's books, not only the approved ones: from
    the invoices across months, the SAF-T for a client handed over from
    onboarding, and the approval register. New suppliers first, then by
    what they cost this year. Card shops aren't suppliers here: receipts
    are paid at the till and never go on a list. */
export function supplierBook(
  state: Pick<StoreState, "approvals" | "requests" | "items" | "onboarding">,
  clientId: string
): SupplierRow[] {
  const a = approvalsOf(state)
  const months = [...MONTHS].reverse().map((m) => m.id)
  const year = OPEN_MONTH.slice(0, 4)
  const invoices = state.items
    .filter(
      (i) =>
        i.clientId === clientId && i.domain === "bookkeeping" && i.kind === "invoice" && !i.expense && !i.creditFor
    )
    .sort((x, y) => y.date.localeCompare(x.date))
  const approved = new Map(approvedSuppliers(state, clientId).map((s) => [s.supplier, s]))
  const handedOver = state.onboarding.find((c) => c.id === clientId && c.handedOver)
  const saft = new Map((handedOver ? caseSuppliers(handedOver) : []).map((s) => [s.name, s]))
  const names = new Set([...invoices.map((i) => i.title), ...saft.keys(), ...approved.keys()])

  const rows: SupplierRow[] = []
  for (const supplier of names) {
    const own = invoices.filter((i) => i.title === supplier)
    const sum = (filter: (i: ReviewItem) => boolean) =>
      own.filter(filter).reduce((total, i) => total + Math.abs(i.amount), 0)
    const monthly = months.map((month) => ({ month, amount: sum((i) => i.period === month) }))
    const fromSaft = saft.get(supplier)
    const approval = approved.get(supplier)
    const earlier = own.some((i) => i.period < OPEN_MONTH)

    // The app holds the last three months; January to July are in
    // Tripletex. A supplier that was there before August is counted at its
    // usual monthly amount for those months.
    let total = sum((i) => i.period.startsWith(year))
    const closed = monthly.filter((m) => m.month < OPEN_MONTH && m.amount > 0).map((m) => m.amount)
    if (closed.length && own.some((i) => i.period === months[0])) {
      const usual = closed.sort((x, y) => x - y)[Math.floor(closed.length / 2)]
      total += Math.round((usual * 7 * (0.92 + (hash(supplier) % 16) / 100)) / 100) * 100
    }

    rows.push({
      supplier,
      status: approval ? "auto" : !earlier && !fromSaft && own.length ? "new" : "asks",
      approval,
      revoked: approval ? undefined : a.revoked[supplierKey(clientId, supplier)],
      months: monthly,
      year: total || (fromSaft?.yearly ?? 0),
      yearNote: !total && fromSaft ? `${Number(year) - 1}, from the SAF-T` : undefined,
      account: mostCommon(own.map((i) => i.suggestion.lines[0]?.account)) ?? fromSaft?.account,
      invoices: own,
    })
  }
  return rows.sort(
    (x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || y.year - x.year || x.supplier.localeCompare(y.supplier)
  )
}

/** Whether the customer's due date for a list has passed. */
export function listLate(request: CustomerRequest) {
  const due = parseDay(request.due)
  return request.status === "sent" && !!due && due < TODAY
}

/** When a list was sent, as an ISO date when it can be read back. */
export function listSentOn(request: CustomerRequest) {
  return parseDay(request.sentAt)
}

// ── Actions ──

export type ApprovalsAction =
  | {
      /** The customer opts out from their app, or the accountant changes it. */
      type: "set_mode"
      clientId: string
      mode: ApprovalMode
      from: "portal" | "firm"
      /** Who, when it was the customer. */
      by?: string
    }
  | { type: "set_approver"; clientId: string; contactId: string }
  | { type: "add_supplier"; clientId: string; supplier: string }
  | { type: "revoke_supplier"; clientId: string; supplier: string }
  | {
      /** The firm settles a line the customer rejected. */
      type: "settle"
      itemId: string
      how: Settlement["how"]
      /** The e-mail that went to the supplier, as the accountant sent it. */
      email?: string
    }
  | {
      /** Logs the auto-approvals that went with a list. */
      type: "record_auto"
      clientId: string
    }

function withSlice(state: StoreState, approvals: ApprovalsState): StoreState {
  return { ...state, approvals }
}

/** Writes down the auto-approvals that are only derived so far, so taking
    back a supplier or the opt-out doesn't rewrite what already happened. */
function freezeAuto(state: StoreState, clientId: string): StoreState {
  const a = approvalsOf(state)
  const pending = invoiceApprovals(state, clientId).filter(
    (i) => i.status === "auto" && !i.history && !a.auto[i.item.id]
  )
  if (!pending.length) return state
  const auto = { ...a.auto }
  const ids = new Set<string>()
  for (const i of pending) {
    auto[i.item.id] = {
      // The moment it was approved, as shown before it was logged.
      at: i.decidedAt ?? now(),
      supplier: i.item.title,
      by: i.supplier?.by ?? "The customer",
      since: i.supplier?.since ?? TODAY,
    }
    ids.add(i.item.id)
  }
  return {
    ...state,
    approvals: { ...a, auto },
    items: state.items.map((item) => {
      if (!ids.has(item.id)) return item
      const s = pending.find((p) => p.item.id === item.id)!
      return {
        ...item,
        activity: [
          ...item.activity,
          log(
            "system",
            s.supplier ? `Auto-approved: ${approvalReason(s.supplier)}` : "Auto-approved",
            s.payment.label
          ),
        ],
      }
    }),
  }
}

export function approvalsApply(state: StoreState, action: ApprovalsAction): StoreState {
  const a = approvalsOf(state)
  switch (action.type) {
    case "set_mode": {
      const before = policyOf(state, action.clientId)
      if (before.mode === action.mode) return state
      const frozen = freezeAuto(state, action.clientId)
      const slice = approvalsOf(frozen)
      return withSlice(frozen, {
        ...slice,
        policies: {
          ...slice.policies,
          [action.clientId]: {
            ...before,
            mode: action.mode,
            changed: { by: action.by ?? CURRENT_USER.name, at: now(), from: action.from },
          },
        },
      })
    }

    case "set_approver":
      return withSlice(state, {
        ...a,
        policies: {
          ...a.policies,
          [action.clientId]: { ...policyOf(state, action.clientId), approverId: action.contactId },
        },
      })

    case "add_supplier": {
      if (approvedSupplier(state, action.clientId, action.supplier)) return state
      return withSlice(state, {
        ...a,
        suppliers: [
          ...a.suppliers,
          {
            clientId: action.clientId,
            supplier: action.supplier,
            since: now(),
            by: CURRENT_USER.name,
            source: "accountant",
          },
        ],
      })
    }

    case "revoke_supplier": {
      const frozen = freezeAuto(state, action.clientId)
      const slice = approvalsOf(frozen)
      return withSlice(frozen, {
        ...slice,
        suppliers: slice.suppliers.filter(
          (s) => !(s.clientId === action.clientId && s.supplier === action.supplier)
        ),
        revoked: {
          ...slice.revoked,
          [supplierKey(action.clientId, action.supplier)]: { at: now(), by: CURRENT_USER.name },
        },
      })
    }

    case "settle": {
      if (a.settled[action.itemId]) return state
      const listed = listOf(state, action.itemId)
      if (!listed || listed.line.decision !== "rejected") return state
      const settled = { ...a.settled, [action.itemId]: { how: action.how, at: now(), by: CURRENT_USER.name } }
      const request = listed.request
      // Every rejection settled: the list is done.
      const done = (request.lines ?? []).every((l) => l.decision !== "rejected" || settled[l.itemId])
      const item = state.items.find((i) => i.id === action.itemId)
      return {
        ...state,
        approvals: { ...a, settled },
        // The customer hears what became of what they rejected.
        requests: state.requests.map((r) => {
          if (r.id !== request.id) return r
          const said = item
            ? action.how === "pay_anyway"
              ? `We checked ${supplierShort(item.title)} and it's correct, so we're paying it after all.`
              : `We've asked ${supplierShort(item.title)} for a credit note: the invoice stays unpaid.`
            : ""
          const thread = said
            ? [...(r.thread ?? []), { id: `${r.id}-${(r.thread?.length ?? 0) + 1}`, from: "accountant" as const, text: said, time: "Just now" }]
            : r.thread
          return done ? { ...r, thread, status: "resolved", resolution: "done" } : { ...r, thread }
        }),
        items: state.items.map((i) =>
          i.id === action.itemId
            ? {
                ...i,
                activity: [
                  ...i.activity,
                  log(
                    "accountant",
                    action.how === "pay_anyway"
                      ? `Paid anyway · ${CURRENT_USER.name}`
                      : `Asked ${supplierShort(i.title)} for a credit note · ${CURRENT_USER.name}`,
                    action.how === "pay_anyway" && item
                      ? payment(item, TODAY).label
                      : action.email
                        ? `E-mailed to ${i.title}:\n\n${action.email}`
                        : "The invoice stays unpaid until the credit note arrives."
                  ),
                ],
              }
            : i
        ),
      }
    }

    case "record_auto":
      return freezeAuto(state, action.clientId)
  }
}
