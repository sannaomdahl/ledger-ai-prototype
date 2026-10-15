export type StepKind =
  | "thinking"
  | "searching_web"
  | "browsing"
  | "reading_file"
  | "editing_file"
  | "running_command"
  | "running_code"
  | "querying_db"
  | "calling_tool"
  | "calling_mcp"
  | "generating_image"
  | "waiting_approval"
  | "waiting_answer"
  | "retrying"
  | "superseded"

/** The reference vocabulary for every kind. A real step overrides both strings
    with its own artifact; the pairing of label and summary is what to copy. */
export const KIND_LABEL = {
  thinking: { label: "Thinking", summary: "Thought for 8s" },
  searching_web: { label: "Searching the web", summary: "6 sources, 3 read" },
  browsing: {
    label: "Reading stripe.com/docs/webhooks",
    summary: "Read 4 pages",
  },
  reading_file: { label: "Reading stripe-webhook.ts", summary: "Read 4 files" },
  editing_file: {
    label: "Editing stripe-webhook.ts",
    summary: "+12 -3 across 2 files",
  },
  running_command: {
    label: "Running pnpm test",
    summary: "Exit 0 in 12.4s",
  },
  running_code: { label: "Running analysis", summary: "41 rows returned" },
  querying_db: { label: "Querying events", summary: "41 rows in 320ms" },
  calling_tool: { label: "Calling search_web", summary: "6 results" },
  /** Rendered as a server chip plus the tool, so the chip carries the trust
      boundary and the label stays the bare tool name. */
  calling_mcp: { label: "create_issue", summary: "Created HAL-482" },
  generating_image: {
    label: "Generating image 2 of 4",
    summary: "4 images, 1024x1024",
  },
  waiting_approval: {
    label: "Needs your approval",
    summary: "Approved by you",
  },
  waiting_answer: { label: "Needs your answer", summary: "Answered" },
  retrying: {
    label: "Retrying, attempt 2 of 3",
    summary: "Recovered on attempt 2",
  },
  /** Never in flight: queued work a mid run steer made obsolete. Rendered
      struck rather than deleted, so the plan's history survives the steer. */
  superseded: { label: null, summary: "Superseded by your steer" },
} as const satisfies Record<StepKind, { label: string | null; summary: string }>

/** How a finished step landed. Only a non `ok` step earns a badge, so a badge
    stays a signal instead of decoration on every row. */
export type StepStatus =
  | "ok"
  | "changed"
  | "warning"
  | "failed"
  | "blocked"
  /** Failed once, then a retry landed, so it no longer counts as a failure. */
  | "retried"
  /** The user refused it, which is a choice and not a failure. */
  | "declined"
  /** Authorized by an approval the user declined, so it never ran. */
  | "skipped"

/** What the artifact names, which decides what the row offers to do with it.
    A record has no address to open, so it can only be copied. */
export type ArtifactKind = "file" | "url" | "service" | "record"

export type AgentStep = {
  id: string
  kind: StepKind
  /** What the strip says while this step runs. Always names the artifact. */
  label: string
  /** The one line it collapses to once done. Also names an artifact. */
  summary: string
  /** The file, table, url or machine this step acted on. Never absent, and
      always an identifier a reader could paste somewhere. */
  artifact: string
  artifactKind: ArtifactKind
  status: StepStatus
  /** What the result means for the reader. Carried where the summary alone
      leaves a question open, absent where it does not. */
  detail?: string
  /** Seconds this step took. Drives the elapsed readout. */
  seconds: number
  /** The system outside this repo the step reaches. MCP steps name the server:
      a bare tool name hides which server got the data. */
  server?: string
  /** Set where acting on a blocked step carries real blast radius. It tints the
      glyph, so a risky pause never reads like a routine question. */
  risk?: "danger"
  /** Id of the approval that authorizes this step. Deny that approval and this
      step is skipped rather than run, which is what Deny has to mean. */
  gatedBy?: string
  /** Id of the failed attempt this retry redoes. Once the retry lands, that
      attempt reports Retried instead of counting the run as failed. */
  retryOf?: string
}

/** The run this strip is watching. Swap for your own. */
export const RUN_META = {
  title: "Reproduce webhook failure",
} as const

/** Reproduce the 500, diagnose it, fix it, scale the pool. No two steps share
    a shape, so the list never reads as one kind repeated. */
export const RUN: AgentStep[] = [
  {
    id: "s01",
    kind: "thinking",
    label: KIND_LABEL.thinking.label,
    summary: "Traced the failing event",
    artifact: "charge.refunded",
    artifactKind: "record",
    status: "ok",
    seconds: 8,
  },
  {
    id: "s02",
    kind: "querying_db",
    label: "Querying events",
    summary: "41 events queued",
    artifact: "events",
    artifactKind: "record",
    status: "warning",
    detail: "38 still pending, 3 already past the retry window",
    seconds: 3,
  },
  {
    id: "s03",
    kind: "browsing",
    label: "Reading the Stripe retry docs",
    summary: "Read 4 pages",
    artifact: "stripe.com/docs/webhooks",
    artifactKind: "url",
    status: "ok",
    detail: "The branch gives up after 24 hours, Stripe retries for 3 days",
    seconds: 6,
  },
  {
    id: "s04",
    kind: "running_command",
    label: "Running the failing case",
    summary: "Reproduced the 500",
    artifact: "stripe-webhook.test.ts",
    artifactKind: "file",
    status: "ok",
    detail: "A refund replayed on day 2 hits the guard twice and throws",
    seconds: 12,
  },
  {
    id: "s05",
    kind: "waiting_answer",
    label: KIND_LABEL.waiting_answer.label,
    summary: KIND_LABEL.waiting_answer.summary,
    artifact: "src/api/stripe-webhook.ts",
    artifactKind: "file",
    status: "blocked",
    detail:
      "The same guard covers disputes. Fix both branches, or refunds only?",
    seconds: 0,
  },
  {
    id: "s06",
    kind: "editing_file",
    label: "Editing the refund branch",
    summary: "+12 -3, 24 tests pass",
    artifact: "src/api/stripe-webhook.ts",
    artifactKind: "file",
    status: "changed",
    seconds: 9,
  },
  {
    id: "s07",
    kind: "waiting_approval",
    label: KIND_LABEL.waiting_approval.label,
    summary: KIND_LABEL.waiting_approval.summary,
    artifact: "webhook-consumer",
    artifactKind: "service",
    status: "blocked",
    detail: "Takes the consumer pool to 2 machines in production",
    risk: "danger",
    server: "fly",
    seconds: 0,
  },
  {
    id: "s08",
    kind: "calling_mcp",
    label: "scale_app",
    summary: "Timed out on attempt 1",
    artifact: "webhook-consumer",
    artifactKind: "service",
    status: "failed",
    detail: "No acknowledgement from the API after 30s",
    server: "fly",
    gatedBy: "s07",
    seconds: 30,
  },
  {
    id: "s09",
    kind: "retrying",
    label: KIND_LABEL.retrying.label,
    summary: KIND_LABEL.retrying.summary,
    artifact: "webhook-consumer",
    artifactKind: "service",
    status: "ok",
    detail: "Consumer pool at 2, the 38 pending events drain across both",
    server: "fly",
    gatedBy: "s07",
    retryOf: "s08",
    seconds: 6,
  },
  {
    id: "s10",
    kind: "calling_mcp",
    label: "create_issue",
    summary: "Opened HAL-482",
    artifact: "engineering backlog",
    artifactKind: "record",
    status: "ok",
    detail: "Covers the 3 day replay case with a regression test",
    server: "linear",
    seconds: 2,
  },
]

/** The console joins a run already in progress, so finished, live and queued
    work all carry rows on first paint. Set to 0 to replay from the first step. */
export const START_AT = 2

/** A run blocked on a person is not a working run. These two kinds render
    static: no spinner, no shimmer, and the composer offers Stop, not this. */
export const BLOCKED_KINDS: StepKind[] = ["waiting_approval", "waiting_answer"]

export function isBlocked(kind: StepKind) {
  return BLOCKED_KINDS.includes(kind)
}

/** What the user did with a blocked step, so the collapsed row reports the real
    decision and Deny never reads as Approve. */
export type Decision = "approved" | "revised" | "answered" | "denied"

export const DECISION_SUMMARY: Record<Decision, string> = {
  approved: "Approved by you",
  revised: "Sent back with your change",
  answered: "Answered",
  denied: "Declined by you",
}

export const DECISION_STATUS: Record<Decision, StepStatus> = {
  approved: "ok",
  revised: "changed",
  answered: "ok",
  denied: "declined",
}

/** Every clock reads m:ss, so the per step column, the live readout and the run
    total line up as one tabular column instead of three formats. */
export function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}