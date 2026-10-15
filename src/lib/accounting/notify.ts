// Emails the demo customer through /api/notify. New tasks sent within a
// couple of seconds of each other go out as one email ("3 things to send
// us"); a reminder goes out on its own, right away.
import { toast } from "sonner"

import type { NotifyPayload, NotifyTask } from "./notify-email"
import { EMAIL_DEMO_CLIENT_IDS } from "./notify-email"
import type { CustomerRequest } from "./types"

const BATCH_MS = 2000

let batch = new Map<string, { clientId: string; task: NotifyTask }>()
let timer: ReturnType<typeof setTimeout> | undefined

function toTask(request: CustomerRequest): NotifyTask {
  return {
    id: request.id,
    title: request.title,
    due: request.due,
    responseType: request.responseType,
    message: request.message,
  }
}

/** The GitHub Pages build has no server, so there is nothing to send with. */
const EMAIL_AVAILABLE = process.env.NEXT_PUBLIC_STATIC_EXPORT !== "1"

async function post(payload: NotifyPayload) {
  if (!EMAIL_AVAILABLE) {
    toast("Email is off in the hosted demo", {
      description: "Run the app locally to send emails through Resend.",
    })
    return
  }
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      to?: string
    }
    if (!res.ok) {
      toast.error("Email not sent", { description: body.error })
      return
    }
    const what =
      payload.kind === "report"
        ? "the monthly report"
        : payload.kind === "reminder"
        ? "a reminder"
        : payload.tasks.length === 1
          ? "the task"
          : `${payload.tasks.length} tasks`
    toast.success(`Emailed ${body.to ?? "the customer"}`, {
      description: `Sent ${what} to the demo inbox.`,
    })
  } catch {
    toast.error("Email not sent", { description: "Couldn't reach the server." })
  }
}

export function isEmailDemoClient(clientId: string) {
  return EMAIL_DEMO_CLIENT_IDS.includes(clientId)
}

/** Queue freshly sent tasks; they go out together once sending pauses. */
export function emailNewTasks(requests: CustomerRequest[]) {
  const own = requests.filter((r) => isEmailDemoClient(r.clientId))
  if (own.length === 0) return
  for (const request of own)
    batch.set(request.id, { clientId: request.clientId, task: toTask(request) })
  clearTimeout(timer)
  timer = setTimeout(() => {
    const queued = [...batch.values()]
    batch = new Map()
    // One email per customer.
    for (const clientId of new Set(queued.map((q) => q.clientId))) {
      const tasks = queued.filter((q) => q.clientId === clientId).map((q) => q.task)
      void post({ clientId, kind: "new", tasks })
    }
  }, BATCH_MS)
}

export function emailReminder(request: CustomerRequest) {
  if (!isEmailDemoClient(request.clientId)) return
  void post({ clientId: request.clientId, kind: "reminder", tasks: [toTask(request)] })
}

/** The month is closed: tell the customer their overview is ready. */
export function emailReport(clientId: string, month: string, note: string) {
  if (!isEmailDemoClient(clientId)) return
  void post({ clientId, kind: "report", month, note })
}
