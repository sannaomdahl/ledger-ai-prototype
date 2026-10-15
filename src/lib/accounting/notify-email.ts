// The customer's email: what Sanna needs and by when, in Sanna's own look.
// Server-only (used by the /api/notify route); plain HTML so it needs no
// email framework.
import type { MonthlyReport } from "./report"
import type { Client, Person, ResponseType } from "./types"

/** The customers the demo emails, standing in for the user's own company.
    The route decides where each one's mail goes. */
export const EMAIL_DEMO_CLIENT_IDS = ["fjord-kaffebar", "skarv-consulting"]

export type NotifyTask = {
  id: string
  title: string
  due: string
  responseType: ResponseType
  message: string
}

export type NotifyTaskPayload = {
  clientId: string
  kind: "new" | "reminder"
  tasks: NotifyTask[]
}

/** A closed month: the route rebuilds the figures itself, so only the month
    and the accountant's note travel. */
export type NotifyReportPayload = {
  clientId: string
  kind: "report"
  month: string
  note: string
}

export type NotifyPayload = NotifyTaskPayload | NotifyReportPayload

const ASK: Record<ResponseType, string> = {
  file: "Upload a photo or a file",
  text: "Write a short answer",
  choice: "Pick one option",
  confirm: "Answer yes or no",
  approval: "Approve each line",
  checkin: "Tell us what changed",
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Sanna's colours (sanna.co) on ReUI's component grammar: Inter, a 4px
// spacing scale, a Frame (tinted shell around a white panel), list rows with
// icon tiles, outline badges and a 36px button with an 8px radius.
const C = {
  paper: "#fbf8f0",
  shell: "#f4efe7",
  card: "#fffdf8",
  line: "#ece7de",
  ink: "#2f1602",
  muted: "#7a6a5c",
  accent: "#ff692e",
}
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

/** The inline logo attachment's id: the route attaches the PNG under it. */
export const LOGO_CID = "sanna-logo"

export function buildEmail({
  payload,
  ...rest
}: {
  payload: NotifyPayload
  client: Client
  contact: Pick<Person, "name">
  portalUrl: string
  logoSrc?: string
  /** Report emails only: the month's figures, built by the route. */
  report?: MonthlyReport
}) {
  if (payload.kind === "report") {
    if (!rest.report) throw new Error("A report email needs the report")
    return buildReportEmail({ ...rest, note: payload.note, report: rest.report })
  }
  return buildTaskEmail({ payload, ...rest })
}

const kr = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

/** "Your September overview is ready": the three numbers and the note, and
    a way into the portal for the rest. */
function buildReportEmail({
  client,
  contact,
  portalUrl,
  logoSrc = `cid:${LOGO_CID}`,
  note,
  report,
}: {
  client: Client
  contact: Pick<Person, "name">
  portalUrl: string
  logoSrc?: string
  note: string
  report: MonthlyReport
}) {
  const firstName = contact.name.split(" ")[0]
  const monthLong = report.label.split(" ")[0]
  const subject = `Your ${monthLong} overview is ready`
  const figures = [
    { label: "Sales", value: `${kr.format(report.current.sales)} kr` },
    { label: "Profit", value: `${kr.format(report.current.profit)} kr` },
    { label: "In the bank", value: `${kr.format(report.current.cash)} kr` },
  ]
  const text = [
    `Hi ${firstName}, ${monthLong} is closed for ${client.name}.`,
    "",
    note,
    "",
    ...figures.map((f) => `${f.label}: ${f.value}`),
    "",
    `See the full overview: ${portalUrl}`,
    "",
    "Sanna · Freedom from bookkeeping",
  ].join("\n")

  const cells = figures
    .map(
      (f, i) => `
        <td width="33%" style="padding:14px 16px;${i > 0 ? `border-left:1px solid ${C.line};` : ""}vertical-align:top;">
          <div style="font:400 12px/16px ${FONT};color:${C.muted};">${f.label}</div>
          <div style="font:600 18px/26px ${FONT};color:${C.ink};margin-top:4px;white-space:nowrap;">${escape(f.value)}</div>
        </td>`
    )
    .join("")

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${C.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 32px;">
                <img src="${escape(logoSrc)}" width="101" height="24" alt="Sanna" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 4px 24px;">
                <div style="font:600 20px/28px ${FONT};letter-spacing:-0.01em;color:${C.ink};">Your ${escape(monthLong)} overview is ready</div>
                <div style="font:400 14px/20px ${FONT};color:${C.muted};margin-top:6px;">${escape(report.label)} is closed for ${escape(client.name)}.</div>
              </td>
            </tr>
            <tr>
              <td style="background:${C.shell};border:1px solid ${C.line};border-radius:14px;padding:4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:14px 16px;font:400 14px/21px ${FONT};color:${C.ink};white-space:pre-line;">${escape(note)}</td>
                  </tr>
                  <tr>
                    <td style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font:400 13px/20px ${FONT};color:${C.muted};">Costs, salaries and what's coming up are in the app.</td>
                          <td align="right">
                            <a href="${escape(portalUrl)}" style="display:inline-block;background:${C.ink};color:${C.paper};text-decoration:none;font:500 14px/20px ${FONT};padding:8px 16px;border-radius:8px;white-space:nowrap;">See your numbers</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font:400 12px/18px ${FONT};color:${C.muted};padding:24px 4px 0;">
                You get this because Sanna does the books for ${escape(client.name)}. Questions about the numbers? Ask us in the app.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}

function buildTaskEmail({
  payload,
  client,
  contact,
  portalUrl,
  logoSrc = `cid:${LOGO_CID}`,
}: {
  payload: NotifyTaskPayload
  client: Client
  contact: Pick<Person, "name">
  portalUrl: string
  /** Where the logo comes from; a file path when previewing locally. */
  logoSrc?: string
}) {
  const { tasks, kind } = payload
  const count = tasks.length
  const single = tasks[0]
  const firstName = contact.name.split(" ")[0]

  const subject =
    kind === "reminder"
      ? single.due
        ? `Reminder: ${single.title} is due ${single.due}`
        : `Reminder: ${single.title}`
      : count === 1
        ? `Sanna needs something from you: ${single.title}`
        : `Sanna needs ${count} things from you`

  const heading =
    kind === "reminder"
      ? "Just a reminder"
      : count === 1
        ? "One thing to send us"
        : `${count} things to send us`

  const lead =
    kind === "reminder"
      ? `Hi ${firstName}, we're still waiting for this one. It only takes a minute.`
      : `Hi ${firstName}, to keep the books for ${client.name} on track, we need ${count === 1 ? "this" : "these"} from you.`

  const text = [
    lead,
    "",
    ...tasks.map(
      (t, i) =>
        `${i + 1}. ${t.title}\n   ${ASK[t.responseType]}${t.due ? ` · due ${t.due}` : ""}`
    ),
    "",
    `Open your tasks: ${portalUrl}`,
    "",
    "Sanna · Freedom from bookkeeping",
  ].join("\n")

  // ReUI Badge (outline, sm) with a status dot.
  const badge = (label: string) =>
    `<span style="display:inline-block;white-space:nowrap;border:1px solid ${C.line};border-radius:6px;padding:0 7px;font:500 12px/20px ${FONT};color:${C.ink};background:${C.card};"><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${C.accent};margin-right:6px;vertical-align:1px;"></span>${label}</span>`

  // ReUI Item row: icon tile, title + description, badge on the right.
  const rows = tasks
    .map(
      (t, i) => `
        <tr>
          <td style="padding:14px 0 14px 16px;${i > 0 ? `border-top:1px solid ${C.line};` : ""}vertical-align:top;width:32px;">
            <div style="width:30px;height:30px;border:1px solid ${C.line};border-radius:8px;background:${C.shell};font:600 13px/30px ${FONT};color:${C.ink};text-align:center;">${i + 1}</div>
          </td>
          <td style="padding:14px 12px;${i > 0 ? `border-top:1px solid ${C.line};` : ""}vertical-align:top;">
            <div style="font:500 14px/20px ${FONT};color:${C.ink};">${escape(t.title)}</div>
            <div style="font:400 13px/18px ${FONT};color:${C.muted};margin-top:2px;">${ASK[t.responseType]}</div>
            ${
              count === 1
                ? `<div style="font:400 14px/20px ${FONT};color:${C.ink};margin-top:12px;padding:10px 12px;background:${C.paper};border:1px solid ${C.line};border-radius:8px;white-space:pre-line;">${escape(t.message)}</div>`
                : ""
            }
          </td>
          <td align="right" style="padding:14px 16px 14px 0;${i > 0 ? `border-top:1px solid ${C.line};` : ""}vertical-align:top;white-space:nowrap;">
            ${t.due ? badge(`Due ${escape(t.due)}`) : ""}
          </td>
        </tr>`
    )
    .join("")

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${C.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 32px;">
                <img src="${escape(logoSrc)}" width="101" height="24" alt="Sanna" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 4px 24px;">
                <div style="font:600 20px/28px ${FONT};letter-spacing:-0.01em;color:${C.ink};">${heading}</div>
                <div style="font:400 14px/20px ${FONT};color:${C.muted};margin-top:6px;">${escape(lead)}</div>
              </td>
            </tr>
            <tr>
              <td style="background:${C.shell};border:1px solid ${C.line};border-radius:14px;padding:4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:8px 12px 10px;font:500 13px/20px ${FONT};color:${C.ink};">
                      To do <span style="color:${C.muted};font-weight:400;">${count}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font:400 13px/20px ${FONT};color:${C.muted};">Takes about a minute on your phone.</td>
                          <td align="right">
                            <a href="${escape(portalUrl)}" style="display:inline-block;background:${C.ink};color:${C.paper};text-decoration:none;font:500 14px/20px ${FONT};padding:8px 16px;border-radius:8px;white-space:nowrap;">Open your tasks</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font:400 12px/18px ${FONT};color:${C.muted};padding:24px 4px 0;">
                You get this because Sanna does the books for ${escape(client.name)}. Just reply to this email if anything is unclear.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
