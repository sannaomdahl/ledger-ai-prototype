// Answers for the customer view's chat: Sanna (KI) at once, Truls as the
// accountant. The whole dummy ledger goes in as context, so the model can
// answer anything in it and says so when it isn't there. Without an API
// key the route says 503 and the page falls back to its canned answers.
import Anthropic from "@anthropic-ai/sdk"

import {
  ACCOUNTANT,
  CONTACT,
  FIRM,
  ledgerForModel,
} from "@/components/kunde/data"

export const runtime = "nodejs"

type Who = "sanna" | "truls"

const PERSONA: Record<Who, string> = {
  sanna: `Du er Sanna, KI-assistenten i Sannas kundeapp. Du svarer ${CONTACT.first}, daglig leder i ${FIRM.name}, med en gang og rett fra regnskapet. ${ACCOUNTANT.first} (regnskapsføreren) ser alt du svarer. Du kan ikke utføre noe selv: når noe må gjøres (bokføre, betale, sende, endre), si at ${ACCOUNTANT.first} gjør det, eller foreslå å spørre ham.`,
  truls: `Du er ${ACCOUNTANT.name}, ${ACCOUNTANT.title.toLowerCase()} i Sanna, og skriver til ${CONTACT.first}, daglig leder i ${FIRM.name}. Du kjenner regnskapet deres ut og inn, er varm og konkret, og tar ansvar: foreslå hva du gjør, og be om et ja når du trenger det. Du er et menneske, ikke en KI.`,
}

const RULES = `Regler:
- Skriv norsk bokmål. Kort: ett til tre avsnitt uten overskrifter, punktlister bare når de hjelper. Ingen markdown-stjerner.
- Alle tall kommer fra regnskapsdataene under. Regn gjerne videre på dem (summer, differanser, prosent), og vis kort hvordan.
- Finnes ikke svaret i dataene, si det i én setning og si hva du trenger. Ikke finn på tall.
- Beløp skrives som «1 284 000 kr». Datoer som «25. oktober».
- Dagens dato står i dataene. Oktober 2026 er åpen måned, september er sist lukkede.`

function buildSystem() {
  return `${RULES}\n\nRegnskapsdata (JSON):\n${JSON.stringify(ledgerForModel())}`
}

type Turn = { role: "user" | "assistant"; text: string }

function isTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object") return false
  const t = value as Record<string, unknown>
  return (
    (t.role === "user" || t.role === "assistant") &&
    typeof t.text === "string" &&
    t.text.length <= 4000
  )
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "no_key" }, { status: 503 })
  }
  let body: { who?: unknown; question?: unknown; history?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 })
  }
  const who: Who = body.who === "truls" ? "truls" : "sanna"
  const question =
    typeof body.question === "string" ? body.question.trim().slice(0, 2000) : ""
  if (!question) return Response.json({ error: "no_question" }, { status: 400 })
  const history = Array.isArray(body.history)
    ? body.history.filter(isTurn).slice(-12)
    : []

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: question },
  ]

  const client = new Anthropic()
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [
        { type: "text", text: PERSONA[who] },
        // The ledger never changes between questions, so it is cached.
        {
          type: "text",
          text: buildSystem(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    })
    if (response.stop_reason === "refusal") {
      return Response.json({
        text: "Det kan jeg ikke svare på her. Spør Truls direkte.",
      })
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
    return Response.json({ text })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return Response.json({ error: "bad_key" }, { status: 503 })
    if (error instanceof Anthropic.RateLimitError)
      return Response.json({ error: "rate_limited" }, { status: 429 })
    if (error instanceof Anthropic.APIError)
      return Response.json(
        { error: "api", status: error.status },
        { status: 502 },
      )
    return Response.json({ error: "unknown" }, { status: 502 })
  }
}
