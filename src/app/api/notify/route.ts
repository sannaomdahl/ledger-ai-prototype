// Emails the demo customer when the accountant sends them something.
// The app's data lives in the browser, so the accountant's tab posts the
// tasks here and this route only formats and sends. The recipient is fixed
// by the server per client, never taken from the request.
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Resend } from "resend"

import { CLIENT_BY_ID, MONTHS } from "@/lib/accounting/data"
import { buildReport } from "@/lib/accounting/report"
import {
  buildEmail,
  EMAIL_DEMO_CLIENT_IDS,
  LOGO_CID,
  type NotifyPayload,
} from "@/lib/accounting/notify-email"

/** Where each demo customer's mail lands. */
function recipientFor(clientId: string) {
  return clientId === "skarv-consulting"
    ? "konstantin@sanna.no"
    : process.env.DEMO_NOTIFY_EMAIL
}

const RESPONSE_TYPES = new Set(["text", "choice", "file", "confirm"])

function isString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function parse(body: unknown): NotifyPayload | null {
  if (!body || typeof body !== "object") return null
  const { clientId, kind, tasks, month, note } = body as Record<string, unknown>
  if (typeof clientId !== "string" || !EMAIL_DEMO_CLIENT_IDS.includes(clientId)) return null
  if (kind === "report") {
    return isString(note, 2000) && MONTHS.some((m) => m.id === month)
      ? (body as NotifyPayload)
      : null
  }
  if (kind !== "new" && kind !== "reminder") return null
  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 10) return null
  const valid = tasks.every(
    (t) =>
      t &&
      isString(t.id, 40) &&
      isString(t.title, 200) &&
      // Customer questions have no due date.
      (t.due === "" || isString(t.due, 40)) &&
      isString(t.message, 2000) &&
      RESPONSE_TYPES.has(t.responseType)
  )
  return valid ? (body as NotifyPayload) : null
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: "Email isn't set up: add RESEND_API_KEY to .env.local." },
      { status: 503 }
    )
  }

  const payload = parse(await request.json().catch(() => null))
  if (!payload) {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }
  const to = recipientFor(payload.clientId)
  if (!to) {
    return Response.json(
      { error: "Email isn't set up: add DEMO_NOTIFY_EMAIL to .env.local." },
      { status: 503 }
    )
  }

  const client = CLIENT_BY_ID.get(payload.clientId)!
  const contact = client.contacts[0]
  const portal = `${new URL(request.url).origin}/portal/${client.id}`
  const portalUrl =
    payload.kind === "report" ? `${portal}?tab=numbers&month=${payload.month}` : portal
  const email = buildEmail({
    payload,
    client,
    contact,
    portalUrl,
    report: payload.kind === "report" ? buildReport(client.id, payload.month) : undefined,
  })

  // Sent inline: Gmail and Outlook don't show SVG, and a CID image needs no
  // public host.
  const logo = await readFile(
    path.join(process.cwd(), "public/brand/sanna-logo-email.png")
  )

  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from:
      process.env.DEMO_NOTIFY_FROM ?? "Sanna <onboarding@resend.dev>",
    to: [to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      { filename: "sanna-logo.png", content: logo, contentId: LOGO_CID },
    ],
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 502 })
  }
  return Response.json({ id: data?.id, to: contact.name })
}
