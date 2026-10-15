// The chat's line to the model. The static GitHub Pages build has no
// server, so NEXT_PUBLIC_ASK_URL can point it at a hosted copy of
// /api/ask; otherwise the same origin is tried. Any failure returns null
// and the caller falls back to the canned answers.
export type Who = "sanna" | "truls"

export type Turn = { role: "user" | "assistant"; text: string }

const ASK_URL = process.env.NEXT_PUBLIC_ASK_URL || "/api/ask"

export async function askModel(
  who: Who,
  question: string,
  history: Turn[],
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    const res = await fetch(ASK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ who, question, history }),
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    return data.text?.trim() || null
  } catch {
    return null
  }
}
